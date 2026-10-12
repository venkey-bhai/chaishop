"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import {
  getExpenses,
  getExpenseCategories,
  getExpenseAnalytics,
  createExpense,
  deleteExpense,
} from "../../../services/api";

export default function ExpensesPage() {
  const { getValidAdminToken } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [analytics, setAnalytics] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState("");

  // Filters
  const [filterCat, setFilterCat] = useState("all");
  const [filterToday, setFilterToday] = useState(false);
  const [search, setSearch] = useState("");

  // Add Expense Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCat, setNewCat] = useState("Milk");
  const [customCat, setCustomCat] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newMethod, setNewMethod] = useState("CASH");
  const [newDate, setNewDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadExpenses(cat = filterCat, today = filterToday, query = search) {
    setLoading(true);
    setActionMsg("");
    try {
      const token = await getValidAdminToken();
      const [listRes, anaRes, catRes] = await Promise.all([
        getExpenses(
          {
            page: 1,
            limit: 50,
            category: cat !== "all" ? cat : "",
            today_only: today,
            search: query,
          },
          token
        ),
        getExpenseAnalytics(token).catch(() => null),
        getExpenseCategories(token).catch(() => []),
      ]);

      setExpenses(listRes?.items || []);
      setTotalCount(listRes?.total || 0);
      setTotalAmount(listRes?.total_amount || 0);
      setAnalytics(anaRes);
      setCategories(catRes || []);
    } catch (err) {
      console.error("Failed to load expenses:", err);
      setActionMsg(`Failed to load expenses: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadExpenses();
  }, []);

  async function handleAddExpenseSubmit(e) {
    e.preventDefault();
    if (!newAmount || Number(newAmount) <= 0) {
      setActionMsg("Please enter an amount greater than ₹0.");
      return;
    }
    if (!newDesc.trim()) {
      setActionMsg("Please enter an expense description or vendor details.");
      return;
    }

    setSubmitting(true);
    setActionMsg("");
    try {
      const token = await getValidAdminToken();
      const catToUse = newCat === "Custom" ? customCat.trim() : newCat;
      if (!catToUse) {
        setActionMsg("Please specify a valid category.");
        return;
      }

      await createExpense(
        {
          category: catToUse,
          description: newDesc.trim(),
          amount: Number(newAmount),
          payment_method: newMethod,
          expense_date: newDate || undefined,
        },
        token
      );

      setActionMsg(`Recorded expense: ₹${newAmount} for ${catToUse}!`);
      setShowAddModal(false);
      setNewDesc("");
      setNewAmount("");
      setCustomCat("");
      setNewDate("");
      await loadExpenses();
    } catch (err) {
      setActionMsg(`Failed to record expense: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id, category, amount) {
    if (!window.confirm(`Delete expense record #${id} (${category} ₹${amount})?`)) {
      return;
    }
    setActionMsg("");
    try {
      const token = await getValidAdminToken();
      await deleteExpense(id, token);
      setActionMsg(`Deleted expense #${id} successfully.`);
      await loadExpenses();
    } catch (err) {
      setActionMsg(`Failed to delete expense: ${err.message}`);
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
            📉 Operating Expenses & Inventory Procurement
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: "4px" }}>
            Record daily milk, tea powder, LPG cylinders, wages, and store maintenance costs.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={() => setShowAddModal(true)} className="btn-primary" style={{ fontSize: "0.88rem", padding: "8px 16px" }}>
            + Record Expense
          </button>
          <button onClick={() => loadExpenses()} disabled={loading} className="btn-secondary" style={{ fontSize: "0.88rem", padding: "8px 16px" }}>
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

      {/* Analytics KPI Summary */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Total Recorded Expenses
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--status-err)", marginTop: "4px" }}>
            ₹{totalAmount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
            {totalCount} expense vouchers
          </div>
        </div>

        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Today's Outlays
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--text-main)", marginTop: "4px" }}>
            ₹{analytics?.today_total ?? 0}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
            Daily cash expenditures
          </div>
        </div>

        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Top Expense Driver
          </div>
          <div style={{ fontSize: "1.3rem", fontWeight: "800", color: "var(--color-primary)", marginTop: "4px" }}>
            {analytics?.top_category ? `${analytics.top_category.category}` : "None"}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
            ₹{analytics?.top_category?.total_amount ?? 0}
          </div>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Search expense description or vendor..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              loadExpenses(filterCat, filterToday, e.target.value);
            }}
            style={{ flex: 1, minWidth: "220px" }}
          />

          <select
            value={filterCat}
            onChange={(e) => {
              setFilterCat(e.target.value);
              loadExpenses(e.target.value, filterToday, search);
            }}
            style={{ minWidth: "180px" }}
          >
            <option value="all">All Categories</option>
            {categories.map((c, i) => (
              <option key={i} value={c}>{c}</option>
            ))}
          </select>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", cursor: "pointer", fontWeight: "500" }}>
            <input
              type="checkbox"
              checked={filterToday}
              onChange={(e) => {
                setFilterToday(e.target.checked);
                loadExpenses(filterCat, e.target.checked, search);
              }}
            />
            Today only
          </label>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-main)" }}>
            📜 Expense Records ({expenses.length})
          </h3>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Voucher #</th>
                <th>Category</th>
                <th>Description / Vendor</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Date</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
                    Loading expenses...
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
                    No expense records found.
                  </td>
                </tr>
              ) : (
                expenses.map((exp) => (
                  <tr key={exp.id}>
                    <td style={{ fontFamily: "monospace", fontSize: "0.82rem" }}>#{exp.id}</td>
                    <td>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: "700",
                          padding: "3px 8px",
                          borderRadius: "6px",
                          background: "var(--bg-card-subtle)",
                          color: "var(--text-main)",
                        }}
                      >
                        {exp.category}
                      </span>
                    </td>
                    <td style={{ fontWeight: "500" }}>{exp.description}</td>
                    <td style={{ fontWeight: "800", color: "var(--status-err)", fontSize: "0.95rem" }}>
                      ₹{exp.amount}
                    </td>
                    <td>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {exp.payment_method}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                      {exp.expense_date ? new Date(exp.expense_date).toLocaleDateString() : "-"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        onClick={() => handleDelete(exp.id, exp.category, exp.amount)}
                        style={{
                          background: "transparent",
                          border: "1px solid #FECACA",
                          color: "var(--status-err)",
                          borderRadius: "6px",
                          padding: "4px 8px",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Expense Modal */}
      {showAddModal && (
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
          <div className="card" style={{ maxWidth: "480px", width: "100%", padding: "24px", boxShadow: "var(--shadow-modal)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "1.15rem", fontWeight: "700", color: "var(--text-main)" }}>
                Record Operating Expense
              </h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.2rem", color: "var(--text-muted)" }}>
                ✕
              </button>
            </div>

            <form onSubmit={handleAddExpenseSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  Category *
                </label>
                <select value={newCat} onChange={(e) => setNewCat(e.target.value)} style={{ width: "100%" }}>
                  <option value="Milk">🥛 Milk (Daily Dairy)</option>
                  <option value="Tea Powder">🍃 Tea Powder (Assam / CTC)</option>
                  <option value="Sugar">🍬 Sugar Wholesale</option>
                  <option value="Gas Cylinders">🔥 Gas Cylinders (Commercial LPG)</option>
                  <option value="Spices & Raw Materials">🌿 Spices (Ginger, Cardamom, Cloves)</option>
                  <option value="Cleaning & Packaging">📦 Packaging & Paper Cups</option>
                  <option value="Electricity">⚡ Electricity Bill</option>
                  <option value="Rent">🏠 Shop Premises Rent</option>
                  <option value="Staff Salary">👨‍🍳 Staff Salary / Daily Wages</option>
                  <option value="Maintenance">🔧 Maintenance & Filter Service</option>
                  <option value="Other">🏷️ Other Miscellaneous</option>
                  <option value="Custom">+ Custom Category...</option>
                </select>
              </div>

              {newCat === "Custom" && (
                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                    Custom Category Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ice Bags, Bakery Wholesale"
                    value={customCat}
                    onChange={(e) => setCustomCat(e.target.value)}
                    required
                    style={{ width: "100%" }}
                  />
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 450"
                    min="1"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    required
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                    Payment Method
                  </label>
                  <select value={newMethod} onChange={(e) => setNewMethod(e.target.value)} style={{ width: "100%" }}>
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CARD">Card</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  Description / Vendor Details *
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. 10 Liters Full Cream Milk from Vijaya Dairy"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  required
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  Expense Date (Leave empty for today)
                </label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? "Saving..." : "Save Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
