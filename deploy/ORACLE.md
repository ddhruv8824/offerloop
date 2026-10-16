# Deploy Offerloop on Oracle Cloud (free)

One free Oracle virtual server runs everything: the Offerloop app and Caddy, which serves
it over HTTPS with a free certificate. About an hour the first time.

```
browser ──https──► Caddy (:443, certificate) ──► Offerloop app (:3100) ──► /data volume
```

You need: a card for Oracle's identity check (Always Free resources aren't charged), and
on Windows, PowerShell (it has `ssh` built in).

## 1. Create the Oracle account

1. Sign up at <https://www.oracle.com/cloud/free/>.
2. **Home region**: pick the one closest to you (e.g. *India West (Mumbai)* or *India South
   (Hyderabad)*). It can't be changed later, and the free Ampere servers only exist there.

## 2. Create the server

Console → **Compute → Instances → Create instance**.

| Setting | Choose |
|---|---|
| Image | **Canonical Ubuntu 24.04** |
| Shape | **Ampere → VM.Standard.A1.Flex**, **2 OCPUs, 12 GB memory** (the free tier covers up to 4 OCPUs / 24 GB in total) |
| Networking | Create a new virtual cloud network with a **public subnet**, and **assign a public IPv4 address** |
| SSH keys | **Generate a key pair** and download the private key (e.g. `offerloop.key`). Keep it safe — it's the only way in. |
| Boot volume | Default is fine |

Click **Create**. If it says **"Out of capacity"**, pick another *availability domain* on the
same page, or retry later — free Ampere servers are popular.

When it's running, copy its **Public IP address** (e.g. `140.238.1.23`).

## 3. Open ports 80 and 443 in Oracle's network

Instance page → the **subnet** link → **Security Lists** → *Default Security List* →
**Add Ingress Rules**, twice:

| Source CIDR | IP protocol | Destination port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

(Port 22 for SSH is already open.)

## 4. Log in to the server

From your PC (PowerShell or a terminal), in the folder with the key:

```bash
ssh -i offerloop.key ubuntu@140.238.1.23
```

On Windows, if ssh says the key's permissions are too open:
`icacls offerloop.key /inheritance:r /grant:r "$($env:USERNAME):(R)"`. On Mac/Linux:
`chmod 600 offerloop.key`.

Everything below runs **on the server**.

## 5. Open the same ports on the server's own firewall

Oracle's Ubuntu images also block ports inside the server:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 6. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit
```

Log in again (`ssh -i offerloop.key ubuntu@…`) so the group change applies, then check:
`docker run --rm hello-world`.

## 7. Get the code and configure it

```bash
git clone https://github.com/ddhruv8824/offerloop.git
cd offerloop/deploy
cp .env.example .env
openssl rand -hex 32        # copy the output, for INBOX_SECRET
nano .env
```

Fill in (save with Ctrl+O, Enter, exit with Ctrl+X):

```ini
# No domain? Use your IP with dashes + .sslip.io — it works with HTTPS, for free.
DOMAIN=140-238-1-23.sslip.io
PUBLIC_URL=https://140-238-1-23.sslip.io
APP_PASSWORD=a-long-password-only-you-know
INBOX_SECRET=<the openssl output>
```

The other lines (Gmail, AI keys) are optional — see the comments in the file.

Have your own domain? Point an **A record** at the server's IP, then use it for `DOMAIN` and
`PUBLIC_URL` instead.

## 8. Start it

```bash
docker compose up -d --build
```

The first build takes about 5–10 minutes. Watch it with `docker compose logs -f`
(Ctrl+C stops watching, not the app). When Caddy logs `certificate obtained successfully`,
open **https://140-238-1-23.sslip.io**, enter your password, and you're in.

Check that it works end to end:

- **Resume Studio** — add your AI key in AI settings, upload a resume, run one tailoring.
- **Dashboard** — a job search. Some job sites block requests from cloud servers; if the
  feed stays empty, tell me which source failed.

## 9. Gmail → Tracker (optional)

Google Cloud Console → Credentials → your OAuth client → add the redirect URI
`https://140-238-1-23.sslip.io/api/inbox/google/callback`. Put `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` in `deploy/.env`, then `docker compose up -d`.

## Everyday use

| Task | Command (in `~/offerloop/deploy`) |
|---|---|
| Deploy the latest code from GitHub | `./update.sh` |
| See logs | `docker compose logs -f app` |
| Restart | `docker compose restart app` |
| Change a setting | edit `.env`, then `docker compose up -d` |
| Stop everything | `docker compose down` (data is kept) |

The app restarts by itself after a crash or a server reboot.

**Back up your data** (workflows, resumes) to a file, then copy it to your PC:

```bash
docker run --rm -v deploy_offerloop-data:/data -v "$PWD":/backup alpine tar czf /backup/offerloop-data.tgz -C / data
# on your PC:  scp -i offerloop.key ubuntu@140.238.1.23:offerloop/deploy/offerloop-data.tgz .
```

## Good to know

- **Idle servers**: Oracle may reclaim Always Free servers that stay almost idle for a week.
  Converting the account to *Pay As You Go* avoids that; usage within the free limits stays
  free (set a budget alert to be sure).
- **One copy only**: data is stored in files, so run one app container — don't scale it out.
- **Security**: the site password protects everything. Use a long one, and change it in
  `.env` if it leaks (that logs everyone out).
