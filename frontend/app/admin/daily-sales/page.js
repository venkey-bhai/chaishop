"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../../context/AuthContext";
import { getDailySalesReport, getBillReceipt } from "../../../services/api";

export default function DailySalesReportPage() {
  const { getValidAdminToken } = useAuth();

  // Selected date state (defaults to today in local YYYY-MM-DD format)
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });

  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("bills"); // "bills" | "payments" | "credit" | "expenses" | "reconciliation"

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState("ALL");
  const [filterOrderStatus, setFilterOrderStatus] = useState("ALL");
  const [viewMode, setViewMode] = useState("grouped"); // "grouped" | "flat"

  // Expandable bill IDs in grouped mode
  const [expandedBillIds, setExpandedBillIds] = useState(new Set());

  // Receipt Modal State
  const [activeReceipt, setActiveReceipt] = useState(null);

  // Load report data
  async function fetchReport(dateToFetch = selectedDate) {
    setLoading(true);
    setError("");
    try {
      const token = await getValidAdminToken();
      const res = await getDailySalesReport(dateToFetch, token);
      setReportData(res);
      // Automatically expand first few bills for visual clarity
      if (res?.orders?.length > 0) {
        setExpandedBillIds(new Set(res.orders.slice(0, 5).map((o) => o.order_id)));
      }
    } catch (err) {
      console.error("Failed to load daily report:", err);
      setError(`Failed to load daily report: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchReport(selectedDate);
  }, [selectedDate]);

  // Date Navigation handlers
  function handlePrevDay() {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 1);
    const prevStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    setSelectedDate(prevStr);
  }

  function handleNextDay() {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + 1);
    const nextStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    setSelectedDate(nextStr);
  }

  function handleSetToday() {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setSelectedDate(todayStr);
  }

  function toggleBillExpand(orderId) {
    setExpandedBillIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  async function handleOpenReceipt(orderId) {
    try {
      const res = await getBillReceipt(orderId);
      setActiveReceipt(res);
    } catch (err) {
      alert(`Could not load receipt: ${err.message}`);
    }
  }

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    if (!reportData?.orders) return [];
    return reportData.orders.filter((ord) => {
      // Payment method filter
      if (filterPaymentMethod !== "ALL" && ord.payment_method !== filterPaymentMethod) {
        return false;
      }
      // Order status filter
      if (filterOrderStatus !== "ALL" && ord.order_status !== filterOrderStatus) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCust = (ord.customer_name || "").toLowerCase().includes(q);
        const matchPhone = (ord.customer_phone || "").includes(q);
        const matchOrderNo = (ord.order_number || "").toLowerCase().includes(q);
        const matchToken = String(ord.daily_token_number || "").includes(q);
        const matchItems = ord.items?.some((it) => it.item_name.toLowerCase().includes(q));
        if (!matchCust && !matchPhone && !matchOrderNo && !matchToken && !matchItems) {
          return false;
        }
      }
      return true;
    });
  }, [reportData, filterPaymentMethod, filterOrderStatus, searchQuery]);

  // Filtered Payments
  const filteredPayments = useMemo(() => {
    if (!reportData?.payments) return [];
    return reportData.payments.filter((p) => {
      if (filterPaymentMethod !== "ALL" && p.payment_method !== filterPaymentMethod) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCust = (p.customer_name || "").toLowerCase().includes(q);
        const matchPhone = (p.customer_phone || "").includes(q);
        const matchOrder = (p.order_number || "").toLowerCase().includes(q);
        const matchRef = (p.transaction_reference || "").toLowerCase().includes(q);
        if (!matchCust && !matchPhone && !matchOrder && !matchRef) {
          return false;
        }
      }
      return true;
    });
  }, [reportData, filterPaymentMethod, searchQuery]);

  // Filtered Credit Transactions
  const filteredCredit = useMemo(() => {
    if (!reportData?.credit_transactions) return [];
    return reportData.credit_transactions.filter((ct) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCust = (ct.customer_name || "").toLowerCase().includes(q);
        const matchPhone = (ct.customer_phone || "").includes(q);
        const matchDesc = (ct.description || "").toLowerCase().includes(q);
        if (!matchCust && !matchPhone && !matchDesc) {
          return false;
        }
      }
      return true;
    });
  }, [reportData, searchQuery]);

  // Filtered Expenses
  const filteredExpenses = useMemo(() => {
    if (!reportData?.expenses) return [];
    return reportData.expenses.filter((e) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCat = (e.category || "").toLowerCase().includes(q);
        const matchDesc = (e.description || "").toLowerCase().includes(q);
        if (!matchCat && !matchDesc) return false;
      }
      return true;
    });
  }, [reportData, searchQuery]);

  // Export to CSV Function
  function handleExportCsv() {
    if (!reportData) return;
    const { summary, orders, payments, expenses } = reportData;

    let csvContent = `data:text/csv;charset=utf-8,`;

    // 1. Header Info
    csvContent += `CHAIFLOW TEA SHOP - DAILY AUDIT REPORT\r\n`;
    csvContent += `Report Date: ${selectedDate}\r\n`;
    csvContent += `Exported At: ${new Date().toLocaleString()}\r\n\r\n`;

    // 2. Summary Section
    csvContent += `FINANCIAL SUMMARY\r\n`;
    csvContent += `Metric,Amount (INR)\r\n`;
    csvContent += `Total Eligible Sales,${summary.total_sales}\r\n`;
    csvContent += `Cash Received,${summary.cash_received}\r\n`;
    csvContent += `UPI Received,${summary.upi_received}\r\n`;
    csvContent += `Card Received,${summary.card_received}\r\n`;
    csvContent += `Credit Sales (Uncollected),${summary.credit_sales}\r\n`;
    csvContent += `Credit Debt Payments Collected,${summary.credit_payments_collected}\r\n`;
    csvContent += `Total Expenses Recorded,${summary.total_expenses}\r\n`;
    csvContent += `Total Actual Payments Collected,${summary.total_payments_received}\r\n`;
    csvContent += `Net Cash Flow (Inflow - Outflow),${summary.net_cash_flow}\r\n`;
    csvContent += `Operating Surplus (Sales - Expenses),${summary.operating_surplus}\r\n`;
    csvContent += `Total System Outstanding Credit,${summary.total_outstanding_credit}\r\n\r\n`;

    // 3. Line by Line Bills Section
    csvContent += `DETAILED BILLS & LINE ITEMS\r\n`;
    csvContent += `Bill Number,Token #,Time,Customer Name,Customer Mobile,Product Name,Quantity,Unit Price,Line Total,Bill Total,Amount Paid,Payment Method,Credit Amount,Status\r\n`;
    (orders || []).forEach((ord) => {
      const timeStr = ord.created_at ? new Date(ord.created_at).toLocaleTimeString() : "";
      if (ord.items && ord.items.length > 0) {
        ord.items.forEach((it) => {
          csvContent += `"${ord.order_number}",${ord.daily_token_number},"${timeStr}","${ord.customer_name}","${ord.customer_phone}","${it.item_name}",${it.quantity},${it.unit_price},${it.total_price},${ord.total_amount},${ord.amount_paid},${ord.payment_method},${ord.credit_amount},${ord.order_status}\r\n`;
        });
      } else {
        csvContent += `"${ord.order_number}",${ord.daily_token_number},"${timeStr}","${ord.customer_name}","${ord.customer_phone}","N/A",0,0,0,${ord.total_amount},${ord.amount_paid},${ord.payment_method},${ord.credit_amount},${ord.order_status}\r\n`;
      }
    });

    csvContent += `\r\n`;

    // 4. Expenses Section
    csvContent += `DAILY EXPENSES\r\n`;
    csvContent += `Expense ID,Category,Description,Amount,Payment Method,Recorded By\r\n`;
    (expenses || []).forEach((e) => {
      csvContent += `${e.expense_id},"${e.category}","${e.description}",${e.amount},${e.payment_method},"${e.recorded_by}"\r\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ChaiFlow_Daily_Report_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Print Report Handler
  function handlePrintReport() {
    window.print();
  }

  const summary = reportData?.summary || {
    total_sales: 0,
    cash_received: 0,
    upi_received: 0,
    card_received: 0,
    credit_sales: 0,
    credit_payments_collected: 0,
    total_expenses: 0,
    total_payments_received: 0,
    net_cash_flow: 0,
    operating_surplus: 0,
    total_outstanding_credit: 0,
    total_orders_count: 0,
    completed_orders_count: 0,
    cancelled_orders_count: 0,
  };

  return (
    <div className="daily-sales-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* 1. Header & Date Controller */}
      <div
        className="card no-print"
        style={{
          padding: "20px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          background: "#FFFFFF",
          border: "1px solid var(--border-subtle)",
          borderRadius: "14px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "1.8rem" }}>🧾</span>
            <div>
              <h2 style={{ fontSize: "1.35rem", fontWeight: "800", color: "var(--text-main)", margin: 0 }}>
                Daily Sales & Expenses Report
              </h2>
              <p style={{ color: "var(--text-muted)", fontSize: "0.86rem", marginTop: "3px" }}>
                Audited bill details, cash/UPI collections, credit ledger & daily expenses for <strong>{selectedDate}</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Date Selector & Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", background: "#F8FAFC", border: "1px solid var(--border-subtle)", borderRadius: "10px", padding: "4px" }}>
            <button
              onClick={handlePrevDay}
              title="Previous Day"
              style={{
                background: "transparent",
                border: "none",
                padding: "6px 12px",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "700",
                color: "var(--text-main)",
                fontSize: "0.9rem",
              }}
            >
              ◀ Prev
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                border: "none",
                background: "transparent",
                fontWeight: "700",
                color: "var(--color-primary)",
                padding: "6px 10px",
                fontSize: "0.92rem",
                outline: "none",
                cursor: "pointer",
              }}
            />
            <button
              onClick={handleNextDay}
              title="Next Day"
              style={{
                background: "transparent",
                border: "none",
                padding: "6px 12px",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "700",
                color: "var(--text-main)",
                fontSize: "0.9rem",
              }}
            >
              Next ▶
            </button>
          </div>

          <button
            onClick={handleSetToday}
            className="btn-secondary"
            style={{ fontSize: "0.85rem", padding: "8px 14px" }}
          >
            Today
          </button>

          <button
            onClick={() => fetchReport(selectedDate)}
            disabled={loading}
            className="btn-secondary"
            style={{ fontSize: "0.85rem", padding: "8px 14px" }}
          >
            {loading ? "Refreshing..." : "↻ Refresh"}
          </button>

          <button
            onClick={handleExportCsv}
            disabled={loading || !reportData}
            className="btn-secondary"
            style={{ fontSize: "0.85rem", padding: "8px 14px", color: "var(--color-primary)", borderColor: "var(--border-accent)" }}
          >
            📥 Export CSV
          </button>

          <button
            onClick={handlePrintReport}
            disabled={loading || !reportData}
            className="btn-primary"
            style={{ fontSize: "0.85rem", padding: "8px 16px" }}
          >
            🖨️ Print / PDF
          </button>
        </div>
      </div>

      {/* Print-Only Formal Audit Banner */}
      <div className="print-only" style={{ display: "none", borderBottom: "2px solid #000", paddingBottom: "12px", marginBottom: "20px" }}>
        <h1 style={{ fontSize: "1.6rem", fontWeight: "900", margin: 0 }}>ChaiFlow Tea Shop</h1>
        <p style={{ margin: "2px 0 0", fontSize: "0.9rem", color: "#444" }}>Daily Financial & Operations Audit Statement</p>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "10px", fontSize: "0.85rem" }}>
          <span><strong>Audit Date:</strong> {selectedDate}</span>
          <span><strong>Printed:</strong> {new Date().toLocaleString()}</span>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "14px 18px",
            borderRadius: "10px",
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            color: "var(--status-err)",
            fontSize: "0.88rem",
            fontWeight: "600",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => fetchReport(selectedDate)}
            className="btn-secondary"
            style={{ fontSize: "0.8rem", padding: "5px 12px", background: "#FFFFFF", fontWeight: "600" }}
          >
            ↻ Try Again
          </button>
        </div>
      )}

      {/* 2. Top Executive Summary Cards (Section 2) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
        {/* Card 1: Total Sales */}
        <div
          className="card"
          style={{
            padding: "18px 20px",
            borderLeft: "5px solid #0F766E",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Total Eligible Sales
            </span>
            <span style={{ fontSize: "1.2rem" }}>☕</span>
          </div>
          <div style={{ fontSize: "1.85rem", fontWeight: "900", color: "#0F766E", marginTop: "8px" }}>
            ₹{summary.total_sales.toFixed(2)}
          </div>
          <div style={{ fontSize: "0.76rem", color: "var(--text-dim)", marginTop: "4px" }}>
            {summary.total_orders_count} valid orders ({summary.completed_orders_count} fulfilled)
          </div>
        </div>

        {/* Card 2: Total Collections */}
        <div
          className="card"
          style={{
            padding: "18px 20px",
            borderLeft: "5px solid #16A34A",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Total Payments Received
            </span>
            <span style={{ fontSize: "1.2rem" }}>💰</span>
          </div>
          <div style={{ fontSize: "1.85rem", fontWeight: "900", color: "#16A34A", marginTop: "8px" }}>
            ₹{summary.total_payments_received.toFixed(2)}
          </div>
          <div style={{ fontSize: "0.76rem", color: "var(--text-dim)", marginTop: "4px" }}>
            Cash ₹{summary.cash_received} • UPI ₹{summary.upi_received} • Card ₹{summary.card_received}
          </div>
        </div>

        {/* Card 3: Total Expenses */}
        <div
          className="card"
          style={{
            padding: "18px 20px",
            borderLeft: "5px solid #DC2626",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Total Expenses Paid
            </span>
            <span style={{ fontSize: "1.2rem" }}>📉</span>
          </div>
          <div style={{ fontSize: "1.85rem", fontWeight: "900", color: "#DC2626", marginTop: "8px" }}>
            ₹{summary.total_expenses.toFixed(2)}
          </div>
          <div style={{ fontSize: "0.76rem", color: "var(--text-dim)", marginTop: "4px" }}>
            {reportData?.expenses?.length || 0} recorded outlays
          </div>
        </div>

        {/* Card 4: Net Cash Flow */}
        <div
          className="card"
          style={{
            padding: "18px 20px",
            borderLeft: `5px solid ${summary.net_cash_flow >= 0 ? "#0284C7" : "#E11D48"}`,
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Net Cash Flow
            </span>
            <span style={{ fontSize: "1.2rem" }}>🔄</span>
          </div>
          <div
            style={{
              fontSize: "1.85rem",
              fontWeight: "900",
              color: summary.net_cash_flow >= 0 ? "#0284C7" : "#E11D48",
              marginTop: "8px",
            }}
          >
            {summary.net_cash_flow >= 0 ? "+" : ""}₹{summary.net_cash_flow.toFixed(2)}
          </div>
          <div style={{ fontSize: "0.76rem", color: "var(--text-dim)", marginTop: "4px" }}>
            Payments In (₹{summary.total_payments_received}) - Expenses (₹{summary.total_expenses})
          </div>
        </div>
      </div>

      {/* Secondary Detailed Financial Badges Bar */}
      <div
        className="card"
        style={{
          padding: "14px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          background: "#F8FAFC",
          fontSize: "0.82rem",
        }}
      >
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <span style={{ color: "var(--text-muted)" }}>💵 Cash Collected: </span>
            <strong style={{ color: "var(--text-main)" }}>₹{summary.cash_received.toFixed(2)}</strong>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>📱 UPI Collected: </span>
            <strong style={{ color: "var(--text-main)" }}>₹{summary.upi_received.toFixed(2)}</strong>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>💳 Card Collected: </span>
            <strong style={{ color: "var(--text-main)" }}>₹{summary.card_received.toFixed(2)}</strong>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>📝 Credit Sales (Khata): </span>
            <strong style={{ color: "#D97706" }}>₹{summary.credit_sales.toFixed(2)}</strong>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>📥 Debt Repayments Collected: </span>
            <strong style={{ color: "#16A34A" }}>₹{summary.credit_payments_collected.toFixed(2)}</strong>
          </div>
        </div>

        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <span style={{ color: "var(--text-muted)" }}>📊 Operating Surplus: </span>
            <strong style={{ color: summary.operating_surplus >= 0 ? "#0F766E" : "#DC2626" }}>
              ₹{summary.operating_surplus.toFixed(2)}
            </strong>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>⚠️ Total Outstanding Credit: </span>
            <strong style={{ color: "#B45309" }}>₹{summary.total_outstanding_credit.toFixed(2)}</strong>
          </div>
        </div>
      </div>

      {/* 3. Section Navigation Tabs */}
      <div className="card no-print" style={{ padding: "8px 12px" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {[
            { id: "bills", label: `📋 Detailed Bills Line-by-Line (${reportData?.orders?.length || 0})` },
            { id: "payments", label: `💵 Payment Collections (${reportData?.payments?.length || 0})` },
            { id: "credit", label: `💳 Credit Sales & Repayments (${reportData?.credit_transactions?.length || 0})` },
            { id: "expenses", label: `📉 Daily Expenses (${reportData?.expenses?.length || 0})` },
            { id: "reconciliation", label: `⚖️ Financial Reconciliation & Audit` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                background: activeTab === tab.id ? "var(--color-primary)" : "transparent",
                color: activeTab === tab.id ? "#FFFFFF" : "var(--text-main)",
                fontWeight: activeTab === tab.id ? "700" : "500",
                fontSize: "0.85rem",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Filter & Search Controls Toolbar */}
      {activeTab !== "reconciliation" && (
        <div
          className="card no-print"
          style={{
            padding: "14px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          {/* Search box */}
          <div style={{ flex: 1, minWidth: "240px", maxWidth: "420px" }}>
            <input
              type="text"
              placeholder="Search customer, phone, bill number, product..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", fontSize: "0.85rem", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}
            />
          </div>

          {/* Dropdown Filters */}
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={filterPaymentMethod}
              onChange={(e) => setFilterPaymentMethod(e.target.value)}
              style={{ padding: "8px 12px", fontSize: "0.85rem", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "#FFF" }}
            >
              <option value="ALL">All Payment Methods</option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI Digital</option>
              <option value="CARD">Card</option>
              <option value="CREDIT">Credit (Khata)</option>
            </select>

            {activeTab === "bills" && (
              <>
                <select
                  value={filterOrderStatus}
                  onChange={(e) => setFilterOrderStatus(e.target.value)}
                  style={{ padding: "8px 12px", fontSize: "0.85rem", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "#FFF" }}
                >
                  <option value="ALL">All Order Statuses</option>
                  <option value="COMPLETED">Delivered & Closed</option>
                  <option value="READY">Ready</option>
                  <option value="PREPARING">Preparing</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>

                <div style={{ display: "flex", border: "1px solid var(--border-subtle)", borderRadius: "8px", overflow: "hidden" }}>
                  <button
                    onClick={() => setViewMode("grouped")}
                    style={{
                      padding: "6px 12px",
                      fontSize: "0.8rem",
                      fontWeight: "600",
                      border: "none",
                      background: viewMode === "grouped" ? "var(--color-primary-light)" : "#FFF",
                      color: viewMode === "grouped" ? "var(--color-primary)" : "var(--text-muted)",
                      cursor: "pointer",
                    }}
                  >
                    Grouped Bills
                  </button>
                  <button
                    onClick={() => setViewMode("flat")}
                    style={{
                      padding: "6px 12px",
                      fontSize: "0.8rem",
                      fontWeight: "600",
                      border: "none",
                      background: viewMode === "flat" ? "var(--color-primary-light)" : "#FFF",
                      color: viewMode === "flat" ? "var(--color-primary)" : "var(--text-muted)",
                      cursor: "pointer",
                    }}
                  >
                    Line-by-Line Flat
                  </button>
                </div>
              </>
            )}

            {(searchQuery || filterPaymentMethod !== "ALL" || filterOrderStatus !== "ALL") && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setFilterPaymentMethod("ALL");
                  setFilterOrderStatus("ALL");
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--status-err)",
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  fontWeight: "600",
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* 5. TAB CONTENT PANELS */}
      {loading ? (
        <div className="card" style={{ padding: "60px", textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "2rem", marginBottom: "8px" }}>⏳</div>
          Loading daily audit records for {selectedDate}...
        </div>
      ) : (
        <>
          {/* TAB 1: Detailed Bills Line-by-Line (Section 3) */}
          {activeTab === "bills" && (
            <div className="card" style={{ padding: "0", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
                    Customer Bills & Order Line Items ({filteredOrders.length} Bills)
                  </h3>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    Every product served, unit price, customizations, tendered payment and credit allocation.
                  </span>
                </div>
                <div style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--color-primary)" }}>
                  Filtered Total: ₹{filteredOrders.reduce((sum, o) => o.order_status !== "CANCELLED" ? sum + o.total_amount : sum, 0).toFixed(2)}
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                  No bills found matching selected filters on {selectedDate}.
                </div>
              ) : viewMode === "grouped" ? (
                /* Grouped Mode */
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.84rem" }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC", borderBottom: "2px solid var(--border-subtle)", color: "var(--text-muted)", fontSize: "0.78rem", textTransform: "uppercase" }}>
                        <th style={{ padding: "12px 14px" }}>Bill / Token</th>
                        <th style={{ padding: "12px 14px" }}>Time</th>
                        <th style={{ padding: "12px 14px" }}>Customer</th>
                        <th style={{ padding: "12px 14px" }}>Items Purchased</th>
                        <th style={{ padding: "12px 14px", textAlign: "right" }}>Bill Total</th>
                        <th style={{ padding: "12px 14px", textAlign: "right" }}>Paid</th>
                        <th style={{ padding: "12px 14px" }}>Method</th>
                        <th style={{ padding: "12px 14px", textAlign: "right" }}>Credit Added</th>
                        <th style={{ padding: "12px 14px" }}>Status</th>
                        <th style={{ padding: "12px 14px", textAlign: "center" }} className="no-print">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((ord) => {
                        const isExpanded = expandedBillIds.has(ord.order_id);
                        const timeStr = ord.created_at ? new Date(ord.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
                        const isCancelled = ord.order_status === "CANCELLED";

                        return (
                          <React.Fragment key={ord.order_id}>
                            <tr
                              style={{
                                borderBottom: "1px solid var(--border-subtle)",
                                background: isCancelled ? "#FEF2F2" : isExpanded ? "#F8FAFC" : "#FFFFFF",
                                opacity: isCancelled ? 0.75 : 1,
                              }}
                            >
                              {/* Bill / Token */}
                              <td style={{ padding: "12px 14px", fontWeight: "700" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <button
                                    onClick={() => toggleBillExpand(ord.order_id)}
                                    className="no-print"
                                    style={{
                                      background: "transparent",
                                      border: "none",
                                      cursor: "pointer",
                                      fontSize: "0.8rem",
                                      color: "var(--text-muted)",
                                    }}
                                  >
                                    {isExpanded ? "▼" : "▶"}
                                  </button>
                                  <span style={{ color: "var(--color-primary)" }}>#{ord.daily_token_number}</span>
                                  <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>({ord.order_number})</span>
                                </div>
                              </td>

                              {/* Time */}
                              <td style={{ padding: "12px 14px", color: "var(--text-muted)" }}>{timeStr}</td>

                              {/* Customer */}
                              <td style={{ padding: "12px 14px" }}>
                                <div style={{ fontWeight: "600", color: "var(--text-main)" }}>{ord.customer_name}</div>
                                {ord.customer_phone && <div style={{ fontSize: "0.74rem", color: "var(--text-dim)" }}>{ord.customer_phone}</div>}
                                {ord.table_or_notes && <div style={{ fontSize: "0.72rem", color: "var(--color-primary)" }}>🪑 {ord.table_or_notes}</div>}
                              </td>

                              {/* Items overview */}
                              <td style={{ padding: "12px 14px" }}>
                                <div style={{ color: "var(--text-main)" }}>
                                  <strong>{ord.items_count} items:</strong>{" "}
                                  {ord.items?.map((it) => `${it.quantity}x ${it.item_name}`).join(", ") || "No items"}
                                </div>
                              </td>

                              {/* Bill Total */}
                              <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: "800", color: isCancelled ? "var(--text-dim)" : "var(--text-main)" }}>
                                {isCancelled ? <s>₹{ord.total_amount.toFixed(2)}</s> : `₹${ord.total_amount.toFixed(2)}`}
                              </td>

                              {/* Amount Paid */}
                              <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: "700", color: ord.amount_paid > 0 ? "var(--status-success)" : "var(--text-dim)" }}>
                                ₹{ord.amount_paid.toFixed(2)}
                              </td>

                              {/* Method */}
                              <td style={{ padding: "12px 14px" }}>
                                <span
                                  style={{
                                    padding: "3px 8px",
                                    borderRadius: "6px",
                                    fontSize: "0.74rem",
                                    fontWeight: "700",
                                    background:
                                      ord.payment_method === "UPI"
                                        ? "#EFF6FF"
                                        : ord.payment_method === "CASH"
                                        ? "#F0FDF4"
                                        : ord.payment_method === "CREDIT"
                                        ? "#FEF3C7"
                                        : "#F1F5F9",
                                    color:
                                      ord.payment_method === "UPI"
                                        ? "#1D4ED8"
                                        : ord.payment_method === "CASH"
                                        ? "#15803D"
                                        : ord.payment_method === "CREDIT"
                                        ? "#B45309"
                                        : "#475569",
                                  }}
                                >
                                  {ord.payment_method}
                                </span>
                              </td>

                              {/* Credit Amount */}
                              <td style={{ padding: "12px 14px", textAlign: "right", color: ord.credit_amount > 0 ? "#B45309" : "var(--text-dim)", fontWeight: ord.credit_amount > 0 ? "700" : "normal" }}>
                                {ord.credit_amount > 0 ? `₹${ord.credit_amount.toFixed(2)}` : "-"}
                              </td>

                              {/* Order Status */}
                              <td style={{ padding: "12px 14px" }}>
                                <span
                                  style={{
                                    padding: "3px 8px",
                                    borderRadius: "12px",
                                    fontSize: "0.72rem",
                                    fontWeight: "700",
                                    textTransform: "uppercase",
                                    background:
                                      ord.order_status === "COMPLETED"
                                        ? "#DCFCE7"
                                        : ord.order_status === "CANCELLED"
                                        ? "#FEE2E2"
                                        : ord.order_status === "PREPARING"
                                        ? "#E0F2FE"
                                        : "#FEF3C7",
                                    color:
                                      ord.order_status === "COMPLETED"
                                        ? "#16A34A"
                                        : ord.order_status === "CANCELLED"
                                        ? "#DC2626"
                                        : ord.order_status === "PREPARING"
                                        ? "#0284C7"
                                        : "#D97706",
                                  }}
                                >
                                  {ord.order_status}
                                </span>
                              </td>

                              {/* Action */}
                              <td style={{ padding: "12px 14px", textAlign: "center" }} className="no-print">
                                <button
                                  onClick={() => handleOpenReceipt(ord.order_id)}
                                  className="btn-secondary"
                                  style={{ fontSize: "0.74rem", padding: "4px 8px" }}
                                >
                                  Receipt 🧾
                                </button>
                              </td>
                            </tr>

                            {/* Expandable Line-by-Line Breakdown for this Bill */}
                            {isExpanded && ord.items && ord.items.length > 0 && (
                              <tr style={{ background: "#F1F5F9" }}>
                                <td colSpan="10" style={{ padding: "10px 14px 14px 34px" }}>
                                  <div style={{ background: "#FFFFFF", borderRadius: "8px", border: "1px solid var(--border-subtle)", padding: "10px 14px" }}>
                                    <div style={{ fontSize: "0.76rem", fontWeight: "700", color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase" }}>
                                      Bill Line Item Details (#{ord.daily_token_number})
                                    </div>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                                      <thead>
                                        <tr style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-dim)" }}>
                                          <th style={{ textAlign: "left", padding: "4px 8px" }}>Item Name</th>
                                          <th style={{ textAlign: "center", padding: "4px 8px" }}>Quantity</th>
                                          <th style={{ textAlign: "right", padding: "4px 8px" }}>Unit Price</th>
                                          <th style={{ textAlign: "right", padding: "4px 8px" }}>Line Total</th>
                                          <th style={{ textAlign: "left", padding: "4px 8px" }}>Customizations</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {ord.items.map((it, idx) => (
                                          <tr key={idx} style={{ borderBottom: "1px dotted #E2E8F0" }}>
                                            <td style={{ padding: "6px 8px", fontWeight: "600", color: "var(--text-main)" }}>
                                              {it.item_name}
                                            </td>
                                            <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: "700", color: "var(--color-primary)" }}>
                                              {it.quantity}x
                                            </td>
                                            <td style={{ padding: "6px 8px", textAlign: "right", color: "var(--text-muted)" }}>
                                              ₹{it.unit_price.toFixed(2)}
                                            </td>
                                            <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: "700", color: "var(--text-main)" }}>
                                              ₹{it.total_price.toFixed(2)}
                                            </td>
                                            <td style={{ padding: "6px 8px" }}>
                                              {(it.sugar || it.strength) ? (
                                                <div style={{ display: "flex", gap: "4px" }}>
                                                  {it.sugar && <span style={{ fontSize: "0.7rem", background: "#FEF3C7", color: "#B45309", padding: "1px 5px", borderRadius: "4px" }}>🍬 {it.sugar}</span>}
                                                  {it.strength && <span style={{ fontSize: "0.7rem", background: "#E0F2FE", color: "#0369A1", padding: "1px 5px", borderRadius: "4px" }}>💪 {it.strength}</span>}
                                                </div>
                                              ) : (
                                                <span style={{ color: "var(--text-dim)", fontSize: "0.75rem" }}>Standard</span>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Flat Line-by-Line Mode */
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.82rem" }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC", borderBottom: "2px solid var(--border-subtle)", color: "var(--text-muted)", fontSize: "0.76rem", textTransform: "uppercase" }}>
                        <th style={{ padding: "10px 12px" }}>Bill #</th>
                        <th style={{ padding: "10px 12px" }}>Time</th>
                        <th style={{ padding: "10px 12px" }}>Customer</th>
                        <th style={{ padding: "10px 12px" }}>Product Name</th>
                        <th style={{ padding: "10px 12px", textAlign: "center" }}>Qty</th>
                        <th style={{ padding: "10px 12px", textAlign: "right" }}>Unit Price</th>
                        <th style={{ padding: "10px 12px", textAlign: "right" }}>Line Total</th>
                        <th style={{ padding: "10px 12px", textAlign: "right" }}>Bill Total</th>
                        <th style={{ padding: "10px 12px" }}>Method</th>
                        <th style={{ padding: "10px 12px" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.flatMap((ord) => {
                        const timeStr = ord.created_at ? new Date(ord.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
                        return (ord.items || []).map((it, itemIdx) => (
                          <tr key={`${ord.order_id}-${itemIdx}`} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                            <td style={{ padding: "8px 12px", fontWeight: "700", color: "var(--color-primary)" }}>
                              #{ord.daily_token_number}
                            </td>
                            <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{timeStr}</td>
                            <td style={{ padding: "8px 12px" }}>{ord.customer_name}</td>
                            <td style={{ padding: "8px 12px", fontWeight: "600", color: "var(--text-main)" }}>
                              {it.item_name}
                              {(it.sugar || it.strength) && (
                                <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginLeft: "4px" }}>
                                  ({[it.sugar, it.strength].filter(Boolean).join(", ")})
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: "700" }}>{it.quantity}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-muted)" }}>₹{it.unit_price.toFixed(2)}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: "700", color: "var(--text-main)" }}>₹{it.total_price.toFixed(2)}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-dim)" }}>
                              {itemIdx === 0 ? <strong>₹{ord.total_amount.toFixed(2)}</strong> : "—"}
                            </td>
                            <td style={{ padding: "8px 12px" }}>{ord.payment_method}</td>
                            <td style={{ padding: "8px 12px" }}>{ord.order_status}</td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Payment Collection Details (Section 4) */}
          {activeTab === "payments" && (
            <div className="card" style={{ padding: "0", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
                    Payment Collection Details ({filteredPayments.length} Transactions)
                  </h3>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    All counter collections: Cash tenders, UPI scans, card auths, and customer credit tab repayments.
                  </span>
                </div>
                <div style={{ fontSize: "0.95rem", fontWeight: "800", color: "var(--status-success)" }}>
                  Total Collected: ₹{filteredPayments.reduce((sum, p) => sum + p.amount, 0).toFixed(2)}
                </div>
              </div>

              {filteredPayments.length === 0 ? (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                  No payment collections recorded on {selectedDate}.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC", borderBottom: "2px solid var(--border-subtle)", color: "var(--text-muted)", fontSize: "0.78rem", textTransform: "uppercase" }}>
                        <th style={{ padding: "12px 14px" }}>Tx ID</th>
                        <th style={{ padding: "12px 14px" }}>Date & Time</th>
                        <th style={{ padding: "12px 14px" }}>Bill / Reference</th>
                        <th style={{ padding: "12px 14px" }}>Customer</th>
                        <th style={{ padding: "12px 14px" }}>Payment Type</th>
                        <th style={{ padding: "12px 14px" }}>Method</th>
                        <th style={{ padding: "12px 14px", textAlign: "right" }}>Amount</th>
                        <th style={{ padding: "12px 14px" }}>UTR / Reference</th>
                        <th style={{ padding: "12px 14px" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPayments.map((p, idx) => {
                        const timeStr = p.payment_date ? new Date(p.payment_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

                        return (
                          <tr key={idx} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                            <td style={{ padding: "12px 14px", fontWeight: "700", color: "var(--color-primary)" }}>
                              {p.payment_id}
                            </td>
                            <td style={{ padding: "12px 14px", color: "var(--text-muted)" }}>{timeStr}</td>
                            <td style={{ padding: "12px 14px", fontWeight: "600" }}>
                              {p.order_number || "Counter Settlement"}
                            </td>
                            <td style={{ padding: "12px 14px" }}>
                              <div style={{ fontWeight: "600", color: "var(--text-main)" }}>{p.customer_name}</div>
                              {p.customer_phone && <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{p.customer_phone}</div>}
                            </td>
                            <td style={{ padding: "12px 14px" }}>
                              <span
                                style={{
                                  padding: "3px 8px",
                                  borderRadius: "6px",
                                  fontSize: "0.74rem",
                                  fontWeight: "700",
                                  background: p.payment_type === "Credit Debt Repayment" ? "#FEF3C7" : "#F0FDF4",
                                  color: p.payment_type === "Credit Debt Repayment" ? "#B45309" : "#15803D",
                                }}
                              >
                                {p.payment_type}
                              </span>
                            </td>
                            <td style={{ padding: "12px 14px" }}>
                              <span
                                style={{
                                  padding: "3px 8px",
                                  borderRadius: "6px",
                                  fontSize: "0.74rem",
                                  fontWeight: "700",
                                  background: p.payment_method === "UPI" ? "#EFF6FF" : p.payment_method === "CASH" ? "#F0FDF4" : "#F1F5F9",
                                  color: p.payment_method === "UPI" ? "#1D4ED8" : p.payment_method === "CASH" ? "#15803D" : "#475569",
                                }}
                              >
                                {p.payment_method}
                              </span>
                            </td>
                            <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: "800", color: "var(--status-success)" }}>
                              ₹{p.amount.toFixed(2)}
                            </td>
                            <td style={{ padding: "12px 14px", fontSize: "0.8rem", color: "var(--text-dim)", wordBreak: "break-all" }}>
                              {p.transaction_reference || "Counter Auto"}
                            </td>
                            <td style={{ padding: "12px 14px" }}>
                              <span style={{ fontSize: "0.74rem", color: "#16A34A", fontWeight: "700" }}>
                                ✓ {p.payment_status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Credit Sales & Collections (Section 5) */}
          {activeTab === "credit" && (
            <div className="card" style={{ padding: "0", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
                    Customer Credit (Khata) Movements ({filteredCredit.length} Events)
                  </h3>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    Rule 61 verified customer tab activities: new credit orders, counter repayments, and balance changes.
                  </span>
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  New Credit: <strong style={{ color: "#D97706" }}>₹{summary.credit_sales.toFixed(2)}</strong> | Cleared: <strong style={{ color: "#16A34A" }}>₹{summary.credit_payments_collected.toFixed(2)}</strong>
                </div>
              </div>

              {filteredCredit.length === 0 ? (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                  No customer credit transactions on {selectedDate}.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC", borderBottom: "2px solid var(--border-subtle)", color: "var(--text-muted)", fontSize: "0.78rem", textTransform: "uppercase" }}>
                        <th style={{ padding: "12px 14px" }}>Tx ID</th>
                        <th style={{ padding: "12px 14px" }}>Date & Time</th>
                        <th style={{ padding: "12px 14px" }}>Customer</th>
                        <th style={{ padding: "12px 14px" }}>Event Type</th>
                        <th style={{ padding: "12px 14px", textAlign: "right" }}>Amount</th>
                        <th style={{ padding: "12px 14px", textAlign: "right" }}>Balance After</th>
                        <th style={{ padding: "12px 14px", textAlign: "right" }}>Current Debt</th>
                        <th style={{ padding: "12px 14px" }}>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCredit.map((ct) => {
                        const timeStr = ct.created_at ? new Date(ct.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
                        const isCredit = ct.transaction_type === "CREDIT";

                        return (
                          <tr key={ct.transaction_id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                            <td style={{ padding: "12px 14px", fontWeight: "700", color: "var(--color-primary)" }}>
                              #{ct.transaction_id}
                            </td>
                            <td style={{ padding: "12px 14px", color: "var(--text-muted)" }}>{timeStr}</td>
                            <td style={{ padding: "12px 14px" }}>
                              <div style={{ fontWeight: "700", color: "var(--text-main)" }}>{ct.customer_name}</div>
                              {ct.customer_phone && <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{ct.customer_phone}</div>}
                            </td>
                            <td style={{ padding: "12px 14px" }}>
                              <span
                                style={{
                                  padding: "3px 8px",
                                  borderRadius: "6px",
                                  fontSize: "0.74rem",
                                  fontWeight: "700",
                                  background: isCredit ? "#FEF3C7" : "#DCFCE7",
                                  color: isCredit ? "#B45309" : "#16A34A",
                                }}
                              >
                                {isCredit ? "↑ New Credit Sale" : "↓ Debt Repayment"}
                              </span>
                            </td>
                            <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: "800", color: isCredit ? "#D97706" : "#16A34A" }}>
                              {isCredit ? "+" : "-"}₹{ct.amount.toFixed(2)}
                            </td>
                            <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: "600", color: "var(--text-main)" }}>
                              ₹{ct.balance_after.toFixed(2)}
                            </td>
                            <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: "700", color: "#B45309" }}>
                              ₹{ct.current_balance.toFixed(2)}
                            </td>
                            <td style={{ padding: "12px 14px", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                              {ct.description || "Credit ledger entry"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Daily Expenses (Section 6) */}
          {activeTab === "expenses" && (
            <div className="card" style={{ padding: "0", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
                    Operational Expenses ({filteredExpenses.length} Outlays)
                  </h3>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    Procurements, tea powder, milk, supplies, logistics and overhead expenses on {selectedDate}.
                  </span>
                </div>
                <div style={{ fontSize: "0.95rem", fontWeight: "800", color: "var(--status-err)" }}>
                  Total Expenses: ₹{filteredExpenses.reduce((sum, e) => sum + e.amount, 0).toFixed(2)}
                </div>
              </div>

              {filteredExpenses.length === 0 ? (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                  No operational expenses recorded for {selectedDate}.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC", borderBottom: "2px solid var(--border-subtle)", color: "var(--text-muted)", fontSize: "0.78rem", textTransform: "uppercase" }}>
                        <th style={{ padding: "12px 14px" }}>Expense ID</th>
                        <th style={{ padding: "12px 14px" }}>Category</th>
                        <th style={{ padding: "12px 14px" }}>Description</th>
                        <th style={{ padding: "12px 14px" }}>Payment Method</th>
                        <th style={{ padding: "12px 14px" }}>Recorded By</th>
                        <th style={{ padding: "12px 14px", textAlign: "right" }}>Amount</th>
                        <th style={{ padding: "12px 14px" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExpenses.map((e) => (
                        <tr key={e.expense_id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "12px 14px", fontWeight: "700", color: "var(--color-primary)" }}>
                            EXP-{e.expense_id}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <span style={{ padding: "3px 8px", borderRadius: "6px", fontSize: "0.76rem", fontWeight: "700", background: "#FEF3C7", color: "#B45309" }}>
                              {e.category}
                            </span>
                          </td>
                          <td style={{ padding: "12px 14px", fontWeight: "600", color: "var(--text-main)" }}>
                            {e.description}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <span style={{ fontSize: "0.78rem", fontWeight: "600", color: "var(--text-muted)" }}>
                              {e.payment_method}
                            </span>
                          </td>
                          <td style={{ padding: "12px 14px", color: "var(--text-dim)", fontSize: "0.8rem" }}>
                            {e.recorded_by}
                          </td>
                          <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: "800", color: "var(--status-err)" }}>
                            ₹{e.amount.toFixed(2)}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <span style={{ fontSize: "0.74rem", color: "#16A34A", fontWeight: "700" }}>
                              ✓ {e.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: Financial Reconciliation & P&L (Section 7) */}
          {activeTab === "reconciliation" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Reconciliation Card */}
              <div className="card" style={{ padding: "24px" }}>
                <h3 style={{ fontSize: "1.15rem", fontWeight: "800", color: "var(--text-main)", marginBottom: "6px" }}>
                  Daily Financial Reconciliation & Cashflow Proof
                </h3>
                <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "20px" }}>
                  Explains the relationship between goods sold, actual collections, credit tabs, and counter cash balances without double counting.
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
                  {/* Left Column: Sales vs Operating Margin */}
                  <div style={{ background: "#F8FAFC", borderRadius: "12px", padding: "18px", border: "1px solid var(--border-subtle)" }}>
                    <h4 style={{ fontSize: "0.95rem", fontWeight: "700", color: "#0F766E", marginBottom: "12px" }}>
                      1. Operating Margin (Sales vs Outlays)
                    </h4>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.86rem" }}>
                      <span style={{ color: "var(--text-muted)" }}>Total Eligible Sales (Goods Sold):</span>
                      <strong style={{ color: "var(--text-main)" }}>+ ₹{summary.total_sales.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.86rem" }}>
                      <span style={{ color: "var(--text-muted)" }}>Total Expenses Paid (Ingredients & Overhead):</span>
                      <strong style={{ color: "var(--status-err)" }}>- ₹{summary.total_expenses.toFixed(2)}</strong>
                    </div>
                    <div style={{ height: "1px", background: "var(--border-subtle)", margin: "10px 0" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1rem", fontWeight: "800" }}>
                      <span style={{ color: "var(--text-main)" }}>Preliminary Operating Surplus:</span>
                      <span style={{ color: summary.operating_surplus >= 0 ? "var(--color-primary)" : "var(--status-err)" }}>
                        {summary.operating_surplus >= 0 ? "+" : ""}₹{summary.operating_surplus.toFixed(2)}
                      </span>
                    </div>
                    <p style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "8px", fontStyle: "italic" }}>
                      * Note: This reflects preliminary daily trading margin before inventory carry-forward and unbilled depreciation.
                    </p>
                  </div>

                  {/* Right Column: Counter Cash Flow */}
                  <div style={{ background: "#F8FAFC", borderRadius: "12px", padding: "18px", border: "1px solid var(--border-subtle)" }}>
                    <h4 style={{ fontSize: "0.95rem", fontWeight: "700", color: "#16A34A", marginBottom: "12px" }}>
                      2. Actual Cash Inflow vs Outflow
                    </h4>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.86rem" }}>
                      <span style={{ color: "var(--text-muted)" }}>Immediate Counter Sales Received:</span>
                      <strong style={{ color: "var(--text-main)" }}>+ ₹{(summary.total_payments_received - summary.credit_payments_collected).toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.86rem" }}>
                      <span style={{ color: "var(--text-muted)" }}>Old Credit Debt Repayments Collected:</span>
                      <strong style={{ color: "#16A34A" }}>+ ₹{summary.credit_payments_collected.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.86rem" }}>
                      <span style={{ color: "var(--text-muted)" }}>Total Cash/UPI/Card Money Received:</span>
                      <strong style={{ color: "var(--status-success)" }}>= ₹{summary.total_payments_received.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.86rem" }}>
                      <span style={{ color: "var(--text-muted)" }}>Total Expenses Paid Out:</span>
                      <strong style={{ color: "var(--status-err)" }}>- ₹{summary.total_expenses.toFixed(2)}</strong>
                    </div>
                    <div style={{ height: "1px", background: "var(--border-subtle)", margin: "10px 0" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1rem", fontWeight: "800" }}>
                      <span style={{ color: "var(--text-main)" }}>Net Liquid Cash Flow:</span>
                      <span style={{ color: summary.net_cash_flow >= 0 ? "#0284C7" : "var(--status-err)" }}>
                        {summary.net_cash_flow >= 0 ? "+" : ""}₹{summary.net_cash_flow.toFixed(2)}
                      </span>
                    </div>
                    <p style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "8px", fontStyle: "italic" }}>
                      * Matches physical cash in drawer + bank UPI collections minus petty cash and UPI expenses.
                    </p>
                  </div>
                </div>

                {/* Audit Rules & Business Logic Callout */}
                <div
                  style={{
                    marginTop: "24px",
                    background: "#EFF6FF",
                    border: "1px solid #BFDBFE",
                    borderRadius: "10px",
                    padding: "16px 20px",
                    color: "#1E3A8A",
                    fontSize: "0.84rem",
                  }}
                >
                  <strong style={{ fontSize: "0.9rem", display: "block", marginBottom: "6px" }}>
                    📌 Business Accounting Rules Applied:
                  </strong>
                  <ul style={{ paddingLeft: "18px", lineHeight: "1.6" }}>
                    <li><strong>Credit Sales (Khata):</strong> Counted towards Total Sales (goods sold), but excluded from cash collected until customer repays.</li>
                    <li><strong>Credit Debt Repayments:</strong> Counted as Collections (inflow), but NOT as new sales today (to prevent double counting sales).</li>
                    <li><strong>Cancelled Orders:</strong> Excluded from sales, inventory deductions, and collections.</li>
                    <li><strong>Expenses:</strong> Accounted strictly by the recorded date ({selectedDate}) regardless of when bills were invoiced.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Bill Receipt Modal */}
      {activeReceipt && (
        <div
          className="no-print"
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
          <div className="card" style={{ maxWidth: "420px", width: "100%", padding: "24px", textAlign: "left", boxShadow: "var(--shadow-modal)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "700", color: "var(--text-main)" }}>
                Thermal Bill Receipt
              </h3>
              <button
                onClick={() => setActiveReceipt(null)}
                style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.2rem", color: "var(--text-muted)" }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                fontFamily: "monospace",
                background: "#F8FAFC",
                border: "1px solid var(--border-subtle)",
                borderRadius: "8px",
                padding: "14px",
                fontSize: "0.78rem",
                lineHeight: "1.5",
                whiteSpace: "pre-wrap",
                color: "#1E293B",
                maxHeight: "360px",
                overflowY: "auto",
              }}
            >
              <div style={{ textAlign: "center", fontWeight: "bold" }}>{activeReceipt.shop_name}</div>
              <div style={{ textAlign: "center", fontSize: "0.72rem" }}>{activeReceipt.shop_address}</div>
              <div style={{ textAlign: "center", fontSize: "0.72rem" }}>Phone: {activeReceipt.shop_phone}</div>
              <div style={{ borderTop: "1px dashed #94A3B8", margin: "8px 0" }} />
              <div>Token: #{activeReceipt.daily_token_number} | {activeReceipt.order_number}</div>
              <div>Date: {new Date(activeReceipt.order_time).toLocaleString()}</div>
              <div>Customer: {activeReceipt.customer_name}</div>
              <div style={{ borderTop: "1px dashed #94A3B8", margin: "8px 0" }} />
              {activeReceipt.items?.map((it, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{it.quantity}x {it.name}</span>
                  <span>₹{it.total_price.toFixed(2)}</span>
                </div>
              ))}
              <div style={{ borderTop: "1px dashed #94A3B8", margin: "8px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
                <span>Total:</span>
                <span>₹{activeReceipt.total_amount.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Method:</span>
                <span>{activeReceipt.payment_method}</span>
              </div>
              <div style={{ borderTop: "1px dashed #94A3B8", margin: "8px 0" }} />
              <div style={{ textAlign: "center", fontStyle: "italic" }}>{activeReceipt.footer_message}</div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              <button onClick={() => window.print()} className="btn-primary" style={{ flex: 1, padding: "10px" }}>
                🖨️ Print Receipt
              </button>
              <button onClick={() => setActiveReceipt(null)} className="btn-secondary" style={{ flex: 1, padding: "10px" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print CSS Styles */}
      <style jsx global>{`
        @media print {
          body {
            background: #FFFFFF !important;
            color: #000000 !important;
          }
          .admin-sidebar,
          .admin-header,
          .no-print {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          .daily-sales-container {
            padding: 0 !important;
            gap: 12px !important;
          }
          .card {
            border: 1px solid #CCC !important;
            box-shadow: none !important;
            page-break-inside: avoid;
          }
          table {
            font-size: 0.75rem !important;
          }
          th, td {
            padding: 6px 8px !important;
          }
        }
      `}</style>
    </div>
  );
}
