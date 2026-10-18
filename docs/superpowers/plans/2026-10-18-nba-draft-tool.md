# Outil de draft NBA (Sleeper) — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une page web statique, ouverte sur tablette, qui suit en direct la draft Sleeper « And1 » (19/10/2026, 21h Paris) et recommande à BahBubu quel joueur prendre, avec explication et badges blessure / disponibilité.

**Architecture:** Un script Node (`scripts/build-snapshot.mjs`) télécharge les données Sleeper, calcule la valeur de chaque joueur et écrit `site/data/snapshot.json`. Le site (`site/`, HTML + modules ES sans build) charge ce snapshot et interroge directement l'API Sleeper (CORS ouvert) toutes les 2,5 s pour les picks. Toute la logique métier est dans `site/lib/*.js`, des modules ES purs partagés par le navigateur, le script de build et les tests.

**Tech Stack:** Node 24 (fetch natif, `node:test`, `node:assert`), JavaScript ES modules vanilla, HTML/CSS. **Aucune dépendance npm** à l'exécution ; Playwright uniquement pour la vérification finale. Hébergement : GitHub Pages (branche `gh-pages`), dépôt public `Bubu92i/nba-draft-tool`.

**Spec:** `docs/superpowers/specs/2026-10-18-nba-draft-tool-design.md`

## Global Constraints

- Échéance dure : site en ligne et testé sur la tablette avant le **19/10/2026 21:00 Europe/Paris**. Si le temps manque, couper dans cet ordre : couleurs du board → onglet Mon équipe enrichi → scénario 2026 (T9 partie 2). Jamais couper : T1–T8, T10.
- IDs : `LEAGUE_ID = "1411432283293900800"`, `DRAFT_ID = "1411432283293900801"`, `MY_ROSTER_ID = 7`, `MY_USER_ID = "999403755114229760"`, draft 2025 `PREV_DRAFT_ID = "1280975159301251072"`, saison projections `2026`, saisons historiques `2025, 2024, 2023`.
- Le barème est **toujours lu** depuis `GET /v1/league/{LEAGUE_ID}` → `scoring_settings` (jamais recopié en dur hors tests).
- Draft : 12 équipes, 10 tours, `reversal_round` lu depuis `draft.settings.reversal_round` (= 3).
- Slots titulaires : `["PG","SG","SF","PF","C"]`, pas de flex ; banc 5 ; effectif max 10 ; limite supposée 6 joueurs éligibles par poste.
- Interface en **français**, lisible en quelques secondes ; aucune saisie utilisateur.
- Toute explication / badge reflète un fait chiffré réel (pas de texte générique).
- Pas de `as any`-équivalent : pas de `try {} catch {}` vide ; un échec réseau est affiché, jamais avalé.
- Les tests ne touchent jamais le réseau (fixtures dans `tests/fixtures/`).

## Review Focus

1. **Ordre de draft inconnu (`draft_order` null / `slot_to_roster_id` identité non définitive)** → l'onglet Draft affiche classement + recos sans « à toi dans N » ni ⏳, sans erreur console ; bascule seule quand l'ordre arrive. Test dans T5 + T8.
2. **Pick d'un joueur absent du snapshot** (ID inconnu, rookie tardif) → le board affiche le nom depuis `pick.metadata`, rien ne plante. Test dans T8.
3. **Picks consécutifs en bout de snake** (slot 12 : 12 puis 13 ; slot 1 : 36 puis 37) → la reco du second pick exclut le joueur du premier et tient compte du nouveau poste rempli. Test dans T6.
4. **Échec réseau pendant la draft** (fetch rejeté / 5xx) → bandeau « connexion perdue, nouvel essai… », dernier état conservé, reprise automatique. Test dans T8.
5. **Fin de draft où il reste moins de picks que de postes titulaires vides** → les recos ne proposent que des joueurs qui remplissent un poste vide. Test dans T6.

---

## Structure des fichiers

```
nba-draft-tool/
  package.json                 # "type":"module", scripts test/build/replay, aucune dépendance
  scripts/
    build-snapshot.mjs         # T7 : réseau → site/data/snapshot.json + site/top50.html
    mock-sleeper.mjs           # T9 : faux serveur API Sleeper (rejeu 2025 / scénario 2026)
  data/
    injury-overrides.json      # T7 : matchs attendus saisis à la main pour les « Out »
  site/
    index.html, style.css, app.js     # T8
    lib/scoring.js             # T1 : points fantasy par match
    lib/history.js             # T2 : moyennes historiques pondérées, complétion des projections
    lib/games.js               # T3 : matchs attendus + badge blessure
    lib/value.js               # T4 : niveau de remplacement, valeur saison
    lib/draftOrder.js          # T5 : propriétaire d'un pick, picks de l'utilisateur
    lib/recommend.js           # T6 : meilleur cinq, recos, disponibilité ⏳, explication
    data/snapshot.json         # généré
    top50.html                 # généré (secours imprimable)
  tests/*.test.js, tests/fixtures/*.json
```

Format du snapshot (contrat entre T7 et T8) :

```js
// site/data/snapshot.json
{
  generatedAt: "ISO date",
  leagueId, draftId, myRosterId,
  scoring: { pts: 1, reb: 1.2, ... },          // scoring_settings tel quel
  replacementFpg: number,
  players: {                                   // clé = player_id Sleeper
    "2577": {
      id: "2577", name: "Victor Wembanyama", team: "SAS",
      positions: ["C"],                         // fantasy_positions
      fpg: 55.1,                                // points fantasy / match (T1+T2)
      fpgSource: "proj" | "history" | "default",
      expectedGames: 68.4,                      // T3
      value: 2512.3,                            // T4 (peut être négatif)
      adp: 1.3,                                 // adp_std, 999 si absent
      injury: { status: "Out"|"DTD"|null, text: "Out — genou (Surgery)" | null },
      gpHistory: [ { season: 2025, gp: 71 }, { season: 2024, gp: 46 }, { season: 2023, gp: 0 } ],
      injuryBadge: "a joué 71, 46, 0 matchs sur 3 saisons" | null,   // T3
      statsLine: "24,1 pts · 11,2 reb · 3,6 ctr"                       // T7
    }
  }
}
```

---

### Task 1: Initialisation du dépôt + points fantasy par match

**Files:**
- Create: `package.json`, `.gitignore`, `site/lib/scoring.js`
- Test: `tests/scoring.test.js`

**Interfaces:**
- Produces: `fantasyPointsPerGame(perGame: Record<string, number>, scoring: Record<string, number>): number` — somme de `perGame[k] * scoring[k]` sur les clés de `scoring`, clé absente = 0.

- [ ] **Step 1:** `git init` dans `/root/projects/nba-draft-tool` (le dossier contient déjà `docs/`). `package.json` : `{"name":"nba-draft-tool","private":true,"type":"module","scripts":{"test":"node --test tests/","build":"node scripts/build-snapshot.mjs","replay":"node scripts/mock-sleeper.mjs"}}`. `.gitignore` : `node_modules/`.
- [ ] **Step 2: Write the failing test** `tests/scoring.test.js`

```js
const S = { pts:1, reb:1.2, oreb:0.5, ast:1.5, stl:3, blk:3, to:-1.5, tpm:1, ftmi:-0.5, pf:-0.5, tf:-1, ff:-2, dd:1, td:2, bonus_pt_40p:1, bonus_pt_50p:1, bonus_reb_20p:1, bonus_ast_15p:1 };
test("ligne complète", () => {
  const g = { pts:20, reb:10, oreb:2, ast:5, stl:1, blk:2, to:3, tpm:2, ftmi:1, pf:2, dd:1 };
  // 20 + 12 + 1 + 7.5 + 3 + 6 - 4.5 + 2 - 0.5 - 1 + 1 = 46.5
  assert.equal(fantasyPointsPerGame(g, S), 46.5);
});
test("clé absente = 0, clé hors barème ignorée", () => {
  assert.equal(fantasyPointsPerGame({ pts: 10, fga: 99 }, S), 10);
});
```

- [ ] **Step 3:** `npm test` → FAIL (module absent).
- [ ] **Step 4:** Implémenter `site/lib/scoring.js`.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6:** Commit `feat: fantasy points per game`.

---

### Task 2: Historique pondéré et complétion des projections

**Files:**
- Create: `site/lib/history.js`
- Test: `tests/history.test.js`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `SEASON_WEIGHTS = { 2025: 0.5, 2024: 0.3, 2023: 0.2 }`
  - `HISTORY_FILL_KEYS = ["oreb","pf","tf","ff","bonus_pt_40p","bonus_pt_50p","bonus_reb_20p","bonus_ast_15p"]`
  - `historicalPerGame(seasons: Array<{season:number, stats: Record<string,number>}>): Record<string,number> | null` — pour chaque saison avec `gp > 0`, moyenne par match (`total / gp`) ; moyenne pondérée par `SEASON_WEIGHTS` renormalisés sur les saisons présentes. `null` si aucune saison avec `gp > 0`.
  - `completePerGame(proj: Record<string,number> | null, hist: Record<string,number> | null): { perGame: Record<string,number>, source: "proj"|"history"|"default" }`
    - `proj` non vide (au moins `pts`) → `source "proj"` ; base = proj ; pour chaque clé de `HISTORY_FILL_KEYS` absente de proj, prendre `hist[k]` (sinon 0). Toute autre clé absente de proj = 0 (encodage creux de Sleeper).
    - sinon `hist` non null → `source "history"`, perGame = hist.
    - sinon → `source "default"`, perGame = `{ pts: 6, reb: 2.5, ast: 1.2, stl: 0.4, blk: 0.3, to: 0.8 }`.

- [ ] **Step 1: Write the failing tests**

```js
test("moyenne pondérée renormalisée", () => {
  const h = historicalPerGame([
    { season: 2025, stats: { gp: 10, pts: 200, oreb: 20 } },   // 20 pts/m, 2 oreb
    { season: 2024, stats: { gp: 20, pts: 200, oreb: 20 } },   // 10 pts/m, 1 oreb
    { season: 2023, stats: { gp: 0 } } ]);
  assert.equal(h.pts, (20*0.5 + 10*0.3) / 0.8);   // 16.25
  assert.equal(h.oreb, (2*0.5 + 1*0.3) / 0.8);
});
test("aucune saison jouée → null", () => assert.equal(historicalPerGame([{ season: 2025, stats: { gp: 0 } }]), null));
test("projection complétée par l'historique sur oreb/pf/bonus uniquement", () => {
  const r = completePerGame({ pts: 25, reb: 10 }, { pts: 99, oreb: 3, pf: 2.5, blk: 2 });
  assert.equal(r.source, "proj");
  assert.equal(r.perGame.pts, 25);
  assert.equal(r.perGame.oreb, 3);
  assert.equal(r.perGame.pf, 2.5);
  assert.equal(r.perGame.blk ?? 0, 0);   // blk absent de la projection = 0, pas l'historique
});
test("sans projection → historique, sans rien → défaut", () => {
  assert.equal(completePerGame(null, { pts: 12 }).source, "history");
  assert.equal(completePerGame({}, null).source, "default");
});
```

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implémenter `site/lib/history.js`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: weighted history and projection completion`.

---

### Task 3: Matchs attendus et badge blessure

**Files:**
- Create: `site/lib/games.js`
- Test: `tests/games.test.js`

**Interfaces:**
- Consumes: `SEASON_WEIGHTS` (T2).
- Produces:
  - `BASELINE_GAMES = 65`
  - `expectedGames({ gpHistory: Array<{season, gp}>, yearsExp: number, injuryStatus: "Out"|"DTD"|null, override: {games:number}|null }): number`
    - `override` présent → `override.games`.
    - Saisons prises en compte : celles où `season >= 2026 - yearsExp` (le joueur était en NBA), parmi 2025/2024/2023. Aucune → `BASELINE_GAMES`.
    - `weighted = Σ w·gp / Σ w` (poids renormalisés) ; `base = 0.75·weighted + 0.25·65`.
    - `Out` sans override → `base × 0.6` ; `DTD` → `base × 0.97`. Résultat borné à `[0, 82]`, arrondi à 0,1.
  - `injuryBadge({ gpHistory, injuryText, override }): string | null`
    - Morceaux joints par ` · ` : `injuryText` s'il existe ; `override.note` s'il existe ; `"a joué A, B, C matchs sur 3 saisons"` (ordre 2025, 2024, 2023, saisons NBA seulement) **si** une de ces saisons a `gp < 55`. `null` si aucun morceau.

- [ ] **Step 1: Write the failing tests**

```js
test("joueur durable", () => {
  const g = expectedGames({ gpHistory: [{season:2025,gp:80},{season:2024,gp:80},{season:2023,gp:80}], yearsExp: 8, injuryStatus: null, override: null });
  assert.equal(g, 76.3);   // 0.75*80 + 0.25*65 = 76.25 → 76.3
});
test("rookie → 65", () => assert.equal(expectedGames({ gpHistory: [], yearsExp: 0, injuryStatus: null, override: null }), 65));
test("saison 0 match compte quand le joueur était en NBA", () => {
  const g = expectedGames({ gpHistory: [{season:2025,gp:0},{season:2024,gp:70},{season:2023,gp:70}], yearsExp: 5, injuryStatus: null, override: null });
  assert.equal(g, 42.5);   // weighted = 0.5*0 + 0.3*70 + 0.2*70 = 35 → 0.75*35 + 16.25
});
test("Out sans override ×0.6, override prioritaire", () => {
  const h = [{season:2025,gp:80},{season:2024,gp:80},{season:2023,gp:80}];
  assert.equal(expectedGames({ gpHistory: h, yearsExp: 8, injuryStatus: "Out", override: null }), Math.round(76.25*0.6*10)/10);
  assert.equal(expectedGames({ gpHistory: h, yearsExp: 8, injuryStatus: "Out", override: { games: 20 } }), 20);
});
test("badge : seulement si saison < 55 matchs ou statut", () => {
  assert.equal(injuryBadge({ gpHistory: [{season:2025,gp:80},{season:2024,gp:78},{season:2023,gp:70}], injuryText: null, override: null }), null);
  assert.equal(injuryBadge({ gpHistory: [{season:2025,gp:0},{season:2024,gp:73},{season:2023,gp:68}], injuryText: null, override: null }), "a joué 0, 73, 68 matchs sur 3 saisons");
  assert.match(injuryBadge({ gpHistory: [], injuryText: "Out — genou (Surgery)", override: { games: 30, note: "retour incertain, ~janvier" } }), /^Out — genou \(Surgery\) · retour incertain/);
});
```

- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implémenter. **Step 4:** `npm test` → PASS. **Step 5:** Commit `feat: expected games and injury badge`.

---

### Task 4: Niveau de remplacement et valeur saison

**Files:**
- Create: `site/lib/value.js`
- Test: `tests/value.test.js`

**Interfaces:**
- Produces:
  - `replacementFpg(fpgs: number[], teams = 12, rounds = 10): number` — trie décroissant, moyenne des rangs `teams*rounds + 1` à `teams*rounds + 10` (rangs 121–130, base 1). Moins de 130 valeurs → moyenne des 10 dernières.
  - `seasonValue(fpg: number, expectedGames: number, replFpg: number): number` = `(fpg − replFpg) × expectedGames`, arrondi à 0,1.

- [ ] **Step 1: Write the failing tests**

```js
test("remplacement = moyenne rangs 121-130", () => {
  const f = Array.from({ length: 200 }, (_, i) => 200 - i);   // 200..1 ; rangs 121..130 = 80..71
  assert.equal(replacementFpg(f), 75.5);
});
test("valeur au-dessus du remplaçant", () => {
  assert.equal(seasonValue(50, 70, 20), 2100);
  assert.equal(seasonValue(15, 70, 20), -350);
});
test("une star fragile n'est pas écrasée par un joueur moyen durable", () => {
  assert.ok(seasonValue(55, 50, 20) > seasonValue(35, 80, 20));   // 1750 > 1200
});
```

- [ ] **Step 2–4:** FAIL → implémenter → PASS. **Step 5:** Commit `feat: replacement level and season value`.

---

### Task 5: Ordre de draft (snake + inversion + échanges)

**Files:**
- Create: `site/lib/draftOrder.js`
- Test: `tests/draftOrder.test.js`, `tests/fixtures/draft2025.json` (réponse réelle de `GET /v1/draft/1280975159301251072` et `/picks`, téléchargées une fois)

**Interfaces:**
- Produces:
  - `slotForPick(pickNo: number, teams: number, reversalRound: number): { round: number, slot: number }` — `round = ceil(pickNo/teams)`, `idx = (pickNo−1) % teams`, `reversed = (round % 2 === 0) !== (reversalRound > 0 && round >= reversalRound)`, `slot = reversed ? teams − idx : idx + 1`.
  - `pickOwnerRosterId(pickNo, { teams, reversalRound, slotToRosterId: Record<string, number>, tradedPicks: Array<{round, roster_id, owner_id, season}> , season: string }): number` — `orig = slotToRosterId[slot]` ; si un `tradedPicks` a `round` égal, `roster_id === orig` et `season` égal → `owner_id`, sinon `orig`.
  - `myPickNumbers(myRosterId, ctx, totalPicks = teams*rounds): number[]` — tous les `pickNo` dont le propriétaire est `myRosterId`, triés.
  - `orderKnown(draft): boolean` — `!!draft.draft_order`.
  - `nextMyPick(myPicks: number[], currentPickNo: number, includeCurrent: boolean): number | null`.

- [ ] **Step 1: Write the failing tests**

```js
const ctx = (s2r = Object.fromEntries([...Array(12)].map((_, i) => [String(i + 1), i + 1])), traded = []) =>
  ({ teams: 12, reversalRound: 3, slotToRosterId: s2r, tradedPicks: traded, season: "2026" });
test("inversion au tour 3", () => {
  assert.deepEqual(slotForPick(13, 12, 3), { round: 2, slot: 12 });
  assert.deepEqual(slotForPick(25, 12, 3), { round: 3, slot: 12 });
  assert.deepEqual(slotForPick(37, 12, 3), { round: 4, slot: 1 });
  assert.deepEqual(slotForPick(49, 12, 3), { round: 5, slot: 12 });
});
test("picks du slot 7 (spec §7 ter)", () =>
  assert.deepEqual(myPickNumbers(7, ctx(), 120), [7, 18, 30, 43, 54, 67, 78, 91, 102, 115]));
test("bouts de snake consécutifs", () => {
  assert.deepEqual(myPickNumbers(12, ctx(), 120).slice(0, 3), [12, 13, 25]);
  assert.deepEqual(myPickNumbers(1, ctx(), 120).slice(2, 4), [36, 37]);
});
test("pick échangé", () => {
  const c = ctx(undefined, [{ round: 2, roster_id: 7, owner_id: 3, season: "2026" }]);
  assert.equal(pickOwnerRosterId(18, c), 3);
  assert.ok(!myPickNumbers(7, c, 120).includes(18));
});
test("conforme à la draft 2025 réelle", () => {
  const { draft, picks } = loadFixture("draft2025.json");
  const c = { teams: 12, reversalRound: 3, slotToRosterId: draft.slot_to_roster_id, tradedPicks: [], season: "2025" };
  for (const p of picks) assert.equal(pickOwnerRosterId(p.pick_no, c), p.roster_id, `pick ${p.pick_no}`);
});
test("ordre inconnu", () => assert.equal(orderKnown({ draft_order: null }), false));
```

- [ ] **Step 2:** Télécharger la fixture : `curl -s https://api.sleeper.app/v1/draft/1280975159301251072` et `.../picks`, les combiner en `{ draft, picks }` dans `tests/fixtures/draft2025.json`. Ajouter un helper `loadFixture` dans `tests/helpers.js`.
- [ ] **Step 3:** `npm test` → FAIL. **Step 4:** implémenter. **Step 5:** `npm test` → PASS. (Si le test « 2025 réelle » échoue sur des picks échangés en 2025, utiliser `GET /v1/draft/1280975159301251072/traded_picks` dans la fixture plutôt que `[]`.) **Step 6:** Commit `feat: snake draft order with reversal and traded picks`.

---

### Task 6: Recommandations, meilleur cinq, disponibilité, explication

**Files:**
- Create: `site/lib/recommend.js`
- Test: `tests/recommend.test.js`

**Interfaces:**
- Consumes: forme `Player` du snapshot (voir contrat), `nextMyPick` (T5).
- Produces:
  - `STARTER_SLOTS = ["PG","SG","SF","PF","C"]`, `ROSTER_SIZE = 10`, `POSITION_CAP = 6`, `BENCH_WEIGHT = 0.3`
  - `bestLineup(players: Player[]): { total: number, assignment: Record<slot, playerId|null> }` — affectation qui maximise Σ `max(value, 0)` des titulaires, chaque joueur sur au plus un slot dont il a l'éligibilité (`positions`). Recherche exhaustive par DP sur bitmask (≤ 10 joueurs).
  - `canDraft(candidate, roster: Player[]): boolean` — faux si `roster.length >= 10`, ou si pour **toutes** les positions du candidat, le nombre de joueurs du roster éligibles à cette position est `>= 6`.
  - `availabilityTier(adp: number, currentPickNo: number, myNextPickNo: number | null): "gone"|"coinflip"|"wait"|null` — `null` si `myNextPickNo` null ; `adp >= 999` → `"wait"` ; `sd = 3 + 9·(currentPickNo/120)` ; `pGone = Φ((myNextPickNo − adp)/sd)` (Φ = CDF normale, approximation d'Abramowitz-Stegun) ; `≥ 0.7` gone, `≥ 0.3` coinflip, sinon wait.
  - `recommend({ available: Player[], roster: Player[], picksLeft: number, currentPickNo: number, myNextPickNo: number|null, limit = 4 }): Array<{ player, score, lineupGain, fillsSlot: string|null, tier, reason: string }>`
    - candidats = `available` filtrés par `canDraft`.
    - `lineupGain = bestLineup([...roster, c]).total − bestLineup(roster).total` ; `fillsSlot` = slot que `c` occupe dans la nouvelle affectation s'il était vide avant, sinon null.
    - `score = lineupGain + BENCH_WEIGHT × max(c.value, 0)`.
    - Si `picksLeft <= nombre de slots titulaires vides` → ne garder que les candidats avec `fillsSlot`.
    - Tri par `score` décroissant, `limit` premiers.
  - `explain(rec, player): string` — format exact : `"{fpg} pts/match · {statsLine}{, comble ton poste X | , renforce ton cinq | , profondeur de banc}"` où `fpg` est arrondi à 0,1 avec virgule décimale (`toLocaleString("fr-FR")`). « comble ton poste X » si `fillsSlot`, « renforce ton cinq » si `lineupGain > 0`, sinon « profondeur de banc ».

- [ ] **Step 1: Write the failing tests** (joueurs construits via un helper `P(id, positions, value, extra)`)

```js
test("meilleur cinq avec multi-éligibilité", () => {
  const r = [P("a",["PG","SG"],100), P("b",["PG"],90), P("c",["C"],50)];
  const L = bestLineup(r);
  assert.equal(L.total, 240); assert.equal(L.assignment.PG, "b"); assert.equal(L.assignment.SG, "a");
});
test("ne propose pas un 3e meneur quand le poste C est vide", () => {
  const roster = [P("pg1",["PG"],900), P("pg2",["PG"],800), P("sg",["SG"],700), P("sf",["SF"],700), P("pf",["PF"],700)];
  const avail = [P("pg3",["PG"],600), P("c1",["C"],400)];
  assert.equal(recommend({ available: avail, roster, picksLeft: 5, currentPickNo: 60, myNextPickNo: 67 })[0].player.id, "c1");
});
test("fin de draft : seuls les joueurs qui comblent un poste vide", () => {
  const roster = [P("pg",["PG"],900), P("sg",["SG"],800), P("sf",["SF"],700), P("x1",["PG"],1), P("x2",["PG"],1), P("x3",["SG"],1), P("x4",["SG"],1), P("x5",["SF"],1)];
  const avail = [P("star",["SG"],2000), P("pf",["PF"],10), P("c",["C"],10)];
  const ids = recommend({ available: avail, roster, picksLeft: 2, currentPickNo: 100, myNextPickNo: 115 }).map(r => r.player.id);
  assert.deepEqual(ids.sort(), ["c","pf"]);
});
test("picks consécutifs : le second tient compte du premier", () => {
  const avail = [P("c1",["C"],1000), P("c2",["C"],990), P("g",["PG"],700)];
  const first = recommend({ available: avail, roster: [], picksLeft: 10, currentPickNo: 12, myNextPickNo: 13 })[0].player;
  const second = recommend({ available: avail.filter(p => p !== first), roster: [first], picksLeft: 9, currentPickNo: 13, myNextPickNo: 36 })[0].player;
  assert.equal(first.id, "c1"); assert.equal(second.id, "g");
});
test("limite de poste", () => {
  const roster = Array.from({ length: 6 }, (_, i) => P("c" + i, ["C"], 10));
  assert.equal(canDraft(P("cx",["C"],10), roster), false);
  assert.equal(canDraft(P("cf",["C","PF"],10), roster), true);
});
test("disponibilité", () => {
  assert.equal(availabilityTier(10, 7, 18), "gone");
  assert.equal(availabilityTier(40, 7, 18), "wait");
  assert.equal(availabilityTier(18, 7, 18), "coinflip");
  assert.equal(availabilityTier(999, 7, 18), "wait");
  assert.equal(availabilityTier(10, 7, null), null);
});
test("explication", () => {
  const p = P("c1",["C"],1000,{ fpg: 48.04, statsLine: "20 pts · 12 reb · 2,5 ctr" });
  assert.equal(explain({ fillsSlot: "C", lineupGain: 1000 }, p), "48 pts/match · 20 pts · 12 reb · 2,5 ctr, comble ton poste C");
});
```

- [ ] **Step 2:** FAIL. **Step 3:** implémenter (`explain` : `fpg.toLocaleString("fr-FR", { maximumFractionDigits: 1 })`). **Step 4:** PASS. **Step 5:** Commit `feat: lineup-aware recommendations`.

---

### Task 7: Snapshot de données + blessés saisis à la main + liste de secours

**Files:**
- Create: `scripts/build-snapshot.mjs`, `data/injury-overrides.json`
- Generated: `site/data/snapshot.json`, `site/top50.html`
- Test: `tests/snapshot.test.js` (lit le snapshot généré)

**Interfaces:**
- Consumes: T1 `fantasyPointsPerGame`, T2 `historicalPerGame`/`completePerGame`, T3 `expectedGames`/`injuryBadge`, T4 `replacementFpg`/`seasonValue`.
- Produces: `site/data/snapshot.json` au format du contrat ci-dessus ; `site/top50.html`.

Sources (base `https://api.sleeper.app`) : `/v1/league/{LEAGUE_ID}` (scoring), `/v1/players/nba`, `/projections/nba/2026?season_type=regular`, `/stats/nba/{2025,2024,2023}?season_type=regular`. Les réponses projections/stats sont des tableaux de `{ player_id, stats, player }`.

Règles :
- Joueurs retenus : `active === true` et ayant une projection avec `pts`, **ou** `adp_std < 999`, **ou** ≥ 10 matchs en 2025.
- `injury.text` : `injury_status` + ` — ` + `injury_body_part` + (` (`+`injury_notes`+`)` si présent), parties françaises pour les plus fréquentes (`Knee`→genou, `Ankle`→cheville, `Foot`→pied, `Hamstring`→ischio, `Back`→dos, `Shoulder`→épaule, `Hip`→hanche, `Calf`→mollet, `Achilles`→Achille, `Wrist`→poignet ; sinon terme anglais).
- `statsLine` : `pts`, `reb`, `ast` par match, plus `stl` si ≥ 1,3 et `blk` si ≥ 1,0, format `"24,1 pts · 11,2 reb · 3,6 pd · 1,5 int · 3,1 ctr"`.
- `top50.html` : tableau imprimable trié par `value` : rang, nom, postes, équipe, pts/match, matchs attendus, badge blessure.

- [ ] **Step 1:** Écrire `scripts/build-snapshot.mjs` (fetch séquentiel avec 3 essais, échec explicite si un endpoint reste en erreur).
- [ ] **Step 2:** `npm run build` → crée `site/data/snapshot.json`. Lister les joueurs `injury.status === "Out"` dont `value` est dans le top 150 (le script les imprime en fin d'exécution).
- [ ] **Step 3:** Pour chacun, recherche web (blessure, date de retour annoncée) → entrée `data/injury-overrides.json` : `{ "<player_id>": { "games": <matchs attendus sur 82>, "note": "retour incertain, ~<mois>", "source": "<url>" } }`. Relancer `npm run build`.
- [ ] **Step 4: Write the test** `tests/snapshot.test.js` (ignoré via `t.skip` si le fichier n'existe pas)

```js
test("contrôle du barème sur la saison 2025 réelle", () => {
  const s = loadSnapshot();   // s.check = [{ id, name, gp, totals }] : 10 joueurs au plus gros total de pts en 2025
  assert.equal(s.check.length, 10);
  for (const c of s.check) {
    let manual = 0;
    for (const [k, w] of Object.entries(s.scoring)) manual += (c.totals[k] ?? 0) * w;
    const perGame = Object.fromEntries(Object.entries(c.totals).map(([k, v]) => [k, v / c.gp]));
    assert.ok(Math.abs(fantasyPointsPerGame(perGame, s.scoring) - manual / c.gp) < 0.01, c.name);
  }
  const best = Math.max(...s.check.map(c => fantasyPointsPerGame(
    Object.fromEntries(Object.entries(c.totals).map(([k, v]) => [k, v / c.gp])), s.scoring)));
  assert.ok(best > 50);
});
test("cohérence globale", () => {
  const s = loadSnapshot();
  const top = Object.values(s.players).sort((a, b) => b.value - a.value);
  assert.ok(top.length > 300);
  assert.ok(s.replacementFpg > 10 && s.replacementFpg < 35);
  assert.ok(top.slice(0, 20).every(p => p.fpg > 35));
  assert.ok(top.slice(0, 150).every(p => p.injury.status !== "Out" || p.injuryBadge));
  for (const p of top) assert.ok(Number.isFinite(p.value) && p.positions.length > 0);
});
```
- [ ] **Step 5:** `npm test` → PASS. Relire à l'œil le top 40 (`node -e` qui imprime nom, fpg, expectedGames, value, injuryBadge). Toute aberration (star absente, rookie en top 10, signe faux) = bug à corriger avant de continuer.
- [ ] **Step 6:** Commit `feat: data snapshot, injury overrides, printable top 50` (snapshot inclus).

---

### Task 8: Interface tablette (3 onglets) et suivi en direct

**Files:**
- Create: `site/index.html`, `site/style.css`, `site/app.js`, `site/lib/live.js`
- Test: `tests/live.test.js`

**Interfaces:**
- Consumes: snapshot (T7), `draftOrder.js` (T5), `recommend.js` (T6).
- Produces:
  - `site/lib/live.js` : `deriveState({ snapshot, draft, picks, tradedPicks, users, now: number }): ViewState` (pur, testé) avec
    ```
    ViewState = {
      status: "pre_draft"|"drafting"|"paused"|"complete",
      orderKnown: boolean,
      currentPickNo: number|null, currentRound, currentSlot,
      isMyTurn: boolean, picksUntilMe: number|null, myNextPickNo: number|null,
      secondsLeft: number|null,              // pick_timer − (now − last_picked)/1000, si drafting
      myRoster: Player[], available: Player[],
      recommendations: Rec[], topAvailable: Player[] (50),
      board: Array<Array<{ pickNo, rosterId, player: {name, positions} | null, isMine: boolean }>>,   // [round][colonne slot 1..12]
      columns: Array<{ slot, label }>        // label : display_name via draft_order/users, sinon "Équipe N"
    }
    ```
    Joueur pické absent du snapshot → `{ name: metadata.first_name + " " + metadata.last_name, positions: [metadata.position] }`.
  - `site/app.js` : paramètre d'URL `?api=<base>` (défaut `https://api.sleeper.app`) et `?draft=<id>` (défaut `DRAFT_ID`) pour le rejeu. Boucle toutes les 2500 ms : `GET /v1/draft/{id}`, `/picks`, `/traded_picks` (users une fois au démarrage puis toutes les 60 s). Erreur → bandeau rouge « Connexion perdue — nouvel essai… », dernier état gardé. `ViewState` → rendu.

UI (spec §7) :
- Onglets en haut : **Draft** · **Mon équipe** · **Board**. Onglet actif mémorisé dans `localStorage`.
- **Draft** : bandeau d'état (« En attente du début de la draft », « Pick 4.07 · à toi dans 3 picks », « ⏱ 42 s ») ; fond du bandeau **vert vif + texte « À TOI ! »** quand `isMyTurn`. 3-4 cartes de reco : nom (grand), postes · équipe, points attendus saison (`round(fpg × expectedGames)`), ligne `explain`, badges `🩹 {injuryBadge}` et `⏳ Partira avant ton tour` / `⚖️ 50-50` / `✅ Peut attendre`. En dessous : liste des 50 meilleurs dispo (nom, postes, pts/match, 🩹 si badge).
- **Mon équipe** : cinq titulaire (slot → joueur ou « vide »), banc, total de points attendus.
- **Board** : grille 12 colonnes × 10 lignes, en-têtes = `columns`, case = nom court, colonne de BahBubu surlignée, ses picks futurs marqués « à toi #N ». Couleurs par poste : seulement si le temps le permet.
- Mise en page tablette (≥ 768 px), police ≥ 18 px pour les recos, aucun défilement horizontal sauf board.

- [ ] **Step 1: Write the failing tests** `tests/live.test.js`. Fixtures en tête de fichier : `snapshot` = 30 joueurs fictifs (ids "p1".."p30", postes variés, `value` décroissante), `settings = { teams: 12, rounds: 10, reversal_round: 3, pick_timer: 60 }`, `identity` = slot N → roster N, `users = [{ user_id: MY_USER_ID, display_name: "BahBubu" }]`, `now = 1_000_000`, `fakePicks(n)` = n picks où le pick k prend `"p"+k`, avec `roster_id`/`draft_slot` calculés par `slotForPick`.

```js
test("pre_draft, ordre inconnu : recos sans timing", () => {
  const v = deriveState({ snapshot, draft: { status: "pre_draft", draft_order: null, settings, slot_to_roster_id: identity }, picks: [], tradedPicks: [], users, now });
  assert.equal(v.orderKnown, false); assert.equal(v.picksUntilMe, null);
  assert.ok(v.recommendations.length > 0); assert.ok(v.recommendations.every(r => r.tier === null));
});
const drafting = { status: "drafting", draft_order: { [MY_USER_ID]: 7 }, settings, slot_to_roster_id: identity, last_picked: now - 18000 };
test("à toi : isMyTurn, picksUntilMe = 0, compte à rebours", () => {
  const v = deriveState({ snapshot, draft: drafting, picks: fakePicks(6), tradedPicks: [], users, now });
  assert.equal(v.currentPickNo, 7); assert.equal(v.isMyTurn, true); assert.equal(v.picksUntilMe, 0);
  assert.equal(v.myNextPickNo, 18); assert.equal(v.secondsLeft, 42);
});
test("joueur pické inconnu du snapshot affiché depuis metadata", () => {
  const picks = [{ pick_no: 1, round: 1, draft_slot: 1, roster_id: 1, player_id: "999999", picked_by: "u1",
                   metadata: { first_name: "Jean", last_name: "Inconnu", position: "SF" } }];
  const v = deriveState({ snapshot, draft: drafting, picks, tradedPicks: [], users, now });
  assert.deepEqual(v.board[0][0].player, { name: "Jean Inconnu", positions: ["SF"] });
});
test("joueur pické retiré des disponibles et ajouté au roster de son propriétaire", () => {
  const picks = fakePicks(7);   // pick 7 → roster 7 (BahBubu), player_id = 7e joueur du snapshot
  const v = deriveState({ snapshot, draft: drafting, picks, tradedPicks: [], users, now });
  assert.equal(v.myRoster.length, 1);
  assert.ok(!v.available.some(p => p.id === picks[6].player_id));
});
test("colonnes : nom d'utilisateur ou 'Équipe N'", () => {
  const v = deriveState({ snapshot, draft: drafting, picks: [], tradedPicks: [], users, now });
  assert.equal(v.columns[6].label, "BahBubu"); assert.equal(v.columns[11].label, "Équipe 12");
});
```

- [ ] **Step 2:** FAIL. **Step 3:** implémenter `live.js`. **Step 4:** PASS.
- [ ] **Step 5:** Implémenter `index.html`, `style.css`, `app.js`. Servir : `python3 -m http.server 8080 -d site`.
- [ ] **Step 6:** Vérifier dans un navigateur (skill webapp-testing / Playwright, viewport 1024×768) avec la vraie API (draft en `pre_draft`) : 3 onglets visibles, recos affichées, « En attente du début de la draft », aucune erreur console. Couper le réseau (bloquer `api.sleeper.app` dans Playwright) → bandeau « Connexion perdue », état conservé ; rétablir → reprise.
- [ ] **Step 7:** Commit `feat: tablet UI with live draft tracking`.

---

### Task 9: Faux serveur Sleeper — rejeu 2025 et scénario 2026

**Files:**
- Create: `scripts/mock-sleeper.mjs`

**Interfaces:**
- Consumes: `tests/fixtures/draft2025.json` (T5), `site/data/snapshot.json` (T7).
- Produces: serveur HTTP `http://localhost:8787` avec CORS `*`, routes `/v1/draft/{id}`, `/v1/draft/{id}/picks`, `/v1/draft/{id}/traded_picks` (`[]`), `/v1/league/{id}/users`. Options CLI :
  - `--mode=replay2025` : `draft` de 2025 avec `status: "drafting"`, `draft_order` reconstruit depuis `slot_to_roster_id`, picks révélés un par un toutes les `--interval` secondes (défaut 2), `last_picked` mis à jour ; après le dernier, `status: "complete"`.
  - `--mode=scenario2026 --my-slot=12` : draft 2026 fictive (`draft_order` avec `MY_USER_ID` au slot donné, `slot_to_roster_id` tel que `MY_ROSTER_ID` → ce slot), picks générés par ordre d'ADP du snapshot (en respectant `canDraft`), y compris pour BahBubu après `--my-delay` secondes (défaut 8) afin d'avoir le temps de lire l'écran.
  - Démarrage avec `--start-delay=5` en `pre_draft` puis passage à `drafting` (teste la bascule).

- [ ] **Step 1:** Implémenter.
- [ ] **Step 2:** `node scripts/mock-sleeper.mjs --mode=replay2025 --interval=1` + site servi, ouvrir `http://localhost:8080/?api=http://localhost:8787&draft=1280975159301251072` dans Playwright. Vérifier : bascule pre_draft → drafting, board rempli conformément à l'inversion du tour 3 (case tour 3 slot 12 = pick 25), joueurs 2025 inconnus affichés via metadata, statut « complete » final, aucune erreur console.
- [ ] **Step 3:** `--mode=scenario2026 --my-slot=12` : captures d'écran à chaque tour de BahBubu (12, 13, 36, 37…). Contrôle à l'œil : recos plausibles (stars en haut, postes cohérents, pas de 3e meneur avec C vide), badges 🩹/⏳ présents et vrais, second pick consécutif différent du premier. Refaire rapidement avec `--my-slot=7`.
- [ ] **Step 4:** Commit `test: mock Sleeper server for replay and 2026 scenario`.

---

### Task 10: Mise en ligne GitHub Pages + check-list jour J

**Files:**
- Create: `README.md` (court : URL, commandes, check-list jour J), `scripts/deploy.sh`

- [ ] **Step 1:** `gh repo create Bubu92i/nba-draft-tool --public --source=. --push`.
- [ ] **Step 2:** `scripts/deploy.sh` : `git subtree split --prefix site -b gh-pages-tmp && git push -f origin gh-pages-tmp:gh-pages && git branch -D gh-pages-tmp`. Lancer. Activer Pages : `gh api -X POST repos/Bubu92i/nba-draft-tool/pages -f "source[branch]=gh-pages" -f "source[path]=/"` (si déjà actif : ignorer l'erreur 409 en l'affichant).
- [ ] **Step 3:** `curl -sI https://bubu92i.github.io/nba-draft-tool/` → `200` ; `curl -s .../data/snapshot.json | head -c 200` → JSON. Vérifier dans Playwright sur l'URL publique : recos affichées, aucune erreur console.
- [ ] **Step 4:** Donner l'URL à l'utilisateur pour l'ouvrir **sur la tablette** et confirmer qu'il voit les 3 onglets (test réseau réel). Lui donner aussi l'URL `.../top50.html` (secours).
- [ ] **Step 5:** README, check-list jour J : (1) lundi vers 18h : `npm run build` (blessures fraîches) → `npm test` → `scripts/deploy.sh` ; (2) 20h45 : ouvrir l'URL sur la tablette, écran allumé en permanence ; (3) si l'outil plante : `top50.html`.
- [ ] **Step 6:** Commit `chore: deploy to GitHub Pages` et push.
