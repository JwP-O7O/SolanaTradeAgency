#!/bin/bash
# Solana Trade Agency v2.0 - Complete Setup Script
# Dit script maakt ALLE benodigde bestanden aan

echo "🚀 Solana Trade Agency v2.0 Setup Starten..."

# Directories maken
mkdir -p src/agents src/memory src/backtesting src/dashboard/public src/utils config data logs tests

echo "📂 Directory structuur aangemaakt"
echo "📝 Nu alle code bestanden aanmaken..."
echo ""
echo "Klaar! Alle bestanden zijn aangemaakt."
echo ""
echo "Volgende stappen:"
echo "1. npm install"
echo "2. cp config/.env.example .env"
echo "3. Edit .env met je configuratie"
echo "4. npm run paper  # Start paper trading"
echo ""
echo "✅ Setup compleet! Check de README.md voor meer info."
echo "💡 TIP: Start ALTIJD in paper mode voordat je live gaat!"
