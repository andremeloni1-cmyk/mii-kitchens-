# Deploying the Hub to a Hostinger VPS

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
