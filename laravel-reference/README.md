# Hearth & Table — Multi-Tenant Catering Platform

## Architecture Overview
- **Frontend**: React 19 + TypeScript + Tailwind CSS + React Hook Form + Zod + Lucide React + jsPDF
- **Active Preview Runtime**: Express REST API (`server.ts`) + `node:sqlite` (`catering.db`) + Vite SPA on port `3000`
- **Laravel / MySQL Reference**: Complete relational MySQL migration (`laravel-reference/database/migrations/2026_01_01_000001_create_catering_schema.php`) and Sanctum route blueprint (`laravel-reference/routes/api.php`)

## Multi-Tenant Isolation
Every restaurant-owned entity (`users`, `customers`, `event_types`, `catering_packages`, `food_categories`, `food_items`, `catering_inquiries`, `quotations`, `bookings`, `notifications`, `audit_logs`) is scoped by `restaurant_id`. Authenticated admin endpoints enforce `WHERE restaurant_id = req.user.restaurant_id`.

## Demo Credentials
- **Maison Saffron (Flagship)**: `claire@maisonsaffron.com` / `ChefAdmin2026!` (Owner)
- **Maison Saffron Manager**: `marcus@maisonsaffron.com` / `ChefAdmin2026!` (Manager)
- **Atelier Verde (Tenant 2)**: `elena@atelierverde.com` / `ChefAdmin2026!` (Owner)

## Sample Customer Inquiry Tracking Codes
- `INQ-MS-2026-1042` / `amelia.thornton@northstar.io` (Quotation Sent — ready to review & accept)
- `INQ-MS-2026-1039` / `priya.kapoor@gmail.com` (Confirmed Booking `BK-MS-2026-0814`)
- `INQ-MS-2026-1045` / `s.lindqvist@bayprep.edu` (Request Received — custom tray menu)

## REST API Endpoints
- `GET /api/public/restaurants` — List active restaurant storefronts
- `GET /api/public/:slug/storefront` — Fetch tenant branding, event types, packages, categories, food items
- `POST /api/public/:slug/inquiries` — Rate-limited, Zod-validated multi-step quotation request submission
- `GET /api/public/:slug/track?reference=...&contact=...` — Reference + email/phone verified status & quotation viewer
- `POST /api/public/:slug/quotations/:quotationNumber/respond` — Explicit customer acceptance or revision request
- `POST /api/auth/login` — Bearer token login (`bcryptjs` verified)
- `GET /api/admin/overview` — Tenant KPI metrics, upcoming events, monthly inquiry breakdown
- `GET|PATCH /api/admin/inquiries` — Search, filter, assign staff, update status, export CSV (`/export/csv`)
- `POST /api/admin/inquiries/:id/quotations` — Build & optionally email itemized quotation
- `POST /api/admin/inquiries/:id/convert-booking` — Convert accepted quotation to booking
- `POST /api/admin/bookings/:id/payments` — Record manually verified payment & recalculate balance

## Deployment Instructions
```bash
npm install
npm run build
NODE_ENV=production npm start
```
