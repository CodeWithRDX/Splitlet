# Ingestion Report: expenses_export.csv

This report was produced programmatically by the Splitlet CSV Importer when ingesting the `expenses_export.csv` file.

---

## 1. Import Ingestion Metadata
- **Source File**: `expenses_export.csv`
- **Import Timestamp**: 2026-06-13T17:10:00Z
- **User-Provided USD-to-INR Exchange Rate**: `83.00`
- **Total Rows Analyzed**: 43 rows (excluding header)
- **Total Anomalies Detected**: 36 anomalies
- **Ledger Ingestion Status**: **COMPLETED & COMMITTED**

---

## 2. Ingest Anomalies & Resolutions Log

Below is the complete list of all 36 anomalies programmatically detected by the application in the CSV, paired with the action taken during the user review/approval stage:

| Row | Field | Raw Value | Anomaly Type | Applied Action & Resolution |
| :--- | :--- | :--- | :--- | :--- |
| **9** | `paid_by` | `priya` | `CASE_WHITESPACE_VARIANCE` | Trimmed and capitalized to map to system user `Priya`. |
| **10** | `amount` | `899.995` | `FRACTIONAL_CENTS` | Rounded base amount to `900.00` INR (`90000` cents) and divided splits evenly. |
| **11** | `paid_by` | `Priya S` | `CASE_WHITESPACE_VARIANCE` | Cleansed and mapped alias to standard system user `Priya`. |
| **13** | `paid_by` | *(blank)* | `MISSING_PAYER` | User selected `Rohan` as the payer from the group members dropdown list. |
| **14** | `split_type` | *(blank)* | `SETTLEMENT_LOGGED_AS_EXPENSE` | Converted the row to a **Settlement** (Debt Payment) where Rohan paid Aisha back. |
| **15** | `split_details` | `Aisha 30%; Rohan ...` | `PERCENTAGE_SUM_ERROR` | Auto-scaled percentages to sum to 100% (allocated 25% to each of the 4 participants). |
| **16** | `date` | `01/03/2026` | `AMBIGUOUS_DATE` | Standardized DD/MM/YYYY date to ISO YYYY-MM-DD (`2026-03-01`). |
| **17** | `date` | `03/03/2026` | `AMBIGUOUS_DATE` | Standardized DD/MM/YYYY date to ISO YYYY-MM-DD (`2026-03-03`). |
| **18** | `date` | `05/03/2026` | `AMBIGUOUS_DATE` | Standardized DD/MM/YYYY date to ISO YYYY-MM-DD (`2026-03-05`). |
| **19** | `date` | `08/03/2026` | `AMBIGUOUS_DATE` | Standardized DD/MM/YYYY date to ISO YYYY-MM-DD (`2026-03-08`). |
| **20** | `date` | `09/03/2026` | `AMBIGUOUS_DATE` | Standardized DD/MM/YYYY date to ISO YYYY-MM-DD (`2026-03-09`). |
| **20** | `currency` | `USD` | `USD_CONVERSION` | Converted amount using input exchange rate (`$540.00 USD` -> `₹44,820.00 INR`). Stored original USD details for Rohan. |
| **21** | `date` | `10/03/2026` | `AMBIGUOUS_DATE` | Standardized DD/MM/YYYY date to ISO YYYY-MM-DD (`2026-03-10`). |
| **21** | `currency` | `USD` | `USD_CONVERSION` | Converted amount using input exchange rate (`$84.00 USD` -> `₹6,972.00 INR`). Stored original USD details for Rohan. |
| **22** | `date` | `10/03/2026` | `AMBIGUOUS_DATE` | Standardized DD/MM/YYYY date to ISO YYYY-MM-DD (`2026-03-10`). |
| **23** | `date` | `11/03/2026` | `AMBIGUOUS_DATE` | Standardized DD/MM/YYYY date to ISO YYYY-MM-DD (`2026-03-11`). |
| **23** | `currency` | `USD` | `USD_CONVERSION` | Converted amount using input exchange rate (`$150.00 USD` -> `₹12,450.00 INR`). Created placeholder account for unregistered invitee `Kabir`. |
| **24** | `date` | `11/03/2026` | `AMBIGUOUS_DATE` | Standardized DD/MM/YYYY date to ISO YYYY-MM-DD (`2026-03-11`). |
| **25** | `date` | `11/03/2026` | `AMBIGUOUS_DATE` | Standardized DD/MM/YYYY date to ISO YYYY-MM-DD (`2026-03-11`). |
| **26** | `date` | `12/03/2026` | `AMBIGUOUS_DATE` | Standardized DD/MM/YYYY date to ISO YYYY-MM-DD (`2026-03-12`). |
| **26** | `amount` | `-30` | `NEGATIVE_REFUND` | **Inverted Payer and Splits**: Logged positive `$30` refund split where participants pay the receiver back. |
| **26** | `currency` | `USD` | `USD_CONVERSION` | Converted amount using input exchange rate (`$30.00 USD` -> `₹2,490.00 INR`). Stored original USD details. |
| **27** | `date` | `Mar 14` | `DATE_FORMAT_INCONSISTENCY` | Standardized text date with missing year to ISO YYYY-MM-DD (`2026-03-14`). |
| **27** | `paid_by` | `rohan ` | `CASE_WHITESPACE_VARIANCE` | Trimmed trailing whitespace and capitalized to map to system user `Rohan`. |
| **28** | `date` | `15/03/2026` | `DATE_FORMAT_INCONSISTENCY` | Standardized DD/MM/YYYY date to ISO YYYY-MM-DD (`2026-03-15`). |
| **28** | `currency` | *(blank)* | `MISSING_CURRENCY` | Defaulted currency to group's base currency code `INR`. |
| **29** | `date` | `18/03/2026` | `DATE_FORMAT_INCONSISTENCY` | Standardized DD/MM/YYYY date to ISO YYYY-MM-DD (`2026-03-18`). |
| **30** | `date` | `20/03/2026` | `DATE_FORMAT_INCONSISTENCY` | Standardized DD/MM/YYYY date to ISO YYYY-MM-DD (`2026-03-20`). |
| **31** | `date` | `22/03/2026` | `DATE_FORMAT_INCONSISTENCY` | Standardized DD/MM/YYYY date to ISO YYYY-MM-DD (`2026-03-22`). |
| **31** | `amount` | `0` | `ZERO_AMOUNT` | User verified the entry and approved ignoring/skipping this zero-cost item. |
| **32** | `date` | `25/03/2026` | `DATE_FORMAT_INCONSISTENCY` | Standardized DD/MM/YYYY date to ISO YYYY-MM-DD (`2026-03-25`). |
| **32** | `split_details` | `Aisha 30%; Rohan ...` | `PERCENTAGE_SUM_ERROR` | Auto-scaled percentages to sum to 100% (allocated 25% to each of the 4 participants). |
| **33** | `date` | `28/03/2026` | `DATE_FORMAT_INCONSISTENCY` | Standardized DD/MM/YYYY date to ISO YYYY-MM-DD (`2026-03-28`). |
| **34** | `date` | `04/05/2026` | `AMBIGUOUS_DATE` | Standardized format assuming DD/MM/YYYY based on CSV policy, resolving to `2026-05-04`. |
| **36** | `split_with` | `Meera` | `MEMBERSHIP_TIME_VIOLATION` | Detected split date (April 2nd) was after Meera left the group (March 29). Removed Meera from split and re-allocated splits among active members. |
| **42** | `split_details` | `Aisha 1; Rohan 1...` | `SPLIT_LOGIC_MISMATCH` | Imported as standard equal split, ignoring the details block configuration. |
