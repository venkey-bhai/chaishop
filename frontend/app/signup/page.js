"use client";
import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signupCustomer, signupAdmin } from "../../services/api";
import { useAuth } from "../../context/AuthContext";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = searchParams.get("role") === "admin" ? "admin" : "customer";

  const { setSession } = useAuth();
  const [activeTab, setActiveTab] = useState(initialRole); // "customer" or "admin"

  // Common form fields
  const [fullName, setFullName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Admin-specific fields
  const [shopName, setShopName] = useState("ChaiFlow Tea Shop");
  const [adminSecret, setAdminSecret] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  function resetForm() {
    setErrorMsg("");
    setSuccessMsg("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const trimmedName = fullName.trim();
    const trimmedMobile = mobileNumber.trim();
    const trimmedEmail = email.trim();
    const trimmedSecret = adminSecret.trim();

    if (!trimmedName || trimmedName.length < 2) {
      setErrorMsg("Please enter your full name (at least 2 characters).");
      return;
    }
    if (!trimmedMobile || trimmedMobile.length !== 10 || !/^\d{10}$/.test(trimmedMobile)) {
      setErrorMsg("Please enter a valid 10-digit mobile number.");
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("Password and Confirm Password do not match.");
      return;
    }

    if (activeTab === "admin" && !trimmedSecret) {
      setErrorMsg("Admin Authorization Secret Key is required to create an Admin account.");
      return;
    }

    setLoading(true);
    try {
      if (activeTab === "customer") {
        const res = await signupCustomer({
          full_name: trimmedName,
          mobile_number: trimmedMobile,
          email: trimmedEmail || null,
          password,
          confirm_password: confirmPassword,
        });

        if (res?.access_token && res?.user) {
          setSession(res.access_token, res.user);
          setSuccessMsg("Customer account created successfully! Redirecting to your dashboard...");
          setTimeout(() => {
            router.push("/customer");
          }, 900);
        } else {
          setSuccessMsg("Account created successfully! Please sign in.");
          setTimeout(() => {
            router.push("/login");
          }, 1200);
        }
      } else {
        // Admin Signup
        const res = await signupAdmin({
          full_name: trimmedName,
          mobile_number: trimmedMobile,
          email: trimmedEmail || null,
          password,
          confirm_password: confirmPassword,
          shop_name: shopName.trim() || "ChaiFlow Tea Shop",
          admin_secret: trimmedSecret,
        });

        if (res?.access_token && res?.user) {
          setSession(res.access_token, res.user);
          setSuccessMsg("Admin account registered successfully! Redirecting to Admin Dashboard...");
          setTimeout(() => {
            router.push("/admin/dashboard");
          }, 900);
        } else {
          setSuccessMsg("Admin account created successfully! Please sign in.");
          setTimeout(() => {
            router.push("/login");
          }, 1200);
        }
      }
    } catch (err) {
      setErrorMsg(err.message || "Failed to create account. Please verify your details.");
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
          maxWidth: "480px",
          padding: "36px 32px",
          borderRadius: "20px",
          boxShadow: "0 12px 30px -6px rgba(15, 118, 110, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.04)",
          background: "#FFFFFF",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div
            style={{
              width: "60px",
              height: "60px",
              margin: "0 auto 12px auto",
              borderRadius: "18px",
              background: "linear-gradient(135deg, #0F766E 0%, #115E59 100%)",
              color: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.9rem",
              boxShadow: "0 6px 16px rgba(15, 118, 110, 0.28)",
            }}
          >
            ☕
          </div>
          <h1
            style={{
              fontSize: "1.55rem",
              fontWeight: "800",
              color: "var(--text-main)",
              letterSpacing: "-0.02em",
            }}
          >
            Create Your Account
          </h1>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "0.88rem",
              marginTop: "4px",
            }}
          >
            Join ChaiFlow to view your orders, credit khata, and manage shop operations
          </p>
        </div>

        {/* Role Selection Tabs */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "6px",
            background: "#F1F5F9",
            padding: "4px",
            borderRadius: "12px",
            marginBottom: "22px",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setActiveTab("customer");
              resetForm();
            }}
            style={{
              padding: "10px",
              borderRadius: "9px",
              border: "none",
              background: activeTab === "customer" ? "#FFFFFF" : "transparent",
              color: activeTab === "customer" ? "#0F766E" : "var(--text-muted)",
              fontWeight: activeTab === "customer" ? "700" : "500",
              fontSize: "0.9rem",
              cursor: "pointer",
              boxShadow: activeTab === "customer" ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
              transition: "all 0.15s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            <span>👤</span> Customer Signup
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("admin");
              resetForm();
            }}
            style={{
              padding: "10px",
              borderRadius: "9px",
              border: "none",
              background: activeTab === "admin" ? "#FFFFFF" : "transparent",
              color: activeTab === "admin" ? "#0F766E" : "var(--text-muted)",
              fontWeight: activeTab === "admin" ? "700" : "500",
              fontSize: "0.9rem",
              cursor: "pointer",
              boxShadow: activeTab === "admin" ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
              transition: "all 0.15s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            <span>👑</span> Admin Signup
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div
            style={{
              marginBottom: "18px",
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

        {/* Success Alert */}
        {successMsg && (
          <div
            style={{
              marginBottom: "18px",
              padding: "12px 14px",
              borderRadius: "10px",
              background: "#F0FDF4",
              border: "1px solid #BBF7D0",
              color: "#15803D",
              fontSize: "0.85rem",
              fontWeight: "600",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "1.1rem" }}>✅</span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* Signup Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.84rem",
                fontWeight: "600",
                color: "var(--text-main)",
                marginBottom: "5px",
              }}
            >
              Full Name <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Ramesh Kumar"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "11px 13px",
                fontSize: "0.92rem",
                border: "1px solid var(--border-subtle)",
                borderRadius: "10px",
                background: "#F8FAFC",
                outline: "none",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.84rem",
                fontWeight: "600",
                color: "var(--text-main)",
                marginBottom: "5px",
              }}
            >
              Registered Mobile Number <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <input
              type="tel"
              placeholder="10-digit mobile number"
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ""))}
              maxLength={10}
              required
              style={{
                width: "100%",
                padding: "11px 13px",
                fontSize: "0.92rem",
                border: "1px solid var(--border-subtle)",
                borderRadius: "10px",
                background: "#F8FAFC",
                outline: "none",
                letterSpacing: "0.02em",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.84rem",
                fontWeight: "600",
                color: "var(--text-main)",
                marginBottom: "5px",
              }}
            >
              Email Address <span style={{ color: "var(--text-dim)", fontWeight: "normal" }}>(Optional)</span>
            </label>
            <input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "11px 13px",
                fontSize: "0.92rem",
                border: "1px solid var(--border-subtle)",
                borderRadius: "10px",
                background: "#F8FAFC",
                outline: "none",
              }}
            />
          </div>

          {activeTab === "admin" && (
            <>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.84rem",
                    fontWeight: "600",
                    color: "var(--text-main)",
                    marginBottom: "5px",
                  }}
                >
                  Shop Name <span style={{ color: "var(--text-dim)", fontWeight: "normal" }}>(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="ChaiFlow Tea Shop"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "11px 13px",
                    fontSize: "0.92rem",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "10px",
                    background: "#F8FAFC",
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.84rem",
                    fontWeight: "600",
                    color: "var(--text-main)",
                    marginBottom: "5px",
                  }}
                >
                  Admin Authorization Secret Key <span style={{ color: "#EF4444" }}>*</span>
                </label>
                <input
                  type="password"
                  placeholder="Enter secret authorization key"
                  value={adminSecret}
                  onChange={(e) => setAdminSecret(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "11px 13px",
                    fontSize: "0.92rem",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "10px",
                    background: "#FFFBEB",
                    outline: "none",
                  }}
                />
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                  🔒 Pre-configured security secret key to prevent unauthorized admin account creation.
                </span>
              </div>
            </>
          )}

          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.84rem",
                fontWeight: "600",
                color: "var(--text-main)",
                marginBottom: "5px",
              }}
            >
              Password (min. 6 characters) <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Choose a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                style={{
                  width: "100%",
                  padding: "11px 44px 11px 13px",
                  fontSize: "0.92rem",
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

          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.84rem",
                fontWeight: "600",
                color: "var(--text-main)",
                marginBottom: "5px",
              }}
            >
              Confirm Password <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Re-enter password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              style={{
                width: "100%",
                padding: "11px 13px",
                fontSize: "0.92rem",
                border: "1px solid var(--border-subtle)",
                borderRadius: "10px",
                background: "#F8FAFC",
                outline: "none",
              }}
            />
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
              marginTop: "8px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #0F766E 0%, #115E59 100%)",
              color: "#FFFFFF",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 4px 14px rgba(15, 118, 110, 0.25)",
              transition: "transform 0.1s ease",
            }}
          >
            {loading
              ? "Registering..."
              : activeTab === "admin"
              ? "Register as Admin →"
              : "Sign Up as Customer →"}
          </button>
        </form>

        {/* Existing User Link */}
        <div
          style={{
            marginTop: "24px",
            paddingTop: "20px",
            borderTop: "1px solid var(--border-subtle)",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", margin: "0 0 10px 0" }}>
            Already have an account?
          </p>
          <Link
            href="/login"
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
            }}
          >
            Sign In to Existing Account →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
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
          <div style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>Loading ChaiFlow Sign Up...</div>
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
