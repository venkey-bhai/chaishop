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
  const { currentUser, getValidAdminToken } = useAuth();
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

  const adminName = currentUser?.name || currentUser?.full_name || "Admin";
  const adminPhone = currentUser?.mobile_number || "9876543201";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", paddingBottom: "40px" }}>
      {/* Top Welcome Banner - Matching Customer Page Aesthetic */}
      <div
        style={{
          background: "linear-gradient(135deg, #0F766E 0%, #115E59 100%)",
          color: "#FFFFFF",
          borderRadius: "16px",
          padding: "26px 30px",
          boxShadow: "0 6px 20px rgba(15, 118, 110, 0.18)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <div style={{ fontSize: "0.85rem", opacity: 0.85, fontWeight: "500" }}>Welcome back,</div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: "800", margin: "4px 0 6px 0", letterSpacing: "-0.01em" }}>
            {adminName}
          </h1>
          <p style={{ margin: 0, fontSize: "0.9rem", opacity: 0.9 }}>
            Full control over Customer Details, Operating Expenses, Daily Sales, Menu Items, and Kitchen Orders.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <div
            style={{
              background: "rgba(255, 255, 255, 0.15)",
              border: "1px solid rgba(255, 255, 255, 0.25)",
              padding: "10px 18px",
              borderRadius: "12px",
              textAlign: "right",
            }}
          >
            <div style={{ fontSize: "0.72rem", opacity: 0.85, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              EXECUTIVE ADMIN PORTAL
            </div>
            <div style={{ fontSize: "0.95rem", fontWeight: "700", marginTop: "2px" }}>
              Live Tea Shop Operations
            </div>
          </div>

          <button
            onClick={loadDashboard}
            disabled={loading}
            style={{
              background: "#FFFFFF",
              color: "#0F766E",
              border: "none",
              padding: "10px 16px",
              borderRadius: "10px",
              fontWeight: "700",
              fontSize: "0.85rem",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            }}
          >
            {loading ? "Refreshing..." : "↻ Refresh Live Data"}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "10px",
            color: "#DC2626",
            fontSize: "0.88rem",
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Admin Shop & Profile Info Summary Bar - Matching Image Layout */}
      <div
        className="card"
        style={{
          background: "#FFFFFF",
          border: "1px solid var(--border-subtle)",
          borderRadius: "14px",
          padding: "20px 24px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "18px",
          }}
        >
          <div>
            <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
              Shop Name
            </span>
            <div style={{ fontSize: "1.05rem", fontWeight: "700", color: "var(--text-main)", marginTop: "2px" }}>
              ChaiFlow Tea Shop
            </div>
          </div>

          <div>
            <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
              Administrator
            </span>
            <div style={{ fontSize: "1.05rem", fontWeight: "600", color: "var(--text-main)", marginTop: "2px" }}>
              {adminName}
            </div>
          </div>

          <div>
            <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
              Registered Mobile Number
            </span>
            <div style={{ fontSize: "1.05rem", fontWeight: "700", color: "#0F766E", marginTop: "2px" }}>
              {adminPhone}
            </div>
          </div>

          <div>
            <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
              System Role & Access
            </span>
            <div style={{ marginTop: "4px" }}>
              <span
                style={{
                  background: "#DCFCE7",
                  color: "#15803D",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "0.82rem",
                  fontWeight: "700",
                }}
              >
                ● 👑 Shop Admin (Full Privileges)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Rich KPI Financial & Operations Cards - Matching Exact Image Styling */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "16px",
        }}
      >
        {/* Card 1: Total Customers */}
        <Link
          href="/admin/customers"
          className="card"
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--border-subtle)",
            borderRadius: "14px",
            padding: "20px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
            textDecoration: "none",
            color: "inherit",
            display: "block",
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: "600" }}>
              Total Customers
            </span>
            <span style={{ fontSize: "1.4rem" }}>👥</span>
          </div>
          <div style={{ fontSize: "1.7rem", fontWeight: "800", color: "var(--text-main)", marginTop: "8px" }}>
            {summary?.total_customers ?? 0}
          </div>
          <div style={{ fontSize: "0.78rem", color: "#0F766E", marginTop: "4px", fontWeight: "600" }}>
            {summary?.credit_approved_customers ?? 0} Rule 61 Khata Eligible →
          </div>
        </Link>

        {/* Card 2: Today's Revenue */}
        <Link
          href="/admin/daily-sales"
          className="card"
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--border-subtle)",
            borderRadius: "14px",
            padding: "20px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
            textDecoration: "none",
            color: "inherit",
            display: "block",
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: "600" }}>
              Today's Gross Sales
            </span>
            <span style={{ fontSize: "1.4rem" }}>💰</span>
          </div>
          <div style={{ fontSize: "1.7rem", fontWeight: "800", color: "#0F766E", marginTop: "8px" }}>
            ₹{Number(summary?.today_billed_sales ?? summary?.today_sales ?? 0).toFixed(2)}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
            {tokenStats?.total_orders ?? summary?.today_order_count ?? 0} orders settled today →
          </div>
        </Link>

        {/* Card 3: Today's Operating Expenses */}
        <Link
          href="/admin/expenses"
          className="card"
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--border-subtle)",
            borderRadius: "14px",
            padding: "20px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
            textDecoration: "none",
            color: "inherit",
            display: "block",
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: "600" }}>
              Today's Operating Expenses
            </span>
            <span style={{ fontSize: "1.4rem" }}>📉</span>
          </div>
          <div style={{ fontSize: "1.7rem", fontWeight: "800", color: "#DC2626", marginTop: "8px" }}>
            ₹{Number(summary?.today_expenses ?? 0).toFixed(2)}
          </div>
          <div style={{ fontSize: "0.78rem", color: "#B91C1C", marginTop: "4px", fontWeight: "600" }}>
            Milk, tea powder, gas & inventory →
          </div>
        </Link>

        {/* Card 4: Outstanding Khata / Credit Receivable */}
        <Link
          href="/admin/credit"
          className="card"
          style={{
            background: Number(summary?.total_outstanding_credit || 0) > 0 ? "#FFFBEB" : "#FFFFFF",
            border: Number(summary?.total_outstanding_credit || 0) > 0 ? "1px solid #FDE68A" : "1px solid var(--border-subtle)",
            borderRadius: "14px",
            padding: "20px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
            textDecoration: "none",
            color: "inherit",
            display: "block",
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: "600" }}>
              Outstanding Khata Debt
            </span>
            <span style={{ fontSize: "1.4rem" }}>
              {Number(summary?.total_outstanding_credit || 0) > 0 ? "⚠️" : "✨"}
            </span>
          </div>
          <div
            style={{
              fontSize: "1.7rem",
              fontWeight: "800",
              color: Number(summary?.total_outstanding_credit || 0) > 0 ? "#D97706" : "#16A34A",
              marginTop: "8px",
            }}
          >
            ₹{Number(summary?.total_outstanding_credit ?? 0).toFixed(2)}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
            Customer balance receivable →
          </div>
        </Link>
      </div>

      {/* Two Dedicated Hubs: Customer Details & Expenses Details */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "20px" }}>
        {/* Customer Details Hub */}
        <div
          className="card"
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--border-subtle)",
            borderRadius: "16px",
            padding: "24px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "1.6rem" }}>👥</span>
                <div>
                  <h3 style={{ fontSize: "1.15rem", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
                    Customer Details & Khata Ledger
                  </h3>
                  <p style={{ margin: "2px 0 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                    Manage customer accounts, search by phone, configure credit limits, and view history.
                  </p>
                </div>
              </div>
            </div>

            <div
              style={{
                background: "#F8FAFC",
                border: "1px solid var(--border-subtle)",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "18px",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase" }}>
                    Registered Customers
                  </div>
                  <div style={{ fontSize: "1.3rem", fontWeight: "800", color: "var(--text-main)", marginTop: "2px" }}>
                    {summary?.total_customers ?? 0}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase" }}>
                    Rule 61 Khata Approved
                  </div>
                  <div style={{ fontSize: "1.3rem", fontWeight: "800", color: "#0F766E", marginTop: "2px" }}>
                    {summary?.credit_approved_customers ?? 0}
                  </div>
                </div>
              </div>
            </div>

            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "0 0 16px 0", lineHeight: 1.5 }}>
              • Click below or use the <strong>Customers</strong> item in the left sidebar to search customers, delete accounts, view day-by-day bill history, or grant Khata credit limits.
            </p>
          </div>

          <Link
            href="/admin/customers"
            style={{
              padding: "12px 20px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #0F766E 0%, #115E59 100%)",
              color: "#FFFFFF",
              fontWeight: "700",
              fontSize: "0.9rem",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              boxShadow: "0 4px 12px rgba(15, 118, 110, 0.2)",
            }}
          >
            <span>👥</span> Open Customer Details Page →
          </Link>
        </div>

        {/* Expenses Details Hub */}
        <div
          className="card"
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--border-subtle)",
            borderRadius: "16px",
            padding: "24px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "1.6rem" }}>📉</span>
                <div>
                  <h3 style={{ fontSize: "1.15rem", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
                    Operating Expenses Details
                  </h3>
                  <p style={{ margin: "2px 0 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                    Track daily vendor costs, milk, tea powder, gas cylinders, snacks, and shop utilities.
                  </p>
                </div>
              </div>
            </div>

            <div
              style={{
                background: "#F8FAFC",
                border: "1px solid var(--border-subtle)",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "18px",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase" }}>
                    Today's Expenses
                  </div>
                  <div style={{ fontSize: "1.3rem", fontWeight: "800", color: "#DC2626", marginTop: "2px" }}>
                    ₹{Number(summary?.today_expenses ?? 0).toFixed(2)}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase" }}>
                    Top Expense Category
                  </div>
                  <div style={{ fontSize: "1.1rem", fontWeight: "700", color: "var(--text-main)", marginTop: "2px" }}>
                    🥛 Milk & Dairy
                  </div>
                </div>
              </div>
            </div>

            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "0 0 16px 0", lineHeight: 1.5 }}>
              • Click below or use the <strong>Expenses</strong> item in the left sidebar to add new expense records, view monthly cost analytics, filter by category, or delete entries.
            </p>
          </div>

          <Link
            href="/admin/expenses"
            style={{
              padding: "12px 20px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)",
              color: "#FFFFFF",
              fontWeight: "700",
              fontSize: "0.9rem",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              boxShadow: "0 4px 12px rgba(220, 38, 38, 0.2)",
            }}
          >
            <span>📉</span> Open Expenses Details Page →
          </Link>
        </div>
      </div>

      {/* Additional Quick Action Shortcuts Grid */}
      <div
        className="card"
        style={{
          background: "#FFFFFF",
          border: "1px solid var(--border-subtle)",
          borderRadius: "16px",
          padding: "24px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
        }}
      >
        <h3 style={{ fontSize: "1.1rem", fontWeight: "700", marginBottom: "16px", color: "var(--text-main)" }}>
          ⚡ All Admin Panel Features & Sidebar Shortcuts
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
          {/* Customers */}
          <Link
            href="/admin/customers"
            style={{
              padding: "16px",
              borderRadius: "12px",
              background: "#F8FAFC",
              border: "1px solid var(--border-subtle)",
              textDecoration: "none",
              color: "inherit",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ fontSize: "1.5rem" }}>👥</span>
            <strong style={{ fontSize: "0.95rem" }}>Customers</strong>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Directory, Khata & Rule 61</span>
          </Link>

          {/* Expenses */}
          <Link
            href="/admin/expenses"
            style={{
              padding: "16px",
              borderRadius: "12px",
              background: "#F8FAFC",
              border: "1px solid var(--border-subtle)",
              textDecoration: "none",
              color: "inherit",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ fontSize: "1.5rem" }}>📉</span>
            <strong style={{ fontSize: "0.95rem" }}>Expenses</strong>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Record costs & vendor receipts</span>
          </Link>

          {/* Daily Sales */}
          <Link
            href="/admin/daily-sales"
            style={{
              padding: "16px",
              borderRadius: "12px",
              background: "#F8FAFC",
              border: "1px solid var(--border-subtle)",
              textDecoration: "none",
              color: "inherit",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ fontSize: "1.5rem" }}>🧾</span>
            <strong style={{ fontSize: "0.95rem" }}>Daily Sales</strong>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Register balance & payment breakdown</span>
          </Link>

          {/* Menu Management */}
          <Link
            href="/admin/menu"
            style={{
              padding: "16px",
              borderRadius: "12px",
              background: "#F8FAFC",
              border: "1px solid var(--border-subtle)",
              textDecoration: "none",
              color: "inherit",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ fontSize: "1.5rem" }}>☕</span>
            <strong style={{ fontSize: "0.95rem" }}>Menu Catalog</strong>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Prices, stock limits & categories</span>
          </Link>

          {/* Orders & Kitchen */}
          <Link
            href="/admin/orders"
            style={{
              padding: "16px",
              borderRadius: "12px",
              background: "#F8FAFC",
              border: "1px solid var(--border-subtle)",
              textDecoration: "none",
              color: "inherit",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ fontSize: "1.5rem" }}>📋</span>
            <strong style={{ fontSize: "0.95rem" }}>Orders & Kitchen KDS</strong>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Live token queue (#1, #2...)</span>
          </Link>

          {/* Payments & Billing */}
          <Link
            href="/admin/payments"
            style={{
              padding: "16px",
              borderRadius: "12px",
              background: "#F8FAFC",
              border: "1px solid var(--border-subtle)",
              textDecoration: "none",
              color: "inherit",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ fontSize: "1.5rem" }}>💵</span>
            <strong style={{ fontSize: "0.95rem" }}>Billing & Payments</strong>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Settle cash, UPI QR & receipts</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
