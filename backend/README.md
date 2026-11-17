# SecureDevOps Unified Backend

A unified backend built for the SecureDevOps frontend. It combines full GitHub OAuth authentication, repository management, automated webhook installation, Smee relay, and Google OSV vulnerability scanning.

---

## 🚀 Key Features

1. **GitHub OAuth Authentication & PAT Support**
   - Direct OAuth flow via `/auth/github` requesting scopes: `repo,admin:repo_hook,read:user`.
   - Callback handler exchanging authorization code, persisting session cookie (`gh_token`), and redirecting back to the frontend.
   - Fallback Personal Access Token (PAT) linking via `/api/auth/token`.

2. **Repository Selection & Webhook Management**
   - Lists user repositories via `/api/user/repos` with admin permission flags.
   - Checks webhook installation status via `/api/repos/check-webhook`.
   - Automatically installs a webhook on GitHub (`push`, `pull_request`, `ping` events) pointing to your Smee channel via `/api/repos/setup-webhook`.
   - Webhook removal support via `DELETE /api/repos/webhook`.

3. **Automated Webhook Scan Rerun**
   - Webhook receivers at `/api/webhook` and `/api/webhooks/github`.
   - HMAC SHA-256 signature verification (`x-hub-signature-256`).
   - On **`ping`**: runs baseline vulnerability scan on the repository.
   - On **`push`** or **`pull_request`**:
     - Automatically fetches modified files or repository `package.json`.
     - Scans dependencies against the **Google OSV API** (`https://api.osv.dev/v1/querybatch`).
     - Reruns the scan and stores the new scan run in history.
     - Broadcasts real-time Server-Sent Events (`scan_completed`, `activity_log`, `push_scan_completed`) to all connected frontend clients.

4. **Dual Frontend Compatibility (Backend A + Backend B)**
   - Serves both VulnWatch (`/api/*`, `/auth/*`, `/api/events`) and SecureDevOps (`/api/webhooks/*`) API contracts.
   - Runs primary on port `4000` and secondary on port `3001` so both default Next.js rewrites work out-of-the-box.

---

## 🛠️ How to Run

### 1. Start the Backend
From the root workspace:
```bash
npm run backend
```
Or from the `backend/` folder:
```bash
cd backend
npm start
```

### 2. Start the Frontend
From the root workspace:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ⚙️ Configuration (`backend/.env`)

| Variable | Description |
| :--- | :--- |
| `PORT` | Primary server port (default: `4000`) |
| `VULNWATCH_PORT` | Secondary server port (default: `3001`) |
| `FRONTEND_URL` | Frontend URL for OAuth redirects (default: `http://localhost:3000`) |
| `SMEE_URL` | Smee.io webhook delivery channel |
| `GITHUB_WEBHOOK_SECRET` | HMAC SHA-256 secret for webhook verification |
| `GITHUB_CLIENT_ID` | GitHub OAuth / GitHub App Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth / GitHub App Client Secret |
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY_PATH` | Path to RSA private key file (`./github-key.pem`) |

---

## 📡 API Endpoints Reference

### Authentication
- `GET /auth/github`: Start OAuth flow
- `GET /auth/github/callback`: OAuth callback handler
- `GET /api/auth/status`: Check login status and profile
- `POST /api/auth/token`: Link Personal Access Token
- `POST /api/auth/logout`: Disconnect account

### Repositories & Webhooks
- `GET /api/user/repos`: List repositories
- `GET /api/repos/check-webhook?repo=owner/repo`: Check webhook status
- `POST /api/repos/setup-webhook`: Install webhook on GitHub
- `DELETE /api/repos/webhook`: Remove webhook

### Scans & Activity
- `GET /api/scans`: Get scan history
- `GET /api/scans/:id`: Get scan by ID
- `POST /api/scan-repo`: Manual repo scan
- `POST /api/scan-raw`: Manual raw package.json scan
- `GET /api/logs`: Get webhook logs
- `GET /api/status`: System status

### Webhook Handlers
- `POST /api/webhook`: Webhook endpoint (GitHub/Smee)
- `POST /api/webhooks/github`: Alternative webhook endpoint
- `GET /api/webhooks/info`: Webhook status and stats
- `GET /api/webhooks/activity`: Webhook delivery activity
- `POST /api/webhooks/simulate`: Simulate webhook delivery
- `POST /api/webhooks/test-fetch`: On-demand dependency scan

### Server-Sent Events (SSE)
- `GET /api/events`: VulnWatch SSE stream
- `GET /api/webhooks/events`: SecureDevOps SSE stream
