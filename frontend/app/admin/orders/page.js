"use client";
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import {
  getTodayTokens,
  getDailyTokenStats,
  updateOrderStatus,
  adminOrderOverride,
  updateOrderTableSeat,
  shareOrderDish,
  reverseSharedDish,
  getDiningTables,
  getAllDiningTables,
  createOrUpdateDiningTable,
  updateDiningTableCapacity,
  deleteDiningTable,
  updateDishStatus,
  cancelIndividualDish,
  getBillReceipt,
} from "../../../services/api";
import { printThermalBill } from "../../../utils/thermalPrinter";

const STATUS_LABELS = {
  PENDING_OTP_VERIFICATION: { label: "⏳ Awaiting OTP", color: "#D97706", bg: "#FEF3C7" },
  VERIFICATION_EXPIRED: { label: "Expired OTP", color: "#64748B", bg: "#F1F5F9" },
  PENDING: { label: "Pending", color: "#D97706", bg: "#FEF3C7" },
  CONFIRMED: { label: "Confirmed / Queued", color: "#2563EB", bg: "#EFF6FF" },
  PREPARING: { label: "Brewing / Preparing", color: "#0284C7", bg: "#E0F2FE" },
  READY: { label: "Ready for Pickup", color: "#16A34A", bg: "#DCFCE7" },
  COMPLETED: { label: "Delivered & Closed", color: "#475569", bg: "#F1F5F9" },
  CANCELLED: { label: "Cancelled", color: "#DC2626", bg: "#FEE2E2" },
};

export default function OrdersPage() {
  const { getValidAdminToken } = useAuth();
  const [tokensData, setTokensData] = useState(null);
  const [tokenStats, setTokenStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState("all");
  const [dateScope, setDateScope] = useState("all"); // "all" | "today" | "backlog"
  const [backlogSearch, setBacklogSearch] = useState("");
  const [actionMsg, setActionMsg] = useState("");

  // Admin Override Modal State
  const [overrideModalOrder, setOverrideModalOrder] = useState(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideError, setOverrideError] = useState("");

  // Table & Seat Change Modal State
  const [changeTableModalOrder, setChangeTableModalOrder] = useState(null);
  const [changeTableNo, setChangeTableNo] = useState("");
  const [changeSeatNo, setChangeSeatNo] = useState("");
  const [changeTableSubmitting, setChangeTableSubmitting] = useState(false);
  const [changeTableError, setChangeTableError] = useState("");

  // Share Dish Modal State
  const [shareModalItem, setShareModalItem] = useState(null); // { order, item }
  const [destTableNumber, setDestTableNumber] = useState("");
  const [destSeatNumber, setDestSeatNumber] = useState("");
  const [shareQuantity, setShareQuantity] = useState(1);
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [shareError, setShareError] = useState("");

  // Table Capacity & Seat Management State (Requirement 4)
  const [diningTables, setDiningTables] = useState([]);
  const [showTableModal, setShowTableModal] = useState(false);
  const [allTablesList, setAllTablesList] = useState([]);
  const [tableModalLoading, setTableModalLoading] = useState(false);
  const [tableModalMsg, setTableModalMsg] = useState("");
  const [manageTableNumber, setManageTableNumber] = useState("");
  const [manageMaxSeats, setManageMaxSeats] = useState(4);
  const [manageIsActive, setManageIsActive] = useState(true);

  // Dish completion and cancellation action states (Requirement 2)
  const [dishActionLoading, setDishActionLoading] = useState({}); // { [`${orderId}_${itemId}`]: boolean }
  const [dishCancelModal, setDishCancelModal] = useState(null); // { order, item }
  const [dishCancelReason, setDishCancelReason] = useState("");
  const [dishCancelSubmitting, setDishCancelSubmitting] = useState(false);
  const [dishCancelError, setDishCancelError] = useState("");

  // Thermal Bill Receipt Modal state
  const [thermalReceipt, setThermalReceipt] = useState(null);
  const [loadingReceiptId, setLoadingReceiptId] = useState(null);

  const isRefreshingRef = React.useRef(false);

  // Open formatted thermal bill receipt for 80mm/58mm printing
  async function handleOpenThermalBill(order) {
    if (!order) return;
    const orderId = order.order_id || order.id;
    try {
      setLoadingReceiptId(orderId);
      const data = await getBillReceipt(orderId);
      setThermalReceipt(data);
    } catch (e) {
      setThermalReceipt({
        shop_name: "ChaiFlow Tea Shop",
        tagline: "Authentic Spiced Chai & Irani Cafe Favorites",
        address: "12 Market Square, Station Road",
        phone: "+91 98840 12345",
        fssai_license: "21524012000892",
        order_id: orderId,
        order_number: order.order_number,
        daily_token_number: order.daily_token_number || order.token_number,
        date_time: order.created_at ? new Date(order.created_at).toLocaleString() : new Date().toLocaleString(),
        customer_name: order.customer_name || "Guest Customer",
        customer_phone: order.customer_phone || "",
        table_or_counter: order.order_type === "TAKEAWAY" ? "🛍️ Takeaway" : `🍽️ Table #${order.table_number || "—"}${order.seat_number ? ` • Seat #${order.seat_number}` : ""}`,
        items: (order.items || [])
          .filter((it) => (it.status || "").toUpperCase() !== "CANCELLED")
          .map((it) => ({
            name: it.item_name || it.name,
            quantity: it.quantity,
            unit_price: Number(it.unit_price || 0),
            total_price: Number(it.total_price || (it.unit_price * it.quantity)),
            total: Number(it.total_price || (it.unit_price * it.quantity)),
            customizations: it.selected_options ? Object.entries(it.selected_options).map(([k, v]) => `${k}: ${v}`).join(", ") : null,
          })),
        total_amount: order.total_amount,
        payment_method: order.payment_method || "CASH",
        payment_status: order.payment_status || "PENDING",
        footer_message: "Thank you for visiting ChaiFlow! Visit again for fresh chai ☕",
      });
    } finally {
      setLoadingReceiptId(null);
    }
  }

  async function loadOrders(isBackground = false) {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    if (!isBackground) {
      setLoading(true);
    }
    try {
      const [tokensRes, statsRes, tablesRes] = await Promise.all([
        getTodayTokens(),
        getDailyTokenStats().catch(() => null),
        getDiningTables().catch(() => []),
      ]);
      setTokensData(tokensRes);
      setTokenStats(statsRes);
      setDiningTables(tablesRes || []);
    } catch (err) {
      console.error("Failed to load token queue:", err);
      if (!isBackground) {
        setActionMsg(`Failed to load orders: ${err.message}`);
      }
    } finally {
      if (!isBackground) {
        setLoading(false);
      }
      isRefreshingRef.current = false;
    }
  }

  useEffect(() => {
    loadOrders(false);
    // Poll every 60 seconds (1 minute) for live order and token updates without reloading page
    const interval = setInterval(() => {
      loadOrders(true);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Admin Dish Completion Toggle Handler (Requirement 2A)
  async function handleToggleDishCompletion(order, item) {
    const key = `${order.order_id || order.id}_${item.id}`;
    if (dishActionLoading[key]) return;

    const currentStatus = (item.status || "PENDING").toUpperCase();
    const nextStatus = currentStatus === "READY" ? "PENDING" : "READY";

    setDishActionLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const token = await getValidAdminToken();
      await updateDishStatus(order.order_id || order.id, item.id, nextStatus, token);
      setActionMsg(`Dish '${item.item_name}' in Order #${order.daily_token_number || order.order_number} marked as ${nextStatus}!`);
      await loadOrders(true);
    } catch (err) {
      setActionMsg(`Failed to update dish status: ${err.message}`);
    } finally {
      setDishActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  }

  // Admin Dish Cancellation Confirm Handler (Requirement 2B)
  async function handleConfirmCancelDish() {
    if (!dishCancelModal) return;
    const { order, item } = dishCancelModal;
    setDishCancelSubmitting(true);
    setDishCancelError("");
    try {
      const token = await getValidAdminToken();
      await cancelIndividualDish(order.order_id || order.id, item.id, dishCancelReason || null, token);
      setActionMsg(`Dish '${item.item_name}' in Order #${order.daily_token_number || order.order_number} has been cancelled.`);
      setDishCancelModal(null);
      setDishCancelReason("");
      await loadOrders(true);
    } catch (err) {
      setDishCancelError(err.message || "Failed to cancel dish.");
    } finally {
      setDishCancelSubmitting(false);
    }
  }

  async function loadAllTablesForManage() {
    setTableModalLoading(true);
    setTableModalMsg("");
    try {
      const token = await getValidAdminToken();
      const res = await getAllDiningTables(token);
      setAllTablesList(res || []);
    } catch (err) {
      setTableModalMsg(`Failed to load tables: ${err.message}`);
    } finally {
      setTableModalLoading(false);
    }
  }

  async function handleSaveTable(e) {
    e.preventDefault();
    if (!manageTableNumber.trim()) {
      setTableModalMsg("Please enter a valid table number.");
      return;
    }
    const seats = parseInt(manageMaxSeats, 10);
    if (isNaN(seats) || seats < 1 || seats > 50) {
      setTableModalMsg("Seat capacity must be between 1 and 50 seats.");
      return;
    }
    setTableModalLoading(true);
    setTableModalMsg("");
    try {
      const token = await getValidAdminToken();
      await createOrUpdateDiningTable(
        {
          table_number: manageTableNumber.trim(),
          max_seats: seats,
          is_active: manageIsActive,
        },
        token
      );
      setTableModalMsg(`✓ Table #${manageTableNumber.trim()} saved with maximum of ${seats} seats!`);
      setManageTableNumber("");
      setManageMaxSeats(4);
      setManageIsActive(true);
      await loadAllTablesForManage();
      const updatedActive = await getDiningTables().catch(() => []);
      setDiningTables(updatedActive || []);
    } catch (err) {
      setTableModalMsg(`Failed to save table: ${err.message}`);
    } finally {
      setTableModalLoading(false);
    }
  }

  async function handleToggleTableActive(tbl) {
    setTableModalLoading(true);
    try {
      const token = await getValidAdminToken();
      await updateDiningTableCapacity(tbl.table_number, { is_active: !tbl.is_active }, token);
      await loadAllTablesForManage();
      const updatedActive = await getDiningTables().catch(() => []);
      setDiningTables(updatedActive || []);
    } catch (err) {
      setTableModalMsg(`Failed to toggle table status: ${err.message}`);
    } finally {
      setTableModalLoading(false);
    }
  }

  async function handleStatusChange(orderId, newStatus, tokenNumber) {
    setActionMsg("");
    try {
      const token = await getValidAdminToken();
      await updateOrderStatus(orderId, newStatus, token);
      if (newStatus === "CANCELLED") {
        setActionMsg(`Token #${tokenNumber} cancelled! Quantities have been added back to the menu stock.`);
      } else {
        setActionMsg(`Token #${tokenNumber} updated to ${newStatus}!`);
      }
      await loadOrders();
    } catch (err) {
      setActionMsg(`Failed to update order status: ${err.message}`);
    }
  }

  async function handleConfirmOverride() {
    if (!overrideReason.trim() || overrideReason.trim().length < 5) {
      setOverrideError("Please provide an audit reason (minimum 5 characters).");
      return;
    }
    setOverrideSubmitting(true);
    setOverrideError("");
    try {
      const token = await getValidAdminToken();
      const res = await adminOrderOverride(overrideModalOrder.order_id, overrideReason.trim(), token);
      setOverrideModalOrder(null);
      setOverrideReason("");
      setActionMsg(`Order #${res.order?.order_number || overrideModalOrder.order_number} manually confirmed via admin override!`);
      await loadOrders();
    } catch (err) {
      setOverrideError(err.message || "Failed to confirm override.");
    } finally {
      setOverrideSubmitting(false);
    }
  }

  async function handleConfirmTableSeatChange() {
    const cleanTable = changeTableNo.trim();
    const cleanSeat = changeSeatNo.trim();
    if (!cleanTable || !cleanSeat) {
      setChangeTableError("Both Table Number and Seat Number are required.");
      return;
    }

    // Capacity validation against configured tables (Requirement 4)
    const tableConfig = diningTables.find((t) => t.table_number.toLowerCase() === cleanTable.toLowerCase());
    if (tableConfig) {
      const seatNum = parseInt(cleanSeat, 10);
      if (isNaN(seatNum) || seatNum < 1 || seatNum > tableConfig.max_seats) {
        setChangeTableError(`Table ${tableConfig.table_number} has a maximum of ${tableConfig.max_seats} seats. Please select a seat between 1 and ${tableConfig.max_seats}.`);
        return;
      }
    }

    setChangeTableSubmitting(true);
    setChangeTableError("");
    try {
      const token = await getValidAdminToken();
      await updateOrderTableSeat(
        changeTableModalOrder.order_id,
        { table_number: cleanTable, seat_number: cleanSeat },
        token
      );
      setActionMsg(`Table/Seat updated for Order #${changeTableModalOrder.order_number}: Table #${cleanTable}, Seat #${cleanSeat}`);
      setChangeTableModalOrder(null);
      await loadOrders();
    } catch (err) {
      setChangeTableError(err.message || "Failed to update table or seat.");
    } finally {
      setChangeTableSubmitting(false);
    }
  }

  async function handleConfirmShareDish() {
    const cleanDestTable = destTableNumber.trim();
    const cleanDestSeat = destSeatNumber.trim();
    if (!cleanDestTable) {
      setShareError("Destination Table Number is mandatory.");
      return;
    }
    const q = parseInt(shareQuantity, 10);
    if (isNaN(q) || q < 1) {
      setShareError("Quantity must be at least 1.");
      return;
    }
    const maxQty = shareModalItem.item.remaining_unshared_quantity !== undefined
      ? shareModalItem.item.remaining_unshared_quantity
      : shareModalItem.item.quantity;
    if (q > maxQty) {
      setShareError(`Cannot share more than remaining unshared quantity (${maxQty}).`);
      return;
    }

    // Validate destination seat against configured capacity (Requirement 4)
    const destTableConfig = diningTables.find((t) => t.table_number.toLowerCase() === cleanDestTable.toLowerCase());
    if (destTableConfig && cleanDestSeat) {
      const seatNum = parseInt(cleanDestSeat, 10);
      if (isNaN(seatNum) || seatNum < 1 || seatNum > destTableConfig.max_seats) {
        setShareError(`Table ${destTableConfig.table_number} has a maximum of ${destTableConfig.max_seats} seats. Please select a seat between 1 and ${destTableConfig.max_seats}.`);
        return;
      }
    }

    setShareSubmitting(true);
    setShareError("");
    try {
      const token = await getValidAdminToken();
      const orderId = shareModalItem.order.order_id || shareModalItem.order.id;
      const itemId = shareModalItem.item.id || shareModalItem.item.item_id;
      await shareOrderDish(
        orderId,
        itemId,
        {
          destination_table: cleanDestTable,
          destination_seat: cleanDestSeat || null,
          quantity: q,
        },
        token
      );
      setActionMsg(`Shared ${q}x ${shareModalItem.item.item_name} with Table #${cleanDestTable}${cleanDestSeat ? `, Seat #${cleanDestSeat}` : ""}. Full bill remains with Table #${shareModalItem.order.table_number || "original"}.`);
      setShareModalItem(null);
      await loadOrders();
    } catch (err) {
      setShareError(err.message || "Failed to share dish.");
    } finally {
      setShareSubmitting(false);
    }
  }

  async function handleReverseShare(shareId, dishName) {
    if (!window.confirm(`Reverse sharing record for ${dishName}? The quantity will return to the original dish. Bill will remain unchanged.`)) return;
    try {
      const token = await getValidAdminToken();
      await reverseSharedDish(shareId, token);
      setActionMsg(`Reversed sharing record for ${dishName}.`);
      await loadOrders();
    } catch (err) {
      setActionMsg(`Failed to reverse share: ${err.message}`);
    }
  }

  // Derive orders list based on selected filter tab, date scope, and backlog search
  const activeList = (() => {
    if (!tokensData) return [];
    let list = [];
    if (filterTab === "pending_otp") list = tokensData.pending_otp || [];
    else if (filterTab === "pending") list = tokensData.pending || [];
    else if (filterTab === "preparing") list = tokensData.preparing || [];
    else if (filterTab === "ready") list = tokensData.ready || [];
    else if (filterTab === "completed") list = tokensData.completed || [];
    else {
      list = [
        ...(tokensData.pending_otp || []),
        ...(tokensData.pending || []),
        ...(tokensData.preparing || []),
        ...(tokensData.ready || []),
      ];
    }

    if (dateScope === "today") {
      list = list.filter((o) => o.is_today || !o.is_previous_day);
    } else if (dateScope === "backlog") {
      list = list.filter((o) => o.is_previous_day);
    }

    if (backlogSearch.trim()) {
      const q = backlogSearch.toLowerCase().trim();
      list = list.filter((o) => {
        const orderNum = (o.order_number || "").toLowerCase();
        const tokenNum = String(o.daily_token_number || o.token_number || "").toLowerCase();
        const custName = (o.customer_name || "").toLowerCase();
        const custPhone = (o.customer_phone || "").toLowerCase();
        const tableNum = (o.table_number || "").toLowerCase();
        const seatNum = (o.seat_number || "").toLowerCase();
        const itemsMatch = (o.items || []).some((it) => (it.item_name || "").toLowerCase().includes(q));
        return (
          orderNum.includes(q) ||
          tokenNum.includes(q) ||
          custName.includes(q) ||
          custPhone.includes(q) ||
          tableNum.includes(q) ||
          seatNum.includes(q) ||
          itemsMatch
        );
      });
    }

    return list;
  })();

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
            📋 Live Orders Pipeline & Kitchen Display System (KDS)
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: "4px" }}>
            Real-time token lifecycle tracking from customer order placement to counter pickup.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            onClick={() => {
              setShowTableModal(true);
              loadAllTablesForManage();
            }}
            className="btn-secondary"
            style={{ fontSize: "0.88rem", padding: "8px 16px" }}
          >
            🪑 Configure Tables & Seats
          </button>
          <button onClick={loadOrders} disabled={loading} className="btn-secondary" style={{ fontSize: "0.88rem", padding: "8px 16px" }}>
            {loading ? "Refreshing..." : "↻ Refresh Live Queue"}
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

      {/* KPI Stats Bar - Sticky & Size Adaptive */}
      <div className="sticky-kpi-container">
        <div className="kpi-grid">
          <div className="kpi-card" style={{ borderTop: "3px solid #D97706" }}>
            <div className="kpi-card-header">
              <span className="kpi-card-title" style={{ color: "#D97706" }}>⏳ Awaiting OTP</span>
            </div>
            <div className="kpi-card-value" style={{ color: "#D97706" }}>
              {tokensData?.pending_otp?.length || 0}
            </div>
          </div>

          <div className="kpi-card" style={{ borderTop: "3px solid #2563EB" }}>
            <div className="kpi-card-header">
              <span className="kpi-card-title" style={{ color: "#2563EB" }}>Queued</span>
            </div>
            <div className="kpi-card-value" style={{ color: "#2563EB" }}>
              {tokensData?.pending?.length || 0}
            </div>
          </div>

          <div className="kpi-card" style={{ borderTop: "3px solid #0284C7" }}>
            <div className="kpi-card-header">
              <span className="kpi-card-title" style={{ color: "#0284C7" }}>Brewing / Preparing</span>
            </div>
            <div className="kpi-card-value" style={{ color: "#0284C7" }}>
              {tokensData?.preparing?.length || 0}
            </div>
          </div>

          <div className="kpi-card" style={{ borderTop: "3px solid var(--status-success)" }}>
            <div className="kpi-card-header">
              <span className="kpi-card-title" style={{ color: "var(--status-success)" }}>Ready for Pickup</span>
            </div>
            <div className="kpi-card-value" style={{ color: "var(--status-success)" }}>
              {tokensData?.ready?.length || 0}
            </div>
          </div>

          <div className="kpi-card" style={{ borderTop: "3px solid #64748B" }}>
            <div className="kpi-card-header">
              <span className="kpi-card-title">Today's Orders</span>
            </div>
            <div className="kpi-card-value">
              {tokensData?.total_orders_today || tokenStats?.total_orders || 0}
            </div>
          </div>

          <div
            className="kpi-card"
            style={{
              borderTop: (tokensData?.previous_days_active_count || 0) > 0 ? "3px solid #DC2626" : "3px solid #E2E8F0",
              background: (tokensData?.previous_days_active_count || 0) > 0 ? "#FEF2F2" : "#FFFFFF",
              cursor: (tokensData?.previous_days_active_count || 0) > 0 ? "pointer" : "default",
            }}
            onClick={() => {
              if ((tokensData?.previous_days_active_count || 0) > 0) {
                setDateScope(dateScope === "backlog" ? "all" : "backlog");
              }
            }}
            title="Unfulfilled orders from previous dates still in queue"
          >
            <div className="kpi-card-header">
              <span className="kpi-card-title" style={{ color: (tokensData?.previous_days_active_count || 0) > 0 ? "#DC2626" : "var(--text-muted)" }}>
                🗓️ Carried Over
              </span>
            </div>
            <div className="kpi-card-value" style={{ color: (tokensData?.previous_days_active_count || 0) > 0 ? "#DC2626" : "var(--text-muted)" }}>
              {tokensData?.previous_days_active_count || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Alert banner for previous days active orders with Backlog Search Bar */}
      {(tokensData?.previous_days_active_count || 0) > 0 && (
        <div
          style={{
            padding: "14px 20px",
            borderRadius: "10px",
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "1 1 280px" }}>
            <span style={{ fontSize: "1.4rem" }}>⚠️</span>
            <div>
              <div style={{ fontSize: "0.92rem", fontWeight: "700", color: "#92400E" }}>
                {tokensData.previous_days_active_count} Active Order{tokensData.previous_days_active_count > 1 ? "s" : ""} Carried Over From Previous Dates
              </div>
              <div style={{ fontSize: "0.8rem", color: "#B45309", marginTop: "2px" }}>
                Unfulfilled orders placed before today remaining live in kitchen pipeline until completed.
              </div>
            </div>
          </div>

          {/* Search bar for backlog orders (Replaces former backlog filter button) */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1 1 340px", maxWidth: "460px" }}>
            <div style={{ position: "relative", width: "100%" }}>
              <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#B45309", fontSize: "0.9rem" }}>
                🔍
              </span>
              <input
                type="text"
                placeholder="Search backlog by token, customer, table, item..."
                value={backlogSearch}
                onChange={(e) => {
                  setBacklogSearch(e.target.value);
                  if (dateScope !== "backlog" && e.target.value.trim()) {
                    setDateScope("backlog");
                  }
                }}
                style={{
                  width: "100%",
                  padding: "9px 32px 9px 34px",
                  borderRadius: "8px",
                  border: "1px solid #FCD34D",
                  background: "#FFFFFF",
                  color: "#1E293B",
                  fontSize: "0.85rem",
                  fontWeight: "500",
                  outline: "none",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
                }}
              />
              {backlogSearch && (
                <button
                  type="button"
                  onClick={() => setBacklogSearch("")}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    color: "#94A3B8",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    padding: 0
                  }}
                  title="Clear backlog search"
                >
                  ✕
                </button>
              )}
            </div>

            {dateScope === "backlog" && (
              <button
                type="button"
                onClick={() => {
                  setDateScope("all");
                  setBacklogSearch("");
                }}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid #CBD5E1",
                  background: "#FFFFFF",
                  color: "#475569",
                  fontSize: "0.82rem",
                  fontWeight: "600",
                  cursor: "pointer",
                  whiteSpace: "nowrap"
                }}
              >
                Show All
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filter Tabs & Scope Filter */}
      <div className="card" style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {[
              { id: "all", label: `Active Pipeline (${(tokensData?.pending_otp?.length || 0) + (tokensData?.pending?.length || 0) + (tokensData?.preparing?.length || 0) + (tokensData?.ready?.length || 0)})` },
              { id: "pending_otp", label: `⏳ Awaiting OTP (${tokensData?.pending_otp?.length || 0})` },
              { id: "pending", label: `Queued (${tokensData?.pending?.length || 0})` },
              { id: "preparing", label: `Preparing (${tokensData?.preparing?.length || 0})` },
              { id: "ready", label: `Ready (${tokensData?.ready?.length || 0})` },
              { id: "completed", label: `Completed (${tokensData?.completed?.length || 0})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: `1px solid ${filterTab === tab.id ? "var(--color-primary)" : "var(--border-subtle)"}`,
                  background: filterTab === tab.id ? "var(--color-primary)" : "#FFFFFF",
                  color: filterTab === tab.id ? "#FFFFFF" : "var(--text-main)",
                  fontSize: "0.84rem",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Date Scope Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "var(--bg-card-subtle)", padding: "4px", borderRadius: "8px" }}>
            <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", fontWeight: "600", padding: "0 6px" }}>Scope:</span>
            {[
              { id: "all", label: "All Active" },
              { id: "today", label: "Today Only" },
              { id: "backlog", label: `Backlog (${tokensData?.previous_days_active_count || 0})` },
            ].map((scope) => (
              <button
                key={scope.id}
                onClick={() => setDateScope(scope.id)}
                style={{
                  padding: "5px 10px",
                  borderRadius: "6px",
                  border: "none",
                  background: dateScope === scope.id ? "#FFFFFF" : "transparent",
                  color: dateScope === scope.id ? "var(--color-primary)" : "var(--text-muted)",
                  fontWeight: dateScope === scope.id ? "700" : "500",
                  fontSize: "0.78rem",
                  boxShadow: dateScope === scope.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  cursor: "pointer",
                }}
              >
                {scope.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Orders Grid */}
      {loading ? (
        <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
          Loading live token queue...
        </div>
      ) : activeList.length === 0 ? (
        <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
          No orders in this status category right now.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
          {activeList.map((order) => {
            const stInfo = STATUS_LABELS[order.order_status] || {
              label: order.order_status,
              color: "var(--text-muted)",
              bg: "var(--bg-card-subtle)",
            };

            return (
              <div
                key={order.order_id}
                className="card"
                style={{
                  padding: "20px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "14px",
                  borderLeft: `4px solid ${stInfo.color}`,
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px", gap: "8px" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "4px" }}>
                        <span
                          style={{
                            fontSize: "1.25rem",
                            fontWeight: "800",
                            color: "var(--text-main)",
                            background: "var(--bg-card-subtle)",
                            padding: "2px 8px",
                            borderRadius: "6px",
                          }}
                        >
                          #{order.daily_token_number || order.token_number}
                        </span>
                        {order.is_previous_day ? (
                          <span
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: "700",
                              background: "#FEE2E2",
                              color: "#DC2626",
                              border: "1px solid #FECACA",
                              padding: "2px 8px",
                              borderRadius: "10px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "3px",
                            }}
                            title={`Order placed on ${order.order_date || order.created_at}`}
                          >
                            ⚠️ {order.date_label || "Previous Date"}
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: "600",
                              background: "#F1F5F9",
                              color: "#475569",
                              padding: "2px 8px",
                              borderRadius: "10px",
                            }}
                          >
                            Today
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: "600", color: "var(--text-main)" }}>{order.order_number}</span>
                        <span>•</span>
                        <span>
                          {order.order_time || order.created_at
                            ? new Date(order.order_time || order.created_at).toLocaleString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                            : "Just now"}
                        </span>
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: "700",
                        padding: "3px 8px",
                        borderRadius: "12px",
                        background: stInfo.bg,
                        color: stInfo.color,
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {stInfo.label}
                    </span>
                  </div>

                  {/* Customer details & Table / Takeaway */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "6px" }}>
                    <div style={{ fontSize: "0.88rem", color: "var(--text-main)", fontWeight: "600" }}>
                      👤 {order.customer_name || "Walk-in Customer"}
                      {order.customer_phone && <span style={{ color: "var(--text-dim)", fontWeight: "normal", fontSize: "0.8rem" }}> ({order.customer_phone})</span>}
                    </div>

                    {order.order_type === "TAKEAWAY" ? (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: "700",
                          background: "#DCFCE7",
                          color: "#15803D",
                          border: "1px solid #BBF7D0",
                          padding: "3px 8px",
                          borderRadius: "6px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px"
                        }}
                      >
                        🛍️ Takeaway
                      </span>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: "700",
                            background: "var(--color-primary-light)",
                            color: "var(--color-primary)",
                            border: "1px solid rgba(15, 118, 110, 0.2)",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px"
                          }}
                        >
                          🍽️ Table #{order.table_number || "—"}{order.seat_number ? `, Seat #${order.seat_number}` : ""}
                        </span>

                        {order.can_change_table_or_seat !== false && order.order_status !== "COMPLETED" && order.order_status !== "CANCELLED" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setChangeTableModalOrder(order);
                              setChangeTableNo(order.table_number || "");
                              setChangeSeatNo(order.seat_number || "");
                              setChangeTableError("");
                            }}
                            style={{
                              background: "#FFFFFF",
                              border: "1px solid var(--border-subtle)",
                              borderRadius: "6px",
                              padding: "2px 7px",
                              fontSize: "0.72rem",
                              color: "var(--text-main)",
                              cursor: "pointer",
                              fontWeight: "600"
                            }}
                            title="Change customer table or seat (allowed until delivered)"
                          >
                            🔄 Move
                          </button>
                        ) : (
                          <span
                            style={{ fontSize: "0.68rem", color: "var(--text-dim)", fontStyle: "italic" }}
                            title="Changing table or seat is disabled after order delivery"
                          >
                            🔒 Fixed
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Unverified OTP Warning Notice */}
                  {order.order_status === "PENDING_OTP_VERIFICATION" && (
                    <div style={{
                      background: "#FEF3C7",
                      border: "1px dashed #D97706",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      color: "#92400E",
                      fontSize: "0.78rem",
                      fontWeight: "600",
                      marginBottom: "10px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px"
                    }}>
                      <span>⏳</span>
                      <span>Awaiting customer mobile OTP. Items temporarily reserved. Do not brew.</span>
                    </div>
                  )}

                  {/* Order Line Items */}
                  <div
                    style={{
                      background: "var(--bg-card-subtle)",
                      borderRadius: "8px",
                      padding: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      marginBottom: "12px",
                    }}
                  >
                    {order.items && order.items.length > 0 ? (
                      order.items.map((item, idx) => {
                        const canShare = order.order_status !== "CANCELLED" && (item.remaining_unshared_quantity === undefined || item.remaining_unshared_quantity > 0);
                        const isDelivered = order.order_status === "COMPLETED";

                        const itemKey = `${order.order_id || order.id}_${item.id}`;
                        const isDishBusy = !!dishActionLoading[itemKey];
                        const dishStatus = (item.status || (order.order_status === "COMPLETED" ? "DELIVERED" : order.order_status === "READY" ? "READY" : "PENDING")).toUpperCase();
                        const isDishCancelled = dishStatus === "CANCELLED";
                        const isDishReady = dishStatus === "READY";
                        const isDishDelivered = dishStatus === "DELIVERED";

                        return (
                          <div
                            key={idx}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              fontSize: "0.88rem",
                              borderBottom: idx < order.items.length - 1 ? "1px dashed rgba(0,0,0,0.06)" : "none",
                              paddingBottom: "8px",
                              opacity: isDishCancelled ? 0.6 : 1,
                              background: isDishCancelled ? "rgba(239, 68, 68, 0.04)" : isDishReady ? "rgba(34, 197, 94, 0.05)" : "transparent",
                              borderRadius: "6px",
                              padding: "6px 8px"
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", flex: 1, paddingRight: "8px" }}>
                              {/* Requirement 2A: Completion Checkbox (Admin-only) */}
                              <div style={{ display: "flex", alignItems: "center", paddingTop: "2px" }}>
                                <label
                                  style={{
                                    cursor: isDishCancelled || isDelivered || isDishBusy ? "not-allowed" : "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    margin: 0
                                  }}
                                  title={
                                    isDishCancelled
                                      ? "Dish is cancelled"
                                      : isDishReady
                                      ? "Dish is ready! Click to uncheck and revert to pending."
                                      : "Click to mark dish as Ready"
                                  }
                                >
                                  <input
                                    type="checkbox"
                                    checked={isDishReady || isDishDelivered}
                                    disabled={isDishCancelled || isDelivered || isDishBusy}
                                    onChange={() => handleToggleDishCompletion(order, item)}
                                    style={{
                                      width: "18px",
                                      height: "18px",
                                      accentColor: "#16A34A",
                                      cursor: isDishCancelled || isDelivered || isDishBusy ? "not-allowed" : "pointer"
                                    }}
                                  />
                                </label>
                              </div>

                              <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                  <span style={{ fontWeight: "800", color: isDishCancelled ? "#9CA3AF" : "var(--color-primary)", textDecoration: isDishCancelled ? "line-through" : "none" }}>
                                    {item.quantity}x
                                  </span>
                                  <span style={{ fontWeight: "700", color: isDishCancelled ? "#6B7280" : "var(--text-main)", textDecoration: isDishCancelled ? "line-through" : "none" }}>
                                    {item.item_name}
                                  </span>

                                  {/* Dish Status Pill */}
                                  {isDishCancelled && (
                                    <span style={{ fontSize: "0.68rem", background: "#FEE2E2", color: "#DC2626", padding: "1px 6px", borderRadius: "4px", fontWeight: "700" }}>
                                      ❌ Cancelled{item.cancelled_by ? ` (${item.cancelled_by})` : ""}
                                    </span>
                                  )}
                                  {isDishReady && (
                                    <span style={{ fontSize: "0.68rem", background: "#DCFCE7", color: "#16A34A", padding: "1px 6px", borderRadius: "4px", fontWeight: "700" }}>
                                      ✓ Ready
                                    </span>
                                  )}
                                  {isDishDelivered && (
                                    <span style={{ fontSize: "0.68rem", background: "#F1F5F9", color: "#475569", padding: "1px 6px", borderRadius: "4px", fontWeight: "600" }}>
                                      🍽️ Served
                                    </span>
                                  )}

                                  {item.shared_quantity > 0 && (
                                    <span style={{ fontSize: "0.68rem", background: "#FEF3C7", color: "#B45309", padding: "1px 6px", borderRadius: "4px", fontWeight: "600" }}>
                                      🤝 {item.shared_quantity} shared
                                    </span>
                                  )}
                                </div>
                                {(item.sugar_option || item.strength_option) && (
                                  <div style={{ display: "flex", gap: "4px", marginTop: "3px", flexWrap: "wrap" }}>
                                    {item.sugar_option && (
                                      <span style={{ fontSize: "0.7rem", background: "#FEF3C7", color: "#B45309", padding: "1px 6px", borderRadius: "4px", fontWeight: "600" }}>
                                        🍬 {item.sugar_option}
                                      </span>
                                    )}
                                    {item.strength_option && (
                                      <span style={{ fontSize: "0.7rem", background: "#E0F2FE", color: "#0369A1", padding: "1px 6px", borderRadius: "4px", fontWeight: "600" }}>
                                        💪 {item.strength_option}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontWeight: "700", color: isDishCancelled ? "#9CA3AF" : "var(--text-main)", whiteSpace: "nowrap", textDecoration: isDishCancelled ? "line-through" : "none" }}>
                                ₹{item.total_price || (item.unit_price * item.quantity)}
                              </span>

                              {/* Requirement 2B: Individual Dish Cancellation Cross Control (Admin Only) */}
                              {!isDishCancelled && !isDelivered && order.order_status !== "CANCELLED" && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDishCancelModal({ order, item });
                                    setDishCancelReason("");
                                    setDishCancelError("");
                                  }}
                                  disabled={isDishBusy}
                                  style={{
                                    background: "#FEE2E2",
                                    border: "1px solid #FECACA",
                                    color: "#DC2626",
                                    borderRadius: "6px",
                                    padding: "3px 7px",
                                    fontSize: "0.74rem",
                                    fontWeight: "800",
                                    cursor: "pointer",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "3px"
                                  }}
                                  title="Cancel this dish only (Admin control)"
                                >
                                  ❌
                                </button>
                              )}

                              {/* Share Dish Button */}
                              {canShare && !isDishCancelled && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShareModalItem({ order, item });
                                    setDestTableNumber("");
                                    setDestSeatNumber("");
                                    setShareQuantity(1);
                                    setShareError("");
                                  }}
                                  style={{
                                    background: "#F0FDF4",
                                    border: "1px solid #BBF7D0",
                                    color: "#15803D",
                                    borderRadius: "6px",
                                    padding: "2px 7px",
                                    fontSize: "0.72rem",
                                    fontWeight: "700",
                                    cursor: "pointer",
                                    whiteSpace: "nowrap"
                                  }}
                                  title={isDelivered ? "Share dish (Serving-record update only, bill stays unchanged)" : "Share dish with friend's table (Original table pays full bill)"}
                                >
                                  🤝 Share
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontStyle: "italic" }}>
                        No items specified ({order.items_count || 0} items)
                      </div>
                    )}

                    {/* Shared Dishes Sent History on this Order (Requirement 1) */}
                    {order.shared_dishes && order.shared_dishes.length > 0 && (
                      <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "8px", padding: "10px 12px", marginTop: "6px", fontSize: "0.8rem" }}>
                        <div style={{ fontWeight: "800", color: "#166534", marginBottom: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>🤝 Shared Food Details:</span>
                          <span style={{ fontSize: "0.7rem", fontWeight: "600", color: "#15803D" }}>Bill stays with Table #{order.table_number || "this"}</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          {order.shared_dishes.map((sd) => {
                            const isConfirmed = sd.status === "CONFIRMED" || sd.status === "ACTIVE";
                            const origTbl = sd.original_table_number || order.table_number || "—";
                            const origSeat = sd.original_seat_number || order.seat_number || "";
                            const destTbl = sd.destination_table_number || sd.destination_table_id || "—";
                            const destSeat = sd.destination_seat_number || sd.destination_seat_no || "";

                            return (
                              <div key={sd.id} style={{
                                background: "#FFFFFF",
                                border: "1px solid #DCFCE7",
                                borderRadius: "6px",
                                padding: "6px 10px",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                flexWrap: "wrap",
                                gap: "6px"
                              }}>
                                <div>
                                  <div style={{ fontWeight: "700", color: "var(--text-main)" }}>
                                    {sd.quantity}x {sd.dish_name || "Dish"}
                                  </div>
                                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "2px" }}>
                                    <span>Origin: <strong>Table #{origTbl}{origSeat ? `, Seat #${origSeat}` : ""}</strong></span>
                                    <span style={{ margin: "0 6px" }}>➔</span>
                                    <span>Dest: <strong>Table #{destTbl}{destSeat ? `, Seat #${destSeat}` : ""}</strong></span>
                                  </div>
                                  <div style={{ fontSize: "0.68rem", color: "var(--text-dim)", marginTop: "2px" }}>
                                    Shared: {sd.formatted_time || (sd.created_at ? new Date(sd.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now")}
                                  </div>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <span style={{
                                    fontSize: "0.68rem",
                                    fontWeight: "700",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    background: isConfirmed ? "#DCFCE7" : "#FEE2E2",
                                    color: isConfirmed ? "var(--status-success)" : "var(--status-err)"
                                  }}>
                                    {isConfirmed ? "✓ Shared" : "↺ Reversed"}
                                  </span>

                                  {isConfirmed && order.order_status !== "CANCELLED" && (
                                    <button
                                      type="button"
                                      onClick={() => handleReverseShare(sd.id, sd.dish_name)}
                                      style={{
                                        background: "none",
                                        border: "1px solid #FECACA",
                                        borderRadius: "4px",
                                        color: "#DC2626",
                                        cursor: "pointer",
                                        fontSize: "0.7rem",
                                        padding: "2px 6px",
                                        fontWeight: "600"
                                      }}
                                      title="Reverse share without altering bill"
                                    >
                                      Reverse
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9rem", fontWeight: "700" }}>
                    <span>Total Amount:</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: "var(--color-primary)", fontSize: "1.1rem" }}>
                        ₹{Number(order.total_amount).toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenThermalBill(order)}
                        disabled={loadingReceiptId === (order.order_id || order.id)}
                        style={{
                          background: "#FFFFFF",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "6px",
                          padding: "3px 8px",
                          fontSize: "0.75rem",
                          fontWeight: "700",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                          color: "var(--text-main)",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                        }}
                        title="Print 80mm/58mm thermal receipt"
                      >
                        {loadingReceiptId === (order.order_id || order.id) ? "..." : "🧾 Bill"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Workflow Status Action Buttons */}
                <div style={{ display: "flex", gap: "8px", borderTop: "1px solid var(--border-subtle)", paddingTop: "12px", alignItems: "center" }}>
                  {order.order_status === "PENDING_OTP_VERIFICATION" && (
                    <div style={{ display: "flex", gap: "6px", flex: 1 }}>
                      <button
                        disabled
                        style={{
                          flex: 1,
                          background: "#F1F5F9",
                          color: "#94A3B8",
                          border: "1px solid #E2E8F0",
                          borderRadius: "8px",
                          padding: "8px 10px",
                          fontSize: "0.8rem",
                          fontWeight: "600",
                          cursor: "not-allowed"
                        }}
                        title="Customer must verify OTP before brewing"
                      >
                        🔒 Awaiting OTP
                      </button>
                      <button
                        onClick={() => {
                          setOverrideModalOrder(order);
                          setOverrideReason("");
                          setOverrideError("");
                        }}
                        style={{
                          background: "#0F766E",
                          color: "#FFFFFF",
                          border: "none",
                          borderRadius: "8px",
                          padding: "8px 12px",
                          fontSize: "0.82rem",
                          fontWeight: "700",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px"
                        }}
                        title="Authorized staff override"
                      >
                        🛡️ Override
                      </button>
                    </div>
                  )}

                  {(order.order_status === "PENDING" || order.order_status === "CONFIRMED") && (
                    <button
                      onClick={() => handleStatusChange(order.order_id, "PREPARING", order.daily_token_number || order.token_number)}
                      className="btn-primary"
                      style={{ flex: 1, padding: "8px 14px", fontSize: "0.85rem", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                    >
                      🔥 Accept & Brew
                    </button>
                  )}

                  {order.order_status === "PREPARING" && (
                    <button
                      onClick={() => handleStatusChange(order.order_id, "READY", order.daily_token_number || order.token_number)}
                      style={{
                        flex: 1,
                        background: "#16A34A",
                        color: "#FFFFFF",
                        border: "none",
                        borderRadius: "8px",
                        padding: "8px 14px",
                        fontSize: "0.85rem",
                        fontWeight: "700",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                      }}
                    >
                      ✓ Mark Ready for Pickup
                    </button>
                  )}

                  {order.order_status === "READY" && (
                    <button
                      onClick={() => handleStatusChange(order.order_id, "COMPLETED", order.daily_token_number || order.token_number)}
                      className="btn-primary"
                      style={{ flex: 1, padding: "8px 14px", fontSize: "0.85rem", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                    >
                      ✅ Deliver & Complete
                    </button>
                  )}

                  {order.order_status !== "CANCELLED" && order.order_status !== "COMPLETED" && (
                    <button
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to cancel Token #${order.daily_token_number || order.token_number}? Temporary reservations will be released.`)) {
                          handleStatusChange(order.order_id, "CANCELLED", order.daily_token_number || order.token_number);
                        }
                      }}
                      style={{
                        background: "transparent",
                        border: "1px solid #FECACA",
                        color: "var(--status-err)",
                        borderRadius: "8px",
                        padding: "8px 12px",
                        fontSize: "0.82rem",
                        fontWeight: "600",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Admin Order Confirmation Override Modal */}
      {overrideModalOrder && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          padding: "16px"
        }}>
          <div className="card" style={{ maxWidth: "480px", width: "100%", padding: "26px", boxShadow: "var(--shadow-modal)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <div style={{ fontSize: "1.8rem" }}>🛡️</div>
              <div>
                <h3 style={{ fontSize: "1.15rem", fontWeight: "800", color: "var(--text-main)" }}>
                  Staff OTP Confirmation Override
                </h3>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Order #{overrideModalOrder.order_number} (Token #{overrideModalOrder.daily_token_number || overrideModalOrder.token_number})
                </p>
              </div>
            </div>

            <div style={{ background: "var(--bg-card-subtle)", borderRadius: "8px", padding: "12px", marginBottom: "16px", fontSize: "0.85rem" }}>
              <div style={{ color: "var(--text-main)", fontWeight: "600" }}>
                Customer: {overrideModalOrder.customer_name} ({overrideModalOrder.customer_phone || "No phone"})
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "2px" }}>
                Total: ₹{overrideModalOrder.total_amount} • {overrideModalOrder.payment_method}
              </div>
            </div>

            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "10px" }}>
              As authorized staff, you can manually confirm this order if the customer cannot receive SMS (e.g. phone died, verified in person at counter). An audit reason is mandatory:
            </p>

            <textarea
              value={overrideReason}
              onChange={(e) => {
                setOverrideReason(e.target.value);
                if (overrideError) setOverrideError("");
              }}
              placeholder="e.g. Customer present at counter; phone out of charge, verified order in person"
              rows={3}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
                fontSize: "0.85rem",
                outline: "none",
                marginBottom: "12px",
                fontFamily: "inherit"
              }}
            />

            {overrideError && (
              <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", color: "var(--status-err)", padding: "8px 12px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: "600", marginBottom: "12px" }}>
                ❌ {overrideError}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setOverrideModalOrder(null)}
                className="btn-secondary"
                disabled={overrideSubmitting}
                style={{ padding: "8px 16px", fontSize: "0.85rem" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmOverride}
                disabled={overrideSubmitting || overrideReason.trim().length < 5}
                className="btn-primary"
                style={{
                  padding: "8px 18px",
                  fontSize: "0.85rem",
                  fontWeight: "700",
                  opacity: overrideReason.trim().length >= 5 ? 1 : 0.6,
                  cursor: (overrideSubmitting || overrideReason.trim().length < 5) ? "not-allowed" : "pointer"
                }}
              >
                {overrideSubmitting ? "Confirming..." : "Confirm Manual Override"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Table & Seat Modal */}
      {changeTableModalOrder && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          padding: "16px"
        }}>
          <div className="card" style={{ maxWidth: "440px", width: "100%", padding: "24px", boxShadow: "var(--shadow-modal)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
              <div style={{ fontSize: "1.8rem" }}>🔄</div>
              <div>
                <h3 style={{ fontSize: "1.15rem", fontWeight: "800", color: "var(--text-main)" }}>
                  Change Table or Seat
                </h3>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Token #{changeTableModalOrder.daily_token_number || changeTableModalOrder.token_number} • {changeTableModalOrder.customer_name || "Customer"}
                </p>
              </div>
            </div>

            <div style={{
              background: "#EFF6FF",
              border: "1px solid #BFDBFE",
              borderRadius: "8px",
              padding: "10px 12px",
              fontSize: "0.8rem",
              color: "#1E40AF",
              marginBottom: "16px"
            }}>
              ℹ️ Allowed only until order has been delivered. Helps staff ensure hot food arrives at the customer's new seat.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "700", color: "var(--text-main)", marginBottom: "4px" }}>
                  New Table <span style={{ color: "#DC2626" }}>*</span>
                </label>
                <select
                  value={changeTableNo}
                  onChange={(e) => {
                    const tbl = e.target.value;
                    setChangeTableNo(tbl);
                    setChangeSeatNo("1");
                    if (changeTableError) setChangeTableError("");
                  }}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-subtle)",
                    fontSize: "0.88rem",
                    fontWeight: "600",
                    outline: "none"
                  }}
                >
                  <option value="">Select Table...</option>
                  {diningTables.map((t) => (
                    <option key={t.id} value={t.table_number}>
                      Table #{t.table_number} ({t.max_seats} Seats max)
                    </option>
                  ))}
                </select>
                {(() => {
                  const currCfg = diningTables.find((t) => t.table_number.toLowerCase() === changeTableNo.trim().toLowerCase());
                  return currCfg ? (
                    <span style={{ fontSize: "0.72rem", color: "var(--color-primary)", fontWeight: "600", marginTop: "3px", display: "block" }}>
                      Max Capacity: {currCfg.max_seats} seats
                    </span>
                  ) : null;
                })()}
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "700", color: "var(--text-main)", marginBottom: "4px" }}>
                  New Seat No. <span style={{ color: "#DC2626" }}>*</span>
                </label>
                {(() => {
                  const currCfg = diningTables.find((t) => t.table_number.toLowerCase() === changeTableNo.trim().toLowerCase());
                  if (currCfg) {
                    return (
                      <select
                        value={changeSeatNo}
                        onChange={(e) => {
                          setChangeSeatNo(e.target.value);
                          if (changeTableError) setChangeTableError("");
                        }}
                        style={{
                          width: "100%",
                          padding: "9px 12px",
                          borderRadius: "8px",
                          border: "1px solid var(--border-subtle)",
                          fontSize: "0.88rem",
                          fontWeight: "600",
                          outline: "none"
                        }}
                      >
                        {Array.from({ length: currCfg.max_seats }, (_, i) => String(i + 1)).map((s) => (
                          <option key={s} value={s}>
                            Seat #{s}
                          </option>
                        ))}
                      </select>
                    );
                  }
                  return (
                    <input
                      type="text"
                      placeholder="e.g. 1"
                      value={changeSeatNo}
                      onChange={(e) => {
                        setChangeSeatNo(e.target.value);
                        if (changeTableError) setChangeTableError("");
                      }}
                      style={{
                        width: "100%",
                        padding: "9px 12px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-subtle)",
                        fontSize: "0.88rem",
                        fontWeight: "600",
                        outline: "none"
                      }}
                    />
                  );
                })()}
                <span style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "3px", display: "block" }}>
                  Only valid seats 1..capacity allowed
                </span>
              </div>
            </div>

            {changeTableError && (
              <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", color: "var(--status-err)", padding: "8px 12px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: "600", marginBottom: "14px" }}>
                ❌ {changeTableError}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setChangeTableModalOrder(null)}
                className="btn-secondary"
                disabled={changeTableSubmitting}
                style={{ padding: "8px 16px", fontSize: "0.85rem" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmTableSeatChange}
                disabled={changeTableSubmitting || !changeTableNo.trim() || !changeSeatNo.trim()}
                className="btn-primary"
                style={{ padding: "8px 18px", fontSize: "0.85rem", fontWeight: "700" }}
              >
                {changeTableSubmitting ? "Updating..." : "Save Table & Seat"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Dish Modal */}
      {shareModalItem && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          padding: "16px"
        }}>
          <div className="card" style={{ maxWidth: "480px", width: "100%", padding: "26px", boxShadow: "var(--shadow-modal)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
              <div style={{ fontSize: "1.8rem" }}>🤝</div>
              <div>
                <h3 style={{ fontSize: "1.15rem", fontWeight: "800", color: "var(--text-main)" }}>
                  Share Dish with Another Table
                </h3>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  {shareModalItem.item.item_name} • Token #{shareModalItem.order.daily_token_number || shareModalItem.order.token_number}
                </p>
              </div>
            </div>

            {/* Crucial Billing Rule Banner */}
            <div style={{
              background: "#FFFBEB",
              border: "1px solid #FDE68A",
              borderRadius: "8px",
              padding: "10px 14px",
              marginBottom: "16px",
              fontSize: "0.82rem",
              color: "#92400E"
            }}>
              <strong>⚠️ Final Shared Dish Billing Rule:</strong>
              <div style={{ marginTop: "4px", lineHeight: "1.4" }}>
                The original table (<strong>Table #{shareModalItem.order.table_number || "—"}</strong>) remains responsible for the full bill. The destination table receives the food with <strong>₹0 additional charge</strong>.
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: "700", color: "var(--text-main)", marginBottom: "4px" }}>
                  Quantity to Share <span style={{ color: "#DC2626" }}>*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max={shareModalItem.item.remaining_unshared_quantity !== undefined ? shareModalItem.item.remaining_unshared_quantity : shareModalItem.item.quantity}
                  value={shareQuantity}
                  onChange={(e) => {
                    setShareQuantity(e.target.value);
                    if (shareError) setShareError("");
                  }}
                  style={{
                    width: "100%",
                    padding: "9px 10px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-subtle)",
                    fontSize: "0.88rem",
                    fontWeight: "700",
                    outline: "none"
                  }}
                />
                <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                  Max: {shareModalItem.item.remaining_unshared_quantity !== undefined ? shareModalItem.item.remaining_unshared_quantity : shareModalItem.item.quantity} available
                </span>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: "700", color: "var(--text-main)", marginBottom: "4px" }}>
                  Dest. Table No. <span style={{ color: "#DC2626" }}>*</span>
                </label>
                <select
                  value={destTableNumber}
                  onChange={(e) => {
                    setDestTableNumber(e.target.value);
                    setDestSeatNumber("1");
                    if (shareError) setShareError("");
                  }}
                  style={{
                    width: "100%",
                    padding: "9px 10px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-subtle)",
                    fontSize: "0.88rem",
                    fontWeight: "600",
                    outline: "none"
                  }}
                >
                  <option value="">Select Destination...</option>
                  {diningTables.map((t) => (
                    <option key={t.id} value={t.table_number}>
                      Table #{t.table_number} ({t.max_seats} Seats max)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: "700", color: "var(--text-main)", marginBottom: "4px" }}>
                  Dest. Seat No.
                </label>
                {(() => {
                  const destCfg = diningTables.find((t) => t.table_number.toLowerCase() === destTableNumber.trim().toLowerCase());
                  if (destCfg) {
                    return (
                      <select
                        value={destSeatNumber}
                        onChange={(e) => setDestSeatNumber(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "9px 10px",
                          borderRadius: "8px",
                          border: "1px solid var(--border-subtle)",
                          fontSize: "0.88rem",
                          fontWeight: "600",
                          outline: "none"
                        }}
                      >
                        <option value="">Any Seat</option>
                        {Array.from({ length: destCfg.max_seats }, (_, i) => String(i + 1)).map((s) => (
                          <option key={s} value={s}>
                            Seat #{s}
                          </option>
                        ))}
                      </select>
                    );
                  }
                  return (
                    <input
                      type="text"
                      placeholder="e.g. 1"
                      value={destSeatNumber}
                      onChange={(e) => setDestSeatNumber(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "9px 10px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-subtle)",
                        fontSize: "0.88rem",
                        fontWeight: "600",
                        outline: "none"
                      }}
                    />
                  );
                })()}
              </div>
            </div>

            {shareError && (
              <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", color: "var(--status-err)", padding: "8px 12px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: "600", marginBottom: "14px" }}>
                ❌ {shareError}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShareModalItem(null)}
                className="btn-secondary"
                disabled={shareSubmitting}
                style={{ padding: "8px 16px", fontSize: "0.85rem" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmShareDish}
                disabled={shareSubmitting || !destTableNumber.trim()}
                className="btn-primary"
                style={{ padding: "8px 18px", fontSize: "0.85rem", fontWeight: "700" }}
              >
                {shareSubmitting ? "Recording Share..." : "Confirm & Deliver to Table"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table Capacity & Seat Management Modal (Requirement 4) */}
      {showTableModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 105,
          padding: "16px"
        }}>
          <div className="card" style={{ maxWidth: "620px", width: "100%", padding: "26px", maxHeight: "90vh", overflowY: "auto", boxShadow: "var(--shadow-modal)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "1.6rem" }}>🪑</span>
                <div>
                  <h3 style={{ fontSize: "1.15rem", fontWeight: "800", color: "var(--text-main)" }}>
                    Configure Tables & Seat Capacities
                  </h3>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Admin configuration of dining tables and maximum seated capacities.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTableModal(false)}
                style={{ background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "var(--text-dim)" }}
              >
                ✕
              </button>
            </div>

            {tableModalMsg && (
              <div style={{
                background: tableModalMsg.startsWith("✓") ? "#F0FDF4" : "#FEE2E2",
                border: `1px solid ${tableModalMsg.startsWith("✓") ? "#BBF7D0" : "#FECACA"}`,
                color: tableModalMsg.startsWith("✓") ? "var(--status-success)" : "var(--status-err)",
                padding: "8px 12px",
                borderRadius: "6px",
                fontSize: "0.84rem",
                fontWeight: "600",
                marginBottom: "14px"
              }}>
                {tableModalMsg}
              </div>
            )}

            {/* Add / Update Table Form */}
            <form onSubmit={handleSaveTable} style={{ background: "var(--bg-card-subtle)", padding: "14px", borderRadius: "8px", marginBottom: "18px" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--text-main)", marginBottom: "8px" }}>
                ➕ Add or Update Table Capacity
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "10px", alignItems: "flex-end" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", color: "var(--text-muted)", marginBottom: "4px" }}>
                    Table No. *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 5, T-12"
                    value={manageTableNumber}
                    onChange={(e) => setManageTableNumber(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", fontSize: "0.85rem" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", color: "var(--text-muted)", marginBottom: "4px" }}>
                    Max Seats *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={manageMaxSeats}
                    onChange={(e) => setManageMaxSeats(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", fontSize: "0.85rem" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", color: "var(--text-muted)", marginBottom: "4px" }}>
                    Status
                  </label>
                  <select
                    value={manageIsActive ? "true" : "false"}
                    onChange={(e) => setManageIsActive(e.target.value === "true")}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", fontSize: "0.85rem" }}
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
                <div>
                  <button
                    type="submit"
                    disabled={tableModalLoading}
                    className="btn-primary"
                    style={{ padding: "8px 16px", fontSize: "0.85rem", whiteSpace: "nowrap" }}
                  >
                    {tableModalLoading ? "Saving..." : "Save Table"}
                  </button>
                </div>
              </div>
            </form>

            {/* List of Current Configured Tables */}
            <div style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--text-main)", marginBottom: "8px" }}>
              📋 Configured Tables ({allTablesList.length})
            </div>
            <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "8px", overflow: "hidden" }}>
              <table style={{ width: "100%", fontSize: "0.82rem" }}>
                <thead>
                  <tr style={{ background: "var(--bg-card-subtle)", borderBottom: "1px solid var(--border-subtle)" }}>
                    <th style={{ padding: "8px 12px" }}>Table</th>
                    <th style={{ padding: "8px 12px" }}>Max Seats</th>
                    <th style={{ padding: "8px 12px" }}>Available Seats</th>
                    <th style={{ padding: "8px 12px" }}>Status</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {allTablesList.map((t) => (
                    <tr key={t.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "8px 12px", fontWeight: "700" }}>Table #{t.table_number}</td>
                      <td style={{ padding: "8px 12px", fontWeight: "800", color: "var(--color-primary)" }}>{t.max_seats} Seats</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>Seats 1 to {t.max_seats}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{
                          fontSize: "0.7rem",
                          fontWeight: "700",
                          padding: "2px 8px",
                          borderRadius: "10px",
                          background: t.is_active ? "#DCFCE7" : "#FEE2E2",
                          color: t.is_active ? "var(--status-success)" : "var(--status-err)"
                        }}>
                          {t.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setManageTableNumber(t.table_number);
                            setManageMaxSeats(t.max_seats);
                            setManageIsActive(t.is_active);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--color-primary)",
                            fontSize: "0.75rem",
                            fontWeight: "600",
                            cursor: "pointer",
                            marginRight: "8px"
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleTableActive(t)}
                          style={{
                            background: "none",
                            border: "none",
                            color: t.is_active ? "var(--status-err)" : "var(--status-success)",
                            fontSize: "0.75rem",
                            fontWeight: "600",
                            cursor: "pointer"
                          }}
                        >
                          {t.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: "16px", textAlign: "right" }}>
              <button
                type="button"
                onClick={() => setShowTableModal(false)}
                className="btn-secondary"
                style={{ padding: "8px 18px", fontSize: "0.85rem" }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Requirement 2B: Confirmation Modal for Cancelling Individual Dish */}
      {dishCancelModal && (
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
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "460px",
              width: "100%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
              border: "1px solid #FEE2E2",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <span style={{ fontSize: "1.6rem" }}>⚠️</span>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: "800", color: "#991B1B" }}>
                  Cancel Individual Dish?
                </h3>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#6B7280" }}>
                  Order #{dishCancelModal.order.daily_token_number || dishCancelModal.order.order_number}
                </p>
              </div>
            </div>

            <div
              style={{
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "16px",
                fontSize: "0.86rem",
              }}
            >
              <div style={{ fontWeight: "700", color: "#991B1B", marginBottom: "4px" }}>
                {dishCancelModal.item.quantity}x {dishCancelModal.item.item_name}
              </div>
              <div style={{ color: "#7F1D1D", fontSize: "0.8rem" }}>
                Line total: ₹{dishCancelModal.item.total_price || (dishCancelModal.item.unit_price * dishCancelModal.item.quantity)}
              </div>
              <div style={{ marginTop: "6px", fontSize: "0.78rem", color: "#B91C1C" }}>
                • Dish will be marked <strong>Cancelled</strong>.<br />
                • The rest of the order will remain active.<br />
                • The order total will be reduced by ₹{dishCancelModal.item.total_price || (dishCancelModal.item.unit_price * dishCancelModal.item.quantity)}.<br />
                • Inventory stock will be restored automatically.
              </div>
            </div>

            {dishCancelError && (
              <div
                style={{
                  background: "#FEE2E2",
                  color: "#991B1B",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  fontSize: "0.8rem",
                  marginBottom: "12px",
                }}
              >
                {dishCancelError}
              </div>
            )}

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", marginBottom: "6px", color: "#374151" }}>
                Reason for cancellation (optional):
              </label>
              <input
                type="text"
                placeholder="e.g. Customer changed mind, Out of ingredients"
                value={dishCancelReason}
                onChange={(e) => setDishCancelReason(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #D1D5DB",
                  fontSize: "0.85rem",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => {
                  setDishCancelModal(null);
                  setDishCancelReason("");
                  setDishCancelError("");
                }}
                disabled={dishCancelSubmitting}
                style={{
                  background: "#F3F4F6",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  fontWeight: "600",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  color: "#374151",
                }}
              >
                Keep Dish
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelDish}
                disabled={dishCancelSubmitting}
                style={{
                  background: "#DC2626",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 18px",
                  fontWeight: "700",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  color: "#FFFFFF",
                }}
              >
                {dishCancelSubmitting ? "Cancelling..." : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thermal Bill Receipt Modal (80mm / 58mm POS Print) */}
      {thermalReceipt && (
        <div
          data-thermal-receipt-backdrop="true"
          className="receipt-modal-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "20px",
          }}
        >
          <div
            data-thermal-receipt="true"
            className="receipt-card-container"
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
              <div style={{ fontSize: "1.2rem", fontWeight: "900", letterSpacing: "1px" }}>{thermalReceipt.shop_name || "ChaiFlow Tea Shop"}</div>
              <div style={{ fontSize: "0.75rem", color: "#444" }}>{thermalReceipt.tagline}</div>
              <div style={{ fontSize: "0.72rem", color: "#666" }}>{thermalReceipt.address}</div>
              {thermalReceipt.phone && <div style={{ fontSize: "0.72rem", color: "#666" }}>Phone: {thermalReceipt.phone}</div>}
              {thermalReceipt.fssai_license && <div style={{ fontSize: "0.7rem", color: "#666" }}>FSSAI: {thermalReceipt.fssai_license}</div>}
            </div>

            <div style={{ textAlign: "center", background: "#eee", padding: "6px", borderRadius: "6px", fontWeight: "900", fontSize: "1.15rem", margin: "8px 0" }}>
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

            {/* Line Items Table with Dish Price */}
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
              <span><strong>{String(thermalReceipt.payment_method || 'CASH').replace(/^PaymentMethod\./i, '')}</strong> ({thermalReceipt.payment_status || "PAID"})</span>
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
                  background: "#111",
                  color: "#FFF",
                  border: "none",
                  borderRadius: "6px",
                  padding: "9px",
                  fontWeight: "700",
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
                  background: "#DDD",
                  color: "#111",
                  border: "none",
                  borderRadius: "6px",
                  padding: "9px",
                  cursor: "pointer",
                  fontWeight: "600",
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
