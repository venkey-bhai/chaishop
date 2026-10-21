"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import {
  getDailyReport,
  getMonthlyReport,
  getProductReport,
  getCreditReport,
  getSalesForecast,
} from "../../../services/api";

export default function ReportsPage() {
  const { getValidAdminToken } = useAuth();
  const [activeTab, setActiveTab] = useState("daily");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Tab Data States
  const [dailyReport, setDailyReport] = useState(null);
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [productReport, setProductReport] = useState(null);
  const [creditReport, setCreditReport] = useState(null);
  const [forecastData, setForecastData] = useState(null);

  // Filters
  const [selectedDate, setSelectedDate] = useState("");
  const [creditSearch, setCreditSearch] = useState("");

  async function loadReport(tab = activeTab, customDate = selectedDate) {
    setLoading(true);
    setError("");
    try {
      const token = await getValidAdminToken();

      if (tab === "daily") {
        const res = await getDailyReport(customDate || null, token);
        setDailyReport(res);
      } else if (tab === "monthly") {
        const res = await getMonthlyReport(null, null, token);
        setMonthlyReport(res);
      } else if (tab === "products") {
        const res = await getProductReport(token);
        setProductReport(res);
      } else if (tab === "credit") {
        const res = await getCreditReport(token);
        setCreditReport(res);
      } else if (tab === "forecast") {
        const res = await getSalesForecast(token);
        setForecastData(res);
      }
    } catch (err) {
      console.error("Failed to load report data:", err);
      setError(`Failed to load report: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReport(activeTab);
  }, [activeTab]);

  // Tomorrow forecast point (index 0 of seven_day_forecast)
  const tomorrowForecast = forecastData?.seven_day_forecast?.[0] || null;

  // Filtered customer debts
  const filteredCustomerDebts = (creditReport?.customer_debts || []).filter((acc) => {
    if (!creditSearch) return true;
    const q = creditSearch.toLowerCase();
    return (
      (acc.customer_name || "").toLowerCase().includes(q) ||
      (acc.mobile_number || "").includes(q)
    );
  });

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
            📈 Financial Reports, P&L & AI Forecasting
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: "4px" }}>
            Daily revenue statements, menu item margins, credit default risk, and predictive inventory demand.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={() => loadReport(activeTab, selectedDate)}
            disabled={loading}
            className="btn-secondary"
            style={{ fontSize: "0.88rem", padding: "8px 16px" }}
          >
            {loading ? "Refreshing..." : "↻ Refresh Report"}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "14px 18px",
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "10px",
            color: "var(--status-err)",
            fontSize: "0.88rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => loadReport(activeTab, selectedDate)}
            className="btn-secondary"
            style={{ fontSize: "0.8rem", padding: "5px 12px", background: "#FFFFFF" }}
          >
            ↻ Try Again
          </button>
        </div>
      )}

      {/* Report Tabs Bar */}
      <div className="card" style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {[
            { id: "daily", label: "📊 Daily P&L Statement" },
            { id: "products", label: "☕ Product Profitability" },
            { id: "credit", label: "💳 Khata Credit Risk" },
            { id: "forecast", label: "🤖 AI Demand Forecast" },
            { id: "monthly", label: "📅 Monthly Performance" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: `1px solid ${activeTab === tab.id ? "var(--color-primary)" : "var(--border-subtle)"}`,
                background: activeTab === tab.id ? "var(--color-primary)" : "#FFFFFF",
                color: activeTab === tab.id ? "#FFFFFF" : "var(--text-main)",
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

      {/* Tab Content Display */}
      {loading ? (
        <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "1.5rem", marginBottom: "8px" }}>⏳</div>
          Loading financial report data...
        </div>
      ) : activeTab === "daily" && dailyReport ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Daily Statement Header with Date Picker */}
          <div
            className="card"
            style={{
              padding: "16px 20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "700", color: "var(--text-main)" }}>
                Statement Date: {dailyReport.report_date}
              </h3>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "2px" }}>
                Total Orders: {dailyReport.total_orders} | Completed: {dailyReport.completed_orders} | Cancelled: {dailyReport.cancelled_orders}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Pick Date:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  loadReport("daily", e.target.value);
                }}
                style={{ fontSize: "0.85rem", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-subtle)" }}
              />
            </div>
          </div>

          {/* Daily Breakdown Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
            <div className="card" style={{ padding: "18px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
                Total Billed Sales
              </div>
              <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "var(--text-main)", marginTop: "4px" }}>
                ₹{Number(dailyReport.total_sales || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
                {dailyReport.completed_orders} orders completed
              </div>
            </div>

            <div className="card" style={{ padding: "18px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
                Real Cash & Digital Inflow
              </div>
              <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "var(--color-primary)", marginTop: "4px" }}>
                ₹{Number(dailyReport.total_actual_inflow || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
                Cash ₹{Number(dailyReport.cash_collected || 0).toFixed(0)} + UPI ₹{Number(dailyReport.upi_collected || 0).toFixed(0)}
              </div>
            </div>

            <div className="card" style={{ padding: "18px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
                Daily Expenses
              </div>
              <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "var(--status-err)", marginTop: "4px" }}>
                ₹{Number(dailyReport.total_expenses || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
                Operating outflows
              </div>
            </div>

            <div className="card" style={{ padding: "18px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
                Net Operating Profit
              </div>
              <div
                style={{
                  fontSize: "1.8rem",
                  fontWeight: "800",
                  color: Number(dailyReport.net_profit || 0) >= 0 ? "var(--status-success)" : "var(--status-err)",
                  marginTop: "4px",
                }}
              >
                ₹{Number(dailyReport.net_profit || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
                Margin: {dailyReport.gross_margin_percentage || 0}%
              </div>
            </div>
          </div>

          {/* Two Detailed Breakdown Cards: Collections vs Unit Economics */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
            <div className="card" style={{ padding: "20px" }}>
              <h4 style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-main)", marginBottom: "14px" }}>
                💵 Payment Collections Breakdown
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.88rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ color: "var(--text-muted)" }}>Cash Collected:</span>
                  <span style={{ fontWeight: "700", color: "var(--text-main)" }}>₹{Number(dailyReport.cash_collected || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ color: "var(--text-muted)" }}>UPI Digital Payments:</span>
                  <span style={{ fontWeight: "700", color: "var(--text-main)" }}>₹{Number(dailyReport.upi_collected || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ color: "var(--text-muted)" }}>Card Payments:</span>
                  <span style={{ fontWeight: "700", color: "var(--text-main)" }}>₹{Number(dailyReport.card_collected || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ color: "var(--text-muted)" }}>Customer Khata Repayments:</span>
                  <span style={{ fontWeight: "700", color: "var(--status-success)" }}>+₹{Number(dailyReport.credit_repayments || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ color: "var(--text-muted)" }}>Credit Sales (Uncollected Tab):</span>
                  <span style={{ fontWeight: "600", color: "#f59e0b" }}>₹{Number(dailyReport.credit_sales || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "8px", borderTop: "2px solid var(--border-subtle)", fontSize: "0.95rem" }}>
                  <span style={{ fontWeight: "700", color: "var(--text-main)" }}>Actual Real Inflow Today:</span>
                  <span style={{ fontWeight: "800", color: "var(--color-primary)" }}>₹{Number(dailyReport.total_actual_inflow || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: "20px" }}>
              <h4 style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-main)", marginBottom: "14px" }}>
                📉 Unit Economics & Operational Bottom Line
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.88rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ color: "var(--text-muted)" }}>Completed Orders / Total:</span>
                  <span style={{ fontWeight: "700", color: "var(--text-main)" }}>{dailyReport.completed_orders} / {dailyReport.total_orders}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ color: "var(--text-muted)" }}>Average Order Value (AOV):</span>
                  <span style={{ fontWeight: "700", color: "var(--text-main)" }}>₹{Number(dailyReport.average_order_value || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ color: "var(--text-muted)" }}>Gross Sales Revenue:</span>
                  <span style={{ fontWeight: "700", color: "var(--status-success)" }}>+₹{Number(dailyReport.total_sales || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ color: "var(--text-muted)" }}>Operating Expenses:</span>
                  <span style={{ fontWeight: "700", color: "var(--status-err)" }}>-₹{Number(dailyReport.total_expenses || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ color: "var(--text-muted)" }}>Gross Margin Percentage:</span>
                  <span style={{ fontWeight: "700", color: "var(--text-main)" }}>{dailyReport.gross_margin_percentage || 0}%</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "8px", borderTop: "2px solid var(--border-subtle)", fontSize: "0.95rem" }}>
                  <span style={{ fontWeight: "700", color: "var(--text-main)" }}>Net Operating Profit:</span>
                  <span style={{ fontWeight: "800", color: Number(dailyReport.net_profit || 0) >= 0 ? "var(--status-success)" : "var(--status-err)" }}>
                    ₹{Number(dailyReport.net_profit || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Hourly Traffic Histogram */}
          {dailyReport.hourly_distribution && dailyReport.hourly_distribution.length > 0 && (
            <div className="card" style={{ padding: "20px" }}>
              <h4 style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-main)", marginBottom: "16px" }}>
                ⏱️ Peak Hours Hourly Traffic & Sales Velocity
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(45px, 1fr))", gap: "6px", alignItems: "flex-end", minHeight: "120px", paddingTop: "16px" }}>
                {dailyReport.hourly_distribution.map((h) => {
                  const maxSales = Math.max(...dailyReport.hourly_distribution.map((x) => Number(x.sales_amount)), 100);
                  const heightPct = Math.max((Number(h.sales_amount) / maxSales) * 100, 6);
                  return (
                    <div key={h.hour} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: "600" }}>
                        {Number(h.sales_amount) > 0 ? `₹${Math.round(h.sales_amount)}` : ""}
                      </div>
                      <div
                        style={{
                          width: "100%",
                          height: `${heightPct}px`,
                          background: Number(h.sales_amount) > 0 ? "var(--color-primary)" : "var(--bg-card-subtle)",
                          borderRadius: "4px 4px 0 0",
                          transition: "height 0.3s ease",
                        }}
                      />
                      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{h.hour}h</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top 5 Items Today */}
          {dailyReport.top_items_today && dailyReport.top_items_today.length > 0 && (
            <div className="card" style={{ padding: "20px" }}>
              <h4 style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-main)", marginBottom: "14px" }}>
                🔥 Top Selling Items Today
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                {dailyReport.top_items_today.map((item, idx) => (
                  <div key={`top-${item.name}-${idx}`} style={{ background: "var(--bg-card-subtle)", padding: "12px 16px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ fontWeight: "700", color: "var(--text-main)", fontSize: "0.9rem" }}>{item.name}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                      <span>{item.quantity} sold</span>
                      <strong style={{ color: "var(--color-primary)" }}>₹{Number(item.revenue || 0).toFixed(2)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : activeTab === "products" && productReport ? (
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-main)" }}>
              ☕ Menu Item Sales & Margin Rankings
            </h3>
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Tracked: <strong>{productReport.total_menu_items_tracked || 0}</strong> items | Units Sold: <strong>{productReport.total_products_sold || 0}</strong> cups
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: "60px" }}>Rank</th>
                  <th>Product Name</th>
                  <th>Category</th>
                  <th style={{ textAlign: "right" }}>Menu Price</th>
                  <th style={{ textAlign: "right" }}>Units Sold</th>
                  <th style={{ textAlign: "right" }}>Total Revenue</th>
                  <th style={{ textAlign: "right" }}>Revenue Share</th>
                </tr>
              </thead>
              <tbody>
                {(!productReport.top_performers || productReport.top_performers.length === 0) ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
                      No product sales records found yet.
                    </td>
                  </tr>
                ) : (
                  productReport.top_performers.map((p, idx) => (
                    <tr key={`perf-${p.item_id || 'item'}-${p.name}-${idx}`}>
                      <td>
                        <span
                          style={{
                            fontWeight: "800",
                            color: idx === 0 ? "#f59e0b" : idx === 1 ? "#64748b" : idx === 2 ? "#b45309" : "var(--text-muted)",
                          }}
                        >
                          #{idx + 1}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: "700", color: "var(--text-main)" }}>{p.name}</div>
                      </td>
                      <td>{p.category_name}</td>
                      <td style={{ textAlign: "right", fontWeight: "600" }}>₹{Number(p.price || 0).toFixed(2)}</td>
                      <td style={{ textAlign: "right", fontWeight: "700", color: "var(--color-primary)" }}>{p.quantity_sold} cups</td>
                      <td style={{ textAlign: "right", fontWeight: "800", color: "var(--status-success)" }}>₹{Number(p.total_revenue || 0).toFixed(2)}</td>
                      <td style={{ textAlign: "right" }}>
                        <span style={{ fontSize: "0.78rem", background: "var(--bg-card-subtle)", padding: "3px 8px", borderRadius: "6px", fontWeight: "700" }}>
                          {p.revenue_percentage || 0}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === "credit" && creditReport ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Credit Risk Meter Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
            <div className="card" style={{ padding: "18px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
                Approved Credit Limit
              </div>
              <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--color-primary)", marginTop: "4px" }}>
                ₹{Number(creditReport.total_approved_limit || 0).toFixed(2)}
              </div>
            </div>

            <div className="card" style={{ padding: "18px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
                Total Outstanding Debt
              </div>
              <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--status-err)", marginTop: "4px" }}>
                ₹{Number(creditReport.total_outstanding_debt || 0).toFixed(2)}
              </div>
            </div>

            <div className="card" style={{ padding: "18px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
                Available Headroom
              </div>
              <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--status-success)", marginTop: "4px" }}>
                ₹{Number(creditReport.total_available_credit || 0).toFixed(2)}
              </div>
            </div>

            <div className="card" style={{ padding: "18px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
                High-Risk Accounts (≥80%)
              </div>
              <div
                style={{
                  fontSize: "1.6rem",
                  fontWeight: "800",
                  color: (creditReport.high_risk_customers_count || 0) > 0 ? "var(--status-err)" : "var(--status-success)",
                  marginTop: "4px",
                }}
              >
                {creditReport.high_risk_customers_count || 0} accounts
              </div>
            </div>
          </div>

          {/* Ledger Card */}
          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h3 style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-main)" }}>
                  💳 Khata Credit Risk & Customer Debt Ledger
                </h3>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  Eligible Accounts: {creditReport.total_credit_eligible_customers || 0} | Average Utilization: {creditReport.average_utilization_pct || 0}%
                </p>
              </div>

              <input
                type="text"
                placeholder="🔍 Search name or phone..."
                value={creditSearch}
                onChange={(e) => setCreditSearch(e.target.value)}
                style={{ padding: "6px 12px", fontSize: "0.85rem", borderRadius: "6px", border: "1px solid var(--border-subtle)", width: "220px" }}
              />
            </div>

            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Phone Number</th>
                    <th style={{ textAlign: "right" }}>Approved Limit</th>
                    <th style={{ textAlign: "right" }}>Current Debt</th>
                    <th style={{ textAlign: "right" }}>Available Headroom</th>
                    <th style={{ textAlign: "right" }}>Utilization</th>
                    <th style={{ textAlign: "center" }}>Risk Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomerDebts.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
                        No matching credit customer accounts found.
                      </td>
                    </tr>
                  ) : (
                    filteredCustomerDebts.map((acc, idx) => (
                      <tr key={`debt-${acc.customer_id || acc.mobile_number || idx}`}>
                        <td>
                          <strong>{acc.customer_name}</strong>
                        </td>
                        <td style={{ fontFamily: "monospace" }}>{acc.mobile_number}</td>
                        <td style={{ textAlign: "right" }}>₹{Number(acc.credit_limit || 0).toFixed(2)}</td>
                        <td style={{ textAlign: "right", fontWeight: "800", color: Number(acc.current_balance || 0) > 0 ? "var(--status-err)" : "var(--text-muted)" }}>
                          ₹{Number(acc.current_balance || 0).toFixed(2)}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: "600", color: "var(--status-success)" }}>
                          ₹{Number(acc.available_credit || 0).toFixed(2)}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: "700" }}>{acc.utilization_percentage || 0}%</td>
                        <td style={{ textAlign: "center" }}>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: "700",
                              padding: "3px 8px",
                              borderRadius: "6px",
                              background: acc.is_high_risk ? "#FEE2E2" : "#DCFCE7",
                              color: acc.is_high_risk ? "var(--status-err)" : "var(--status-success)",
                            }}
                          >
                            {acc.is_high_risk ? "⚠️ HIGH RISK" : "✓ HEALTHY"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === "forecast" && forecastData ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* AI Forecast Overview Header */}
          <div
            className="card"
            style={{
              padding: "20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "14px",
              background: "linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, rgba(59, 130, 246, 0.05) 100%)",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                <span style={{ fontSize: "1.6rem" }}>🤖</span>
                <h3 style={{ fontSize: "1.15rem", fontWeight: "700", color: "var(--text-main)" }}>
                  Predictive AI Sales & Raw Material Demand
                </h3>
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                Model: <strong>{forecastData.forecast_model || "NumPy Linear Trend Regression + Seasonality Filter"}</strong>
                {" • "}
                Analyzed: <strong>{forecastData.historical_days_analyzed} Days Rolling Velocity</strong>
              </p>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
                Projected 7-Day Revenue
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: "800", color: "var(--status-success)", marginTop: "2px" }}>
                ₹{Number(forecastData.total_projected_weekly_revenue || 0).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Tomorrow's Immediate Forecast */}
          {tomorrowForecast && (
            <div>
              <div style={{ fontSize: "0.92rem", fontWeight: "700", color: "var(--text-main)", marginBottom: "10px" }}>
                📅 Projected Demand for Tomorrow ({tomorrowForecast.day_name}, {tomorrowForecast.date})
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
                <div className="card" style={{ padding: "18px" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
                    Predicted Tomorrow Sales
                  </div>
                  <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "var(--color-primary)", marginTop: "4px" }}>
                    ₹{Number(tomorrowForecast.predicted_sales || 0).toFixed(2)}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
                    Confidence: ₹{Number(tomorrowForecast.confidence_lower || 0).toFixed(0)} – ₹{Number(tomorrowForecast.confidence_upper || 0).toFixed(0)}
                  </div>
                </div>

                <div className="card" style={{ padding: "18px" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
                    Predicted Order Cups
                  </div>
                  <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "var(--text-main)", marginTop: "4px" }}>
                    ~{tomorrowForecast.predicted_cups} cups
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
                    Estimated daily beverage volume
                  </div>
                </div>

                <div className="card" style={{ padding: "18px" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
                    Average Daily Run-Rate
                  </div>
                  <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "var(--text-main)", marginTop: "4px" }}>
                    ₹{Number(forecastData.average_daily_sales || 0).toFixed(2)}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
                    Growth Velocity: {forecastData.predicted_growth_rate_pct || 0}%
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 7-Day Day-by-Day Forecast Series */}
          {forecastData.seven_day_forecast && forecastData.seven_day_forecast.length > 0 && (
            <div className="card" style={{ padding: "20px" }}>
              <h4 style={{ fontSize: "1rem", fontWeight: "700", marginBottom: "16px", color: "var(--text-main)" }}>
                📊 7-Day Day-by-Day Revenue & Cup Projections
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px" }}>
                {forecastData.seven_day_forecast.map((pt, idx) => (
                  <div
                    key={`fc-day-${pt.date || idx}`}
                    style={{
                      background: idx === 0 ? "rgba(245, 158, 11, 0.08)" : "var(--bg-card-subtle)",
                      border: idx === 0 ? "1px solid var(--chai-gold)" : "1px solid var(--border-subtle)",
                      borderRadius: "10px",
                      padding: "12px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: "0.78rem", fontWeight: "700", color: "var(--text-main)" }}>{pt.day_name}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>{pt.date}</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: "800", color: "var(--color-primary)", margin: "6px 0" }}>
                      ₹{Number(pt.predicted_sales || 0).toFixed(0)}
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", fontWeight: "600" }}>
                      ☕ ~{pt.predicted_cups} cups
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw Material Requirements */}
          <div className="card" style={{ padding: "20px" }}>
            <h4 style={{ fontSize: "1rem", fontWeight: "700", marginBottom: "16px", color: "var(--text-main)" }}>
              📦 Estimated Daily Raw Material Procurement Needs
            </h4>
            {(!forecastData.raw_material_demand || forecastData.raw_material_demand.length === 0) ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>No raw material projections available.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
                {forecastData.raw_material_demand.map((mat, i) => (
                  <div
                    key={`mat-${mat.material_name}-${i}`}
                    style={{
                      background: "var(--bg-card-subtle)",
                      padding: "16px",
                      borderRadius: "10px",
                      border: "1px solid var(--border-subtle)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "0.85rem", color: "var(--text-main)", fontWeight: "700" }}>
                        {mat.material_name}
                      </div>
                      <div style={{ fontSize: "1.3rem", fontWeight: "800", color: "var(--color-primary)", marginTop: "6px" }}>
                        {mat.estimated_daily_need} <span style={{ fontSize: "0.85rem", fontWeight: "normal", color: "var(--text-muted)" }}>{mat.unit}/day</span>
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
                        7-Day Total: <strong>{mat.estimated_weekly_need} {mat.unit}</strong>
                      </div>
                    </div>

                    <div>
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: "0.72rem",
                          fontWeight: "700",
                          padding: "3px 8px",
                          borderRadius: "6px",
                          background: mat.reorder_recommended ? "#FEE2E2" : "#DCFCE7",
                          color: mat.reorder_recommended ? "var(--status-err)" : "var(--status-success)",
                        }}
                      >
                        {mat.reorder_recommended ? "⚠️ PROCURING SOON" : "✓ SUFFICIENT"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : activeTab === "monthly" && monthlyReport ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Monthly KPI Overview */}
          <div className="card" style={{ padding: "24px" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: "700", marginBottom: "16px", color: "var(--text-main)" }}>
              📅 Monthly Performance Summary ({monthlyReport.month_name} {monthlyReport.year})
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
              <div style={{ background: "var(--bg-card-subtle)", padding: "16px", borderRadius: "10px" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Monthly Sales</div>
                <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--color-primary)", marginTop: "4px" }}>
                  ₹{Number(monthlyReport.total_sales || 0).toFixed(2)}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
                  {monthlyReport.total_orders || 0} total orders
                </div>
              </div>

              <div style={{ background: "var(--bg-card-subtle)", padding: "16px", borderRadius: "10px" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Monthly Expenses</div>
                <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--status-err)", marginTop: "4px" }}>
                  ₹{Number(monthlyReport.total_expenses || 0).toFixed(2)}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
                  Operating outflows
                </div>
              </div>

              <div style={{ background: "var(--bg-card-subtle)", padding: "16px", borderRadius: "10px" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Net Monthly Profit</div>
                <div
                  style={{
                    fontSize: "1.6rem",
                    fontWeight: "800",
                    color: Number(monthlyReport.net_profit || 0) >= 0 ? "var(--status-success)" : "var(--status-err)",
                    marginTop: "4px",
                  }}
                >
                  ₹{Number(monthlyReport.net_profit || 0).toFixed(2)}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
                  Margin: {monthlyReport.profit_margin_pct || 0}%
                </div>
              </div>
            </div>
          </div>

          {/* Daily Trend Table for the Month */}
          {monthlyReport.daily_trend && monthlyReport.daily_trend.length > 0 && (
            <div className="card" style={{ overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
                <h4 style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-main)" }}>
                  📈 Day-by-Day Monthly Trendline
                </h4>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th style={{ textAlign: "right" }}>Orders</th>
                      <th style={{ textAlign: "right" }}>Daily Sales</th>
                      <th style={{ textAlign: "right" }}>Daily Expenses</th>
                      <th style={{ textAlign: "right" }}>Net Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyReport.daily_trend.map((d, i) => (
                      <tr key={`trend-${d.date || i}`}>
                        <td style={{ fontWeight: "600" }}>{d.date}</td>
                        <td style={{ textAlign: "right" }}>{d.order_count}</td>
                        <td style={{ textAlign: "right", fontWeight: "700", color: "var(--color-primary)" }}>
                          ₹{Number(d.sales || 0).toFixed(2)}
                        </td>
                        <td style={{ textAlign: "right", color: "var(--status-err)" }}>
                          ₹{Number(d.expenses || 0).toFixed(2)}
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            fontWeight: "800",
                            color: Number(d.net_profit || 0) >= 0 ? "var(--status-success)" : "var(--status-err)",
                          }}
                        >
                          ₹{Number(d.net_profit || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
          Select a report tab above to view analytics.
        </div>
      )}
    </div>
  );
}
