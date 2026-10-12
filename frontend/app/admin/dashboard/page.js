"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "../../../context/AuthContext";
import {
  getDashboardSummary,
  getTodayTokens,
  getDailyTokenStats,
} from "../../../services/api";

export default function DashboardPage() {
  const { getValidAdminToken } = useAuth();
  const [summary, setSummary] = useState(null);
  const [tokenStats, setTokenStats] = useState(null);
  const [recentTokens, setRecentTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setError("");
    try {
      const activeToken = await getValidAdminToken();
      const [sumRes, statsRes, tokensRes] = await Promise.all([
        getDashboardSummary(activeToken).catch(() => null),
        getDailyTokenStats().catch(() => null),
        getTodayTokens().catch(() => null),
      ]);

      setSummary(sumRes);
      setTokenStats(statsRes);
      setRecentTokens(tokensRes?.all || tokensRes?.pending || []);
    } catch (err) {
      console.error("Dashboard load failed:", err);
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Top Welcome Banner */}
      <div
        className="card"
        style={{
          padding: "24px",
          background: "linear-gradient(135deg, #FFFFFF 0%, #F0FDFA 100%)",
          border: "1px solid #CCFBF1",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <span style={{ fontSize: "1.6rem" }}>☕</span>
            <h2 style={{ fontSize: "1.3rem", fontWeight: "700", color: "var(--text-main)" }}>
              Chai Flow Executive Dashboard
            </h2>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Real-time tea shop operations, kitchen token queue, and financial reconciliation.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={loadDashboard}
            disabled={loading}
            className="btn-secondary"
            style={{ fontSize: "0.85rem", padding: "8px 16px" }}
          >
            {loading ? "Refreshing..." : "↻ Refresh Live Data"}
          </button>
          <Link href="/menu" target="_blank" className="btn-primary" style={{ fontSize: "0.85rem", padding: "8px 16px" }}>
            📱 Open Customer Menu
          </Link>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "8px",
            color: "var(--status-err)",
            fontSize: "0.88rem",
          }}
        >
          {error}
        </div>
      )}

      {/* KPI Summary Cards Grid */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
        }}
      >
        {/* Today's Sales */}
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase" }}>
              Today's Sales
            </span>
            <span style={{ fontSize: "1.2rem" }}>💰</span>
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "var(--color-primary)" }}>
            ₹{summary?.today_billed_sales ?? summary?.today_sales ?? 0}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "4px" }}>
            Cash + UPI settled inflow
          </div>
        </div>

        {/* Today's Orders */}
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase" }}>
              Today's Orders
            </span>
            <span style={{ fontSize: "1.2rem" }}>📋</span>
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "var(--text-main)" }}>
            {tokenStats?.total_orders ?? summary?.today_order_count ?? 0}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "4px" }}>
            {tokenStats?.active_ready_count ?? 0} Ready | {tokenStats?.active_preparing_count ?? 0} Preparing
          </div>
        </div>

        {/* Total Customers */}
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase" }}>
              Total Customers
            </span>
            <span style={{ fontSize: "1.2rem" }}>👥</span>
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "var(--text-main)" }}>
            {summary?.total_customers ?? 0}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "4px" }}>
            {summary?.credit_approved_customers ?? 0} Rule 61 Approved Khata
          </div>
        </div>

        {/* Outstanding Credit Khata */}
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase" }}>
              Outstanding Credit
            </span>
            <span style={{ fontSize: "1.2rem" }}>💳</span>
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "var(--chai-gold)" }}>
            ₹{summary?.total_outstanding_credit ?? 0}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "4px" }}>
            Customer balance receivable
          </div>
        </div>

        {/* Today's Expenses */}
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase" }}>
              Today's Expenses
            </span>
            <span style={{ fontSize: "1.2rem" }}>📉</span>
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "var(--status-err)" }}>
            ₹{summary?.today_expenses ?? 0}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "4px" }}>
            Daily milk, tea powder & gas
          </div>
        </div>
      </section>

      {/* Quick Navigation Panels */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
        {/* Operations Hub */}
        <div className="card" style={{ padding: "24px" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: "700", marginBottom: "16px", color: "var(--text-main)" }}>
            ⚡ Operational Quick Links
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <Link
              href="/admin/orders"
              style={{
                padding: "14px",
                borderRadius: "10px",
                background: "var(--bg-card-subtle)",
                border: "1px solid var(--border-subtle)",
                textDecoration: "none",
                color: "inherit",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <span style={{ fontSize: "1.3rem" }}>📋</span>
              <strong style={{ fontSize: "0.9rem" }}>Orders & KDS</strong>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Live token queue</span>
            </Link>

            <Link
              href="/admin/payments"
              style={{
                padding: "14px",
                borderRadius: "10px",
                background: "var(--bg-card-subtle)",
                border: "1px solid var(--border-subtle)",
                textDecoration: "none",
                color: "inherit",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <span style={{ fontSize: "1.3rem" }}>💵</span>
              <strong style={{ fontSize: "0.9rem" }}>Payments</strong>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Settle cash & UPI</span>
            </Link>

            <Link
              href="/admin/customers"
              style={{
                padding: "14px",
                borderRadius: "10px",
                background: "var(--bg-card-subtle)",
                border: "1px solid var(--border-subtle)",
                textDecoration: "none",
                color: "inherit",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <span style={{ fontSize: "1.3rem" }}>👥</span>
              <strong style={{ fontSize: "0.9rem" }}>Customers</strong>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Khata & Rule 61</span>
            </Link>

            <Link
              href="/admin/menu"
              style={{
                padding: "14px",
                borderRadius: "10px",
                background: "var(--bg-card-subtle)",
                border: "1px solid var(--border-subtle)",
                textDecoration: "none",
                color: "inherit",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <span style={{ fontSize: "1.3rem" }}>☕</span>
              <strong style={{ fontSize: "0.9rem" }}>Menu Catalog</strong>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Stock & prices</span>
            </Link>
          </div>
        </div>

        {/* Live Token Status */}
        <div className="card" style={{ padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: "700", color: "var(--text-main)" }}>
              ⏱️ Today's Active Pipeline
            </h3>
            <Link href="/admin/orders" style={{ fontSize: "0.82rem", color: "var(--color-primary)", textDecoration: "none", fontWeight: "600" }}>
              View All Orders →
            </Link>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "12px",
                borderRadius: "8px",
                background: "#FEF3C7",
                border: "1px solid #FDE68A",
              }}
            >
              <span style={{ fontSize: "0.88rem", fontWeight: "600", color: "#92400E" }}>
                ⏳ Pending Kitchen Acceptance
              </span>
              <strong style={{ color: "#92400E" }}>{tokenStats?.active_pending_count ?? 0}</strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "12px",
                borderRadius: "8px",
                background: "#E0F2FE",
                border: "1px solid #BAE6FD",
              }}
            >
              <span style={{ fontSize: "0.88rem", fontWeight: "600", color: "#0369A1" }}>
                🔥 Brewing / Preparing
              </span>
              <strong style={{ color: "#0369A1" }}>{tokenStats?.active_preparing_count ?? 0}</strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "12px",
                borderRadius: "8px",
                background: "#DCFCE7",
                border: "1px solid #BBF7D0",
              }}
            >
              <span style={{ fontSize: "0.88rem", fontWeight: "600", color: "#15803D" }}>
                ✅ Ready for Counter Pickup
              </span>
              <strong style={{ color: "#15803D" }}>{tokenStats?.active_ready_count ?? 0}</strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
