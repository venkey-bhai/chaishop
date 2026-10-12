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

export default function MenuManagementPage() {
  const { getValidAdminToken } = useAuth();

  // Data states
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState(null); // { type: 'success'|'error', text: '' }

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

  // Quick Stock Stepper
  async function handleStockStep(item, delta) {
    const newQty = Math.max(0, (item.available_quantity || 0) + delta);
    try {
      const token = await getValidAdminToken();
      await updateItemStock(item.id, newQty, token);
      await loadMenu();
    } catch (err) {
      setActionMsg({
        type: "error",
        text: `Failed to update stock: ${err.message}`,
      });
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
          background: "#FFFFFF",
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

      {/* Metrics Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "14px",
        }}
      >
        <div className="card" style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: "600", color: "var(--text-muted)" }}>
            TOTAL ITEMS
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--text-main)", marginTop: "4px" }}>
            {totalItemsCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
            Across {categories.length} categories
          </div>
        </div>

        <div className="card" style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: "600", color: "var(--status-success)" }}>
            IN STOCK & READY
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--status-success)", marginTop: "4px" }}>
            {inStockCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
            Visible on digital QR menu
          </div>
        </div>

        <div className="card" style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: "600", color: "var(--status-err)" }}>
            OUT OF STOCK
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--status-err)", marginTop: "4px" }}>
            {outOfStockCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
            Disabled from customer orders
          </div>
        </div>

        <div className="card" style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: "600", color: "var(--status-warning)" }}>
            LOW STOCK ALERTS
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "var(--status-warning)", marginTop: "4px" }}>
            {lowStockCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
            Below alert threshold
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

        {/* Category Pills */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: "700", color: "var(--text-dim)", marginRight: "4px" }}>
            CATEGORIES:
          </span>
          <button
            onClick={() => setSelectedCatId("all")}
            style={{
              padding: "6px 14px",
              borderRadius: "20px",
              border: `1px solid ${selectedCatId === "all" ? "var(--color-primary)" : "var(--border-subtle)"}`,
              background: selectedCatId === "all" ? "var(--color-primary)" : "#FFFFFF",
              color: selectedCatId === "all" ? "#FFFFFF" : "var(--text-main)",
              cursor: "pointer",
              fontSize: "0.82rem",
              fontWeight: "600",
              transition: "all 0.15s ease",
            }}
          >
            All Items ({items.length})
          </button>
          {categories.map((cat) => {
            const count = items.filter((i) => i.category_id === cat.id).length;
            const isSelected = selectedCatId === String(cat.id);
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCatId(String(cat.id))}
                style={{
                  padding: "6px 14px",
                  borderRadius: "20px",
                  border: `1px solid ${isSelected ? "var(--color-primary)" : "var(--border-subtle)"}`,
                  background: isSelected ? "var(--color-primary)" : "#FFFFFF",
                  color: isSelected ? "#FFFFFF" : "var(--text-main)",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                  fontWeight: "600",
                  transition: "all 0.15s ease",
                }}
              >
                {cat.name} ({count})
              </button>
            );
          })}
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

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: "16px",
              }}
            >
              {cat.items.map((item) => {
                const isLowStock =
                  item.track_stock && item.available_quantity <= item.low_stock_threshold;

                return (
                  <div
                    key={item.id}
                    className="card"
                    style={{
                      padding: "18px 20px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "14px",
                      borderLeft: item.is_available
                        ? "4px solid var(--color-primary)"
                        : "4px solid #CBD5E1",
                      opacity: item.is_available ? 1 : 0.8,
                      position: "relative",
                    }}
                  >
                    <div>
                      {/* Title & Price */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: "8px",
                          marginBottom: "6px",
                        }}
                      >
                        <div>
                          <h4
                            style={{
                              fontSize: "1.05rem",
                              fontWeight: "700",
                              color: "var(--text-main)",
                              lineHeight: "1.3",
                            }}
                          >
                            {item.name}
                          </h4>
                          <span
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: "600",
                              background: "var(--bg-card-subtle)",
                              color: "var(--text-dim)",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              display: "inline-block",
                              marginTop: "3px",
                            }}
                          >
                            {cat.name}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: "1.25rem",
                            fontWeight: "800",
                            color: "var(--color-primary)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          ₹{parseFloat(item.price).toFixed(2)}
                        </div>
                      </div>

                      {/* Description */}
                      {item.description && (
                        <p
                          style={{
                            fontSize: "0.82rem",
                            color: "var(--text-muted)",
                            margin: "8px 0",
                            lineHeight: "1.4",
                          }}
                        >
                          {item.description}
                        </p>
                      )}

                      {/* Badges: Customization & Stock Warning */}
                      <div
                        style={{
                          display: "flex",
                          gap: "6px",
                          flexWrap: "wrap",
                          marginTop: "8px",
                          alignItems: "center",
                        }}
                      >
                        {item.has_customizations && (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: "600",
                              background: "#F0FDF4",
                              border: "1px solid #BBF7D0",
                              color: "var(--status-success)",
                              padding: "2px 7px",
                              borderRadius: "4px",
                            }}
                          >
                            ✨ Custom Options
                          </span>
                        )}
                        {isLowStock && item.is_available && (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: "700",
                              background: "#FEF3C7",
                              border: "1px solid #FDE68A",
                              color: "#B45309",
                              padding: "2px 7px",
                              borderRadius: "4px",
                            }}
                          >
                            ⚠️ Low Stock ({item.available_quantity} left)
                          </span>
                        )}
                      </div>

                      {/* Stock Quantity Stepper */}
                      {item.track_stock && (
                        <div
                          style={{
                            marginTop: "12px",
                            padding: "8px 10px",
                            borderRadius: "8px",
                            background: "var(--bg-card-subtle)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <span style={{ fontSize: "0.78rem", fontWeight: "600", color: "var(--text-muted)" }}>
                            Stock Units:
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <button
                              onClick={() => handleStockStep(item, -5)}
                              style={{
                                width: "24px",
                                height: "24px",
                                borderRadius: "4px",
                                border: "1px solid var(--border-subtle)",
                                background: "#FFFFFF",
                                cursor: "pointer",
                                fontWeight: "700",
                                fontSize: "0.75rem",
                              }}
                              title="Decrease 5"
                            >
                              -5
                            </button>
                            <button
                              onClick={() => handleStockStep(item, -1)}
                              style={{
                                width: "24px",
                                height: "24px",
                                borderRadius: "4px",
                                border: "1px solid var(--border-subtle)",
                                background: "#FFFFFF",
                                cursor: "pointer",
                                fontWeight: "700",
                                fontSize: "0.85rem",
                              }}
                              title="Decrease 1"
                            >
                              -
                            </button>
                            <span
                              style={{
                                fontSize: "0.88rem",
                                fontWeight: "800",
                                color: isLowStock ? "var(--status-err)" : "var(--text-main)",
                                minWidth: "28px",
                                textAlign: "center",
                              }}
                            >
                              {item.available_quantity}
                            </span>
                            <button
                              onClick={() => handleStockStep(item, 1)}
                              style={{
                                width: "24px",
                                height: "24px",
                                borderRadius: "4px",
                                border: "1px solid var(--border-subtle)",
                                background: "#FFFFFF",
                                cursor: "pointer",
                                fontWeight: "700",
                                fontSize: "0.85rem",
                              }}
                              title="Increase 1"
                            >
                              +
                            </button>
                            <button
                              onClick={() => handleStockStep(item, 5)}
                              style={{
                                width: "24px",
                                height: "24px",
                                borderRadius: "4px",
                                border: "1px solid var(--border-subtle)",
                                background: "#FFFFFF",
                                cursor: "pointer",
                                fontWeight: "700",
                                fontSize: "0.75rem",
                              }}
                              title="Increase 5"
                            >
                              +5
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom Actions: Toggle, Edit, Delete */}
                    <div
                      style={{
                        borderTop: "1px solid var(--border-subtle)",
                        paddingTop: "12px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      {/* Availability Status & Toggle Action */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            fontSize: "0.74rem",
                            fontWeight: "700",
                            padding: "3px 8px",
                            borderRadius: "12px",
                            background: item.is_available ? "#DCFCE7" : "#FEE2E2",
                            color: item.is_available ? "var(--status-success)" : "var(--status-err)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.is_available ? "● In Stock" : "○ Out of Stock"}
                        </span>

                        <button
                          onClick={() => handleToggle(item)}
                          style={{
                            padding: "5px 10px",
                            borderRadius: "6px",
                            border: `1px solid ${item.is_available ? "#FECACA" : "#BBF7D0"}`,
                            background: item.is_available ? "#FEF2F2" : "#F0FDF4",
                            color: item.is_available ? "var(--status-err)" : "var(--status-success)",
                            fontSize: "0.74rem",
                            fontWeight: "600",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                          title={item.is_available ? "Click to mark as out of stock" : "Click to mark as in stock"}
                        >
                          {item.is_available ? "Mark Out of Stock" : "Mark Available"}
                        </button>
                      </div>

                      <div style={{ display: "flex", gap: "6px" }}>
                        {/* Edit Button */}
                        <button
                          onClick={() => handleOpenEditModal(item)}
                          className="btn-secondary"
                          style={{
                            padding: "6px 10px",
                            fontSize: "0.78rem",
                            fontWeight: "600",
                          }}
                          title="Edit Item"
                        >
                          ✏️ Edit
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => setDeletingItem(item)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: "6px",
                            border: "1px solid #FECACA",
                            background: "#FEF2F2",
                            color: "var(--status-err)",
                            fontSize: "0.78rem",
                            fontWeight: "600",
                            cursor: "pointer",
                          }}
                          title="Delete Item"
                        >
                          🗑️
                        </button>
                      </div>
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
