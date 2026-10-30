-- =============================================================
-- ChaiFlow / Tea Shop Management System Database Schema
-- For Supabase SQL Editor
-- =============================================================

-- 1. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Custom Enum Types
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum') THEN CREATE TYPE user_role_enum AS ENUM ('ADMIN', 'STAFF', 'CUSTOMER'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method_enum') THEN CREATE TYPE payment_method_enum AS ENUM ('CASH', 'UPI', 'CARD', 'CREDIT'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status_enum') THEN CREATE TYPE payment_status_enum AS ENUM ('PENDING', 'PAID', 'FAILED'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status_enum') THEN CREATE TYPE order_status_enum AS ENUM ('PENDING_OTP_VERIFICATION', 'PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'VERIFICATION_EXPIRED'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'otp_challenge_status_enum') THEN CREATE TYPE otp_challenge_status_enum AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'MAX_ATTEMPTS_EXCEEDED', 'CANCELLED'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'credit_transaction_type_enum') THEN CREATE TYPE credit_transaction_type_enum AS ENUM ('DEBIT', 'PAYMENT_SETTLEMENT', 'CREDIT_ADJUSTMENT'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'expense_payment_method_enum') THEN CREATE TYPE expense_payment_method_enum AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CARD'); END IF; END $$;

-- 3. Tables
CREATE TABLE IF NOT EXISTS admin_users (
	id SERIAL NOT NULL, 
	full_name VARCHAR(100) NOT NULL, 
	mobile_number VARCHAR(15) NOT NULL, 
	email VARCHAR(120), 
	password_hash VARCHAR(255) NOT NULL, 
	shop_name VARCHAR(150), 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS customer_users (
	id SERIAL NOT NULL, 
	full_name VARCHAR(100) NOT NULL, 
	mobile_number VARCHAR(15) NOT NULL, 
	email VARCHAR(120), 
	password_hash VARCHAR(255) NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS menu_categories (
	id SERIAL NOT NULL, 
	name VARCHAR(60) NOT NULL, 
	description TEXT, 
	display_order INTEGER NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS users (
	id SERIAL NOT NULL, 
	mobile_number VARCHAR(15) NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	email VARCHAR(120), 
	hashed_password VARCHAR(255) NOT NULL, 
	role user_role_enum NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS customers (
	id SERIAL NOT NULL, 
	user_id INTEGER, 
	name VARCHAR(100) NOT NULL, 
	phone VARCHAR(15) NOT NULL, 
	email VARCHAR(120), 
	is_credit_eligible BOOLEAN NOT NULL, 
	credit_limit NUMERIC(10, 2) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	customer_user_id INTEGER, 
	PRIMARY KEY (id), 
	UNIQUE (user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL, 
	UNIQUE (customer_user_id), 
	FOREIGN KEY(customer_user_id) REFERENCES customer_users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS expenses (
	id SERIAL NOT NULL, 
	category VARCHAR(60) NOT NULL, 
	description TEXT NOT NULL, 
	amount NUMERIC(10, 2) NOT NULL, 
	expense_date DATE NOT NULL, 
	payment_method expense_payment_method_enum NOT NULL, 
	recorded_by_user_id INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(recorded_by_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS menu_items (
	id SERIAL NOT NULL, 
	category_id INTEGER NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	description TEXT, 
	price NUMERIC(10, 2) NOT NULL, 
	image_url VARCHAR(255), 
	is_available BOOLEAN NOT NULL, 
	track_stock BOOLEAN NOT NULL, 
	available_quantity INTEGER NOT NULL, 
	reserved_quantity INTEGER NOT NULL, 
	low_stock_threshold INTEGER NOT NULL, 
	has_customizations BOOLEAN NOT NULL, 
	customization_options JSON, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(category_id) REFERENCES menu_categories (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS credit_accounts (
	id SERIAL NOT NULL, 
	customer_id INTEGER NOT NULL, 
	credit_limit NUMERIC(10, 2) NOT NULL, 
	current_balance NUMERIC(10, 2) NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(customer_id) REFERENCES customers (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
	id SERIAL NOT NULL, 
	order_number VARCHAR(32) NOT NULL, 
	daily_token_number INTEGER NOT NULL, 
	customer_id INTEGER, 
	customer_name VARCHAR(100) NOT NULL, 
	customer_phone VARCHAR(15) NOT NULL, 
	total_amount NUMERIC(10, 2) NOT NULL, 
	payment_method payment_method_enum NOT NULL, 
	payment_status payment_status_enum NOT NULL, 
	order_status order_status_enum NOT NULL, 
	order_type VARCHAR(20) DEFAULT 'DINE_IN' NOT NULL,
	table_number VARCHAR(20),
	seat_number VARCHAR(20),
	notes TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(customer_id) REFERENCES customers (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS shared_dish_transactions (
	id SERIAL NOT NULL,
	original_order_id INTEGER NOT NULL,
	original_order_item_id INTEGER NOT NULL,
	destination_table_id VARCHAR(20) NOT NULL,
	destination_seat_no VARCHAR(20),
	quantity INTEGER NOT NULL,
	status VARCHAR(32) DEFAULT 'CONFIRMED' NOT NULL,
	created_by VARCHAR(100),
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(original_order_id) REFERENCES orders (id) ON DELETE CASCADE,
	FOREIGN KEY(original_order_item_id) REFERENCES order_items (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS credit_transactions (
	id SERIAL NOT NULL, 
	customer_id INTEGER NOT NULL, 
	order_id INTEGER, 
	transaction_type credit_tx_type_enum NOT NULL, 
	amount NUMERIC(10, 2) NOT NULL, 
	balance_after NUMERIC(10, 2) NOT NULL, 
	description VARCHAR(255) NOT NULL, 
	recorded_by_user_id INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(customer_id) REFERENCES customers (id) ON DELETE CASCADE, 
	FOREIGN KEY(order_id) REFERENCES orders (id) ON DELETE SET NULL, 
	FOREIGN KEY(recorded_by_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS order_items (
	id SERIAL NOT NULL, 
	order_id INTEGER NOT NULL, 
	menu_item_id INTEGER, 
	item_name VARCHAR(120) NOT NULL, 
	quantity INTEGER NOT NULL, 
	unit_price NUMERIC(10, 2) NOT NULL, 
	total_price NUMERIC(10, 2) NOT NULL, 
	selected_options JSON, 
	PRIMARY KEY (id), 
	FOREIGN KEY(order_id) REFERENCES orders (id) ON DELETE CASCADE, 
	FOREIGN KEY(menu_item_id) REFERENCES menu_items (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS order_otp_challenges (
	id SERIAL NOT NULL, 
	order_id INTEGER NOT NULL, 
	customer_id INTEGER, 
	mobile_number VARCHAR(15) NOT NULL, 
	otp_hash VARCHAR(128) NOT NULL, 
	otp_salt VARCHAR(64) NOT NULL, 
	status VARCHAR(32) NOT NULL, 
	attempts INTEGER NOT NULL, 
	max_attempts INTEGER NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	last_sent_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	verified_at TIMESTAMP WITH TIME ZONE, 
	resend_count INTEGER NOT NULL, 
	cooldown_seconds INTEGER NOT NULL, 
	idempotency_key VARCHAR(64), 
	reserved_stock JSON, 
	PRIMARY KEY (id), 
	FOREIGN KEY(order_id) REFERENCES orders (id) ON DELETE CASCADE, 
	FOREIGN KEY(customer_id) REFERENCES customers (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS payments (
	id SERIAL NOT NULL, 
	order_id INTEGER NOT NULL, 
	customer_id INTEGER, 
	amount NUMERIC(10, 2) NOT NULL, 
	payment_method payment_record_method_enum NOT NULL, 
	payment_status payment_record_status_enum NOT NULL, 
	transaction_reference VARCHAR(100), 
	paid_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(order_id) REFERENCES orders (id) ON DELETE CASCADE, 
	FOREIGN KEY(customer_id) REFERENCES customers (id) ON DELETE SET NULL
);
