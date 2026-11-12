#!/usr/bin/env bash
# Gera doc/main.pdf a partir de doc/main.md (pandoc -> HTML -> PDF via Edge/Chrome headless)
set -e
cd "$(dirname "$0")/.."

PANDOC="${PANDOC:-/c/Users/ICARO/AppData/Local/Pandoc/pandoc.exe}"
BROWSER="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
[ -x "$BROWSER" ] || BROWSER="/c/Program Files/Google/Chrome/Application/chrome.exe"

"$PANDOC" main.md -f markdown -t html5 -s \
  --embed-resources \
  --css build/abnt.css \
  --lua-filter build/abnt.lua \
  --toc --toc-depth=3 \
  --metadata title="TCC" --metadata pagetitle="TCC - Ícaro Aurich" \
  --metadata lang=pt-BR \
  --variable toc-title="Sumário" \
  -o build/main.html

# Remove o título automático do pandoc (o TCC tem capa própria)
sed -i 's#<header id="title-block-header">.*</header>##; /<header id="title-block-header">/,/<\/header>/d' build/main.html

# Move o sumário para depois do resumo/abstract (antes da Introdução), como pede a ABNT
python - build/main.html <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
m = re.search(r'<nav id="TOC".*?</nav>\s*', s, re.S)
if m:
    nav = m.group(0)
    s = s[:m.start()] + s[m.end():]
    nav = nav.replace('<h2 id="toc-title">', '<div class="toc-titulo" id="toc-title">', 1).replace('</h2>', '</div>', 1)
    i = s.find('<h1')
    s = s[:i] + nav + s[i:]
open(p, "w", encoding="utf-8").write(s)
PY

HTML_URL="file:///$(cd build && pwd -W)/main.html"
OUT="$(pwd -W)/main.pdf"
"$BROWSER" --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$OUT" "$HTML_URL" 2>/dev/null

echo "PDF gerado: $OUT"
