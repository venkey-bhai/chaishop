"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../../context/AuthContext";
import {
  getCustomerHistory,
  updateCustomerCreditStatus,
  recordCreditRepayment,
  getBillReceipt,
} from "../../../../services/api";
import { printThermalBill } from "../../../../utils/thermalPrinter";

function CustomerProfileContent() {
  const params = useParams();
  const router = useRouter();
  const customerId = params?.id;
  const { getValidAdminToken } = useAuth();

  // Mode: "daily" | "monthly" | "all"
  const [filterMode, setFilterMode] = useState("all");

  // Daily filter state
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });

  // Monthly filter state
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());

  // Search & Secondary filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState("ALL");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState("ALL");
  const [filterCreditType, setFilterCreditType] = useState("all");

  // Pagination & Rows per page (Requirement 7)
  const [limit, setLimit] = useState(10);
  const [page, setPage] = useState(1);

  // Data & Loading state
  const [historyData, setHistoryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState("");
  const [activeTab, setActiveTab] = useState("history"); // "history" | "monthly_breakdown"

  // Bill Receipt Modal
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  // Quick Repay Modal
  const [showRepayModal, setShowRepayModal] = useState(false);
  const [repayAmount, setRepayAmount] = useState("");
  const [repayMethod, setRepayMethod] = useState("CASH");
  const [repayRef, setRepayRef] = useState("");
  const [repayLoading, setRepayLoading] = useState(false);

  // Load customer history data from backend API
  async function fetchCustomerHistory(targetPage = page, targetLimit = limit) {
    if (!customerId) return;
    setLoading(true);
    setActionMsg("");
    try {
      const token = await getValidAdminToken();
      const queryParams = {
        mode: filterMode,
        date: filterMode === "daily" ? selectedDate : undefined,
        month: filterMode === "monthly" ? selectedMonth : undefined,
        year: filterMode === "monthly" ? selectedYear : undefined,
        search: searchQuery.trim() || undefined,
        payment_method: filterPaymentMethod !== "ALL" ? filterPaymentMethod : undefined,
        payment_status: filterPaymentStatus !== "ALL" ? filterPaymentStatus : undefined,
        credit_filter: filterCreditType !== "all" ? filterCreditType : undefined,
        page: targetPage,
        limit: targetLimit,
      };

      const res = await getCustomerHistory(customerId, queryParams, token);
      setHistoryData(res);
    } catch (err) {
      console.error("Failed to load customer history:", err);
      setActionMsg(`Failed to load customer profile: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  // Trigger fetch whenever filters, date/month, or pagination change
  useEffect(() => {
    fetchCustomerHistory(page, limit);
  }, [
    customerId,
    filterMode,
    selectedDate,
    selectedMonth,
    selectedYear,
    filterPaymentMethod,
    filterPaymentStatus,
    filterCreditType,
    limit,
    page,
  ]);

  // Handle Search input with debounced or enter key
  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    fetchCustomerHistory(1, limit);
  }

  // Reset pagination when filter criteria change (Requirement 7)
  function handleFilterModeChange(newMode) {
    setFilterMode(newMode);
    setPage(1);
  }

  // Date controls
  function handlePrevDay() {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    setSelectedDate(`${y}-${m}-${day}`);
    setPage(1);
  }

  function handleNextDay() {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    setSelectedDate(`${y}-${m}-${day}`);
    setPage(1);
  }

  function handleToday() {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    setSelectedDate(`${y}-${m}-${d}`);
    setPage(1);
  }

  // Month controls
  function handlePrevMonth() {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((prev) => prev - 1);
    } else {
      setSelectedMonth((prev) => prev - 1);
    }
    setPage(1);
  }

  function handleNextMonth() {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((prev) => prev + 1);
    } else {
      setSelectedMonth((prev) => prev + 1);
    }
    setPage(1);
  }

  // Toggle Rule 61 credit status directly from profile
  async function handleToggleCredit() {
    if (!historyData?.customer) return;
    const c = historyData.customer;
    try {
      const token = await getValidAdminToken();
      const newStatus = !c.is_credit_eligible;
      const newLimit = newStatus ? (Number(c.credit_limit) > 0 ? c.credit_limit : 500) : 0;

      await updateCustomerCreditStatus(
        c.id,
        { is_credit_eligible: newStatus, credit_limit: newLimit },
        token
      );
      setActionMsg(
        `Rule 61 Applied: Credit for ${c.name} is now ${newStatus ? `ENABLED (Limit: ₹${newLimit})` : "REVOKED"
        }`
      );
      await fetchCustomerHistory(page, limit);
    } catch (err) {
      setActionMsg(`Credit toggle failed: ${err.message}`);
    }
  }

  // Record Debt Repayment
  async function handleRecordRepay(e) {
    e.preventDefault();
    const amt = parseFloat(repayAmount);
    if (!amt || amt <= 0) {
      alert("Please enter a valid repayment amount.");
      return;
    }
    setRepayLoading(true);
    try {
      const token = await getValidAdminToken();
      await recordCreditRepayment(
        {
          customer_id: Number(customerId),
          amount: amt,
          payment_method: repayMethod,
          transaction_reference: repayRef.trim() || undefined,
          description: `Customer Counter Debt Repayment via ${repayMethod}`,
        },
        token
      );
      setActionMsg(`Recorded ₹${amt.toFixed(2)} repayment against credit balance successfully!`);
      setShowRepayModal(false);
      setRepayAmount("");
      setRepayRef("");
      await fetchCustomerHistory(page, limit);
    } catch (err) {
      alert(`Repayment error: ${err.message}`);
    } finally {
      setRepayLoading(false);
    }
  }

  // View Bill Receipt Modal
  async function handleViewReceipt(orderId) {
    if (!orderId) return;
    setReceiptLoading(true);
    try {
      const res = await getBillReceipt(orderId);
      setActiveReceipt(res);
    } catch (err) {
      alert(`Failed to load bill receipt: ${err.message}`);
    } finally {
      setReceiptLoading(false);
    }
  }

  const customer = historyData?.customer;
  const summary = historyData?.summary;
  const pagination = historyData?.pagination;
  const transactions = historyData?.transactions || [];
  const dailyGroups = historyData?.daily_groups || [];

  // Month names for selector
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Top Navigation & Profile Header */}
      <div
        className="card"
        style={{
          padding: "20px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          background: "linear-gradient(to right, #ffffff, #f8fafc)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button
            onClick={() => router.push("/admin/customers")}
            className="btn-secondary"
            style={{
              padding: "8px 14px",
              fontSize: "0.88rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer",
            }}
          >
            ← Back to Customer Records
          </button>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <h1 style={{ fontSize: "1.35rem", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
                {customer?.name || "Customer Profile"}
              </h1>
              <span
                style={{
                  fontSize: "0.78rem",
                  fontWeight: "700",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  background: "#e2e8f0",
                  color: "#334155",
                }}
              >
                ID #{customer?.id}
              </span>
              <span
                style={{
                  fontSize: "0.78rem",
                  fontWeight: "600",
                  padding: "3px 10px",
                  borderRadius: "12px",
                  background: customer?.is_credit_eligible
                    ? "rgba(22, 163, 74, 0.12)"
                    : "rgba(100, 116, 139, 0.12)",
                  color: customer?.is_credit_eligible
                    ? "var(--status-success)"
                    : "var(--text-muted)",
                }}
              >
                {customer?.is_credit_eligible ? "✓ Rule 61 Credit Approved" : "✗ Prepaid Only"}
              </span>
            </div>
            <div style={{ display: "flex", gap: "16px", marginTop: "6px", fontSize: "0.85rem", color: "var(--text-muted)", flexWrap: "wrap" }}>
              <span>📞 Mobile: <strong style={{ color: "var(--text-main)", fontFamily: "monospace" }}>{customer?.phone}</strong></span>
              {customer?.email && <span>✉️ Email: <strong style={{ color: "var(--text-main)" }}>{customer?.email}</strong></span>}
              {customer?.created_at && (
                <span>📅 Member Since: <strong>{new Date(customer.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</strong></span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          {customer?.is_credit_eligible && Number(customer?.current_balance) > 0 && (
            <button
              onClick={() => setShowRepayModal(true)}
              className="btn-primary"
              style={{
                fontSize: "0.85rem",
                padding: "8px 16px",
                background: "#059669",
                borderColor: "#059669",
              }}
            >
              💵 Record Debt Repayment
            </button>
          )}

          <button
            onClick={handleToggleCredit}
            style={{
              background: customer?.is_credit_eligible ? "rgba(220, 38, 38, 0.1)" : "rgba(22, 163, 74, 0.1)",
              color: customer?.is_credit_eligible ? "var(--status-err)" : "var(--status-success)",
              border: `1px solid ${customer?.is_credit_eligible ? "rgba(220, 38, 38, 0.25)" : "rgba(22, 163, 74, 0.25)"}`,
              borderRadius: "6px",
              padding: "8px 14px",
              fontSize: "0.85rem",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            {customer?.is_credit_eligible ? "Revoke Credit" : "Approve Credit"}
          </button>

          <button
            onClick={() => fetchCustomerHistory(page, limit)}
            disabled={loading}
            className="btn-secondary"
            style={{ fontSize: "0.85rem", padding: "8px 14px" }}
          >
            {loading ? "Refreshing..." : "↻ Refresh"}
          </button>
        </div>
      </div>

      {actionMsg && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            background: actionMsg.startsWith("Failed") || actionMsg.startsWith("Error") ? "#FEF2F2" : "#F0FDF4",
            border: `1px solid ${actionMsg.startsWith("Failed") || actionMsg.startsWith("Error") ? "#FECACA" : "#BBF7D0"}`,
            color: actionMsg.startsWith("Failed") || actionMsg.startsWith("Error") ? "var(--status-err)" : "var(--status-success)",
            fontSize: "0.88rem",
            fontWeight: "500",
          }}
        >
          {actionMsg}
        </div>
      )}

      {/* 2. Key Financial Summary Cards (Section 2 & 4) */}
      <div className="sticky-kpi-container">
        <div className="kpi-grid">
          {/* Total Amount Purchased */}
          <div className="card kpi-card">
            <div className="kpi-card-title">Total Purchased</div>
            <div className="kpi-card-value">₹{Number(summary?.total_purchased ?? customer?.total_spent ?? 0).toFixed(2)}</div>
            <div className="kpi-card-sub">{summary?.total_orders_count ?? 0} orders ({filterMode === "all" ? "Lifetime" : "Filtered period"})</div>
          </div>

          {/* Total Amount Paid */}
          <div className="card kpi-card">
            <div className="kpi-card-title">Total Amount Paid</div>
            <div className="kpi-card-value" style={{ color: "#059669" }}>₹{Number(summary?.total_paid_total ?? 0).toFixed(2)}</div>
            <div className="kpi-card-sub">Immediate: ₹{Number(summary?.total_paid_immediate ?? 0).toFixed(2)} | Repaid: ₹{Number(summary?.total_credit_repaid ?? 0).toFixed(2)}</div>
          </div>

          {/* Current Outstanding Balance */}
          <div className="card kpi-card" style={{ borderLeft: `4px solid ${Number(customer?.current_balance) > 0 ? "var(--status-err)" : "var(--status-success)"}` }}>
            <div className="kpi-card-title">Current Outstanding Balance</div>
            <div className="kpi-card-value" style={{ color: Number(customer?.current_balance) > 0 ? "var(--status-err)" : "var(--status-success)" }}>
              ₹{Number(customer?.current_balance ?? 0).toFixed(2)}
            </div>
            <div className="kpi-card-sub">Limit: ₹{Number(customer?.credit_limit ?? 0).toFixed(2)} | Avail: ₹{Number(customer?.available_credit ?? 0).toFixed(2)}</div>
          </div>

          {/* Period Opening & Closing Balances */}
          <div className="card kpi-card">
            <div className="kpi-card-title">Period Credit Ledger</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
              <div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Opening</div>
                <div style={{ fontSize: "1rem", fontWeight: "700", color: "#475569" }}>
                  ₹{Number(summary?.opening_credit_balance ?? 0).toFixed(2)}
                </div>
              </div>
              <div style={{ fontSize: "0.9rem", color: "#94a3b8" }}>➔</div>
              <div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Closing</div>
                <div
                  style={{
                    fontSize: "1rem",
                    fontWeight: "700",
                    color: Number(summary?.closing_credit_balance) > 0 ? "var(--status-err)" : "var(--status-success)",
                  }}
                >
                  ₹{Number(summary?.closing_credit_balance ?? 0).toFixed(2)}
                </div>
              </div>
            </div>
            <div className="kpi-card-sub">Added: +₹{Number(summary?.total_credit_added ?? 0).toFixed(2)} | Repaid: -₹{Number(summary?.total_credit_repaid ?? 0).toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Credit Formula Banner (Requirement 4) */}
      <div
        style={{
          background: "linear-gradient(135deg, #f0fdf4 0%, #f8fafc 100%)",
          border: "1px solid #bbf7d0",
          borderRadius: "10px",
          padding: "14px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          fontSize: "0.85rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontWeight: "700", color: "#166534" }}>💡 Ledger Reconciliation Rule:</span>
          <span style={{ color: "#334155" }}>
            <strong>Opening Credit (₹{Number(summary?.opening_credit_balance ?? 0).toFixed(2)})</strong> +{" "}
            <strong>New Credit Added (+₹{Number(summary?.total_credit_added ?? 0).toFixed(2)})</strong> −{" "}
            <strong>Repayments Received (−₹{Number(summary?.total_credit_repaid ?? 0).toFixed(2)})</strong> ={" "}
            <strong style={{ color: Number(summary?.closing_credit_balance) > 0 ? "var(--status-err)" : "#166534" }}>
              Period Closing Balance (₹{Number(summary?.closing_credit_balance ?? 0).toFixed(2)})
            </strong>
          </span>
        </div>
        <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
          Rule 61 Verified • Real-Time Database Tracking
        </div>
      </div>

      {/* Filtering Modes & Controls (Requirement 5 & 6) */}
      <div className="card" style={{ padding: "18px 20px" }}>
        {/* Mode Switcher Tabs */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            borderBottom: "1px solid var(--border-subtle)",
            paddingBottom: "14px",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => handleFilterModeChange("all")}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                fontSize: "0.85rem",
                fontWeight: "600",
                cursor: "pointer",
                background: filterMode === "all" ? "var(--brand-primary, #0284c7)" : "#f1f5f9",
                color: filterMode === "all" ? "#ffffff" : "#475569",
                border: "none",
              }}
            >
              ♾️ All Time History
            </button>
            <button
              onClick={() => handleFilterModeChange("daily")}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                fontSize: "0.85rem",
                fontWeight: "600",
                cursor: "pointer",
                background: filterMode === "daily" ? "var(--brand-primary, #0284c7)" : "#f1f5f9",
                color: filterMode === "daily" ? "#ffffff" : "#475569",
                border: "none",
              }}
            >
              📅 Daily Filter
            </button>
            <button
              onClick={() => handleFilterModeChange("monthly")}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                fontSize: "0.85rem",
                fontWeight: "600",
                cursor: "pointer",
                background: filterMode === "monthly" ? "var(--brand-primary, #0284c7)" : "#f1f5f9",
                color: filterMode === "monthly" ? "#ffffff" : "#475569",
                border: "none",
              }}
            >
              🗓️ Month-Wise Filter
            </button>
          </div>

          {filterMode === "monthly" && (
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => setActiveTab("history")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "0.8rem",
                  fontWeight: "600",
                  cursor: "pointer",
                  background: activeTab === "history" ? "#0f172a" : "#f1f5f9",
                  color: activeTab === "history" ? "#ffffff" : "#475569",
                  border: "none",
                }}
              >
                Itemized Transactions
              </button>
              <button
                onClick={() => setActiveTab("monthly_breakdown")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "0.8rem",
                  fontWeight: "600",
                  cursor: "pointer",
                  background: activeTab === "monthly_breakdown" ? "#0f172a" : "#f1f5f9",
                  color: activeTab === "monthly_breakdown" ? "#ffffff" : "#475569",
                  border: "none",
                }}
              >
                Day-by-Day Subtotals Table ({dailyGroups.length})
              </button>
            </div>
          )}
        </div>

        {/* Daily Date Controls (Requirement 5) */}
        {filterMode === "daily" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
              background: "#f8fafc",
              padding: "12px 16px",
              borderRadius: "8px",
              marginBottom: "16px",
            }}
          >
            <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "#334155" }}>
              Select Day:
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setPage(1);
              }}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "0.88rem",
              }}
            />
            <button onClick={handlePrevDay} className="btn-secondary" style={{ padding: "6px 12px", fontSize: "0.82rem" }}>
              ◀ Previous Day
            </button>
            <button onClick={handleToday} className="btn-secondary" style={{ padding: "6px 12px", fontSize: "0.82rem" }}>
              Today
            </button>
            <button onClick={handleNextDay} className="btn-secondary" style={{ padding: "6px 12px", fontSize: "0.82rem" }}>
              Next Day ▶
            </button>
            <span style={{ marginLeft: "auto", fontSize: "0.85rem", color: "#475569" }}>
              Showing activity for:{" "}
              <strong>
                {new Date(selectedDate).toLocaleDateString("en-IN", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </strong>
            </span>
          </div>
        )}

        {/* Monthly Controls (Requirement 6) */}
        {filterMode === "monthly" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
              background: "#f8fafc",
              padding: "12px 16px",
              borderRadius: "8px",
              marginBottom: "16px",
            }}
          >
            <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "#334155" }}>
              Select Month & Year:
            </span>
            <select
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(Number(e.target.value));
                setPage(1);
              }}
              style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
            >
              {monthNames.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(Number(e.target.value));
                setPage(1);
              }}
              style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
            >
              {[2024, 2025, 2026, 2027].map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
            <button onClick={handlePrevMonth} className="btn-secondary" style={{ padding: "6px 12px", fontSize: "0.82rem" }}>
              ◀ Prev Month
            </button>
            <button onClick={handleNextMonth} className="btn-secondary" style={{ padding: "6px 12px", fontSize: "0.82rem" }}>
              Next Month ▶
            </button>
            <span style={{ marginLeft: "auto", fontSize: "0.85rem", color: "#475569" }}>
              Monthly Statement for: <strong>{monthNames[selectedMonth - 1]} {selectedYear}</strong>
            </span>
          </div>
        )}

        {/* Search, Filter Toolbar, and Rows Per Page Dropdown (Requirement 7 & 8) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          {/* Left search & filter controls */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", flex: 1 }}>
            <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "6px", minWidth: "240px", flex: 1 }}>
              <input
                type="text"
                placeholder="Search product name, bill number, token..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: "100%", padding: "7px 12px", fontSize: "0.85rem" }}
              />
              <button type="submit" className="btn-secondary" style={{ padding: "7px 14px", fontSize: "0.85rem" }}>
                Search
              </button>
            </form>

            <select
              value={filterPaymentMethod}
              onChange={(e) => {
                setFilterPaymentMethod(e.target.value);
                setPage(1);
              }}
              style={{ padding: "7px 10px", fontSize: "0.83rem", minWidth: "130px" }}
            >
              <option value="ALL">All Methods</option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
              <option value="CREDIT">Khata Credit</option>
            </select>

            <select
              value={filterPaymentStatus}
              onChange={(e) => {
                setFilterPaymentStatus(e.target.value);
                setPage(1);
              }}
              style={{ padding: "7px 10px", fontSize: "0.83rem", minWidth: "120px" }}
            >
              <option value="ALL">All Status</option>
              <option value="PAID">Paid Only</option>
              <option value="PENDING">Pending Only</option>
            </select>

            <select
              value={filterCreditType}
              onChange={(e) => {
                setFilterCreditType(e.target.value);
                setPage(1);
              }}
              style={{ padding: "7px 10px", fontSize: "0.83rem", minWidth: "150px" }}
            >
              <option value="all">All Transactions</option>
              <option value="credit_only">Credit Events Only</option>
              <option value="paid_only">Immediate Paid Orders</option>
              <option value="full_credit_only">Full Credit Orders</option>
            </select>
          </div>

          {/* Right-Aligned Rows Per Page Dropdown (Requirement 7) */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
              Rows per page:
            </label>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              style={{
                padding: "6px 10px",
                borderRadius: "6px",
                border: "1px solid var(--border-subtle)",
                fontSize: "0.85rem",
                fontWeight: "600",
                background: "#ffffff",
                cursor: "pointer",
              }}
            >
              <option value={10}>10 rows</option>
              <option value={25}>25 rows</option>
              <option value={50}>50 rows</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === "monthly_breakdown" && filterMode === "monthly" ? (
        /* Monthly Day-by-Day Subtotals Table (Requirement 6) */
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: "600", color: "var(--text-main)" }}>
              📅 Daily Activity Subtotals for {monthNames[selectedMonth - 1]} {selectedYear}
            </h3>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {dailyGroups.length} Active Days Recorded
            </span>
          </div>

          <div className="table-container">
            <table className="w-full text-left border-collapse sticky-table-header">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Orders Count</th>
                  <th>Total Purchases</th>
                  <th>Immediate Paid</th>
                  <th>Credit Added</th>
                  <th>Credit Repaid</th>
                  <th style={{ textAlign: "right" }}>Closing Balance</th>
                </tr>
              </thead>
              <tbody>
                {dailyGroups.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                      No activity recorded for this customer in {monthNames[selectedMonth - 1]} {selectedYear}.
                    </td>
                  </tr>
                ) : (
                  dailyGroups.map((g) => (
                    <tr key={g.date}>
                      <td style={{ fontWeight: "600" }}>
                        {new Date(g.date).toLocaleDateString("en-IN", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td>{g.orders_count} orders</td>
                      <td style={{ fontWeight: "600" }}>₹{Number(g.purchases).toFixed(2)}</td>
                      <td style={{ color: "#059669", fontWeight: "600" }}>₹{Number(g.immediate_paid).toFixed(2)}</td>
                      <td style={{ color: "var(--status-err)", fontWeight: "600" }}>
                        {Number(g.credit_added) > 0 ? `+₹${Number(g.credit_added).toFixed(2)}` : "—"}
                      </td>
                      <td style={{ color: "#059669", fontWeight: "600" }}>
                        {Number(g.credit_repaid) > 0 ? `-₹${Number(g.credit_repaid).toFixed(2)}` : "—"}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: "700", color: Number(g.closing_balance) > 0 ? "var(--status-err)" : "var(--status-success)" }}>
                        ₹{Number(g.closing_balance).toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Detailed Day-by-Day Purchase History & Credit Ledger Table (Requirements 3, 4, 7) */
        <div className="card" style={{ overflow: "hidden" }}>
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <div>
              <h3 style={{ fontSize: "1rem", fontWeight: "600", color: "var(--text-main)" }}>
                🧾 Customer Purchase History & Credit Ledger
              </h3>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Showing newest orders first • Multi-product line item grouping
              </span>
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              {pagination && pagination.total_records > 0 ? (
                <span>
                  Showing <strong>{(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total_records)}</strong> of <strong>{pagination.total_records}</strong> transactions
                </span>
              ) : (
                "0 transactions found"
              )}
            </div>
          </div>

          <div className="table-container">
            <table className="w-full text-left border-collapse sticky-table-header">
              <thead>
                <tr>
                  <th>Order Date & Time</th>
                  <th>Bill / Token #</th>
                  <th>Products Purchased</th>
                  <th>Bill Total</th>
                  <th>Amount Paid</th>
                  <th>Credit Added</th>
                  <th>Payment Method</th>
                  <th>Status</th>
                  <th>Credit Ledger Running Calculation</th>
                  <th style={{ textAlign: "right" }}>Bill Receipt</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center", padding: "50px", color: "var(--text-muted)" }}>
                      Loading customer transactions...
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center", padding: "50px", color: "var(--text-muted)" }}>
                      {filterMode === "daily"
                        ? `No transactions recorded for ${customer?.name} on ${selectedDate}.`
                        : filterMode === "monthly"
                          ? `No transactions recorded for ${customer?.name} in ${monthNames[selectedMonth - 1]} ${selectedYear}.`
                          : `No transactions found matching current filters for ${customer?.name}.`}
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr
                      key={tx.id}
                      style={{
                        background: tx.type === "REPAYMENT" ? "rgba(5, 150, 105, 0.03)" : "transparent",
                      }}
                    >
                      {/* 1. Date & Time */}
                      <td style={{ whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: "600", color: "var(--text-main)" }}>
                          {new Date(tx.date).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontFamily: "monospace" }}>
                          {tx.time}
                        </div>
                      </td>

                      {/* 2. Bill Number / Order ID */}
                      <td style={{ whiteSpace: "nowrap" }}>
                        {tx.type === "ORDER" ? (
                          <div>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 7px",
                                borderRadius: "4px",
                                background: "#fef3c7",
                                color: "#92400e",
                                fontWeight: "700",
                                fontSize: "0.75rem",
                              }}
                            >
                              Token #{tx.daily_token_number}
                            </span>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace", marginTop: "2px" }}>
                              {tx.order_number}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 7px",
                                borderRadius: "4px",
                                background: "#d1fae5",
                                color: "#065f46",
                                fontWeight: "700",
                                fontSize: "0.75rem",
                              }}
                            >
                              💵 Debt Repayment
                            </span>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                              {tx.description}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 3. Products Name & Line Items (Requirement 3) */}
                      <td style={{ maxWidth: "260px" }}>
                        {tx.type === "ORDER" && tx.items?.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            {tx.items.map((it, idx) => (
                              <div
                                key={idx}
                                style={{
                                  fontSize: "0.82rem",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: "8px",
                                  borderBottom: idx < tx.items.length - 1 ? "1px dashed #f1f5f9" : "none",
                                  paddingBottom: "2px",
                                }}
                              >
                                <span>
                                  <strong style={{ color: "var(--text-main)" }}>{it.name}</strong> × {it.quantity}
                                  {it.customizations && (
                                    <span style={{ fontSize: "0.72rem", color: "#64748b", display: "block" }}>
                                      {it.customizations}
                                    </span>
                                  )}
                                </span>
                                <span style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>
                                  ₹{Number(it.total_price).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: "0.85rem", color: "#065f46", fontWeight: "600" }}>
                            {tx.product_summary}
                          </div>
                        )}
                      </td>

                      {/* 4. Total Bill Amount */}
                      <td style={{ fontWeight: "700" }}>
                        {tx.type === "ORDER" ? `₹${Number(tx.total_bill_amount).toFixed(2)}` : "—"}
                      </td>

                      {/* 5. Amount Paid */}
                      <td style={{ color: "#059669", fontWeight: "600" }}>
                        ₹{Number(tx.amount_paid).toFixed(2)}
                      </td>

                      {/* 6. Amount Added to Credit */}
                      <td style={{ color: Number(tx.credit_added) > 0 ? "var(--status-err)" : "var(--text-muted)", fontWeight: "600" }}>
                        {Number(tx.credit_added) > 0 ? `+₹${Number(tx.credit_added).toFixed(2)}` : "—"}
                      </td>

                      {/* 7. Payment Method */}
                      <td>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: "600",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            background:
                              tx.payment_method === "CREDIT"
                                ? "#fee2e2"
                                : tx.payment_method === "UPI"
                                  ? "#e0e7ff"
                                  : tx.payment_method === "CASH"
                                    ? "#f0fdf4"
                                    : "#f1f5f9",
                            color:
                              tx.payment_method === "CREDIT"
                                ? "#991b1b"
                                : tx.payment_method === "UPI"
                                  ? "#3730a3"
                                  : tx.payment_method === "CASH"
                                    ? "#166534"
                                    : "#334155",
                          }}
                        >
                          {tx.payment_method}
                        </span>
                      </td>

                      {/* 8. Status */}
                      <td>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: "600",
                            padding: "2px 8px",
                            borderRadius: "12px",
                            background: tx.payment_status === "PAID" ? "rgba(22, 163, 74, 0.12)" : "rgba(234, 88, 12, 0.12)",
                            color: tx.payment_status === "PAID" ? "var(--status-success)" : "#c2410c",
                          }}
                        >
                          {tx.payment_status}
                        </span>
                      </td>

                      {/* 9. Outstanding Credit Calculation (Requirement 4) */}
                      <td>
                        <div style={{ fontSize: "0.78rem", background: "#f8fafc", padding: "6px 10px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                          <div>
                            Prev: <strong>₹{Number(tx.previous_outstanding_credit).toFixed(2)}</strong>
                          </div>
                          {Number(tx.credit_added) > 0 && (
                            <div style={{ color: "var(--status-err)", fontWeight: "600" }}>
                              + Credit: ₹{Number(tx.credit_added).toFixed(2)}
                            </div>
                          )}
                          {Number(tx.credit_repaid) > 0 && (
                            <div style={{ color: "#059669", fontWeight: "600" }}>
                              − Repayment: ₹{Number(tx.credit_repaid).toFixed(2)}
                            </div>
                          )}
                          <div style={{ marginTop: "2px", borderTop: "1px solid #cbd5e1", paddingTop: "2px" }}>
                            Balance:{" "}
                            <strong
                              style={{
                                color: Number(tx.closing_outstanding_credit) > 0 ? "var(--status-err)" : "var(--status-success)",
                              }}
                            >
                              ₹{Number(tx.closing_outstanding_credit).toFixed(2)}
                            </strong>
                          </div>
                        </div>
                      </td>

                      {/* 10. Bill Receipt Details (Requirement 3 Column 14) */}
                      <td style={{ textAlign: "right" }}>
                        {tx.type === "ORDER" && tx.order_id && (
                          <button
                            onClick={() => handleViewReceipt(tx.order_id)}
                            className="btn-secondary"
                            style={{
                              padding: "5px 10px",
                              fontSize: "0.75rem",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                            title="View formatted thermal receipt"
                          >
                            Receipt 🧾
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer Controls (Requirement 7) */}
          {pagination && pagination.total_pages > 1 && (
            <div
              style={{
                padding: "14px 20px",
                borderTop: "1px solid var(--border-subtle)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Page <strong>{pagination.page}</strong> of <strong>{pagination.total_pages}</strong>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1}
                  className="btn-secondary"
                  style={{ padding: "6px 12px", fontSize: "0.82rem" }}
                >
                  ◀ Previous
                </button>
                {Array.from({ length: pagination.total_pages }, (_, i) => i + 1)
                  .filter((pNum) => Math.abs(pNum - pagination.page) <= 2 || pNum === 1 || pNum === pagination.total_pages)
                  .map((pNum) => (
                    <button
                      key={pNum}
                      onClick={() => setPage(pNum)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "6px",
                        fontSize: "0.82rem",
                        fontWeight: "600",
                        cursor: "pointer",
                        background: pNum === pagination.page ? "var(--brand-primary, #0284c7)" : "#ffffff",
                        color: pNum === pagination.page ? "#ffffff" : "#334155",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      {pNum}
                    </button>
                  ))}
                <button
                  onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                  disabled={pagination.page >= pagination.total_pages}
                  className="btn-secondary"
                  style={{ padding: "6px 12px", fontSize: "0.82rem" }}
                >
                  Next ▶
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Debt Repayment Modal */}
      {showRepayModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: "20px",
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "440px",
              width: "100%",
              padding: "24px",
              boxShadow: "var(--shadow-modal)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "1.15rem", fontWeight: "700", color: "var(--text-main)" }}>
                💵 Record Debt Repayment
              </h3>
              <button
                onClick={() => setShowRepayModal(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.2rem", color: "var(--text-muted)" }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", marginBottom: "16px", fontSize: "0.85rem" }}>
              <div>Customer: <strong>{customer?.name}</strong></div>
              <div>Current Debt: <strong style={{ color: "var(--status-err)" }}>₹{Number(customer?.current_balance ?? 0).toFixed(2)}</strong></div>
            </div>

            <form onSubmit={handleRecordRepay} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  Repayment Amount (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={customer?.current_balance}
                  placeholder={`Max ₹${Number(customer?.current_balance ?? 0).toFixed(2)}`}
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                  required
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  Payment Method *
                </label>
                <select
                  value={repayMethod}
                  onChange={(e) => setRepayMethod(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI Transfer / QR</option>
                  <option value="CARD">Card</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  Reference / UTR (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. UPI Ref #123456"
                  value={repayRef}
                  onChange={(e) => setRepayRef(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button type="button" onClick={() => setShowRepayModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={repayLoading} className="btn-primary" style={{ background: "#059669", borderColor: "#059669" }}>
                  {repayLoading ? "Processing..." : "Confirm Repayment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bill Receipt Modal (Requirement 3 Column 14) */}
      {activeReceipt && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 70,
            padding: "20px",
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "420px",
              width: "100%",
              padding: "24px",
              boxShadow: "var(--shadow-modal)",
              fontFamily: "monospace",
              background: "#ffffff",
            }}
          >
            <div style={{ textAlign: "center", borderBottom: "1px dashed #cbd5e1", paddingBottom: "12px", marginBottom: "12px" }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: "700", margin: 0 }}>☕ ChaiFlow POS</h3>
              <div style={{ fontSize: "0.8rem", color: "#64748b" }}>Order Receipt</div>
              <div style={{ fontSize: "1rem", fontWeight: "700", marginTop: "4px" }}>
                TOKEN #{activeReceipt.daily_token_number}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{activeReceipt.order_number}</div>
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                {new Date(activeReceipt.created_at).toLocaleString("en-IN")}
              </div>
            </div>

            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: "600", marginBottom: "6px" }}>Items:</div>
              {activeReceipt.items?.map((item, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "4px" }}>
                  <div>
                    <div>{item.name} × {item.quantity}</div>
                    {item.customizations && <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{item.customizations}</div>}
                  </div>
                  <div style={{ fontWeight: "600" }}>₹{Number(item.total_price).toFixed(2)}</div>
                </div>
              ))}
            </div>

            <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "8px", marginBottom: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", fontWeight: "700" }}>
                <span>Total Bill Amount:</span>
                <span>₹{Number(activeReceipt.total_amount).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginTop: "4px" }}>
                <span>Payment Mode:</span>
                <span>{activeReceipt.payment_method}</span>
              </div>
              {activeReceipt.payment_reference && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#64748b" }}>
                  <span>Ref:</span>
                  <span>{activeReceipt.payment_reference}</span>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
              <button
                onClick={() => printThermalBill(activeReceipt)}
                className="btn-primary"
                style={{ flex: 1, padding: "8px", fontSize: "0.85rem" }}
              >
                🖨️ Print Thermal Bill (80mm)
              </button>
              <button
                onClick={() => setActiveReceipt(null)}
                className="btn-secondary"
                style={{ flex: 1, padding: "8px", fontSize: "0.85rem" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomerProfilePage() {
  return (
    <React.Suspense
      fallback={
        <div
          style={{
            padding: "40px",
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          Loading customer profile & transaction history...
        </div>
      }
    >
      <CustomerProfileContent />
    </React.Suspense>
  );
}

