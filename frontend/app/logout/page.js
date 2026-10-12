"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";

export default function LogoutPage() {
  const { logout } = useAuth();
  const [loggedOut, setLoggedOut] = useState(false);

  useEffect(() => {
    async function doLogout() {
      try {
        await logout();
      } catch (err) {
        console.error("Logout error:", err);
      } finally {
        setLoggedOut(true);
      }
    }
    doLogout();
  }, [logout]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(145deg, #F8FAFC 0%, #F1F5F9 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: "420px",
          padding: "40px 32px",
          borderRadius: "18px",
          textAlign: "center",
          background: "#FFFFFF",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.06)",
        }}
      >
        <div
          style={{
            width: "64px",
            height: "64px",
            margin: "0 auto 16px auto",
            borderRadius: "50%",
            background: "#ECFDF5",
            border: "2px solid #BBF7D0",
            color: "var(--status-success)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "2rem",
          }}
        >
          ✓
        </div>

        <h1
          style={{
            fontSize: "1.45rem",
            fontWeight: "800",
            color: "var(--text-main)",
            marginBottom: "8px",
          }}
        >
          Logged Out Successfully
        </h1>

        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.9rem",
            marginBottom: "28px",
            lineHeight: "1.5",
          }}
        >
          {loggedOut
            ? "Your ChaiFlow session has been securely closed. All cached authorization credentials have been cleared."
            : "Closing your session securely..."}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <Link
            href="/login"
            className="btn-primary"
            style={{
              textDecoration: "none",
              padding: "12px",
              fontSize: "0.92rem",
            }}
          >
            🔐 Sign In Again
          </Link>

          <Link
            href="/menu"
            className="btn-secondary"
            style={{
              textDecoration: "none",
              padding: "12px",
              fontSize: "0.92rem",
            }}
          >
            ☕ View Customer Menu
          </Link>

          <Link
            href="/"
            style={{
              marginTop: "8px",
              fontSize: "0.82rem",
              color: "var(--text-dim)",
              textDecoration: "none",
            }}
          >
            ← Return to Overview
          </Link>
        </div>
      </div>
    </div>
  );
}
