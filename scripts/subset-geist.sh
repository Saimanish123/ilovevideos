#!/usr/bin/env bash
# Latin subset of Geist Sans for the first paint (ADR-0029/0031: the full variable font is 70 KB and
# sat on the LCP path). Characters outside the subset fall back to the system sans. Geist is OFL 1.1
# with no Reserved Font Name, so a subset may keep its name. Needs fonttools + brotli:
#   python3 -m venv .venv-fonts && .venv-fonts/bin/pip install fonttools brotli
set -euo pipefail
PYFTSUBSET="${PYFTSUBSET:-pyftsubset}"
UNICODES="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2190-2199,U+2212,U+2215,U+2248,U+2260,U+2264-2265,U+2318,U+2713,U+FEFF,U+FFFD"
"$PYFTSUBSET" node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2 \
  --unicodes="$UNICODES" --layout-features='*' --flavor=woff2 \
  --output-file=src/fonts/Geist-Latin.woff2
cp node_modules/geist/LICENSE.txt src/fonts/OFL.txt
echo "src/fonts/Geist-Latin.woff2: $(wc -c < src/fonts/Geist-Latin.woff2) bytes"
