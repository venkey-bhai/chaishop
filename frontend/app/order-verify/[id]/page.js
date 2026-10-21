"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getOrderVerificationStatus,
  verifyOrderOtp,
  resendOrderOtp,
  cancelOrderVerification,
  getOrderById,
} from "../../../services/api";

function OrderVerificationContent() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id;

  const [loading, setLoading] = useState(true);
  const [orderDetails, setOrderDetails] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // OTP 6-box input state
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef([]);

  // Timers
  const [secondsRemaining, setSecondsRemaining] = useState(300);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState(5);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [verifiedSuccessOrder, setVerifiedSuccessOrder] = useState(null);

  // Load verification status on mount
  useEffect(() => {
    if (!orderId) return;
    loadStatus();
  }, [orderId]);

  async function loadStatus() {
    setLoading(true);
    setErrorMessage("");
    try {
      const [vStatus, oData] = await Promise.all([
        getOrderVerificationStatus(orderId).catch(() => null),
        getOrderById(orderId).catch(() => null),
      ]);

      if (oData) {
        setOrderDetails(oData);
        if (oData.order_status !== "PENDING_OTP_VERIFICATION") {
          // Already verified, cancelled, or expired
          setLoading(false);
          return;
        }
      }

      if (vStatus) {
        setChallenge(vStatus);
        setSecondsRemaining(vStatus.seconds_until_expiry || 300);
        setCooldownSeconds(vStatus.seconds_until_resend || 0);
        setAttemptsRemaining(vStatus.attempts_remaining ?? 5);
      }
    } catch (err) {
      setErrorMessage(err.message || "Failed to load order verification details.");
    } finally {
      setLoading(false);
    }
  }

  // Countdown timer effect
  useEffect(() => {
    if (loading || verifiedSuccessOrder) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
      setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [loading, verifiedSuccessOrder]);

  // Handle digit inputs
  function handleDigitChange(index, val) {
    const char = val.replace(/\D/g, "").slice(-1);
    const updated = [...digits];
    updated[index] = char;
    setDigits(updated);
    if (errorMessage) setErrorMessage("");

    // Auto-advance to next input
    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const updated = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) {
      updated[i] = pasted[i];
    }
    setDigits(updated);
    if (pasted.length === 6) {
      inputRefs.current[5]?.focus();
    } else {
      inputRefs.current[pasted.length]?.focus();
    }
  }

  function handleQuickFillDevOtp() {
    if (challenge?.dev_otp) {
      const chars = challenge.dev_otp.split("");
      setDigits(chars);
      inputRefs.current[5]?.focus();
    }
  }

  async function handleVerifySubmit(e) {
    if (e) e.preventDefault();
    const fullCode = digits.join("");
    if (fullCode.length !== 6) {
      setErrorMessage("Please enter all 6 digits of the OTP code.");
      return;
    }

    setIsVerifying(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const res = await verifyOrderOtp(orderId, fullCode);
      if (res.success && res.order) {
        setVerifiedSuccessOrder(res.order);
        setStatusMessage(res.message || "Order verified and confirmed successfully!");
      } else {
        setErrorMessage(res.message || "Verification failed. Please check the OTP.");
        if (typeof res.attempts_remaining === "number") {
          setAttemptsRemaining(res.attempts_remaining);
        }
      }
    } catch (err) {
      setErrorMessage(err.message || "Invalid OTP code or verification expired.");
      // Refresh status to update attempts
      try {
        const vStatus = await getOrderVerificationStatus(orderId);
        if (vStatus) {
          setChallenge(vStatus);
          setAttemptsRemaining(vStatus.attempts_remaining);
          setSecondsRemaining(vStatus.seconds_until_expiry);
        }
      } catch (e) {}
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    if (cooldownSeconds > 0 || isResending) return;
    setIsResending(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const res = await resendOrderOtp(orderId);
      setStatusMessage("A fresh 6-digit OTP has been sent to your mobile.");
      setCooldownSeconds(res.resend_available_after_seconds || 30);
      setSecondsRemaining(300);
      setAttemptsRemaining(5);
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();

      // Refresh challenge info
      const vStatus = await getOrderVerificationStatus(orderId);
      if (vStatus) setChallenge(vStatus);
    } catch (err) {
      setErrorMessage(err.message || "Could not resend OTP. Please wait a moment.");
    } finally {
      setIsResending(false);
    }
  }

  async function handleCancelOrder() {
    if (!window.confirm("Are you sure you want to cancel this order? Temporary stock reservation will be released.")) {
      return;
    }
    setIsCancelling(true);
    try {
      await cancelOrderVerification(orderId);
      router.push("/menu");
    } catch (err) {
      setErrorMessage(err.message || "Failed to cancel order.");
      setIsCancelling(false);
    }
  }

  // Format mm:ss
  function formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-main)", color: "var(--text-muted)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", marginBottom: "12px", animation: "spin 1s linear infinite" }}>⏳</div>
          <p style={{ fontWeight: "600" }}>Loading order verification...</p>
        </div>
      </div>
    );
  }

  // If order was already confirmed
  if (orderDetails && orderDetails.order_status !== "PENDING_OTP_VERIFICATION" && !verifiedSuccessOrder) {
    return (
      <div style={{ minHeight: "100vh", padding: "30px 16px", background: "var(--bg-main)", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div className="card" style={{ maxWidth: "460px", width: "100%", padding: "32px 24px", textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "8px" }}>
            {orderDetails.order_status === "CANCELLED" ? "❌" : "✅"}
          </div>
          <h2 style={{ fontSize: "1.4rem", fontWeight: "800", color: "var(--text-main)" }}>
            Order {orderDetails.order_status === "CANCELLED" ? "Cancelled" : "Already Confirmed"}
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: "6px", marginBottom: "20px" }}>
            Order #{orderDetails.order_number} is currently marked as{" "}
            <strong>{orderDetails.order_status}</strong>.
          </p>

          {orderDetails.order_status !== "CANCELLED" && (
            <div style={{ background: "var(--bg-card-subtle)", padding: "16px", borderRadius: "12px", marginBottom: "20px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "700" }}>
                Daily Pickup Token
              </div>
              <div style={{ fontSize: "2.4rem", fontWeight: "900", color: "var(--color-primary)", margin: "4px 0" }}>
                #{orderDetails.daily_token_number}
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Total: ₹{Number(orderDetails.total_amount).toFixed(2)} • {orderDetails.payment_method}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: "10px" }}>
            <Link href="/menu" style={{ flex: 1, textDecoration: "none" }}>
              <button className="btn-primary" style={{ width: "100%", padding: "12px" }}>
                Go to Menu
              </button>
            </Link>
            <Link href="/my-orders" style={{ flex: 1, textDecoration: "none" }}>
              <button className="btn-secondary" style={{ width: "100%", padding: "12px" }}>
                View My Orders
              </button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Successful verification view
  if (verifiedSuccessOrder) {
    return (
      <div style={{ minHeight: "100vh", padding: "30px 16px", background: "var(--bg-main)", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div className="card" style={{ maxWidth: "460px", width: "100%", padding: "36px 24px", textAlign: "center", border: "2px solid #10B981", boxShadow: "0 10px 25px rgba(16, 185, 129, 0.15)" }}>
          <div style={{ fontSize: "3.2rem", marginBottom: "8px" }}>🎉</div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "800", color: "#10B981" }}>
            Order Verified & Confirmed!
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: "4px", marginBottom: "22px" }}>
            Your OTP has been verified. Your order is queued in the kitchen!
          </p>

          <div style={{ background: "linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(15, 118, 110, 0.12))", padding: "20px", borderRadius: "16px", border: "1px dashed rgba(16, 185, 129, 0.35)", marginBottom: "24px" }}>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "700", color: "var(--text-muted)" }}>
              Daily Pickup Token Number
            </span>
            <div style={{ fontSize: "3rem", fontWeight: "900", color: "var(--color-primary)", margin: "6px 0" }}>
              #{verifiedSuccessOrder.daily_token_number}
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-main)", fontWeight: "600" }}>
              Order #{verifiedSuccessOrder.order_number}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Total: ₹{Number(verifiedSuccessOrder.total_amount).toFixed(2)} • {verifiedSuccessOrder.payment_method}
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <Link href="/menu" style={{ flex: 1, textDecoration: "none" }}>
              <button className="btn-primary" style={{ width: "100%", padding: "12px", fontWeight: "700" }}>
                Order More Items
              </button>
            </Link>
            <Link href="/my-orders" style={{ flex: 1, textDecoration: "none" }}>
              <button className="btn-secondary" style={{ width: "100%", padding: "12px", fontWeight: "600" }}>
                Track Order
              </button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Active OTP verification challenge screen
  return (
    <div style={{ minHeight: "100vh", padding: "40px 16px", background: "var(--bg-main)", display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
      <div className="card" style={{ maxWidth: "480px", width: "100%", padding: "32px 24px", boxShadow: "var(--shadow-dropdown)" }}>
        {/* Brand header */}
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "var(--color-primary-light)", padding: "6px 14px", borderRadius: "20px", marginBottom: "12px" }}>
            <span style={{ fontSize: "1.1rem" }}>🔒</span>
            <span style={{ fontSize: "0.78rem", fontWeight: "700", color: "var(--color-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Secure Order Verification
            </span>
          </div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: "800", color: "var(--text-main)" }}>
            Enter 6-Digit OTP Code
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: "6px" }}>
            We sent a verification code to{" "}
            <strong style={{ color: "var(--text-main)" }}>
              {challenge?.masked_phone || "your mobile number"}
            </strong>
          </p>
        </div>

        {/* Order Summary Pill */}
        {orderDetails && (
          <div style={{ background: "var(--bg-card-subtle)", borderRadius: "12px", padding: "12px 16px", marginBottom: "22px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem" }}>
            <div>
              <div style={{ fontWeight: "700", color: "var(--text-main)" }}>
                Order #{orderDetails.order_number}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                {orderDetails.items?.length || 0} items • {orderDetails.table_or_notes || "Counter"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "1.05rem", fontWeight: "800", color: "var(--color-primary)" }}>
                ₹{Number(orderDetails.total_amount).toFixed(2)}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                {orderDetails.payment_method}
              </div>
            </div>
          </div>
        )}

        {/* Dev Mock OTP helper badge (local testing) */}
        {challenge?.dev_otp && (
          <div
            onClick={handleQuickFillDevOtp}
            style={{
              background: "#FEF3C7",
              border: "1px dashed #D97706",
              borderRadius: "8px",
              padding: "10px 14px",
              color: "#92400E",
              fontSize: "0.82rem",
              fontWeight: "600",
              marginBottom: "20px",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>🧪 Demo Mock Code: <strong>{challenge.dev_otp}</strong></span>
            <span style={{ fontSize: "0.75rem", textDecoration: "underline" }}>Auto Fill ⚡</span>
          </div>
        )}

        {/* Status / Error Alerts */}
        {errorMessage && (
          <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", color: "var(--status-err)", padding: "10px 14px", borderRadius: "8px", fontSize: "0.85rem", fontWeight: "600", marginBottom: "18px" }}>
            ❌ {errorMessage}
          </div>
        )}

        {statusMessage && (
          <div style={{ background: "#DCFCE7", border: "1px solid #BBF7D0", color: "var(--status-success)", padding: "10px 14px", borderRadius: "8px", fontSize: "0.85rem", fontWeight: "600", marginBottom: "18px" }}>
            ✅ {statusMessage}
          </div>
        )}

        {/* OTP Input Boxes */}
        <form onSubmit={handleVerifySubmit}>
          <div
            style={{
              display: "flex",
              gap: "8px",
              justifyContent: "center",
              marginBottom: "20px",
            }}
            onPaste={handlePaste}
          >
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => (inputRefs.current[idx] = el)}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                disabled={isVerifying || secondsRemaining <= 0}
                style={{
                  width: "48px",
                  height: "56px",
                  fontSize: "1.5rem",
                  fontWeight: "800",
                  textAlign: "center",
                  borderRadius: "10px",
                  border: `2px solid ${digit ? "var(--color-primary)" : "var(--border-subtle)"}`,
                  background: "var(--bg-input)",
                  color: "var(--text-main)",
                  outline: "none",
                  transition: "border-color 0.15s ease",
                }}
              />
            ))}
          </div>

          {/* Expiry Countdown & Attempt Warning */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "22px" }}>
            <div>
              {secondsRemaining > 0 ? (
                <span>
                  ⏱️ Expires in: <strong style={{ color: secondsRemaining < 60 ? "var(--status-err)" : "var(--text-main)" }}>{formatTime(secondsRemaining)}</strong>
                </span>
              ) : (
                <span style={{ color: "var(--status-err)", fontWeight: "700" }}>
                  ⚠️ OTP Expired. Please request a new code.
                </span>
              )}
            </div>
            <div>
              <span style={{ color: attemptsRemaining <= 2 ? "var(--status-err)" : "var(--text-muted)" }}>
                {attemptsRemaining} attempts left
              </span>
            </div>
          </div>

          {/* Verify Primary CTA */}
          <button
            type="submit"
            disabled={isVerifying || digits.join("").length !== 6 || secondsRemaining <= 0}
            className="btn-primary"
            style={{
              width: "100%",
              padding: "14px",
              fontSize: "1rem",
              fontWeight: "700",
              borderRadius: "10px",
              marginBottom: "12px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "8px",
              cursor: (isVerifying || digits.join("").length !== 6 || secondsRemaining <= 0) ? "not-allowed" : "pointer",
              opacity: (digits.join("").length === 6 && secondsRemaining > 0) ? 1 : 0.65,
            }}
          >
            {isVerifying ? (
              <span>Verifying OTP...</span>
            ) : (
              <span>Confirm & Place Order →</span>
            )}
          </button>
        </form>

        {/* Resend OTP button */}
        <div style={{ textAlign: "center", marginBottom: "16px" }}>
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldownSeconds > 0 || isResending}
            style={{
              background: "none",
              border: "none",
              color: cooldownSeconds > 0 ? "var(--text-muted)" : "var(--color-primary)",
              fontWeight: "600",
              fontSize: "0.85rem",
              cursor: cooldownSeconds > 0 ? "not-allowed" : "pointer",
            }}
          >
            {isResending
              ? "Sending new OTP..."
              : cooldownSeconds > 0
              ? `Resend OTP in ${cooldownSeconds}s`
              : "Didn't receive code? Resend OTP"}
          </button>
        </div>

        {/* Return / Cancel Order Button */}
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "14px", textAlign: "center" }}>
          <button
            type="button"
            onClick={handleCancelOrder}
            disabled={isCancelling}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-dim)",
              fontSize: "0.82rem",
              fontWeight: "500",
              cursor: "pointer",
            }}
          >
            {isCancelling ? "Cancelling order..." : "← Cancel Order & Return to Menu"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrderVerificationPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-main)", color: "var(--text-muted)" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "2rem", marginBottom: "12px" }}>⏳</div>
            <p style={{ fontWeight: "600" }}>Loading order verification...</p>
          </div>
        </div>
      }
    >
      <OrderVerificationContent />
    </Suspense>
  );
}

