# eencyclopedia

> A circuit & schematic encyclopedia for electronics engineers — search, store, ask, simulate.

**Status:** pre-alpha, in active 7-day sprint to closed beta (target 2026-05-02).

For full plan see [PLAN.md](./PLAN.md).

---

## Stack

- Next.js 14 (App Router) + TypeScript strict
- Supabase (Postgres 15 + pgvector + Auth + Storage + Edge Functions)
- Anthropic Claude (Sonnet 4.6 + Haiku 4.5) via multi-provider abstraction
- Voyage AI embeddings (`voyage-3`, 1024-d)
- Stripe (V1+)
- Vercel hosting

---

## Bootstrap (Day 1)

> The repo is **already scaffolded** — `package.json`, `tsconfig.json`,
> `next.config.js`, `tailwind.config.ts`, `app/`, `lib/`, `components/`,
> `middleware.ts` are all checked in. Do **not** run `create-next-app` over
> the top of it; that would overwrite our config (especially the `lib/` at
> project root, which is intentional — we are NOT using `--src-dir`).

```bash
# Prereqs: Node 20+, pnpm, Supabase CLI (>=1.196), Vercel CLI

# 1. Install deps from the locked package.json
pnpm install

# 2. Configure env
cp .env.example .env.local
# Fill in: NEXT_PUBLIC_SITE_URL, Supabase URL+anon+service-role,
#         ANTHROPIC_API_KEY, VOYAGE_API_KEY (others can stay blank in V0).

# 3. Create the Supabase project (web UI: https://supabase.com/dashboard)
#    Then link the local CLI to it.
supabase login
supabase link --project-ref <your-project-ref>

# 4. Apply schema migration
supabase db push  # applies supabase/migrations/0001_init.sql

# 5. (Optional but recommended) Generate typed DB schema.
#    Replaces lib/supabase/types.ts placeholder with the real Database type.
pnpm db:types

# 6. Run
pnpm dev   # http://localhost:3000

# 7. Smoke-test the deploy
curl http://localhost:3000/api/health     # → {"status":"ok",...}
curl http://localhost:3000/api/db-ping    # → {"ok":true,"elapsed_ms":<n>}
```

### Manual cloud steps (do these once, in order)

1. **Supabase project**: create from the dashboard, copy the project URL,
   anon key, and service-role key into `.env.local`.
2. **Vercel project**: `vercel link` from this folder, then push the same
   env vars (`vercel env pull` afterwards to round-trip).
3. **Domain** (`eencyclopedia.com` or fallback): point DNS to Vercel; set
   `NEXT_PUBLIC_SITE_URL` accordingly.
4. **Anthropic & Voyage**: paid accounts, keys into `.env.local`.
5. **Stripe / Upstash / Inngest / Sentry / PostHog**: V1 — leave blank now.

---

## Folder layout (target)

```
.
├── PLAN.md                  ← source of truth (read this first)
├── README.md
├── .env.example
├── package.json
├── next.config.js
├── tsconfig.json
├── app/                     ← Next.js routes
│   ├── (auth)/
│   ├── library/
│   ├── circuit/[id]/
│   ├── chat/
│   ├── calc/
│   ├── favorites/
│   └── api/
│       ├── chat/route.ts
│       ├── calc/[op]/route.ts
│       └── circuit/route.ts
├── lib/
│   ├── env.ts                  ← Zod-validated env (server vs public split)
│   ├── ai/
│   │   ├── system-prompts.ts   ← eencyclopedia persona  ✅
│   │   ├── providers.ts        ← Anthropic + abstraction (V0)
│   │   ├── router.ts           ← Haiku-first routing (V0)
│   │   ├── rag.ts              ← hybrid retrieval (V0)
│   │   ├── tools.ts            ← Claude tool definitions (V0)
│   │   └── types.ts
│   ├── kicad/
│   │   ├── parser.ts           ← .kicad_sch → AST (V0)
│   │   ├── normalise.ts        ← AST → eencyc canonical (V0)
│   │   └── render.ts           ← AST → SVG with hover hooks (V0)
│   ├── calc/
│   │   └── index.ts            ← Ohm, divider, RC, gain, etc.  ✅
│   ├── distributors/           ← V1
│   │   ├── lcsc.ts
│   │   ├── mouser.ts
│   │   ├── digikey.ts
│   │   └── octopart.ts
│   ├── utils/
│   │   └── cn.ts               ← clsx + tailwind-merge  ✅
│   └── supabase/
│       ├── client.ts           ← browser client  ✅
│       ├── server.ts           ← RSC/route-handler client  ✅
│       ├── admin.ts            ← service-role client  ✅
│       ├── middleware.ts       ← session-refresh helper  ✅
│       └── types.ts            ← regenerate via `pnpm db:types`
├── components/
├── public/
└── supabase/
    ├── migrations/
    │   └── 0001_init.sql       ← canonical schema
    └── functions/              ← edge functions
```

---

## Key design rules (don't break)

1. **AI must route through Haiku first** unless user explicitly says `/sonnet` or `/opus`. See `PLAN.md §7.2`.
2. **Per-circuit AI summary** is generated once on upload. Chat NEVER sees raw S-exp; it sees the structured summary. See `PLAN.md §6`.
3. **All AI calls metered** to `ai_calls` table. No exceptions. See `PLAN.md §10`.
4. **5-component cap** on circuits in V0. Enforce at upload. Enforce at API.
5. **RLS on every table.** Service role used only in edge functions.
6. **No raw user content into tool-decision JSON.** Prompt-injection risk.
7. **Eval harness must run** before any prompt or RAG change ships.
8. **Disclosure footer** on every AI-generated response.

---

## Daily sprint plan

See `PLAN.md §16`. TL;DR:

| Day | Goal |
|---|---|
| 1 | Foundation: scaffold, Supabase, deploy |
| 2 | Auth + profile |
| 3 | Schematic upload + render |
| 4 | AI chat + RAG (V0 core) |
| 5 | Calculators + favorites |
| 6 | Library + seed content |
| 7 | Polish + closed beta soft launch |
