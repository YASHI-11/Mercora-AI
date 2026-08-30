# Deploying Mercora AI

Three pieces: **MongoDB Atlas** (database), **Railway** (backend, via the
`backend/Dockerfile`), **Vercel** (frontend, static Vite build). Verified
locally: the backend Docker image builds and serves `/api/health` correctly;
the frontend build is clean with the new `VITE_API_BASE_URL` support.

## 1. MongoDB Atlas

Already set up if you've been using the Atlas URI in `.env` — reuse that
cluster, or create a free M0 cluster at mongodb.com/cloud/atlas. You'll need
the connection string for step 2. Whitelist `0.0.0.0/0` in Atlas's Network
Access (or Railway's static outbound IPs if you want it tighter).

## 2. Backend -> Railway

1. railway.app -> New Project -> Deploy from GitHub repo -> select this repo,
   set the **root directory to `backend/`** (Railway auto-detects the
   `Dockerfile` there, no build config needed).
2. Set these environment variables on the Railway service:
   ```
   MONGODB_URI=<your Atlas connection string>
   DATABASE_NAME=mercora
   FRONTEND_URL=<filled in after step 3 -- your Vercel URL>
   JWT_SECRET=<random string>
   LLM_PROVIDER=gemini            # or openai / anthropic -- "ollama" won't work here, see note below
   LLM_API_KEY=<your key>
   RAZORPAY_KEY_ID=                # optional, blank = mock payment mode
   RAZORPAY_KEY_SECRET=
   ```
   Don't set `PORT` -- Railway injects it automatically and the Dockerfile's
   `CMD` already reads `$PORT`.
3. Deploy. Note the generated `*.up.railway.app` URL -- that's your backend
   URL, needed in step 3. Confirm it's live: `curl https://<that-url>/api/health`.
4. **Seed the deployed database** once, from your machine, by pointing the
   existing seed scripts at the Atlas URI (same one used above):
   ```
   cd backend && MONGODB_URI="<atlas uri>" DATABASE_NAME=mercora python scripts/seed_data.py
   ```
   (PowerShell: `$env:MONGODB_URI="<atlas uri>"; $env:DATABASE_NAME="mercora"; python scripts/seed_data.py`)

## 3. Frontend -> Vercel

1. vercel.com -> New Project -> import this repo, set **root directory to
   `frontend/`** (Vercel auto-detects Vite; `vercel.json` already handles
   SPA routing so client-side routes like `/shop/product/:id` don't 404 on
   refresh).
2. Set one build-time environment variable:
   ```
   VITE_API_BASE_URL=https://<your-railway-url>/api
   ```
3. Deploy. Take the resulting `*.vercel.app` URL and set it as `FRONTEND_URL`
   back on the Railway service (step 2), then redeploy the backend so CORS
   allows it.

## LLM provider note

`.env`'s `LLM_PROVIDER=ollama` only works because Ollama is running on your
own machine -- there's no Ollama process on Railway. For deployment, set
`LLM_PROVIDER` to `gemini`, `openai`, or `anthropic` with a real `LLM_API_KEY`.
If you deploy without changing this, the app still works end-to-end (nothing
crashes) but silently falls back to the deterministic keyword-based NLU
parser instead of a live LLM, per the fallback design in `llm_provider.py`.

## Sanity checklist after deploying

- `curl https://<railway-url>/api/health` -> `{"status":"ok","database":"connected"}`
- Visit the Vercel URL, run a shopping search -- confirms `VITE_API_BASE_URL`
  and CORS are both wired correctly.
- Check the Razorpay checkout flow completes (mock mode if no real keys set).
