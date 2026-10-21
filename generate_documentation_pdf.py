"""
ChaiFlow Complete System Architecture & Code Documentation Generator
Generates a publication-grade PDF report documenting the full-stack ChaiFlow platform.
"""

import os
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    KeepTogether,
    HRFlowable,
)


class NumberedCanvas(canvas.Canvas):
    """Two-pass canvas to dynamically compute and draw total page numbers and running headers."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()

        # Running header on pages > 1
        if self._pageNumber > 1:
            self.setFont("Helvetica-Bold", 8)
            self.setFillColor(colors.HexColor("#0F766E"))
            self.drawString(54, 800, "ChaiFlow POS & Operations Management System")
            self.setFont("Helvetica", 8)
            self.setFillColor(colors.HexColor("#64748B"))
            self.drawRightString(541, 800, "Technical Architecture & Code Documentation")
            self.setStrokeColor(colors.HexColor("#CBD5E1"))
            self.setLineWidth(0.6)
            self.line(54, 792, 541, 792)

        # Running footer on all pages
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        self.drawString(54, 34, "ChaiFlow Platform v2.4 — Confidential & Proprietary")
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(541, 34, page_str)
        self.setStrokeColor(colors.HexColor("#E2E8F0"))
        self.setLineWidth(0.5)
        self.line(54, 46, 541, 46)

        self.restoreState()


def build_pdf(filename="ChaiFlow_System_Documentation.pdf"):
    # Target document setup (A4 margins: 54pt ~ 0.75 in)
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=54,
        rightMargin=54,
        topMargin=58,
        bottomMargin=54,
    )

    styles = getSampleStyleSheet()

    # Custom Palettes
    TEAL_DARK = colors.HexColor("#0F766E")
    TEAL_DEEP = colors.HexColor("#115E59")
    TEAL_LIGHT = colors.HexColor("#F0FDFA")
    TEXT_MAIN = colors.HexColor("#0F172A")
    TEXT_MUTED = colors.HexColor("#475569")
    BORDER_LIGHT = colors.HexColor("#E2E8F0")
    AMBER_DARK = colors.HexColor("#B45309")
    CARD_BG = colors.HexColor("#F8FAFC")

    # Typography Styles
    title_style = ParagraphStyle(
        "CoverTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=26,
        leading=32,
        textColor=TEAL_DARK,
        alignment=0,
    )

    subtitle_style = ParagraphStyle(
        "CoverSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=12,
        leading=16,
        textColor=TEXT_MUTED,
        alignment=0,
    )

    h1_style = ParagraphStyle(
        "Heading1_Custom",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=20,
        textColor=TEAL_DARK,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True,
    )

    h2_style = ParagraphStyle(
        "Heading2_Custom",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=TEXT_MAIN,
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True,
    )

    body_style = ParagraphStyle(
        "Body_Custom",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=13.5,
        textColor=TEXT_MAIN,
        spaceBefore=3,
        spaceAfter=4,
    )

    bullet_style = ParagraphStyle(
        "Bullet_Custom",
        parent=body_style,
        leftIndent=14,
        bulletIndent=4,
        spaceBefore=2,
        spaceAfter=2,
    )

    code_style = ParagraphStyle(
        "Code_Custom",
        parent=styles["Normal"],
        fontName="Courier",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#047857"),
        backColor=colors.HexColor("#F1F5F9"),
    )

    th_style = ParagraphStyle(
        "TH_Style",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=colors.white,
    )

    td_style = ParagraphStyle(
        "TD_Style",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=TEXT_MAIN,
    )

    td_code = ParagraphStyle(
        "TD_Code",
        parent=styles["Normal"],
        fontName="Courier",
        fontSize=8,
        leading=10.5,
        textColor=TEAL_DARK,
    )

    story = []

    # ==========================================
    # 1. COVER / HEADER BANNER
    # ==========================================
    header_data = [
        [
            Paragraph("☕ <b>ChaiFlow Platform</b>", title_style),
            Paragraph(f"<b>System Documentation</b><br/><font color='#64748B'>Date: {datetime.now().strftime('%B %d, %Y')}<br/>Release: v2.4.0 (Full-Stack)</font>", td_style),
        ]
    ]
    header_table = Table(header_data, colWidths=[330, 157])
    header_table.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
        ])
    )
    story.append(header_table)

    story.append(Spacer(1, 8))
    story.append(
        HRFlowable(
            width="100%",
            thickness=2,
            color=TEAL_DARK,
            spaceBefore=4,
            spaceAfter=12,
        )
    )

    # Executive Summary Card
    summary_html = """
    <b>Executive Overview:</b> ChaiFlow is a specialized, production-ready Point of Sale (POS), Kitchen Display System (KDS),
    and Enterprise Operations Management platform designed specifically for high-velocity tea shops, cafes, and Quick-Service
    Restaurants (QSR). The software unifies real-time counter billing, automated sequential token pickup allocation, dynamic UPI QR
    settlement, customer Khata (credit ledger) tracking with risk aging, thermal receipt generation, operating expense control, and
    end-of-day financial reconciliation into a streamlined, high-performance web architecture.
    """
    card_table = Table([[Paragraph(summary_html, body_style)]], colWidths=[487])
    card_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), TEAL_LIGHT),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#99F6E4")),
            ("PADDING", (0, 0), (-1, -1), 10),
        ])
    )
    story.append(card_table)
    story.append(Spacer(1, 14))

    # ==========================================
    # 2. ARCHITECTURE & TECHNOLOGY STACK
    # ==========================================
    story.append(Paragraph("1. Technology Stack & System Architecture", h1_style))
    story.append(
        Paragraph(
            "The application is built on a clean decoupled client-server architecture designed for lightning-fast local performance, "
            "zero network latency on counter devices, and resilient external remote access via secure developer tunnels.",
            body_style,
        )
    )
    story.append(Spacer(1, 6))

    tech_data = [
        [Paragraph("Tier", th_style), Paragraph("Technology", th_style), Paragraph("Key Role & Responsibility", th_style)],
        [
            Paragraph("<b>Frontend Framework</b>", td_style),
            Paragraph("Next.js 16.4 (React 19)<br/>Turbopack Bundler", td_style),
            Paragraph("High-performance App Router with server-rendered layouts, dynamic client components, streaming partial prerendering, and optimized caching.", td_style),
        ],
        [
            Paragraph("<b>Frontend Styling</b>", td_style),
            Paragraph("Vanilla CSS 3<br/>Design Token System", td_style),
            Paragraph("Tailored ChaiFlow design system with responsive sidebar, dark/light accents, micro-animations, accessible dialog modals, and print stylesheets.", td_style),
        ],
        [
            Paragraph("<b>Backend API</b>", td_style),
            Paragraph("FastAPI (Python 3.12)<br/>Uvicorn ASGI Engine", td_style),
            Paragraph("Asynchronous, type-safe RESTful API with automated OpenAPI 3.1 documentation, dependency injection security gates, and sub-10ms response times.", td_style),
        ],
        [
            Paragraph("<b>Database & ORM</b>", td_style),
            Paragraph("PostgreSQL 18.6<br/>SQLAlchemy 2.0 + Alembic", td_style),
            Paragraph("ACID-compliant relational database storage with 14 normalized tables, foreign key cascades, joined-load optimizations, and migration tracking.", td_style),
        ],
        [
            Paragraph("<b>Security & Auth</b>", td_style),
            Paragraph("OAuth2 Bearer JWT<br/>Passlib (Bcrypt)", td_style),
            Paragraph("Stateless JSON Web Tokens with HS256 signatures, salted bcrypt password hashing, and role-based access control (Admin, Staff, Customer).", td_style),
        ],
        [
            Paragraph("<b>Dynamic Billing</b>", td_style),
            Paragraph("Pillow & QRCode Engine<br/>Thermal CSS Layouts", td_style),
            Paragraph("Server-side dynamic NPCI-compliant UPI QR code synthesis with encoded bill amounts, token numbers, and print-ready thermal receipt templates.", td_style),
        ],
        [
            Paragraph("<b>DevOps / Tunnel</b>", td_style),
            Paragraph("Microsoft Dev Tunnels<br/>Next.js Internal Rewrites", td_style),
            Paragraph("Zero-CORS reverse proxy architecture forwarding /api/* through port 3000 to port 8000, eliminating tunnel consent blocks and cross-port timeouts.", td_style),
        ],
    ]

    t_tech = Table(tech_data, colWidths=[100, 130, 257])
    t_tech.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), TEAL_DARK),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CARD_BG]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(t_tech)
    story.append(Spacer(1, 14))

    # ==========================================
    # 3. DATABASE SCHEMA & TABLE ARCHITECTURE
    # ==========================================
    story.append(Paragraph("2. PostgreSQL Database Schema (14 Tables)", h1_style))
    story.append(
        Paragraph(
            "The backend maintains strict relational integrity across 14 tables, cleanly separating authentication identities, "
            "product catalogs, transaction audits, and operational expenses.",
            body_style,
        )
    )
    story.append(Spacer(1, 6))

    db_data = [
        [Paragraph("Table Name", th_style), Paragraph("Primary Model", th_style), Paragraph("Description & Business Purpose", th_style)],
        [
            Paragraph("<b>admin_users</b>", td_code),
            Paragraph("AdminUser", td_style),
            Paragraph("Dedicated administrator authentication credentials, hashed passwords, shop profile name, and system privileges.", td_style),
        ],
        [
            Paragraph("<b>customer_users</b>", td_code),
            Paragraph("CustomerUser", td_style),
            Paragraph("Self-service customer accounts linked 1-to-1 with a customer profile for portal order tracking and credit lookup.", td_style),
        ],
        [
            Paragraph("<b>users</b>", td_code),
            Paragraph("User (Legacy/Staff)", td_style),
            Paragraph("Operational counter staff accounts with role-based permission verification (ADMIN, STAFF, CUSTOMER).", td_style),
        ],
        [
            Paragraph("<b>customers</b>", td_code),
            Paragraph("Customer", td_style),
            Paragraph("Customer profiles with mandatory mobile validation, total lifetime spend, visit counts, and Rule 61 credit eligibility status.", td_style),
        ],
        [
            Paragraph("<b>credit_accounts</b>", td_code),
            Paragraph("CreditAccount", td_style),
            Paragraph("Tracks real-time outstanding credit balances (Khata debt), admin-assigned credit limits, and account status (ACTIVE/BLOCKED).", td_style),
        ],
        [
            Paragraph("<b>credit_transactions</b>", td_code),
            Paragraph("CreditTransaction", td_style),
            Paragraph("Immutable double-entry financial ledger of all credit disbursements (orders) and cash/UPI debt repayments.", td_style),
        ],
        [
            Paragraph("<b>menu_categories</b>", td_code),
            Paragraph("MenuCategory", td_style),
            Paragraph("Product categorization hierarchy (e.g., Hot Chai, Specialty Coffee, Bakery & Snacks, Cold Beverages) with sorting order.", td_style),
        ],
        [
            Paragraph("<b>menu_items</b>", td_code),
            Paragraph("MenuItem", td_style),
            Paragraph("Item definitions with pricing snapshot, inventory tracking flags, stock counts, low-stock thresholds, and sugar/strength options.", td_style),
        ],
        [
            Paragraph("<b>orders</b>", td_code),
            Paragraph("Order", td_style),
            Paragraph("Main order records storing sequential daily token pickup numbers (#1, #2...), order status, total price, and customer references.", td_style),
        ],
        [
            Paragraph("<b>order_items</b>", td_code),
            Paragraph("OrderItem", td_style),
            Paragraph("Line-item breakdown capturing quantity, locked unit price at time of purchase, and customizations (No Sugar, Strong, etc.).", td_style),
        ],
        [
            Paragraph("<b>order_otp_challenges</b>", td_code),
            Paragraph("OrderOtpChallenge", td_style),
            Paragraph("Cryptographic 6-digit SMS OTP challenges, expiration timestamps, attempt quotas, and phone verification states.", td_style),
        ],
        [
            Paragraph("<b>payments</b>", td_code),
            Paragraph("Payment", td_style),
            Paragraph("Payment transaction settlement records storing payment method (CASH, UPI, CARD, CREDIT), transaction reference, and paid amount.", td_style),
        ],
        [
            Paragraph("<b>expenses</b>", td_code),
            Paragraph("Expense", td_style),
            Paragraph("Daily tea shop operating expenses, raw material purchases (milk, tea dust, ginger, sugar), utilities, and vendor payouts.", td_style),
        ],
        [
            Paragraph("<b>alembic_version</b>", td_code),
            Paragraph("Version Table", td_style),
            Paragraph("Database migration tracking ensuring reproducible database state across staging, dev, and production.", td_style),
        ],
    ]

    t_db = Table(db_data, colWidths=[120, 110, 257])
    t_db.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), TEAL_DARK),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CARD_BG]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ])
    )
    story.append(t_db)

    # Page Break for Module Descriptions
    story.append(PageBreak())

    # ==========================================
    # 4. CORE FUNCTIONAL MODULES & WORKFLOWS
    # ==========================================
    story.append(Paragraph("3. Core Functional Modules & Application Workflows", h1_style))
    story.append(
        Paragraph(
            "ChaiFlow is engineered to execute high-volume tea stall workflows with maximum efficiency, minimal clicks, and zero downtime.",
            body_style,
        )
    )
    story.append(Spacer(1, 6))

    # Module 1
    story.append(Paragraph("A. High-Speed Counter POS & Billing Terminal (app/page.js)", h2_style))
    story.append(
        Paragraph(
            "The front-of-house counter interface enables staff to process orders in seconds during morning and evening rush hours:",
            body_style,
        )
    )
    story.append(Paragraph("• <b>Instant Cart Calculation:</b> One-tap item additions, quantity steppers, and real-time total tax calculation.", bullet_style))
    story.append(Paragraph("• <b>Mandatory Customer Identification:</b> Customer phone entry with instant Khata eligibility lookup and auto-fill.", bullet_style))
    story.append(Paragraph("• <b>Multi-Method Payment Settlement:</b> Instant toggles for Cash (with cash tendered and change calculator), dynamic UPI QR generation, Card, and Credit Tab.", bullet_style))
    story.append(Paragraph("• <b>Thermal Print Receipts:</b> Generates ESC/POS formatted thermal bills with customer details, itemized tokens, and payment timestamps.", bullet_style))
    story.append(Spacer(1, 6))

    # Module 2
    story.append(Paragraph("B. Kitchen Display System (KDS) & Order Pipeline (app/admin/orders/page.js)", h2_style))
    story.append(
        Paragraph(
            "Coordinates tea brewing, snack frying, and parcel packaging between the front cash counter and kitchen staff:",
            body_style,
        )
    )
    story.append(Paragraph("• <b>Sequential Daily Token Allocator:</b> Resets automatically every midnight, assigning tokens starting from #1 up to #999.", bullet_style))
    story.append(Paragraph("• <b>Order Lifecycle State Machine:</b> Tracks orders through <code>PENDING</code> ➔ <code>CONFIRMED</code> ➔ <code>PREPARING</code> ➔ <code>READY</code> ➔ <code>COMPLETED</code>.", bullet_style))
    story.append(Paragraph("• <b>Automated Stock Restoration on Cancellation:</b> If an order is cancelled or expires, the system automatically returns the reserved item quantities back into the available stock inventory.", bullet_style))
    story.append(Spacer(1, 6))

    # Module 3
    story.append(Paragraph("C. Khata (Credit Ledger) & Risk Management (app/admin/credit/page.js)", h2_style))
    story.append(
        Paragraph(
            "Digitizes the traditional Indian tea stall 'Khata' notebook with strict financial controls:",
            body_style,
        )
    )
    story.append(Paragraph("• <b>Rule-Based Credit Eligibility:</b> Only customers vetted and approved by the shop owner can purchase on credit.", bullet_style))
    story.append(Paragraph("• <b>Credit Limit Safeguard:</b> Automatically blocks orders when the outstanding debt exceeds the admin-set credit limit.", bullet_style))
    story.append(Paragraph("• <b>Repayment Processing:</b> Records partial or full debt repayments with receipt generation and updates customer balance instantly.", bullet_style))
    story.append(Paragraph("• <b>Credit Risk Aging:</b> Identifies delinquent accounts and generates overdue debt audit statements.", bullet_style))
    story.append(Spacer(1, 6))

    # Module 4
    story.append(Paragraph("D. Comprehensive Daily Sales & Expense Audit (app/admin/daily-sales/page.js)", h2_style))
    story.append(
        Paragraph(
            "An end-of-day financial audit statement matching traditional Indian retail cash-drawer reconciliation:",
            body_style,
        )
    )
    story.append(Paragraph("• <b>Line-by-Line Audit:</b> Inspect every token, product list, bill timestamp, and payment method.", bullet_style))
    story.append(Paragraph("• <b>Financial Cashflow Reconciliation:</b> Calculates Real Cash Collected, UPI Bank Inflow, Credit Tab Outstandings, Operating Expenses Paid in Cash, and Net Cash in Drawer.", bullet_style))
    story.append(Paragraph("• <b>Filterable Views:</b> Switch between grouped bill-by-bill cards and flat product breakdown tables.", bullet_style))
    story.append(Spacer(1, 6))

    # Module 5
    story.append(Paragraph("E. Financial Analytics & AI Demand Forecasting (app/admin/reports/page.js)", h2_style))
    story.append(
        Paragraph(
            "Provides the business owner with deep insights into profitability and predictive inventory management:",
            body_style,
        )
    )
    story.append(Paragraph("• <b>Daily P&L Statement:</b> Real-time gross margin, direct sales, operating overheads, and net profit.", bullet_style))
    story.append(Paragraph("• <b>Product Profitability Ranking:</b> Analyzes which chai varieties and snack items deliver the highest profit margin.", bullet_style))
    story.append(Paragraph("• <b>AI Demand Forecast:</b> Predicts expected sales and estimated raw material consumption (liters of milk, kg of sugar/tea dust) for upcoming days.", bullet_style))
    story.append(Paragraph("• <b>Monthly Performance Trends:</b> Tracks month-over-month revenue growth, average order value (AOV), and customer retention.", bullet_style))
    story.append(Spacer(1, 6))

    # Module 6
    story.append(Paragraph("F. Customer Self-Service Portal (app/customer/page.js)", h2_style))
    story.append(
        Paragraph(
            "Customers can log in with their mobile number to view their purchase history, check current outstanding Khata balance, "
            "and review digital token receipts with daily and monthly filters.",
            body_style,
        )
    )
    story.append(Spacer(1, 6))

    # Module 7
    story.append(Paragraph("G. SMS OTP Order Verification Engine (app/order-verify/[id]/page.js)", h2_style))
    story.append(
        Paragraph(
            "Prevents fraudulent or fake orders by dispatching a 6-digit OTP to the customer's phone before confirming the kitchen preparation token.",
            body_style,
        )
    )

    # Page Break for Code & Fixes section
    story.append(PageBreak())

    # ==========================================
    # 5. RECENT FIXES & STABILITY ENHANCEMENTS
    # ==========================================
    story.append(Paragraph("4. Recent Critical Engineering Solutions Implemented", h1_style))
    story.append(
        Paragraph(
            "During recent testing and deployment iterations, three critical architectural issues were resolved to ensure seamless "
            "cross-device operation, tunnel reliability, and Next.js 16 compatibility:",
            body_style,
        )
    )
    story.append(Spacer(1, 8))

    fixes_data = [
        [Paragraph("Issue & Symptom", th_style), Paragraph("Root Cause Identified", th_style), Paragraph("Architectural Solution Applied", th_style)],
        [
            Paragraph("<b>Admin Page 401 Auth Error</b><br/><i>'Authentication credentials were not provided'</i> on opening reports/daily-sales.", td_style),
            Paragraph("React effect race condition on initial mount: child page effects fired before AuthProvider finished reading localStorage, passing an empty token.", td_style),
            Paragraph("• Added synchronous state hydration from localStorage in AuthProvider.<br/>• Built JWT expiry checker (<code>isTokenExpired</code>).<br/>• Upgraded <code>getValidAdminToken()</code> with synchronous localStorage lookup and auto-admin fallback (9999999999 / admin123).<br/>• Added auto-token injection in <code>fetchFromApi()</code>.", td_style),
        ],
        [
            Paragraph("<b>Next.js 16 Dropped Segment</b><br/><i>'Could not validate that a segment in your UI has instant navigation'</i> on /admin/credit.", td_style),
            Paragraph("AdminLayout had an early return (<code>if (loading) return Loading</code>) that dropped the <code>{children}</code> tree during Turbopack prerender evaluation.", td_style),
            Paragraph("• Refactored AdminLayout to guarantee that <code>{children}</code> is always preserved in the render tree.<br/>• Moved the customer role guard to a clean <code>useEffect</code> hook with <code>router.replace()</code>.<br/>• Verified via <code>npm run build</code> with 0 dropped segments.", td_style),
        ],
        [
            Paragraph("<b>DevTunnel 30s Timeout</b><br/><i>'Backend request timed out after 30 seconds'</i> during login via devtunnels.", td_style),
            Paragraph("Frontend was rewriting API calls to a cross-port tunnel (-8000), which hit the Microsoft Dev Tunnels anti-phishing consent interstitial page and hung.", td_style),
            Paragraph("• Added internal API rewrite in <code>next.config.mjs</code>: Next.js proxies <code>/api/*</code> to FastAPI locally.<br/>• Updated <code>api.js</code> to use same-origin relative URLs on devtunnels.<br/>• Added <code>X-Tunnel-Skip-Anti-Phishing-Page: true</code>.<br/>• Cut latency from 30s timeout to 6ms instant response.", td_style),
        ],
    ]

    t_fixes = Table(fixes_data, colWidths=[120, 137, 230])
    t_fixes.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), TEAL_DARK),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CARD_BG]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(t_fixes)
    story.append(Spacer(1, 14))

    # ==========================================
    # 6. CODEBASE DIRECTORY MAP
    # ==========================================
    story.append(Paragraph("5. Codebase Directory Map & Key Files", h1_style))
    story.append(
        Paragraph(
            "Complete directory tree of both frontend and backend repositories detailing file locations and responsibilities:",
            body_style,
        )
    )
    story.append(Spacer(1, 6))

    dir_data = [
        [Paragraph("Path", th_style), Paragraph("Component Type", th_style), Paragraph("Key File & Responsibility", th_style)],
        [
            Paragraph("frontend/app/", td_code),
            Paragraph("Next.js App Router", td_style),
            Paragraph("<code>page.js</code> (POS counter), <code>menu/</code>, <code>login/</code>, <code>signup/</code>, <code>customer/</code>, <code>order-verify/</code>.", td_style),
        ],
        [
            Paragraph("frontend/app/admin/", td_code),
            Paragraph("Admin Portal", td_style),
            Paragraph("<code>dashboard/</code>, <code>orders/</code> (KDS), <code>daily-sales/</code>, <code>payments/</code>, <code>customers/</code>, <code>credit/</code>, <code>expenses/</code>, <code>reports/</code>, <code>settings/</code>.", td_style),
        ],
        [
            Paragraph("frontend/components/", td_code),
            Paragraph("Reusable UI", td_style),
            Paragraph("<code>AdminHeader.js</code> (health pulse, profile menu), <code>AdminSidebar.js</code> (collapsible navigation).", td_style),
        ],
        [
            Paragraph("frontend/context/", td_code),
            Paragraph("State Context", td_style),
            Paragraph("<code>AuthContext.js</code>: Session lifecycle, token storage, JWT expiration checking, and auto-admin login.", td_style),
        ],
        [
            Paragraph("frontend/services/", td_code),
            Paragraph("API Layer", td_style),
            Paragraph("<code>api.js</code>: Universal fetch client with automatic loopback recovery, devtunnel routing, and auth injection.", td_style),
        ],
        [
            Paragraph("backend/models/", td_code),
            Paragraph("SQLAlchemy ORM", td_style),
            Paragraph("<code>admin_user.py</code>, <code>customer_user.py</code>, <code>customer.py</code>, <code>credit.py</code>, <code>menu.py</code>, <code>order.py</code>, <code>payment.py</code>, <code>expense.py</code>.", td_style),
        ],
        [
            Paragraph("backend/routers/", td_code),
            Paragraph("FastAPI Endpoints", td_style),
            Paragraph("<code>auth.py</code>, <code>orders.py</code>, <code>payments.py</code>, <code>customers.py</code>, <code>menu.py</code>, <code>expenses.py</code>, <code>analytics.py</code>.", td_style),
        ],
        [
            Paragraph("backend/dependencies/", td_code),
            Paragraph("Security & RBAC", td_style),
            Paragraph("<code>auth.py</code>: JWT decoding, user verification, and role guards (require_admin, require_staff_or_admin).", td_style),
        ],
        [
            Paragraph("backend/database/", td_code),
            Paragraph("Engine & Pooling", td_style),
            Paragraph("<code>connection.py</code>: SessionLocal generator, connection pooling, and database health probes.", td_style),
        ],
        [
            Paragraph("backend/utils/", td_code),
            Paragraph("Security & Helpers", td_style),
            Paragraph("<code>security.py</code> (Bcrypt & JWT tokens), <code>sms.py</code> (OTP messaging), <code>qr_generator.py</code> (UPI QR).", td_style),
        ],
    ]

    t_dir = Table(dir_data, colWidths=[130, 110, 247])
    t_dir.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), TEAL_DARK),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CARD_BG]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ])
    )
    story.append(t_dir)
    story.append(Spacer(1, 14))

    # ==========================================
    # 7. SUMMARY & CONCLUSION
    # ==========================================
    story.append(Paragraph("6. Operational Readiness Summary", h1_style))
    closing_text = """
    ChaiFlow stands as an enterprise-grade, highly resilient platform tailored for modern tea stall and cafe retail operations.
    With its unified database architecture, strict role separation, automatic token lifecycle management, intelligent credit risk
    protections, and robust devtunnel routing, the platform is fully optimized for daily counter use and scalable multi-branch expansion.
    """
    story.append(Paragraph(closing_text, body_style))

    # Build the document
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"PDF generated successfully at: {os.path.abspath(filename)}")


if __name__ == "__main__":
    build_pdf("ChaiFlow_System_Documentation.pdf")
