# 🚀 ChaiFlow - Production Deployment Guide

This guide explains how to deploy the ChaiFlow application to the internet so you and your staff can access it from tablets, phones, or computers anywhere.

---

## 🏗️ Architecture Overview

ChaiFlow consists of three layers:
1. **Database:** PostgreSQL (Stores orders, customers, menu items, khata ledger, and expenses).
2. **Backend API:** FastAPI / Python (Port 8000 — Business logic, auth, reports, AI forecast, OTP).
3. **Frontend Web App:** Next.js / React (Port 3000 — POS counter billing, KDS, customer ordering, admin dashboard).

---

## 🎯 Choose Your Deployment Path

| Path | Best For | Estimated Cost | Setup Difficulty |
| :--- | :--- | :--- | :--- |
| **Option 1: Cloud PaaS (Vercel + Render + Supabase/Neon)** | Easy setup, automatic SSL, zero Linux server management | **Free to ~$7/month** | ⭐ Easy (Recommended) |
| **Option 2: Single VPS with Docker Compose (DigitalOcean / AWS / Hetzner)** | All-in-one self-hosted server, low latency for physical shop, 100% data ownership | **~$4 to $6/month** | ⭐⭐ Moderate |

---

## 🌟 Option 1: Managed Cloud Services (Vercel + Render + Supabase)

### Step 1: Deploy PostgreSQL Database (Neon or Supabase)
1. Sign up at [Neon.tech](https://neon.tech) or [Supabase.com](https://supabase.com).
2. Create a new PostgreSQL database project named `chaiflow-db`.
3. Copy the **Postgres Connection URI** string:
   ```text
   postgresql://user:password@ep-sample-1234.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

### Step 2: Deploy FastAPI Backend (Render.com or Railway)
1. Push your repository to **GitHub**.
2. Sign up at [Render.com](https://render.com) and click **New + ➔ Web Service**.
3. Connect your GitHub repository:
   - **Root Directory:** `backend`
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add **Environment Variables** in Render dashboard:
   - `DATABASE_URL`: *(Your Postgres connection string from Step 1)*
   - `SECRET_KEY`: *(Generate a random 32-character string)*
   - `ENVIRONMENT`: `production`
   - `CORS_ORIGINS`: `https://your-frontend-domain.vercel.app`
   - `SMS_PROVIDER`: `console` *(or `fast2sms` / `twilio` with API keys)*
   - `ADMIN_REGISTRATION_SECRET`: `YOUR_SECRET_PHRASE`
5. Click **Create Web Service**.
6. Once deployed, run the database migrations and seed script using the Render Shell tab:
   ```bash
   alembic upgrade head
   python scripts/seed_admin.py
   ```
7. Note down your backend URL (e.g. `https://chaiflow-api.onrender.com`).

### Step 3: Deploy Next.js Frontend (Vercel)
1. Sign up at [Vercel.com](https://vercel.com) and click **Add New Project**.
2. Select your GitHub repository.
3. In project settings:
   - **Root Directory:** click Edit and select `frontend`.
   - **Framework Preset:** `Next.js` (automatically detected).
4. Add **Environment Variables**:
   - `NEXT_PUBLIC_API_URL`: `https://chaiflow-api.onrender.com` *(your backend URL from Step 2)*
   - `BACKEND_INTERNAL_URL`: `https://chaiflow-api.onrender.com`
5. Click **Deploy**.
6. Vercel will give you a live domain (e.g. `https://chaiflow.vercel.app`) with automatic SSL/HTTPS.
7. Return to Render and update `CORS_ORIGINS` to include your new Vercel domain!

---

## 🐳 Option 2: Single VPS Cloud Server with Docker (DigitalOcean / AWS / Hetzner)

If you prefer having the entire app and database running together on one virtual private server:

### Step 1: Create a VPS
1. Create an **Ubuntu 24.04 LTS** server (1 GB or 2 GB RAM) on DigitalOcean ($4–$6/mo), Hetzner, or AWS Lightsail.
2. Connect via SSH:
   ```bash
   ssh root@your_server_ip
   ```

### Step 2: Install Docker & Docker Compose
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose git
sudo systemctl enable --now docker
```

### Step 3: Clone Code & Configure Environment
```bash
git clone https://github.com/your-username/chaiflow.git
cd chaiflow
```

Edit `docker-compose.yml` to set your secure passwords and production secrets:
```bash
nano docker-compose.yml
```

### Step 4: Start the Entire Stack
```bash
# Build and launch database, backend, and frontend containers in background
docker-compose up -d --build

# Run initial migrations and seed admin user
docker-compose exec backend alembic upgrade head
docker-compose exec backend python scripts/seed_admin.py
```

### Step 5: (Optional) Point Domain & Enable Free SSL with Nginx / Caddy
Install Caddy for 1-minute automatic HTTPS:
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy -y
```

Edit `/etc/caddy/Caddyfile`:
```caddy
yourdomain.com {
    reverse_proxy localhost:3000
}

api.yourdomain.com {
    reverse_proxy localhost:8000
}
```
Reload Caddy:
```bash
sudo systemctl reload caddy
```
Caddy will automatically obtain free Let's Encrypt SSL certificates for you!

---

## 🔑 Production Environment Checklist

Before opening the app to customers and staff in production, ensure these items are configured:

1. **Change Default Passwords:**
   - Change the seeded default admin password (`admin123`) inside the `/admin/settings` page or run a custom update script.
2. **Set a Strong JWT Secret:**
   - In backend `.env`, set `SECRET_KEY` to a random 64-character hex key (e.g. `openssl rand -hex 32`).
3. **CORS Origins:**
   - Ensure backend `CORS_ORIGINS` includes your production frontend URL (e.g. `https://chaiflow.yourdomain.com`).
4. **Live SMS for Customer OTP (Optional):**
   - If using live SMS for customer order verification and credit alerts, set `SMS_PROVIDER=fast2sms` or `SMS_PROVIDER=twilio` and provide the API credentials in backend `.env`.
   - If left as `console`, OTP codes are logged in server output and mock-verified.
