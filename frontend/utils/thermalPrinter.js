/**
 * Utility for printing dedicated 80mm / 58mm POS thermal bill receipts and expense vouchers.
 * Uses an isolated hidden iframe to guarantee only the thermal receipt is sent
 * to the printer, preventing dashboard tables, sidebars, or whole pages from printing.
 */

function sanitizePaymentMethod(method) {
  if (!method) return "CASH";
  return String(method)
    .replace(/^PaymentMethod\./i, "")
    .replace(/^PaymentRecordMethod\./i, "")
    .replace(/^ExpensePaymentMethod\./i, "")
    .trim();
}

function sanitizePaymentStatus(status) {
  if (!status) return "PAID";
  return String(status)
    .replace(/^PaymentStatus\./i, "")
    .replace(/^PaymentRecordStatus\./i, "")
    .trim();
}

/**
 * Print customer order thermal bill receipt.
 * @param {Object} receipt - Structured receipt data
 * @param {Object} [options] - Print options ({ paperWidth: "80mm" | "58mm" })
 */
export function printThermalBill(receipt, options = {}) {
  if (!receipt) return;

  const paperWidth = options.paperWidth === "58mm" ? "58mm" : "80mm";
  const contentWidth = paperWidth === "58mm" ? "48mm" : "70mm";
  const fontSizeBase = paperWidth === "58mm" ? "9.5px" : "11px";

  // Find or create the isolated print iframe
  let iframe = document.getElementById("thermal-print-frame");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "thermal-print-frame";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);
  }

  const items = receipt.items || [];
  const itemsHtml = items.length > 0
    ? items.map((it) => {
        const itemTotal = it.total_price != null
          ? Number(it.total_price)
          : (it.total != null ? Number(it.total) : (Number(it.unit_price || 0) * Number(it.quantity || 1)));
        const unitPrice = it.unit_price != null
          ? Number(it.unit_price)
          : (it.quantity ? (itemTotal / it.quantity) : itemTotal);

        return `
          <div style="margin-bottom: 5px; width: 100%; box-sizing: border-box;">
            <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: ${fontSizeBase}; align-items: flex-start; width: 100%;">
              <span style="flex: 1.5; min-width: 0; text-align: left; padding-right: 4px; word-break: break-word;">${it.name || it.item_name || "Dish"}</span>
              <span style="flex-shrink: 0; text-align: center; color: #222; font-size: 10.5px; padding: 0 4px; white-space: nowrap;">
                ${it.quantity} × ₹${unitPrice.toFixed(2)}
              </span>
              <span style="flex-shrink: 0; text-align: right; font-weight: 800; min-width: 52px; white-space: nowrap;">
                ₹${itemTotal.toFixed(2)}
              </span>
            </div>
            ${it.customizations ? `<div style="font-size: 9.5px; color: #444; font-style: italic; padding-left: 2px;">${it.customizations}</div>` : ""}
          </div>
        `;
      }).join("")
    : `<div style="font-style: italic; text-align: center; padding: 6px 0;">No items in receipt</div>`;

  const totalAmount = Number(receipt.total_amount || 0).toFixed(2);
  const dateTimeStr = receipt.date_time || (receipt.created_at ? new Date(receipt.created_at).toLocaleString("en-IN") : new Date().toLocaleString("en-IN"));
  const refCode = receipt.transaction_reference || receipt.payment_reference || "";
  const paymentMethod = sanitizePaymentMethod(receipt.payment_method);
  const paymentStatus = sanitizePaymentStatus(receipt.payment_status);

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt - Token #${receipt.daily_token_number || receipt.token_number || ""}</title>
        <style>
          @page {
            size: auto;
            margin: 0mm;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            width: ${contentWidth};
            max-width: ${contentWidth};
            margin: 0 auto;
            padding: 2.5mm 2.5mm;
            font-family: 'Courier New', Courier, monospace, -apple-system, BlinkMacSystemFont, sans-serif;
            color: #000000;
            background: #FFFFFF;
            font-size: ${fontSizeBase};
            line-height: 1.35;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .center { text-align: center; }
          .bold { font-weight: 800; }
          .dashed { border-top: 1px dashed #000000; margin: 5px 0; }
          .row { display: flex; justify-content: space-between; width: 100%; box-sizing: border-box; }
          .token-banner {
            background: #EEEEEE;
            border: 1px solid #CCCCCC;
            padding: 4px;
            text-align: center;
            font-size: 14px;
            font-weight: 900;
            margin: 5px 0;
            letter-spacing: 0.5px;
          }
          .grid-header {
            display: flex;
            justifyContent: space-between;
            font-weight: 900;
            font-size: 10.5px;
            border-bottom: 1px solid #000000;
            padding-bottom: 2px;
            margin-bottom: 4px;
            width: 100%;
          }
        </style>
      </head>
      <body>
        <div class="center bold" style="font-size: 14px; letter-spacing: 0.5px;">
          ${receipt.shop_name || "ChaiFlow Tea Shop"}
        </div>
        <div class="center" style="font-size: 9.5px; color: #333;">
          ${receipt.tagline || "Authentic Spiced Chai & Irani Cafe Favorites"}
        </div>
        <div class="center" style="font-size: 9px; color: #444; margin-top: 1px;">
          ${receipt.shop_address || receipt.address || "12 Market Square, Station Road"}
        </div>
        ${(receipt.shop_phone || receipt.phone) ? `<div class="center" style="font-size: 9px; color: #444;">Phone: ${receipt.shop_phone || receipt.phone}</div>` : ""}
        ${receipt.fssai_license ? `<div class="center" style="font-size: 8.5px; color: #555;">FSSAI: ${receipt.fssai_license}</div>` : ""}

        <div class="token-banner">
          TOKEN #${receipt.daily_token_number || receipt.token_number || ""}
        </div>

        <div class="dashed"></div>

        <div class="row" style="font-size: 10px;">
          <span>Order: <strong>${receipt.order_number || ""}</strong></span>
          <span style="flex-shrink: 0; text-align: right;">${dateTimeStr}</span>
        </div>
        <div class="row" style="font-size: 10px; margin-top: 2px;">
          <span>Customer: <strong>${receipt.customer_name || "Guest"}</strong></span>
          <span>${receipt.table_or_counter || (receipt.seat_number ? `Seat ${receipt.seat_number}` : (receipt.table_number ? `Table ${receipt.table_number}` : "Counter"))}</span>
        </div>

        <div class="dashed"></div>

        <!-- Dish Items Table -->
        <div class="grid-header">
          <span style="flex: 1.5; text-align: left;">ITEM</span>
          <span style="flex-shrink: 0; text-align: center; min-width: 60px;">QTY × RATE</span>
          <span style="flex-shrink: 0; text-align: right; min-width: 52px;">AMOUNT</span>
        </div>

        ${itemsHtml}

        <div class="dashed"></div>

        <div class="row bold" style="font-size: 13px; margin: 3px 0;">
          <span>NET TOTAL:</span>
          <span style="flex-shrink: 0; text-align: right;">₹${totalAmount}</span>
        </div>

        <div class="row" style="font-size: 10px; margin-top: 2px;">
          <span>Payment Method:</span>
          <span style="flex-shrink: 0; font-weight: 700;">${paymentMethod} (${paymentStatus})</span>
        </div>
        ${refCode ? `<div style="font-size: 9.5px; color: #444; margin-top: 2px;">Ref: ${refCode}</div>` : ""}

        <div class="dashed"></div>

        <div class="center" style="font-size: 9.5px; font-style: italic; margin-top: 5px; word-break: break-word;">
          ${receipt.footer_message || "Thank you for visiting ChaiFlow! Please come again."}
        </div>
      </body>
    </html>
  `;

  try {
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }, 250);
  } catch (err) {
    console.error("Iframe thermal print error, falling back to window.print():", err);
    window.print();
  }
}

/**
 * Print operational expense / petty cash payment voucher on POS thermal printer.
 * @param {Object} expense - Expense record { expense_id, id, category, description, amount, payment_method, recorded_by, expense_date }
 * @param {Object} [options] - Print options ({ paperWidth: "80mm" | "58mm", shopName, address, phone })
 */
export function printExpenseThermalVoucher(expense, options = {}) {
  if (!expense) return;

  const paperWidth = options.paperWidth === "58mm" ? "58mm" : "80mm";
  const contentWidth = paperWidth === "58mm" ? "48mm" : "70mm";
  const fontSizeBase = paperWidth === "58mm" ? "9.5px" : "11px";

  let iframe = document.getElementById("thermal-print-frame");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "thermal-print-frame";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);
  }

  const voucherId = expense.expense_id || expense.id || "VOUCHER";
  const amountStr = Number(expense.amount || 0).toFixed(2);
  const method = sanitizePaymentMethod(expense.payment_method);
  const dateStr = expense.expense_date
    ? new Date(expense.expense_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Expense Voucher - EXP-${voucherId}</title>
        <style>
          @page {
            size: auto;
            margin: 0mm;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            width: ${contentWidth};
            max-width: ${contentWidth};
            margin: 0 auto;
            padding: 2.5mm 2.5mm;
            font-family: 'Courier New', Courier, monospace, -apple-system, BlinkMacSystemFont, sans-serif;
            color: #000000;
            background: #FFFFFF;
            font-size: ${fontSizeBase};
            line-height: 1.35;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .center { text-align: center; }
          .bold { font-weight: 800; }
          .dashed { border-top: 1px dashed #000000; margin: 5px 0; }
          .row { display: flex; justify-content: space-between; width: 100%; box-sizing: border-box; margin-bottom: 2px; }
          .voucher-banner {
            background: #EEEEEE;
            border: 1px solid #CCCCCC;
            padding: 4px;
            text-align: center;
            font-size: 13px;
            font-weight: 900;
            margin: 5px 0;
            letter-spacing: 0.5px;
          }
        </style>
      </head>
      <body>
        <div class="center bold" style="font-size: 14px; letter-spacing: 0.5px;">
          ${options.shopName || "ChaiFlow Tea Shop"}
        </div>
        <div class="center" style="font-size: 9px; color: #444; margin-top: 1px;">
          ${options.address || "12 Market Square, Station Road"}
        </div>
        <div class="center" style="font-size: 9px; color: #444;">
          PETTY CASH / STORE EXPENSE VOUCHER
        </div>

        <div class="voucher-banner">
          EXPENSE VOUCHER #EXP-${voucherId}
        </div>

        <div class="dashed"></div>

        <div class="row">
          <span>Date: <strong>${dateStr}</strong></span>
          <span>Time: ${timeStr}</span>
        </div>
        <div class="row">
          <span>Category:</span>
          <strong>${expense.category || "General Expense"}</strong>
        </div>
        <div class="row">
          <span>Payment Mode:</span>
          <strong>${method}</strong>
        </div>
        ${expense.recorded_by ? `
        <div class="row">
          <span>Recorded By:</span>
          <span>${expense.recorded_by}</span>
        </div>` : ""}

        <div class="dashed"></div>

        <div style="margin: 4px 0; font-size: 10px;">
          <div style="font-weight: 700; color: #333;">Description / Purpose:</div>
          <div style="margin-top: 2px; word-break: break-word; font-style: italic;">
            ${expense.description || "Operational procurement / store outlay"}
          </div>
        </div>

        <div class="dashed"></div>

        <div class="row bold" style="font-size: 14px; margin: 6px 0; padding: 4px 0; border: 1px solid #000; text-align: center; justify-content: center;">
          <span>PAID AMOUNT: ₹${amountStr}</span>
        </div>

        <div class="dashed"></div>

        <div style="margin-top: 14px; display: flex; justify-content: space-between; font-size: 9px;">
          <div style="text-align: center;">
            <div style="border-top: 1px solid #000; width: 22mm; margin: 0 auto; padding-top: 2px;">
              Authorized By
            </div>
          </div>
          <div style="text-align: center;">
            <div style="border-top: 1px solid #000; width: 22mm; margin: 0 auto; padding-top: 2px;">
              Receiver Sign
            </div>
          </div>
        </div>

        <div class="center" style="font-size: 8.5px; color: #555; margin-top: 8px; font-style: italic;">
          Internal Accounting Voucher — Store Cash Drawer Record
        </div>
      </body>
    </html>
  `;

  try {
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }, 250);
  } catch (err) {
    console.error("Expense voucher print error, falling back to window.print():", err);
    window.print();
  }
}
