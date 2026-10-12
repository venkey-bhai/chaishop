# ☕ ChaiFlow - Tea Shop POS & Management System

A full-stack, real-time Point of Sale (POS) and operations management platform designed for modern tea shops, cafes, and quick-service food businesses.

---

## 🌟 Key Features

- **⚡ Fast POS & Billing**
  - Instant order cart calculation with variant pricing and addons.
  - Multi-payment support: **Cash**, **UPI** (with dynamic server-side QR generation), **Card**, and **Khata (Credit Ledger)**.
  - Thermal bill receipt printing & invoice preview.
- **🍳 Kitchen Display System (KDS)**
  - Live order tracking pipeline: `Confirmed` ➔ `In Preparation (Brewing)` ➔ `Ready` ➔ `Completed`.
  - Itemized display with customer notes and token numbering.
- **📋 Menu Management**
  - Add, edit, disable, and manage menu items and categories.
  - Soft-deletion and referential integrity protection for historical orders.
- **📒 Customer & Khata Management**
  - Track customer contact information and credit accounts.
  - Log credit balance, record partial or full repayments, and view ledger history.
- **📊 Daily Sales & Expense Audit**
  - Comprehensive end-of-day financial reconciliation (Total sales, cash collections, UPI collections, expenses, operating surplus, net cash drawer flow).
  - Print-friendly A4/thermal layout and one-click CSV export.
- **🔐 Secure Authentication & Roles**
  - JWT token-based authentication.
  - Role-based access control for Admins and Counter Staff.

---

## 🛠️ Tech Stack

### Frontend
- **Framework:** Next.js 14 (React) with App Router
- **Styling:** Modern CSS with custom responsive layout & dark/light accents
- **Icons:** Lucide React
- **API Client:** Axios / Fetch with automatic token handling

### Backend
- **Framework:** FastAPI (Python 3.11+)
- **ORM & Database:** SQLAlchemy with PostgreSQL (`psycopg2`)
- **Authentication:** OAuth2 / JWT (python-jose, passlib with bcrypt)
- **Utilities:** `qrcode` & Pillow (dynamic UPI payment QR codes)

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v18 or newer)
- **Python** (v3.11 or newer)
- **PostgreSQL** database server

---

### 1. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv

# Windows:
.\venv\Scripts\activate
# Linux/macOS:
# source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env to set your PostgreSQL connection string and secrets:
# DATABASE_URL=postgresql://<user>:<password>@localhost:5432/teashop_db
# SECRET_KEY=your_secret_key

# Run the FastAPI server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
Backend API will be live at `http://localhost:8000` (Swagger docs at `http://localhost:8000/docs`).

---

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8000

# Start development server
npm run dev
```
Frontend web application will run at `http://localhost:3000`.

---

## 📂 Project Structure

```text
├── backend/
│   ├── database.py           # Database connection & session setup
│   ├── main.py               # FastAPI application entrypoint
│   ├── models/               # SQLAlchemy ORM models (Order, Menu, User, etc.)
│   ├── schemas/              # Pydantic validation schemas
│   ├── routers/              # API routes (menu, orders, payments, reports, etc.)
│   ├── requirements.txt      # Python dependencies
│   └── .env.example          # Sample backend configuration
├── frontend/
│   ├── app/                  # Next.js App Router pages
│   │   ├── admin/            # Admin dashboard (Menu, Orders, KDS, Daily Sales, Khata)
│   │   ├── billing/          # Cashier POS interface
│   │   └── login/            # Authentication
│   ├── components/           # Reusable UI components & navigation
│   ├── services/             # API service layer
│   ├── package.json          # Node dependencies
│   └── .env.example          # Sample frontend configuration
├── .gitignore                # Root git ignore rules
└── README.md
```

---

## 📄 License
This project is proprietary and intended for tea shop management and point of sale automation.
