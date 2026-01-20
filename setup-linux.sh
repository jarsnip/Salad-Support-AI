#!/bin/bash

# AI Support Bot - Linux Setup Script
# This script automates the setup process for Linux systems

set -e  # Exit on error

echo "================================================"
echo "  AI Support Bot - Linux Setup"
echo "================================================"
echo ""

# Check for Node.js
echo "🔍 Checking for Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo ""
    echo "Please install Node.js 18+ first:"
    echo "  Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
    echo "  CentOS/RHEL:   curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - && sudo yum install -y nodejs"
    echo "  Arch:          sudo pacman -S nodejs npm"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "✅ Node.js found: $NODE_VERSION"
echo ""

# Check Node version (should be 18+)
NODE_MAJOR=$(node --version | cut -d'.' -f1 | sed 's/v//')
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "⚠️  Warning: Node.js version 18+ is recommended. You have v$NODE_MAJOR"
    echo ""
fi

# Install dependencies
echo "📦 Installing npm dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Copy .env.example to .env if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ .env file created"
    echo ""
    echo "⚠️  IMPORTANT: Edit .env and fill in your credentials:"
    echo "   - DISCORD_TOKEN"
    echo "   - DISCORD_CLIENT_ID"
    echo "   - GUILD_ID"
    echo "   - SUPPORT_CHANNEL_ID"
    echo "   - ANTHROPIC_API_KEY"
    echo ""
else
    echo "ℹ️  .env file already exists, skipping..."
    echo ""
fi

# Create data directory if it doesn't exist
if [ ! -d data ]; then
    echo "📁 Creating data directory..."
    mkdir -p data
    echo "✅ Data directory created"
    echo ""
else
    echo "ℹ️  Data directory already exists"
    echo ""
fi

# Create docs directory if it doesn't exist
if [ ! -d docs ]; then
    echo "📚 Creating docs directory..."
    mkdir -p docs
    echo "✅ Docs directory created"
    echo ""
    echo "⚠️  Add your support documentation (.md files) to the docs/ folder"
    echo ""
else
    echo "ℹ️  Docs directory already exists"
    echo ""
fi

echo "================================================"
echo "  Setup Complete!"
echo "================================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Edit .env and fill in your credentials:"
echo "   nano .env"
echo ""
echo "2. Add documentation to docs/ folder"
echo ""
echo "3. Register Discord slash commands:"
echo "   npm run register-commands"
echo ""
echo "4. Start the bot:"
echo "   npm start"
echo ""
echo "5. Access the dashboard at:"
echo "   http://localhost:3000"
echo ""
echo "================================================"
echo ""
echo "For production deployment with auto-restart:"
echo "  - Use PM2: npm install -g pm2 && pm2 start src/index.js --name salad-bot"
echo "  - Use systemd: See DEPLOYMENT.md for systemd service setup"
echo ""
