"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "../../../context/AuthContext";
import {
  getCreditReport,
  recordCreditRepayment,
  getCustomers,
  updateCustomerCreditLimit,
  getCustomerCreditLimitHistory,
} from "../../../services/api";

export default function CreditManagementPage() {
  const { getValidAdminToken, user } = useAuth();
  const [creditReport, setCreditReport] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState("");

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [filterCredit, setFilterCredit] = useState("");
  const searchTimeoutRef = useRef(null);

  // Record Repayment Form Modal
  const [showRepayModal, setShowRepayModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [repayMethod, setRepayMethod] = useState("CASH");
  const [repayNotes, setRepayNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Credit Limit Configuration Modal State
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [selectedCustomerForLimit, setSelectedCustomerForLimit] = useState(null);
  const [newCreditLimit, setNewCreditLimit] = useState("");
  const [limitReason, setLimitReason] = useState("");
  const [limitAuditHistory, setLimitAuditHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [savingLimit, setSavingLimit] = useState(false);
  const [limitModalMsg, setLimitModalMsg] = useState("");

  async function loadCreditData(searchQuery = search, creditFilter = filterCredit) {
    setLoading(true);
    setActionMsg("");
    try {
      const token = await getValidAdminToken();
      const isEligibleParam =
        creditFilter === "" || creditFilter === "debt" || creditFilter === "high_risk"
          ? null
          : creditFilter === "true";

      const [repRes, custRes] = await Promise.all([
        getCreditReport(token).catch(() => null),
        getCustomers(
          {
            page: 1,
            limit: 100,
            search: searchQuery?.trim() || undefined,
            is_credit_eligible: isEligibleParam,
          },
          token
        ).catch(() => null),
      ]);
      setCreditReport(repRes);
      setCustomers(custRes?.items || []);
    } catch (err) {
      console.error("Failed to load credit data:", err);
      setActionMsg(`Failed to load credit ledger: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCreditData();
  }, []);

  function handleSearchChange(e) {
    const val = e.target.value;
    setSearch(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      loadCreditData(val, filterCredit);
    }, 300);
  }

  function handleFilterChange(e) {
    const val = e.target.value;
    setFilterCredit(val);
    loadCreditData(search, val);
  }

  const displayedCustomers = useMemo(() => {
    let list = customers;

    if (filterCredit === "true") {
      list = list.filter((c) => c.is_credit_eligible);
    } else if (filterCredit === "false") {
      list = list.filter((c) => !c.is_credit_eligible);
    } else if (filterCredit === "debt") {
      list = list.filter((c) => Number(c.current_balance) > 0);
    } else if (filterCredit === "high_risk") {
      list = list.filter((c) => {
        const limit = Number(c.credit_limit) || 0;
        const balance = Number(c.current_balance) || 0;
        return limit > 0 && balance / limit > 0.8;
      });
    } else {
      // Default: show customers who are either credit eligible OR have an existing balance
      // Unless they searched for something, then show all matching customers
      if (!search.trim()) {
        list = list.filter((c) => c.is_credit_eligible || Number(c.current_balance) > 0);
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((c) => {
        const name = (c.name || "").toLowerCase();
        const phone = (c.phone || c.mobile_number || "").toLowerCase();
        const email = (c.email || "").toLowerCase();
        return name.includes(q) || phone.includes(q) || email.includes(q);
      });
    }

    return list;
  }, [customers, filterCredit, search]);

  async function handleRepaySubmit(e) {
    e.preventDefault();
    if (!selectedCustomerId || !repayAmount || Number(repayAmount) <= 0) {
      setActionMsg("Please select a customer and enter a valid repayment amount.");
      return;
    }

    setSubmitting(true);
    setActionMsg("");
    try {
      const token = await getValidAdminToken();
      const res = await recordCreditRepayment(
        {
          customer_id: Number(selectedCustomerId),
          amount: Number(repayAmount),
          payment_method: repayMethod,
          description: repayNotes.trim() || "Counter credit tab repayment",
        },
        token
      );
      setActionMsg(
        `Repayment of ₹${res.amount_paid} recorded for ${res.customer_name}! Remaining debt: ₹${res.new_balance}`
      );
      setShowRepayModal(false);
      setSelectedCustomerId("");
      setRepayAmount("");
      setRepayNotes("");
      await loadCreditData();
    } catch (err) {
      setActionMsg(`Repayment failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function openCreditLimitModal(customer) {
    setSelectedCustomerForLimit(customer);
    setNewCreditLimit(String(customer.credit_limit || 0));
    setLimitReason("");
    setLimitModalMsg("");
    setShowLimitModal(true);
    setLoadingHistory(true);
    try {
      const token = await getValidAdminToken();
      const history = await getCustomerCreditLimitHistory(customer.id, token);
      setLimitAuditHistory(Array.isArray(history) ? history : []);
    } catch (err) {
      console.warn("Could not load credit limit audit history:", err);
      setLimitAuditHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleSaveCreditLimit(e) {
    if (e) e.preventDefault();
    if (!selectedCustomerForLimit) return;
    const limitNum = parseFloat(newCreditLimit);
    if (isNaN(limitNum) || limitNum < 0) {
      setLimitModalMsg("Please enter a valid credit limit (0 or greater).");
      return;
    }

    setSavingLimit(true);
    setLimitModalMsg("");
    try {
      const token = await getValidAdminToken();
      const adminName = user?.name || user?.username || "Admin";
      const res = await updateCustomerCreditLimit(
        selectedCustomerForLimit.id,
        {
          credit_limit: limitNum,
          reason: limitReason.trim() || undefined,
          admin_name: adminName,
        },
        token
      );
      setActionMsg(
        `✓ Credit limit for ${selectedCustomerForLimit.name} updated to ₹${res.credit_limit} (Available credit: ₹${res.available_credit})`
      );
      setShowLimitModal(false);
      await loadCreditData();
    } catch (err) {
      setLimitModalMsg(err.message || "Failed to update credit limit.");
    } finally {
      setSavingLimit(false);
    }
  }

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
            💳 Customer Credit Accounts & Khata Ledger
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: "4px" }}>
            Audit outstanding debt, record counter repayments, and enforce credit risk ceilings.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={() => setShowRepayModal(true)} className="btn-primary" style={{ fontSize: "0.88rem", padding: "8px 16px" }}>
            + Record Repayment
          </button>
          <button onClick={() => loadCreditData(search, filterCredit)} disabled={loading} className="btn-secondary" style={{ fontSize: "0.88rem", padding: "8px 16px" }}>
            {loading ? "Refreshing..." : "↻ Refresh"}
          </button>
        </div>
      </div>

      {actionMsg && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            background: actionMsg.startsWith("Failed") || actionMsg.startsWith("Please") ? "#FEF2F2" : "#F0FDF4",
            border: `1px solid ${actionMsg.startsWith("Failed") || actionMsg.startsWith("Please") ? "#FECACA" : "#BBF7D0"}`,
            color: actionMsg.startsWith("Failed") || actionMsg.startsWith("Please") ? "var(--status-err)" : "var(--status-success)",
            fontSize: "0.88rem",
            fontWeight: "500",
          }}
        >
          {actionMsg}
        </div>
      )}

      {/* Credit KPI Cards - Sticky & Density Adaptive */}
      <div className="sticky-kpi-container">
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-card-header">
              <span className="kpi-card-title">Total Khata Debt</span>
              <span className="kpi-card-icon">💳</span>
            </div>
            <div className="kpi-card-value" style={{ color: "var(--chai-gold)" }}>
              ₹{creditReport?.total_outstanding_credit ?? 0}
            </div>
            <div className="kpi-card-sub">
              Outstanding receivables
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-card-header">
              <span className="kpi-card-title">Customers with Balance</span>
              <span className="kpi-card-icon">👥</span>
            </div>
            <div className="kpi-card-value">
              {creditReport?.customers_with_balance ?? 0}
            </div>
            <div className="kpi-card-sub">
              Active open tabs
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-card-header">
              <span className="kpi-card-title">High Risk Accounts</span>
              <span className="kpi-card-icon">⚠️</span>
            </div>
            <div className="kpi-card-value" style={{ color: "var(--status-err)" }}>
              {creditReport?.high_risk_count ?? 0}
            </div>
            <div className="kpi-card-sub">
              Balances &gt; 80% of approved limit
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters Toolbar */}
      <div className="card" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: "260px" }}>
            <input
              type="text"
              placeholder="Search by customer name, phone number, or email..."
              value={search}
              onChange={handleSearchChange}
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ minWidth: "200px" }}>
            <select
              value={filterCredit}
              onChange={handleFilterChange}
              style={{ width: "100%" }}
            >
              <option value="">All Customer Types</option>
              <option value="true">Credit Approved Only (Rule 61)</option>
              <option value="debt">With Outstanding Debt Only</option>
              <option value="high_risk">High Risk (&gt; 80% Limit)</option>
              <option value="false">Prepaid / Cash Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Credit Khata Customers Table */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-main)" }}>
            👥 Khata Customer Balances
          </h3>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            {displayedCustomers.length} {displayedCustomers.length === 1 ? "customer" : "customers"} found
          </span>
        </div>

        <div className="table-container">
          <table className="sticky-table-header">
            <thead>
              <tr>
                <th>Customer Name</th>
                <th>Phone Number</th>
                <th>Approved Credit Limit</th>
                <th>Current Balance (Debt)</th>
                <th>Available Credit</th>
                <th>Risk Status</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                    Loading credit ledger...
                  </td>
                </tr>
              ) : displayedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                    {search.trim() || filterCredit
                      ? "No customers matched your search/filter criteria."
                      : "No customer accounts currently have credit tabs."}
                  </td>
                </tr>
              ) : (
                displayedCustomers.map((c) => {
                  const balance = Number(c.current_balance) || 0;
                  const limit = Number(c.credit_limit) || 0;
                  const available = Math.max(0, limit - balance);
                  const isLimitExceeded = limit > 0 && balance >= limit;
                  const isHighRisk = limit > 0 && balance / limit > 0.8 && !isLimitExceeded;
                  const isZeroLimitWithDebt = limit === 0 && balance > 0;

                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: "700", color: "var(--text-main)" }}>{c.name}</div>
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
                        {c.phone || c.mobile_number}
                      </td>
                      <td style={{ fontWeight: "600" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span>₹{limit}</span>
                          <button
                            onClick={() => openCreditLimitModal(c)}
                            title="Configure Credit Limit & Audit Trail"
                            style={{
                              background: "rgba(2, 132, 199, 0.08)",
                              border: "1px solid rgba(2, 132, 199, 0.3)",
                              color: "var(--brand-primary, #0284c7)",
                              borderRadius: "4px",
                              padding: "2px 6px",
                              fontSize: "0.7rem",
                              cursor: "pointer",
                              fontWeight: "600",
                            }}
                          >
                            ⚙️ Edit
                          </button>
                        </div>
                      </td>
                      <td style={{ fontWeight: "800", color: balance > 0 ? "var(--status-err)" : "var(--status-success)" }}>
                        ₹{balance}
                      </td>
                      <td style={{ fontWeight: "700", color: "var(--color-primary)" }}>
                        ₹{available}
                      </td>
                      <td>
                        {isLimitExceeded ? (
                          <span
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: "700",
                              padding: "3px 8px",
                              borderRadius: "10px",
                              background: "#FEE2E2",
                              color: "#DC2626",
                              border: "1px solid #FECACA",
                            }}
                          >
                            ⛔ Limit Reached
                          </span>
                        ) : isHighRisk ? (
                          <span
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: "700",
                              padding: "3px 8px",
                              borderRadius: "10px",
                              background: "#FEF3C7",
                              color: "#D97706",
                              border: "1px solid #FDE68A",
                            }}
                          >
                            ⚠️ Near Limit (80%+)
                          </span>
                        ) : isZeroLimitWithDebt ? (
                          <span
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: "700",
                              padding: "3px 8px",
                              borderRadius: "10px",
                              background: "#FEE2E2",
                              color: "#B91C1C",
                              border: "1px solid #FECACA",
                            }}
                          >
                            ⚠️ Unapproved Debt
                          </span>
                        ) : limit === 0 ? (
                          <span
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: "600",
                              padding: "3px 8px",
                              borderRadius: "10px",
                              background: "#F1F5F9",
                              color: "#64748B",
                            }}
                          >
                            Prepaid Only
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: "700",
                              padding: "3px 8px",
                              borderRadius: "10px",
                              background: "#DCFCE7",
                              color: "var(--status-success)",
                            }}
                          >
                            ✓ Good Standing
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                          <button
                            onClick={() => openCreditLimitModal(c)}
                            style={{
                              padding: "6px 10px",
                              borderRadius: "6px",
                              border: "1px solid rgba(2, 132, 199, 0.3)",
                              background: "rgba(2, 132, 199, 0.08)",
                              color: "var(--brand-primary, #0284c7)",
                              fontSize: "0.78rem",
                              fontWeight: "600",
                              cursor: "pointer",
                            }}
                          >
                            ⚙️ Limit
                          </button>
                          <button
                            onClick={() => {
                              setSelectedCustomerId(String(c.id));
                              setRepayAmount(String(balance > 0 ? balance : ""));
                              setShowRepayModal(true);
                            }}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "6px",
                              border: "1px solid #BBF7D0",
                              background: "#F0FDF4",
                              color: "var(--status-success)",
                              fontSize: "0.78rem",
                              fontWeight: "600",
                              cursor: "pointer",
                            }}
                          >
                            Record Repayment
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Repayment Modal */}
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
            zIndex: 50,
            padding: "20px",
          }}
        >
          <div className="card" style={{ maxWidth: "440px", width: "100%", padding: "24px", boxShadow: "var(--shadow-modal)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "1.15rem", fontWeight: "700", color: "var(--text-main)" }}>
                Record Credit Repayment
              </h3>
              <button onClick={() => setShowRepayModal(false)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.2rem", color: "var(--text-muted)" }}>
                ✕
              </button>
            </div>

            <form onSubmit={handleRepaySubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  Select Customer *
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => {
                    setSelectedCustomerId(e.target.value);
                    const sel = customers.find((c) => String(c.id) === e.target.value);
                    if (sel && Number(sel.current_balance) > 0) {
                      setRepayAmount(String(sel.current_balance));
                    }
                  }}
                  required
                  style={{ width: "100%" }}
                >
                  <option value="">-- Choose Customer --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone || c.mobile_number}) — Balance: ₹{c.current_balance}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  Repayment Amount (₹) *
                </label>
                <input
                  type="number"
                  placeholder="e.g. 200"
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                  min="1"
                  required
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  Payment Method
                </label>
                <select value={repayMethod} onChange={(e) => setRepayMethod(e.target.value)} style={{ width: "100%" }}>
                  <option value="CASH">Cash Tender</option>
                  <option value="UPI">UPI Digital Payment</option>
                  <option value="CARD">Debit / Credit Card</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  Notes / Reference (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cleared full weekly balance"
                  value={repayNotes}
                  onChange={(e) => setRepayNotes(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <button type="button" onClick={() => setShowRepayModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? "Recording..." : "Record Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Credit Limit Configuration & Audit Modal */}
      {showLimitModal && selectedCustomerForLimit && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.55)",
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
              maxWidth: "540px",
              width: "100%",
              padding: "24px",
              boxShadow: "var(--shadow-modal)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h3 style={{ fontSize: "1.2rem", fontWeight: "700", color: "var(--text-main)" }}>
                  ⚙️ Configure Credit Limit
                </h3>
                <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  {selectedCustomerForLimit.name} ({selectedCustomerForLimit.phone || selectedCustomerForLimit.mobile_number})
                </p>
              </div>
              <button
                onClick={() => setShowLimitModal(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.2rem", color: "var(--text-muted)" }}
              >
                ✕
              </button>
            </div>

            {limitModalMsg && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  color: "var(--status-err)",
                  fontSize: "0.85rem",
                  marginBottom: "14px",
                }}
              >
                {limitModalMsg}
              </div>
            )}

            {/* Credit Status Summary Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "16px" }}>
              <div style={{ background: "var(--bg-muted, #f8fafc)", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>Current Limit</span>
                <span style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-main)" }}>
                  ₹{selectedCustomerForLimit.credit_limit || 0}
                </span>
              </div>
              <div style={{ background: "var(--bg-muted, #f8fafc)", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>Outstanding Debt</span>
                <span style={{ fontSize: "1rem", fontWeight: "700", color: Number(selectedCustomerForLimit.current_balance) > 0 ? "var(--status-err)" : "var(--status-success)" }}>
                  ₹{selectedCustomerForLimit.current_balance || 0}
                </span>
              </div>
              <div style={{ background: "rgba(16, 185, 129, 0.08)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                <span style={{ fontSize: "0.72rem", color: "var(--status-success)", display: "block" }}>Calculated Available</span>
                <span style={{ fontSize: "1rem", fontWeight: "800", color: "var(--status-success)" }}>
                  ₹{Math.max(0, (parseFloat(newCreditLimit) || 0) - (Number(selectedCustomerForLimit.current_balance) || 0)).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Formula Explainer */}
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "14px", padding: "6px 10px", background: "var(--bg-muted, #f1f5f9)", borderRadius: "6px" }}>
              💡 <strong>Available Credit</strong> = Approved Limit − Current Debt. Customer cannot place credit orders exceeding this amount.
            </div>

            {/* Quick Adjust Buttons */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "0.8rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                Quick Preset Adjustments:
              </label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[500, 1000, 2000, 5000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setNewCreditLimit(String((Number(selectedCustomerForLimit.credit_limit) || 0) + amt))}
                    style={{
                      padding: "5px 10px",
                      borderRadius: "6px",
                      border: "1px solid var(--border-subtle)",
                      background: "var(--bg-card)",
                      fontSize: "0.78rem",
                      fontWeight: "600",
                      color: "var(--text-main)",
                      cursor: "pointer",
                    }}
                  >
                    +{amt}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setNewCreditLimit("0")}
                  style={{
                    padding: "5px 10px",
                    borderRadius: "6px",
                    border: "1px solid #FECACA",
                    background: "#FEF2F2",
                    fontSize: "0.78rem",
                    fontWeight: "600",
                    color: "var(--status-err)",
                    cursor: "pointer",
                  }}
                >
                  Reset (₹0)
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveCreditLimit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  New Approved Credit Limit Ceiling (₹) *
                </label>
                <input
                  type="number"
                  placeholder="e.g. 1000"
                  value={newCreditLimit}
                  onChange={(e) => setNewCreditLimit(e.target.value)}
                  min="0"
                  step="50"
                  required
                  style={{ width: "100%", fontSize: "1rem", fontWeight: "700" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  Reason for Adjustment / Audit Note
                </label>
                <input
                  type="text"
                  placeholder="e.g. Regular patron loyalty increase, Settlement reset"
                  value={limitReason}
                  onChange={(e) => setLimitReason(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>

              {/* Warnings */}
              {parseFloat(newCreditLimit) > 0 && parseFloat(newCreditLimit) <= Number(selectedCustomerForLimit.current_balance) && (
                <div style={{ padding: "8px 12px", borderRadius: "6px", background: "#FEF3C7", border: "1px solid #FDE68A", color: "#B45309", fontSize: "0.78rem" }}>
                  ⚠️ <strong>Notice:</strong> Proposed limit (₹{newCreditLimit}) is ≤ outstanding debt (₹{selectedCustomerForLimit.current_balance}). Available credit will be ₹0.00 until repayments are made.
                </div>
              )}
              {parseFloat(newCreditLimit) === 0 && (
                <div style={{ padding: "8px 12px", borderRadius: "6px", background: "#FEF2F2", border: "1px solid #FECACA", color: "var(--status-err)", fontSize: "0.78rem" }}>
                  ℹ️ <strong>Reset to ₹0:</strong> This customer will not be permitted to place any orders on credit.
                </div>
              )}

              {/* Audit History Log */}
              <div style={{ marginTop: "6px", borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: "700", color: "var(--text-main)", display: "block", marginBottom: "6px" }}>
                  📋 Credit Limit Audit History
                </span>
                {loadingHistory ? (
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Loading audit log...</div>
                ) : limitAuditHistory.length === 0 ? (
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>No past credit limit change records found.</div>
                ) : (
                  <div style={{ maxHeight: "140px", overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: "6px" }}>
                    <table style={{ width: "100%", fontSize: "0.74rem", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--bg-muted, #f8fafc)", borderBottom: "1px solid var(--border-subtle)" }}>
                          <th style={{ padding: "5px 8px", textAlign: "left" }}>Date & Time</th>
                          <th style={{ padding: "5px 8px", textAlign: "left" }}>Admin</th>
                          <th style={{ padding: "5px 8px", textAlign: "right" }}>Old → New</th>
                          <th style={{ padding: "5px 8px", textAlign: "left" }}>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {limitAuditHistory.map((h, i) => (
                          <tr key={h.id || i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                            <td style={{ padding: "5px 8px" }}>
                              {new Date(h.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                            </td>
                            <td style={{ padding: "5px 8px", fontWeight: "600" }}>{h.admin_name || "Admin"}</td>
                            <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace" }}>
                              ₹{h.old_limit} → ₹{h.new_limit}
                            </td>
                            <td style={{ padding: "5px 8px", color: "var(--text-muted)" }}>{h.reason || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button type="button" onClick={() => setShowLimitModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={savingLimit} className="btn-primary">
                  {savingLimit ? "Saving Limit..." : "Save Credit Limit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
