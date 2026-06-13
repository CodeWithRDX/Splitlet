# Splitlet: Shared Expenses Web Application (Glassmorphic MVP)

Splitlet is a modern, collaborative shared expenses tracking web application (similar to Splitwise) designed with a premium **Glassmorphism** aesthetic. The application is built using a highly structured relational database schema (MySQL), a Node.js/Express API backend, and a React frontend client.

---

## Key Features

1. **Precision Ledger Math**: Avoids floating-point precision issues by storing all currency values as integers representing cents (e.g. `$10.00` is stored as `1000`). Leftover pennies from uneven division splits are allocated to the first split participant.
2. **Robust CSV Ingest Wizard (`expenses_export.csv`)**:
   - Standardizes inconsistent dates (YYYY-MM-DD, DD/MM/YYYY, and text dates).
   - Rounds fractional cents and standardizes trailing whitespaces/casing in member names.
   - Converts foreign currencies (USD to INR base ledger currency) using custom user-provided exchange rates (Priya's requirement).
   - Resolves duplicate transactions by flagging them for manual skip/merge choices.
   - Detects debt settlement rows logged as expenses and handles them as settlements.
   - Automatically inverts negative refund rows into positive debt entries.
3. **Time-Sensitive Membership Verification**: Restricts split validations against active group membership windows (Sam's and Meera's requirements).
4. **Meera's Ingestion Approval Queue**: Displays all parsed row anomalies in a card-based interactive queue interface. No database inserts are committed to the core ledger tables until the user approves the suggestions.
5. **Placeholder Accounts & Invites**: Automatically creates `'pending'` accounts for unregistered invitees (like Kabir) and triggers signup tokens and invite logs.
6. **Stateless JWT & Google OAuth 2.0**: Supports secure standard logins and Google OAuth 2.0 single-sign-on (SSO).
7. **Real-Time Group Comments**: Instant chat commentary inside expense detail views powered by Socket.io.
8. **Reliable SMTP Notifications**: Sends transactional emails on events, logging send statuses in the database to prevent drops.

---

## Tech Stack

- **Frontend**: React (Vite) + Vanilla CSS (Glassmorphic custom tokens) + Nginx (Nginx serves static SPA assets and proxies websocket connections).
- **Backend**: Node.js + Express + Socket.io + Nodemailer.
- **Database**: MySQL 8.0 (Relational tables enforcing constraints and foreign keys).
- **Orchestration**: Docker & Docker Compose.
- **CI/CD**: GitHub Actions deploying to AWS EC2 via SSH commands.

---

## Local Setup & Quick Start

To launch the application locally in developer mode:

### Prerequisites
Make sure you have **Docker** and **Docker Compose** installed on your system.

### Running the Application

1. **Clone the repository**:
   ```bash
   git clone https://github.com/CodeWithRDX/Splitlet.git
   cd splitlet
   ```

2. **Spin up the containers**:
   To trigger a fresh build and clear any stale volumes, run:
   ```bash
   docker compose down -v
   docker compose up --build
   ```

3. **Access the application**:
   - Web Client: `http://localhost:3000`
   - Express Server Backend: `http://localhost:5001`
   - MySQL Database Port: `localhost:3306`

---

## AI Collaboration & Persona

Splitlet was built in collaboration with **Antigravity**, an agentic AI coding assistant designed by the Google DeepMind team. The AI acted as a pair programmer assisting the user (acting as a senior engineer) with:
- DB schema structure design.
- Rigorous character-by-character CSV parsing.
- Dynamic responsive frontend pages.
- CI/CD container orchestration and volume mapping.
