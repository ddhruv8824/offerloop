# Deploy Offerloop on Azure App Service

Azure **App Service** runs a website for you from a Docker image: you don't manage a server,
Azure keeps it running, restarts it if it crashes, and gives it HTTPS. Offerloop's data and
sign-in stay in **Supabase**, so nothing moves; only the app runs somewhere new.

```
git push → GitHub Actions builds the Docker image → pushes it to ghcr.io
         → tells the Azure web app to run it → https://<your-app>.azurewebsites.net
```

**Cost:** the Basic B1 plan (1 core, 1.75 GB) is about $13 a month. A free Azure account's
$200 credit covers it for its 30 days; after that Azure stops it unless you upgrade to
pay-as-you-go. Set a budget alert (step 7).

**Only one copy at a time:** the scheduler runs inside the app. If Render and Azure both run
against the same database, every workflow runs twice. Suspend Render once Azure works (step 6).

## 1. A GitHub token so Azure can download the image

The image is private (it's your code), so Azure needs read access.

GitHub → your photo → **Settings → Developer settings → Personal access tokens → Tokens
(classic) → Generate new token (classic)**. Note: `azure-pull`, expiry 90 days, scope
**read:packages** only. Copy the token (`ghp_…`).

## 2. Create the web app

Azure portal → **Create a resource → Web App**:

| Field | Value |
| --- | --- |
| Resource group | Create new: `offerloop-rg` |
| Name | e.g. `offerloop-dhruv` |
| Publish | **Container** |
| Operating system | **Linux** |
| Region | **Central India** (or Southeast Asia) |
| Pricing plan | Create new → **Basic B1** |

**Container** tab: leave the sample image for now. **Review + create → Create.** When it's
done, open the app; its address is on **Overview → Default domain**.

## 3. Settings

**Settings → Environment variables → Add** each of these (copy values from Render →
Environment), then **Apply**:

| Name | Value |
| --- | --- |
| `WEBSITES_PORT` | `3100` (the port Offerloop listens on) |
| `NODE_OPTIONS` | `--max-old-space-size=1024` |
| `PUBLIC_URL` | `https://<your Default domain>` |
| `DATABASE_URL` | same as Render |
| `INBOX_SECRET` | **same as Render** (it decrypts saved keys) |
| `CRON_SECRET` | same as Render |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | same as Render |
| `ADMIN_EMAILS`, `SUPPORT_EMAIL` | same as Render |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | same as Render, if you use Gmail |

**Settings → Configuration → General settings:** **Always on: On** (otherwise Azure puts it to
sleep), **SCM Basic Auth Publishing Credentials: On** (needed for step 5), **HTTPS Only: On**.
Save.

**Monitoring → Health check:** on, path `/api/health`. Save.

## 4. Where the image comes from

**Deployment → Deployment Center → Settings:**

- Source: **Container Registry**
- Registry source: **Private** / *Other container registries*
- Server URL: `https://ghcr.io`
- Username: your GitHub username · Password: the token from step 1
- Image and tag: `ddhruv8824/offerloop:latest`
- Continuous deployment: Off

Save.

## 5. Connect GitHub to the web app

1. Azure, web app **Overview → Download publish profile**. A small XML file downloads.
2. GitHub repo → **Settings → Secrets and variables → Actions**:
   - **Secrets → New repository secret:** `AZURE_WEBAPP_PUBLISH_PROFILE` = the whole file's contents.
   - **Variables → New repository variable:** `AZURE_WEBAPP_NAME` = your app's name (`offerloop-dhruv`).
3. GitHub → **Actions → Deploy to Azure → Run workflow**. The first build takes 5–10 minutes.

From now on every push to `main` deploys to Azure (and to Render, until you suspend it).

Check: open `https://<your Default domain>/api/health`. It should answer `{"ok":true,…}`.
If not: web app → **Monitoring → Log stream** shows the app's output.

## 6. Switch over from Render

1. **Supabase → Authentication → URL Configuration:** Site URL = the Azure address; add
   `https://<azure>/auth/callback` to Redirect URLs.
2. **Google Cloud** (if you use Gmail or Google sign-in): add
   `https://<azure>/api/inbox/google/callback` to your OAuth client's redirect URIs.
3. **cron-job.org:** change both jobs to the Azure address (`/api/health` and
   `/api/automations/tick`). With Always On, the health ping is optional.
4. **Your PC:** in `services/job-agent/.env`, set `OFFERLOOP_URL` to the Azure address.
5. **Render → your service → Settings → Suspend.** Now only Azure runs the scheduler.

## 7. Keep the bill in check

**Cost Management → Budgets → Add:** $20 a month, alert at 50% and 100% to your email.

To stop everything: delete the resource group `offerloop-rg` (and resume Render).
