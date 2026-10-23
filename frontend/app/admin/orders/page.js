"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import {
  getTodayTokens,
  getDailyTokenStats,
  updateOrderStatus,
  adminOrderOverride,
} from "../../../services/api";

const STATUS_LABELS = {
  PENDING_OTP_VERIFICATION: { label: "⏳ Awaiting OTP", color: "#D97706", bg: "#FEF3C7" },
  VERIFICATION_EXPIRED: { label: "Expired OTP", color: "#64748B", bg: "#F1F5F9" },
  PENDING: { label: "Pending", color: "#D97706", bg: "#FEF3C7" },
  CONFIRMED: { label: "Confirmed / Queued", color: "#2563EB", bg: "#EFF6FF" },
  PREPARING: { label: "Brewing / Preparing", color: "#0284C7", bg: "#E0F2FE" },
  READY: { label: "Ready for Pickup", color: "#16A34A", bg: "#DCFCE7" },
  COMPLETED: { label: "Delivered & Closed", color: "#475569", bg: "#F1F5F9" },
  CANCELLED: { label: "Cancelled", color: "#DC2626", bg: "#FEE2E2" },
};

export default function OrdersPage() {
  const { getValidAdminToken } = useAuth();
  const [tokensData, setTokensData] = useState(null);
  const [tokenStats, setTokenStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState("all");
  const [dateScope, setDateScope] = useState("all"); // "all" | "today" | "backlog"
  const [actionMsg, setActionMsg] = useState("");

  // Admin Override Modal State
  const [overrideModalOrder, setOverrideModalOrder] = useState(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideError, setOverrideError] = useState("");

  async function loadOrders() {
    setLoading(true);
    setActionMsg("");
    try {
      const [tokensRes, statsRes] = await Promise.all([
        getTodayTokens(),
        getDailyTokenStats().catch(() => null),
      ]);
      setTokensData(tokensRes);
      setTokenStats(statsRes);
    } catch (err) {
      console.error("Failed to load token queue:", err);
      setActionMsg(`Failed to load orders: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
    // Poll every 15 seconds for live token updates
    const interval = setInterval(loadOrders, 15000);
    return () => clearInterval(interval);
  }, []);

  async function handleStatusChange(orderId, newStatus, tokenNumber) {
    setActionMsg("");
    try {
      const token = await getValidAdminToken();
      await updateOrderStatus(orderId, newStatus, token);
      if (newStatus === "CANCELLED") {
        setActionMsg(`Token #${tokenNumber} cancelled! Quantities have been added back to the menu stock.`);
      } else {
        setActionMsg(`Token #${tokenNumber} updated to ${newStatus}!`);
      }
      await loadOrders();
    } catch (err) {
      setActionMsg(`Failed to update order status: ${err.message}`);
    }
  }

  async function handleConfirmOverride() {
    if (!overrideReason.trim() || overrideReason.trim().length < 5) {
      setOverrideError("Please provide an audit reason (minimum 5 characters).");
      return;
    }
    setOverrideSubmitting(true);
    setOverrideError("");
    try {
      const token = await getValidAdminToken();
      const res = await adminOrderOverride(overrideModalOrder.order_id, overrideReason.trim(), token);
      setOverrideModalOrder(null);
      setOverrideReason("");
      setActionMsg(`Order #${res.order?.order_number || overrideModalOrder.order_number} manually confirmed via admin override!`);
      await loadOrders();
    } catch (err) {
      setOverrideError(err.message || "Failed to confirm override.");
    } finally {
      setOverrideSubmitting(false);
    }
  }

  // Derive orders list based on selected filter tab and date scope
  const activeList = (() => {
    if (!tokensData) return [];
    let list = [];
    if (filterTab === "pending_otp") list = tokensData.pending_otp || [];
    else if (filterTab === "pending") list = tokensData.pending || [];
    else if (filterTab === "preparing") list = tokensData.preparing || [];
    else if (filterTab === "ready") list = tokensData.ready || [];
    else if (filterTab === "completed") list = tokensData.completed || [];
    else {
      list = [
        ...(tokensData.pending_otp || []),
        ...(tokensData.pending || []),
        ...(tokensData.preparing || []),
        ...(tokensData.ready || []),
      ];
    }

    if (dateScope === "today") {
      return list.filter((o) => o.is_today || !o.is_previous_day);
    }
    if (dateScope === "backlog") {
      return list.filter((o) => o.is_previous_day);
    }
    return list;
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header Card */}
      <div
        className="card"
        style={{
          padding: "20px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: "700", color: "var(--text-main)" }}>
            📋 Live Orders Pipeline & Kitchen Display System (KDS)
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: "4px" }}>
            Real-time token lifecycle tracking from customer order placement to counter pickup.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={loadOrders} disabled={loading} className="btn-secondary" style={{ fontSize: "0.88rem", padding: "8px 16px" }}>
            {loading ? "Refreshing..." : "↻ Refresh Live Queue"}
          </button>
        </div>
      </div>

      {actionMsg && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            background: actionMsg.startsWith("Failed") ? "#FEF2F2" : "#F0FDF4",
            border: `1px solid ${actionMsg.startsWith("Failed") ? "#FECACA" : "#BBF7D0"}`,
            color: actionMsg.startsWith("Failed") ? "var(--status-err)" : "var(--status-success)",
            fontSize: "0.88rem",
            fontWeight: "500",
          }}
        >
          {actionMsg}
        </div>
      )}

      {/* KPI Stats Bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "14px" }}>
        <div className="card" style={{ padding: "16px", textAlign: "center", borderTop: "3px solid #D97706" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase" }}>
            ⏳ Awaiting OTP
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "#D97706" }}>
            {tokensData?.pending_otp?.length || 0}
          </div>
        </div>

        <div className="card" style={{ padding: "16px", textAlign: "center", borderTop: "3px solid #2563EB" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase" }}>
            Queued
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "#2563EB" }}>
            {tokensData?.pending?.length || 0}
          </div>
        </div>

        <div className="card" style={{ padding: "16px", textAlign: "center", borderTop: "3px solid #0284C7" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase" }}>
            Brewing / Preparing
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "#0284C7" }}>
            {tokensData?.preparing?.length || 0}
          </div>
        </div>

        <div className="card" style={{ padding: "16px", textAlign: "center", borderTop: "3px solid var(--status-success)" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase" }}>
            Ready for Pickup
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--status-success)" }}>
            {tokensData?.ready?.length || 0}
          </div>
        </div>

        <div className="card" style={{ padding: "16px", textAlign: "center", borderTop: "3px solid #64748B" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase" }}>
            Today's Orders
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--text-main)" }}>
            {tokensData?.total_orders_today || tokenStats?.total_orders || 0}
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: "16px",
            textAlign: "center",
            borderTop: (tokensData?.previous_days_active_count || 0) > 0 ? "3px solid #DC2626" : "3px solid #E2E8F0",
            background: (tokensData?.previous_days_active_count || 0) > 0 ? "#FEF2F2" : "#FFFFFF",
            cursor: (tokensData?.previous_days_active_count || 0) > 0 ? "pointer" : "default",
          }}
          onClick={() => {
            if ((tokensData?.previous_days_active_count || 0) > 0) {
              setDateScope(dateScope === "backlog" ? "all" : "backlog");
            }
          }}
          title="Unfulfilled orders from previous dates still in queue"
        >
          <div style={{ fontSize: "0.75rem", color: (tokensData?.previous_days_active_count || 0) > 0 ? "#DC2626" : "var(--text-muted)", fontWeight: "700", textTransform: "uppercase" }}>
            🗓️ Carried Over
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: (tokensData?.previous_days_active_count || 0) > 0 ? "#DC2626" : "var(--text-muted)" }}>
            {tokensData?.previous_days_active_count || 0}
          </div>
        </div>
      </div>

      {/* Alert banner for previous days active orders */}
      {(tokensData?.previous_days_active_count || 0) > 0 && (
        <div
          style={{
            padding: "14px 20px",
            borderRadius: "10px",
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "1.4rem" }}>⚠️</span>
            <div>
              <div style={{ fontSize: "0.92rem", fontWeight: "700", color: "#92400E" }}>
                {tokensData.previous_days_active_count} Active Order{tokensData.previous_days_active_count > 1 ? "s" : ""} Carried Over From Previous Dates
              </div>
              <div style={{ fontSize: "0.8rem", color: "#B45309", marginTop: "2px" }}>
                Showing unfulfilled pending/preparing orders placed before today. They remain live in the kitchen pipeline until fulfilled or cancelled.
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setDateScope(dateScope === "backlog" ? "all" : "backlog")}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                border: "1px solid #D97706",
                background: dateScope === "backlog" ? "#D97706" : "#FFFFFF",
                color: dateScope === "backlog" ? "#FFFFFF" : "#92400E",
                fontSize: "0.82rem",
                fontWeight: "700",
                cursor: "pointer",
              }}
            >
              {dateScope === "backlog" ? "✓ Showing Backlog Only" : `Filter Backlog (${tokensData.previous_days_active_count})`}
            </button>
            {dateScope !== "all" && (
              <button
                onClick={() => setDateScope("all")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid #CBD5E1",
                  background: "#FFFFFF",
                  color: "#475569",
                  fontSize: "0.82rem",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Show All
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filter Tabs & Scope Filter */}
      <div className="card" style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {[
              { id: "all", label: `Active Pipeline (${(tokensData?.pending_otp?.length || 0) + (tokensData?.pending?.length || 0) + (tokensData?.preparing?.length || 0) + (tokensData?.ready?.length || 0)})` },
              { id: "pending_otp", label: `⏳ Awaiting OTP (${tokensData?.pending_otp?.length || 0})` },
              { id: "pending", label: `Queued (${tokensData?.pending?.length || 0})` },
              { id: "preparing", label: `Preparing (${tokensData?.preparing?.length || 0})` },
              { id: "ready", label: `Ready (${tokensData?.ready?.length || 0})` },
              { id: "completed", label: `Completed (${tokensData?.completed?.length || 0})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: `1px solid ${filterTab === tab.id ? "var(--color-primary)" : "var(--border-subtle)"}`,
                  background: filterTab === tab.id ? "var(--color-primary)" : "#FFFFFF",
                  color: filterTab === tab.id ? "#FFFFFF" : "var(--text-main)",
                  fontSize: "0.84rem",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Date Scope Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "var(--bg-card-subtle)", padding: "4px", borderRadius: "8px" }}>
            <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", fontWeight: "600", padding: "0 6px" }}>Scope:</span>
            {[
              { id: "all", label: "All Active" },
              { id: "today", label: "Today Only" },
              { id: "backlog", label: `Backlog (${tokensData?.previous_days_active_count || 0})` },
            ].map((scope) => (
              <button
                key={scope.id}
                onClick={() => setDateScope(scope.id)}
                style={{
                  padding: "5px 10px",
                  borderRadius: "6px",
                  border: "none",
                  background: dateScope === scope.id ? "#FFFFFF" : "transparent",
                  color: dateScope === scope.id ? "var(--color-primary)" : "var(--text-muted)",
                  fontWeight: dateScope === scope.id ? "700" : "500",
                  fontSize: "0.78rem",
                  boxShadow: dateScope === scope.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  cursor: "pointer",
                }}
              >
                {scope.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Orders Grid */}
      {loading ? (
        <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
          Loading live token queue...
        </div>
      ) : activeList.length === 0 ? (
        <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
          No orders in this status category right now.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
          {activeList.map((order) => {
            const stInfo = STATUS_LABELS[order.order_status] || {
              label: order.order_status,
              color: "var(--text-muted)",
              bg: "var(--bg-card-subtle)",
            };

            return (
              <div
                key={order.order_id}
                className="card"
                style={{
                  padding: "20px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "14px",
                  borderLeft: `4px solid ${stInfo.color}`,
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px", gap: "8px" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "4px" }}>
                        <span
                          style={{
                            fontSize: "1.25rem",
                            fontWeight: "800",
                            color: "var(--text-main)",
                            background: "var(--bg-card-subtle)",
                            padding: "2px 8px",
                            borderRadius: "6px",
                          }}
                        >
                          #{order.daily_token_number || order.token_number}
                        </span>
                        {order.is_previous_day ? (
                          <span
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: "700",
                              background: "#FEE2E2",
                              color: "#DC2626",
                              border: "1px solid #FECACA",
                              padding: "2px 8px",
                              borderRadius: "10px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "3px",
                            }}
                            title={`Order placed on ${order.order_date || order.created_at}`}
                          >
                            ⚠️ {order.date_label || "Previous Date"}
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: "600",
                              background: "#F1F5F9",
                              color: "#475569",
                              padding: "2px 8px",
                              borderRadius: "10px",
                            }}
                          >
                            Today
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: "600", color: "var(--text-main)" }}>{order.order_number}</span>
                        <span>•</span>
                        <span>
                          {order.order_time || order.created_at
                            ? new Date(order.order_time || order.created_at).toLocaleString([], {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "Just now"}
                        </span>
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: "700",
                        padding: "3px 8px",
                        borderRadius: "12px",
                        background: stInfo.bg,
                        color: stInfo.color,
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {stInfo.label}
                    </span>
                  </div>

                  {/* Customer details & Table */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "6px" }}>
                    <div style={{ fontSize: "0.88rem", color: "var(--text-main)", fontWeight: "600" }}>
                      👤 {order.customer_name || "Walk-in Customer"}
                      {order.customer_phone && <span style={{ color: "var(--text-dim)", fontWeight: "normal", fontSize: "0.8rem" }}> ({order.customer_phone})</span>}
                    </div>
                    {(order.table_or_notes || order.notes) && (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: "700",
                          background: "var(--color-primary-light)",
                          color: "var(--color-primary)",
                          padding: "2px 8px",
                          borderRadius: "6px",
                        }}
                      >
                        🪑 {order.table_or_notes || order.notes}
                      </span>
                    )}
                  </div>

                  {/* Unverified OTP Warning Notice */}
                  {order.order_status === "PENDING_OTP_VERIFICATION" && (
                    <div style={{
                      background: "#FEF3C7",
                      border: "1px dashed #D97706",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      color: "#92400E",
                      fontSize: "0.78rem",
                      fontWeight: "600",
                      marginBottom: "10px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px"
                    }}>
                      <span>⏳</span>
                      <span>Awaiting customer mobile OTP. Items temporarily reserved. Do not brew.</span>
                    </div>
                  )}

                  {/* Order Line Items */}
                  <div
                    style={{
                      background: "var(--bg-card-subtle)",
                      borderRadius: "8px",
                      padding: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      marginBottom: "12px",
                    }}
                  >
                    {order.items && order.items.length > 0 ? (
                      order.items.map((item, idx) => (
                        <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", fontSize: "0.88rem" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontWeight: "800", color: "var(--color-primary)" }}>{item.quantity}x</span>
                              <span style={{ fontWeight: "700", color: "var(--text-main)" }}>{item.item_name}</span>
                            </div>
                            {(item.sugar_option || item.strength_option) && (
                              <div style={{ display: "flex", gap: "4px", marginTop: "3px", flexWrap: "wrap" }}>
                                {item.sugar_option && (
                                  <span style={{ fontSize: "0.7rem", background: "#FEF3C7", color: "#B45309", padding: "1px 6px", borderRadius: "4px", fontWeight: "600" }}>
                                    🍬 {item.sugar_option}
                                  </span>
                                )}
                                {item.strength_option && (
                                  <span style={{ fontSize: "0.7rem", background: "#E0F2FE", color: "#0369A1", padding: "1px 6px", borderRadius: "4px", fontWeight: "600" }}>
                                    💪 {item.strength_option}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <span style={{ fontWeight: "700", color: "var(--text-main)", whiteSpace: "nowrap" }}>
                            ₹{item.total_price || (item.unit_price * item.quantity)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontStyle: "italic" }}>
                        No items specified ({order.items_count || 0} items)
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", fontWeight: "700" }}>
                    <span>Total Amount:</span>
                    <span style={{ color: "var(--color-primary)", fontSize: "1.1rem" }}>
                      ₹{order.total_amount}
                    </span>
                  </div>
                </div>

                {/* Workflow Status Action Buttons */}
                <div style={{ display: "flex", gap: "8px", borderTop: "1px solid var(--border-subtle)", paddingTop: "12px", alignItems: "center" }}>
                  {order.order_status === "PENDING_OTP_VERIFICATION" && (
                    <div style={{ display: "flex", gap: "6px", flex: 1 }}>
                      <button
                        disabled
                        style={{
                          flex: 1,
                          background: "#F1F5F9",
                          color: "#94A3B8",
                          border: "1px solid #E2E8F0",
                          borderRadius: "8px",
                          padding: "8px 10px",
                          fontSize: "0.8rem",
                          fontWeight: "600",
                          cursor: "not-allowed"
                        }}
                        title="Customer must verify OTP before brewing"
                      >
                        🔒 Awaiting OTP
                      </button>
                      <button
                        onClick={() => {
                          setOverrideModalOrder(order);
                          setOverrideReason("");
                          setOverrideError("");
                        }}
                        style={{
                          background: "#0F766E",
                          color: "#FFFFFF",
                          border: "none",
                          borderRadius: "8px",
                          padding: "8px 12px",
                          fontSize: "0.82rem",
                          fontWeight: "700",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px"
                        }}
                        title="Authorized staff override"
                      >
                        🛡️ Override
                      </button>
                    </div>
                  )}

                  {(order.order_status === "PENDING" || order.order_status === "CONFIRMED") && (
                    <button
                      onClick={() => handleStatusChange(order.order_id, "PREPARING", order.daily_token_number || order.token_number)}
                      className="btn-primary"
                      style={{ flex: 1, padding: "8px 14px", fontSize: "0.85rem", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                    >
                      🔥 Accept & Brew
                    </button>
                  )}

                  {order.order_status === "PREPARING" && (
                    <button
                      onClick={() => handleStatusChange(order.order_id, "READY", order.daily_token_number || order.token_number)}
                      style={{
                        flex: 1,
                        background: "#16A34A",
                        color: "#FFFFFF",
                        border: "none",
                        borderRadius: "8px",
                        padding: "8px 14px",
                        fontSize: "0.85rem",
                        fontWeight: "700",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                      }}
                    >
                      ✓ Mark Ready for Pickup
                    </button>
                  )}

                  {order.order_status === "READY" && (
                    <button
                      onClick={() => handleStatusChange(order.order_id, "COMPLETED", order.daily_token_number || order.token_number)}
                      className="btn-primary"
                      style={{ flex: 1, padding: "8px 14px", fontSize: "0.85rem", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                    >
                      ✅ Deliver & Complete
                    </button>
                  )}

                  {order.order_status !== "CANCELLED" && order.order_status !== "COMPLETED" && (
                    <button
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to cancel Token #${order.daily_token_number || order.token_number}? Temporary reservations will be released.`)) {
                          handleStatusChange(order.order_id, "CANCELLED", order.daily_token_number || order.token_number);
                        }
                      }}
                      style={{
                        background: "transparent",
                        border: "1px solid #FECACA",
                        color: "var(--status-err)",
                        borderRadius: "8px",
                        padding: "8px 12px",
                        fontSize: "0.82rem",
                        fontWeight: "600",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Admin Order Confirmation Override Modal */}
      {overrideModalOrder && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          padding: "16px"
        }}>
          <div className="card" style={{ maxWidth: "480px", width: "100%", padding: "26px", boxShadow: "var(--shadow-modal)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <div style={{ fontSize: "1.8rem" }}>🛡️</div>
              <div>
                <h3 style={{ fontSize: "1.15rem", fontWeight: "800", color: "var(--text-main)" }}>
                  Staff OTP Confirmation Override
                </h3>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Order #{overrideModalOrder.order_number} (Token #{overrideModalOrder.daily_token_number || overrideModalOrder.token_number})
                </p>
              </div>
            </div>

            <div style={{ background: "var(--bg-card-subtle)", borderRadius: "8px", padding: "12px", marginBottom: "16px", fontSize: "0.85rem" }}>
              <div style={{ color: "var(--text-main)", fontWeight: "600" }}>
                Customer: {overrideModalOrder.customer_name} ({overrideModalOrder.customer_phone || "No phone"})
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "2px" }}>
                Total: ₹{overrideModalOrder.total_amount} • {overrideModalOrder.payment_method}
              </div>
            </div>

            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "10px" }}>
              As authorized staff, you can manually confirm this order if the customer cannot receive SMS (e.g. phone died, verified in person at counter). An audit reason is mandatory:
            </p>

            <textarea
              value={overrideReason}
              onChange={(e) => {
                setOverrideReason(e.target.value);
                if (overrideError) setOverrideError("");
              }}
              placeholder="e.g. Customer present at counter; phone out of charge, verified order in person"
              rows={3}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
                fontSize: "0.85rem",
                outline: "none",
                marginBottom: "12px",
                fontFamily: "inherit"
              }}
            />

            {overrideError && (
              <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", color: "var(--status-err)", padding: "8px 12px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: "600", marginBottom: "12px" }}>
                ❌ {overrideError}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setOverrideModalOrder(null)}
                className="btn-secondary"
                disabled={overrideSubmitting}
                style={{ padding: "8px 16px", fontSize: "0.85rem" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmOverride}
                disabled={overrideSubmitting || overrideReason.trim().length < 5}
                className="btn-primary"
                style={{
                  padding: "8px 18px",
                  fontSize: "0.85rem",
                  fontWeight: "700",
                  opacity: overrideReason.trim().length >= 5 ? 1 : 0.6,
                  cursor: (overrideSubmitting || overrideReason.trim().length < 5) ? "not-allowed" : "pointer"
                }}
              >
                {overrideSubmitting ? "Confirming..." : "Confirm Manual Override"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
