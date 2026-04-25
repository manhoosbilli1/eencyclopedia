# eencyclopedia — Master Plan (v0.2, 2026-04-25)

> Living document. `[FILL]` = needs user input but not blocking. AI agents reading this should jump to the section they need. **Section 1 (hard truths) is non-negotiable.**

**Brand:** eencyclopedia
**Owner:** solo dev (krish.shoaib55@gmail.com)
**Hard launch target:** soft launch (closed beta) 2026-05-02; public launch 2026-06-06

---

## 0. What changed from v0.1

| Removed | Reason |
|---|---|
| Napkin / image-to-schematic OCR | User dropped scope |
| PCB analysis (gerber, thermal, PDN 1D/2D/3D) | User dropped scope |
| Schematic editor | User dropped scope |
| Mobile app | User dropped scope |
| Team/enterprise tier | Defer until traction |
| Vision (image upload to AI) | Out of V0–V2 |

| Added / clarified | Why |
|---|---|
| **AI Q&A is V0-day-1 critical** | User flagged as core differentiator |
| **"Our Claude" via system-prompt + tool-use + RAG** (NOT fine-tuning) | See §1.2 |
| **Per-circuit AI summary on upload, embedded for RAG** | User explicitly requested; saves tokens at query time |
| **Trivial calculator (Ohm/divider/RC/gain) in V0** | User flagged as must-have |
| **Hover on SVG net shows values OR opens chat action** | User confirmed UX |
| **LCSC distributor** | User flagged essential for hobbyist audience |
| **Multi-provider LLM abstraction** | User confirmed (Claude first, others later) |
| **English-only, global** | User confirmed |
| **7-day sprint to closed beta** | New deadline |

---

## 1. Hard truths (read first)

### 1.1 The 7-day timeline

A polished public launch in 7 days is not realistic for the scope below. What is realistic:

| Day | Realistic outcome |
|---|---|
| 7 | **Closed beta**: deployed app, 20–50 invited users, V0 features working but rough |
| 14 | **Open beta**: anyone with link can sign up, V0 polished |
| 30–45 | **Public launch**: paid tiers ready, marketing copy, seed library curated |

This document plans for the 7-day milestone as "closed beta," not "production public launch." If you push for full public launch on day 7 you'll ship something embarrassing.

### 1.2 "Our Claude" vs vanilla Claude — the honest path

You cannot fine-tune Claude in a week. Anthropic does not offer fine-tuning on the direct API. AWS Bedrock offers Claude Haiku fine-tuning but it requires:
- ~1,000+ high-quality `(prompt, ideal_response)` pairs
- A held-out evaluation set
- Several days of iteration + cost
- Domain expertise to judge "good" answers

What we do instead — which is what 90% of "fine-tuned GPT wrappers" actually are:

| Layer | Effect |
|---|---|
| **System prompt persona** | Refuses non-electronics topics; cites datasheets; reasons from physics first principles; offers math-mode vs intuitive-mode based on user setting |
| **Tool use** | Claude has access to: SPICE solver, Ohm/divider/RC/gain calculators, datasheet RAG search, parts catalog search, schematic-summary lookup. Vanilla Claude has none. |
| **RAG retrieval** | Every query augmented with: textbook chunks, datasheet excerpts, related circuit summaries, top-karma user explanations. |
| **Output format** | Always: math derivation (KaTeX) + intuition + datasheet refs + caveats. |
| **Eval harness** | We measure ourselves vs vanilla Claude on a fixed eval set (start small: 50 hand-written EE questions, scale to 500). |

After 3–6 months and ~1,000 thumbs-up/down user signals, we revisit fine-tuning Claude Haiku on Bedrock. Estimated cost: $200–$2,000 one-time training, ~10–20% inference premium.

**Bottom line: V0 differentiation is real and shippable. Fine-tuning is V2/V3.**

### 1.3 "How will it remember and improve"

The encyclopedia is a **growing retrieval pool, not a model that learns**. Be honest with users about this.

```
On every circuit upload:
  1. Parse KiCad .kicad_sch → canonical S-exp
  2. Run a one-time AI pass → structured summary (topology, rails, intent, key components)
  3. Embed summary + structured fields → pgvector
  4. Store. Never re-run unless circuit edited.

On every datasheet/textbook ingest:
  1. Chunk (300 tokens, 50 overlap)
  2. Embed
  3. Store with metadata (source, mfr, family)

On every user thumbs-up answer:
  1. Save (query, answer, retrieval_set, schematic_ctx) to feedback table
  2. After 1k entries → fine-tune candidate dataset
```

The improvement loop is: more uploads → bigger retrieval pool → better RAG → better answers.

---

## 2. Scope — V0 / V1 / V2

### V0 — closed beta (Day 7)

**Must-have:**
- Auth (email + Google OAuth via Supabase)
- Upload `.kicad_sch` file → parse → store S-exp → render to SVG (read-only)
- AI chat (RAG-powered) with eencyclopedia system prompt
- Per-circuit AI summary generated on upload
- Trivial calculator endpoints (Ohm, V-divider, current-divider, RC time constant, op-amp gain, LED resistor)
- Component favorites (add/remove)
- SVG hover → tooltip with last sim values OR right-click → "ask chat about this"
- Seed library: 20–30 example circuits (you provide source files)
- Karma stub (count only, no display rules yet)

**Out of V0:**
- Posts/comments/forum → V1
- Stripe billing → V1 (free for everyone in V0)
- ngspice WASM → V1 (no live sim yet; show static results if circuit author included them)
- API → V1
- Distributor pricing → V1
- Datasheet ingest pipeline → V1

### V1 — open beta (Day 14)

- ngspice WASM live simulation (≤5 components)
- Forum/posts/comments/votes
- Distributor pricing: LCSC, Mouser, Digi-Key, Octopart
- Stripe checkout (test mode → live)
- API v0 read endpoints
- Datasheet RAG ingest worker
- Hard limit: 5 components/circuit

### V2 — public launch (Day 30–45)

- Public launch with marketing site
- Paid tiers active, AI rate limits enforced
- API v1 with write endpoints
- Search: hybrid (FTS + vector)
- 200+ curated seed circuits
- Component cap raised to 10
- Eval harness running

### V3+ (post-launch backlog)

- Component cap → 20
- Schematic editor (basic)
- Image-to-S-exp (Claude Vision) with mandatory edit step
- Fine-tuned Haiku on Bedrock once feedback corpus exists
- Knowledge graph view of circuits & components

---

## 3. Architecture

```
Browser (Next.js 14 App Router)
  ├─ KiCad S-exp parser (browser-side, sexpr → AST)
  ├─ AST → SVG renderer (data-net, data-designator hooks for hover)
  ├─ Chat UI (SSE streaming)
  ├─ Calculator UI (deterministic, no AI)
  └─ Supabase JS client (RLS-protected)
              │
Vercel Edge / Next API Routes
  ├─ /api/chat      → AI router → Claude / Haiku + tools
  ├─ /api/calc      → JS only, no AI
  ├─ /api/circuit   → upload, parse, summary, embed
  └─ Stripe webhooks
              │
Supabase
  ├─ Postgres 15 + pgvector
  ├─ Auth
  ├─ Storage (raw .kicad_sch + reference images)
  ├─ Edge Functions (datasheet-parse, circuit-summary)
  └─ pg_cron (nightly aggregations)
              │
External APIs (V1+)
  ├─ Anthropic (Claude Sonnet 4.6 / Haiku 4.5)
  ├─ Voyage or OpenAI embeddings
  ├─ LCSC scrape gateway / Mouser / Digi-Key / Octopart APIs
  └─ Stripe
```

### LLM provider abstraction

```ts
// lib/ai/providers.ts (V0)
export interface LLMProvider {
  chat(opts: ChatOpts): AsyncIterable<Token>;
  complete(opts: CompleteOpts): Promise<string>;
}

export const providers = {
  anthropic: new AnthropicProvider(),  // V0
  openai:    new OpenAIProvider(),     // V1+, fallback
  google:    new GoogleProvider(),     // V2+
};
```

User setting `settings.ai_provider` chooses default. Internal router can override per task (e.g., embeddings always Voyage regardless of chat provider).

---

## 4. Tech stack — locked

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 App Router + TypeScript strict | Default, RSC reduces boilerplate |
| DB / Auth / Storage | Supabase (Postgres 15, pgvector, Auth, Storage) | One stack, RLS-aware. **Confirmed.** |
| Hosting | Vercel | Native Next.js |
| Payments | Stripe + Stripe Tax | **Confirmed.** Live mode in V1. |
| LLM (chat) | Anthropic Claude Sonnet 4.6 (analysis), Haiku 4.5 (router) | Multi-provider abstraction in code |
| Embeddings | Voyage `voyage-3` (1024-d) | Strongest retrieval benchmarks; switch via env var if needed |
| S-exp parsing | `sexpr-plus` npm package + custom validator | Battle-tested |
| SVG render | Custom (no third-party canvas needed for read-only V0) | KiCad's render is too heavy |
| SPICE (V1) | [eecircuit ngspice-wasm](https://github.com/danchitnis/eecircuit) | Browser-side, free |
| Search | Postgres FTS + pgvector (hybrid via RRF) | Free, integrated, sufficient until 100k circuits |
| Background jobs | Inngest (managed) for V1+ | Free tier covers our load |
| Logs/metrics | Sentry + PostHog (free tiers) | Standard |
| LLM observability | Langfuse self-hosted on Supabase | Cheap, full prompt traces |
| Testing | Vitest + Playwright | Standard |
| CI/CD | GitHub Actions → Vercel | Standard |

---

## 5. Database schema (V0)

Migration file: `supabase/migrations/0001_init.sql`. Reproduced here for reference; canonical version is in repo.

```sql
-- profiles ------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique not null check (length(username) between 3 and 32),
  karma int not null default 0,
  bio text,
  settings jsonb not null default '{
    "explanation_mode": "intuitive",
    "preferred_units": "SI",
    "ai_provider": "anthropic"
  }'::jsonb,
  created_at timestamptz not null default now()
);

-- components catalogue (per-MPN, deduplicated) -----------------------
create table components (
  id uuid primary key default gen_random_uuid(),
  mpn text not null,
  manufacturer text not null,
  family text,
  type text not null,                    -- resistor|capacitor|opamp|ldo|mcu|diode|...
  parameters jsonb not null,
  datasheet_url text,
  datasheet_sha256 text,
  embedding vector(1024),
  source text not null check (source in ('octopart','lcsc','mouser','digikey','datasheet','user','curated')),
  verified bool not null default false,
  created_at timestamptz not null default now(),
  unique (manufacturer, mpn)
);
create index components_embedding_idx on components using ivfflat (embedding vector_cosine_ops);
create index components_params_idx on components using gin (parameters);

-- schematics ----------------------------------------------------------
create table schematics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text,
  sexp text not null,
  raw_kicad_url text,                    -- pointer to original .kicad_sch in storage
  svg_url text,
  component_count int not null check (component_count <= 5),  -- V0 cap
  visibility text not null check (visibility in ('public','unlisted','private')),
  fork_of uuid references schematics(id),
  spice_results jsonb,
  ai_summary text,                       -- generated once on upload, used for RAG
  ai_summary_struct jsonb,               -- {topology, rails, intent, key_components, design_notes}
  summary_embedding vector(1024),
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(description,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(ai_summary,'')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index schematics_search_idx on schematics using gin (search_vector);
create index schematics_owner_idx on schematics (owner_id);
create index schematics_public_idx on schematics (visibility, created_at desc);
create index schematics_summary_emb_idx on schematics using ivfflat (summary_embedding vector_cosine_ops);

create table schematic_components (
  schematic_id uuid references schematics(id) on delete cascade,
  designator text not null,
  component_id uuid references components(id),
  value text,
  primary key (schematic_id, designator)
);

-- favorites -----------------------------------------------------------
create table favorites (
  user_id uuid references profiles(id) on delete cascade,
  component_id uuid references components(id),
  notes text,
  created_at timestamptz not null default now(),
  primary key (user_id, component_id)
);

-- karma events (additive ledger; karma column is denormalised cache) -
create table karma_events (
  id bigserial primary key,
  user_id uuid not null references profiles(id),
  delta int not null,
  reason text not null,                 -- 'circuit_uploaded'|'circuit_starred'|'comment_upvoted'|...
  ref_id uuid,
  created_at timestamptz not null default now()
);
create index on karma_events (user_id, created_at desc);

-- AI usage / billing meter -------------------------------------------
create table ai_calls (
  id bigserial primary key,
  user_id uuid not null references profiles(id),
  endpoint text not null,
  provider text not null,
  model text not null,
  tokens_in int not null,
  tokens_out int not null,
  cost_usd numeric(10,6) not null,
  cached bool not null default false,
  created_at timestamptz not null default now()
);
create index on ai_calls (user_id, created_at desc);

-- RAG knowledge base --------------------------------------------------
create table kb_chunks (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('datasheet','app_note','textbook','user_circuit_summary','curated')),
  source_id text not null,
  content text not null,
  embedding vector(1024),
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index kb_chunks_embedding_idx on kb_chunks using ivfflat (embedding vector_cosine_ops);
create index kb_chunks_meta_idx on kb_chunks using gin (metadata);

-- Cache for AI calls (deterministic by content hash) -----------------
create table ai_cache (
  cache_key text primary key,            -- sha256(model + prompt_template + inputs)
  response jsonb not null,
  hit_count int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

-- RLS -----------------------------------------------------------------
alter table profiles enable row level security;
alter table schematics enable row level security;
alter table favorites enable row level security;
alter table ai_calls enable row level security;
alter table karma_events enable row level security;

create policy "profiles read all"   on profiles   for select using (true);
create policy "profiles update own" on profiles   for update using (id = auth.uid());

create policy "schematic read"      on schematics for select using (
  visibility = 'public' or owner_id = auth.uid()
);
create policy "schematic write own" on schematics for all using (owner_id = auth.uid());

create policy "fav read own"        on favorites  for select using (user_id = auth.uid());
create policy "fav write own"       on favorites  for all using (user_id = auth.uid());

create policy "ai_calls read own"   on ai_calls   for select using (user_id = auth.uid());

create policy "karma read all"      on karma_events for select using (true);
```

**Note:** `components`, `kb_chunks`, `ai_cache`, `schematic_components` are admin/server-managed (writes go through edge functions / service role). RLS blocks direct write from clients.

---

## 6. KiCad → website pipeline

User uploads `.kicad_sch` → cheap, repeatable pipeline:

```
client (Next.js)
  │ multipart upload
  ▼
edge function: ingest-circuit
  ├─ validate file size, MIME
  ├─ parse with sexpr-plus → AST
  ├─ count components → reject if > 5 (V0 cap)
  ├─ extract symbols, designators, nets, values, MPN annotations
  ├─ normalise to canonical eencyc-schematic S-exp (subset of KiCad)
  ├─ render to SVG with hover hooks (data-net, data-designator)
  ├─ upload original + SVG to storage
  ├─ insert into schematics row (sexp, svg_url)
  └─ enqueue async: generate-summary (Inngest)
       │
       ▼
   generate-summary worker
     ├─ build prompt: "Given this normalised circuit S-exp, produce..."
     ├─ Claude Sonnet 4.6 → JSON {topology, rails, intent, key_components, design_notes, summary_text}
     ├─ embed summary_text via Voyage → vector(1024)
     ├─ update schematics: ai_summary, ai_summary_struct, summary_embedding
     └─ insert kb_chunks row (source_type='user_circuit_summary')
```

### Why summary-first RAG instead of raw S-exp

Per user requirement. Cost math:
- Raw S-exp for a 5-component circuit: ~600–1,500 tokens
- Compact AI summary: ~200–400 tokens
- Per chat turn we save ~1,000 tokens → ~$0.003/turn → **at 100k chat turns/month = $300/mo saved**

The summary is also more semantically dense for retrieval — embeddings work better on natural language than on terse S-exp.

### Canonical eencyc-schematic S-exp (subset)

```
(eencyc-schematic
  (version 1)
  (units mm)
  (component (designator "R1") (mpn "" "") (value "10k") (pos 50 50) (rot 0)
             (pin "1" (net "VIN")) (pin "2" (net "OUT")))
  (component (designator "C1") (mpn "" "") (value "100n") (pos 80 50) (rot 90)
             (pin "1" (net "OUT")) (pin "2" (net "GND")))
  (net "VIN") (net "OUT") (net "GND"))
```

Bidirectional: parsing KiCad → ours; export back to KiCad header + this body.

---

## 7. AI subsystem

### 7.1 System prompt — eencyclopedia AI persona

Lives in `lib/ai/system-prompts.ts`. Excerpt:

```
You are eencyclopedia, an AI assistant exclusively for electronics and
electrical engineering. You only answer questions about circuits, components,
signal processing, power, embedded systems, RF, analog, digital, and adjacent
topics. If asked anything outside this scope, decline and offer to reframe in
electronics terms or end the conversation.

Sources of truth, in priority order:
  1. Datasheets and manufacturer app notes (cited via tool retrieval)
  2. Established textbooks (Sedra/Smith, Horowitz/Hill, Razavi, etc.) provided
     in your retrieval context
  3. SPICE simulation results
  4. High-karma user circuit explanations
  5. Your training knowledge (always lower-confidence)

When sources conflict: prefer the datasheet for parametric claims; prefer the
textbook for principles; flag the conflict to the user.

Output format (always):
  - One-sentence direct answer
  - Math derivation in KaTeX (use $$...$$ blocks)
  - Intuition paragraph (skip if user.settings.explanation_mode == "math_only")
  - Datasheet/source citations as markdown footnotes
  - Caveats and assumptions

Refuse:
  - Any non-electronics topic
  - Requests to design weapons, bypass safety circuits, or violate regulations
  - Anything you cannot back with at least one cited source if asked

Tools available (use when relevant):
  - calc.ohm(V?, I?, R?)             returns missing variable
  - calc.divider(Vin, R1, R2)        returns Vout
  - calc.rc(R, C)                    returns τ
  - calc.opamp_gain(topology, Rf, Rin)
  - rag.search(query, k=5)            returns chunks from KB
  - parts.search(query)               returns components from catalogue
  - parts.get(mpn)                    returns full component params
  - schematic.get_summary(id)         returns ai_summary_struct
```

### 7.2 Routing (cost optimisation)

```
incoming user message + circuit_ctx
   │
   ▼
[Haiku 4.5 router] (~$0.0008/call)
   │
   classify:
     - trivial_calc      → pure JS function (no AI)
     - parts_lookup      → SQL + maybe Octopart/LCSC
     - schematic_explain → Sonnet 4.6 + summary_struct (NOT raw S-exp)
     - deep_analysis     → Sonnet 4.6 + RAG top-k=8
     - opus_required     → Opus 4.6 (only if user explicit /opus)
   │
   dispatch
```

User can override with `/sonnet`, `/opus`, `/haiku` prefix.

### 7.3 RAG hybrid retrieval

```ts
// lib/ai/rag.ts
async function retrieve(query: string, ctx: { schematicId?: string }) {
  const queryEmb = await voyage.embed(query);
  const [bm25, vector] = await Promise.all([
    sql`select id, content, ts_rank(...) from kb_chunks where ... limit 20`,
    sql`select id, content, embedding <=> ${queryEmb} from kb_chunks order by embedding <=> ${queryEmb} limit 20`,
  ]);
  return reciprocalRankFusion(bm25, vector).slice(0, 8);
}
```

If `schematicId` present, **prepend** that schematic's `ai_summary_struct` to the prompt before RAG chunks. Always.

### 7.4 Eval harness

`evals/v0_baseline.jsonl`: 50 hand-written EE questions with ideal answers. Run nightly via GitHub Actions. Compare:
- vanilla Claude (no system prompt, no RAG)
- eencyclopedia Claude (full stack)
- score: BLEU + LLM-judge with rubric

Goal: eencyclopedia ≥ 30% better on factual recall, source citation, and user-rated helpfulness.

---

## 8. Calculator endpoints (V0 must-ship)

`/api/calc` — pure JS, no AI cost.

```ts
// lib/calc/index.ts — actual implementations
export const calc = {
  ohm: ({ V, I, R }) => /* solve for missing */,
  voltageDivider: ({ Vin, R1, R2 }) => Vin * R2 / (R1 + R2),
  currentDivider: ({ Itotal, R1, R2 }) => Itotal * R2 / (R1 + R2),
  rcTau: ({ R, C }) => R * C,
  rlTau: ({ R, L }) => L / R,
  ledResistor: ({ Vsupply, Vf, If }) => (Vsupply - Vf) / If,
  opampGain: { inverting: (Rf, Rin) => -Rf/Rin,
               nonInverting: (Rf, Rin) => 1 + Rf/Rin },
  reactance: { Xc: (f, C) => 1/(2*Math.PI*f*C),
               Xl: (f, L) => 2*Math.PI*f*L },
  resonance: ({ L, C }) => 1 / (2*Math.PI*Math.sqrt(L*C)),
  cutoffFreq: ({ R, C }) => 1 / (2*Math.PI*R*C),
};
```

Available both as REST (`POST /api/calc/{op}`) and as Claude tools.

---

## 9. SVG hover UX

When a circuit is rendered, every wire and component is a hit target.

```html
<g data-designator="R1" class="component">...</g>
<polyline data-net="VOUT" class="net" .../>
```

Hover behavior:
- Tooltip shows: name (e.g. "Net VOUT"), last known SPICE values if any (V, I), or "no sim data — click to ask AI."
- Click → opens chat sidebar pre-filled with: "Explain net VOUT in this circuit" or "What value should R1 be for [user's goal]?"
- Right-click → context menu: ["Explain", "Suggest change", "Show datasheet (if component)"].

V0: tooltip + click-to-chat. V1: live SPICE values on hover.

---

## 10. Cost model recalculated (no vision)

Pricing taken at: Claude Sonnet 4.6 `$3/M in, $15/M out`, Haiku 4.5 `$0.80/M in, $4/M out`, Voyage embeddings `$0.18/M tokens` (verify on deploy).

### Per-operation costs

| Operation | Model | Tok in | Tok out | $ |
|---|---|---:|---:|---:|
| Router (Haiku) | Haiku 4.5 | 500 | 100 | $0.0008 |
| Trivial calc | none (JS) | 0 | 0 | $0 |
| Schematic explain (summary-RAG, no raw S-exp) | Sonnet 4.6 | 4,000 | 1,500 | $0.034 |
| Deep analysis (RAG top-8) | Sonnet 4.6 | 6,000 | 2,000 | $0.048 |
| Circuit summary (one-time on upload) | Sonnet 4.6 | 3,500 | 1,000 | $0.026 |
| Datasheet parse (one-time per MPN) | Sonnet 4.6 | 25,000 | 3,500 | $0.128 |
| Embedding (per chunk) | Voyage-3 | ~300 | — | $0.00005 |

### Per-user monthly cost (no vision)

| Profile | ops/mo | mix | $/mo |
|---|---:|---|---:|
| Casual | 10 | 50% trivial, 50% chat | **$0.18** |
| Regular | 60 | 30% trivial, 70% chat | **$1.51** |
| Power | 300 | 10% trivial, 90% chat | **$9.74** |
| Abuser | 2,000 | all chat | **$72** |

### Tier pricing (locked, V1)

| Tier | $/mo | Cap | Features |
|---|---:|---:|---|
| Free | 0 | 10 ops/mo | public-only circuits, 1 private slot, async AI |
| Pro | 12 | 100 ops/mo | private circuits, instant AI, API read |
| Pro+ | 29 | 400 ops/mo | + API write + Opus access + priority queue |
| Overage | — | $0.15/op | hard-cap available in account settings |

### Margin at 1,000 paid users (mix: 70% Pro, 25% Pro+, 5% overage)

| Line | $ |
|---|---:|
| Revenue | 700·12 + 250·29 + 50·59 = **$18,600** |
| AI cost (avg 70% of cap consumed) | 700·$1.05 + 250·$6.81 + 50·$20 = **~$3,440** |
| Infra (Vercel + Supabase) | ~$300 |
| **Net margin** | **~$14,860 (~80%)** |

Margin improved from v0.1 because no vision pipeline.

---

## 11. Bootstrap budget recalculated

| Months | Item | $ |
|---|---|---:|
| 1 | Vercel Pro | 20 |
| 1 | Supabase Pro | 25 |
| 1 | Domain (eencyclopedia.com or similar) | ~12/yr |
| 1 | Anthropic API credit | 100 |
| 1 | Voyage / OpenAI embedding credit | 30 |
| 1 | Misc (Stripe, monitoring) | 25 |
| **Per-month run rate (early)** | | **~$200** |
| 6 mo bootstrap | | **$1,200** |
| Buffer (marketing, overage, surprises) | | $1,800 |
| **Total recommended bootstrap** | | **$3,000** |

Down from $5k in v0.1 because of dropped scope. Confirm when you have the number.

---

## 12. Distributors & parts pipeline

| Distributor | Integration | Notes |
|---|---|---|
| **LCSC** | scrape gateway via [easyeda-api](https://github.com/) compatible service or [LCSC's catalog endpoints](https://www.lcsc.com/) | **No official public API.** EasyEDA exposes LCSC catalog — best legal path is via your own EasyEDA account or asking LCSC for partnership. |
| **Mouser** | [official API](https://www.mouser.com/api-hub/) | Free key, rate-limited |
| **Digi-Key** | [Product Information V4 API](https://developer.digikey.com/products/product-information-v4) | OAuth, free key |
| **Octopart** | [API v4](https://octopart.com/api/v4/reference) | Paid past free tier; aggregator |
| **JLCPCB** parts | scrape JSON from `https://jlcpcb.com/parts/...` | Same legal caveat as LCSC |

Strategy: build a `lib/distributors/{lcsc,mouser,digikey,octopart}.ts` adapter pattern. Cache prices for 24h. Compare across sources, surface cheapest + in-stock + LCSC-favored (for JLCPCB users).

`[FILL]` Email LCSC / EasyEDA for partnership / API permission. Until then, scrape-with-rate-limit and cache aggressively. Document this in TOS.

---

## 13. Seed content & "improving over time"

### What you provide

- Curated textbook PDFs (you confirmed licensed)
- Curated app notes (TI, Analog Devices, ST, Microchip — most are freely redistributable, check each)
- 20–50 example KiCad circuits authored by you for V0 launch

### What we do with them

```
PDF / .kicad_sch
   │
   ▼
ingest worker (Inngest)
   ├─ parse (unstructured.io for PDF, sexpr-plus for kicad_sch)
   ├─ chunk (300 tok / 50 overlap for text)
   ├─ embed (Voyage-3)
   ├─ insert kb_chunks rows with source metadata
   └─ build summary (for schematics)
```

### Improvement loop

1. **Day 1 retrieval pool:** your seed corpus.
2. **Every public circuit upload:** adds a new `kb_chunks` row (the AI summary). RAG gets denser.
3. **Every datasheet ingested for a referenced MPN:** added once, indexed forever.
4. **User feedback (👍/👎 on AI answers):** stored. Not used in V0. Becomes training data for V2 fine-tune.
5. **Top-karma comments:** flagged for inclusion in retrieval pool with author attribution.

### What we honestly tell users

> "eencyclopedia AI does not retrain on your data. It searches a curated and growing knowledge base — datasheets, textbooks, and public circuits — and uses Claude to reason from them. The encyclopedia improves as the knowledge base grows, not as the model changes."

---

## 14. Security (V0)

- RLS on every table (default-deny). Service role only used in edge functions.
- Stripe webhook signature verification.
- LLM prompt-injection mitigation: sanitise user-provided text in prompts; never include raw user content in tool-decision JSON; structured output schemas enforced.
- File upload: size cap (5 MB), MIME check, ClamAV scan via Supabase storage trigger (if available — else defer to V1).
- No `eval` of AI output, ever.
- Rate-limit `/api/chat` at edge (Upstash Ratelimit, free tier). Free tier: 10/min. Pro: 60/min.
- Secrets only in Vercel env / Supabase env. Never committed.
- 2FA enforced for admin email.
- CSP headers via `next.config.js`.
- HTTPS-only, HSTS preloaded.
- Audit log: every admin write, every billing event.

---

## 15. Legal (minimal, not blocking V0 closed beta)

You said apply standard clauses. I'll draft based on Termly templates:

- ToS: includes IP grant for public circuits (CC-BY-4.0 default), no warranty, AI output disclaimers, takedown process.
- Privacy: GDPR-aligned (deletion endpoint, data export, cookie consent banner only when EU traffic detected).
- AI disclosure: every AI-generated response footer: "Generated by AI. Verify before using in production."
- Datasheet disclaimer: "Datasheet excerpts shown under fair-use indexing; click through for full document."

`[FILL]` We'll use plain Termly templates for V0 closed beta. Get a real lawyer review before public launch / paid tiers.

---

## 16. 7-day sprint plan

Realistic for one solo dev with AI assistance, ~10 hours/day. Brutal cuts everywhere.

### Day 1 — Foundation
- [ ] Repo init, `.gitignore`, license (MIT for code, CC-BY for docs)
- [ ] Next.js 14 scaffold, TypeScript strict, ESLint, Prettier
- [ ] Supabase project created, env wired
- [ ] Vercel deploy connected
- [ ] Domain pointed (eencyclopedia.com or fallback)
- [ ] Migration `0001_init.sql` applied

### Day 2 — Auth + Profile
- [ ] Supabase Auth (email + Google OAuth)
- [ ] `/onboarding` route: pick username, accept ToS
- [ ] `/profile/[username]` view
- [ ] RLS policies tested with two test accounts

### Day 3 — Schematic upload + render
- [ ] `lib/kicad/parser.ts` — KiCad S-exp → AST
- [ ] `lib/kicad/normalise.ts` — KiCad AST → eencyc canonical
- [ ] `lib/kicad/render.ts` — AST → SVG with hover hooks
- [ ] `/upload` route + edge function
- [ ] `/circuit/[id]` view with rendered SVG + S-exp viewer
- [ ] 5-component cap enforced

### Day 4 — AI chat (V0 core)
- [ ] Anthropic + Voyage clients in `lib/ai/`
- [ ] `lib/ai/system-prompts.ts` — eencyclopedia persona (final v0)
- [ ] `lib/ai/router.ts` — Haiku-first router with tool definitions
- [ ] `lib/ai/rag.ts` — hybrid retrieval (FTS + vector RRF)
- [ ] `/api/chat` SSE streaming endpoint
- [ ] `/chat` UI (sidebar style, can be invoked from `/circuit/[id]`)
- [ ] Per-circuit summary worker (sync for V0, queue in V1)
- [ ] `ai_calls` metering on every call

### Day 5 — Calculators + favorites
- [ ] `lib/calc/index.ts` (all functions in §8)
- [ ] `/api/calc/[op]` REST
- [ ] `/calc` UI page
- [ ] Calculators registered as Claude tools
- [ ] `/favorites` UI (add/remove components)
- [ ] Hover-to-chat on SVG (click opens chat with prefilled prompt)

### Day 6 — Library + seed content
- [ ] `/library` listing (Postgres FTS search)
- [ ] Ingest 20–30 of your seed circuits via admin upload UI
- [ ] Ingest 1–2 textbook PDFs into kb_chunks
- [ ] Seed components catalogue with ~50 common parts (R, C, common opamps, LDOs)
- [ ] Karma stub
- [ ] Bug bash

### Day 7 — Polish + closed beta
- [ ] Landing page (one screen, copy explains "what is eencyclopedia")
- [ ] Email invite flow (Supabase magic links)
- [ ] PostHog product analytics
- [ ] Sentry errors
- [ ] 20–50 invited users (`[FILL]` who?)
- [ ] Soft launch announcement

### Cuts (do NOT do in 7 days)
- Forum/posts/comments (V1)
- Stripe / billing (V1)
- ngspice WASM live sim (V1)
- API endpoints (V1)
- Distributor pricing (V1)
- Datasheet parse worker (V1)
- Mobile responsive polish (V1)

---

## 17. Risk register (updated)

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | 7-day deadline impossible at full scope | High | Critical | Brutal V0 cuts (above); accept "closed beta," not "public launch" |
| R2 | KiCad parser handles unexpected files badly | High | Med | Whitelist parser, refuse unknown elements, surface error to user |
| R3 | AI cost runaway from a single user | Med | High | Hard caps per user per day; alert at $10/day for any user |
| R4 | RAG returns irrelevant chunks → bad answers | Med | High | Eval harness from day 1; tune k, RRF weights, chunk size |
| R5 | LCSC integration blocked legally | Med | Med | Email partnership immediately; have Mouser/Digi-Key as fallback |
| R6 | Solo burnout | High | Critical | Stop-day rule: 1 day/week off; sleep > code |
| R7 | Empty seed corpus → bad RAG → bad first impression | Med | High | You commit to 20+ curated circuits + 2 textbooks BEFORE day 7 |
| R8 | "Fine-tuned Claude" expectation gap | Med | Med | Honest in-app copy: "Powered by Claude with eencyclopedia knowledge base" |

---

## 18. Open fields (still need your input — not blocking)

- [ ] Domain name confirmed (`eencyclopedia.com` available?)
- [ ] Closed-beta invitee list
- [ ] Bootstrap budget confirmed (~$3k OK?)
- [ ] Hours/day available for 7-day sprint
- [ ] Specific seed circuits you'll provide (count + topics)
- [ ] Specific textbooks you'll provide (titles + license)
- [ ] Stripe vs Lemon Squeezy final call (Lemon Squeezy = merchant of record, simpler tax for solo)
- [ ] Embedding provider final: Voyage vs OpenAI
- [ ] LCSC partnership outreach owner — you?
- [ ] Email provider for transactional (Resend / Postmark / SES?)

---

## 19. References

- Next.js 14 — https://nextjs.org/docs
- Supabase — https://supabase.com/docs
- pgvector — https://github.com/pgvector/pgvector
- KiCad S-exp — https://dev-docs.kicad.org/en/file-formats/sexpr-schematic/
- Anthropic API — https://docs.claude.com/en/api/overview
- Anthropic on Bedrock fine-tuning Haiku — https://aws.amazon.com/bedrock/claude/
- Voyage AI — https://docs.voyageai.com/
- Stripe Tax — https://docs.stripe.com/tax
- ngspice — https://ngspice.sourceforge.io/docs.html
- eecircuit (ngspice-wasm) — https://github.com/danchitnis/eecircuit
- Inngest — https://www.inngest.com/docs
- PostHog — https://posthog.com/docs
- Sentry — https://docs.sentry.io
- Langfuse — https://langfuse.com/docs
- Mouser API — https://www.mouser.com/api-hub/
- Digi-Key V4 API — https://developer.digikey.com/products/product-information-v4
- Octopart API v4 — https://octopart.com/api/v4/reference
- Termly (legal templates) — https://termly.io/

---

## 20. How AI agents should consume this file

1. §1 hard truths are non-negotiable.
2. §5 schema is canonical. DB changes → migration file in `supabase/migrations/`.
3. §6.3 S-exp shape is canonical for in-DB storage.
4. §7.2 router rules are mandatory: route through Haiku first, deterministic-first, cache aggressively.
5. §16 is the day-by-day plan. Don't add features outside the day's checklist.
6. Before adding a dependency, score it (P/A/D/S) and document.
7. Every AI call MUST write to `ai_calls`.
8. Every public-facing AI response MUST display the disclosure footer.
9. When uncertain, write `<<ASSUMPTION: ...>>` inline; don't silently choose.

*End v0.2. Update in place; bump version in header.*
