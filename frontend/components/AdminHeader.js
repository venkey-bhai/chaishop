"use client";
import React, { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { getHealthStatus } from "../services/api";

const ROUTE_TITLES = {
  "/admin": { title: "Admin Overview", subtitle: "Chai Flow Operations" },
  "/admin/dashboard": { title: "Dashboard", subtitle: "Real-time Operations & Financial Overview" },
  "/admin/customers": { title: "Customer Management", subtitle: "Customer Directory & Credit Khata Profiles" },
  "/admin/menu": { title: "Menu Catalog & Inventory", subtitle: "Chai Varieties, Snacks, Pricing & Availability" },
  "/admin/orders": { title: "Order Pipeline & Token Queue", subtitle: "Live Kitchen Display & Preparation Lifecycle" },
  "/admin/payments": { title: "Billing & Transactions", subtitle: "Cash, UPI, Credit Settlements & Audit Receipts" },
  "/admin/credit": { title: "Credit Accounts & Khata Ledger", subtitle: "Customer Balances, Risk Audits & Repayments" },
  "/admin/expenses": { title: "Operating Expenses", subtitle: "Daily Shop Costs, Milk, Spices & Fixed Overheads" },
  "/admin/reports": { title: "Financial Reports & Analytics", subtitle: "Daily P&L, Product Margins & AI Sales Forecasts" },
  "/admin/settings": { title: "System Settings", subtitle: "Admin Profile, Database Diagnostics & Environment" },
};

function AdminHeaderContent({
  onOpenMobile,
  onRefresh,
  refreshing = false,
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, logout } = useAuth();
  const [healthStatus, setHealthStatus] = useState("checking");
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function checkHealth() {
      try {
        const res = await getHealthStatus();
        if (isMounted) {
          setHealthStatus(res?.status === "healthy" ? "healthy" : "degraded");
        }
      } catch (e) {
        if (isMounted) setHealthStatus("offline");
      }
    }
    checkHealth();
    return () => {
      isMounted = false;
    };
  }, []);

  const routeInfo = ROUTE_TITLES[pathname] || {
    title: pathname.split("/").pop().replace(/^\w/, (c) => c.toUpperCase()) || "Admin",
    subtitle: "Chai Flow Management",
  };

  return (
    <header
      style={{
        background: "#FFFFFF",
        borderBottom: "1px solid var(--border-subtle)",
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        position: "sticky",
        top: 0,
        zIndex: 35,
        boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.03)",
      }}
    >
      {/* Left side: Hamburger (mobile) + Breadcrumb & Title */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        {onOpenMobile && (
          <button
            onClick={onOpenMobile}
            style={{
              background: "transparent",
              border: "1px solid var(--border-subtle)",
              borderRadius: "8px",
              padding: "8px 10px",
              cursor: "pointer",
              fontSize: "1.1rem",
              color: "var(--text-main)",
            }}
            className="mobile-menu-btn"
            title="Open Menu"
          >
            ☰
          </button>
        )}

        <div>
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginBottom: "2px",
            }}
          >
            <span>ChaiFlow</span>
            <span>/</span>
            <span style={{ color: "var(--color-primary)", fontWeight: "600" }}>
              {routeInfo.title}
            </span>
          </div>
          <h1
            style={{
              fontSize: "1.25rem",
              fontWeight: "700",
              color: "var(--text-main)",
              letterSpacing: "-0.3px",
              lineHeight: "1.2",
            }}
          >
            {routeInfo.title}
          </h1>
        </div>
      </div>

      {/* Right side: Health indicator, Refresh button & Admin Profile */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        {/* System Health Pulse */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 12px",
            borderRadius: "20px",
            background: "#F8FAFC",
            border: "1px solid var(--border-subtle)",
            fontSize: "0.8rem",
            fontWeight: "500",
          }}
          className="header-health-badge"
        >
          <span
            className={`pulse-dot ${healthStatus === "healthy" ? "online" : "offline"}`}
          />
          <span
            style={{
              color:
                healthStatus === "healthy"
                  ? "var(--status-success)"
                  : "var(--status-err)",
            }}
          >
            {healthStatus === "healthy"
              ? "Backend Online"
              : healthStatus === "checking"
                ? "Connecting..."
                : "Backend Offline"}
          </span>
        </div>

        {/* Refresh button */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            style={{
              background: "#FFFFFF",
              border: "1px solid var(--border-subtle)",
              borderRadius: "8px",
              padding: "7px 12px",
              cursor: "pointer",
              fontSize: "0.85rem",
              color: "var(--text-main)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.15s ease",
            }}
            title="Refresh active page data"
          >
            <span>↻</span>
            <span className="refresh-label">{refreshing ? "Refreshing..." : "Refresh"}</span>
          </button>
        )}

        {/* Administrator Profile Pill */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            style={{
              background: "#FFFFFF",
              border: "1px solid var(--border-subtle)",
              borderRadius: "24px",
              padding: "4px 12px 4px 6px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "var(--color-primary-light)",
                color: "var(--color-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "700",
                fontSize: "0.8rem",
              }}
            >
              👑
            </div>
            <div style={{ textAlign: "left" }} className="admin-profile-text">
              <div
                style={{
                  fontSize: "0.82rem",
                  fontWeight: "600",
                  color: "var(--text-main)",
                  lineHeight: "1.1",
                }}
              >
                {currentUser?.name || "Administrator"}
              </div>
              <div
                style={{
                  fontSize: "0.68rem",
                  color: "var(--text-dim)",
                }}
              >
                {currentUser?.role || "ADMIN"}
              </div>
            </div>
          </button>

          {/* Profile Dropdown */}
          {showProfileMenu && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
                width: "200px",
                background: "#FFFFFF",
                border: "1px solid var(--border-subtle)",
                borderRadius: "10px",
                boxShadow: "var(--shadow-dropdown)",
                padding: "8px 0",
                zIndex: 50,
              }}
            >
              <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border-subtle)" }}>
                <div style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-main)" }}>
                  {currentUser?.name || "Admin"}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                  {currentUser?.mobile_number || "9999999999"}
                </div>
              </div>
              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  router.push("/logout");
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  color: "var(--status-err)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span>🚪</span> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default function AdminHeader(props) {
  return (
    <React.Suspense
      fallback={
        <header
          style={{
            background: "#FFFFFF",
            borderBottom: "1px solid var(--border-subtle)",
            padding: "16px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            minHeight: "70px",
          }}
        />
      }
    >
      <AdminHeaderContent {...props} />
    </React.Suspense>
  );
}

