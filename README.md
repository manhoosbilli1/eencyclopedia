# eencyclopedia

A schematic encyclopedia for electronics engineers. Upload KiCad schematics, browse and search a shared library, edit in the browser, and share your work.

**Status:** closed beta

---

## What it does

| Feature | Status |
|---|---|
| Upload `.kicad_sch` (KiCad 7–10) | live |
| Bounding-box ingest (annotate a sub-circuit to upload just that region) | live |
| KiCad-authentic SVG render (uses the file's own lib_symbols geometry) | live |
| KiCad 10 `.kicad_sch` export | live |
| Browser schematic editor (~150 symbols, KiCad-compatible round-trip) | live |
| Fork any visible circuit in the editor | beta |
| Public / unlisted / private visibility with RLS enforcement | live |
| Fork lineage breadcrumb | live |
| Stars and favorites | live |
| Shared scratch links (`/schematic/<slug>`) | live |
| Comments (top-level + one reply level) | beta |
| Hybrid search — Postgres FTS + pgvector cosine (Voyage voyage-3) | live |
| AI summary on upload — topology, rails, key components, intent | live |
| 12 closed-form calculators (Ohm, divider, RC, op-amp, resonance…) | live |
| Suggestion box + public roadmap (`/suggestions`) | live |
| Feature status page (`/features`) | live |

**Not in this project:** AI chat, simulation, billing, distributor pricing, Eagle/Altium import, PCB ingest.

---

## Stack

- **Framework** — Next.js 14 App Router, TypeScript strict
- **Database / Auth / Storage** — Supabase (Postgres 15, pgvector, RLS-default-deny)
- **Hosting** — Vercel
- **AI** (upload summary + search embeddings only) — Gemini 2.5 Flash (default) or Claude Sonnet 4.6 via `AI_PROVIDER` env switch
- **Embeddings** — Voyage `voyage-3` (1024-d)
- **Styling** — Tailwind CSS v3, HSL design tokens

---

## Local setup

```bash
# Prerequisites: Node 20+, pnpm, Supabase CLI ≥ 1.196

pnpm install

# Copy and fill in env vars (see "Environment variables" below)
cp .env.example .env.local

# Link to your Supabase project
supabase login
supabase link --project-ref <your-project-ref>

# Apply all migrations
supabase db push

# Generate typed DB client (optional but recommended)
pnpm db:types

# Run dev server
pnpm dev          # http://localhost:3000

# Smoke test
curl http://localhost:3000/api/health
curl http://localhost:3000/api/db-ping
pnpm test         # Vitest — parser, calc, units
```

---

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | yes | Full URL, no trailing slash |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | From Supabase dashboard |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | From Supabase dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only — never expose to client |
| `AI_PROVIDER` | yes | `gemini` or `anthropic` |
| `GEMINI_API_KEY` | if `AI_PROVIDER=gemini` | |
| `ANTHROPIC_API_KEY` | if `AI_PROVIDER=anthropic` | |
| `VOYAGE_API_KEY` | yes | Required for embeddings regardless of AI provider |
| `ADMIN_EMAILS` | yes | Comma-separated list of admin email addresses |
| `NEXT_PUBLIC_POSTHOG_KEY` | optional | Product analytics |
| `NEXT_PUBLIC_SENTRY_DSN` | optional | Error tracking |

---

## Project layout

```
.
├── app/                  ← Next.js routes
│   ├── page.tsx          ← landing
│   ├── circuit/[id]/     ← circuit detail
│   ├── circuit/new/      ← upload
│   ├── schematic/new/    ← scratch editor
│   ├── schematic/[slug]/ ← shared scratch
│   ├── library/          ← search + listing
│   ├── calc/             ← calculators
│   ├── features/         ← feature status
│   ├── suggestions/      ← suggestion box
│   ├── favorites/
│   ├── profile/[username]/
│   ├── settings/
│   ├── wiki/
│   └── api/
│       ├── schematic/    ← upload + ingest
│       ├── calc/[op]/    ← calculator API
│       ├── symbol/       ← symbol catalogue
│       ├── health/
│       └── db-ping/
├── lib/
│   ├── kicad/            ← parse → normalise → render
│   ├── ai/               ← llm.ts, anthropic.ts, gemini.ts, voyage.ts
│   ├── calc/             ← 12 pure-JS calculators
│   ├── circuits/         ← server actions
│   └── supabase/         ← server / client / admin clients
├── components/
│   ├── ui/               ← header, button, input, label
│   ├── schematic/        ← editor components
│   └── providers/        ← PostHog provider
└── supabase/
    └── migrations/       ← 0001 → 0012
```

---

## Design rules

1. **Scope is frozen.** No new features until the existing ones are solid.
2. **No AI chat** — deleted. Do not recreate.
3. **No simulation** — deleted. Do not recreate.
4. **AI runs once per upload** (summary + embedding for search quality). Not used at query time.
5. **Every AI call logs to `ai_calls`.**
6. **RLS on every table.** Service role only in server actions.
7. **`pnpm` only** in this repo.
8. **Performance:** `next/dynamic` for heavy client components; no new heavy dependencies.

---

## Contributing

Issues and PRs welcome. See `/features` and `/suggestions` on the live site for what's planned and what the community wants.

Before opening a PR:
- `pnpm lint` passes
- `pnpm typecheck` passes
- `pnpm test` passes
- No new dependencies without removing one
