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
      const role = (user?.role || "").toUpperCase();

      if (redirectUrl) {
        if (role === "CUSTOMER" && redirectUrl.startsWith("/admin")) {
          router.push("/customer");
        } else {
          router.push(redirectUrl);
        }
      } else if (role === "ADMIN" || role === "STAFF") {
        router.push("/admin/dashboard");
      } else {
        router.push("/customer");
      }
    } catch (err) {
      setErrorMsg(err.message || "Invalid mobile number or password.");
    } finally {
      setLoading(false);
    }
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
          borderRadius: "20px",
          boxShadow: "0 12px 30px -6px rgba(15, 118, 110, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.04)",
          background: "#FFFFFF",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              margin: "0 auto 14px auto",
              borderRadius: "18px",
              background: "linear-gradient(135deg, #0F766E 0%, #115E59 100%)",
              color: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "2rem",
              boxShadow: "0 6px 18px rgba(15, 118, 110, 0.3)",
            }}
          >
            ☕
          </div>
          <h1
            style={{
              fontSize: "1.6rem",
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
            Sign in to access your Shop Account or Customer Dashboard
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div
            style={{
              marginBottom: "20px",
              padding: "12px 14px",
              borderRadius: "10px",
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              color: "#B91C1C",
              fontSize: "0.85rem",
              fontWeight: "500",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "1.1rem" }}>⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.84rem",
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
                placeholder="10-digit number (e.g. 9876543210)"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                maxLength={10}
                required
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  fontSize: "0.95rem",
                  letterSpacing: "0.02em",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "10px",
                  background: "#F8FAFC",
                  outline: "none",
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
                  fontSize: "0.84rem",
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
                  padding: "12px 44px 12px 14px",
                  fontSize: "0.95rem",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "10px",
                  background: "#F8FAFC",
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  fontSize: "1.1rem",
                  padding: "4px",
                }}
                title={showPassword ? "Hide password" : "Show password"}
                aria-label="Toggle password visibility"
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
              padding: "13px",
              fontSize: "0.95rem",
              fontWeight: "700",
              marginTop: "6px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #0F766E 0%, #115E59 100%)",
              color: "#FFFFFF",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 4px 12px rgba(15, 118, 110, 0.25)",
              transition: "transform 0.1s ease",
            }}
          >
            {loading ? "Authenticating..." : "Sign In →"}
          </button>
        </form>

        {/* Sign Up Link Section */}
        <div
          style={{
            marginTop: "24px",
            paddingTop: "20px",
            borderTop: "1px solid var(--border-subtle)",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", margin: "0 0 10px 0" }}>
            Don't have an account yet?
          </p>
          <Link
            href="/signup"
            style={{
              display: "inline-block",
              width: "100%",
              padding: "11px",
              borderRadius: "10px",
              border: "1.5px solid #0F766E",
              background: "#F0FDF4",
              color: "#0F766E",
              textDecoration: "none",
              fontSize: "0.92rem",
              fontWeight: "700",
              textAlign: "center",
              transition: "all 0.2s ease",
            }}
          >
            Create an Account / Sign Up
          </Link>
        </div>

        {/* Customer Menu Link */}
        <div style={{ textAlign: "center", marginTop: "18px" }}>
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
