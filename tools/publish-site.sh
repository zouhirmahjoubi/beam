#!/usr/bin/env bash
# Publishes the built game (no source, no source maps) to the public repo
# zouhirmahjoubi/palmlight, served by GitHub Pages at
# https://zouhirmahjoubi.github.io/palmlight/
# Usage: bash tools/publish-site.sh   (needs gh signed in with push access)
set -euo pipefail
cd "$(dirname "$0")/.."
SOURCE_COMMIT=$(git rev-parse --short HEAD)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

rm -rf dist
NODE_ENV=production npm run build
if find dist -name '*.map' | grep -q .; then
  echo "Refusing to publish: source maps found in dist" >&2
  exit 1
fi

gh repo clone zouhirmahjoubi/palmlight "$WORK/site" -- --quiet
cd "$WORK/site"
git rm -rq --ignore-unmatch assets scenes ui index.html
cp -r "$OLDPWD/dist/." .
find . -path ./.git -prune -o -name AGENTS.md -print -exec rm {} \;
touch .nojekyll
cp "$OLDPWD/tools/site/README.md" README.md
git add .nojekyll README.md index.html assets scenes ui
if git diff --cached --quiet; then
  echo "Nothing changed since the last publish."
  exit 0
fi
git commit -q -m "Palmlight test build from beam $SOURCE_COMMIT"
git push -q origin main
echo "Published beam $SOURCE_COMMIT to https://zouhirmahjoubi.github.io/palmlight/ (live in about a minute)"
