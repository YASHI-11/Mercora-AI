# Deploying Mercora AI

Live deployment topology (as actually configured, not the earlier
Railway-based plan this doc used to describe): a **single Vercel project**
running both services via the root `vercel.json` (Vercel Services) --
`frontend` (static Vite build) and `backend` (the FastAPI app at
`backend/app/main.py`, run as a Python function) -- plus **MongoDB Atlas**
for the database. `/api/*` requests are routed to the backend service,
everything else to the frontend.

## ⚠ Required: set a real LLM_PROVIDER on Vercel

**This has already caused a production incident** (`/api/agent/growth`
returning 500 `FUNCTION_INVOCATION_FAILED`). If the Vercel project's
`LLM_PROVIDER` env var is `ollama` (copied from local `.env`), every LLM call
tries to reach `localhost:11434`, which doesn't exist on Vercel -- confirmed
by reproducing the exact failure locally: a single hung call ate the full
30s `httpx` timeout, and the growth agent makes up to two such calls per
request. The platform kills the function mid-hang before the code's own
try/except fallback ever runs, producing exactly this crash instead of a
graceful deterministic-fallback reply.

**Fix**: on the Vercel project's environment variables, set:
```
LLM_PROVIDER=gemini      # or openai / anthropic
LLM_API_KEY=<a real key for that provider>
```
`ollama` only ever works on your own machine where `ollama serve` is
actually running -- never set it on any hosted deployment. Two defense-in-
depth mitigations already shipped in code regardless: hosted-provider HTTP
calls now time out after 10s instead of 30s (`HOSTED_API_TIMEOUT` in
`llm_provider.py`), and the growth agent now fetches orders/products once per
request instead of up to 4 times (was independently measured at ~7s per
full-collection fetch against the production dataset).

## 1. MongoDB Atlas

Reuse the cluster already referenced by the Atlas URI in `.env` / Vercel's
`MONGODB_URI`, or create a free M0 cluster at mongodb.com/cloud/atlas.
Whitelist `0.0.0.0/0` in Atlas's Network Access (Vercel functions don't have
fixed outbound IPs on most plans).

## 2. Vercel environment variables (backend service)

```
MONGODB_URI=<your Atlas connection string>
DATABASE_NAME=mercora
FRONTEND_URL=https://<this project's Vercel URL>
JWT_SECRET=<random string>
LLM_PROVIDER=gemini            # or openai / anthropic -- see warning above
LLM_API_KEY=<your key>
RAZORPAY_KEY_ID=                # optional, blank = mock payment mode
RAZORPAY_KEY_SECRET=
```

## 3. Seed the deployed database (once, from your machine)

```
cd backend && MONGODB_URI="<atlas uri>" DATABASE_NAME=mercora python scripts/seed_data.py
```
(PowerShell: `$env:MONGODB_URI="<atlas uri>"; $env:DATABASE_NAME="mercora"; python scripts/seed_data.py`)

## Alternative: split deployment (Railway + Vercel)

`backend/Dockerfile` still exists and was verified to build and serve
`/api/health` correctly, if you'd rather run the backend on Railway/Render
instead of as a Vercel service -- deploy it there, set
`VITE_API_BASE_URL=https://<backend-url>/api` as a Vercel build-time env var
on the frontend service, and remove/ignore the root `vercel.json`'s
`backend` service entry. Not the currently-live setup, but kept working as a
documented option.

## Sanity checklist after deploying

- `curl https://<vercel-url>/api/health` -> `{"status":"ok","database":"connected"}`
- `curl -X POST https://<vercel-url>/api/agent/growth -H "content-type: application/json" -d '{"message":"how can I increase revenue?"}'`
  should return within a few seconds, not time out.
- Visit the site, run a shopping search and a growth-copilot question --
  confirms routing, CORS, and the LLM provider are all correctly wired.
- Check the Razorpay checkout flow completes (mock mode if no real keys set).
