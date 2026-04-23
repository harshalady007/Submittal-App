# Submittal Builder — Frontend + n8n + Gemini

## Architecture

```
Browser (React/Vercel)
  │
  │  POST { projectInfo, selectedDocs }
  ▼
n8n Webhook  →  Build Prompts (Code)  →  Call Gemini API (HTTP Request)  →  Aggregate Docs (Code)  →  Respond
  │
  │  { success: true, documents: { tds: "...", warranty: "..." } }
  ▼
Browser  →  Preview & Export PDF
```

---

## Step 1 — n8n Setup

### 1a. Add Google Gemini API Key credential
1. In n8n → **Credentials** → New → search **HTTP Query Auth**
2. Name it exactly: `Gemini API Key`
3. Set:
   - **Name**: `key`
   - **Value**: your Gemini API key (get from https://aistudio.google.com/apikey)
4. Save

### 1b. Connect credential to workflow
1. Open workflow **Material Submittal — Gemini Generator**
2. Click the **Call Gemini API** node
3. Under Authentication → select **Gemini API Key**
4. Save workflow

### 1c. Activate the workflow
- Toggle the workflow to **Active** (top right in n8n)
- Your webhook URL will be:
  ```
  https://harshalady.app.n8n.cloud/webhook/submittal-generate
  ```
- For testing (before activating), use the test URL:
  ```
  https://harshalady.app.n8n.cloud/webhook-test/submittal-generate
  ```

---

## Step 2 — Frontend Setup

### Install & run locally
```bash
cd submittal-app
npm install

# Copy env file and set your webhook URL
cp .env.example .env
# Edit .env and paste your n8n webhook URL

npm run dev
# Opens at http://localhost:5173
```

### Build for production
```bash
npm run build
# Output in /dist folder — deploy this to Vercel or Netlify
```

---

## Step 3 — Deploy to Vercel

### Option A: Vercel CLI
```bash
npm install -g vercel
cd submittal-app
vercel

# Set environment variable in Vercel dashboard:
# VITE_N8N_WEBHOOK_URL = https://harshalady.app.n8n.cloud/webhook/submittal-generate
```

### Option B: Vercel Dashboard
1. Push this folder to a GitHub repo
2. Go to https://vercel.com → New Project → Import repo
3. Framework: **Vite**
4. Root directory: `submittal-app`
5. Add Environment Variable:
   - Key: `VITE_N8N_WEBHOOK_URL`
   - Value: `https://harshalady.app.n8n.cloud/webhook/submittal-generate`
6. Deploy

### Option C: Netlify
1. Push to GitHub
2. Netlify → New site → Import from Git
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Add Environment Variable: `VITE_N8N_WEBHOOK_URL`

---

## Step 4 — n8n CORS (if browser blocks requests)

If you get CORS errors from the browser:

1. In n8n → **Settings** → **Security**
2. Add your Vercel/Netlify domain to **Allowed Origins**:
   ```
   https://your-app.vercel.app
   ```
   Or for dev: `http://localhost:5173`

The n8n workflow already sends `Access-Control-Allow-Origin: *` in its response headers.

---

## File Structure

```
submittal-app/
├── index.html
├── package.json
├── vite.config.js
├── .env.example          ← copy to .env, fill webhook URL
└── src/
    ├── main.jsx
    └── App.jsx           ← entire UI + n8n integration
```

---

## Workflow: How It Works

| Node | What it does |
|---|---|
| **Receive Submittal Request** | Webhook — accepts POST from frontend |
| **Build Prompts** | Code node — creates one `{ docKey, requestBody }` item per selected AI doc |
| **Call Gemini API** | HTTP Request — calls `gemini-2.0-flash` per doc via REST API |
| **Aggregate Documents** | Code node — collects all Gemini outputs into `{ documents: { tds: "...", ... } }` |
| **Send Response** | Respond to Webhook — returns JSON to frontend |

---

## AI Document Types

| Key | Document | Auto-filled by Gemini |
|---|---|---|
| `tds` | Technical Data Sheet | ✓ |
| `warranty` | Draft Warranty Certificate | ✓ |
| `origin` | Country of Origin Declaration | ✓ |
| `compliance` | Compliance Statement | ✓ |
| `test_cert` | Test Certificate | ✓ |
| `material_schedule` | Material Schedule | ✓ |
| `cover` | Cover Page | ✓ (local, no AI) |
| `brochure` | Product Brochure | Manual PDF |
| `shop_drawing` | Shop Drawing | Manual PDF |
| `sample_photo` | Sample Photo | Manual PDF |

---

## Troubleshooting

**"VITE_N8N_WEBHOOK_URL not set"**
→ Create `.env` file from `.env.example` and add your webhook URL.

**Network error / CORS**
→ Make sure workflow is Active (not just saved). Use production webhook URL, not test URL, after activation.

**Gemini returns empty**
→ Check credential in n8n — verify API key is valid and quota not exceeded.

**All docs show "not filled"**
→ Check n8n execution log — look at Aggregate Documents node output.
