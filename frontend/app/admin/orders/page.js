"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import {
  getTodayTokens,
  getDailyTokenStats,
  updateOrderStatus,
} from "../../../services/api";

const STATUS_LABELS = {
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
  const [actionMsg, setActionMsg] = useState("");

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

  // Derive orders list based on selected filter tab
  const activeList = (() => {
    if (!tokensData) return [];
    if (filterTab === "pending") return tokensData.pending || [];
    if (filterTab === "preparing") return tokensData.preparing || [];
    if (filterTab === "ready") return tokensData.ready || [];
    if (filterTab === "completed") return tokensData.completed || [];
    return [
      ...(tokensData.pending || []),
      ...(tokensData.preparing || []),
      ...(tokensData.ready || []),
    ];
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
        <div className="card" style={{ padding: "16px", textAlign: "center" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase" }}>
            Pending Queue
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "#D97706" }}>
            {tokensData?.pending?.length || 0}
          </div>
        </div>

        <div className="card" style={{ padding: "16px", textAlign: "center" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase" }}>
            Brewing / Preparing
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "#0284C7" }}>
            {tokensData?.preparing?.length || 0}
          </div>
        </div>

        <div className="card" style={{ padding: "16px", textAlign: "center" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase" }}>
            Ready for Pickup
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--status-success)" }}>
            {tokensData?.ready?.length || 0}
          </div>
        </div>

        <div className="card" style={{ padding: "16px", textAlign: "center" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase" }}>
            Total Orders Today
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--text-main)" }}>
            {tokenStats?.total_orders || tokensData?.total_orders_today || 0}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="card" style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {[
            { id: "all", label: `Active Pipeline (${(tokensData?.pending?.length || 0) + (tokensData?.preparing?.length || 0) + (tokensData?.ready?.length || 0)})` },
            { id: "pending", label: `Pending (${tokensData?.pending?.length || 0})` },
            { id: "preparing", label: `Preparing (${tokensData?.preparing?.length || 0})` },
            { id: "ready", label: `Ready (${tokensData?.ready?.length || 0})` },
            { id: "completed", label: `Completed (${tokensData?.completed?.length || 0})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id)}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: `1px solid ${filterTab === tab.id ? "var(--color-primary)" : "var(--border-subtle)"}`,
                background: filterTab === tab.id ? "var(--color-primary)" : "#FFFFFF",
                color: filterTab === tab.id ? "#FFFFFF" : "var(--text-main)",
                fontSize: "0.85rem",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
            </button>
          ))}
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <div>
                      <span
                        style={{
                          fontSize: "1.2rem",
                          fontWeight: "800",
                          color: "var(--text-main)",
                          background: "var(--bg-card-subtle)",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          marginRight: "8px",
                        }}
                      >
                        #{order.daily_token_number || order.token_number}
                      </span>
                      <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                        {order.order_time || order.created_at
                          ? new Date(order.order_time || order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "Just now"}
                      </span>
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
                <div style={{ display: "flex", gap: "8px", borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>
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
                        if (window.confirm(`Are you sure you want to cancel Token #${order.daily_token_number || order.token_number}?`)) {
                          handleStatusChange(order.order_id, "CANCELLED", order.daily_token_number || order.token_number);
                        }
                      }}
                      style={{
                        background: "transparent",
                        border: "1px solid #FECACA",
                        color: "var(--status-err)",
                        borderRadius: "8px",
                        padding: "8px 14px",
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
    </div>
  );
}
