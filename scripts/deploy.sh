#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain -- site)" ]; then
  echo "Modifications non commitées dans site/ : commit d'abord." >&2
  git status --short -- site >&2
  exit 1
fi

git branch -D gh-pages-tmp >/dev/null 2>&1 || true
git subtree split --prefix site -b gh-pages-tmp
git push -f origin gh-pages-tmp:gh-pages
git branch -D gh-pages-tmp
echo "Déployé : https://bubu92i.github.io/nba-draft-tool/"
