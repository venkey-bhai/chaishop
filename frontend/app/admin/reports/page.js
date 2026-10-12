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

  // Custom date for daily report
  const [selectedDate, setSelectedDate] = useState("");

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
          <button onClick={() => loadReport(activeTab, selectedDate)} disabled={loading} className="btn-secondary" style={{ fontSize: "0.88rem", padding: "8px 16px" }}>
            {loading ? "Refreshing..." : "↻ Refresh Report"}
          </button>
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
          Loading financial report data...
        </div>
      ) : activeTab === "daily" && dailyReport ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Daily Statement Header with Date Picker */}
          <div className="card" style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "700", color: "var(--text-main)" }}>
                Statement Date: {dailyReport.report_date}
              </h3>
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
                style={{ fontSize: "0.85rem", padding: "6px 10px" }}
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
                ₹{dailyReport.total_billed_sales}
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
                ₹{dailyReport.actual_cash_inflow}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
                Cash ₹{dailyReport.cash_sales} + UPI ₹{dailyReport.upi_sales}
              </div>
            </div>

            <div className="card" style={{ padding: "18px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
                Daily Expenses
              </div>
              <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "var(--status-err)", marginTop: "4px" }}>
                ₹{dailyReport.total_expenses}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
                Operating outflows
              </div>
            </div>

            <div className="card" style={{ padding: "18px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
                Net Operating Profit
              </div>
              <div style={{ fontSize: "1.8rem", fontWeight: "800", color: Number(dailyReport.net_operating_profit) >= 0 ? "var(--status-success)" : "var(--status-err)", marginTop: "4px" }}>
                ₹{dailyReport.net_operating_profit}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
                Inflow minus outlays
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === "products" && productReport ? (
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-main)" }}>
              ☕ Menu Item Sales & Margin Rankings
            </h3>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>Category</th>
                  <th>Menu Price</th>
                  <th>Units Sold</th>
                  <th>Total Revenue</th>
                  <th>Revenue Share</th>
                </tr>
              </thead>
              <tbody>
                {productReport.products?.map((p, idx) => (
                  <tr key={idx}>
                    <td>
                      <div style={{ fontWeight: "700", color: "var(--text-main)" }}>{p.item_name}</div>
                    </td>
                    <td>{p.category}</td>
                    <td style={{ fontWeight: "600" }}>₹{p.price}</td>
                    <td style={{ fontWeight: "700" }}>{p.total_quantity_sold} cups</td>
                    <td style={{ fontWeight: "800", color: "var(--color-primary)" }}>₹{p.total_revenue}</td>
                    <td>
                      <span style={{ fontSize: "0.78rem", background: "var(--bg-card-subtle)", padding: "3px 8px", borderRadius: "6px" }}>
                        {p.revenue_share_pct || 0}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === "credit" && creditReport ? (
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-main)" }}>
              💳 Credit Risk & Debt Exposure Ledger
            </h3>
            <span style={{ fontSize: "0.85rem", color: "var(--chai-gold)", fontWeight: "600" }}>
              Total Outstanding: ₹{creditReport.total_outstanding_credit}
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone Number</th>
                  <th>Approved Limit</th>
                  <th>Current Debt</th>
                  <th>Exposure %</th>
                  <th>Risk Tier</th>
                </tr>
              </thead>
              <tbody>
                {creditReport.accounts?.map((acc, idx) => (
                  <tr key={idx}>
                    <td>
                      <strong>{acc.customer_name}</strong>
                    </td>
                    <td style={{ fontFamily: "monospace" }}>{acc.mobile_number}</td>
                    <td>₹{acc.credit_limit}</td>
                    <td style={{ fontWeight: "800", color: "var(--status-err)" }}>₹{acc.current_balance}</td>
                    <td>{acc.utilization_pct || 0}%</td>
                    <td>
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
                        {acc.is_high_risk ? "⚠️ HIGH RISK" : "✓ NORMAL"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === "forecast" && forecastData ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* AI Forecast Overview */}
          <div className="card" style={{ padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <span style={{ fontSize: "1.6rem" }}>🤖</span>
              <h3 style={{ fontSize: "1.15rem", fontWeight: "700", color: "var(--text-main)" }}>
                Predictive AI Sales & Raw Material Demand
              </h3>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
              Forecasted for tomorrow ({forecastData.forecast_date}) based on 7-day weighted moving averages.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
            <div className="card" style={{ padding: "18px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
                Predicted Tomorrow Sales
              </div>
              <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "var(--color-primary)", marginTop: "4px" }}>
                ₹{forecastData.predicted_sales}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
                Estimated revenue
              </div>
            </div>

            <div className="card" style={{ padding: "18px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "600" }}>
                Predicted Order Cups
              </div>
              <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "var(--text-main)", marginTop: "4px" }}>
                {forecastData.predicted_order_count}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
                Estimated cups volume
              </div>
            </div>
          </div>

          {/* Raw Material Requirements */}
          <div className="card" style={{ padding: "20px" }}>
            <h4 style={{ fontSize: "1rem", fontWeight: "700", marginBottom: "16px", color: "var(--text-main)" }}>
              📦 Estimated Daily Raw Material Procurement Needs
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
              {forecastData.material_needs?.map((mat, i) => (
                <div key={i} style={{ background: "var(--bg-card-subtle)", padding: "14px", borderRadius: "10px", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: "600" }}>
                    {mat.material_name}
                  </div>
                  <div style={{ fontSize: "1.4rem", fontWeight: "800", color: "var(--text-main)", marginTop: "4px" }}>
                    {mat.estimated_daily_need} <span style={{ fontSize: "0.85rem", fontWeight: "normal" }}>{mat.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : activeTab === "monthly" && monthlyReport ? (
        <div className="card" style={{ padding: "24px" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: "700", marginBottom: "16px", color: "var(--text-main)" }}>
            📅 Monthly Performance Summary ({monthlyReport.month}/{monthlyReport.year})
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
            <div style={{ background: "var(--bg-card-subtle)", padding: "16px", borderRadius: "10px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Monthly Sales</div>
              <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--color-primary)", marginTop: "4px" }}>
                ₹{monthlyReport.total_sales || 0}
              </div>
            </div>
            <div style={{ background: "var(--bg-card-subtle)", padding: "16px", borderRadius: "10px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Monthly Expenses</div>
              <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--status-err)", marginTop: "4px" }}>
                ₹{monthlyReport.total_expenses || 0}
              </div>
            </div>
            <div style={{ background: "var(--bg-card-subtle)", padding: "16px", borderRadius: "10px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Net Monthly Margin</div>
              <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--status-success)", marginTop: "4px" }}>
                ₹{monthlyReport.net_margin || 0}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
          Select a report tab above to view analytics.
        </div>
      )}
    </div>
  );
}
