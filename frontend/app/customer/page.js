"use client";
import React, { useState, useEffect, Suspense, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { getMyCustomerHistory } from "../../services/api";

function CustomerDashboardContent() {
  const router = useRouter();
  const { token, currentUser, loading: authLoading, logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [historyData, setHistoryData] = useState(null);

  // Filters
  const [periodMode, setPeriodMode] = useState("all"); // "all", "monthly", "daily"
  const [searchTerm, setSearchTerm] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchHistory = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");

    try {
      const now = new Date();
      const params = {
        mode: periodMode,
        page,
        limit: pageSize,
      };

      if (periodMode === "daily") {
        params.date = now.toISOString().split("T")[0];
      } else if (periodMode === "monthly") {
        params.month = now.getMonth() + 1;
        params.year = now.getFullYear();
      }

      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }

      if (paymentMethodFilter && paymentMethodFilter !== "ALL") {
        params.payment_method = paymentMethodFilter;
      }

      const res = await getMyCustomerHistory(params, token);
      setHistoryData(res);
    } catch (err) {
      console.error("Failed to load customer history:", err);
      setError(err.message || "Unable to fetch purchase history.");
    } finally {
      setLoading(false);
    }
  }, [token, periodMode, searchTerm, paymentMethodFilter, page, pageSize]);

  useEffect(() => {
    if (!authLoading && token) {
      fetchHistory();
    }
  }, [authLoading, token, fetchHistory]);

  // Auth Guard
  if (!authLoading && !token) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #F0FDF4 0%, #F8FAFC 50%, #ECFDF5 100%)",
          padding: "24px",
        }}
      >
        <div
          className="card"
          style={{
            maxWidth: "460px",
            width: "100%",
            textAlign: "center",
            padding: "40px 32px",
            borderRadius: "20px",
            background: "#FFFFFF",
            boxShadow: "0 12px 30px rgba(15, 118, 110, 0.12)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ fontSize: "2.8rem", marginBottom: "14px" }}>☕</div>
          <h2 style={{ fontSize: "1.45rem", fontWeight: "800", color: "var(--text-main)", marginBottom: "8px" }}>
            Customer Sign In Required
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", lineHeight: 1.55, marginBottom: "24px" }}>
            Please sign in to view your transparent purchase history, bill receipts, and credit khata ledger.
          </p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="/login?redirect=/customer"
              style={{
                padding: "11px 22px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #0F766E 0%, #115E59 100%)",
                color: "#FFFFFF",
                fontWeight: "700",
                textDecoration: "none",
                fontSize: "0.92rem",
              }}
            >
              Sign In to Your Account →
            </Link>
            <Link
              href="/signup"
              style={{
                padding: "11px 18px",
                borderRadius: "10px",
                border: "1.5px solid #0F766E",
                background: "#F0FDF4",
                color: "#0F766E",
                fontWeight: "700",
                textDecoration: "none",
                fontSize: "0.92rem",
              }}
            >
              Sign Up
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const customerProfile = historyData?.customer || {
    name: currentUser?.name || "Customer",
    phone: currentUser?.mobile_number || "—",
    id: currentUser?.customer_id || currentUser?.id || "—",
    is_credit_eligible: currentUser?.is_credit_eligible || false,
    credit_limit: currentUser?.credit_limit || 0,
    current_balance: 0,
  };

  const summary = historyData?.summary || {
    total_orders_count: 0,
    total_purchased: 0,
    total_paid_total: 0,
    closing_credit_balance: customerProfile.current_balance || 0,
  };

  const transactions = historyData?.transactions || [];
  const pagination = historyData?.pagination || { total_pages: 1, total_records: 0 };

  const pendingDebt = Number(summary.closing_credit_balance || 0);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F8FAFC",
        color: "var(--text-main)",
        paddingBottom: "60px",
      }}
    >
      {/* Top Navigation Bar */}
      <nav
        style={{
          background: "#FFFFFF",
          borderBottom: "1px solid var(--border-subtle)",
          padding: "14px 28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          position: "sticky",
          top: 0,
          zIndex: 40,
          boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #0F766E 0%, #115E59 100%)",
              color: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.3rem",
            }}
          >
            ☕
          </div>
          <div>
            <div style={{ fontWeight: "800", fontSize: "1.1rem", color: "var(--text-main)" }}>
              ChaiFlow Customer Portal
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              Transparent Khata & Purchase Statements
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <Link
            href="/menu"
            style={{
              padding: "7px 14px",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle)",
              background: "#F8FAFC",
              color: "var(--color-primary)",
              textDecoration: "none",
              fontSize: "0.85rem",
              fontWeight: "600",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>📱</span> Browse QR Menu
          </Link>

          <button
            onClick={() => {
              logout();
              router.push("/login");
            }}
            style={{
              padding: "7px 14px",
              borderRadius: "8px",
              border: "1px solid #FECACA",
              background: "#FEF2F2",
              color: "#DC2626",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: "600",
            }}
          >
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main Container */}
      <main style={{ maxWidth: "1200px", margin: "24px auto 0 auto", padding: "0 20px" }}>
        {/* Banner Greeting */}
        <div
          style={{
            background: "linear-gradient(135deg, #0F766E 0%, #115E59 100%)",
            color: "#FFFFFF",
            borderRadius: "16px",
            padding: "24px 28px",
            marginBottom: "24px",
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
            <h1 style={{ fontSize: "1.6rem", fontWeight: "800", margin: "4px 0 6px 0", letterSpacing: "-0.01em" }}>
              {customerProfile.name}
            </h1>
            <p style={{ margin: 0, fontSize: "0.88rem", opacity: 0.9 }}>
              View all your tea shop purchases, bills, and outstanding khata balance in real-time.
            </p>
          </div>

          <div
            style={{
              background: "rgba(255, 255, 255, 0.15)",
              border: "1px solid rgba(255, 255, 255, 0.25)",
              padding: "10px 18px",
              borderRadius: "12px",
              textAlign: "right",
            }}
          >
            <div style={{ fontSize: "0.75rem", opacity: 0.85, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              View-Only Statement
            </div>
            <div style={{ fontSize: "0.95rem", fontWeight: "700", marginTop: "2px" }}>
              Verified Customer Ledger
            </div>
          </div>
        </div>

        {/* Customer Profile Card */}
        <div
          className="card"
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--border-subtle)",
            borderRadius: "14px",
            padding: "20px 24px",
            marginBottom: "24px",
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
                Customer Name
              </span>
              <div style={{ fontSize: "1.05rem", fontWeight: "700", color: "var(--text-main)", marginTop: "2px" }}>
                {customerProfile.name}
              </div>
            </div>

            <div>
              <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
                Registered Phone Number
              </span>
              <div style={{ fontSize: "1.05rem", fontWeight: "600", color: "var(--text-main)", marginTop: "2px" }}>
                {customerProfile.phone}
              </div>
            </div>

            <div>
              <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
                Customer Account ID
              </span>
              <div style={{ fontSize: "1.05rem", fontWeight: "700", color: "#0F766E", marginTop: "2px" }}>
                #{customerProfile.id}
              </div>
            </div>

            <div>
              <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
                Khata / Credit Status
              </span>
              <div style={{ marginTop: "4px" }}>
                {customerProfile.is_credit_eligible ? (
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
                    ● Credit Tab Enabled (Limit: ₹{customerProfile.credit_limit})
                  </span>
                ) : (
                  <span
                    style={{
                      background: "#F1F5F9",
                      color: "var(--text-muted)",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      fontSize: "0.82rem",
                      fontWeight: "600",
                    }}
                  >
                    Standard Prepaid
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 4 KPI Financial Summary Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
            marginBottom: "28px",
          }}
        >
          {/* Card 1: Total Orders */}
          <div
            className="card"
            style={{
              background: "#FFFFFF",
              border: "1px solid var(--border-subtle)",
              borderRadius: "14px",
              padding: "20px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: "600" }}>
                Total Orders Placed
              </span>
              <span style={{ fontSize: "1.4rem" }}>🛍️</span>
            </div>
            <div style={{ fontSize: "1.7rem", fontWeight: "800", color: "var(--text-main)", marginTop: "8px" }}>
              {summary.total_orders_count}
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Lifetime bill orders
            </div>
          </div>

          {/* Card 2: Total Spent */}
          <div
            className="card"
            style={{
              background: "#FFFFFF",
              border: "1px solid var(--border-subtle)",
              borderRadius: "14px",
              padding: "20px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: "600" }}>
                Total Spent
              </span>
              <span style={{ fontSize: "1.4rem" }}>💰</span>
            </div>
            <div style={{ fontSize: "1.7rem", fontWeight: "800", color: "#0F766E", marginTop: "8px" }}>
              ₹{Number(summary.total_purchased || 0).toFixed(2)}
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Lifetime purchases value
            </div>
          </div>

          {/* Card 3: Total Paid Amount */}
          <div
            className="card"
            style={{
              background: "#FFFFFF",
              border: "1px solid var(--border-subtle)",
              borderRadius: "14px",
              padding: "20px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: "600" }}>
                Total Paid Amount
              </span>
              <span style={{ fontSize: "1.4rem" }}>✅</span>
            </div>
            <div style={{ fontSize: "1.7rem", fontWeight: "800", color: "#16A34A", marginTop: "8px" }}>
              ₹{Number(summary.total_paid_total || 0).toFixed(2)}
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Immediate & credit repayments
            </div>
          </div>

          {/* Card 4: Pending Khata Debt */}
          <div
            className="card"
            style={{
              background: pendingDebt > 0 ? "#FEF2F2" : "#FFFFFF",
              border: pendingDebt > 0 ? "1px solid #FECACA" : "1px solid var(--border-subtle)",
              borderRadius: "14px",
              padding: "20px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span
                style={{
                  fontSize: "0.8rem",
                  color: pendingDebt > 0 ? "#B91C1C" : "var(--text-muted)",
                  fontWeight: "600",
                }}
              >
                Pending Khata Debt
              </span>
              <span style={{ fontSize: "1.4rem" }}>{pendingDebt > 0 ? "⚠️" : "✨"}</span>
            </div>
            <div
              style={{
                fontSize: "1.7rem",
                fontWeight: "800",
                color: pendingDebt > 0 ? "#DC2626" : "#16A34A",
                marginTop: "8px",
              }}
            >
              ₹{pendingDebt.toFixed(2)}
            </div>
            <div
              style={{
                fontSize: "0.78rem",
                color: pendingDebt > 0 ? "#991B1B" : "#16A34A",
                marginTop: "4px",
                fontWeight: "500",
              }}
            >
              {pendingDebt > 0 ? "Outstanding balance to clear" : "No pending balance due!"}
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div
          className="card"
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--border-subtle)",
            borderRadius: "14px",
            padding: "16px 20px",
            marginBottom: "20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "14px",
          }}
        >
          {/* Period Mode Selector */}
          <div style={{ display: "flex", background: "#F1F5F9", padding: "3px", borderRadius: "8px" }}>
            {[
              { id: "all", label: "All Time" },
              { id: "monthly", label: "This Month" },
              { id: "daily", label: "Today" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPeriodMode(p.id);
                  setPage(1);
                }}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "none",
                  background: periodMode === p.id ? "#FFFFFF" : "transparent",
                  color: periodMode === p.id ? "#0F766E" : "var(--text-muted)",
                  fontWeight: periodMode === p.id ? "700" : "500",
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  boxShadow: periodMode === p.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  transition: "all 0.1s ease",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Search Input & Payment Filter */}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", flex: 1, justifyContent: "flex-end" }}>
            <input
              type="text"
              placeholder="Search by item, bill or token..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              style={{
                padding: "8px 12px",
                fontSize: "0.85rem",
                border: "1px solid var(--border-subtle)",
                borderRadius: "8px",
                background: "#F8FAFC",
                minWidth: "220px",
                outline: "none",
              }}
            />

            <select
              value={paymentMethodFilter}
              onChange={(e) => {
                setPaymentMethodFilter(e.target.value);
                setPage(1);
              }}
              style={{
                padding: "8px 12px",
                fontSize: "0.85rem",
                border: "1px solid var(--border-subtle)",
                borderRadius: "8px",
                background: "#F8FAFC",
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="ALL">All Payment Methods</option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CREDIT">Khata / Credit</option>
            </select>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "10px",
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              color: "#DC2626",
              marginBottom: "16px",
              fontSize: "0.85rem",
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* Order History Table */}
        <div
          className="card"
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--border-subtle)",
            borderRadius: "14px",
            overflow: "hidden",
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h2 style={{ fontSize: "1.05rem", fontWeight: "700", margin: 0, color: "var(--text-main)" }}>
              Detailed Bill & Purchase History
            </h2>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {pagination.total_records} record{pagination.total_records === 1 ? "" : "s"} found
            </span>
          </div>

          {loading ? (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.95rem" }}>
              Loading your purchase records...
            </div>
          ) : transactions.length === 0 ? (
            <div style={{ padding: "60px 20px", textAlign: "center" }}>
              <div style={{ fontSize: "2.8rem", marginBottom: "12px" }}>🧾</div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: "700", margin: "0 0 6px 0", color: "var(--text-main)" }}>
                No purchase records found
              </h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", maxWidth: "420px", margin: "0 auto 18px auto" }}>
                {searchTerm || paymentMethodFilter !== "ALL" || periodMode !== "all"
                  ? "Try resetting your search or date filters."
                  : "You haven't made any purchases yet. Browse the menu or scan our QR code at the counter!"}
              </p>
              <Link
                href="/menu"
                style={{
                  display: "inline-block",
                  padding: "9px 18px",
                  borderRadius: "8px",
                  background: "#0F766E",
                  color: "#FFFFFF",
                  fontWeight: "700",
                  textDecoration: "none",
                  fontSize: "0.88rem",
                }}
              >
                Browse QR Menu →
              </Link>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.86rem" }}>
                <thead>
                  <tr style={{ background: "#F8FAFC", borderBottom: "1px solid var(--border-subtle)" }}>
                    <th style={{ padding: "12px 16px", fontWeight: "600", color: "var(--text-muted)" }}>
                      Bill / Token
                    </th>
                    <th style={{ padding: "12px 16px", fontWeight: "600", color: "var(--text-muted)" }}>
                      Date & Time
                    </th>
                    <th style={{ padding: "12px 16px", fontWeight: "600", color: "var(--text-muted)" }}>
                      Ordered Items
                    </th>
                    <th style={{ padding: "12px 16px", fontWeight: "600", color: "var(--text-muted)", textAlign: "right" }}>
                      Bill Amount
                    </th>
                    <th style={{ padding: "12px 16px", fontWeight: "600", color: "var(--text-muted)", textAlign: "center" }}>
                      Payment Status
                    </th>
                    <th style={{ padding: "12px 16px", fontWeight: "600", color: "var(--text-muted)", textAlign: "center" }}>
                      Order Status
                    </th>
                    <th style={{ padding: "12px 16px", fontWeight: "600", color: "var(--text-muted)", textAlign: "right" }}>
                      Khata Balance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const isRepayment = tx.type === "REPAYMENT";
                    const isCredit = tx.payment_method === "CREDIT" || Number(tx.credit_added) > 0;

                    return (
                      <tr
                        key={tx.id}
                        style={{
                          borderBottom: "1px solid var(--border-subtle)",
                          transition: "background 0.15s ease",
                        }}
                      >
                        {/* Bill / Token */}
                        <td style={{ padding: "14px 16px", fontWeight: "600" }}>
                          {isRepayment ? (
                            <span style={{ color: "#16A34A" }}>Repayment</span>
                          ) : (
                            <div>
                              <span style={{ color: "#0F766E", fontWeight: "700" }}>
                                Token #{tx.daily_token_number || "—"}
                              </span>
                              <div style={{ fontSize: "0.74rem", color: "var(--text-dim)" }}>
                                {tx.order_number || tx.id}
                              </div>
                              {tx.order_type === "TAKEAWAY" ? (
                                <span style={{ fontSize: "0.7rem", background: "#DCFCE7", color: "#15803D", padding: "1px 6px", borderRadius: "4px", fontWeight: "700", display: "inline-block", marginTop: "3px" }}>
                                  🛍️ Takeaway
                                </span>
                              ) : (tx.table_number || tx.seat_number) ? (
                                <span style={{ fontSize: "0.7rem", background: "#EFF6FF", color: "#2563EB", padding: "1px 6px", borderRadius: "4px", fontWeight: "700", display: "inline-block", marginTop: "3px" }}>
                                  🍽️ Table #{tx.table_number || "—"}{tx.seat_number ? `, Seat #${tx.seat_number}` : ""}
                                </span>
                              ) : null}
                            </div>
                          )}
                        </td>

                        {/* Date & Time */}
                        <td style={{ padding: "14px 16px", whiteSpace: "nowrap" }}>
                          <div>{tx.date}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{tx.time}</div>
                        </td>

                        {/* Ordered Items */}
                        <td style={{ padding: "14px 16px" }}>
                          {isRepayment ? (
                            <span style={{ color: "var(--text-muted)" }}>{tx.description || "Counter Debt Repayment"}</span>
                          ) : tx.items && tx.items.length > 0 ? (
                            <div>
                              {tx.items.map((it, idx) => (
                                <span
                                  key={idx}
                                  style={{
                                    display: "inline-block",
                                    marginRight: "6px",
                                    marginBottom: "2px",
                                    background: "#F1F5F9",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    fontSize: "0.78rem",
                                  }}
                                >
                                  {it.quantity}x {it.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>{tx.product_summary || "Order Item"}</span>
                          )}
                        </td>

                        {/* Bill Amount */}
                        <td style={{ padding: "14px 16px", textAlign: "right", fontWeight: "700" }}>
                          {isRepayment ? (
                            <span style={{ color: "#16A34A" }}>-₹{Number(tx.amount_paid || 0).toFixed(2)}</span>
                          ) : (
                            <span>₹{Number(tx.total_bill_amount || 0).toFixed(2)}</span>
                          )}
                        </td>

                        {/* Payment Status */}
                        <td style={{ padding: "14px 16px", textAlign: "center" }}>
                          <span
                            style={{
                              padding: "4px 8px",
                              borderRadius: "6px",
                              fontSize: "0.76rem",
                              fontWeight: "700",
                              background:
                                tx.payment_status === "PAID"
                                  ? "#DCFCE7"
                                  : isCredit
                                    ? "#FEF3C7"
                                    : "#FEE2E2",
                              color:
                                tx.payment_status === "PAID"
                                  ? "#15803D"
                                  : isCredit
                                    ? "#B45309"
                                    : "#DC2626",
                            }}
                          >
                            {isCredit && tx.payment_status !== "PAID" ? "KHATA / CREDIT" : tx.payment_status}
                          </span>
                        </td>

                        {/* Order Status */}
                        <td style={{ padding: "14px 16px", textAlign: "center" }}>
                          <span
                            style={{
                              padding: "4px 8px",
                              borderRadius: "6px",
                              fontSize: "0.76rem",
                              fontWeight: "600",
                              background:
                                tx.order_status === "COMPLETED"
                                  ? "#F0FDF4"
                                  : tx.order_status === "PREPARING"
                                    ? "#EFF6FF"
                                    : "#F8FAFC",
                              color:
                                tx.order_status === "COMPLETED"
                                  ? "#16A34A"
                                  : tx.order_status === "PREPARING"
                                    ? "#2563EB"
                                    : "var(--text-muted)",
                            }}
                          >
                            {tx.order_status}
                          </span>
                        </td>

                        {/* Khata Balance */}
                        <td style={{ padding: "14px 16px", textAlign: "right", fontWeight: "600" }}>
                          ₹{Number(tx.closing_outstanding_credit || 0).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {pagination.total_pages > 1 && (
            <div
              style={{
                padding: "14px 20px",
                borderTop: "1px solid var(--border-subtle)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-subtle)",
                  background: page <= 1 ? "#F8FAFC" : "#FFFFFF",
                  color: page <= 1 ? "var(--text-dim)" : "var(--text-main)",
                  cursor: page <= 1 ? "not-allowed" : "pointer",
                  fontSize: "0.82rem",
                  fontWeight: "600",
                }}
              >
                ← Previous
              </button>

              <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Page {page} of {pagination.total_pages}
              </span>

              <button
                type="button"
                disabled={page >= pagination.total_pages}
                onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-subtle)",
                  background: page >= pagination.total_pages ? "#F8FAFC" : "#FFFFFF",
                  color: page >= pagination.total_pages ? "var(--text-dim)" : "var(--text-main)",
                  cursor: page >= pagination.total_pages ? "not-allowed" : "pointer",
                  fontSize: "0.82rem",
                  fontWeight: "600",
                }}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function CustomerDashboardPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#F8FAFC",
          }}
        >
          <div style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
            Loading ChaiFlow Customer Dashboard...
          </div>
        </div>
      }
    >
      <CustomerDashboardContent />
    </Suspense>
  );
}
