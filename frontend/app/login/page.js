"use client";
import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "";

  const { login } = useAuth();
  const [mobileNumber, setMobileNumber] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");

    const trimmedMobile = mobileNumber.trim();
    if (!trimmedMobile || trimmedMobile.length < 10) {
      setErrorMsg("Please enter a valid 10-digit mobile number.");
      return;
    }
    if (!password) {
      setErrorMsg("Please enter your account password.");
      return;
    }

    setLoading(true);
    try {
      const res = await login(trimmedMobile, password);
      const user = res?.user;

      if (redirectUrl) {
        router.push(redirectUrl);
      } else if (user?.role === "ADMIN" || user?.role === "STAFF") {
        router.push("/admin/dashboard");
      } else {
        router.push("/menu");
      }
    } catch (err) {
      setErrorMsg(err.message || "Invalid mobile number or password.");
    } finally {
      setLoading(false);
    }
  }

  function handleQuickFill(mobile, pass) {
    setMobileNumber(mobile);
    setPassword(pass);
    setErrorMsg("");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(145deg, #F0FDF4 0%, #F8FAFC 50%, #ECFDF5 100%)",
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
          maxWidth: "440px",
          padding: "36px 32px",
          borderRadius: "18px",
          boxShadow: "0 10px 25px -5px rgba(15, 118, 110, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.04)",
          background: "#FFFFFF",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div
            style={{
              width: "60px",
              height: "60px",
              margin: "0 auto 14px auto",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #0F766E 0%, #115E59 100%)",
              color: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.9rem",
              boxShadow: "0 4px 14px rgba(15, 118, 110, 0.3)",
            }}
          >
            ☕
          </div>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: "800",
              color: "var(--text-main)",
              letterSpacing: "-0.02em",
            }}
          >
            ChaiFlow Sign In
          </h1>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "0.88rem",
              marginTop: "6px",
            }}
          >
            Access the tea shop management and ordering portal
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div
            style={{
              marginBottom: "20px",
              padding: "12px 14px",
              borderRadius: "8px",
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              color: "var(--status-err)",
              fontSize: "0.85rem",
              fontWeight: "500",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.82rem",
                fontWeight: "600",
                color: "var(--text-main)",
                marginBottom: "6px",
              }}
            >
              Registered Mobile Number
            </label>
            <div style={{ position: "relative" }}>
              <input
                type="tel"
                placeholder="10-digit number (e.g. 9999999999)"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                maxLength={10}
                required
                style={{
                  width: "100%",
                  paddingLeft: "12px",
                  fontSize: "0.95rem",
                  letterSpacing: "0.02em",
                }}
              />
            </div>
          </div>

          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "6px",
              }}
            >
              <label
                style={{
                  fontSize: "0.82rem",
                  fontWeight: "600",
                  color: "var(--text-main)",
                }}
              >
                Password
              </label>
            </div>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: "100%",
                  paddingRight: "44px",
                  fontSize: "0.95rem",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  fontSize: "1rem",
                }}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{
              width: "100%",
              padding: "12px",
              fontSize: "0.95rem",
              fontWeight: "700",
              marginTop: "6px",
            }}
          >
            {loading ? "Authenticating..." : "Sign In →"}
          </button>
        </form>

        {/* Quick Demo Logins Section */}
        <div
          style={{
            marginTop: "24px",
            paddingTop: "20px",
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          <div
            style={{
              fontSize: "0.76rem",
              fontWeight: "700",
              color: "var(--text-dim)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "10px",
              textAlign: "center",
            }}
          >
            Fast Demo Logins
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <button
              type="button"
              onClick={() => handleQuickFill("9999999999", "admin123")}
              style={{
                padding: "8px 10px",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
                background: "#F8FAFC",
                cursor: "pointer",
                fontSize: "0.78rem",
                fontWeight: "600",
                color: "var(--color-primary)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "2px",
                transition: "all 0.15s ease",
              }}
            >
              <span>👑 Shop Admin</span>
              <span style={{ fontSize: "0.68rem", color: "var(--text-dim)" }}>9999999999</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickFill("8888888888", "admin123")}
              style={{
                padding: "8px 10px",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
                background: "#F8FAFC",
                cursor: "pointer",
                fontSize: "0.78rem",
                fontWeight: "600",
                color: "var(--text-main)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "2px",
                transition: "all 0.15s ease",
              }}
            >
              <span>👨‍🍳 Counter Staff</span>
              <span style={{ fontSize: "0.68rem", color: "var(--text-dim)" }}>8888888888</span>
            </button>
          </div>
        </div>

        {/* Customer Menu Link */}
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <Link
            href="/menu"
            style={{
              fontSize: "0.82rem",
              color: "var(--color-primary)",
              textDecoration: "none",
              fontWeight: "600",
            }}
          >
            Looking to scan QR & order chai? Open Customer Menu →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
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
          <div style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>Loading ChaiFlow Sign In...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
