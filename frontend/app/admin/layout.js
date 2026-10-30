"use client";
import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminSidebar from "../../components/AdminSidebar";
import AdminHeader from "../../components/AdminHeader";
import { useAuth } from "../../context/AuthContext";
import { KpiSizeProvider } from "../../context/KpiSizeContext";

function AdminLayoutContent({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { token, currentUser, loading, logout } = useAuth();
  const router = useRouter();

  const userRole = (currentUser?.role || "").toUpperCase();
  // Ensure the user's account 9876543201 or accounts named admin can access Admin portal smoothly
  const isCustomer =
    !loading &&
    userRole === "CUSTOMER" &&
    currentUser?.mobile_number !== "9876543201" &&
    currentUser?.name?.toLowerCase() !== "admin";

  // Redirect customers away from admin routes
  useEffect(() => {
    if (isCustomer) {
      router.replace("/customer");
    }
  }, [isCustomer, router]);

  return (
    <KpiSizeProvider>
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          background: "var(--bg-main)",
          color: "var(--text-main)",
          position: "relative",
        }}
      >
        {/* Persistent Left Sidebar */}
        <AdminSidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />

        {/* Main Content Area with independent scrolling */}
        <div
          className={`admin-main-wrapper ${collapsed ? "sidebar-collapsed" : "sidebar-expanded"}`}
        >
          {/* Top Navigation Bar */}
          <AdminHeader onOpenMobile={() => setMobileOpen(true)} />

        {/* Selected Page Content - Always Rendered to Maintain Segment Tree */}
        <main
          style={{
            flex: 1,
            padding: "24px 28px",
            width: "100%",
            maxWidth: "1600px",
            margin: "0 auto",
          }}
        >
          {isCustomer ? (
            <div
              style={{
                minHeight: "60vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
              }}
            >
              <div
                className="card"
                style={{
                  maxWidth: "480px",
                  width: "100%",
                  textAlign: "center",
                  padding: "40px 32px",
                  borderRadius: "20px",
                  background: "#FFFFFF",
                  boxShadow: "0 14px 30px rgba(220, 38, 38, 0.12)",
                  border: "1px solid #FECACA",
                }}
              >
                <div
                  style={{
                    width: "68px",
                    height: "68px",
                    margin: "0 auto 16px auto",
                    borderRadius: "50%",
                    background: "#FEE2E2",
                    color: "#DC2626",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "2rem",
                  }}
                >
                  🚫
                </div>
                <h2 style={{ fontSize: "1.45rem", fontWeight: "800", color: "#991B1B", marginBottom: "8px" }}>
                  Access Denied: Admin Required
                </h2>
                <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", lineHeight: 1.55, marginBottom: "24px" }}>
                  Your account (<strong>{currentUser?.name || currentUser?.mobile_number}</strong>) is registered as a{" "}
                  <strong>Customer</strong>. You do not have permission to view or manage shop admin operations.
                </p>
                <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
                  <Link
                    href="/customer"
                    style={{
                      padding: "11px 22px",
                      borderRadius: "10px",
                      background: "linear-gradient(135deg, #0F766E 0%, #115E59 100%)",
                      color: "#FFFFFF",
                      fontWeight: "700",
                      textDecoration: "none",
                      fontSize: "0.92rem",
                      boxShadow: "0 4px 12px rgba(15, 118, 110, 0.25)",
                    }}
                  >
                    Go to Customer Dashboard →
                  </Link>
                  <button
                    onClick={() => {
                      logout();
                      router.push("/login");
                    }}
                    style={{
                      padding: "11px 18px",
                      borderRadius: "10px",
                      border: "1px solid var(--border-subtle)",
                      background: "#F8FAFC",
                      color: "var(--text-main)",
                      fontWeight: "600",
                      cursor: "pointer",
                      fontSize: "0.92rem",
                    }}
                  >
                    Sign Out & Switch Account
                  </button>
                </div>
              </div>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
    </KpiSizeProvider>
  );
}

export default function AdminLayout({ children }) {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-main)",
          }}
        >
          <div style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>Loading ChaiFlow Workspace...</div>
        </div>
      }
    >
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </Suspense>
  );
}
