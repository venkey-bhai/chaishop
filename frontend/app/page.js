"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { 
  getHealthStatus, 
  testBackendConnection, 
  getSchemaSummary,
  registerCustomer,
  loginUser,
  getCurrentUser,
  checkAdminAccess,
  checkCustomerAccess,
  logoutUser,
  getCustomers,
  searchCustomers,
  createCustomer,
  updateCustomerCreditStatus,
  getMenuCatalog,
  toggleItemAvailability,
  getTodayTokens,
  getDailyTokenStats,
  updateOrderStatus,
  settleOrderPayment,
  recordCreditRepayment,
  getOrderUpiQr,
  getBillReceipt,
  getCounterShiftSummary,
  getPaymentsList,
  getExpenses,
  getExpenseCategories,
  getExpenseAnalytics,
  createExpense,
  deleteExpense,
  getDashboardSummary,
  getDailyReport,
  getMonthlyReport,
  getProductReport,
  getCreditReport,
  getSalesForecast,
} from "../services/api";

export default function Home() {
  const [healthData, setHealthData] = useState(null);
  const [schemaData, setSchemaData] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState(null);
  const [latency, setLatency] = useState(null);

  // Phase 3 Auth State
  const [authResponse, setAuthResponse] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [token, setToken] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem("chaiflow_token");
      const savedUserStr = localStorage.getItem("chaiflow_user");
      if (savedToken) {
        setToken(savedToken);
        if (savedUserStr) {
          setCurrentUser(JSON.parse(savedUserStr));
        }
      }
    } catch (e) {}
  }, []);

  async function handleDemoRegister() {
    setAuthLoading(true);
    setAuthResponse(null);
    try {
      const randomPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
      const res = await registerCustomer({
        mobile_number: randomPhone,
        name: "Demo Customer",
        password: "CustomerPass123!",
        email: `customer_${randomPhone.slice(-4)}@example.com`
      });
      setAuthResponse({ action: "Customer Registration", data: res });
      setToken(res.access_token);
      setCurrentUser(res.user);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("chaiflow_token", res.access_token);
          localStorage.setItem("chaiflow_user", JSON.stringify(res.user));
        } catch (e) {}
      }
    } catch (err) {
      setAuthResponse({ action: "Customer Registration", error: err.message });
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleAdminLogin() {
    setAuthLoading(true);
    setAuthResponse(null);
    try {
      const res = await loginUser({
        mobile_number: "9999999999",
        password: "admin123"
      });
      setAuthResponse({ action: "Admin Login", data: res });
      setToken(res.access_token);
      setCurrentUser(res.user);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("chaiflow_token", res.access_token);
          localStorage.setItem("chaiflow_user", JSON.stringify(res.user));
        } catch (e) {}
      }
    } catch (err) {
      setAuthResponse({ action: "Admin Login", error: err.message });
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleFetchProfile() {
    if (!token) {
      setAuthResponse({ action: "Get Profile", error: "No active token. Please login or register first." });
      return;
    }
    setAuthLoading(true);
    setAuthResponse(null);
    try {
      const res = await getCurrentUser(token);
      setAuthResponse({ action: "Get Profile (/api/auth/me)", data: res });
      setCurrentUser(res);
    } catch (err) {
      setAuthResponse({ action: "Get Profile (/api/auth/me)", error: err.message });
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleCheckAdminAccess() {
    if (!token) {
      setAuthResponse({ action: "Admin Role Guard Check", error: "No active token. Please login or register first." });
      return;
    }
    setAuthLoading(true);
    setAuthResponse(null);
    try {
      const res = await checkAdminAccess(token);
      setAuthResponse({ action: "Admin Role Guard (/api/auth/admin-check)", data: res });
    } catch (err) {
      setAuthResponse({ action: "Admin Role Guard (/api/auth/admin-check)", error: err.message });
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleCheckCustomerAccess() {
    if (!token) {
      setAuthResponse({ action: "Customer Role Guard Check", error: "No active token. Please login or register first." });
      return;
    }
    setAuthLoading(true);
    setAuthResponse(null);
    try {
      const res = await checkCustomerAccess(token);
      setAuthResponse({ action: "Customer Role Guard (/api/auth/customer-check)", data: res });
    } catch (err) {
      setAuthResponse({ action: "Customer Role Guard (/api/auth/customer-check)", error: err.message });
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    try {
      const res = await logoutUser();
      setAuthResponse({ action: "Logout", data: res });
    } catch (err) {
      setAuthResponse({ action: "Logout", error: err.message });
    }
    setToken("");
    setCurrentUser(null);
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("chaiflow_token");
        localStorage.removeItem("chaiflow_user");
      } catch (e) {}
    }
  }

  // Phase 4 Customer Management State
  const [customerData, setCustomerData] = useState(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerFilterCredit, setCustomerFilterCredit] = useState("");
  const [creditActionMsg, setCreditActionMsg] = useState("");

  const adminTokenPromiseRef = useRef(null);

  async function getValidAdminToken() {
    if (token && currentUser?.role === "ADMIN") {
      return token;
    }

    // Check localStorage first
    if (typeof window !== "undefined") {
      try {
        const savedToken = localStorage.getItem("chaiflow_token");
        const savedUserStr = localStorage.getItem("chaiflow_user");
        if (savedToken && savedUserStr) {
          const parsedUser = JSON.parse(savedUserStr);
          if (parsedUser?.role === "ADMIN") {
            setToken(savedToken);
            setCurrentUser(parsedUser);
            return savedToken;
          }
        }
      } catch (e) {}
    }

    // Deduplicate concurrent in-flight admin login calls
    if (adminTokenPromiseRef.current) {
      return adminTokenPromiseRef.current;
    }

    adminTokenPromiseRef.current = (async () => {
      try {
        const loginRes = await loginUser({ mobile_number: "9999999999", password: "admin123" });
        if (loginRes?.access_token) {
          setToken(loginRes.access_token);
          setCurrentUser(loginRes.user);
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem("chaiflow_token", loginRes.access_token);
              localStorage.setItem("chaiflow_user", JSON.stringify(loginRes.user));
            } catch (e) {}
          }
          return loginRes.access_token;
        }
        return null;
      } catch (err) {
        console.warn("Auto-admin login not completed:", err.message);
        return null;
      } finally {
        adminTokenPromiseRef.current = null;
      }
    })();

    return adminTokenPromiseRef.current;
  }

  async function loadCustomerDirectory(overrideSearch = customerSearch, overrideFilter = customerFilterCredit) {
    setCustomerLoading(true);
    setCreditActionMsg("");
    try {
      const activeToken = await getValidAdminToken();
      if (!activeToken) {
        setCreditActionMsg("Admin session required to load customer directory.");
        return;
      }
      const res = await getCustomers(
        {
          search: overrideSearch,
          is_credit_eligible: overrideFilter === "" ? null : overrideFilter === "true",
          page: 1,
          limit: 20
        },
        activeToken
      );
      setCustomerData(res);
    } catch (err) {
      setCreditActionMsg(`Error: ${err.message}`);
    } finally {
      setCustomerLoading(false);
    }
  }

  async function handleToggleCredit(customer) {
    setCustomerLoading(true);
    setCreditActionMsg("");
    try {
      const activeToken = await getValidAdminToken();
      const newStatus = !customer.is_credit_eligible;
      const newLimit = newStatus ? (Number(customer.credit_limit) > 0 ? customer.credit_limit : 500) : 0;
      await updateCustomerCreditStatus(customer.id, { is_credit_eligible: newStatus, credit_limit: newLimit }, activeToken);
      setCreditActionMsg(`Rule 61 Applied: Credit for ${customer.name} is now ${newStatus ? `ENABLED (₹${newLimit})` : "DISABLED"}`);
      await loadCustomerDirectory();
    } catch (err) {
      setCreditActionMsg(`Rule 61 Action Failed: ${err.message}`);
    } finally {
      setCustomerLoading(false);
    }
  }

  // Phase 5 Menu Catalog State

  const [catalog, setCatalog] = useState(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedCatId, setSelectedCatId] = useState("all");
  const [menuActionMsg, setMenuActionMsg] = useState("");

  async function loadMenuCatalog() {
    setCatalogLoading(true);
    setMenuActionMsg("");
    try {
      const data = await getMenuCatalog();
      setCatalog(data);
    } catch (err) {
      setMenuActionMsg(`Failed to load menu catalog: ${err.message}`);
    } finally {
      setCatalogLoading(false);
    }
  }

  async function handleToggleItemAvailability(item) {
    setMenuActionMsg("");
    try {
      const activeToken = await getValidAdminToken();
      const updated = await toggleItemAvailability(item.id, !item.is_available, activeToken);
      setMenuActionMsg(`Updated ${item.name}: Now ${updated.is_available ? "AVAILABLE" : "OUT OF STOCK"}`);
      await loadMenuCatalog();
    } catch (err) {
      setMenuActionMsg(`Failed to toggle availability: ${err.message}`);
    }
  }

  // Phase 7 Orders & Daily Token State
  const [tokensData, setTokensData] = useState(null);
  const [tokenStats, setTokenStats] = useState(null);
  const [kdsLoading, setKdsLoading] = useState(false);
  const [kdsActionMsg, setKdsActionMsg] = useState("");
  const [kdsFilter, setKdsFilter] = useState("all");

  async function loadTokensQueue() {
    setKdsLoading(true);
    setKdsActionMsg("");
    try {
      const [queue, stats] = await Promise.all([
        getTodayTokens(),
        getDailyTokenStats().catch(() => null)
      ]);
      setTokensData(queue);
      setTokenStats(stats);
    } catch (err) {
      setKdsActionMsg(`Failed to load token queue: ${err.message}`);
    } finally {
      setKdsLoading(false);
    }
  }

  async function handleUpdateOrderStatus(orderId, nextStatus) {
    setKdsActionMsg("");
    try {
      const activeToken = await getValidAdminToken();
      const updated = await updateOrderStatus(orderId, nextStatus, activeToken);
      setKdsActionMsg(`Updated Token #${updated.daily_token_number}: Status is now ${updated.order_status}`);
      await loadTokensQueue();
    } catch (err) {
      setKdsActionMsg(`Status update failed: ${err.message}`);
    }
  }

  // Phase 8 Payments & Billing State
  const [shiftSummary, setShiftSummary] = useState(null);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [billingActionMsg, setBillingActionMsg] = useState("");
  const [activeCashSettle, setActiveCashSettle] = useState(null);
  const [cashTendered, setCashTendered] = useState("");
  const [activeUpiQr, setActiveUpiQr] = useState(null);
  const [upiUtrInput, setUpiUtrInput] = useState("");
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [repayCustomerId, setRepayCustomerId] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [repayMethod, setRepayMethod] = useState("CASH");

  async function loadBillingSummary() {
    setShiftLoading(true);
    try {
      const summary = await getCounterShiftSummary();
      setShiftSummary(summary);
    } catch (err) {
      console.error("Failed to load shift summary:", err);
    } finally {
      setShiftLoading(false);
    }
  }

  async function handleSettleCashSubmit() {
    if (!activeCashSettle) return;
    setBillingActionMsg("");
    try {
      const activeToken = await getValidAdminToken();
      const tendered = cashTendered ? Number(cashTendered) : Number(activeCashSettle.total_amount);
      const res = await settleOrderPayment({
        order_id: activeCashSettle.order_id,
        payment_method: "CASH",
        amount_received: tendered,
        notes: "Counter cash tender"
      }, activeToken);
      setBillingActionMsg(`Settled Token #${res.daily_token_number}: Cash ₹${res.amount_received} tendered (Change: ₹${res.change_returned})`);
      setActiveCashSettle(null);
      setCashTendered("");
      await Promise.all([loadTokensQueue(), loadBillingSummary()]);
    } catch (err) {
      setBillingActionMsg(`Cash settlement failed: ${err.message}`);
    }
  }

  async function handleOpenUpiModal(orderId) {
    setBillingActionMsg("");
    try {
      const qrData = await getOrderUpiQr(orderId);
      // Fallback: If backend did not provide qr_image_data, generate it client-side
      if (!qrData.qr_image_data && qrData.upi_uri) {
        try {
          const QRCode = (await import("qrcode")).default || (await import("qrcode"));
          qrData.qr_image_data = await QRCode.toDataURL(qrData.upi_uri, {
            width: 260,
            margin: 1,
            color: { dark: "#0f172a", light: "#ffffff" },
          });
        } catch (qrErr) {
          console.warn("Client QR fallback error:", qrErr);
          qrData.qr_image_data = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData.upi_uri)}`;
        }
      }
      setActiveUpiQr(qrData);
      setUpiUtrInput("");
    } catch (err) {
      setBillingActionMsg(`Failed to generate UPI QR: ${err.message}`);
    }
  }

  async function handleConfirmUpiPayment() {
    if (!activeUpiQr) return;
    setBillingActionMsg("");
    try {
      const activeToken = await getValidAdminToken();
      const res = await settleOrderPayment({
        order_id: activeUpiQr.order_id,
        payment_method: "UPI",
        transaction_reference: upiUtrInput || `UPI-${Date.now().toString().slice(-6)}`,
        notes: "Counter UPI scan"
      }, activeToken);
      setBillingActionMsg(`Settled Token #${res.daily_token_number} via UPI (Ref: ${res.transaction_reference})`);
      setActiveUpiQr(null);
      setUpiUtrInput("");
      await Promise.all([loadTokensQueue(), loadBillingSummary()]);
    } catch (err) {
      setBillingActionMsg(`UPI settlement failed: ${err.message}`);
    }
  }

  async function handleOpenReceiptModal(orderId) {
    setBillingActionMsg("");
    try {
      const receiptData = await getBillReceipt(orderId);
      setActiveReceipt(receiptData);
    } catch (err) {
      setBillingActionMsg(`Failed to load receipt: ${err.message}`);
    }
  }

  async function handleRecordRepaymentSubmit() {
    if (!repayCustomerId || !repayAmount) {
      setBillingActionMsg("Please enter both Customer ID and Repayment Amount.");
      return;
    }
    setBillingActionMsg("");
    try {
      const activeToken = await getValidAdminToken();
      const res = await recordCreditRepayment({
        customer_id: Number(repayCustomerId),
        amount: Number(repayAmount),
        payment_method: repayMethod,
        description: "Counter credit tab repayment"
      }, activeToken);
      setBillingActionMsg(`Repayment of ₹${res.amount_paid} recorded for ${res.customer_name}! Remaining debt: ₹${res.new_balance}`);
      setRepayCustomerId("");
      setRepayAmount("");
      await Promise.all([loadBillingSummary(), loadCustomerDirectory()]);
    } catch (err) {
      setBillingActionMsg(`Repayment failed: ${err.message}`);
    }
  }

  // Phase 9 Expenses & Operating Cost State
  const [expensesData, setExpensesData] = useState([]);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [expenseTotalAmount, setExpenseTotalAmount] = useState(0);
  const [expenseAnalytics, setExpenseAnalytics] = useState(null);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [expenseActionMsg, setExpenseActionMsg] = useState("");
  const [expenseFilterCat, setExpenseFilterCat] = useState("all");
  const [expenseFilterToday, setExpenseFilterToday] = useState(false);
  const [expenseSearch, setExpenseSearch] = useState("");
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  // Form fields
  const [newExpenseCat, setNewExpenseCat] = useState("Milk");
  const [customCatInput, setCustomCatInput] = useState("");
  const [newExpenseDesc, setNewExpenseDesc] = useState("");
  const [newExpenseAmt, setNewExpenseAmt] = useState("");
  const [newExpenseMethod, setNewExpenseMethod] = useState("CASH");
  const [newExpenseDate, setNewExpenseDate] = useState("");

  async function loadExpenseData(overrideCat = null, overrideToday = null, overrideSearch = null) {
    setExpenseLoading(true);
    try {
      const activeToken = await getValidAdminToken();
      if (!activeToken) {
        setExpenseActionMsg("Admin session required to load expenses.");
        return;
      }
      const catVal = overrideCat !== null ? overrideCat : expenseFilterCat;
      const todayVal = overrideToday !== null ? overrideToday : expenseFilterToday;
      const searchVal = overrideSearch !== null ? overrideSearch : expenseSearch;

      const [listRes, analyticsRes, catsRes] = await Promise.all([
        getExpenses({
          page: 1,
          limit: 50,
          category: catVal !== "all" ? catVal : "",
          today_only: todayVal,
          search: searchVal
        }, activeToken),
        getExpenseAnalytics(activeToken).catch(() => null),
        getExpenseCategories(activeToken).catch(() => []),
      ]);

      setExpensesData(listRes?.items || []);
      setExpenseTotal(listRes?.total || 0);
      setExpenseTotalAmount(listRes?.total_amount || 0);
      setExpenseAnalytics(analyticsRes);
      setExpenseCategories(catsRes || []);
    } catch (err) {
      console.warn("Expense data load notice:", err.message);
      setExpenseActionMsg(`Expenses unavailable: ${err.message}`);
    } finally {
      setExpenseLoading(false);
    }
  }

  async function handleCreateExpenseSubmit(e) {
    if (e) e.preventDefault();
    if (!newExpenseAmt || Number(newExpenseAmt) <= 0) {
      setExpenseActionMsg("Please enter a valid amount greater than ₹0.");
      return;
    }
    if (!newExpenseDesc.trim()) {
      setExpenseActionMsg("Please enter an expense description or vendor details.");
      return;
    }

    setExpenseActionMsg("");
    try {
      const activeToken = await getValidAdminToken();
      const catToUse = newExpenseCat === "Custom" ? customCatInput.trim() : newExpenseCat;
      if (!catToUse) {
        setExpenseActionMsg("Please enter a valid category name.");
        return;
      }

      await createExpense({
        category: catToUse,
        description: newExpenseDesc.trim(),
        amount: Number(newExpenseAmt),
        payment_method: newExpenseMethod,
        expense_date: newExpenseDate || undefined
      }, activeToken);

      setExpenseActionMsg(`Recorded expense: ₹${newExpenseAmt} for ${catToUse}!`);
      setShowExpenseModal(false);
      setNewExpenseDesc("");
      setNewExpenseAmt("");
      setCustomCatInput("");
      setNewExpenseDate("");
      await loadExpenseData();
    } catch (err) {
      setExpenseActionMsg(`Failed to record expense: ${err.message}`);
    }
  }

  async function handleDeleteExpense(expenseId, categoryName, amount) {
    if (!window.confirm(`Delete expense record #${expenseId} (${categoryName} ₹${amount})?`)) {
      return;
    }
    setExpenseActionMsg("");
    try {
      const activeToken = await getValidAdminToken();
      await deleteExpense(expenseId, activeToken);
      setExpenseActionMsg(`Deleted expense #${expenseId} successfully.`);
      await loadExpenseData();
    } catch (err) {
      setExpenseActionMsg(`Failed to delete expense: ${err.message}`);
    }
  }

  // Phase 10 Financial Analytics, P&L Reports & AI Forecasting State
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [dailyReport, setDailyReport] = useState(null);
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [productReport, setProductReport] = useState(null);
  const [creditReport, setCreditReport] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [analyticsTab, setAnalyticsTab] = useState("daily");
  const [selectedReportDate, setSelectedReportDate] = useState("");
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");

  async function loadAnalyticsData(tab = analyticsTab, customDate = selectedReportDate) {
    setAnalyticsLoading(true);
    setAnalyticsError("");
    try {
      const activeToken = await getValidAdminToken();
      if (!activeToken) {
        setAnalyticsError("Analytics requires an active Admin session or running backend connection.");
        return;
      }
      // Always load dashboard summary
      const summary = await getDashboardSummary(activeToken);
      setDashboardSummary(summary);

      if (tab === "daily") {
        const daily = await getDailyReport(customDate || null, activeToken);
        setDailyReport(daily);
      } else if (tab === "products") {
        const products = await getProductReport(activeToken);
        setProductReport(products);
      } else if (tab === "credit") {
        const credit = await getCreditReport(activeToken);
        setCreditReport(credit);
      } else if (tab === "forecast") {
        const forecast = await getSalesForecast(activeToken);
        setForecastData(forecast);
      } else if (tab === "monthly") {
        const monthly = await getMonthlyReport(null, null, activeToken);
        setMonthlyReport(monthly);
      }
    } catch (err) {
      console.warn("Analytics data load notice:", err.message);
      setAnalyticsError(`Analytics unavailable: ${err.message}`);
    } finally {
      setAnalyticsLoading(false);
    }
  }

  function handleSelectAnalyticsTab(tab) {
    setAnalyticsTab(tab);
    loadAnalyticsData(tab, selectedReportDate);
  }

  useEffect(() => {
    loadSystemDiagnostics();
    loadMenuCatalog();
    loadTokensQueue();
    loadBillingSummary();
    loadExpenseData();
    loadAnalyticsData("daily");
  }, []);


  async function loadSystemDiagnostics() {
    setLoading(true);
    setError(null);
    const start = performance.now();
    try {
      const [health, schema] = await Promise.all([
        getHealthStatus(),
        getSchemaSummary().catch(() => null)
      ]);
      const end = performance.now();
      setLatency(Math.round(end - start));
      setHealthData(health);
      setSchemaData(schema);
    } catch (err) {
      setError(err.message || "Failed to reach backend API");
    } finally {
      setLoading(false);
    }
  }

  async function handleTestClick() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testBackendConnection();
      setTestResult(result);
    } catch (err) {
      setTestResult({ error: err.message || "Failed to call test endpoint" });
    } finally {
      setTesting(false);
    }
  }

  const tableDescriptions = {
    users: { icon: "👤", desc: "User credentials & role authorization (Admin, Staff, Customer)" },
    customers: { icon: "👥", desc: "Customer profiles with Rule 61 credit eligibility status" },
    menu_categories: { icon: "🏷️", desc: "Categories (Tea, Coffee, Snacks, Juices)" },
    menu_items: { icon: "☕", desc: "Products with Sugar/Strength options & daily stock limits" },
    orders: { icon: "📋", desc: "Orders with daily token pickup numbers & status lifecycle" },
    order_items: { icon: "🧾", desc: "Line items with purchase price snapshot & selected options" },
    payments: { icon: "💵", desc: "Payment transactions (Cash, UPI, Card, Credit)" },
    credit_accounts: { icon: "💳", desc: "Customer credit balances & admin-approved limits" },
    credit_transactions: { icon: "📜", desc: "Immutable audit ledger of all credit & repayments" },
    expenses: { icon: "📉", desc: "Daily tea shop operating expenses & inventory purchases" },
    alembic_version: { icon: "🔄", desc: "Alembic database schema migration tracking" },
  };

  return (
    <main style={{ minHeight: "100vh", padding: "40px 20px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Multi-Page Portal Switcher Banner */}
      <div
        className="card"
        style={{
          padding: "16px 20px",
          marginBottom: "30px",
          background: "linear-gradient(135deg, #0F766E, #115E59)",
          color: "#FFFFFF",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "14px",
          borderRadius: "12px",
          boxShadow: "0 4px 12px rgba(15, 118, 110, 0.2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "1.4rem" }}>✨</span>
          <div>
            <div style={{ fontWeight: "700", fontSize: "0.95rem" }}>
              Dedicated Multi-Page Admin Panel Now Live!
            </div>
            <div style={{ fontSize: "0.8rem", opacity: 0.9 }}>
              Left-side persistent sidebar, dedicated routes for Customers, Menu, Orders, Billing, Credit, and Analytics.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link
            href="/admin/dashboard"
            style={{
              background: "#FFFFFF",
              color: "#0F766E",
              fontWeight: "700",
              padding: "8px 16px",
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "0.85rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
            }}
          >
            📊 Open Admin Portal →
          </Link>
          <Link
            href="/menu"
            target="_blank"
            style={{
              background: "rgba(255, 255, 255, 0.15)",
              color: "#FFFFFF",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              fontWeight: "600",
              padding: "8px 14px",
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "0.85rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            📱 Customer QR Menu
          </Link>
        </div>
      </div>

      {/* Header */}
      <header style={{ marginBottom: "40px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{
            fontSize: "2.4rem",
            background: "linear-gradient(135deg, #f59e0b, #d97706)",
            width: "56px",
            height: "56px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "14px",
            boxShadow: "0 8px 24px rgba(245, 158, 11, 0.35)"
          }}>
            ☕
          </div>
          <div>
            <h1 style={{ fontSize: "1.9rem", fontWeight: "700", letterSpacing: "-0.5px" }}>
              ChaiFlow <span style={{ color: "#10b981", fontSize: "0.95rem", fontWeight: "600", padding: "3px 10px", background: "rgba(16, 185, 129, 0.15)", borderRadius: "6px", marginLeft: "8px", verticalAlign: "middle" }}>Phase 10 Operational (Financial Analytics, P&L & AI Forecasting Active)</span>
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", marginTop: "4px" }}>
              Tea Shop Management, QR Ordering, Customer Credit & Financial Analytics System
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span className={`pulse-dot ${healthData?.status === "healthy" ? "online" : "offline"}`}></span>
          <span style={{ fontSize: "0.9rem", color: healthData?.status === "healthy" ? "#10b981" : "#ef4444", fontWeight: "600" }}>
            {loading ? "Checking database..." : healthData?.status === "healthy" ? "PostgreSQL & FastAPI Online" : "System Degraded"}
          </span>
          <button 
            onClick={loadSystemDiagnostics}
            disabled={loading}
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-main)",
              padding: "6px 14px",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.85rem"
            }}
          >
            {loading ? "Refreshing..." : "↻ Refresh"}
          </button>
        </div>
      </header>

      {/* 3 Pillars / Status Cards */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px", marginBottom: "35px" }}>
        {/* Next.js Frontend */}
        <div className="glass-panel" style={{ padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
            <span style={{ fontSize: "1.8rem" }}>⚡</span>
            <span style={{ fontSize: "0.75rem", background: "rgba(16, 185, 129, 0.15)", color: "#10b981", padding: "4px 10px", borderRadius: "12px", fontWeight: "600" }}>
              RUNNING (PORT 3000)
            </span>
          </div>
          <h2 style={{ fontSize: "1.15rem", fontWeight: "600", marginBottom: "6px" }}>Next.js Frontend</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "16px" }}>
            App Router, React 19, Modern Design Tokens
          </p>
          <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
            Roundtrip latency: <strong style={{ color: "#10b981" }}>{latency !== null ? `${latency} ms` : "..."}</strong>
          </div>
        </div>

        {/* FastAPI Backend */}
        <div className="glass-panel" style={{ padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
            <span style={{ fontSize: "1.8rem" }}>🚀</span>
            <span style={{
              fontSize: "0.75rem",
              background: healthData?.status === "healthy" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
              color: healthData?.status === "healthy" ? "#10b981" : "#ef4444",
              padding: "4px 10px",
              borderRadius: "12px",
              fontWeight: "600"
            }}>
              CONNECTED (PORT 8000)
            </span>
          </div>
          <h2 style={{ fontSize: "1.15rem", fontWeight: "600", marginBottom: "6px" }}>FastAPI Backend</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "16px" }}>
            SQLAlchemy 2.0 ORM & Alembic Migrations
          </p>
          <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
            API Documentation: <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer" style={{ color: "#60a5fa", textDecoration: "underline" }}>Swagger UI</a>
          </div>
        </div>

        {/* PostgreSQL Database */}
        <div className="glass-panel" style={{ padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
            <span style={{ fontSize: "1.8rem" }}>🐘</span>
            <span style={{
              fontSize: "0.75rem",
              background: "rgba(16, 185, 129, 0.15)",
              color: "#10b981",
              padding: "4px 10px",
              borderRadius: "12px",
              fontWeight: "600"
            }}>
              MIGRATED (11 TABLES)
            </span>
          </div>
          <h2 style={{ fontSize: "1.15rem", fontWeight: "600", marginBottom: "6px" }}>PostgreSQL 18</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "16px" }}>
            Database: <strong style={{ color: "#f59e0b" }}>{healthData?.database?.database || "teashop_db"}</strong>
          </p>
          <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
            Engine: <code>psycopg 3 / Connection Pooling</code>
          </div>
        </div>
      </section>

      {/* Phase 2: Database Schema Explorer */}
      <section className="glass-panel" style={{ padding: "30px", marginBottom: "35px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h2 style={{ fontSize: "1.3rem", fontWeight: "600", display: "flex", alignItems: "center", gap: "10px" }}>
              Phase 2: Database Schema & Relational Models
              <span style={{ fontSize: "0.8rem", background: "rgba(245, 158, 11, 0.2)", color: "#f59e0b", padding: "2px 8px", borderRadius: "10px" }}>
                Alembic Version Up-to-Date
              </span>
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "4px" }}>
              All 10 core business tables and 1 migration table are created and verified in PostgreSQL.
            </p>
          </div>
          <button 
            className="btn-primary" 
            onClick={handleTestClick}
            disabled={testing}
          >
            {testing ? "Sending..." : "📡 Test Roundtrip API"}
          </button>
        </div>

        {/* Database Tables Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px", marginBottom: "24px" }}>
          {schemaData?.tables?.map((table) => {
            const info = tableDescriptions[table] || { icon: "🗄️", desc: "PostgreSQL Database Table" };
            return (
              <div 
                key={table}
                style={{
                  background: "rgba(255, 255, 255, 0.025)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "12px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "1.2rem" }}>{info.icon}</span>
                  <code style={{ fontSize: "0.85rem", color: "#f59e0b", fontWeight: "600" }}>{table}</code>
                </div>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>
                  {info.desc}
                </p>
              </div>
            );
          })}
        </div>

        {/* Special Rules & Features Badges */}
        <div style={{
          background: "rgba(0, 0, 0, 0.4)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "12px",
          padding: "18px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "14px"
        }}>
          <div>
            <div style={{ fontSize: "0.8rem", color: "#f59e0b", fontWeight: "600", textTransform: "uppercase" }}>Rule 61 Verified</div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-main)", marginTop: "4px" }}>
              Admin-Only Credit Approval & Limit Controls
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.8rem", color: "#f59e0b", fontWeight: "600", textTransform: "uppercase" }}>Tea Customizations</div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-main)", marginTop: "4px" }}>
              Sugar Levels & Tea Strength (Kadak / Light)
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.8rem", color: "#f59e0b", fontWeight: "600", textTransform: "uppercase" }}>Stock Protection</div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-main)", marginTop: "4px" }}>
              Daily Stock Limits & Automatic Order Deduction
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.8rem", color: "#f59e0b", fontWeight: "600", textTransform: "uppercase" }}>Counter Tokens</div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-main)", marginTop: "4px" }}>
              Daily Token Numbers (#1, #2...) for Fast Pickup
            </div>
          </div>
        </div>

        {testResult && (
          <div style={{ marginTop: "20px" }}>
            <h3 style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "8px" }}>Live API Response:</h3>
            <pre className="code-block">{JSON.stringify(testResult, null, 2)}</pre>
          </div>
        )}
      </section>

      {/* Phase 3: Live Authentication & RBAC Playground */}
      <section className="glass-panel" style={{ padding: "30px", marginBottom: "35px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🔐</span> Phase 3: Live Authentication & RBAC Engine
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: "4px" }}>
              Test registration, JWT token generation, admin/customer roles, and protected route guards in real-time.
            </p>
          </div>
          {token && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{
                background: currentUser?.role === "ADMIN" ? "rgba(239, 68, 68, 0.2)" : "rgba(16, 185, 129, 0.2)",
                color: currentUser?.role === "ADMIN" ? "#ef4444" : "#10b981",
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "0.8rem",
                fontWeight: "700"
              }}>
                ● {currentUser?.role || "AUTHENTICATED"}
              </span>
              <button
                onClick={handleLogout}
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "#ef4444",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  fontWeight: "600"
                }}
              >
                Logout
              </button>
            </div>
          )}
        </div>

        {/* Current Session Summary if authenticated */}
        {currentUser && (
          <div style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "10px",
            padding: "16px",
            marginBottom: "20px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "12px"
          }}>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Active User</div>
              <div style={{ fontSize: "0.95rem", fontWeight: "600", color: "#f59e0b" }}>{currentUser.name}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Mobile Number</div>
              <div style={{ fontSize: "0.95rem", fontWeight: "500" }}>{currentUser.mobile_number}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>System Role</div>
              <div style={{ fontSize: "0.95rem", fontWeight: "600", color: currentUser.role === "ADMIN" ? "#ef4444" : "#10b981" }}>{currentUser.role}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Credit Status</div>
              <div style={{ fontSize: "0.95rem", fontWeight: "500" }}>
                {currentUser.is_credit_eligible ? `Eligible (₹${currentUser.credit_limit || 0})` : "Standard (Prepaid Only)"}
              </div>
            </div>
          </div>
        )}

        {/* Action Button Toolbar */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
          <Link
            href="/login"
            style={{
              background: "linear-gradient(135deg, #0F766E, #115E59)",
              color: "#fff",
              textDecoration: "none",
              padding: "9px 16px",
              borderRadius: "8px",
              fontWeight: "600",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>🔐</span> Go to Sign In Page
          </Link>

          <Link
            href="/signup"
            style={{
              background: "linear-gradient(135deg, #10b981, #059669)",
              color: "#fff",
              textDecoration: "none",
              padding: "9px 16px",
              borderRadius: "8px",
              fontWeight: "600",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>📝</span> Create Account / Sign Up
          </Link>

          <button
            onClick={handleFetchProfile}
            disabled={authLoading || !token}
            style={{
              background: token ? "rgba(59, 130, 246, 0.2)" : "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(59, 130, 246, 0.4)",
              color: token ? "#60a5fa" : "var(--text-muted)",
              padding: "9px 16px",
              borderRadius: "8px",
              cursor: token ? "pointer" : "not-allowed",
              fontWeight: "600",
              fontSize: "0.85rem"
            }}
          >
            Fetch /api/auth/me
          </button>

          <button
            onClick={handleCheckAdminAccess}
            disabled={authLoading || !token}
            style={{
              background: token ? "rgba(239, 68, 68, 0.15)" : "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: token ? "#ef4444" : "var(--text-muted)",
              padding: "9px 16px",
              borderRadius: "8px",
              cursor: token ? "pointer" : "not-allowed",
              fontWeight: "600",
              fontSize: "0.85rem"
            }}
          >
            Guard: Check Admin Route
          </button>

          <button
            onClick={handleCheckCustomerAccess}
            disabled={authLoading || !token}
            style={{
              background: token ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              color: token ? "#10b981" : "var(--text-muted)",
              padding: "9px 16px",
              borderRadius: "8px",
              cursor: token ? "pointer" : "not-allowed",
              fontWeight: "600",
              fontSize: "0.85rem"
            }}
          >
            Guard: Check Customer Route
          </button>
        </div>

        {/* Real-time Auth Output */}
        {authLoading && (
          <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontStyle: "italic", marginBottom: "12px" }}>
            Executing authentication request...
          </div>
        )}

        {authResponse && (
          <div style={{ marginTop: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: "600", color: authResponse.error ? "#ef4444" : "#10b981" }}>
                {authResponse.action} — {authResponse.error ? "REJECTED (Expected Guard / Error)" : "SUCCESS (200 OK)"}
              </span>
            </div>
            <pre className="code-block" style={{ maxHeight: "250px", overflowY: "auto" }}>
              {JSON.stringify(authResponse, null, 2)}
            </pre>
          </div>
        )}
      </section>

      {/* Phase 4: Customer Directory & Rule 61 Administration Hub */}
      <section className="glass-panel" style={{ padding: "30px", marginBottom: "35px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>👥</span> Phase 4: Customer Management & Credit Control (Rule 61)
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: "4px" }}>
              Search customer records, view khata balances, and enforce Rule 61 (Admin-only credit eligibility approval & limit adjustments).
            </p>
          </div>
          <button
            onClick={() => loadCustomerDirectory()}
            disabled={customerLoading}
            style={{
              background: "linear-gradient(135deg, #10b981, #059669)",
              color: "#fff",
              border: "none",
              padding: "9px 18px",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <span>🔄</span> {customerLoading ? "Loading..." : "Load Customers"}
          </button>
        </div>

        {/* Search and Filters Toolbar */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Search by name, phone, or email..."
            value={customerSearch}
            onChange={(e) => {
              setCustomerSearch(e.target.value);
              loadCustomerDirectory(e.target.value, customerFilterCredit);
            }}
            style={{
              flex: "1",
              minWidth: "240px",
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "8px",
              padding: "9px 14px",
              color: "var(--text-main)",
              fontSize: "0.88rem"
            }}
          />

          <select
            value={customerFilterCredit}
            onChange={(e) => {
              setCustomerFilterCredit(e.target.value);
              loadCustomerDirectory(customerSearch, e.target.value);
            }}
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "8px",
              padding: "9px 14px",
              color: "var(--text-main)",
              fontSize: "0.88rem",
              cursor: "pointer"
            }}
          >
            <option value="" >All Customers</option>
            <option value="true" >Credit Approved Only</option>
            <option value="false" >Prepaid Only</option>
          </select>
        </div>

        {creditActionMsg && (
          <div style={{
            padding: "10px 14px",
            background: "rgba(16, 185, 129, 0.15)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            borderRadius: "8px",
            color: "#10b981",
            fontSize: "0.85rem",
            fontWeight: "600",
            marginBottom: "16px"
          }}>
            {creditActionMsg}
          </div>
        )}

        {/* Customer Table */}
        {customerData?.items && customerData.items.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-muted)", textAlign: "left" }}>
                  <th style={{ padding: "10px" }}>Customer</th>
                  <th style={{ padding: "10px" }}>Phone</th>
                  <th style={{ padding: "10px" }}>Rule 61 Status</th>
                  <th style={{ padding: "10px" }}>Credit Limit</th>
                  <th style={{ padding: "10px" }}>Khata Balance</th>
                  <th style={{ padding: "10px" }}>Available Credit</th>
                  <th style={{ padding: "10px", textAlign: "right" }}>Admin Actions</th>
                </tr>
              </thead>
              <tbody>
                {customerData.items.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                    <td style={{ padding: "12px 10px" }}>
                      <div style={{ fontWeight: "600", color: "#f59e0b" }}>{c.name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>ID: #{c.id}</div>
                    </td>
                    <td style={{ padding: "12px 10px" }}>{c.phone}</td>
                    <td style={{ padding: "12px 10px" }}>
                      <span style={{
                        padding: "3px 8px",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: "700",
                        background: c.is_credit_eligible ? "rgba(16, 185, 129, 0.2)" : "rgba(107, 114, 128, 0.2)",
                        color: c.is_credit_eligible ? "#10b981" : "#9ca3af"
                      }}>
                        {c.is_credit_eligible ? "APPROVED" : "PREPAID ONLY"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 10px", fontWeight: "600" }}>₹{c.credit_limit}</td>
                    <td style={{ padding: "12px 10px", color: Number(c.current_balance) > 0 ? "#ef4444" : "var(--text-muted)" }}>
                      ₹{c.current_balance}
                    </td>
                    <td style={{ padding: "12px 10px", color: "#10b981", fontWeight: "600" }}>₹{c.available_credit}</td>
                    <td style={{ padding: "12px 10px", textAlign: "right" }}>
                      <button
                        onClick={() => handleToggleCredit(c)}
                        disabled={customerLoading}
                        style={{
                          background: c.is_credit_eligible ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                          border: `1px solid ${c.is_credit_eligible ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
                          color: c.is_credit_eligible ? "#ef4444" : "#10b981",
                          padding: "5px 12px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "0.78rem",
                          fontWeight: "600"
                        }}
                      >
                        {c.is_credit_eligible ? "Revoke Credit" : "Approve Credit (₹500)"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "30px 10px", color: "var(--text-muted)", fontSize: "0.9rem" }}>
            {customerLoading ? "Fetching customer directory..." : "Click 'Load Customers' above to browse registered customers."}
          </div>
        )}
      </section>

      {/* Phase 5: Menu Management & Live QR Catalog Explorer */}
      <section className="glass-panel" style={{ padding: "30px", marginBottom: "35px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>☕</span> Phase 5: Menu Management & Live QR Catalog Explorer
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: "4px" }}>
              Hierarchical categories, beverage pricing, daily stock protection, and tea customization modifiers (Sugar Levels & Kadak Strength).
            </p>
          </div>
          <button
            onClick={() => loadMenuCatalog()}
            disabled={catalogLoading}
            style={{
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              color: "#fff",
              border: "none",
              padding: "9px 18px",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <span>🔄</span> {catalogLoading ? "Refreshing..." : "Refresh Menu"}
          </button>
        </div>

        {menuActionMsg && (
          <div style={{
            padding: "10px 14px",
            background: "rgba(245, 158, 11, 0.15)",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            borderRadius: "8px",
            color: "#f59e0b",
            fontSize: "0.85rem",
            fontWeight: "600",
            marginBottom: "16px"
          }}>
            {menuActionMsg}
          </div>
        )}

        {/* Category Pill Filters */}
        {catalog && catalog.length > 0 && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "22px", flexWrap: "wrap" }}>
            <button
              onClick={() => setSelectedCatId("all")}
              style={{
                background: selectedCatId === "all" ? "linear-gradient(135deg, #f59e0b, #d97706)" : "rgba(255, 255, 255, 0.05)",
                color: selectedCatId === "all" ? "#fff" : "var(--text-muted)",
                border: "1px solid var(--border-subtle)",
                padding: "7px 15px",
                borderRadius: "20px",
                cursor: "pointer",
                fontSize: "0.84rem",
                fontWeight: "600"
              }}
            >
              All Items ({catalog.reduce((acc, c) => acc + (c.items?.length || 0), 0)})
            </button>
            {catalog.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCatId(String(cat.id))}
                style={{
                  background: selectedCatId === String(cat.id) ? "linear-gradient(135deg, #f59e0b, #d97706)" : "rgba(255, 255, 255, 0.05)",
                  color: selectedCatId === String(cat.id) ? "#fff" : "var(--text-muted)",
                  border: "1px solid var(--border-subtle)",
                  padding: "7px 15px",
                  borderRadius: "20px",
                  cursor: "pointer",
                  fontSize: "0.84rem",
                  fontWeight: "600"
                }}
              >
                {cat.name} ({cat.items?.length || 0})
              </button>
            ))}
          </div>
        )}

        {/* Product Cards Grid */}
        {catalog && catalog.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
            {catalog
              .filter((cat) => selectedCatId === "all" || selectedCatId === String(cat.id))
              .flatMap((cat) => cat.items.map((item) => ({ ...item, categoryName: cat.name })))
              .map((item) => (
                <div
                  key={item.id}
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "12px",
                    padding: "16px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "12px",
                    opacity: item.is_available ? 1 : 0.6
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                      <span style={{
                        fontSize: "0.72rem",
                        color: "#f59e0b",
                        fontWeight: "700",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px"
                      }}>
                        {item.categoryName}
                      </span>
                      <span style={{
                        fontSize: "0.72rem",
                        padding: "2px 7px",
                        borderRadius: "5px",
                        fontWeight: "700",
                        background: !item.is_available ? "rgba(239, 68, 68, 0.2)" : item.is_low_stock ? "rgba(245, 158, 11, 0.2)" : "rgba(16, 185, 129, 0.2)",
                        color: !item.is_available ? "#ef4444" : item.is_low_stock ? "#f59e0b" : "#10b981"
                      }}>
                        {!item.is_available ? "OUT OF STOCK" : item.is_low_stock ? `LOW (${item.available_quantity})` : `IN STOCK (${item.available_quantity})`}
                      </span>
                    </div>

                    <h3 style={{ fontSize: "1.05rem", fontWeight: "600", marginTop: "6px" }}>{item.name}</h3>
                    {item.description && (
                      <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "4px", lineHeight: "1.35" }}>
                        {item.description}
                      </p>
                    )}

                    {/* Customizations tags */}
                    {item.has_customizations && item.customization_options && (
                      <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        {item.customization_options.sugar_levels && (
                          <span style={{ fontSize: "0.7rem", background: "rgba(255, 255, 255, 0.05)", padding: "2px 6px", borderRadius: "4px", color: "#9ca3af" }}>
                            🍬 Sugar: {item.customization_options.sugar_levels.length} levels
                          </span>
                        )}
                        {item.customization_options.tea_strength && (
                          <span style={{ fontSize: "0.7rem", background: "rgba(255, 255, 255, 0.05)", padding: "2px 6px", borderRadius: "4px", color: "#9ca3af" }}>
                            💪 Strength: {item.customization_options.tea_strength.join("/")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "12px", borderTop: "1px solid rgba(255, 255, 255, 0.04)" }}>
                    <div style={{ fontSize: "1.2rem", fontWeight: "700", color: "#10b981" }}>
                      ₹{item.price}
                    </div>

                    <button
                      onClick={() => handleToggleItemAvailability(item)}
                      style={{
                        background: item.is_available ? "rgba(239, 68, 68, 0.12)" : "rgba(16, 185, 129, 0.12)",
                        border: `1px solid ${item.is_available ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
                        color: item.is_available ? "#ef4444" : "#10b981",
                        padding: "5px 10px",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        fontWeight: "600"
                      }}
                    >
                      {item.is_available ? "86 / Out of Stock" : "Mark Available"}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "40px 10px", color: "var(--text-muted)" }}>
            {catalogLoading ? "Loading digital menu catalog..." : "No items found. Click 'Refresh Menu' above."}
          </div>
        )}
      </section>

      {/* Phase 6: Customer QR Menu Showcase & Direct Links */}
      <section className="glass-panel" style={{ padding: "26px", marginBottom: "35px", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "1.6rem" }}>📲</span>
              <div>
                <h2 style={{ fontSize: "1.3rem", fontWeight: "700" }}>Phase 6: Mobile-First Customer QR Menu</h2>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  Instant digital menu accessed by scanning table QR codes. Auto table detection, instant search, and tea customization modals.
                </p>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link
              href="/menu?table=3"
              target="_blank"
              style={{
                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                color: "#fff",
                padding: "10px 18px",
                borderRadius: "8px",
                fontWeight: "700",
                fontSize: "0.88rem",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 4px 14px rgba(245, 158, 11, 0.35)"
              }}
            >
              <span>🚀</span>
              <span>Launch Table #3 Menu</span>
            </Link>
            <Link
              href="/menu?counter=1"
              target="_blank"
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#f3f4f6",
                padding: "10px 16px",
                borderRadius: "8px",
                fontWeight: "600",
                fontSize: "0.88rem",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              <span>🏪</span>
              <span>Counter Pickup View</span>
            </Link>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px", marginTop: "16px" }}>
          <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
            <div style={{ fontWeight: "700", color: "#f59e0b", fontSize: "0.88rem", marginBottom: "4px" }}>🏷️ Table Session Binding</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Extracts `?table=X` or `?counter=Y` query params and caches them in session so customers stay assigned to their table.
            </div>
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
            <div style={{ fontWeight: "700", color: "#10b981", fontSize: "0.88rem", marginBottom: "4px" }}>🍵 Chai Customization Modal</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Bottom sheet modal lets customers select sugar level (None, Less, Regular, Extra) and strength (Kadak, Regular).
            </div>
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
            <div style={{ fontWeight: "700", color: "#60a5fa", fontSize: "0.88rem", marginBottom: "4px" }}>🛒 Local Cart Buffer (Phase 7 Ready)</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Instant reactive order buffer saved to localStorage with sticky bottom bar ready for Phase 7 checkout & token creation.
            </div>
          </div>
        </div>
      </section>

      {/* Phase 7: Live Orders & Daily Token Kitchen Display (KDS) */}
      <section className="glass-panel" style={{ padding: "26px", marginBottom: "35px", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "1.6rem" }}>🔔</span>
              <div>
                <h2 style={{ fontSize: "1.3rem", fontWeight: "700" }}>Phase 7: Live Daily Token Kitchen Display (KDS)</h2>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  Real-time kitchen order preparation lifecycle (PENDING → PREPARING → READY → COMPLETED) with sequential daily token sequencing.
                </p>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={loadTokensQueue}
              disabled={kdsLoading}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid var(--border-subtle)",
                color: "#fff",
                padding: "8px 16px",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "0.82rem",
                fontWeight: "600"
              }}
            >
              {kdsLoading ? "Refreshing..." : "↻ Refresh Queue"}
            </button>
            <Link
              href="/menu?table=3"
              target="_blank"
              style={{
                background: "linear-gradient(135deg, #10b981, #059669)",
                color: "#fff",
                padding: "8px 16px",
                borderRadius: "8px",
                fontWeight: "700",
                fontSize: "0.82rem",
                textDecoration: "none"
              }}
            >
              + Place Test Order (QR)
            </Link>
          </div>
        </div>

        {kdsActionMsg && (
          <div style={{
            background: kdsActionMsg.includes("failed") || kdsActionMsg.includes("Failed") ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
            border: `1px solid ${kdsActionMsg.includes("failed") || kdsActionMsg.includes("Failed") ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
            color: kdsActionMsg.includes("failed") || kdsActionMsg.includes("Failed") ? "#ef4444" : "#10b981",
            padding: "9px 14px",
            borderRadius: "8px",
            fontSize: "0.85rem",
            marginBottom: "16px"
          }}>
            {kdsActionMsg}
          </div>
        )}

        {/* Token Stats Summary Strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px", marginBottom: "20px" }}>
          <div style={{ background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.25)", padding: "12px", borderRadius: "10px", textAlign: "center" }}>
            <div style={{ fontSize: "0.72rem", color: "#f59e0b", fontWeight: "700", textTransform: "uppercase" }}>Latest Token</div>
            <div style={{ fontSize: "1.6rem", fontWeight: "900", color: "#f59e0b" }}>
              #{tokenStats ? tokenStats.latest_token : tokensData?.latest_token || 0}
            </div>
          </div>
          <div style={{ background: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59, 130, 246, 0.25)", padding: "12px", borderRadius: "10px", textAlign: "center" }}>
            <div style={{ fontSize: "0.72rem", color: "#60a5fa", fontWeight: "700", textTransform: "uppercase" }}>Pending Queue</div>
            <div style={{ fontSize: "1.6rem", fontWeight: "900", color: "#60a5fa" }}>
              {tokenStats ? tokenStats.active_pending_count : tokensData?.pending?.length || 0}
            </div>
          </div>
          <div style={{ background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.25)", padding: "12px", borderRadius: "10px", textAlign: "center" }}>
            <div style={{ fontSize: "0.72rem", color: "#fbbf24", fontWeight: "700", textTransform: "uppercase" }}>Preparing ☕</div>
            <div style={{ fontSize: "1.6rem", fontWeight: "900", color: "#fbbf24" }}>
              {tokenStats ? tokenStats.active_preparing_count : tokensData?.preparing?.length || 0}
            </div>
          </div>
          <div style={{ background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.25)", padding: "12px", borderRadius: "10px", textAlign: "center" }}>
            <div style={{ fontSize: "0.72rem", color: "#10b981", fontWeight: "700", textTransform: "uppercase" }}>Ready for Pickup 🔔</div>
            <div style={{ fontSize: "1.6rem", fontWeight: "900", color: "#10b981" }}>
              {tokenStats ? tokenStats.active_ready_count : tokensData?.ready?.length || 0}
            </div>
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)", padding: "12px", borderRadius: "10px", textAlign: "center" }}>
            <div style={{ fontSize: "0.72rem", color: "#9ca3af", fontWeight: "700", textTransform: "uppercase" }}>Total Today</div>
            <div style={{ fontSize: "1.6rem", fontWeight: "900", color: "var(--text-main)" }}>
              {tokenStats ? tokenStats.total_orders : tokensData?.total_orders_today || 0}
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
          {[
            { id: "all", label: "All Active" },
            { id: "pending", label: `Pending (${tokensData?.pending?.length || 0})` },
            { id: "preparing", label: `Preparing (${tokensData?.preparing?.length || 0})` },
            { id: "ready", label: `Ready (${tokensData?.ready?.length || 0})` },
            { id: "completed", label: `Completed (${tokensData?.completed?.length || 0})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setKdsFilter(tab.id)}
              style={{
                padding: "6px 14px",
                borderRadius: "8px",
                border: kdsFilter === tab.id ? "1px solid #10b981" : "1px solid rgba(255, 255, 255, 0.1)",
                background: kdsFilter === tab.id ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.03)",
                color: kdsFilter === tab.id ? "#10b981" : "#d1d5db",
                fontSize: "0.82rem",
                fontWeight: "600",
                cursor: "pointer"
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Active Orders Grid */}
        {(() => {
          let list = [];
          if (kdsFilter === "all") {
            list = [...(tokensData?.pending || []), ...(tokensData?.preparing || []), ...(tokensData?.ready || [])];
          } else if (kdsFilter === "pending") {
            list = tokensData?.pending || [];
          } else if (kdsFilter === "preparing") {
            list = tokensData?.preparing || [];
          } else if (kdsFilter === "ready") {
            list = tokensData?.ready || [];
          } else if (kdsFilter === "completed") {
            list = tokensData?.completed || [];
          }

          if (list.length === 0) {
            return (
              <div style={{ textAlign: "center", padding: "30px 10px", color: "var(--text-muted)", fontSize: "0.88rem" }}>
                {kdsLoading ? "Loading kitchen display orders..." : "No orders found in this status category. Scan QR or place an order above."}
              </div>
            );
          }

          return (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "14px" }}>
              {list.map((o) => (
                <div
                  key={o.order_id}
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: o.order_status === "READY" ? "1px solid #10b981" : o.order_status === "PREPARING" ? "1px solid #f59e0b" : "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "12px",
                    padding: "16px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between"
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                      <span style={{
                        fontSize: "1.3rem",
                        fontWeight: "900",
                        color: "#f59e0b",
                        background: "rgba(245, 158, 11, 0.15)",
                        padding: "2px 8px",
                        borderRadius: "8px"
                      }}>
                        #{o.token_number}
                      </span>
                      <span style={{
                        fontSize: "0.72rem",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        fontWeight: "700",
                        background: o.order_status === "READY" ? "rgba(16, 185, 129, 0.2)" : o.order_status === "PREPARING" ? "rgba(245, 158, 11, 0.2)" : "rgba(59, 130, 246, 0.2)",
                        color: o.order_status === "READY" ? "#10b981" : o.order_status === "PREPARING" ? "#f59e0b" : "#60a5fa"
                      }}>
                        {o.order_status}
                      </span>
                    </div>

                    <div style={{ fontSize: "0.92rem", fontWeight: "700", color: "var(--text-main)" }}>
                      {o.customer_name}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "#9ca3af", marginTop: "2px" }}>
                      {o.table_or_notes || "Dine-in"} • {o.items_count} items
                    </div>

                    <div style={{ marginTop: "10px", display: "flex", justifyContent: "space-between", fontSize: "0.85rem", borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: "8px" }}>
                      <span style={{ color: "#9ca3af" }}>Bill Total:</span>
                      <span style={{ color: "#10b981", fontWeight: "700" }}>₹{o.total_amount.toFixed(2)} ({o.payment_method})</span>
                    </div>
                  </div>

                  {/* KDS Lifecycle Controls */}
                  <div style={{ display: "flex", gap: "6px", marginTop: "14px" }}>
                    {(o.order_status === "PENDING" || o.order_status === "CONFIRMED") && (
                      <button
                        onClick={() => handleUpdateOrderStatus(o.order_id, "PREPARING")}
                        style={{
                          flex: 1,
                          background: "rgba(245, 158, 11, 0.2)",
                          border: "1px solid rgba(245, 158, 11, 0.4)",
                          color: "#f59e0b",
                          padding: "6px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                          fontWeight: "700"
                        }}
                      >
                        Start Preparing ⏳
                      </button>
                    )}
                    {o.order_status === "PREPARING" && (
                      <button
                        onClick={() => handleUpdateOrderStatus(o.order_id, "READY")}
                        style={{
                          flex: 1,
                          background: "rgba(16, 185, 129, 0.2)",
                          border: "1px solid rgba(16, 185, 129, 0.4)",
                          color: "#10b981",
                          padding: "6px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                          fontWeight: "700"
                        }}
                      >
                        Mark Ready 🔔
                      </button>
                    )}
                    {o.order_status === "READY" && (
                      <button
                        onClick={() => handleUpdateOrderStatus(o.order_id, "COMPLETED")}
                        style={{
                          flex: 1,
                          background: "rgba(255, 255, 255, 0.1)",
                          border: "1px solid rgba(255, 255, 255, 0.2)",
                          color: "#fff",
                          padding: "6px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                          fontWeight: "700"
                        }}
                      >
                        Handover / Complete ✅
                      </button>
                    )}
                    {o.order_status !== "COMPLETED" && o.order_status !== "CANCELLED" && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Cancel Token #${o.daily_token_number || o.token_number}? Quantities will be added back to menu stock.`)) {
                            handleUpdateOrderStatus(o.order_id, "CANCELLED");
                          }
                        }}
                        style={{
                          background: "rgba(239, 68, 68, 0.15)",
                          border: "1px solid rgba(239, 68, 68, 0.35)",
                          color: "#ef4444",
                          padding: "6px 10px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                          fontWeight: "700"
                        }}
                        title="Cancel order and return items to menu stock"
                      >
                        Cancel ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </section>

      {/* Phase 8: Counter Billing, Cashier Tender, UPI QR & Printable Receipts */}
      <section className="glass-panel" style={{ padding: "26px", marginBottom: "35px", border: "1px solid rgba(16, 185, 129, 0.35)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "1.6rem" }}>💵</span>
              <div>
                <h2 style={{ fontSize: "1.3rem", fontWeight: "700" }}>Phase 8: Counter Billing & Cash/UPI Register</h2>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  Cash tender change calculation, dynamic NPCI UPI QR generator, credit debt repayments, and thermal bill printing.
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={loadBillingSummary}
            disabled={shiftLoading}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid var(--border-subtle)",
              color: "#fff",
              padding: "8px 16px",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.82rem",
              fontWeight: "600"
            }}
          >
            {shiftLoading ? "Refreshing..." : "↻ Refresh Cash Drawer"}
          </button>
        </div>

        {billingActionMsg && (
          <div style={{
            background: billingActionMsg.includes("failed") || billingActionMsg.includes("Failed") ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
            border: `1px solid ${billingActionMsg.includes("failed") || billingActionMsg.includes("Failed") ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
            color: billingActionMsg.includes("failed") || billingActionMsg.includes("Failed") ? "#ef4444" : "#10b981",
            padding: "9px 14px",
            borderRadius: "8px",
            fontSize: "0.85rem",
            marginBottom: "16px"
          }}>
            {billingActionMsg}
          </div>
        )}

        {/* Section 21 Daily Cash Drawer & Shift Summary Strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginBottom: "22px" }}>
          <div style={{ background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.25)", padding: "12px", borderRadius: "10px", textAlign: "center" }}>
            <div style={{ fontSize: "0.72rem", color: "#10b981", fontWeight: "700", textTransform: "uppercase" }}>Cash In Drawer 💵</div>
            <div style={{ fontSize: "1.45rem", fontWeight: "900", color: "#10b981" }}>
              ₹{shiftSummary ? Number(shiftSummary.cash_collected).toFixed(2) : "0.00"}
            </div>
          </div>
          <div style={{ background: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59, 130, 246, 0.25)", padding: "12px", borderRadius: "10px", textAlign: "center" }}>
            <div style={{ fontSize: "0.72rem", color: "#60a5fa", fontWeight: "700", textTransform: "uppercase" }}>UPI Direct 📱</div>
            <div style={{ fontSize: "1.45rem", fontWeight: "900", color: "#60a5fa" }}>
              ₹{shiftSummary ? Number(shiftSummary.upi_collected).toFixed(2) : "0.00"}
            </div>
          </div>
          <div style={{ background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.25)", padding: "12px", borderRadius: "10px", textAlign: "center" }}>
            <div style={{ fontSize: "0.72rem", color: "#f59e0b", fontWeight: "700", textTransform: "uppercase" }}>Credit Repayments 📝</div>
            <div style={{ fontSize: "1.45rem", fontWeight: "900", color: "#f59e0b" }}>
              ₹{shiftSummary ? Number(shiftSummary.credit_repayments_collected).toFixed(2) : "0.00"}
            </div>
          </div>
          <div style={{ background: "rgba(147, 51, 234, 0.1)", border: "1px solid rgba(147, 51, 234, 0.25)", padding: "12px", borderRadius: "10px", textAlign: "center" }}>
            <div style={{ fontSize: "0.72rem", color: "#c084fc", fontWeight: "700", textTransform: "uppercase" }}>Total Money Received</div>
            <div style={{ fontSize: "1.45rem", fontWeight: "900", color: "#c084fc" }}>
              ₹{shiftSummary ? Number(shiftSummary.total_money_received).toFixed(2) : "0.00"}
            </div>
          </div>
          <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", padding: "12px", borderRadius: "10px", textAlign: "center" }}>
            <div style={{ fontSize: "0.72rem", color: "#f87171", fontWeight: "700", textTransform: "uppercase" }}>Credit Sales Unpaid</div>
            <div style={{ fontSize: "1.45rem", fontWeight: "900", color: "#f87171" }}>
              ₹{shiftSummary ? Number(shiftSummary.credit_sales_unpaid).toFixed(2) : "0.00"}
            </div>
          </div>
        </div>

        {/* Counter Tools Grid: Pending Settlement Bills & Credit Repayment */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
          {/* Left: Pending Bills Counter Cashier */}
          <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "18px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-main)" }}>
                Pending Orders at Counter ({tokensData?.pending?.length || 0})
              </h3>
              <span style={{ fontSize: "0.75rem", color: "#f59e0b", background: "rgba(245, 158, 11, 0.15)", padding: "2px 8px", borderRadius: "4px" }}>
                Awaiting Payment
              </span>
            </div>

            {(!tokensData?.pending || tokensData.pending.length === 0) ? (
              <div style={{ textAlign: "center", padding: "26px 10px", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                No orders waiting for payment. All orders are settled!
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {tokensData.pending.map((p) => (
                  <div key={p.order_id} style={{
                    background: "rgba(255, 255, 255, 0.04)",
                    borderRadius: "10px",
                    padding: "12px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    border: "1px solid rgba(255, 255, 255, 0.08)"
                  }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontWeight: "800", color: "#f59e0b", fontSize: "0.95rem" }}>
                          #{p.token_number}
                        </span>
                        <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "#fff" }}>
                          {p.customer_name}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "2px" }}>
                        {p.table_or_notes || "Dine-in"} • {p.items_count} items
                      </div>
                      <div style={{ fontSize: "0.95rem", fontWeight: "700", color: "#10b981", marginTop: "4px" }}>
                        ₹{p.total_amount.toFixed(2)}
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <button
                        onClick={() => {
                          setActiveCashSettle(p);
                          setCashTendered(String(p.total_amount));
                        }}
                        style={{
                          background: "rgba(16, 185, 129, 0.2)",
                          border: "1px solid rgba(16, 185, 129, 0.4)",
                          color: "#10b981",
                          padding: "5px 10px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                          fontWeight: "700"
                        }}
                      >
                        Settle Cash 💵
                      </button>
                      <button
                        onClick={() => handleOpenUpiModal(p.order_id)}
                        style={{
                          background: "rgba(59, 130, 246, 0.2)",
                          border: "1px solid rgba(59, 130, 246, 0.4)",
                          color: "#60a5fa",
                          padding: "5px 10px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                          fontWeight: "700"
                        }}
                      >
                        UPI QR 📱
                      </button>
                      <button
                        onClick={() => handleOpenReceiptModal(p.order_id)}
                        style={{
                          background: "rgba(255, 255, 255, 0.08)",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          color: "#d1d5db",
                          padding: "5px 10px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "0.75rem"
                        }}
                      >
                        Receipt 🖨️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Section 17 Counter Credit Repayment Tool */}
          <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "18px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-main)", marginBottom: "4px" }}>
              Record Customer Credit Repayment (Section 17)
            </h3>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "14px" }}>
              Customer pays cash or UPI at the counter to decrease their outstanding credit debt balance.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <label style={{ fontSize: "0.78rem", color: "#9ca3af", display: "block", marginBottom: "4px" }}>
                  Customer ID
                </label>
                <input
                  type="number"
                  placeholder="e.g. 1 (From Customer Table above)"
                  value={repayCustomerId}
                  onChange={(e) => setRepayCustomerId(e.target.value)}
                  style={{
                    width: "100%",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    color: "#fff",
                    fontSize: "0.85rem",
                    outline: "none"
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.78rem", color: "#9ca3af", display: "block", marginBottom: "4px" }}>
                  Repayment Amount (₹)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 200"
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                  style={{
                    width: "100%",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    color: "#fff",
                    fontSize: "0.85rem",
                    outline: "none"
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.78rem", color: "#9ca3af", display: "block", marginBottom: "4px" }}>
                  Payment Method
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {["CASH", "UPI", "CARD"].map((m) => (
                    <button
                      key={m}
                      onClick={() => setRepayMethod(m)}
                      style={{
                        flex: 1,
                        padding: "8px",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        fontWeight: "700",
                        cursor: "pointer",
                        border: repayMethod === m ? "1px solid #10b981" : "1px solid rgba(255, 255, 255, 0.1)",
                        background: repayMethod === m ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.04)",
                        color: repayMethod === m ? "#10b981" : "#d1d5db"
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleRecordRepaymentSubmit}
                style={{
                  marginTop: "6px",
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  border: "none",
                  color: "#fff",
                  padding: "11px",
                  borderRadius: "8px",
                  fontWeight: "700",
                  fontSize: "0.88rem",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(16, 185, 129, 0.35)"
                }}
              >
                Record Debt Repayment 💵
              </button>
            </div>
          </div>
        </div>

        {/* Modal 1: Cash Tender Change Calculation */}
        {activeCashSettle && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 95,
            background: "rgba(0,0,0,0.8)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px"
          }}>
            <div style={{
              background: "var(--bg-modal)", boxShadow: "var(--shadow-modal)",
              maxWidth: "420px",
              width: "100%",
              borderRadius: "20px",
              border: "1px solid rgba(16, 185, 129, 0.4)",
              padding: "24px"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "1.15rem", fontWeight: "700", color: "var(--text-main)" }}>
                  Cash Tender Calculator
                </h3>
                <button
                  onClick={() => setActiveCashSettle(null)}
                  style={{ background: "transparent", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: "1.2rem" }}
                >
                  ✕
                </button>
              </div>

              <div style={{ background: "rgba(255, 255, 255, 0.04)", padding: "14px", borderRadius: "10px", marginBottom: "16px" }}>
                <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>Order Token #{activeCashSettle.token_number}</div>
                <div style={{ fontSize: "1.6rem", fontWeight: "900", color: "#10b981" }}>
                  Bill: ₹{activeCashSettle.total_amount.toFixed(2)}
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ fontSize: "0.82rem", color: "#9ca3af", display: "block", marginBottom: "6px" }}>
                  Amount Handed by Customer (₹)
                </label>
                <input
                  type="number"
                  placeholder={String(activeCashSettle.total_amount)}
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  style={{
                    width: "100%",
                    background: "rgba(255, 255, 255, 0.08)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    color: "#fff",
                    fontSize: "1.2rem",
                    fontWeight: "700",
                    outline: "none"
                  }}
                />
              </div>

              {/* Instant Change Due display */}
              {cashTendered && Number(cashTendered) >= activeCashSettle.total_amount && (
                <div style={{
                  background: "rgba(16, 185, 129, 0.15)",
                  border: "1px solid #10b981",
                  borderRadius: "10px",
                  padding: "12px",
                  textAlign: "center",
                  marginBottom: "16px"
                }}>
                  <div style={{ fontSize: "0.78rem", color: "#10b981", fontWeight: "700", textTransform: "uppercase" }}>
                    Change to Return to Customer
                  </div>
                  <div style={{ fontSize: "1.8rem", fontWeight: "900", color: "#10b981" }}>
                    ₹{(Number(cashTendered) - activeCashSettle.total_amount).toFixed(2)}
                  </div>
                </div>
              )}

              <button
                onClick={handleSettleCashSubmit}
                style={{
                  width: "100%",
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  border: "none",
                  color: "#fff",
                  padding: "13px",
                  borderRadius: "10px",
                  fontWeight: "700",
                  cursor: "pointer",
                  fontSize: "0.95rem"
                }}
              >
                Complete Cash Settlement ✅
              </button>
            </div>
          </div>
        )}

        {/* Modal 2: Dynamic NPCI UPI QR Code */}
        {activeUpiQr && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 95,
            background: "rgba(0,0,0,0.8)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px"
          }}>
            <div style={{
              background: "var(--bg-modal)", boxShadow: "var(--shadow-modal)",
              maxWidth: "420px",
              width: "100%",
              borderRadius: "20px",
              border: "1px solid rgba(59, 130, 246, 0.4)",
              padding: "24px",
              textAlign: "center"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "1.15rem", fontWeight: "700", color: "var(--text-main)" }}>
                  Scan & Pay via UPI 📱
                </h3>
                <button
                  onClick={() => setActiveUpiQr(null)}
                  style={{ background: "transparent", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: "1.2rem" }}
                >
                  ✕
                </button>
              </div>

              {/* Scannable QR Code Image */}
              <div style={{
                background: "#fff",
                padding: "10px",
                borderRadius: "14px",
                margin: "0 auto 16px",
                display: "inline-block",
                boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                width: "220px",
                height: "220px",
              }}>
                {activeUpiQr.qr_image_data ? (
                  <img
                    src={activeUpiQr.qr_image_data}
                    alt="UPI QR Code"
                    style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "8px", display: "block" }}
                  />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
                    <div style={{ fontSize: "2rem" }}>⏳</div>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Generating QR...</div>
                  </div>
                )}
              </div>

              <div style={{ fontSize: "1.8rem", fontWeight: "900", color: "#60a5fa" }}>
                ₹{Number(activeUpiQr.amount).toFixed(2)}
              </div>
              <div style={{ fontSize: "0.8rem", color: "#9ca3af", marginTop: "4px", wordBreak: "break-all" }}>
                VPA: <strong>{activeUpiQr.upi_id}</strong> ({activeUpiQr.payee_name || "ChaiFlow Tea Shop"})
              </div>

              <div style={{ marginTop: "16px", textAlign: "left" }}>
                <label style={{ fontSize: "0.78rem", color: "#9ca3af", display: "block", marginBottom: "4px" }}>
                  UPI Reference / UTR Number (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 427189123456"
                  value={upiUtrInput}
                  onChange={(e) => setUpiUtrInput(e.target.value)}
                  style={{
                    width: "100%",
                    background: "rgba(255, 255, 255, 0.08)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: "8px",
                    padding: "9px 12px",
                    color: "#fff",
                    fontSize: "0.85rem",
                    outline: "none",
                    marginBottom: "12px"
                  }}
                />
              </div>

              <button
                onClick={handleConfirmUpiPayment}
                style={{
                  width: "100%",
                  background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                  border: "none",
                  color: "#fff",
                  padding: "12px",
                  borderRadius: "10px",
                  fontWeight: "700",
                  cursor: "pointer",
                  fontSize: "0.95rem"
                }}
              >
                Confirm UPI Payment Received ✅
              </button>
            </div>
          </div>
        )}

        {/* Modal 3: Thermal Printable Bill Receipt (58mm / 80mm) */}
        {activeReceipt && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 95,
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px"
          }}>
            <div style={{
              background: "#fafafa",
              color: "#111",
              maxWidth: "360px",
              width: "100%",
              borderRadius: "12px",
              padding: "24px 20px",
              fontFamily: "monospace",
              fontSize: "0.85rem",
              boxShadow: "0 10px 35px rgba(0,0,0,0.6)",
              maxHeight: "90vh",
              overflowY: "auto"
            }}>
              <div style={{ textAlign: "center", borderBottom: "1px dashed #666", paddingBottom: "10px", marginBottom: "10px" }}>
                <div style={{ fontSize: "1.15rem", fontWeight: "900", letterSpacing: "1px" }}>{activeReceipt.shop_name}</div>
                <div style={{ fontSize: "0.75rem", color: "#444" }}>{activeReceipt.tagline}</div>
                <div style={{ fontSize: "0.72rem", color: "#666" }}>{activeReceipt.address}</div>
                <div style={{ fontSize: "0.72rem", color: "#666" }}>Phone: {activeReceipt.phone}</div>
                <div style={{ fontSize: "0.72rem", color: "#666" }}>FSSAI: {activeReceipt.fssai_license}</div>
              </div>

              <div style={{ textAlign: "center", background: "#eee", padding: "6px", borderRadius: "6px", fontWeight: "900", fontSize: "1.2rem", margin: "8px 0" }}>
                TOKEN #{activeReceipt.daily_token_number}
              </div>

              <div style={{ fontSize: "0.75rem", lineHeight: "1.4", borderBottom: "1px dashed #666", paddingBottom: "8px", marginBottom: "10px" }}>
                <div>Order: <strong>{activeReceipt.order_number}</strong></div>
                <div>Date: {activeReceipt.date_time}</div>
                <div>Customer: {activeReceipt.customer_name}</div>
                <div>Location: {activeReceipt.table_or_counter}</div>
              </div>

              {/* Items */}
              <div style={{ borderBottom: "1px dashed #666", paddingBottom: "10px", marginBottom: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "700", marginBottom: "4px" }}>
                  <span>ITEM</span>
                  <span>QTY × RATE</span>
                  <span>TOTAL</span>
                </div>
                {activeReceipt.items.map((item, idx) => (
                  <div key={idx} style={{ marginBottom: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{item.name}</span>
                      <span>{item.quantity} × {item.unit_price}</span>
                      <span style={{ fontWeight: "700" }}>₹{Number(item.total_price).toFixed(2)}</span>
                    </div>
                    {item.customizations && (
                      <div style={{ fontSize: "0.68rem", color: "#555", fontStyle: "italic" }}>
                        {item.customizations}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Total Summary */}
              <div style={{ borderBottom: "1px dashed #666", paddingBottom: "10px", marginBottom: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.05rem", fontWeight: "900" }}>
                  <span>NET TOTAL:</span>
                  <span>₹{Number(activeReceipt.total_amount).toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginTop: "4px" }}>
                  <span>Payment Mode:</span>
                  <span>{activeReceipt.payment_method}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
                  <span>Status:</span>
                  <span><strong>{activeReceipt.payment_status}</strong></span>
                </div>
                {activeReceipt.transaction_reference && (
                  <div style={{ fontSize: "0.72rem", color: "#666" }}>
                    Ref: {activeReceipt.transaction_reference}
                  </div>
                )}
              </div>

              <div style={{ textAlign: "center", fontSize: "0.72rem", color: "#555", marginBottom: "14px" }}>
                {activeReceipt.footer_message}
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => window.print()}
                  style={{
                    flex: 1,
                    background: "#111",
                    color: "#fff",
                    border: "none",
                    padding: "9px",
                    borderRadius: "6px",
                    fontWeight: "700",
                    cursor: "pointer"
                  }}
                >
                  Print Bill 🖨️
                </button>
                <button
                  onClick={() => setActiveReceipt(null)}
                  style={{
                    background: "#ccc",
                    color: "#222",
                    border: "none",
                    padding: "9px 14px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontWeight: "600"
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Phase 9: Shop Expenses & Operating Outlay Manager */}
      <section className="glass-panel" style={{ padding: "30px", marginBottom: "35px" }}>
        {/* Title & Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "24px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <span style={{ fontSize: "1.6rem" }}>📉</span>
              <h2 style={{ fontSize: "1.4rem", fontWeight: "700", color: "var(--text-main)" }}>
                Phase 9: Shop Expenses & Operating Outlay Manager (Section 20)
              </h2>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "780px" }}>
              Track daily tea shop procurement costs (Milk, Tea Powder, Sugar, Gas Cylinders, Electricity, Rent, Wages) with category breakdowns, payment mode metrics & audit ledger.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              onClick={() => loadExpenseData()}
              disabled={expenseLoading}
              style={{
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                color: "#e5e7eb",
                padding: "8px 14px",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: "600"
              }}
            >
              {expenseLoading ? "Refreshing..." : "↻ Refresh Ledger"}
            </button>
            <button
              onClick={() => setShowExpenseModal(true)}
              style={{
                background: "linear-gradient(135deg, #ef4444, #dc2626)",
                border: "none",
                color: "#fff",
                padding: "8px 16px",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: "700",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 4px 14px rgba(239, 68, 68, 0.35)"
              }}
            >
              <span>+ Record New Expense</span>
            </button>
          </div>
        </div>

        {/* Action Message Alert */}
        {expenseActionMsg && (
          <div style={{
            background: expenseActionMsg.includes("failed") || expenseActionMsg.includes("Failed") ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
            border: `1px solid ${expenseActionMsg.includes("failed") || expenseActionMsg.includes("Failed") ? "#ef4444" : "#10b981"}`,
            color: expenseActionMsg.includes("failed") || expenseActionMsg.includes("Failed") ? "#fca5a5" : "#6ee7b7",
            padding: "10px 16px",
            borderRadius: "8px",
            fontSize: "0.88rem",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <span>{expenseActionMsg}</span>
            <button
              onClick={() => setExpenseActionMsg("")}
              style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: "0.85rem" }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Expense KPI Analytics Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "26px" }}>
          {/* Card 1: Today's Outlay */}
          <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: "12px", padding: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "0.8rem", color: "#fca5a5", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Today's Outlay
              </span>
              <span style={{ fontSize: "1.2rem" }}>🥛</span>
            </div>
            <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "#ef4444" }}>
              ₹{Number(expenseAnalytics?.total_expenses_today || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Daily Milk, Gas, Ingredients
            </div>
          </div>

          {/* Card 2: Current Month Outlay */}
          <div style={{ background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.25)", borderRadius: "12px", padding: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "0.8rem", color: "#fcd34d", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                This Month's Outlay
              </span>
              <span style={{ fontSize: "1.2rem" }}>📅</span>
            </div>
            <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "#f59e0b" }}>
              ₹{Number(expenseAnalytics?.total_expenses_month || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Calendar Month Operations
            </div>
          </div>

          {/* Card 3: Total Recorded Vouchers */}
          <div style={{ background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.25)", borderRadius: "12px", padding: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "0.8rem", color: "#93c5fd", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Total Vouchers
              </span>
              <span style={{ fontSize: "1.2rem" }}>🧾</span>
            </div>
            <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "#3b82f6" }}>
              {expenseAnalytics?.total_records || expenseTotal || 0}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Active Expense Records
            </div>
          </div>

          {/* Card 4: Top Expense Category */}
          <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "12px", padding: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "0.8rem", color: "#6ee7b7", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Top Cost Driver
              </span>
              <span style={{ fontSize: "1.2rem" }}>🏆</span>
            </div>
            <div style={{ fontSize: "1.3rem", fontWeight: "800", color: "#10b981", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {expenseAnalytics?.by_category?.[0]?.category || "None"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
              {expenseAnalytics?.by_category?.[0]
                ? `₹${Number(expenseAnalytics.by_category[0].total_amount).toFixed(2)} (${expenseAnalytics.by_category[0].percentage}%)`
                : "No data available"}
            </div>
          </div>
        </div>

        {/* Category Share Distribution Bars */}
        {expenseAnalytics?.by_category && expenseAnalytics.by_category.length > 0 && (
          <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "18px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.06)", marginBottom: "24px" }}>
            <div style={{ fontSize: "0.9rem", fontWeight: "700", color: "#e5e7eb", marginBottom: "12px", display: "flex", justifyContent: "space-between" }}>
              <span>Category Outlay Distribution</span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: "normal" }}>
                Overall: ₹{Number(expenseTotalAmount).toFixed(2)}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
              {expenseAnalytics.by_category.slice(0, 6).map((cat, idx) => (
                <div key={idx} style={{ background: "rgba(255, 255, 255, 0.02)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "4px" }}>
                    <span style={{ fontWeight: "600", color: "var(--text-main)" }}>{cat.category}</span>
                    <span style={{ color: "#ef4444", fontWeight: "700" }}>₹{Number(cat.total_amount).toFixed(0)}</span>
                  </div>
                  <div style={{ background: "rgba(255, 255, 255, 0.08)", height: "6px", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{
                      width: `${Math.min(cat.percentage, 100)}%`,
                      height: "100%",
                      background: idx % 3 === 0 ? "linear-gradient(90deg, #ef4444, #f87171)" : idx % 3 === 1 ? "linear-gradient(90deg, #f59e0b, #fbbf24)" : "linear-gradient(90deg, #3b82f6, #60a5fa)",
                      borderRadius: "3px"
                    }} />
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginTop: "3px", textAlign: "right" }}>
                    {cat.percentage}% of total ({cat.count} items)
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter Bar & Quick Category Pills */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "18px" }}>
          {/* Quick Category Pills */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: "600" }}>Filter:</span>
            <button
              onClick={() => {
                setExpenseFilterCat("all");
                loadExpenseData("all", null, null);
              }}
              style={{
                padding: "5px 12px",
                borderRadius: "20px",
                fontSize: "0.78rem",
                fontWeight: "600",
                cursor: "pointer",
                border: expenseFilterCat === "all" ? "1px solid #ef4444" : "1px solid rgba(255, 255, 255, 0.1)",
                background: expenseFilterCat === "all" ? "rgba(239, 68, 68, 0.2)" : "rgba(255, 255, 255, 0.04)",
                color: expenseFilterCat === "all" ? "#fca5a5" : "#9ca3af"
              }}
            >
              All Categories
            </button>
            {expenseCategories.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setExpenseFilterCat(c);
                  loadExpenseData(c, null, null);
                }}
                style={{
                  padding: "5px 12px",
                  borderRadius: "20px",
                  fontSize: "0.78rem",
                  fontWeight: "600",
                  cursor: "pointer",
                  border: expenseFilterCat === c ? "1px solid #ef4444" : "1px solid rgba(255, 255, 255, 0.1)",
                  background: expenseFilterCat === c ? "rgba(239, 68, 68, 0.2)" : "rgba(255, 255, 255, 0.04)",
                  color: expenseFilterCat === c ? "#fca5a5" : "#9ca3af"
                }}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Search & Today Only Toggle */}
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: "220px", position: "relative" }}>
              <input
                type="text"
                placeholder="Search expense description, vendor, or items..."
                value={expenseSearch}
                onChange={(e) => setExpenseSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") loadExpenseData(null, null, expenseSearch);
                }}
                style={{
                  width: "100%",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: "8px",
                  padding: "8px 14px",
                  color: "#fff",
                  fontSize: "0.85rem",
                  outline: "none"
                }}
              />
            </div>

            <button
              onClick={() => loadExpenseData(null, null, expenseSearch)}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#fff",
                padding: "8px 14px",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: "600"
              }}
            >
              Search 🔍
            </button>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.85rem", color: "#e5e7eb" }}>
              <input
                type="checkbox"
                checked={expenseFilterToday}
                onChange={(e) => {
                  setExpenseFilterToday(e.target.checked);
                  loadExpenseData(null, e.target.checked, null);
                }}
                style={{ width: "16px", height: "16px", accentColor: "#ef4444", cursor: "pointer" }}
              />
              Today's Expenses Only
            </label>
          </div>
        </div>

        {/* Expenses Ledger Table */}
        <div style={{ background: "rgba(255, 255, 255, 0.02)", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.06)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "rgba(255, 255, 255, 0.04)", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", textAlign: "left" }}>
                <th style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: "600" }}>DATE</th>
                <th style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: "600" }}>CATEGORY</th>
                <th style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: "600" }}>DESCRIPTION / VENDOR</th>
                <th style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: "600" }}>PAYMENT MODE</th>
                <th style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: "600", textAlign: "right" }}>AMOUNT</th>
                <th style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: "600", textAlign: "center" }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {expenseLoading && expensesData.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "30px", textAlign: "center", color: "var(--text-muted)" }}>
                    Loading shop expense records...
                  </td>
                </tr>
              ) : expensesData.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "30px", textAlign: "center", color: "var(--text-muted)" }}>
                    No expense records found matching current filter criteria.
                  </td>
                </tr>
              ) : (
                expensesData.map((exp) => (
                  <tr
                    key={exp.id}
                    style={{
                      borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                      transition: "background 0.15s ease"
                    }}
                  >
                    <td style={{ padding: "12px 16px", color: "#d1d5db", whiteSpace: "nowrap" }}>
                      {exp.expense_date}
                    </td>
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      <span style={{
                        padding: "3px 8px",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: "700",
                        background: exp.category === "Milk" ? "rgba(56, 189, 248, 0.15)" :
                          exp.category === "Tea Powder" ? "rgba(245, 158, 11, 0.15)" :
                          exp.category === "Gas Cylinders" ? "rgba(239, 68, 68, 0.15)" :
                          exp.category === "Sugar" ? "rgba(236, 72, 153, 0.15)" :
                          exp.category === "Electricity" ? "rgba(234, 179, 8, 0.15)" :
                          "rgba(147, 51, 234, 0.15)",
                        color: exp.category === "Milk" ? "#38bdf8" :
                          exp.category === "Tea Powder" ? "#fbbf24" :
                          exp.category === "Gas Cylinders" ? "#f87171" :
                          exp.category === "Sugar" ? "#f472b6" :
                          exp.category === "Electricity" ? "#facc15" :
                          "#c084fc",
                        border: "1px solid rgba(255, 255, 255, 0.1)"
                      }}>
                        {exp.category === "Milk" ? "🥛 " :
                          exp.category === "Tea Powder" ? "🍃 " :
                          exp.category === "Gas Cylinders" ? "🔥 " :
                          exp.category === "Sugar" ? "🍬 " :
                          exp.category === "Electricity" ? "⚡ " :
                          "🏷️ "}
                        {exp.category}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--text-main)", maxWidth: "340px" }}>
                      <div>{exp.description}</div>
                      <div style={{ fontSize: "0.7rem", color: "#6b7280", marginTop: "2px" }}>
                        Voucher #{exp.id}
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "0.72rem",
                        fontWeight: "600",
                        background: exp.payment_method === "CASH" ? "rgba(34, 197, 94, 0.15)" :
                          exp.payment_method === "UPI" ? "rgba(59, 130, 246, 0.15)" :
                          "rgba(168, 85, 247, 0.15)",
                        color: exp.payment_method === "CASH" ? "#4ade80" :
                          exp.payment_method === "UPI" ? "#60a5fa" :
                          "#c084fc"
                      }}>
                        {exp.payment_method}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: "700", color: "#ef4444", fontSize: "0.95rem", whiteSpace: "nowrap" }}>
                      -₹{Number(exp.amount).toFixed(2)}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center", whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => handleDeleteExpense(exp.id, exp.category, exp.amount)}
                        title="Delete expense voucher (Admin only)"
                        style={{
                          background: "rgba(239, 68, 68, 0.1)",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          color: "#f87171",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                          fontWeight: "600"
                        }}
                      >
                        Delete 🗑️
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Modal: Record New Expense */}
        {showExpenseModal && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 90,
            background: "rgba(0,0,0,0.8)",
            backdropFilter: "blur(5px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px"
          }}>
            <div style={{
              background: "var(--bg-modal)", boxShadow: "var(--shadow-modal)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "14px",
              padding: "26px",
              maxWidth: "460px",
              width: "100%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.6)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "1.15rem", fontWeight: "700", color: "var(--text-main)" }}>
                  Record Shop Expense Voucher
                </h3>
                <button
                  onClick={() => setShowExpenseModal(false)}
                  style={{ background: "transparent", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: "1.1rem" }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateExpenseSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "#9ca3af", display: "block", marginBottom: "4px" }}>
                    Category
                  </label>
                  <select
                    value={newExpenseCat}
                    onChange={(e) => setNewExpenseCat(e.target.value)}
                    style={{
                      width: "100%",
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: "8px",
                      padding: "9px 12px",
                      color: "var(--text-main)",
                      fontSize: "0.85rem",
                      outline: "none"
                    }}
                  >
                    <option value="Milk">🥛 Milk (Daily Dairy)</option>
                    <option value="Tea Powder">🍃 Tea Powder (Assam / CTC)</option>
                    <option value="Sugar">🍬 Sugar Wholesale</option>
                    <option value="Gas Cylinders">🔥 Gas Cylinders (Commercial LPG)</option>
                    <option value="Spices & Raw Materials">🌿 Spices (Ginger, Cardamom, Cloves)</option>
                    <option value="Cleaning & Packaging">📦 Packaging & Paper Cups</option>
                    <option value="Electricity">⚡ Electricity Bill</option>
                    <option value="Rent">🏠 Shop Premises Rent</option>
                    <option value="Staff Salary">👨‍🍳 Staff Salary / Daily Wages</option>
                    <option value="Maintenance">🔧 Maintenance & Filter Service</option>
                    <option value="Other">🏷️ Other Miscellaneous</option>
                    <option value="Custom">+ Custom Category...</option>
                  </select>
                </div>

                {newExpenseCat === "Custom" && (
                  <div>
                    <label style={{ fontSize: "0.8rem", color: "#9ca3af", display: "block", marginBottom: "4px" }}>
                      Custom Category Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Ice Bags, Bakery Wholesale"
                      value={customCatInput}
                      onChange={(e) => setCustomCatInput(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        background: "rgba(255, 255, 255, 0.08)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        borderRadius: "8px",
                        padding: "8px 12px",
                        color: "var(--text-main)",
                        fontSize: "0.85rem",
                        outline: "none"
                      }}
                    />
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "0.8rem", color: "#9ca3af", display: "block", marginBottom: "4px" }}>
                      Amount (₹) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      placeholder="e.g. 1500"
                      value={newExpenseAmt}
                      onChange={(e) => setNewExpenseAmt(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        background: "rgba(255, 255, 255, 0.08)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        borderRadius: "8px",
                        padding: "8px 12px",
                        color: "var(--text-main)",
                        fontSize: "0.85rem",
                        outline: "none"
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "0.8rem", color: "#9ca3af", display: "block", marginBottom: "4px" }}>
                      Expense Date
                    </label>
                    <input
                      type="date"
                      value={newExpenseDate}
                      onChange={(e) => setNewExpenseDate(e.target.value)}
                      style={{
                        width: "100%",
                        background: "rgba(255, 255, 255, 0.08)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        borderRadius: "8px",
                        padding: "8px 12px",
                        color: "var(--text-main)",
                        fontSize: "0.85rem",
                        outline: "none"
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "0.8rem", color: "#9ca3af", display: "block", marginBottom: "4px" }}>
                    Payment Mode
                  </label>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {["CASH", "UPI", "CARD", "BANK_TRANSFER"].map((pm) => (
                      <button
                        key={pm}
                        type="button"
                        onClick={() => setNewExpenseMethod(pm)}
                        style={{
                          flex: 1,
                          padding: "6px 4px",
                          borderRadius: "6px",
                          fontSize: "0.75rem",
                          fontWeight: "700",
                          cursor: "pointer",
                          border: newExpenseMethod === pm ? "1px solid #ef4444" : "1px solid rgba(255, 255, 255, 0.1)",
                          background: newExpenseMethod === pm ? "rgba(239, 68, 68, 0.25)" : "rgba(255, 255, 255, 0.04)",
                          color: newExpenseMethod === pm ? "#fca5a5" : "#9ca3af"
                        }}
                      >
                        {pm === "BANK_TRANSFER" ? "BANK" : pm}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "0.8rem", color: "#9ca3af", display: "block", marginBottom: "4px" }}>
                    Description / Vendor Details *
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. 30 Litres fresh milk delivery from Nandini Dairy (Paid cash)"
                    value={newExpenseDesc}
                    onChange={(e) => setNewExpenseDesc(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      color: "var(--text-main)",
                      fontSize: "0.85rem",
                      outline: "none",
                      resize: "none"
                    }}
                  />
                </div>

                <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                  <button
                    type="submit"
                    style={{
                      flex: 1,
                      background: "linear-gradient(135deg, #ef4444, #dc2626)",
                      border: "none",
                      color: "#fff",
                      padding: "10px",
                      borderRadius: "8px",
                      fontWeight: "700",
                      cursor: "pointer",
                      fontSize: "0.9rem"
                    }}
                  >
                    Save Expense Voucher 💾
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowExpenseModal(false)}
                    style={{
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#d1d5db",
                      padding: "10px 16px",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontSize: "0.9rem"
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>

      {/* Phase 10: Financial Analytics, Daily P&L Reports & AI Sales Forecasting */}
      <section className="glass-panel" style={{ padding: "30px", marginBottom: "35px" }}>
        {/* Title & Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "24px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <span style={{ fontSize: "1.6rem" }}>📈</span>
              <h2 style={{ fontSize: "1.4rem", fontWeight: "700", color: "var(--text-main)" }}>
                Phase 10: Financial Analytics, Daily P&L Reports & AI Sales Forecasting (Sections 21–25)
              </h2>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "820px" }}>
              Executive financial intelligence: real-time sales revenue, cashflow reconciliation, net profit margins, credit debt exposure, product sales rankings, and NumPy-powered 7-day predictive demand forecasting.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              onClick={() => loadAnalyticsData(analyticsTab, selectedReportDate)}
              disabled={analyticsLoading}
              style={{
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                color: "#e5e7eb",
                padding: "8px 16px",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: "600",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              {analyticsLoading ? "Recalculating..." : "↻ Refresh Financials"}
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {analyticsError && (
          <div style={{
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid #ef4444",
            color: "#fca5a5",
            padding: "10px 16px",
            borderRadius: "8px",
            fontSize: "0.88rem",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <span>{analyticsError}</span>
            <button
              onClick={() => setAnalyticsError("")}
              style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer" }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Executive Dashboard KPI Cards (Section 22) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px", marginBottom: "26px" }}>
          {/* 1. Today's Sales */}
          <div style={{ background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.25)", borderRadius: "12px", padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <span style={{ fontSize: "0.75rem", color: "#fcd34d", fontWeight: "600", textTransform: "uppercase" }}>Today's Sales</span>
              <span style={{ fontSize: "1.1rem" }}>💰</span>
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "#f59e0b" }}>
              ₹{Number(dashboardSummary?.today_sales || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "4px" }}>
              {dashboardSummary?.today_orders || 0} orders booked today
            </div>
          </div>

          {/* 2. Real Cash Inflow (Section 21) */}
          <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "12px", padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <span style={{ fontSize: "0.75rem", color: "#6ee7b7", fontWeight: "600", textTransform: "uppercase" }}>Real Cashflow In</span>
              <span style={{ fontSize: "1.1rem" }}>💵</span>
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "#10b981" }}>
              ₹{Number(dashboardSummary?.cash_inflow_today || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Cash + UPI collected
            </div>
          </div>

          {/* 3. Today's Expenses */}
          <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: "12px", padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <span style={{ fontSize: "0.75rem", color: "#fca5a5", fontWeight: "600", textTransform: "uppercase" }}>Today's Outlays</span>
              <span style={{ fontSize: "1.1rem" }}>📉</span>
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "#ef4444" }}>
              ₹{Number(dashboardSummary?.today_expenses || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Milk, LPG, supplies
            </div>
          </div>

          {/* 4. Net Operating Profit & Margin */}
          <div style={{ background: Number(dashboardSummary?.today_profit || 0) >= 0 ? "rgba(34, 197, 94, 0.08)" : "rgba(239, 68, 68, 0.08)", border: `1px solid ${Number(dashboardSummary?.today_profit || 0) >= 0 ? "rgba(34, 197, 94, 0.25)" : "rgba(239, 68, 68, 0.25)"}`, borderRadius: "12px", padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <span style={{ fontSize: "0.75rem", color: Number(dashboardSummary?.today_profit || 0) >= 0 ? "#86efac" : "#fca5a5", fontWeight: "600", textTransform: "uppercase" }}>Net Profit</span>
              <span style={{ fontSize: "1.1rem" }}>{Number(dashboardSummary?.today_profit || 0) >= 0 ? "📈" : "🔻"}</span>
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: "800", color: Number(dashboardSummary?.today_profit || 0) >= 0 ? "#22c55e" : "#ef4444" }}>
              ₹{Number(dashboardSummary?.today_profit || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Margin: <strong>{dashboardSummary?.profit_margin_pct || 0}%</strong>
            </div>
          </div>

          {/* 5. Outstanding Customer Credit Debt */}
          <div style={{ background: "rgba(168, 85, 247, 0.08)", border: "1px solid rgba(168, 85, 247, 0.25)", borderRadius: "12px", padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <span style={{ fontSize: "0.75rem", color: "#d8b4fe", fontWeight: "600", textTransform: "uppercase" }}>Credit Debt Tab</span>
              <span style={{ fontSize: "1.1rem" }}>💳</span>
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "#a855f7" }}>
              ₹{Number(dashboardSummary?.total_outstanding_credit || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Today's tab: ₹{Number(dashboardSummary?.credit_sales_today || 0).toFixed(2)}
            </div>
          </div>

          {/* 6. Total Customers */}
          <div style={{ background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.25)", borderRadius: "12px", padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <span style={{ fontSize: "0.75rem", color: "#93c5fd", fontWeight: "600", textTransform: "uppercase" }}>Total Customers</span>
              <span style={{ fontSize: "1.1rem" }}>👥</span>
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: "800", color: "#3b82f6" }}>
              {dashboardSummary?.total_customers || 0}
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Registered accounts
            </div>
          </div>
        </div>

        {/* Tab Switcher Navigation */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", borderBottom: "1px solid rgba(255, 255, 255, 0.1)", paddingBottom: "12px", marginBottom: "20px" }}>
          {[
            { id: "daily", label: "📊 Daily P&L & Cash Flow", desc: "Reconciliation" },
            { id: "products", label: "☕ Best-Selling Products", desc: "Volume & Margin" },
            { id: "credit", label: "💳 Credit Risk & Debt Exposure", desc: "Audit Ledger" },
            { id: "forecast", label: "🤖 AI Demand & 7-Day Forecast", desc: "Predictive Analytics" },
            { id: "monthly", label: "📅 Monthly Performance", desc: "Trendlines" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleSelectAnalyticsTab(tab.id)}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "0.85rem",
                fontWeight: "700",
                cursor: "pointer",
                border: analyticsTab === tab.id ? "1px solid #10b981" : "1px solid rgba(255, 255, 255, 0.08)",
                background: analyticsTab === tab.id ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.03)",
                color: analyticsTab === tab.id ? "#10b981" : "#9ca3af",
                transition: "all 0.15s ease"
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Daily P&L & Cash Flow Statement */}
        {analyticsTab === "daily" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Filter Date Bar */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", background: "rgba(255, 255, 255, 0.03)", padding: "12px 16px", borderRadius: "8px" }}>
              <span style={{ fontSize: "0.85rem", color: "#d1d5db", fontWeight: "600" }}>P&L Statement Date:</span>
              <input
                type="date"
                value={selectedReportDate}
                onChange={(e) => setSelectedReportDate(e.target.value)}
                style={{
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "6px",
                  padding: "6px 12px",
                  color: "#fff",
                  fontSize: "0.85rem",
                  outline: "none"
                }}
              />
              <button
                onClick={() => loadAnalyticsData("daily", selectedReportDate)}
                style={{
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  border: "none",
                  color: "#fff",
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "0.82rem",
                  fontWeight: "700",
                  cursor: "pointer"
                }}
              >
                Generate Statement 📋
              </button>
              {selectedReportDate && (
                <button
                  onClick={() => {
                    setSelectedReportDate("");
                    loadAnalyticsData("daily", "");
                  }}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    color: "#9ca3af",
                    padding: "6px 10px",
                    borderRadius: "6px",
                    fontSize: "0.82rem",
                    cursor: "pointer"
                  }}
                >
                  Reset to Today
                </button>
              )}
            </div>

            {/* Daily Statement Financial Breakdown */}
            {dailyReport && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "18px" }}>
                {/* Left: Revenue & Inflow Reconciliation (Section 21) */}
                <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "12px", padding: "20px" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-main)", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>💵</span> Sales Revenue & Inflow (Section 21)
                  </h3>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.85rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <span style={{ color: "var(--text-muted)" }}>Total Gross Sales:</span>
                      <span style={{ fontWeight: "700", color: "#f59e0b" }}>₹{Number(dailyReport.total_sales).toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <span style={{ color: "var(--text-muted)" }}>Cash Received at Counter:</span>
                      <span style={{ fontWeight: "600", color: "#4ade80" }}>₹{Number(dailyReport.cash_collected).toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <span style={{ color: "var(--text-muted)" }}>UPI Received (QR Scan):</span>
                      <span style={{ fontWeight: "600", color: "#60a5fa" }}>₹{Number(dailyReport.upi_collected).toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <span style={{ color: "var(--text-muted)" }}>Card Payments:</span>
                      <span style={{ fontWeight: "600", color: "#c084fc" }}>₹{Number(dailyReport.card_collected).toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <span style={{ color: "var(--text-muted)" }}>Credit Sales (Uncollected Tab):</span>
                      <span style={{ fontWeight: "600", color: "#f472b6" }}>₹{Number(dailyReport.credit_sales).toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <span style={{ color: "var(--text-muted)" }}>Customer Debt Repayments Collected:</span>
                      <span style={{ fontWeight: "600", color: "#34d399" }}>₹{Number(dailyReport.credit_repayments).toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "8px", borderTop: "2px solid rgba(255, 255, 255, 0.12)", fontSize: "0.95rem" }}>
                      <span style={{ fontWeight: "700", color: "var(--text-main)" }}>Actual Real Money Inflow:</span>
                      <span style={{ fontWeight: "800", color: "#10b981" }}>₹{Number(dailyReport.total_actual_inflow).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Net Operating Profit & Unit Economics (Section 25) */}
                <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "12px", padding: "20px" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-main)", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>📉</span> Operational P&L & Bottom Line
                  </h3>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.85rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <span style={{ color: "var(--text-muted)" }}>Total Orders Completed:</span>
                      <span style={{ fontWeight: "700", color: "var(--text-main)" }}>{dailyReport.completed_orders} / {dailyReport.total_orders}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <span style={{ color: "var(--text-muted)" }}>Average Order Value (AOV):</span>
                      <span style={{ fontWeight: "600", color: "#38bdf8" }}>₹{Number(dailyReport.average_order_value).toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <span style={{ color: "var(--text-muted)" }}>Gross Sales Revenue:</span>
                      <span style={{ fontWeight: "700", color: "#f59e0b" }}>+₹{Number(dailyReport.total_sales).toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <span style={{ color: "var(--text-muted)" }}>Operating Expenses (Section 20):</span>
                      <span style={{ fontWeight: "700", color: "#ef4444" }}>-₹{Number(dailyReport.total_expenses).toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <span style={{ color: "var(--text-muted)" }}>Gross Profit Margin:</span>
                      <span style={{ fontWeight: "700", color: dailyReport.gross_margin_percentage >= 0 ? "#10b981" : "#ef4444" }}>
                        {dailyReport.gross_margin_percentage}%
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "8px", borderTop: "2px solid rgba(255, 255, 255, 0.12)", fontSize: "0.95rem" }}>
                      <span style={{ fontWeight: "700", color: "var(--text-main)" }}>Net Operating Profit:</span>
                      <span style={{ fontWeight: "800", color: Number(dailyReport.net_profit) >= 0 ? "#22c55e" : "#ef4444" }}>
                        ₹{Number(dailyReport.net_profit).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Hourly Customer Traffic & Peak Time Histogram */}
            {dailyReport && dailyReport.hourly_distribution && (
              <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "12px", padding: "18px" }}>
                <div style={{ fontSize: "0.9rem", fontWeight: "700", color: "#e5e7eb", marginBottom: "14px" }}>
                  ⏱️ Peak Hours Hourly Traffic & Sales Velocity
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(50px, 1fr))", gap: "6px", alignItems: "flex-end", minHeight: "120px", paddingTop: "20px" }}>
                  {dailyReport.hourly_distribution.map((h) => {
                    const maxSales = Math.max(...dailyReport.hourly_distribution.map(x => Number(x.sales_amount)), 100);
                    const heightPct = Math.max((Number(h.sales_amount) / maxSales) * 100, 6);
                    return (
                      <div key={h.hour} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                        <div style={{ fontSize: "0.68rem", color: "#9ca3af", fontWeight: "600" }}>
                          {Number(h.sales_amount) > 0 ? `₹${Math.round(h.sales_amount)}` : ""}
                        </div>
                        <div style={{
                          width: "100%",
                          height: `${heightPct}px`,
                          background: Number(h.sales_amount) > 0 ? "linear-gradient(180deg, #10b981, #059669)" : "rgba(255, 255, 255, 0.05)",
                          borderRadius: "4px 4px 0 0",
                          transition: "height 0.3s ease"
                        }} />
                        <div style={{ fontSize: "0.65rem", color: "#6b7280" }}>
                          {h.hour}h
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Best-Selling Products Performance (Section 23, 24) */}
        {analyticsTab === "products" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "0.95rem", fontWeight: "700", color: "var(--text-main)" }}>
                Menu Product Sales & Volume Contribution
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Total Items Tracked: <strong>{productReport?.total_menu_items_tracked || 0}</strong> | Total Units Sold: <strong>{productReport?.total_products_sold || 0}</strong>
              </div>
            </div>

            <div style={{ background: "rgba(255, 255, 255, 0.02)", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.06)", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ background: "rgba(255, 255, 255, 0.04)", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", textAlign: "left" }}>
                    <th style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: "600" }}>RANK</th>
                    <th style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: "600" }}>PRODUCT</th>
                    <th style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: "600" }}>CATEGORY</th>
                    <th style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: "600", textAlign: "right" }}>PRICE</th>
                    <th style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: "600", textAlign: "right" }}>UNITS SOLD</th>
                    <th style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: "600", textAlign: "right" }}>TOTAL REVENUE</th>
                    <th style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: "600", textAlign: "right" }}>% SHARE</th>
                  </tr>
                </thead>
                <tbody>
                  {!productReport || productReport.top_performers.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: "30px", textAlign: "center", color: "var(--text-muted)" }}>
                        No product sales records found yet.
                      </td>
                    </tr>
                  ) : (
                    productReport.top_performers.map((item, idx) => (
                      <tr key={item.item_id ? `item-${item.item_id}` : `top-performer-${item.name}-${idx}`} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                        <td style={{ padding: "12px 16px", fontWeight: "800", color: idx === 0 ? "#f59e0b" : idx === 1 ? "#9ca3af" : idx === 2 ? "#d97706" : "#6b7280" }}>
                          #{idx + 1}
                        </td>
                        <td style={{ padding: "12px 16px", fontWeight: "700", color: "var(--text-main)" }}>
                          {item.name}
                        </td>
                        <td style={{ padding: "12px 16px", color: "#9ca3af" }}>
                          {item.category_name}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", color: "#d1d5db" }}>
                          ₹{Number(item.price).toFixed(2)}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: "700", color: "#38bdf8" }}>
                          {item.quantity_sold} cups
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: "800", color: "#10b981" }}>
                          ₹{Number(item.total_revenue).toFixed(2)}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                          <span style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", padding: "2px 8px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "700" }}>
                            {item.revenue_percentage}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Credit Risk & Debt Exposure Ledger (Section 19, 24) */}
        {analyticsTab === "credit" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* Credit Risk Meter Row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
              <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "10px", padding: "14px" }}>
                <div style={{ fontSize: "0.75rem", color: "#9ca3af", textTransform: "uppercase" }}>Approved Credit Limit</div>
                <div style={{ fontSize: "1.4rem", fontWeight: "800", color: "#3b82f6", marginTop: "4px" }}>
                  ₹{Number(creditReport?.total_approved_limit || 0).toFixed(2)}
                </div>
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "10px", padding: "14px" }}>
                <div style={{ fontSize: "0.75rem", color: "#9ca3af", textTransform: "uppercase" }}>Total Outstanding Debt</div>
                <div style={{ fontSize: "1.4rem", fontWeight: "800", color: "#ef4444", marginTop: "4px" }}>
                  ₹{Number(creditReport?.total_outstanding_debt || 0).toFixed(2)}
                </div>
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "10px", padding: "14px" }}>
                <div style={{ fontSize: "0.75rem", color: "#9ca3af", textTransform: "uppercase" }}>Available Credit Buffer</div>
                <div style={{ fontSize: "1.4rem", fontWeight: "800", color: "#10b981", marginTop: "4px" }}>
                  ₹{Number(creditReport?.total_available_credit || 0).toFixed(2)}
                </div>
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "10px", padding: "14px" }}>
                <div style={{ fontSize: "0.75rem", color: "#9ca3af", textTransform: "uppercase" }}>High-Risk Accounts (≥80%)</div>
                <div style={{ fontSize: "1.4rem", fontWeight: "800", color: creditReport?.high_risk_customers_count > 0 ? "#f59e0b" : "#10b981", marginTop: "4px" }}>
                  {creditReport?.high_risk_customers_count || 0} customers
                </div>
              </div>
            </div>

            {/* Customer Debt Exposure Table */}
            <div style={{ background: "rgba(255, 255, 255, 0.02)", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.06)", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ background: "rgba(255, 255, 255, 0.04)", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", textAlign: "left" }}>
                    <th style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: "600" }}>CUSTOMER</th>
                    <th style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: "600" }}>MOBILE</th>
                    <th style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: "600", textAlign: "right" }}>APPROVED LIMIT</th>
                    <th style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: "600", textAlign: "right" }}>OUTSTANDING DEBT</th>
                    <th style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: "600", textAlign: "right" }}>AVAILABLE</th>
                    <th style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: "600", textAlign: "right" }}>UTILIZATION</th>
                    <th style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: "600", textAlign: "center" }}>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {!creditReport || creditReport.customer_debts.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: "30px", textAlign: "center", color: "var(--text-muted)" }}>
                        No credit-enabled customer accounts found.
                      </td>
                    </tr>
                  ) : (
                    creditReport.customer_debts.map((c, idx) => (
                      <tr key={c.customer_id ? `cust-${c.customer_id}` : `debt-${c.mobile_number || idx}`} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                        <td style={{ padding: "12px 16px", fontWeight: "700", color: "var(--text-main)" }}>
                          {c.customer_name}
                        </td>
                        <td style={{ padding: "12px 16px", color: "#9ca3af" }}>
                          {c.mobile_number}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", color: "#d1d5db" }}>
                          ₹{Number(c.credit_limit).toFixed(2)}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: "800", color: Number(c.current_balance) > 0 ? "#ef4444" : "#9ca3af" }}>
                          ₹{Number(c.current_balance).toFixed(2)}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", color: "#10b981", fontWeight: "600" }}>
                          ₹{Number(c.available_credit).toFixed(2)}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                          <span style={{ fontWeight: "700", color: c.is_high_risk ? "#f87171" : "#d1d5db" }}>
                            {c.utilization_percentage}%
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "center" }}>
                          <span style={{
                            padding: "3px 8px",
                            borderRadius: "12px",
                            fontSize: "0.72rem",
                            fontWeight: "700",
                            background: c.is_high_risk ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                            color: c.is_high_risk ? "#f87171" : "#10b981",
                            border: `1px solid ${c.is_high_risk ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`
                          }}>
                            {c.is_high_risk ? "⚠️ HIGH RISK" : "✅ HEALTHY"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: AI Demand & 7-Day Sales Forecast (Phase 15) */}
        {analyticsTab === "forecast" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Model Badge */}
            <div style={{ background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.2)", borderRadius: "10px", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <div style={{ fontSize: "0.95rem", fontWeight: "700", color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>🤖</span> AI Sales Forecasting & Demand Engine (Phase 15)
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  Model: {forecastData?.forecast_model || "NumPy Linear Regression + Seasonality"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>Projected 7-Day Revenue:</div>
                <div style={{ fontSize: "1.3rem", fontWeight: "800", color: "#10b981" }}>
                  ₹{Number(forecastData?.total_projected_weekly_revenue || 0).toFixed(2)}
                </div>
              </div>
            </div>

            {/* 7-Day Daily Forecast Cards */}
            {forecastData && forecastData.seven_day_forecast && (
              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: "700", color: "#e5e7eb", marginBottom: "12px" }}>
                  📅 7-Day Day-by-Day Revenue & Cup Projections
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px" }}>
                  {forecastData.seven_day_forecast.map((pt, idx) => (
                    <div key={idx} style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "10px", padding: "12px", textAlign: "center" }}>
                      <div style={{ fontSize: "0.75rem", color: "#9ca3af", fontWeight: "600" }}>{pt.day_name}</div>
                      <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>{pt.date}</div>
                      <div style={{ fontSize: "1.15rem", fontWeight: "800", color: "#f59e0b", margin: "6px 0" }}>
                        ₹{Number(pt.predicted_sales).toFixed(0)}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "#38bdf8", fontWeight: "600" }}>
                        ☕ ~{pt.predicted_cups} cups
                      </div>
                      <div style={{ fontSize: "0.65rem", color: "#6b7280", marginTop: "4px" }}>
                        ±₹{Math.round(Number(pt.confidence_upper) - Number(pt.predicted_sales))} band
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Raw Material Demand & Reorder Alerts */}
            {forecastData && forecastData.raw_material_demand && (
              <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "12px", padding: "18px" }}>
                <div style={{ fontSize: "0.9rem", fontWeight: "700", color: "var(--text-main)", marginBottom: "12px" }}>
                  📦 AI Inventory Demand & Reorder Requirements (Based on Projected Consumption)
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                  {forecastData.raw_material_demand.map((mat, idx) => (
                    <div key={idx} style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "10px", padding: "14px" }}>
                      <div style={{ fontWeight: "700", color: "var(--text-main)", fontSize: "0.88rem" }}>{mat.material_name}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginTop: "8px", color: "var(--text-muted)" }}>
                        <span>Daily Need:</span>
                        <span style={{ fontWeight: "600", color: "var(--text-main)" }}>{mat.estimated_daily_need} {mat.unit}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginTop: "4px", color: "var(--text-muted)" }}>
                        <span>7-Day Need:</span>
                        <span style={{ fontWeight: "700", color: "#10b981" }}>{mat.estimated_weekly_need} {mat.unit}</span>
                      </div>
                      <div style={{ marginTop: "10px" }}>
                        <span style={{
                          display: "inline-block",
                          fontSize: "0.68rem",
                          fontWeight: "700",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background: mat.reorder_recommended ? "rgba(245, 158, 11, 0.15)" : "rgba(16, 185, 129, 0.15)",
                          color: mat.reorder_recommended ? "#fcd34d" : "#6ee7b7"
                        }}>
                          {mat.reorder_recommended ? "⚠️ PROCURING SOON" : "✅ SUFFICIENT"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Monthly Performance (Section 24) */}
        {analyticsTab === "monthly" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {monthlyReport && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                  <div style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-main)" }}>
                    {monthlyReport.month_name} {monthlyReport.year} Financial Performance
                  </div>
                  <div style={{ display: "flex", gap: "16px", fontSize: "0.85rem" }}>
                    <span>Sales: <strong style={{ color: "#f59e0b" }}>₹{Number(monthlyReport.total_sales).toFixed(2)}</strong></span>
                    <span>Expenses: <strong style={{ color: "#ef4444" }}>₹{Number(monthlyReport.total_expenses).toFixed(2)}</strong></span>
                    <span>Net Profit: <strong style={{ color: "#10b981" }}>₹{Number(monthlyReport.net_profit).toFixed(2)}</strong></span>
                  </div>
                </div>

                <div style={{ background: "rgba(255, 255, 255, 0.02)", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.06)", overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ background: "rgba(255, 255, 255, 0.04)", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", textAlign: "left" }}>
                        <th style={{ padding: "10px 14px", color: "#9ca3af" }}>DATE</th>
                        <th style={{ padding: "10px 14px", color: "#9ca3af", textAlign: "right" }}>ORDERS</th>
                        <th style={{ padding: "10px 14px", color: "#9ca3af", textAlign: "right" }}>SALES</th>
                        <th style={{ padding: "10px 14px", color: "#9ca3af", textAlign: "right" }}>EXPENSES</th>
                        <th style={{ padding: "10px 14px", color: "#9ca3af", textAlign: "right" }}>NET PROFIT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyReport.daily_trend.map((d, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.03)" }}>
                          <td style={{ padding: "10px 14px", color: "#d1d5db" }}>{d.date}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", color: "#38bdf8" }}>{d.order_count}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: "600", color: "#f59e0b" }}>₹{Number(d.sales).toFixed(2)}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", color: "#ef4444" }}>₹{Number(d.expenses).toFixed(2)}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: "700", color: Number(d.net_profit) >= 0 ? "#10b981" : "#ef4444" }}>
                            ₹{Number(d.net_profit).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Next Up: Phase 11 */}
      <section className="glass-panel" style={{ padding: "26px", borderLeft: "4px solid #10b981" }}>
        <h2 style={{ fontSize: "1.15rem", fontWeight: "600", marginBottom: "8px" }}>
          Next Up: Phase 11 — Production Hardening, Containerization & Cloud Deployment
        </h2>
        <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
          With the complete core platform built across Phases 1–10 (Auth, Customers, Menu, QR Ordering, Token Engine, Payments & Billing, Expenses, and Executive Financial Analytics with AI Forecasting), Phase 11 will configure Docker containerization, production environment configs, and deployment guides.
        </p>
      </section>



    </main>
  );
}
