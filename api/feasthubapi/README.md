# FeastHub API

The React client uses Laravel's `/api` routes for storefront, registration, inquiries, authentication, tenant administration, and superadmin operations.

## Local setup

1. Configure the Laravel database in `api/feasthubapi/.env` and run `php artisan migrate`.
2. Set `VITE_API_BASE_URL=http://localhost:8000` in the React app's root `.env`. Use the Laravel origin only; the client adds `/api`.
3. Set `FRONTEND_URL` in the Laravel `.env` to the React app's origin(s), then run Laravel on port 8000 and the React app with `npm run dev`.
4. With an empty database, use **Register a restaurant** from the storefront fallback. Owner registration creates the tenant, starter catalog, and first API token.

To provision the initial platform administrator, set `FEASTHUB_SUPERADMIN_EMAIL` and `FEASTHUB_SUPERADMIN_PASSWORD` (at least 12 characters) in the Laravel `.env`, then run `php artisan db:seed`. The seeder does not create a default account when these values are absent.

API tokens are random bearer credentials returned at login or owner registration. Laravel stores only their SHA-256 hashes and expires them after seven days.

## Team management

Restaurant owners can manage manager and staff accounts from **Team Management** in the admin dashboard. Accounts are restricted to the owner's restaurant; managers and staff cannot manage accounts. The API supports listing, creating, updating, deactivating, and removing team members under `/api/admin/users`. Deactivation, password changes, and removal revoke the affected user's API sessions. Platform-wide account management remains in the superadmin console.
