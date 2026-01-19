# Linux Deployment Guide

This guide covers deploying the Salad Support AI bot on a Linux server for production use.

## Quick Start

```bash
# 1. Make setup script executable and run it
chmod +x setup-linux.sh
./setup-linux.sh

# 2. Configure your credentials
nano .env

# 3. Add documentation files
# Upload your .md files to docs/

# 4. Register Discord commands
npm run register-commands

# 5. Start the bot
npm start
```

## System Requirements

### Minimum
- **OS**: Any modern Linux distribution (Ubuntu 20.04+, Debian 11+, CentOS 8+, etc.)
- **CPU**: 1 vCPU
- **RAM**: 512 MB
- **Disk**: 1 GB
- **Network**: 1 Mbps

### Recommended
- **OS**: Ubuntu 22.04 LTS or Debian 12
- **CPU**: 1 vCPU (dedicated)
- **RAM**: 1 GB
- **Disk**: 5 GB
- **Network**: 5 Mbps

## Prerequisites

### 1. Install Node.js 20.x

**Ubuntu/Debian:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**CentOS/RHEL/Rocky Linux:**
```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

**Arch Linux:**
```bash
sudo pacman -S nodejs npm
```

Verify installation:
```bash
node --version  # Should be v20.x.x or v18.x.x+
npm --version   # Should be 9.x.x+
```

### 2. Install Git (if cloning from repository)

```bash
# Ubuntu/Debian
sudo apt-get install git

# CentOS/RHEL
sudo yum install git

# Arch
sudo pacman -S git
```

### 3. Create dedicated user (recommended for production)

```bash
sudo useradd -r -s /bin/bash -d /opt/salad-bot salad
sudo mkdir -p /opt/salad-bot
sudo chown salad:salad /opt/salad-bot
```

## Installation

### Option 1: Clone from Git Repository

```bash
cd /opt/salad-bot
sudo -u salad git clone <your-repo-url> .
sudo -u salad ./setup-linux.sh
```

### Option 2: Upload Files Manually

```bash
# Upload your files via SCP/SFTP to /opt/salad-bot/
cd /opt/salad-bot
sudo chown -R salad:salad .
sudo -u salad ./setup-linux.sh
```

## Configuration

### 1. Environment Variables

Edit `.env`:
```bash
sudo -u salad nano /opt/salad-bot/.env
```

Required variables:
```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
GUILD_ID=your_server_id_here
SUPPORT_CHANNEL_ID=your_channel_id_here
ANTHROPIC_API_KEY=your_api_key_here
```

### 2. Documentation

Upload your `.md` documentation files:
```bash
sudo -u salad mkdir -p /opt/salad-bot/docs
sudo -u salad cp your-docs/*.md /opt/salad-bot/docs/
```

### 3. Register Discord Commands

```bash
cd /opt/salad-bot
sudo -u salad npm run register-commands
```

## Running the Bot

### Method 1: systemd (Recommended for Production)

**1. Create systemd service:**

Edit `salad-bot.service`:
```bash
sudo nano /opt/salad-bot/salad-bot.service
```

Update these fields:
- `User=salad` (your dedicated user)
- `WorkingDirectory=/opt/salad-bot` (your install path)
- `EnvironmentFile=/opt/salad-bot/.env` (your .env path)
- `ReadWritePaths=/opt/salad-bot/data` (your data path)

**2. Create log directory:**
```bash
sudo mkdir -p /var/log/salad-bot
sudo chown salad:salad /var/log/salad-bot
```

**3. Install and enable service:**
```bash
sudo cp /opt/salad-bot/salad-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable salad-bot
sudo systemctl start salad-bot
```

**4. Check status:**
```bash
sudo systemctl status salad-bot
```

**5. View logs:**
```bash
# Real-time logs
sudo journalctl -u salad-bot -f

# Recent logs
sudo journalctl -u salad-bot -n 100

# Log files
sudo tail -f /var/log/salad-bot/output.log
sudo tail -f /var/log/salad-bot/error.log
```

**6. Control service:**
```bash
sudo systemctl stop salad-bot     # Stop
sudo systemctl start salad-bot    # Start
sudo systemctl restart salad-bot  # Restart
sudo systemctl disable salad-bot  # Disable auto-start
```

### Method 2: PM2 (Alternative)

**1. Install PM2:**
```bash
sudo npm install -g pm2
```

**2. Start bot:**
```bash
cd /opt/salad-bot
sudo -u salad pm2 start src/index.js --name salad-bot
```

**3. Setup auto-start:**
```bash
sudo -u salad pm2 startup
sudo -u salad pm2 save
```

**4. Monitor:**
```bash
pm2 status
pm2 logs salad-bot
pm2 monit
```

**5. Control:**
```bash
pm2 restart salad-bot
pm2 stop salad-bot
pm2 delete salad-bot
```

### Method 3: Screen/Tmux (Development Only)

**Using screen:**
```bash
screen -S salad-bot
cd /opt/salad-bot
npm start

# Detach: Ctrl+A then D
# Reattach: screen -r salad-bot
```

**Using tmux:**
```bash
tmux new -s salad-bot
cd /opt/salad-bot
npm start

# Detach: Ctrl+B then D
# Reattach: tmux attach -t salad-bot
```

## Firewall Configuration

If you want to access the dashboard remotely:

**UFW (Ubuntu/Debian):**
```bash
sudo ufw allow 3000/tcp
sudo ufw enable
```

**firewalld (CentOS/RHEL):**
```bash
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

**iptables:**
```bash
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

## Nginx Reverse Proxy (Optional)

To access dashboard via domain name with SSL:

**1. Install Nginx:**
```bash
sudo apt-get install nginx  # Ubuntu/Debian
sudo yum install nginx      # CentOS/RHEL
```

**2. Create config:**
```bash
sudo nano /etc/nginx/sites-available/salad-dashboard
```

Add:
```nginx
server {
    listen 80;
    server_name dashboard.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**3. Enable site:**
```bash
sudo ln -s /etc/nginx/sites-available/salad-dashboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**4. Add SSL with Certbot:**
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d dashboard.yourdomain.com
```

## Monitoring

### Check Bot Status

```bash
# If using systemd
sudo systemctl status salad-bot

# If using PM2
pm2 status salad-bot
```

### View Logs

```bash
# systemd
sudo journalctl -u salad-bot -f

# PM2
pm2 logs salad-bot

# Direct log files (if configured)
tail -f /var/log/salad-bot/output.log
```

### Web Dashboard

Access at: `http://your-server-ip:3000`

Features:
- Real-time conversation monitoring
- Error tracking
- Spam detection logs
- User feedback analytics
- Configuration management

## Updating

### Manual Update

```bash
cd /opt/salad-bot
sudo -u salad git pull  # If using git
sudo -u salad npm install  # Update dependencies
sudo systemctl restart salad-bot  # Restart service
```

### Automated Updates (optional)

Create update script `/opt/salad-bot/update.sh`:
```bash
#!/bin/bash
cd /opt/salad-bot
git pull
npm install
systemctl restart salad-bot
```

Schedule with cron:
```bash
sudo crontab -e
# Add: 0 3 * * * /opt/salad-bot/update.sh >> /var/log/salad-bot/update.log 2>&1
```

## Backup

### Automated Backup Script

Create `/opt/salad-bot/backup.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/backup/salad-bot"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup data and config
tar -czf $BACKUP_DIR/salad-bot-$DATE.tar.gz \
    -C /opt/salad-bot \
    data/ \
    docs/ \
    .env

# Keep only last 7 backups
find $BACKUP_DIR -name "salad-bot-*.tar.gz" -mtime +7 -delete
```

Schedule daily:
```bash
sudo chmod +x /opt/salad-bot/backup.sh
sudo crontab -e
# Add: 0 2 * * * /opt/salad-bot/backup.sh
```

### Restore from Backup

```bash
cd /opt/salad-bot
sudo systemctl stop salad-bot
sudo -u salad tar -xzf /backup/salad-bot/salad-bot-YYYYMMDD_HHMMSS.tar.gz
sudo systemctl start salad-bot
```

## Troubleshooting

### Bot won't start

```bash
# Check logs
sudo journalctl -u salad-bot -n 50

# Check permissions
ls -la /opt/salad-bot/

# Check Node.js
node --version

# Test manually
cd /opt/salad-bot
sudo -u salad npm start
```

### Dashboard not accessible

```bash
# Check if port is open
sudo netstat -tlnp | grep 3000

# Check firewall
sudo ufw status
sudo firewall-cmd --list-ports

# Check nginx (if using)
sudo nginx -t
sudo systemctl status nginx
```

### High memory usage

```bash
# Check memory
free -h
ps aux | grep node

# Restart bot
sudo systemctl restart salad-bot
```

### Permission errors

```bash
# Fix ownership
sudo chown -R salad:salad /opt/salad-bot

# Fix data directory permissions
sudo chmod 755 /opt/salad-bot/data
```

## Security Best Practices

1. **Run as non-root user** (created `salad` user above)
2. **Restrict file permissions**:
   ```bash
   chmod 600 /opt/salad-bot/.env
   chmod 755 /opt/salad-bot/data
   ```
3. **Keep Node.js updated**: `sudo npm install -g n && sudo n lts`
4. **Use firewall**: Only expose necessary ports
5. **Regular backups**: Automate with cron
6. **Monitor logs**: Check for suspicious activity
7. **SSL for dashboard**: Use Nginx + Certbot
8. **Environment file security**: Never commit `.env` to git

## Performance Tuning

### For High Traffic Servers

Edit `.env`:
```env
# Increase conversation history limit
MAX_CONVERSATION_HISTORY=20

# Adjust spam filter
SPAM_MAX_THREADS_PER_WINDOW=5
SPAM_TIME_WINDOW=300000
```

### Systemd Resource Limits

Edit `/etc/systemd/system/salad-bot.service`:
```ini
[Service]
MemoryLimit=1G
CPUQuota=100%
```

## Support

- Check README.md for detailed feature documentation
- View logs for error messages
- Check Discord Developer Portal for bot status
- Verify Anthropic API quotas

---

## Quick Reference

```bash
# Start/Stop/Restart
sudo systemctl start salad-bot
sudo systemctl stop salad-bot
sudo systemctl restart salad-bot

# View logs
sudo journalctl -u salad-bot -f

# Update
cd /opt/salad-bot && git pull && npm install && sudo systemctl restart salad-bot

# Backup
tar -czf backup.tar.gz data/ docs/ .env

# Dashboard
http://localhost:3000
```
