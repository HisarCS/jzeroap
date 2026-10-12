const sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
const $ = (s) => document.querySelector(s);
const app = $("#app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LEVELS = ["", "Çok kolay", "Kolay", "Orta", "Zor", "Çok zor"];
const KINDS = { code: "Kod", mcq: "MCQ", frq: "FRQ", fill: "Boşluk doldur", debug: "Hata bul", project: "Proje" };
const TRACKS = { ccc: "Waterloo CCC", apcsa: "AP CSA" };
const AP_TOPICS = ["Primitive Types", "Using Objects", "Boolean & If", "Iteration", "Writing Classes", "Array", "ArrayList", "2D Array", "Inheritance", "Recursion"];
let me = null; // profile

// Supabase returns at most 1000 rows per request; page through bigger results.
async function all(make) {
  const out = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await make().range(i, i + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

const diff = (n) => `<span class="pill d${n}">${LEVELS[n]}</span>`;
const isT = () => me?.role === "teacher";
const fmt = (d) => (d ? new Date(d).toLocaleString("tr-TR") : "—");

async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (session && !String(session.user.email).toLowerCase().endsWith("@" + CFG.DOMAIN)) {
    await sb.auth.signOut();
    alert("Only @" + CFG.DOMAIN + " accounts can sign in.");
    return location.reload();
  }
  if (session) {
    const { data } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
    me = data;
  }
  sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN" && !me) location.reload(); });
  window.addEventListener("hashchange", route);
  route();
}

function nav() {
  const link = (h, t) => `<a href="#${h}" class="${location.hash.startsWith("#" + h) ? "on" : ""}">${t}</a>`;
  $("#nav").innerHTML = me
    ? link("/", "Sorular") + link("/assigned", "Ödevlerim") + link("/me", "📊 Başarım") + link("/board", "🏆 Sıralama") +
      (isT() ? link("/t/students", "Öğrenciler") + link("/t/matrix", "Soru × Öğrenci") + link("/t/grade", "Puanla") + link("/t/bank", "Soru bankası") + link("/t/requests", "Çözüm istekleri") + link("/t/problems", "Soru ekle") + link("/t/assign", "Ödev ata") : "") +
      `<button id="out">Çıkış</button>`
    : "";
  $("#out")?.addEventListener("click", async () => { await sb.auth.signOut(); location.hash = "/"; location.reload(); });
}

async function route() {
  const [path, ...rest] = location.hash.replace(/^#\/?/, "").split("/");
  nav();
  if (!me) return login();
  app.innerHTML = '<p class="muted">Yükleniyor…</p>';
  try {
    if (path === "p") return problemPage(rest[0]);
    if (path === "board") return board();
    if (path === "me") return student(me.id, true);
    if (path === "assigned") return assigned();
    if (path === "t" && isT()) {
      const f = { students, matrix, grade, problemForm, assignForm, student, bank, requests }[rest[0]];
      if (f) return f(rest[1]);
    }
    return home();
  } catch (e) {
    app.innerHTML = `<div class="card bad">Hata: ${esc(e.message)}</div>`;
  }
}

function login() {
  app.innerHTML = `<div class="card" style="max-width:420px;margin:40px auto;text-align:center">
    <h1>☕ JavaZero</h1>
    <p>Waterloo CCC ve AP CSA için seviyeli Java pratiği.</p>
    <button class="btn" id="g">Okul Google hesabı ile giriş</button>
    <p class="muted">Sadece @${CFG.DOMAIN} hesapları.</p></div>`;
  $("#g").onclick = () =>
    sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname, queryParams: { hd: CFG.DOMAIN } } });
}

async function myBest() {
  const { data } = await sb.from("best_scores").select("problem_id,score").eq("user_id", me.id);
  return Object.fromEntries((data || []).map((r) => [r.problem_id, r.score]));
}

const CATS = { syntax: "Syntax", semantics: "Semantics", trace: "Trace", debug: "Debug", data: "Data", write: "Kod yaz" };
const unitOf = (t) => parseInt(t) || 0;
const topicSort = (a, b) => parseFloat(a.replace(/^(\d+)\.(\d+)/, (m, x, y) => x + "." + y.padStart(2, "0"))) - parseFloat(b.replace(/^(\d+)\.(\d+)/, (m, x, y) => x + "." + y.padStart(2, "0")));
const pct = (got, max) => (max ? Math.round((100 * got) / max) : 0);

async function home() {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const track = params.get("track") || "apcsa";
  const [{ data: probs }, best] = await Promise.all([
    sb.from("problems").select("id,title,kind,track,topic,category,difficulty,points").eq("track", track).order("difficulty").order("created_at"),
    myBest(),
  ]);
  const topic = params.get("topic") || "", cat = params.get("cat") || "";
  const tabs = Object.entries(TRACKS).map(([k, v]) => `<a class="btn ${k === track ? "" : "alt"}" href="#/?track=${k}">${v}</a>`).join("");
  const got = (ps) => ps.reduce((a, p) => a + Math.min(best[p.id] || 0, p.points), 0);
  const max = (ps) => ps.reduce((a, p) => a + p.points, 0);

  if (!topic) {
    const topics = [...new Set(probs.map((p) => p.topic))].sort(topicSort);
    const units = [...new Set(topics.map(unitOf))];
    app.innerHTML = `<div class="row"><h1 class="grow">Sorular</h1>${tabs}</div>` + units.map((u) => {
      const ups = probs.filter((p) => unitOf(p.topic) === u);
      return `<div class="card"><div class="row"><h2 class="grow" style="margin:0">Unit ${u}</h2><b>%${pct(got(ups), max(ups))}</b></div>
        <div class="bar" style="margin:8px 0"><i style="width:${pct(got(ups), max(ups))}%"></i></div>
        ${topics.filter((t) => unitOf(t) === u).map((t) => { const tp = probs.filter((p) => p.topic === t);
          return `<a class="row" href="#/?track=${track}&topic=${encodeURIComponent(t)}" style="text-decoration:none;color:inherit;padding:4px 0">
            <span class="grow">${esc(t)} <span class="muted">(${tp.length})</span></span><div class="bar" style="width:120px"><i style="width:${pct(got(tp), max(tp))}%"></i></div><span style="width:44px;text-align:right">%${pct(got(tp), max(tp))}</span></a>`; }).join("")}</div>`;
    }).join("") || '<p class="muted">Bu yolda henüz soru yok.</p>';
    return;
  }
  const tp = probs.filter((p) => p.topic === topic);
  const list = tp.filter((p) => !cat || p.category === cat);
  app.innerHTML = `
    <p><a href="#/?track=${track}">← Üniteler</a></p>
    <div class="row"><h1 class="grow">${esc(topic)}</h1><b>%${pct(got(tp), max(tp))}</b></div>
    <div class="bar"><i style="width:${pct(got(tp), max(tp))}%"></i></div>
    <div class="row" style="margin:10px 0"><a class="pill" href="#/?track=${track}&topic=${encodeURIComponent(topic)}">Tümü</a>
      ${Object.entries(CATS).filter(([k]) => tp.some((p) => p.category === k)).map(([k, v]) => `<a class="pill" href="#/?track=${track}&topic=${encodeURIComponent(topic)}&cat=${k}">${v}</a>`).join("")}</div>
    <table><tr><th></th><th>Soru</th><th>Kategori</th><th>Seviye</th><th>Tür</th><th>Puan</th></tr>
    ${list.map((p) => `<tr><td>${best[p.id] >= p.points ? "✅" : best[p.id] > 0 ? "🟡" : ""}</td>
      <td><a href="#/p/${p.id}">${esc(p.title)}</a></td><td>${CATS[p.category] || ""}</td><td>${diff(p.difficulty)}</td>
      <td>${KINDS[p.kind]}</td><td>${best[p.id] || 0}/${p.points}</td></tr>`).join("")}</table>
    ${list.length ? "" : '<p class="muted">Bu filtrede soru yok.</p>'}`;
}

async function problemPage(id) {
  const { data: p, error } = await sb.from("problems").select("*").eq("id", id).single();
  if (error) throw error;
  const { data: subs } = await sb.from("submissions").select("*").eq("problem_id", id).eq("user_id", me.id).order("created_at", { ascending: false }).limit(8);
  const last = subs?.[0]?.content;
  let input = "";
  if (p.kind === "fill") {
    let i = 0;
    input = `<pre class="fill">${esc(p.starter_code).replace(/___/g, () => `<input class="blank" data-i="${i++}" size="14" autocomplete="off">`)}</pre>`;
  } else if (p.kind === "code" || p.kind === "debug" || p.kind === "project")
    input = `<label>${p.kind === "project" ? "Sınıf(lar)ını yaz — main yazma, public yazmana gerek yok" : p.kind === "debug" ? "Hatalı kodu düzelt" : "Java kodu (sınıf adı <code>Main</code>, Scanner ile stdin'den oku)"}</label>
      <textarea class="code" id="code" spellcheck="false">${esc(last || p.starter_code || (p.kind !== "code" ? "" : "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        \n    }\n}\n"))}</textarea>`;
  else if (p.kind === "frq")
    input = `<label>Cevabın (Java kodu)</label><textarea class="code" id="code" spellcheck="false">${esc(last || p.starter_code || "")}</textarea>`;
  else
    input = (p.choices || []).map((c, i) => `<label class="choice"><input type="radio" name="c" value="${i}">${"ABCDE"[i]}) ${esc(c)}</label>`).join("");
  app.innerHTML = `
    <p><a href="#/?track=${p.track}&topic=${encodeURIComponent(p.topic)}">← ${esc(p.topic)}</a></p>
    <h1>${esc(p.title)}</h1>
    <div class="row">${diff(p.difficulty)} <span class="pill">${esc(p.topic)}</span> <span class="pill">${KINDS[p.kind]}</span> <span class="pill">${p.points} puan</span></div>
    <div class="card" style="white-space:pre-wrap">${esc(p.statement)}</div>
    ${(p.samples || []).map((s, i) => `<div class="row"><div class="grow"><b>Örnek girdi ${i + 1}</b><pre>${esc(s.input)}</pre></div><div class="grow"><b>Çıktı</b><pre>${esc(s.output)}</pre></div></div>`).join("")}
    ${input}
    <div class="row" style="margin-top:10px">
      ${["code", "debug", "project"].includes(p.kind) ? '<button class="btn alt" id="run">Örnekleri çalıştır</button>' : ""}
      <button class="btn" id="sub">Gönder</button></div>
    <div id="res"></div>
    <div id="sol"></div>
    <h2>Geçmiş</h2>
    <table>${(subs || []).map((s) => `<tr><td>${fmt(s.created_at)}</td><td>${esc(s.status)}</td><td>${s.passed}/${s.total}</td><td>${s.score}</td><td>${esc(s.feedback || "")}</td></tr>`).join("") || '<tr><td class="muted">Henüz gönderim yok</td></tr>'}</table>`;
  const ta = $("#code");
  ta?.addEventListener("keydown", (e) => {
    if (e.key === "Tab") { e.preventDefault(); ta.setRangeText("    ", ta.selectionStart, ta.selectionEnd, "end"); }
  });
  const go = async (run_only) => {
    const blanks = [...app.querySelectorAll(".blank")];
    const content = blanks.length ? JSON.stringify(blanks.map((b) => b.value)) : ta ? ta.value : document.querySelector("input[name=c]:checked")?.value;
    if (content == null) return ($("#res").innerHTML = '<p class="warn">Bir seçenek seç.</p>');
    $("#res").innerHTML = '<p class="muted">Çalışıyor…</p>';
    const { data, error } = await sb.functions.invoke("grade", { body: { problem_id: id, content, run_only } });
    if (error || data?.error) return ($("#res").innerHTML = `<div class="card bad">${esc(error?.message || data.error)}</div>`);
    $("#res").innerHTML = result(p, data, run_only);
    if (!run_only) problemPage(id).then(() => ($("#res").innerHTML = result(p, data, false)));
  };
  solutionBox(p);
  $("#run")?.addEventListener("click", () => go(true));
  $("#sub").addEventListener("click", () => go(false));
}

async function solutionBox(p) {
  const box = $("#sol");
  const { data: sol } = await sb.rpc("get_solution", { pid: p.id });
  if (sol) return (box.innerHTML = `<h2>${isT() ? "Çözüm (sadece sen görürsün)" : "Öğretmenin çözümü"}</h2><pre>${esc(sol)}</pre>`);
  if (isT()) return;
  const { data: acc } = await sb.from("solution_access").select("status").eq("problem_id", p.id).eq("user_id", me.id).maybeSingle();
  box.innerHTML = acc ? '<p class="muted">Çözüm isteğin öğretmene iletildi.</p>' : '<button class="btn alt" id="ask">Çözümü iste</button>';
  $("#ask")?.addEventListener("click", async () => {
    const { error } = await sb.from("solution_access").insert({ user_id: me.id, problem_id: p.id });
    box.innerHTML = error ? `<p class="bad">${esc(error.message)}</p>` : '<p class="muted">Çözüm isteğin öğretmene iletildi.</p>';
  });
}

function result(p, d, run_only) {
  if (p.kind === "fill") return `<div class="card"><b>${d.status === "accepted" ? "✅ Hepsi doğru" : "Sonuç"}: ${d.passed}/${d.total} boşluk · +${d.score} puan</b><div>${d.blanks.map((b, i) => `<span class="${b ? "ok" : "bad"}">Boşluk ${i + 1}: ${b ? "✓" : "✗"}</span>`).join(" · ")}</div></div>`;
  if (p.kind === "frq") return '<div class="card">📨 Gönderildi. Öğretmen puanlayınca burada görünecek.</div>';
  if (p.kind === "mcq") return `<div class="card ${d.correct ? "ok" : "bad"}">${d.correct ? "✅ Doğru! +" + d.score + " puan" : "❌ Yanlış"}</div>`;
  const cases = (d.cases || []).map((c) => `<div class="${c.ok ? "ok" : "bad"}">Test ${c.n}: ${c.ok ? "geçti" : esc(c.status || "başarısız")}
    ${c.shown && !c.ok ? `<pre>girdi:\n${esc(c.shown.input)}\nbeklenen:\n${esc(c.shown.expected)}\nçıktı:\n${esc(c.shown.got)}</pre>` : ""}
    ${c.error ? `<pre>${esc(c.error)}</pre>` : ""}</div>`).join("");
  return `<div class="card"><b>${run_only ? "Örnek sonuçları" : d.status === "accepted" ? "✅ Kabul edildi" : "Sonuç"}: ${d.passed}/${d.total} test${run_only ? "" : " · +" + d.score + " puan"}</b>${cases}</div>`;
}

async function board() {
  const { data, error } = await sb.rpc("leaderboard");
  if (error) throw error;
  app.innerHTML = `<h1>🏆 Sıralama</h1><table><tr><th>#</th><th>Öğrenci</th><th>Puan</th><th>Çözülen</th></tr>
    ${data.map((r, i) => `<tr ${r.user_id === me.id ? 'style="font-weight:700;background:var(--card)"' : ""}><td>${i + 1}</td><td>${esc(r.full_name)}</td><td>${r.points}</td><td>${r.solved}</td></tr>`).join("")}</table>`;
}

async function assigned() {
  const [{ data: as }, best] = await Promise.all([
    sb.from("assignments").select("id,title,due_at,assignment_problems(problems(id,title,points,difficulty))").order("due_at"),
    myBest(),
  ]);
  app.innerHTML = `<h1>Ödevlerim</h1>${(as || []).map((a) => `<div class="card"><b>${esc(a.title)}</b> <span class="muted">son tarih: ${fmt(a.due_at)}</span>
    <ul>${a.assignment_problems.map(({ problems: p }) => `<li>${best[p.id] >= p.points ? "✅" : "⬜"} <a href="#/p/${p.id}">${esc(p.title)}</a> ${diff(p.difficulty)}</li>`).join("")}</ul></div>`).join("") || '<p class="muted">Atanmış ödev yok.</p>'}`;
}

/* ---------- Teacher ---------- */
async function students() {
  const [{ data: ps }, best, probs] = await Promise.all([
    sb.from("profiles").select("id,full_name,email").eq("role", "student").order("full_name"),
    all(() => sb.from("best_scores").select("user_id,problem_id,score,last_at,attempts")),
    all(() => sb.from("problems").select("id,points")),
  ]);
  const pm = Object.fromEntries(probs.map((p) => [p.id, p]));
  const rows = ps.map((s) => {
    const mine = best.filter((x) => x.user_id === s.id);
    const total = mine.reduce((a, x) => a + x.score, 0);
    const solved = mine.filter((x) => pm[x.problem_id] && x.score >= pm[x.problem_id].points).length;
    const last = mine.reduce((a, x) => (!a || x.last_at > a ? x.last_at : a), null);
    return { ...s, total, solved, tried: mine.length, last };
  }).sort((a, b) => b.total - a.total);
  app.innerHTML = `<h1>Öğrenciler (${rows.length})</h1><table><tr><th>Ad</th><th>E-posta</th><th>Puan</th><th>Çözülen</th><th>Denenen</th><th>Son aktivite</th></tr>
    ${rows.map((r) => `<tr><td><a href="#/t/student/${r.id}">${esc(r.full_name)}</a></td><td class="muted">${esc(r.email)}</td><td>${r.total}</td><td>${r.solved}</td><td>${r.tried}</td><td>${fmt(r.last)}</td></tr>`).join("")}</table>`;
}

// Teacher: which student did which question (one topic at a time).
async function matrix() {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const [probs, { data: ps }, best] = await Promise.all([
    all(() => sb.from("problems").select("id,title,topic,difficulty,points,kind").order("difficulty").order("created_at")),
    sb.from("profiles").select("id,full_name").eq("role", "student").order("full_name"),
    all(() => sb.from("best_scores").select("user_id,problem_id,score")),
  ]);
  const topics = [...new Set(probs.map((p) => p.topic))].sort(topicSort);
  const topic = params.get("topic") || topics[0];
  const cols = probs.filter((p) => p.topic === topic);
  const sc = {};
  best.forEach((x) => (sc[x.user_id + x.problem_id] = x.score));
  const cell = (u, p) => {
    const v = sc[u + p.id];
    if (v == null) return '<td class="muted" style="text-align:center">·</td>';
    const cls = v >= p.points ? "ok" : v > 0 ? "warn" : "bad";
    return `<td class="${cls}" style="text-align:center" title="${v}/${p.points}">${v >= p.points ? "✓" : v}</td>`;
  };
  app.innerHTML = `<h1>Soru × Öğrenci</h1>
    <select id="tp">${topics.map((t) => `<option ${t === topic ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
    <p class="muted">✓ tam puan · sayı = kısmi puan · 0 = denedi ama geçemedi · · = hiç denemedi. Sütunlar: seviyeye göre soru sırası (üzerine gel: başlık).</p>
    <div style="overflow:auto"><table><tr><th>Öğrenci</th>${cols.map((p, i) => `<th title="${esc(p.title)} (${p.points}p)" style="text-align:center"><a href="#/p/${p.id}">${i + 1}</a></th>`).join("")}<th>%</th></tr>
    ${ps.map((s) => { const got = cols.reduce((a, p) => a + Math.min(sc[s.id + p.id] || 0, p.points), 0), mx = cols.reduce((a, p) => a + p.points, 0);
      return `<tr><td><a href="#/t/student/${s.id}">${esc(s.full_name)}</a></td>${cols.map((p) => cell(s.id, p)).join("")}<td>${pct(got, mx)}%</td></tr>`; }).join("")}</table></div>
    <h2>Sorular</h2><ol>${cols.map((p) => `<li>${esc(p.title)} <span class="muted">${LEVELS[p.difficulty]} · ${KINDS[p.kind]} · ${p.points}p</span></li>`).join("")}</ol>`;
  $("#tp").onchange = (e) => (location.hash = "/t/matrix?topic=" + encodeURIComponent(e.target.value));
}

async function student(id, self) {
  const [{ data: s }, subs, probs] = await Promise.all([
    sb.from("profiles").select("*").eq("id", id).single(),
    all(() => sb.from("submissions").select("*").eq("user_id", id).order("created_at", { ascending: false })),
    all(() => sb.from("problems").select("id,title,topic,category,points,kind")),
  ]);
  const pm = Object.fromEntries(probs.map((p) => [p.id, p]));
  const topics = {};
  const cats = {};
  const best = {};
  subs.forEach((x) => { best[x.problem_id] = Math.max(best[x.problem_id] || 0, x.score); });
  probs.forEach((p) => {
    const g = Math.min(best[p.id] || 0, p.points);
    const t = (topics[p.topic] ||= { got: 0, max: 0 }); t.max += p.points; t.got += g;
    const c = (cats[p.category || "-"] ||= { got: 0, max: 0 }); c.max += p.points; c.got += g;
  });
  const bars = (o, names) => Object.entries(o).map(([t, v]) => `<div class="row"><span style="width:260px">${esc(names?.[t] || t)}</span><div class="bar grow"><i style="width:${pct(v.got, v.max)}%"></i></div><span style="width:90px;text-align:right">%${pct(v.got, v.max)} · ${v.got}/${v.max}</span></div>`).join("");
  const total = Object.values(best).reduce((a, b) => a + b, 0);
  const units = {};
  probs.forEach((p) => { const u = (units["Unit " + unitOf(p.topic)] ||= { got: 0, max: 0 }); u.max += p.points; u.got += Math.min(best[p.id] || 0, p.points); });
  app.innerHTML = `${self ? "" : '<p><a href="#/t/students">← Öğrenciler</a></p>'}<h1>${esc(self ? "Başarım" : s.full_name)}</h1><p class="muted">${esc(s.full_name)} · ${esc(s.email)} · ${total} puan</p>
    <h2>Ünite bazlı</h2>${bars(units)}
    <h2>Kategori bazlı</h2>${bars(cats, CATS)}<h2>Konu bazlı</h2>${bars(Object.fromEntries(Object.entries(topics).sort((a, b) => topicSort(a[0], b[0]))))}
    ${self ? "" : `<h2>Çözümü aç</h2><div class="row">${Object.keys(best).filter((id) => pm[id] && best[id] < pm[id].points).map((id) => `<button class="btn alt grant" data-p="${id}">${esc(pm[id].title)}</button>`).join("") || '<span class="muted">Takıldığı soru yok</span>'}</div>`}
    <h2>Gönderimler</h2><table><tr><th>Tarih</th><th>Soru</th><th>Durum</th><th>Test</th><th>Puan</th></tr>
    ${subs.map((x) => `<tr><td>${fmt(x.created_at)}</td><td>${esc(pm[x.problem_id]?.title)}</td><td>${esc(x.status)}</td><td>${x.passed}/${x.total}</td><td>${x.score}</td></tr>`).join("")}</table>`;
  app.querySelectorAll(".grant").forEach((b) => (b.onclick = async () => {
    const { error } = await sb.from("solution_access").upsert({ user_id: id, problem_id: b.dataset.p, status: "granted", updated_at: new Date().toISOString() });
    b.outerHTML = error ? `<span class="bad">${esc(error.message)}</span>` : '<span class="ok">✓ açıldı</span>';
  }));
}

async function requests() {
  const { data } = await sb.from("solution_access").select("*,profiles(full_name),problems(title)").eq("status", "requested").order("updated_at");
  app.innerHTML = `<h1>Çözüm istekleri (${data.length})</h1>${data.map((r) => `<div class="card row"><span class="grow"><b>${esc(r.profiles.full_name)}</b> — <a href="#/p/${r.problem_id}">${esc(r.problems.title)}</a> <span class="muted">${fmt(r.updated_at)}</span></span><button class="btn" data-u="${r.user_id}" data-p="${r.problem_id}">Çözümü aç</button></div>`).join("") || '<p class="muted">Bekleyen istek yok.</p>'}`;
  app.querySelectorAll("button[data-u]").forEach((b) => (b.onclick = async () => {
    const { error } = await sb.from("solution_access").update({ status: "granted", updated_at: new Date().toISOString() }).eq("user_id", b.dataset.u).eq("problem_id", b.dataset.p);
    if (error) alert(error.message); else b.closest(".card").remove();
  }));
}

async function bank() {
  const [{ data: probs }, { data: secs }] = await Promise.all([
    sb.from("problems").select("*").order("track").order("topic").order("difficulty"),
    sb.from("problem_secrets").select("*"),
  ]);
  const sm = Object.fromEntries(secs.map((x) => [x.problem_id, x]));
  const by = {};
  probs.forEach((p) => (by[`${TRACKS[p.track]} · ${p.topic}`] ||= []).push(p));
  app.innerHTML = `<h1>Soru bankası (${probs.length})</h1>${Object.entries(by).map(([k, ps]) => `<h2>${esc(k)} <span class="muted">(${ps.length})</span></h2>
    ${ps.map((p) => { const x = sm[p.id] || {}; const ans = x.solution || (x.answer != null ? `Doğru: ${"ABCDE"[x.answer]}` : x.blanks ? JSON.stringify(x.blanks) : x.rubric || "");
      return `<details class="card"><summary>${diff(p.difficulty)} <span class="pill">${KINDS[p.kind]}</span> <b>${esc(p.title)}</b> <span class="muted">${p.points}p</span> <a href="#/p/${p.id}">aç</a></summary>
      <pre>${esc(p.statement)}</pre>${p.starter_code ? `<b>Başlangıç</b><pre>${esc(p.starter_code)}</pre>` : ""}<b>Çözüm</b><pre>${esc(ans || "(çözüm girilmemiş)")}</pre></details>`; }).join("")}`).join("")}`;
}

async function grade() {
  const { data } = await sb.from("submissions").select("*,profiles(full_name),problems(title,points,statement)").eq("status", "pending").order("created_at");
  app.innerHTML = `<h1>Puanlanacak FRQ'lar (${data.length})</h1>${data.map((s) => `<div class="card" data-id="${s.id}">
    <b>${esc(s.profiles.full_name)}</b> — ${esc(s.problems.title)} <span class="muted">${fmt(s.created_at)}</span>
    <pre>${esc(s.content)}</pre>
    <div class="row"><input class="sc" type="number" min="0" max="${s.problems.points}" placeholder="Puan / ${s.problems.points}" style="width:140px">
    <input class="fb grow" placeholder="Geri bildirim"><button class="btn">Kaydet</button></div></div>`).join("") || '<p class="muted">Bekleyen yok 🎉</p>'}`;
  app.querySelectorAll(".card .btn").forEach((b) => (b.onclick = async () => {
    const c = b.closest(".card");
    const score = Number(c.querySelector(".sc").value);
    const { error } = await sb.from("submissions").update({ score, passed: 1, total: 1, status: "graded", feedback: c.querySelector(".fb").value }).eq("id", c.dataset.id);
    if (error) alert(error.message); else c.remove();
  }));
}

function problemForm() {
  app.innerHTML = `<h1>Yeni soru</h1><form class="card" id="f">
    <div class="row"><div class="grow"><label>Tür</label><select name="kind"><option value="code">Kod (CCC tarzı)</option><option value="mcq">MCQ</option><option value="frq">FRQ</option><option value="fill">Boşluk doldur</option><option value="debug">Hata bul (testli)</option><option value="project">Proje (sınıf/metot)</option></select></div>
    <div class="grow"><label>Kategori</label><select name="track"><option value="ccc">Waterloo CCC</option><option value="apcsa">AP CSA</option></select></div>
    <div class="grow"><label>Kategori</label><select name="category">${Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
    <div class="grow"><label>Seviye (1-5)</label><input name="difficulty" type="number" min="1" max="5" value="1"></div>
    <div class="grow"><label>Puan</label><input name="points" type="number" value="10"></div></div>
    <label>Konu</label><input name="topic" list="tp" required><datalist id="tp">${AP_TOPICS.map((t) => `<option>${t}`).join("")}<option>Implementation<option>Greedy<option>Strings<option>Math<option>Graphs<option>DP</datalist>
    <label>Başlık</label><input name="title" required>
    <label>Soru metni</label><textarea name="statement" rows="6" required></textarea>
    <label>Başlangıç kodu. Boşluk doldurda boşlukları ___ ile işaretle; hata bulda hatalı kodu yaz; projede iskelet sınıf</label><textarea name="starter_code" class="code" style="min-height:100px"></textarea>
    <label>Testler (kod): her satır "girdi => çıktı" ; çok satırlı girdi için \\n kullan. İlk N tanesi örnek olarak gösterilir</label>
    <textarea name="tests" rows="5" placeholder="3 4 => 7"></textarea>
    <label>Gösterilecek örnek sayısı</label><input name="nsamples" type="number" value="1">
    <label>MCQ seçenekleri (her satır bir seçenek)</label><textarea name="choices" rows="4"></textarea>
    <label>MCQ doğru seçenek (A=0, B=1, …)</label><input name="answer" type="number" min="0" max="4">
    <label>Boşluklar (fill): her satır bir boşluk, kabul edilen cevaplar | ile ayrılır (örn: i &lt;= 5 | i &lt; 6)</label><textarea name="blanks" rows="3"></textarea>
    <label>Proje harness'ı: gizli <code>public class Main</code> (stdin'den senaryo no okur; testlerde girdi = senaryo no)</label><textarea name="harness" class="code" style="min-height:140px"></textarea>
    <label>Çözüm / olası cevap (öğrenciye sen açarsın)</label><textarea name="solution" class="code" style="min-height:140px"></textarea>
    <label>FRQ rubrik notları (sadece sen görürsün)</label><textarea name="rubric" rows="3"></textarea>
    <p><button class="btn">Kaydet</button></p><div id="msg"></div></form>`;
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const tests = f.tests.split("\n").filter(Boolean).map((l) => { const [i, o] = l.split("=>"); return { input: i.trim().replace(/\\n/g, "\n"), output: (o || "").trim().replace(/\\n/g, "\n") }; });
    const choices = f.choices.split("\n").filter(Boolean);
    const { data, error } = await sb.from("problems").insert({
      kind: f.kind, track: f.track, topic: f.topic, category: f.category, title: f.title, statement: f.statement, starter_code: f.starter_code || null,
      difficulty: +f.difficulty, points: +f.points, samples: tests.slice(0, +f.nsamples || 0), choices: f.kind === "mcq" ? choices : null,
    }).select().single();
    if (error) return ($("#msg").innerHTML = `<p class="bad">${esc(error.message)}</p>`);
    const sec = await sb.from("problem_secrets").insert({ problem_id: data.id, tests, answer: f.answer === "" ? null : +f.answer, rubric: f.rubric,
      blanks: f.blanks ? f.blanks.split("\n").filter(Boolean).map((l) => l.split("|").map((x) => x.trim())) : null, harness: f.harness || null, solution: f.solution || null });
    $("#msg").innerHTML = sec.error ? `<p class="bad">${esc(sec.error.message)}</p>` : '<p class="ok">Kaydedildi ✅</p>';
    if (!sec.error) e.target.reset();
  };
}

async function assignForm() {
  const [{ data: probs }, { data: ps }, { data: as }] = await Promise.all([
    sb.from("problems").select("id,title,difficulty,topic").order("difficulty"),
    sb.from("profiles").select("id,full_name").eq("role", "student").order("full_name"),
    sb.from("assignments").select("id,title,due_at,assignment_targets(count)").order("created_at", { ascending: false }),
  ]);
  app.innerHTML = `<h1>Ödev ata</h1><form class="card" id="f">
    <label>Başlık</label><input name="title" required><label>Son tarih</label><input name="due" type="datetime-local">
    <div class="row" style="align-items:flex-start"><div class="grow"><h2>Sorular</h2>
    ${probs.map((p) => `<label class="choice"><input type="checkbox" name="p" value="${p.id}">${esc(p.title)} <span class="muted">${esc(p.topic)} · ${LEVELS[p.difficulty]}</span></label>`).join("")}</div>
    <div class="grow"><h2>Öğrenciler <button type="button" class="btn alt" id="all">Hepsi</button></h2>
    ${ps.map((s) => `<label class="choice"><input type="checkbox" name="s" value="${s.id}">${esc(s.full_name)}</label>`).join("")}</div></div>
    <p><button class="btn">Ata</button></p><div id="msg"></div></form>
    <h2>Mevcut ödevler</h2>${as.map((a) => `<div class="card">${esc(a.title)} <span class="muted">· ${fmt(a.due_at)} · ${a.assignment_targets[0].count} öğrenci</span></div>`).join("")}`;
  $("#all").onclick = () => app.querySelectorAll("input[name=s]").forEach((c) => (c.checked = true));
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const pids = fd.getAll("p"), sids = fd.getAll("s");
    if (!pids.length || !sids.length) return ($("#msg").innerHTML = '<p class="warn">En az bir soru ve öğrenci seç.</p>');
    const { data: a, error } = await sb.from("assignments").insert({ title: fd.get("title"), due_at: fd.get("due") ? new Date(fd.get("due")).toISOString() : null }).select().single();
    if (error) return ($("#msg").innerHTML = `<p class="bad">${esc(error.message)}</p>`);
    await sb.from("assignment_problems").insert(pids.map((p) => ({ assignment_id: a.id, problem_id: p })));
    await sb.from("assignment_targets").insert(sids.map((s) => ({ assignment_id: a.id, user_id: s })));
    assignForm();
  };
}

boot();
