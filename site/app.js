import { DRAFT_ID, LEAGUE_ID, DEFAULT_API, POLL_MS, USERS_REFRESH_MS } from "./lib/config.js";
import { deriveState, createPoller, secondsLeft, fetchJson, pickSignature, timerUrgent, dataAge, preDraftText } from "./lib/live.js";
import { pickLabel } from "./lib/draftOrder.js";
import { lineupView, STARTER_SLOTS, ROSTER_SIZE, TIER_LABELS, missingSlotsNotice, rankingCaption, valueLine, gapLine, seasonPts, signedPts, cardMarker, comparisonLine } from "./lib/recommend.js";

const params = new URLSearchParams(location.search);
const API = (params.get("api") ?? DEFAULT_API).replace(/\/+$/, "");
const DRAFT = params.get("draft") ?? DRAFT_ID;
const TABS = ["draft", "team", "board"];
const fmt = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const getJson = (path) => fetchJson(`${API}${path}`);

const app = {
  snapshot: null,
  draft: null,
  picks: [],
  traded: [],
  users: [],
  usersAt: 0,
  updatedAt: null,
  view: null,
  viewKey: null,
  tab: TABS.includes(localStorage.getItem("tab")) ? localStorage.getItem("tab") : "draft",
};

const el = {
  main: document.querySelector("main"),
  net: document.getElementById("net-banner"),
  calc: document.getElementById("calc-banner"),
  status: document.getElementById("status"),
  foot: document.getElementById("foot"),
  panels: Object.fromEntries(TABS.map((t) => [t, document.getElementById(`tab-${t}`)])),
  tabs: [...document.querySelectorAll(".tab")],
};

function posBadges(positions) {
  return positions.map((p) => h("span", { class: `pos pos-${p}` }, p));
}
const teamsOf = (view) => view.board[0].length;

function renderStatus() {
  const v = app.view;
  el.status.className = "status";
  el.status.replaceChildren();
  if (!v) {
    el.status.append(h("span", {}, "Chargement…"));
    return;
  }
  const age = dataAge(app.updatedAt, Date.now());
  const upd = age ? h("span", { class: age.stale ? "upd stale" : "upd" }, age.text) : null;
  const secs = v.status === "drafting" && app.draft ? secondsLeft(app.draft, Date.now()) : null;
  const timer = secs != null ? h("span", { class: timerUrgent(secs, v.isMyTurn) ? "timer urgent" : "timer" }, `⏱ ${secs} s`) : null;
  const right = h("span", { class: "right" }, timer, upd);
  if (v.status === "pre_draft") {
    el.status.classList.add("pre");
    el.status.append(h("span", { class: "msg" }, preDraftText(app.draft)), right);
  } else if (v.status === "complete") {
    el.status.classList.add("done");
    el.status.append(h("span", { class: "msg" }, "Draft terminée"), right);
  } else if (v.currentPickNo == null) {
    el.status.classList.add("done");
    el.status.append(h("span", { class: "msg" }, "Tous les picks sont faits"), right);
  } else if (v.isMyTurn) {
    el.status.classList.add("mine");
    el.status.append(h("span", { class: "msg" }, `À TOI ! · ${pickLabel(v.currentPickNo, teamsOf(v))}`), right);
  } else {
    const paused = v.status === "paused" ? "Draft en pause · " : "";
    let when = "ordre de draft pas encore connu";
    if (v.orderKnown) {
      if (v.picksUntilMe == null) when = "plus de pick pour toi";
      else if (v.picksUntilMe === 1) when = "à toi au prochain pick";
      else when = `à toi dans ${v.picksUntilMe} picks`;
    }
    el.status.append(h("span", { class: "msg" }, `${paused}${pickLabel(v.currentPickNo, teamsOf(v))} · ${when}`), right);
  }
}

function emptyRecsMessage(v) {
  if (v.status === "complete") return "Draft terminée : plus rien à choisir.";
  if (v.currentPickNo == null && v.status !== "pre_draft") return "Tous les picks sont faits : plus rien à choisir.";
  if (v.myRoster.length >= ROSTER_SIZE) return "Aucune recommandation : ton effectif est complet.";
  return "Aucune recommandation : aucun joueur disponible ne comble un poste vide de ton cinq.";
}

const injClass = (p) => `inj ${p.injuryLevel === "high" ? "high" : "moderate"}`;
const injLine = (p) => (p.injuryBadge ? h("div", { class: injClass(p), title: p.injuryBadge }, `🩹 ${p.injuryBadge}`) : null);
const isOver = (v) => v.status === "complete" || (v.currentPickNo == null && v.status !== "pre_draft");

function missingNotice(v) {
  const { emptySlots } = lineupView(v.myRoster);
  const notice = missingSlotsNotice({ emptySlots, picksLeft: v.picksLeft, over: isOver(v) });
  return notice ? h("div", { class: notice.level === "alert" ? "alert" : "notice" }, notice.text) : null;
}

function recCard(r, i, all) {
  const p = r.player;
  const badges = [];
  if (r.tier) badges.push(h("span", { class: `badge ${r.tier}` }, TIER_LABELS[r.tier]));
  if (p.injuryBadge) badges.push(h("span", { class: `badge ${injClass(p)}`, title: p.injuryBadge }, `🩹 ${p.injuryBadge}`));
  const gap = i === 0 ? gapLine(all) : null;
  return h(
    "article",
    { class: i === 0 ? "rec best" : "rec" },
    i === 0 ? h("div", { class: "best-banner" }, "👉 MEILLEUR CHOIX") : null,
    h("div", { class: "head" }, h("span", { class: "rank" }, i + 1), h("div", { class: "id" }, h("div", { class: "name", title: p.name }, p.name), h("div", { class: "meta" }, posBadges(p.positions), p.team))),
    h("div", { class: "pts" }, `≈ ${fmt0.format(seasonPts(p))} pts fantasy sur la saison`, h("span", { class: "games" }, ` (≈ ${fmt0.format(p.expectedGames)} matchs)`)),
    h("div", { class: "value" }, valueLine(p.value)),
    gap ? h("div", { class: "gap" }, gap) : null,
    h("div", { class: "why" }, r.reason),
    badges.length ? h("div", { class: "badges" }, badges) : null,
  );
}

function renderDraft(v) {
  const recs = v.recommendations.length
    ? h("div", { class: "recs" }, v.recommendations.map(recCard))
    : h("div", { class: "empty" }, emptyRecsMessage(v));
  const cardOf = new Map(v.recommendations.map((r, i) => [r.player.id, i]));
  const rows = v.topAvailable.map((p, i) => {
    const card = cardOf.get(p.id);
    return h(
      "tr",
      { class: card != null ? "in-recs" : null },
      h("td", { class: "n" }, i + 1),
      h("td", {}, card != null ? h("span", { class: "marker", title: `Recommandation n°${card + 1}` }, cardMarker(card)) : null, h("b", {}, p.name), injLine(p)),
      h("td", { class: "pos-cell" }, posBadges(p.positions)),
      h("td", {}, p.team),
      h("td", { class: "n" }, fmt.format(p.fpg)),
      h("td", { class: "n" }, fmt0.format(p.expectedGames)),
      h("td", { class: "n" }, signedPts(p.value)),
    );
  });
  el.panels.draft.replaceChildren(
    h("div", { class: "recs-head" }, h("h2", {}, "Recommandations"), missingNotice(v)),
    h("p", { class: "caption" }, rankingCaption(app.snapshot.replacementFpg)),
    recs,
    h("h2", {}, `Meilleurs joueurs disponibles (${v.topAvailable.length})`),
    h("p", { class: "caption" }, "Triés par points de plus qu'un remplaçant sur la saison."),
    h(
      "div",
      { class: "list-wrap" },
      h(
        "table",
        { class: "list" },
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            h("th", { class: "n" }, "#"),
            h("th", {}, "Joueur"),
            h("th", {}, "Postes"),
            h("th", {}, "Éq."),
            h("th", { class: "n" }, "Pts fantasy/match"),
            h("th", { class: "n" }, "Matchs prévus"),
            h("th", { class: "n" }, "+ vs remplaçant"),
          ),
        ),
        h("tbody", {}, rows),
      ),
    ),
  );
}

function playerSlot(label, p) {
  return h(
    "div",
    { class: "slot" },
    h("span", { class: "lbl" }, label),
    h("span", { class: "who" }, p.name, h("div", { class: "sub" }, `${p.positions.join("/")} · ${p.team}`), injLine(p)),
    h("span", { class: "pts" }, `${fmt0.format(seasonPts(p))} pts`),
  );
}
const emptySlot = (label) => h("div", { class: "slot vide" }, h("span", { class: "lbl" }, label), h("span", { class: "who" }, "vide"));

function renderTeam(v) {
  const { starters, bench } = lineupView(v.myRoster);
  const starterTotal = starters.reduce((sum, s) => sum + (s.player ? seasonPts(s.player) : 0), 0);
  const benchRows = Array.from({ length: Math.max(ROSTER_SIZE - STARTER_SLOTS.length, bench.length) }, (_, i) =>
    bench[i] ? playerSlot("BN", bench[i]) : emptySlot("BN"),
  );
  if (!v.myRoster.length && !isOver(v)) {
    const text =
      v.status === "pre_draft"
        ? "Ta draft n'a pas encore commencé — ton équipe apparaîtra ici pick après pick."
        : "Tu n'as pas encore choisi de joueur — ton équipe apparaîtra ici pick après pick.";
    el.panels.team.replaceChildren(h("p", { class: "notice" }, text));
    return;
  }
  el.panels.team.replaceChildren(
    missingNotice(v),
    h("h2", {}, "Cinq majeur"),
    h("div", { class: "lineup" }, starters.map((s) => (s.player ? playerSlot(s.slot, s.player) : emptySlot(s.slot)))),
    h("div", { class: "total" }, `Total attendu (cinq majeur) : ${fmt0.format(starterTotal)} pts sur la saison`),
    v.fiveComparison ? h("div", { class: "compare" }, comparisonLine(v.fiveComparison, { complete: isOver(v) })) : null,
    h("h2", {}, `Banc (${bench.length})`),
    h("div", { class: "lineup" }, benchRows),
  );
}

const SUFFIX = new Set(["Jr.", "Sr.", "II", "III", "IV", "V"]);
function shortName(name) {
  const parts = name.split(" ");
  if (parts.length < 2) return name;
  let last = parts.slice(-1);
  if (SUFFIX.has(parts[parts.length - 1]) && parts.length > 2) last = parts.slice(-2);
  return `${parts[0][0]}. ${last.join(" ")}`;
}

const POS_LEGEND = ["PG", "SG", "SF", "PF", "C"];

function renderBoard(v) {
  const teams = teamsOf(v);
  const head = h(
    "tr",
    {},
    h("th", { class: "rowh" }, "Tour"),
    v.columns.map((c) => h("th", { class: c.slot === v.mySlot ? "mine-col" : "" }, c.label)),
  );
  const rows = v.board.map((row, ri) =>
    h(
      "tr",
      {},
      h("th", { class: "rowh" }, ri + 1),
      row.map((cell, ci) => {
        const classes = ["cell"];
        if (ci + 1 === v.mySlot) classes.push("mine-col");
        if (cell.pickNo === v.currentPickNo) classes.push("current");
        if (cell.player) classes.push(`p-${cell.player.positions[0] ?? "X"}`);
        else if (cell.isMine) classes.push("mine-future");
        const choix = `choix ${((cell.pickNo - 1) % teams) + 1}`;
        const body = cell.player
          ? [h("span", { class: "pk" }, choix), h("span", { class: "nm" }, shortName(cell.player.name))]
          : cell.isMine
            ? [h("span", { class: "nm" }, "à toi"), h("span", { class: "nm sub" }, `#${cell.pickNo}`)]
            : [h("span", { class: "pk" }, choix)];
        return h("td", { class: classes.join(" "), title: pickLabel(cell.pickNo, teams) }, body);
      }),
    ),
  );
  const legend = h(
    "div",
    { class: "legend" },
    h("span", {}, "Poste du joueur choisi :"),
    POS_LEGEND.map((p) => h("span", { class: "legend-item" }, h("span", { class: `pos pos-${p}` }, p))),
  );
  el.panels.board.replaceChildren(legend, h("div", { class: "board-wrap" }, h("table", { class: "board" }, h("thead", {}, head), h("tbody", {}, rows))));
}

function renderPanels(v) {
  renderDraft(v);
  renderTeam(v);
  renderBoard(v);
}

function showTab(tab) {
  app.tab = tab;
  localStorage.setItem("tab", tab);
  for (const t of TABS) el.panels[t].hidden = t !== tab;
  for (const b of el.tabs) {
    b.classList.toggle("active", b.dataset.tab === tab);
    b.setAttribute("aria-selected", String(b.dataset.tab === tab));
  }
}

function recompute(now) {
  const key = JSON.stringify([app.draft.status, app.draft.draft_order, app.draft.slot_to_roster_id, pickSignature(app.picks), app.traded, app.users]);
  if (key === app.viewKey) return null;
  return { key, view: deriveState({ snapshot: app.snapshot, draft: app.draft, picks: app.picks, tradedPicks: app.traded, users: app.users, now }) };
}

async function fetchOnce() {
  const needUsers = Date.now() - app.usersAt > USERS_REFRESH_MS;
  const [draft, picks, traded, users] = await Promise.all([
    getJson(`/v1/draft/${DRAFT}`),
    getJson(`/v1/draft/${DRAFT}/picks`),
    getJson(`/v1/draft/${DRAFT}/traded_picks`),
    needUsers ? getJson(`/v1/league/${LEAGUE_ID}/users`) : null,
  ]);
  return { draft, picks, traded, users };
}

function refreshStale() {
  el.main.classList.toggle("stale", !el.net.hidden || !el.calc.hidden);
}

function setOffline(offline) {
  el.net.hidden = !offline;
  refreshStale();
}

function onData({ draft, picks, traded, users }) {
  setOffline(false);
  app.draft = draft;
  app.picks = picks;
  app.traded = traded;
  if (users) {
    app.users = users;
    app.usersAt = Date.now();
  }
  app.updatedAt = Date.now();
  const next = recompute(Date.now());
  if (next) {
    renderPanels(next.view);
    app.view = next.view;
    app.viewKey = next.key;
  }
  el.calc.hidden = true;
  refreshStale();
  renderStatus();
}

function onComputeError(err) {
  console.error("Erreur de calcul:", err);
  el.calc.hidden = false;
  refreshStale();
}

function onError(err) {
  console.error("Sleeper API:", err);
  setOffline(true);
}

async function main() {
  for (const b of el.tabs) b.addEventListener("click", () => showTab(b.dataset.tab));
  showTab(app.tab);
  renderStatus();
  app.snapshot = await fetchJson("data/snapshot.json");
  el.foot.textContent = `Données du ${new Date(app.snapshot.generatedAt).toLocaleString("fr-FR")} · API ${API}`;
  setInterval(() => {
    if (app.view) renderStatus();
  }, 1000);
  createPoller({ fetchOnce, onData, onError, onComputeError, delayMs: POLL_MS }).start();
}

main().catch((err) => {
  console.error(err);
  el.status.className = "status";
  el.status.textContent = `Erreur de chargement : ${err.message} — recharge la page.`;
});
