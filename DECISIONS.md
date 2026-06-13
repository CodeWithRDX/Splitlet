# Engineering Decisions Log: Splitlet

This document details the core architectural and business logic decisions made during the design of Splitlet.

---

## 1. Database Choice: MySQL
- **Decision**: Continue using MySQL as our relational database system.
- **Rationale**: 
  - Relational integrity is a critical requirement of the assignment. MySQL supports robust foreign keys, triggers, and transactions, which are necessary to prevent split data from getting out of sync with expenses.
  - The project setup already has dockerized container configurations for MySQL, saving significant environment setup time.

## 2. Multi-Currency Storage: Dual Cents Model
- **Decision**: Store both `amount_cents_original` (with a `currency_code` e.g. `'USD'`) and `amount_cents_inr` (base currency) for all expenses, splits, and settlements.
- **Rationale**:
  - **Aisha** requires a single aggregated number of "who owes whom". Storing the converted base value (`amount_cents_inr`) allows us to sum balances instantly across all transactions regardless of their original currency.
  - **Rohan** requires audit transparency. Storing the original transaction details alongside the base amount allows him to drill down and see the exact currency and conversion rate applied to each split.
  - **Priya** gets clean multi-currency support without floating-point precision loss.

## 3. Exchange Rate Ingestion
- **Decision**: Prompt the user to input the exchange rate (e.g. 1 USD = 83 INR) during the CSV import phase, rather than pulling dynamically from a public API.
- **Rationale**:
  - External currency APIs are prone to rate limits, network failures, and historical rate discrepancies.
  - Allowing the importer user to explicitly declare the exchange rate for that import log makes the ingestion deterministic, repeatable, and self-contained.

## 4. Refund / Negative Amount Resolution
- **Decision**: Invert negative expense entries on import. If Dev records a refund of `-30` USD split equally among Aisha, Rohan, Priya, and Dev:
  - We record it in our database as a positive expense of `$30` paid by the participants (Aisha, Rohan, Priya) back to the receiver (Dev).
- **Rationale**:
  - Storing negative amounts in expense ledgers creates database arithmetic edge cases (e.g. total amounts summing incorrectly, negative splits, or division logic breaking). 
  - Inverting the transaction maintains positive integers in the database while mathematically achieving the correct debt reduction.

## 5. Time-Sensitive Membership Modeling
- **Decision**: Add `joined_at` and `left_at` (nullable) timestamps to the `group_members` table, and use an autoincrement `id` PK to handle multiple joining/leaving intervals.
- **Rationale**:
  - Satisfies **Sam's** persona requirement.
  - During import validation, we check the expense `date` against the member's active window `[joined_at, left_at]`. If an expense is logged containing a user outside their active membership window (such as Meera in April), the import rejects the split and prompts the user to resolve it.

## 6. Meera's Approval Queue Interface
- **Decision**: Implement an intermediate state where parsed CSV rows are saved as `'pending'` anomalies in the `import_anomalies` table. The frontend renders this as a card-based Queue Interface.
- **Rationale**:
  - Satisfies **Meera's** persona requirement.
  - No database inserts are committed to the core ledger tables (`expenses`, `splits`) until the user reviews, resolves missing values, and explicitly clicks **Approve** or **Approve All**.
  - Provides audit transparency by creating a permanent log of all imported CSV filenames, row metrics, and resolutions.
