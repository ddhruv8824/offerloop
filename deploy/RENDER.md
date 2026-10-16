# Deploy Offerloop on Render

Render builds the repo's Dockerfile and runs it with HTTPS. The settings are in
[`render.yaml`](../render.yaml) at the repo root, so setup is mostly clicking through.

**Cost:** the **Starter** instance (about $7/month) plus a **1 GB disk** (about $0.25/month).
The free instance doesn't fit: it sleeps after 15 minutes idle (automations stop running)
and can't have a disk (saved workflows and resumes would be wiped on every deploy).

## 1. Create the service

1. Sign up at <https://render.com> with your GitHub account, and add a payment card
   (Account settings → Billing).
2. Dashboard → **New → Blueprint** → connect **ddhruv8824/offerloop**.
3. Render reads `render.yaml` and shows one web service, **offerloop** (Starter,
   Singapore, with a disk at `/data`). It asks for values:
   - **APP_PASSWORD**: the site password — make it long. Everyone needs it once per browser.
   - **GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GEMINI_API_KEY**: optional, leave empty for now.
   - `INBOX_SECRET` is generated for you.
4. Click **Apply**. The first build takes about 5–10 minutes (watch the **Logs** tab).

When it's live, the service page shows its address, e.g.
`https://offerloop-xxxx.onrender.com`. Open it, enter your password, and you're in.

## 2. Check it works

- **Resume Studio**: add your AI key in AI settings, upload a resume, run one tailoring.
- **Dashboard**: run a job search. Some job sites block cloud servers; if the feed stays
  empty, check which source failed.
- **Automations**: create a workflow. It keeps running with your browser closed.

## 3. Gmail → Tracker (optional)

1. Google Cloud Console → Credentials → your OAuth client → add the redirect URI
   `https://offerloop-xxxx.onrender.com/api/inbox/google/callback` (your address).
2. Render → offerloop → **Environment** → fill in `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET` → **Save, rebuild, and deploy**.

## Everyday use

| Task | How |
|---|---|
| Deploy new code | Push to `main` — Render deploys it automatically |
| See logs | offerloop → **Logs** |
| Change a setting | offerloop → **Environment** → edit → save (redeploys) |
| Own domain | offerloop → **Settings → Custom Domains** (then set `PUBLIC_URL` to `https://` + it) |
| Restart | **Manual Deploy → Deploy latest commit** |

## Good to know

- **Short downtime on each deploy**: a service with a disk is stopped before the new
  version starts, so expect about a minute offline per deploy.
- **One instance only**: data lives on the disk, which belongs to one instance — don't scale
  the service out.
- **Address**: redirects and the Gmail callback use Render's address automatically
  (`RENDER_EXTERNAL_URL`). With a custom domain, set `PUBLIC_URL` so they use yours instead.
- **Memory**: the app uses about 150 MB of the Starter instance's 512 MB.
- **Region**: Singapore is the closest to India; Render can't move a service to another
  region later.
