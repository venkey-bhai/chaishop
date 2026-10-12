"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../context/AuthContext";
import {
  getCustomers,
  createCustomer,
  updateCustomerCreditStatus,
} from "../../../services/api";

export default function CustomersPage() {
  const router = useRouter();
  const { getValidAdminToken } = useAuth();
  const [customerData, setCustomerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCredit, setFilterCredit] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  // New customer form state
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  async function loadCustomers(searchQuery = search, creditFilter = filterCredit) {
    setLoading(true);
    setActionMsg("");
    try {
      const token = await getValidAdminToken();
      const res = await getCustomers(
        {
          search: searchQuery,
          is_credit_eligible: creditFilter === "" ? null : creditFilter === "true",
          page: 1,
          limit: 50,
        },
        token
      );
      setCustomerData(res);
    } catch (err) {
      console.error("Failed to load customers:", err);
      setActionMsg(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  async function handleToggleCredit(customer) {
    setActionMsg("");
    try {
      const token = await getValidAdminToken();
      const newStatus = !customer.is_credit_eligible;
      const newLimit = newStatus
        ? Number(customer.credit_limit) > 0
          ? customer.credit_limit
          : 500
        : 0;

      await updateCustomerCreditStatus(
        customer.id,
        { is_credit_eligible: newStatus, credit_limit: newLimit },
        token
      );
      setActionMsg(
        `Rule 61 Applied: Credit for ${customer.name} is now ${
          newStatus ? `ENABLED (Limit: ₹${newLimit})` : "DISABLED"
        }`
      );
      await loadCustomers();
    } catch (err) {
      setActionMsg(`Credit update failed: ${err.message}`);
    }
  }

  async function handleCreateCustomer(e) {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) {
      setActionMsg("Please provide both customer name and mobile number.");
      return;
    }
    setFormLoading(true);
    setActionMsg("");
    try {
      const token = await getValidAdminToken();
      await createCustomer(
        {
          name: newName.trim(),
          phone: newPhone.trim(),
          mobile_number: newPhone.trim(),
          email: newEmail.trim() || undefined,
        },
        token
      );
      setActionMsg(`Customer ${newName} added successfully!`);
      setShowAddModal(false);
      setNewName("");
      setNewPhone("");
      setNewEmail("");
      await loadCustomers();
    } catch (err) {
      setActionMsg(`Failed to add customer: ${err.message}`);
    } finally {
      setFormLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Page Header Card */}
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
            👥 Customer Directory & Credit Profiles
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: "4px" }}>
            Search customer records, view khata balances, and enforce Rule 61 (Admin-only credit eligibility approval & limit adjustments).
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={() => setShowAddModal(true)} className="btn-primary" style={{ fontSize: "0.88rem", padding: "8px 16px" }}>
            + Add Customer
          </button>
          <button onClick={() => loadCustomers()} disabled={loading} className="btn-secondary" style={{ fontSize: "0.88rem", padding: "8px 16px" }}>
            {loading ? "Refreshing..." : "↻ Refresh"}
          </button>
        </div>
      </div>

      {actionMsg && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            background: actionMsg.startsWith("Error") || actionMsg.startsWith("Failed") ? "#FEF2F2" : "#F0FDF4",
            border: `1px solid ${actionMsg.startsWith("Error") || actionMsg.startsWith("Failed") ? "#FECACA" : "#BBF7D0"}`,
            color: actionMsg.startsWith("Error") || actionMsg.startsWith("Failed") ? "var(--status-err)" : "var(--status-success)",
            fontSize: "0.88rem",
            fontWeight: "500",
          }}
        >
          {actionMsg}
        </div>
      )}

      {/* Search and Filters Toolbar */}
      <div className="card" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: "260px" }}>
            <input
              type="text"
              placeholder="Search by customer name, phone number, or email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                loadCustomers(e.target.value, filterCredit);
              }}
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ minWidth: "200px" }}>
            <select
              value={filterCredit}
              onChange={(e) => {
                setFilterCredit(e.target.value);
                loadCustomers(search, e.target.value);
              }}
              style={{ width: "100%" }}
            >
              <option value="">All Customer Types</option>
              <option value="true">Credit Approved Only (Rule 61)</option>
              <option value="false">Prepaid / Cash Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Customer Data Table */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: "600", color: "var(--text-main)" }}>
            Customer Records ({customerData?.total ?? 0})
          </h3>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Showing {customerData?.items?.length ?? 0} results
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Mobile Number</th>
                <th>Rule 61 Credit Eligibility</th>
                <th>Credit Limit</th>
                <th>Current Balance</th>
                <th>Total Spent</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                    Loading customer records...
                  </td>
                </tr>
              ) : !customerData?.items || customerData.items.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                    No customer records found matching the filter.
                  </td>
                </tr>
              ) : (
                customerData.items.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/admin/customers/${c.id}`)}
                    style={{
                      cursor: "pointer",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(2, 132, 199, 0.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                    title={`Click to view complete purchase history & credit statement for ${c.name}`}
                  >
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontWeight: "600", color: "var(--brand-primary, #0284c7)" }}>
                          {c.name}
                        </span>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", background: "var(--bg-muted, #f1f5f9)", padding: "1px 5px", borderRadius: "4px" }}>
                          #{c.id}
                        </span>
                      </div>
                      {c.email && <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{c.email}</div>}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
                      {c.phone || c.mobile_number}
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: "600",
                          padding: "3px 10px",
                          borderRadius: "12px",
                          background: c.is_credit_eligible ? "rgba(22, 163, 74, 0.12)" : "rgba(100, 116, 139, 0.12)",
                          color: c.is_credit_eligible ? "var(--status-success)" : "var(--text-muted)",
                          display: "inline-block",
                        }}
                      >
                        {c.is_credit_eligible ? "✓ Credit Approved" : "✗ Prepaid Only"}
                      </span>
                    </td>
                    <td style={{ fontWeight: "600" }}>
                      ₹{Number(c.credit_limit || 0).toFixed(2)}
                    </td>
                    <td style={{ fontWeight: "600", color: Number(c.current_balance) > 0 ? "var(--status-err)" : "var(--status-success)" }}>
                      ₹{Number(c.current_balance || 0).toFixed(2)}
                    </td>
                    <td style={{ fontWeight: "600" }}>
                      ₹{Number(c.total_spent || 0).toFixed(2)}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", alignItems: "center" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleCredit(c);
                          }}
                          style={{
                            background: c.is_credit_eligible ? "rgba(220, 38, 38, 0.1)" : "rgba(22, 163, 74, 0.1)",
                            color: c.is_credit_eligible ? "var(--status-err)" : "var(--status-success)",
                            border: `1px solid ${c.is_credit_eligible ? "rgba(220, 38, 38, 0.25)" : "rgba(22, 163, 74, 0.25)"}`,
                            borderRadius: "6px",
                            padding: "6px 12px",
                            fontSize: "0.78rem",
                            fontWeight: "600",
                            cursor: "pointer",
                          }}
                        >
                          {c.is_credit_eligible ? "Revoke Credit" : "Approve Credit"}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/admin/customers/${c.id}`);
                          }}
                          className="btn-secondary"
                          style={{
                            padding: "6px 12px",
                            fontSize: "0.78rem",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                          title="View complete purchase history & credit statement"
                        >
                          Details ➔
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Customer Modal */}
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
                Add New Customer
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.2rem", color: "var(--text-muted)" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  Customer Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Kumar"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  Mobile Number *
                </label>
                <input
                  type="tel"
                  placeholder="10-digit mobile number"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  required
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  placeholder="customer@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={formLoading} className="btn-primary">
                  {formLoading ? "Saving..." : "Save Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
