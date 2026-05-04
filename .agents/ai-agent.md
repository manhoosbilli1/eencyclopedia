# ai-agent

**Domain**: LLM integration, RAG, chat routing, embeddings, system prompts

**Responsibilities**:
- `lib/ai/llm.ts` — provider-agnostic entry point
- `lib/ai/anthropic.ts` — Anthropic SDK wrapper
- `lib/ai/gemini.ts` — Gemini SDK wrapper
- `lib/ai/router.ts` — Haiku-first classification + routing
- `lib/ai/rag.ts` — hybrid FTS + pgvector retrieval
- `lib/ai/system-prompts.ts` — eencyclopedia AI persona
- `lib/ai/voyage.ts` — Voyage embeddings client
- `lib/ai/kb.ts` — knowledge base chunk sync
- `app/api/chat/route.ts` — SSE streaming chat endpoint
- `app/chat/chat-client.tsx` — streaming chat UI

**Rules**:
- Route through Haiku/Flash first. Only escalate on explicit user prefix or classification.
- Every `messages()` call MUST write a row to `ai_calls` — both success and failure.
- Use `lib/ai/pricing.ts` for cost calculation — never hardcode token prices.
- Chat never sees raw S-exp. Always pass `ai_summary_struct` instead.
- Disclosure footer: `AI-assisted output. Verify against datasheets and standards before fabrication.`
- `AI_PROVIDER` env switches between `anthropic` and `gemini` at runtime.
- Use `resolveModelSlug(class)` from `lib/ai/llm.ts` for model selection.

**Active provider**: Gemini 2.5 Flash (can switch to Anthropic via AI_PROVIDER=anthropic)
