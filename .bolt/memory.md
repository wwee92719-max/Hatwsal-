# Project memory

## Product intent & audience

- **hatwsal** (imported from GitHub): Vite + React app with an admin-gated area for securely viewing ID photos.
- Intended for a small set of trusted administrators who verify identity by email OTP before accessing sensitive ID imagery.

## Brand personality & voice

- Production-grade, security-conscious, not cookie-cutter (per authoritative `.bolt/prompt`, referenced but not restated here).

## Visual design & UX direction

- Stack: Vite + React (JSX), Tailwind CSS, Lucide React icons, `@/` path alias to `src/`.
- Auth UX is multi-step: email entry → 6-digit code entry → authenticated session → ID photos load.
- No UI/theme/icon packages beyond the template defaults unless explicitly requested.

## Decisions, constraints & rationale

- Backend: Supabase (database, auth, storage for ID photos).
- Admin list lives in Supabase `admin_users` table; DB admin list is the source of truth for photo access checks.
- **Security issue identified:** admin management DB functions were callable by anyone; client-side sign-in only checked a browser-stored list. Both must be fixed.
- Planned implementation (pending user confirmation):
  - Lock admin management functions so only signed-in admins can add/remove/view admins.
  - Add server function: check email against DB `admin_users`; if match, send 6-digit OTP to that Gmail; reject non-admins.
  - Replace current sign-in screen with email → code → real DB session so photo links load for admins.
  - Move admin list management onto the database.
- Constraint: Supabase default auth email template must include the 6-digit code (not just a link); cannot be customized via current tooling — user must verify in Supabase dashboard.
- Admin emails must be provided by the user, starting with their own.

## Open questions & assumptions

- Awaiting user's list of Gmail addresses to seed as admins.
- Awaiting confirmation that Supabase's default sign-in email contains a 6-digit code (not only a magic link).
- Assumption: OTP auth method is Supabase's built-in email OTP (magic link with code), not a custom email sender.
- Assumption: ID photos are stored in Supabase Storage with RLS keyed to authenticated admin session.