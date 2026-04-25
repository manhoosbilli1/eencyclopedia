# Day 1.5 Handoff — 2026-04-25

> **TL;DR**: Supabase is live and migrated. Code scaffold is complete.
> Run **one PowerShell script** on your Windows box to finish git/GitHub/install/dev,
> then add three secrets to `.env.local`, then `pnpm dev`. ~10 minutes.

---

## What's done (in the cloud + workspace)

| Item | Status | Detail |
|---|---|---|
| Supabase project | ✅ live | `eencyclopedia` · ref `dgsvkgspvaxghjppsncn` · region `eu-west-2` (London) · org `manhoosbilli1's projects` (Vercel-managed, free tier) |
| Migration `0001_init` | ✅ applied | 10 tables, all RLS-on, ivfflat + GIN + tsvector indexes |
| pgvector extension | ✅ enabled | v0.8.0, schema `public` (1024-d for Voyage `voyage-3`) |
| `auth.users → profiles` trigger | ✅ live | `handle_new_user()` runs on signup |
| `lib/`, `app/`, `components/`, `middleware.ts` | ✅ written | typed, strict TS, RSC-safe |
| `.env.local` (with public Supabase keys) | ✅ written | three blanks left for you to paste |

## What you must do (Windows side)

The sandbox can't run git/pnpm against your mounted folder due to write-only-no-delete permissions. **Open PowerShell on Windows** in `C:\Users\capis\Desktop\server\eencyclopedia\eencyclopedia` and run **`scripts/finish-setup.ps1`** — see file in repo root for the script.

Steps the script does:

1. Removes the half-finished `.git/` and stale `eencyclopedia-plan.md` that the sandbox couldn't delete.
2. Runs `git init -b main`, `git add .`, initial commit.
3. Creates a private GitHub repo via `gh` CLI (if installed) **or** prints the manual URL to create one + the `git remote add` command to paste.
4. Pushes to origin.
5. Runs `pnpm install`.
6. Boots `pnpm dev` and curls `/api/health` + `/api/db-ping`.

## What you must paste into `.env.local`

Three values are needed before `pnpm dev` will boot (env Zod validation will fail otherwise):

| Var | Where to grab it |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | https://supabase.com/dashboard/project/dgsvkgspvaxghjppsncn/settings/api-keys → "Service role secret" |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| `VOYAGE_API_KEY` | https://dashboard.voyageai.com/api-keys |

`SUPABASE_DB_URL` already has a `<DB-PASSWORD>` placeholder if you want pooled-DB access from CLI tooling later — grab the password from Supabase dashboard → Project Settings → Database. Not required for V0 dev.

## Vercel deploy (do this once)

The Vercel MCP isn't yet connected in your Cowork session. Two options:

**Option A — Web dashboard (5 minutes, easiest)**
1. https://vercel.com/new → Import Git Repository → pick `eencyclopedia`.
2. Framework preset: **Next.js** (auto-detected).
3. Environment variables: copy every line from `.env.local` into Vercel's env-vars UI **except** `NODE_ENV`, `NEXT_PUBLIC_SITE_URL` (set this to your Vercel URL after first deploy, e.g. `https://eencyclopedia.vercel.app`).
4. Deploy. Vercel will tail the build log; first build is ~90s.
5. After deploy, edit `NEXT_PUBLIC_SITE_URL` to the assigned URL, then redeploy.

**Option B — Connect Vercel MCP**
In Cowork: settings → connectors → connect **Vercel**. Once connected, ask me to "deploy to Vercel" and I'll do steps 1–5 via the MCP.

> **Tip**: Vercel-managed Supabase orgs (which yours is) auto-sync env vars between Vercel and Supabase. You may see `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` already populated when you import — verify they match the values in `.env.local` (project ref `dgsvkgspvaxghjppsncn`).

## Verification — what "working" looks like

After `pnpm dev`:

```
GET http://localhost:3000              → 200, landing page
GET http://localhost:3000/api/health    → {"status":"ok","service":"eencyclopedia",...}
GET http://localhost:3000/api/db-ping   → {"ok":true,"elapsed_ms":<n>}
```

If `/api/db-ping` returns 503, open the response — `error` will be visible if you're logged in as an admin (which you are: `ADMIN_EMAILS=krish.shoaib55@gmail.com`).

## Things I noticed and want flagged

1. **Vercel-Supabase coupling**: Your Supabase org is `vercel_icfg_*`, meaning Supabase projects are billed/managed via Vercel. This is fine for V0 but two side-effects: (a) you can't pause/restore from the Supabase dashboard the same way, (b) the project ref is opaque — write it down somewhere durable. Already in memory.
2. **Free-tier Supabase auto-pauses inactive projects** (after ~7 days idle). If you don't `pnpm dev` for a week, the project goes INACTIVE and `/api/db-ping` will 503 until you hit the dashboard "Restore" button. Set a calendar reminder or just keep building.
3. **Storage bucket not yet created**. Day 3 (schematic upload) will need a `circuits` bucket with RLS. I deferred that until we're actually uploading files.
4. **Edge Functions not yet deployed**. Day 4 (AI chat) will deploy a `chat` edge function — no infra needed in V0 yet.
5. **You still have 3 INACTIVE Supabase projects** (`supabase-purple-village`, `supabase-fuchsia-umbrella`, `WMS_database`) eating slots in your Vercel-Supabase quota. If you hit the project limit later, delete the unused ones from the Vercel dashboard.
6. **`db:types` won't run cleanly until the Supabase CLI is logged in** on your Windows machine. The PowerShell script doesn't do this — run `supabase login` once, then `pnpm db:types` regenerates `lib/supabase/types.ts` from the live schema. Until then the placeholder permissive types are fine.

## How I "remember" between sessions

I save persistent notes under `~/AppData/Roaming/Claude/.../memory/` indexed by `MEMORY.md`. Day 1.5 entries written:

- `eencyclopedia_supabase.md` — project ref, region, URL, anon-key hint, schema state
- `eencyclopedia_state.md` — sprint day, what's deployed, what's next
- `eencyclopedia_constraints.md` — sandbox limits I keep hitting (no deletes in mount, no pnpm install)

Also: `PLAN.md` is the canonical source of truth. If memory and PLAN disagree, trust PLAN.

## What's next (Day 2)

Per PLAN.md §16:

- Auth UI: `/login`, `/signup`, magic-link callback at `/auth/callback`
- Profile onboarding form: pick username, set explanation_mode preference
- Header with user menu (avatar, signout)
- Protect `/library`, `/circuit/*`, `/chat`, `/calc`, `/favorites` with middleware redirect to `/login` for unauth users
- Tests: one Vitest spec for the username regex + length check (matches the DB CHECK constraint on `profiles.username`)

Estimated work: 4–6 hours focused.

---

## Quick reference

| What | Value |
|---|---|
| Supabase project ref | `dgsvkgspvaxghjppsncn` |
| Supabase URL | https://dgsvkgspvaxghjppsncn.supabase.co |
| Supabase region | eu-west-2 (London) |
| Supabase Studio | https://supabase.com/dashboard/project/dgsvkgspvaxghjppsncn |
| Vercel-Supabase org | `vercel_icfg_EntDp1gswyD9LYzrUvWXKiTe` |
| Workspace folder | `C:\Users\capis\Desktop\server\eencyclopedia\eencyclopedia` |
| Local dev URL | http://localhost:3000 |
