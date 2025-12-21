# API Reference

This file documents every route handler in the Next.js App Router. Paths are relative to the deployed base URL.

## Auth & Cookies
- Session: `ms_auth` cookie must equal `ADMIN_USER:ADMIN_PASS` to pass `isSessionValid` (set by `/login/submit`). `ms_user` stores the user id for UI display.
- Date range preference: `tickets_date_range` cookie stores `from|to` and lasts 30 days (httpOnly, sameSite=lax, secure in production).

## Endpoints

### POST `/api/requests`
- Purpose: Create a support request and return a WhatsApp deep link.
- Auth: Public.
- Payload: `multipart/form-data` with fields `merchant_name` (required), `outlet_name` (optional, defaults to `N/A`), `phone_number` (required, digits only; normalized to start with `6`), `email` (optional), `fid` (required, 1–4 digits), `oid` (required, 1–2 digits), `issue_type` (required), `issue_subcategory1` (required), `issue_subcategory2` (optional), `issue_description` (required). Optional attachments up to three files named `attachment`, `attachment_receipt`, `attachment_other`; MIME types allowed by `ALLOWED_MIME_TYPES` (default `image/jpeg,image/png,image/heic,application/pdf`); max size `MAX_UPLOAD_BYTES` (default 5 MB). Files are stored in the MinIO bucket `MINIO_BUCKET`.
- Success: `201` with `{ id, whatsappUrl }` where `whatsappUrl` uses `WHATSAPP_PHONE`.
- Errors: `400` with `{ errors: [...] }` for validation, `{ error: 'Unsupported file type' }`, or `{ error: 'File exceeds maximum allowed size' }`; `500` `{ error: 'Server error' }`.
- Additional: `GET /api/requests` returns `{ ok: true }` (health check).

### POST `/api/csat`
- Purpose: Submit CSAT feedback for a resolved ticket using a token.
- Auth: Token-based; `token` must map to a non-expired `csat_tokens` row and not be re-used.
- Payload (JSON): `token` (required), `supportScore` (required, one of `Very Satisfied | Satisfied | Neutral | Dissatisfied`), `productScore` (same set), `supportReason` (optional string), `productFeedback` (optional string).
- Success: `200` `{ success: true, submittedAt }`.
- Errors: `400` for missing/invalid fields; `404` invalid token; `409` already submitted; `410` expired; `500` for server failures.
- Additional: `GET /api/csat` returns `{ ok: true }` (health check).

### POST `/api/preferences/date-range`
- Purpose: Persist or clear the tickets date-range filter in a cookie.
- Auth: None.
- Payload (JSON): `from` and `to` as `YYYY-MM-DD`. Invalid or missing `from` clears the cookie. If `to` is omitted, it mirrors `from`.
- Success: `200` `{ success: true }` and sets/clears `tickets_date_range` (httpOnly, sameSite=lax, secure in production, 30-day max age).

### GET `/api/admin/export`
- Purpose: Export support requests as CSV.
- Auth: No session check in this route (UI access is restricted elsewhere).
- Query params: `status` (`Open|In Progress|Pending Customer|Resolved`), `q` (search across merchant/outlet/phone/issue/email/fid/oid), `from` and `to` (`YYYY-MM-DD`), `clickup=with|without` to filter by ClickUp link presence. If `from`/`to` omitted but the `tickets_date_range` cookie exists, the cookie values are used. Hidden/archived tickets are excluded by default.
- Success: `200` with `text/csv` attachment `support_requests.csv` (up to 10,000 rows). Columns include ticket metadata (merchant/outlet/phone/FID/OID/issue/notes), ClickUp link/id/status, status, closed at/by, assigned MS PIC, created at, CSAT support/product scores + comments, and a `CSAT WhatsApp Sent` flag. Email and attachment URLs are omitted; user IDs are resolved to names when available.
- Errors: `405` on POST; `500` on CSV generation failure.

### GET `/api/admin/tickets/{id}/history`
- Purpose: Fetch change history for a ticket.
- Auth: Requires valid `ms_auth` cookie; otherwise `401`.
- Params: `id` path param must be a positive integer.
- Success: `200` `{ history }` where each entry has `id, request_id, field_name, old_value, new_value, changed_at, changed_by`.
- Errors: `400` for invalid id; `500` if history lookup fails.

### POST `/login/submit`
- Purpose: Handle login form submissions and issue session cookies.
- Auth: Validates `username`/`password` against MySQL `users.password_hash` (via `verifyPassword`) or the `ADMIN_USER`/`ADMIN_PASS` fallback.
- Payload: `multipart/form-data` with `username`, `password`, optional `redirect` (path; defaults to `/dashboard`).
- Success: Redirects to the `redirect` path and sets `ms_auth` + `ms_user` cookies (httpOnly, sameSite=lax, secure, 12h max age).
- Errors: Invalid credentials redirect to `/login?error=1&redirect=...`. Server failures return `500` JSON `{ message: 'Internal server error.' }`.
