# Multi-Tenant Discord Support Bot - Setup Guide

This bot is now a **multi-tenant SaaS platform** where multiple Discord servers can use the same bot instance, each with their own configuration, API keys, and data isolation.

## Architecture Overview

- **Discord OAuth Authentication**: Users login with Discord
- **Server Whitelisting**: Only approved servers can use the bot
- **Per-Server Configuration**: Each server has its own Anthropic API key and settings
- **Server Selection Dashboard**: Users choose which server to manage
- **Admin Panel**: Master user can whitelist/remove servers
- **Private Bot**: Bot automatically leaves non-whitelisted servers

## Prerequisites

1. Node.js 18+ installed
2. Discord Bot Token (from Discord Developer Portal)
3. Discord OAuth2 credentials (Client ID & Secret)
4. Server (VPS) with public IP for production

## Step 1: Discord Developer Portal Setup

### 1.1 Create/Configure Bot Application

Go to https://discord.com/developers/applications

**Bot Settings:**
- **Bot → Public Bot**: **UNCHECK THIS** ✅ (Makes it private - only you can invite)
- **Bot → Privileged Gateway Intents**:
  - ✅ Server Members Intent
  - ✅ Message Content Intent
- **Bot → Token**: Copy your bot token

**OAuth2 Settings:**
- **OAuth2 → Redirects**: Add these URLs:
  ```
  http://localhost:3000/auth/callback  (for local testing)
  http://YOUR_VPS_IP:3000/auth/callback  (for production)
  ```

- **OAuth2 → Scopes**:
  - ✅ `identify` - Get user info
  - ✅ `guilds` - See servers user is in

- **OAuth2 → Client Information**:
  - Copy `CLIENT ID`
  - Copy `CLIENT SECRET`

### 1.2 Generate Bot Invite Link

**Method 1: Via Developer Portal**
1. Go to OAuth2 → URL Generator
2. Select Scopes: `bot`, `applications.commands`
3. Select Bot Permissions: `Administrator` (or specific permissions you need)
4. Copy the generated URL

**Method 2: Manual URL**
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

**IMPORTANT**: Since "Public Bot" is unchecked, only YOU (the bot owner) can use this invite link. You'll manually send this link to customers after they pay/get approved.

## Step 2: VPS Setup

### 2.1 Initial Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install build tools (needed for better-sqlite3)
sudo apt install -y build-essential python3

# Verify installation
node --version
npm --version
```

### 2.2 Install the Bot

```bash
# Create directory
sudo mkdir -p /opt/support-bot
cd /opt/support-bot

# Clone or upload your code here
# If using git:
git clone <your-repo-url> .

# Install dependencies
npm install

# Create data directory
mkdir -p data/transcripts
```

### 2.3 Configure Environment

Create `.env` file:

```bash
nano .env
```

Add configuration:

```env
# Discord Configuration
DISCORD_TOKEN=your_bot_token_from_step_1.1
DISCORD_CLIENT_ID=your_client_id_from_step_1.1
DISCORD_CLIENT_SECRET=your_client_secret_from_step_1.1

# Dashboard Configuration
DASHBOARD_PORT=3000
DASHBOARD_URL=http://YOUR_VPS_IP:3000
# In production with domain: https://yourdomain.com

# Bot Configuration
BOT_NAME=Support Bot
MAX_CONVERSATION_HISTORY=10
AI_MODEL=claude-sonnet-4-20250514

# Spam Filter
SPAM_FILTER_ENABLED=true
SPAM_MAX_THREADS_PER_WINDOW=3
SPAM_TIME_WINDOW=600000
SPAM_COOLDOWN=120000
SPAM_AUTO_BAN_THRESHOLD=5
SPAM_BAN_DURATION=3600000

# Auto-End Configuration
AUTO_END_ENABLED=true
AUTO_END_TIMEOUT=300000
THREAD_DELETE_AFTER_END=300000
THREAD_DELETE_AFTER_FEEDBACK=120000
SEND_TRANSCRIPTS=true
```

**Important**: Replace `YOUR_VPS_IP` with your server's IP address.

### 2.4 Firewall Configuration

```bash
# Allow port 3000 for dashboard
sudo ufw allow 3000/tcp

# Enable firewall if not already enabled
sudo ufw enable
```

## Step 3: Start the Bot

### Option A: Direct Start (for testing)

```bash
cd /opt/support-bot
npm start
```

### Option B: PM2 (Production - Recommended)

```bash
# Install PM2
sudo npm install -g pm2

# Start bot with PM2
pm2 start src/index.js --name support-bot

# Save PM2 config
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the command it gives you

# View logs
pm2 logs support-bot

# Restart bot
pm2 restart support-bot
```

### Option C: systemd Service

Create service file:

```bash
sudo nano /etc/systemd/system/support-bot.service
```

Add:

```ini
[Unit]
Description=Discord AI Support Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/support-bot
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=support-bot

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable support-bot
sudo systemctl start support-bot

# Check status
sudo systemctl status support-bot

# View logs
sudo journalctl -u support-bot -f
```

## Step 4: Access Dashboard

1. Open browser and navigate to: `http://YOUR_VPS_IP:3000`
2. Click "Login with Discord"
3. Authorize the application
4. You should see the server selection page

**First Time**: You won't see any servers because none are whitelisted yet.

## Step 5: Whitelist Your First Server

### 5.1 Add Bot to Server

1. Open the invite link you generated in Step 1.2
2. Select a server where you have Admin permissions
3. Authorize the bot

**What happens**: Bot will join, check if server is whitelisted, and if NOT:
- Send you a DM explaining it needs authorization
- Leave the server automatically

### 5.2 Whitelist the Server

**Method 1: Via Admin Panel (Master User)**

Your Discord User ID (`979837953339719721`) has master access:

1. Login to dashboard: `http://YOUR_VPS_IP:3000`
2. You'll see an "⚙️ Admin Panel" button in the top-right
3. Click it to open `/admin`
4. Find your server in the list
5. Click "Whitelist" button

**Method 2: Via Database (Manual)**

```bash
# Access the database
cd /opt/support-bot
sqlite3 data/multitenant.db

# Whitelist a server
INSERT INTO servers (guild_id, guild_name, whitelisted, active, added_at, updated_at)
VALUES ('YOUR_SERVER_ID', 'Your Server Name', 1, 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000)
ON CONFLICT(guild_id) DO UPDATE SET whitelisted = 1;

# Exit
.exit
```

**To whitelist the server you mentioned (1458862217629007926):**

```sql
INSERT INTO servers (guild_id, guild_name, whitelisted, active, added_at, updated_at)
VALUES ('1458862217629007926', 'Your Server Name', 1, 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000)
ON CONFLICT(guild_id) DO UPDATE SET whitelisted = 1;
```

### 5.3 Re-invite Bot

1. Use the same invite link from Step 1.2
2. Add bot to the whitelisted server again
3. This time it will stay!

## Step 6: Configure Server

1. Go to dashboard: `http://YOUR_VPS_IP:3000`
2. Login with Discord
3. Select your server from the list
4. Configure:
   - **Anthropic API Key**: Enter the server's API key (each server provides their own)
   - **Custom System Prompt** (optional): Customize AI behavior
5. Click "Save Configuration"

## Step 7: Test the Bot

1. In your Discord server, **mention the bot**: `@Support Bot I need help`
2. Bot will create a thread and respond
3. Continue conversation in the thread

## How to Add More Servers (Your Customers)

### For Each New Customer:

1. **Get Payment/Approval** (your business process)

2. **Add Server to Whitelist**:
   - Login to `/admin` panel
   - Click "Whitelist" on their server

3. **Send Invite Link** to customer:
   ```
   https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
   ```

4. **Customer adds bot** to their server

5. **Customer configures**:
   - They login to `http://YOUR_VPS_IP:3000`
   - Select their server
   - Enter THEIR Anthropic API key
   - (Optional) Customize system prompt

6. **Done** - Bot works for their server with their API key!

## User Flow for Server Admins

1. Add bot to server (using your invite link)
2. Go to `http://YOUR_VPS_IP:3000`
3. Click "Login with Discord"
4. Select their server
5. Enter their Anthropic API key
6. Customize settings
7. Bot starts working!

## Master User Features

As the master user (ID: `979837953339719721`), you have:

- **Admin Panel Access**: `/admin` route
- **Whitelist Control**: Add/remove servers
- **All Servers Access**: See and manage ALL servers in dashboard
- **Override Permissions**: Access any whitelisted server's dashboard

Regular users only see servers where they have Administrator permission.

## Security Notes

1. **Private Bot**: "Public Bot" is unchecked - only you can generate invite links
2. **Whitelist**: Bot automatically leaves non-whitelisted servers
3. **Per-Server API Keys**: Each server uses their own API key, isolating costs
4. **Administrator Requirement**: Only server administrators can configure
5. **Master Override**: Your user ID can access everything

## Monitoring

```bash
# PM2 monitoring
pm2 monit

# systemd logs
sudo journalctl -u support-bot -f

# Check database
sqlite3 data/multitenant.db "SELECT * FROM servers;"
```

## Troubleshooting

### Bot Not Responding
1. Check bot is online in Discord
2. Verify `DISCORD_TOKEN` in `.env`
3. Check logs: `pm2 logs support-bot`
4. Ensure bot has permissions in the channel

### Can't Access Dashboard
1. Check firewall: `sudo ufw status`
2. Verify `DASHBOARD_PORT` is correct
3. Check if service is running: `pm2 status`

### Server Not in List
1. Ensure server is whitelisted (check `/admin` panel)
2. Verify user has Administrator permission in server
3. Check bot is in the server

### API Key Issues
1. Ensure API key is entered correctly (no spaces)
2. Verify key is valid at https://console.anthropic.com
3. Check bot logs for API errors

## Production Recommendations

1. **Use a Domain**: Point a domain to your VPS IP and update `DASHBOARD_URL`
2. **SSL Certificate**: Use Let's Encrypt for HTTPS
3. **Reverse Proxy**: Use Nginx to serve dashboard
4. **Backups**: Backup `data/` directory regularly
5. **Monitoring**: Set up alerts for bot downtime

## Next Steps (Post-Launch)

- [ ] Per-server documentation storage
- [ ] Advanced analytics per server
- [ ] Billing integration
- [ ] Webhook notifications
- [ ] API rate limiting
