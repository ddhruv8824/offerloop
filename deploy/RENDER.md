# Deploy Offerloop for free: Render + Supabase + cron-job.org

```
your browser ──► Render (free)                ──► Supabase (free Postgres)
                 runs the app                      keeps your data
                        ▲
cron-job.org (free) ────┘ every 10 minutes: keeps the app awake, runs automations
```

- **Render** runs the app. Its free plan has no lasting disk and sleeps after 15 minutes
  idle, so:
- **Supabase** stores the data (resumes, versions, workflows, salary data), and
- **cron-job.org** calls the app every 10 minutes, so it never sleeps and scheduled
  automations run on time.

No card needed. Takes about 20 minutes. Do the steps in order — each one needs something
from the one before.

## 1. Supabase: create the database

1. Go to <https://supabase.com> → **Start your project** → sign in with GitHub.
2. **New project**:
   - Name: `offerloop`
   - Database password: click **Generate a password**, then **copy it somewhere safe** —
     you need it in a minute and Supabase won't show it again.
   - Region: **Southeast Asia (Singapore)** (same region as Render = faster).
   - Plan: **Free**.
3. Wait a minute or two until the project is ready.
4. Click **Connect** (top of the project page) → **Connection String** → pick the
   **Session pooler** connection string, which looks like:

   ```
   postgresql://postgres.abcdefghij:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
   ```

5. Copy it and replace `[YOUR-PASSWORD]` (brackets included) with your database password.
   This full line is your **`DATABASE_URL`**.

> Use the **Session pooler** string, not "Direct connection": the direct one needs IPv6,
> which Render may not have.
>
> If your password contains `@ # / ? : %`, the link breaks. Easiest fix: Project Settings →
> Database → **Reset database password** to one with only letters and numbers.

You don't need to create any tables — Offerloop creates its one table (`offerloop_kv`) on
first start.

## 2. Render: deploy the app

1. Go to <https://render.com> → sign in with GitHub.
2. **New → Blueprint** → connect **ddhruv8824/offerloop**. Render reads `render.yaml` and
   shows one free web service, **offerloop**.
3. Fill in:
   - **APP_PASSWORD**: your site password (you make it up — long, not used anywhere else).
   - **DATABASE_URL**: the line from step 1.
   - Leave the others empty for now.
4. **Apply**. The first build takes about 5–10 minutes (**Logs** tab).
5. When it's live, copy its address, e.g. `https://offerloop-xxxx.onrender.com`.
6. Check it's using the database: open `https://offerloop-xxxx.onrender.com/api/health`.
   It should say `"storage":"database"`. (`"files"` means `DATABASE_URL` is missing.)
7. Open the site, enter your password — you're in.

**If Render asks for a card** or the Blueprint fails, create the service by hand instead:
**New → Web Service** → the repo → Language **Docker**, Region **Singapore**, Instance type
**Free**, Health Check Path `/api/health` → **Environment Variables**:

| Key | Value |
|---|---|
| `APP_PASSWORD` | your site password |
| `DATABASE_URL` | the line from step 1 |
| `INBOX_SECRET` | any long random text (e.g. 40 letters and digits) |
| `CRON_SECRET` | another long random text, different from the one above |
| `NODE_OPTIONS` | `--max-old-space-size=384` |

## 3. cron-job.org: keep it awake

1. In Render → offerloop → **Environment**, copy the value of **`CRON_SECRET`**.
2. Go to <https://cron-job.org> → sign up (free) → **Create cronjob**:
   - Title: `Offerloop`
   - URL: `https://offerloop-xxxx.onrender.com/api/automations/tick` (your address)
   - Schedule: **every 10 minutes**
   - **Advanced** tab:
     - Request method: **POST**
     - Headers: add `Authorization` with value `Bearer <your CRON_SECRET>` (the word
       `Bearer`, a space, then the secret)
3. Save, then **Test run**: it should answer **200** with something like `{"started":[]}`.
   A 401 means the header is wrong; a 404 means `CRON_SECRET` isn't set on Render.

## 4. Check everything

- **Resume Studio**: add your AI key in AI settings, upload a resume, run one tailoring.
- **Dashboard**: run a job search. Some job sites block cloud servers; if the feed stays
  empty, check which source failed.
- **Survives a restart**: Render → **Manual Deploy → Restart service**, then reload —
  your resume and workflows are still there.

## Gmail → Tracker (optional)

1. Google Cloud Console → Credentials → your OAuth client → add the redirect URI
   `https://offerloop-xxxx.onrender.com/api/inbox/google/callback`.
2. Render → offerloop → **Environment** → set `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET` → save (it redeploys).

## Everyday use

| Task | How |
|---|---|
| Deploy new code | Push to `main` — Render deploys it automatically |
| See logs | Render → offerloop → **Logs** |
| Change a setting | Render → offerloop → **Environment** → edit → save |
| See your data | Supabase → **Table Editor** → `offerloop_kv` (one row per saved item) |
| Own domain | Render → **Settings → Custom Domains**, then set `PUBLIC_URL` to `https://` + it |

## Limits of the free plans

- **Render free hours**: enough for one service awake all month. If another free service
  (e.g. an old project) also runs, the hours run out before the month ends — delete what
  you don't use.
- **Deploys** take the site offline for about a minute.
- **Supabase** pauses a free project after about a week with no activity; the 10-minute
  pinger keeps it active. If it ever pauses (pinger stopped), open the Supabase project and
  click **Restore**.
- **Storage**: Supabase's free database (about 500 MB) is far more than Offerloop needs.
- Free-plan limits change — check Render's and Supabase's pricing pages if something stops.
