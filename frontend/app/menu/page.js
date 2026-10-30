"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  getMenuCatalog,
  getQrInfo,
  createOrder,
  searchCustomers,
  verifyOrderOtp,
  resendOrderOtp,
  cancelOrderVerification,
  updateOrderTableSeat,
  getDiningTables,
  getTableSharedDishes,
} from "../../services/api";

function CustomerMenuContent() {
  const searchParams = useSearchParams();
  const urlTable = searchParams.get("table");
  const urlCounter = searchParams.get("counter");

  const [orderType, setOrderType] = useState("DINE_IN"); // "DINE_IN" | "TAKEAWAY"
  const [tableNumber, setTableNumber] = useState(urlTable || "");
  const [seatNumber, setSeatNumber] = useState("");
  const [counterNumber, setCounterNumber] = useState(urlCounter || "");
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  // Table/Seat Change State for Active Orders
  const [editingTableSeat, setEditingTableSeat] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState("");
  const [newSeatNumber, setNewSeatNumber] = useState("");
  const [tableSeatUpdating, setTableSeatUpdating] = useState(false);
  const [tableSeatMsg, setTableSeatMsg] = useState("");

  // Dining Tables & Incoming Shared Food State
  const [diningTables, setDiningTables] = useState([]);
  const [incomingSharedDishes, setIncomingSharedDishes] = useState([]);
  const [loadingSharedDishes, setLoadingSharedDishes] = useState(false);

  // Customization Bottom Sheet Modal state
  const [selectedItem, setSelectedItem] = useState(null);
  const [customSugar, setCustomSugar] = useState("");
  const [customStrength, setCustomStrength] = useState("");
  const [itemQuantity, setItemQuantity] = useState(1);

  // Cart state persisted in localStorage for Phase 7
  const [cartItems, setCartItems] = useState([]);
  const [cartToast, setCartToast] = useState("");

  // Phase 7 Checkout & Token Confirmation state
  const [showCheckout, setShowCheckout] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [matchedCustomer, setMatchedCustomer] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [orderNotes, setOrderNotes] = useState("");
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [confirmedOrder, setConfirmedOrder] = useState(null);

  // OTP Verification Modal State
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [pendingOtpOrder, setPendingOtpOrder] = useState(null);
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState("");
  const [otpStatusMsg, setOtpStatusMsg] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resendingOtp, setResendingOtp] = useState(false);
  const [cancellingOtp, setCancellingOtp] = useState(false);
  const [otpSecondsRemaining, setOtpSecondsRemaining] = useState(300);
  const [otpCooldownSeconds, setOtpCooldownSeconds] = useState(30);
  const [otpAttemptsRemaining, setOtpAttemptsRemaining] = useState(5);
  const otpInputRefs = useRef([]);

  // OTP countdown timer
  useEffect(() => {
    if (!showOtpModal) return;
    const interval = setInterval(() => {
      setOtpSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
      setOtpCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [showOtpModal]);

  useEffect(() => {
    // 1. Resolve table number from URL or localStorage
    if (urlTable) {
      setTableNumber(urlTable);
      try { localStorage.setItem("teashop_table", urlTable); } catch (e) { }
    } else if (urlCounter) {
      setCounterNumber(urlCounter);
      try { localStorage.setItem("teashop_counter", urlCounter); } catch (e) { }
    } else {
      try {
        const savedTable = localStorage.getItem("teashop_table");
        if (savedTable) setTableNumber(savedTable);
        else setTableNumber("3"); // Default demo QR table
      } catch (e) {
        setTableNumber("3");
      }
    }

    // 2. Load Cart from localStorage
    try {
      const savedCart = localStorage.getItem("teashop_cart");
      if (savedCart) setCartItems(JSON.parse(savedCart));
    } catch (e) { }

    // 3. Fetch full catalog & dining tables
    loadCatalogData();
    loadDiningTablesData();

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        loadCatalogData(true);
        loadDiningTablesData();
      }
    }
    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);

    const interval = setInterval(() => {
      loadCatalogData(true);
    }, 12000);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [urlTable, urlCounter]);

  async function loadDiningTablesData() {
    try {
      const data = await getDiningTables();
      if (Array.isArray(data)) {
        setDiningTables(data);
      }
    } catch (e) {
      console.warn("Could not load dining tables:", e);
    }
  }

  async function loadIncomingSharedDishes(tblNum) {
    if (!tblNum) return;
    try {
      setLoadingSharedDishes(true);
      const res = await getTableSharedDishes(tblNum);
      const dishes = Array.isArray(res) ? res : res.shared_dishes || [];
      const incoming = dishes.filter(
        (d) =>
          (d.status === "CONFIRMED" || d.status === "ACTIVE") &&
          String(d.destination_table_number || d.table_number).trim() === String(tblNum).trim()
      );
      setIncomingSharedDishes(incoming);
    } catch (e) {
      console.warn("Could not load table shared dishes:", e);
    } finally {
      setLoadingSharedDishes(false);
    }
  }

  // Periodic poll for incoming shared dishes when a table is active
  useEffect(() => {
    const activeTbl = confirmedOrder?.table_number || tableNumber;
    if (!activeTbl) return;
    loadIncomingSharedDishes(activeTbl);
    const interval = setInterval(() => {
      loadIncomingSharedDishes(activeTbl);
    }, 10000);
    return () => clearInterval(interval);
  }, [confirmedOrder?.table_number, tableNumber]);

  async function loadCatalogData(isBackground = false) {
    if (!isBackground) setLoading(true);
    if (!isBackground) setError(null);
    try {
      const data = await getMenuCatalog();
      setCatalog(Array.isArray(data) ? data : []);
    } catch (err) {
      if (!isBackground) setError(err.message || "Failed to load digital menu");
    } finally {
      if (!isBackground) setLoading(false);
    }
  }

  function handleOpenCustomization(item) {
    const inCartQty = cartItems
      .filter((c) => c.item_id === item.id)
      .reduce((acc, c) => acc + c.quantity, 0);
    const baseStock = item.track_stock ? Number(item.available_quantity || 0) : null;
    const remainingStock = item.track_stock ? Math.max(0, baseStock - inCartQty) : 999;

    if (!item.is_available || (item.track_stock && remainingStock <= 0)) {
      setCartToast(`All available stock for ${item.name} is already in your cart!`);
      setTimeout(() => setCartToast(""), 2500);
      return;
    }
    setSelectedItem(item);
    setItemQuantity(1);

    // Default choices from customization options
    if (item.has_customizations && item.customization_options) {
      const sugars = item.customization_options.sugar_levels || [];
      const strengths = item.customization_options.tea_strength || item.customization_options.strength || [];
      setCustomSugar(sugars[1] || sugars[0] || "Regular Sugar");
      setCustomStrength(strengths[1] || strengths[0] || "Regular");
    } else {
      setCustomSugar("");
      setCustomStrength("");
    }
  }

  function handleCloseCustomization() {
    setSelectedItem(null);
  }

  function handleAddToCart(item, options = null, qty = 1) {
    const inCartQty = cartItems
      .filter((c) => c.item_id === item.id)
      .reduce((acc, c) => acc + c.quantity, 0);

    const baseStock = item.track_stock ? Number(item.available_quantity || 0) : null;
    const remainingStock = item.track_stock ? Math.max(0, baseStock - inCartQty) : 999;

    if (!item.is_available || (item.track_stock && baseStock <= 0)) {
      setCartToast(`Cannot add ${item.name} - Out of stock!`);
      setTimeout(() => setCartToast(""), 2500);
      return;
    }

    if (item.track_stock && remainingStock < qty) {
      setCartToast(`Only ${remainingStock} more available in stock for ${item.name}`);
      setTimeout(() => setCartToast(""), 2500);
      return;
    }

    const customizedOptions = options || (item.has_customizations ? {
      sugar: customSugar,
      strength: customStrength
    } : null);

    const cartKey = `${item.id}-${customizedOptions?.sugar || "default"}-${customizedOptions?.strength || "default"}`;

    const existingIdx = cartItems.findIndex((c) => c.cartKey === cartKey);
    let updatedCart;

    if (existingIdx > -1) {
      updatedCart = [...cartItems];
      updatedCart[existingIdx].quantity += qty;
    } else {
      updatedCart = [
        ...cartItems,
        {
          cartKey,
          item_id: item.id,
          name: item.name,
          price: Number(item.price),
          quantity: qty,
          options: customizedOptions,
          category_name: item.categoryName || ""
        }
      ];
    }

    setCartItems(updatedCart);
    try {
      localStorage.setItem("teashop_cart", JSON.stringify(updatedCart));
    } catch (e) { }

    // Show instant feedback toast with remaining stock
    const newRemaining = item.track_stock ? remainingStock - qty : null;
    setCartToast(
      newRemaining !== null
        ? `Added ${qty}x ${item.name} (${newRemaining} remaining)`
        : `Added ${qty}x ${item.name} to order`
    );
    setTimeout(() => setCartToast(""), 2500);

    handleCloseCustomization();
  }

  function handleRemoveFromCart(index) {
    const updated = cartItems.filter((_, i) => i !== index);
    setCartItems(updated);
    try {
      localStorage.setItem("teashop_cart", JSON.stringify(updated));
    } catch (e) { }
  }

  function handleUpdateCartQty(index, delta) {
    const updated = [...cartItems];
    const target = updated[index];
    if (!target) return;

    const newQty = target.quantity + delta;
    if (newQty <= 0) {
      handleRemoveFromCart(index);
      return;
    }

    // Check catalog stock constraint when incrementing
    if (delta > 0) {
      const catalogItem = catalog.flatMap((c) => c.items || []).find((i) => i.id === target.item_id);
      if (catalogItem && catalogItem.track_stock) {
        const otherInCart = updated
          .filter((c, i) => i !== index && c.item_id === target.item_id)
          .reduce((sum, c) => sum + c.quantity, 0);
        if (newQty + otherInCart > Number(catalogItem.available_quantity)) {
          setCartToast(`Cannot add more - only ${catalogItem.available_quantity} available in stock!`);
          setTimeout(() => setCartToast(""), 2500);
          return;
        }
      }
    }

    target.quantity = newQty;
    setCartItems(updated);
    try {
      localStorage.setItem("teashop_cart", JSON.stringify(updated));
    } catch (e) { }
  }

  async function handlePhoneChange(val) {
    const digits = val.replace(/\D/g, "").slice(0, 15);
    setCustomerPhone(digits);
    if (orderError) setOrderError("");
    if (digits.length >= 10) {
      try {
        const results = await searchCustomers(digits);
        if (results && results.length > 0) {
          const match = results.find((c) => (c.phone || c.mobile_number) === digits.slice(-10)) || results[0];
          if (match) {
            setMatchedCustomer(match);
            if (!customerName.trim()) {
              setCustomerName(match.name);
            }
            return;
          }
        }
      } catch (err) {
        // silent lookup failure
      }
      setMatchedCustomer(null);
    } else {
      setMatchedCustomer(null);
    }
  }

  async function handlePlaceOrder() {
    if (cartItems.length === 0) return;

    // Strict validation: Phone Number and Customer Name are mandatory
    const cleanPhone = (customerPhone || "").replace(/\D/g, "");
    const cleanName = (customerName || "").trim();

    if (!cleanName || cleanName.length < 2) {
      setOrderError("Customer Name is mandatory to place an order (minimum 2 characters).");
      return;
    }

    if (!cleanPhone || cleanPhone.length < 10) {
      setOrderError("Customer Phone Number is mandatory to place an order (minimum 10 digits required).");
      return;
    }

    if (cleanPhone === "0000000000") {
      setOrderError("Please enter a valid active 10-digit mobile number.");
      return;
    }

    // Dine-In requires mandatory Table Number & Seat Number
    if (orderType === "DINE_IN") {
      if (!tableNumber || !tableNumber.trim()) {
        setOrderError("Table Number is mandatory for Dine-In orders. Please select or enter your table number.");
        return;
      }
      if (!seatNumber || !seatNumber.trim()) {
        setOrderError("Seat Number is mandatory for Dine-In orders. Please select your seat number.");
        return;
      }

      // Requirement 4: Seat Capacity Validation
      const cleanTbl = tableNumber.trim();
      const cleanSt = seatNumber.trim();
      const matchedTable = diningTables.find(
        (t) => String(t.table_number).trim() === cleanTbl
      );
      if (matchedTable && matchedTable.max_seats) {
        const seatNum = parseInt(cleanSt, 10);
        if (isNaN(seatNum) || seatNum < 1 || seatNum > matchedTable.max_seats) {
          setOrderError(
            `Table ${matchedTable.table_number} has a maximum of ${matchedTable.max_seats} seats. Please select a seat between 1 and ${matchedTable.max_seats}.`
          );
          return;
        }
      }
    }

    setSubmittingOrder(true);
    setOrderError("");
    try {
      const payload = {
        customer_name: cleanName,
        customer_phone: cleanPhone.slice(-10),
        customer_id: matchedCustomer?.id || null,
        order_type: orderType,
        table_number: orderType === "DINE_IN" ? tableNumber.trim() : null,
        seat_number: orderType === "DINE_IN" ? seatNumber.trim() : null,
        counter_number: counterNumber || null,
        payment_method: paymentMethod,
        notes: orderNotes || null,
        items: cartItems.map((c) => ({
          menu_item_id: c.item_id,
          quantity: c.quantity,
          selected_options: c.options || null
        }))
      };

      const res = await createOrder(payload);

      if (res.order_status === "PENDING_OTP_VERIFICATION" && res.otp_challenge) {
        setPendingOtpOrder(res);
        setOtpDigits(["", "", "", "", "", ""]);
        setOtpError("");
        setOtpStatusMsg("");
        setOtpSecondsRemaining(res.otp_challenge.seconds_until_expiry || 300);
        setOtpCooldownSeconds(res.otp_challenge.seconds_until_resend || 30);
        setOtpAttemptsRemaining(res.otp_challenge.attempts_remaining ?? 5);
        setShowCheckout(false);
        setShowOtpModal(true);
        setTimeout(() => otpInputRefs.current[0]?.focus(), 250);
      } else {
        // Fallback for orders that were confirmed immediately
        setConfirmedOrder(res);
        setShowCheckout(false);
        setCartItems([]);
        try { localStorage.removeItem("teashop_cart"); } catch (e) { }
        await loadCatalogData();
      }
    } catch (err) {
      setOrderError(err.message || "Failed to place order. Please check inputs.");
    } finally {
      setSubmittingOrder(false);
    }
  }

  async function handleChangeTableSeatSubmit() {
    if (!confirmedOrder) return;

    // Requirement 2: Table or seat change allowed only before first order delivery
    if (["COMPLETED", "CANCELLED", "DELIVERED"].includes(confirmedOrder.order_status?.toUpperCase())) {
      setTableSeatMsg("Table or seat change is not allowed after the order has been delivered.");
      return;
    }

    if (!newTableNumber.trim() || !newSeatNumber.trim()) {
      setTableSeatMsg("Both Table Number and Seat Number are required.");
      return;
    }

    // Requirement 4: Seat Capacity Validation
    const cleanTbl = newTableNumber.trim();
    const cleanSt = newSeatNumber.trim();
    const matchedTable = diningTables.find(
      (t) => String(t.table_number).trim() === cleanTbl
    );
    if (matchedTable && matchedTable.max_seats) {
      const seatNum = parseInt(cleanSt, 10);
      if (isNaN(seatNum) || seatNum < 1 || seatNum > matchedTable.max_seats) {
        setTableSeatMsg(
          `Table ${matchedTable.table_number} has a maximum of ${matchedTable.max_seats} seats. Please select a seat between 1 and ${matchedTable.max_seats}.`
        );
        return;
      }
    }

    setTableSeatUpdating(true);
    setTableSeatMsg("");
    try {
      const res = await updateOrderTableSeat(confirmedOrder.id, {
        table_number: cleanTbl,
        seat_number: cleanSt,
      });
      const updatedOrder = res.order || {
        ...confirmedOrder,
        table_number: cleanTbl,
        seat_number: cleanSt,
      };
      setConfirmedOrder(updatedOrder);
      setTableNumber(cleanTbl);
      setSeatNumber(cleanSt);
      setEditingTableSeat(false);
      setCartToast(`Table & Seat updated to #${cleanTbl} / Seat #${cleanSt}!`);
      setTimeout(() => setCartToast(""), 3500);
      loadIncomingSharedDishes(cleanTbl);
    } catch (err) {
      setTableSeatMsg(err.message || "Failed to update table or seat.");
    } finally {
      setTableSeatUpdating(false);
    }
  }

  // OTP Verification Handlers
  function handleOtpDigitChange(index, val) {
    const char = val.replace(/\D/g, "").slice(-1);
    const updated = [...otpDigits];
    updated[index] = char;
    setOtpDigits(updated);
    if (otpError) setOtpError("");

    if (char && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index, e) {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpPaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const updated = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) {
      updated[i] = pasted[i];
    }
    setOtpDigits(updated);
    if (pasted.length === 6) {
      otpInputRefs.current[5]?.focus();
    } else {
      otpInputRefs.current[pasted.length]?.focus();
    }
  }

  function handleQuickFillDevOtp() {
    if (pendingOtpOrder?.otp_challenge?.dev_otp) {
      const chars = pendingOtpOrder.otp_challenge.dev_otp.split("");
      setOtpDigits(chars);
      otpInputRefs.current[5]?.focus();
    }
  }

  async function handleVerifyOtpSubmit(e) {
    if (e) e.preventDefault();
    const fullCode = otpDigits.join("");
    if (fullCode.length !== 6) {
      setOtpError("Please enter all 6 digits of the OTP code.");
      return;
    }

    setVerifyingOtp(true);
    setOtpError("");
    setOtpStatusMsg("");
    try {
      const res = await verifyOrderOtp(pendingOtpOrder.id, fullCode);
      if (res.success && res.order) {
        setShowOtpModal(false);
        setPendingOtpOrder(null);
        setCartItems([]);
        try { localStorage.removeItem("teashop_cart"); } catch (e) { }
        setConfirmedOrder(res.order);
        await loadCatalogData();
      } else {
        setOtpError(res.message || "Invalid OTP code.");
        if (typeof res.attempts_remaining === "number") {
          setOtpAttemptsRemaining(res.attempts_remaining);
        }
      }
    } catch (err) {
      setOtpError(err.message || "Failed to verify OTP. Please try again.");
      setOtpAttemptsRemaining((prev) => (prev > 1 ? prev - 1 : 0));
    } finally {
      setVerifyingOtp(false);
    }
  }

  async function handleResendOtp() {
    if (otpCooldownSeconds > 0 || resendingOtp || !pendingOtpOrder) return;
    setResendingOtp(true);
    setOtpError("");
    setOtpStatusMsg("");
    try {
      const res = await resendOrderOtp(pendingOtpOrder.id);
      setOtpStatusMsg("A fresh 6-digit OTP code has been sent!");
      setOtpCooldownSeconds(res.resend_available_after_seconds || 30);
      setOtpSecondsRemaining(300);
      setOtpAttemptsRemaining(5);
      setOtpDigits(["", "", "", "", "", ""]);
      if (res.challenge_id && pendingOtpOrder.otp_challenge) {
        setPendingOtpOrder({
          ...pendingOtpOrder,
          otp_challenge: {
            ...pendingOtpOrder.otp_challenge,
            dev_otp: res.dev_otp || pendingOtpOrder.otp_challenge.dev_otp,
          }
        });
      }
      otpInputRefs.current[0]?.focus();
    } catch (err) {
      setOtpError(err.message || "Could not resend OTP. Please wait.");
    } finally {
      setResendingOtp(false);
    }
  }

  async function handleCancelOtpVerification() {
    if (!pendingOtpOrder) {
      setShowOtpModal(false);
      return;
    }
    setCancellingOtp(true);
    try {
      await cancelOrderVerification(pendingOtpOrder.id);
      setShowOtpModal(false);
      setPendingOtpOrder(null);
      setCartToast("Order cancelled. Items returned to cart.");
      setTimeout(() => setCartToast(""), 2500);
      await loadCatalogData();
    } catch (err) {
      setOtpError(err.message || "Failed to cancel verification.");
    } finally {
      setCancellingOtp(false);
    }
  }

  function formatOtpTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }


  // Filter items across categories
  const filteredCatalog = catalog.map((cat) => {
    const items = (cat.items || []).filter((item) => {
      const matchesCategory = activeCategory === "all" || String(cat.id) === activeCategory;
      const matchesSearch = !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
    return { ...cat, items };
  }).filter((cat) => cat.items.length > 0);

  const totalCartCount = cartItems.reduce((acc, c) => acc + c.quantity, 0);
  const totalCartAmount = cartItems.reduce((acc, c) => acc + c.quantity * c.price, 0);

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", width: "100%" }}>
      <div style={{
        maxWidth: "540px",
        margin: "0 auto",
        minHeight: "100vh",
        background: "#F8FAFC",
        color: "#0F172A",
        paddingBottom: totalCartCount > 0 ? "100px" : "40px",
        position: "relative"
      }}>
        {/* Sticky Mobile App Bar */}
        <header style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: "rgba(255, 255, 255, 0.96)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid #E2E8F0",
          boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
          padding: "14px 16px"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Link href="/" style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #F59E0B, #D97706)",
                fontSize: "1.2rem",
                textDecoration: "none",
                boxShadow: "0 2px 6px rgba(217, 119, 6, 0.3)"
              }}>
                ☕
              </Link>
              <div>
                <div style={{ fontSize: "1.1rem", fontWeight: "800", color: "#0F172A", letterSpacing: "-0.3px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>ChaiFlow</span>
                  <span style={{ fontSize: "0.68rem", fontWeight: "700", color: "#059669", background: "#ECFDF5", border: "1px solid #A7F3D0", padding: "2px 6px", borderRadius: "4px" }}>
                    QR MENU
                  </span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "#64748B", fontWeight: "500" }}>Fresh Indian Chai & Bites</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
              {/* Requirement 3: My Menu Button - Opens in New Window on Desktop and Mobile */}
              <a
                href={customerPhone ? `/my-menu?phone=${encodeURIComponent(customerPhone)}` : "/my-menu"}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  // Direct window open fallback for mobile browsers / in-app webviews
                  if (typeof window !== "undefined") {
                    const targetUrl = customerPhone ? `/my-menu?phone=${encodeURIComponent(customerPhone)}` : "/my-menu";
                    const newWin = window.open(targetUrl, "_blank");
                    if (newWin) {
                      e.preventDefault();
                    }
                  }
                }}
                style={{
                  background: "linear-gradient(135deg, #059669, #047857)",
                  color: "#FFFFFF",
                  borderRadius: "20px",
                  padding: "7px 14px",
                  fontSize: "0.82rem",
                  fontWeight: "700",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 2px 8px rgba(5, 150, 105, 0.3)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  userSelect: "none"
                }}
                title="Track and manage my orders in new window"
              >
                <span>📋</span>
                <span>My Menu</span>
              </a>

              <button
                onClick={loadCatalogData}
                disabled={loading}
                style={{
                  background: "#F1F5F9",
                  border: "1px solid #CBD5E1",
                  borderRadius: "20px",
                  padding: "4px 10px",
                  fontSize: "0.78rem",
                  color: "#334155",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
                title="Refresh digital menu"
              >
                ↻ {loading ? "..." : "Refresh"}
              </button>
            </div>
          </div>

          {/* Live Search Bar */}
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#64748B", fontSize: "0.9rem" }}>
              🔍
            </span>
            <input
              type="text"
              placeholder="Search tea, snacks, coffee..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                background: "#F1F5F9",
                border: "1px solid #CBD5E1",
                borderRadius: "10px",
                padding: "10px 12px 10px 36px",
                color: "#0F172A",
                fontSize: "0.88rem",
                fontWeight: "500",
                outline: "none"
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "#64748B",
                  cursor: "pointer",
                  fontSize: "0.85rem"
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Horizontal Carousel */}
          <div style={{
            display: "flex",
            gap: "8px",
            marginTop: "12px",
            overflowX: "auto",
            paddingBottom: "4px",
            scrollbarWidth: "none"
          }}>
            <button
              onClick={() => setActiveCategory("all")}
              style={{
                padding: "6px 14px",
                borderRadius: "16px",
                fontSize: "0.8rem",
                fontWeight: "700",
                whiteSpace: "nowrap",
                border: activeCategory === "all" ? "1px solid #D97706" : "1px solid #CBD5E1",
                background: activeCategory === "all" ? "linear-gradient(135deg, #F59E0B, #D97706)" : "#FFFFFF",
                color: activeCategory === "all" ? "#FFFFFF" : "#475569",
                boxShadow: activeCategory === "all" ? "0 2px 6px rgba(217, 119, 6, 0.25)" : "0 1px 2px rgba(0,0,0,0.04)",
                cursor: "pointer"
              }}
            >
              All Items
            </button>
            {catalog.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(String(cat.id))}
                style={{
                  padding: "6px 14px",
                  borderRadius: "16px",
                  fontSize: "0.8rem",
                  fontWeight: "700",
                  whiteSpace: "nowrap",
                  border: activeCategory === String(cat.id) ? "1px solid #D97706" : "1px solid #CBD5E1",
                  background: activeCategory === String(cat.id) ? "linear-gradient(135deg, #F59E0B, #D97706)" : "#FFFFFF",
                  color: activeCategory === String(cat.id) ? "#FFFFFF" : "#475569",
                  boxShadow: activeCategory === String(cat.id) ? "0 2px 6px rgba(217, 119, 6, 0.25)" : "0 1px 2px rgba(0,0,0,0.04)",
                  cursor: "pointer"
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </header>

        {/* Toast Notification */}
        {
          cartToast && (
            <div style={{
              position: "fixed",
              top: "140px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 60,
              background: "#10b981",
              color: "#fff",
              padding: "8px 16px",
              borderRadius: "20px",
              fontSize: "0.82rem",
              fontWeight: "600",
              boxShadow: "0 8px 24px rgba(16, 185, 129, 0.4)",
              animation: "fadeIn 0.2s ease"
            }}>
              ✓ {cartToast}
            </div>
          )
        }

        {/* Menu Item Content Section */}
        <main style={{ padding: "16px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#64748B" }}>
              <div style={{ fontSize: "2rem", marginBottom: "12px", animation: "spin 1.5s infinite linear" }}>☕</div>
              <p style={{ fontSize: "0.9rem", fontWeight: "600" }}>Brewing your digital menu...</p>
            </div>
          ) : error ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <p style={{ color: "#DC2626", marginBottom: "12px", fontWeight: "600" }}>{error}</p>
              <button
                onClick={loadCatalogData}
                style={{
                  background: "#F1F5F9",
                  border: "1px solid #CBD5E1",
                  color: "#0F172A",
                  fontWeight: "600",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  cursor: "pointer"
                }}
              >
                Retry
              </button>
            </div>
          ) : filteredCatalog.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#64748B" }}>
              <p style={{ fontWeight: "500" }}>No products match "{searchQuery}"</p>
            </div>
          ) : (
            filteredCatalog.map((category) => (
              <section key={category.id} style={{ marginBottom: "28px" }}>
                <div style={{ marginBottom: "12px" }}>
                  <h2 style={{ fontSize: "1.1rem", fontWeight: "800", color: "#B45309", letterSpacing: "-0.2px" }}>
                    {category.name}
                  </h2>
                  {category.description && (
                    <p style={{ fontSize: "0.78rem", color: "#64748B", marginTop: "2px" }}>
                      {category.description}
                    </p>
                  )}
                </div>

                {/* Items List */}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {category.items.map((item) => {
                    const inCartQty = cartItems
                      .filter((c) => c.item_id === item.id)
                      .reduce((acc, c) => acc + c.quantity, 0);

                    const baseStock = item.track_stock ? Number(item.available_quantity || 0) : null;
                    const effectiveStock = item.track_stock ? Math.max(0, baseStock - inCartQty) : null;

                    const isShopOutOfStock = !item.is_available || (item.track_stock && baseStock <= 0);
                    const isAllInCart = item.track_stock && !isShopOutOfStock && effectiveStock <= 0;
                    const isLowStock = item.track_stock && !isShopOutOfStock && !isAllInCart && effectiveStock <= (item.low_stock_threshold ?? 5);

                    const isButtonDisabled = isShopOutOfStock || isAllInCart;

                    return (
                      <div
                        key={item.id}
                        style={{
                          background: isButtonDisabled ? "#F8FAFC" : "#FFFFFF",
                          border: isShopOutOfStock
                            ? "1px solid #FECACA"
                            : isAllInCart
                              ? "1px solid #FDE68A"
                              : "1px solid #E2E8F0",
                          borderRadius: "14px",
                          padding: "16px",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "12px",
                          opacity: isButtonDisabled ? 0.75 : 1,
                          boxShadow: isButtonDisabled ? "none" : "0 2px 6px rgba(15, 23, 42, 0.04), 0 1px 2px rgba(15, 23, 42, 0.02)",
                          transition: "all 0.2s ease",
                        }}
                      >
                        <div style={{ flex: "1" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                            <h3 style={{ fontSize: "0.98rem", fontWeight: "700", color: isButtonDisabled ? "#94A3B8" : "#0F172A" }}>
                              {item.name}
                            </h3>
                            {item.has_customizations && (
                              <span style={{
                                fontSize: "0.68rem",
                                background: "#FEF3C7",
                                color: "#B45309",
                                border: "1px solid #FDE68A",
                                padding: "2px 7px",
                                borderRadius: "4px",
                                fontWeight: "700"
                              }}>
                                Customizable
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: "1.08rem", fontWeight: "800", color: isButtonDisabled ? "#94A3B8" : "#059669", marginTop: "4px" }}>
                            ₹{item.price}
                          </div>

                          {item.description && (
                            <p style={{ fontSize: "0.8rem", color: "#475569", marginTop: "4px", lineHeight: "1.4" }}>
                              {item.description}
                            </p>
                          )}

                          {/* Stock Availability Indicator Badge */}
                          <div style={{ marginTop: "8px" }}>
                            {isShopOutOfStock ? (
                              <span style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                fontSize: "0.72rem",
                                color: "#DC2626",
                                background: "#FEE2E2",
                                border: "1px solid #FECACA",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontWeight: "700"
                              }}>
                                ● Out of Stock (0 available)
                              </span>
                            ) : isAllInCart ? (
                              <span style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                fontSize: "0.72rem",
                                color: "#B45309",
                                background: "#FEF3C7",
                                border: "1px solid #FDE68A",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontWeight: "700"
                              }}>
                                ✓ Max In Cart ({inCartQty} added • 0 left)
                              </span>
                            ) : item.track_stock ? (
                              isLowStock ? (
                                <span style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontSize: "0.72rem",
                                  color: "#D97706",
                                  background: "#FEF3C7",
                                  border: "1px solid #FDE68A",
                                  padding: "2px 8px",
                                  borderRadius: "6px",
                                  fontWeight: "700"
                                }}>
                                  ⚡ Low Stock: {effectiveStock} left {inCartQty > 0 ? `(${inCartQty} in cart)` : ""}
                                </span>
                              ) : (
                                <span style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontSize: "0.72rem",
                                  color: "#059669",
                                  background: "#ECFDF5",
                                  border: "1px solid #A7F3D0",
                                  padding: "2px 8px",
                                  borderRadius: "6px",
                                  fontWeight: "600"
                                }}>
                                  📦 Stock: {effectiveStock} available {inCartQty > 0 ? `(${inCartQty} in cart)` : ""}
                                </span>
                              )
                            ) : (
                              <span style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                fontSize: "0.72rem",
                                color: "#475569",
                                background: "#F1F5F9",
                                border: "1px solid #E2E8F0",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontWeight: "600"
                              }}>
                                ✓ Fresh Daily
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action Button: Disabled when stock is 0 or all in cart */}
                        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end" }}>
                          {isButtonDisabled ? (
                            <button
                              disabled
                              aria-disabled="true"
                              title={isShopOutOfStock ? "Out of stock - Currently unavailable" : "All available stock already added to cart"}
                              style={{
                                background: isShopOutOfStock ? "#FEE2E2" : "#FEF3C7",
                                border: isShopOutOfStock ? "1px solid #FECACA" : "1px solid #FDE68A",
                                color: isShopOutOfStock ? "#DC2626" : "#B45309",
                                padding: "7px 14px",
                                borderRadius: "8px",
                                fontSize: "0.8rem",
                                fontWeight: "700",
                                cursor: "not-allowed",
                                opacity: 0.8
                              }}
                            >
                              {isShopOutOfStock ? "Sold Out" : "Max in Cart"}
                            </button>
                          ) : item.has_customizations ? (
                            <button
                              onClick={() => handleOpenCustomization(item)}
                              style={{
                                background: "#FFFBEB",
                                border: "1.5px solid #F59E0B",
                                color: "#D97706",
                                padding: "7px 14px",
                                borderRadius: "8px",
                                fontSize: "0.8rem",
                                fontWeight: "700",
                                cursor: "pointer",
                                boxShadow: "0 1px 3px rgba(245, 158, 11, 0.15)",
                                transition: "transform 0.15s ease"
                              }}
                            >
                              Customize +
                            </button>
                          ) : (
                            <button
                              onClick={() => handleAddToCart(item, null, 1)}
                              style={{
                                background: "linear-gradient(135deg, #10B981, #059669)",
                                border: "none",
                                color: "#FFFFFF",
                                padding: "7px 16px",
                                borderRadius: "8px",
                                fontSize: "0.8rem",
                                fontWeight: "700",
                                cursor: "pointer",
                                boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
                                transition: "transform 0.15s ease"
                              }}
                            >
                              ADD +
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </main>

        {/* Floating Bottom Cart Bar (Connects to Phase 7 Cart) */}
        {
          totalCartCount > 0 && (
            <div style={{
              position: "fixed",
              bottom: "16px",
              left: "50%",
              transform: "translateX(-50%)",
              width: "calc(100% - 32px)",
              maxWidth: "508px",
              zIndex: 50,
              background: "linear-gradient(135deg, #10b981, #059669)",
              borderRadius: "16px",
              padding: "12px 18px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              boxShadow: "0 10px 30px rgba(16, 185, 129, 0.45)"
            }}>
              <div>
                <div style={{ fontSize: "0.78rem", color: "rgba(255, 255, 255, 0.85)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {totalCartCount} {totalCartCount === 1 ? "Item" : "Items"} in Cart
                </div>
                <div style={{ fontSize: "1.15rem", fontWeight: "700", color: "#fff" }}>
                  ₹{totalCartAmount.toFixed(2)}
                </div>
              </div>

              <button
                onClick={() => setShowCheckout(true)}
                style={{
                  background: "#fff",
                  color: "#059669",
                  border: "none",
                  padding: "9px 18px",
                  borderRadius: "10px",
                  fontSize: "0.88rem",
                  fontWeight: "700",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
                }}
              >
                <span>Checkout & Token</span>
                <span>→</span>
              </button>
            </div>
          )
        }

        {/* Customization Bottom Sheet Modal */}
        {
          selectedItem && (
            <div style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 70,
              background: "rgba(15, 23, 42, 0.55)",
              backdropFilter: "blur(6px)",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center"
            }}>
              <div style={{
                background: "#FFFFFF",
                width: "100%",
                maxWidth: "540px",
                borderTopLeftRadius: "24px",
                borderTopRightRadius: "24px",
                border: "1px solid #E2E8F0",
                padding: "24px 20px",
                maxHeight: "85vh",
                overflowY: "auto",
                boxShadow: "0 -8px 30px rgba(15, 23, 42, 0.12)"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                  <div>
                    <h3 style={{ fontSize: "1.2rem", fontWeight: "700", color: "#0F172A" }}>
                      {selectedItem.name}
                    </h3>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "1.1rem", fontWeight: "700", color: "#059669" }}>
                        ₹{selectedItem.price}
                      </span>
                      {selectedItem.track_stock && (() => {
                        const selectedInCart = cartItems
                          .filter((c) => c.item_id === selectedItem.id)
                          .reduce((sum, c) => sum + c.quantity, 0);
                        const selectedBaseStock = Number(selectedItem.available_quantity || 0);
                        const selectedRemaining = Math.max(0, selectedBaseStock - selectedInCart);

                        return (
                          <span style={{
                            fontSize: "0.75rem",
                            fontWeight: "700",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            background: selectedBaseStock <= 0
                              ? "#FEE2E2"
                              : selectedRemaining <= 0
                                ? "#FEF3C7"
                                : selectedRemaining <= (selectedItem.low_stock_threshold ?? 5)
                                  ? "#FEF3C7"
                                  : "#ECFDF5",
                            color: selectedBaseStock <= 0
                              ? "#DC2626"
                              : selectedRemaining <= 0
                                ? "#B45309"
                                : selectedRemaining <= (selectedItem.low_stock_threshold ?? 5)
                                  ? "#B45309"
                                  : "#059669",
                            border: `1px solid ${selectedBaseStock <= 0 ? "#FCA5A5" : selectedRemaining <= (selectedItem.low_stock_threshold ?? 5) ? "#FCD34D" : "#A7F3D0"}`
                          }}>
                            {selectedBaseStock <= 0
                              ? "🚫 Out of Stock"
                              : selectedRemaining <= 0
                                ? `⚠️ Max in Cart (${selectedInCart} added)`
                                : selectedRemaining <= (selectedItem.low_stock_threshold ?? 5)
                                  ? `⚡ Only ${selectedRemaining} left (${selectedInCart} in cart)`
                                  : `📦 Stock: ${selectedRemaining} available`}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <button
                    onClick={handleCloseCustomization}
                    style={{
                      background: "#F1F5F9",
                      border: "1px solid #E2E8F0",
                      color: "#64748B",
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      cursor: "pointer",
                      fontSize: "1rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* Sugar Level Customizer */}
                {selectedItem.customization_options?.sugar_levels && (
                  <div style={{ marginBottom: "18px" }}>
                    <label style={{ fontSize: "0.84rem", fontWeight: "700", color: "#B45309", display: "block", marginBottom: "8px" }}>
                      🍬 Sugar Preference
                    </label>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {selectedItem.customization_options.sugar_levels.map((level) => (
                        <button
                          key={level}
                          onClick={() => setCustomSugar(level)}
                          style={{
                            padding: "7px 14px",
                            borderRadius: "10px",
                            fontSize: "0.82rem",
                            fontWeight: "600",
                            cursor: "pointer",
                            border: customSugar === level ? "1.5px solid #10B981" : "1px solid #CBD5E1",
                            background: customSugar === level ? "#ECFDF5" : "#F8FAFC",
                            color: customSugar === level ? "#059669" : "#334155",
                            transition: "all 0.15s ease"
                          }}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tea Strength Customizer */}
                {(selectedItem.customization_options?.tea_strength || selectedItem.customization_options?.strength) && (
                  <div style={{ marginBottom: "22px" }}>
                    <label style={{ fontSize: "0.84rem", fontWeight: "700", color: "#B45309", display: "block", marginBottom: "8px" }}>
                      💪 Chai Strength
                    </label>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {(selectedItem.customization_options.tea_strength || selectedItem.customization_options.strength).map((str) => (
                        <button
                          key={str}
                          onClick={() => setCustomStrength(str)}
                          style={{
                            padding: "7px 14px",
                            borderRadius: "10px",
                            fontSize: "0.82rem",
                            fontWeight: "600",
                            cursor: "pointer",
                            border: customStrength === str ? "1.5px solid #10B981" : "1px solid #CBD5E1",
                            background: customStrength === str ? "#ECFDF5" : "#F8FAFC",
                            color: customStrength === str ? "#059669" : "#334155",
                            transition: "all 0.15s ease"
                          }}
                        >
                          {str}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quantity Stepper */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                  <span style={{ fontSize: "0.88rem", fontWeight: "600", color: "#475569" }}>Quantity</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <button
                      onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))}
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "8px",
                        background: "#F1F5F9",
                        border: "1px solid #CBD5E1",
                        color: "#0F172A",
                        fontSize: "1.2rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      -
                    </button>
                    <span style={{ fontSize: "1.1rem", fontWeight: "700", color: "#0F172A" }}>{itemQuantity}</span>
                    <button
                      onClick={() => {
                        const inCart = cartItems
                          .filter((c) => c.item_id === selectedItem.id)
                          .reduce((sum, c) => sum + c.quantity, 0);
                        const remaining = selectedItem.track_stock
                          ? Math.max(0, Number(selectedItem.available_quantity || 0) - inCart)
                          : 999;
                        if (selectedItem.track_stock && itemQuantity >= remaining) return;
                        setItemQuantity(itemQuantity + 1);
                      }}
                      disabled={(() => {
                        if (!selectedItem.track_stock) return false;
                        const inCart = cartItems
                          .filter((c) => c.item_id === selectedItem.id)
                          .reduce((sum, c) => sum + c.quantity, 0);
                        const remaining = Math.max(0, Number(selectedItem.available_quantity || 0) - inCart);
                        return itemQuantity >= remaining;
                      })()}
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "8px",
                        background: "#F1F5F9",
                        border: "1px solid #CBD5E1",
                        color: "#0F172A",
                        fontSize: "1.2rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Confirm CTA */}
                {(() => {
                  const inCart = cartItems
                    .filter((c) => c.item_id === selectedItem.id)
                    .reduce((sum, c) => sum + c.quantity, 0);
                  const baseStock = Number(selectedItem.available_quantity || 0);
                  const remaining = selectedItem.track_stock ? Math.max(0, baseStock - inCart) : 999;
                  const isBlocked = selectedItem.track_stock && (remaining <= 0 || itemQuantity > remaining);

                  return (
                    <button
                      onClick={() => handleAddToCart(selectedItem, { sugar: customSugar, strength: customStrength }, itemQuantity)}
                      disabled={isBlocked}
                      style={{
                        width: "100%",
                        background: isBlocked
                          ? "#FEE2E2"
                          : "linear-gradient(135deg, #10B981, #059669)",
                        border: isBlocked ? "1px solid #FCA5A5" : "none",
                        color: isBlocked ? "#DC2626" : "#FFFFFF",
                        padding: "14px",
                        borderRadius: "12px",
                        fontSize: "0.95rem",
                        fontWeight: "700",
                        cursor: isBlocked ? "not-allowed" : "pointer",
                        boxShadow: isBlocked ? "none" : "0 4px 16px rgba(16, 185, 129, 0.35)",
                        transition: "all 0.15s ease"
                      }}
                    >
                      {isBlocked
                        ? remaining <= 0
                          ? "Max In Cart • Limit Reached"
                          : "Sold Out • Out of Stock"
                        : `Add to Order • ₹${(Number(selectedItem.price) * itemQuantity).toFixed(2)}`}
                    </button>
                  );
                })()}
              </div>
            </div>
          )
        }

        {/* Phase 7: Interactive Checkout Drawer Modal */}
        {
          showCheckout && (
            <div style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 80,
              background: "rgba(15, 23, 42, 0.55)",
              backdropFilter: "blur(6px)",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center"
            }}>
              <div style={{
                background: "#FFFFFF",
                width: "100%",
                maxWidth: "540px",
                borderTopLeftRadius: "24px",
                borderTopRightRadius: "24px",
                border: "1px solid #E2E8F0",
                padding: "24px 20px",
                maxHeight: "90vh",
                overflowY: "auto",
                boxShadow: "0 -8px 30px rgba(15, 23, 42, 0.12)"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "1.3rem" }}>🧾</span>
                    <h3 style={{ fontSize: "1.2rem", fontWeight: "700", color: "#0F172A" }}>
                      Confirm Order & Token
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowCheckout(false)}
                    style={{
                      background: "#F1F5F9",
                      border: "1px solid #E2E8F0",
                      color: "#64748B",
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      cursor: "pointer",
                      fontSize: "1rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* Error Message banner */}
                {orderError && (
                  <div style={{
                    background: "#FEF2F2",
                    border: "1px solid #FCA5A5",
                    color: "#DC2626",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    fontSize: "0.85rem",
                    fontWeight: "600",
                    marginBottom: "16px"
                  }}>
                    ⚠️ {orderError}
                  </div>
                )}

                {/* Order Type Selector: Dine-In vs Takeaway */}
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ fontSize: "0.8rem", color: "#475569", display: "block", marginBottom: "6px", textTransform: "uppercase", fontWeight: "700" }}>
                    Order Type <span style={{ color: "#EF4444" }}>*</span>
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setOrderType("DINE_IN");
                        if (orderError) setOrderError("");
                      }}
                      style={{
                        padding: "10px 8px",
                        borderRadius: "10px",
                        fontSize: "0.85rem",
                        fontWeight: "700",
                        cursor: "pointer",
                        border: orderType === "DINE_IN" ? "2px solid #D97706" : "1px solid #CBD5E1",
                        background: orderType === "DINE_IN" ? "#FEF3C7" : "#F8FAFC",
                        color: orderType === "DINE_IN" ? "#B45309" : "#64748B",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        transition: "all 0.15s ease"
                      }}
                    >
                      <span>🍽️</span> Dine-in (At Table)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOrderType("TAKEAWAY");
                        if (orderError) setOrderError("");
                      }}
                      style={{
                        padding: "10px 8px",
                        borderRadius: "10px",
                        fontSize: "0.85rem",
                        fontWeight: "700",
                        cursor: "pointer",
                        border: orderType === "TAKEAWAY" ? "2px solid #059669" : "1px solid #CBD5E1",
                        background: orderType === "TAKEAWAY" ? "#ECFDF5" : "#F8FAFC",
                        color: orderType === "TAKEAWAY" ? "#059669" : "#64748B",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        transition: "all 0.15s ease"
                      }}
                    >
                      <span>🛍️</span> Takeaway / Parcel
                    </button>
                  </div>
                </div>

                {/* Dine-In: Mandatory Table & Seat Inputs with Dynamic Capacity */}
                {orderType === "DINE_IN" ? (
                  <div style={{
                    background: "#FFFBEB",
                    border: "1px solid #FDE68A",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    marginBottom: "16px"
                  }}>
                    // <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "6px" }}>
                    //   <div>
                    //     <label style={{ fontSize: "0.8rem", color: "#B45309", display: "flex", justifyContent: "space-between", marginBottom: "4px", fontWeight: "700" }}>
                    //       <span>Table No. <span style={{ color: "#EF4444" }}>*</span></span>
                    //     </label>
                    //     {diningTables && diningTables.length > 0 ? (
                    //       <select
                    //         value={tableNumber}
                    //         onChange={(e) => {
                    //           const val = e.target.value;
                    //           setTableNumber(val);
                    //           if (orderError) setOrderError("");
                    //           const tbl = diningTables.find((t) => String(t.table_number).trim() === String(val).trim());
                    //           if (tbl && seatNumber && parseInt(seatNumber, 10) > tbl.max_seats) {
                    //             setSeatNumber("1");
                    //           }
                    //         }}
                    //         style={{
                    //           width: "100%",
                    //           background: "#FFFFFF",
                    //           border: !tableNumber.trim() ? "1.5px solid #EF4444" : "1.5px solid #CBD5E1",
                    //           borderRadius: "8px",
                    //           padding: "9px 12px",
                    //           color: "#0F172A",
                    //           fontSize: "0.88rem",
                    //           fontWeight: "700",
                    //           outline: "none"
                    //         }}
                    //       >
                    //         <option value="">Select Table...</option>
                    //         {diningTables.map((t) => (
                    //           <option key={t.id} value={t.table_number}>
                    //             Table #{t.table_number} ({t.max_seats} Seats)
                    //           </option>
                    //         ))}
                    //       </select>
                    //     ) : (
                    //       <input
                    //         type="text"
                    //         placeholder="e.g. 3, T-5"
                    //         value={tableNumber}
                    //         onChange={(e) => {
                    //           setTableNumber(e.target.value);
                    //           if (orderError) setOrderError("");
                    //         }}
                    //         style={{
                    //           width: "100%",
                    //           background: "#FFFFFF",
                    //           border: !tableNumber.trim() ? "1.5px solid #EF4444" : "1.5px solid #CBD5E1",
                    //           borderRadius: "8px",
                    //           padding: "9px 12px",
                    //           color: "#0F172A",
                    //           fontSize: "0.88rem",
                    //           fontWeight: "700",
                    //           outline: "none"
                    //         }}
                    //       />
                    //     )}
                    //   </div>
                    //   <div>
                    //     <label style={{ fontSize: "0.8rem", color: "#B45309", display: "flex", justifyContent: "space-between", marginBottom: "4px", fontWeight: "700" }}>
                    //       <span>Seat No. <span style={{ color: "#EF4444" }}>*</span></span>
                    //       {(() => {
                    //         const tbl = diningTables.find((t) => String(t.table_number).trim() === String(tableNumber).trim());
                    //         return tbl ? <span style={{ color: "#78350F", fontWeight: "600", fontSize: "0.72rem" }}>Max: {tbl.max_seats}</span> : null;
                    //       })()}
                    //     </label>
                    //     {(() => {
                    //       const tbl = diningTables.find((t) => String(t.table_number).trim() === String(tableNumber).trim());
                    //       if (tbl && tbl.max_seats > 0) {
                    //         return (
                    //           <select
                    //             value={seatNumber}
                    //             onChange={(e) => {
                    //               setSeatNumber(e.target.value);
                    //               if (orderError) setOrderError("");
                    //             }}
                    //             style={{
                    //               width: "100%",
                    //               background: "#FFFFFF",
                    //               border: !seatNumber.trim() ? "1.5px solid #EF4444" : "1.5px solid #CBD5E1",
                    //               borderRadius: "8px",
                    //               padding: "9px 12px",
                    //               color: "#0F172A",
                    //               fontSize: "0.88rem",
                    //               fontWeight: "700",
                    //               outline: "none"
                    //             }}
                    //           >
                    //             <option value="">Select Seat (1 - {tbl.max_seats})...</option>
                    //             {Array.from({ length: tbl.max_seats }, (_, i) => String(i + 1)).map((s) => (
                    //               <option key={s} value={s}>
                    //                 Seat #{s}
                    //               </option>
                    //             ))}
                    //           </select>
                    //         );
                    //       }
                    //       return (
                    //         <input
                    //           type="text"
                    //           placeholder="e.g. 1, 2"
                    //           value={seatNumber}
                    //           onChange={(e) => {
                    //             setSeatNumber(e.target.value);
                    //             if (orderError) setOrderError("");
                    //           }}
                    //           style={{
                    //             width: "100%",
                    //             background: "#FFFFFF",
                    //             border: !seatNumber.trim() ? "1.5px solid #EF4444" : "1.5px solid #CBD5E1",
                    //             borderRadius: "8px",
                    //             padding: "9px 12px",
                    //             color: "#0F172A",
                    //             fontSize: "0.88rem",
                    //             fontWeight: "700",
                    //             outline: "none"
                    //           }}
                    //         />
                    //       );
                    //     })()}
                    //   </div>
                    // </div>
                    {(() => {
                      const tbl = diningTables.find((t) => String(t.table_number).trim() === String(tableNumber).trim());
                      if (tbl && seatNumber && (parseInt(seatNumber, 10) < 1 || parseInt(seatNumber, 10) > tbl.max_seats)) {
                        return (
                          <div style={{ fontSize: "0.74rem", color: "#DC2626", marginBottom: "4px", fontWeight: "600" }}>
                            ⚠️ Table {tbl.table_number} has a maximum of {tbl.max_seats} seats. Please select a seat between 1 and {tbl.max_seats}.
                          </div>
                        );
                      }
                      return (
                        <div style={{ fontSize: "0.74rem", color: "#64748B" }}>
                          ℹ️ Staff will deliver directly to Table #{tableNumber || "—"} / Seat #{seatNumber || "—"}.
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div style={{
                    background: "#ECFDF5",
                    border: "1px solid #A7F3D0",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    marginBottom: "16px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                  }}>
                    <span style={{ fontSize: "1.2rem" }}>🛍️</span>
                    <div style={{ fontSize: "0.78rem", color: "#065F46" }}>
                      <strong>Takeaway Order:</strong> No table or seat required. Your daily token will be called at the counter when ready.
                    </div>
                  </div>
                )}

                {/* Order Items Preview */}
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ fontSize: "0.82rem", fontWeight: "700", color: "#475569", display: "block", marginBottom: "8px", textTransform: "uppercase" }}>
                    Cart Items ({cartItems.length})
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {cartItems.map((c, idx) => (
                      <div key={c.cartKey || idx} style={{
                        background: "#F8FAFC",
                        border: "1px solid #E2E8F0",
                        borderRadius: "10px",
                        padding: "10px 12px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}>
                        <div>
                          <div style={{ fontSize: "0.92rem", fontWeight: "600", color: "#0F172A" }}>
                            {c.quantity}x {c.name}
                          </div>
                          {c.options && (
                            <div style={{ fontSize: "0.75rem", color: "#B45309", marginTop: "2px" }}>
                              {c.options.sugar && `🍬 ${c.options.sugar}`} {c.options.strength && `• 💪 ${c.options.strength}`}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {/* Quantity decrement/increment */}
                          <div style={{
                            display: "flex",
                            alignItems: "center",
                            background: "#FFFFFF",
                            border: "1px solid #CBD5E1",
                            borderRadius: "6px"
                          }}>
                            <button
                              onClick={() => handleUpdateCartQty(idx, -1)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "#0F172A",
                                width: "24px",
                                height: "24px",
                                cursor: "pointer",
                                fontSize: "0.9rem",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center"
                              }}
                            >
                              -
                            </button>
                            <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "#0F172A", minWidth: "18px", textAlign: "center" }}>
                              {c.quantity}
                            </span>
                            <button
                              onClick={() => handleUpdateCartQty(idx, 1)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "#0F172A",
                                width: "24px",
                                height: "24px",
                                cursor: "pointer",
                                fontSize: "0.9rem",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center"
                              }}
                            >
                              +
                            </button>
                          </div>

                          <span style={{ fontSize: "0.95rem", fontWeight: "700", color: "#059669", minWidth: "60px", textAlign: "right" }}>
                            ₹{(c.price * c.quantity).toFixed(2)}
                          </span>
                          <button
                            onClick={() => handleRemoveFromCart(idx)}
                            style={{
                              background: "#FEE2E2",
                              border: "none",
                              color: "#DC2626",
                              borderRadius: "6px",
                              width: "24px",
                              height: "24px",
                              cursor: "pointer",
                              fontSize: "0.8rem",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center"
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Customer Inputs - Phone No & Customer Identity are Mandatory */}
                <div style={{ marginBottom: "14px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ fontSize: "0.8rem", color: "#334155", display: "flex", justifyContent: "space-between", marginBottom: "4px", fontWeight: "600" }}>
                        <span>Customer Name <span style={{ color: "#EF4444" }}>*</span></span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Ramesh Kumar"
                        value={customerName}
                        onChange={(e) => {
                          setCustomerName(e.target.value);
                          if (orderError) setOrderError("");
                        }}
                        style={{
                          width: "100%",
                          background: "#FFFFFF",
                          border: !customerName.trim() ? "1.5px solid #EF4444" : "1.5px solid #CBD5E1",
                          borderRadius: "8px",
                          padding: "9px 12px",
                          color: "#0F172A",
                          fontSize: "0.85rem",
                          outline: "none"
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "0.8rem", color: "#334155", display: "flex", justifyContent: "space-between", marginBottom: "4px", fontWeight: "600" }}>
                        <span>Phone No. <span style={{ color: "#EF4444" }}>* (10 Digits)</span></span>
                      </label>
                      <input
                        type="tel"
                        maxLength={10}
                        placeholder="e.g. 9876543210"
                        value={customerPhone}
                        onChange={(e) => handlePhoneChange(e.target.value)}
                        style={{
                          width: "100%",
                          background: "#FFFFFF",
                          border: customerPhone.length === 10 ? "1.5px solid #10B981" : "1.5px solid #CBD5E1",
                          borderRadius: "8px",
                          padding: "9px 12px",
                          color: "#0F172A",
                          fontSize: "0.85rem",
                          outline: "none"
                        }}
                      />
                    </div>
                  </div>

                  {/* Live Customer Number & Verification Status */}
                  <div style={{ marginTop: "8px" }}>
                    {matchedCustomer ? (
                      <div style={{
                        background: "#ECFDF5",
                        border: "1px solid #A7F3D0",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}>
                        <span style={{ fontSize: "0.8rem", color: "#059669", fontWeight: "700" }}>
                          ✓ Customer #{matchedCustomer.id}: {matchedCustomer.name}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "#475569" }}>
                          Credit: ₹{Number(matchedCustomer.credit_account?.current_balance || 0).toFixed(2)}
                        </span>
                      </div>
                    ) : customerPhone.length === 10 ? (
                      <div style={{
                        background: "#F0F9FF",
                        border: "1px solid #BAE6FD",
                        padding: "6px 12px",
                        borderRadius: "8px",
                        fontSize: "0.78rem",
                        color: "#0284C7",
                        fontWeight: "600"
                      }}>
                        🆕 New Customer — Official Customer Number will be assigned upon ordering
                      </div>
                    ) : customerPhone.length > 0 ? (
                      <div style={{ fontSize: "0.75rem", color: "#D97706", paddingLeft: "4px", fontWeight: "600" }}>
                        ⚠️ Enter 10-digit mobile number ({10 - customerPhone.length} digits left)
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.75rem", color: "#64748B", paddingLeft: "4px" }}>
                        ℹ️ Both Customer Name and 10-digit Phone No. are mandatory to place order.
                      </div>
                    )}
                  </div>
                </div>

                {/* Payment Method Selector */}
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ fontSize: "0.8rem", color: "#475569", display: "block", marginBottom: "6px", textTransform: "uppercase", fontWeight: "700" }}>
                    Payment Method
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                    {[
                      { id: "CASH", label: "Cash 💵" },
                      { id: "UPI", label: "UPI 📱" },
                      { id: "CARD", label: "Card 💳" },
                      { id: "CREDIT", label: "Credit 📝" }
                    ].map((pm) => (
                      <button
                        key={pm.id}
                        onClick={() => setPaymentMethod(pm.id)}
                        style={{
                          padding: "10px 4px",
                          borderRadius: "10px",
                          fontSize: "0.82rem",
                          fontWeight: "700",
                          cursor: "pointer",
                          border: paymentMethod === pm.id ? "1.5px solid #10B981" : "1px solid #CBD5E1",
                          background: paymentMethod === pm.id ? "#ECFDF5" : "#F8FAFC",
                          color: paymentMethod === pm.id ? "#059669" : "#334155",
                          transition: "all 0.15s ease"
                        }}
                      >
                        {pm.label}
                      </button>
                    ))}
                  </div>
                  {paymentMethod === "CREDIT" && (
                    <div style={{ fontSize: "0.75rem", color: "#B45309", marginTop: "6px", fontWeight: "600" }}>
                      ℹ️ Credit purchase requires an approved customer account with available credit limit.
                    </div>
                  )}
                </div>

                {/* Preparation Notes */}
                <div style={{ marginBottom: "18px" }}>
                  <label style={{ fontSize: "0.8rem", color: "#475569", display: "block", marginBottom: "4px", fontWeight: "600" }}>
                    Special Instructions (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Serve extra hot, less spice in samosa"
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    style={{
                      width: "100%",
                      background: "#FFFFFF",
                      border: "1px solid #CBD5E1",
                      borderRadius: "8px",
                      padding: "9px 12px",
                      color: "#0F172A",
                      fontSize: "0.85rem",
                      outline: "none"
                    }}
                  />
                </div>

                {/* Order Validation Error Banner */}
                {orderError && (
                  <div style={{
                    background: "#FEF2F2",
                    border: "1px solid #FCA5A5",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    color: "#DC2626",
                    fontSize: "0.82rem",
                    fontWeight: "600",
                    marginBottom: "14px"
                  }}>
                    ❌ {orderError}
                  </div>
                )}

                {/* Subtotal & Confirm CTA */}
                <button
                  onClick={handlePlaceOrder}
                  disabled={submittingOrder || cartItems.length === 0}
                  style={{
                    width: "100%",
                    background: "linear-gradient(135deg, #10B981, #059669)",
                    border: "none",
                    color: "#FFFFFF",
                    padding: "15px",
                    borderRadius: "12px",
                    fontSize: "1rem",
                    fontWeight: "700",
                    cursor: submittingOrder ? "not-allowed" : "pointer",
                    boxShadow: "0 4px 16px rgba(16, 185, 129, 0.35)",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: "8px",
                    transition: "all 0.15s ease"
                  }}
                >
                  <span>{submittingOrder ? "Allocating Token & Placing..." : `Place Order • ₹${totalCartAmount.toFixed(2)}`}</span>
                </button>
              </div>
            </div>
          )
        }

        {/* Mandatory OTP Verification Modal */}
        {
          showOtpModal && pendingOtpOrder && (
            <div style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 85,
              background: "rgba(15, 23, 42, 0.6)",
              backdropFilter: "blur(10px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px",
            }}>
              <div style={{
                background: "#FFFFFF",
                width: "100%",
                maxWidth: "440px",
                borderRadius: "20px",
                border: "1px solid #E2E8F0",
                padding: "26px 20px",
                textAlign: "center",
                boxShadow: "0 20px 50px rgba(15, 23, 42, 0.16)",
                position: "relative",
              }}>
                <div style={{ fontSize: "2.4rem", marginBottom: "6px" }}>🔒</div>
                <h2 style={{ fontSize: "1.3rem", fontWeight: "800", color: "#0F172A" }}>
                  Verify Order via SMS OTP
                </h2>
                <p style={{ fontSize: "0.82rem", color: "#475569", marginTop: "4px", marginBottom: "16px" }}>
                  Enter the 6-digit verification code sent to{" "}
                  <strong style={{ color: "#059669" }}>
                    {pendingOtpOrder.otp_challenge?.masked_phone || "your mobile"}
                  </strong>
                </p>

                {/* Order Brief Summary */}
                <div style={{
                  background: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  marginBottom: "16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "0.82rem",
                }}>
                  <div style={{ textAlign: "left" }}>
                    <span style={{ fontWeight: "700", color: "#0F172A" }}>#{pendingOtpOrder.order_number}</span>
                    <span style={{ color: "#64748B", marginLeft: "6px" }}>({pendingOtpOrder.items?.length || 0} items)</span>
                  </div>
                  <div style={{ fontWeight: "800", color: "#059669", fontSize: "0.95rem" }}>
                    ₹{Number(pendingOtpOrder.total_amount).toFixed(2)}
                  </div>
                </div>

                {/* Dev Mock OTP Helper Pill */}
                {pendingOtpOrder.otp_challenge?.dev_otp && (
                  <div
                    onClick={handleQuickFillDevOtp}
                    style={{
                      background: "#FFFBEB",
                      border: "1px dashed #F59E0B",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      color: "#B45309",
                      fontSize: "0.78rem",
                      fontWeight: "600",
                      marginBottom: "16px",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>🧪 Dev Mock OTP: <strong>{pendingOtpOrder.otp_challenge.dev_otp}</strong></span>
                    <span style={{ fontSize: "0.72rem", textDecoration: "underline" }}>Auto Fill ⚡</span>
                  </div>
                )}

                {/* Error / Status Alerts */}
                {otpError && (
                  <div style={{
                    background: "#FEF2F2",
                    border: "1px solid #FCA5A5",
                    color: "#DC2626",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    fontSize: "0.8rem",
                    fontWeight: "600",
                    marginBottom: "14px",
                  }}>
                    ❌ {otpError}
                  </div>
                )}

                {otpStatusMsg && (
                  <div style={{
                    background: "#ECFDF5",
                    border: "1px solid #A7F3D0",
                    color: "#059669",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    fontSize: "0.8rem",
                    fontWeight: "600",
                    marginBottom: "14px",
                  }}>
                    ✅ {otpStatusMsg}
                  </div>
                )}

                {/* 6 Digit Inputs */}
                <form onSubmit={handleVerifyOtpSubmit}>
                  <div
                    style={{
                      display: "flex",
                      gap: "6px",
                      justifyContent: "center",
                      marginBottom: "16px",
                    }}
                    onPaste={handleOtpPaste}
                  >
                    {otpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => (otpInputRefs.current[idx] = el)}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                        disabled={verifyingOtp || otpSecondsRemaining <= 0}
                        style={{
                          width: "44px",
                          height: "52px",
                          fontSize: "1.4rem",
                          fontWeight: "800",
                          textAlign: "center",
                          borderRadius: "10px",
                          border: `2px solid ${digit ? "#10B981" : "#CBD5E1"}`,
                          background: "#F8FAFC",
                          color: "#0F172A",
                          outline: "none",
                          transition: "border-color 0.15s ease",
                        }}
                      />
                    ))}
                  </div>

                  {/* Countdown & Attempt counter */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "0.78rem",
                    color: "#64748B",
                    marginBottom: "18px",
                    padding: "0 4px",
                  }}>
                    <div>
                      {otpSecondsRemaining > 0 ? (
                        <span>
                          ⏱️ Expires: <strong style={{ color: otpSecondsRemaining < 60 ? "#DC2626" : "#0F172A" }}>{formatOtpTime(otpSecondsRemaining)}</strong>
                        </span>
                      ) : (
                        <span style={{ color: "#DC2626", fontWeight: "700" }}>⚠️ Code Expired</span>
                      )}
                    </div>
                    <div>
                      <span style={{ color: otpAttemptsRemaining <= 2 ? "#DC2626" : "#64748B" }}>
                        {otpAttemptsRemaining} attempts left
                      </span>
                    </div>
                  </div>

                  {/* Confirm CTA */}
                  <button
                    type="submit"
                    disabled={verifyingOtp || otpDigits.join("").length !== 6 || otpSecondsRemaining <= 0}
                    style={{
                      width: "100%",
                      background: (otpDigits.join("").length === 6 && otpSecondsRemaining > 0)
                        ? "linear-gradient(135deg, #10B981, #059669)"
                        : "#E2E8F0",
                      border: "none",
                      color: (otpDigits.join("").length === 6 && otpSecondsRemaining > 0) ? "#FFFFFF" : "#94A3B8",
                      padding: "13px",
                      borderRadius: "10px",
                      fontSize: "0.95rem",
                      fontWeight: "700",
                      cursor: (verifyingOtp || otpDigits.join("").length !== 6 || otpSecondsRemaining <= 0) ? "not-allowed" : "pointer",
                      boxShadow: (otpDigits.join("").length === 6 && otpSecondsRemaining > 0) ? "0 4px 16px rgba(16, 185, 129, 0.35)" : "none",
                      marginBottom: "12px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {verifyingOtp ? "Verifying Code..." : "Verify & Confirm Order"}
                  </button>
                </form>

                {/* Resend Action */}
                <div style={{ marginBottom: "14px" }}>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={otpCooldownSeconds > 0 || resendingOtp}
                    style={{
                      background: "none",
                      border: "none",
                      color: otpCooldownSeconds > 0 ? "#94A3B8" : "#059669",
                      fontWeight: "600",
                      fontSize: "0.82rem",
                      cursor: otpCooldownSeconds > 0 ? "not-allowed" : "pointer",
                    }}
                  >
                    {resendingOtp
                      ? "Sending new OTP..."
                      : otpCooldownSeconds > 0
                        ? `Resend OTP in ${otpCooldownSeconds}s`
                        : "Didn't receive code? Resend OTP"}
                  </button>
                </div>

                {/* Cancel & Return to Cart */}
                <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: "12px" }}>
                  <button
                    type="button"
                    onClick={handleCancelOtpVerification}
                    disabled={cancellingOtp}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#64748B",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                    }}
                  >
                    {cancellingOtp ? "Cancelling..." : "← Cancel & Return to Cart"}
                  </button>
                </div>
              </div>
            </div>
          )
        }

        {/* Phase 7: Digital Daily Token Confirmation Modal */}
        {
          confirmedOrder && (
            <div style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 90,
              background: "rgba(15, 23, 42, 0.6)",
              backdropFilter: "blur(10px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px"
            }}>
              <div style={{
                background: "#FFFFFF",
                width: "100%",
                maxWidth: "460px",
                borderRadius: "24px",
                border: "1px solid #E2E8F0",
                padding: "28px 22px",
                textAlign: "center",
                boxShadow: "0 16px 48px rgba(15, 23, 42, 0.15)"
              }}>
                <div style={{ fontSize: "2.8rem", marginBottom: "4px" }}>🎉</div>
                <h2 style={{ fontSize: "1.4rem", fontWeight: "700", color: "#0F172A" }}>
                  Order Placed Successfully!
                </h2>
                <p style={{ fontSize: "0.85rem", color: "#475569", marginTop: "4px", marginBottom: "20px" }}>
                  Your order has been queued in the kitchen.
                </p>

                {/* Glowing Daily Token Number */}
                <div style={{
                  background: "linear-gradient(135deg, #FFFBEB, #FEF3C7)",
                  border: "2px solid #F59E0B",
                  borderRadius: "18px",
                  padding: "20px",
                  marginBottom: "20px",
                  boxShadow: "0 4px 20px rgba(245, 158, 11, 0.2)"
                }}>
                  <div style={{ fontSize: "0.82rem", color: "#B45309", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase" }}>
                    YOUR DAILY TOKEN
                  </div>
                  <div style={{ fontSize: "3.2rem", fontWeight: "900", color: "#D97706", letterSpacing: "-1px", lineHeight: "1.1" }}>
                    #{confirmedOrder.daily_token_number}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "#78350F", marginTop: "6px", fontWeight: "600" }}>
                    Order #{confirmedOrder.order_number}
                  </div>
                </div>

                {/* Summary Details */}
                <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "12px", padding: "14px", marginBottom: "20px", textAlign: "left" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.85rem" }}>
                    <span style={{ color: "#64748B" }}>Customer:</span>
                    <span style={{ color: "#0F172A", fontWeight: "600" }}>{confirmedOrder.customer_name} ({confirmedOrder.customer_phone})</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.85rem" }}>
                    <span style={{ color: "#64748B" }}>Customer Number:</span>
                    <span style={{ color: "#0284C7", fontWeight: "700" }}>#{confirmedOrder.customer_id || "Assigned"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.85rem" }}>
                    <span style={{ color: "#64748B" }}>Status:</span>
                    <span style={{ color: "#059669", fontWeight: "700" }}>{confirmedOrder.order_status}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.85rem", alignItems: "center" }}>
                    <span style={{ color: "#64748B" }}>Order Type:</span>
                    <span style={{
                      color: (confirmedOrder.order_type === "TAKEAWAY" || orderType === "TAKEAWAY") ? "#059669" : "#B45309",
                      fontWeight: "700",
                      background: (confirmedOrder.order_type === "TAKEAWAY" || orderType === "TAKEAWAY") ? "#ECFDF5" : "#FEF3C7",
                      border: `1px solid ${(confirmedOrder.order_type === "TAKEAWAY" || orderType === "TAKEAWAY") ? "#A7F3D0" : "#FDE68A"}`,
                      padding: "2px 8px",
                      borderRadius: "6px"
                    }}>
                      {(confirmedOrder.order_type === "TAKEAWAY" || orderType === "TAKEAWAY") ? "🛍️ Takeaway" : "🍽️ Dine-in"}
                    </span>
                  </div>

                  {(confirmedOrder.order_type !== "TAKEAWAY" && orderType !== "TAKEAWAY") && (
                    <div style={{
                      background: "#FFFBEB",
                      border: "1px solid #FDE68A",
                      borderRadius: "8px",
                      padding: "8px 10px",
                      marginBottom: "8px",
                      marginTop: "4px"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span style={{ color: "#B45309", fontWeight: "700", fontSize: "0.88rem" }}>
                            📍 Table #{confirmedOrder.table_number || tableNumber || "—"}, Seat #{confirmedOrder.seat_number || seatNumber || "—"}
                          </span>
                        </div>

                        {confirmedOrder.order_status !== "COMPLETED" && confirmedOrder.order_status !== "CANCELLED" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTableSeat(!editingTableSeat);
                              setNewTableNumber(confirmedOrder.table_number || tableNumber || "");
                              setNewSeatNumber(confirmedOrder.seat_number || seatNumber || "");
                              setTableSeatMsg("");
                            }}
                            style={{
                              background: "#FFFFFF",
                              border: "1px solid #CBD5E1",
                              color: "#B45309",
                              borderRadius: "6px",
                              padding: "3px 8px",
                              fontSize: "0.74rem",
                              fontWeight: "700",
                              cursor: "pointer"
                            }}
                          >
                            {editingTableSeat ? "✕ Close" : "🔄 Change Table/Seat"}
                          </button>
                        ) : (
                          <span style={{ fontSize: "0.72rem", color: "#64748B", fontStyle: "italic" }}>
                            🔒 Locked (Delivered)
                          </span>
                        )}
                      </div>

                      {editingTableSeat && (
                        <div style={{ marginTop: "10px", borderTop: "1px solid #FDE68A", paddingTop: "8px" }}>
                          <div style={{ fontSize: "0.75rem", color: "#78350F", marginBottom: "6px", fontWeight: "600" }}>
                            Move to a different table or join friends:
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "6px" }}>
                            {diningTables && diningTables.length > 0 ? (
                              <select
                                value={newTableNumber}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setNewTableNumber(val);
                                  setTableSeatMsg("");
                                  const tbl = diningTables.find((t) => String(t.table_number).trim() === String(val).trim());
                                  if (tbl && newSeatNumber && parseInt(newSeatNumber, 10) > tbl.max_seats) {
                                    setNewSeatNumber("1");
                                  }
                                }}
                                style={{
                                  background: "#FFFFFF",
                                  border: "1px solid #CBD5E1",
                                  borderRadius: "6px",
                                  padding: "6px 8px",
                                  color: "#0F172A",
                                  fontSize: "0.82rem",
                                  outline: "none"
                                }}
                              >
                                <option value="">Select Table...</option>
                                {diningTables.map((t) => (
                                  <option key={t.id} value={t.table_number}>
                                    Table #{t.table_number} ({t.max_seats} Seats)
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                placeholder="New Table #"
                                value={newTableNumber}
                                onChange={(e) => setNewTableNumber(e.target.value)}
                                style={{
                                  background: "#FFFFFF",
                                  border: "1px solid #CBD5E1",
                                  borderRadius: "6px",
                                  padding: "6px 8px",
                                  color: "#0F172A",
                                  fontSize: "0.82rem",
                                  outline: "none"
                                }}
                              />
                            )}

                            {(() => {
                              const tbl = diningTables.find((t) => String(t.table_number).trim() === String(newTableNumber).trim());
                              if (tbl && tbl.max_seats > 0) {
                                return (
                                  <select
                                    value={newSeatNumber}
                                    onChange={(e) => {
                                      setNewSeatNumber(e.target.value);
                                      setTableSeatMsg("");
                                    }}
                                    style={{
                                      background: "#FFFFFF",
                                      border: "1px solid #CBD5E1",
                                      borderRadius: "6px",
                                      padding: "6px 8px",
                                      color: "#0F172A",
                                      fontSize: "0.82rem",
                                      outline: "none"
                                    }}
                                  >
                                    <option value="">Select Seat (1-{tbl.max_seats})...</option>
                                    {Array.from({ length: tbl.max_seats }, (_, i) => String(i + 1)).map((s) => (
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
                                  placeholder="New Seat #"
                                  value={newSeatNumber}
                                  onChange={(e) => setNewSeatNumber(e.target.value)}
                                  style={{
                                    background: "#FFFFFF",
                                    border: "1px solid #CBD5E1",
                                    borderRadius: "6px",
                                    padding: "6px 8px",
                                    color: "#0F172A",
                                    fontSize: "0.82rem",
                                    outline: "none"
                                  }}
                                />
                              );
                            })()}
                          </div>
                          {(() => {
                            const tbl = diningTables.find((t) => String(t.table_number).trim() === String(newTableNumber).trim());
                            if (tbl && newSeatNumber && (parseInt(newSeatNumber, 10) < 1 || parseInt(newSeatNumber, 10) > tbl.max_seats)) {
                              return (
                                <div style={{ fontSize: "0.72rem", color: "#DC2626", marginBottom: "4px", fontWeight: "600" }}>
                                  Table {tbl.table_number} has a maximum of {tbl.max_seats} seats. Please select a seat between 1 and {tbl.max_seats}.
                                </div>
                              );
                            }
                            return null;
                          })()}
                          {tableSeatMsg && (
                            <div style={{ fontSize: "0.72rem", color: "#DC2626", marginBottom: "4px", fontWeight: "600" }}>
                              {tableSeatMsg}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={handleChangeTableSeatSubmit}
                            disabled={tableSeatUpdating}
                            style={{
                              width: "100%",
                              background: "linear-gradient(135deg, #F59E0B, #D97706)",
                              border: "none",
                              color: "#FFFFFF",
                              borderRadius: "6px",
                              padding: "8px",
                              fontSize: "0.82rem",
                              fontWeight: "700",
                              cursor: tableSeatUpdating ? "not-allowed" : "pointer",
                              boxShadow: "0 2px 8px rgba(245, 158, 11, 0.3)"
                            }}
                          >
                            {tableSeatUpdating ? "Updating..." : "Save New Table & Seat"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Shared Food Details Received at this Table */}
                  {incomingSharedDishes && incomingSharedDishes.length > 0 && (
                    <div style={{
                      marginBottom: "12px",
                      background: "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)",
                      border: "1px solid #FDE68A",
                      borderRadius: "10px",
                      padding: "12px 14px"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                        <span style={{ fontSize: "1.2rem" }}>🎁</span>
                        <div>
                          <div style={{ fontWeight: "700", color: "#92400E", fontSize: "0.88rem" }}>
                            Shared Food Received at Your Table!
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "#78350F" }}>
                            Generously shared by patrons at another table. Free of charge to you!
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {incomingSharedDishes.map((sd, i) => (
                          <div key={i} style={{
                            background: "#FFFFFF",
                            border: "1px solid #E2E8F0",
                            borderRadius: "6px",
                            padding: "8px 10px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                          }}>
                            <div>
                              <div style={{ fontWeight: "700", color: "#0F172A", fontSize: "0.84rem" }}>
                                {sd.dish_name || sd.name} <span style={{ color: "#B45309" }}>x{sd.shared_quantity || sd.quantity}</span>
                              </div>
                              <div style={{ fontSize: "0.72rem", color: "#64748B", marginTop: "2px" }}>
                                Origin: <strong>Table #{sd.original_table_number || sd.table_number || "?"}{sd.original_seat_number ? `, Seat #${sd.original_seat_number}` : ""}</strong>
                                {sd.formatted_time || sd.created_at ? ` (${sd.formatted_time || new Date(sd.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ""}
                              </div>
                            </div>
                            <span style={{
                              fontSize: "0.7rem",
                              fontWeight: "700",
                              padding: "2px 7px",
                              borderRadius: "6px",
                              background: "#ECFDF5",
                              color: "#059669",
                              border: "1px solid #A7F3D0"
                            }}>
                              Paid by Table #{sd.original_table_number || sd.table_number || "?"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.85rem" }}>
                    <span style={{ color: "#64748B" }}>Total Amount:</span>
                    <span style={{ color: "#059669", fontWeight: "700" }}>₹{Number(confirmedOrder.total_amount).toFixed(2)} ({confirmedOrder.payment_method})</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                    <span style={{ color: "#64748B" }}>Items Ordered:</span>
                    <span style={{ color: "#0F172A", fontWeight: "600" }}>{confirmedOrder.items?.length || 0} items</span>
                  </div>
                </div>

                <p style={{ fontSize: "0.8rem", color: "#64748B", marginBottom: "20px" }}>
                  🔔 Please watch the token display screen or listen for <strong style={{ color: "#0F172A" }}>Token #{confirmedOrder.daily_token_number}</strong> at the counter!
                </p>

                <button
                  onClick={() => setConfirmedOrder(null)}
                  style={{
                    width: "100%",
                    background: "#F1F5F9",
                    border: "1px solid #CBD5E1",
                    color: "#0F172A",
                    padding: "13px",
                    borderRadius: "12px",
                    fontSize: "0.95rem",
                    fontWeight: "700",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                >
                  Order More / Back to Menu
                </button>
              </div>
            </div>
          )
        }
      </div >
    </div >
  );
}

export default function CustomerMenuPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B" }}>
        Loading ChaiFlow QR Menu...
      </div>
    }>
      <CustomerMenuContent />
    </Suspense>
  );
}
