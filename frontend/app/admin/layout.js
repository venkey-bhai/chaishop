"use client";
import React, { useState, Suspense } from "react";
import AdminSidebar from "../../components/AdminSidebar";
import AdminHeader from "../../components/AdminHeader";

export default function AdminLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--bg-main)",
        color: "var(--text-main)",
      }}
    >
      {/* Persistent Left Sidebar */}
      <Suspense
        fallback={
          <aside
            style={{
              width: collapsed ? "74px" : "250px",
              minWidth: collapsed ? "74px" : "250px",
              background: "#FFFFFF",
              borderRight: "1px solid var(--border-subtle)",
              height: "100vh",
              position: "sticky",
              top: 0,
            }}
          />
        }
      >
        <AdminSidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
      </Suspense>

      {/* Main Content Area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          background: "var(--bg-main)",
        }}
      >
        {/* Top Navigation Bar */}
        <Suspense
          fallback={
            <header
              style={{
                background: "#FFFFFF",
                borderBottom: "1px solid var(--border-subtle)",
                padding: "16px 24px",
                height: "70px",
              }}
            />
          }
        >
          <AdminHeader onOpenMobile={() => setMobileOpen(true)} />
        </Suspense>

        {/* Selected Page Content */}
        <main
          style={{
            flex: 1,
            padding: "24px 28px",
            width: "100%",
            maxWidth: "1600px",
            margin: "0 auto",
          }}
        >
          <Suspense
            fallback={
              <div
                style={{
                  padding: "40px",
                  textAlign: "center",
                  color: "var(--text-muted)",
                }}
              >
                Loading ChaiFlow admin workspace...
              </div>
            }
          >
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

