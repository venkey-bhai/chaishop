"use client";
import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/admin/dashboard", icon: "📊" },
  { label: "Customers", href: "/admin/customers", icon: "👥" },
  { label: "Menu Management", href: "/admin/menu", icon: "☕" },
  { label: "Orders", href: "/admin/orders", icon: "📋" },
  { label: "Payments", href: "/admin/payments", icon: "💵" },
  { label: "Daily Sales & Expenses", href: "/admin/daily-sales", icon: "🧾" },
  { label: "Credit Management", href: "/admin/credit", icon: "💳" },
  { label: "Expenses", href: "/admin/expenses", icon: "📉" },
  { label: "Reports & Analytics", href: "/admin/reports", icon: "📈" },
  { label: "Settings", href: "/admin/settings", icon: "⚙️" },
];

export default function AdminSidebar({
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onCloseMobile,
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(4px)",
            zIndex: 40,
            display: "block",
          }}
          className="admin-mobile-backdrop"
        />
      )}

      {/* Sidebar Container */}
      <aside
        style={{
          width: collapsed ? "74px" : "250px",
          minWidth: collapsed ? "74px" : "250px",
          background: "#FFFFFF",
          borderRight: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: "100vh",
          position: "sticky",
          top: 0,
          zIndex: 45,
          transition: "width 0.25s ease, min-width 0.25s ease, transform 0.25s ease",
        }}
        className={`admin-sidebar ${mobileOpen ? "mobile-open" : ""}`}
      >
        {/* Top Brand Header */}
        <div>
          <div
            style={{
              padding: collapsed ? "20px 14px" : "20px 20px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "space-between",
              gap: "12px",
            }}
          >
            <Link
              href="/admin/dashboard"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #0F766E, #115E59)",
                  color: "#FFFFFF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.35rem",
                  boxShadow: "0 2px 8px rgba(15, 118, 110, 0.25)",
                  flexShrink: 0,
                }}
              >
                ☕
              </div>
              {!collapsed && (
                <div>
                  <div
                    style={{
                      fontSize: "1.1rem",
                      fontWeight: "700",
                      color: "var(--text-main)",
                      letterSpacing: "-0.3px",
                      lineHeight: "1.2",
                    }}
                  >
                    ChaiFlow
                  </div>
                  <div
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: "600",
                      color: "var(--color-primary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Admin Portal
                  </div>
                </div>
              )}
            </Link>

            {/* Collapse toggle (desktop) */}
            {!collapsed && onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                title="Collapse sidebar"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  padding: "6px",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                className="desktop-collapse-btn"
              >
                ◀
              </button>
            )}
          </div>

          {/* Navigation Links */}
          <nav
            style={{
              padding: "16px 10px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              overflowY: "auto",
              maxHeight: "calc(100vh - 200px)",
            }}
          >
            {NAV_ITEMS.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/admin/dashboard" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onCloseMobile}
                  title={collapsed ? item.label : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: collapsed ? "11px 0" : "10px 14px",
                    justifyContent: collapsed ? "center" : "flex-start",
                    borderRadius: "8px",
                    textDecoration: "none",
                    fontSize: "0.9rem",
                    fontWeight: isActive ? "600" : "500",
                    color: isActive ? "var(--color-primary)" : "var(--text-main)",
                    backgroundColor: isActive
                      ? "var(--color-primary-light)"
                      : "transparent",
                    borderLeft: isActive ? "3px solid var(--color-primary)" : "3px solid transparent",
                    transition: "all 0.15s ease",
                  }}
                  className={`nav-link ${isActive ? "active" : ""}`}
                >
                  <span
                    style={{
                      fontSize: "1.2rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "24px",
                    }}
                  >
                    {item.icon}
                  </span>
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}

            {/* Divider */}
            <div
              style={{
                height: "1px",
                background: "var(--border-subtle)",
                margin: "12px 6px",
              }}
            />

            {/* Customer Facing Menu Shortcut */}
            <Link
              href="/menu"
              target="_blank"
              onClick={onCloseMobile}
              title={collapsed ? "Customer QR Menu" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: collapsed ? "10px 0" : "10px 14px",
                justifyContent: collapsed ? "center" : "flex-start",
                borderRadius: "8px",
                textDecoration: "none",
                fontSize: "0.85rem",
                fontWeight: "500",
                color: "var(--text-muted)",
                transition: "all 0.15s ease",
              }}
              className="nav-link"
            >
              <span
                style={{
                  fontSize: "1.15rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "24px",
                }}
              >
                📱
              </span>
              {!collapsed && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>Customer View</span>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      background: "#F1F5F9",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      color: "var(--text-dim)",
                    }}
                  >
                    QR
                  </span>
                </div>
              )}
            </Link>
          </nav>
        </div>

        {/* Footer Area: Expand Button (if collapsed) & Logout */}
        <div
          style={{
            padding: "14px 10px",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}
        >
          {collapsed && onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              title="Expand sidebar"
              style={{
                width: "100%",
                padding: "8px 0",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                fontSize: "0.9rem",
                borderRadius: "6px",
              }}
            >
              ▶
            </button>
          )}

          <button
            onClick={() => {
              if (window.confirm("Are you sure you want to log out of the Admin Portal?")) {
                router.push("/logout");
              }
            }}
            title={collapsed ? "Logout" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: collapsed ? "10px 0" : "10px 14px",
              justifyContent: collapsed ? "center" : "flex-start",
              width: "100%",
              background: "transparent",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: "500",
              color: "var(--status-err)",
              transition: "background 0.15s ease",
            }}
            className="nav-logout-btn"
          >
            <span
              style={{
                fontSize: "1.2rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "24px",
              }}
            >
              🚪
            </span>
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
