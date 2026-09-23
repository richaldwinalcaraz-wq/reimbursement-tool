# Architecture

## Stack

- **Frontend:** React 18 + Vite + Tailwind, TanStack Query for server state,
  Zustand for client state, React Router. Packaged as a desktop app via
  Electron (`frontend/electron/main.cjs`).
- **Backend:** Express + TypeScript (`tsx` for dev, `tsc` for prod build).
  No database — this is a single-user local tool.
- **External services:** HubSpot CRM API (support tickets) and HubSpot
  Transactional Email API (actual email delivery — there is no SMTP path).

## How the pieces fit together

```
Electron window (main.cjs)
  └── spawns: backend (npm run dev, :3001) + frontend (npm run dev, :3000)
        frontend (Vite) proxies /api/* → http://localhost:3001

Upload Center → POST /api/upload (Excel + ZIP)
  → excelService.parseExcel()      parses rows
  → zipService.extractZipAndIndex() extracts PDFs, indexes by normalized filename
  → validationService.buildProcessedRow()  validates + matches PDF + picks template
  → session stored in-memory (sessionStore.ts), sessionId returned to client

Dashboard → approve rows → POST /api/process/send
  → queueService.processQueue() runs rows sequentially:
       hubspotService.createOrUpdateTicket()  (CRM ticket per client)
       emailService.sendEmail()                (HubSpot transactional email, PDF attached)
       hubspotService.logEmailEngagement()     (best-effort, failure swallowed — non-critical)
     progress streamed back over Server-Sent Events (GET /api/process/status)

Downloads → POST /api/export
  → excelService.generateWriteBack()  writes ticket ID / send status / timestamps
    back into a copy of the original workbook
```

## Data model (backend/src/types/index.ts)

- **BillingRow** — one row as parsed from the uploaded Excel.
- **ProcessedRow** — a `BillingRow` plus validation result, matched PDF,
  selected template, and send status. This is the object everything after
  upload operates on.
- **Session** — one upload's working state: parsed rows, PDF index, export
  history. Keyed by a UUID, held in a `Map` in `sessionStore.ts`.
- **AppSettings** — HubSpot token, operator name, the 5 template IDs, and
  optional "from" address. Persisted to `backend/data/app-settings.json`
  (see decision below) — this is the one thing that outlives a session.

## Key decisions

- **In-memory session store, file-persisted settings.** Sessions
  (uploaded data) are deliberately ephemeral — this tool processes one
  batch at a time and there's no reason to keep billing data around after
  the export is downloaded. Settings are different: re-entering a HubSpot
  token and 5 template IDs every time the app restarts was real, tested
  friction (see 2026-09-23 gotcha below), so those get written to a local
  JSON file and reloaded on boot.
- **Email via HubSpot Transactional Email API, not SMTP.** Despite an
  earlier `.env.example` listing SMTP variables, the app never sent mail
  through SMTP — `emailService.ts` always posted to HubSpot's
  `marketing/v3/transactional/single-email/send` endpoint using
  pre-built templates. The SMTP variables were dead config and have been
  removed from `.env.example`.
- **PDF matching is filename-based, not content-based.** Normalize both
  the company name and each PDF filename (lowercase, strip extension,
  strip non-alphanumerics), try exact match first, then substring match.
  Simple and fast; the tradeoff is company names that don't resemble their
  PDF's filename will show as "Missing PDF" — by design, since silently
  guessing wrong on a financial document is worse than blocking and
  showing the operator a manual review row.
- **No auth on the local API.** This is a single-user desktop tool bound
  to `localhost` only, launched by the person running it on their own
  machine — there's no multi-tenant or network-exposed surface to
  authenticate against. This is *not* the right call if this ever becomes
  a hosted/shared web app instead of a local desktop tool; revisit then.
- **Secrets never in the repo.** `.env` and `data/app-settings.json`
  (which holds the live HubSpot token) are both gitignored. Only
  `.env.example` (placeholder values) is committed.

## Known gotchas

- **2026-09-23 — Settings silently reset on every restart, and worse, a
  blank field could wipe a saved token.** `AppSettings` originally lived
  only in a plain in-memory object, so relaunching the app lost the
  HubSpot token and all 5 template IDs every time. Fixed by persisting to
  `DATA_DIR/app-settings.json`, loaded on boot. That fix alone would have
  introduced a worse bug: the Settings page never re-populated the token
  *input field* (correctly — the backend only ever returns a masked
  value, never the real secret), so after a restart the field renders
  blank, and clicking "Save" would have sent `hubspotToken: ""` and
  overwritten the real persisted token. Fixed by only including
  `hubspotToken` in the save payload when the field is non-empty (i.e.
  the operator actually typed a new one) — an empty field means "leave
  it alone," not "clear it." If you ever add another secret-style field
  that's saved via this same settings endpoint, apply the same rule.
- **`processQueue` sends sequentially, not in parallel** — intentional,
  to stay well under HubSpot rate limits and keep SSE progress
  meaningful (`createOrUpdateTicket` already retries on 429 with backoff).
  Don't parallelize this without also reworking the retry/backoff logic.
- **File uploads and generated exports accumulate on disk**
  (`backend/uploads/`, `backend/exports/`) — nothing currently prunes
  them beyond the 4-hour in-memory session cleanup, which doesn't touch
  the files themselves. Fine for a single operator's low-volume use; if
  usage grows, add a scheduled cleanup of files older than N days.
