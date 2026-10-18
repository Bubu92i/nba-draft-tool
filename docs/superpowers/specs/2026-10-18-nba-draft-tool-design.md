# Outil d'aide à la draft fantasy NBA (Sleeper) — conception

Date : 2026-10-18 · Pour : BahBubu · Rédigé par : Sisyphus · Relu deux fois (builder check + revue critique)

## 1. Intention

BahBubu joue dans une ligue fantasy NBA sur Sleeper mais ne suit pas assez la NBA pour être sûr de ses choix. Il veut un outil qui, **pendant la draft en direct**, lui dise quel joueur prendre et **pourquoi**, en tenant compte du barème de sa ligue et surtout du **risque de blessure**.

Critère de réussite (ses mots) : « les choix me paraissent cohérents et me font gagner des matchs ».
- *Cohérent* : chaque recommandation est justifiée en une ligne compréhensible par quelqu'un qui ne suit pas la NBA.
- *Gagner des matchs* : la ligue est en face-à-face hebdomadaire aux points → on maximise les points réellement apportés au **cinq titulaire** sur la saison.

## 2. Échéance

La draft est programmée le **lundi 19 octobre 2026 à 21h00 (Europe/Paris)** (`start_time` 1792436400000, `autostart` 0 : c'est le commissaire qui la lance, l'heure réelle peut varier). L'outil doit être en ligne, testé, et ouvert sur la tablette avant. Tout ce qui menace cette échéance est coupé.

## 3. Contexte ligue (vérifié via l'API publique Sleeper)

| Élément | Valeur |
|---|---|
| Ligue | « And1 », `league_id` 1411432283293900800, saison 2026. Redraft : aucun keeper dans cette draft (`max_keepers` = 1 existe dans les réglages mais n'est pas utilisé) |
| Draft | `draft_id` 1411432283293900801, **snake**, 12 équipes, 10 tours, **`reversal_round` 3** : tours 2 et 3 vont tous deux du slot 12 au slot 1, le tour 4 repart de 1 → 12 (confirmé sur la draft 2025) |
| Ordre | `draft_order` null à ce jour → lu en direct, jamais codé en dur |
| Utilisateur | BahBubu, `user_id` 999403755114229760, `roster_id` 7 |
| Timer | 60 s par pick, autopick CPU activé |
| Effectif | 1 PG, 1 SG, 1 SF, 1 PF, 1 C titulaires (**pas de flex / UTIL**) + 5 BN. Pas de place IR pendant la draft (1 place IR utilisable après) |
| Échanges de picks | autorisés (`pick_trading` 1), aucun à ce jour |
| Équipes | 11 utilisateurs, 9 rosters attribués ; des rosters peuvent rester sans propriétaire (autopick CPU) |

**Barème** (lu depuis `scoring_settings`, jamais recopié) : pts 1 · reb 1,2 · oreb +0,5 · ast 1,5 · stl 3 · blk 3 · to −1,5 · tpm 1 · ftmi −0,5 · pf −0,5 · tf −1 · ff −2 · dd +1 · td +2 · bonus 40 pts +1 · 50 pts +1 · 20 reb +1 · 15 ast +1.

## 4. Données

Toutes publiques, sans authentification, CORS ouvert (`access-control-allow-origin: *`) :
- `/v1/players/nba` — fiche joueur : équipe, `fantasy_positions` (multi-éligibilité), âge, `injury_status` (vide / DTD / Out), `injury_body_part`, `injury_notes` (très succinct, ex. « Surgery »).
- `/projections/nba/2026?season_type=regular` — projections **par match** et `adp_std`. **Limites constatées** : seuls ~530 joueurs ont des stats projetées (≈ les 140 premiers à l'ADP et au-delà, mais pas tout le monde) ; `oreb`, `tf`, bonus absents ; `pf`, `ff` quasi absents ; `dd`/`td` partiels ; `gp` toujours 1 (inutilisable).
- `/stats/nba/{2023,2024,2025}?season_type=regular` — totaux réels par saison, dont `gp`, `oreb`, `pf`, bonus.
- `/v1/draft/{id}`, `/v1/draft/{id}/picks`, `/v1/draft/{id}/traded_picks`, `/v1/league/{id}/users` — draft en direct.

**Instantané** : fiches, projections et stats sont téléchargées et figées dans un fichier avant la draft. Pendant la draft, seuls les endpoints de draft sont interrogés.

## 5. Valorisation des joueurs

1. **Points fantasy par match** = projection Sleeper × barème, avec : stat absente = 0 pour `tpm`, `blk`, `dd`, `td` ; `oreb`, `pf`, `tf`, `ff` et taux de bonus complétés par la moyenne par match des 2-3 dernières saisons réelles ; joueurs sans projection = moyenne réelle récente, ou valeur par défaut basse s'ils n'ont aucun historique.
   **Contrôle obligatoire** : recalculer avec la formule la saison 2025 réelle d'une dizaine de stars et comparer aux points fantasy réels → détecte erreurs de clé ou de signe.
2. **Matchs attendus** : historique de matchs joués pondéré vers le récent (≈ 50/30/20), ramené vers ≈ 65 matchs (80 % de 82) pour éviter les extrêmes ; DTD ≈ quasi sans effet. Pour les rares joueurs « Out » en haut de classement (≈ 6 dans le top 130 : Butler, Ingram, Porziņģis, Sharpe, Williams, DiVincenzo), estimation de retour **saisie à la main** à partir d'une recherche web, avec badge « retour incertain ».
3. **Valeur au-dessus du remplaçant** : valeur = (pts/match − pts/match d'un remplaçant dispo en waivers) × matchs attendus. Un match manqué ne vaut pas 0 : un remplaçant joue à la place.
4. **Faisabilité du cinq** : pas de flex → la recommandation calcule le gain apporté au **meilleur cinq possible** (affectation des joueurs aux 5 postes selon `fantasy_positions`), plus une petite valeur de profondeur de banc. Un joueur qui ne pourra jamais être titulaire vu l'effectif est signalé et rétrogradé.
5. **Limite par poste** (`enforce_position_limits`) : 2025 montre au moins 5 joueurs d'un même poste par équipe ; on suppose un maximum de 6 (1 titulaire + 5 banc) et le builder vérifie si possible sur une mock draft.
6. **Disponibilité au prochain pick (⏳)** : à partir de l'ADP Sleeper (qui n'utilise **pas** le barème de la ligue), probabilité affichée en 3 niveaux : « partira avant ton tour » / « 50-50 » / « peut attendre ». Incertitude croissante au fil de la draft. Présenté comme une estimation, jamais une certitude. ADP 999 = non drafté.

Décidé avec l'utilisateur : les joueurs **gravement blessés sont pénalisés, pas exclus** ; ils restent recommandables s'ils valent le coup (ex. fin de draft, à basculer en IR après la draft), avec badge 🩹.

**Badge 🩹** : toujours appuyé sur un fait vérifiable, ex. « a joué 0, 73, 68 matchs sur 3 saisons » et/ou « Out — genou, opéré ». Il ne dépend pas que du statut API (ex. Haliburton, 0 match en 2025, n'a aucun statut).

## 6. Suivi de la draft en direct

- `/picks` interrogé toutes les 2-3 s ; la liste des picks est la seule source de vérité de ce qui est pris.
- Propriétaire de chaque pick = `slot_to_roster_id` + `traded_picks` (relu régulièrement). Slot de BahBubu = slot associé au `roster_id` 7 (et non supposé égal à son `user_id`).
- États gérés proprement : `pre_draft` (« en attente », classement seul), `drafting`, `paused`, `complete`. Tant que l'ordre est inconnu : pas de « à toi dans N picks », pas de ⏳, bascule automatique dès qu'il apparaît.
- Picks consécutifs (bouts de snake, ex. slot 12 : picks 12 et 13 ; slot 1 : 36 et 37) : la seconde recommandation tient compte du premier choix.
- Noms des colonnes du board : `draft_order` / `picked_by` / `users`, repli « Équipe N ».
- Compte à rebours du pick en cours affiché (via `last_picked` + `pick_timer`).

## 7. Interface (tablette, page web, en français)

BahBubu draft sur l'app Sleeper de son **téléphone** ; l'outil est ouvert sur une **tablette**. Il ne saisit rien. Trois onglets :
- **Draft** (prioritaire) — pick en cours, compte à rebours, « à toi dans N picks », écran qui change de couleur quand c'est son tour ; 3-4 recommandations en gros (nom, poste, équipe NBA, points attendus, une ligne d'explication, badges 🩹 / ⏳) ; liste défilante des meilleurs disponibles.
- **Mon équipe** — joueurs draftés, cinq titulaire, postes vides, total attendu.
- **Board** — grille 12 équipes × 10 tours, joueur dans chaque case, sa colonne et ses picks futurs mis en évidence. Couleurs par poste et flèches de snake = finition, seulement si le temps le permet.

**Secours** : une liste imprimable / capture « top 50 avec badges blessure » générée depuis le même instantané, à avoir sous la main si l'outil tombe.

## 8. Architecture et hébergement

Sleeper autorisant les appels directs depuis le navigateur, l'outil est **une page statique + le fichier instantané** : c'est la tablette qui interroge Sleeper. Aucun serveur applicatif ne peut planter pendant la draft.

Hébergement (décidé avec l'utilisateur) : **GitHub Pages**, dépôt **public** sur le compte GitHub `Bubu92i` (déjà authentifié via `gh` sur le serveur). Le dépôt ne contient que des données publiques. HTTPS, indépendant du serveur OpenChamber. L'URL est testée depuis la tablette, sur son propre réseau, bien avant 21h.

## 9. Tests avant la draft

1. **Rejeu de la draft 2025** en accéléré : valide le suivi, l'inversion du tour 3, le board, les joueurs inconnus de l'instantané. Ne valide pas la pertinence des recommandations.
2. **Scénario 2026 scripté** : picks simulés selon l'ADP avec le vrai vivier 2026, en vérifiant à l'œil que les recommandations tiennent la route, y compris pour un slot en bout de snake.
3. **Contrôle de valorisation** (§5.1) et relecture à l'œil du top 40.

## 10. Objectifs / non-objectifs / anti-objectifs

**Objectifs** : recommandations fiables et expliquées pendant la draft du 19/10 ; suivi automatique ; risque de blessure au premier plan ; board.

**Non-objectifs (v1)** : gestion de saison (titulaires hebdo, waivers, échanges) — envisagée plus tard ; drafter à la place de l'utilisateur ; saisie manuelle ; autres ligues ou plateformes.

**Coupé (délai)** : calendrier NBA / semaines de playoffs ; ajustement aux habitudes des adversaires d'après 2025.

**Anti-objectifs** : un outil qui casse ou se fige pendant la draft ; des recommandations sans explication ; un écran trop chargé pour être lu en quelques secondes ; un joueur blessé recommandé sans avertissement ; une certitude affichée là où il n'y a qu'une estimation.

## 11. Laissé au builder

Stack, structure du code, réglages fins des formules (dans les contraintes du §5), fréquence exacte de rafraîchissement, design visuel.
