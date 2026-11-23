// Futchy server monitor (Chen 2026-11-23: "next time the server falls I want an email").
// Runs from GitHub Actions every 5 minutes, OUTSIDE Supabase, so it still works when the database is down
// (the in-database alert mail, admin-mail, cannot: the database is what wakes it).
//
// Probe: GET HEALTH_URL (public.health(): reads one real table row with a 3 s ceiling, answers "ok").
// Down = 3 failed tries 20 s apart (a timeout, non-200, or not "ok").
// Mail through Brevo (same sender as the in-database alerts): once when it goes down, a reminder every
// 60 minutes while it stays down, once when it is back.
// State (up/down, since, last mail) lives in state/monitor.json, carried between runs by actions/cache.
//
// Env (GitHub repository secrets - never in this public repo): HEALTH_URL, BREVO_API_KEY, ALERT_TO
// (comma-separated addresses). TEST_MAIL=1 sends one test mail and exits.
import fs from "node:fs";

const STATE = "state/monitor.json";
const REMIND_MIN = 60;
const { HEALTH_URL, BREVO_API_KEY, ALERT_TO, TEST_MAIL } = process.env;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();
const il = iso => new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const mins = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);

async function probeOnce() {
  const t0 = Date.now();
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(10000) });
    const body = (await res.text()).trim();
    const ms = Date.now() - t0;
    if (res.status === 200 && body === '"ok"') return { ok: true, ms };
    return { ok: false, ms, why: `HTTP ${res.status} ${body.slice(0, 120)}` };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, why: e?.name === "TimeoutError" ? "no answer in 10 s" : String(e).slice(0, 120) };
  }
}

async function probe() {
  let last;
  for (let i = 0; i < 3; i++) {
    if (i) await sleep(20000);
    last = await probeOnce();
    if (last.ok) return last;
  }
  return last;
}

async function mail(subject, lines) {
  const to = String(ALERT_TO || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!BREVO_API_KEY || !to.length) { console.log("mail skipped: no key or no recipients"); return false; }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const html = `<!doctype html><html lang="he" dir="rtl"><body dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;text-align:right">` +
    lines.map(l => `<p style="margin:0 0 8px">${esc(l)}</p>`).join("") + `</body></html>`;
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "api-key": BREVO_API_KEY },
    body: JSON.stringify({ sender: { email: "alerts@futchy.co", name: "Futchy Alerts" }, to: to.map(email => ({ email })),
                           subject, htmlContent: html, textContent: lines.join("\n") }),
  });
  console.log(`mail "${subject}": HTTP ${res.status}`);
  return res.ok;
}

const SUPA = "https://supabase.com/dashboard/project/hfclcxosyzjgjyxsgzec";

async function main() {
  if (!HEALTH_URL) { console.log("not set up yet: the HEALTH_URL secret is missing"); return; }
  if (TEST_MAIL === "1") {
    const ok = await mail("Futchy · בדיקה: התראות השרת עובדות",
      ["זה מייל בדיקה ממערכת הניטור החיצונית של השרת (GitHub Actions).",
       "מעכשיו, אם השרת לא עונה, יגיע מייל כזה תוך כ-5-15 דקות, תזכורת כל שעה, ומייל כשהוא חוזר.",
       `נשלח ב-${il(nowIso())}.`]);
    process.exit(ok ? 0 : 1);
  }

  let st = { up: true, since: nowIso(), lastMail: null };
  try { st = { ...st, ...JSON.parse(fs.readFileSync(STATE, "utf8")) }; } catch { /* first run */ }

  const r = await probe();
  const t = nowIso();
  console.log(r.ok ? `up (${r.ms} ms)` : `DOWN: ${r.why}`);

  if (!r.ok) {
    if (st.up) {
      st = { up: false, since: t, lastMail: null, why: r.why };
      if (await mail("Futchy · השרת לא עונה!",
        [`השרת של המשחק (Supabase) לא עונה מאז ${il(t)} (שעון ישראל).`,
         `מה נבדק: קריאה של שורה מטבלה אמיתית, 3 ניסיונות בהפרש 20 שניות. התשובה: ${r.why}.`,
         "מה זה אומר: ככל הנראה שחקנים לא יכולים להתחבר, לשמור התקדמות, לראות דירוג או לשחק אונליין.",
         `מה לבדוק: בלוח הבקרה של Supabase את הסטטוס ואת Settings → Infrastructure (זיכרון, Disk IO): ${SUPA}`,
         "ואם צריך: Restart project, או להגדיל את גודל השרת. תזכורת תגיע כל שעה עד שהשרת יחזור."])) st.lastMail = t;
    } else if (!st.lastMail || mins(st.lastMail, t) >= REMIND_MIN) {
      if (await mail(`Futchy · השרת עדיין לא עונה (${mins(st.since, t)} דקות)`,
        [`השרת לא עונה כבר ${mins(st.since, t)} דקות, מאז ${il(st.since)}.`, `התשובה האחרונה: ${r.why}.`,
         `לוח הבקרה: ${SUPA}`])) st.lastMail = t;
    }
  } else if (!st.up) {
    const down = mins(st.since, t);
    await mail("Futchy · השרת חזר לעבוד",
      [`השרת עונה שוב מאז ${il(t)}. הוא לא ענה בערך ${down} דקות (מאז ${il(st.since)}).`, `זמן תשובה עכשיו: ${r.ms} ms.`]);
    st = { up: true, since: t, lastMail: null };
  }

  fs.mkdirSync("state", { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(st));
}

main().catch(e => { console.error(e); process.exit(1); });
