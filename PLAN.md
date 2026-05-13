# eencyclopedia — Plan (v1.0, 2026-05-13)

> Living document. AI agents reading this: §1 is non-negotiable.

**Brand:** eencyclopedia  
**Owner:** solo dev (krish.shoaib55@gmail.com)  
**Current phase:** closed beta — perfecting the core loop  

---

## 1. Hard truths (non-negotiable)

### 1.1 Scope freeze

The feature set is frozen. No new features until the existing ones are rock-solid.

**In scope (forever):**
- Upload `.kicad_sch` → parse → render → store
- Browser-based schematic editor with KiCad round-trip
- Share circuits (public / unlisted / private), forks, stars
- Search (hybrid FTS + vector)
- AI summary on upload (for search quality — not a chat feature)
- Calculators (12 closed-form, pure JS)
- Suggestion box + features page

**Permanently out of scope:**
- AI chat / RAG conversation — removed, will not return
- ngspice simulation — removed, will not return
- Stripe / billing — deferred until there is clear demand
- Distributor pricing (LCSC, Mouser, etc.) — out of scope
- Datasheet ingest pipeline — out of scope
- Eagle / Altium import — out of scope
- PCB (.kicad_pcb) ingest — out of scope
- Forum / comments — already implemented; no expansion

### 1.2 Performance first

Every change must leave Vercel bundle size the same or smaller. Use `next/dynamic` for heavy client components. No new dependencies without removing one first.

### 1.3 RLS default-deny

Every table has RLS. Service role used only in server actions and edge functions. Never in client code.

---

## 2. Core user flow

```
1. Sign up (magic-link email)
2. Upload .kicad_sch  ─→  parse ─→ AI summary ─→ SVG render ─→ stored
3. View circuit: SVG + component BOM + AI summary
4. Edit: open in browser editor ─→ save as fork
5. Share: set visibility, copy URL
6. Search: FTS + vector on the library
```

That's it. Everything else is polish on this loop.

---

## 3. Architecture

```
Browser (Next.js 14 App Router)
  ├─ KiCad S-exp parser (lib/kicad/)
  ├─ SVG renderer (data-net, data-designator hooks for hover)
  ├─ Schematic editor (components/schematic/)
  ├─ Calculator UI (lib/calc/ — no AI)
  └─ Supabase JS client (RLS-protected)
              │
Vercel (Next.js API routes / server actions)
  ├─ /api/schematic   → upload, parse, summary, embed
  ├─ /api/calc/[op]   → pure JS, no AI
  ├─ /api/symbol      → symbol catalogue lookup
  └─ /api/health, /api/db-ping
              │
Supabase (Postgres 15 + pgvector + Auth + Storage)
  ├─ schematics, profiles, schematic_components
  ├─ circuit_favorites, suggestions, suggestion_upvotes
  ├─ kb_chunks (vector search index)
  ├─ ai_calls (metering)
  └─ stars_and_comments (0008 migration)

External
  ├─ Gemini 2.5 Flash / Claude Sonnet 4.6  (upload summary only)
  └─ Voyage voyage-3                        (embeddings only)
```

---

## 4. Tech stack (locked)

| Layer | Choice |
|---|---|
| Framework | Next.js 14 App Router, TypeScript strict |
| DB / Auth / Storage | Supabase (Postgres 15, pgvector, RLS-default-deny) |
| Hosting | Vercel |
| AI (upload summary only) | Gemini 2.5 Flash (default) OR Claude Sonnet 4.6 via `AI_PROVIDER` env |
| Embeddings | Voyage `voyage-3` (1024-d) |
| Styling | Tailwind CSS v3, HSL token system |

---

## 5. Database tables

Canonical schema in `supabase/migrations/`.

| Table | Purpose |
|---|---|
| `profiles` | One per auth user — username, karma, settings |
| `schematics` | Uploaded circuits — sexp, svg_url, ai_summary, embedding |
| `schematic_components` | Per-circuit component index (designator, value) |
| `circuit_favorites` | User ↔ circuit bookmarks |
| `components` | Global parts catalogue (MPN-keyed) |
| `kb_chunks` | Vector search index (circuit summaries + any future curated content) |
| `ai_calls` | Every model call metered (tokens, cost, provider) |
| `karma_events` | Additive karma ledger |
| `suggestions` | Public suggestion box posts |
| `suggestion_upvotes` | Per-user upvote records |

---

## 6. KiCad → website pipeline

```
client upload
  │
server action: createSchematic
  ├─ validate (size, MIME, component count ≤ 200)
  ├─ parse:      lib/kicad/parse.ts  → KiCad AST
  ├─ normalise:  lib/kicad/normalise.ts → canonical eencyc S-exp
  ├─ render:     lib/kicad/render.ts → SVG
  ├─ store:      schematics row (sexp, svg_url)
  └─ async:      generate AI summary → embed → update row
```

### Canonical eencyc-schematic S-exp

```
(eencyc-schematic
  (version 1)
  (units mm)
  (component (designator "R1") (mpn "" "") (value "10k") (pos 50 50) (rot 0)
             (pin "1" (net "VIN")) (pin "2" (net "OUT")))
  (net "VIN") (net "OUT") (net "GND"))
```

---

## 7. Routes

| Path | Auth | Purpose |
|---|---|---|
| `/` | public | Landing |
| `/login` | public | Magic-link sign-in |
| `/auth/callback` | public | PKCE exchange |
| `/calc` | public | 12 calculators |
| `/onboarding` | authed | Username + settings |
| `/library` | authed | Circuit listing + search |
| `/circuit/new` | authed | Upload .kicad_sch |
| `/circuit/[id]` | RLS | Detail: SVG + AI summary + BOM |
| `/schematic/new` | public | Scratch editor |
| `/schematic/[slug]` | public | Shared scratch view |
| `/favorites` | authed | Bookmarked circuits |
| `/profile/[username]` | public | Public profile |
| `/settings` | authed | Account settings |
| `/features` | public | Feature status matrix |
| `/suggestions` | public | Suggestion box + upvotes |
| `/wiki` | public | Usage documentation |
| `/admin/seed` | admin | Bulk circuit seed |
| `/admin/ingest` | admin | Direct file ingest |

---

## 8. Calculators (pure JS, no AI)

`lib/calc/index.ts`:

```ts
ohm, voltageDivider, currentDivider, rcTau, rlTau,
ledResistor, opampGain, reactance, resonance, cutoffFreq
```

All also exposed at `/api/calc/[op]`.

---

## 9. Performance targets

| Metric | Target |
|---|---|
| `/library` TTFB | < 200 ms |
| `/circuit/[id]` LCP | < 1.5 s |
| Editor initial JS | < 300 kB gzip |
| Lighthouse (landing) | ≥ 90 perf |

Use `next/dynamic` for the editor, symbol browser, and any heavy client island.

---

## 10. What "perfecting" means

For each core feature, the bar is:

- **Upload**: handles malformed files gracefully; error message tells user exactly what's wrong
- **Render**: visually matches KiCad for any circuit with ≤ 200 components
- **Editor**: round-trips to KiCad without data loss; undo/redo never corrupts state
- **Share**: fork lineage correct; visibility change propagates immediately
- **Search**: top result for a circuit's own title; no blank results on partial words
- **Calculators**: correct output; engineering-prefix inputs work universally
- **Suggestions**: post + upvote round-trip works without page reload

---

## 11. Security

- RLS default-deny on every table. Service role only in server actions.
- File upload: 5 MB cap, MIME check.
- No `eval` of AI output, ever.
- CSP headers via `next.config.js`.
- Secrets only in Vercel / Supabase env — never committed.

---

## 12. Open questions (not blocking)

- [ ] Domain name confirmed?
- [ ] Bootstrap budget for Supabase Pro + Vercel Pro?
- [ ] Seed circuit list (topics, count)?
- [ ] Email provider for transactional (Resend / Postmark)?

---

## 13. How AI agents should consume this file

1. §1 is non-negotiable. Do not add features outside the in-scope list.
2. §5 schema is canonical. DB changes → migration file only.
3. §6 S-exp shape is canonical for in-DB storage.
4. Performance: every code change must not regress §9 targets.
5. Every AI model call MUST write to `ai_calls`.
6. When uncertain, write `<<ASSUMPTION: ...>>` inline.
