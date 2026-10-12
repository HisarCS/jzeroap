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
const sub = (id) => (st.subs[id] ||= { best: 0, tries: 0, peeked: false, last: null, at: null });
const best = (p) => Math.min(st.subs[p.id]?.best || 0, p.points);

async function boot() {
  try {
    Q = await (await fetch("data/questions.json")).json();
  } catch (e) {
    app.innerHTML = `<div class="card bad">Could not load the questions: ${esc(e.message)}</div>`;
    return;
  }
  Q.forEach((p) => (QM[p.id] = p));
  window.addEventListener("hashchange", route);
  route();
}

function nav() {
  const link = (h, t) => `<a href="#${h}" class="${location.hash.replace(/\?.*/, "") === "#" + h ? "on" : ""}">${t}</a>`;
  $("#nav").innerHTML = st.name ? link("/", "Questions") + link("/me", "📊 My progress") + link("/share", "📤 Share") + link("/admin", "Teacher") : "";
}

function route() {
  nav();
  const [path, ...rest] = location.hash.replace(/^#\/?/, "").replace(/\?.*/, "").split("/");
  if (path === "admin") return admin();
  if (!st.name) return welcome();
  if (path === "p" && QM[rest[0]]) return problemPage(QM[rest[0]]);
  if (path === "me") return me();
  if (path === "share") return share();
  return home();
}

function welcome() {
  app.innerHTML = `<div class="card" style="max-width:440px;margin:40px auto">
    <h1>☕ JavaZero</h1><p>AP CSA practice, from easy to hard. Your progress is saved in this browser.</p>
    <label>Your name</label><input id="nm" autocomplete="name" placeholder="First Last">
    <label>School e-mail (@${DOMAIN})</label><input id="em" type="email" placeholder="name@${DOMAIN}">
    <p><button class="btn" id="go">Start</button></p><div id="msg"></div><p class="muted"><a href="#/admin">Teacher view</a></p></div>`;
  $("#go").onclick = () => {
    const name = $("#nm").value.trim(), email = $("#em").value.trim().toLowerCase();
    if (!name) return ($("#msg").innerHTML = '<p class="warn">Please enter your name.</p>');
    if (!email.endsWith("@" + DOMAIN)) return ($("#msg").innerHTML = `<p class="warn">Use your @${DOMAIN} e-mail.</p>`);
    st.name = name; st.email = email; save(); route();
  };
}

/* ---------------- home ---------------- */
function home() {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const topic = params.get("topic") || "", cat = params.get("cat") || "";
  const got = (ps) => ps.reduce((a, p) => a + best(p), 0), max = (ps) => ps.reduce((a, p) => a + p.points, 0);
  if (!topic) {
    const topics = [...new Set(Q.map((p) => p.topic))].sort(topicSort);
    const units = [...new Set(topics.map(unitOf))];
    app.innerHTML = `<h1>Questions</h1><p class="muted">Hi ${esc(st.name)}! Pick a topic. Questions go from easy to hard.</p>` + units.map((u) => {
      const ups = Q.filter((p) => unitOf(p.topic) === u);
      return `<div class="card"><div class="row"><h2 class="grow" style="margin:0">Unit ${u}</h2><b>${pct(got(ups), max(ups))}%</b></div>
        <div class="bar" style="margin:8px 0"><i style="width:${pct(got(ups), max(ups))}%"></i></div>
        ${topics.filter((t) => unitOf(t) === u).map((t) => { const tp = Q.filter((p) => p.topic === t);
          return `<a class="row" href="#/?topic=${encodeURIComponent(t)}" style="text-decoration:none;color:inherit;padding:4px 0">
            <span class="grow">${esc(t)} <span class="muted">(${tp.length})</span></span><div class="bar" style="width:120px"><i style="width:${pct(got(tp), max(tp))}%"></i></div><span style="width:44px;text-align:right">${pct(got(tp), max(tp))}%</span></a>`; }).join("")}</div>`;
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
async function judge(source, stdin) {
  const r = await fetch(`${JUDGE0}/submissions?base64_encoded=false&wait=true`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language_id: 62, source_code: source, stdin, cpu_time_limit: 3, memory_limit: 256000 }),
  });
  if (!r.ok) throw new Error("The code runner returned " + r.status + ". Try again in a moment.");
  return r.json();
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
  const cases = [];
  for (const t of tests) {
    const r = await judge(src, t.input ?? "");
    const out = (r.stdout ?? "").trim();
    cases.push({ ok: out === String(t.output).trim() && r.status?.id === 3, status: r.status?.description, input: t.input, expected: t.output, got: out, error: r.compile_output || r.stderr });
  }
  return cases;
}

/* ---------------- problem page ---------------- */
function problemPage(p) {
  const s = sub(p.id);
  let input = "";
  if (p.kind === "fill") {
    let i = 0;
    input = `<pre class="fill">${esc(p.starter).replace(/___/g, () => `<input class="blank" data-i="${i++}" size="14" autocomplete="off">`)}</pre>`;
  } else if (p.kind === "mcq") {
    input = p.choices.map((c, i) => `<label class="choice"><input type="radio" name="c" value="${i}">${"ABCDE"[i]}) ${esc(c)}</label>`).join("");
  } else {
    const label = p.kind === "project" ? "Write your class(es). No main method needed; you don't have to write public." : p.kind === "debug" ? "Fix the buggy code" : "Java code (class <code>Main</code>, read input with Scanner)";
    const def = p.starter || (p.kind === "code" ? "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        \n    }\n}\n" : "");
    input = `<label>${label}</label><textarea class="code" id="code" spellcheck="false">${esc(s.last || def)}</textarea>`;
  }
  const hasRun = ["code", "debug", "project"].includes(p.kind);
  app.innerHTML = `
    <p><a href="#/?topic=${encodeURIComponent(p.topic)}">← ${esc(p.topic)}</a></p>
    <h1>${esc(p.title)}</h1>
    <div class="row">${diff(p.d)} <span class="pill">${CATS[p.category] || ""}</span> <span class="pill">${KINDS[p.kind]}</span> <span class="pill">${best(p)}/${p.points} points</span></div>
    <div class="card" style="white-space:pre-wrap">${esc(p.statement)}</div>
    ${(p.samples || []).map((x, i) => `<div class="row"><div class="grow"><b>Sample input ${i + 1}</b><pre>${esc(x.input)}</pre></div><div class="grow"><b>Output</b><pre>${esc(x.output)}</pre></div></div>`).join("")}
    ${input}
    <div class="row" style="margin-top:10px">${hasRun ? '<button class="btn alt" id="run">Run samples</button>' : ""}<button class="btn" id="sub">Submit</button></div>
    <div id="res"></div>
    <div id="sol" style="margin-top:14px"><button class="btn alt" id="peek">Show the solution</button> <span class="muted">${s.peeked ? "(you already looked at it)" : "(your teacher can see that you looked)"}</span></div>`;
  const ta = $("#code");
  ta?.addEventListener("keydown", (e) => { if (e.key === "Tab") { e.preventDefault(); ta.setRangeText("    ", ta.selectionStart, ta.selectionEnd, "end"); } });
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
    let score = 0, html = "";
    try {
      if (p.kind === "mcq") {
        const ok = Number(c) === p.answer; score = ok ? p.points : 0;
        html = `<div class="card ${ok ? "ok" : "bad"}">${ok ? "✅ Correct! +" + p.points : "❌ Not quite — try again."}</div>`;
      } else if (p.kind === "fill") {
        const oks = p.blanks.map((acc, i) => acc.map(norm).includes(norm(c[i])));
        const n = oks.filter(Boolean).length; score = Math.round((p.points * n) / p.blanks.length);
        html = `<div class="card"><b>${n === p.blanks.length ? "✅ All correct" : "Result"}: ${n}/${p.blanks.length} blanks · +${score}</b><div>${oks.map((b, i) => `<span class="${b ? "ok" : "bad"}">Blank ${i + 1}: ${b ? "✓" : "✗"}</span>`).join(" · ")}</div></div>`;
      } else {
        const cases = await runTests(p, c, p.tests);
        const n = cases.filter((x) => x.ok).length; score = Math.round((p.points * n) / p.tests.length);
        html = report(p, cases, false, score);
        s.last = c;
      }
    } catch (e) { return ($("#res").innerHTML = `<div class="card bad">${esc(e.message)}</div>`); }
    s.tries++; s.best = Math.max(s.best, score); s.at = new Date().toISOString(); save();
    $("#res").innerHTML = html;
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
const b64 = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s) => JSON.parse(decodeURIComponent(escape(atob(s.trim().replace(/-/g, "+").replace(/_/g, "/")))));
function shareCode() {
  const s = {};
  Object.entries(st.subs).forEach(([id, v]) => { if (v.tries || v.peeked) s[id] = [v.best, v.tries, v.peeked ? 1 : 0, v.at || ""]; });
  return "JZ1." + b64({ n: st.name, e: st.email, t: new Date().toISOString(), s });
}
function share() {
  const code = shareCode();
  app.innerHTML = `<h1>Share my progress</h1><p>Send this code to your teacher (e-mail, Teams, Classroom). It contains your name, e-mail and scores — no code you wrote.</p>
    <textarea id="code" rows="5" readonly style="font-family:monospace">${code}</textarea>
    <div class="row" style="margin-top:8px"><button class="btn" id="cp">Copy</button><button class="btn alt" id="dl">Download file</button></div><div id="msg"></div>`;
  $("#cp").onclick = async () => { try { await navigator.clipboard.writeText(code); } catch { $("#code").select(); document.execCommand("copy"); } $("#msg").innerHTML = '<p class="ok">Copied ✓</p>'; };
  $("#dl").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([code], { type: "text/plain" })); a.download = `javazero-${st.name.replace(/\W+/g, "_")}.txt`; a.click(); };
}

/* ---------------- teacher: class view from pasted codes ---------------- */
function loadClass() { try { return JSON.parse(localStorage.getItem("jz:class")) || {}; } catch { return {}; } }
function admin() {
  const cls = loadClass();
  const rows = Object.values(cls).sort((a, b) => a.n.localeCompare(b.n));
  const subsOf = (r) => Object.fromEntries(Object.entries(r.s).map(([id, a]) => [id, { best: a[0], tries: a[1], peeked: a[2], at: a[3] }]));
  const total = (r) => Q.reduce((a, p) => a + Math.min(r.s[p.id]?.[0] || 0, p.points), 0);
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const topics = [...new Set(Q.map((p) => p.topic))].sort(topicSort), topic = params.get("topic") || topics[0];
  const cols = Q.filter((p) => p.topic === topic).sort((a, b) => a.d - b.d);
  const units = [...new Set(topics.map(unitOf))];
  const cell = (r, p) => {
    const a = r.s[p.id]; if (!a) return '<td class="muted" style="text-align:center">·</td>';
    const cls = a[0] >= p.points ? "ok" : a[0] > 0 ? "warn" : "bad";
    return `<td class="${cls}" style="text-align:center" title="${a[0]}/${p.points} · ${a[1]} tries${a[2] ? " · looked at solution" : ""}">${a[0] >= p.points ? "✓" : a[0]}${a[2] ? "👁" : ""}</td>`;
  };
  app.innerHTML = `<h1>Teacher: class view</h1>
    <div class="card"><b>Add student codes</b> <span class="muted">(paste one code per line, or choose the files students sent)</span>
      <textarea id="paste" rows="3" placeholder="JZ1...." style="font-family:monospace"></textarea>
      <div class="row" style="margin-top:6px"><button class="btn" id="add">Add</button><input type="file" id="files" accept=".txt,.json" multiple style="width:auto"><button class="btn alt" id="clear">Clear class</button></div><div id="msg"></div></div>
    ${rows.length ? `<h2>Students (${rows.length})</h2><div style="overflow:auto"><table><tr><th>Name</th><th>Points</th>${units.map((u) => `<th>Unit ${u}</th>`).join("")}<th>Updated</th></tr>
      ${rows.map((r) => { const { units: us } = stats(subsOf(r)); return `<tr><td>${esc(r.n)}<div class="muted" style="font-size:12px">${esc(r.e)}</div></td><td>${total(r)}</td>${units.map((u) => `<td>${pct(us["Unit " + u].got, us["Unit " + u].max)}%</td>`).join("")}<td class="muted">${fmt(r.t)}</td></tr>`; }).join("")}</table></div>
    <h2>Question × student</h2><select id="tp">${topics.map((t) => `<option ${t === topic ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
    <p class="muted">✓ full points · number = partial · 0 = tried, not passed · · = not tried · 👁 = looked at the solution. Hover for tries.</p>
    <div style="overflow:auto"><table><tr><th>Student</th>${cols.map((p, i) => `<th title="${esc(p.title)} (${p.points}p)" style="text-align:center">${i + 1}</th>`).join("")}<th>%</th></tr>
      ${rows.map((r) => `<tr><td>${esc(r.n)}</td>${cols.map((p) => cell(r, p)).join("")}<td>${pct(cols.reduce((a, p) => a + Math.min(r.s[p.id]?.[0] || 0, p.points), 0), cols.reduce((a, p) => a + p.points, 0))}%</td></tr>`).join("")}</table></div>
    <ol>${cols.map((p) => `<li>${esc(p.title)} <span class="muted">${LEVELS[p.d]} · ${KINDS[p.kind]} · ${p.points}p</span></li>`).join("")}</ol>` : '<p class="muted">No students added yet.</p>'}`;
  const add = (text) => {
    let ok = 0, bad = 0; const c = loadClass();
    text.split(/\s+/).filter(Boolean).forEach((tok) => {
      try { if (!tok.startsWith("JZ1.")) throw 0; const o = unb64(tok.slice(4)); const old = c[o.e]; if (!old || old.t <= o.t) c[o.e] = o; ok++; } catch { bad++; }
    });
    try { localStorage.setItem("jz:class", JSON.stringify(c)); } catch {}
    admin(); $("#msg").innerHTML = `<p class="${bad ? "warn" : "ok"}">${ok} added${bad ? `, ${bad} not understood` : ""}</p>`;
  };
  $("#add").onclick = () => add($("#paste").value);
  $("#files").onchange = async (e) => { add((await Promise.all([...e.target.files].map((f) => f.text()))).join("\n")); };
  $("#clear").onclick = () => { if (confirm("Remove all students from this view?")) { localStorage.removeItem("jz:class"); admin(); } };
  $("#tp")?.addEventListener("change", (e) => (location.hash = "/admin?topic=" + encodeURIComponent(e.target.value)));
}

boot();
