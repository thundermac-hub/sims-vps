-- Danger: irreversibly removes all support tickets and CSAT data.
-- Run against the intended environment only (e.g., local dev DB).
-- Order matters because of foreign-key constraints.

START TRANSACTION;

-- Remove CSAT responses first (depends on csat_tokens and support_requests).
DELETE FROM csat_responses;

-- Remove CSAT tokens (depends on support_requests).
DELETE FROM csat_tokens;

-- Remove ticket history (depends on support_requests).
DELETE FROM support_request_history;

-- Remove support tickets.
DELETE FROM support_requests;

COMMIT;
