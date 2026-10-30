"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../../context/AuthContext";
import {
  getCategories,
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleItemAvailability,
  updateItemStock,
  createCategory,
  deleteCategory,
} from "../../../services/api";

function getItemUnit(item) {
  const name = (item?.name || "").toLowerCase();
  const category = (item?.category_name || "").toLowerCase();

  if (
    name.includes("chai") ||
    name.includes("tea") ||
    name.includes("coffee") ||
    category.includes("chai") ||
    category.includes("tea") ||
    category.includes("coffee") ||
    category.includes("beverage")
  ) {
    return "cups";
  }
  if (
    name.includes("bottle") ||
    name.includes("water") ||
    name.includes("drink") ||
    name.includes("pepsi") ||
    name.includes("coke") ||
    name.includes("sprite") ||
    name.includes("juice") ||
    category.includes("bottle") ||
    category.includes("cold drink")
  ) {
    return "bottles";
  }
  if (
    name.includes("biscuit") ||
    name.includes("rusk") ||
    name.includes("pack") ||
    name.includes("chips") ||
    name.includes("namkeen") ||
    category.includes("pack") ||
    category.includes("biscuit")
  ) {
    return "packets";
  }
  if (
    name.includes("samosa") ||
    name.includes("puff") ||
    name.includes("bun") ||
    name.includes("vada") ||
    name.includes("toast") ||
    name.includes("sandwich") ||
    name.includes("snack") ||
    category.includes("snack")
  ) {
    return "pcs";
  }
  return "units";
}

function getItemIcon(item) {
  const unit = getItemUnit(item);
  if (unit === "cups") return "☕";
  if (unit === "bottles") return "🥤";
  if (unit === "packets") return "🍪";
  if (unit === "pcs") return "🥪";
  return "🍽️";
}

export default function MenuManagementPage() {
  const { getValidAdminToken } = useAuth();

  // Data states
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState(null); // { type: 'success'|'error', text: '' }

  // Stock Adjustment Interactive States
  const [updatingStockId, setUpdatingStockId] = useState(null);
  const [touchRowId, setTouchRowId] = useState(null);

  // Search & Filter states
  const [selectedCatId, setSelectedCatId] = useState("all");
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("all"); // 'all', 'in_stock', 'out_of_stock', 'low_stock'

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states for Add / Edit Item
  const initialFormState = {
    category_id: "",
    name: "",
    description: "",
    price: "",
    available_quantity: 50,
    low_stock_threshold: 5,
    track_stock: true,
    is_available: true,
    allows_sugar: false,
    allows_strength: false,
  };
  const [formData, setFormData] = useState(initialFormState);

  // Category Modal Form state
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [newCatOrder, setNewCatOrder] = useState(0);

  // Load Categories & Items
  async function loadMenu() {
    setLoading(true);
    try {
      const [catsRes, itemsRes] = await Promise.all([
        getCategories(true),
        getMenuItems(),
      ]);

      const loadedCats = Array.isArray(catsRes) ? catsRes : [];
      const loadedItems = Array.isArray(itemsRes) ? itemsRes : [];

      setCategories(loadedCats);
      setItems(loadedItems);

      // Default first category in form if not set
      if (loadedCats.length > 0 && !formData.category_id) {
        setFormData((prev) => ({ ...prev, category_id: String(loadedCats[0].id) }));
      }
    } catch (err) {
      console.error("Failed to load menu data:", err);
      setActionMsg({
        type: "error",
        text: `Failed to load menu data: ${err.message || "Network error"}`,
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMenu();
  }, []);

  // Open Add Modal
  function handleOpenAddModal() {
    const defaultCatId =
      selectedCatId !== "all"
        ? selectedCatId
        : categories.length > 0
          ? String(categories[0].id)
          : "";
    setFormData({
      ...initialFormState,
      category_id: defaultCatId,
      is_available: true,
    });
    setIsAddModalOpen(true);
  }

  // Open Edit Modal
  function handleOpenEditModal(item) {
    setEditingItem(item);
    setFormData({
      category_id: String(item.category_id),
      name: item.name,
      description: item.description || "",
      price: String(item.price),
      available_quantity: item.available_quantity ?? 50,
      low_stock_threshold: item.low_stock_threshold ?? 5,
      track_stock: item.track_stock ?? true,
      is_available: item.is_available ?? true,
      allows_sugar: Boolean(
        item.has_customizations && item.customization_options?.sugar_levels
      ),
      allows_strength: Boolean(
        item.has_customizations && item.customization_options?.tea_strength
      ),
    });
  }

  // Submit Add or Edit Item
  async function handleItemSubmit(e) {
    e.preventDefault();
    if (!formData.name.trim()) {
      setActionMsg({ type: "error", text: "Please enter an item name." });
      return;
    }
    if (!formData.category_id) {
      setActionMsg({ type: "error", text: "Please select a category." });
      return;
    }
    const numPrice = parseFloat(formData.price);
    if (isNaN(numPrice) || numPrice <= 0) {
      setActionMsg({ type: "error", text: "Please enter a valid price greater than 0." });
      return;
    }

    setSubmitting(true);
    setActionMsg(null);

    const hasCust = formData.allows_sugar || formData.allows_strength;
    const custOptions = hasCust
      ? {
        ...(formData.allows_sugar
          ? { sugar_levels: ["None", "Less", "Medium", "Extra"] }
          : {}),
        ...(formData.allows_strength
          ? { tea_strength: ["Light", "Regular", "Kadak"] }
          : {}),
      }
      : null;

    const payload = {
      category_id: parseInt(formData.category_id, 10),
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      price: numPrice,
      track_stock: Boolean(formData.track_stock),
      available_quantity: parseInt(formData.available_quantity, 10) || 0,
      low_stock_threshold: parseInt(formData.low_stock_threshold, 10) || 0,
      is_available: Boolean(formData.is_available),
      has_customizations: hasCust,
      customization_options: custOptions,
    };

    try {
      const token = await getValidAdminToken();
      if (editingItem) {
        await updateMenuItem(editingItem.id, payload, token);
        setActionMsg({
          type: "success",
          text: `Updated "${payload.name}" successfully!`,
        });
        setEditingItem(null);
      } else {
        await createMenuItem(payload, token);
        setActionMsg({
          type: "success",
          text: `Added new item "${payload.name}" to menu!`,
        });
        setIsAddModalOpen(false);
      }
      await loadMenu();
    } catch (err) {
      console.error("Save item error:", err);
      setActionMsg({
        type: "error",
        text: `Failed to save item: ${err.message || "Unknown error"}`,
      });
    } finally {
      setSubmitting(false);
    }
  }

  // Delete Item
  async function handleDeleteItem() {
    if (!deletingItem) return;
    setSubmitting(true);
    try {
      const token = await getValidAdminToken();
      await deleteMenuItem(deletingItem.id, token);
      setActionMsg({
        type: "success",
        text: `Deleted "${deletingItem.name}" from menu.`,
      });
      setDeletingItem(null);
      await loadMenu();
    } catch (err) {
      setActionMsg({
        type: "error",
        text: `Failed to delete item: ${err.message}`,
      });
    } finally {
      setSubmitting(false);
    }
  }

  // Quick Toggle Availability
  async function handleToggle(item) {
    try {
      const token = await getValidAdminToken();
      const nextStatus = !item.is_available;
      await toggleItemAvailability(item.id, nextStatus, token);
      setActionMsg({
        type: "success",
        text: `Set ${item.name} to ${nextStatus ? "IN STOCK" : "OUT OF STOCK"}.`,
      });
      await loadMenu();
    } catch (err) {
      setActionMsg({
        type: "error",
        text: `Failed to update availability: ${err.message}`,
      });
    }
  }

  // Validated Stock Adjustment with Optimistic Update & Rollback
  async function handleStockStep(item, delta) {
    if (updatingStockId === item.id) return; // Prevent concurrent duplicate submissions
    const currentQty = item.available_quantity || 0;
    const nextQty = Math.max(0, currentQty + delta);
    if (nextQty === currentQty && delta < 0) {
      return; // Already 0, cannot reduce further
    }

    const unit = getItemUnit(item);
    setUpdatingStockId(item.id);

    // Optimistic local state update
    setItems((prevItems) =>
      prevItems.map((i) =>
        i.id === item.id ? { ...i, available_quantity: nextQty } : i
      )
    );

    try {
      const token = await getValidAdminToken();
      await updateItemStock(item.id, nextQty, token);
      setActionMsg({
        type: "success",
        text: `Updated "${item.name}" stock to ${nextQty} ${unit}.`,
      });
      // Reconcile with backend
      await loadMenu();
    } catch (err) {
      console.error("Stock update error:", err);
      // Rollback on failure
      setItems((prevItems) =>
        prevItems.map((i) =>
          i.id === item.id ? { ...i, available_quantity: currentQty } : i
        )
      );
      setActionMsg({
        type: "error",
        text: `Failed to update stock for "${item.name}": ${err.message || "Network error"}`,
      });
    } finally {
      setUpdatingStockId(null);
    }
  }

  // Add Category
  async function handleAddCategory(e) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setSubmitting(true);
    try {
      const token = await getValidAdminToken();
      await createCategory(
        {
          name: newCatName.trim(),
          description: newCatDesc.trim() || null,
          display_order: parseInt(newCatOrder, 10) || 0,
          is_active: true,
        },
        token
      );
      setNewCatName("");
      setNewCatDesc("");
      setNewCatOrder(0);
      setActionMsg({ type: "success", text: "Category created successfully!" });
      await loadMenu();
    } catch (err) {
      setActionMsg({ type: "error", text: `Failed to add category: ${err.message}` });
    } finally {
      setSubmitting(false);
    }
  }

  // Delete Category
  async function handleDeleteCategory(cat) {
    if (
      !window.confirm(
        `Are you sure you want to delete category "${cat.name}"? Any items under this category will also be removed!`
      )
    ) {
      return;
    }
    try {
      const token = await getValidAdminToken();
      await deleteCategory(cat.id, token);
      setActionMsg({ type: "success", text: `Deleted category "${cat.name}".` });
      await loadMenu();
    } catch (err) {
      setActionMsg({ type: "error", text: `Failed to delete category: ${err.message}` });
    }
  }

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesCategory =
        selectedCatId === "all" || String(item.category_id) === String(selectedCatId);
      const matchesSearch =
        !search ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(search.toLowerCase())) ||
        (item.category_name && item.category_name.toLowerCase().includes(search.toLowerCase()));

      let matchesStock = true;
      if (stockFilter === "in_stock") matchesStock = item.is_available;
      if (stockFilter === "out_of_stock") matchesStock = !item.is_available;
      if (stockFilter === "low_stock")
        matchesStock = item.track_stock && item.available_quantity <= item.low_stock_threshold;

      return matchesCategory && matchesSearch && matchesStock;
    });
  }, [items, selectedCatId, search, stockFilter]);

  // Group items by category for display
  const categoriesWithFilteredItems = useMemo(() => {
    const catMap = new Map();
    categories.forEach((cat) => {
      catMap.set(cat.id, { ...cat, items: [] });
    });

    filteredItems.forEach((item) => {
      if (catMap.has(item.category_id)) {
        catMap.get(item.category_id).items.push(item);
      } else {
        // Uncategorized or missing
        const unknownCat = catMap.get("other") || {
          id: "other",
          name: item.category_name || "General Items",
          items: [],
        };
        unknownCat.items.push(item);
        catMap.set("other", unknownCat);
      }
    });

    return Array.from(catMap.values()).filter(
      (cat) => cat.items.length > 0 || selectedCatId === String(cat.id)
    );
  }, [categories, filteredItems, selectedCatId]);

  // Metrics
  const totalItemsCount = items.length;
  const inStockCount = items.filter((i) => i.is_available).length;
  const outOfStockCount = items.filter((i) => !i.is_available).length;
  const lowStockCount = items.filter(
    (i) => i.track_stock && i.available_quantity <= i.low_stock_threshold
  ).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Top Banner Card */}
      <div
        className="card"
        style={{
          padding: "22px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          background: "#ffffffff",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "1.6rem" }}>☕</span>
            <h1
              style={{
                fontSize: "1.35rem",
                fontWeight: "800",
                color: "var(--text-main)",
                letterSpacing: "-0.01em",
              }}
            >
              Menu Catalog & Item Inventory
            </h1>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: "4px" }}>
            Create, edit prices, manage stock quantities, out-of-stock statuses, and custom options.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={handleOpenAddModal}
            className="btn-primary"
            style={{ padding: "9px 18px", fontSize: "0.88rem", fontWeight: "700" }}
          >
            <span>➕</span> Add Menu Item
          </button>

          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="btn-secondary"
            style={{ padding: "9px 16px", fontSize: "0.88rem", fontWeight: "600" }}
          >
            <span>🏷️</span> Categories ({categories.length})
          </button>

          <a
            href="/menu"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            style={{ padding: "9px 16px", fontSize: "0.88rem", fontWeight: "600", textDecoration: "none", color: "inherit" }}
            title="Open Customer QR Menu in new tab"
          >
            <span>📱</span> Customer Menu ↗
          </a>

          <button
            onClick={loadMenu}
            disabled={loading}
            className="btn-secondary"
            style={{ padding: "9px 14px", fontSize: "0.88rem" }}
            title="Refresh menu catalog"
          >
            {loading ? "↻ Loading..." : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* Metrics Row - Sticky KPI Summary */}
      <div className="sticky-kpi-container">
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-card-header">
              <span className="kpi-card-title">TOTAL ITEMS</span>
              <span className="kpi-card-icon">☕</span>
            </div>
            <div className="kpi-card-value">{totalItemsCount}</div>
            <div className="kpi-card-sub">Across {categories.length} categories</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-card-header">
              <span className="kpi-card-title" style={{ color: "var(--status-success)" }}>IN STOCK & READY</span>
              <span className="kpi-card-icon">✅</span>
            </div>
            <div className="kpi-card-value" style={{ color: "var(--status-success)" }}>{inStockCount}</div>
            <div className="kpi-card-sub">Visible on digital QR menu</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-card-header">
              <span className="kpi-card-title" style={{ color: "var(--status-err)" }}>OUT OF STOCK</span>
              <span className="kpi-card-icon">🚫</span>
            </div>
            <div className="kpi-card-value" style={{ color: "var(--status-err)" }}>{outOfStockCount}</div>
            <div className="kpi-card-sub">Disabled from customer orders</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-card-header">
              <span className="kpi-card-title" style={{ color: "var(--status-warning)" }}>LOW STOCK ALERTS</span>
              <span className="kpi-card-icon">⚠️</span>
            </div>
            <div className="kpi-card-value" style={{ color: "var(--status-warning)" }}>{lowStockCount}</div>
            <div className="kpi-card-sub">Below alert threshold</div>
          </div>
        </div>
      </div>

      {/* Action Notification Message */}
      {actionMsg && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: "8px",
            background: actionMsg.type === "error" ? "#FEF2F2" : "#F0FDF4",
            border: `1px solid ${actionMsg.type === "error" ? "#FECACA" : "#BBF7D0"}`,
            color: actionMsg.type === "error" ? "var(--status-err)" : "var(--status-success)",
            fontSize: "0.88rem",
            fontWeight: "600",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{actionMsg.text}</span>
          <button
            onClick={() => setActionMsg(null)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: "1rem",
              color: "inherit",
              padding: "0 4px",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Search, Category Filter & Stock Filter Card */}
      <div
        className="card"
        style={{
          padding: "18px 22px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          background: "#FFFFFF",
        }}
      >
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: "260px" }}>
            <input
              type="text"
              placeholder="Search by chai, snacks, coffee, or price..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", paddingLeft: "36px" }}
            />
            <span
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-dim)",
              }}
            >
              🔍
            </span>
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-dim)",
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Stock Filter Pills */}
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              onClick={() => setStockFilter("all")}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid var(--border-subtle)",
                background: stockFilter === "all" ? "var(--color-primary-light)" : "#FFFFFF",
                color: stockFilter === "all" ? "var(--color-primary)" : "var(--text-muted)",
                fontWeight: stockFilter === "all" ? "700" : "500",
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              All Statuses
            </button>
            <button
              onClick={() => setStockFilter("in_stock")}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid var(--border-subtle)",
                background: stockFilter === "in_stock" ? "#F0FDF4" : "#FFFFFF",
                color: stockFilter === "in_stock" ? "var(--status-success)" : "var(--text-muted)",
                fontWeight: stockFilter === "in_stock" ? "700" : "500",
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              In Stock ({inStockCount})
            </button>
            <button
              onClick={() => setStockFilter("out_of_stock")}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid var(--border-subtle)",
                background: stockFilter === "out_of_stock" ? "#FEF2F2" : "#FFFFFF",
                color: stockFilter === "out_of_stock" ? "var(--status-err)" : "var(--text-muted)",
                fontWeight: stockFilter === "out_of_stock" ? "700" : "500",
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              Out of Stock ({outOfStockCount})
            </button>
            <button
              onClick={() => setStockFilter("low_stock")}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid var(--border-subtle)",
                background: stockFilter === "low_stock" ? "#FEF3C7" : "#FFFFFF",
                color: stockFilter === "low_stock" ? "var(--status-warning)" : "var(--text-muted)",
                fontWeight: stockFilter === "low_stock" ? "700" : "500",
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              Low Stock ({lowStockCount})
            </button>
          </div>
        </div>

        {/* Category Selection Dropdown */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", paddingTop: "2px" }}>
          <label
            htmlFor="menu-category-select"
            style={{
              fontSize: "0.82rem",
              fontWeight: "700",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              whiteSpace: "nowrap",
            }}
          >
            <span>🏷️</span> CATEGORY:
          </label>
          <div style={{ position: "relative", minWidth: "260px", maxWidth: "380px", flex: "1 1 260px" }}>
            <select
              id="menu-category-select"
              value={selectedCatId}
              onChange={(e) => setSelectedCatId(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 34px 8px 12px",
                borderRadius: "8px",
                border: selectedCatId === "all" ? "1px solid var(--border-subtle)" : "1px solid var(--color-primary)",
                background: selectedCatId === "all" ? "#FFFFFF" : "var(--color-primary-light)",
                color: selectedCatId === "all" ? "var(--text-main)" : "var(--color-primary)",
                fontWeight: selectedCatId === "all" ? "600" : "700",
                fontSize: "0.88rem",
                cursor: "pointer",
              }}
            >
              <option value="all">All Categories ({items.length} items)</option>
              {categories.map((cat) => {
                const count = items.filter((i) => i.category_id === cat.id).length;
                return (
                  <option key={cat.id} value={String(cat.id)}>
                    {cat.name} ({count} {count === 1 ? "item" : "items"})
                  </option>
                );
              })}
            </select>
            {selectedCatId !== "all" && (
              <button
                type="button"
                onClick={() => setSelectedCatId("all")}
                title="Reset to All Categories"
                style={{
                  position: "absolute",
                  right: "24px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  color: "var(--text-dim)",
                  padding: "4px",
                }}
              >
                ✕
              </button>
            )}
          </div>
          {selectedCatId !== "all" && (
            <button
              onClick={() => setSelectedCatId("all")}
              className="btn-secondary"
              style={{
                padding: "6px 12px",
                fontSize: "0.8rem",
                fontWeight: "600",
                borderRadius: "6px",
              }}
              title="Clear active category filter"
            >
              Show All Categories
            </button>
          )}
        </div>
      </div>

      {/* Product Grid Area */}
      {loading ? (
        <div className="card" style={{ padding: "50px", textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "1.4rem", marginBottom: "8px" }}>☕</div>
          <div>Loading menu items and categories...</div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="card" style={{ padding: "50px", textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "2rem", marginBottom: "12px" }}>🍽️</div>
          <h3 style={{ fontSize: "1.1rem", fontWeight: "700", color: "var(--text-main)", marginBottom: "6px" }}>
            No menu items found
          </h3>
          <p style={{ fontSize: "0.88rem", maxWidth: "400px", margin: "0 auto 18px auto" }}>
            {search || stockFilter !== "all" || selectedCatId !== "all"
              ? "No items match your active filters or search terms. Try resetting filters."
              : "Your menu is currently empty. Click '+ Add Menu Item' above to create your first delicious product!"}
          </p>
          <button onClick={handleOpenAddModal} className="btn-primary" style={{ padding: "8px 18px" }}>
            ➕ Add First Menu Item
          </button>
        </div>
      ) : (
        categoriesWithFilteredItems.map((cat) => (
          <div key={cat.id} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3
                style={{
                  fontSize: "1.15rem",
                  fontWeight: "700",
                  color: "var(--text-main)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span>🏷️</span> {cat.name}{" "}
                <span style={{ fontSize: "0.82rem", fontWeight: "500", color: "var(--text-dim)" }}>
                  ({cat.items.length} {cat.items.length === 1 ? "item" : "items"})
                </span>
              </h3>
            </div>

            {/* Compact Row Layout with Hover-to-Expand Stock Controls */}
            <div className="menu-rows-wrapper">
              {cat.items.map((item) => {
                const isLowStock =
                  item.track_stock && item.available_quantity <= item.low_stock_threshold;
                const isOutOfStock = !item.is_available || (item.track_stock && item.available_quantity === 0);
                const unit = getItemUnit(item);
                const icon = getItemIcon(item);
                const isUpdating = updatingStockId === item.id;
                const isTouchActive = touchRowId === item.id;

                return (
                  <div
                    key={item.id}
                    className={`menu-row ${isTouchActive ? "touch-active" : ""}`}
                    onClick={() => setTouchRowId((prev) => (prev === item.id ? null : item.id))}
                    style={{
                      borderLeft: isOutOfStock
                        ? "4px solid var(--status-err)"
                        : isLowStock
                          ? "4px solid var(--status-warning)"
                          : "4px solid var(--color-primary)",
                      opacity: item.is_available ? 1 : 0.78,
                    }}
                  >
                    {/* 1. Thumbnail / Category Icon */}
                    <div
                      style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "8px",
                        background: isOutOfStock ? "#FEE2E2" : "var(--color-primary-light)",
                        color: isOutOfStock ? "var(--status-err)" : "var(--color-primary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.25rem",
                        flexShrink: 0,
                        overflow: "hidden",
                      }}
                    >
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <span>{icon}</span>
                      )}
                    </div>

                    {/* 2. Item Details & Customizations */}
                    <div style={{ flex: 1, minWidth: "180px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontSize: "0.95rem",
                            fontWeight: "700",
                            color: "var(--text-main)",
                            lineHeight: "1.2",
                          }}
                        >
                          {item.name}
                        </span>
                        <span
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: "600",
                            background: "var(--bg-card-subtle)",
                            color: "var(--text-muted)",
                            padding: "2px 7px",
                            borderRadius: "4px",
                          }}
                        >
                          {cat.name}
                        </span>
                        {item.has_customizations && (
                          <span
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: "600",
                              background: "#F0FDF4",
                              border: "1px solid #BBF7D0",
                              color: "var(--status-success)",
                              padding: "1px 6px",
                              borderRadius: "4px",
                            }}
                          >
                            ✨ Custom Options
                          </span>
                        )}
                      </div>

                      {item.description && (
                        <div
                          style={{
                            fontSize: "0.78rem",
                            color: "var(--text-muted)",
                            marginTop: "2px",
                            lineHeight: "1.3",
                            maxWidth: "500px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.description}
                        </div>
                      )}
                    </div>

                    {/* 3. Selling Price */}
                    <div
                      style={{
                        minWidth: "85px",
                        textAlign: "right",
                        fontSize: "1.1rem",
                        fontWeight: "800",
                        color: "var(--color-primary)",
                        flexShrink: 0,
                      }}
                    >
                      ₹{parseFloat(item.price).toFixed(2)}
                    </div>

                    {/* 4. Hover-to-Expand Stock Units Stepper */}
                    <div
                      className="stock-hover-wrapper"
                      style={{ flexShrink: 0 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.track_stock ? (
                        <>
                          {/* Static Badge (Shown normally) */}
                          <div
                            className="stock-static-badge"
                            title="Hover or tap to adjust stock quantity"
                            style={{
                              color: isLowStock ? "#B45309" : "var(--text-main)",
                              background: isLowStock ? "#FEF3C7" : "#F1F5F9",
                              border: isLowStock ? "1px solid #FDE68A" : "1px solid var(--border-subtle)",
                            }}
                          >
                            <span>📦</span>
                            <span>
                              {item.available_quantity} {unit}
                            </span>
                            {item.low_stock_threshold > 0 && (
                              <span style={{ fontSize: "0.68rem", opacity: 0.7 }}>
                                (alert &le;{item.low_stock_threshold})
                              </span>
                            )}
                          </div>

                          {/* Hover / Active Interactive Controls */}
                          <div className="stock-stepper-active">
                            <button
                              type="button"
                              disabled={item.available_quantity <= 0 || isUpdating}
                              onClick={() => handleStockStep(item, -1)}
                              style={{
                                width: "24px",
                                height: "24px",
                                borderRadius: "4px",
                                border: "1px solid var(--border-subtle)",
                                background: item.available_quantity <= 0 ? "#F1F5F9" : "#FFFFFF",
                                cursor: item.available_quantity <= 0 ? "not-allowed" : "pointer",
                                fontWeight: "800",
                                fontSize: "0.85rem",
                                color: "var(--text-main)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                              title={`Decrease stock (-1 ${unit})`}
                            >
                              −
                            </button>
                            <span
                              style={{
                                minWidth: "32px",
                                textAlign: "center",
                                fontWeight: "800",
                                fontSize: "0.85rem",
                                color: isLowStock ? "var(--status-err)" : "var(--color-primary)",
                              }}
                            >
                              {isUpdating ? "..." : item.available_quantity}
                            </span>
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => handleStockStep(item, 1)}
                              style={{
                                width: "24px",
                                height: "24px",
                                borderRadius: "4px",
                                border: "1px solid var(--border-subtle)",
                                background: "#FFFFFF",
                                cursor: "pointer",
                                fontWeight: "800",
                                fontSize: "0.85rem",
                                color: "var(--text-main)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                              title={`Increase stock (+1 ${unit})`}
                            >
                              +
                            </button>
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => handleStockStep(item, 5)}
                              style={{
                                padding: "0 4px",
                                height: "24px",
                                borderRadius: "4px",
                                border: "1px solid var(--border-subtle)",
                                background: "#F8FAFC",
                                cursor: "pointer",
                                fontWeight: "700",
                                fontSize: "0.72rem",
                                color: "var(--color-primary)",
                              }}
                              title={`Quick Add (+5 ${unit})`}
                            >
                              +5
                            </button>
                          </div>
                        </>
                      ) : (
                        <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                          Stock untracked
                        </span>
                      )}
                    </div>

                    {/* 5. Stock Status Badge */}
                    <div style={{ minWidth: "95px", flexShrink: 0 }}>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: "700",
                          padding: "3px 8px",
                          borderRadius: "12px",
                          background: !item.is_available
                            ? "#FEE2E2"
                            : isLowStock
                              ? "#FEF3C7"
                              : "#DCFCE7",
                          color: !item.is_available
                            ? "var(--status-err)"
                            : isLowStock
                              ? "#B45309"
                              : "var(--status-success)",
                          whiteSpace: "nowrap",
                          display: "inline-block",
                        }}
                      >
                        {!item.is_available
                          ? "○ Out of Stock"
                          : isLowStock
                            ? "⚠️ Low Stock"
                            : "● In Stock"}
                      </span>
                    </div>

                    {/* 6. QR Menu Availability Toggle */}
                    <div style={{ minWidth: "115px", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleToggle(item)}
                        style={{
                          padding: "4px 8px",
                          borderRadius: "6px",
                          border: `1px solid ${item.is_available ? "#BBF7D0" : "#FECACA"}`,
                          background: item.is_available ? "#F0FDF4" : "#FEF2F2",
                          color: item.is_available ? "var(--status-success)" : "var(--status-err)",
                          fontSize: "0.72rem",
                          fontWeight: "700",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                        title={item.is_available ? "Customer can order from QR. Click to hide." : "Hidden from QR menu. Click to make available."}
                      >
                        {item.is_available ? "📱 QR: Active" : "📱 QR: Hidden"}
                      </button>
                    </div>

                    {/* 7. Edit & Delete Actions */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        flexShrink: 0,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => handleOpenEditModal(item)}
                        className="btn-secondary"
                        style={{
                          padding: "5px 8px",
                          fontSize: "0.76rem",
                          fontWeight: "600",
                        }}
                        title="Edit Item"
                      >
                        ✏️ Edit
                      </button>

                      <button
                        onClick={() => setDeletingItem(item)}
                        style={{
                          padding: "5px 7px",
                          borderRadius: "6px",
                          border: "1px solid #FECACA",
                          background: "#FEF2F2",
                          color: "var(--status-err)",
                          fontSize: "0.76rem",
                          fontWeight: "600",
                          cursor: "pointer",
                        }}
                        title="Delete Item"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* ============================================================ */}
      {/* MODAL: ADD / EDIT MENU ITEM */}
      {/* ============================================================ */}
      {(isAddModalOpen || editingItem) && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "520px",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "26px",
              borderRadius: "16px",
              background: "#FFFFFF",
              boxShadow: "var(--shadow-modal)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
                borderBottom: "1px solid var(--border-subtle)",
                paddingBottom: "14px",
              }}
            >
              <h2 style={{ fontSize: "1.2rem", fontWeight: "800", color: "var(--text-main)" }}>
                {editingItem ? `✏️ Edit "${editingItem.name}"` : "➕ Add New Menu Item"}
              </h2>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingItem(null);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "1.2rem",
                  color: "var(--text-muted)",
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleItemSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Item Name */}
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: "700", color: "var(--text-main)", display: "block", marginBottom: "4px" }}>
                  Item Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Masala Chai, Bun Maska, Cold Coffee"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  style={{ width: "100%" }}
                />
              </div>

              {/* Category & Price Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: "700", color: "var(--text-main)", display: "block", marginBottom: "4px" }}>
                    Category *
                  </label>
                  <select
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    required
                    style={{ width: "100%" }}
                  >
                    {categories.length === 0 && <option value="">No categories found</option>}
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: "700", color: "var(--text-main)", display: "block", marginBottom: "4px" }}>
                    Price (₹ INR) *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    placeholder="e.g. 20"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    required
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: "700", color: "var(--text-main)", display: "block", marginBottom: "4px" }}>
                  Description / Ingredients
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Fresh ginger, crushed cardamom, and full cream milk brewed to perfection"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{ width: "100%" }}
                />
              </div>

              {/* Stock Controls */}
              <div
                style={{
                  background: "var(--bg-card-subtle)",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    id="track_stock_checkbox"
                    checked={formData.track_stock}
                    onChange={(e) => setFormData({ ...formData, track_stock: e.target.checked })}
                    style={{ cursor: "pointer", width: "16px", height: "16px" }}
                  />
                  <label htmlFor="track_stock_checkbox" style={{ fontSize: "0.85rem", fontWeight: "600", cursor: "pointer" }}>
                    Track Daily Stock Quantities
                  </label>
                </div>

                {formData.track_stock && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ fontSize: "0.78rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>
                        Available Quantity
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.available_quantity}
                        onChange={(e) => setFormData({ ...formData, available_quantity: e.target.value })}
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "0.78rem", fontWeight: "600", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>
                        Low Stock Alert Threshold
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.low_stock_threshold}
                        onChange={(e) => setFormData({ ...formData, low_stock_threshold: e.target.value })}
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Customizations & Availability */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    id="is_available_checkbox"
                    checked={formData.is_available}
                    onChange={(e) => setFormData({ ...formData, is_available: e.target.checked })}
                    style={{ cursor: "pointer", width: "16px", height: "16px" }}
                  />
                  <label htmlFor="is_available_checkbox" style={{ fontSize: "0.85rem", fontWeight: "600", cursor: "pointer" }}>
                    Available for Ordering Immediately (In Stock)
                  </label>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    id="allows_sugar_checkbox"
                    checked={formData.allows_sugar}
                    onChange={(e) => setFormData({ ...formData, allows_sugar: e.target.checked })}
                    style={{ cursor: "pointer", width: "16px", height: "16px" }}
                  />
                  <label htmlFor="allows_sugar_checkbox" style={{ fontSize: "0.85rem", fontWeight: "600", cursor: "pointer" }}>
                    🍬 Sugar Customization (None, Less, Medium, Extra)
                  </label>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    id="allows_strength_checkbox"
                    checked={formData.allows_strength}
                    onChange={(e) => setFormData({ ...formData, allows_strength: e.target.checked })}
                    style={{ cursor: "pointer", width: "16px", height: "16px" }}
                  />
                  <label htmlFor="allows_strength_checkbox" style={{ fontSize: "0.85rem", fontWeight: "600", cursor: "pointer" }}>
                    💪 Tea Strength Customization (Light, Regular, Kadak)
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "14px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingItem(null);
                  }}
                  className="btn-secondary"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                  style={{ minWidth: "130px" }}
                >
                  {submitting
                    ? "Saving..."
                    : editingItem
                      ? "Update Item"
                      : "Add to Menu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: DELETE CONFIRMATION */}
      {/* ============================================================ */}
      {deletingItem && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 110,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "420px",
              padding: "26px",
              borderRadius: "16px",
              background: "#FFFFFF",
              boxShadow: "var(--shadow-modal)",
            }}
          >
            <div style={{ fontSize: "2rem", marginBottom: "8px", color: "var(--status-err)" }}>
              🗑️
            </div>
            <h3 style={{ fontSize: "1.2rem", fontWeight: "800", color: "var(--text-main)", marginBottom: "6px" }}>
              Delete Menu Item?
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginBottom: "20px", lineHeight: "1.5" }}>
              Are you sure you want to permanently delete <strong>{deletingItem.name}</strong> from the shop catalog?
              This action cannot be undone.
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                onClick={() => setDeletingItem(null)}
                className="btn-secondary"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteItem}
                disabled={submitting}
                style={{
                  padding: "9px 18px",
                  borderRadius: "8px",
                  border: "none",
                  background: "var(--status-err)",
                  color: "#FFFFFF",
                  fontWeight: "700",
                  fontSize: "0.88rem",
                  cursor: "pointer",
                }}
              >
                {submitting ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: CATEGORY MANAGEMENT */}
      {/* ============================================================ */}
      {isCategoryModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "600px",
              maxHeight: "85vh",
              overflowY: "auto",
              padding: "26px",
              borderRadius: "16px",
              background: "#FFFFFF",
              boxShadow: "var(--shadow-modal)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "18px",
                borderBottom: "1px solid var(--border-subtle)",
                paddingBottom: "12px",
              }}
            >
              <div>
                <h2 style={{ fontSize: "1.2rem", fontWeight: "800", color: "var(--text-main)" }}>
                  🏷️ Manage Menu Categories
                </h2>
                <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  Create and organize product categories
                </p>
              </div>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "1.2rem",
                  color: "var(--text-muted)",
                }}
              >
                ✕
              </button>
            </div>

            {/* Create Category Form */}
            <form
              onSubmit={handleAddCategory}
              style={{
                background: "var(--bg-card-subtle)",
                padding: "16px",
                borderRadius: "12px",
                marginBottom: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div style={{ fontSize: "0.88rem", fontWeight: "700", color: "var(--text-main)" }}>
                ➕ Create New Category
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "10px" }}>
                <div>
                  <input
                    type="text"
                    placeholder="Category Name (e.g. Special Teas)"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    required
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <input
                    type="number"
                    placeholder="Display Order"
                    value={newCatOrder}
                    onChange={(e) => setNewCatOrder(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              <input
                type="text"
                placeholder="Description (optional)"
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
                style={{ width: "100%" }}
              />

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  disabled={submitting || !newCatName.trim()}
                  className="btn-primary"
                  style={{ padding: "8px 16px", fontSize: "0.85rem" }}
                >
                  {submitting ? "Adding..." : "+ Save Category"}
                </button>
              </div>
            </form>

            {/* List of Existing Categories */}
            <div>
              <div style={{ fontSize: "0.88rem", fontWeight: "700", color: "var(--text-main)", marginBottom: "10px" }}>
                Existing Categories ({categories.length})
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {categories.map((cat) => {
                  const itemCount = items.filter((i) => i.category_id === cat.id).length;
                  return (
                    <div
                      key={cat.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 14px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-subtle)",
                        background: "#FFFFFF",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: "700", fontSize: "0.9rem", color: "var(--text-main)" }}>
                          {cat.name}
                        </div>
                        {cat.description && (
                          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                            {cat.description}
                          </div>
                        )}
                        <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "2px" }}>
                          Order: {cat.display_order} • Items: {itemCount}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteCategory(cat)}
                        style={{
                          background: "#FEF2F2",
                          border: "1px solid #FECACA",
                          color: "var(--status-err)",
                          borderRadius: "6px",
                          padding: "6px 10px",
                          fontSize: "0.78rem",
                          fontWeight: "600",
                          cursor: "pointer",
                        }}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
