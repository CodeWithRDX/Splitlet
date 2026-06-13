# AI Usage & Corrections Log: Splitlet

This document logs the interaction history, prompt patterns, and cases where the engineer corrected the AI's assumptions or code errors.

---

## 1. Google OAuth Database Discrepancy
- **AI Error**: During stack selection, the AI accepted MongoDB when the user briefly selected it, despite previous statements requiring relational databases. The user corrected this immediately:
  - *Correction*: *"Important Constraint: You must inform the AI that you cannot use MongoDB. The assignment strictly requires the use of relational databases only."*
- **Resolution**: Reverted schema designs back to MySQL and structured the tables around SQL transactions and constraints, storing currency as integers (cents).

## 2. Docker Compile Errors (React Inline Style Casing)
- **AI Error 1**: Inside [Dashboard.jsx](file:///Users/raushankumar/Desktop/CODES/splitlet/client/src/pages/Dashboard.jsx), the AI wrote `justify-content` as a style key in a React JSX inline style object. This caused the Docker build task to crash with a parser compilation error: `Expected , or } but found -`.
- **AI Error 2**: Inside [GroupView.jsx](file:///Users/raushankumar/Desktop/CODES/splitlet/client/src/pages/GroupView.jsx), the AI wrote lowercase `justifycontent` instead of camelCased `justifyContent` for a circular button's style.
- **Resolution**: Search-replaced style blocks to ensure strict camelCase style definitions (`justifyContent`).

## 3. Directory Location Mismatch
- **AI Error**: The AI initially created `splits.js` at `server/utils/splits.js` rather than inside the nested source folder `server/src/utils/splits.js` declared in the implementation plan.
- **Resolution**: Rewrote the split logic into the correct directory to preserve path consistency.
