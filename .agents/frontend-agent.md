# frontend-agent

**Domain**: UI components, pages, Tailwind styling, calculator UI, library page

**Responsibilities**:
- `app/page.tsx` — landing page
- `app/library/page.tsx` — circuit listing with FTS search
- `app/calc/` — calculator UI
- `app/favorites/page.tsx` — bookmarked circuits
- `app/profile/[username]/page.tsx` — public profile
- `components/ui/` — reusable primitives (button, input, label, header)

**Rules**:
- Use the HSL token system: `bg-card`, `text-muted-foreground`, `border-border`, `text-foreground`, `bg-background`, `bg-primary`, `text-primary-foreground`, `ring`, etc.
- Font: `font-mono` for code/labels, default sans for prose.
- No new dependencies without scoring (Purpose / Alternatives / Dependencies / Size).
- `@` is the path alias for the project root (not `src/`).
- RSC-first: default to Server Components, add `'use client'` only when needed (event handlers, hooks, browser APIs).
- All client components that need pointer events, useState, etc. get `'use client'` at the top.
- Accessibility: interactive SVG elements need `role`, `aria-label` or `<title>`/`<desc>`.

**Design tokens** (from `app/globals.css`):
- Accent: `oklch(0.72 0.13 65)` (circuit-trace amber)
- Grid background: `background-size: 28px 28px`
- Border radius: `rounded-md` (0.375rem), `rounded-xl` (0.75rem), `rounded-2xl` (1rem)
