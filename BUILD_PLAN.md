# Splitlet: Build Plan & Internship Report

This document compiles the research, architectural design, AI collaboration process, and engineering tradeoffs for **Splitlet**, a reverse-engineered clone of Splitwise.

---

## 1. Product Research

### Study of Splitwise & Ledger Mechanics
During the research phase, we analyzed Splitwise's core value proposition: **simplifying social debts**. 
The "magic" of the application does not simply lie in recording transaction histories, but in maintaining an exact, real-time double-entry style ledger across arbitrary groups of users.
Key findings from our research:
- A user's financial standing must be readable at two levels: **Group level** (net standing within a specific roommate or trip group) and **Global level** (aggregated net standing across all groups).
- splits can occur unevenly (e.g. rent split by room size, or dinner split by shares). This requires supporting multiple split configurations.
- Precision errors (floating-point division issues) are a major source of ledger drift. Exact integer-cents storage is mandatory.

### Core Workflows
We identified and implemented five core workflows:
1. **Stateless Authentication & Google OAuth**: Standard registration and session validation, reinforced by a Google OAuth redirect callback loop.
2. **Group Management & invitations**: Group creation and member additions. Includes a pending invite workflow that creates placeholder accounts for unregistered emails and emails them secure JWT registration links.
3. **Expense Splitting Engine**: Logging expenses with four distinct split behaviors:
   - *Equal*: Total divided evenly, remainder pennies assigned to the first participant in the split list.
   - *Unequal*: Individual dollar amounts matching the total exactly.
   - *Percentage*: Percent values summing to 100%.
   - *Shares*: Ratio weights (e.g., 2 shares vs. 1 share).
4. **Pairwise Ledger calculations**: Calculating net pairwise balances (User A owes User B $X) rather than complex group-level debt minimization.
5. **Real-time Discussions**: Interactive chat logs bound to expense rooms using Socket.io to discuss transaction details.

### Product Assumptions
- **Single Currency**: For the scope of this MVP, all transactions are calculated in USD cents. Multi-currency conversions are excluded.
- **Manual Settlements**: Debt settlements do not hook into banking APIs (e.g., Venmo or Stripe) and are recorded manually when marked as paid.
- **Member Deletion constraints**: A user can only be removed from a group if their net balance inside that group is exactly $0.00.

---

## 2. Architecture

### Tech Stack
- **Frontend**: React JS SPA bootstrapped with Vite. Configured with a custom responsive Glassmorphism design system in Vanilla CSS.
- **Backend API**: Node.js and Express.js REST API with WebSockets (Socket.io) binding.
- **Database**: MySQL Relational Database. Enables strict primary/foreign key constraints and atomic updates using SQL transactions.
- **DevOps**: Multi-stage Docker files for both services, orchestrated using Docker Compose.

### Database Schema (MySQL DDL)
- `users`: ID (PK), Name, Email (Unique), Password Hash (Nullable), Status (active/pending), OAuth Provider, OAuth ID, Created At.
- `groups`: ID (PK), Name, Created At.
- `group_members`: Group ID (FK), User ID (FK), Joined At. (Composite PK).
- `expenses`: ID (PK), Group ID (FK), Payer ID (FK), Amount Cents, Description, Split Type, Is Deleted (soft delete flag), Created At, Updated At.
- `splits`: ID (PK), Expense ID (FK), User ID (FK), Amount Owed Cents, Percentage, Shares.
- `settlements`: ID (PK), Group ID (FK), Payer ID (FK), Receiver ID (FK), Amount Cents, Created At.
- `chat_messages`: ID (PK), Expense ID (FK), User ID (FK), Content, Timestamp.
- `email_notifications`: ID (PK), User ID (FK), Type, Recipient Email, Status (pending/sent/failed), Error Message, Created At.

### Core API Design
- `POST /api/auth/register` / `POST /api/auth/login` — Account signup & JWT issuance.
- `GET /api/auth/invites/decode?token=xxx` — Decode and verify pending invite link.
- `POST /api/auth/invites/claim` — Claim placeholder account and set credentials.
- `GET /api/auth/oauth/google` — Google OAuth consent redirect endpoint.
- `GET /api/auth/oauth/google/callback` — Google callback exchanging auth codes, syncing DB profiles, and redirecting client.
- `GET /api/groups` / `POST /api/groups` — Read user groups or create new groups.
- `POST /api/groups/:id/members` — Invite existing user or create pending placeholder user.
- `DELETE /api/groups/:id/members/:userId` — Delete group member (enforcing $0 balance constraint).
- `GET /api/groups/:id` — Read group expenses feed, members, and group pairwise ledger.
- `POST /api/expenses` / `PUT /api/expenses/:id` / `DELETE /api/expenses/:id` — Expense engine lifecycle handlers.
- `POST /api/settlements` — Record debt payment.
- `GET /api/balances` — Retrieve global aggregates.

### Frontend Structure & Glassmorphism Design
The client is structured as a single-page React application using `react-router-dom` mapping public landing pages, login panels, claim screens, private dashboards, and group panels.
The visual system is styled using Vanilla CSS variables:
```css
:root {
  --bg-gradient: radial-gradient(at 0% 0%, #1e1b4b 0px, transparent 50%), 
                 radial-gradient(at 50% 0%, #0f172a 0px, transparent 50%), 
                 radial-gradient(at 100% 0%, #115e59 0px, transparent 50%), #090d16;
  --panel-bg: rgba(255, 255, 255, 0.05);
  --panel-border: rgba(255, 255, 255, 0.08);
  --panel-blur: blur(12px);
}
```
This mesh gradient background and blur configuration gives components a glasslike, premium finish with high-contrast text layers.

### Deployment Plan
Splitlet is configured for AWS deployment on a single **EC2 Instance** running **Docker Compose**.
1. Launch an Ubuntu EC2 instance.
2. Open incoming ports `22` (SSH), `3000` (React Client), and `5001` (Express API Server) in Security Groups.
3. Install Docker, Docker Compose, and Git.
4. Clone the repository, configure `.env` variables (e.g. SMTP and Google OAuth parameters), and run `docker compose up --build -d`.

---

## 3. AI Collaboration Process

### The Pair-Programming Dynamic
During this project, we maintained a strict **Senior-Junior Engineer relationship**:
- **Human (Senior Engineer)**: Dictated the high-level specifications, corrected database contradictions, made decisions on logical edge cases (e.g., cents rounding, user deletion constraints), and requested specific visual themes.
- **AI (Junior Engineer)**: Acted as the implementer. Asked structured clarification questions, updated configuration details, wrote relational DDL schemas, coded backend routers, designed CSS styling systems, built React modules, and validated execution logs.

### Interview & Evolution Phase
The project started with an interactive interview. The AI presented structured questions covering:
- MVP limits (OCR and bank APIs out of scope).
- Data precision modeling (cents integers to bypass JS float issues).
- Error bounds (preventing deleting members with non-zero balances).
- DevOps configurations (Docker Compose, AWS EC2, GitHub Actions).

Whenever a technical constraint changed (e.g. from MongoDB to MySQL, adding Nodemailer status tables, or integrating Google OAuth callback redirection), the AI immediately updated [AI_CONTEXT.md](file:///Users/raushankumar/Desktop/CODES/splitlet/AI_CONTEXT.md), which became our single source of truth. The final codebase was successfully generated, tested, and containerized based strictly on this file.

---

## 4. Tradeoffs

### Scoping and Algorithmic Simplifications
- **Pairwise Balances vs. Debt Simplification**: Splitwise uses a directed graph algorithm (e.g. Dinic's or Floyd-Warshall flow network) to minimize the number of transactions inside a group (e.g., if A owes B $5 and B owes C $5, simplify it so A owes C $5). To meet the tight 3-day MVP timeline, we chose **direct pairwise balances** (A owes B, B owes C separately). This kept ledger calculations fast, transparent, and easy to audit.
- **Mock Mail Transport**: To ensure local developer deployments run instantly without setting up SMTP servers, Nodemailer operates in a "mock" mode, outputting invitation links and notification templates directly to the container console log if SMTP credentials are missing in `.env`.
- **Soft Deleting Expenses**: Instead of cascading deletes on expense tables, we implement a soft-delete flag (`is_deleted`). This preserves chat logs and comments associated with the expense ID in the database, while successfully subtracting the split amounts from user balances.

### Avoided Features (Future Extensions)
Had we had more time, the following features would be prioritized for inclusion:
- **OCR Receipt Scanning**: Integrating Google Cloud Vision or Tesseract.js to upload receipt photos and automatically parse items and split totals.
- **Debt Minimization Algorithm**: Adding a graph-based transaction simplifier at the group level.
- **Advanced Analytics**: Visual graphs representing spending categories (food, utilities) and personal cashflow trends over time.
- **Multi-Currency Support**: Dynamic currency conversions using exchange rate API syncs.
