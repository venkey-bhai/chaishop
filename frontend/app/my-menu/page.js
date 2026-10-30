"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  findCustomerOrders,
  customerEditOrder,
  getMenuCatalog,
  getBillReceipt,
} from "../../services/api";
import { printThermalBill } from "../../utils/thermalPrinter";

function MyMenuContent() {
  const searchParams = useSearchParams();
  const urlPhone = searchParams?.get("phone") || searchParams?.get("query") || "";

  const [searchQuery, setSearchQuery] = useState(urlPhone);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [orders, setOrders] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Thermal Bill Receipt Modal state
  const [thermalReceipt, setThermalReceipt] = useState(null);
  const [loadingReceiptId, setLoadingReceiptId] = useState(null);

  // Active verified customer phone used for authorization
  const [verifiedPhone, setVerifiedPhone] = useState(urlPhone.replace(/\D/g, "").slice(-10));

  // Catalog for adding new dishes
  const [catalog, setCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Edit Modal State
  const [editingOrder, setEditingOrder] = useState(null);
  const [orderDraftItems, setOrderDraftItems] = useState([]); // Array of { item_id?, menu_item_id?, name, quantity, unit_price, status, selected_options }
  const [showAddDishSection, setShowAddDishSection] = useState(false);
  const [selectedAddMenuItem, setSelectedAddMenuItem] = useState(null);
  const [addQuantity, setAddQuantity] = useState(1);
  const [savingChanges, setSavingChanges] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSuccessMsg, setEditSuccessMsg] = useState("");

  // Auto-refresh timer for customer view (Requirement 5)
  const isAutoRefreshingRef = useRef(false);

  // Try to load cached customer phone or table from localStorage on mount
  useEffect(() => {
    let initialQ = urlPhone;
    try {
      if (!initialQ) {
        initialQ = localStorage.getItem("chaiflow_customer_phone") || localStorage.getItem("chaiflow_customer_name") || "";
      }
      if (initialQ) {
        setSearchQuery(initialQ);
        const digits = initialQ.replace(/\D/g, "");
        if (digits.length >= 10) {
          setVerifiedPhone(digits.slice(-10));
        }
        performSearch(initialQ, false);
      }
    } catch {
      // ignore localStorage error
    }
    loadCatalog();
  }, [urlPhone]);

  async function loadCatalog() {
    setLoadingCatalog(true);
    try {
      const res = await getMenuCatalog();
      setCatalog(res || []);
    } catch (e) {
      console.error("Failed to load catalog for My Menu:", e);
    } finally {
      setLoadingCatalog(false);
    }
  }

  // Periodic refresh every 60 seconds to synchronize Admin changes/cancellations
  useEffect(() => {
    if (!verifiedPhone) return;

    const interval = setInterval(() => {
      performSearch(verifiedPhone, true);
    }, 60000);

    return () => clearInterval(interval);
  }, [verifiedPhone]);

  async function performSearch(queryToUse, isBackground = false) {
    const q = (queryToUse || searchQuery || "").trim();
    if (!q) {
      if (!isBackground) setSearchError("Please enter your mobile number or customer name.");
      return;
    }

    if (!isBackground) {
      setSearching(true);
      setSearchError("");
    }

    isAutoRefreshingRef.current = true;

    try {
      const results = await findCustomerOrders(q);
      setOrders(results || []);
      setHasSearched(true);

      // If user searched with phone number, remember it
      const digits = q.replace(/\D/g, "");
      if (digits.length >= 10) {
        setVerifiedPhone(digits.slice(-10));
        try {
          localStorage.setItem("chaiflow_customer_phone", digits.slice(-10));
        } catch {
          // ignore
        }
      } else if (results && results.length > 0 && results[0].customer_phone) {
        const orderPhoneDigits = results[0].customer_phone.replace(/\D/g, "");
        if (orderPhoneDigits.length >= 10) {
          setVerifiedPhone(orderPhoneDigits.slice(-10));
        }
      }
    } catch (err) {
      console.error("Search orders failed:", err);
      if (!isBackground) {
        setSearchError(err.message || "Unable to find orders. Please check your input.");
        setOrders([]);
        setHasSearched(true);
      }
    } finally {
      if (!isBackground) {
        setSearching(false);
      }
      isAutoRefreshingRef.current = false;
    }
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    performSearch(searchQuery, false);
  }

  // Open Edit Order Modal
  function handleOpenEditModal(order) {
    setEditingOrder(order);
    setEditError("");
    setEditSuccessMsg("");
    setShowAddDishSection(false);
    setSelectedAddMenuItem(null);
    setAddQuantity(1);

    // Initialize draft items from order.items
    const draft = (order.items || []).map((item) => ({
      item_id: item.id,
      menu_item_id: item.menu_item_id,
      name: item.item_name,
      quantity: item.quantity,
      unit_price: Number(item.unit_price),
      status: (item.status || "PENDING").toUpperCase(),
      cancelled_by: item.cancelled_by,
      selected_options: item.selected_options || null,
      is_new: false,
    }));
    setOrderDraftItems(draft);
  }

  // Adjust draft quantity
  function handleQuantityChange(index, delta) {
    setOrderDraftItems((prev) => {
      const next = [...prev];
      const item = next[index];

      // Cannot modify delivered or cancelled dishes
      if (item.status === "CANCELLED" || item.status === "DELIVERED" || item.status === "READY") {
        return prev;
      }

      const newQty = item.quantity + delta;
      if (newQty < 0) return prev;
      next[index] = { ...item, quantity: newQty };
      return next;
    });
  }

  // Request dish removal (sets quantity to 0)
  function handleRemoveItem(index) {
    setOrderDraftItems((prev) => {
      const next = [...prev];
      const item = next[index];
      if (item.status === "CANCELLED" || item.status === "DELIVERED" || item.status === "READY") {
        return prev;
      }
      next[index] = { ...item, quantity: 0 };
      return next;
    });
  }

  // Add new dish from catalog
  function handleAddDishToDraft() {
    if (!selectedAddMenuItem) {
      setEditError("Please select a dish to add.");
      return;
    }
    const qty = parseInt(addQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      setEditError("Quantity must be at least 1.");
      return;
    }

    setOrderDraftItems((prev) => [
      ...prev,
      {
        menu_item_id: selectedAddMenuItem.id,
        name: selectedAddMenuItem.name,
        quantity: qty,
        unit_price: Number(selectedAddMenuItem.price),
        status: "PENDING",
        selected_options: null,
        is_new: true,
      },
    ]);

    setSelectedAddMenuItem(null);
    setAddQuantity(1);
    setShowAddDishSection(false);
    setEditError("");
  }

  // Calculate Draft Order Total
  const calculatedDraftTotal = orderDraftItems.reduce((acc, it) => {
    if (it.status === "CANCELLED" || it.quantity <= 0) return acc;
    return acc + it.quantity * it.unit_price;
  }, 0);

  // Submit Customer Order Edits
  async function handleSaveOrderEdits() {
    if (!editingOrder) return;

    const phoneToUse = verifiedPhone || editingOrder.customer_phone;
    if (!phoneToUse) {
      setEditError("Please enter your registered mobile number above to authorize order changes.");
      return;
    }

    setSavingChanges(true);
    setEditError("");
    setEditSuccessMsg("");

    try {
      // Build edits payload
      const edits = [];
      for (const item of orderDraftItems) {
        if (item.is_new) {
          if (item.quantity > 0) {
            edits.push({
              menu_item_id: item.menu_item_id,
              quantity: item.quantity,
              selected_options: item.selected_options || null,
            });
          }
        } else {
          // Existing item
          // If already CANCELLED in existing order and quantity is 0 or less, skip it to avoid redundant operations
          if (item.status === "CANCELLED" && item.quantity <= 0) {
            continue;
          }
          edits.push({
            item_id: item.item_id,
            quantity: Math.max(0, item.quantity),
            selected_options: item.selected_options || null,
          });
        }
      }

      await customerEditOrder(editingOrder.id, {
        customer_phone: phoneToUse,
        edits,
      });

      const allCancelled = calculatedDraftTotal === 0;
      setEditSuccessMsg(
        allCancelled
          ? "✓ All items cancelled! Order has been closed/cancelled."
          : "✓ Order updated successfully!"
      );
      // Reload orders
      await performSearch(verifiedPhone || searchQuery, false);
      setTimeout(() => {
        setEditingOrder(null);
      }, 1200);
    } catch (err) {
      setEditError(err.message || "Failed to update order.");
    } finally {
      setSavingChanges(false);
    }
  }

  // Cancel entire order directly (all remaining dishes set to 0)
  async function handleCancelEntireOrder() {
    if (!editingOrder) return;
    const confirmCancel = window.confirm(
      `Are you sure you want to cancel Order #${editingOrder.daily_token_number}? This will cancel all remaining dishes and close the order.`
    );
    if (!confirmCancel) return;

    const phoneToUse = verifiedPhone || editingOrder.customer_phone;
    if (!phoneToUse) {
      setEditError("Please enter your registered mobile number above to authorize order cancellation.");
      return;
    }

    setSavingChanges(true);
    setEditError("");
    setEditSuccessMsg("");

    try {
      // Set all eligible active items to 0
      const edits = (editingOrder.items || [])
        .filter((it) => it.status !== "CANCELLED" && it.status !== "DELIVERED" && it.status !== "READY")
        .map((it) => ({
          item_id: it.id,
          quantity: 0,
        }));

      await customerEditOrder(editingOrder.id, {
        customer_phone: phoneToUse,
        edits,
      });

      setEditSuccessMsg("✓ Entire order has been cancelled and closed.");
      await performSearch(verifiedPhone || searchQuery, false);
      setTimeout(() => {
        setEditingOrder(null);
      }, 1200);
    } catch (err) {
      setEditError(err.message || "Failed to cancel order.");
    } finally {
      setSavingChanges(false);
    }
  }

  // Open thermal bill receipt for printing (80mm/58mm format)
  async function handleOpenThermalBill(order) {
    if (!order) return;
    try {
      setLoadingReceiptId(order.id);
      const data = await getBillReceipt(order.id);
      setThermalReceipt(data);
    } catch (e) {
      // Direct reliable fallback formatting from order object
      setThermalReceipt({
        shop_name: "ChaiFlow Tea Shop",
        tagline: "Authentic Spiced Chai & Irani Cafe Favorites",
        address: "12 Market Square, Station Road",
        phone: "+91 98840 12345",
        fssai_license: "21524012000892",
        order_id: order.id,
        order_number: order.order_number,
        daily_token_number: order.daily_token_number,
        date_time: order.created_at ? new Date(order.created_at).toLocaleString() : new Date().toLocaleString(),
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        table_or_counter: order.order_type === "TAKEAWAY" ? "🛍️ Takeaway" : `🍽️ Table #${order.table_number || "—"}${order.seat_number ? ` • Seat #${order.seat_number}` : ""}`,
        items: (order.items || [])
          .filter((it) => (it.status || "").toUpperCase() !== "CANCELLED")
          .map((it) => ({
            name: it.item_name,
            quantity: it.quantity,
            unit_price: Number(it.unit_price || 0),
            total_price: Number(it.total_price || (it.unit_price * it.quantity)),
            total: Number(it.total_price || (it.unit_price * it.quantity)),
            customizations: it.selected_options ? Object.entries(it.selected_options).map(([k, v]) => `${k}: ${v}`).join(", ") : null,
          })),
        total_amount: order.total_amount,
        payment_method: order.payment_method,
        payment_status: order.payment_status || "PENDING",
        footer_message: "Thank you for visiting ChaiFlow! Visit again for fresh chai ☕",
      });
    } finally {
      setLoadingReceiptId(null);
    }
  }

  // Helper for order status badge color
  function getOrderStatusBadge(status) {
    const s = (status || "").toUpperCase();
    if (s === "PENDING" || s === "PENDING_OTP_VERIFICATION") {
      return { bg: "#FEF3C7", color: "#B45309", label: "⏳ Pending" };
    }
    if (s === "PREPARING" || s === "CONFIRMED") {
      return { bg: "#E0F2FE", color: "#0369A1", label: "🔥 Preparing in Kitchen" };
    }
    if (s === "READY") {
      return { bg: "#DCFCE7", color: "#15803D", label: "✓ Ready for Pickup / Serving" };
    }
    if (s === "COMPLETED") {
      return { bg: "#F1F5F9", color: "#475569", label: "🍽️ Delivered" };
    }
    if (s === "CANCELLED") {
      return { bg: "#FEE2E2", color: "#B91C1C", label: "❌ Cancelled" };
    }
    return { bg: "#F3F4F6", color: "#4B5563", label: status };
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", paddingBottom: "60px" }}>
      {/* Top Navbar */}
      <header
        style={{
          background: "#FFFFFF",
          borderBottom: "1px solid #E2E8F0",
          padding: "14px 20px",
          position: "sticky",
          top: 0,
          zIndex: 40,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Link
            href="/menu"
            style={{
              textDecoration: "none",
              color: "#64748B",
              fontSize: "1.2rem",
              padding: "4px 8px",
              borderRadius: "8px",
              background: "#F1F5F9",
            }}
            title="Back to Menu"
          >
            ←
          </Link>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.15rem", fontWeight: "800", color: "#0F172A" }}>
              My Menu & Orders
            </h1>
            <p style={{ margin: 0, fontSize: "0.75rem", color: "#64748B" }}>
              Track live kitchen status and manage your order
            </p>
          </div>
        </div>

        <Link
          href="/menu"
          style={{
            background: "linear-gradient(135deg, #f59e0b, #d97706)",
            color: "#FFFFFF",
            padding: "6px 14px",
            borderRadius: "20px",
            fontSize: "0.8rem",
            fontWeight: "700",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          <span>☕</span>
          <span>View Menu</span>
        </Link>
      </header>

      <main style={{ maxWidth: "680px", margin: "0 auto", padding: "16px" }}>
        {/* Requirement 4A: Customer Identification Search Card */}
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: "16px",
            padding: "20px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
            border: "1px solid #E2E8F0",
            marginBottom: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <span style={{ fontSize: "1.3rem" }}>🔍</span>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: "700", color: "#1E293B" }}>
              Find My Orders
            </h2>
          </div>
          <p style={{ margin: "0 0 14px 0", fontSize: "0.82rem", color: "#64748B" }}>
            Enter your 10-digit mobile number or customer name used when placing your order.
          </p>

          <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="e.g. 9876543210 or Rahul"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                minWidth: "200px",
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1.5px solid #CBD5E1",
                fontSize: "0.9rem",
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={searching}
              style={{
                background: "linear-gradient(135deg, #059669, #047857)",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "10px",
                padding: "10px 18px",
                fontSize: "0.88rem",
                fontWeight: "700",
                cursor: "pointer",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {searching ? "Searching..." : "Find My Orders"}
            </button>
          </form>

          {searchError && (
            <div
              style={{
                marginTop: "10px",
                padding: "8px 12px",
                background: "#FEF2F2",
                color: "#991B1B",
                borderRadius: "8px",
                fontSize: "0.82rem",
                border: "1px solid #FECACA",
              }}
            >
              {searchError}
            </div>
          )}

          {verifiedPhone && (
            <div
              style={{
                marginTop: "12px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "#ECFDF5",
                color: "#065F46",
                padding: "4px 10px",
                borderRadius: "20px",
                fontSize: "0.75rem",
                fontWeight: "600",
              }}
            >
              <span>🔒 Verified Mobile:</span>
              <strong>+91 {verifiedPhone}</strong>
            </div>
          )}
        </div>

        {/* Orders Listing Section */}
        {searching ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748B" }}>
            <div style={{ fontSize: "2rem", marginBottom: "8px" }}>⏳</div>
            <div style={{ fontWeight: "600", fontSize: "0.95rem" }}>Looking up your orders...</div>
          </div>
        ) : hasSearched && orders.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              background: "#FFFFFF",
              borderRadius: "16px",
              padding: "40px 20px",
              border: "1px solid #E2E8F0",
            }}
          >
            <div style={{ fontSize: "2.4rem", marginBottom: "10px" }}>☕</div>
            <h3 style={{ margin: "0 0 6px 0", fontSize: "1.1rem", color: "#1E293B", fontWeight: "700" }}>
              No Orders Found
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "0.85rem", color: "#64748B" }}>
              We could not find any active or recent orders matching &ldquo;{searchQuery}&rdquo;.
            </p>
            <Link
              href="/menu"
              style={{
                display: "inline-block",
                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                color: "#fff",
                padding: "10px 20px",
                borderRadius: "8px",
                fontWeight: "700",
                fontSize: "0.88rem",
                textDecoration: "none",
              }}
            >
              Browse Menu & Order Now
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {orders.map((order) => {
              const statusBadge = getOrderStatusBadge(order.order_status);
              const isEligibleToEdit =
                order.order_status !== "COMPLETED" &&
                order.order_status !== "CANCELLED";

              return (
                <div
                  key={order.id}
                  style={{
                    background: "#FFFFFF",
                    borderRadius: "16px",
                    border: "1px solid #E2E8F0",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                    overflow: "hidden",
                  }}
                >
                  {/* Order Card Header */}
                  <div
                    style={{
                      background: "#F8FAFC",
                      padding: "12px 16px",
                      borderBottom: "1px solid #E2E8F0",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "1rem", fontWeight: "800", color: "#0F172A" }}>
                          Token #{order.daily_token_number}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "#64748B" }}>
                          ({order.order_number})
                        </span>
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#64748B", marginTop: "2px" }}>
                        {order.order_type === "TAKEAWAY"
                          ? "🛍️ Takeaway"
                          : `🍽️ Table #${order.table_number || "—"}${order.seat_number ? ` • Seat #${order.seat_number}` : ""}`}
                        {order.created_at && ` • ${new Date(order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          background: statusBadge.bg,
                          color: statusBadge.color,
                          borderRadius: "12px",
                          padding: "3px 10px",
                          fontSize: "0.76rem",
                          fontWeight: "700",
                        }}
                      >
                        {statusBadge.label}
                      </span>
                    </div>
                  </div>

                  {/* Order Line Items */}
                  <div style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {(order.items || []).map((item, idx) => {
                        const isDishCancelled = (item.status || "").toUpperCase() === "CANCELLED";
                        const isDishReady = (item.status || "").toUpperCase() === "READY";
                        const isDishDelivered = (item.status || "").toUpperCase() === "DELIVERED";

                        return (
                          <div
                            key={idx}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              fontSize: "0.88rem",
                              borderBottom: idx < order.items.length - 1 ? "1px dashed #F1F5F9" : "none",
                              paddingBottom: "8px",
                              opacity: isDishCancelled ? 0.6 : 1,
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                <span
                                  style={{
                                    fontWeight: "800",
                                    color: isDishCancelled ? "#94A3B8" : "#059669",
                                    textDecoration: isDishCancelled ? "line-through" : "none",
                                  }}
                                >
                                  {item.quantity}x
                                </span>
                                <span
                                  style={{
                                    fontWeight: "700",
                                    color: isDishCancelled ? "#94A3B8" : "#1E293B",
                                    textDecoration: isDishCancelled ? "line-through" : "none",
                                  }}
                                >
                                  {item.item_name}
                                </span>

                                {/* Status Pill (Requirement 5: Synchronize Admin Cancellation) */}
                                {isDishCancelled && (
                                  <span
                                    style={{
                                      fontSize: "0.68rem",
                                      background: "#FEE2E2",
                                      color: "#DC2626",
                                      padding: "1px 6px",
                                      borderRadius: "4px",
                                      fontWeight: "700",
                                    }}
                                  >
                                    ❌ Cancelled{item.cancelled_by ? ` by ${item.cancelled_by}` : ""}
                                  </span>
                                )}
                                {isDishReady && (
                                  <span
                                    style={{
                                      fontSize: "0.68rem",
                                      background: "#DCFCE7",
                                      color: "#16A34A",
                                      padding: "1px 6px",
                                      borderRadius: "4px",
                                      fontWeight: "700",
                                    }}
                                  >
                                    ✓ Ready
                                  </span>
                                )}
                                {isDishDelivered && (
                                  <span
                                    style={{
                                      fontSize: "0.68rem",
                                      background: "#F1F5F9",
                                      color: "#475569",
                                      padding: "1px 6px",
                                      borderRadius: "4px",
                                      fontWeight: "600",
                                    }}
                                  >
                                    🍽️ Served
                                  </span>
                                )}
                                {/* Dish Unit Price & Subtotal */}
                                <div style={{ fontSize: "0.75rem", color: isDishCancelled ? "#94A3B8" : "#64748B", marginTop: "3px" }}>
                                  ₹{Number(item.unit_price || 0).toFixed(2)} each • {item.quantity} × ₹{Number(item.unit_price || 0).toFixed(2)}
                                </div>
                              </div>

                              {item.selected_options && (
                                <div style={{ fontSize: "0.72rem", color: "#64748B", marginTop: "2px" }}>
                                  {Object.entries(item.selected_options).map(([k, v]) => `${k}: ${v}`).join(", ")}
                                </div>
                              )}
                            </div>

                            <div
                              style={{
                                fontWeight: "700",
                                color: isDishCancelled ? "#94A3B8" : "#0F172A",
                                textDecoration: isDishCancelled ? "line-through" : "none",
                              }}
                            >
                              ₹{Number(item.total_price || (item.unit_price * item.quantity)).toFixed(2)}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Order Total, Payment Summary & Print Action */}
                    <div
                      style={{
                        marginTop: "12px",
                        paddingTop: "12px",
                        borderTop: "1.5px solid #E2E8F0",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "10px",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "0.78rem", color: "#64748B" }}>
                          Payment: <strong>{order.payment_method}</strong> ({order.payment_status || "PENDING"})
                        </div>
                        <div style={{ fontSize: "1.1rem", fontWeight: "800", color: "#0F172A" }}>
                          Total: ₹{Number(order.total_amount).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Requirement 4C: Manage / Edit Order Modal */}
        {editingOrder && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "16px",
            }}
          >
            <div
              style={{
                background: "#FFFFFF",
                borderRadius: "16px",
                maxWidth: "540px",
                width: "100%",
                maxHeight: "90vh",
                overflowY: "auto",
                boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
                border: "1px solid #E2E8F0",
                padding: "20px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: "800", color: "#0F172A" }}>
                    Manage Order #{editingOrder.daily_token_number}
                  </h3>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "#64748B" }}>
                    Add dishes, change quantities, or request cancellations
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "1.4rem",
                    cursor: "pointer",
                    color: "#94A3B8",
                  }}
                >
                  ×
                </button>
              </div>

              {editError && (
                <div style={{ background: "#FEF2F2", color: "#991B1B", padding: "8px 12px", borderRadius: "8px", fontSize: "0.82rem", marginBottom: "12px" }}>
                  {editError}
                </div>
              )}

              {editSuccessMsg && (
                <div style={{ background: "#ECFDF5", color: "#065F46", padding: "8px 12px", borderRadius: "8px", fontSize: "0.82rem", marginBottom: "12px" }}>
                  {editSuccessMsg}
                </div>
              )}

              {/* Items in Draft */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
                {orderDraftItems.map((item, idx) => {
                  const isCancelled = item.status === "CANCELLED" || item.quantity === 0;
                  const isLocked = item.status === "CANCELLED" || item.status === "READY" || item.status === "DELIVERED";

                  return (
                    <div
                      key={idx}
                      style={{
                        background: isCancelled ? "#F8FAFC" : "#F1F5F9",
                        borderRadius: "10px",
                        padding: "10px 12px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        opacity: isCancelled ? 0.6 : 1,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: "700", fontSize: "0.88rem", color: isCancelled ? "#94A3B8" : "#1E293B" }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#64748B" }}>
                          ₹{item.unit_price} each • {isCancelled ? "Cancelled/Removed" : `Subtotal: ₹${item.quantity * item.unit_price}`}
                          {item.status === "CANCELLED" && item.cancelled_by && ` (Cancelled by ${item.cancelled_by})`}
                          {item.status === "READY" && " (Ready in Kitchen - Locked)"}
                        </div>
                      </div>

                      {/* Quantity Stepper or Locked Status */}
                      {!isLocked ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(idx, -1)}
                            disabled={item.quantity <= 1}
                            style={{
                              width: "28px",
                              height: "28px",
                              borderRadius: "6px",
                              border: "1px solid #CBD5E1",
                              background: "#FFFFFF",
                              cursor: "pointer",
                              fontWeight: "700",
                            }}
                          >
                            −
                          </button>
                          <span style={{ fontWeight: "800", fontSize: "0.95rem", minWidth: "20px", textAlign: "center" }}>
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(idx, 1)}
                            style={{
                              width: "28px",
                              height: "28px",
                              borderRadius: "6px",
                              border: "1px solid #CBD5E1",
                              background: "#FFFFFF",
                              cursor: "pointer",
                              fontWeight: "700",
                            }}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#DC2626",
                              cursor: "pointer",
                              fontSize: "0.8rem",
                              fontWeight: "600",
                              marginLeft: "6px",
                            }}
                            title="Remove dish"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: "0.72rem", color: "#64748B", fontStyle: "italic" }}>
                          {item.status === "CANCELLED" ? "Cancelled" : "Cannot edit"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add New Dish Section */}
              {showAddDishSection ? (
                <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "10px", padding: "12px", marginBottom: "16px" }}>
                  <div style={{ fontWeight: "700", fontSize: "0.85rem", color: "#1E293B", marginBottom: "8px" }}>
                    Add an Item to this Order
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                    <select
                      value={selectedAddMenuItem ? selectedAddMenuItem.id : ""}
                      onChange={(e) => {
                        const targetId = parseInt(e.target.value, 10);
                        let found = null;
                        for (const cat of catalog) {
                          const item = (cat.items || []).find((i) => i.id === targetId);
                          if (item) {
                            found = item;
                            break;
                          }
                        }
                        setSelectedAddMenuItem(found);
                      }}
                      style={{
                        flex: 1,
                        minWidth: "180px",
                        padding: "8px 10px",
                        borderRadius: "8px",
                        border: "1px solid #CBD5E1",
                        fontSize: "0.85rem",
                      }}
                    >
                      <option value="">-- Choose Menu Item --</option>
                      {catalog.map((cat) => (
                        <optgroup key={cat.id} label={cat.name}>
                          {(cat.items || [])
                            .filter((it) => it.is_available)
                            .map((it) => (
                              <option key={it.id} value={it.id}>
                                {it.name} (₹{it.price})
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>

                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <label style={{ fontSize: "0.8rem", fontWeight: "600" }}>Qty:</label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={addQuantity}
                        onChange={(e) => setAddQuantity(e.target.value)}
                        style={{
                          width: "60px",
                          padding: "8px 6px",
                          borderRadius: "8px",
                          border: "1px solid #CBD5E1",
                          fontSize: "0.85rem",
                          textAlign: "center",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => setShowAddDishSection(false)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#64748B",
                        fontSize: "0.8rem",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddDishToDraft}
                      style={{
                        background: "#059669",
                        color: "#FFFFFF",
                        border: "none",
                        borderRadius: "6px",
                        padding: "6px 14px",
                        fontSize: "0.8rem",
                        fontWeight: "700",
                        cursor: "pointer",
                      }}
                    >
                      Add Dish
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAddDishSection(true)}
                  style={{
                    background: "#F1F5F9",
                    border: "1px dashed #CBD5E1",
                    borderRadius: "10px",
                    padding: "8px",
                    width: "100%",
                    fontSize: "0.82rem",
                    fontWeight: "700",
                    color: "#059669",
                    cursor: "pointer",
                    marginBottom: "16px",
                  }}
                >
                  + Add Another Dish from Menu
                </button>
              )}

              {/* Order Total Preview & Action Buttons */}
              <div
                style={{
                  borderTop: "1.5px solid #E2E8F0",
                  paddingTop: "14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#64748B" }}>Updated Total</div>
                  <div
                    style={{
                      fontSize: "1.15rem",
                      fontWeight: "800",
                      color: calculatedDraftTotal === 0 ? "#DC2626" : "#0F172A",
                    }}
                  >
                    ₹{calculatedDraftTotal.toFixed(2)}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={handleCancelEntireOrder}
                    disabled={savingChanges}
                    style={{
                      background: "#FFF1F2",
                      color: "#E11D48",
                      border: "1px solid #FECDD3",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      fontSize: "0.82rem",
                      fontWeight: "700",
                      cursor: "pointer",
                    }}
                    title="Cancel all dishes and close this order immediately"
                  >
                    Cancel Entire Order
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingOrder(null)}
                    disabled={savingChanges}
                    style={{
                      background: "#F3F4F6",
                      border: "1px solid #D1D5DB",
                      borderRadius: "8px",
                      padding: "8px 14px",
                      fontSize: "0.85rem",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    Close
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveOrderEdits}
                    disabled={savingChanges}
                    style={{
                      background:
                        calculatedDraftTotal === 0
                          ? "linear-gradient(135deg, #DC2626, #B91C1C)"
                          : "linear-gradient(135deg, #059669, #047857)",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: "8px",
                      padding: "8px 18px",
                      fontSize: "0.85rem",
                      fontWeight: "700",
                      cursor: "pointer",
                      boxShadow:
                        calculatedDraftTotal === 0
                          ? "0 2px 8px rgba(220, 38, 38, 0.3)"
                          : "0 2px 8px rgba(5, 150, 105, 0.3)",
                    }}
                  >
                    {savingChanges
                      ? "Saving..."
                      : calculatedDraftTotal === 0
                      ? "Confirm Cancellation & Close"
                      : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Thermal Bill Receipt Modal (80mm / 58mm Thermal Print) */}
        {thermalReceipt && (
          <div
            data-thermal-receipt-backdrop="true"
            className="receipt-modal-backdrop"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(15, 23, 42, 0.65)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "16px",
            }}
          >
            <div
              data-thermal-receipt="true"
              className="receipt-card-container"
              style={{
                background: "#FFFFFF",
                borderRadius: "14px",
                maxWidth: "360px",
                width: "100%",
                padding: "22px 18px",
                fontFamily: "monospace",
                fontSize: "0.85rem",
                boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
                color: "#111827",
                maxHeight: "90vh",
                overflowY: "auto",
              }}
            >
              <div style={{ textAlign: "center", borderBottom: "1px dashed #666", paddingBottom: "10px", marginBottom: "10px" }}>
                <div style={{ fontSize: "1.2rem", fontWeight: "900", letterSpacing: "1px" }}>{thermalReceipt.shop_name || "ChaiFlow Tea Shop"}</div>
                <div style={{ fontSize: "0.75rem", color: "#444" }}>{thermalReceipt.tagline}</div>
                <div style={{ fontSize: "0.72rem", color: "#666" }}>{thermalReceipt.address}</div>
                {thermalReceipt.phone && <div style={{ fontSize: "0.72rem", color: "#666" }}>Phone: {thermalReceipt.phone}</div>}
                {thermalReceipt.fssai_license && <div style={{ fontSize: "0.7rem", color: "#666" }}>FSSAI: {thermalReceipt.fssai_license}</div>}
              </div>

              <div style={{ textAlign: "center", background: "#F1F5F9", padding: "6px", borderRadius: "6px", fontWeight: "900", fontSize: "1.2rem", margin: "8px 0" }}>
                TOKEN #{thermalReceipt.daily_token_number}
              </div>

              <div style={{ fontSize: "0.75rem", borderBottom: "1px dashed #666", paddingBottom: "8px", marginBottom: "8px", lineHeight: "1.4" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Order: <strong>{thermalReceipt.order_number}</strong></span>
                  <span>{thermalReceipt.date_time}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Customer: {thermalReceipt.customer_name}</span>
                  <span>{thermalReceipt.table_or_counter}</span>
                </div>
              </div>

              {/* Items Table with Dish Price */}
              <div style={{ borderBottom: "1px dashed #666", paddingBottom: "8px", marginBottom: "8px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1.1fr 1fr", fontWeight: "800", fontSize: "0.74rem", borderBottom: "1px solid #ccc", paddingBottom: "4px", marginBottom: "6px" }}>
                  <span>ITEM</span>
                  <span style={{ textAlign: "center" }}>QTY × RATE</span>
                  <span style={{ textAlign: "right" }}>AMOUNT</span>
                </div>
                {(thermalReceipt.items || []).map((it, idx) => {
                  const itemTotal = it.total_price != null ? Number(it.total_price) : (it.total != null ? Number(it.total) : (Number(it.unit_price || 0) * Number(it.quantity || 1)));
                  const unitPrice = it.unit_price != null ? Number(it.unit_price) : (it.quantity ? (itemTotal / it.quantity) : itemTotal);
                  return (
                    <div key={idx} style={{ marginBottom: "5px", fontSize: "0.82rem" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1.1fr 1fr", alignItems: "center" }}>
                        <span style={{ fontWeight: "700" }}>{it.name}</span>
                        <span style={{ textAlign: "center", fontSize: "0.75rem", color: "#333" }}>
                          {it.quantity} × ₹{unitPrice.toFixed(2)}
                        </span>
                        <span style={{ textAlign: "right", fontWeight: "800" }}>
                          ₹{itemTotal.toFixed(2)}
                        </span>
                      </div>
                      {it.customizations && (
                        <div style={{ fontSize: "0.68rem", color: "#666", fontStyle: "italic" }}>
                          {it.customizations}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "1.05rem", marginBottom: "6px" }}>
                <span>NET TOTAL:</span>
                <span>₹{Number(thermalReceipt.total_amount).toFixed(2)}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "10px" }}>
                <span>Payment Mode:</span>
                <span><strong>{thermalReceipt.payment_method}</strong> ({thermalReceipt.payment_status || "PAID"})</span>
              </div>

              <div style={{ textAlign: "center", borderTop: "1px dashed #666", paddingTop: "10px", color: "#666", fontSize: "0.75rem" }}>
                {thermalReceipt.footer_message || "Thank you! Visit again for fresh chai ☕"}
              </div>

              <div className="no-print" style={{ marginTop: "16px", display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => printThermalBill(thermalReceipt)}
                  style={{
                    flex: 1,
                    background: "#0F172A",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px",
                    fontWeight: "700",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  🖨️ Print Thermal Bill (80mm)
                </button>
                <button
                  type="button"
                  onClick={() => setThermalReceipt(null)}
                  style={{
                    flex: 1,
                    background: "#E2E8F0",
                    color: "#1E293B",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px",
                    cursor: "pointer",
                    fontWeight: "600",
                    fontSize: "0.85rem",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function MyMenuPage() {
  return (
    <Suspense fallback={<div style={{ padding: "40px", textAlign: "center" }}>Loading My Menu...</div>}>
      <MyMenuContent />
    </Suspense>
  );
}
