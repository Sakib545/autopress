#!/usr/bin/env bash
# Stops the three background processes started by start-all.sh.
pkill -f "python3 main.py" 2>/dev/null && echo "stopped MoneyPrinterTurbo" || echo "MoneyPrinterTurbo not running"
pkill -f "tsx watch worker/index.ts" 2>/dev/null; pkill -f "tsx worker/index.ts" 2>/dev/null
echo "stopped worker"
pkill -f "next dev" 2>/dev/null && echo "stopped dev server" || echo "dev server not running"
