# Implementation Plan

[Overview]
Add a new Twitter marketing page and Vercel serverless proxy functions that safely broker requests between the frontend and the backend marketing API without exposing the backend IP. The frontend provides simple inputs for normal users to submit DM list and lead generation jobs, then polls and downloads CSV results via the proxy.

Multiple paragraphs outlining the scope, context, and high-level approach. Explain why this implementation is needed and how it fits into the existing system.
- Scope: Implement a Vue-based /twitter UI with two workflows: (1) Outreach DM list submission using a CSV file or pasted CSV text, and (2) Lead generation submission using JSON inputs (seed users and filters). Implement a robust polling loop to retrieve the CSV once ready. All requests traverse new Vercel serverless functions under /api/*, which forward to the actual backend configured via an environment variable MARKETING_BACKEND_URL.
- Context: The backend exposes asynchronous marketing jobs that return 202 with signed resultUrl tokens to fetch CSV outputs. We must not reveal the backend host/IP; thus, we will rewrite and surface only /api/* URLs to the browser. CORS is enabled on marketing endpoints; our proxy functions will add permissive CORS for browser access and manage OPTIONS preflight.
- High-level approach: 
  1) Create three serverless proxy functions: POST /api/marketing/generate_dm_list, POST /api/marketing/generate_leads, and GET /api/results. They validate inputs, forward requests to the backend, and on 202 responses rewrite resultUrl to the proxy path (/api/results?token=...), ensuring the client never sees the backend host. 
  2) Build a Vue route /twitter with forms and UX for job creation and polling/downloading results. Provide both CSV file upload and paste modes for the outreach job. 
  3) Implement a polling utility with recommended backoff strategy that stops on 200 (download), returns retry on 202, and handles 400/410 error cases.

[Types]  
Single sentence describing the type system changes.
We will document runtime contracts using JSDoc-style types and disciplined object shapes (no TypeScript dependency required).

Detailed type definitions, interfaces, enums, or data structures with complete specifications. Include field names, types, validation rules, and relationships.
- DMListCsv (string):
  - Required header line: "userName,userLink,directMessage"
  - Up to 300 data rows (MAX_TARGETS). Rows with blank userName are skipped by backend, but we will still enforce header presence and basic size caps at the proxy.
- LeadsRequest (object):
  - seedUserNames: string[] (required, non-empty strings)
  - filters?: {
      followersMin?: number (>= 0),
      followersMax?: number (>= followersMin if both provided),
      wordFilters?: string[] (strings, case-insensitive use is up to backend)
    }
- DMListJobSubmitResponse (object):
  - turnId: string
  - resultUrl: string (rewritten to /api/results?token=...)
  - count: number (<= 300)
  - batchSize: number (50)
- LeadsJobSubmitResponse (object):
  - turnId: string
  - resultUrl: string (rewritten to /api/results?token=...)
- ResultsDownload:
  - 202: {"ready": false}
  - 200: CSV stream with headers:
    - Content-Type: text/csv; charset=utf-8
    - Content-Disposition: attachment; filename="...csv"
  - 400: {"error": string}
  - 410: {"error": "Token expired"}
- TokenPayload (opaque to client):
  - exp: epoch ms
  - p: path under marketing_output (server-side enforced by backend)

[Files]
Single sentence describing file modifications.
We will add three Vercel serverless functions, a new Vue route and supporting components, basic router setup, and minor updates to integrate the page.

Detailed breakdown:
- New files to be created (with full paths and purpose)
  - api/marketing/generate_dm_list.js
    - Vercel Node function; Accepts POST text/csv from browser, validates basic structure (header presence, size cap), forwards to `${MARKETING_BACKEND_URL}/marketing/generate_dm_list`, rewrites resultUrl in 202 response to `/api/results?token=...`, sets CORS headers, handles OPTIONS.
  - api/marketing/generate_leads.js
    - Vercel Node function; Accepts POST application/json, validates minimal schema (seedUserNames array, optional filters), forwards to `${MARKETING_BACKEND_URL}/marketing/generate_leads`, rewrites resultUrl, sets CORS headers, handles OPTIONS.
  - api/results.js
    - Vercel Node function; Accepts GET with `token` query string, forwards to `${MARKETING_BACKEND_URL}/results?token=...`, passes through 202 JSON or 200 CSV stream (including Content-Disposition and Content-Type). Sets CORS headers and handles OPTIONS. Rejects missing/invalid token at proxy-level with 400.
  - src/router/index.js
    - Vue Router setup with routes: `/` (existing App/HelloWorld) and `/twitter`.
  - src/pages/Twitter.vue
    - Main UI with two panels (tabs or sectioned): "Outreach DMs" and "Leads". Submission forms, live status with turnId, and polling/auto-download logic aligned to the contract.
  - src/components/CsvInput.vue
    - Reusable component that supports either file upload or paste mode for CSV content. Validates the presence of the required header before enabling submit.
  - src/utils/polling.js
    - Polling helper that implements the recommended backoff (2s, 2s, 3s, 5s, 8s, 13s, cap ~15s).
  - src/utils/download.js
    - downloadCsv(resultUrl, fileName): performs GET, branches on 202/200; for 200 triggers browser download via blob/object URL as per contract.
- Existing files to be modified (with specific changes)  
  - package.json
    - Add dependency "vue-router": "^4.x".
    - Optionally add a script "vercel:dev": "vercel dev" for local testing with functions.
  - src/main.js
    - Install Vue Router and mount the app with router.
  - src/App.vue
    - Replace HelloWorld demo usage with router links and <router-view/>; optionally keep a link to `/twitter`.
- Files to be deleted or moved
  - None required. Optionally remove HelloWorld if no longer needed.
- Configuration file updates
  - Vercel project should define env var MARKETING_BACKEND_URL (e.g., https://your-backend-host).
  - No change needed to vite.config.js for this feature.
  - Optional: vercel.json not required because /api/* maps to functions by convention.

[Functions]
Single sentence describing function modifications.
We will add new serverless handler functions and new frontend helper functions; no existing function replacements are required.

Detailed breakdown:
- New functions (name, signature, file path, purpose)
  - handler(req, res) in api/marketing/generate_dm_list.js
    - Purpose: POST proxy for text/csv. 
    - Key steps: handle OPTIONS; validate content-type and header presence; forward body to backend; on 202 rewrite resultUrl; set CORS; return 400 on validation failure.
  - handler(req, res) in api/marketing/generate_leads.js
    - Purpose: POST proxy for JSON leads request.
    - Steps: handle OPTIONS; validate shape; forward; rewrite resultUrl on 202; set CORS; return 400 on validation failure.
  - handler(req, res) in api/results.js
    - Purpose: GET proxy for token-based results.
    - Steps: handle OPTIONS; ensure token present; forward; if 202, return JSON {"ready": false}; if 200, stream CSV and pass through Content-Disposition; set CORS.
  - downloadCsv(resultUrl: string, fileName?: string) in src/utils/download.js
    - Purpose: Frontend GET to resultUrl; download on 200, signal not-ready for 202; surface meaningful errors.
  - waitAndDownload(resultUrl: string, suggestedName?: string) in src/utils/polling.js
    - Purpose: Polling loop with exponential backoff until ready or timeout (~60 attempts).
  - submitDmCsv(csvText: string) in src/pages/Twitter.vue
    - Purpose: POST CSV to /api/marketing/generate_dm_list; display turnId; start polling with rewritten resultUrl.
  - submitLeads(payload: LeadsRequest) in src/pages/Twitter.vue
    - Purpose: POST JSON to /api/marketing/generate_leads; display turnId; start polling with rewritten resultUrl.
- Modified functions (exact name, current file path, required changes)
  - createApp mounting in src/main.js
    - Integrate router via createApp(App).use(router).mount('#app').
- Removed functions (name, file path, reason, migration strategy)
  - None.

[Classes]
Single sentence describing class modifications.
No classes are introduced; this implementation uses functional modules and Vue SFCs.

Detailed breakdown:
- New classes
  - None.
- Modified classes
  - None.
- Removed classes
  - None.

[Dependencies]
Single sentence describing dependency modifications.
Add vue-router to enable the /twitter page while keeping the existing Vite+Vue setup.

Details of new packages, version changes, and integration requirements.
- "vue-router": "^4.3.0" (or latest 4.x)
  - Update src/main.js to register router.
- No additional libraries are strictly required; validation implemented inline to reduce surface area.
- Environment variable required at deploy time:
  - MARKETING_BACKEND_URL (example: https://api.company.internal or public host of the backend)
    - Used only in serverless functions; never exposed in browser code.

[Testing]
Single sentence describing testing approach.
We will verify end-to-end flows locally via vercel dev and in deployment by exercising both job types and result polling, including error cases.

Test file requirements, existing test modifications, and validation strategies.
- Manual E2E using vercel dev:
  - Outreach DMs:
    - Paste minimal CSV with header and one row; verify 202 response shows turnId and rewritten resultUrl (/api/results?...). Ensure no backend host leaks in the UI or Network tab.
    - Polling: Observe 202 {"ready": false} responses then 200 CSV; verify file downloaded; headers include Content-Disposition.
    - Invalid CSV: missing header → 400 at proxy with {"error": "..."}.
  - Leads:
    - Seed users ["alice","bob"] with followersMin set; verify 202 with rewritten resultUrl.
    - Invalid JSON (missing seedUserNames) → 400 at proxy with {"error": "..."}.
  - Token errors:
    - Manually tamper token → 400 from /api/results.
    - Wait for expiry if possible → 410; check UI message.
- Frontend unit-light checks (optional):
  - Verify backoff progression caps at ~15s.
  - CsvInput.vue header detection and file/paste switching.
- CORS:
  - Confirm OPTIONS preflight returns proper headers from all proxy endpoints.

[Implementation Order]
Single sentence describing the implementation sequence.
We will implement serverless proxies first, then the frontend routing and UI, followed by polling utilities and final integration, and conclude with testing.

Numbered steps showing the logical order of changes to minimize conflicts and ensure successful integration.
1) Add api/marketing/generate_dm_list.js with CORS and header/size validations; forward to backend; rewrite resultUrl; return 202/400 as appropriate.
2) Add api/marketing/generate_leads.js with CORS and JSON validation; forward; rewrite resultUrl; return 202/400.
3) Add api/results.js with CORS; forward GET; pass 202 JSON or 200 CSV with streaming and header pass-through.
4) Install vue-router and create src/router/index.js; update src/main.js to use router.
5) Create src/components/CsvInput.vue to support file upload and paste modes with header validation.
6) Create src/utils/download.js and src/utils/polling.js implementing the provided examples (downloadCsv, waitAndDownload with backoff).
7) Create src/pages/Twitter.vue with two forms (Outreach DMs and Leads), job-submission handlers, and status UI (turnId, spinner, progress, download on ready).
8) Modify src/App.vue to include navigation link to /twitter and <router-view/> placeholder.
9) Configure MARKETING_BACKEND_URL in Vercel project settings; for local dev, run `vercel dev`.
10) Test all flows locally (valid/invalid CSV/JSON, polling until 200, 400/410 handling). 
11) Deploy and verify again in production environment.
