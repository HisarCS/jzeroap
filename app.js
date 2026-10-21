// JavaZero. Two modes, chosen by CFG.APPS_SCRIPT_URL:
//  - empty (default): local mode, no server, no login; progress lives in this browser and students share a code (#/share, #/admin).
//  - set: Google sign-in (school domain only), server-side grading and solutions through the Apps Script /exec URL.
// In local mode code is run on Judge0 CE. To configure without editing this file, define window.JZ_CONFIG before app.js.
const CFG = Object.assign({
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxp-D8gHNEh8MAbLyfBZWSuHHskHM1Q3m0_FOGA4EzHBLdBwGvS1U566tE4kWpWNQfulg/exec",
  GOOGLE_CLIENT_ID: "869819921251-e2hfjrttem2t0vpnrsjb0sgbvghsfras.apps.googleusercontent.com"
}, window.JZ_CONFIG);
const SERVER = /^https:\/\//.test(CFG.APPS_SCRIPT_URL);
const JUDGE0 = "https://ce.judge0.com";
const DOMAIN = "hisarschool.k12.tr";
const PEEK_AFTER = 2;   // wrong attempts needed before the solution can be shown (unless already solved)
const $ = (s) => document.querySelector(s);
const app = $("#app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LEVELS = ["", "Very easy", "Easy", "Medium", "Hard", "Very hard"];
const KINDS = { code: "Code", mcq: "MCQ", frq: "FRQ", fill: "Fill in", debug: "Debug", project: "Project" };
const CATS = { syntax: "Syntax", semantics: "Semantics", trace: "Trace", debug: "Debug", data: "Data", write: "Write code" };
const diff = (n) => `<span class="pill d${n}">${LEVELS[n]}</span>`;
const unitOf = (t) => parseInt(t) || 0;
const pad = (t) => t.replace(/^(\d+)\.(\d+)/, (m, x, y) => x + "." + y.padStart(2, "0"));
const topicSort = (a, b) => parseFloat(pad(a)) - parseFloat(pad(b));
const pct = (got, max) => (max ? Math.round((100 * got) / max) : 0);
const fmt = (d) => (d ? new Date(d).toLocaleString() : "—");

let Q = [];            // all questions
let QM = {};           // by id
// Everything a student owns is stored under their e-mail: state "jz:u:<email>:v1", drafts "jz:u:<email>:d:<id>". "jz:me" points at the signed-in student.
const SK = (e) => "jz:u:" + e + ":v1", DK = (e) => "jz:u:" + e + ":d:";
const blank = () => ({ name: "", email: "", subs: {} });
const lsKeys = (pre) => { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(pre)) out.push(k); } } catch {} return out; };
function readState(email) {
  try { const o = JSON.parse(localStorage.getItem(SK(email))); return o && typeof o === "object" && o.subs && typeof o.subs === "object" && !Array.isArray(o.subs) ? o : null; } catch { return null; }
}
function migrate() {   // older versions kept one shared "jz:v1" and "jz:d:<id>" drafts
  try {
    const leg = localStorage.getItem("jz:v1"); if (leg == null) return;
    let o = null; try { o = JSON.parse(leg); } catch {}
    const e = o && typeof o.email === "string" ? o.email.trim().toLowerCase() : "";
    if (e && !localStorage.getItem(SK(e))) {
      localStorage.setItem(SK(e), leg);
      lsKeys("jz:d:").forEach((k) => { localStorage.setItem(DK(e) + k.slice(5), localStorage.getItem(k)); localStorage.removeItem(k); });
      if (o.name && localStorage.getItem("jz:me") == null) localStorage.setItem("jz:me", e);
    }
    localStorage.removeItem("jz:v1");
  } catch {}
}
function load() {
  migrate();
  try { const e = localStorage.getItem("jz:me"); if (e) { const o = readState(e); if (o) { o.email = e; return o; } } } catch {}
  return blank();
}
let st = load();       // this student's state
function save() { try { if (st.email) localStorage.setItem(SK(st.email), JSON.stringify(st)); localStorage.setItem("jz:me", st.email || ""); } catch {} }
const sub = (id) => (st.subs[id] ||= { best: 0, tries: 0, fails: 0, peeked: false, solved: false, last: null, at: null });
// Solved = the answer was fully correct at least once, even if penalties reduced the points earned.
const isDone = (p, s = st.subs[p.id]) => !!s && (!!s.solved || (s.best || 0) >= p.points);
const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
// Full points on the first try; each failed attempt costs 25% (floor 25%). Looking at the solution first caps it at 25%.
// Opening the second hint costs a further 10% (applied before the 25% floor).
// In server mode the server decides the points; hints never cost anything there.
const factor = (s) => Math.min(s.peeked ? 0.25 : 1, Math.max(0.25, (1 - 0.25 * (s.fails || 0)) * (!SERVER && (s.hn || 0) >= 2 ? 0.9 : 1)));
// Any penalty takes off at least 1 point (so the 10% hint cost still bites on 3-point questions) and never goes below 1.
const val = (P, f) => (f >= 1 ? P : Math.max(1, Math.min(P - 1, Math.round(P * f))));
const worth = (p, s) => (SERVER && Number.isFinite(s.nw) ? s.nw : val(p.points, factor(s)));
const solOpen = (p, s) => !!(s.peeked || (s.fails || 0) >= PEEK_AFTER || isDone(p, s));
const best = (p) => Math.min(st.subs[p.id]?.best || 0, p.points);

async function boot() {
  try {
    Q = await (await fetch("data/questions.json")).json();
  } catch (e) {
    app.innerHTML = `<div class="card bad">Could not load the questions: ${esc(e.message)}</div>`;
    return;
  }
  Q = Q.filter((p) => unitOf(p.topic) <= 2);   // only Units 1-2 are open this year
  Q.forEach((p) => (QM[p.id] = p));
  if (SERVER) { const ft = document.querySelector("footer"); if (ft) ft.textContent = "AP CSA · Hisar 2026–2027 · Sign in with your school account"; }
  window.addEventListener("hashchange", route);
  route();
  if (SERVER && st.name && tokenOk()) srv("me").then((m) => { if (String(m.email || "").toLowerCase() === st.email) { applyMe(m); if (/^#?\/?(\?.*)?$|^#\/me/.test(location.hash)) route(); } }).catch(() => {});   // refresh the cache so solved status matches other browsers
}

function nav() {
  const link = (h, t) => `<a href="#${h}" class="${location.hash.replace(/\?.*/, "") === "#" + h ? "on" : ""}">${t}</a>`;
  $("#nav").innerHTML = st.name ? link("/", "Questions") + link("/me", "📊 My progress") + (SERVER ? "" : link("/share", "📤 Send to teacher")) + (streakNow() ? `<span class="chip" title="Days in a row with at least one answer">🔥 ${streakNow()}</span>` : "") + (!SERVER || st.teacher ? '<a href="#/admin" class="muted" style="font-size:13px">Teacher</a>' : "") + '<button id="who" class="muted" style="font-size:13px" title="' + (SERVER ? "Sign out" : "Switch student") + '">' + esc(st.name.split(" ")[0]) + ' ⎋</button>' : "";
  $("#who")?.addEventListener("click", () => { if (SERVER) { if (confirm("Sign out?")) signOut(); return; } if (confirm("Switch student? The next student starts with an empty page. Your progress and saved code stay in this browser under your e-mail and come back when you start again with the same e-mail.")) { save(); st = blank(); save(); pending = ""; location.hash = "/"; route(); } });
}

let pending = "";   // link the student opened before signing in
function route() {
  nav();
  const [path, ...rest] = location.hash.replace(/^#\/?/, "").replace(/\?.*/, "").split("/");
  if (SERVER && st.name && !tokenOk()) { st.name = ""; st.teacher = false; }   // session ended: sign in again
  if (!SERVER && path === "admin") return admin();
  if (!st.name) { if (path === "p" || path === "admin") pending = location.hash; return welcome(); }
  if (SERVER && path === "admin") return admin();
  if (path === "p" && QM[rest[0]]) return problemPage(QM[rest[0]]);
  if (path === "me") return me();
  if (path === "test" && /^[12]$/.test(rest[0]) && testsOk(+rest[0])) return testPage(+rest[0]);
  if (path === "share" && !SERVER) return share();
  if (path) return notFound();
  return home();
}
function notFound() {
  app.innerHTML = '<h1>Not found</h1><p>This page does not exist.</p><p><a class="btn" href="#/">Home</a></p>';
}

/* ---------------- Google sign-in + Apps Script (server mode) ---------------- */
let tok = "", waiter = null;
try { tok = sessionStorage.getItem("jz:tok") || ""; } catch {}
const jwt = (t) => { try { return JSON.parse(new TextDecoder().decode(unb64u(t.split(".")[1]))); } catch { return null; } };
const tokenOk = () => { const j = tok && jwt(tok); return !!(j && j.exp * 1000 > Date.now() + 30000); };
function setTok(t) { tok = t || ""; try { tok ? sessionStorage.setItem("jz:tok", tok) : sessionStorage.removeItem("jz:tok"); } catch {} }
let endedMsg = "";
function signOut(ended) { endedMsg = ended ? "Your session ended. Please sign in again; nothing was counted." : ""; asgC = null; setTok(""); save(); st = blank(); save(); try { google.accounts.id.disableAutoSelect(); } catch {} location.hash = "/"; route(); }
let gisP;
const gis = () => (gisP ||= new Promise((ok, no) => {
  const done = () => { google.accounts.id.initialize({ client_id: CFG.GOOGLE_CLIENT_ID, callback: onCred, hd: DOMAIN, auto_select: true }); ok(); };
  if (window.google?.accounts?.id) return done();
  const sc = document.createElement("script"); sc.src = "https://accounts.google.com/gsi/client"; sc.async = true; sc.onload = done;
  sc.onerror = () => { gisP = null; no(new Error("Could not load Google sign-in. Check your internet connection.")); }; document.head.appendChild(sc);
}));
async function onCred(resp) {
  const j = resp?.credential && jwt(resp.credential);
  if (waiter) { const w = waiter; waiter = null; return w(j && String(j.email).toLowerCase() === st.email ? resp.credential : null); }
  if (!j || !String(j.email || "").toLowerCase().endsWith("@" + DOMAIN)) return ($("#msg") && ($("#msg").innerHTML = `<p class="warn">Please sign in with your school account (…@${DOMAIN}).</p>`));
  setTok(resp.credential); asgC = null; endedMsg = "";
  try {
    const m = await srvCall("me");
    applyMe(m, j);
    location.hash = pending || "/"; pending = ""; route();
  } catch (e) { setTok(""); $("#msg") && ($("#msg").innerHTML = `<p class="warn">${esc(e.message)}</p>`); }
}
// Fills the local cache from the server's `me` answer (the server is the source of truth for solved, best, tries, peeks and unit-test scores).
function applyMe(m, j) {
  const em = String(m.email || j?.email || "").toLowerCase(), old = readState(em);   // this account's own cache only, never another student's
  st = old || blank(); const prev = st.subs; st.subs = {};
  st.email = em; st.name = String(m.name || j?.name || em).trim().slice(0, 80); st.teacher = !!m.teacher;
  const T = {};
  Object.entries(m.state && typeof m.state === "object" ? m.state : {}).forEach(([id, v]) => {
    if (!v || typeof v !== "object") return;
    const tm = /^TEST:(\d{1,2})$/.exec(id);
    if (tm) { T[+tm[1]] = { best: Math.max(0, +v.best || 0), n: TEST_N, runs: Math.max(0, +v.tries || 0) }; return; }
    if (QM[id]) { const x = sub(id), o = prev[id] || {}; x.best = +v.best || 0; x.tries = +v.tries || 0; x.fails = +v.fails || 0; x.peeked = !!v.peeked; x.solved = !!v.solved || x.best >= QM[id].points; x.hn = o.hn; x.last = o.last ?? null; x.at = o.at ?? null; }
  });
  st.tests = T;
  save();
}
// New ID token from Google (one tap, silent when possible); resolves to null if it does not work.
async function freshToken() {
  try { await gis(); } catch { return null; }
  return new Promise((ok) => { waiter = ok; setTimeout(() => { if (waiter === ok) { waiter = null; ok(null); } }, 12000); google.accounts.id.prompt(); });
}
async function srvCall(action, qid, content, extra) {
  let r;
  const t0 = performance.now();
  try {
    r = await (await fetch(CFG.APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(Object.assign({ token: tok, action, qid, content }, extra)) })).json();
  } catch { throw new Error("The grading service is busy, nothing was counted."); }
  if (!r || typeof r !== "object") throw new Error("The grading service is busy, nothing was counted.");
  if (r.timing) {                                       // only present while the teacher sets DEBUG_TIMING=1 on the server
    let bar = document.getElementById("jz-timing");
    if (!bar) { bar = document.createElement("pre"); bar.id = "jz-timing"; bar.style.cssText = "position:fixed;left:0;bottom:0;margin:0;padding:6px 10px;max-width:100%;overflow:auto;background:#000c;color:#fff;font:11px monospace;z-index:99;white-space:pre-wrap"; document.body.appendChild(bar); }
    bar.textContent = action + " browser_ms=" + Math.round(performance.now() - t0) + " " + JSON.stringify(r.timing);
  }
  if (r.error) { const raw = String(r.error).slice(0, 300), e = new Error(friendly(raw)); e.raw = raw; e.expired = /expired|not signed in/i.test(raw); throw e; }
  return r;
}
// Plain-English versions of the server's error texts (unknown texts are shown as they are).
const FRIENDLY = [
  [/^forbidden$/i, "This page is only for teachers."],
  [/unknown unit/i, "That unit does not exist."],
  [/no test for this unit/i, "There is no closing test for this unit yet."],
  [/answers must be an object|empty answer|answer too long/i, "Your answers could not be read. Reload the page and try again; nothing was counted."],
  [/unknown question/i, "A question in this request is not known to the server. Reload the page and try again."],
  [/no longer valid/i, "This test was already submitted or is out of date. Start a new test."],
  [/title must be/i, "The title must be 1 to 120 characters."],
  [/due must be/i, "Choose a valid due date."],
  [/qids must be/i, "Select between 1 and 100 questions."],
  [/too many submissions/i, "Too many submissions in a short time. Wait a minute and try again."],
];
const friendly = (t) => (FRIENDLY.find(([re]) => re.test(t)) || [0, t])[1];
async function srv(action, qid, content, extra) {
  try { return await srvCall(action, qid, content, extra); } catch (e) {
    if (!e.expired) throw e;
    const t = await freshToken();
    if (!t) { signOut(true); throw Object.assign(new Error("Your session ended. Please sign in again; nothing was counted."), { ended: true }); }
    setTok(t); return srvCall(action, qid, content, extra);
  }
}

function welcome() {
  if (SERVER) {
    const em = endedMsg;   // cleared on the next sign-in (the hashchange re-renders this screen once more)
    app.innerHTML = `<div class="card hero"><div class="big">☕ JavaZero</div><div class="badge">AP CSA · Hisar 2026–2027</div>
      <p class="muted">Practice Java from easy to hard — Unit 1 and Unit 2. Every question is checked instantly.</p>
      <p>Sign in with your school Google account (…@${DOMAIN}).</p><div id="gbtn" aria-label="Sign in with Google"></div><div id="msg" role="status">${em ? `<p class="warn">${esc(em)}</p>` : ""}</div>
      <p class="muted" style="font-size:13px">Your answers are graded and your progress is stored by the school's JavaZero service. Teacher? Sign in, then open the class view.</p></div>`;
    gis().then(() => google.accounts.id.renderButton($("#gbtn"), { theme: "outline", size: "large", text: "signin_with" })).catch((e) => $("#msg")?.insertAdjacentHTML("beforeend", `<p class="warn">${esc(e.message)}</p>`));
    return;
  }
  app.innerHTML = `<div class="card hero">
    <div class="big">☕ JavaZero</div>
    <div class="badge">AP CSA · Hisar 2026–2027</div>
    <p class="muted">Practice Java from easy to hard — Unit 1 and Unit 2. Every question is checked instantly.</p>
    <label for="nm">Your name</label><input id="nm" autocomplete="name" placeholder="First Last">
    <label for="em">School e-mail</label><input id="em" type="email" autocomplete="email" placeholder="name@${DOMAIN}">
    <p><button class="btn big-btn" id="go">Start</button></p><div id="msg"></div>
    <p class="muted" style="font-size:13px">Your progress is saved in this browser. Teacher? <a href="#/admin">Open the class view</a>.</p></div>`;
  const go = () => {
    const name = $("#nm").value.trim().replace(/\s+/g, " "), email = $("#em").value.trim().toLowerCase();
    if (!name) return ($("#msg").innerHTML = '<p class="warn">Please enter your name.</p>');
    if (!email.endsWith("@" + DOMAIN)) return ($("#msg").innerHTML = `<p class="warn">Please use your school e-mail (…@${DOMAIN}).</p>`);
    st = readState(email) || blank(); st.name = name; st.email = email; save(); location.hash = pending || "/"; pending = ""; route();
  };
  $("#go").onclick = go;
  app.querySelectorAll("input").forEach((i) => i.addEventListener("keydown", (e) => e.key === "Enter" && go()));
  $("#nm").focus();
}

/* ---------------- navigation helpers ---------------- */
const byOrder = (a, b) => topicSort(a.topic, b.topic) || a.d - b.d;
const unsolved = (p) => !isDone(p);
function nextUp() {
  const recent = Object.entries(st.subs).filter(([id, v]) => v.at && QM[id] && unsolved(QM[id])).sort((a, b) => b[1].at.localeCompare(a[1].at))[0];
  if (recent) return QM[recent[0]];
  return [...Q].sort(byOrder).find(unsolved) || null;
}
function nextAfter(p) {
  const same = Q.filter((x) => x.topic === p.topic).sort((a, b) => a.d - b.d);
  const i = same.findIndex((x) => x.id === p.id);
  return same.slice(i + 1).find(unsolved) || same.find((x) => unsolved(x) && x.id !== p.id) || null;
}

/* ---------------- home ---------------- */
function home() {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const topic = params.get("topic") || "", cat = params.get("cat") || "";
  const got = (ps) => ps.reduce((a, p) => a + best(p), 0), max = (ps) => ps.reduce((a, p) => a + p.points, 0);
  if (!topic) {
    const topics = [...new Set(Q.map((p) => p.topic))].sort(topicSort);
    const units = [...new Set(topics.map(unitOf))];
    const UNIT_NAMES = { 1: "Using Objects and Methods", 2: "Selection and Iteration" };
    const next = nextUp();
    const tried = Object.keys(st.subs).length;
    const intro = tried ? "" : `<div class="steps"><div class="step"><b>1 · Pick a topic</b><br>Start with Unit 1 or choose any topic.</div><div class="step"><b>2 · Solve</b><br>Questions go from easy to hard. Run the samples before you submit.</div><div class="step"><b>3 · Grow</b><br>Full points on the first try; each wrong attempt costs 25%.</div></div>`;
    const cont = next ? `<a class="card tile" href="#/p/${next.id}"><div class="grow"><div class="muted">${tried ? "Continue where you left off" : "Start here"}</div><b>${esc(next.title)}</b> <span class="muted">· ${esc(next.topic)}</span></div><span class="btn">${tried ? "Continue →" : "Start →"}</span></a>` : '<div class="card">🎉 You have solved every question!</div>';
    app.innerHTML = `<h1>Hi ${esc(st.name.split(" ")[0])} 👋</h1>${gameStrip()}${SERVER ? '<div id="asg"></div>' : ""}${intro}${cont}` + units.map((u) => {
      const ups = Q.filter((p) => unitOf(p.topic) === u);
      return `<div class="card"><div class="row"><h2 class="grow" style="margin:0">Unit ${u} · ${UNIT_NAMES[u] || ""}</h2><span class="muted">${ups.filter((p) => isDone(p)).length}/${ups.length} solved</span> <b>${pct(got(ups), max(ups))}%</b></div>
        <div class="bar" style="margin:8px 0"><i style="width:${pct(got(ups), max(ups))}%"></i></div>
        ${testTile(u)}
        ${topics.filter((t) => unitOf(t) === u).map((t) => { const tp = Q.filter((p) => p.topic === t);
          return `<a class="row" href="#/?topic=${encodeURIComponent(t)}" style="text-decoration:none;color:inherit;padding:4px 0">
            <span class="grow">${esc(t)} <span class="muted">${tp.filter((p) => isDone(p)).length}/${tp.length} done</span></span><div class="bar" style="width:80px;flex:none"><i style="width:${pct(got(tp), max(tp))}%"></i></div><span style="width:44px;text-align:right">${pct(got(tp), max(tp))}%</span></a>`; }).join("")}</div>`;
    }).join("");
    if (SERVER) asgCard();
    return;
  }
  const tp = Q.filter((p) => p.topic === topic);
  const list = tp.filter((p) => !cat || p.category === cat).sort((a, b) => a.d - b.d);
  app.innerHTML = `<p><a href="#/">← Units</a></p>
    <div class="row"><h1 class="grow">${esc(topic)}</h1><b>${pct(got(tp), max(tp))}%</b></div>
    <div class="bar"><i style="width:${pct(got(tp), max(tp))}%"></i></div>
    <div class="row" style="margin:10px 0"><a class="pill" href="#/?topic=${encodeURIComponent(topic)}">All</a>
      ${Object.entries(CATS).filter(([k]) => tp.some((p) => p.category === k)).map(([k, v]) => `<a class="pill" href="#/?topic=${encodeURIComponent(topic)}&cat=${k}">${v}</a>`).join("")}</div>
    <div class="scroll"><table><tr><th></th><th>Question</th><th>Category</th><th>Level</th><th>Type</th><th>Points</th></tr>
    ${list.map((p) => `<tr><td>${isDone(p) ? "✅" : st.subs[p.id]?.best > 0 || st.subs[p.id]?.tries ? "🟡" : ""}</td><td><a href="#/p/${p.id}">${esc(p.title)}</a></td>
      <td>${CATS[p.category] || ""}</td><td>${diff(p.d)}</td><td>${KINDS[p.kind]}</td><td>${best(p)}/${p.points}</td></tr>`).join("")}</table></div>`;
}

/* ---------------- running code ---------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Calls the code runner; retries when it is busy and explains failures in plain words.
async function api(path, opts, tries = 3) {
  let msg = "";
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(JUDGE0 + path, opts);
      if (r.ok) return await r.json();
      if (r.status !== 429 && r.status < 500) throw new Error(`The code runner refused the request (${r.status}). Nothing was counted.`);
      msg = r.status === 429 ? "The code runner is busy right now." : "The code runner is having trouble.";
    } catch (e) {
      if (/refused/.test(e.message)) throw e;
      msg = "Cannot reach the code runner — check your internet connection.";
    }
    await sleep(1200 * (i + 1));
  }
  throw new Error(msg + " Nothing was counted. Please try again in a few seconds.");
}
// Runs one program against several inputs at the same time (one batch request, then polling).
async function judgeMany(source, inputs) {
  const created = await api("/submissions/batch?base64_encoded=false", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissions: inputs.map((stdin) => ({ language_id: 62, source_code: source, stdin, cpu_time_limit: 3, memory_limit: 256000 })) }),
  });
  const tokens = created.map((x) => x.token);
  if (tokens.some((t) => !t)) throw new Error("The code runner rejected the program. Nothing was counted.");
  const t0 = Date.now();
  for (;;) {
    await sleep(Date.now() - t0 < 1500 ? 600 : 800);
    const res = await api(`/submissions/batch?tokens=${tokens.join(",")}&base64_encoded=false&fields=status,stdout,stderr,compile_output`);
    if (res.submissions.every((s) => s.status && s.status.id > 2)) return res.submissions;
    if (Date.now() - t0 > 45000) throw new Error("The code runner took too long. Nothing was counted. Please try again.");
  }
}
function combine(student, harness) {
  const imports = [];
  const strip = (src) => src.split("\n").filter((l) => (/^\s*import\s/.test(l) ? (imports.includes(l.trim()) || imports.push(l.trim()), false) : true)).join("\n");
  const s = strip(student).replace(/\bpublic\s+(abstract\s+class|class|interface|enum)\b/g, "$1");
  const h = strip(harness);
  return imports.join("\n") + "\n" + s + "\n" + h;
}
const norm = (s) => String(s ?? "").replace(/\s+/g, "");

async function runTests(p, code, tests) {
  const src = p.kind === "project" ? combine(code, p.harness) : code;
  const res = await judgeMany(src, tests.map((t) => t.input ?? ""));
  return res.map((r, i) => {
    const out = (r.stdout ?? "").trim(), t = tests[i];
    const ok = out === String(t.output).trim() && r.status?.id === 3;
    return { ok, status: !ok && (!r.status || r.status.id === 3) ? "Wrong answer" : r.status?.description, input: t.input, expected: t.output, got: out, error: r.compile_output || r.stderr };
  });
}

/* ---------------- problem page ---------------- */
const loadDraft = (id) => { try { return localStorage.getItem(DK(st.email) + id); } catch { return null; } };
const saveDraft = (id, v) => { try { v == null ? localStorage.removeItem(DK(st.email) + id) : localStorage.setItem(DK(st.email) + id, v); } catch {} };

function problemPage(p) {
  const s = sub(p.id);
  let input = "";
  if (p.kind === "fill") {
    let i = 0; const nb = (p.starter.match(/___/g) || []).length;
    input = `<pre class="fill">${esc(p.starter).replace(/___/g, () => `<input class="blank" data-i="${i}" size="14" autocomplete="off" aria-label="Blank ${++i} of ${nb}">`)}</pre>`;
  } else if (p.kind === "mcq") {
    input = `<fieldset class="mcq"><legend class="sr">Answer choices</legend>` + p.choices.map((c, i) => `<label class="choice"><input type="radio" name="c" value="${i}">${"ABCDE"[i]}) ${esc(c)}</label>`).join("") + "</fieldset>";
  } else {
    const draft = loadDraft(p.id);
    const label = p.kind === "project" ? "Write your class(es). No main method needed; you don't have to write public." : p.kind === "debug" ? "Fix the buggy code" : "Java code (class <code>Main</code>, read input with Scanner)";
    const def = p.starter || (p.kind === "code" ? "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        \n    }\n}\n" : "");
    input = `<label for="code">${label}</label><textarea class="code" id="code" spellcheck="false" aria-describedby="codehint">${esc(draft ?? s.last ?? def)}</textarea>
      <div class="row muted" style="font-size:13px" id="codehint"><span class="grow">Tab inserts spaces · press Esc, then Tab to leave the box · Ctrl+Enter ${p.kind === "mcq" ? "submits" : "runs the samples"} · your code is saved as you type</span><a href="#" id="reset">Reset code</a></div>`;
    window.__def = def;
  }
  const hasRun = ["code", "debug"].includes(p.kind) || (p.kind === "project" && !SERVER && p.harness);
  app.innerHTML = `
    <p><a href="#/?topic=${encodeURIComponent(p.topic)}">← ${esc(p.topic)}</a></p>
    <h1>${esc(p.title)}</h1>
    <div class="row" id="meta"></div>
    ${statementHtml(p)}
    ${(p.samples || []).map((x, i) => p.kind === "project" ? `<div><b>Sample scenario ${i + 1}: expected output</b><pre>${esc(x.output)}</pre></div>` : `<div class="row"><div class="grow"><b>Sample input ${i + 1}</b><pre>${esc(x.input)}</pre></div><div class="grow"><b>Output</b><pre>${esc(x.output)}</pre></div></div>`).join("")}
    <div id="hints"></div>
    ${input}
    <div class="row" style="margin-top:10px">${hasRun ? '<button class="btn alt" id="run">Run samples</button>' : ""}<button class="btn" id="sub">Submit</button></div>
    <div id="res"></div>
    <div id="sol" style="margin-top:14px"></div>`;
  const drawMeta = () => {
    $("#meta").innerHTML = `${diff(p.d)} <span class="pill">${CATS[p.category] || ""}</span> <span class="pill">${KINDS[p.kind]}</span> <span class="pill">${best(p)}/${p.points} points</span> ${isDone(p, s) ? '<span class="pill ok">solved</span>' : `<span class="pill" id="avail" title="Each wrong attempt costs 25%; ${SERVER ? "" : "the second hint costs 10%; "}looking at the solution caps it at 25%">available now: ${worth(p, s)}</span>`}`;
  };
  drawMeta();
  const hs = hintsOf(p), hbox = $("#hints");
  const drawHints = () => {
    if (!hs.length) { hbox.innerHTML = ""; return; }
    const n = Math.min(s.hn || 0, hs.length);
    hbox.innerHTML = hs.slice(0, n).map((h, i) => `<div class="explain" role="note" tabindex="-1"><b>Hint ${i + 1}</b><p>${esc(h)}</p></div>`).join("") +
      (n < hs.length ? `<button class="btn alt" id="hint">${n === 0 ? "Show hint 1 (free)" : (SERVER ? "Show hint 2" : "Show hint 2 (costs 10% of the points)")}</button>` : "");
    $("#hint")?.addEventListener("click", () => {
      if (n === 1 && !SERVER && !confirm("Open hint 2? It reduces the points you can earn on this question by 10%.")) return;
      s.hn = n + 1; save(); drawHints(); drawMeta();
      ($("#hint") || hbox.querySelector(".explain:last-of-type"))?.focus();   // the button is gone after hint 2: move to the new hint
    });
  };
  drawHints();
  const ta = $("#code");
  ta?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") ta.dataset.free = "1";
    else if (e.key === "Tab" && !ta.dataset.free && !e.shiftKey) { e.preventDefault(); ta.setRangeText("    ", ta.selectionStart, ta.selectionEnd, "end"); ta.dispatchEvent(new Event("input")); }
    else if (e.key === "Tab") delete ta.dataset.free;
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ($("#run") || $("#sub")).click(); }
    else delete ta.dataset.free;
  });
  let dt;
  ta?.addEventListener("input", () => { clearTimeout(dt); dt = setTimeout(() => saveDraft(p.id, ta.value), 300); });
  $("#reset")?.addEventListener("click", (e) => { e.preventDefault(); if (confirm("Reset to the starting code? Your current code in this box will be lost.")) { ta.value = window.__def; saveDraft(p.id, null); } });
  const content = () => {
    const bl = [...app.querySelectorAll(".blank")];
    return bl.length ? bl.map((b) => b.value) : ta ? ta.value : document.querySelector("input[name=c]:checked")?.value;
  };
  let shown = "";
  const drawSol = () => {
    const box = $("#sol");
    if (shown) { box.innerHTML = shown; return; }
    if (solOpen(p, s)) { box.innerHTML = `<button class="btn alt" id="peek">Show the solution</button> <span class="muted">${s.peeked ? "(you already looked at it)" : isDone(p, s) ? "(you solved this one)" : "(your points for this question drop to 25% and your teacher can see that you looked)"}</span>`; $("#peek").onclick = peek; return; }
    const k = Math.min(s.fails || 0, PEEK_AFTER);
    box.innerHTML = `<button class="btn alt" id="peek" disabled aria-describedby="peekwhy">Show the solution</button> <span class="muted" id="peekwhy">Unlocks after ${PEEK_AFTER} wrong attempts (${k}/${PEEK_AFTER}).</span>`;
  };
  const peek = async () => {
    if (!s.peeked && !isDone(p, s) && !confirm("Show the solution? The most you can earn on this question will drop to 25%.")) return;
    let sol, ex;
    if (SERVER) {
      const pb = $("#peek"); if (pb) pb.disabled = true;
      const stop = busy($("#sol"), "Loading…");
      try { const r = await srv("solution", p.id); sol = r.solution; ex = r.explanation; } catch (e) { stop(); if (e.ended || !$("#sol")) return; $("#sol").innerHTML = `<div class="card bad">${esc(e.message)}</div>`; drawSol(); return; }
      stop();
    } else { sol = p.solution; ex = p.explanation; }
    if (!$("#sol")) return;
    if (!isDone(p, s)) s.peeked = true;
    save(); drawMeta();
    $("#res")?.querySelector("[data-left]")?.remove();   // the "next attempt" line is stale once the cap drops
    shown = `<h2>Solution</h2><pre>${esc(sol || "No solution is available for this question.")}</pre>` + (ex ? `<div class="explain" role="note"><b>Explanation</b><p>${esc(ex)}</p></div>` : "");
    drawSol();
  };
  drawSol();
  $("#run")?.addEventListener("click", async () => {
    const rb = $("#run"); rb.disabled = true;
    const stop = busy($("#res"), "Running…");
    try { const out = report(p, await runTests(p, ta.value, p.samples), true); stop(); if ($("#res")) $("#res").innerHTML = out; } catch (e) { stop(); if ($("#res")) $("#res").innerHTML = `<div class="card bad">${esc(e.message)}</div>`; }
    rb.disabled = false;
  });
  $("#sub").onclick = async () => {
    const c = content();
    if (c == null || (Array.isArray(c) && c.every((x) => !x.trim()))) return ($("#res").innerHTML = '<p class="warn">Answer first.</p>');
    const sb = $("#sub"); if (sb.disabled) return; sb.disabled = true;   // no double submits
    const stop = busy($("#res"), "Checking…");
    const f = factor(s), fails0 = s.fails || 0, peek0 = s.peeked, hn0 = s.hn || 0;   // penalty from earlier wrong attempts / peeking / hint 2 (local mode)
    const pts = (frac) => (frac >= 1 ? val(p.points, f) : Math.min(val(p.points, f), Math.round(p.points * frac * f)));
    let frac = 0, html = "", r = null;
    try {
      if (SERVER) {
        r = await srv("grade", p.id, p.kind === "mcq" ? Number(c) : c);
        frac = Math.max(0, Math.min(1, Number(r.frac) || 0)); const sc = Number(r.score) || 0;
        if (p.kind === "mcq") html = `<div class="card ${frac ? "ok" : "bad"}">${frac ? "✅ Correct! +" + plural(sc, "point") : "❌ Not quite — try again."}</div>`;
        else if (p.kind === "fill") { const bl = Array.isArray(r.blanks) ? r.blanks : [], n = bl.filter(Boolean).length; html = `<div class="card"><b>${frac >= 1 ? "✅ All correct" : "Result"}: ${n}/${bl.length} blanks · +${sc}</b><div>${bl.map((b, i) => `<span class="${b ? "ok" : "bad"}">Blank ${i + 1}: ${b ? "✓" : "✗"}</span>`).join(" · ")}</div></div>`; }
        else html = report(p, Array.isArray(r.cases) ? r.cases : [], false, sc);
        if (r.explanation && frac >= 1) html += `<div class="explain" role="note"><b>Explanation</b><p>${esc(r.explanation)}</p></div>`;
        if (!["mcq", "fill"].includes(p.kind)) s.last = c;
      } else if (p.kind === "mcq") {
        frac = Number(c) === p.answer ? 1 : 0;
        html = `<div class="card ${frac ? "ok" : "bad"}">${frac ? "✅ Correct! +" + plural(pts(1), "point") : "❌ Not quite — try again."}</div>`;
        if (frac && p.explanation) html += `<div class="explain" role="note"><b>Explanation</b><p>${esc(p.explanation)}</p></div>`;   // explanation only after a correct answer (or the revealed solution)
      } else if (p.kind === "fill") {
        const oks = p.blanks.map((acc, i) => acc.map(norm).includes(norm(c[i])));
        const n = oks.filter(Boolean).length; frac = n / p.blanks.length;
        html = `<div class="card"><b>${n === p.blanks.length ? "✅ All correct" : "Result"}: ${n}/${p.blanks.length} blanks · +${pts(frac)}</b><div>${oks.map((b, i) => `<span class="${b ? "ok" : "bad"}">Blank ${i + 1}: ${b ? "✓" : "✗"}</span>`).join(" · ")}</div></div>`;
      } else {
        const cases = await runTests(p, c, p.tests);
        frac = cases.filter((x) => x.ok).length / p.tests.length;
        html = report(p, cases, false, pts(frac));
        s.last = c;
      }
    } catch (e) { stop(); sb.disabled = false; if (e.ended || !$("#res")) return; return ($("#res").innerHTML = `<div class="card bad">${esc(e.message)}</div>`); }
    stop(); sb.disabled = false;
    const live = !!$("#res");   // the page may have been re-rendered while waiting; still record the result, but do not draw
    const was = isDone(p, s);
    if (frac >= 1 || (SERVER && r.solved === true)) s.solved = true;
    if (SERVER) { s.tries = Number.isFinite(+r.tries) ? +r.tries : s.tries + 1; if (frac < 1 && !was) s.fails = (s.fails || 0) + 1; s.best = Math.max(s.best, Number(r.best) || 0); s.nw = Number.isFinite(+r.nextWorth) ? +r.nextWorth : undefined; }
    else { s.tries++; if (frac < 1 && !was) s.fails = (s.fails || 0) + 1; s.best = Math.max(s.best, pts(frac)); }
    s.at = new Date().toISOString(); touchStreak(); save();
    const why = [fails0 && "earlier wrong attempts", peek0 && "looking at the solution", hn0 >= 2 && !SERVER && "opening the second hint"].filter(Boolean);
    const note = !SERVER && f < 1 && frac > 0 && why.length && !was ? `<p class="warn">Points are reduced to ${Math.round(f * 100)}% of the full value because of ${why.join(" and ")}.</p>` : "";
    const nx = nextAfter(p);
    const nextBtn = frac === 1 && nx ? `<p><a class="btn" href="#/p/${nx.id}">Next question →</a></p>` : frac === 1 ? `<p><a class="btn" href="#/?topic=${encodeURIComponent(p.topic)}">Back to topic →</a></p>` : "";
    const left = frac < 1 && !isDone(p, s) ? `<p class="muted" data-left>Next attempt is worth at most ${plural(worth(p, s), "point")}.</p>` : "";
    if (!live) return;
    $("#res").innerHTML = html + note + left + nextBtn + newBadges();
    drawSol(); drawMeta();
    $("#res").scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
}
// Shows "Checking…" with a spinner; after 3 s adds a patience note. Returns a function that stops the timer.
function busy(box, msg) {
  box.innerHTML = `<p class="muted" role="status"><span class="spin" aria-hidden="true"></span>${esc(msg)}<span class="slow"></span></p>`;
  const t = setTimeout(() => { const e = box.querySelector(".slow"); if (e) e.textContent = " This can take up to 10 seconds."; }, 3000);
  return () => clearTimeout(t);
}
// Statement text; FRQ (project) statements with parts (a) and (b) get one block per part.
const rich = (t) => t.split("\n").reduce((a, l) => { const m = /^\s*[-•]\s+(.*)/.exec(l); if (m) { if (!a.ul) a.out += (a.ul = "<ul>") ; a.out += `<li>${esc(m[1])}</li>`; } else { if (a.ul) { a.out += "</ul>"; a.ul = ""; } if (l.trim()) a.out += `<p>${esc(l)}</p>`; } return a; }, { out: "", ul: "" });
function statementHtml(p) {
  const t = String(p.statement || ""), ia = t.search(/^\(a\)/m), ib = t.search(/^\(b\)/m);
  if (p.kind !== "project" || ia < 0 || ib < ia) return `<div class="card" style="white-space:pre-wrap">${esc(t)}</div>`;
  const fin = (x) => { const r = rich(x); return r.out + (r.ul ? "</ul>" : ""); };
  const rest = t.slice(ib), cut = rest.search(/\n\s*\n/), pb = cut < 0 ? rest : rest.slice(0, cut), tail = cut < 0 ? "" : rest.slice(cut);
  return `<div class="card">${fin(t.slice(0, ia).trim())}</div>
    <div class="part"><h2>Part (a)</h2>${fin(t.slice(ia, ib).trim().replace(/^\(a\)\s*/, ""))}</div>
    <div class="part"><h2>Part (b)</h2>${fin(pb.trim().replace(/^\(b\)\s*/, ""))}</div>
    ${tail.trim() ? `<div class="card">${fin(tail.trim())}</div>` : ""}`;
}
function report(p, cases, samples, score) {
  const n = cases.filter((x) => x.ok).length, fr = p.kind === "project", nm = fr ? "Scenario" : "Test";
  const why = (c) => (c.status && !/^accepted$/i.test(c.status) ? c.status : "Wrong answer");   // a failed test is never "Accepted"
  return `<div class="card"><b>${samples ? "Sample results" : n === cases.length ? "✅ Accepted" : "Result"}: ${n}/${cases.length} ${fr ? "scenarios" : "tests"}${samples ? "" : " · +" + plural(score, "point")}</b>
    ${cases.map((c, i) => `<div class="${c.ok ? "ok" : "bad fail"}">${c.ok ? "✓" : "✗"} ${nm} ${c.n ?? i + 1}: ${c.ok ? "passed" : esc(why(c))}
      ${samples && !c.ok ? `<pre>${fr ? "" : `input:\n${esc(c.input)}\n`}expected:\n${esc(c.expected)}\ngot:\n${esc(c.got)}</pre>` : ""}${c.error ? `<pre>${esc(c.error)}</pre>` : ""}</div>`).join("")}</div>`;
}

/* ---------------- hints ---------------- */
// Optional `hints` array in the bank (max 2 strings). Questions without hints simply show no hint button.
const hintsOf = (p) => (Array.isArray(p.hints) ? p.hints.filter((h) => typeof h === "string" && h.trim()).slice(0, 2) : []);

/* ---------------- streak, XP, badges (local only) ---------------- */
const dayKey = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const dayAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dayKey(d); };
function touchStreak() {
  const g = (st.streak = st.streak && typeof st.streak === "object" ? st.streak : { last: "", cur: 0, max: 0 }), t = dayKey();
  if (g.last === t) return;
  g.cur = g.last === dayAgo(1) ? (g.cur || 0) + 1 : 1; g.last = t; g.max = Math.max(g.max || 0, g.cur);
}
function streakNow() { const g = st.streak; return g && (g.last === dayKey() || g.last === dayAgo(1)) ? g.cur || 0 : 0; }
const testsOf = () => (st.tests && typeof st.tests === "object" ? st.tests : (st.tests = {}));
const testBest = (u) => Number(testsOf()[u]?.best) || 0;
function xpNow() { return Q.reduce((a, p) => a + best(p), 0) + [1, 2].reduce((a, u) => a + 5 * testBest(u), 0); }
const BADGES = [
  ["first", "🌱", "First step", "Solve your first question", (c) => c.solved >= 1],
  ["s10", "🔟", "Warm-up", "Solve 10 questions", (c) => c.solved >= 10],
  ["s50", "💪", "Getting strong", "Solve 50 questions", (c) => c.solved >= 50],
  ["s150", "🏆", "Marathon", "Solve 150 questions", (c) => c.solved >= 150],
  ["np", "🧠", "On my own", "Solve 20 questions without looking at a solution", (c) => c.clean >= 20],
  ["hard", "🔥", "Hard stuff", "Solve a Hard or Very hard question", (c) => c.hard >= 1],
  ["topic", "📘", "Topic master", "Finish every question in one topic", (c) => c.topics >= 1],
  ["unit", "🎓", "Unit master", "Finish every question in a unit", (c) => c.units >= 1],
  ["st3", "📅", "3-day streak", "Practise 3 days in a row", (c) => c.smax >= 3],
  ["st7", "🗓️", "7-day streak", "Practise 7 days in a row", (c) => c.smax >= 7],
  ["t1", "📝", "Test taker", "Finish a unit test", (c) => c.tests >= 1],
  ["t90", "🎯", "Test ace", "Score 90% or more on a unit test", (c) => c.tbest >= 0.9],
];
function badgeCtx() {
  const done = Q.filter((p) => isDone(p)), tp = {}, un = {};
  Q.forEach((p) => { (tp[p.topic] ||= []).push(p); (un[unitOf(p.topic)] ||= []).push(p); });
  const all = (o) => Object.values(o).filter((ps) => ps.every((p) => isDone(p))).length;
  const ts = [1, 2].filter((u) => testsOf()[u]?.runs);
  return { solved: done.length, clean: done.filter((p) => !st.subs[p.id]?.peeked).length, hard: done.filter((p) => p.d >= 4).length, topics: all(tp), units: all(un),
    smax: Math.max(st.streak?.max || 0, streakNow()), tests: ts.length, tbest: Math.max(0, ...ts.map((u) => testBest(u) / (testsOf()[u].n || 20))) };
}
const earned = () => { const c = badgeCtx(); return BADGES.filter((b) => b[4](c)).map((b) => b[0]); };
// Returns a toast for badges earned since the last check (and remembers them).
function newBadges() {
  const had = Array.isArray(st.bd) ? st.bd : [], now = earned(), fresh = BADGES.filter((b) => now.includes(b[0]) && !had.includes(b[0]));
  if (!fresh.length) return "";
  st.bd = now; save(); nav();
  return `<div class="card ok" role="status"><b>New badge${fresh.length > 1 ? "s" : ""}!</b> ${fresh.map((b) => `${b[1]} ${esc(b[2])}`).join(" · ")}</div>`;
}
function gameStrip(full) {
  const xp = xpNow(), lv = Math.floor(xp / 100) + 1, got = earned(), sn = streakNow();
  const strip = `<div class="card"><div class="row"><span><b>Level ${lv}</b> · ${xp} XP</span><span class="grow"><div class="bar" role="progressbar" aria-label="Progress to next level" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${xp % 100}"><i style="width:${xp % 100}%"></i></div></span><span>🔥 ${sn} day${sn === 1 ? "" : "s"} <span class="muted">(best ${Math.max(st.streak?.max || 0, sn)})</span></span><span>🏅 ${got.length}/${BADGES.length}</span></div></div>`;
  if (!full) return strip;
  return strip + `<h2>Badges</h2><div class="grid">${BADGES.map((b) => `<div class="card badge-card${got.includes(b[0]) ? "" : " locked"}"><span aria-hidden="true">${b[1]}</span> <b>${esc(b[2])}</b><div class="muted" style="font-size:13px">${esc(b[3])}${got.includes(b[0]) ? " · earned" : " · locked"}</div></div>`).join("")}</div><p class="muted" style="font-size:13px">XP = points from questions + 5 per correct answer in your best unit test. Streaks, XP and badges stay in this browser.</p>`;
}

/* ---------------- unit closing tests ---------------- */
const TEST_N = 20;
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// Mixed test: shuffled MCQs from the unit, taken round-robin across topics so every topic is covered before any repeats.
function buildTest(u) {
  const by = {};
  Q.filter((p) => unitOf(p.topic) === u && p.kind === "mcq").forEach((p) => (by[p.topic] ||= []).push(p));
  const lanes = shuffle(Object.keys(by)).map((t) => shuffle(by[t])), ids = [];
  while (ids.length < TEST_N && lanes.some((l) => l.length)) for (const l of lanes) if (l.length && ids.length < TEST_N) ids.push(l.pop().id);
  return shuffle(ids);
}
// A saved test is validated again on load: only known MCQ ids of this unit, answers within range.
function curTest(u) {
  const t = testsOf()[u] ||= { best: 0, n: TEST_N, runs: 0 }, c = t.cur;
  const ok = c && Array.isArray(c.ids) && c.ids.length && c.ids.every((id) => QM[id]?.kind === "mcq" && unitOf(QM[id].topic) === u) && c.ans && typeof c.ans === "object";
  if (!ok) { t.cur = { ids: buildTest(u), ans: {}, done: false }; save(); }
  return t;
}
// Local mode grades tests in the browser, so they only exist when the question file carries the answers. Server mode: the server builds and grades them.
const testsOk = (u) => Q.some((p) => unitOf(p.topic) === u && p.kind === "mcq") && (SERVER || Q.filter((p) => unitOf(p.topic) === u && p.kind === "mcq").every((p) => Number.isInteger(p.answer)));
function testTile(u) {
  if (!testsOk(u)) return "";
  const t = testsOf()[u], c = t?.cur, prog = SERVER ? Object.keys(readTestDraft(u).ans).length : c && !c.done && c.ans ? Object.keys(c.ans).length : 0;
  const sub = t?.runs ? `Best: ${t.best}/${t.n || TEST_N}` : prog ? `In progress (${prog} answered)` : `${TEST_N} mixed multiple-choice questions`;
  return `<a class="card tile" href="#/test/${u}"><div class="grow"><b>📝 Unit ${u} closing test</b><div class="muted">${esc(sub)} · weak-topic report at the end</div></div><span class="btn">${t?.runs ? "Retake →" : "Start →"}</span></a>`;
}
function testPage(u) {
  if (SERVER) return testServer(u);
  const t = curTest(u), c = t.cur, qs = c.ids.map((id) => QM[id]);
  if (c.done) return testResult(u, t, qs);
  app.innerHTML = `<p><a href="#/">← Units</a></p><h1>Unit ${u} closing test</h1>
    <p class="muted">${qs.length} multiple-choice questions mixed from all topics. You see the results and a weak-topic report at the end. Your answers are saved as you go.</p>
    <form id="tf">${qs.map((p, i) => `<fieldset class="card tq"><legend><b>Question ${i + 1}</b></legend><div style="white-space:pre-wrap">${esc(p.statement)}</div>
      ${p.choices.map((ch, k) => `<label class="choice"><input type="radio" name="q${i}" value="${k}"${c.ans[p.id] === k ? " checked" : ""}>${"ABCDE"[k]}) ${esc(ch)}</label>`).join("")}</fieldset>`).join("")}
    <div class="row"><button class="btn" type="submit">Finish test</button><button class="btn alt" type="button" id="rt">Start over with new questions</button><span class="muted" id="cnt" role="status"></span></div></form>`;
  const count = () => ($("#cnt").textContent = `${Object.keys(c.ans).length}/${qs.length} answered`);
  count();
  $("#tf").addEventListener("change", (e) => {
    const m = /^q(\d+)$/.exec(e.target.name || ""); if (!m || !qs[+m[1]]) return;
    c.ans[qs[+m[1]].id] = +e.target.value; save(); count();
  });
  $("#rt").onclick = () => { if (confirm("Discard this test and get a new set of questions?")) { delete t.cur; testPage(u); } };
  $("#tf").addEventListener("submit", (e) => {
    e.preventDefault();
    const left = qs.length - Object.keys(c.ans).length;
    if (left && !confirm(`${left} question${left > 1 ? "s are" : " is"} unanswered and will count as wrong. Finish anyway?`)) return;
    const score = qs.filter((p) => c.ans[p.id] === p.answer).length;
    c.done = true; t.runs = (t.runs || 0) + 1; t.n = qs.length; t.best = Math.max(t.best || 0, score);
    touchStreak(); save(); testPage(u);
    $("#res")?.insertAdjacentHTML("afterbegin", newBadges());
    window.scrollTo(0, 0);
  });
}
/* ---- server mode: testStart -> questions -> testSubmit; answers and explanations only come back from testSubmit ---- */
const TDK = (u) => DK(st.email) + "test:" + u;   // autosaved answers {attempt, ans: {qid: index}}, per student
function readTestDraft(u) {
  try { const o = JSON.parse(localStorage.getItem(TDK(u))); if (o && typeof o === "object" && o.ans && typeof o.ans === "object" && !Array.isArray(o.ans)) return o; } catch {}
  return { attempt: null, ans: {} };
}
const writeTestDraft = (u, d) => { try { d ? localStorage.setItem(TDK(u), JSON.stringify(d)) : localStorage.removeItem(TDK(u)); } catch {} };
const goodQ = (q) => q && typeof q === "object" && typeof q.id === "string" && Array.isArray(q.choices) && q.choices.length > 0 && q.choices.length <= 8;
async function testServer(u) {
  app.innerHTML = `<p><a href="#/">← Units</a></p><h1>Unit ${u} closing test</h1><div id="res"></div>`;
  const stop = busy($("#res"), "Getting your test…"), fail = (e, retry) => { stop(); if (e.ended || !$("#res")) return; $("#res").innerHTML = `<div class="card bad" role="alert">${esc(e.message)}</div>${retry ? '<p><button class="btn" id="retry">Try again</button></p>' : ""}`; $("#retry")?.addEventListener("click", () => testServer(u)); };
  let r;
  try { r = await srv("testStart", undefined, undefined, { unit: u }); } catch (e) { return fail(e, !/no test|unknown unit/i.test(e.raw || "")); }
  const qs = (Array.isArray(r.questions) ? r.questions : []).filter(goodQ).slice(0, 40), attempt = Number.isInteger(r.attempt) ? r.attempt : 0;
  if (!$("#res")) return;
  if (!qs.length) return fail(new Error("There is no closing test for this unit yet."), false);
  stop();
  let d = readTestDraft(u); const ids = new Set(qs.map((q) => q.id));
  if (d.attempt !== attempt) d = { attempt, ans: {} };   // a new question set: old answers do not apply
  d.ans = Object.fromEntries(Object.entries(d.ans).filter(([id, v]) => ids.has(id) && Number.isInteger(v)));
  writeTestDraft(u, d);
  app.innerHTML = `<p><a href="#/">← Units</a></p><h1>Unit ${u} closing test</h1>
    <p class="muted">${qs.length} multiple-choice questions mixed from all topics. You see the results and a weak-topic report at the end. Your answers are saved as you go.</p>
    <form id="tf">${qs.map((p, i) => `<fieldset class="card tq"><legend><b>Question ${i + 1}</b></legend><div style="white-space:pre-wrap">${esc(p.statement)}</div>
      ${p.choices.map((ch, k) => `<label class="choice"><input type="radio" name="q${i}" value="${k}"${d.ans[p.id] === k ? " checked" : ""}>${"ABCDEFGH"[k]}) ${esc(ch)}</label>`).join("")}</fieldset>`).join("")}
    <div class="row"><button class="btn" type="submit" id="fin">Finish test</button><span class="muted" id="cnt" role="status"></span></div><div id="res"></div></form>`;
  const count = () => ($("#cnt").textContent = `${Object.keys(d.ans).length}/${qs.length} answered`);
  count();
  $("#tf").addEventListener("change", (e) => {
    const m = /^q(\d+)$/.exec(e.target.name || ""); if (!m || !qs[+m[1]]) return;
    d.ans[qs[+m[1]].id] = +e.target.value; writeTestDraft(u, d); count();
  });
  $("#tf").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fb = $("#fin"); if (fb.disabled) return;
    const left = qs.length - Object.keys(d.ans).length;
    if (left && !confirm(`${left} question${left > 1 ? "s are" : " is"} unanswered and will count as wrong. Finish anyway?`)) return;
    fb.disabled = true;
    const stop2 = busy($("#res"), "Grading your test…");
    try {
      const x = await srv("testSubmit", undefined, undefined, { unit: u, attempt, answers: d.ans });
      stop2(); writeTestDraft(u, null);
      const total = Number(x.total) || qs.length, t = (st.tests ||= {});
      t[u] = { best: Math.max(Number(x.best) || 0, 0), n: total, runs: Number.isFinite(+x.tries) ? +x.tries : (t[u]?.runs || 0) + 1 };
      touchStreak(); save();
      testServerResult(u, x, qs, total);
      $("#res")?.insertAdjacentHTML("afterbegin", newBadges());
      window.scrollTo(0, 0);
    } catch (err) {
      stop2(); fb.disabled = false;
      if (err.ended || !$("#res")) return;
      const gone = /no longer valid/i.test(err.raw || "");
      if (gone) writeTestDraft(u, null);
      $("#res").innerHTML = `<div class="card bad" role="alert">${esc(err.message)}</div>${gone ? '<p><button class="btn" type="button" id="fresh">Start a new test</button></p>' : ""}`;
      $("#fresh")?.addEventListener("click", () => testServer(u));
    }
  });
}
function testServerResult(u, x, qs, total) {
  const score = Number(x.score) || 0, byId = Object.fromEntries(qs.map((q) => [q.id, q])), L = (q, k) => (q && Number.isInteger(k) && q.choices[k] != null ? "ABCDEFGH"[k] + ") " + q.choices[k] : "?");
  const topics = (Array.isArray(x.topics) ? x.topics : []).filter((t) => t && typeof t.topic === "string").map((t) => ({ topic: t.topic, c: Number(t.correct) || 0, n: Number(t.total) || 0 }));
  const weak = (Array.isArray(x.weak) ? x.weak : []).filter((t) => typeof t === "string");
  const rv = (Array.isArray(x.review) ? x.review : []).filter((r) => r && byId[r.id]);
  app.innerHTML = `<p><a href="#/">← Units</a></p><h1>Unit ${u} test: ${score}/${total} (${Number.isFinite(+x.pct) ? Math.round(+x.pct) : pct(score, total)}%)</h1><p class="muted">Best so far: ${Number(x.best) || 0}/${total} · tests taken: ${Number(x.tries) || 1}</p><div id="res"></div>
    <h2>Weak-topic report</h2>${weak.length ? `<p>Practise these topics first:</p><ul>${weak.map((tp) => `<li><a href="#/?topic=${encodeURIComponent(tp)}">${esc(tp)}</a> <span class="muted">— practise</span></li>`).join("")}</ul>` : '<p class="ok">No weak topics in this test. Nice work!</p>'}
    <div class="scroll"><table><tr><th>Topic</th><th>Correct</th><th>%</th></tr>${topics.map((t) => `<tr><td>${esc(t.topic)}</td><td class="${t.c === t.n ? "ok" : t.c / t.n < 0.6 ? "bad" : "warn"}">${t.c}/${t.n}</td><td>${pct(t.c, t.n)}%</td></tr>`).join("")}</table></div>
    <h2>Review</h2>${rv.map((r, i) => { const q = byId[r.id]; return `<div class="card"><b>${i + 1}. ${r.correct ? "✅" : "❌"}</b> <span class="muted">${esc(q.topic || "")}</span><div style="white-space:pre-wrap">${esc(q.statement)}</div>
      <p style="white-space:pre-wrap">Your answer: ${r.yours == null ? "<i>none</i>" : esc(L(q, r.yours))}${r.correct ? "" : `<br>Correct answer: <b>${esc(L(q, r.answer))}</b>`}</p>
      ${r.explanation ? `<div class="explain" role="note"><b>Explanation</b><p>${esc(r.explanation)}</p></div>` : ""}</div>`; }).join("")}
    <p><button class="btn" id="again">Take a new test</button></p>`;
  $("#again").onclick = () => testServer(u);
}
function testResult(u, t, qs) {
  const c = t.cur, ok = (p) => c.ans[p.id] === p.answer, score = qs.filter(ok).length, by = {};
  qs.forEach((p) => { const v = (by[p.topic] ||= { r: 0, n: 0 }); v.n++; if (ok(p)) v.r++; });
  const rows = Object.entries(by).sort((a, b) => a[1].r / a[1].n - b[1].r / b[1].n || topicSort(a[0], b[0]));
  const weak = rows.filter(([, v]) => v.r / v.n < 0.6);
  app.innerHTML = `<p><a href="#/">← Units</a></p><h1>Unit ${u} test: ${score}/${qs.length} (${pct(score, qs.length)}%)</h1><div id="res"></div>
    <h2>Weak-topic report</h2>${weak.length ? `<p>Review these topics first:</p><ul>${weak.map(([tp, v]) => `<li><a href="#/?topic=${encodeURIComponent(tp)}">${esc(tp)}</a> <span class="muted">— ${v.r}/${v.n} correct</span></li>`).join("")}</ul>` : '<p class="ok">No weak topics in this test. Nice work!</p>'}
    <div class="scroll"><table><tr><th>Topic</th><th>Correct</th></tr>${rows.map(([tp, v]) => `<tr><td>${esc(tp)}</td><td class="${v.r === v.n ? "ok" : v.r / v.n < 0.6 ? "bad" : "warn"}">${v.r}/${v.n}</td></tr>`).join("")}</table></div>
    <h2>Review</h2>${qs.map((p, i) => `<div class="card"><b>${i + 1}. ${ok(p) ? "✅" : "❌"}</b> <span class="muted">${esc(p.topic)}</span><div style="white-space:pre-wrap">${esc(p.statement)}</div>
      <p style="white-space:pre-wrap">Your answer: ${c.ans[p.id] == null ? "<i>none</i>" : esc("ABCDE"[c.ans[p.id]] + ") " + p.choices[c.ans[p.id]])}${ok(p) ? "" : `<br>Correct answer: <b>${esc("ABCDE"[p.answer] + ") " + p.choices[p.answer])}</b>`}</p>
      ${p.explanation ? `<div class="explain" role="note"><b>Explanation</b><p>${esc(p.explanation)}</p></div>` : ""}</div>`).join("")}
    <p><button class="btn" id="again">Take a new test</button></p>`;
  $("#again").onclick = () => { delete t.cur; save(); testPage(u); };
}

/* ---------------- my progress ---------------- */
function bars(o) {
  return Object.entries(o).map(([t, v]) => `<div class="row"><span style="width:260px">${esc(t)}</span><div class="bar grow"><i style="width:${pct(v.got, v.max)}%"></i></div><span style="width:110px;text-align:right">${pct(v.got, v.max)}% · ${v.got}/${v.max}</span></div>`).join("");
}
function stats(subs) {
  const units = {}, topics = {}, cats = {};
  Q.forEach((p) => {
    const g = Math.min(subs[p.id]?.best || 0, p.points);
    for (const [o, k] of [[units, "Unit " + unitOf(p.topic)], [topics, p.topic], [cats, CATS[p.category] || "-"]]) { const v = (o[k] ||= { got: 0, max: 0 }); v.got += g; v.max += p.points; }
  });
  const sorted = Object.fromEntries(Object.entries(topics).sort((a, b) => topicSort(a[0], b[0])));
  return { units, topics: sorted, cats };
}
function me() {
  const { units, topics, cats } = stats(st.subs);
  const total = Q.reduce((a, p) => a + best(p), 0), solved = Q.filter((p) => isDone(p)).length;
  const recent = Object.entries(st.subs).filter(([, v]) => v.at).sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, 15);
  app.innerHTML = `<h1>My progress</h1><p class="muted">${esc(st.name)} · ${esc(st.email)} · ${total} points · ${solved} solved</p>
    ${gameStrip(true)}<h2>By unit</h2>${bars(units)}<h2>By category</h2>${bars(cats)}<h2>By topic</h2>${bars(topics)}
    <h2>Recent</h2><div class="scroll"><table>${recent.map(([id, v]) => `<tr><td>${fmt(v.at)}</td><td><a href="#/p/${id}">${esc(QM[id]?.title)}</a></td><td>${v.best}/${QM[id]?.points}</td><td>${v.tries} tries</td></tr>`).join("") || '<tr><td class="muted">Nothing yet</td></tr>'}</table></div>
    ${SERVER ? "" : '<p style="margin-top:20px"><button class="btn alt" id="reset">Reset my progress</button></p>'}`;
  $("#reset")?.addEventListener("click", resetMine);
  function resetMine() { if (confirm("Delete all your progress and saved code in this browser?")) { st.subs = {}; delete st.streak; delete st.tests; delete st.bd; lsKeys(DK(st.email)).forEach((k) => { try { localStorage.removeItem(k); } catch {} }); save(); me(); nav(); } }
}

/* ---------------- share with teacher ---------------- */
const b64u = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
const canZip = typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };

// Compact format (JZ2): one short entry per attempted question, compressed. The checksum only detects accidental edits.
async function shareCode() {
  const items = Object.entries(st.subs).filter(([id, v]) => QM[id] && (v.tries || v.peeked)).map(([id, v]) => [id.slice(0, 6), v.best, v.tries, v.peeked ? 1 : 0].join("."));
  const last = Object.values(st.subs).reduce((a, v) => (v.at && v.at > a ? v.at : a), "");
  const body = { n: st.name, e: st.email, t: last || new Date().toISOString(), s: items.join(";") };
  body.c = fnv(body.n + "|" + body.e + "|" + body.s);
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return canZip ? "JZ2z." + b64u(await pipe(bytes, new CompressionStream("deflate-raw"))) : "JZ2." + b64u(bytes);
}
async function share() {
  app.innerHTML = '<h1>Send my progress to the teacher</h1><p class="muted">Preparing…</p>';
  const code = await shareCode();
  app.innerHTML = `<h1>Send my progress to the teacher</h1><p>Copy this code and send it to your teacher (e-mail, Teams, Classroom). It contains your name, e-mail and scores — not the code you wrote.</p>
    <textarea id="code" rows="4" readonly style="font-family:monospace" aria-label="Progress code">${code}</textarea>
    <div class="row" style="margin-top:8px"><button class="btn" id="cp">Copy</button><button class="btn alt" id="dl">Download file</button></div><div id="msg" role="status"></div>`;
  $("#cp").onclick = async () => { try { await navigator.clipboard.writeText(code); } catch { $("#code").select(); document.execCommand("copy"); } $("#msg").innerHTML = '<p class="ok">Copied ✓</p>'; };
  $("#dl").onclick = () => { const l = document.createElement("a"); l.href = URL.createObjectURL(new Blob([code], { type: "text/plain" })); l.download = `javazero-${st.name.replace(/\W+/g, "_")}.txt`; l.click(); };
}

// Turns one pasted code into a clean record, or throws a readable error. Never trusts the input.
async function parseCode(tok) {
  const prefix = {}; Q.forEach((p) => (prefix[p.id.slice(0, 6)] = p));
  let o, v2 = false;
  try {
    if (tok.startsWith("JZ2z.")) { o = JSON.parse(new TextDecoder().decode(await pipe(unb64u(tok.slice(5)), new DecompressionStream("deflate-raw")))); v2 = true; }
    else if (tok.startsWith("JZ2.")) { o = JSON.parse(new TextDecoder().decode(unb64u(tok.slice(4)))); v2 = true; }
    else if (tok.startsWith("JZ1.")) o = JSON.parse(new TextDecoder().decode(unb64u(tok.slice(4))));
    else throw 0;
  } catch { throw new Error("not a JavaZero code"); }
  if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("not a JavaZero code");
  const n = typeof o.n === "string" ? o.n.trim().slice(0, 80) : "", e = typeof o.e === "string" ? o.e.trim().toLowerCase().slice(0, 120) : "";
  if (!n || !e.endsWith("@" + DOMAIN)) throw new Error("missing name or school e-mail");
  const w = [], s = {};
  const put = (p, best, tries, peeked) => {
    best = Math.floor(Number(best)); tries = Math.floor(Number(tries));
    if (!(best >= 0) || !(tries >= 0)) return;
    if (best > p.points) { w.push("score above the maximum"); best = p.points; }
    s[p.id] = [best, Math.min(tries, 999), peeked ? 1 : 0, ""];
  };
  if (v2) {
    if (typeof o.s !== "string") throw new Error("damaged code");
    if (o.c !== fnv(n + "|" + e + "|" + o.s)) w.push("code was edited after it was created");
    o.s.split(";").filter(Boolean).slice(0, 500).forEach((it) => { const [id6, b, t, pk] = it.split("."); if (prefix[id6]) put(prefix[id6], b, t, pk === "1"); });
  } else {
    if (!o.s || typeof o.s !== "object" || Array.isArray(o.s)) throw new Error("damaged code");
    Object.entries(o.s).slice(0, 500).forEach(([id, a]) => { const p = Q.find((x) => x.id === id); if (p && Array.isArray(a)) put(p, a[0], a[1], a[2]); });
    w.push("old code format (not checked)");
  }
  const t = Date.parse(o.t) ? new Date(o.t).toISOString() : new Date().toISOString();
  return { n, e, t, s, w: [...new Set(w)] };
}

/* ---------------- teacher: class view from pasted codes ---------------- */
function loadClass() {
  try {
    const c = JSON.parse(localStorage.getItem("jz:class")) || {}, out = {};
    for (const [k, r] of Object.entries(c)) {
      if (!r || typeof r.n !== "string" || !r.s || typeof r.s !== "object" || Array.isArray(r.s)) continue;   // skip damaged records
      const s = {}; for (const [id, a] of Object.entries(r.s)) if (Array.isArray(a) && Number.isFinite(+a[0])) s[id] = a;
      out[k] = { n: r.n, e: String(r.e || k), t: r.t, s, w: Array.isArray(r.w) ? r.w : [] };
    }
    return out;
  } catch { return {}; }
}
// Server mode: the teacher's class table and analytics come from the Apps Script `class` action (teacher accounts only).
async function adminServer() {
  app.innerHTML = '<h1>Teacher: class view</h1><div id="res"></div>';
  const stop = busy($("#res"), "Loading the class…");
  try {
    const r = await srv("class"), cls = {};
    Object.entries(r.students && typeof r.students === "object" ? r.students : {}).slice(0, 500).forEach(([e, m]) => {
      const sv = {}; Object.entries(m && typeof m === "object" ? m : {}).forEach(([id, a]) => { if (QM[id] && Array.isArray(a) && Number.isFinite(+a[0])) sv[id] = [+a[0], +a[1] || 0, a[2] ? 1 : 0, ""]; });
      cls[e] = { n: String(e), e: String(e), t: "", s: sv, w: [] };
    });
    stop(); if (!$("#res")) return; admin(cls, normAn(r.analytics));
  } catch (e) { stop(); if (e.ended || !$("#res")) return; $("#res").innerHTML = `<div class="card bad" role="alert">${esc(e.message)}</div>`; }
}
/* ---------------- teacher dashboard (server mode) ---------------- */
const num = (x) => (Number.isFinite(+x) ? +x : 0);
const arr = (x) => (Array.isArray(x) ? x.filter(Array.isArray).slice(0, 2000) : []);
function normAn(a) {
  a = a && typeof a === "object" ? a : {};
  return {
    students: arr(a.students).map((r) => ({ e: String(r[0]), solved: num(r[1]), pts: num(r[2]), tries: num(r[3]), peeks: num(r[4]), tests: r[5] && typeof r[5] === "object" && !Array.isArray(r[5]) ? r[5] : {} })),
    questions: arr(a.questions).map((r) => ({ id: String(r[0]), attempts: num(r[1]), tried: num(r[2]), solved: num(r[3]), succ: num(r[4]), avg: num(r[5]), peek: num(r[6]) })),
    topics: arr(a.topics).map((r) => ({ t: String(r[0]), n: num(r[1]), avg: num(r[2]) })),
    hardest: arr(a.hardest).slice(0, 10).map((r) => ({ id: String(r[0]), succ: num(r[1]), avg: num(r[2]), tried: num(r[3]) })),
  };
}
// CSV: quotes doubled, cells with comma/quote/newline quoted; text starting with = + - @ gets a leading ' so spreadsheets do not run it as a formula.
const csvCell = (v) => { let t = String(v ?? ""); if (typeof v === "string" && /^[=+\-@\t\r]/.test(t) && !/^[-+]?\d+(\.\d+)?$/.test(t)) t = "'" + t; return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
const testUnits = (an) => [...new Set([1, 2, ...an.students.flatMap((r) => Object.keys(r.tests).map(Number).filter((n) => n > 0))])].sort((x, y) => x - y);
const csvStudents = (an) => toCsv([["Email", "Solved", "Points", "Tries", "Peeks", ...testUnits(an).map((u) => `Unit ${u} best test (correct of ${TEST_N})`)], ...an.students.map((r) => [r.e, r.solved, r.pts, r.tries, r.peeks, ...testUnits(an).map((u) => r.tests[u] ?? "")])]);
const csvQuestions = (an) => toCsv([["Question ID", "Title", "Topic", "Attempts", "Students tried", "Students solved", "Success %", "Average tries", "Peek %"], ...an.questions.map((q) => [q.id, QM[q.id]?.title ?? "", QM[q.id]?.topic ?? "", q.attempts, q.tried, q.solved, q.succ, q.avg, q.peek])]);
function downloadCsv(name, text) { const l = document.createElement("a"); l.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })); l.download = name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(l.href), 1000); }
// Sortable, filterable table. cols: [label, sortValue(row), cellHtml(row), numeric]; match(row) = text the filter looks at.
function dtable(root, id, cols, rows, match, label) {
  let k = 0, dir = 1, q = "";
  root.innerHTML = `<label for="${id}-f">${esc(label)}</label><input id="${id}-f" type="search" autocomplete="off" style="max-width:280px"><p class="muted" id="${id}-n" role="status"></p><div class="scroll" id="${id}-t"></div>`;
  const draw = (focus) => {
    const f = q.trim().toLowerCase(), v = rows.filter((r) => !f || match(r).toLowerCase().includes(f));
    v.sort((x, y) => { const a = cols[k][1](x), b = cols[k][1](y); return dir * (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b))); });
    $(`#${id}-n`).textContent = `${v.length} of ${rows.length} shown`;
    $(`#${id}-t`).innerHTML = `<table><thead><tr>${cols.map((c, i) => `<th scope="col" aria-sort="${i === k ? (dir > 0 ? "ascending" : "descending") : "none"}"><button type="button" class="sortb" data-i="${i}">${esc(c[0])}${i === k ? (dir > 0 ? " ▲" : " ▼") : ""}</button></th>`).join("")}</tr></thead><tbody>${v.map((r) => `<tr>${cols.map((c) => `<td>${c[2](r)}</td>`).join("")}</tr>`).join("") || `<tr><td class="muted" colspan="${cols.length}">Nothing to show</td></tr>`}</tbody></table>`;
    if (focus) $(`#${id}-t [data-i="${k}"]`)?.focus();
  };
  $(`#${id}-f`).addEventListener("input", (e) => { q = e.target.value; draw(); });
  $(`#${id}-t`).addEventListener("click", (e) => { const b = e.target.closest(".sortb"); if (!b) return; const i = +b.dataset.i; if (i === k) dir = -dir; else { k = i; dir = cols[i][3] ? -1 : 1; } draw(true); });
  draw();
}
const qLink = (id) => (QM[id] ? `<a href="#/p/${encodeURIComponent(id)}">${esc(QM[id].title)}</a>` : `<span class="muted">${esc(id.slice(0, 8))}</span>`);
const cell1 = (v) => Math.round(v * 10) / 10;
function dash(root, an) {
  root.innerHTML = `<h2>Students (${an.students.length})</h2><div id="d-st"></div><p><button class="btn alt" type="button" id="csv-st">Download students.csv</button></p>
    <h2>Assignments</h2><div id="d-as"></div>
    <h2>Average solved by topic</h2><div id="d-tp"></div>
    <h2>Hardest 10 questions</h2><div id="d-hd"></div>
    <h2>Question statistics (${an.questions.length})</h2><div id="d-q"></div><p><button class="btn alt" type="button" id="csv-q">Download questions.csv</button></p>`;
  const tu = testUnits(an);
  if (an.students.length) dtable($("#d-st"), "st", [["Student", (r) => r.e, (r) => esc(r.e)], ["Solved", (r) => r.solved, (r) => r.solved, 1], ["Points", (r) => r.pts, (r) => r.pts, 1], ["Tries", (r) => r.tries, (r) => r.tries, 1], ["Peeks", (r) => r.peeks, (r) => r.peeks, 1],
    ...tu.map((u) => [`Unit ${u} test`, (r) => num(r.tests[u] ?? -1), (r) => (r.tests[u] == null ? "—" : `${num(r.tests[u])}/${TEST_N}`), 1])], an.students, (r) => r.e, "Filter by name or e-mail");
  else $("#d-st").innerHTML = '<p class="muted">No student activity yet.</p>';
  if (an.questions.length) dtable($("#d-q"), "qs", [["Question", (r) => QM[r.id]?.title ?? r.id, (r) => qLink(r.id)], ["Attempts", (r) => r.attempts, (r) => r.attempts, 1], ["Students tried", (r) => r.tried, (r) => r.tried, 1], ["Success %", (r) => r.succ, (r) => cell1(r.succ) + "%", 1], ["Avg tries", (r) => r.avg, (r) => cell1(r.avg), 1], ["Peek %", (r) => r.peek, (r) => cell1(r.peek) + "%", 1]], an.questions, (r) => (QM[r.id]?.title ?? "") + " " + r.id, "Filter by question");
  else $("#d-q").innerHTML = '<p class="muted">No question has been tried yet.</p>';
  $("#d-tp").innerHTML = an.topics.length ? [...an.topics].sort((x, y) => topicSort(x.t, y.t)).map((t) => `<div class="brow"><span class="blab">${esc(t.t)} <span class="muted">(${t.n} questions)</span></span><div class="bar grow" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, t.avg))}%"></i></div><span class="bval">${cell1(t.avg)}%</span></div>`).join("") : '<p class="muted">No data yet.</p>';
  $("#d-hd").innerHTML = an.hardest.length ? `<ol>${an.hardest.map((h) => `<li>${qLink(h.id)} <span class="muted">· ${cell1(h.succ)}% success · ${cell1(h.avg)} tries on average · ${h.tried} students tried</span></li>`).join("")}</ol>` : '<p class="muted">Not enough data yet (a question needs at least 3 students who tried it).</p>';
  $("#csv-st").onclick = () => downloadCsv("students.csv", csvStudents(an));
  $("#csv-q").onclick = () => downloadCsv("questions.csv", csvQuestions(an));
  teacherAssign($("#d-as"));
}

/* ---------------- assignments (server mode) ---------------- */
let asgC = null;   // {t, a}: cache for one minute; the server caches for ten
const ISO = /^\d{4}-\d{2}-\d{2}$/;
function normAsg(a) {
  if (!a || typeof a !== "object" || typeof a.id !== "string") return null;
  const qids = (Array.isArray(a.qids) ? a.qids : []).filter((x) => typeof x === "string").slice(0, 100), c = a.class && typeof a.class === "object" ? a.class : null;
  return { id: a.id, title: String(a.title ?? "").slice(0, 120), due: ISO.test(a.due) ? a.due : "", qids, total: Math.max(num(a.total), qids.length), solved: num(a.solved), done: !!a.done, cls: c ? { students: num(c.students), completed: num(c.completed), avg: num(c.avgSolved) } : null };
}
async function getAsg(force) {
  if (!force && asgC && Date.now() - asgC.t < 60000) return asgC.a;
  const r = await srv("assignments");
  asgC = { t: Date.now(), a: (Array.isArray(r.assignments) ? r.assignments : []).slice(0, 200).map(normAsg).filter(Boolean) };
  return asgC.a;
}
// Own progress: the larger of the server's count and what this browser knows (the server list may be a few minutes old).
const asgMine = (a) => { const loc = a.qids.filter((id) => QM[id] && isDone(QM[id])).length; return Math.min(a.total, Math.max(a.solved, loc)); };
const asgNext = (a) => a.qids.find((id) => QM[id] && !isDone(QM[id]));
function dueInfo(due) {
  if (!due) return { cls: "", text: "no due date", days: null };
  const n = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)), days = Math.round((n(due) - n(dayKey())) / 864e5);
  const txt = days < 0 ? `overdue by ${plural(-days, "day")}` : days === 0 ? "due today" : days === 1 ? "due tomorrow" : `due in ${days} days`;
  return { cls: days < 0 ? "overdue" : days <= 2 ? "soon" : "", text: `due ${due} (${txt})`, days };
}
async function asgCard() {   // student home page
  if (!$("#asg")) return;
  let list;
  try { list = await getAsg(); } catch (e) { if ($("#asg")) $("#asg").innerHTML = `<div class="card muted">Assignments could not be loaded: ${esc(e.message)}</div>`; return; }
  if (!$("#asg") || !list.length) return;
  $("#asg").innerHTML = `<div class="card"><h2 style="margin-top:0">Assignments</h2><ul class="asg">` + list.map((a) => {
    const sv = asgMine(a), done = a.done || sv >= a.total, d = dueInfo(a.due), nx = asgNext(a), cls = done ? "done" : d.cls;
    return `<li class="${cls}"><div class="row"><b class="grow">${esc(a.title)}</b>${done ? '<span class="pill ok">done</span>' : d.cls === "overdue" ? '<span class="pill bad">overdue</span>' : d.cls === "soon" ? '<span class="pill warn">due soon</span>' : ""}</div>
      <div class="muted">${esc(d.text)} · ${sv}/${a.total} solved</div><div class="bar" style="margin:6px 0" role="progressbar" aria-label="${esc(a.title)} progress" aria-valuemin="0" aria-valuemax="${a.total}" aria-valuenow="${sv}"><i style="width:${pct(sv, a.total)}%"></i></div>
      ${!done && nx ? `<a class="btn" href="#/p/${encodeURIComponent(nx)}">${sv ? "Continue" : "Start"}: ${esc(QM[nx].title)} →</a>` : ""}</li>`;
  }).join("") + "</ul></div>";
}
async function teacherAssign(box) {
  const sel = new Set(), topics = [...new Set(Q.map((p) => p.topic))].sort(topicSort);
  box.innerHTML = `<form class="card" id="af" novalidate><h3 style="margin-top:0">New assignment</h3>
    <label for="at">Title</label><input id="at" maxlength="120" autocomplete="off" required>
    <label for="ad">Due date</label><input id="ad" type="date" min="${dayKey()}" required style="max-width:220px">
    <fieldset class="mcq" style="margin-top:12px"><legend><b>Questions</b> <span class="muted" id="acount" role="status"></span></legend>
      <div class="row"><div class="grow"><label for="atp">Topic</label><select id="atp"><option value="">All topics</option>${topics.map((t) => `<option>${esc(t)}</option>`).join("")}</select></div><div class="grow"><label for="aq">Search</label><input id="aq" type="search" autocomplete="off"></div></div>
      <div class="row" style="margin:8px 0"><button type="button" class="btn alt" id="aall">Select all shown</button><button type="button" class="btn alt" id="anone">Clear selection</button></div>
      <div class="pick" id="alist" role="group" aria-label="Questions to assign"></div></fieldset>
    <p><button class="btn" type="submit" id="amk">Create assignment</button></p><div id="amsg" role="status"></div></form><div id="alistc"></div>`;
  const msg = (h) => ($("#amsg").innerHTML = h), shown = () => { const t = $("#atp").value, f = $("#aq").value.trim().toLowerCase(); return Q.filter((p) => (!t || p.topic === t) && (!f || (p.title + " " + p.topic).toLowerCase().includes(f))).sort(byOrder); };
  const count = () => ($("#acount").textContent = `${sel.size}/100 selected`);
  const draw = () => {
    const v = shown();
    $("#alist").innerHTML = v.map((p) => `<label class="choice pickrow"><input type="checkbox" value="${esc(p.id)}"${sel.has(p.id) ? " checked" : ""}>${esc(p.title)} <span class="muted">· ${esc(p.topic)} · ${LEVELS[p.d]} · ${KINDS[p.kind]}</span></label>`).join("") || '<p class="muted">No question matches.</p>';
    count();
  };
  draw();
  $("#atp").onchange = $("#aq").oninput = draw;
  $("#alist").addEventListener("change", (e) => {
    const c = e.target; if (c.type !== "checkbox") return;
    if (!c.checked) sel.delete(c.value); else if (sel.size >= 100) { c.checked = false; return msg('<p class="warn">An assignment can have at most 100 questions.</p>'); } else sel.add(c.value);
    msg(""); count();
  });
  $("#aall").onclick = () => { let cut = false; shown().forEach((p) => { if (sel.size < 100) sel.add(p.id); else if (!sel.has(p.id)) cut = true; }); msg(cut ? '<p class="warn">Only the first 100 questions were selected (the maximum).</p>' : ""); draw(); };
  $("#anone").onclick = () => { sel.clear(); msg(""); draw(); };
  $("#af").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = $("#at").value.trim().replace(/\s+/g, " "), due = $("#ad").value;
    if (!title || title.length > 120) { msg('<p class="warn">Enter a title (1 to 120 characters).</p>'); return $("#at").focus(); }
    if (!ISO.test(due) || isNaN(Date.parse(due))) { msg('<p class="warn">Choose a due date.</p>'); return $("#ad").focus(); }
    if (!sel.size) return msg('<p class="warn">Select at least one question.</p>');
    const b = $("#amk"); if (b.disabled) return; b.disabled = true;
    const stop = busy($("#amsg"), "Creating…");
    try {
      const r = await srv("assign", undefined, undefined, { title, qids: [...sel], due });
      stop(); asgC = null; if (!$("#amsg") || !$("#at")) return; msg(`<p class="ok">Assignment "${esc(r.title ?? title)}" created (${plural(Array.isArray(r.qids) ? r.qids.length : sel.size, "question")}, due ${esc(r.due ?? due)}).</p>`);
      sel.clear(); $("#at").value = ""; $("#ad").value = ""; draw(); asgList();
    } catch (err) { stop(); if (err.ended || !$("#amsg")) return; msg(`<p class="warn" role="alert">${esc(err.message)}</p>`); }
    b.disabled = false;
  });
  async function asgList() {
    const c = $("#alistc"); if (!c) return;
    const stop = busy(c, "Loading assignments…");
    try {
      const l = await getAsg(true); stop(); if (!$("#alistc")) return;
      c.innerHTML = l.length ? `<h3>Existing assignments (${l.length})</h3>` + l.map((a) => { const d = dueInfo(a.due), k = a.cls;
        return `<div class="card asgc ${d.cls}"><b>${esc(a.title)}</b> <span class="muted">· ${esc(d.text)} · ${plural(a.total, "question")}</span>
          ${k ? `<div>Class: ${k.completed}/${k.students} students solved every question · average ${cell1(k.avg)}/${a.total} solved</div><div class="bar" aria-hidden="true" style="margin-top:4px"><i style="width:${pct(k.completed, k.students)}%"></i></div>` : ""}</div>`; }).join("") : '<p class="muted">No assignments yet.</p>';
    } catch (err) { stop(); if (!err.ended && $("#alistc")) $("#alistc").innerHTML = `<div class="card bad" role="alert">${esc(err.message)}</div>`; }
  }
  asgList();
}
function admin(srvRows, an) {
  if (SERVER && !srvRows) return adminServer();
  const cls = srvRows || loadClass();
  const rows = Object.values(cls).sort((x, y) => x.n.localeCompare(y.n));
  const total = (r) => Q.reduce((acc, p) => acc + Math.min(r.s[p.id]?.[0] || 0, p.points), 0);
  const subsOf = (r) => Object.fromEntries(Object.entries(r.s).map(([id, v]) => [id, { best: v[0], tries: v[1], peeked: v[2], at: v[3] }]));
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const topics = [...new Set(Q.map((p) => p.topic))].sort(topicSort), topic = topics.includes(params.get("topic")) ? params.get("topic") : topics[0];
  const cols = Q.filter((p) => p.topic === topic).sort((x, y) => x.d - y.d);
  const units = [...new Set(topics.map(unitOf))];
  const cell = (r, p) => {
    const v = r.s[p.id]; if (!v) return '<td class="muted" style="text-align:center">·</td>';
    const cls2 = v[0] >= p.points ? "ok" : v[0] > 0 ? "warn" : "bad";
    return `<td class="${cls2}" style="text-align:center" title="${v[0]}/${p.points} · ${v[1]} tries${v[2] ? " · looked at solution" : ""}">${v[0] >= p.points ? "✓" : v[0]}${v[2] ? "👁" : ""}</td>`;
  };
  app.innerHTML = `<h1>Teacher: class view</h1>
    ${SERVER ? '<div id="dash"></div><h2>Question × student</h2>' : `<div class="card"><b>Add student codes</b> <span class="muted">(paste one code per line, or choose the files students sent)</span>
      <textarea id="paste" rows="3" placeholder="JZ2z.…" style="font-family:monospace" aria-label="Student codes"></textarea>
      <div class="row" style="margin-top:6px"><button class="btn" id="add">Add</button><input type="file" id="files" accept=".txt,.json" multiple style="width:auto" aria-label="Student code files"><button class="btn alt" id="clear">Clear class</button></div><div id="msg" role="status"></div></div>`}
    ${rows.length ? `<h2>${SERVER ? "Class progress" : "Students"} (${rows.length})</h2><div style="overflow:auto"><table><tr><th>Name</th><th>Points</th>${units.map((u) => `<th>Unit ${u}</th>`).join("")}<th>Updated</th></tr>
      ${rows.map((r) => { const { units: us } = stats(subsOf(r)); return `<tr><td>${esc(r.n)}${r.w.length ? ` <span class="warn" title="${esc(r.w.join("; "))}">⚠</span>` : ""}${r.e !== r.n ? `<div class="muted" style="font-size:12px">${esc(r.e)}</div>` : ""}</td><td>${total(r)}</td>${units.map((u) => `<td>${pct(us["Unit " + u].got, us["Unit " + u].max)}%</td>`).join("")}<td class="muted">${fmt(r.t)}</td></tr>`; }).join("")}</table></div>
    <p class="muted">⚠ = the code looked edited or had impossible scores (hover for the reason). ${SERVER ? "Scores are recorded by the grading service." : "Scores in this version are self-reported by the student's browser."}</p>
    ${SERVER ? "" : "<h2>Question × student</h2>"}<select id="tp" aria-label="Topic">${topics.map((t) => `<option ${t === topic ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
    <p class="muted">✓ full points · number = partial · 0 = tried, not passed · · = not tried · 👁 = looked at the solution. Hover for tries.</p>
    <div style="overflow:auto"><table><tr><th>Student</th>${cols.map((p, i) => `<th title="${esc(p.title)} (${p.points}p)" style="text-align:center">${i + 1}</th>`).join("")}<th>%</th></tr>
      ${rows.map((r) => `<tr><td>${esc(r.n)}</td>${cols.map((p) => cell(r, p)).join("")}<td>${pct(cols.reduce((acc, p) => acc + Math.min(r.s[p.id]?.[0] || 0, p.points), 0), cols.reduce((acc, p) => acc + p.points, 0))}%</td></tr>`).join("")}</table></div>
    <ol>${cols.map((p) => `<li>${esc(p.title)} <span class="muted">${LEVELS[p.d]} · ${KINDS[p.kind]} · ${p.points}p</span></li>`).join("")}</ol>` : '<p class="muted">No students added yet.</p>'}`;
  if (SERVER && $("#dash")) dash($("#dash"), an || normAn());
  const add = async (text) => {
    const c = loadClass(); let ok = 0; const bad = [], warns = [];
    for (const tok of text.split(/\s+/).filter(Boolean)) {
      try { const r = await parseCode(tok); const old = c[r.e]; if (!old || old.t <= r.t) c[r.e] = r; ok++; if (r.w.length) warns.push(`${r.n}: ${r.w.join(", ")}`); }
      catch (e) { bad.push(e.message); }
    }
    try { localStorage.setItem("jz:class", JSON.stringify(c)); } catch {}
    admin();
    $("#msg").innerHTML = `<p class="${bad.length ? "warn" : "ok"}">${ok} added${bad.length ? `, ${bad.length} rejected (${esc([...new Set(bad)].join("; "))})` : ""}</p>` + warns.map((x) => `<p class="warn">⚠ ${esc(x)}</p>`).join("");
  };
  if (!SERVER) {
    $("#add").onclick = () => add($("#paste").value);
    $("#files").onchange = async (e) => { add((await Promise.all([...e.target.files].map((f) => f.text()))).join("\n")); };
    $("#clear").onclick = () => { if (confirm("Remove all students from this view?")) { try { localStorage.removeItem("jz:class"); } catch {} admin(); } };
  }
  $("#tp")?.addEventListener("change", (e) => (location.hash = "/admin?topic=" + encodeURIComponent(e.target.value)));
}

boot();
