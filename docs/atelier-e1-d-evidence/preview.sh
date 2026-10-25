#!/bin/bash
# Aperçu inspectable: sert le dépôt en local et capture preview.html avec Chrome headless.
set -e; PORT=${PORT:-8765}
python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 & S=$!; trap "kill $S" EXIT; sleep 1
google-chrome --headless=new --no-sandbox --disable-gpu --window-size=900,900 --virtual-time-budget=3000 --screenshot=.atelier-preview.png http://127.0.0.1:$PORT/preview.html 2>/dev/null
google-chrome --headless=new --no-sandbox --disable-gpu --virtual-time-budget=3000 --dump-dom http://127.0.0.1:$PORT/preview.html 2>/dev/null | grep -o '<output[^>]*>.*</output>' | head -3
ls -l .atelier-preview.png
