# AI Context: Splitwise Clone (Splitlet) - CSV Importer & Multi-Currency Ledger

This document is the source of truth for the Splitlet project. It details the product requirements, design decisions, data models, API contracts, UI layouts, and implementation details for the CSV importer, time-sensitive memberships, and multi-currency ledger features.

---

## 1. Product Goals & Splitwise Research
- **Goal**: Build an expense sharing MVP that imports a messy `expenses_export.csv`, detects anomalies, requires user approval for corrections (no silent guesses), and calculates a multi-currency ledger.
- **Specific Persona Requirements**:
  - **Aisha**: Needs a simplified, single-number summary of "who pays whom" in the group's base currency (INR).
  - **Rohan**: Needs complete transparency to drill down and see every single expense and currency conversion making up their balance.
  - **Priya**: Needs multi-currency capability (supporting USD and INR) with explicit exchange rate inputs.
  - **Sam**: Needs time-sensitive group membership (membership windows change; splits must validate if members were active at the expense date).
  - **Meera**: Needs an approval workflow (Queue Interface) for any data edits, mapping, or fixes suggested by the importer.

## 2. CSV Anomaly Handling Policy
We handle the 12+ deliberate anomalies in the export file according to this policy:
1. **Duplicate Entries** (e.g. Rows 13/14): Surface in the queue interface. User chooses to *Skip*, *Keep both*, or *Merge*.
2. **Number Formatting** (e.g. Rows 15/37): Strip commas and surrounding spaces. Cleaned value is shown to user for approval.
3. **Name Variances** (e.g. `priya` vs `Priya S` vs `Priya`): Map using an Aliasing/Mapping dashboard on import. Map names to system users.
4. **Fractional Cents** (e.g. Row 18): Round using standard currency rounding, allocating remainder cents to the first split participant.
5. **Missing Payer** (e.g. Row 21): Flag as an anomaly; prompt user to select the payer from a dropdown in the queue.
6. **Settlement logged as Expense** (e.g. Row 22): Detect "Rohan paid Aisha back" and offer to import it as a *Settlement* instead of an *Expense*.
7. **Malformed Splits / Math errors** (e.g. Row 23): Flag percentage splits not summing to 100%. User must manually scale or edit.
8. **Inconsistent Date Formats** (e.g. Row 35/42): Standardize to YYYY-MM-DD. Prompt user if ambiguous.
9. **Multi-Currency** (e.g. Row 28): Prompt user to input exchange rate (e.g. USD to INR) during the upload phase.
10. **Unregistered Users** (e.g. Row 31): Create placeholder users with `'pending'` status.
11. **Negative Amounts/Refunds** (e.g. Row 34): Invert payer and split details, logging as a positive expense where participants pay the recipient.
12. **Missing Currency** (e.g. Row 36): Prompt user to assign a currency code (defaulting to INR).
13. **Post-Departure Splits** (e.g. Row 44): Reject splits including members who had already left (based on time-sensitive membership). User must manually reallocate.

## 3. Core Workflows
1. **CSV Upload & Parameter Setup**: User uploads `expenses_export.csv` and inputs the exchange rate (e.g. `1 USD = 83 INR`).
2. **Anomaly Ingestion & Queue Interface**: Importer parses rows, checks schemas, matching names, duplicates, and membership dates. All anomalies are logged in `import_anomalies` table and displayed in a **Queue Interface**.
3. **Approval Flow**: User reviews each card (e.g. "Map Priya S to Priya?"), resolves missing values, and clicks **Approve** (or **Approve All**).
4. **Ledger Commit**: Once approved, rows are committed atomically to `expenses`, `splits`, and `settlements` tables.
5. **Report Generation**: Generates an **Import Report** summarizing total records, successful entries, and actions taken on anomalies.
6. **Balance Review & Settlement**: Displays the pairwise balance ledger (Aisha's view) and audit trail (Rohan's view).

## 4. UI Screens & Routing
- `/` — Public **Landing Page** with Glassmorphism mesh gradient theme.
- `/about` — Public **About Page**.
- `/login` — **Login/Signup Page** with Google Sign-in.
- `/dashboard` — **Private Dashboard** with global balance view and **Import CSV** wizard trigger.
- `/import/queue` — **Queue Interface** displaying anomaly cards with proposed fixes and action inputs.
- `/import/report` — **Import Report Screen** detailing the results of the import.
- `/group/:id` — **Group View** containing expenses list, time-sensitive members list, audit trail, and chat.

## 5. Data Model & Schema (MySQL)
All amounts are stored as integers in cents (original currency cents + converted INR cents).

### Database Schema (MySQL DDL)
- `users`: `id` INT AUTO_INCREMENT PRIMARY KEY, `name` VARCHAR(255) NOT NULL, `email` VARCHAR(255) UNIQUE NOT NULL, `password_hash` VARCHAR(255) DEFAULT NULL, `status` VARCHAR(50) DEFAULT 'active', `oauth_provider` VARCHAR(50) DEFAULT NULL, `oauth_id` VARCHAR(255) DEFAULT NULL, `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP.
- `groups`: `id` INT AUTO_INCREMENT PRIMARY KEY, `name` VARCHAR(255) NOT NULL, `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP.
- `group_members`: `id` INT AUTO_INCREMENT PRIMARY KEY, `group_id` INT NOT NULL, `user_id` INT NOT NULL, `joined_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP, `left_at` TIMESTAMP NULL DEFAULT NULL, FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON DELETE CASCADE, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE.
- `expenses`: `id` INT AUTO_INCREMENT PRIMARY KEY, `group_id` INT NOT NULL, `payer_id` INT NOT NULL, `amount_cents_original` INT NOT NULL, `currency_code` VARCHAR(10) NOT NULL, `amount_cents_inr` INT NOT NULL, `description` VARCHAR(255) NOT NULL, `split_type` VARCHAR(50) NOT NULL, `is_deleted` BOOLEAN DEFAULT FALSE, `date` DATE NOT NULL, `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP, `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`), FOREIGN KEY (`payer_id`) REFERENCES `users`(`id`).
- `splits`: `id` INT AUTO_INCREMENT PRIMARY KEY, `expense_id` INT NOT NULL, `user_id` INT NOT NULL, `amount_owed_cents_original` INT NOT NULL, `amount_owed_cents_inr` INT NOT NULL, `percentage` DECIMAL(5,2), `shares` DECIMAL(5,2), FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON DELETE CASCADE, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`).
- `settlements`: `id` INT AUTO_INCREMENT PRIMARY KEY, `group_id` INT NOT NULL, `payer_id` INT NOT NULL, `receiver_id` INT NOT NULL, `amount_cents_original` INT NOT NULL, `currency_code` VARCHAR(10) NOT NULL, `amount_cents_inr` INT NOT NULL, `date` DATE NOT NULL, `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`), FOREIGN KEY (`payer_id`) REFERENCES `users`(`id`), FOREIGN KEY (`receiver_id`) REFERENCES `users`(`id`).
- `chat_messages`: `id` INT AUTO_INCREMENT PRIMARY KEY, `expense_id` INT NOT NULL, `user_id` INT NOT NULL, `content` TEXT NOT NULL, `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON DELETE CASCADE, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`).
- `email_notifications`: `id` INT AUTO_INCREMENT PRIMARY KEY, `user_id` INT DEFAULT NULL, `type` VARCHAR(50) NOT NULL, `recipient_email` VARCHAR(255) NOT NULL, `status` VARCHAR(20) DEFAULT 'pending', `error_message` TEXT, `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL.
- `import_logs`: `id` INT AUTO_INCREMENT PRIMARY KEY, `file_name` VARCHAR(255) NOT NULL, `total_rows` INT DEFAULT 0, `valid_rows` INT DEFAULT 0, `anomalies_count` INT DEFAULT 0, `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP.
- `import_anomalies`: `id` INT AUTO_INCREMENT PRIMARY KEY, `import_log_id` INT NOT NULL, `row_number` INT NOT NULL, `field_name` VARCHAR(50) NOT NULL, `raw_value` VARCHAR(255), `anomaly_type` VARCHAR(100) NOT NULL, `proposed_fix` VARCHAR(255), `status` VARCHAR(50) DEFAULT 'pending', `resolved_value` TEXT, `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (`import_log_id`) REFERENCES `import_logs`(`id`) ON DELETE CASCADE.

---

## 3-Day Build Plan

### Day 1: Schema Setup & CSV Parser
- Update DDL scripts in `server/schema.sql` to include `import_logs`, `import_anomalies`, and currency conversion columns.
- Re-initialize MySQL container.
- Implement Express CSV upload API `POST /api/import/upload` that reads file streams and returns parsed rows.
- Build the Anomaly Detection engine inside `server/src/utils/importer.js`. It scans columns for YYYY-MM-DD conversions, blank fields, name variances, duplicate hashes, and currency checks, creating database logs in `import_logs` and `import_anomalies`.

### Day 2: Onboarding & Resolution REST API
- Implement `GET /api/import/queue/:logId` to retrieve pending anomalies.
- Implement `POST /api/import/queue/:logId/resolve` to apply resolutions (mapping names, manually setting values, or scaling percentages) and commit validated rows to the ledger tables in a single transaction.
- Update balance engine [balances.js](file:///Users/raushankumar/Desktop/CODES/splitlet/server/src/utils/balances.js) to calculate base currency INR values (Aisha) and link back to original transaction audit details (Rohan).
- Implement time-sensitive membership filters (`group_members.joined_at` / `left_at`) when building splitting validations.
- Write unit tests verifying CSV parser, conversions, and membership checks.

### Day 3: Frontend Ingestion UI & Ingestion Reports
- Build the **Import Wizard** UI on `/dashboard` allowing CSV upload and exchange rate input.
- Build the **Queue Interface** screen on `/import/queue` displaying anomaly cards with edit dropdowns, and approvals buttons.
- Build the **Import Report** page on `/import/report` detailing successful rows and mapped resolutions.
- Update Group Details view to show time-sensitive memberships and converted ledger audit tables.
