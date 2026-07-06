# SUBMITTAL.BUILD backend (pure Python)

FastAPI reimplementation of the 6 n8n Cloud workflows that used to power
SUBMITTAL.BUILD. Talks directly to the Google Drive/Docs/Sheets REST APIs and
Gemini via `httpx` — no workflow middleware, no PDF.co.

The original n8n workflow exports live in [`../reference/n8n/`](../reference/n8n/)
for diffing. (5 of the 6 exports are archived there; the BOQ/generate-tender
workflow export was not available and its port was implemented from its
documented behavior.)

## Endpoints (same external contract as the n8n webhooks)

| Method | Path | Replaces n8n workflow |
| ------ | ---- | --------------------- |
| GET  | `/submittal-library` | Submittal Library Browser |
| POST | `/submittal-search` | Submittal Drive Search |
| POST | `/submittal-image-upload` | Submittal Image Upload (multipart field: `image`) |
| POST | `/submittal-fill` | Submittal Template Filler |
| POST | `/generate-tender` | BOQ workflow (multipart field: `boq`; optional form fields `sheet_id`, `sheet_gid`, `header_row`, `first_data_row` override the "Ranim 7" defaults) |
| POST | `/submittal-merge` | Submittal PDF Merge — **now fully synchronous, no PDF.co** |
| POST | `/submittal-merge-fetch` | Compatibility shim that always answers `ready: true` |
| GET  | `/health` | — |

### Intentional behavior changes vs n8n

- **Merge is synchronous.** The PDF.co async-job + polling dance existed only
  because of n8n Cloud's ~30s webhook timeout. `/submittal-merge` now exports,
  builds the index page (reportlab, in-process), merges (pypdf), uploads the
  result to Drive and responds in one request. It still returns a synthetic
  `jobId` and `/submittal-merge-fetch` immediately returns `ready: true`, so
  the existing frontend poll loop works unmodified. **Follow-up cleanup:** once
  stable, delete the poll loop in `src/App.jsx` and this shim — it's dead code.
  `pdfcoKey` in request bodies is accepted and ignored; drop `VITE_PDFCO_KEY`
  at cutover.
- **`/generate-tender` reports skipped rows.** The n8n sheet update matched on
  SEQ and silently dropped extracted rows with no matching SEQ in the sheet.
  The port keeps update-only semantics (no new rows appended) but returns the
  dropped rows in a `skipped` list so you notice when the template runs out of
  rows.
- **Gemini model** defaults to `gemini-2.5-flash` (n8n hardcoded the older
  `gemini-2.0-flash`). Override with `GEMINI_MODEL`.

## One-time OAuth setup (refresh token)

The Drive templates live in a personal My Drive, so a service account can't
substitute — the backend uses OAuth2 with a long-lived refresh token, exactly
like the n8n credential did internally.

1. In Google Cloud Console, reuse (or create) an OAuth Client ID of type
   **Desktop app**, on a project with the **Drive, Docs and Sheets APIs
   enabled**.
2. Run the consent flow once, signed in as the Gmail account that owns the
   templates:

   ```bash
   pip install google-auth-oauthlib
   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... python scripts/get_refresh_token.py
   ```

3. Copy the printed `GOOGLE_REFRESH_TOKEN` (plus the client id/secret and a
   `GEMINI_API_KEY`) into `.env` — see `.env.example` for every variable.

At runtime `app/google_auth.py` exchanges the refresh token for short-lived
access tokens and caches them in memory until near expiry.

## Run locally

```bash
cd submittal-backend
pip install -r requirements.txt
cp .env.example .env   # then fill in credentials
set -a; source .env; set +a
uvicorn app.main:app --reload
```

### Point the frontend at it

The React app reads one env var **per endpoint** (not a single base URL) —
set these in the frontend's `.env` / Vercel project settings:

```
VITE_N8N_LIBRARY_WEBHOOK_URL=http://localhost:8000/submittal-library
VITE_N8N_SEARCH_URL=http://localhost:8000/submittal-search
VITE_N8N_IMAGE_UPLOAD_URL=http://localhost:8000/submittal-image-upload
VITE_N8N_FILL_URL=http://localhost:8000/submittal-fill
VITE_N8N_MERGE_URL=http://localhost:8000/submittal-merge
VITE_N8N_MERGE_FETCH_URL=http://localhost:8000/submittal-merge-fetch
```

(`VITE_N8N_WEBHOOK_URL` is only a legacy fallback for the fill URL;
`VITE_PDFCO_KEY` becomes unnecessary.)

## Tests

```bash
pytest                      # all endpoints, Google/Gemini mocked via respx
RUN_E2E_SMOKE=1 pytest tests/test_e2e_smoke.py   # opt-in, hits your real Drive (read-only)
```

## Index-page fonts (optional)

The merge index page uses maroon `#7C0000` Playfair Display headings and
`#1C1C1C` Roboto Flex body text like the original. Drop
`PlayfairDisplay-Regular.ttf` and `RobotoFlex-Regular.ttf` into
`app/assets/fonts/` (download from Google Fonts) to get the exact faces;
without them it falls back to Times-Roman/Helvetica.

## Deployment option A: Vercel (fastest — same platform as the frontend)

`api/index.py` + `vercel.json` are already set up, so the backend deploys as a
single Vercel Python function:

1. In Vercel, **Add New Project → import `harshalady007/Submittal-App`**, set
   **Root Directory = `submittal-backend`** (Framework Preset: Other).
2. Add the env vars from `.env.example` (`GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GEMINI_API_KEY`) in
   Project Settings → Environment Variables.
3. Deploy. Endpoints appear at `https://<backend-project>.vercel.app/submittal-library` etc.
4. In the **frontend** Vercel project, set the six `VITE_N8N_*_URL` vars (see
   below) to those URLs and redeploy — Vite bakes them in at build time, so a
   redeploy is required.

Note: `maxDuration` is set to 300s; on the Hobby plan make sure Fluid Compute
is enabled (it's the default for new projects) so fill/merge requests aren't
cut off at 10s.

## Deployment option B: AWS Lambda + Function URL (near-zero idle cost)

**Why Lambda over an always-on host:** this backend is bursty and idle most of
the time — the same "only runs when called" pattern as the old n8n webhooks —
so Lambda + Function URL gets you near-zero idle cost. The index page is
rendered with **reportlab specifically so this works**: weasyprint's nicer
HTML/CSS rendering needs native Pango/Cairo libs, which on Lambda means
maintaining a custom layer that breaks on runtime upgrades. reportlab is pure
Python, and the index page (a heading + a roman-numeral list) doesn't need an
HTML engine. If you later want pixel-perfect HTML rendering, move to Fly.io /
a t3.micro and swap `pdf_merge.build_index_pdf` for weasyprint.

`app/main.py` already exposes `handler = Mangum(app)`. Deploy:

```bash
cd submittal-backend
pip install -r requirements.txt -t package/ --platform manylinux2014_x86_64 --only-binary=:all: --python-version 3.12
cp -r app package/
cd package && zip -r ../lambda.zip . && cd ..

aws lambda create-function \
  --function-name submittal-backend \
  --runtime python3.12 --handler app.main.handler \
  --zip-file fileb://lambda.zip \
  --timeout 120 --memory-size 1024 \
  --environment "Variables={GOOGLE_CLIENT_ID=...,GOOGLE_CLIENT_SECRET=...,GOOGLE_REFRESH_TOKEN=...,GEMINI_API_KEY=...}"

aws lambda create-function-url-config \
  --function-name submittal-backend --auth-type NONE \
  --cors 'AllowOrigins=*,AllowMethods=GET,POST,AllowHeaders=Content-Type'
aws lambda add-permission --function-name submittal-backend \
  --action lambda:InvokeFunctionUrl --principal '*' \
  --function-url-auth-type NONE --statement-id public-url
```

Notes:
- `--timeout 120`: fill and merge can take 30–60s on big packages; Function
  URLs allow up to Lambda's own timeout (no 30s API-Gateway-style cap).
- Set the `VITE_N8N_*_URL` vars to `https://<url-id>.lambda-url.<region>.on.aws/<path>`.
- Updates: rebuild the zip and `aws lambda update-function-code`.

## Cutover checklist

1. Deploy the new backend; run all 6 endpoints against a real test project
   end-to-end and diff the outputs against a recent real n8n-generated
   submittal package.
2. Point a feature-flagged copy of Submittal-App (preview deployment with the
   `VITE_N8N_*_URL` vars above) at the new base URL; verify library browsing,
   search, image upload, fill (incl. TDS image swap), BOQ tender, and merge
   behave identically.
3. Cut the production frontend over for real.
4. Unpublish (don't delete yet) the 6 n8n workflows on `adyyy.app.n8n.cloud`
   for a week as a rollback safety net, then cancel the n8n Cloud
   subscription.
5. Follow-up cleanup: remove the frontend's merge poll loop + `VITE_PDFCO_KEY`
   and delete the `/submittal-merge-fetch` shim.
