// JavaZero — local mode: no server, no login. Progress lives in this browser.
// Code is run on Judge0 CE. Students share progress with the teacher via a code (see #/share, #/admin).
const JUDGE0 = "https://ce.judge0.com";
const DOMAIN = "hisarschool.k12.tr";
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
let st = load();       // this student's state

function load() {
  try { return JSON.parse(localStorage.getItem("jz:v1")) || { name: "", email: "", subs: {} }; } catch { return { name: "", email: "", subs: {} }; }
}
function save() { try { localStorage.setItem("jz:v1", JSON.stringify(st)); } catch {} }
const sub = (id) => (st.subs[id] ||= { best: 0, tries: 0, fails: 0, peeked: false, last: null, at: null });
// Full points on the first try; each failed attempt costs 25% (floor 25%). Looking at the solution first caps it at 25%.
const factor = (s) => Math.min(s.peeked ? 0.25 : 1, Math.max(0.25, 1 - 0.25 * (s.fails || 0)));
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
  window.addEventListener("hashchange", route);
  route();
}

function nav() {
  const link = (h, t) => `<a href="#${h}" class="${location.hash.replace(/\?.*/, "") === "#" + h ? "on" : ""}">${t}</a>`;
  $("#nav").innerHTML = st.name ? link("/", "Questions") + link("/me", "📊 My progress") + link("/share", "📤 Send to teacher") + '<a href="#/admin" class="muted" style="font-size:13px">Teacher</a>' + '<button id="who" class="muted" style="font-size:13px" title="Switch student">' + esc(st.name.split(" ")[0]) + ' ⎋</button>' : "";
  $("#who")?.addEventListener("click", () => { if (confirm("Switch student? Your progress stays saved in this browser for the next sign-in.")) { st.name = ""; st.email = ""; location.hash = "/"; route(); } });
}

let pending = "";   // link the student opened before signing in
function route() {
  nav();
  const [path, ...rest] = location.hash.replace(/^#\/?/, "").replace(/\?.*/, "").split("/");
  if (path === "admin") return admin();
  if (!st.name) { if (path === "p") pending = location.hash; return welcome(); }
  if (path === "p" && QM[rest[0]]) return problemPage(QM[rest[0]]);
  if (path === "me") return me();
  if (path === "share") return share();
  return home();
}

function welcome() {
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
    st.name = name; st.email = email; save(); location.hash = pending || "/"; pending = ""; route();
  };
  $("#go").onclick = go;
  app.querySelectorAll("input").forEach((i) => i.addEventListener("keydown", (e) => e.key === "Enter" && go()));
  $("#nm").focus();
}

/* ---------------- navigation helpers ---------------- */
const byOrder = (a, b) => topicSort(a.topic, b.topic) || a.d - b.d;
const unsolved = (p) => best(p) < p.points;
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
    app.innerHTML = `<h1>Hi ${esc(st.name.split(" ")[0])} 👋</h1>${intro}${cont}` + units.map((u) => {
      const ups = Q.filter((p) => unitOf(p.topic) === u);
      return `<div class="card"><div class="row"><h2 class="grow" style="margin:0">Unit ${u} · ${UNIT_NAMES[u] || ""}</h2><b>${pct(got(ups), max(ups))}%</b></div>
        <div class="bar" style="margin:8px 0"><i style="width:${pct(got(ups), max(ups))}%"></i></div>
        ${topics.filter((t) => unitOf(t) === u).map((t) => { const tp = Q.filter((p) => p.topic === t);
          return `<a class="row" href="#/?topic=${encodeURIComponent(t)}" style="text-decoration:none;color:inherit;padding:4px 0">
            <span class="grow">${esc(t)} <span class="muted">${tp.filter((p) => best(p) >= p.points).length}/${tp.length} done</span></span><div class="bar" style="width:80px;flex:none"><i style="width:${pct(got(tp), max(tp))}%"></i></div><span style="width:44px;text-align:right">${pct(got(tp), max(tp))}%</span></a>`; }).join("")}</div>`;
    }).join("");
    return;
  }
  const tp = Q.filter((p) => p.topic === topic);
  const list = tp.filter((p) => !cat || p.category === cat).sort((a, b) => a.d - b.d);
  app.innerHTML = `<p><a href="#/">← Units</a></p>
    <div class="row"><h1 class="grow">${esc(topic)}</h1><b>${pct(got(tp), max(tp))}%</b></div>
    <div class="bar"><i style="width:${pct(got(tp), max(tp))}%"></i></div>
    <div class="row" style="margin:10px 0"><a class="pill" href="#/?topic=${encodeURIComponent(topic)}">All</a>
      ${Object.entries(CATS).filter(([k]) => tp.some((p) => p.category === k)).map(([k, v]) => `<a class="pill" href="#/?topic=${encodeURIComponent(topic)}&cat=${k}">${v}</a>`).join("")}</div>
    <table><tr><th></th><th>Question</th><th>Category</th><th>Level</th><th>Type</th><th>Points</th></tr>
    ${list.map((p) => `<tr><td>${best(p) >= p.points ? "✅" : st.subs[p.id]?.best > 0 ? "🟡" : ""}</td><td><a href="#/p/${p.id}">${esc(p.title)}</a></td>
      <td>${CATS[p.category] || ""}</td><td>${diff(p.d)}</td><td>${KINDS[p.kind]}</td><td>${best(p)}/${p.points}</td></tr>`).join("")}</table>`;
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
      if (r.status !== 429 && r.status < 500) throw new Error(`The code runner refused the request (${r.status}).`);
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
    return { ok: out === String(t.output).trim() && r.status?.id === 3, status: r.status?.description, input: t.input, expected: t.output, got: out, error: r.compile_output || r.stderr };
  });
}

/* ---------------- problem page ---------------- */
const loadDraft = (id) => { try { return localStorage.getItem("jz:d:" + id); } catch { return null; } };
const saveDraft = (id, v) => { try { v == null ? localStorage.removeItem("jz:d:" + id) : localStorage.setItem("jz:d:" + id, v); } catch {} };

function problemPage(p) {
  const s = sub(p.id);
  let input = "";
  if (p.kind === "fill") {
    let i = 0;
    input = `<pre class="fill">${esc(p.starter).replace(/___/g, () => `<input class="blank" data-i="${i++}" size="14" autocomplete="off">`)}</pre>`;
  } else if (p.kind === "mcq") {
    input = p.choices.map((c, i) => `<label class="choice"><input type="radio" name="c" value="${i}">${"ABCDE"[i]}) ${esc(c)}</label>`).join("");
  } else {
    const draft = loadDraft(p.id);
    const label = p.kind === "project" ? "Write your class(es). No main method needed; you don't have to write public." : p.kind === "debug" ? "Fix the buggy code" : "Java code (class <code>Main</code>, read input with Scanner)";
    const def = p.starter || (p.kind === "code" ? "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        \n    }\n}\n" : "");
    input = `<label for="code">${label}</label><textarea class="code" id="code" spellcheck="false" aria-describedby="codehint">${esc(draft ?? s.last ?? def)}</textarea>
      <div class="row muted" style="font-size:13px" id="codehint"><span class="grow">Tab inserts spaces · press Esc, then Tab to leave the box · Ctrl+Enter ${p.kind === "mcq" ? "submits" : "runs the samples"} · your code is saved as you type</span><a href="#" id="reset">Reset code</a></div>`;
    window.__def = def;
  }
  const hasRun = ["code", "debug", "project"].includes(p.kind);
  app.innerHTML = `
    <p><a href="#/?topic=${encodeURIComponent(p.topic)}">← ${esc(p.topic)}</a></p>
    <h1>${esc(p.title)}</h1>
    <div class="row">${diff(p.d)} <span class="pill">${CATS[p.category] || ""}</span> <span class="pill">${KINDS[p.kind]}</span> <span class="pill">${best(p)}/${p.points} points</span> ${best(p) >= p.points ? "" : `<span class="pill" title="Each wrong attempt costs 25%; looking at the solution caps it at 25%">available now: ${Math.round(p.points * factor(s))}</span>`}</div>
    <div class="card" style="white-space:pre-wrap">${esc(p.statement)}</div>
    ${(p.samples || []).map((x, i) => `<div class="row"><div class="grow"><b>Sample input ${i + 1}</b><pre>${esc(x.input)}</pre></div><div class="grow"><b>Output</b><pre>${esc(x.output)}</pre></div></div>`).join("")}
    ${input}
    <div class="row" style="margin-top:10px">${hasRun ? '<button class="btn alt" id="run">Run samples</button>' : ""}<button class="btn" id="sub">Submit</button></div>
    <div id="res"></div>
    <div id="sol" style="margin-top:14px"><button class="btn alt" id="peek">Show the solution</button> <span class="muted">${s.peeked ? "(you already looked at it)" : "(your teacher can see that you looked)"}</span></div>`;
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
  $("#peek").onclick = () => {
    s.peeked = true; save();
    $("#sol").innerHTML = `<h2>Solution</h2><pre>${esc(p.solution || "")}</pre>`;
  };
  $("#run")?.addEventListener("click", async () => {
    $("#res").innerHTML = '<p class="muted">Running…</p>';
    try { $("#res").innerHTML = report(p, await runTests(p, ta.value, p.samples), true); } catch (e) { $("#res").innerHTML = `<div class="card bad">${esc(e.message)}</div>`; }
  });
  $("#sub").onclick = async () => {
    const c = content();
    if (c == null || (Array.isArray(c) && c.every((x) => !x.trim()))) return ($("#res").innerHTML = '<p class="warn">Answer first.</p>');
    $("#res").innerHTML = '<p class="muted">Checking…</p>';
    const f = factor(s);                       // penalty from earlier wrong attempts / peeking
    const pts = (frac) => Math.round(p.points * frac * f);
    let frac = 0, html = "";
    try {
      if (p.kind === "mcq") {
        frac = Number(c) === p.answer ? 1 : 0;
        html = `<div class="card ${frac ? "ok" : "bad"}">${frac ? "✅ Correct! +" + pts(1) : "❌ Not quite — try again."}</div>`;
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
    } catch (e) { return ($("#res").innerHTML = `<div class="card bad">${esc(e.message)}</div>`); }
    s.tries++; if (frac < 1 && s.best < p.points) s.fails = (s.fails || 0) + 1;
    s.best = Math.max(s.best, pts(frac)); s.at = new Date().toISOString(); save();
    const note = f < 1 && frac > 0 ? `<p class="warn">Points are ${Math.round(f * 100)}% of the full value because of earlier wrong attempts${s.peeked ? " or looking at the solution" : ""}.</p>` : "";
    const nx = nextAfter(p);
    const nextBtn = frac === 1 && nx ? `<p><a class="btn" href="#/p/${nx.id}">Next question →</a></p>` : frac === 1 ? `<p><a class="btn" href="#/?topic=${encodeURIComponent(p.topic)}">Back to topic →</a></p>` : "";
    const left = frac < 1 ? `<p class="muted">Next attempt is worth at most ${Math.round(p.points * factor(s))} points.</p>` : "";
    $("#res").innerHTML = html + note + left + nextBtn;
    $("#res").scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
}
function report(p, cases, samples, score) {
  const n = cases.filter((x) => x.ok).length;
  return `<div class="card"><b>${samples ? "Sample results" : n === cases.length ? "✅ Accepted" : "Result"}: ${n}/${cases.length} tests${samples ? "" : " · +" + score}</b>
    ${cases.map((c, i) => `<div class="${c.ok ? "ok" : "bad"}">Test ${i + 1}: ${c.ok ? "passed" : esc(c.status || "failed")}
      ${samples && !c.ok ? `<pre>input:\n${esc(c.input)}\nexpected:\n${esc(c.expected)}\ngot:\n${esc(c.got)}</pre>` : ""}${c.error ? `<pre>${esc(c.error)}</pre>` : ""}</div>`).join("")}</div>`;
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
  const total = Q.reduce((a, p) => a + best(p), 0), solved = Q.filter((p) => best(p) >= p.points).length;
  const recent = Object.entries(st.subs).filter(([, v]) => v.at).sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, 15);
  app.innerHTML = `<h1>My progress</h1><p class="muted">${esc(st.name)} · ${esc(st.email)} · ${total} points · ${solved} solved</p>
    <h2>By unit</h2>${bars(units)}<h2>By category</h2>${bars(cats)}<h2>By topic</h2>${bars(topics)}
    <h2>Recent</h2><table>${recent.map(([id, v]) => `<tr><td>${fmt(v.at)}</td><td><a href="#/p/${id}">${esc(QM[id]?.title)}</a></td><td>${v.best}/${QM[id]?.points}</td><td>${v.tries} tries</td></tr>`).join("") || '<tr><td class="muted">Nothing yet</td></tr>'}</table>
    <p style="margin-top:20px"><button class="btn alt" id="reset">Reset my progress</button></p>`;
  $("#reset").onclick = () => { if (confirm("Delete all your progress in this browser?")) { st.subs = {}; save(); me(); } };
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
function admin() {
  const cls = loadClass();
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
    <div class="card"><b>Add student codes</b> <span class="muted">(paste one code per line, or choose the files students sent)</span>
      <textarea id="paste" rows="3" placeholder="JZ2z.…" style="font-family:monospace" aria-label="Student codes"></textarea>
      <div class="row" style="margin-top:6px"><button class="btn" id="add">Add</button><input type="file" id="files" accept=".txt,.json" multiple style="width:auto" aria-label="Student code files"><button class="btn alt" id="clear">Clear class</button></div><div id="msg" role="status"></div></div>
    ${rows.length ? `<h2>Students (${rows.length})</h2><div style="overflow:auto"><table><tr><th>Name</th><th>Points</th>${units.map((u) => `<th>Unit ${u}</th>`).join("")}<th>Updated</th></tr>
      ${rows.map((r) => { const { units: us } = stats(subsOf(r)); return `<tr><td>${esc(r.n)}${r.w.length ? ` <span class="warn" title="${esc(r.w.join("; "))}">⚠</span>` : ""}<div class="muted" style="font-size:12px">${esc(r.e)}</div></td><td>${total(r)}</td>${units.map((u) => `<td>${pct(us["Unit " + u].got, us["Unit " + u].max)}%</td>`).join("")}<td class="muted">${fmt(r.t)}</td></tr>`; }).join("")}</table></div>
    <p class="muted">⚠ = the code looked edited or had impossible scores (hover for the reason). Scores in this version are self-reported by the student's browser.</p>
    <h2>Question × student</h2><select id="tp" aria-label="Topic">${topics.map((t) => `<option ${t === topic ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
    <p class="muted">✓ full points · number = partial · 0 = tried, not passed · · = not tried · 👁 = looked at the solution. Hover for tries.</p>
    <div style="overflow:auto"><table><tr><th>Student</th>${cols.map((p, i) => `<th title="${esc(p.title)} (${p.points}p)" style="text-align:center">${i + 1}</th>`).join("")}<th>%</th></tr>
      ${rows.map((r) => `<tr><td>${esc(r.n)}</td>${cols.map((p) => cell(r, p)).join("")}<td>${pct(cols.reduce((acc, p) => acc + Math.min(r.s[p.id]?.[0] || 0, p.points), 0), cols.reduce((acc, p) => acc + p.points, 0))}%</td></tr>`).join("")}</table></div>
    <ol>${cols.map((p) => `<li>${esc(p.title)} <span class="muted">${LEVELS[p.d]} · ${KINDS[p.kind]} · ${p.points}p</span></li>`).join("")}</ol>` : '<p class="muted">No students added yet.</p>'}`;
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
  $("#add").onclick = () => add($("#paste").value);
  $("#files").onchange = async (e) => { add((await Promise.all([...e.target.files].map((f) => f.text()))).join("\n")); };
  $("#clear").onclick = () => { if (confirm("Remove all students from this view?")) { localStorage.removeItem("jz:class"); admin(); } };
  $("#tp")?.addEventListener("change", (e) => (location.hash = "/admin?topic=" + encodeURIComponent(e.target.value)));
}

boot();
