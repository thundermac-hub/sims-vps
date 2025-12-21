# 🧾 Product Requirements Document (PRD)
**Project Title:** Slurp Internal Management System (SIMS)  
**Prepared by:** Mohammad Hafiz bin Hamidon (Junior Product Manager)  
**Date:** [Insert Date]  
**Version:** 1.0  

---

## 1. Overview
### 1.1 Purpose
SIMS is the internal, department-aware support platform for Slurp. Merchants submit cases through a public form, while the Merchant Success team triages tickets with live dashboards, ClickUp integrations, and WhatsApp follow-ups. Data is stored in MySQL with attachments in MinIO and runs locally or in a container.

### 1.2 Objectives
- Simplify merchant support request submission and ensure every case is logged automatically.
- Provide internal teams with real-time visibility into ticket queues, status updates, and MS PIC workload.
- Automate operational tasks (WhatsApp redirect, ClickUp task creation, CSV exports).
- Offer governance via department-scoped access and Super Admin overrides for user management.

---

## 2. Key Features
| # | Feature | Description | Primary User |
|---|----------|--------------|--------------|
| 1 | **Support Request Form** | Public form (name, outlet, phone, email, issue, attachment) stored in MySQL + MinIO | Merchant |
| 2 | **WhatsApp Redirect** | Auto-generates message to `WHATSAPP_PHONE` with case summary | Merchant |
| 3 | **Ticket Inbox** | `/tickets` listing with filters, CSV export, signed attachment URLs, 15s auto-refresh | Merchant Success |
| 4 | **Ticket Detail Modal** | Edit fields, statuses, MS PIC assignment, ClickUp create/link/unlink/refresh | Merchant Success |
| 5 | **Dashboard Analytics** | `/dashboard` KPIs (active tickets = Open/In Progress/Pending Customer, new vs yesterday, resolved vs yesterday, MS PIC workload, pending-customer backlog per MS PIC, active tickets by issue type) | Merchant Success Lead |
| 6 | **User Management** | `/users` modal-based add/edit/delete with department scoping + role constraints | Super Admin + Dept Admin |
| 7 | **Profile & Password** | `/profile` exposes account details and password change (current + new + confirm) | All internal users |
| 9 | **CSAT Survey** | Expiring survey link per resolved ticket (`/csat/[token]`, EN/BM copy, stored responses) | Merchant |
| 10 | **CSAT Dashboard** | `/csat` breakdowns (support/product satisfaction, averages, verbatim) | Merchant Success Lead / Super Admin |
| 8 | **Department-aware Experience** | Navbar and access control adapt to user department; Super Admin sees all | All internal users |

---

## 3. Functional Requirements
### 3.1 Support Request Form
**Fields:** Merchant Name, Outlet Name, Phone Number, Email, Issue Type, Issue Description, Attachment.  

**On Submit:**  
Save to MySQL + MinIO → Generate WhatsApp pre-filled message → Redirect to chat link.

### 3.2 Dashboard (Internal)
Includes login, request list, detail view, progress tracker, filter/search, and optional export function.

---

## 4. System Architecture
**Frontend:** Next.js 16 (App Router, React Server Components)  
**Backend:** Next.js Server Actions / Route Handlers (Node.js runtime in Docker)  
**Database:** MySQL  
**Storage:** MinIO bucket (private, signed URLs)  
**Integrations:** WhatsApp (wa.me), ClickUp API, MinIO SDK  

**Database Table: `support_requests` (excerpt)**  
| Column | Type | Description |
|---------|------|-------------|
| id | INT (PK, AUTO_INCREMENT) | Unique record ID |
| merchant_name | VARCHAR(100) | Merchant’s name |
| outlet_name | VARCHAR(100) | Outlet name |
| phone_number | VARCHAR(20) | Contact number |
| email | VARCHAR(100) | Email (optional) |
| issue_type | VARCHAR(50) | Issue category |
| issue_description | TEXT | Problem details |
| attachment_url | VARCHAR(255) | Uploaded file (optional) |
| status | ENUM('Open','In Progress','Pending Customer','Resolved') | Progress status |
| created_at | DATETIME | Submission timestamp |
| updated_at | DATETIME | Last update timestamp |

---

## 5. User Flow
1. **Merchant:** Access `/supportform` → Fill details + attachment → Submit → Data stored in MySQL/MinIO → Redirect to WhatsApp conversation.
2. **Merchant Success:** Login → `/dashboard` + `/tickets` + `/csat` auto-refresh every 15s → Update statuses/MS PIC/ClickUp links → Export CSV when needed → Share CSAT link after resolution (copy/WhatsApp) when applicable.
3. **Admins:** Visit `/users` → Add/edit users via modal. Super Admin chooses any department/role; department Admins are locked to their department and can assign only Admin/User roles.

---

## 6. Non-Functional Requirements
- Security: Cookie session, hashed passwords, secrets stored server-side only (`.env` files or secret store).
- Performance: <3-second perceived load on dashboard/tickets; auto-refresh ensures near-real-time data.
- Scalability: Dockerized; target 500+ requests/month.
- Data retention: 12 months (backed by MySQL dumps and MinIO object backups).
- Availability: 99.5%+.

---

## 7. Success Metrics
- 90% of support requests originate from the SIMS form.
- 50% faster initial acknowledgement (status change) vs. legacy workflow.
- Dashboard KPIs (new/resolved today) match database counts ±1%.
- Zero spreadsheets/emails needed for ticket tracking post launch.

---

## 8. Future Enhancements (v2)
- Auto-ticket IDs per department and SLA timers.
- Notifications (email/Slack) for breaches or high-priority tickets.
- Bulk ticket actions and saved filters.
- Extend dashboards to Sales & Marketing, Operations, Product & Engineering.
