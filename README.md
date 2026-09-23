# Reimbursement Report Sender

Desktop app (Electron + React frontend, Express/TS backend) that automates
reimbursement report distribution: upload a billing Excel sheet + a ZIP of
client PDF reports, it validates and matches PDFs to rows, lets you preview
and approve, then sends personalized emails through HubSpot's Transactional
Email API (with a HubSpot support ticket per client) and exports an updated
Excel write-back with send status.

Built for Riverbend Consulting. See `AI_AUTOMATION_PROPOSAL_REIMBURSEMENT_SENDER.md`
(repo root) for the business case this was built from.

## Prerequisites

- **Node.js 18+** and npm, installed and on PATH.
- A **HubSpot account** with:
  - A private app token (Settings → Integrations → Private Apps) with scopes
    for tickets (`crm.objects.tickets.*`) and transactional email.
  - Pre-built transactional email templates in HubSpot Marketing → Email —
    one per report type (Standard, Informational/No Access, Follow-Up/Past
    Due, Resubmission, Priority/Urgent). You'll need each template's numeric
    ID (visible in the URL when editing the template).
- Windows, to use the double-click launcher. On macOS/Linux, run the two
  dev servers manually (see below) — the app itself works fine, only the
  `.vbs` launcher is Windows-specific.

## First-time setup

```bash
cd backend && npm install
cd ../frontend && npm install
```

Copy `backend/.env.example` to `backend/.env`. You can leave
`HUBSPOT_ACCESS_TOKEN` blank and paste your token into the app's Settings
page instead — either works, and whatever you save in Settings takes over
from then on.

## Running it

**Windows — double-click** `Launch Reimbursement Tool.vbs` (repo root). It
frees ports 3000/3001 if anything is stuck on them, then starts everything
and opens the app window. Closing the window shuts both servers down.

**Any OS — manual:**

```bash
cd frontend
npm run electron-app
```

This spawns the backend (port 3001) and frontend dev server (port 3000)
itself and opens the Electron window once both are up.

To run just the web UI in a browser instead of Electron: start
`npm run dev` in `backend/` and `npm run dev` in `frontend/` separately,
then open `http://localhost:3000`.

## First-run checklist

1. Go to **Settings** → paste your HubSpot private app token → click
   **Test** to confirm the connection → enter the 5 template IDs and an
   optional "From" address → **Save Settings**. These are written to
   `backend/data/app-settings.json` (gitignored, local to this machine)
   and survive app restarts — you won't need to re-enter them next time
   unless you're rotating the token.
2. Go to **Upload Center** → drop your billing `.xlsx` and the PDF `.zip`.
3. Review the **Dashboard**: rows are validated and PDFs auto-matched by
   company name. Approve rows (individually, or "Approve All Ready"), then
   **Send**. Progress streams live per row.
4. Go to **Downloads** → **Generate Export** to produce an updated Excel
   with ticket IDs, send status, and timestamps written back in.

## Required Excel columns

`Company Name, Email, Ticket Number, Notes, CC, BCC, Rate, Currency, Total,
Converted USD, Total to Charge, To Carry Over, BTM, Past Due, Report Sent By`

Header matching is case-insensitive with a few accepted aliases (see
`backend/src/services/excelService.ts`).

## How a template is picked

The `Notes` column drives it (case-insensitive, exact match):

| Notes value    | Template        |
|----------------|------------------|
| *(anything else)* | Standard      |
| `No Access`    | Informational (no PDF, no ticket) |
| `Past Due`     | Follow-Up        |
| `Resubmission` | Resubmission     |
| `Urgent`       | Priority         |

## Known limitations

- **Single work session at a time.** Upload state lives in backend memory
  and clears after 4 hours or an app restart — re-upload if you come back
  to a stale session. Settings (token, template IDs) persist; uploaded
  data does not, by design (there's nothing sensitive worth keeping
  around, and it keeps the tool simple).
- **PDF matching** is by normalized filename vs. company name (exact, then
  substring) — a PDF that doesn't clearly correspond to a company name
  will show as "Missing PDF" and block sending until fixed.
- Each person running this needs their **own HubSpot token** — nothing is
  hardcoded to a specific account.

See `ARCHITECTURE.md` for stack details and design decisions.
