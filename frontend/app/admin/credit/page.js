"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import {
  getCreditReport,
  recordCreditRepayment,
  getCustomers,
} from "../../../services/api";

export default function CreditManagementPage() {
  const { getValidAdminToken } = useAuth();
  const [creditReport, setCreditReport] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState("");

  // Record Repayment Form Modal
  const [showRepayModal, setShowRepayModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [repayMethod, setRepayMethod] = useState("CASH");
  const [repayNotes, setRepayNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadCreditData() {
    setLoading(true);
    setActionMsg("");
    try {
      const token = await getValidAdminToken();
      const [repRes, custRes] = await Promise.all([
        getCreditReport(token).catch(() => null),
        getCustomers({ page: 1, limit: 100 }, token).catch(() => null),
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

  const creditApprovedCustomers = customers.filter(
    (c) => c.is_credit_eligible || Number(c.current_balance) > 0
  );

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
          <button onClick={loadCreditData} disabled={loading} className="btn-secondary" style={{ fontSize: "0.88rem", padding: "8px 16px" }}>
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

      {/* Credit KPI Cards */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Total Khata Debt
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--chai-gold)", marginTop: "4px" }}>
            ₹{creditReport?.total_outstanding_credit ?? 0}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
            Outstanding receivables
          </div>
        </div>

        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Customers with Balance
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--text-main)", marginTop: "4px" }}>
            {creditReport?.customers_with_balance ?? 0}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
            Active open tabs
          </div>
        </div>

        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase" }}>
            High Risk Accounts
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--status-err)", marginTop: "4px" }}>
            {creditReport?.high_risk_count ?? 0}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
            Balances &gt; 80% of approved limit
          </div>
        </div>
      </section>

      {/* Credit Khata Customers Table */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-main)" }}>
            👥 Khata Customer Balances
          </h3>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Rule 61 Approved & Active Credit Tabs
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table>
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
              ) : creditApprovedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                    No customer accounts currently have credit tabs.
                  </td>
                </tr>
              ) : (
                creditApprovedCustomers.map((c) => {
                  const balance = Number(c.current_balance) || 0;
                  const limit = Number(c.credit_limit) || 0;
                  const available = Math.max(0, limit - balance);
                  const isHighRisk = limit > 0 && balance / limit > 0.8;

                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: "700", color: "var(--text-main)" }}>{c.name}</div>
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
                        {c.phone || c.mobile_number}
                      </td>
                      <td style={{ fontWeight: "600" }}>₹{limit}</td>
                      <td style={{ fontWeight: "800", color: balance > 0 ? "var(--status-err)" : "var(--status-success)" }}>
                        ₹{balance}
                      </td>
                      <td style={{ fontWeight: "600", color: "var(--color-primary)" }}>
                        ₹{available}
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: "700",
                            padding: "3px 8px",
                            borderRadius: "10px",
                            background: isHighRisk ? "#FEE2E2" : "#DCFCE7",
                            color: isHighRisk ? "var(--status-err)" : "var(--status-success)",
                          }}
                        >
                          {isHighRisk ? "⚠️ High Risk" : "✓ Good Standing"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
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

            <form onSubmit={handleRepaySubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
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
    </div>
  );
}
