"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getMenuCatalog, getQrInfo, createOrder } from "../../services/api";

function CustomerMenuContent() {
  const searchParams = useSearchParams();
  const urlTable = searchParams.get("table");
  const urlCounter = searchParams.get("counter");

  const [tableNumber, setTableNumber] = useState(urlTable || "");
  const [counterNumber, setCounterNumber] = useState(urlCounter || "");
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

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
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [orderNotes, setOrderNotes] = useState("");
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [confirmedOrder, setConfirmedOrder] = useState(null);

  useEffect(() => {
    // 1. Resolve table number from URL or localStorage
    if (urlTable) {
      setTableNumber(urlTable);
      try { localStorage.setItem("teashop_table", urlTable); } catch (e) {}
    } else if (urlCounter) {
      setCounterNumber(urlCounter);
      try { localStorage.setItem("teashop_counter", urlCounter); } catch (e) {}
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
    } catch (e) {}

    // 3. Fetch full catalog
    loadCatalogData();

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        loadCatalogData();
      }
    }
    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [urlTable, urlCounter]);

  async function loadCatalogData() {
    setLoading(true);
    setError(null);
    try {
      const data = await getMenuCatalog();
      setCatalog(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load digital menu");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenCustomization(item) {
    if (!item.is_available) return;
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
    } catch (e) {}

    // Show instant feedback toast
    setCartToast(`Added ${qty}x ${item.name} to order`);
    setTimeout(() => setCartToast(""), 2500);

    handleCloseCustomization();
  }

  function handleRemoveFromCart(index) {
    const updated = cartItems.filter((_, i) => i !== index);
    setCartItems(updated);
    try {
      localStorage.setItem("teashop_cart", JSON.stringify(updated));
    } catch (e) {}
  }

  async function handlePlaceOrder() {
    if (cartItems.length === 0) return;
    setSubmittingOrder(true);
    setOrderError("");
    try {
      const payload = {
        customer_name: customerName || (tableNumber ? `Table ${tableNumber} Guest` : "Walk-in Guest"),
        customer_phone: customerPhone || "0000000000",
        table_number: tableNumber || null,
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
      setConfirmedOrder(res);
      setShowCheckout(false);
      setCartItems([]);
      try { localStorage.removeItem("teashop_cart"); } catch (e) {}
    } catch (err) {
      setOrderError(err.message || "Failed to place order. Please check inputs.");
    } finally {
      setSubmittingOrder(false);
    }
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
    <div style={{
      maxWidth: "540px",
      margin: "0 auto",
      minHeight: "100vh",
      background: "#0c0f17",
      color: "#f3f4f6",
      paddingBottom: totalCartCount > 0 ? "100px" : "40px",
      position: "relative"
    }}>
      {/* Sticky Mobile App Bar */}
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "rgba(12, 15, 23, 0.94)",
        backdropFilter: "blur(14px)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        padding: "14px 16px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Link href="/" style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              fontSize: "1.2rem",
              textDecoration: "none"
            }}>
              ☕
            </Link>
            <div>
              <div style={{ fontSize: "1.1rem", fontWeight: "700", letterSpacing: "-0.3px", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>ChaiFlow</span>
                <span style={{ fontSize: "0.68rem", color: "#10b981", background: "rgba(16, 185, 129, 0.15)", padding: "2px 6px", borderRadius: "4px" }}>
                  QR MENU
                </span>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Fresh Indian Chai & Bites</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Table Indicator Badge */}
            <div style={{
              background: "rgba(245, 158, 11, 0.15)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              borderRadius: "20px",
              padding: "4px 12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.8rem",
              color: "#f59e0b",
              fontWeight: "700"
            }}>
              <span>📍</span>
              <span>{tableNumber ? `Table #${tableNumber}` : counterNumber ? `Counter #${counterNumber}` : "Dine-in"}</span>
            </div>

            <button
              onClick={loadCatalogData}
              disabled={loading}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "20px",
                padding: "4px 10px",
                fontSize: "0.78rem",
                color: "#9ca3af",
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
          <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: "0.9rem" }}>
            🔍
          </span>
          <input
            type="text"
            placeholder="Search tea, snacks, coffee..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "10px",
              padding: "10px 12px 10px 36px",
              color: "#fff",
              fontSize: "0.88rem",
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
                color: "#9ca3af",
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
              fontWeight: "600",
              whiteSpace: "nowrap",
              border: activeCategory === "all" ? "1px solid #f59e0b" : "1px solid rgba(255, 255, 255, 0.08)",
              background: activeCategory === "all" ? "linear-gradient(135deg, #f59e0b, #d97706)" : "rgba(255, 255, 255, 0.04)",
              color: activeCategory === "all" ? "#fff" : "#9ca3af",
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
                fontWeight: "600",
                whiteSpace: "nowrap",
                border: activeCategory === String(cat.id) ? "1px solid #f59e0b" : "1px solid rgba(255, 255, 255, 0.08)",
                background: activeCategory === String(cat.id) ? "linear-gradient(135deg, #f59e0b, #d97706)" : "rgba(255, 255, 255, 0.04)",
                color: activeCategory === String(cat.id) ? "#fff" : "#9ca3af",
                cursor: "pointer"
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </header>

      {/* Toast Notification */}
      {cartToast && (
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
      )}

      {/* Menu Item Content Section */}
      <main style={{ padding: "16px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#9ca3af" }}>
            <div style={{ fontSize: "2rem", marginBottom: "12px", animation: "spin 1.5s infinite linear" }}>☕</div>
            <p style={{ fontSize: "0.9rem" }}>Brewing your digital menu...</p>
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <p style={{ color: "#ef4444", marginBottom: "12px" }}>{error}</p>
            <button
              onClick={loadCatalogData}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#fff",
                padding: "8px 16px",
                borderRadius: "8px",
                cursor: "pointer"
              }}
            >
              Retry
            </button>
          </div>
        ) : filteredCatalog.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#9ca3af" }}>
            <p>No products match "{searchQuery}"</p>
          </div>
        ) : (
          filteredCatalog.map((category) => (
            <section key={category.id} style={{ marginBottom: "28px" }}>
              <div style={{ marginBottom: "12px" }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: "700", color: "#f59e0b", letterSpacing: "-0.2px" }}>
                  {category.name}
                </h2>
                {category.description && (
                  <p style={{ fontSize: "0.78rem", color: "#9ca3af", marginTop: "2px" }}>
                    {category.description}
                  </p>
                )}
              </div>

              {/* Items List */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {category.items.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: "rgba(255, 255, 255, 0.025)",
                      border: "1px solid rgba(255, 255, 255, 0.07)",
                      borderRadius: "14px",
                      padding: "14px",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      opacity: item.is_available ? 1 : 0.55,
                      transition: "transform 0.15s ease",
                    }}
                  >
                    <div style={{ flex: "1" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <h3 style={{ fontSize: "0.98rem", fontWeight: "600", color: "#fff" }}>
                          {item.name}
                        </h3>
                        {item.has_customizations && (
                          <span style={{
                            fontSize: "0.68rem",
                            background: "rgba(245, 158, 11, 0.15)",
                            color: "#f59e0b",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontWeight: "600"
                          }}>
                            Customizable
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: "1.05rem", fontWeight: "700", color: "#10b981", marginTop: "4px" }}>
                        ₹{item.price}
                      </div>

                      {item.description && (
                        <p style={{ fontSize: "0.78rem", color: "#9ca3af", marginTop: "4px", lineHeight: "1.35" }}>
                          {item.description}
                        </p>
                      )}

                      {/* Stock Alert Badge */}
                      {item.is_low_stock && item.is_available && (
                        <div style={{ fontSize: "0.7rem", color: "#f59e0b", marginTop: "6px", fontWeight: "600" }}>
                          ⚡ Only {item.available_quantity} left in shop
                        </div>
                      )}
                    </div>

                    {/* Action Button */}
                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end" }}>
                      {!item.is_available ? (
                        <span style={{
                          fontSize: "0.72rem",
                          color: "#ef4444",
                          background: "rgba(239, 68, 68, 0.15)",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          fontWeight: "600"
                        }}>
                          Sold Out
                        </span>
                      ) : item.has_customizations ? (
                        <button
                          onClick={() => handleOpenCustomization(item)}
                          style={{
                            background: "rgba(245, 158, 11, 0.15)",
                            border: "1px solid rgba(245, 158, 11, 0.4)",
                            color: "#f59e0b",
                            padding: "6px 12px",
                            borderRadius: "8px",
                            fontSize: "0.8rem",
                            fontWeight: "700",
                            cursor: "pointer"
                          }}
                        >
                          Customize +
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAddToCart(item, null, 1)}
                          style={{
                            background: "linear-gradient(135deg, #10b981, #059669)",
                            border: "none",
                            color: "#fff",
                            padding: "6px 14px",
                            borderRadius: "8px",
                            fontSize: "0.8rem",
                            fontWeight: "700",
                            cursor: "pointer"
                          }}
                        >
                          ADD +
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      {/* Floating Bottom Cart Bar (Connects to Phase 7 Cart) */}
      {totalCartCount > 0 && (
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
      )}

      {/* Customization Bottom Sheet Modal */}
      {selectedItem && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 70,
          background: "rgba(0, 0, 0, 0.7)",
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center"
        }}>
          <div style={{
            background: "#161b26",
            width: "100%",
            maxWidth: "540px",
            borderTopLeftRadius: "24px",
            borderTopRightRadius: "24px",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            padding: "24px 20px",
            maxHeight: "85vh",
            overflowY: "auto"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <h3 style={{ fontSize: "1.2rem", fontWeight: "700", color: "#fff" }}>
                  {selectedItem.name}
                </h3>
                <div style={{ fontSize: "1.1rem", fontWeight: "700", color: "#10b981", marginTop: "2px" }}>
                  ₹{selectedItem.price}
                </div>
              </div>
              <button
                onClick={handleCloseCustomization}
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "none",
                  color: "#9ca3af",
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  cursor: "pointer",
                  fontSize: "1rem"
                }}
              >
                ✕
              </button>
            </div>

            {/* Sugar Level Customizer */}
            {selectedItem.customization_options?.sugar_levels && (
              <div style={{ marginBottom: "18px" }}>
                <label style={{ fontSize: "0.84rem", fontWeight: "600", color: "#f59e0b", display: "block", marginBottom: "8px" }}>
                  🍬 Sugar Preference
                </label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {selectedItem.customization_options.sugar_levels.map((level) => (
                    <button
                      key={level}
                      onClick={() => setCustomSugar(level)}
                      style={{
                        padding: "7px 12px",
                        borderRadius: "10px",
                        fontSize: "0.8rem",
                        fontWeight: "600",
                        cursor: "pointer",
                        border: customSugar === level ? "1px solid #10b981" : "1px solid rgba(255, 255, 255, 0.1)",
                        background: customSugar === level ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.04)",
                        color: customSugar === level ? "#10b981" : "#d1d5db"
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
                <label style={{ fontSize: "0.84rem", fontWeight: "600", color: "#f59e0b", display: "block", marginBottom: "8px" }}>
                  💪 Chai Strength
                </label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {(selectedItem.customization_options.tea_strength || selectedItem.customization_options.strength).map((str) => (
                    <button
                      key={str}
                      onClick={() => setCustomStrength(str)}
                      style={{
                        padding: "7px 12px",
                        borderRadius: "10px",
                        fontSize: "0.8rem",
                        fontWeight: "600",
                        cursor: "pointer",
                        border: customStrength === str ? "1px solid #10b981" : "1px solid rgba(255, 255, 255, 0.1)",
                        background: customStrength === str ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.04)",
                        color: customStrength === str ? "#10b981" : "#d1d5db"
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
              <span style={{ fontSize: "0.88rem", fontWeight: "600", color: "#9ca3af" }}>Quantity</span>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <button
                  onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    background: "rgba(255, 255, 255, 0.08)",
                    border: "none",
                    color: "#fff",
                    fontSize: "1.2rem",
                    cursor: "pointer"
                  }}
                >
                  -
                </button>
                <span style={{ fontSize: "1.1rem", fontWeight: "700" }}>{itemQuantity}</span>
                <button
                  onClick={() => setItemQuantity(itemQuantity + 1)}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    background: "rgba(255, 255, 255, 0.08)",
                    border: "none",
                    color: "#fff",
                    fontSize: "1.2rem",
                    cursor: "pointer"
                  }}
                >
                  +
                </button>
              </div>
            </div>

            {/* Confirm CTA */}
            <button
              onClick={() => handleAddToCart(selectedItem, { sugar: customSugar, strength: customStrength }, itemQuantity)}
              style={{
                width: "100%",
                background: "linear-gradient(135deg, #10b981, #059669)",
                border: "none",
                color: "#fff",
                padding: "14px",
                borderRadius: "12px",
                fontSize: "0.95rem",
                fontWeight: "700",
                cursor: "pointer",
                boxShadow: "0 4px 16px rgba(16, 185, 129, 0.4)"
              }}
            >
              Add to Order • ₹{(Number(selectedItem.price) * itemQuantity).toFixed(2)}
            </button>
          </div>
        </div>
      )}

      {/* Phase 7: Interactive Checkout Drawer Modal */}
      {showCheckout && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 80,
          background: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center"
        }}>
          <div style={{
            background: "#161b26",
            width: "100%",
            maxWidth: "540px",
            borderTopLeftRadius: "24px",
            borderTopRightRadius: "24px",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            padding: "24px 20px",
            maxHeight: "90vh",
            overflowY: "auto"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "1.3rem" }}>🧾</span>
                <h3 style={{ fontSize: "1.2rem", fontWeight: "700", color: "#fff" }}>
                  Confirm Order & Token
                </h3>
              </div>
              <button
                onClick={() => setShowCheckout(false)}
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "none",
                  color: "#9ca3af",
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  cursor: "pointer",
                  fontSize: "1rem"
                }}
              >
                ✕
              </button>
            </div>

            {/* Error Message banner */}
            {orderError && (
              <div style={{
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                color: "#fca5a5",
                padding: "10px 14px",
                borderRadius: "10px",
                fontSize: "0.85rem",
                marginBottom: "16px"
              }}>
                ⚠️ {orderError}
              </div>
            )}

            {/* Table / Location Banner */}
            <div style={{
              background: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.25)",
              padding: "10px 14px",
              borderRadius: "10px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px"
            }}>
              <span style={{ fontSize: "0.85rem", color: "#f59e0b", fontWeight: "600" }}>
                📍 Destination: {tableNumber ? `Table #${tableNumber}` : counterNumber ? `Counter #${counterNumber}` : "Dine-in"}
              </span>
              <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>QR Session Verified</span>
            </div>

            {/* Order Items Preview */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "0.82rem", fontWeight: "600", color: "#9ca3af", display: "block", marginBottom: "8px", textTransform: "uppercase" }}>
                Cart Items ({cartItems.length})
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {cartItems.map((c, idx) => (
                  <div key={c.cartKey || idx} style={{
                    background: "rgba(255, 255, 255, 0.04)",
                    borderRadius: "10px",
                    padding: "10px 12px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <div>
                      <div style={{ fontSize: "0.92rem", fontWeight: "600", color: "#fff" }}>
                        {c.quantity}x {c.name}
                      </div>
                      {c.options && (
                        <div style={{ fontSize: "0.75rem", color: "#f59e0b", marginTop: "2px" }}>
                          {c.options.sugar && `🍬 ${c.options.sugar}`} {c.options.strength && `• 💪 ${c.options.strength}`}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "0.95rem", fontWeight: "700", color: "#10b981" }}>
                        ₹{(c.price * c.quantity).toFixed(2)}
                      </span>
                      <button
                        onClick={() => handleRemoveFromCart(idx)}
                        style={{
                          background: "rgba(239, 68, 68, 0.15)",
                          border: "none",
                          color: "#ef4444",
                          borderRadius: "6px",
                          width: "24px",
                          height: "24px",
                          cursor: "pointer",
                          fontSize: "0.8rem"
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Customer Inputs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
              <div>
                <label style={{ fontSize: "0.8rem", color: "#9ca3af", display: "block", marginBottom: "4px" }}>
                  Your Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  style={{
                    width: "100%",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: "8px",
                    padding: "9px 12px",
                    color: "#fff",
                    fontSize: "0.85rem",
                    outline: "none"
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.8rem", color: "#9ca3af", display: "block", marginBottom: "4px" }}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  style={{
                    width: "100%",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: "8px",
                    padding: "9px 12px",
                    color: "#fff",
                    fontSize: "0.85rem",
                    outline: "none"
                  }}
                />
              </div>
            </div>

            {/* Payment Method Selector */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "0.8rem", color: "#9ca3af", display: "block", marginBottom: "6px", textTransform: "uppercase" }}>
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
                      border: paymentMethod === pm.id ? "1px solid #10b981" : "1px solid rgba(255, 255, 255, 0.1)",
                      background: paymentMethod === pm.id ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.04)",
                      color: paymentMethod === pm.id ? "#10b981" : "#d1d5db"
                    }}
                  >
                    {pm.label}
                  </button>
                ))}
              </div>
              {paymentMethod === "CREDIT" && (
                <div style={{ fontSize: "0.75rem", color: "#f59e0b", marginTop: "6px" }}>
                  ℹ️ Credit purchase requires an approved customer account with available credit limit.
                </div>
              )}
            </div>

            {/* Preparation Notes */}
            <div style={{ marginBottom: "18px" }}>
              <label style={{ fontSize: "0.8rem", color: "#9ca3af", display: "block", marginBottom: "4px" }}>
                Special Instructions (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Serve extra hot, less spice in samosa"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                style={{
                  width: "100%",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: "8px",
                  padding: "9px 12px",
                  color: "#fff",
                  fontSize: "0.85rem",
                  outline: "none"
                }}
              />
            </div>

            {/* Subtotal & Confirm CTA */}
            <button
              onClick={handlePlaceOrder}
              disabled={submittingOrder || cartItems.length === 0}
              style={{
                width: "100%",
                background: "linear-gradient(135deg, #10b981, #059669)",
                border: "none",
                color: "#fff",
                padding: "15px",
                borderRadius: "12px",
                fontSize: "1rem",
                fontWeight: "700",
                cursor: submittingOrder ? "not-allowed" : "pointer",
                boxShadow: "0 4px 16px rgba(16, 185, 129, 0.4)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "8px"
              }}
            >
              <span>{submittingOrder ? "Allocating Token & Placing..." : `Place Order • ₹${totalCartAmount.toFixed(2)}`}</span>
            </button>
          </div>
        </div>
      )}

      {/* Phase 7: Digital Daily Token Confirmation Modal */}
      {confirmedOrder && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 90,
          background: "rgba(0, 0, 0, 0.85)",
          backdropFilter: "blur(10px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px"
        }}>
          <div style={{
            background: "#161b26",
            width: "100%",
            maxWidth: "460px",
            borderRadius: "24px",
            border: "1px solid rgba(245, 158, 11, 0.35)",
            padding: "28px 22px",
            textAlign: "center",
            boxShadow: "0 16px 48px rgba(0, 0, 0, 0.7)"
          }}>
            <div style={{ fontSize: "2.8rem", marginBottom: "4px" }}>🎉</div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: "700", color: "#fff" }}>
              Order Placed Successfully!
            </h2>
            <p style={{ fontSize: "0.85rem", color: "#9ca3af", marginTop: "4px", marginBottom: "20px" }}>
              Your order has been queued in the kitchen.
            </p>

            {/* Glowing Daily Token Number */}
            <div style={{
              background: "linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.15))",
              border: "2px solid #f59e0b",
              borderRadius: "18px",
              padding: "20px",
              marginBottom: "20px",
              boxShadow: "0 0 25px rgba(245, 158, 11, 0.3)"
            }}>
              <div style={{ fontSize: "0.82rem", color: "#f59e0b", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase" }}>
                YOUR DAILY TOKEN
              </div>
              <div style={{ fontSize: "3.2rem", fontWeight: "900", color: "#f59e0b", letterSpacing: "-1px", lineHeight: "1.1" }}>
                #{confirmedOrder.daily_token_number}
              </div>
              <div style={{ fontSize: "0.85rem", color: "#d1d5db", marginTop: "6px" }}>
                Order #{confirmedOrder.order_number}
              </div>
            </div>

            {/* Summary Details */}
            <div style={{ background: "rgba(255, 255, 255, 0.04)", borderRadius: "12px", padding: "14px", marginBottom: "20px", textAlign: "left" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.85rem" }}>
                <span style={{ color: "#9ca3af" }}>Status:</span>
                <span style={{ color: "#10b981", fontWeight: "700" }}>{confirmedOrder.order_status}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.85rem" }}>
                <span style={{ color: "#9ca3af" }}>Location:</span>
                <span style={{ color: "#fff", fontWeight: "600" }}>{confirmedOrder.notes || (tableNumber ? `Table #${tableNumber}` : "Dine-in")}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.85rem" }}>
                <span style={{ color: "#9ca3af" }}>Total Amount:</span>
                <span style={{ color: "#10b981", fontWeight: "700" }}>₹{Number(confirmedOrder.total_amount).toFixed(2)} ({confirmedOrder.payment_method})</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                <span style={{ color: "#9ca3af" }}>Items Ordered:</span>
                <span style={{ color: "#fff", fontWeight: "600" }}>{confirmedOrder.items?.length || 0} items</span>
              </div>
            </div>

            <p style={{ fontSize: "0.8rem", color: "#9ca3af", marginBottom: "20px" }}>
              🔔 Please watch the token display screen or listen for <strong>Token #{confirmedOrder.daily_token_number}</strong> at the counter!
            </p>

            <button
              onClick={() => setConfirmedOrder(null)}
              style={{
                width: "100%",
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#fff",
                padding: "13px",
                borderRadius: "12px",
                fontSize: "0.95rem",
                fontWeight: "700",
                cursor: "pointer"
              }}
            >
              Order More / Back to Menu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomerMenuPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#0c0f17", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>
        Loading ChaiFlow QR Menu...
      </div>
    }>
      <CustomerMenuContent />
    </Suspense>
  );
}
