# NBA Draft Tool

Aide à la draft fantasy NBA (tablette, draft Sleeper du 19 octobre 2026, 21h00 Paris).

- Outil : https://bubu92i.github.io/nba-draft-tool/
- Secours (top 50 statique) : https://bubu92i.github.io/nba-draft-tool/top50.html

## Commandes

```
npm test                 # tests
npm run build            # régénère site/data/snapshot.json (blessures fraîches)
scripts/deploy.sh        # publie site/ sur GitHub Pages (branche gh-pages)
```

Simulation locale avec le faux serveur Sleeper :

```
node scripts/mock-sleeper.mjs --mode=scenario2026 --my-slot=7
python3 -m http.server 8080 -d site
# ouvrir http://localhost:8080/?api=http://localhost:8787
```

## Check-list jour J

1. Lundi vers 18h :
   - `npm run build` (blessures fraîches). Si ça échoue (réseau), garder le snapshot actuel, déjà en ligne, et passer à la suite.
   - `npm test`
   - `git add site data && git commit -m "data: refresh snapshot" && git push`
   - `scripts/deploy.sh` (Pages peut prendre ~1 min)
   - vérifier : `curl -s https://bubu92i.github.io/nba-draft-tool/data/snapshot.json | head -c 120` affiche le nouveau `generatedAt`
2. 20h45 : ouvrir l'URL sur la tablette, écran allumé en permanence. Recharger la page sur la tablette et vérifier l'heure « mis à jour à … ».
3. Si l'outil plante : `top50.html`
