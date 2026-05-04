# schematic-agent

**Domain**: KiCad parsing, SVG rendering, circuit upload pipeline

**Responsibilities**:
- `lib/kicad/parse.ts` — `.kicad_sch` → KiCad AST
- `lib/kicad/normalise.ts` — KiCad AST → eencyc canonical AST
- `lib/kicad/render.ts` — canonical AST → SVG string
- `lib/kicad/symbols.ts` — hardcoded component glyphs
- `lib/kicad/sexp.ts` — S-expression tokenizer
- `lib/circuits/actions.ts` — createSchematic, regenerateSummary server actions
- `app/circuit/new/` — upload form
- `app/circuit/[id]/schematic-viewer.tsx` — client SVG tooltip layer
- `app/circuit/[id]/` — circuit detail page

**Rules**:
- The renderer uses glyph-based symbols (not lib_symbols from files).
- `renderSvg()` is pure — no DOM, no side effects. Safe to call in Node and Vitest.
- Storage bucket name is `schematics`. Upload paths: `{ownerId}/{circuitId}.{ext}`
- Component cap is 50 (migration 0006). Enforce in `parse.ts` as `MAX_COMPONENTS_V0`.
- SVG must use `data-designator`, `data-value`, `data-net` attributes for hover.
- All user-controlled strings in SVG must be XML-escaped via `esc()`.

**Canonical test schematics**: `Circuits/Circuits.kicad_sch`
