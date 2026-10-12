const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Universal fetch wrapper for API communication
 */
async function fetchFromApi(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      let errorMessage = `HTTP error ${response.status}`;
      if (errorData.detail) {
        if (typeof errorData.detail === "string") {
          errorMessage = errorData.detail;
        } else if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail
            .map((err) => {
              const field = Array.isArray(err.loc) ? err.loc.slice(1).join(".") : "";
              return field ? `${field}: ${err.msg}` : err.msg;
            })
            .join(", ");
        } else if (typeof errorData.detail === "object") {
          errorMessage = JSON.stringify(errorData.detail);
        }
      }
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    console.error(`API Call failed on [${endpoint}]:`, error);
    throw error;
  }
}

/**
 * Check backend and database health status
 */
export async function getHealthStatus() {
  return fetchFromApi("/api/health");
}

/**
 * Check backend connection test endpoint
 */
export async function testBackendConnection() {
  return fetchFromApi("/api/test");
}

/**
 * Get database schema and tables summary
 */
export async function getSchemaSummary() {
  return fetchFromApi("/api/schema");
}

/**
 * Get backend root details
 */
export async function getRootInfo() {
  return fetchFromApi("/");
}

// -------------------------------------------------------------
// Phase 3: Authentication API Services
// -------------------------------------------------------------

/**
 * Register a new customer via mobile phone number
 */
export async function registerCustomer({ mobile_number, name, password, email }) {
  return fetchFromApi("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ mobile_number, name, password, email: email || null }),
  });
}

/**
 * Register a new customer user (public)
 */
export async function signupCustomer({ full_name, mobile_number, email, password, confirm_password }) {
  return fetchFromApi("/api/auth/signup/customer", {
    method: "POST",
    body: JSON.stringify({
      full_name,
      mobile_number,
      email: email || null,
      password,
      confirm_password: confirm_password || password,
    }),
  });
}

/**
 * Register an admin user with secret authorization key
 */
export async function signupAdmin({ full_name, mobile_number, email, password, confirm_password, shop_name, admin_secret }) {
  return fetchFromApi("/api/auth/signup/admin", {
    method: "POST",
    body: JSON.stringify({
      full_name,
      mobile_number,
      email: email || null,
      password,
      confirm_password: confirm_password || password,
      shop_name: shop_name || "ChaiFlow Tea Shop",
      admin_secret,
    }),
  });
}

/**
 * Authenticate customer or admin with mobile number and password
 */
export async function loginUser({ mobile_number, password }) {
  return fetchFromApi("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ mobile_number, password }),
  });
}

/**
 * Fetch current authenticated user profile using Bearer token
 */
export async function getCurrentUser(token) {
  return fetchFromApi("/api/auth/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Verify admin-only route access
 */
export async function checkAdminAccess(token) {
  return fetchFromApi("/api/auth/admin-check", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Verify customer-only route access
 */
export async function checkCustomerAccess(token) {
  return fetchFromApi("/api/auth/customer-check", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Client logout
 */
export async function logoutUser() {
  return fetchFromApi("/api/auth/logout", {
    method: "POST",
  });
}

// -------------------------------------------------------------
// Phase 4: Customer Management API Services
// -------------------------------------------------------------

/**
 * List paginated customers with optional search and credit eligibility filtering (Admin/Staff)
 */
export async function getCustomers({ search = "", is_credit_eligible = null, page = 1, limit = 10 } = {}, token) {
  const params = new URLSearchParams();
  if (search) params.append("search", search);
  if (is_credit_eligible !== null && is_credit_eligible !== undefined && is_credit_eligible !== "") {
    params.append("is_credit_eligible", is_credit_eligible);
  }
  params.append("page", page);
  params.append("limit", limit);

  return fetchFromApi(`/api/customers?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Fast search / autocomplete customers for counter POS (Admin/Staff)
 */
export async function searchCustomers(query, token) {
  const params = new URLSearchParams({ q: query });
  return fetchFromApi(`/api/customers/search?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Fetch current authenticated customer's profile and credit balance
 */
export async function getMyCustomerProfile(token) {
  return fetchFromApi("/api/customers/me/profile", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Fetch customer details by ID (Admin, Staff, or Customer who owns it)
 */
export async function getCustomerById(id, token) {
  return fetchFromApi(`/api/customers/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}



/**
 * Fetch current customer's purchase history & credit summary
 */
export async function getMyCustomerHistory(params = {}, token) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      query.append(k, v);
    }
  });
  const qs = query.toString() ? `?${query.toString()}` : "";
  return fetchFromApi(`/api/customers/me/history${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

/**
 * Create walk-in counter customer (Admin/Staff)
 */
export async function createCustomer(data, token) {
  const payload = {
    name: data.name,
    phone: data.phone || data.mobile_number,
    email: data.email || null,
    is_credit_eligible: Boolean(data.is_credit_eligible),
    credit_limit: data.credit_limit || 0,
  };
  return fetchFromApi("/api/customers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Update basic customer profile information
 */
export async function updateCustomer(id, data, token) {
  return fetchFromApi(`/api/customers/${id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
}

/**
 * Rule 61: Admin-only toggle credit eligibility and set credit limit
 */
export async function updateCustomerCreditStatus(id, { is_credit_eligible, credit_limit }, token) {
  return fetchFromApi(`/api/customers/${id}/credit-status`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ is_credit_eligible, credit_limit }),
  });
}

/**
 * Delete customer record (Admin only)
 */
export async function deleteCustomer(id, token) {
  return fetchFromApi(`/api/customers/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}


/**
 * Fetch detailed customer purchase history, day-by-day orders, and credit ledger
 */
export async function getCustomerHistory(customerId, params = {}, token = null) {
  const query = new URLSearchParams();
  if (params.mode) query.append("mode", params.mode);
  if (params.date) query.append("date", params.date);
  if (params.month) query.append("month", params.month);
  if (params.year) query.append("year", params.year);
  if (params.search) query.append("search", params.search);
  if (params.payment_method) query.append("payment_method", params.payment_method);
  if (params.payment_status) query.append("payment_status", params.payment_status);
  if (params.credit_filter) query.append("credit_filter", params.credit_filter);
  if (params.page) query.append("page", params.page);
  if (params.limit) query.append("limit", params.limit);

  const q = query.toString() ? `?${query.toString()}` : "";
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return fetchFromApi(`/api/customers/${customerId}/history${q}`, { headers });
}

// -------------------------------------------------------------
// Phase 5: Menu Management API Services
// -------------------------------------------------------------

/**
 * List categories (Public / Admin)
 */
export async function getCategories(include_inactive = false) {
  return fetchFromApi(`/api/menu/categories?include_inactive=${include_inactive}`);
}

/**
 * Create a new category (Staff/Admin)
 */
export async function createCategory(data, token) {
  return fetchFromApi("/api/menu/categories", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

/**
 * Update a category (Staff/Admin)
 */
export async function updateCategory(id, data, token) {
  return fetchFromApi(`/api/menu/categories/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

/**
 * Delete a category (Admin only)
 */
export async function deleteCategory(id, token) {
  return fetchFromApi(`/api/menu/categories/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * List menu items with optional category and search filters (Public)
 */
export async function getMenuItems({ category_id = null, search = "", is_available = null, has_customizations = null } = {}) {
  const params = new URLSearchParams();
  if (category_id !== null && category_id !== undefined && category_id !== "") {
    params.append("category_id", category_id);
  }
  if (search) params.append("search", search);
  if (is_available !== null && is_available !== undefined && is_available !== "") {
    params.append("is_available", is_available);
  }
  if (has_customizations !== null && has_customizations !== undefined && has_customizations !== "") {
    params.append("has_customizations", has_customizations);
  }

  return fetchFromApi(`/api/menu/items?${params.toString()}`);
}

/**
 * Get single menu item details (Public)
 */
export async function getMenuItemById(id) {
  return fetchFromApi(`/api/menu/items/${id}`);
}

/**
 * Add a new product to menu (Staff/Admin)
 */
export async function createMenuItem(data, token) {
  return fetchFromApi("/api/menu/items", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

/**
 * Update product information (Staff/Admin)
 */
export async function updateMenuItem(id, data, token) {
  return fetchFromApi(`/api/menu/items/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

/**
 * Delete product from menu (Admin only)
 */
export async function deleteMenuItem(id, token) {
  return fetchFromApi(`/api/menu/items/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Fast toggle product availability (Staff/Admin)
 */
export async function toggleItemAvailability(id, is_available, token) {
  return fetchFromApi(`/api/menu/items/${id}/availability`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ is_available }),
  });
}

/**
 * Update daily stock units (Staff/Admin)
 */
export async function updateItemStock(id, available_quantity, token) {
  return fetchFromApi(`/api/menu/items/${id}/stock`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ available_quantity }),
  });
}

/**
 * Fetch full nested catalog tree for customer mobile QR menu (Public)
 */
export async function getMenuCatalog() {
  return fetchFromApi("/api/menu/catalog");
}

/**
 * Fetch QR table/counter ordering session info (Public)
 */
export async function getQrInfo({ table = null, counter = null } = {}) {
  const params = new URLSearchParams();
  if (table) params.append("table", table);
  if (counter) params.append("counter", counter);
  return fetchFromApi(`/api/menu/qr-info?${params.toString()}`);
}

// -------------------------------------------------------------
// Phase 7: Orders & Daily Token Engine API Services
// -------------------------------------------------------------

/**
 * Place a new customer order with automatic sequential daily token allocation
 */
export async function createOrder(orderData, token = null) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetchFromApi("/api/orders", {
    method: "POST",
    headers,
    body: JSON.stringify(orderData),
  });
}

/**
 * Fetch live queue of today's daily tokens for display and KDS
 */
export async function getTodayTokens() {
  return fetchFromApi("/api/orders/tokens/today");
}

/**
 * Fetch daily token statistics (latest token, pending, preparing, ready counts)
 */
export async function getDailyTokenStats() {
  return fetchFromApi("/api/orders/tokens/stats");
}

/**
 * Fetch logged-in customer's personal order history
 */
export async function getMyOrders(token) {
  return fetchFromApi("/api/orders/my-orders", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * List orders with status and date filters (Staff & Admin)
 */
export async function getOrdersList(params = {}, token) {
  const query = new URLSearchParams();
  if (params.page) query.append("page", params.page);
  if (params.limit) query.append("limit", params.limit);
  if (params.order_status) query.append("order_status", params.order_status);
  if (params.payment_status) query.append("payment_status", params.payment_status);
  if (params.payment_method) query.append("payment_method", params.payment_method);
  if (params.today_only) query.append("today_only", "true");
  if (params.search) query.append("search", params.search);

  return fetchFromApi(`/api/orders?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Fetch order details by database ID or order_number string
 */
export async function getOrderById(orderId, token = null) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetchFromApi(`/api/orders/${orderId}`, { headers });
}

/**
 * Transition order lifecycle status (Staff / Admin)
 */
export async function updateOrderStatus(orderId, order_status, token) {
  return fetchFromApi(`/api/orders/${orderId}/status`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ order_status }),
  });
}

/**
 * Update payment record status (Staff / Admin)
 */
export async function updateOrderPayment(orderId, { payment_status, transaction_reference = null }, token) {
  return fetchFromApi(`/api/orders/${orderId}/payment`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ payment_status, transaction_reference }),
  });
}

// -------------------------------------------------------------
// Phase 8: Payments & Counter Billing Engine API Services
// -------------------------------------------------------------

/**
 * Settle order bill at counter with cash tender calculation or UPI UTR (Staff & Admin)
 */
export async function settleOrderPayment(settleData, token) {
  return fetchFromApi("/api/payments/settle", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(settleData),
  });
}

/**
 * Record customer credit debt repayment at counter (Staff & Admin)
 */
export async function recordCreditRepayment(repaymentData, token) {
  return fetchFromApi("/api/payments/credit-repayment", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(repaymentData),
  });
}

/**
 * Fetch dynamic NPCI UPI QR payload and deep-link for an order
 */
export async function getOrderUpiQr(orderId) {
  return fetchFromApi(`/api/payments/upi-qr/${orderId}`);
}

/**
 * Fetch structured thermal bill receipt for counter 58mm/80mm printing
 */
export async function getBillReceipt(orderId) {
  return fetchFromApi(`/api/payments/receipt/${orderId}`);
}

/**
 * Fetch daily counter collection and shift summary (Section 21)
 */
export async function getCounterShiftSummary() {
  return fetchFromApi("/api/payments/counter-summary");
}

/**
 * List paginated payment transactions for accounting reconciliation (Staff & Admin)
 */
export async function getPaymentsList(params = {}, token) {
  const query = new URLSearchParams();
  if (params.page) query.append("page", params.page);
  if (params.limit) query.append("limit", params.limit);
  if (params.payment_method) query.append("payment_method", params.payment_method);
  if (params.payment_status) query.append("payment_status", params.payment_status);
  if (params.today_only) query.append("today_only", "true");

  return fetchFromApi(`/api/payments?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// -------------------------------------------------------------
// Phase 9: Shop Expenses & Operating Cost Management API Services
// -------------------------------------------------------------

/**
 * List & search shop operational expenses (Staff / Admin)
 */
export async function getExpenses(params = {}, token) {
  const query = new URLSearchParams();
  if (params.page) query.append("page", params.page);
  if (params.limit) query.append("limit", params.limit);
  if (params.category) query.append("category", params.category);
  if (params.payment_method) query.append("payment_method", params.payment_method);
  if (params.start_date) query.append("start_date", params.start_date);
  if (params.end_date) query.append("end_date", params.end_date);
  if (params.today_only) query.append("today_only", "true");
  if (params.search) query.append("search", params.search);

  return fetchFromApi(`/api/expenses?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Get distinct expense categories list (Staff / Admin)
 */
export async function getExpenseCategories(token) {
  return fetchFromApi("/api/expenses/categories", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Get expense analytics, today outlay, monthly outlay, category breakdown (Staff / Admin)
 */
export async function getExpenseAnalytics(token) {
  return fetchFromApi("/api/expenses/analytics", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Get single expense record by ID (Staff / Admin)
 */
export async function getExpenseById(id, token) {
  return fetchFromApi(`/api/expenses/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Record a new shop expense (Staff / Admin)
 */
export async function createExpense(data, token) {
  return fetchFromApi("/api/expenses", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

/**
 * Update an existing shop expense (Staff / Admin)
 */
export async function updateExpense(id, data, token) {
  return fetchFromApi(`/api/expenses/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

/**
 * Delete an expense record (Admin Only)
 */
export async function deleteExpense(id, token) {
  return fetchFromApi(`/api/expenses/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// -------------------------------------------------------------
// Phase 10: Financial Analytics, P&L Reports & AI Forecasting API Services
// -------------------------------------------------------------

/**
 * Get executive dashboard KPI summary (Section 22)
 */
export async function getDashboardSummary(token) {
  return fetchFromApi("/api/reports/summary", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Get daily P&L and cash reconciliation statement (Section 21, 24)
 */
export async function getDailyReport(reportDate = null, token) {
  const url = reportDate ? `/api/reports/daily?report_date=${reportDate}` : "/api/reports/daily";
  return fetchFromApi(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Get comprehensive daily sales, line-by-line bills, payments, credit and expenses audit report (dailysales.txt)
 */
export async function getDailySalesReport(reportDate = null, token) {
  const url = reportDate ? `/api/reports/daily-sales-report?report_date=${reportDate}` : "/api/reports/daily-sales-report";
  return fetchFromApi(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

/**
 * Get monthly sales, outlays, margins and daily trendline (Section 24)
 */
export async function getMonthlyReport(year = null, month = null, token) {
  const params = new URLSearchParams();
  if (year) params.append("year", year);
  if (month) params.append("month", month);
  const q = params.toString() ? `?${params.toString()}` : "";
  return fetchFromApi(`/api/reports/monthly${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Get product sales performance and margin ranking (Section 24)
 */
export async function getProductReport(token) {
  return fetchFromApi("/api/reports/products", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Get credit risk ledger and exposure debt analysis (Section 19, 24)
 */
export async function getCreditReport(token) {
  return fetchFromApi("/api/reports/credit", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Get AI sales and raw material demand forecast (Phase 15)
 */
export async function getSalesForecast(token) {
  return fetchFromApi("/api/reports/forecast", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export default {
  API_BASE_URL,
  getHealthStatus,
  testBackendConnection,
  getSchemaSummary,
  getRootInfo,
  registerCustomer,
  loginUser,
  getCurrentUser,
  checkAdminAccess,
  checkCustomerAccess,
  logoutUser,
  getCustomers,
  searchCustomers,
  getMyCustomerProfile,
  getCustomerById,
  createCustomer,
  updateCustomer,
  updateCustomerCreditStatus,
  getCustomerHistory,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getMenuItems,
  getMenuItemById,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleItemAvailability,
  updateItemStock,
  getMenuCatalog,
  getQrInfo,
  createOrder,
  getTodayTokens,
  getDailyTokenStats,
  getMyOrders,
  getOrdersList,
  getOrderById,
  updateOrderStatus,
  updateOrderPayment,
  settleOrderPayment,
  recordCreditRepayment,
  getOrderUpiQr,
  getBillReceipt,
  getCounterShiftSummary,
  getPaymentsList,
  getExpenses,
  getExpenseCategories,
  getExpenseAnalytics,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getDashboardSummary,
  getDailyReport,
  getDailySalesReport,
  getMonthlyReport,
  getProductReport,
  getCreditReport,
  getSalesForecast,
};





