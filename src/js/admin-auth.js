// The sign-in shared by FUTCHY's private pages (futchy.co/admin, /admin/multiplayer): Google through Supabase
// (OAuth + PKCE, no library), the session in localStorage. The key below is the project's PUBLIC anon key: it lets
// nobody read anything - every admin call is checked by the server (analytics.is_admin).
// Every sign-in returns to /admin (the address Supabase already allows); a page that started it elsewhere under
// /admin/ is sent back there afterwards.
window.FutchyAuth = (() => {
  const BACKEND = "https://hfclcxosyzjgjyxsgzec.supabase.co";
  const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmY2xjeG9zeXpqZ2p5eHNnemVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3NTk1OTAsImV4cCI6MjEwODMzNTU5MH0.CpUo16XuknUBMbAx6oG6ulmiVyJCZ92QupYOh7QxASw";
  const KEY = "futchy.admin.session", VERIFIER = "futchy.admin.verifier", RETURN = "futchy.admin.return";
  const REDIRECT = location.origin + "/admin";
  // Where a sign-in may send you back to: a page under /admin/ and, at most, a simple #key=value.
  const SAFE_RETURN = /^\/admin\/[a-z-]{1,40}(#[A-Za-z0-9=_.:%-]{0,200})?$/;

  const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  async function signIn(returnTo) {
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    sessionStorage.setItem(VERIFIER, verifier);
    if (returnTo && SAFE_RETURN.test(returnTo)) sessionStorage.setItem(RETURN, returnTo);
    else sessionStorage.removeItem(RETURN);
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    location.href = `${BACKEND}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(REDIRECT)}` +
                    `&code_challenge=${challenge}&code_challenge_method=s256`;
  }

  async function auth(path, body) {
    const r = await fetch(`${BACKEND}/auth/v1/${path}`, {
      method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.msg || j.message || `שגיאה ${r.status}`);
    return j;
  }

  function keep(s) {
    const session = { access: s.access_token, refresh: s.refresh_token, email: s.user?.email,
                      expires: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600) };
    localStorage.setItem(KEY, JSON.stringify(session));
    return session;
  }

  const stored = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
  const forget = () => localStorage.removeItem(KEY);

  async function token() {
    let s = stored();
    if (!s) return null;
    if (s.expires - Date.now() / 1000 < 60) {
      try { s = keep(await auth("token?grant_type=refresh_token", { refresh_token: s.refresh })); }
      catch { forget(); return null; }
    }
    return s.access;
  }

  // Back from Google (on /admin): {} when there was nothing to finish or it worked, {error} when it failed,
  // {redirect: true} when the page is being left for the /admin/ page that started the sign-in.
  async function finishSignIn() {
    const q = new URLSearchParams(location.search);
    const err = q.get("error_description") || q.get("error");
    const code = q.get("code");
    if (!code && !err) return {};
    history.replaceState(null, "", "/admin");
    const back = sessionStorage.getItem(RETURN);
    sessionStorage.removeItem(RETURN);
    if (err) return { error: err };
    const verifier = sessionStorage.getItem(VERIFIER);
    sessionStorage.removeItem(VERIFIER);
    try { keep(await auth("token?grant_type=pkce", { auth_code: code, code_verifier: verifier })); }
    catch (e) { return { error: e.message }; }
    if (back && SAFE_RETURN.test(back)) { location.replace(back); return { redirect: true }; }
    return {};
  }

  function signOut() {
    const s = stored();
    forget();
    if (s) fetch(`${BACKEND}/auth/v1/logout`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${s.access}` } }).catch(() => {});
  }

  return { BACKEND, ANON, KEY, signIn, auth, keep, stored, forget, token, finishSignIn, signOut };
})();
