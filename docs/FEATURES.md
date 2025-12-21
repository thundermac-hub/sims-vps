# SIMS Features Overview

This document summarises the core capabilities currently shipped with SIMS. Use it to brief stakeholders, QA new releases, or onboard engineers quickly.

## Merchant Experience
1. **Support Request Form (`/supportform`)**
   - Required fields: merchant name, outlet, phone, email, issue type, description, optional attachment.
   - Validates max upload size & MIME type before writing to storage.
2. **WhatsApp Handoff**
   - After submission, SIMS opens `https://wa.me/<WHATSAPP_PHONE>` with a pre-filled summary so MS can contact the merchant immediately.
3. **Automatic Logging**
   - Every submission is stored in MySQL (`support_requests`) and linked to attachments in MinIO.

## Merchant Success Toolkit
1. **Tickets Inbox (`/tickets`)**
   - Search by keyword, filter by status/ClickUp presence/date range (uses `APP_TIMEZONE`), paginate results, export CSV.
   - Auto-refreshes every 15s via `TicketsAutoRefresh`.
   - Signed URLs allow secure attachment downloads.
   - Optional Cloud API lookup (via `CLOUD_API_EMAIL` / `CLOUD_API_PASSWORD`) resolves franchise/outlet names from FID/OID; falls back to submitted values and shows “No Outlet Found” if unavailable.
   - Cloud API auth flow: `https://api.getslurp.com/api/login` is called with the configured email/password to obtain a bearer token, cached with expiry and refreshed automatically when needed.
   - Search includes franchise names and outlet names returned by the Cloud API when credentials are configured.
   - Ticket history logs field changes (including ClickUp link/status) with timestamps and user attribution.
   - Merchant Success users can “Attend” open tickets to self-assign; the button hides once assigned or resolved.
   - Status chips show resolved timestamp and duration on hover for resolved tickets (table and modal), driven by `closed_at` in `APP_TIMEZONE`. Supported statuses: Open, In Progress, Pending Customer, Resolved.
   - Contact links open WhatsApp with a prefilled template (ticket ID, merchant name, issue summary) signed by the logged-in user.
   - Archiving: Admin/Super Admin can archive/unarchive tickets (duplicates/false submissions) via the ticket modal; archived tickets can be filtered (Active/Archived/All) and are excluded from dashboard/CSAT metrics.
   - CSV export uses friendly headers, omits email/attachment URLs, includes closed-at/by, assigned MS PIC, CSAT support/product scores/comments, and a flag indicating whether the CSAT WhatsApp link was sent; user names are resolved where possible.
2. **Ticket Detail Modal**
   - Update merchant/contact metadata, MS PIC, internal notes, and status.
   - ClickUp controls: create new task, link existing task, remove link, refresh status.
   - View attachment link + audit info (created, updated, updated by).
   - Resolved timestamp recorded when a ticket is first marked Resolved; resolution duration shown in the status hover tooltip and tracked in history.
   - CSAT panel: view expiring survey status, open/copy link, and send the survey via WhatsApp with a prefilled message. Actions are disabled once the link expires or feedback is submitted; sending is tracked for reporting/CSV.
3. **Dashboard (`/dashboard`)**
   - KPIs for active tickets (Open + In Progress + Pending Customer), new tickets today vs yesterday, resolved today vs yesterday (based on `closed_at` in `APP_TIMEZONE`), MS PIC workload, pending-customer backlog per MS PIC, and active tickets by issue type (Open/In Progress/Pending Customer, all time).
   - Archived tickets are excluded from all dashboard metrics.
   - Auto-refreshes every 15s via `DashboardAutoRefresh`.
4. **CSAT Workflow**
   - Each ticket generates a 3-day expiring CSAT link when first marked Resolved (stored in `csat_tokens`/`csat_responses`).
   - Survey page (`/csat/[token]`) supports English/BM copy (including header + invalid/expired states) while storing English CSAT values.
   - CSAT dashboard (`/csat`, Merchant Success + Super Admin) auto-refreshes every 15s and shows response breakdowns, averages, and recent verbatim feedback; archived tickets are excluded from response/denominator calculations. Response rate is “submitted CSAT / sent CSAT” (hidden tickets excluded) using all-time data.
   - Ticket modal includes CSAT actions: open/copy link and send survey via WhatsApp to the merchant, disabled after expiry/submission; WhatsApp sends are recorded for analytics and CSV export.

## Administration & Access Control
1. **Department-Aware Portal**
   - Navbar subtitle reflects the user’s department (e.g., “Merchant Success Portal” or “Super Admin Portal”).
   - Only Merchant Success + Super Admin accounts can open `/dashboard` and `/tickets`; other departments are redirected to `/profile`.
2. **User Management (`/users`)**
   - Super Admins can view every user and choose any department/role when adding or editing accounts.
   - Department Admins only see their department’s users; department is locked and roles are limited to Admin/User.
   - Add/Edit actions use modals with validations, plus delete confirmations.
3. **Profile (`/profile`)**
   - Shows name, email, department, role, created date, and password-change form (current + new + confirm).  
   - Password changes hash the value and require matching confirmation.
4. **Session Handling**
   - Cookie-based auth using `ADMIN_USER` / `ADMIN_PASS`. `/logout` clears the session; middleware protects all internal routes.

## Platform & Integrations
1. **Data plane**
   - MySQL stores tickets + users; MinIO bucket holds attachments with signed URLs.
   - Service credentials are used only server-side (Docker build/runtime).
2. **ClickUp**
   - Optional integration using `CLICKUP_TOKEN`, `CLICKUP_LIST_ID`, `CLICKUP_TEAM_ID`.
   - Ticket modal displays current task link/status and lets agents re-sync status.
3. **WhatsApp**
   - Configurable destination number via `WHATSAPP_PHONE`.
   - `.env.local` for local dev; `.env.production` for deployment.

## Reporting & Exports
1. **CSV Export**
   - `/api/admin/export` reuses the current ticket filters (status, keyword, date range) and streams CSV to the browser. Columns include IDs, merchant/outlet info, ClickUp fields, status, closed at/by, MS PIC, CSAT support/product scores/comments, and a “CSAT WhatsApp Sent” flag; email/attachment URLs are omitted and user IDs are resolved to names where possible.
2. **Dashboard Snapshot**
   - Day-over-day deltas provide a quick health check without manually comparing spreadsheets.

## Future Enhancements (Tracked in PRD)
- SLA timers, multi-department dashboards, Slack/email notifications, ticket IDs, and workflow automation (n8n) are planned in the roadmap.
