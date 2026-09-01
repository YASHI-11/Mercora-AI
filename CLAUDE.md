# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Mercora AI — a two-agent AI commerce platform (FastAPI + MongoDB backend, React/Vite frontend) built for the Razorpay AI Builder Buildathon (Track 01: AI Growth & Agentic Commerce). A **Customer Shopping Agent** handles NL search/recommendations/checkout; a **Merchant Growth Agent** mines order history for bundle/upsell opportunities that a merchant must explicitly approve. See `README.md` for the full architecture diagram, API surface, and demo flow — read it before making structural changes.

## Commands

Backend (from `backend/`, with `venv` activated):
```bash
./venv/Scripts/activate                          # Windows
pip install -r requirements.txt
python scripts/seed_data.py                       # (re)seed MongoDB: ~100-200 products, 500 customers, 5000 orders
uvicorn app.main:app --reload --port 8000
python -m pytest tests/ -v                         # all tests
python -m pytest tests/test_ml.py -v                # single file
python -m pytest tests/test_ml.py::test_name -v     # single test
python scripts/evaluate_ml.py                       # prints real Precision@K/Recall@K/Hit Rate, rule support/confidence/lift, silhouette score
```

Frontend (from `frontend/`):
```bash
npm install
npm run dev       # http://localhost:5173, proxies /api -> http://localhost:8000 (see vite.config.ts)
npm run build     # runs `tsc -b` then vite build — treat TS errors as build failures
npm run lint      # oxlint
```

MongoDB: local instance or `docker run -d --name mercora-mongo -p 27017:27017 mongo:7`. Connection string comes from `.env` (`MONGODB_URI`, `DATABASE_NAME`) at the repo root, read by `backend/app/config.py`.

There is no backend lint script configured; rely on `tsc -b`/`oxlint` (frontend) and pytest (backend) as the correctness gates.

## Architecture

**Data flow is the point of this app**: customer purchases → order history in MongoDB → ML mining (association rules + segmentation) → scored growth opportunities → merchant approval → written back as `bundles` → immediately surfaced by the Shopping Agent's cross-sell as real offers. Any change to one stage should be checked against this loop, not treated in isolation.

**Backend layout** (`backend/app/`):
- `agents/` — `shopping_agent.py` and `growth_agent.py` each expose an explicit tool registry (e.g. `search_catalog`, `get_recommendations`, `add_to_cart`) — agents never execute arbitrary code, only these named tools. `llm_provider.py` defines the `LLMProvider` ABC with `AnthropicProvider`, `GeminiProvider` (Google Gemini, needs `LLM_API_KEY` + `GEMINI_MODEL`), `OpenAIProvider` (needs `LLM_API_KEY` + `OPENAI_MODEL`), `OllamaProvider` (local model via `ollama serve`, no API key — `OLLAMA_BASE_URL`/`OLLAMA_MODEL` in `.env`), and a deterministic regex/keyword `FallbackProvider`; `get_llm_provider()` picks based on `LLM_PROVIDER`/`LLM_API_KEY`. `parse_shopping_intent_llm()` calls the live provider for structured intent JSON and falls back to the deterministic `parse_shopping_intent()` on any failure (timeout, malformed JSON, unconfigured provider). **The fallback path must always work with zero API keys** — never add a code path that requires an LLM key to function.
- `search_catalog()` in `shopping_agent.py` treats `category` as a *preference* (OR), not a strict filter, matched together with keyword regexes against product `name`/`tags` — companion/bundle products are deliberately tagged with their parent category for association mining even when a keyword (e.g. "mouse") describes them more precisely, so a strict category-AND-keyword filter silently excludes real matches. If search results look wrong, check this OR-matching logic before assuming the LLM/NLU layer is at fault.
- `ml/` — `recommendation.py` (TF-IDF + cosine similarity blended with popularity), `association.py` (mlxtend Apriori over order line-items), `segmentation.py` (KMeans over RFM features with deterministic segment naming), `opportunity.py` (scores opportunities as `0.35·affinity + 0.25·conversion + 0.20·revenue + 0.20·confidence`). All computed from real seeded Mongo data — no fabricated/hardcoded numbers.
- `services/guardrails.py` — the sole authority clamping AI-proposed discounts (`clamp_discount`, `validate_bundle_discount`); the growth agent can only *propose*, this is what actually enforces limits. Any endpoint that applies an AI-suggested discount must go through here.
- `services/razorpay_service.py` — orders/signature verification are server-side only; when `RAZORPAY_KEY_ID`/`SECRET` are blank, falls back to a deterministic mock order + mock signature so checkout is always demoable without real credentials.
- `services/audit.py` — every agent action (proposal, approval, guardrail clamp, bundle creation) must call `log_action(...)` to the `audit_logs` collection.
- `api/` — one router per resource; `opportunities.py`'s approve endpoint is the one place growth-agent output is written back to the catalog, and it must always re-validate through `guardrails.py` regardless of what the agent proposed.
- `database/connection.py` — `get_db()`/`ensure_indexes()`; add new indexes here rather than ad hoc in queries.

**Frontend layout** (`frontend/src/`): pages under `pages/` (customer: `Landing`, `Shop`, `ProductDetail`, `Cart`, `Checkout`, `Orders`) and `pages/merchant/` (`Overview`, `Analytics`, `Products`, `Opportunities`, `Copilot`, `Audit`, `Settings`), routed in `App.tsx`. `lib/api.ts` holds the axios instance plus guest identity (`getCustomerId()`/`getSessionId()` via localStorage/sessionStorage — there is no full auth system, `api/auth.py` is intentionally a lightweight identify-only endpoint). Data fetching goes through TanStack Query hooks (see `hooks/useCart.ts` as the pattern). Tailwind v4 is wired via the `@tailwindcss/vite` plugin and `@import "tailwindcss";` in `index.css` — not the old PostCSS setup.

**Seed data** (`backend/scripts/seed_data.py`): generates products per category with one "hero" product per category (`_is_hero` flag) biased to be selected in ~65% of that category's orders, with a companion product co-purchased ~55% of the time — this is what gives the Apriori miner real signal to find bundles (e.g. camera + SD card) instead of finding nothing. If association-rule mining starts returning zero bundles again, check this hero/companion weighting first before touching `ml/association.py`.

## Environment

`.env` at repo root (see `.env.example`): `MONGODB_URI`, `DATABASE_NAME`, `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` (blank = mock payment mode), `LLM_API_KEY`/`LLM_PROVIDER` (blank/`none` = deterministic fallback NLU), `JWT_SECRET`, `FRONTEND_URL`, `BACKEND_URL`. Never commit real secrets into `.env` — it's gitignored, but double-check before any commit that touches it.

## Deployment

Three pieces, detailed in `DEPLOYMENT.md`: MongoDB Atlas (database), Railway (backend, via `backend/Dockerfile`, which reads `$PORT` at runtime), Vercel (frontend static build, root vercel.json handles the `/api` rewrite to the backend service). The frontend reads `VITE_API_BASE_URL` at build time for the deployed API origin. `LLM_PROVIDER=ollama` only works locally (no Ollama process on Railway) — deployed environments need `gemini`, `openai`, or `anthropic` with a real `LLM_API_KEY`, or the app silently falls back to the deterministic NLU parser.

## Windows-specific notes

- `pandas`/`numpy`/`scikit-learn` versions in `requirements.txt` are pinned to ones with prebuilt Windows wheels for Python 3.13 (avoids a Meson/Visual Studio build-from-source requirement) — don't casually bump them without checking wheel availability.
- `setuptools<81` is pinned because the razorpay SDK imports `pkg_resources`, which newer setuptools removed.
- Use `np.ptp(arr)`, not `arr.ptp()` — removed in NumPy 2.0.
