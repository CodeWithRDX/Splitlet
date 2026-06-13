# Scope & Anomaly Log: Splitlet CSV Ingestion

This document catalogues the data anomalies identified in the `expenses_export.csv` template and describes the database schema designed to resolve them.

---

## 1. CSV Anomaly Log

Below is the registry of the 12+ deliberate data anomalies discovered in the Google Drive source CSV file, paired with our resolution policies:

| Row(s) | Detected Anomaly | Technical Issue | Resolution Policy |
| :--- | :--- | :--- | :--- |
| **13 & 14** | Duplicate Entries | Same date, amount, and payer with slightly different descriptions ("Dinner at Marina Bites" vs "dinner - marina bites"). | Surface in the Queue Interface. Prompt the user to manually **Skip**, **Keep Both**, or **Merge** them. |
| **15** | Quotation/Comma in Amount | Value `"1,200"` is in quotes with a thousands separator. | Strip double quotes and commas, parsing the value as a clean float (`1200.00`) and converting to cents (`120000`). |
| **17 & 35**| Trailing Spaces / Casing | Payer name is lowercase `priya` or `rohan ` with trailing whitespace. | Automatically trim whitespace and run a case-insensitive check to map them. Display mapped aliases to the user. |
| **18** | Fractional Cents | Cylinder refill amount is `899.995` INR (3 decimal places). | Standardize to two decimal places. Round the base amount and allocate any leftover pennies to the first split participant. |
| **19** | Name Variance | Payer name is written as `Priya S` instead of `Priya`. | Present an **Aliasing/Mapping Interface** on upload. Prompt the user to map `Priya S` to the standard system user `Priya`. |
| **21** | Missing Payer | Payer field is completely blank. | Flag as a critical anomaly. Force the user to select the payer from the group members list in the Queue Interface. |
| **22** | Wrong Data Type | "Rohan paid Aisha back" is listed as an expense, but notes say "this is a settlement". | Detect empty `split_type` and description keywords (e.g. "paid back"). Prompt user to import it as a **Settlement** instead. |
| **23** | Math Validation Error | Pizza Friday percentage splits sum to 110% (`30% + 30% + 30% + 20%`). | Flag in Queue Interface. Prevent import until the user manually adjusts percentages to sum to 100% or scales them. |
| **24** | Date Inconsistency | March rent is written as `01/03/2026` instead of `2026-03-01`. | Ingest using flexible date formatting (support YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY). Format dates to YYYY-MM-DD. |
| **28 & 29** | Multi-Currency (USD) | Goa villa booking is `$540 USD` and beach shack is `$84 USD`. | Prompt the user to input the exchange rate (e.g., `1 USD = 83 INR`) on upload. Store original and converted INR values. |
| **31** | Unregistered Invitees | Involves "Dev's friend Kabir", who is not in the system. | Create a placeholder user with `status = 'pending'`, and email them an invitation signup token. |
| **34** | Negative Amount | Dev recorded a parasailing refund of `-30` USD. | **Invert Payer and Splits**: Store as a positive expense of `$30` where the participants pay the original payer back. |
| **35** | Incomplete Date Text | Date is written as text: `Mar 14` (missing year). | Parse the year from surrounding context (e.g., 2026) or prompt user to confirm the date. |
| **36** | Missing Currency | "Groceries DMart" amount is `2105` but currency is blank. | Prompt the user to select the currency code (defaulting to group's base currency `INR`). |
| **42** | Ambiguous Date Format | Date is written as `04/05/2026` (is this April 5 or May 4?). | Prompt the user to clarify if the date format of the file is DD/MM/YYYY or MM/DD/YYYY. |
| **44** | Membership Date Violation | Meera left the group in March, but is included in an expense split on April 2nd. | Reject the split. Display an alert in the Queue Interface forcing the user to manually re-allocate the split among active members. |
| **50** | Split Logic Conflict | split_type is `equal`, but split_details contains share ratios. | Flag in Queue Interface. Force user to choose between the declared split_type or the split_details string. |

---

## 2. Database Schema DDL

The database tables are designed in MySQL to enforce data integrity, track multi-currency details, support time-sensitive memberships, and log CSV ingestion audits.

```sql
-- 1. Users Table (Supports Pending invites and OAuth)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) DEFAULT NULL,
  status VARCHAR(50) DEFAULT 'active', -- 'active' or 'pending'
  oauth_provider VARCHAR(50) DEFAULT NULL,
  oauth_id VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Groups Table
CREATE TABLE IF NOT EXISTS `groups` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Group Members Table (Supports Sam's Time-Sensitive Memberships)
CREATE TABLE IF NOT EXISTS group_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_id INT NOT NULL,
  user_id INT NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  left_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Expenses Table (Supports Priya's Multi-Currency and Rohan's Transparency)
CREATE TABLE IF NOT EXISTS expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_id INT NOT NULL,
  payer_id INT NOT NULL,
  amount_cents_original INT NOT NULL,
  currency_code VARCHAR(10) NOT NULL,
  amount_cents_inr INT NOT NULL, -- Converted base currency amount
  description VARCHAR(255) NOT NULL,
  split_type VARCHAR(50) NOT NULL, -- 'equal', 'unequal', 'percentage', 'shares'
  is_deleted BOOLEAN DEFAULT FALSE, -- Soft delete flag
  date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  FOREIGN KEY (payer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Splits Table (Detailed audit trail)
CREATE TABLE IF NOT EXISTS splits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  expense_id INT NOT NULL,
  user_id INT NOT NULL,
  amount_owed_cents_original INT NOT NULL,
  amount_owed_cents_inr INT NOT NULL,
  percentage DECIMAL(5,2) DEFAULT NULL,
  shares DECIMAL(5,2) DEFAULT NULL,
  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Settlements Table
CREATE TABLE IF NOT EXISTS settlements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_id INT NOT NULL,
  payer_id INT NOT NULL,
  receiver_id INT NOT NULL,
  amount_cents_original INT NOT NULL,
  currency_code VARCHAR(10) NOT NULL,
  amount_cents_inr INT NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  FOREIGN KEY (payer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Chat Messages Table
CREATE TABLE IF NOT EXISTS chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  expense_id INT NOT NULL,
  user_id INT NOT NULL,
  content TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Email Notifications Log
CREATE TABLE IF NOT EXISTS email_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT DEFAULT NULL,
  type VARCHAR(50) NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Import Logs (Ingestion reports)
CREATE TABLE IF NOT EXISTS import_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  total_rows INT DEFAULT 0,
  valid_rows INT DEFAULT 0,
  anomalies_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Import Anomalies Table (Supports Meera's Approval Workflow)
CREATE TABLE IF NOT EXISTS import_anomalies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  import_log_id INT NOT NULL,
  row_number INT NOT NULL,
  field_name VARCHAR(50) NOT NULL,
  raw_value VARCHAR(255),
  anomaly_type VARCHAR(100) NOT NULL,
  proposed_fix VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  resolved_value TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (import_log_id) REFERENCES import_logs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
