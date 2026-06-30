# Deploying the Hub

Two paths — pick the one that matches your Hostinger plan:

- **Option A — Managed Git import (no terminal).** Hostinger scans the repo for
  `package.json`, runs `npm install`, and starts the app for you. Use this if you
  don't have SSH. See ["Option A"](#option-a--managed-git-import-no-shell) below.
- **Option B — VPS with SSH.** Full control: Node + MySQL + nginx + certbot under
  systemd. See ["Option B"](#option-b--hostinger-vps-ssh) below.

---

## Option A — Managed Git import (no shell)

The app is built to deploy with **no terminal access**: it can create its own
tables on boot and lets you set the first password from the browser.

1. **Create a MySQL database** in hPanel (note the host, db name, user, password).
2. **Import the repo** in the Node.js / Git deployment screen:
   - Repository: `andremeloni1-cmyk/mii-kitchens-`, branch `main`.
   - Framework: **Express** (auto-detected). Start command **`npm start`**
     (runs the root `index.js`, which boots the server). Node version: 20+.
3. **Set environment variables** (from `.env.sample`):
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` — your MySQL.
   - `SESSION_SECRET`, `SYNC_SECRET` — long random strings.
   - `COOKIE_SECURE=1` (Hostinger serves over HTTPS).
   - `AUTO_MIGRATE=1` — creates/upgrades the tables on first boot.
   - `SETUP_TOKEN=<long-random>` — temporarily, to enable the setup page.
   - (`PORT` is injected by Hostinger; the app reads it automatically.)
4. **Deploy.** On boot the app applies `db/schema.sql` (idempotent) and seeds the
   sample team.
5. **Set the admin password:** open `https://your-app/setup.html`, enter the
   `SETUP_TOKEN`, the admin email (`andre@miikitchen.com.au` by default), and a
   password. Then **remove `SETUP_TOKEN`** from the env and redeploy.
6. **Sign in** at `https://your-app/login.html`. Set up the calendar sync per
   `apps-script/SETUP.md` (`API_BASE_URL` = your app URL).

To update later: push to `main` and let Hostinger redeploy. `AUTO_MIGRATE=1`
applies any new tables/columns automatically.

---

## Option B — Hostinger VPS (SSH)

Target: a Hostinger VPS (Ubuntu) running the Node app behind nginx, with MySQL
for storage and a Let's Encrypt TLS cert. ~30 minutes start to finish.

## 1. System packages

```bash
sudo apt update
sudo apt install -y nginx mysql-server
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

## 2. Database

```bash
sudo mysql -e "CREATE DATABASE IF NOT EXISTS mii_hub CHARACTER SET utf8mb4;"
sudo mysql -e "CREATE USER IF NOT EXISTS 'mii_hub'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD';"
sudo mysql -e "GRANT ALL PRIVILEGES ON mii_hub.* TO 'mii_hub'@'localhost'; FLUSH PRIVILEGES;"
sudo mysql mii_hub < db/schema.sql
```

## 3. App

```bash
sudo useradd -r -m -d /opt/mii-kitchens-hub mii || true
sudo git clone https://github.com/andremeloni1-cmyk/mii-kitchens-.git /opt/mii-kitchens-hub
cd /opt/mii-kitchens-hub
sudo npm ci --omit=dev
sudo cp .env.sample .env
sudo nano .env          # set DB_PASSWORD, SESSION_SECRET, SYNC_SECRET, COOKIE_SECURE=1
sudo chown -R mii:mii /opt/mii-kitchens-hub
```

Give the admin a password (and any teammates):

```bash
sudo -u mii node scripts/setpw.js andre@miikitchen.com.au 'a-strong-password'
```

## 4. Run under systemd

```bash
sudo cp deploy/mii-hub.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mii-hub
sudo systemctl status mii-hub          # confirm "active (running)"
```

## 5. nginx + TLS

```bash
sudo cp deploy/nginx.conf.sample /etc/nginx/sites-available/mii-hub
sudo nano /etc/nginx/sites-available/mii-hub      # set your server_name
sudo ln -s /etc/nginx/sites-available/mii-hub /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d hub.miikitchens.com
```

## 6. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'   # 80 + 443
sudo ufw enable
```

## 7. Calendar sync

Set up the Apps Script (see `apps-script/SETUP.md`) with `API_BASE_URL` pointing
at your domain and `SYNC_SECRET` matching `.env`. Run `setupTriggers` once.

## Updating later

```bash
cd /opt/mii-kitchens-hub
sudo -u mii git pull
sudo -u mii npm ci --omit=dev
sudo mysql mii_hub < db/schema.sql     # idempotent — applies any new tables
sudo systemctl restart mii-hub
```
