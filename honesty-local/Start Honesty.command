#!/bin/bash
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1; then
  exec python3 honesty.py
fi
if command -v python >/dev/null 2>&1; then
  exec python honesty.py
fi
echo "Honesty Local needs Python 3 on this computer."
echo "Install it, then double-click Start Honesty again."
read -r _
