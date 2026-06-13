# Ingestion Report: expenses_export.csv

This report was produced by the Splitlet CSV Importer when ingesting the messy `expenses_export.csv` file into the database.

---

## 1. Import Ingestion Metadata
- **Source File**: `expenses_export.csv`
- **Import Timestamp**: 2026-06-13T17:10:00Z
- **User-Provided USD-to-INR Exchange Rate**: `83.00`
- **Total Ingested Rows**: 48 rows
- **Total Anomalies Detected**: 17 anomalies
- **Ledger Ingestion Status**: **COMPLETED & COMMITTED**

---

## 2. Ingest Anomalies & Resolutions Log

Below is the audit trail detailing every data anomaly discovered in the CSV and the corresponding action/resolution applied through the approval workflow interface:

| Row Number | Anomaly Type | Field | Raw Value | Resolution Action Taken |
| :--- | :--- | :--- | :--- | :--- |
| **13 & 14** | `DUPLICATE_ROW` | `row` | `Dinner at Marina Bites` vs `dinner - marina bites` | **Skipped Row 13** duplicate. **Kept Row 14** as the primary expense. |
| **15** | `MALFORMED_AMOUNT` | `amount` | `"1,200"` | Stripped double quotes and commas. Parsed as numeric `1200.00` INR (`120000` cents). |
| **17** | `CASE_WHITESPACE_VARIANCE` | `paid_by` | `priya ` | Trimmed trailing space and capitalized to map to system user `Priya`. |
| **18** | `FRACTIONAL_CENTS` | `amount` | `899.995` | Rounded to `900.00` INR (`90000` cents) and divided splits evenly. |
| **19** | `NAME_VARIANCE` | `paid_by` | `Priya S` | User manually mapped alias `Priya S` to standard system user `Priya`. |
| **21** | `MISSING_PAYER` | `paid_by` | *(blank)* | User selected `Rohan` as the payer from the group members dropdown list. |
| **22** | `SETTLEMENT_LOGGED_AS_EXPENSE` | `split_type` | `equal` (description: "paid back") | Converted the row to a **Settlement** (Debt Payment) where Rohan paid Aisha back. |
| **23** | `PERCENTAGE_SUM_ERROR` | `split_details` | `30% + 30% + 30% + 20%` (110%) | Auto-scaled percentages to sum to 100% (allocated 25% to each participant). |
| **24** | `DATE_FORMAT_INCONSISTENCY` | `date` | `01/03/2026` | Standardized DD/MM/YYYY date to ISO YYYY-MM-DD (`2026-03-01`). |
| **28 & 29** | `USD_CONVERSION` | `currency` | `USD` | Converted foreign USD amount to INR base currency (e.g. `$540.00 USD` -> `₹44,820.00 INR`). Stored original USD audits. |
| **31** | `NAME_VARIANCE` | `split_with` | `Dev's friend Kabir` | Created a **pending placeholder account** for Kabir, added him to the group, and generated an invite token. |
| **34** | `NEGATIVE_REFUND` | `amount` | `-30` | **Inverted Payer and Splits**: Logged as positive `$30` debt paid by the split participants back to the original recipient. |
| **35** | `DATE_FORMAT_INCONSISTENCY` | `date` | `Mar 14` | Added missing year based on surrounding context. Standardized to `2026-03-14`. |
| **36** | `MISSING_CURRENCY` | `currency` | *(blank)* | Defaulted missing currency code to group's base currency `INR`. |
| **42** | `AMBIGUOUS_DATE` | `date` | `04/05/2026` | Standardized format assuming DD/MM/YYYY based on CSV policy, resolving to `2026-05-04`. |
| **44** | `MEMBERSHIP_TIME_VIOLATION` | `split_with` | `Meera` | Detected split date (April 2nd) was after Meera left the group (March 29). Removed Meera from split and re-allocated shares among active members. |
| **50** | `SPLIT_LOGIC_MISMATCH` | `split_details` | `equal` split but shares provided | Swapped to standard equal split, ignoring the details block configuration. |
