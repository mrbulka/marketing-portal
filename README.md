# Marketing Portal — Twitter Marketing UI + Vercel Proxy

This project uses Vite + Vue 3 and is deployed on Vercel. It now includes:

- A user-friendly page at /twitter to start marketing jobs:
  - Outreach DMs: upload or paste a CSV with header userName,userLink,directMessage
  - Leads discovery: provide seed usernames (and optional filters JSON)
  - Shows job turnId and polls results until ready, then downloads the CSV
- Backend-safe proxy functions implemented as Vercel Serverless Functions under /api:
  - POST /api/marketing/generate_dm_list
  - POST /api/marketing/generate_leads
  - GET /api/results
- Security: The real backend host/IP is never exposed to the client. The proxy uses an env var MARKETING_BACKEND_URL and rewrites backend-supplied resultUrl fields to the proxy path (/api/results?token=…).

## Quick Start

1) Install dependencies

```bash
pnpm install
# or npm install / yarn
```

2) Set the backend URL as an environment variable in Vercel

- Key: MARKETING_BACKEND_URL
- Value: https://your-backend-host:port (no trailing slash)

Do not expose this in the browser. It is only read by the serverless functions.

3) Local development

There are two options:

- Frontend only:
  - Run: pnpm dev
  - Note: /api/* endpoints won’t work in this mode (they are Vercel Functions).

- Full stack (recommended):
  - Use Vercel CLI dev server so that /api functions run locally too.
  - Ensure you have Vercel CLI installed and authenticated: https://vercel.com/download
  - Provide the env var for local dev:
    - Option A (shell): export MARKETING_BACKEND_URL="https://your-backend-host" && vercel dev
    - Option B (file): create a .env.local file with MARKETING_BACKEND_URL=… then run vercel dev
    - Option C: vercel env pull .env.local and then vercel dev

The app will be available at http://localhost:3000 (Vercel dev defaults). The proxy functions run under http://localhost:3000/api/*.

4) Deployment

- Push to your Git repository connected to Vercel. Vercel will build and deploy.
- In the Vercel project settings, add MARKETING_BACKEND_URL as a production environment variable.
- After deploy, browse to https://your-site.vercel.app/twitter.

## New Files and Structure

- api/
  - marketing/
    - generate_dm_list.js
    - generate_leads.js
  - results.js
- src/router/index.js
- src/pages/Home.vue
- src/pages/Twitter.vue
- src/components/CsvInput.vue
- src/utils/download.js
- src/utils/polling.js
- src/App.vue updated to include navigation and router-view
- src/main.js updated to install vue-router

## Proxy Functions: Contracts

All proxy endpoints set CORS headers:
- Access-Control-Allow-Origin: *
- Access-Control-Allow-Methods: POST, GET, OPTIONS
- Access-Control-Allow-Headers: Content-Type
- OPTIONS returns 204.

Environment variable:
- MARKETING_BACKEND_URL: Base URL of the real backend. Not exposed client-side.

Endpoints:

1) POST /api/marketing/generate_dm_list
- Request: text/csv with header exactly:
  userName,userLink,directMessage
- Validations:
  - Header must match exactly
  - Max rows (non-empty lines after header) = 300
- Behavior:
  - Forwards to {MARKETING_BACKEND_URL}/marketing/generate_dm_list
  - Expects HTTP 202 with JSON { turnId, resultUrl, count?, batchSize? }
  - Rewrites resultUrl to /api/results?token=... so the browser never learns the backend host
  - On 202: returns rewritten JSON
  - On other statuses: returns JSON or text passthrough

2) POST /api/marketing/generate_leads
- Request: application/json
  {
    "seedUserNames": ["user1", "user2", ...],
    "filters": { ... } // optional JSON object
  }
- Validations:
  - seedUserNames must be a non-empty array of non-empty strings
  - filters, if present, must be an object
- Behavior:
  - Forwards to {MARKETING_BACKEND_URL}/marketing/generate_leads
  - Expects HTTP 202 with JSON { turnId, resultUrl }
  - Rewrites resultUrl to proxy path (/api/results?token=…)
  - On 202: returns rewritten JSON
  - On other statuses: returns JSON or text passthrough

3) GET /api/results?token=...
- Behavior:
  - Forwards to {MARKETING_BACKEND_URL}/results?token=...
  - HTTP 202 with {"ready": false}: returns same JSON
  - HTTP 200: streams CSV back to client and passes through Content-Type and Content-Disposition to honor filename
  - HTTP 400/410: forwards response
  - Other statuses: forwards textual or JSON response

## Frontend: /twitter Page

Two flows:

1) Outreach DMs
- CSV input via paste or file upload with exact header userName,userLink,directMessage
- Client-side validation for header and max 300 rows
- Submits to /api/marketing/generate_dm_list
- Displays turnId
- Polls /api/results?token=... using exponential backoff (2s, 2s, 3s, 5s, 8s, 13s… capped around 10–15s), up to ~60 attempts
- When status 200 is returned, triggers a CSV download in a new tab

2) Leads Discovery
- Input: seed usernames (comma/space/newline separated)
- Optional: filters JSON
- Submits to /api/marketing/generate_leads
- Displays turnId
- Polls /api/results?token=... with the same backoff strategy and downloads the CSV when ready

Utilities:
- src/utils/polling.js: pollForReady and waitAndDownload
- src/utils/download.js: triggerBrowserDownload

CSV Component:
- src/components/CsvInput.vue: supports paste and file upload modes, validates header and row count

## Security Notes

- The browser never sees MARKETING_BACKEND_URL or the backend host/IP.
- Backend-supplied resultUrl is always rewritten to /api/results?token=... before returning to the client.
- No backend auth headers are required (per provided constraints).
- Proxy endpoints are stateless; tokens are validated by the backend only.

## Testing

Outreach DMs via curl (replace TOKEN after response if testing manually):

```bash
# Submit CSV
curl -i -X POST http://localhost:3000/api/marketing/generate_dm_list \
  -H 'Content-Type: text/csv' \
  --data-binary $'userName,userLink,directMessage\nsomeuser,https://twitter.com/someuser,Hi there!'

# -> Expect: 202 with JSON containing { "turnId": "...", "resultUrl": "/api/results?token=..." }

# Poll results
curl -i "http://localhost:3000/api/results?token=YOUR_TOKEN"
# -> 202 {"ready":false} until ready, then 200 CSV stream
```

Leads via curl:

```bash
curl -i -X POST http://localhost:3000/api/marketing/generate_leads \
  -H 'Content-Type: application/json' \
  -d '{"seedUserNames":["user1","user2"], "filters":{"minFollowers":100}}'
```

## Notes on History Routing

The app uses vue-router with history mode. Vercel’s framework preset for Vite should automatically handle rewrites to index.html for client-side routing. If deep-linking to routes returns 404s in a custom setup, add a rewrite rule to route all non-/api requests to /index.html.

---

## Original Vite + Vue Template Notes

This template uses Vue 3 `<script setup>` SFCs. Check the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more. Vite supports many popular JS frameworks. [See all supported frameworks](https://vitejs.dev/guide/#scaffolding-your-first-vite-project).

### Deploying From Your Terminal

You can deploy your new Vite project with a single command from your terminal using [Vercel CLI](https://vercel.com/download):

```shell
vercel
