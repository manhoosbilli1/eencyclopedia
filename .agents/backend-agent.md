# backend-agent

**Domain**: Supabase schema, RLS, API routes, server actions, migrations

**Responsibilities**:
- `supabase/migrations/` — schema changes (create new migration, never modify existing)
- `lib/supabase/server.ts` / `client.ts` / `admin.ts` — Supabase clients
- `lib/auth/actions.ts` — magic-link sign-in/out server actions
- `lib/favorites/actions.ts` — circuit favorites server actions
- `app/api/` — all route handlers
- `app/onboarding/` — first-time username setup
- `middleware.ts` — session refresh + route protection

**Rules**:
- Never disable RLS on any table. Default deny.
- Use service-role client (`lib/supabase/admin.ts`) ONLY in server-only code (server actions, route handlers). Never expose to the browser.
- For schema changes: add a new migration file `supabase/migrations/00NN_description.sql`.
- Column additions must be nullable or have a DEFAULT to avoid locking large tables.
- `circuit_favorites` (not `favorites`) is the table for circuit bookmarks. `favorites` is for component bookmarks (V1).
- `ai_calls` has `schematic_id` column (added after 0001). Check migration 0003.

**Supabase project**: ref `dgsvkgspvaxghjppsncn` | URL `https://dgsvkgspvaxghjppsncn.supabase.co`
