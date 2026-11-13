// FUTCHY's private dashboard (futchy.co/admin). Signs in with Google through Supabase (OAuth + PKCE, no
// library - the shared admin-auth.js), then asks the server for public.admin_dashboard - which answers only for the
// two owners' verified emails (analytics.admins). The key is the project's PUBLIC anon key: it lets nobody read anything.
// Everything from the server is written as text (textContent), never as HTML.
const { BACKEND, ANON, KEY, stored, token } = window.FutchyAuth;

const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat("he-IL");
const num = (v) => (v === null || v === undefined || Number.isNaN(+v)) ? "–" : nf.format(Math.round(+v));
const pct = (v) => (v === null || v === undefined) ? "–" : `${(+v).toLocaleString("he-IL", { maximumFractionDigits: 1 })}%`;
let regions;
try { regions = new Intl.DisplayNames(["he"], { type: "region" }); } catch { regions = null; }

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = String(text);
  return e;
}

function duration(sec) {
  if (sec === null || sec === undefined) return "–";
  sec = Math.round(+sec);
  if (sec < 60) return `${sec} שנ׳`;
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return `${m}:${String(s).padStart(2, "0")} דק׳`;
  const h = Math.floor(m / 60);
  return `${h}:${String(m % 60).padStart(2, "0")} שע׳`;
}
const hebrew = (t) => /[\u0590-\u05FF]/.test(t);

const SCREENS = { MainMenu: "תפריט ראשי", CircleSelect: "בחירת מעגל", Playing: "במשחק", Paused: "עצירה", Settings: "הגדרות",
  Profile: "פרופיל", CharacterEditor: "עורך דמות", Onboarding: "היכרות ראשונה", BeachSelect: "בחירת חוף", ComingSoon: "בקרוב" };
const STEPS = { first_launch: "התקנה ראשונה", sign_in_shown: "ראו את מסך ההתחברות", sign_in_success: "התחברו",
  username_created: "בחרו שם משתמש", mode_start: "התחילו לשחק", match_end: "סיימו משחק פוצ׳יוולי",
  coins_spent: "קנו במטבעות", iap_succeeded: "דיווחו על קנייה בכסף (לפי האפליקציה, כולל בדיקות)" };
const ADS = { ad_requested: "בקשות לפרסומת", ad_unavailable: "לא הייתה פרסומת", ad_completed: "נצפו עד הסוף",
  ad_not_completed: "נסגרו לפני הסוף", ad_failed: "נכשלו", double_coins_paid: "הכפלות מטבעות" };
const MODES = { circle: "מעגלים", footvolley: "פוצ׳יוולי" };
const SHOPS = { Clothes: "בגדים", Balls: "כדורים", Sandy: "Sandy", Shoes: "נעליים", Accessories: "אביזרים" };
// ₪ with agorot (4.90), and a pack's short name (coins2500 -> 2,500 מטבעות).
const ils = (v) => (v === null || v === undefined || Number.isNaN(+v)) ? "–" : `₪${(+v).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pack = (p) => { const m = /coins(\d+)$/.exec(p || ""); return m ? `${nf.format(+m[1])} מטבעות` : (p || "–"); };
const country = (c) => { if (!c || c === "?") return "לא ידוע"; try { return regions?.of(c) || c; } catch { return c; } };

// ---- Sign-in (shared: admin-auth.js) -------------------------------------------------------------------------

const signIn = () => window.FutchyAuth.signIn();

// Back from Google: a failure shows on the gate; a sign-in started on /admin/multiplayer goes back there.
async function finishSignIn() {
  const r = await window.FutchyAuth.finishSignIn();
  if (r.error) gate(`ההתחברות לא הצליחה: ${r.error}`);
  return r;
}

function signOut() {
  window.FutchyAuth.signOut();
  gate("");
}

function gate(note) {
  clearInterval(timer);
  $("board").hidden = true; $("tools").hidden = true; $("gate").hidden = false;
  $("gate-note").textContent = note || "";
  $("status").textContent = "";
}

// ---- Data ----------------------------------------------------------------------------------------------------

let days = 7, timer = 0, loading = false, retried = false;

async function load() {
  if (loading) return;
  loading = true;
  try {
    const t = await token();
    if (!t) { gate(""); return; }
    const r = await fetch(`${BACKEND}/rest/v1/rpc/admin_dashboard`, {
      method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_days: days }) });
    const j = await r.json().catch(() => null);
    if (r.status === 401 || r.status === 403 || (j && /forbidden/.test(j.message || ""))) {
      const who = stored()?.email || "";
      localStorage.removeItem(KEY);
      gate(`לחשבון ${who} אין גישה ללוח הזה.`);
      return;
    }
    if (!r.ok || !j) throw new Error(j?.message || `שגיאה ${r.status}`);
    $("gate").hidden = true; $("board").hidden = false; $("tools").hidden = false;
    render(j);
    compStart();
    $("status").textContent = "";
    $("stamp").textContent = `עודכן ${new Date(j.generated_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
    retried = false;
  } catch (e) {
    // A timeout from a cold server cache: the first try warms it, so a second one a few seconds later loads.
    if (!retried && /timeout/i.test(e.message || "")) {
      retried = true;
      $("status").textContent = "טוענים…";
      setTimeout(load, 3000);
    } else {
      retried = false;
      $("status").textContent = `לא הצלחנו לטעון: ${e.message}. מנסים שוב בעוד דקה.`;
    }
  } finally { loading = false; }
}

// ---- Drawing ------------------------------------------------------------------------------------------------

function tile(label, value, sub, opts = {}) {
  const t = el("div", "tile" + (opts.live ? " tile--live" : "") + (opts.warn ? " tile--warn" : ""));
  const head = el("div", "tile__label");
  if (opts.live) head.append(el("span", "pulse"));
  head.append(document.createTextNode(label));
  const v = el("div", "tile__value", value);
  if (hebrew(String(value))) v.dir = "rtl";
  t.append(head, v);
  if (sub) t.append(el("div", "tile__sub", sub));
  if (opts.hint) t.title = opts.hint;
  return t;
}

// One tile, three small numbers side by side (DAU / WAU / MAU).
function trio(label, parts) {
  const t = el("div", "tile tile--trio");
  t.append(el("div", "tile__label", label));
  const row = el("div", "trio");
  for (const [name, v] of parts) {
    const c = el("div", "trio__cell");
    c.append(el("div", "trio__v", num(v)), el("div", "trio__k", name));
    row.append(c);
  }
  t.append(row);
  return t;
}

function renderTiles(d) {
  const o = d.overview || {}, u = d.unfinished || {}, iap = d.iap || {};
  const real = iap.real, all = iap.real_all_time || {};
  const cut = u.sessions ? 100 * u.unfinished / u.sessions : null;
  const box = $("tiles");
  box.replaceChildren(
    tile("משחקים עכשיו", num(d.playing_now), `${num(o.live_5m)} פעילים ב-5 הדקות האחרונות`, { live: true }),
    tile("התקנות", num(o.installs_total), `${num(o.new_today)} חדשות היום`),
    tile("פעילים היום", num(o.today), `${num(o.sessions_today)} סשנים היום`),
    trio("שחקנים פעילים", [["יום", o.dau], ["שבוע", o.wau], ["חודש", o.mau]]),
    tile("סשן ממוצע", duration(d.avg_session_seconds), "מפתיחה עד יציאה לרקע"),
    tile("זמן משחק ביום", duration(d.avg_daily_seconds_per_player), "ממוצע לשחקן ביום שבו שיחק"),
    tile("חשבונות", num(d.accounts), `${num(d.usernames)} עם שם משתמש · ${num(o.signed_in_mau)} פעילים החודש`),
    tile("סשנים שנקטעו", cut === null ? "–" : pct(cut), `${num(u.unfinished)} מתוך ${num(u.sessions)} · ${num(u.installs_affected)} מכשירים`,
         { warn: cut !== null && cut > 5, hint: "סשנים בלי סיום רגיל: קריסה, או שהמערכת סגרה את המשחק. אין דוח קריסות מלא." }),
    tile("שגיאות", num(d.errors_total), "שגיאות שהמשחק רשם בתקופה"),
    real
      ? tile("רכישות בכסף אמיתי", num(real.count), `${ils(real.ils)} בתקופה · ${num(all.count)} מאז ההשקה (${ils(all.ils)})`,
             { hint: "עסקאות של Apple שהשרת אימת, בגרסת החנות בלבד: בלי רכישות בדיקה, בלי החזרים, כל עסקה פעם אחת." })
      : tile("רכישות בכסף אמיתי", "–", "ממתין לעדכון השרת")
  );
}

const SVGNS = "http://www.w3.org/2000/svg";
function svg(tag, attrs) { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }

function renderDaily(rows) {
  const box = $("daily");
  box.replaceChildren();
  if (!rows?.length) { box.append(el("p", "empty", "אין עדיין נתונים.")); return; }
  const W = 720, H = 220, top = 16, bottom = 26, left = 8, right = 36;
  const max = Math.max(1, ...rows.map(r => +r.actives || 0)) * 1.08;   // a little headroom over the tallest
  const step = (W - left - right) / rows.length, bw = Math.max(2, step - 2);
  const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "פעילים בכל יום, 30 הימים האחרונים" });
  const y = (v) => top + (H - top - bottom) * (1 - v / max);
  for (const f of [0, 0.5, 1]) {
    s.append(svg("line", { x1: left, x2: W - right, y1: y(max * f), y2: y(max * f), class: "gridline" }));
    const lab = svg("text", { x: W - right + 6, y: y(max * f) + 4, class: "axis", "text-anchor": "start" });
    lab.textContent = num(max * f);
    s.append(lab);
  }
  const tip = el("div", "tip"); tip.hidden = true;
  rows.forEach((r, i) => {
    const v = +r.actives || 0, x = left + i * step + 1;
    const h = Math.max(v ? 3 : 0, (H - top - bottom) * v / max);
    const bar = svg("rect", { x, y: H - bottom - h, width: bw, height: h, rx: Math.min(4, bw / 2), class: i === rows.length - 1 ? "bar bar--today" : "bar" });
    const hit = svg("rect", { x: left + i * step, y: top, width: step, height: H - top - bottom, class: "hit" });
    const date = new Date(r.day + "T00:00:00");
    const show = () => {
      tip.replaceChildren(
        el("strong", null, date.toLocaleDateString("he-IL", { weekday: "short", day: "numeric", month: "numeric" })),
        el("span", null, `${num(v)} פעילים`), el("span", null, `${num(r.new_installs)} התקנות חדשות`),
        el("span", null, `${num(r.sessions)} סשנים · ממוצע ${duration(r.avg_session_seconds)}`));
      tip.hidden = false;
      const bx = box.getBoundingClientRect(), hx = hit.getBoundingClientRect();
      tip.style.left = `${Math.min(bx.width - 180, Math.max(0, hx.left - bx.left + hx.width / 2 - 90))}px`;
      bar.classList.add("bar--on");
    };
    const hide = () => { tip.hidden = true; bar.classList.remove("bar--on"); };
    hit.addEventListener("pointerenter", show); hit.addEventListener("pointerleave", hide);
    hit.addEventListener("pointerdown", show);
    s.append(bar, hit);
    if (i % 5 === 0 || i === rows.length - 1) {
      const t = svg("text", { x: x + bw / 2, y: H - 8, class: "axis", "text-anchor": "middle" });
      t.textContent = date.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
      s.append(t);
    }
  });
  box.append(s, tip);
}

// A table: columns {label, get, fmt, bar}. The "bar" column draws a thin share of the largest value behind it.
function table(title, sub, cols, rows, empty = "אין עדיין נתונים.") {
  const card = el("article", "card");
  card.append(el("h2", null, title));
  if (sub) card.append(el("p", "sub", sub));
  if (!rows?.length) { card.append(el("p", "empty", empty)); return card; }
  const t = el("table");
  const head = el("tr");
  for (const c of cols) head.append(el("th", c.num ? "n" : null, c.label));
  const thead = el("thead"); thead.append(head); t.append(thead);
  const body = el("tbody");
  const maxes = cols.map(c => c.bar ? Math.max(1, ...rows.map(r => +c.get(r) || 0)) : 0);
  for (const r of rows) {
    const tr = el("tr");
    cols.forEach((c, i) => {
      const v = c.get(r);
      const td = el("td", c.num ? "n" : null);
      if (c.bar) {
        if (+v > 0) {
          const meter = el("span", "meter");
          meter.style.setProperty("--w", `${Math.round(100 * (+v || 0) / maxes[i])}%`);
          td.append(meter);
        }
        td.append(el("span", "meter__v", (c.fmt || num)(v)));
        td.classList.add("has-meter");
      } else td.textContent = (c.fmt || (c.num ? num : ((x) => x ?? "–")))(v);
      tr.append(td);
    });
    body.append(tr);
  }
  t.append(body);
  const wrap = el("div", "scroll"); wrap.append(t);
  card.append(wrap);
  return card;
}

// Real money: one row per App Store transaction the server verified (public.iap_transactions, Production, not
// refunded) - never the apps' own reports, which repeat after a reinstall and include TestFlight. Test purchases
// (TestFlight / Sandbox) do not appear at all (Chen); refunds are a separate line.
function purchases(iap, per) {
  if (!iap.real) {   // a server before 20261113100000_purchase_alerts: the apps' reports mix in tests - nothing shown
    const c = table("רכישות בכסף אמיתי", per, [], [], "ממתין לעדכון השרת.");
    c.id = "purchases";
    return c;
  }
  const r = iap.real, f = iap.refunded || {}, all = iap.real_all_time || {};
  const card = table("רכישות בכסף אמיתי", `${per} · עסקאות של Apple שהשרת אימת, בגרסת החנות בלבד`, [
    { label: "חבילה", get: x => pack(x.product) },
    { label: "רכישות", get: x => x.count, num: true, bar: true },
    { label: "שולם", get: x => x.ils, fmt: ils, num: true }], r.by_product, "אין רכישות בכסף אמיתי בתקופה.");
  card.id = "purchases";
  card.classList.add("purchases", "wide");
  const sum = el("div", "buy-sum");
  sum.append(el("span", "buy-sum__v", ils(r.ils)),
             el("span", null, `${num(r.count)} רכישות · ${num(r.buyers)} קונים`),
             el("span", "buy-sum__all", `מאז ההשקה: ${num(all.count)} רכישות, ${ils(all.ils)}`));
  card.querySelector(".sub").after(sum);
  if (r.ils_unknown > 0) card.append(el("p", "buy-note", `${num(r.ils_unknown)} רכישות בלי סכום ידוע (אין מחיר בעסקה של Apple) - לא בסכום.`));
  if (r.recent?.length) {
    card.append(el("h3", null, "אחרונות"));
    const ul = el("ul", "buys");
    for (const x of r.recent) {
      const li = el("li");
      const paid = x.currency && x.currency !== "ILS" && x.price !== null ? `\u2066${(+x.price).toFixed(2)} ${x.currency}\u2069` : ils(x.ils);
      li.append(el("span", "buys__who", x.username || "(אין שם משתמש)"),
                el("span", "buys__what", `${pack(x.product)} · ${paid}${x.storefront && x.storefront !== "ISR" ? ` · ${x.storefront}` : ""}`),
                el("span", "buys__at", new Date(x.at).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })));
      ul.append(li);
    }
    card.append(ul);
  }
  if (f.count > 0) card.append(el("p", "buy-note buy-note--warn", `החזרים בתקופה: ${num(f.count)} (${ils(f.ils)}) - לא נספרו למעלה.`));
  return card;
}

function renderTables(d) {
  const per = days === 1 ? "היום האחרון" : `${days} הימים האחרונים`;
  const modes = (d.modes || []).filter(m => m.event !== "mode_start");
  const started = Object.fromEntries((d.modes || []).filter(m => m.event === "mode_start").map(m => [m.mode, m.plays]));
  const ads = Object.entries(d.ads || {}).map(([k, n]) => ({ k, n }));
  const ret = (d.retention || []).filter(r => r.installs > 0).slice(0, 14);
  const econ = d.economy || [];
  $("tables").replaceChildren(
    table("מצבי משחק", per, [
      { label: "מצב", get: r => MODES[r.mode] || r.mode },
      { label: "התחילו", get: r => started[r.mode], num: true },
      { label: "סיימו", get: r => r.plays, num: true, bar: true },
      { label: "שחקנים", get: r => r.installs, num: true },
      { label: "משך ממוצע", get: r => r.avg_seconds, fmt: duration, num: true },
      { label: "ניצחונות", get: r => r.mode === "footvolley" ? r.wins : null, num: true }], modes),
    table("משפך", `מהתקנות של ${per}: כמה הגיעו לכל שלב`, [
      { label: "שלב", get: r => STEPS[r.event] || r.event },
      { label: "התקנות", get: r => r.installs, num: true, bar: true }], d.funnel),
    table("שימור", "מכל יום התקנה: כמה חזרו אחרי יום, שבוע וחודש", [
      { label: "יום התקנה", get: r => new Date(r.cohort + "T00:00:00").toLocaleDateString("he-IL", { day: "numeric", month: "numeric" }) },
      { label: "התקנות", get: r => r.installs, num: true },
      { label: "יום 1", get: r => r.d1, fmt: pct, num: true },
      { label: "יום 7", get: r => r.d7, fmt: pct, num: true },
      { label: "יום 30", get: r => r.d30, fmt: pct, num: true }], ret),
    table("מטבעות נכנסים", per, [
      { label: "מקור", get: r => r.source },
      { label: "מטבעות", get: r => r.coins, num: true, bar: true },
      { label: "פעמים", get: r => r.events, num: true }], econ.filter(e => e.direction === "in")),
    table("מה קונים במטבעות", per, [
      { label: "פריט", get: r => r.item },
      { label: "רכישות", get: r => r.purchases, num: true, bar: true },
      { label: "מטבעות", get: r => r.coins, num: true }], d.items),
    purchases(d.iap || {}, per),
    table("פרסומות", per, [
      { label: "", get: r => ADS[r.k] || r.k },
      { label: "פעמים", get: r => r.n, num: true, bar: true }], ads),
    table("מדינות", "לפי הגדרת האזור במכשיר", [
      { label: "מדינה", get: r => country(r.value) },
      { label: "התקנות", get: r => r.installs, num: true, bar: true }], d.countries),
    table("מכשירים", null, [
      { label: "דגם", get: r => r.value },
      { label: "התקנות", get: r => r.installs, num: true, bar: true }], d.devices),
    table("גרסאות iOS", null, [
      { label: "iOS", get: r => r.value.replace(/^iOS\s*/i, "") },
      { label: "התקנות", get: r => r.installs, num: true, bar: true }], d.os),
    table("גרסאות המשחק", null, [
      { label: "גרסה", get: r => r.value },
      { label: "התקנות", get: r => r.installs, num: true, bar: true }], d.versions),
    table("מסכים", per, [
      { label: "מסך", get: r => SCREENS[r.screen] || r.screen },
      { label: "צפיות", get: r => r.views, num: true, bar: true },
      { label: "שחקנים", get: r => r.installs, num: true }], d.screens),
    table("חנויות", per, [
      { label: "חנות", get: r => SHOPS[r.shop] || r.shop },
      { label: "כניסות", get: r => r.opens, num: true, bar: true },
      { label: "שחקנים", get: r => r.installs, num: true }], d.shops),
    table("שגיאות נפוצות", per, [
      { label: "הודעה", get: r => r.message },
      { label: "פעמים", get: r => r.events, num: true, bar: true },
      { label: "מכשירים", get: r => r.installs, num: true }], d.errors, "אין שגיאות. 🎉"),
    table("בילדים", "iOS = שחקנים, iOS-dev = בילדים של פיתוח", [
      { label: "סוג", get: r => r.value },
      { label: "התקנות", get: r => r.installs, num: true, bar: true }], d.platforms)
  );
  // The wide cards: many columns, or long words.
  for (const c of $("tables").children) if (c.querySelectorAll("th").length > 4 || /שגיאות נפוצות/.test(c.textContent)) c.classList.add("wide");
}

let jumped = false;
function render(d) {
  renderTiles(d);
  renderDaily(d.daily);
  renderTables(d);
  // the purchase emails link to /admin#purchases: scroll there once
  if (!jumped && location.hash === "#purchases") { jumped = true; setTimeout(() => $("purchases")?.scrollIntoView({ block: "start" }), 60); }
}


// ---- The competition's participants (Chen, 2026-11-13) ---------------------------------------------------------
// The 1,000 ₪ board lists only registered participants; a player registers by writing to @futchy_game on Instagram
// and an owner adds them here by their username in the game. public.admin_competition_* answer only for admins.

let compReady = false;
async function rpc(name, body) {
  const t = await token();
  if (!t) throw new Error("לא מחובר");
  const r = await fetch(`${BACKEND}/rest/v1/rpc/${name}`, {
    method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => null);
  if (r.status === 404 || (j && /Could not find the function/i.test(j.message || ""))) { const e = new Error("pending"); e.pending = true; throw e; }
  if (!r.ok || !j) throw new Error(j?.message || `שגיאה ${r.status}`);
  return j;
}

function compMsg(text, bad = false) {
  const m = $("comp-msg");
  m.textContent = text || "";
  m.classList.toggle("comp-msg--bad", !!bad);
}

const when = (t) => t ? new Date(t).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : "–";

// One table of players, each with its add or remove button.
function compTable(rows, empty) {
  if (!rows?.length) return el("p", "empty", empty);
  const t = el("table");
  const head = el("tr");
  for (const h of ["שחקן", "רשום", "מקום", "ניקוד", "משחקים", "נרשם", "הערה", ""]) head.append(el("th", null, h));
  const thead = el("thead"); thead.append(head); t.append(thead);
  const body = el("tbody");
  for (const r of rows) {
    const tr = el("tr");
    tr.append(el("td", null, r.username || "–"));
    tr.append(el("td", r.registered ? "comp-yes" : null, r.registered ? "כן" : "לא"));
    tr.append(el("td", "n", r.place ?? "–"), el("td", "n", r.score ?? "–"), el("td", "n", r.matches ?? "–"));
    tr.append(el("td", null, r.registered ? `${when(r.added_at)} · ${r.added_by || ""}` : "–"));
    tr.append(el("td", null, r.note || ""));
    const cell = el("td");
    const b = el("button", r.registered ? "comp-btn comp-btn--off" : "comp-btn", r.registered ? "הסרה" : "הוספה");
    b.type = "button";
    b.addEventListener("click", () => compToggle(r, b));
    cell.append(b); tr.append(cell);
    body.append(tr);
  }
  t.append(body);
  const wrap = el("div", "scroll"); wrap.append(t);
  return wrap;
}

async function compToggle(r, button) {
  const add = !r.registered;
  if (!add && !confirm(`להסיר את ${r.username} מהתחרות? התוצאות שלו יורדו מהטבלה.`)) return;
  button.disabled = true;
  try {
    const j = add
      ? await rpc("admin_competition_participant_add", { p_player: r.player, p_note: $("comp-note").value.trim() || null })
      : await rpc("admin_competition_participant_remove", { p_player: r.player });
    if (j.ok === false) throw new Error(j.error === "unknown_player" ? "אין שחקן כזה" : j.error);
    compMsg(add ? `${r.username} נרשם לתחרות.` : `${r.username} הוסר מהתחרות.`);
    $("comp-note").value = "";
    await compRefresh();
  } catch (e) { compMsg(`לא הצליח: ${e.message}`, true); button.disabled = false; }
}

async function compSearch(q) {
  const box = $("comp-found");
  box.replaceChildren();
  if (!q) return;
  try {
    const j = await rpc("admin_competition_players", { p_query: q });
    box.append(compTable(j.players, `אין שחקן ששם המשתמש שלו מתחיל ב-"${q}".`));
  } catch (e) { compMsg(e.pending ? "ממתין לעדכון השרת." : `החיפוש לא הצליח: ${e.message}`, !e.pending); }
}

async function compRefresh() {
  try {
    const j = await rpc("admin_competition_players", {});
    if (j.ok === false) { $("comp-list").replaceChildren(el("p", "empty", "אין עונת תחרות בשרת.")); return; }
    $("comp-sub").textContent = `רק משתתפים רשומים מופיעים בטבלת התחרות · ${nf.format(j.participants)} רשומים · ` +
      `נספר ${j.count_from === "season" ? "מתחילת העונה" : "מרגע ההרשמה"} · עונה ${j.season}`;
    $("comp-list").replaceChildren(compTable(j.players, "עוד אין משתתפים רשומים."));
    const q = $("comp-q").value.trim();
    if (q) await compSearch(q);
  } catch (e) {
    $("comp-list").replaceChildren(el("p", "empty", e.pending ? "ממתין לעדכון השרת (התחרות עוד לא הוחלה)." : `לא הצלחנו לטעון: ${e.message}`));
  }
}

function compStart() {
  if (compReady) return;
  compReady = true;
  $("comp-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    compMsg("");
    compSearch($("comp-q").value.trim());
  });
  compRefresh();
}

// ---- Start ---------------------------------------------------------------------------------------------------

$("signin").addEventListener("click", () => signIn().catch(e => gate(e.message)));
$("signout").addEventListener("click", signOut);
for (const b of document.querySelectorAll("[data-days]")) {
  b.addEventListener("click", () => {
    days = +b.dataset.days;
    for (const o of document.querySelectorAll("[data-days]")) o.setAttribute("aria-pressed", String(o === b));
    load();
  });
}

// Made-up numbers to see the page full, on the local preview only (localhost/admin?demo) - never on futchy.co.
function demo() {
  const r = (a, b) => Math.round(a + Math.random() * (b - a));
  const today = new Date();
  const daily = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - 29 + i);
    const a = Math.round(120 + i * 9 + Math.sin(i / 2) * 25 + (d.getDay() >= 5 ? 40 : 0));
    return { day: d.toISOString().slice(0, 10), actives: a, new_installs: r(15, 60), sessions: a * 2, avg_session_seconds: r(380, 640) };
  });
  return {
    generated_at: new Date().toISOString(), days,
    overview: { live_5m: 43, today: 388, new_today: 52, dau: 401, wau: 1290, mau: 2841, signed_in_mau: 1630, sessions_today: 812, installs_total: 3904 },
    playing_now: 27, avg_session_seconds: 512, avg_daily_seconds_per_player: 1460, accounts: 2210, usernames: 1984,
    unfinished: { sessions: 5120, unfinished: 61, installs_affected: 44 }, errors_total: 37,
    daily,
    retention: Array.from({ length: 10 }, (_, i) => ({ cohort: daily[28 - i].day, installs: r(30, 70), d1: r(32, 48), d7: i > 6 ? r(12, 20) : 0, d30: 0 })),
    modes: [{ event: "mode_start", mode: "circle", plays: 2400 }, { event: "mode_start", mode: "footvolley", plays: 1300 },
            { event: "circle_end", mode: "circle", plays: 2210, installs: 980, avg_seconds: 214, wins: 0 },
            { event: "match_end", mode: "footvolley", plays: 1102, installs: 640, avg_seconds: 377, wins: 590 }],
    funnel: [["first_launch", 520], ["sign_in_shown", 515], ["sign_in_success", 330], ["username_created", 301],
             ["mode_start", 470], ["match_end", 260], ["coins_spent", 190], ["iap_succeeded", 21]].map(([event, installs], i) => ({ step: i + 1, event, installs })),
    economy: [{ direction: "in", source: "league.match", events: 1200, coins: 160000 }, { direction: "in", source: "circle.session", events: 2100, coins: 98000 },
              { direction: "in", source: "challenge.claim", events: 640, coins: 71000 }, { direction: "in", source: "mission", events: 210, coins: 52000 }],
    items: [{ item: "BALL_SandyIsrael", purchases: 88, coins: 264000 }, { item: "TORSO_MG22", purchases: 71, coins: 17750 },
            { item: "skill_hip_ginga", purchases: 40, coins: 200000 }, { item: "BALL_WhiteRed", purchases: 33, coins: 19800 }],
    iap: { started: 64, failed: 9, buyers: 21, actives: 1290, succeeded: { "com.Maagalim.MaagalimBeach.coins2500": 13, "com.Maagalim.MaagalimBeach.coins6000": 7, "com.Maagalim.MaagalimBeach.coins15000": 3 },
           real: { count: 18, buyers: 15, coins: 112500, ils: 189.2, ils_unknown: 0, last_at: new Date().toISOString(),
                   by_product: [{ product: "com.Maagalim.MaagalimBeach.coins2500", count: 11, coins: 27500, ils: 53.9 },
                                { product: "com.Maagalim.MaagalimBeach.coins6000", count: 5, coins: 30000, ils: 49.5 },
                                { product: "com.Maagalim.MaagalimBeach.coins15000", count: 2, coins: 30000, ils: 39.8 }],
                   recent: [{ at: new Date(Date.now() - 36e5).toISOString(), product: "com.Maagalim.MaagalimBeach.coins2500", ils: 4.9, price: 4.9, currency: "ILS", storefront: "ISR", username: "sandy_king" },
                            { at: new Date(Date.now() - 9e6).toISOString(), product: "com.Maagalim.MaagalimBeach.coins6000", ils: 9.9, price: 2.99, currency: "USD", storefront: "USA", username: "rio_volley" },
                            { at: new Date(Date.now() - 2e7).toISOString(), product: "com.Maagalim.MaagalimBeach.coins2500", ils: 4.9, price: 4.9, currency: "ILS", storefront: "ISR", username: null }] },
           refunded: { count: 1, ils: 4.9 }, real_all_time: { count: 41, ils: 402.6, buyers: 30 } },
    ads: { ad_requested: 930, ad_unavailable: 40, ad_completed: 801, ad_not_completed: 66, ad_failed: 23, double_coins_paid: 790 },
    countries: [{ value: "IL", installs: 2900 }, { value: "BR", installs: 410 }, { value: "US", installs: 260 }, { value: "FR", installs: 90 }],
    devices: [{ value: "iPhone16,2", installs: 900 }, { value: "iPhone15,3", installs: 700 }, { value: "iPhone14,5", installs: 520 }],
    os: [{ value: "iOS 18.1", installs: 2100 }, { value: "iOS 17.6", installs: 1200 }, { value: "iOS 16.7", installs: 300 }],
    versions: [{ value: "1.0.1", installs: 3100 }, { value: "1.0", installs: 800 }],
    platforms: [{ value: "iOS", installs: 3880 }, { value: "iOS-dev", installs: 4 }],
    screens: [{ screen: "Playing", views: 9100, installs: 1200 }, { screen: "MainMenu", views: 6400, installs: 1280 }, { screen: "Profile", views: 2100, installs: 800 }],
    shops: [{ shop: "Clothes", opens: 1900, installs: 700 }, { shop: "Sandy", opens: 1100, installs: 560 }, { shop: "Balls", opens: 640, installs: 410 }],
    errors: [{ message: "NullReferenceException: Object reference not set to an instance of an object", kind: "Exception", events: 21, installs: 14 },
             { message: "Futchy backend: the account could not be read", kind: "Error", events: 9, installs: 7 }],
  };
}

(async () => {
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has("demo")) {
    $("gate").hidden = true; $("board").hidden = false; $("tools").hidden = false;
    $("stamp").textContent = "נתוני דוגמה";
    document.querySelector(".navlink").search = "?demo";   // the multiplayer page's own demo
    render(demo());
    compReady = true;
    $("comp-list").replaceChildren(compTable([
      { player: "1", username: "Rafa_BR", registered: true, place: 1, score: 1486, matches: 77, added_at: new Date(Date.now() - 864e5 * 9).toISOString(), added_by: "chen.mishani@gmail.com", note: "@rafa.fv" },
      { player: "2", username: "Beni_10", registered: true, place: 2, score: 1450, matches: 114, added_at: new Date(Date.now() - 864e5 * 6).toISOString(), added_by: "beniter7@gmail.com", note: "" },
      { player: "3", username: "noa_beach", registered: true, place: null, score: null, matches: null, added_at: new Date().toISOString(), added_by: "chen.mishani@gmail.com", note: "story ✓" }], ""));
    return;
  }
  if ((await finishSignIn()).redirect) return;
  if (!stored()) { if ($("gate").hidden) gate(""); return; }
  $("status").textContent = "טוען...";
  await load();
  timer = setInterval(load, 60000);   // "now" keeps itself current
})();
