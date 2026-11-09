// FUTCHY's multiplayer diagnostics (futchy.co/admin/multiplayer). The same sign-in as /admin (admin-auth.js); every
// number comes from public.admin_mp_* - which answer only the owners (analytics.is_admin, else 'forbidden') - and
// nothing is ever written into the page itself. Most of it is what the devices reported (client telemetry, delayed,
// untrusted): every value is written as text (textContent), never as HTML, and links are built only from ids we encode.
const { BACKEND, ANON, stored, token, forget } = window.FutchyAuth;

const $ = (id) => document.getElementById(id);
const DEMO_HOST = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const DEMO = DEMO_HOST && new URLSearchParams(location.search).has("demo");
const nf = new Intl.NumberFormat("he-IL");
const nf1 = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 1 });
const isNum = (v) => v !== null && v !== undefined && v !== "" && !Number.isNaN(+v) && Number.isFinite(+v);
const num = (v) => isNum(v) ? nf.format(Math.round(+v)) : "–";
const n1 = (v) => isNum(v) ? nf1.format(+v) : "–";
// Left-to-right islands inside the right-to-left page ("96 ms", "9.11, 16:58" would otherwise read backwards).
const L = (s) => `\u2066${s}\u2069`;
const ms = (v) => isNum(v) ? L(`${nf.format(Math.round(+v))} ms`) : "–";
const kb = (bytes) => isNum(bytes) ? L(`${n1(+bytes / 1024)} KB`) : "–";
const arr = (x) => Array.isArray(x) ? x : [];
const obj = (x) => (x && typeof x === "object" && !Array.isArray(x)) ? x : {};
const str = (v) => (v === null || v === undefined || v === "") ? "–" : String(v);
const sleep = (t) => new Promise((r) => setTimeout(r, t));

function date(ts) { const d = new Date(ts); return Number.isNaN(+d) ? null : d; }
function when(ts) {
  const d = date(ts); if (!d || ts === null || ts === undefined) return "–";
  return L(d.toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }));
}
function clock(ts) {
  const d = date(ts); if (!d || ts === null || ts === undefined) return "–";
  return L(d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
}
function duration(sec) {
  if (!isNum(sec)) return "–";
  sec = Math.max(0, Math.round(+sec));
  if (sec < 60) return `${sec} שנ׳`;
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return `${m}:${String(s).padStart(2, "0")} דק׳`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} שע׳`;
}
const THERMAL = ["nominal", "fair", "serious", "critical"];
const thermal = (v) => isNum(v) ? (THERMAL[Math.round(+v)] || n1(v)) : "–";

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = String(text);
  return e;
}
const ltr = (text, cls) => { const s = el("span", "ltr" + (cls ? " " + cls : ""), text); s.dir = "ltr"; return s; };
// Links only ever point into this page: "#match=<id>", "#issue=<id>", built from an encoded id.
function link(hash, text) { const a = el("a", "lnk", text); a.href = hash; return a; }
const matchLink = (id, text) => (id === null || id === undefined || id === "") ? el("span", null, "–") : link("#match=" + encodeURIComponent(String(id)), text ?? String(id));
const issueLink = (id, text) => (id === null || id === undefined || id === "") ? el("span", null, "–") : link("#issue=" + encodeURIComponent(String(id)), text ?? `#${id}`);
const SOURCES = { server: ["src src--server", "server (live)", "מהרשומות של השרת, ברגע זה"],
                  client: ["src src--client", "client telemetry (delayed)", "מה שהמכשירים דיווחו - מתעכב, ולא מאומת"] };
function src(kind) { const [c, t, h] = SOURCES[kind] || SOURCES.client; const s = el("span", c, t); s.title = h; return s; }
const CLASS_SAFE = (v) => String(v ?? "").toLowerCase().replace(/[^a-z_]/g, "");
function badge(text, cls) { return el("span", "badge" + (cls ? " " + cls : ""), text); }
const sev = (v) => badge(str(v), "sev--" + CLASS_SAFE(v));
const EMAIL = { disabled: "כבוי · disabled", sent: "נשלח · sent", quota: "מכסה · quota", failed: "נכשל · failed",
                pending: "ממתין · pending", sending: "בשליחה · sending", expired: "פג · expired" };
const emailBadge = (v) => badge(EMAIL[v] || str(v), "em--" + CLASS_SAFE(v));
const statusBadge = (v) => badge(str(v), "st--" + CLASS_SAFE(v));
function status(text) { $("status").textContent = text || ""; }

// ---- Talking to the server -----------------------------------------------------------------------------------

class Forbidden extends Error {}
class NoSession extends Error {}

async function rpc(name, args = {}) {
  if (DEMO) return demoRpc(name, args);
  for (let attempt = 0; ; attempt++) {
    const t = await token();
    if (!t) throw new NoSession();
    const r = await fetch(`${BACKEND}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify(args) });
    const j = await r.json().catch(() => null);
    if (r.status === 401 || r.status === 403 || (j && /forbidden/.test(j.message || ""))) throw new Forbidden();
    if (!r.ok || !j) {
      const msg = j?.message || `שגיאה ${r.status}`;
      // A cold server cache times out once: the first try warms it, a second one 3 s later loads (as /admin does).
      if (attempt === 0 && /timeout/i.test(msg)) { status("טוענים…"); await sleep(3000); continue; }
      throw new Error(msg);
    }
    return j;
  }
}

// Every loader ends here on an error: no access wipes the page and shows the gate; anything else is a line of text.
function failed(e, what) {
  if (e instanceof Forbidden) {
    const who = stored()?.email || "";
    forget();
    gate(who ? `לחשבון ${who} אין גישה לעמוד הזה.` : "אין גישה לעמוד הזה.");
  } else if (e instanceof NoSession) {
    gate("");
  } else {
    status(`לא הצלחנו לטעון ${what}: ${e.message}`);
  }
}

// ---- The gate --------------------------------------------------------------------------------------------------

let signedIn = false;
const DATA = ["ov-server", "ov-client", "ov-cards", "live", "matches", "v-match", "issue-one", "issues", "reports",
              "alerts", "builds", "cfg", "rcp"];
const TEXTS = ["ov-meta", "live-stamp", "builds-meta", "cfg-meta", "alerts-note", "stamp", "set-mail-note"];

function gate(note) {
  signedIn = false;
  stopTimers();
  for (const id of DATA) $(id).replaceChildren();
  for (const id of TEXTS) $(id).textContent = "";
  resetState();
  $("board").hidden = true; $("tools").hidden = true; $("gate").hidden = false;
  $("gate-note").textContent = note || "";
  status("");
}

function enter() {
  signedIn = true;
  $("gate").hidden = true; $("board").hidden = false; $("tools").hidden = false;
}

// ---- Views and deep links (#overview, #matches, #match=<id>, #issues, #issue=<id>, ...) ------------------------

const VIEWS = ["overview", "matches", "match", "issues", "reports", "alerts", "builds", "settings"];
let view = "", loaded = {};
let state;
function resetState() {
  loaded = {};
  state = { matches: { rows: [], next: null, filters: {} }, issues: { rows: [], next: null, filters: { status: "open" } },
            reports: { rows: [], next: null, filters: {} }, alerts: { rows: [], next: null }, match: null, cfg: null, rcp: [] };
}
resetState();

function safeDecode(s) { try { return decodeURIComponent(s); } catch { return s; } }

function route() {
  if (!signedIn) return;
  const h = location.hash.slice(1);
  const m = /^(match|issue)=(.{1,200})$/.exec(h);
  let next = VIEWS.includes(h) && h !== "match" ? h : "overview";
  if (m) next = m[1] === "match" ? "match" : "issues";
  view = next;
  for (const v of VIEWS) $("v-" + v).hidden = v !== view;
  const tab = view === "match" ? "matches" : view;
  for (const a of document.querySelectorAll("#tabs a")) {
    if (a.dataset.view === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  status("");
  schedule();
  if (view === "overview") { loadOverview(); loadLive(); }
  else if (view === "match") loadMatch(safeDecode(m[2]));
  else if (view === "issues") { if (!loaded.issues) loadIssues(false); showIssue(m ? safeDecode(m[2]) : null); }
  else if (!loaded[view]) ({ matches: () => loadMatches(false), reports: () => loadReports(false), alerts: () => loadAlerts(false),
                             builds: loadBuilds, settings: loadSettings })[view]();
  if (m) window.scrollTo(0, 0);
}

// Live every 15 s and the overview every 60 s - only while this browser tab is visible and the overview is open.
let liveTimer = 0, ovTimer = 0;
function stopTimers() { clearInterval(liveTimer); clearInterval(ovTimer); liveTimer = ovTimer = 0; }
function schedule() {
  stopTimers();
  if (!signedIn || document.hidden || view !== "overview") return;
  liveTimer = setInterval(loadLive, 15000);
  ovTimer = setInterval(loadOverview, 60000);
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && signedIn && view === "overview") loadLive();
  schedule();
});

function form(id) {
  const out = {};
  for (const [k, v] of new FormData($(id))) { const t = String(v).trim(); if (t) out[k] = t; }
  return out;
}
function dayStart(v, plusDays = 0) { const d = new Date(v + "T00:00:00"); d.setDate(d.getDate() + plusDays); return d.toISOString(); }

// ---- Overview ---------------------------------------------------------------------------------------------------

function tile(label, value, sub, opts = {}) {
  const t = el("div", "tile" + (opts.live ? " tile--live" : "") + (opts.warn ? " tile--warn" : "") + (opts.crit ? " tile--crit" : ""));
  const head = el("div", "tile__label");
  if (opts.live) head.append(el("span", "pulse"));
  head.append(document.createTextNode(label));
  head.append(src(opts.src || "client"));
  t.append(head, el("div", "tile__value", value));
  if (sub) t.append(el("div", "tile__sub", sub));
  if (opts.hint) t.title = opts.hint;
  return t;
}

function table(cols, rows, opts = {}) {
  if (!rows.length) return el("p", "empty", opts.empty || "אין נתונים.");
  const t = el("table");
  const head = el("tr");
  for (const c of cols) head.append(el("th", c.num ? "n" : null, c.label));
  const thead = el("thead"); thead.append(head); t.append(thead);
  const body = el("tbody");
  for (const r of rows) {
    const tr = el("tr");
    if (opts.rowClass) { const c = opts.rowClass(r); if (c) tr.className = c; }
    for (const c of cols) {
      const td = el("td", c.num ? "n" : null);
      const v = c.get(r);
      if (v instanceof Node) td.append(v);
      else td.textContent = c.fmt ? c.fmt(v) : (c.num ? num(v) : str(v));
      if (c.clip && !(v instanceof Node)) { const s = el("span", "clip", td.textContent); s.title = td.textContent; s.dir = "auto"; td.replaceChildren(s); }
      tr.append(td);
    }
    body.append(tr);
  }
  t.append(body);
  const wrap = el("div", "scroll" + (opts.tall ? " scroll--tall" : "")); wrap.append(t);
  return wrap;
}

function card(title, sub, body, opts = {}) {
  const c = el("article", "card" + (opts.wide ? " wide" : ""));
  const h = el("div", "card__head");
  const h2 = el("h2", null, title);
  h.append(h2);
  if (opts.src) h.append(src(opts.src));
  c.append(h);
  if (sub) c.append(el("p", "sub", sub));
  c.append(body);
  return c;
}

async function loadOverview() {
  const f = form("f-overview");
  try {
    const d = await rpc("admin_mp_overview", { p_env: f.env || null, p_build: f.build || null, p_hours: +(f.hours || 24) });
    if (!signedIn || view !== "overview") return;
    renderOverview(d);
    $("stamp").textContent = DEMO ? "נתוני דוגמה" : `עודכן ${clock(d.updated_at)}`;
  } catch (e) { failed(e, "את הסקירה"); }
}

function renderOverview(d) {
  const s = obj(d.server), c = obj(d.client), rtt = obj(c.rtt), rl = obj(c.rate_limited), oi = obj(c.open_issues);
  const scope = [d.env ? `env ${d.env}` : "כל הסביבות", d.build_number ? `build ${d.build_number}` : "כל הבילדים"].join(" · ");
  $("ov-meta").textContent = `עודכן ${clock(d.updated_at)} · ${scope} · טלמטריה מאז ${when(d.since)} (${num(d.hours)} שע׳)`;
  $("ov-server").replaceChildren(
    tile("מחוברים עכשיו", num(s.online_now), "שחקנים שהשרת ראה לאחרונה", { src: "server", live: true }),
    tile("מחפשים משחק", num(s.searching), `${num(s.searching_players)} שחקנים בתור`, { src: "server" }),
    tile("משחקים פעילים", num(s.active_matches), `התחילו ב-${num(s.active_window_min)} הדקות האחרונות`, { src: "server" }),
    tile("שודכו לאחרונה", num(s.matched_recent), `ב-${num(s.active_window_min)} הדקות האחרונות`, { src: "server" }));
  $("ov-client").replaceChildren(
    tile("משחקים", num(c.matches), `${num(c.completed)} הושלמו · ${num(c.completed_today)} היום`),
    tile("משחקים עם חריגת סנכרון", num(c.sync_anomaly_matches), "קפיצות כדור/גוף, תוצאה לא תואמת…", { warn: +c.sync_anomaly_matches > 0 }),
    tile("ניתוקים", num(c.disconnects), `${num(c.reconnects)} חיבורים מחדש`, { warn: +c.disconnects > 0 }),
    tile("חיפושים שנכשלו", num(c.failed_searches), "שידוך שלא הצליח"),
    tile("הצטרפויות שנכשלו", num(c.failed_joins), `${num(c.game_not_found)} מהן GameNotFound`, { warn: +c.failed_joins > 0 }),
    tile("שגיאות קריטיות", num(c.critical_errors), `${num(c.warnings)} אזהרות`, { crit: +c.critical_errors > 0 }),
    tile("RTT", isNum(rtt.avg_ms) ? L(`${n1(rtt.avg_ms)} ms`) : "–", `p95 ${ms(rtt.p95_ms)} · ${num(rtt.samples)} דגימות (${str(rtt.source)})`),
    tile("תקלות פתוחות", num(oi.total), `${num(oi.critical)} קריטיות`, { crit: +oi.critical > 0 }),
    tile("נחסמו בהגבלת קצב", num(rl.events), `אירועים · ${num(rl.installs)} מכשירים`, { warn: +rl.events > 0 }));
  const fails = Object.entries(obj(c.fails_by_kind)).map(([kind, n]) => ({ kind, n })).sort((a, b) => (+b.n || 0) - (+a.n || 0));
  $("ov-cards").replaceChildren(card("כישלונות לפי סוג", "mp_fail בתקופה", table([
    { label: "kind", get: (r) => ltr(r.kind) }, { label: "פעמים", get: (r) => r.n, num: true }], fails, { empty: "אין כישלונות." }), { src: "client" }));
}

$("f-overview").addEventListener("submit", (e) => { e.preventDefault(); loadOverview(); });
$("f-overview").addEventListener("change", () => loadOverview());

// ---- Live -------------------------------------------------------------------------------------------------------

const scoreText = (s) => { const o = obj(s); return (o.a === undefined && o.b === undefined) || s === null ? "–" : `${str(o.a)}:${str(o.b)}`; };

async function loadLive() {
  try {
    const d = await rpc("admin_mp_live");
    if (!signedIn || view !== "overview") return;
    $("live-stamp").textContent = `עודכן ${clock(d.updated_at)} · חלון ${num(d.window_s)} שנ׳`;
    const matches = arr(d.matches), only = arr(d.server_only);
    const box = $("live");
    box.replaceChildren(
      table([
        { label: "match_id", get: (r) => matchLink(r.match_id) },
        { label: "מצב", get: (r) => r.mode }, { label: "מקום", get: (r) => r.venue },
        { label: "env · build", get: (r) => ltr(`${str(r.env)} · ${str(r.build_number)}`) },
        { label: "מכשירים", get: (r) => r.players, num: true },
        { label: "host", get: (r) => obj(r.host).model },
        { label: "משך", get: (r) => r.duration_s, fmt: duration, num: true },
        { label: "תוצאה", get: (r) => scoreText(r.score) },
        { label: "RTT", get: (r) => r.rtt_ms, fmt: ms, num: true },
        { label: "אזהרות", get: (r) => r.warnings, num: true },
        { label: "קריטי", get: (r) => r.criticals, num: true },
        { label: "server", get: (r) => r.server ? `${str(obj(r.server).status)} · ${clock(obj(r.server).created_at)}` : "–" },
      ], matches, { empty: "אין עכשיו משחקים עם טלמטריה.", rowClass: (r) => +r.criticals > 0 ? "is-on" : "" }));
    if (only.length) {
      const h = el("h2", "group"); h.append(src("server"), document.createTextNode("התחילו בשרת, אין מהם טלמטריה"));
      box.append(h, table([
        { label: "match_id", get: (r) => matchLink(r.match_id) },
        { label: "סטטוס", get: (r) => r.status }, { label: "בני אדם", get: (r) => r.humans, num: true },
        { label: "התחיל", get: (r) => r.created_at, fmt: clock }, { label: "משך", get: (r) => r.duration_s, fmt: duration, num: true }], only));
    }
  } catch (e) { failed(e, "את המשחקים החיים"); }
}

// ---- Matches ----------------------------------------------------------------------------------------------------

function matchFilters() {
  const f = form("f-matches");
  if (f.from) f.from = dayStart(f.from); if (f.to) f.to = dayStart(f.to, 1);
  return f;
}

async function loadMatches(more) {
  const st = state.matches;
  if (!more) { st.filters = matchFilters(); st.rows = []; st.next = null; }
  try {
    const d = await rpc("admin_mp_matches", { p_filters: st.filters, p_limit: 50, p_before: more ? st.next : null });
    if (!signedIn) return;
    if (d.ok === false) { $("matches").replaceChildren(el("p", "notice notice--err", d.error === "bad_filter" ? "מסנן לא תקין (תאריך?)." : `שגיאה: ${str(d.error)}`)); return; }
    st.rows = st.rows.concat(arr(d.matches)); st.next = d.next_before || null;
    loaded.matches = true;
    renderMatches();
  } catch (e) { failed(e, "את המשחקים"); }
}

function moreButton(st, load, noun) {
  const box = el("div", "more");
  box.append(el("span", null, `${num(st.rows.length)} ${noun}`));
  if (st.next) { const b = el("button", "ghost", "עוד"); b.type = "button"; b.addEventListener("click", () => { b.disabled = true; load(true); }); box.append(b); }
  else if (st.rows.length) box.append(el("span", null, "· זה הכל"));
  return box;
}

function renderMatches() {
  const st = state.matches;
  $("matches").replaceChildren(
    (() => { const h = el("div", "card__head"); h.append(el("h2", null, "משחקים"), src("client")); return h; })(),
    el("p", "sub", "מהחדש לישן, לפי האירוע האחרון שהגיע. חריגות = חריגות סנכרון (לא FPS/זיכרון/חום של המכשיר)."),
    table([
      { label: "אחרון", get: (r) => r.last_at, fmt: when },
      { label: "match_id", get: (r) => matchLink(r.match_id) },
      { label: "מצב", get: (r) => r.mode }, { label: "מקום", get: (r) => r.venue },
      { label: "env", get: (r) => r.env }, { label: "build", get: (r) => r.build_number },
      { label: "מכשירים", get: (r) => r.players, num: true },
      { label: "משך", get: (r) => r.duration_s, fmt: duration, num: true },
      { label: "תוצאה", get: (r) => scoreText(r.score) }, { label: "סיום", get: (r) => r.outcome },
      { label: "RTT", get: (r) => r.rtt_ms, fmt: ms, num: true },
      { label: "אזהרות", get: (r) => r.warnings, num: true }, { label: "קריטי", get: (r) => r.criticals, num: true },
      { label: "חריגות", get: (r) => r.sync_anomalies, num: true }, { label: "ניתוקים", get: (r) => r.disconnects, num: true },
      { label: "kinds", get: (r) => arr(r.kinds).join(", "), clip: true },
    ], st.rows, { empty: "אין משחקים שמתאימים למסננים.", tall: true, rowClass: (r) => +r.criticals > 0 ? "is-on" : "" }),
    moreButton(st, loadMatches, "משחקים"));
}

$("f-matches").addEventListener("submit", (e) => { e.preventDefault(); loadMatches(false); });
$("f-matches").addEventListener("reset", () => setTimeout(() => loadMatches(false)));

// ---- One match --------------------------------------------------------------------------------------------------

const COLORS = ["#27d9d4", "#ffb347", "#b28dff", "#ff6fa8", "#4ee38a", "#7fb2ff", "#ffd166", "#f78c6b"];
let tlGroup = false, tlSev = "", tlFind = "", picked = [];

async function loadMatch(id) {
  const box = $("v-match");
  if (state.match?.match_id !== id) { box.replaceChildren(el("p", "status", "טוען…")); picked = []; }
  try {
    const d = await rpc("admin_mp_match", { p_match_id: id });
    if (!signedIn || view !== "match") return;
    state.match = { ...d, match_id: id };
    renderMatch();
  } catch (e) { failed(e, "את המשחק"); }
}

function kv(pairs) {
  const dl = el("dl", "kv");
  for (const [k, v] of pairs) {
    const d = el("div"); d.append(el("dt", null, k));
    const dd = el("dd"); if (v instanceof Node) dd.append(v); else dd.textContent = str(v);
    d.append(dd); dl.append(d);
  }
  return dl;
}

function devicesOf(d) {
  const list = arr(d.devices).map((x, i) => ({ ...obj(x), color: COLORS[i % COLORS.length], i }));
  const byId = new Map(list.map((x) => [String(x.install_id), x]));
  return { list, byId };
}
const devName = (x, host) => `${x.slot !== undefined && x.slot !== null ? "S" + x.slot : "?"} · ${str(x.device_model)}${host && String(host) === String(x.install_id) ? " · host" : ""}`;
function chip(x, text) { const c = el("span", "chip", text); c.style.setProperty("--dev", x ? x.color : "#6f8794"); return c; }

function renderMatch() {
  const d = state.match, m = obj(d.match), srv = obj(d.server), id = d.match_id;
  const box = $("v-match");
  const { list, byId } = devicesOf(d);
  if (!picked.length) picked = list.slice(0, 4).map((x) => String(x.install_id));

  const head = el("div", "mhead");
  const h1 = el("h1"); h1.append(ltr(id));
  const actions = el("div", "actions");
  const back = el("a", "ghost", "→ כל המשחקים"); back.href = "#matches";
  const exp = el("button", "btn", "ייצוא לסוכן · Export for agent"); exp.type = "button";
  exp.addEventListener("click", () => exportMatch(id, exp));
  actions.append(back, exp);
  head.append(h1, actions);

  const parts = [head];
  if (d.ok === false && !srv.online_match && !srv.mm_match) {
    parts.push(el("p", "notice notice--err", "לא נמצא משחק עם המזהה הזה (לא בטלמטריה ולא בשרת)."));
    box.replaceChildren(...parts); return;
  }

  const grid = el("div", "grid");
  grid.append(card("המשחק", "מה שהמכשירים דיווחו", d.match ? kv([
    ["מצב", m.mode], ["מקום", m.venue], ["env", m.env], ["build", m.build_number],
    ["התחלה", when(m.first_at)], ["אחרון", when(m.last_at)], ["משך", duration(m.duration_s)],
    ["תוצאה", scoreText(m.score)], ["סיום", m.outcome], ["מכשירים", num(m.players)],
    ["host", (() => { const h = byId.get(String(m.host_install)); return h ? chip(h, devName(h)) : str(m.host_install); })()],
    ["mm_id", m.mm_id ? ltr(m.mm_id) : "–"], ["אירועים", num(m.events)], ["אזהרות", num(m.warnings)], ["קריטי", num(m.criticals)],
    ["כישלונות", num(m.fails)], ["חריגות (סנכרון)", `${num(m.anomalies)} (${num(m.sync_anomalies)})`],
    ["ניתוקים / חזרות", `${num(m.disconnects)} / ${num(m.reconnects)}`], ["RTT", ms(m.rtt_ms)],
    ["kinds", arr(m.kinds).join(", ") || "–"]]) : el("p", "empty", "אין טלמטריה מהמשחק הזה."), { src: "client", wide: true }));
  const om = obj(srv.online_match), mm = obj(srv.mm_match);
  grid.append(card("השרת", "online_matches + mm_matches", kv([
    ["סטטוס", om.status], ["outcome", om.outcome], ["מנצח", om.winner], ["נוצר", when(om.created_at)], ["הוכרע", when(om.decided_at)],
    ["why", om.why], ["שידוך", mm.match_id ? ltr(mm.match_id) : "–"], ["מקום", mm.venue], ["צד A / B", mm.match_id ? `${num(mm.side_a)} / ${num(mm.side_b)}` : "–"]]),
    { src: "server" }));
  parts.push(grid);

  // Devices side by side
  parts.push(compareCard(list, m.host_install));
  // The timeline
  parts.push(timelineCard(d, list, byId, m.host_install));

  // Issues, reports, traces, net summaries
  const more = el("div", "grid");
  more.append(card("תקלות מקושרות", null, issuesTable(arr(d.issues), false), { src: "client", wide: true }));
  more.append(card("דיווחי שחקנים", null, table([
    { label: "ref", get: (r) => ltr(r.ref) }, { label: "מתי", get: (r) => r.created_at, fmt: when },
    { label: "טקסט", get: (r) => r.text, clip: true }, { label: "מכשיר", get: (r) => r.device_model },
    { label: "build", get: (r) => r.build_number },
    { label: "trace", get: (r) => r.trace_bytes ? `${kb(r.trace_bytes)}${r.trace_dropped ? " (נחתך)" : ""}` : "–" }],
    arr(d.reports), { empty: "אין דיווחים על המשחק." }), { src: "client" }));
  more.append(card("Traces", "ה-ring buffer בחריגה קשה או בדיווח. התוכן המלא בייצוא.", table([
    { label: "מתי", get: (r) => r.received_at, fmt: clock },
    { label: "מכשיר", get: (r) => { const x = byId.get(String(r.install_id)); return chip(x, x ? devName(x) : `S${str(r.slot)}`); } },
    { label: "סיבה", get: (r) => obj(r.props).trace_reason ?? obj(r.props).reason },
    { label: "גודל", get: (r) => { const b = obj(r.props)._trace_bytes; return kb(b); } }],
    arr(d.traces), { empty: "אין traces." }), { src: "client" }));
  more.append(card("online_net_summary", "סיכומי הרשת הקיימים של אותם מכשירים", table([
    { label: "מכשיר", get: (r) => { const x = byId.get(String(r.install_id)); return chip(x, x ? devName(x) : "?"); } },
    { label: "מתי", get: (r) => r.received_at, fmt: clock },
    { label: "props", get: (r) => propsLine(r.props), clip: true }], arr(d.online_net_summary), { empty: "אין." }), { src: "client", wide: true }));
  parts.push(more);
  box.replaceChildren(...parts);
}

const METRICS = [
  ["device_model", "דגם"], ["os_version", "מערכת"], ["platform", "פלטפורמה"], ["app_version", "גרסה"], ["build_number", "build"],
  ["commit", "commit"], ["env", "env"], ["role", "תפקיד"], ["events", "אירועים", num],
  ["fps_avg", "FPS ממוצע", n1, -1], ["fps_min", "FPS מינימום", n1, -1], ["frame_max_ms", "פריים ארוך ביותר", ms, 1],
  ["mem_footprint_max_mb", "זיכרון מקס׳ (MB)", num, 1], ["mem_available_min_mb", "זיכרון פנוי מינ׳ (MB)", num, -1],
  ["thermal_max", "חום מקס׳", thermal, 1], ["rtt_avg_ms", "RTT ממוצע", ms, 1], ["rtt_p95_ms", "RTT p95", ms, 1],
  ["jitter_ms", "ג׳יטר", ms, 1], ["loss_pct", "איבוד חבילות %", n1, 1], ["disconnects", "ניתוקים", num, 1],
  ["reconnects", "חיבורים מחדש", num, 1], ["ball_corrections", "תיקוני כדור", num, 1], ["body_corrections", "תיקוני גוף", num, 1],
  ["errors", "שגיאות", num, 1], ["warnings", "אזהרות", num, 1], ["anomalies", "חריגות", num, 1],
  ["first_at", "אירוע ראשון", clock], ["last_at", "אירוע אחרון", clock]];

function compareCard(list, host) {
  const c = el("article", "card wide");
  const h = el("div", "card__head"); h.append(el("h2", null, "השוואת מכשירים"), src("client")); c.append(h);
  if (!list.length) { c.append(el("p", "empty", "אין מכשירים.")); return c; }
  c.append(el("p", "sub", "בחרו 2–4 מכשירים. בכתום: הגרוע מביניהם בשורה."));
  const pick = el("div", "devpick");
  for (const x of list) {
    const lab = el("label"); const cb = el("input"); cb.type = "checkbox"; cb.checked = picked.includes(String(x.install_id));
    cb.addEventListener("change", () => {
      const k = String(x.install_id);
      if (cb.checked) { if (picked.length >= 4) { cb.checked = false; status("אפשר להשוות עד 4 מכשירים."); return; } picked.push(k); }
      else picked = picked.filter((p) => p !== k);
      status(""); c.replaceWith(compareCard(list, host));
    });
    lab.append(cb, chip(x, devName(x, host)));
    pick.append(lab);
  }
  c.append(pick);
  const cols = list.filter((x) => picked.includes(String(x.install_id)));
  if (!cols.length) { c.append(el("p", "empty", "לא נבחר מכשיר.")); return c; }
  const t = el("table", "cmp");
  const hr = el("tr"); hr.append(el("th", null, ""));
  for (const x of cols) { const th = el("th"); th.append(chip(x, devName(x, host))); hr.append(th); }
  const thead = el("thead"); thead.append(hr); t.append(thead);
  const body = el("tbody");
  const idRow = el("tr"); idRow.append(el("th", null, "install_id")); idRow.firstChild.scope = "row";
  for (const x of cols) { const td = el("td"); td.append(ltr(String(x.install_id ?? "").slice(0, 8) + "…")); td.title = str(x.install_id); idRow.append(td); }
  body.append(idRow);
  for (const [key, label, fmt, dir] of METRICS) {
    const tr = el("tr"); const th = el("th", null, label); th.scope = "row"; tr.append(th);
    const vals = cols.map((x) => x[key]);
    let worst = null;
    if (dir && cols.length > 1) {
      const nums = vals.filter(isNum).map(Number);
      if (nums.length > 1 && Math.max(...nums) !== Math.min(...nums)) worst = dir > 0 ? Math.max(...nums) : Math.min(...nums);
    }
    vals.forEach((v) => tr.append(el("td", "n" + (worst !== null && isNum(v) && +v === worst ? " is-worst" : ""), fmt ? fmt(v) : str(v))));
    body.append(tr);
  }
  t.append(body);
  const w = el("div", "scroll scroll--tall"); w.append(t); c.append(w);
  return c;
}

function short(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "object") { const s = JSON.stringify(v); return s.length > 60 ? s.slice(0, 57) + "…" : s; }
  const s = String(v); return s.length > 80 ? s.slice(0, 77) + "…" : s;
}
function propsLine(p, skip = []) {
  const e = Object.entries(obj(p)).filter(([k]) => !skip.includes(k));
  return e.slice(0, 10).map(([k, v]) => `${k}=${short(v)}`).join("  ") + (e.length > 10 ? `  (+${e.length - 10})` : "");
}

function timelineCard(d, list, byId, host) {
  const c = el("article", "card wide");
  const h = el("div", "card__head"); h.append(el("h2", null, "ציר זמן משולב"), src("client")); c.append(h);
  c.append(el("p", "sub", "לפי tick ושעון מתוקן (at_ms = שעון המכשיר פחות ההפרש שלו מה-host). הזמן יחסי לאירוע הראשון; מעבר עכבר מראה את השעה."));
  const tl = arr(d.timeline);
  if (d.timeline_truncated) c.append(el("p", "notice", `מוצגים ${num(tl.length)} האירועים הראשונים בלבד. הייצוא כולל יותר (עד 5,000).`));

  const tools = el("div", "tl-tools");
  const g = el("label"); const gcb = el("input"); gcb.type = "checkbox"; gcb.checked = tlGroup; g.append(gcb, document.createTextNode("קיבוץ לפי מכשיר (install_id)"));
  const sl = el("label", null, "חומרה"); const sel = el("select");
  for (const [v, t] of [["", "הכל"], ["warning", "warning ומעלה"], ["critical", "critical"]]) { const o = el("option", null, t); o.value = v; o.selected = v === tlSev; sel.append(o); }
  sl.append(sel);
  const fl = el("label", null, "kind"); const find = el("input"); find.type = "search"; find.placeholder = "mp_anomaly, ball_snap…"; find.value = tlFind; fl.append(find);
  const legend = el("div", "devpick"); for (const x of list) legend.append(chip(x, devName(x, host)));
  tools.append(g, sl, fl);
  c.append(tools, legend);
  const out = el("div"); c.append(out);

  const t0 = Math.min(...tl.map((e) => +e.at_ms).filter(Number.isFinite));
  const rel = (v) => {
    if (!isNum(v) || !Number.isFinite(t0)) return "–";
    const dt = +v - t0, sign = dt < 0 ? "−" : "+", a = Math.abs(dt);
    return `${sign}${String(Math.floor(a / 60000)).padStart(2, "0")}:${String(Math.floor(a / 1000) % 60).padStart(2, "0")}.${String(Math.floor(a % 1000)).padStart(3, "0")}`;
  };
  const rank = { critical: 3, warning: 2 };
  function row(e) {
    const x = byId.get(String(e.install_id));
    const li = el("li", "sev-" + CLASS_SAFE(e.severity));
    li.style.setProperty("--dev", x ? x.color : "#6f8794");
    const t = el("span", "t", rel(e.at_ms)); t.title = `at ${clock(+e.at_ms)} · received ${clock(e.received_at)} · mono ${str(e.mono_ms)}`;
    const k = el("span", "k");
    const p = obj(e.props);
    const sub = p.kind !== undefined && typeof p.kind !== "object" ? ` · ${short(p.kind)}` : "";
    k.append(chip(x, x ? `S${str(x.slot)}` : "?"), ltr(str(e.kind) + sub, "kind"));
    if (e.severity && e.severity !== "info") k.append(sev(e.severity));
    const pr = el("div", "p");
    const line = propsLine(p, ["clock_offset_ms"]);
    if (Object.keys(p).length) {
      const det = el("details"); det.append(el("summary", null, line || "{}"));
      det.addEventListener("toggle", () => { if (det.open && det.childNodes.length === 1) det.append(el("pre", "json", JSON.stringify(p, null, 2))); });
      pr.append(det);
    }
    li.append(t, el("span", "tick", isNum(e.tick) ? `#${e.tick}` : "–"), k, pr);
    return li;
  }
  function draw() {
    const q = tlFind.trim().toLowerCase();
    const rows = tl.filter((e) => (!tlSev || (rank[e.severity] || 0) >= rank[tlSev])
      && (!q || `${e.kind} ${obj(e.props).kind ?? ""}`.toLowerCase().includes(q)));
    if (!rows.length) { out.replaceChildren(el("p", "empty", tl.length ? "אין אירועים שמתאימים." : "אין אירועים.")); return; }
    if (!tlGroup) {
      const ul = el("ul", "tl"); for (const e of rows) ul.append(row(e));
      const w = el("div", "scroll scroll--tall"); w.append(ul); out.replaceChildren(w);
      return;
    }
    const lanes = el("div", "lanes");
    const groups = new Map();
    for (const e of rows) { const k = String(e.install_id); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    const order = [...list.map((x) => String(x.install_id)), ...[...groups.keys()].filter((k) => !byId.has(k))];
    for (const k of order) {
      if (!groups.has(k)) continue;
      const x = byId.get(k);
      const lane = el("section", "lane");
      const h3 = el("h3"); h3.append(chip(x, x ? devName(x, host) : k), document.createTextNode(` ${num(groups.get(k).length)} אירועים`));
      const ul = el("ul", "tl"); for (const e of groups.get(k)) ul.append(row(e));
      const w = el("div", "scroll scroll--tall"); w.append(ul);
      lane.append(h3, w); lanes.append(lane);
    }
    out.replaceChildren(lanes);
  }
  gcb.addEventListener("change", () => { tlGroup = gcb.checked; draw(); });
  sel.addEventListener("change", () => { tlSev = sel.value; draw(); });
  find.addEventListener("input", () => { tlFind = find.value; draw(); });
  draw();
  return c;
}

async function exportMatch(id, btn) {
  btn.disabled = true; const label = btn.textContent; btn.textContent = "מכין…";
  try {
    const j = await rpc("admin_mp_export", { p_match_id: id });
    const blob = new Blob([JSON.stringify(j, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `futchy-mp-${String(id).replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80)}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    status(`הורד ${a.download} (${kb(blob.size)}).`);
  } catch (e) { failed(e, "את הייצוא"); }
  finally { btn.disabled = false; btn.textContent = label; }
}

// ---- Issues -----------------------------------------------------------------------------------------------------

// open -> ack / resolve; ack -> resolve / reopen; resolved -> reopen.
const NEXT_STATUS = { open: [["ack", "ack"], ["resolved", "resolve"]], ack: [["resolved", "resolve"], ["open", "reopen"]],
                      resolved: [["open", "reopen"]] };
function issueActions(r, after) {
  const box = el("span", "filters__actions");
  for (const [st, label] of NEXT_STATUS[r.status] || NEXT_STATUS.open) {
    const b = el("button", (st === "resolved" ? "btn" : "ghost") + " btn--small", label); b.type = "button";
    b.addEventListener("click", () => setIssue(r.id, st, b, after));
    box.append(b);
  }
  return box;
}

function issuesTable(rows, actions = true) {
  return table([
    { label: "#", get: (r) => issueLink(r.id) },
    { label: "חומרה", get: (r) => sev(r.severity) }, { label: "סטטוס", get: (r) => statusBadge(r.status) },
    { label: "kind", get: (r) => ltr(str(r.kind)) }, { label: "כותרת", get: (r) => r.title, clip: true },
    { label: "env", get: (r) => r.env }, { label: "build", get: (r) => r.build_number },
    { label: "פעמים", get: (r) => r.count, num: true },
    { label: "ראשון", get: (r) => r.first_seen, fmt: when }, { label: "אחרון", get: (r) => r.last_seen, fmt: when },
    { label: "משחק", get: (r) => r.match_id ? matchLink(r.match_id) : (arr(r.sample_matches)[0] ? matchLink(arr(r.sample_matches)[0]) : "–") },
    { label: "רגרסיה של", get: (r) => r.regression_of ? issueLink(r.regression_of) : "–" },
    ...(actions ? [{ label: "", get: (r) => issueActions(r, () => renderIssues()) }] : []),
  ], rows, { empty: "אין תקלות.", tall: true, rowClass: (r) => String(r.id) === shownIssue ? "is-on" : "" });
}

async function loadIssues(more) {
  const st = state.issues;
  if (!more) { st.filters = form("f-issues"); st.rows = []; st.next = null; }
  try {
    const d = await rpc("admin_mp_issues", { p_filters: st.filters, p_limit: 50, p_before: more ? st.next : null });
    if (!signedIn) return;
    if (d.ok === false) { $("issues").replaceChildren(el("p", "notice notice--err", `שגיאה: ${str(d.error)}`)); return; }
    st.rows = st.rows.concat(arr(d.issues)); st.next = d.next_before || null;
    loaded.issues = true;
    renderIssues();
  } catch (e) { failed(e, "את התקלות"); }
}

function renderIssues() {
  const st = state.issues;
  const h = el("div", "card__head"); h.append(el("h2", null, "תקלות"), src("client"));
  $("issues").replaceChildren(h, el("p", "sub", "חריגות וכישלונות שקובצו לפי kind · env · build. ack = ראינו; resolve = טופל (חזרה בבילד חדש יותר נפתחת כרגרסיה)."),
    issuesTable(st.rows), moreButton(st, loadIssues, "תקלות"));
}

async function setIssue(id, status_, btn, after) {
  btn.disabled = true;
  try {
    const d = await rpc("admin_mp_issue_set", { p_id: +id, p_status: status_ });
    if (d.ok === false) { status(`לא עודכן: ${str(d.error)}`); btn.disabled = false; return; }
    const upd = obj(d.issue);
    for (const r of state.issues.rows) if (String(r.id) === String(upd.id)) Object.assign(r, upd);
    if (state.oneIssue && String(state.oneIssue.id) === String(upd.id)) Object.assign(state.oneIssue, upd);
    status(`תקלה #${upd.id}: ${upd.status}`);
    after?.();
    if (shownIssue) renderOneIssue();
  } catch (e) { failed(e, "את העדכון"); }
}

// #issue=<id>: the server has no "one issue" call, so the list is paged (all statuses) until the id turns up.
let shownIssue = null;
async function showIssue(id) {
  shownIssue = id;
  const box = $("issue-one");
  if (!id) { box.replaceChildren(); state.oneIssue = null; return; }
  box.replaceChildren(el("p", "status", "מחפש את התקלה…"));
  let found = state.issues.rows.find((r) => String(r.id) === id) || null;
  try {
    let before = null;
    for (let i = 0; !found && i < 10; i++) {
      const d = await rpc("admin_mp_issues", { p_filters: {}, p_limit: 200, p_before: before });
      if (d.ok === false) break;
      found = arr(d.issues).find((r) => String(r.id) === id) || null;
      before = d.next_before; if (!before) break;
    }
  } catch (e) { failed(e, "את התקלה"); return; }
  if (shownIssue !== id) return;
  state.oneIssue = found;
  renderOneIssue();
  if (loaded.issues) renderIssues();
}

function renderOneIssue() {
  const box = $("issue-one"), r = state.oneIssue;
  if (!r) { box.replaceChildren(el("p", "notice notice--err", `לא נמצאה תקלה #${shownIssue} (אולי נמחקה אחרי שנה).`)); return; }
  const c = el("article", "card wide");
  const h = el("div", "mhead");
  const h1 = el("h1"); h1.append(document.createTextNode(`תקלה #${r.id} · `), ltr(str(r.kind)));
  const act = el("div", "actions"); act.append(issueActions(r, () => { if (loaded.issues) renderIssues(); }));
  const close = el("a", "ghost", "סגירה"); close.href = "#issues"; act.append(close);
  h.append(h1, sev(r.severity), statusBadge(r.status), src("client"), act);
  const title = el("p", "issue-title", str(r.title)); title.dir = "auto";
  c.append(h, title);
  const samples = el("span"); arr(r.sample_matches).forEach((m, i) => { if (i) samples.append(document.createTextNode(", ")); samples.append(matchLink(m)); });
  c.append(kv([["מקור", r.source], ["env", r.env], ["build", r.build_number], ["פעמים", num(r.count)],
    ["ראשון", when(r.first_seen)], ["אחרון", when(r.last_seen)], ["משחק", r.match_id ? matchLink(r.match_id) : "–"],
    ["משחקים לדוגמה", arr(r.sample_matches).length ? samples : "–"], ["רגרסיה של", r.regression_of ? issueLink(r.regression_of) : "–"],
    ["עודכן על ידי", r.updated_by], ["עודכן", when(r.updated_at)], ["טופל", when(r.resolved_at)]]));
  box.replaceChildren(c);
}

$("f-issues").addEventListener("submit", (e) => { e.preventDefault(); loadIssues(false); });

// ---- Player reports ---------------------------------------------------------------------------------------------

async function loadReports(more) {
  const st = state.reports;
  if (!more) { st.filters = form("f-reports"); st.rows = []; st.next = null; }
  try {
    const d = await rpc("admin_mp_reports", { p_filters: st.filters, p_limit: 30, p_before: more ? st.next : null });
    if (!signedIn) return;
    if (d.ok === false) { $("reports").replaceChildren(el("p", "notice notice--err", d.error === "bad_filter" ? "מסנן לא תקין." : `שגיאה: ${str(d.error)}`)); return; }
    st.rows = st.rows.concat(arr(d.reports)); st.next = d.next_before || null;
    loaded.reports = true;
    renderReports();
  } catch (e) { failed(e, "את הדיווחים"); }
}

function renderReports() {
  const st = state.reports;
  const grid = el("div", "reports");
  for (const r of st.rows) {
    const c = el("article", "card report");
    const h = el("div", "card__head");
    const t = el("h2"); t.append(ltr(str(r.ref)), document.createTextNode(` · ${when(r.created_at)}`));
    h.append(t, badge(str(r.env)));
    const who = el("div", "meta");
    who.append(ltr(r.username ? `@${r.username}` : `player ${String(r.player_id ?? "").slice(0, 8)}`));
    const os = String(r.os_version ?? ""), plat = String(r.platform ?? "");
    who.append(ltr(`${str(r.device_model)} · ${plat && !os.startsWith(plat) ? plat + " " : ""}${str(os)}`));
    who.append(ltr(`${str(r.app_version)} (${str(r.build_number)})${r.commit ? " · " + String(r.commit).slice(0, 8) : ""}`));
    const meta = el("div", "meta");
    if (r.match_id) { const s = el("span", null, "משחק: "); s.append(matchLink(r.match_id)); meta.append(s); }
    if (r.issue_id) { const s = el("span", null, "תקלה: "); s.append(issueLink(r.issue_id)); meta.append(s); }
    meta.append(el("span", null, r.has_trace ? `trace ${kb(+r.trace_bytes || 0)}${r.trace_dropped ? " (נחתך)" : ""}` : (r.trace_dropped ? "trace נחתך" : "בלי trace")));
    const text = el("p", "text", r.text ? String(r.text) : "(בלי טקסט)"); text.dir = "auto";
    c.append(h, who, text, meta);
    grid.append(c);
  }
  $("reports").replaceChildren(st.rows.length ? grid : el("p", "empty", "אין דיווחים."), moreButton(st, loadReports, "דיווחים"));
}

$("f-reports").addEventListener("submit", (e) => { e.preventDefault(); loadReports(false); });

// ---- Alerts -----------------------------------------------------------------------------------------------------

// An alert's link_path is the server's ("/admin/multiplayer#issue=12"); only that shape becomes a link here.
function alertLink(p) {
  const m = /^\/admin\/multiplayer#(match|issue)=([A-Za-z0-9_.:%-]{1,120})$/.exec(String(p ?? ""));
  if (!m) return p ? ltr(String(p)) : el("span", null, "–");
  const id = safeDecode(m[2]);
  return m[1] === "match" ? matchLink(id) : issueLink(id);
}

async function loadAlerts(more) {
  const st = state.alerts;
  if (!more) { st.rows = []; st.next = null; }
  try {
    const [d, cfg] = await Promise.all([rpc("admin_mp_alerts", { p_limit: 50, p_before: more ? st.next : null }),
                                        more ? null : rpc("admin_mp_config_get").catch(() => null)]);
    if (!signedIn) return;
    if (cfg) {
      const on = obj(obj(obj(cfg).value).alerts).email_enabled === true;
      $("alerts-note").textContent = on
        ? `שליחת מיילים מופעלת בהגדרות. מייל יוצא רק אם ${L("admin-mail")} פרוס ומוגדר בשרת; סטטוס כל שליחה בעמודה "מייל".`
        : `שליחת מיילים כבויה בהגדרות (${L("alerts.email_enabled")}). ההתראות נרשמות תמיד, עם ${L("email_status = disabled")}.`;
    }
    if (d.ok === false) { $("alerts").replaceChildren(el("p", "notice notice--err", `שגיאה: ${str(d.error)}`)); return; }
    st.rows = st.rows.concat(arr(d.alerts)); st.next = d.next_before || null;
    loaded.alerts = true;
    const h = el("div", "card__head"); h.append(el("h2", null, "התראות"), src("server"));
    $("alerts").replaceChildren(h, el("p", "sub", "מה שסריקת השרת (כל 5 דקות) רשמה, ואיך הלך המייל של כל אחת."),
      table([
        { label: "מתי", get: (r) => r.created_at, fmt: when }, { label: "חומרה", get: (r) => sev(r.severity) },
        { label: "מייל", get: (r) => emailBadge(r.email_status) },
        { label: "rule", get: (r) => ltr(str(r.rule)) }, { label: "env", get: (r) => r.env },
        { label: "כותרת", get: (r) => r.title, clip: true },
        { label: "קישור", get: (r) => alertLink(r.link_path) },
        { label: "שגיאת מייל", get: (r) => r.email_error, clip: true },
        { label: "ניסיונות", get: (r) => r.email_attempts, num: true },
        { label: "נשלח", get: (r) => r.emailed_at, fmt: when },
        { label: "פרטים", get: (r) => propsLine(r.detail), clip: true },
      ], st.rows, { empty: "אין התראות.", tall: true }),
      moreButton(st, loadAlerts, "התראות"));
  } catch (e) { failed(e, "את ההתראות"); }
}

// ---- Build comparison -------------------------------------------------------------------------------------------

const PER = [["failures", "כישלונות"], ["disconnects", "ניתוקים"], ["anomalies", "חריגות"], ["crashes", "קריסות"]];

async function loadBuilds() {
  const f = form("f-builds");
  try {
    const d = await rpc("admin_mp_builds", { p_env: f.env || null, p_days: +(f.days || 30) });
    if (!signedIn) return;
    loaded.builds = true;
    const rows = arr(d.builds);
    $("builds-meta").textContent = `${d.env ? L("env " + d.env) : "כל הסביבות"} · ${num(d.days)} ימים + היום · עודכן ${clock(d.updated_at)}`;
    const max = Object.fromEntries(PER.map(([k]) => [k, Math.max(0.0001, ...rows.map((r) => +obj(r.per_100)[k] || 0))]));
    const bars = (r) => {
      const b = el("div", "bars");
      for (const [k, label] of PER) {
        const v = obj(r.per_100)[k];
        const row = el("div", "bars__row");
        const track = el("div", "bars__track"), fill = el("div", `bars__fill bars__fill--${k}`);
        fill.style.setProperty("--w", `${Math.round(100 * (+v || 0) / max[k])}%`);
        track.append(fill);
        row.append(el("span", null, label), track, el("span", "bars__v", n1(v)));
        b.append(row);
      }
      return b;
    };
    const h = el("div", "card__head"); h.append(src("client"));
    $("builds").replaceChildren(h, table([
      { label: "build", get: (r) => ltr(str(r.build_number)) },
      { label: "לכל 100 משחקים", get: (r) => bars(r) },
      { label: "משחקים", get: (r) => r.matches, num: true }, { label: "הושלמו", get: (r) => r.completed, num: true },
      { label: "שחקנים", get: (r) => r.players, num: true },
      { label: "כישלונות", get: (r) => r.failures, num: true }, { label: "ניתוקים", get: (r) => r.disconnects, num: true },
      { label: "חריגות", get: (r) => r.anomalies, num: true }, { label: "סנכרון", get: (r) => r.sync_anomalies, num: true },
      { label: "קריסות", get: (r) => r.crashes, num: true }, { label: "קריטי", get: (r) => r.criticals, num: true },
      { label: "RTT", get: (r) => r.rtt_avg_ms, fmt: ms, num: true },
      { label: "ימים", get: (r) => ltr(`${str(r.first_day)} – ${str(r.last_day)}`) },
    ], rows, { empty: "אין נתונים לתקופה.", tall: true }));
  } catch (e) { failed(e, "את הבילדים"); }
}

$("f-builds").addEventListener("submit", (e) => { e.preventDefault(); loadBuilds(); });
$("f-builds").addEventListener("change", () => loadBuilds());

// ---- Settings ---------------------------------------------------------------------------------------------------

const CFG_LABELS = {
  profiles: "פרופילי דגימה (מה המשחק שולח)", dev: "dev", testflight: "testflight", production: "production",
  detail_sample: "דגימת פירוט (0–1)", net_sample: "דגימת רשת (0–1)", net_interval_s: "מרווח רשת, שנ׳ (10–600)",
  perf_interval_s: "מרווח ביצועים, שנ׳ (0–600)", trace_on_critical: "trace בחריגה קריטית", max_traces_per_session: "traces לסשן (0–20)",
  thresholds: "ספים (מתי זו חריגה)", ball_snap_cm: "קפיצת כדור, ס״מ", body_snap_cm: "קפיצת גוף, ס״מ", ball_pause_ms: "עצירת כדור, ms (10–10000)",
  rtt_p95_ms: "RTT p95, ms (10–5000)", fps_low: "FPS נמוך (5–120)", fps_low_s: "FPS נמוך לאורך, שנ׳ (1–120)",
  alerts: "התראות", email_enabled: "שליחת מיילים", mail: "מייל", daily_cap: "מקס׳ מיילים ביום (0–300)",
  cooldown_min: "הפסקה בין התראות זהות, דק׳ (5–1440)", window_min: "חלון בדיקה, דק׳ (5–120)", baseline_days: "ימי בסיס (1–30)",
  daily_summary_hour_local: "שעת הסיכום היומי, ישראל (0–23)", envs: "סביבות שמתריעות", rules: "כללים",
  mm_join_fail: "שידוך/הצטרפות נכשלו", disconnect: "ניתוקים", unclean_exit: "יציאות לא נקיות (קריסות)", new_critical: "תקלה קריטית חדשה",
  min_count: "מינ׳ אירועים", min_rate: "שיעור מינ׳ (0–1)", ratio: "פי כמה מהבסיס (1–100)", enabled: "פעיל",
};
const ENVS = ["dev", "testflight", "production"];

async function loadSettings() {
  try {
    const [c, r] = await Promise.all([rpc("admin_mp_config_get"), rpc("admin_alert_recipients_get")]);
    if (!signedIn) return;
    loaded.settings = true;
    state.cfg = c; state.rcp = arr(r.recipients).map((x) => ({ email: String(obj(x).email ?? ""), active: obj(x).active !== false, added_at: obj(x).added_at }));
    drawConfig(obj(c.value));
    drawRecipients();
  } catch (e) { failed(e, "את ההגדרות"); }
}

function drawConfig(value, msg) {
  const f = $("cfg");
  // the e-mail state as the server holds it now, not a fixed text
  const mailOn = obj(obj(value).alerts).email_enabled === true;
  const note = $("set-mail-note");
  note.className = mailOn ? "notice notice--ok" : "notice notice--warn";
  note.textContent = mailOn
    ? `מיילים פעילים: התראות קריטיות וסיכום יומי ב-${str(obj(obj(value).alerts).daily_summary_hour_local ?? 8)}:00 נשלחים לנמענים הפעילים. כל התראה מופיעה גם בלשונית "התראות", עם סטטוס המייל שלה.`
    : `מיילים כבויים. ההתראות נרשמות ומופיעות בלשונית "התראות", אבל שום מייל לא נשלח עד שמדליקים את "שליחת מיילים" כאן.`;
  $("cfg-meta").textContent = state.cfg?.stored_valid === false
    ? "הערך השמור חסר או לא תקין, לכן השרת משתמש עכשיו בברירות המחדל (מוצגות כאן). שמירה תקבע אותן."
    : "הערך בתוקף בשרת. המשחק קורא רק את הפרופיל של הסביבה שלו.";
  const parts = [];
  const leaf = (path, key, v) => {
    if (typeof v === "boolean") {
      const lab = el("label", "check"); lab.dataset.path = path;
      const cb = el("input"); cb.type = "checkbox"; cb.checked = v; cb.dataset.path = path; cb.dataset.type = "bool";
      lab.append(cb, document.createTextNode(CFG_LABELS[key] || key), el("span", "key", key));
      return lab;
    }
    if (Array.isArray(v) && key === "envs") {
      const lab = el("div", "check"); lab.dataset.path = path;
      const t = el("label", null, CFG_LABELS[key]); t.append(el("span", "key", key)); lab.append(t);
      const row = el("div", "devpick");
      for (const e of ENVS) { const l = el("label", "check"); const cb = el("input"); cb.type = "checkbox"; cb.checked = v.includes(e); cb.dataset.env = e; cb.dataset.path = path; cb.dataset.type = "envs"; l.append(cb, ltr(e)); row.append(l); }
      lab.append(row);
      return lab;
    }
    const lab = el("label"); lab.dataset.path = path;
    lab.append(document.createTextNode(CFG_LABELS[key] || key), el("span", "key", key));
    const i = el("input"); i.type = "number"; i.step = "any"; i.inputMode = "decimal"; i.value = isNum(v) ? String(v) : ""; i.dataset.path = path; i.dataset.type = "num";
    lab.append(i);
    return lab;
  };
  const group = (path, key, o) => {
    const fs = el("fieldset"); fs.dataset.path = path;
    fs.append(el("legend", null, CFG_LABELS[key] || key));
    const fields = el("div", "fields");
    const subs = [];
    for (const [k, v] of Object.entries(o)) {
      const p = path ? `${path}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) subs.push(group(p, k, v));
      else fields.append(leaf(p, k, v));
    }
    if (fields.childNodes.length) fs.append(fields);
    fs.append(...subs);
    return fs;
  };
  for (const [k, v] of Object.entries(value)) parts.push(v && typeof v === "object" && !Array.isArray(v) ? group(k, k, v) : leaf(k, k, v));
  const actions = el("div", "cfg-actions");
  const save = el("button", "btn", "שמירה"); save.type = "submit";
  const reset = el("button", "ghost", "ביטול שינויים"); reset.type = "button";
  reset.addEventListener("click", () => drawConfig(obj(state.cfg.value)));
  const defs = el("button", "ghost", "ברירות המחדל (לא נשמר)"); defs.type = "button";
  defs.addEventListener("click", () => drawConfig(obj(state.cfg.defaults), { ok: true, text: "מולאו ברירות המחדל. לחצו שמירה כדי לקבוע אותן." }));
  const m = el("span", "cfg-msg" + (msg ? (msg.ok ? " ok" : " err") : ""), msg?.text || "");
  m.id = "cfg-msg"; m.setAttribute("role", "status");
  actions.append(save, reset, defs, m);
  f.replaceChildren(...parts, actions);
}

function collectConfig() {
  const out = structuredClone(obj(state.cfg?.value));
  const set = (path, v) => { const ks = path.split("."); let o = out; for (const k of ks.slice(0, -1)) { if (!o[k] || typeof o[k] !== "object") o[k] = {}; o = o[k]; } o[ks.at(-1)] = v; };
  const envs = {};
  for (const i of $("cfg").querySelectorAll("input[data-path]")) {
    const p = i.dataset.path;
    if (i.dataset.type === "bool") set(p, i.checked);
    else if (i.dataset.type === "envs") { envs[p] ||= []; if (i.checked) envs[p].push(i.dataset.env); }
    else { const t = i.value.trim(); set(p, t === "" || !isNum(t) ? null : Number(t)); }
  }
  for (const [p, v] of Object.entries(envs)) set(p, v);
  return out;
}

function markBad(path) {
  for (const x of $("cfg").querySelectorAll(".bad")) x.classList.remove("bad");
  if (!path || path === "$") return;
  const hit = [...$("cfg").querySelectorAll("[data-path]")].filter((x) => x.dataset.path === path && x.tagName !== "INPUT");
  for (const x of hit) x.classList.add("bad");
  hit[0]?.scrollIntoView({ block: "center", behavior: "smooth" });
}

$("cfg").addEventListener("submit", async (e) => {
  e.preventDefault();
  const value = collectConfig();
  const wasOn = obj(obj(state.cfg?.value).alerts).email_enabled === true;
  if (!wasOn && obj(value.alerts).email_enabled === true &&
      !confirm("להדליק שליחת מיילים? מייל יוצא רק אחרי ש-admin-mail פרוס ו-send_url והסודות מוגדרים בשרת.")) return;
  const btn = e.submitter; if (btn) btn.disabled = true;
  try {
    const d = await rpc("admin_mp_config_set", { p_value: value });
    if (d.ok === false) {
      const m = $("cfg-msg"); m.className = "cfg-msg err";
      m.textContent = d.error === "bad_config" ? `השרת דחה את הערך: ${str(d.path)} - בדקו את השדה המסומן (טווח, מספר שלם).` : `לא נשמר: ${str(d.error)}`;
      markBad(d.path);
      return;
    }
    state.cfg = { ...state.cfg, value: d.value || value, stored_valid: true };
    drawConfig(obj(state.cfg.value), { ok: true, text: `נשמר ${clock(new Date())}.` });
  } catch (err) { failed(err, "את השמירה"); }
  finally { if (btn) btn.disabled = false; }
});

function drawRecipients(msg) {
  const f = $("rcp");
  const ul = el("ul");
  if (!state.rcp.length) ul.append(el("li", "empty", "אין נמענים."));
  state.rcp.forEach((r, i) => {
    const li = el("li");
    const cb = el("input"); cb.type = "checkbox"; cb.checked = r.active; cb.title = "פעיל";
    cb.addEventListener("change", () => { r.active = cb.checked; });
    const act = el("label", "check"); act.append(cb, document.createTextNode("פעיל"));
    const rm = el("button", "ghost btn--small", "הסרה"); rm.type = "button";
    rm.addEventListener("click", () => { state.rcp.splice(i, 1); drawRecipients({ ok: true, text: "הוסר מהרשימה. לחצו שמירה." }); });
    li.append(el("span", "addr", r.email), act, el("span", "stamp", r.added_at ? `נוסף ${when(r.added_at)}` : "חדש"), rm);
    ul.append(li);
  });
  const add = el("div", "add");
  const inp = el("input"); inp.type = "email"; inp.placeholder = "name@example.com"; inp.maxLength = 254; inp.autocomplete = "off";
  const addB = el("button", "ghost", "הוספה"); addB.type = "button";
  addB.addEventListener("click", () => {
    const v = inp.value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) || v.length > 254) { drawRecipients({ ok: false, text: "כתובת לא תקינה." }); return; }
    if (state.rcp.some((r) => r.email === v)) { drawRecipients({ ok: false, text: "כבר ברשימה." }); return; }
    if (state.rcp.length >= 10) { drawRecipients({ ok: false, text: "עד 10 נמענים." }); return; }
    state.rcp.push({ email: v, active: true }); drawRecipients({ ok: true, text: "נוסף. לחצו שמירה." });
  });
  const save = el("button", "btn", "שמירת הרשימה"); save.type = "submit";
  add.append(inp, addB, save);
  const m = el("p", "cfg-msg" + (msg ? (msg.ok ? " ok" : " err") : ""), msg?.text || ""); m.setAttribute("role", "status");
  f.replaceChildren(ul, add, m);
}

$("rcp").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const d = await rpc("admin_alert_recipients_set", { p_recipients: state.rcp.map((r) => ({ email: r.email, active: r.active })) });
    if (d.ok === false) { drawRecipients({ ok: false, text: { bad_email: "השרת דחה כתובת.", bad_list: "רשימה לא תקינה (עד 10)." }[d.error] || `לא נשמר: ${str(d.error)}` }); return; }
    state.rcp = arr(d.recipients).map((x) => ({ email: String(obj(x).email ?? ""), active: obj(x).active !== false, added_at: obj(x).added_at }));
    drawRecipients({ ok: true, text: `נשמר ${clock(new Date())}.` });
  } catch (err) { failed(err, "את הנמענים"); }
});

// ---- Demo (localhost only: /admin/multiplayer?demo; ?demo=forbidden shows the no-access path) -------------------
// Made-up data in the server's shapes, never on futchy.co. Includes a 4-device match with a ball snap.

let demoDb = null;
function demoRpc(name, a) {
  if (!DEMO_HOST) throw new Error("demo");
  if (new URLSearchParams(location.search).get("demo") === "forbidden") return Promise.reject(new Forbidden());
  demoDb ||= makeDemo();
  const db = demoDb, now = new Date().toISOString();
  const page = (rows, key, lim, before, idKey = "id") => {
    let start = 0;
    if (before) { const id = before.split("|").slice(1).join("|"); start = rows.findIndex((r) => String(r[idKey]) === id) + 1; }
    const out = rows.slice(start, start + lim);
    const next = start + lim < rows.length ? `${out.at(-1)[key]}|${out.at(-1)[idKey]}` : null;
    return { out, next };
  };
  const f = obj(a.p_filters);
  const r = (() => {
    switch (name) {
      case "admin_mp_overview": {
        const ms_ = db.matches.filter((m) => (!a.p_env || m.env === a.p_env) && (!a.p_build || m.build_number === a.p_build)
          && Date.parse(m.last_at) > Date.now() - a.p_hours * 3600e3);
        const sum = (k) => ms_.reduce((s, m) => s + (+m[k] || 0), 0);
        return { ok: true, updated_at: now, env: a.p_env, build_number: a.p_build, hours: a.p_hours, since: new Date(Date.now() - a.p_hours * 3600e3).toISOString(),
          server: { source: "server", online_now: 37, searching: 3, searching_players: 4, active_matches: 5, matched_recent: 21, active_window_min: 30 },
          client: { source: "client", matches: ms_.length, completed: ms_.filter((m) => m.outcome === "completed").length,
            completed_today: ms_.filter((m) => m.outcome === "completed" && new Date(m.last_at).toDateString() === new Date().toDateString()).length,
            sync_anomaly_matches: ms_.filter((m) => m.sync_anomalies > 0).length, disconnects: sum("disconnects"), reconnects: sum("reconnects"),
            failed_searches: 6, failed_joins: 4, game_not_found: 3, fails_by_kind: { game_not_found: 3, search_failed: 4, search_timeout: 2, join_failed: 1, rematch_failed: 2 },
            critical_errors: sum("criticals"), warnings: sum("warnings"), rtt: { source: "online_net", samples: 1840, avg_ms: 71.4, p95_ms: 188.0 },
            rate_limited: { events: 120, installs: 1 }, open_issues: { total: db.issues.filter((i) => i.status === "open").length,
              critical: db.issues.filter((i) => i.status === "open" && i.severity === "critical").length } } };
      }
      case "admin_mp_live": return { ok: true, updated_at: now, window_s: 90, matches: db.live(), server_only: [
        { match_id: "fv2-5a0e17c2d9f4", source: "server", status: "pending", created_at: new Date(Date.now() - 140e3).toISOString(), humans: 2, duration_s: 140 }] };
      case "admin_mp_matches": {
        if (f.from && Number.isNaN(Date.parse(f.from))) return { ok: false, error: "bad_filter" };
        const from = f.from ? Date.parse(f.from) : Date.now() - 30 * 864e5, to = f.to ? Date.parse(f.to) : Date.now() + 6e4;
        const rows = db.matches.filter((m) => {
          const t = Date.parse(m.last_at);
          return t >= from && t < to && (!f.env || m.env === f.env) && (!f.build_number || m.build_number === f.build_number)
            && (!f.mode || m.mode === f.mode) && (!f.venue || m.venue === f.venue) && (!f.kind || m.kinds.includes(f.kind))
            && (!f.match_id || m.match_id.startsWith(f.match_id) || m.mm_id === f.match_id)
            && (!f.severity || (f.severity === "critical" ? m.criticals > 0 : m.criticals + m.warnings > 0))
            && (!f.device || Object.values(m.devices).some((d) => d.model.toLowerCase().includes(f.device.toLowerCase())));
        });
        const p = page(rows, "last_at", a.p_limit, a.p_before, "match_id");
        return { ok: true, matches: p.out, next_before: p.next };
      }
      case "admin_mp_match": case "admin_mp_export": {
        const d = db.matchData(a.p_match_id);
        return name === "admin_mp_match" ? d : { format: "futchy-mp-export/1", generated_at: now,
          notes: "timeline: ordered by (tick, corrected clock); at_ms = the device clock minus clock_offset_ms (to the host) in unix ms; source client = what the devices reported, server = the server's own records; thresholds = the game's settings now.",
          thresholds: db.cfg.thresholds, ...d };
      }
      case "admin_mp_issues": {
        const rows = db.issues.filter((i) => (!f.status || i.status === f.status) && (!f.severity || i.severity === f.severity)
          && (!f.env || i.env === f.env) && (!f.build_number || i.build_number === f.build_number) && (!f.kind || i.kind === f.kind)
          && (!f.match_id || i.match_id === f.match_id || i.sample_matches.includes(f.match_id)));
        const p = page(rows, "last_seen", a.p_limit, a.p_before);
        return { ok: true, issues: p.out, next_before: p.next };
      }
      case "admin_mp_issue_set": {
        if (!["open", "ack", "resolved"].includes(a.p_status)) return { ok: false, error: "bad_status" };
        const i = db.issues.find((x) => x.id === a.p_id);
        if (!i) return { ok: false, error: "not_found" };
        Object.assign(i, { status: a.p_status, updated_at: now, updated_by: "owner@example.com", resolved_at: a.p_status === "resolved" ? now : null });
        return { ok: true, issue: { ...i } };
      }
      case "admin_mp_reports": {
        const rows = db.reports.filter((x) => (!f.env || x.env === f.env) && (!f.build_number || x.build_number === f.build_number)
          && (!f.match_id || x.match_id === f.match_id) && (!f.ref || x.ref === f.ref.toUpperCase()));
        const p = page(rows, "created_at", a.p_limit, a.p_before);
        return { ok: true, reports: p.out, next_before: p.next };
      }
      case "admin_mp_alerts": { const p = page(db.alerts, "created_at", a.p_limit, a.p_before); return { ok: true, alerts: p.out, next_before: p.next }; }
      case "admin_mp_builds": return { ok: true, env: a.p_env, days: a.p_days, updated_at: now,
        builds: db.builds.filter((b) => !a.p_env || b.env === a.p_env).map(({ env, ...b }) => b) };
      case "admin_mp_config_get": return { ok: true, value: structuredClone(db.cfg), defaults: demoDefaults(), stored_valid: true };
      case "admin_mp_config_set": { const p = demoConfigProblem(a.p_value); if (p) return { ok: false, error: "bad_config", path: p }; db.cfg = structuredClone(a.p_value); return { ok: true, value: a.p_value }; }
      case "admin_alert_recipients_get": return { ok: true, recipients: db.rcp };
      case "admin_alert_recipients_set": {
        const list = arr(a.p_recipients); if (list.length > 10) return { ok: false, error: "bad_list" };
        for (const x of list) if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(x.email))) return { ok: false, error: "bad_email" };
        db.rcp = list.map((x) => ({ email: x.email, active: x.active !== false, added_at: db.rcp.find((o) => o.email === x.email)?.added_at || now }));
        return { ok: true, recipients: db.rcp };
      }
      default: throw new Error(`unknown rpc ${name}`);
    }
  })();
  return sleep(150 + Math.random() * 200).then(() => structuredClone(r));
}

function demoDefaults() {
  return {
    profiles: {
      dev: { detail_sample: 1, net_sample: 1, net_interval_s: 30, perf_interval_s: 10, trace_on_critical: true, max_traces_per_session: 10 },
      testflight: { detail_sample: 1, net_sample: 1, net_interval_s: 30, perf_interval_s: 10, trace_on_critical: true, max_traces_per_session: 10 },
      production: { detail_sample: 0, net_sample: 1, net_interval_s: 60, perf_interval_s: 0, trace_on_critical: true, max_traces_per_session: 2 } },
    thresholds: { ball_snap_cm: 50, body_snap_cm: 80, ball_pause_ms: 120, rtt_p95_ms: 250, fps_low: 40, fps_low_s: 5 },
    alerts: { email_enabled: false, mail: { daily_cap: 40 }, cooldown_min: 60, window_min: 15, baseline_days: 7, daily_summary_hour_local: 8,
      envs: ["testflight", "production"],
      rules: { mm_join_fail: { min_count: 3, min_rate: 0.2, ratio: 3 }, disconnect: { min_count: 3, min_rate: 0.15, ratio: 2 },
               unclean_exit: { min_count: 5, ratio: 3 }, new_critical: { enabled: true } } } };
}

// The same checks as the server's analytics.mp_config_problem (first problem's path, or null).
function demoConfigProblem(v) {
  const keys = (o, ks) => o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).sort().join() === [...ks].sort().join();
  const inr = (x, lo, hi, int = true) => typeof x === "number" && x >= lo && x <= hi && (!int || Number.isInteger(x));
  if (!keys(v, ["profiles", "thresholds", "alerts"])) return "$";
  if (!keys(v.profiles, ENVS)) return "profiles";
  for (const e of ENVS) {
    const p = v.profiles[e];
    if (!keys(p, ["detail_sample", "net_sample", "net_interval_s", "perf_interval_s", "trace_on_critical", "max_traces_per_session"])) return `profiles.${e}`;
    if (!inr(p.detail_sample, 0, 1, false)) return `profiles.${e}.detail_sample`;
    if (!inr(p.net_sample, 0, 1, false)) return `profiles.${e}.net_sample`;
    if (!inr(p.net_interval_s, 10, 600)) return `profiles.${e}.net_interval_s`;
    if (!inr(p.perf_interval_s, 0, 600)) return `profiles.${e}.perf_interval_s`;
    if (typeof p.trace_on_critical !== "boolean") return `profiles.${e}.trace_on_critical`;
    if (!inr(p.max_traces_per_session, 0, 20)) return `profiles.${e}.max_traces_per_session`;
  }
  const t = v.thresholds;
  if (!keys(t, ["ball_snap_cm", "body_snap_cm", "ball_pause_ms", "rtt_p95_ms", "fps_low", "fps_low_s"])) return "thresholds";
  for (const [k, lo, hi, int] of [["ball_snap_cm", 1, 1000, false], ["body_snap_cm", 1, 1000, false], ["ball_pause_ms", 10, 10000], ["rtt_p95_ms", 10, 5000], ["fps_low", 5, 120], ["fps_low_s", 1, 120]]) {
    if (!inr(t[k], lo, hi, int !== false)) return `thresholds.${k}`;
  }
  const a = v.alerts;
  if (!keys(a, ["email_enabled", "mail", "cooldown_min", "window_min", "baseline_days", "daily_summary_hour_local", "envs", "rules"])) return "alerts";
  if (typeof a.email_enabled !== "boolean") return "alerts.email_enabled";
  if (!keys(a.mail, ["daily_cap"]) || !inr(a.mail.daily_cap, 0, 300)) return "alerts.mail";
  for (const [k, lo, hi] of [["cooldown_min", 5, 1440], ["window_min", 5, 120], ["baseline_days", 1, 30], ["daily_summary_hour_local", 0, 23]]) if (!inr(a[k], lo, hi)) return `alerts.${k}`;
  if (!Array.isArray(a.envs) || a.envs.length > 3 || a.envs.some((x) => !ENVS.includes(x))) return "alerts.envs";
  if (!keys(a.rules, ["mm_join_fail", "disconnect", "unclean_exit", "new_critical"])) return "alerts.rules";
  for (const r of ["mm_join_fail", "disconnect"]) {
    const p = a.rules[r];
    if (!keys(p, ["min_count", "min_rate", "ratio"]) || !inr(p.min_count, 1, 100000) || !inr(p.min_rate, 0, 1, false) || !inr(p.ratio, 1, 100, false)) return `alerts.rules.${r}`;
  }
  const u = a.rules.unclean_exit;
  if (!keys(u, ["min_count", "ratio"]) || !inr(u.min_count, 1, 100000) || !inr(u.ratio, 1, 100, false)) return "alerts.rules.unclean_exit";
  if (!keys(a.rules.new_critical, ["enabled"]) || typeof a.rules.new_critical.enabled !== "boolean") return "alerts.rules.new_critical";
  return null;
}

function makeDemo() {
  let seed = 20261109;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const hex = (n) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(rnd() * 16)]).join("");
  const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
  const iso = (t) => new Date(t).toISOString();
  const NOW = Date.now();
  const MODELS = [["iPhone16,2", "iOS 18.1"], ["iPhone15,3", "iOS 18.0"], ["iPhone14,5", "iOS 17.6"], ["iPhone13,2", "iOS 17.5"], ["iPhone12,1", "iOS 17.6"], ["SM-A055F", "Android 14"]];
  const ENV_BUILD = [["production", "10"], ["production", "9"], ["testflight", "11"], ["testflight", "10"], ["dev", "11"]];
  const devicesFor = (n, env, build) => {
    const out = {}; const ids = [];
    for (let s = 0; s < n; s++) {
      const [model, os] = pick(MODELS); const id = uuid(); ids.push(id);
      out[id] = { model, os, platform: model.startsWith("SM-") ? "Android" : "iOS", slot: s, role: s === 0 ? "host" : "client",
                  app_version: "1.0.3", build_number: build, build: `1.0.3 (${build})`, commit: hex(8) };
    }
    return { out, ids };
  };

  // The star of the demo: four devices, a ball snap on S2 (an old iPhone 11 running hot) in the second rally.
  const SNAP = "fv2-7c41d0e9a2b3", SNAP_MM = "mm-2b9e7741f0aa";
  const snapStart = NOW - 47 * 60e3;
  const snapDev = {
    "0c1f6a2e-4b7d-4e21-9d3a-11aa22bb33cc": { model: "iPhone16,2", os: "iOS 18.1", platform: "iOS", slot: 0, role: "host", app_version: "1.0.3", build_number: "10", build: "1.0.3 (10)", commit: "dd3bf2ae" },
    "5e8d2c91-7a3f-4b10-8c6e-44dd55ee66ff": { model: "iPhone14,5", os: "iOS 17.6", platform: "iOS", slot: 1, role: "client", app_version: "1.0.3", build_number: "10", build: "1.0.3 (10)", commit: "dd3bf2ae" },
    "9a7b3c2d-1e0f-4a5b-9c8d-77aa88bb99cc": { model: "iPhone12,1", os: "iOS 17.6", platform: "iOS", slot: 2, role: "client", app_version: "1.0.3", build_number: "10", build: "1.0.3 (10)", commit: "dd3bf2ae" },
    "e4f5a6b7-c8d9-4e0f-a1b2-c3d4e5f6a7b8": { model: "SM-A055F", os: "Android 14", platform: "Android", slot: 3, role: "client", app_version: "1.0.3", build_number: "10", build: "1.0.3 (10)", commit: "dd3bf2ae" },
  };
  const snapIds = Object.keys(snapDev);
  const matches = [];
  matches.push({ match_id: SNAP, mm_id: SNAP_MM, env: "production", build_number: "10", mode: "footvolley_2v2", venue: "stadium",
    first_at: iso(snapStart), last_at: iso(snapStart + 412e3), duration_s: 412, players: 4, devices: snapDev, host_install: snapIds[0],
    events: 0, warnings: 3, criticals: 2, fails: 0, anomalies: 4, sync_anomalies: 3, disconnects: 1, reconnects: 1, score: { a: 18, b: 21 },
    outcome: "completed", rtt_ms: 96, kinds: ["ball_snap", "body_snap", "fps_low", "thermal"], source: "client" });
  for (let i = 0; i < 128; i++) {
    const [env, build] = pick(ENV_BUILD); const n = rnd() < 0.55 ? 2 : 4;
    const { out, ids } = devicesFor(n, env, build);
    const last = NOW - Math.floor(rnd() * 6 * 864e5) - 3 * 60e3; const dur = 120 + Math.floor(rnd() * 420);
    const bad = rnd() < 0.18, crit = bad && rnd() < 0.4;
    const kinds = bad ? [pick(["ball_snap", "body_snap", "ball_pause", "score_mismatch", "stuck_player"])] : (rnd() < 0.1 ? ["fps_low"] : []);
    const outcome = pick(["completed", "completed", "completed", "completed", "forfeit", "abandoned"]);
    matches.push({ match_id: `fv2-${hex(12)}`, mm_id: `mm-${hex(12)}`, env, build_number: build, mode: n === 4 ? "footvolley_2v2" : "footvolley",
      venue: pick(["stadium", "favela", "trumpeldor", "beach"]), first_at: iso(last - dur * 1000), last_at: iso(last), duration_s: dur, players: n,
      devices: out, host_install: ids[0], events: 40 + Math.floor(rnd() * 200), warnings: bad ? 1 + Math.floor(rnd() * 3) : 0, criticals: crit ? 1 : 0,
      fails: rnd() < 0.05 ? 1 : 0, anomalies: kinds.length, sync_anomalies: bad ? 1 : 0, disconnects: rnd() < 0.08 ? 1 : 0, reconnects: rnd() < 0.05 ? 1 : 0,
      score: outcome === "abandoned" ? null : { a: 10 + Math.floor(rnd() * 12), b: 21 }, outcome, rtt_ms: 40 + Math.floor(rnd() * 120), kinds, source: "client" });
  }
  matches.sort((a, b) => Date.parse(b.last_at) - Date.parse(a.last_at) || (a.match_id < b.match_id ? 1 : -1));

  // The snap match's timeline: corrected clock (at_ms), Fusion ticks at 60 Hz from the start of play.
  function snapTimeline() {
    const tl = []; let id = 900000;
    const offs = [0, 38, -112, 205];   // each device's clock_offset_ms to the host
    const T0 = snapStart + 4000;
    const push = (dev, dt, tick, kind, severity, props) => {
      const d = snapDev[snapIds[dev]];
      tl.push({ id: id++, at_ms: T0 + dt, received_at: iso(T0 + dt + 1200 + dev * 150), tick, mono_ms: 812000 + dt + dev * 7, install_id: snapIds[dev],
                slot: d.slot, role: d.role, kind, severity, match_id: kind === "mp_search" || kind === "mp_matched" ? null : SNAP, mm_id: SNAP_MM,
                props: { clock_offset_ms: offs[dev], ...props } });
    };
    for (let dv = 0; dv < 4; dv++) push(dv, -9000 + dv * 400, null, "mp_search", "info", { party: dv < 2 ? 2 : 1, region: "eu" });
    for (let dv = 0; dv < 4; dv++) push(dv, -2100 + dv * 60, null, "mp_matched", "info", { wait_ms: 6900 - dv * 300, venue: "stadium", mode: "footvolley_2v2" });
    for (let dv = 0; dv < 4; dv++) push(dv, dv * 180, 1 + dv * 11, "mp_join", "info", { authority: dv === 0 ? "host" : "proxy", net_type: dv === 3 ? "cellular" : "wifi", attempt: 1 });
    let tick = 120;
    for (let rally = 1; rally <= 6; rally++) {
      const base = rally * 52000;
      for (let dv = 0; dv < 4; dv++) push(dv, base - 30000 + dv * 90, tick + 600 + dv, "mp_net", "info",
        { rtt_ms: [42, 77, 138, 164][dv] + Math.round(rnd() * 20), jitter_ms: [4, 9, 22, 31][dv], loss_pct: [0, 0.2, 1.4, 2.1][dv], kbps: 48 + dv * 3 });
      if (rally === 2) {
        push(2, base - 4100, tick + 1720, "mp_anomaly", "warning", { kind: "fps_low", fps: 27, fps_low_s: 6, thermal: 2 });
        push(0, base - 1400, tick + 1890, "mp_point", "info", { rally, touches: 7, score_a: 4, score_b: 5 });
        push(2, base - 1302, tick + 1896, "mp_anomaly", "critical", { kind: "ball_snap", distance_cm: 142, threshold: 50, ball: { x: 1.92, y: 2.31, z: -0.48 }, touch: 6, authority: "proxy" });
        push(1, base - 1290, tick + 1896, "mp_anomaly", "warning", { kind: "ball_snap", distance_cm: 61, threshold: 50, touch: 6 });
        push(3, base - 1270, tick + 1897, "mp_anomaly", "warning", { kind: "body_snap", distance_cm: 96, threshold: 80, from_slot: 2 });
        push(2, base - 1180, tick + 1902, "mp_trace", "critical", { _trace_bytes: 18422 });
        push(2, base - 600, tick + 1930, "mp_anomaly", "critical", { kind: "score_mismatch", host_score_a: 4, host_score_b: 5, local_score_a: 4, local_score_b: 4 });
      } else if (rally === 4) {
        push(3, base - 9000, tick + 3100, "mp_leave", "warning", { cause: "disconnect", reason: "timeout", elapsed_ms: 2400 });
        push(3, base - 4200, tick + 3390, "mp_join", "info", { rejoin: true, attempt: 2, wait_ms: 4800 });
        for (let dv = 0; dv < 4; dv++) push(dv, base - 2000 + dv * 40, tick + 3500 + dv, "mp_point", "info", { rally, touches: 5, score_a: 11, score_b: 12 });
      } else {
        for (let dv = 0; dv < 4; dv++) push(dv, base - 2000 + dv * 40, tick + rally * 860 + dv, "mp_point", "info", { rally, touches: 3 + Math.floor(rnd() * 8), score_a: rally * 3, score_b: rally * 3 + 1 });
      }
      for (let dv = 0; dv < 4; dv++) push(dv, base + 1000 + dv * 50, tick + rally * 900 + 20 + dv, "mp_perf", "info",
        { fps_avg: [59.6, 58.8, 41.2, 52.4][dv], fps_min: [55, 51, 24, 38][dv], frame_max_ms: [24, 31, 96, 58][dv], mem_footprint_mb: [1610, 1540, 1720, 980][dv], mem_available_mb: [2900, 1800, 420, 1100][dv], thermal: [1, 1, rally >= 2 ? 2 : 1, 1][dv] });
      tick += 3100;
    }
    for (let dv = 0; dv < 4; dv++) push(dv, 6 * 52000 + 60000 + dv * 120, tick + 40 + dv, "mp_summary", "info",
      { outcome: "completed", score_a: 18, score_b: 21, mode: "footvolley_2v2", venue: "stadium", fps_avg: [59.6, 58.8, 41.2, 52.4][dv], rtt_avg_ms: [44, 81, 146, 171][dv], rtt_p95_ms: [61, 120, 238, 290][dv], ball_corrections: [0, 12, 47, 29][dv], body_corrections: [0, 6, 21, 33][dv] });
    // the server's order: before the first ticked event by clock, ticked by (tick, clock), the rest by clock
    const t0 = Math.min(...tl.filter((e) => e.tick !== null).map((e) => e.at_ms));
    const grp = (e) => e.tick !== null ? 1 : e.at_ms < t0 ? 0 : 2;
    return tl.sort((a, b) => grp(a) - grp(b) || (a.tick ?? 0) - (b.tick ?? 0) || a.at_ms - b.at_ms || a.id - b.id);
  }

  const issues = [];
  let iid = 140;
  const addIssue = (o) => issues.push({ id: iid++, source: "mp_anomaly", severity: "warning", env: "production", build_number: "10", match_id: null,
    first_seen: iso(NOW - 3 * 864e5), last_seen: iso(NOW - 2 * 3600e3), count: 1, sample_matches: [], status: "open", updated_by: null,
    updated_at: null, resolved_at: null, regression_of: null, ...o });
  addIssue({ kind: "ball_snap", severity: "critical", title: "Ball snapped 142 cm on a client (proxy) - production build 10", match_id: SNAP,
    first_seen: iso(snapStart + 100e3), last_seen: iso(snapStart + 102e3), count: 3, sample_matches: [SNAP, matches[5].match_id], regression_of: 141 });
  addIssue({ kind: "ball_snap", severity: "critical", title: "Ball snapped on a client - production build 9", build_number: "9", status: "resolved",
    first_seen: iso(NOW - 12 * 864e5), last_seen: iso(NOW - 9 * 864e5), resolved_at: iso(NOW - 8 * 864e5), updated_by: "owner@example.com", updated_at: iso(NOW - 8 * 864e5), count: 14 });
  addIssue({ kind: "score_mismatch", severity: "critical", title: "Score differs between host and client after a point", match_id: SNAP, sample_matches: [SNAP],
    first_seen: iso(snapStart + 103e3), last_seen: iso(snapStart + 103e3) });
  addIssue({ kind: "game_not_found", source: "mp_fail", title: "Join failed: GameNotFound", count: 9, sample_matches: [matches[3].match_id, matches[9].match_id], last_seen: iso(NOW - 20 * 60e3) });
  addIssue({ kind: "rate_disconnect", source: "scan", title: "Disconnect rate 3.1x baseline [production]", count: 2, last_seen: iso(NOW - 70 * 60e3) });
  for (const [k, s] of [["body_snap", "warning"], ["ball_pause", "warning"], ["stuck_player", "warning"], ["fps_low", "info"], ["thermal", "info"], ["memory_warning", "warning"],
                        ["search_failed", "warning"], ["ghost_player", "critical"], ["rematch_failed", "info"]]) {
    const m = pick(matches);
    addIssue({ kind: k, severity: s, source: /failed/.test(k) ? "mp_fail" : "mp_anomaly", title: `${k} on ${pick(["production", "testflight"])} build ${m.build_number}`,
      env: m.env, build_number: m.build_number, count: 1 + Math.floor(rnd() * 20), sample_matches: [m.match_id],
      status: pick(["open", "open", "ack", "resolved"]), last_seen: iso(NOW - Math.floor(rnd() * 5 * 864e5)) });
  }
  for (let i = 0; i < 50; i++) addIssue({ kind: pick(["ball_pause", "fps_low", "body_snap"]), severity: "info", title: "Older issue (demo filler)", status: "resolved", last_seen: iso(NOW - (6 + i / 3) * 864e5), first_seen: iso(NOW - (8 + i / 3) * 864e5) });
  issues.sort((a, b) => Date.parse(b.last_seen) - Date.parse(a.last_seen) || b.id - a.id);

  const TEXTS = ["הכדור קפץ לי פתאום לצד השני של המגרש", "the ball teleported right before I kicked it", "המשחק נתקע לכמה שניות ואז חזר",
    "My partner disappeared and came back", "התוצאה אצלי הייתה 4-4 ואצל החבר 4-5", "<img src=x onerror=alert(1)> טקסט שנראה כמו HTML - חייב להופיע כטקסט",
    "lag lag lag", "לא מצאתי משחק, חיכיתי דקה", "", "O jogo travou no saque"];
  const reports = [];
  for (let i = 0; i < 37; i++) {
    const m = i === 0 ? matches.find((x) => x.match_id === SNAP) : pick(matches);
    const dev = Object.values(m.devices)[i === 0 ? 2 : 0];
    const has = rnd() < 0.6;
    reports.push({ id: uuid(), ref: `R-${hex(6).toUpperCase()}`, created_at: iso(i === 0 ? snapStart + 420e3 : NOW - Math.floor(rnd() * 9 * 864e5)),
      text: i === 0 ? "הכדור קפץ לי פתאום ממש לפני הבעיטה, ואז התוצאה לא הייתה נכונה" : pick(TEXTS),
      match_id: rnd() < 0.85 || i === 0 ? m.match_id : null, player_id: uuid(), username: rnd() < 0.8 ? pick(["sandking", "beachboy_tlv", "joga.bonito", "maya_fv", "<b>bold</b>"]) : null,
      install_id: uuid(), env: m.env, build_number: m.build_number, commit: dev.commit, app_version: dev.app_version, platform: dev.platform, os_version: dev.os,
      device_model: dev.model, issue_id: i === 0 ? 140 : (rnd() < 0.2 ? pick(issues).id : null), has_trace: i === 0 || has, trace_bytes: i === 0 || has ? 4000 + Math.floor(rnd() * 26000) : null,
      trace_dropped: rnd() < 0.08 });
  }
  reports.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  const alerts = [];
  let aid = 500;
  alerts.push({ id: aid++, rule: "new_critical", severity: "critical", env: "production", title: "Regression: ball_snap [production build 10]",
    detail: { issue: 140, kind: "ball_snap", build_number: "10", count: 3, match_id: SNAP, regression_of: 141 }, link_path: "/admin/multiplayer#issue=140",
    created_at: iso(snapStart + 300e3), email_status: "disabled", emailed_at: null, email_error: null, email_attempts: 0 });
  alerts.push({ id: aid++, rule: "disconnect", severity: "warning", env: "production", title: "Disconnects 3.1x baseline in 15 min [production]",
    detail: { count: 7, rate: 0.19, baseline: 0.06, issue: 144 }, link_path: "/admin/multiplayer#issue=144", created_at: iso(NOW - 70 * 60e3),
    email_status: "sent", emailed_at: iso(NOW - 69 * 60e3), email_error: null, email_attempts: 1 });
  alerts.push({ id: aid++, rule: "mm_join_fail", severity: "warning", env: "testflight", title: "Join failures 4x baseline [testflight]",
    detail: { count: 5, rate: 0.31, baseline: 0.07 }, link_path: "/admin/multiplayer#issue=143", created_at: iso(NOW - 5 * 3600e3),
    email_status: "quota", emailed_at: null, email_error: "provider quota reached for today", email_attempts: 1 });
  alerts.push({ id: aid++, rule: "unclean_exit", severity: "warning", env: "production", title: "Unclean exits 3.4x baseline",
    detail: { count: 9, ratio: 3.4 }, link_path: "javascript:alert(1)", created_at: iso(NOW - 9 * 3600e3),
    email_status: "failed", emailed_at: null, email_error: "400 invalid sender [email]", email_attempts: 3 });
  alerts.push({ id: aid++, rule: "new_critical", severity: "critical", env: "production", title: "New critical: ghost_player",
    detail: { kind: "ghost_player" }, link_path: `/admin/multiplayer#match=${matches[2].match_id}`, created_at: iso(NOW - 11 * 3600e3),
    email_status: "pending", emailed_at: null, email_error: null, email_attempts: 0 });
  for (let d = 1; d <= 70; d++) alerts.push({ id: aid++, rule: d % 7 === 0 ? "disconnect" : "daily_summary", severity: d % 7 === 0 ? "warning" : "info", env: d % 7 === 0 ? "production" : null,
    title: d % 7 === 0 ? "Disconnects 2.2x baseline [production]" : `Multiplayer daily summary ${iso(NOW - d * 864e5).slice(0, 10)}`,
    detail: d % 7 === 0 ? { count: 4, rate: 0.16 } : { day: iso(NOW - d * 864e5).slice(0, 10), open_issues: 4 + (d % 5), open_critical: d % 3 },
    link_path: "/admin/multiplayer", created_at: iso(NOW - d * 864e5 + 8 * 3600e3), email_status: "disabled", emailed_at: null, email_error: null, email_attempts: 0 });
  alerts.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);

  const builds = [];
  for (const [env, list] of [["production", [["10", 412, 6, 3.4, 2.1, 0.7], ["9", 1290, 19, 2.8, 4.3, 1.2], ["8", 640, 30, 4.1, 3.9, 1.9]]],
                             ["testflight", [["11", 88, 2, 2.2, 1.1, 0], ["10", 140, 8, 3.6, 2.9, 0.7]]], ["dev", [["11", 36, 1, 5.5, 8.3, 2.7]]]]) {
    for (const [b, mt, days, fail100, anom100, crash100] of list) {
      const per = { failures: fail100, disconnects: +(fail100 * 0.8).toFixed(1), anomalies: anom100, crashes: crash100 };
      builds.push({ env, build_number: b, first_day: iso(NOW - days * 864e5).slice(0, 10), last_day: iso(NOW).slice(0, 10), matches: mt,
        completed: Math.round(mt * 0.86), players: Math.round(mt * 2.7), failures: Math.round(mt * fail100 / 100), disconnects: Math.round(mt * per.disconnects / 100),
        anomalies: Math.round(mt * anom100 / 100), sync_anomalies: Math.round(mt * anom100 / 160), crashes: Math.round(mt * crash100 / 100),
        criticals: Math.round(mt * anom100 / 300), rtt_avg_ms: 60 + Math.round(rnd() * 40), per_100: per });
    }
  }

  function genericTimeline(m) {
    const ids = Object.keys(m.devices); const tl = []; let id = 1;
    const t0 = Date.parse(m.first_at);
    ids.forEach((d, i) => tl.push({ id: id++, at_ms: t0 + i * 200, received_at: iso(t0 + 1500), tick: 1 + i, mono_ms: 1000 + i, install_id: d, slot: i, role: m.devices[d].role,
      kind: "mp_join", severity: "info", match_id: m.match_id, mm_id: m.mm_id, props: { attempt: 1 } }));
    for (let p = 1; p <= 8; p++) ids.forEach((d, i) => tl.push({ id: id++, at_ms: t0 + p * 30000 + i * 30, received_at: iso(t0 + p * 30000 + 2000), tick: p * 1800 + i,
      mono_ms: p * 30000, install_id: d, slot: i, role: m.devices[d].role, kind: "mp_point", severity: "info", match_id: m.match_id, mm_id: m.mm_id, props: { rally: p, score_a: p, score_b: p - 1 } }));
    for (const k of m.kinds) tl.push({ id: id++, at_ms: t0 + 95000, received_at: iso(t0 + 97000), tick: 5300, mono_ms: 95000, install_id: ids.at(-1), slot: ids.length - 1, role: "client",
      kind: "mp_anomaly", severity: m.criticals ? "critical" : "warning", match_id: m.match_id, mm_id: m.mm_id, props: { kind: k, distance_cm: 70, threshold: 50 } });
    return tl.sort((a, b) => a.tick - b.tick || a.at_ms - b.at_ms);
  }
  function devicesFromTimeline(m, tl) {
    return Object.entries(m.devices).map(([id, d]) => {
      const ev = tl.filter((e) => e.install_id === id), P = (k) => ev.map((e) => e.props[k]).filter((v) => typeof v === "number");
      const avg = (xs) => xs.length ? Math.round(10 * xs.reduce((a, b) => a + b, 0) / xs.length) / 10 : null;
      const max = (xs) => xs.length ? Math.max(...xs) : null, min = (xs) => xs.length ? Math.min(...xs) : null;
      return { install_id: id, slot: d.slot, role: d.role, device_model: d.model, os_version: d.os, platform: d.platform, app_version: d.app_version,
        build_number: d.build_number, build: d.build, commit: d.commit, env: m.env, events: ev.length,
        first_at: ev[0] ? iso(ev[0].at_ms) : null, last_at: ev.at(-1) ? iso(ev.at(-1).at_ms) : null,
        fps_avg: avg([...P("fps_avg"), ...P("fps")]), fps_min: min([...P("fps_min"), ...P("fps")]), frame_max_ms: max(P("frame_max_ms")),
        mem_footprint_max_mb: max(P("mem_footprint_mb")), mem_available_min_mb: min(P("mem_available_mb")), thermal_max: max(P("thermal")),
        rtt_avg_ms: avg([...P("rtt_avg_ms"), ...P("rtt_ms")]), rtt_p95_ms: max(P("rtt_p95_ms")), jitter_ms: avg(P("jitter_ms")), loss_pct: max(P("loss_pct")),
        disconnects: ev.filter((e) => e.kind === "mp_leave" && e.props.cause === "disconnect").length, reconnects: ev.filter((e) => e.kind === "mp_join" && e.props.rejoin).length,
        ball_corrections: max(P("ball_corrections")), body_corrections: max(P("body_corrections")),
        errors: ev.filter((e) => e.kind === "mp_fail" || e.severity === "critical").length, warnings: ev.filter((e) => e.severity === "warning").length,
        anomalies: ev.filter((e) => e.kind === "mp_anomaly").length };
    });
  }

  const db = {
    matches, issues, reports, alerts, builds, cfg: demoDefaults(), rcp: [{ email: "owner@example.com", active: true, added_at: iso(NOW - 3 * 864e5) }],
    live() {
      return matches.slice(0, 3).map((m, i) => ({ ...m, last_at: iso(Date.now() - (10 + i * 20) * 1000), outcome: null, score: { a: 5 + i, b: 7 },
        duration_s: 95 + i * 60, host: m.devices[m.host_install], server: { status: "pending", created_at: iso(Date.now() - (100 + i * 60) * 1000) } }));
    },
    matchData(id) {
      const m = matches.find((x) => x.match_id === id || x.mm_id === id);
      if (!m) {
        if (id === "fv2-5a0e17c2d9f4") return { ok: false, match_id: id, match: null, server: { source: "server", mm_match: null,
          online_match: { match_id: id, status: "pending", outcome: null, winner: null, created_at: iso(Date.now() - 140e3), decided_at: null, why: null } },
          timeline: [], timeline_truncated: false, devices: [], traces: [], online_net_summary: [], issues: [], reports: [] };
        return { ok: false, match_id: id, match: null, server: { source: "server", mm_match: null, online_match: null }, timeline: [], timeline_truncated: false,
          devices: [], traces: [], online_net_summary: [], issues: [], reports: [] };
      }
      const tl = m.match_id === SNAP ? snapTimeline() : genericTimeline(m);
      const devs = devicesFromTimeline(m, tl);
      return {
        ok: true, match_id: m.match_id, match: { ...m, events: tl.length },
        server: { source: "server", mm_match: { match_id: m.mm_id, venue: m.venue, created_at: m.first_at, side_a: m.players / 2, side_b: m.players / 2 },
                  online_match: { match_id: m.match_id, status: "settled", outcome: m.outcome, winner: m.score && m.score.a > m.score.b ? "a" : "b", created_at: m.first_at,
                                  decided_at: m.last_at, why: m.outcome === "forfeit" ? "left" : "score" } },
        timeline: tl, timeline_truncated: false, devices: devs,
        traces: tl.filter((e) => e.kind === "mp_trace").map((e) => ({ id: e.id, install_id: e.install_id, slot: e.slot, received_at: e.received_at, props: { ...e.props, trace_reason: "ball_snap" } })),
        online_net_summary: m.match_id === SNAP ? devs.map((d) => ({ install_id: d.install_id, received_at: m.last_at,
          props: { match: m.match_id.slice(0, 12), rtt_avg_ms: d.rtt_avg_ms, rtt_max_ms: Math.round((d.rtt_avg_ms || 0) * 2.1), loss_pct: d.loss_pct, kb_in: 820, kb_out: 610 } })) : [],
        issues: issues.filter((i) => i.match_id === m.match_id || i.sample_matches.includes(m.match_id)),
        reports: reports.filter((r) => r.match_id === m.match_id).map((r) => ({ ref: r.ref, created_at: r.created_at, text: r.text, device_model: r.device_model,
          build_number: r.build_number, env: r.env, player_id: r.player_id, install_id: r.install_id, trace_dropped: r.trace_dropped, trace_bytes: r.trace_bytes })),
      };
    },
  };
  return db;
}

// ---- Start ------------------------------------------------------------------------------------------------------

// A sign-in always returns to /admin (Supabase's allowed address); admin-auth.js sends it back here with the hash.
$("signin").addEventListener("click", () => window.FutchyAuth.signIn(location.pathname + location.hash).catch((e) => gate(e.message)));
$("signout").addEventListener("click", () => { window.FutchyAuth.signOut(); gate(""); });
window.addEventListener("hashchange", route);

(() => {
  if (DEMO) {
    $("back").search = "?demo";
    if (new URLSearchParams(location.search).get("demo") === "forbidden") { gate(""); enter(); }   // then the first call answers 'forbidden'
    else enter();
    route();
    return;
  }
  if (!stored()) { gate(""); return; }
  enter();
  route();
})();
