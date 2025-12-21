# Slurp Internal Management System (SIMS) – Product Requirements

## 1. Purpose & Context
- **Objective**: Provide Merchant Success (MS) with a single web portal to capture, triage, resolve merchant support tickets, and collect CSAT after resolution.
- **Scope**: Public request form, authenticated MS console (overview, support tickets, profile), CSAT survey, and analytics. Legacy PHP notes retained for reference; current stack is Next.js + MySQL + MinIO.

## 2. Stakeholders & Personas
- **Merchant Success Agent (MSA)**: Logs in, reviews tickets, assigns MS PIC, updates ticket metadata, and exports reports.
- **Merchant Success PIC (PIC)**: MS team member selected per ticket. Tracked for accountability; options load from `users` table.
- **Administrator**: Manages user credentials through DB/bootstrap config; future phase may allow user management UI.
- **Merchant**: External user submitting the support form (unauthenticated).

## 3. Success Metrics & Goals
- 100% of support form submissions reach SIMS database and appear in the ticket dashboard within 30 seconds.
- MS agents complete ticket updates (status/PIC/contact edits) within a single page without reloads.
- Exported CSV matches the visible dataset, including ClickUp link and ticket description.
- Profile info (name, department, role) is view-only while allowing password changes.
- CSAT participation captured for resolved tickets; dashboard reflects response breakdowns without manual spreadsheet work.

## 4. User Experience Requirements
### 4.1 Public Support Form (`public/supportform.html`)
- Collect merchant PIC, outlet, phone, email (optional), FID, OID, issue type, description, and attachment (JPEG/PNG/PDF ≤ 5 MB).
- Validate phone, email, FID (1–4 digits), and OID (1–2 digits) inline before submission.
- On success, store ticket via `POST /api/submit.php`, redirect to WhatsApp (`wa.me`) with prefilled message referencing request ID.

### 4.2 Authenticated SIMS Console
- **Login (`public/login.php`)**: Email/password against `users` table via session auth. Sessions required for all APIs.
- **Overview (`public/overview.php`)**: (Implemented separately) shares nav styling, date selection, and summary metrics.
- **Support Tickets (`public/ticket.php`)**
  - Filters: keyword (PIC/outlet, search-as-you-type), status (auto refresh on change), FID/OID (digit-only, search-as-you-type), date range modal (quick ranges + manual selection), date navigation arrows.
  - Table Columns: Ticket ID, PIC/outlet, contact (WhatsApp link + email), issue type, FID (link to SIMS Batcave), OID, MS PIC dropdown, status badges (Open/In Progress/Pending Customer/Resolved), created timestamp (12-hour, GMT+8), actions (View).
  - Auto-refresh: `fetchRequests()` every 30s plus updates after form edits or filter changes.
  - MS PIC dropdown: loads options via `/api/users.php`; updates assignment via `/api/update_ticket_pic.php`.
  - Ticket modal:
    - Read/write fields: PIC name, outlet, phone (digits, prefixed with `6` if missing), email, FID, OID, issue type, issue description, ticket description (long-form notes), ClickUp link (URL), status (Open/In Progress/Pending Customer/Resolved).
    - Read-only meta: assigned MS PIC (display only), last updated by (from `updated_by`), created/updated timestamps.
    - Validation mirrors support form rules + ClickUp URL check; inline error summary displayed.
    - Saves through `POST /api/update_ticket.php`; modal closes and table refreshes on success.
- **Profile (`public/profile.php`)**
  - Displays name, department, role (read-only) and email.
  - Allows password change through `POST /api/update_profile.php` with current/new/confirm fields.
  - Uses same nav and date-range component styling for consistency.

## 5. Functional Requirements (Current Stack)
- **CSAT**: When a ticket is first marked Resolved, create a 3-day expiring survey token. Ticket modal exposes copy/open/WhatsApp actions; survey supports EN/BM copy (including header and invalid/expired states) while storing English CSAT values. Dashboard (`/csat`) auto-refreshes every 15s and shows satisfaction breakdowns and verbatim comments.
- **Tickets**: Status/PIC updates, ClickUp linkage, CSV export, and history logging remain required.
- **Data Model (`schema.sql`)**:
  - `users`: `email`, `password_hash`, `name`, `department`, `role`, timestamps.
  - `support_requests`: merchant/contact fields, issue metadata, `ticket_description`, `clickup_link`, attachments, `status` enum, `closed_at`, `updated_by`, `ms_pic_user_id`.
  - `support_request_history`: field diffs with `changed_by` + timestamps.
  - `csat_tokens`: per-ticket survey tokens with expiry/used timestamps.
  - `csat_responses`: support/product CSAT scores, free-text feedback, linked to tokens/requests.

## 6. Non-Functional Requirements
- **Tech Stack**: PHP 8.x, MySQL 8.x, vanilla HTML/CSS/JS. No external JS frameworks.
- **Deployment**: Docker Compose template (PHP-Apache, MySQL, phpMyAdmin). Alternatively, PHP built-in server for dev.
- **Authentication**: PHP sessions (helpers in `api/lib/auth.php`). Session cookies flagged `HttpOnly`, `SameSite=Lax`.
- **Security**:
  - Strong `ADMIN_USER`/`ADMIN_PASS` configured via environment or `config.php`.
  - File uploads restricted to allowlisted MIME types and size limit from config.
  - HTTPS recommended in production; enable `Secure` cookies behind TLS.
- **Performance**:
  - Search requests debounced (350ms) to limit API traffic.
  - Auto-refresh interval 30 seconds; responses limited to 500 rows.
- **Internationalization**: Timestamps displayed in Asia/Kuala_Lumpur (GMT+8), formatted 12-hour with AM/PM.
- **Accessibility**: Modal focus handling avoids `aria-hidden` conflicts; close buttons accessible via keyboard; Escape key closes modals.

## 7. Open Questions & Future Enhancements
1. **User Management UI**: Should admins be able to create/edit users from the console instead of direct DB edits?
2. **Attachment Handling**: Extend ticket modal to display uploaded attachments or support additional file types?
3. **Notification Pipeline**: Integrate email/Slack alerts for new tickets or status changes beyond WhatsApp redirect.
4. **Analytics**: Aggregate SLA metrics (time-to-first-response, resolution time) on overview dashboard.
5. **Audit Trail**: Record history of edits by `updated_by` for compliance.

## 8. Rollout Checklist
- [ ] Provision environment variables (`ADMIN_*`, DB creds, support phone).
- [ ] Import `schema.sql` (or allow auto-migration to add new columns).
- [ ] Verify `uploads/` is writable with correct permissions.
- [ ] Smoke-test support form submission → WhatsApp redirect.
- [ ] Validate ticket dashboard filters, auto-refresh, CSV export.
- [ ] Confirm profile password change flow.
- [ ] Conduct UAT with MS team to confirm UI polish and date picker behavior.

---
_Last updated: 2025-10-16. Generated from current SIMS repository architecture and flows._
