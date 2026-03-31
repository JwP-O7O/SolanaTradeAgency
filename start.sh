#!/bin/bash

# One-command start script voor JwP Solana Trading Agency
# Dit script runt automatisch setup en start de trading agency

set -e  # Stop bij eerste fout

echo "🚀 JwP Solana Trading Agency - Quick Start"
echo "==========================================\n"

# Check of setup al gedraaid is
if [ ! -d "node_modules" ] || [ ! -f ".env" ]; then
    echo "🔧 Eerste keer opstarten - running setup...\n"
    bash setup.sh
    
    if [ $? -ne 0 ]; then
        echo "\n❌ Setup gefaald. Los de errors op en probeer opnieuw."
        exit 1
    fi
else
    echo "✅ Setup al voltooid, starten agency...\n"
fi

# Check of .env correct is ingevuld
if grep -q "your-" .env; then
    echo "⚠️  Waarschuwing: .env bevat nog placeholder waarden!"
    echo "Bewerk .env en vul je echte credentials in voordat je live gaat.\n"
    echo "Wil je de demo modus runnen? (j/n)"
    read -r response
    if [[ "$response" =~ ^[Jj]$ ]]; then
        echo "\n🎮 Starting demo mode...\n"
        npm run demo
        exit 0
    else
        echo "\n🚫 Gestopt. Vul eerst .env in."
        exit 1
    fi
fi

# Start de trading agency
echo "🔄 Starting JwP Solana Trading Agency...\n"
npm start
