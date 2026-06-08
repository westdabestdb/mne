# Mnemia — Core Product Migration Plan

Porting the core product from the old repo (`../mnemia`, mature, 15 migrations, 4 apps + 2 packages) onto this clean rewrite-base (`mne`). This is a **port onto a new baseline, not a copy** — `mne`'s migrations were re-authored deliberately (vector deferred, `ba_`-prefixed auth, domain `users` distinct from `ba_user`), so the 15 source migrations collapse into a fresh sequence starting at `0004`.

The product is still **Mnemia** — `mne` is only the repo directory. Keep `@mnemia/*` package names, the `MNEMIA_` env prefix, `mnem_live_*` key prefix, and `~/.mnemia/config.json`. That keeps the port mechanical instead of a rename.

---

## 1. What already exists in `mne` (do NOT re-migrate)

| Layer | Present | Source equivalent (skip) |
|-------|---------|--------------------------|
| Migrations | `0001_init` (orgs/users/memberships/projects), `0002_betterauth` (ba_user/session/account/verification), `0003_waitlist` | mnemia `0001` tenancy subset + `0011_betterauth` |
| Auth | better-auth 1.6.13, email+password, `authPool`, `ba_` model prefixes, `nextCookies` | hand-rolled web auth (already replaced) |
| Web | landing, `/login`, `/signup`, waitlist, design system (Tailwind v4 `@theme`, OKLch dark-only) | marketing pages |
| Core | `db.ts` (`getPool`/`closePool`/`withTx`), barrel `index.ts` | `core/db.ts` (extend, don't replace) |
| Runner | `scripts/migrate.mjs` (raw `.sql`, `_migrations` table, txn-wrapped) | — |

**Stack constraints every ported file must match:** raw `pg` (no Drizzle/Kysely), ESM/NodeNext strict TS, Neon-capable (`DATABASE_URL`), Next 15 / React 19, Tailwind v4 (no config file), Node ≥20, pnpm+turbo.

---

## 2. Adaptation rules (the deltas that touch the whole port)

These are the systematic changes applied while copying source files over. Decide once, apply everywhere.

1. **Migration renumber → `0004+`.** Re-author, don't renumber blindly. Resolve overlaps with `mne` 0001/0002. `vector` extension is enabled by the first memory migration (0001 only did `pgcrypto`).
2. **better-auth is already present.** Skip mnemia `0011/0012/0013` table *creation* where it duplicates `ba_*`; reuse `mne`'s `ba_user`. Keep the **domain `users` ↔ `ba_user` bridge** (`provisioning.ts:ensureAccount`, email-keyed, idempotent).
3. **RLS deferred (matches how mnemia actually ran).** mnemia engines ran as the RLS-bypassing superuser with an app-level scope gate; `mnemia_app` role + policies were defense-in-depth (Phase 8, never the live path). On Neon, custom roles + `SET ROLE` may be constrained. **Port the app-level tenancy guards (`tenancy.ts`) first; make RLS the last, optional migration.** Don't block the core on it.
4. **Keep `MNEMIA_` env + `~/.mnemia` + `mnem_live_*`.** Only `MNEMIA_API_URL` default changes (new origin). No mass rename.
5. **API plane keeps its own identity.** `mnem_live_*` keys + scrypt `password_hash` on `users` are the *machine* plane, independent of better-auth (the *human* plane). Don't merge them — add `users.password_hash` in the api-auth migration.
6. **Embeddings stay local MiniLM 384-dim** (`@xenova/transformers`, `MNEMIA_EMBED_DIM=384`). This is the portability bet and a moat (see §5) — keep `vector(384)` HNSW + FTS GIN. Pluggable OpenAI/Null embedders port as-is.
7. **`plans` table must be seeded** (`free`/`pro`/`team` with `max_projects`, `seats`, `entries_month`, `queries_month`) — `createProject` and `seats.ts` read it. Seed in the api-auth migration even before billing lands.
8. **`mne` web design system is the target look** — port dashboard *logic*, re-skin to the OKLch/Tailwind-v4 system already in `globals.css`. Don't bring old web CSS.

---

## 3. Phased migration

Ordered by **value delivered**, not by copying everything at once. Each phase is independently shippable. Migration numbers are a concrete proposal (splits are flexible).

### Phase 1 — Memory core (the wedge: capture → recall → resume)
*The demoable product. Everything below layers onto this.*

- **Migrations:**
  - `0004_scopes.sql` — `scopes` (personal→project→team→org, parent cycle guard), `scope_grants`, `provider_settings`
  - `0005_memory.sql` — `CREATE EXTENSION vector`; `memories` (type · status · classification · trust_state · confidence/importance · `embedding vector(384)` HNSW · `tsv` GIN · valid/txn time · ttl), `memory_versions`, `entities`, `edges`
  - `0006_sessions.sql` — `sessions`, `checkpoints` (JSONB inline, `blob_ref` reserved), `corroborations`, `memory_proposals`
- **`packages/core`:** `types.ts`, `db.ts` (extend with `pgvector` wiring + `withRls` stub), `embedder.ts`, `recall.ts` (5-signal explainable scoring), `memory.ts` (`MemoryEngine`: add/dedup/contradiction/search), `capture.ts` (`CaptureEngine`: session/checkpoint/resume + `synthesizeBrief`), `contradiction.ts`, `distiller-factory.ts` + `llm-distiller.ts` + `distiller-settings.ts`, `checkpoint-store.ts` (+factory), `projects.ts`, `provisioning.ts`, `tenancy.ts`, `crypto.ts`, `pii.ts`
- **`packages/sdk`:** `client.ts` + `distiller.ts` (`HeuristicDistiller`) — ports clean, zero infra coupling.
- **Adaptations:** enable `vector`; `withRls` becomes a no-op wrapper (app-level guard); seed nothing yet (no plans dependency until createProject ceiling — gate that softly).

### Phase 2 — REST API (`apps/api`, Hono) — the data plane
- **Migration:** `0007_api_auth.sql` — `api_keys`, `users.password_hash`, `plans` (+seed free/pro/team), `usage_counters`, `usage_events`, `audit_log`
- **Files:** `index.ts` (routes + `effectiveCtx` precedence: body `projectId` → repo → key-bound), `auth.ts` (Bearer → ctx, never body-derived org/user), `quota.ts` (atomic meter, `FOR UPDATE`), `ratelimit.ts`, `provision.ts` (scrypt signup → `ensureAccount`), `engines.ts`, `http.ts`
- **Delivers:** `/v1/{signup,me,keys,recall,remember,capture,checkpoint,resume,distill,forget,projects}`
- **Adaptations:** drop `billing.ts` for now (Phase 7). In-memory rate limiter is single-instance — fine until multi-instance (then Redis).

### Phase 3 — MCP + CLI — the distribution (frictionless install)
*This is where we out-execute the competitor (6 agents vs their 2).*

- **Migration:** `0008_cli_oauth.sql` — `cli_pairings` (+transient `token`), `oauth_pickups`; `pairing.ts` + `oauth-pickup.ts` into core
- **`apps/mcp`:** `server.ts` (mne_* tools, Zod), `backend.ts` (ProxyBackend → mne API), `local-backend.ts` (embeds core, dev), `pin.ts` (session pin), `config.ts`, `browser.ts`. Default `MNEMIA_API_URL` → new origin.
- **`apps/cli`:** `index.ts`/`cli.ts`, `connect.ts` (pairing + OAuth), `agents.ts` (Claude Code · Cursor · Windsurf · Codex · VS Code · Gemini), `api.ts`, `commands.ts` (slash shims), `hooks.ts` (SessionStart/Stop), `mcp.ts`, `writers.ts` (json-mcpServers · json-servers · toml-codex), `config.ts`
- **Delivers:** one-line install, auto-capture hooks, `/mne-*` slash commands, per-repo project resolution.
- **Adaptations:** API endpoints (`/v1/oauth/start|pickup`, `/v1/cli/pair/start|poll`) must exist in API — add to Phase 2 if pulling Phase 3 forward.

> **End of Phase 3 = the core product is live and installable.** Phases 4–9 are correctness, governance, monetization, and dashboard depth.

### Phase 4 — Raw transcripts + hybrid recall 🚧 (in-flight in source)
- **Migration:** `0009_raw_transcripts.sql` — `raw_transcripts`, `transcript_chunks` (vector(384) HNSW)
- **Core:** `transcripts.ts` (`archiveTranscript`/`getTranscript`/`searchTranscriptChunks`, `flattenForEmbedding` for Claude Code JSONL)
- **Tools/API:** `mne_archive_session`/`get_transcript`/`re_distill`; `/v1/{archive,transcript,re_distill}`; hybrid `mne_recall` (curated memories + raw spans, raw down-weighted)

### Phase 5 — Correctness & hygiene jobs
- **Migration:** `0010_project_health.sql` — `project_health`
- **Core:** `jobs.ts` (`runDecay`, `runConsolidation`, `reverificationQueue`, `runHygiene`)
- **Wiring:** scheduled runner (cron/worker). This is the **"stays correct" pillar** — decay, semantic consolidation, re-verification.

### Phase 6 — Sharing & governance
- **Migrations:** `0011_sharing.sql` (`memory_proposals.source_memory`, promotion grants), `0012_session_share.sql` (`session_shares`, NOT RLS-scoped, secret-gated)
- **Core:** `scopes.ts` (grant/readable/canWrite/canReview), `proposals.ts` (propose/review/corroborate/trust-promote), `sharing.ts` (scope promotion), `session-share.ts` (one-secret cross-person links)
- **Tools:** `mne_{share,fetch,unshare,propose,promote,corroborate}`. Web: `/proposals`, `/shares`.

### Phase 7 — Monetization & enterprise (opt-in, free-fallback)
- **Migrations:** `0013_stripe.sql`, `0014_sso.sql`, `0015_oidc.sql`
- **Core/API:** `seats.ts`, `sso.ts`, `billing.ts`, Stripe webhook (`handleStripeWebhook`, idempotent), OIDC consent flow
- **Web:** `/billing`, `/sso`, `/oauth/consent`. All inert without `STRIPE_SECRET_KEY` / `MNEMIA_OAUTH_PROVIDER`.

### Phase 8 — Encryption + RLS hardening
- **Migrations:** `0016_encryption.sql` (`content_cipher`, plaintext→`[encrypted]` placeholder), `0017_rls.sql` (`mnemia_app` role + policies + `mnemia.user_id` GUC) — **test on Neon first; keep app-level gate as the fallback path**
- **Core:** `encryption.ts` (envelope, per-org DEK under `MNEMIA_MASTER_KEK`), `gdpr.ts` (export/erasure). Needs a KMS/KEK source decision.

### Phase 9 — Web dashboard depth
- Port: `/dashboard`, `/memories` (+`/[id]`), `/sessions` (+`/[id]`), `/graph` (Cortex), `/proposals`, `/shares`, `/settings`. Re-skin to the existing `mne` design system.
- **Borrow from continuum here** (see §5): per-project **"Ask the brain" chat**, **CMD+K quick capture**, **timeline view**, **momentum/health rings**.

---

## 4. Recommended first cut

**Ship Phases 1 → 2 → 3 as the MVP** (memory core + API + install). That is the whole "capture a session, recall it ranked in a fresh session" loop, installable into 6 agents — a complete, demoable product. Pull the `/v1/oauth` + `/v1/cli/pair` endpoints into Phase 2 so Phase 3 has its backend.

Then **Phase 4 (raw transcripts/hybrid recall)** and **Phase 5 (hygiene)** — these are the "correct & lossless" differentiators. Defer 6–9 until the wedge is proven. Sharing/billing/SSO/encryption are enterprise surface, not wedge.

---

## 5. Competitive lens — vs `continuum` (sudomichael/continuum, AGPL-3)

Continuum is the closest competitor: a memory layer for coding agents. Architecturally it's the **opposite bet** — a single Next.js app + Prisma + Clerk + Go CLI, with a *synthesis-first* model.

**How continuum works:** session transcript → cheap-tier LLM summarize → fan out to `Update`/`Decision` rows → smart-tier synthesize a per-project **"Brain"** (6 string fields: currentFocus, currentState, whatChangedRecently, currentDirection, architectureSnapshot, openThreads), shown on a dashboard. 6 MCP tools (HTTP proxy). Two agents (Claude Code + Codex).

**Our moat — keep all of it (continuum has none):**
- **Typed memory** (decision/convention/fact/gotcha/reference/open_thread) vs their free-text `Update.body`.
- **Explainable vector+FTS recall** (5-signal score, `__why`/`__components`) vs their recency-concat (no embeddings, no semantic query — "what did we decide about auth in July?" is unanswerable for them).
- **Correctness pillar:** contradiction detection, trust/corroboration, decay, consolidation, versioning, propose-then-review. Continuum is append-log + full recompute — no conflict handling, no trust, no history.
- **Sharing & governance:** cross-scope promotion + cross-person one-secret links + audit. Continuum: `WorkspaceMember.role` is a reserved stub; all members see everything.
- **Portability:** server-side embeddings, agent-neutral; 6 agents installed. They do 2.

**Borrow from continuum (cheap wins, mostly web/UX):**
1. **Persistent per-project "Brain" view** — we already have `synthesizeBrief` + `resume`; surface it as a standing dashboard doc, not just a resume payload.
2. **"Ask the brain" per-project chat** grounded in memories — strong demo, low lift on top of recall.
3. **CMD+K quick capture** in web (AI-classified) — nice manual on-ramp alongside hooks.
4. **Provider flexibility:** add **Ollama / OpenRouter / custom OpenAI-compatible** to `distiller-factory` + `provider-settings` (today: Anthropic/OpenAI). Big self-host win, ~small change.
5. **Observational, non-prescriptive voice** in distiller/synthesis prompts ("describe what IS, not what to do") — a deliberate, well-liked choice; cheap to adopt.
6. **Timeline view + momentum/health rings** — dashboard polish.
7. **Self-host story up front** (Docker one-liner) — continuum leads with it; we have the pieces (`local` MCP mode, docker-compose).

**Positioning note:** continuum targets a sharp ICP — *a founder juggling multiple projects*, "30-second rehydrate." Our story is broader (team shared brain + correctness). For launch, **keep the wedge narrow** — solo-dev continuity (Phases 1–3), then expand to team/governance. Don't lead with the enterprise surface.

---

## 6. Open decisions

- **RLS on Neon:** confirm `mnemia_app` role + `SET ROLE` works on Neon serverless; if not, app-level gate is the permanent path (acceptable — it's how mnemia ran). → blocks Phase 8 only.
- **API identity vs better-auth:** keep scrypt `password_hash` for the machine/API plane (recommended — independent), or route API signup through better-auth too?
- **KEK source for at-rest encryption:** env `MNEMIA_MASTER_KEK` vs a KMS (AWS KMS / Vault). → blocks Phase 8 only.
- **Checkpoint/transcript storage:** JSONB inline (default) is fine for MVP; decide S3/R2 offload threshold before large transcripts land.
- **MVP scope confirmation:** is this migration pass the full port, or just Phases 1–3 (recommended)?
