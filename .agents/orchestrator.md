# orchestrator

**Role**: Coordinates the other agents. Read this first when planning multi-agent work.

## Agent roster

| Agent | File | Domain |
|---|---|---|
| schematic-agent | `.agents/schematic-agent.md` | KiCad parse/render/upload |
| ai-agent | `.agents/ai-agent.md` | LLM, RAG, chat |
| backend-agent | `.agents/backend-agent.md` | Supabase, API, migrations |
| frontend-agent | `.agents/frontend-agent.md` | UI, pages, Tailwind |

## How to run agents in Claude Code

Use the Agent tool with `subagent_type: "general-purpose"` for most tasks.
For exploration, use `subagent_type: "Explore"`.

Example dispatch:
```
Agent({
  description: "Fix SVG renderer glyph alignment",
  subagent_type: "general-purpose",
  prompt: "You are the schematic-agent for eencyclopedia at /mnt/c/.../eencyclopedia. Read .agents/schematic-agent.md for your domain. Fix: [specific issue]. Files to check: lib/kicad/render.ts, lib/kicad/symbols.ts."
})
```

## Current sprint focus (as of 2026-05-03)

**Priority 1 (circuit upload + SVG render)**:
- Upload pipeline: form → `createSchematic` → parse → SVG → Storage → AI summary
- SVG renderer quality: glyph alignment, wire routing, label placement
- `schematic-viewer.tsx` hover/click UX

**Priority 2 (auth + profile)**:
- Magic-link login flow end-to-end
- Onboarding username picker
- Header with user menu

**Priority 3 (AI chat)**:
- Chat SSE streaming
- RAG retrieval
- Calculator tools

## Parallel work rules

1. Agents can work in parallel as long as they touch different files.
2. Schematic-agent and ai-agent can run simultaneously (different file domains).
3. Backend-agent and frontend-agent can run simultaneously.
4. Don't let two agents modify the same file at the same time.
5. After each agent finishes, verify the changes before running the next wave.

## Environment

- Dev server: `pnpm dev` → http://localhost:3000
- Test: `pnpm test` (Vitest)
- TypeScript: `pnpm typecheck`
- DB: Supabase project `dgsvkgspvaxghjppsncn` (eu-west-2)
