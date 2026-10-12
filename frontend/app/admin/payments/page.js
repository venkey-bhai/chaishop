"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import {
  getCounterShiftSummary,
  getPaymentsList,
  settleOrderPayment,
  getOrderUpiQr,
  getBillReceipt,
  getTodayTokens,
} from "../../../services/api";

export default function PaymentsPage() {
  const { getValidAdminToken } = useAuth();
  const [shiftSummary, setShiftSummary] = useState(null);
  const [paymentsList, setPaymentsList] = useState([]);
  const [unsettledOrders, setUnsettledOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState("");

  // Cash settlement modal state
  const [activeCashSettle, setActiveCashSettle] = useState(null);
  const [cashTendered, setCashTendered] = useState("");

  // UPI settlement modal state
  const [activeUpiQr, setActiveUpiQr] = useState(null);
  const [upiUtrInput, setUpiUtrInput] = useState("");

  // Receipt modal state
  const [activeReceipt, setActiveReceipt] = useState(null);

  async function loadBillingData() {
    setLoading(true);
    setActionMsg("");
    try {
      const token = await getValidAdminToken();
      const [shiftRes, payRes, tokensRes] = await Promise.all([
        getCounterShiftSummary(token).catch(() => null),
        getPaymentsList({ page: 1, limit: 30 }, token).catch(() => null),
        getTodayTokens().catch(() => null),
      ]);

      setShiftSummary(shiftRes);
      setPaymentsList(payRes?.items || []);

      // Find orders that are not settled
      const allTokens = [
        ...(tokensRes?.pending || []),
        ...(tokensRes?.preparing || []),
        ...(tokensRes?.ready || []),
        ...(tokensRes?.completed || []),
      ];
      setUnsettledOrders(allTokens.filter((o) => o.payment_status !== "PAID"));
    } catch (err) {
      console.error("Failed to load billing data:", err);
      setActionMsg(`Failed to load payments: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBillingData();
  }, []);

  async function handleSettleCashSubmit(e) {
    if (e) e.preventDefault();
    if (!activeCashSettle) return;
    setActionMsg("");
    try {
      const token = await getValidAdminToken();
      const tendered = cashTendered ? Number(cashTendered) : Number(activeCashSettle.total_amount);
      const res = await settleOrderPayment(
        {
          order_id: activeCashSettle.order_id,
          payment_method: "CASH",
          amount_received: tendered,
          notes: "Counter cash tender",
        },
        token
      );
      setActionMsg(
        `Settled Token #${res.daily_token_number}: Cash ₹${res.amount_received} tendered (Change: ₹${res.change_returned})`
      );
      setActiveCashSettle(null);
      setCashTendered("");
      await loadBillingData();
    } catch (err) {
      setActionMsg(`Cash settlement failed: ${err.message}`);
    }
  }

  async function handleOpenUpiModal(orderId) {
    setActionMsg("");
    try {
      const qrData = await getOrderUpiQr(orderId);
      // Fallback: If backend did not provide qr_image_data, generate it client-side
      if (!qrData.qr_image_data && qrData.upi_uri) {
        try {
          const QRCode = (await import("qrcode")).default || (await import("qrcode"));
          qrData.qr_image_data = await QRCode.toDataURL(qrData.upi_uri, {
            width: 260,
            margin: 1,
            color: { dark: "#0f172a", light: "#ffffff" },
          });
        } catch (qrErr) {
          console.warn("Client QR generation fallback error:", qrErr);
          qrData.qr_image_data = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData.upi_uri)}`;
        }
      }
      setActiveUpiQr(qrData);
      setUpiUtrInput("");
    } catch (err) {
      setActionMsg(`Failed to generate UPI QR: ${err.message}`);
    }
  }

  async function handleConfirmUpiPayment() {
    if (!activeUpiQr) return;
    setActionMsg("");
    try {
      const token = await getValidAdminToken();
      const res = await settleOrderPayment(
        {
          order_id: activeUpiQr.order_id,
          payment_method: "UPI",
          transaction_reference: upiUtrInput || `UPI-${Date.now().toString().slice(-6)}`,
          notes: "Counter UPI scan",
        },
        token
      );
      setActionMsg(
        `Settled Token #${res.daily_token_number} via UPI (Ref: ${res.transaction_reference})`
      );
      setActiveUpiQr(null);
      setUpiUtrInput("");
      await loadBillingData();
    } catch (err) {
      setActionMsg(`UPI settlement failed: ${err.message}`);
    }
  }

  async function handleOpenReceiptModal(orderId) {
    setActionMsg("");
    try {
      const receiptData = await getBillReceipt(orderId);
      setActiveReceipt(receiptData);
    } catch (err) {
      setActionMsg(`Failed to load receipt: ${err.message}`);
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
            💵 Payments, Billing & Cash Tender Counter
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: "4px" }}>
            Multi-mode settlement (Cash, UPI QR, Credit Khata), change return calculator, and thermal paper bills.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={loadBillingData} disabled={loading} className="btn-secondary" style={{ fontSize: "0.88rem", padding: "8px 16px" }}>
            {loading ? "Refreshing..." : "↻ Refresh Ledger"}
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

      {/* Shift Summary Cards */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Total Billed Today
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--text-main)", marginTop: "4px" }}>
            ₹{shiftSummary?.total_sales ?? 0}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
            {shiftSummary?.total_orders ?? 0} Orders
          </div>
        </div>

        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Real Cash Inflow
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--color-primary)", marginTop: "4px" }}>
            ₹{shiftSummary?.cash_collected ?? 0}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
            Physical cash in drawer
          </div>
        </div>

        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase" }}>
            UPI Digital Collections
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "#0284C7", marginTop: "4px" }}>
            ₹{shiftSummary?.upi_collected ?? 0}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
            Bank QR settlements
          </div>
        </div>

        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Credit (Khata) Billed
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--chai-gold)", marginTop: "4px" }}>
            ₹{shiftSummary?.credit_billed ?? 0}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
            Pending balance
          </div>
        </div>
      </section>

      {/* Orders Awaiting Payment Settlement */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-main)" }}>
            ⚡ Orders Awaiting Settlement ({unsettledOrders.length})
          </h3>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            Unsettled tokens for current shift
          </span>
        </div>

        {unsettledOrders.length === 0 ? (
          <div style={{ padding: "36px", textAlign: "center", color: "var(--text-muted)" }}>
            All current orders have been paid and settled! 🎉
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Token #</th>
                  <th>Customer</th>
                  <th>Order Items</th>
                  <th>Total Due</th>
                  <th>Payment Status</th>
                  <th style={{ textAlign: "right" }}>Settle Payment</th>
                </tr>
              </thead>
              <tbody>
                {unsettledOrders.map((ord) => (
                  <tr key={ord.order_id}>
                    <td>
                      <span style={{ fontWeight: "800", fontSize: "1.05rem" }}>
                        #{ord.daily_token_number}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: "600" }}>{ord.customer_name || "Walk-in Customer"}</div>
                      {ord.customer_phone && <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{ord.customer_phone}</div>}
                    </td>
                    <td style={{ fontSize: "0.82rem" }}>
                      {ord.items?.map((i) => `${i.quantity}x ${i.item_name}`).join(", ")}
                    </td>
                    <td style={{ fontWeight: "800", color: "var(--color-primary)", fontSize: "1.05rem" }}>
                      ₹{ord.total_amount}
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: "700",
                          padding: "3px 8px",
                          borderRadius: "10px",
                          background: "#FEF3C7",
                          color: "#92400E",
                        }}
                      >
                        {ord.payment_status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "6px" }}>
                        <button
                          onClick={() => {
                            setActiveCashSettle(ord);
                            setCashTendered(String(ord.total_amount));
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
                          💵 Cash
                        </button>
                        <button
                          onClick={() => handleOpenUpiModal(ord.order_id)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "6px",
                            border: "1px solid #BAE6FD",
                            background: "#F0F9FF",
                            color: "#0284C7",
                            fontSize: "0.78rem",
                            fontWeight: "600",
                            cursor: "pointer",
                          }}
                        >
                          📱 UPI QR
                        </button>
                        <button
                          onClick={() => handleOpenReceiptModal(ord.order_id)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: "6px",
                            border: "1px solid var(--border-subtle)",
                            background: "#FFFFFF",
                            color: "var(--text-main)",
                            fontSize: "0.78rem",
                            cursor: "pointer",
                          }}
                          title="Generate bill receipt"
                        >
                          🧾 Bill
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Transactions Audit Log */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-main)" }}>
            📜 Recent Payment Transactions
          </h3>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Tx ID</th>
                <th>Order Token</th>
                <th>Method</th>
                <th>Amount Received</th>
                <th>Change Returned</th>
                <th>Reference</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {paymentsList.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
                    No payment transactions recorded yet.
                  </td>
                </tr>
              ) : (
                paymentsList.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontFamily: "monospace" }}>#{p.id}</td>
                    <td>
                      <strong>#{p.order?.daily_token_number || "-"}</strong>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: "700",
                          padding: "3px 8px",
                          borderRadius: "6px",
                          background:
                            p.payment_method === "CASH"
                              ? "rgba(22, 163, 74, 0.1)"
                              : p.payment_method === "UPI"
                              ? "rgba(2, 132, 199, 0.1)"
                              : "rgba(217, 119, 6, 0.1)",
                          color:
                            p.payment_method === "CASH"
                              ? "var(--status-success)"
                              : p.payment_method === "UPI"
                              ? "#0284C7"
                              : "var(--chai-gold)",
                        }}
                      >
                        {p.payment_method}
                      </span>
                    </td>
                    <td style={{ fontWeight: "700", color: "var(--color-primary)" }}>
                      ₹{p.amount_received || p.amount}
                    </td>
                    <td>₹{p.change_returned || 0}</td>
                    <td style={{ fontSize: "0.8rem", color: "var(--text-dim)", fontFamily: "monospace" }}>
                      {p.transaction_reference || "-"}
                    </td>
                    <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      {p.created_at ? new Date(p.created_at).toLocaleTimeString() : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cash Tender Modal */}
      {activeCashSettle && (
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
          <div className="card" style={{ maxWidth: "420px", width: "100%", padding: "24px", boxShadow: "var(--shadow-modal)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "1.15rem", fontWeight: "700", color: "var(--text-main)" }}>
                Cash Tender Calculator
              </h3>
              <button onClick={() => setActiveCashSettle(null)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.2rem", color: "var(--text-muted)" }}>
                ✕
              </button>
            </div>

            <div style={{ background: "var(--bg-card-subtle)", padding: "14px", borderRadius: "10px", marginBottom: "16px" }}>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Order Token #{activeCashSettle.daily_token_number}</div>
              <div style={{ fontSize: "1.6rem", fontWeight: "900", color: "var(--color-primary)" }}>
                Due: ₹{activeCashSettle.total_amount}
              </div>
            </div>

            <form onSubmit={handleSettleCashSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  Cash Tendered by Customer (₹)
                </label>
                <input
                  type="number"
                  min={activeCashSettle.total_amount}
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  style={{ width: "100%", fontSize: "1.1rem", fontWeight: "700" }}
                  autoFocus
                />
              </div>

              {Number(cashTendered) >= Number(activeCashSettle.total_amount) && (
                <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", padding: "12px", borderRadius: "8px", textAlign: "center" }}>
                  <div style={{ fontSize: "0.78rem", color: "var(--status-success)", fontWeight: "600" }}>Change to Return</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: "800", color: "var(--status-success)" }}>
                    ₹{Number(cashTendered) - Number(activeCashSettle.total_amount)}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button type="button" onClick={() => setActiveCashSettle(null)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Confirm Cash Received
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UPI QR Modal */}
      {activeUpiQr && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(6px)",
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
              maxWidth: "420px",
              width: "100%",
              padding: "24px",
              textAlign: "center",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              background: "#ffffff",
              borderRadius: "16px",
            }}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ textAlign: "left" }}>
                <h3 style={{ fontSize: "1.15rem", fontWeight: "700", color: "#0f172a", margin: 0 }}>
                  UPI QR Payment
                </h3>
                <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                  Scan with any UPI application
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveUpiQr(null)}
                style={{
                  background: "#f1f5f9",
                  border: "none",
                  borderRadius: "50%",
                  width: "32px",
                  height: "32px",
                  cursor: "pointer",
                  fontSize: "1rem",
                  color: "#64748b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✕
              </button>
            </div>

            {/* Token Badge & Order Number */}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span style={{ background: "rgba(15, 118, 110, 0.12)", color: "#0f766e", fontWeight: "700", padding: "3px 10px", borderRadius: "20px", fontSize: "0.82rem" }}>
                Token #{activeUpiQr.daily_token_number}
              </span>
              <span style={{ color: "#64748b", fontSize: "0.8rem", fontWeight: "500" }}>
                {activeUpiQr.order_number}
              </span>
            </div>

            {/* Total Amount */}
            <div style={{ fontSize: "2rem", fontWeight: "900", color: "#0f766e", marginBottom: "14px", letterSpacing: "-0.5px" }}>
              ₹{Number(activeUpiQr.amount).toFixed(2)}
            </div>

            {/* Scannable QR Code Image */}
            <div
              style={{
                width: "220px",
                height: "220px",
                margin: "0 auto 12px",
                background: "#ffffff",
                border: "2px solid #e2e8f0",
                borderRadius: "16px",
                padding: "8px",
                boxShadow: "0 4px 14px rgba(0, 0, 0, 0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              {activeUpiQr.qr_image_data ? (
                <img
                  src={activeUpiQr.qr_image_data}
                  alt={`UPI QR Code for Token #${activeUpiQr.daily_token_number}`}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    borderRadius: "10px",
                    display: "block",
                  }}
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                  <div style={{ fontSize: "2rem" }}>⏳</div>
                  <div style={{ fontSize: "0.78rem", color: "#64748b" }}>Generating QR Code...</div>
                </div>
              )}
            </div>

            {/* Payee Info & VPA */}
            <div style={{ fontSize: "0.82rem", color: "#475569", marginBottom: "4px" }}>
              Payee: <strong style={{ color: "#0f172a" }}>{activeUpiQr.payee_name || "ChaiFlow Tea Shop"}</strong>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "0.78rem", color: "#64748b", marginBottom: "10px" }}>
              <span>VPA: <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", color: "#0f172a", fontWeight: "600" }}>{activeUpiQr.upi_id}</code></span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(activeUpiQr.upi_id);
                  setActionMsg("UPI ID copied to clipboard!");
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "#0f766e",
                  fontSize: "0.75rem",
                  fontWeight: "700",
                  textDecoration: "underline",
                }}
              >
                Copy
              </button>
            </div>

            {/* Supported UPI Apps Pills */}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "6px", marginBottom: "14px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.7rem", background: "#f1f5f9", padding: "3px 8px", borderRadius: "6px", color: "#475569", fontWeight: "600" }}>GPay</span>
              <span style={{ fontSize: "0.7rem", background: "#f1f5f9", padding: "3px 8px", borderRadius: "6px", color: "#475569", fontWeight: "600" }}>PhonePe</span>
              <span style={{ fontSize: "0.7rem", background: "#f1f5f9", padding: "3px 8px", borderRadius: "6px", color: "#475569", fontWeight: "600" }}>Paytm</span>
              <span style={{ fontSize: "0.7rem", background: "#f1f5f9", padding: "3px 8px", borderRadius: "6px", color: "#475569", fontWeight: "600" }}>BHIM</span>
              <span style={{ fontSize: "0.7rem", background: "#f1f5f9", padding: "3px 8px", borderRadius: "6px", color: "#475569", fontWeight: "600" }}>Any UPI</span>
            </div>

            {/* Transaction Reference / UTR Input */}
            <div style={{ textAlign: "left", marginBottom: "16px" }}>
              <label style={{ fontSize: "0.78rem", color: "#475569", display: "block", marginBottom: "4px", fontWeight: "600" }}>
                UPI Reference / UTR Number (Optional):
              </label>
              <input
                type="text"
                placeholder="e.g. 427189123456"
                value={upiUtrInput}
                onChange={(e) => setUpiUtrInput(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setActiveUpiQr(null)}
                className="btn-secondary"
                style={{ flex: 1, padding: "10px", fontSize: "0.88rem" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUpiPayment}
                className="btn-primary"
                style={{ flex: 1.3, padding: "10px", fontSize: "0.88rem", fontWeight: "700" }}
              >
                ✓ Settle Bill via UPI
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thermal Bill Receipt Modal */}
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
            zIndex: 50,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#FAFAFA",
              color: "#111111",
              maxWidth: "360px",
              width: "100%",
              borderRadius: "12px",
              padding: "24px 20px",
              fontFamily: "monospace",
              fontSize: "0.85rem",
              boxShadow: "var(--shadow-modal)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div style={{ textAlign: "center", borderBottom: "1px dashed #666", paddingBottom: "10px", marginBottom: "10px" }}>
              <div style={{ fontSize: "1.15rem", fontWeight: "900" }}>{activeReceipt.shop_name}</div>
              <div style={{ fontSize: "0.75rem", color: "#444" }}>{activeReceipt.tagline}</div>
              <div style={{ fontSize: "0.72rem", color: "#666" }}>{activeReceipt.address}</div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span>TOKEN #{activeReceipt.daily_token_number}</span>
              <span>{activeReceipt.receipt_number}</span>
            </div>

            <div style={{ borderBottom: "1px dashed #666", paddingBottom: "8px", marginBottom: "8px" }}>
              {activeReceipt.items?.map((it, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span>{it.quantity}x {it.name}</span>
                  <span>₹{it.total}</span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "1.05rem", marginBottom: "16px" }}>
              <span>TOTAL DUE:</span>
              <span>₹{activeReceipt.total_amount}</span>
            </div>

            <div style={{ textAlign: "center", borderTop: "1px dashed #666", paddingTop: "10px", color: "#666", fontSize: "0.75rem" }}>
              {activeReceipt.footer_message || "Thank you! Visit again for fresh chai ☕"}
            </div>

            <div style={{ marginTop: "16px", display: "flex", gap: "8px" }}>
              <button
                onClick={() => window.print()}
                style={{
                  flex: 1,
                  background: "#111",
                  color: "#FFF",
                  border: "none",
                  borderRadius: "6px",
                  padding: "8px",
                  cursor: "pointer",
                }}
              >
                🖨️ Print Receipt
              </button>
              <button
                onClick={() => setActiveReceipt(null)}
                style={{
                  flex: 1,
                  background: "#DDD",
                  color: "#111",
                  border: "none",
                  borderRadius: "6px",
                  padding: "8px",
                  cursor: "pointer",
                }}
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
