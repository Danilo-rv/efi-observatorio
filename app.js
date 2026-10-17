import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isNum = v => typeof v === "number" && isFinite(v);
const fmt = (n, d = 0) => isNum(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "–";
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WS = ["", "De onde vem o dinheiro?", "Preciso ou quero?", "Cofrinho dos sonhos", "Consumo consciente", "Mercadinho da turma"];
const ROLE = { professor: "Professor(a)", familia: "Família", extensionista: "Extensionista", voluntario: "Voluntário(a) Sicoob", gestor: "Gestão / Secretaria" };
const PAPEL = { admin: "Administrador", coordenador: "Coordenador", extensionista: "Extensionista", parceiro: "Parceiro (só consulta)" };
const SRC = { crianca: "Crianças", professor: "Professores", familia: "Famílias" };
const TARGET = { kids: 800, schools: 10, classes: 30, prof: 30, fam: 400, ws: 150, ext: 8, freq: 80, gain: 30, sat: 85 };
const TABLES = ["schools", "classes", "kids", "people", "sessions", "surveys", "media"];

const S = { schools: [], classes: [], kids: [], people: [], sessions: [], surveys: [], media: [], config: {}, urls: {}, team: [], invites: [] };
let me = null, profile = null, tab = "painel", cadTab = "escolas", curUid = null, loaded = false;

if (SUPABASE_URL.startsWith("COLE")) {
  document.body.innerHTML = '<div class="wrap" style="padding-top:8vh"><div class="card"><h2>Falta configurar o Supabase</h2><p class="sub">Abra o arquivo config.js e cole a Project URL e a chave anon public do seu projeto. O passo a passo está no arquivo LEIAME.md.</p></div></div>';
  throw new Error("config pendente");
}
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

/* ---------- utilidades de interface ---------- */
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3000) }
function errMsg(e) {
  const m = (e && (e.message || e.error_description)) || "";
  if (/row-level security|permission denied|not allowed/i.test(m)) return "Seu perfil não tem permissão para esta ação.";
  if (/duplicate key/i.test(m)) return "Esse registro já existe.";
  if (/Cadastro somente por convite|Database error saving new user/i.test(m)) return "Convite inválido, vencido ou já usado. Peça um novo ao coordenador.";
  if (/Invalid login/i.test(m)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(m)) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (/already registered|already been registered/i.test(m)) return "Este e-mail já tem cadastro. Use Entrar ou Esqueci minha senha.";
  if (/Password should be/i.test(m)) return "A senha precisa ter pelo menos 8 caracteres.";
  if (/rate limit|too many/i.test(m)) return "Muitas tentativas seguidas. Aguarde alguns minutos.";
  if (/exceeded the maximum allowed size|too large|payload/i.test(m)) return "Arquivo grande demais (limite de 50 MB).";
  return m || "Não foi possível concluir.";
}
const isNetErr = e => !navigator.onLine || e instanceof TypeError || /failed to fetch|network|load failed/i.test((e && e.message) || "");
const can = {
  get write() { return profile && ["admin", "coordenador", "extensionista"].includes(profile.papel) },
  get manage() { return profile && ["admin", "coordenador"].includes(profile.papel) },
  get admin() { return profile && profile.papel === "admin" },
};

/* ---------- estatística ---------- */
function lgamma(xx){const c=[76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];let y=xx,t=xx+5.5;t-=(xx+.5)*Math.log(t);let s=1.000000000190015;for(const ci of c)s+=ci/++y;return -t+Math.log(2.5066282746310005*s/xx)}
function betacf(a,b,x){const FP=1e-300;let qab=a+b,qap=a+1,qam=a-1,c=1,d=1-qab*x/qap;if(Math.abs(d)<FP)d=FP;d=1/d;let h=d;for(let m=1;m<=200;m++){const m2=2*m;let aa=m*(b-m)*x/((qam+m2)*(a+m2));d=1+aa*d;if(Math.abs(d)<FP)d=FP;c=1+aa/c;if(Math.abs(c)<FP)c=FP;d=1/d;h*=d*c;aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));d=1+aa*d;if(Math.abs(d)<FP)d=FP;c=1+aa/c;if(Math.abs(c)<FP)c=FP;d=1/d;const del=d*c;h*=del;if(Math.abs(del-1)<3e-14)break}return h}
function ibeta(x,a,b){if(x<=0)return 0;if(x>=1)return 1;const bt=Math.exp(lgamma(a+b)-lgamma(a)-lgamma(b)+a*Math.log(x)+b*Math.log(1-x));return x<(a+1)/(a+b+2)?bt*betacf(a,b,x)/a:1-bt*betacf(b,a,1-x)/b}
const tTwoP=(t,df)=>ibeta(df/(df+t*t),df/2,.5);
function tCrit(df){let lo=0,hi=60;for(let i=0;i<60;i++){const m=(lo+hi)/2;if(tTwoP(m,df)>.05)lo=m;else hi=m}return(lo+hi)/2}
function paired(rows){
  const n=rows.length,mpre=mean(rows.map(r=>r.pre)),mpos=mean(rows.map(r=>r.pos));
  const d=rows.map(r=>r.pos-r.pre),md=mean(d);
  if(n<2)return{n,mpre,mpos,md,sd:null,se:null,t:null,df:null,p:null,lo:null,hi:null,dz:null,gain:mpre>0?(mpos/mpre-1)*100:null};
  const sd=Math.sqrt(d.reduce((s,x)=>s+(x-md)**2,0)/(n-1)),se=sd/Math.sqrt(n),df=n-1;
  const t=se>0?md/se:(md===0?0:Infinity),p=isFinite(t)?tTwoP(t,df):0,tc=tCrit(df);
  return{n,mpre,mpos,md,sd,se,t,df,p,lo:md-tc*se,hi:md+tc*se,dz:sd>0?md/sd:null,gain:mpre>0?(mpos/mpre-1)*100:null};
}
const fmtP=p=>p==null?"–":p<0.001?"< 0,001":fmt(p,3);



/* ---------- carregamento de dados ---------- */
async function loadAll() {
  const res = await Promise.all(TABLES.map(t => sb.from(t).select("*").order("created_at", { ascending: true }).range(0, 4999)));
  res.forEach((r, i) => { if (r.error) throw r.error; S[TABLES[i]] = r.data });
  const c = await sb.from("config").select("*").eq("id", 1).maybeSingle();
  S.config = (c.data) || {};
  await signMedia();
  if (can.admin) { const t = await sb.from("profiles").select("*").order("created_at", { ascending: true }); S.team = t.data || [] }
  if (can.manage) { const iv = await sb.from("invites").select("*").order("created_at", { ascending: true }); S.invites = iv.data || [] }
  loaded = true;
}
async function reload(tables) {
  const list = tables || TABLES;
  const res = await Promise.all(list.map(t => sb.from(t).select("*").order("created_at", { ascending: true }).range(0, 4999)));
  res.forEach((r, i) => { if (!r.error) S[list[i]] = r.data });
  if (list.includes("media")) await signMedia();
  renderAll();
}
async function signMedia() {
  const need = S.media.map(m => m.path).filter(p => !S.urls[p]);
  if (!need.length) return;
  const { data } = await sb.storage.from("midia").createSignedUrls(need, 60 * 60 * 6);
  (data || []).forEach(d => { if (d.signedUrl) S.urls[d.path] = d.signedUrl });
}
async function mut(fn, okMsg, tables) {
  if (!can.write) { toast("Seu perfil só permite consultar."); return false }
  try { const r = await fn(); if (r && r.error) throw r.error; if (tables) await reload(tables); if (okMsg) toast(okMsg); return true }
  catch (e) { toast(errMsg(e)); return false }
}

/* ---------- fila offline (oficinas, pesquisas e mídia) ---------- */
const idb = {
  open() { return new Promise((res, rej) => { const r = indexedDB.open("efi", 1); r.onupgradeneeded = () => r.result.createObjectStore("q", { keyPath: "id", autoIncrement: true }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) }) },
  async tx(mode, fn) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction("q", mode); const rq = fn(t.objectStore("q")); t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error) }) },
  put(v) { return this.tx("readwrite", s => s.add(v)) }, all() { return this.tx("readonly", s => s.getAll()) }, del(id) { return this.tx("readwrite", s => s.delete(id)) },
};
async function queueCount() { try { return (await idb.all()).length } catch (_) { return 0 } }
async function updateSync() {
  const n = await queueCount();
  $("#syncDot").className = "dot" + (navigator.onLine && !n ? " on" : "");
  $("#syncTxt").textContent = !navigator.onLine ? `Sem internet${n ? ` · ${n} na fila` : ""}` : n ? `${n} na fila para enviar` : "Sincronizado";
}
let flushing = false;
async function flushQueue() {
  if (flushing || !navigator.onLine || !profile) return; flushing = true; let sent = 0;
  try {
    for (const it of await idb.all()) {
      try {
        if (it.blob) { const up = await sb.storage.from("midia").upload(it.path, it.blob, { contentType: it.type, upsert: true }); if (up.error) throw up.error }
        const r = await sb.from(it.table).insert(it.row); if (r.error && !/duplicate/i.test(r.error.message)) throw r.error;
        await idb.del(it.id); sent++;
      } catch (e) { if (isNetErr(e)) break; await idb.del(it.id); toast("Um item da fila foi recusado: " + errMsg(e)) }
    }
  } finally { flushing = false }
  if (sent) { toast(`${sent} item(ns) da fila enviado(s).`); await reload() }
  updateSync();
}
async function saveRow(table, row, okMsg, blobInfo) {
  if (!can.write) { toast("Seu perfil só permite consultar."); return false }
  row = { ...row, id: crypto.randomUUID() };
  try {
    if (blobInfo) { const up = await sb.storage.from("midia").upload(blobInfo.path, blobInfo.blob, { contentType: blobInfo.type }); if (up.error) throw up.error }
    const r = await sb.from(table).insert(row); if (r.error) throw r.error;
    if (okMsg) toast(okMsg); await reload([table]); return true;
  } catch (e) {
    if (isNetErr(e)) { await idb.put({ table, row, ...(blobInfo || {}) }); toast("Sem internet. Guardado na fila e enviado depois."); updateSync(); return true }
    toast(errMsg(e)); return false;
  }
}
window.addEventListener("online", () => { flushQueue(); updateSync() });
window.addEventListener("offline", updateSync);

/* ---------- métricas ---------- */
function schoolsSorted() { return [...S.schools].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.name).localeCompare(b.name)) }
function schoolName(id) { const s = S.schools.find(x => x.id === id); return s ? s.name : "(escola removida)" }
function className(id) { const c = S.classes.find(x => x.id === id); return c ? c.name : "(turma removida)" }
function shortName(n) { return String(n).replace(/^Escola\s+(Municipal|Estadual)?\s*/i, "").slice(0, 11) }
function metrics() {
  const kids = S.kids.map(k => ({ ...k, pre: k.pre == null ? null : +k.pre, pos: k.pos == null ? null : +k.pos }));
  const byClass = {}; S.sessions.forEach(s => { (byClass[s.class_id] = byClass[s.class_id] || []).push(s) });
  const reg = {}; kids.forEach(k => { reg[k.class_id] = (reg[k.class_id] || 0) + 1 });
  let reached = 0; Object.keys(byClass).forEach(c => { reached += Math.max(Math.max(...byClass[c].map(s => +s.present || 0)), reg[c] || 0) });
  const fr = S.sessions.filter(s => +s.enrolled > 0).map(s => s.present / s.enrolled);
  const freq = fr.length ? mean(fr) * 100 : null;
  const wsFreq = [1, 2, 3, 4, 5].map(w => { const a = S.sessions.filter(s => +s.ws === w && +s.enrolled > 0).map(s => s.present / s.enrolled); return a.length ? mean(a) * 100 : null });
  const pairs = kids.filter(k => isNum(k.pre) && isNum(k.pos));
  const st = pairs.length ? paired(pairs) : null;
  const rat = S.surveys.map(x => +x.rating).filter(isNum);
  const sat = rat.length ? rat.filter(r => r >= 4).length / rat.length * 100 : null;
  const satBy = {}; Object.keys(SRC).forEach(k => { const a = S.surveys.filter(x => x.source === k).map(x => +x.rating); satBy[k] = a.length ? { v: a.filter(r => r >= 4).length / a.length * 100, n: a.length } : null });
  const cnt = r => S.people.filter(p => p.role === r).length;
  const kit = (S.config.kit ? 1 : 0) + (S.config.cartilha ? 1 : 0);
  return {
    reached, schools: new Set(S.sessions.map(s => s.school_id)).size, classes: Object.keys(byClass).length,
    prof: S.people.filter(p => p.role === "professor" && p.trained).length, profAll: cnt("professor"), fam: cnt("familia"), ext: cnt("extensionista"), vol: cnt("voluntario"),
    ws: S.sessions.length, freq, wsFreq, st, pairs, sat, satBy, satN: rat.length, kit,
    photos: S.media.filter(m => m.kind === "image").length, videos: S.media.filter(m => m.kind === "video").length, kidsReg: S.kids.length
  };
}

/* ---------- gráfico de barras ---------- */
function barPath(x,y0,w,h,r){r=Math.min(4,h/2,w/2);if(h<=0)return"";return`M${x},${y0}V${y0-h+r}a${r},${r} 0 0 1 ${r},${-r}H${x+w-r}a${r},${r} 0 0 1 ${r},${r}V${y0}Z`}
function barChart({rows,max,ticks,colors,target,unit=""}){
  const W=640,H=250,pl=36,pr=8,pt=12,pb=40,iw=W-pl-pr,ih=H-pt-pb,y=v=>pt+ih-(v/max)*ih;
  let g="";ticks.forEach(t=>{g+=`<line class="gl" x1="${pl}" x2="${W-pr}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${pl-6}" y="${y(t)+4}" text-anchor="end">${t}${unit}</text>`});
  const gw=iw/rows.length,k=rows[0].vals.length,bw=Math.min(24,(gw-14)/k-2);
  rows.forEach((r,i)=>{const cx=pl+gw*i+gw/2,tot=k*bw+(k-1)*2;
    r.vals.forEach((v,j)=>{if(!isNum(v))return;const x=cx-tot/2+j*(bw+2),h=(v/max)*ih;g+=`<path d="${barPath(x,y(0),bw,h,4)}" fill="${colors[j]}" data-tip="${esc(r.tips[j])}"/>`});
    g+=`<text class="ax" x="${cx}" y="${H-pb+16}" text-anchor="middle">${esc(r.label)}</text>`});
  if(target!=null)g+=`<line class="tgt" x1="${pl}" x2="${W-pr}" y1="${y(target)}" y2="${y(target)}"/><text class="ax" x="${W-pr}" y="${y(target)-5}" text-anchor="end">meta ${target}${unit}</text>`;
  return`<svg viewBox="0 0 ${W} ${H}" role="img" width="100%" style="min-width:420px">${g}</svg>`;
}
const tipEl=$("#tip");
document.addEventListener("pointermove",e=>{const t=e.target.closest&&e.target.closest("[data-tip]");if(!t){tipEl.hidden=true;return}tipEl.textContent=t.getAttribute("data-tip");tipEl.hidden=false;const x=Math.min(e.clientX+12,innerWidth-250);tipEl.style.left=x+"px";tipEl.style.top=(e.clientY+14)+"px"});
document.addEventListener("pointerdown",e=>{if(!(e.target.closest&&e.target.closest("[data-tip]")))tipEl.hidden=true});



/* ---------- painel ---------- */
function status(kind, value, target, none) {
  if (value == null || none) return { cls: "none", t: "Sem dados" };
  if (value >= target) return { cls: "good", t: "✓ Meta atingida" };
  return { cls: "warn", t: kind === "rate" ? "Abaixo da meta" : "Em andamento" };
}
function metaCard(label, valTxt, sub, pct, st) { return `<div class="card meta"><div class="lab">${label}</div><div class="big">${valTxt}</div><div class="bar" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><span class="chip ${st.cls}">${st.t}</span><span class="note">${sub}</span></div></div>` }
function renderPainel() {
  const el = $("#painelDyn");
  if (!S.schools.length) { el.innerHTML = `<div class="card empty"><h3>O painel começa vazio</h3><p>Cadastre as escolas e turmas, registre as oficinas e lance as avaliações. Os indicadores das metas M1 a M6 aparecem aqui sozinhos.</p><div class="row wonly" style="justify-content:center;margin-top:14px"><button class="btn" data-go="cad">Cadastrar escolas</button>${can.admin ? '<button class="btn ghost" data-seed="1">Carregar dados de exemplo</button>' : ""}</div></div>`; return }
  const m = metrics(), st = m.st;
  const cards = [
    metaCard("M1 · Crianças atendidas", `${fmt(m.reached)} <small>de ${TARGET.kids}</small>`, `${m.schools} escolas · ${m.classes} turmas`, m.reached / TARGET.kids * 100, m.reached ? status("count", m.reached, TARGET.kids) : status("count", null)),
    metaCard("M2 · Professores capacitados", `${m.prof} <small>de ${TARGET.prof}</small>`, `${m.profAll} cadastrados`, m.prof / TARGET.prof * 100, m.profAll ? status("count", m.prof, TARGET.prof) : status("count", null)),
    metaCard("M3 · Frequência média", `${fmt(m.freq, 0)}% <small>meta ≥ ${TARGET.freq}%</small>`, `${S.sessions.length} oficinas`, (m.freq || 0) / TARGET.freq * 100, status("rate", m.freq, TARGET.freq)),
    metaCard("M4 · Aumento de acertos", `${fmt(st ? st.gain : null, 0)}% <small>meta ≥ ${TARGET.gain}%</small>`, st ? `${st.n} crianças com pré e pós` : "sem pré e pós", ((st && st.gain) || 0) / TARGET.gain * 100, status("rate", st ? st.gain : null, TARGET.gain)),
    metaCard("M5 · Kit e cartilha", `${m.kit} <small>de 2 produtos</small>`, "marque em Avaliações", m.kit / 2 * 100, m.kit === 2 ? { cls: "good", t: "✓ Meta atingida" } : m.kit ? { cls: "warn", t: "Em andamento" } : { cls: "none", t: "Não iniciado" }),
    metaCard("M6 · Satisfação (bom ou ótimo)", `${fmt(m.sat, 0)}% <small>meta ≥ ${TARGET.sat}%</small>`, `${m.satN} respostas`, (m.sat || 0) / TARGET.sat * 100, status("rate", m.sat, TARGET.sat))
  ].join("");
  const schoolRows = schoolsSorted().map(s => { const p = m.pairs.filter(k => k.school_id === s.id); return p.length ? { label: shortName(s.name), vals: [mean(p.map(k => k.pre)), mean(p.map(k => k.pos))], tips: [`${s.name}: pré ${fmt(mean(p.map(k => k.pre)), 1)} (n=${p.length})`, `${s.name}: pós ${fmt(mean(p.map(k => k.pos)), 1)} (n=${p.length})`] } : null }).filter(Boolean);
  const wsRows = [1, 2, 3, 4, 5].map((w, i) => ({ label: "Of. " + w, vals: [m.wsFreq[i]], tips: [`${WS[w]}: ${m.wsFreq[i] == null ? "sem dados" : fmt(m.wsFreq[i], 0) + "% de presença"}`] }));
  const satRows = Object.keys(SRC).map(k => { const v = m.satBy[k]; return `<div style="display:grid;grid-template-columns:90px 1fr 48px;gap:10px;align-items:center;margin-bottom:10px"><span style="font-size:.88rem">${SRC[k]}</span><div class="bar" style="position:relative"><i style="width:${v ? v.v : 0}%"></i><span style="position:absolute;left:${TARGET.sat}%;top:-3px;bottom:-3px;width:2px;background:var(--ink2)"></span></div><b style="font-variant-numeric:tabular-nums">${v ? fmt(v.v, 0) + "%" : "–"}</b></div>` }).join("");
  el.innerHTML = `<div class="grid g3">${cards}</div>
  <div class="kpi" style="margin-top:14px"><div><b>${m.ws}</b><span>oficinas de ${TARGET.ws}</span></div><div><b>${m.fam}</b><span>famílias de ${TARGET.fam}</span></div><div><b>${m.ext}</b><span>extensionistas de ${TARGET.ext}</span></div><div><b>${m.vol}</b><span>voluntários Sicoob</span></div><div><b>${m.photos}</b><span>fotos</span></div><div><b>${m.videos}</b><span>vídeos</span></div></div>
  <div class="grid g2" style="margin-top:14px">
   <div class="card"><h3>Nota média por escola</h3><p class="sub">Pré e pós-teste, escala de 0 a 10.</p>${schoolRows.length ? `<div class="legend"><span style="--c:var(--s1)">Pré-teste</span><span style="--c:var(--s2)">Pós-teste</span></div><div class="chartbox">${barChart({ rows: schoolRows, max: 10, ticks: [0, 2.5, 5, 7.5, 10], colors: ["var(--s1)", "var(--s2)"] })}</div>` : `<p class="note">Lance pré e pós-teste em Avaliações para ver este gráfico.</p>`}</div>
   <div class="card"><h3>Presença por oficina</h3><p class="sub">Média de crianças presentes em cada uma das cinco oficinas.</p>${m.wsFreq.some(v => v != null) ? `<div class="chartbox">${barChart({ rows: wsRows, max: 100, ticks: [0, 25, 50, 75, 100], colors: ["var(--s1)"], target: 80, unit: "%" })}</div>` : `<p class="note">Registre oficinas em Campo para ver este gráfico.</p>`}</div>
  </div>
  <div class="card" style="margin-top:14px"><h3>Satisfação por quem respondeu</h3><p class="sub">Percentual de respostas bom ou ótimo (4 e 5). A marca vertical indica a meta de ${TARGET.sat}%.</p>${satRows}</div>`;
}

/* ---------- análise ---------- */
function statRow(label, st) { return `<tr><td>${esc(label)}</td><td class="n">${st.n}</td><td class="n">${fmt(st.mpre, 2)}</td><td class="n">${fmt(st.mpos, 2)}</td><td class="n">${fmt(st.gain, 0)}%</td><td class="n">${fmt(st.dz, 2)}</td><td class="n">${fmtP(st.p)}</td></tr>` }
function renderAnalise() {
  const el = $("#analiseDyn"), m = metrics(), st = m.st;
  if (!st) { el.innerHTML = `<div class="card empty"><h3>Ainda não há pares de pré e pós-teste</h3><p>Lance as notas em Avaliações. A análise aparece com pelo menos duas crianças avaliadas nos dois momentos.</p></div>`; return }
  const ciclo = k => (S.schools.find(s => s.id === k.school_id) || {}).ciclo;
  const groups = [["Ciclo 1", m.pairs.filter(k => ciclo(k) == 1)], ["Ciclo 2", m.pairs.filter(k => ciclo(k) == 2)]].filter(g => g[1].length);
  const rowsC = groups.map(g => statRow(g[0], paired(g[1]))).join("");
  const rowsS = schoolsSorted().map(s => { const p = m.pairs.filter(k => k.school_id === s.id); return p.length ? statRow(s.name, paired(p)) : "" }).join("");
  const sig = st.p != null && st.p < 0.05;
  const texto = st.n < 2 ? "Dados insuficientes para o teste." : `A nota média passou de ${fmt(st.mpre, 2)} no pré-teste para ${fmt(st.mpos, 2)} no pós-teste, uma diferença média de ${fmt(st.md, 2)} ponto(s) (IC 95%: ${fmt(st.lo, 2)} a ${fmt(st.hi, 2)}). O teste t pareado ${sig ? "indica diferença estatisticamente significativa" : "não indica diferença estatisticamente significativa"} (t(${st.df}) = ${fmt(st.t, 2)}; p ${st.p < 0.001 ? "< 0,001" : "= " + fmt(st.p, 3)}), com tamanho de efeito dz = ${fmt(st.dz, 2)}. O aumento relativo de acertos foi de ${fmt(st.gain, 0)}% (meta: ${TARGET.gain}%).`;
  el.innerHTML = `<div class="grid g2">
   <div class="card"><h3>Teste t pareado</h3><p class="sub">Todas as crianças com pré e pós-teste.</p>
    <div class="kpi"><div><b>${st.n}</b><span>pares</span></div><div><b>${fmt(st.mpre, 2)}</b><span>média pré</span></div><div><b>${fmt(st.mpos, 2)}</b><span>média pós</span></div><div><b>${fmt(st.md, 2)}</b><span>diferença média</span></div><div><b>${fmt(st.sd, 2)}</b><span>desvio das diferenças</span></div><div><b>${st.t == null ? "–" : fmt(st.t, 2)}</b><span>t (gl ${st.df ?? "–"})</span></div><div><b>${fmtP(st.p)}</b><span>valor p</span></div><div><b>${fmt(st.dz, 2)}</b><span>dz de Cohen</span></div></div>
    <p style="margin-top:14px">${esc(texto)}</p><p class="note" style="margin-top:8px">Teste bicaudal, nível de 5%. O dz de Cohen usa o desvio das diferenças. Com amostras pequenas, interprete com cautela.</p></div>
   <div class="card"><h3>Presença e satisfação</h3><p class="sub">Resumo para acompanhar M3 e M6.</p>
    <div class="kpi"><div><b>${fmt(m.freq, 0)}%</b><span>frequência média</span></div><div><b>${m.ws}</b><span>oficinas</span></div><div><b>${fmt(m.sat, 0)}%</b><span>bom ou ótimo</span></div><div><b>${m.satN}</b><span>respostas</span></div></div>
    <p class="note" style="margin-top:12px">As metas completas estão no Painel.</p></div></div>
  <div class="card" style="margin-top:14px"><h3>Comparação por ciclo e por escola</h3><p class="sub">Ganho = média do pós ÷ média do pré − 1.</p><div class="scroll"><table class="tbl"><thead><tr><th>Grupo</th><th class="n">n</th><th class="n">Pré</th><th class="n">Pós</th><th class="n">Ganho</th><th class="n">dz</th><th class="n">p</th></tr></thead><tbody>${statRow("Todos", st)}${rowsC}${rowsS}</tbody></table></div></div>`;
}

/* ---------- infográfico e exportações ---------- */
function infographic(m) {
  const W = 1080, H = 1480, st = m.st, K = "#14232b", G = "#0d7a62", B = "#2a78d6", O = "#eb6834", M = "#5d6f78";
  const tile = (x, y, v, l) => `<g transform="translate(${x},${y})"><rect width="312" height="128" rx="16" fill="#eef4f5"/><text x="24" y="70" font-size="52" font-weight="700" fill="${K}">${esc(v)}</text><text x="24" y="102" font-size="19" fill="${M}">${esc(l)}</text></g>`;
  const prog = (y, l, v, t, txt) => { const p = Math.max(0, Math.min(1, v / t)); return `<text x="60" y="${y}" font-size="21" fill="${K}">${esc(l)}</text><text x="${W - 60}" y="${y}" font-size="21" font-weight="600" fill="${K}" text-anchor="end">${esc(txt)}</text><rect x="60" y="${y + 12}" width="${W - 120}" height="12" rx="6" fill="#dfe8ea"/><rect x="60" y="${y + 12}" width="${Math.max(0, (W - 120) * p)}" height="12" rx="6" fill="${G}"/>` };
  const maxH = 170, b = v => v / 10 * maxH, pre = st ? st.mpre : 0, pos = st ? st.mpos : 0;
  const gainTxt = st && st.gain != null ? `${st.gain >= 0 ? "+" : ""}${fmt(st.gain, 0)}%` : "–";
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'IBM Plex Sans',system-ui,Arial,sans-serif"><rect width="${W}" height="${H}" fill="#ffffff"/><rect width="${W}" height="250" fill="${G}"/>
  <text x="60" y="96" font-size="56" font-weight="700" fill="#fff">Educação Financeira Infantil</text><text x="60" y="140" font-size="24" fill="#d5f1e9">Projeto de extensão · IF Goiano, Campus Rio Verde</text><text x="60" y="178" font-size="20" fill="#d5f1e9">Em parceria com o Sicoob Empresarial e a Secretaria de Educação</text><text x="60" y="222" font-size="18" fill="#bfe6dc">Resultados em ${new Date().toLocaleDateString("pt-BR")}</text>`;
  [[fmt(m.reached), "crianças atendidas"], [String(m.schools), "escolas participantes"], [String(m.ws), "oficinas realizadas"], [String(m.prof), "professores capacitados"], [String(m.fam), "famílias envolvidas"], [String(m.ext), "extensionistas"]].forEach((t, i) => { s += tile(60 + (i % 3) * 330, 290 + Math.floor(i / 3) * 148, t[0], t[1]) });
  s += `<text x="60" y="636" font-size="30" font-weight="700" fill="${K}">O que as crianças aprenderam</text>`;
  s += `<g transform="translate(60,670)"><line x1="0" x2="440" y1="${maxH + 10}" y2="${maxH + 10}" stroke="#c9d6da"/>
  <rect x="70" y="${maxH + 10 - b(pre)}" width="120" height="${b(pre)}" rx="8" fill="${B}"/><text x="130" y="${maxH - b(pre)}" text-anchor="middle" font-size="24" font-weight="700" fill="${K}">${fmt(pre, 1)}</text><text x="130" y="${maxH + 40}" text-anchor="middle" font-size="18" fill="${M}">Pré-teste</text>
  <rect x="250" y="${maxH + 10 - b(pos)}" width="120" height="${b(pos)}" rx="8" fill="${O}"/><text x="310" y="${maxH - b(pos)}" text-anchor="middle" font-size="24" font-weight="700" fill="${K}">${fmt(pos, 1)}</text><text x="310" y="${maxH + 40}" text-anchor="middle" font-size="18" fill="${M}">Pós-teste</text></g>`;
  s += `<g transform="translate(560,690)"><text x="0" y="60" font-size="84" font-weight="700" fill="${G}">${esc(gainTxt)}</text><text x="0" y="98" font-size="22" fill="${K}">de aumento na nota média</text><text x="0" y="140" font-size="18" fill="${M}">${st ? `${st.n} crianças avaliadas${st.p != null ? " · p " + (st.p < 0.001 ? "< 0,001" : "= " + fmt(st.p, 3)) : ""}` : "sem avaliações ainda"}</text></g>`;
  s += `<text x="60" y="960" font-size="30" font-weight="700" fill="${K}">Metas do projeto</text>`;
  [["Crianças atendidas (M1)", m.reached, TARGET.kids, `${fmt(m.reached)} de ${TARGET.kids}`], ["Professores capacitados (M2)", m.prof, TARGET.prof, `${m.prof} de ${TARGET.prof}`], ["Frequência média (M3)", m.freq || 0, TARGET.freq, `${fmt(m.freq, 0)}% (meta ${TARGET.freq}%)`], ["Aumento de acertos (M4)", st && st.gain || 0, TARGET.gain, `${gainTxt} (meta ${TARGET.gain}%)`], ["Kit e cartilha (M5)", m.kit, 2, `${m.kit} de 2`], ["Satisfação bom ou ótimo (M6)", m.sat || 0, TARGET.sat, `${fmt(m.sat, 0)}% (meta ${TARGET.sat}%)`]].forEach((r, i) => { s += prog(1006 + i * 72, r[0], r[1], r[2], r[3]) });
  s += `<rect x="0" y="${H - 70}" width="${W}" height="70" fill="#eef4f5"/><text x="60" y="${H - 28}" font-size="17" fill="${M}">Dados agregados. Nenhuma criança é identificada. Observatório EFI · Observatório ITA e iHub GT, IF Goiano.</text></svg>`;
  return s;
}
function renderInfo() {
  const m = metrics(); $("#infoBox").innerHTML = infographic(m).replace(/ width="1080" height="1480"/, "");
  const ph = S.media.filter(x => x.authorized && x.kind === "image" && S.urls[x.path]).slice(0, 12);
  $("#infoGal").innerHTML = ph.length ? `<div class="gallery">${ph.map(x => `<div class="ph"><img src="${esc(S.urls[x.path])}" alt="${esc(x.caption || "Registro da oficina")}" loading="lazy"></div>`).join("")}</div>` : `<p class="note">Nenhuma foto autorizada ainda.</p>`;
}
function saveBlob(name, blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1500) }
const csvEsc = v => { v = v == null ? "" : String(v); return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v };
$("#dlSvg").onclick = () => saveBlob("infografico-efi.svg", new Blob([infographic(metrics())], { type: "image/svg+xml" }));
$("#dlPng").onclick = () => {
  const svg = infographic(metrics()), img = new Image();
  img.onload = () => { const c = document.createElement("canvas"); c.width = 2160; c.height = 2960; const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); c.toBlob(b => saveBlob("infografico-efi.png", b), "image/png") };
  img.onerror = () => toast("Não foi possível gerar o PNG. Use o SVG ou o PDF.");
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
};
$("#dlPdf").onclick = () => window.print();
$("#dlCsv1").onclick = () => { const r = [["codigo", "escola", "turma", "pre", "pos"]]; S.kids.forEach(k => r.push([k.code, schoolName(k.school_id), className(k.class_id), k.pre ?? "", k.pos ?? ""])); saveBlob("avaliacoes-efi.csv", new Blob(["﻿" + r.map(x => x.map(csvEsc).join(";")).join("\n")], { type: "text/csv" })) };
$("#dlCsv2").onclick = () => { const r = [["data", "escola", "turma", "oficina", "presentes", "turma_total", "observacoes"]]; S.sessions.forEach(s => r.push([s.date, schoolName(s.school_id), className(s.class_id), s.ws, s.present, s.enrolled, s.notes || ""])); saveBlob("oficinas-efi.csv", new Blob(["﻿" + r.map(x => x.map(csvEsc).join(";")).join("\n")], { type: "text/csv" })) };

/* ---------- selects ---------- */
function setOpts(sel, items, blank) { const prev = sel.value; sel.innerHTML = (blank != null ? `<option value="">${blank}</option>` : "") + items.map(i => `<option value="${esc(i.v)}">${esc(i.t)}</option>`).join(""); if ([...sel.options].some(o => o.value === prev)) sel.value = prev }
function refreshSelects() {
  const sc = schoolsSorted().map(s => ({ v: s.id, t: s.name }));
  ["fS", "tS", "kS", "aS", "sS"].forEach(id => setOpts($("#" + id), sc, sc.length ? null : "Cadastre uma escola"));
  setOpts($("#pS"), sc, "Sem escola");
  [["fS", "fC"], ["kS", "kC"], ["aS", "aC"]].forEach(([a, b]) => setOpts($("#" + b), S.classes.filter(c => c.school_id === $("#" + a).value).sort((x, y) => String(x.name).localeCompare(y.name)).map(c => ({ v: c.id, t: c.name })), ""));
  if (!$("#fW").options.length) setOpts($("#fW"), [1, 2, 3, 4, 5].map(w => ({ v: w, t: `${w}. ${WS[w]}` })));
}
["fS", "kS", "aS"].forEach(id => $("#" + id).addEventListener("change", () => { refreshSelects(); renderAval() }));
$("#aC").addEventListener("change", renderAval);

/* ---------- cadastros ---------- */
function delBtn(path) { return can.manage ? `<button class="btn ghost sm" data-del="${esc(path)}">Excluir</button>` : "" }
function renderCad() {
  $$("#cadSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.c === cadTab)));
  ["escolas", "turmas", "criancas", "pessoas"].forEach(c => { $("#cad-" + c).hidden = c !== cadTab });
  const cc = {}; S.classes.forEach(c => cc[c.school_id] = (cc[c.school_id] || 0) + 1);
  $("#listEsc").innerHTML = S.schools.length ? `<table class="tbl"><thead><tr><th>Escola</th><th>Ciclo</th><th class="n">Turmas</th><th></th></tr></thead><tbody>${schoolsSorted().map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.ciclo)}</td><td class="n">${cc[s.id] || 0}</td><td class="n">${delBtn("schools/" + s.id)}</td></tr>`).join("")}</tbody></table>` : `<p class="note">Nenhuma escola cadastrada.</p>`;
  const kc = {}; S.kids.forEach(k => kc[k.class_id] = (kc[k.class_id] || 0) + 1);
  $("#listTur").innerHTML = S.classes.length ? `<table class="tbl"><thead><tr><th>Escola</th><th>Turma</th><th class="n">Crianças</th><th></th></tr></thead><tbody>${[...S.classes].sort((a, b) => schoolName(a.school_id).localeCompare(schoolName(b.school_id)) || String(a.name).localeCompare(b.name)).map(c => `<tr><td>${esc(schoolName(c.school_id))}</td><td>${esc(c.name)}</td><td class="n">${kc[c.id] || 0}</td><td class="n">${delBtn("classes/" + c.id)}</td></tr>`).join("")}</tbody></table>` : `<p class="note">Nenhuma turma cadastrada.</p>`;
  const kids = [...S.kids].sort((a, b) => String(a.code).localeCompare(b.code)), noCons = kids.filter(k => !k.consent).length;
  $("#kidSub").textContent = `${kids.length} crianças cadastradas${noCons ? ` · ${noCons} sem consentimento registrado` : ""}${kids.length > 150 ? " · mostrando as 150 primeiras" : ""}`;
  $("#listKid").innerHTML = kids.length ? `<table class="tbl"><thead><tr><th>Código</th><th>Turma</th><th>Termo</th><th></th></tr></thead><tbody>${kids.slice(0, 150).map(k => `<tr><td class="code">${esc(k.code)}</td><td>${esc(className(k.class_id))}</td><td><span class="chip ${k.consent ? "good" : "warn"}">${k.consent ? "✓ Recolhido" : "Pendente"}</span></td><td class="n">${delBtn("kids/" + k.id)}</td></tr>`).join("")}</tbody></table>` : `<p class="note">Nenhuma criança cadastrada.</p>`;
  $("#listPes").innerHTML = S.people.length ? `<table class="tbl"><thead><tr><th>Nome</th><th>Papel</th><th>Escola</th><th></th></tr></thead><tbody>${[...S.people].sort((a, b) => String(a.role).localeCompare(b.role) || String(a.name).localeCompare(b.name)).slice(0, 200).map(p => `<tr><td>${esc(p.name)}</td><td>${esc(ROLE[p.role] || p.role)}${p.trained ? " · capacitado" : ""}</td><td>${p.school_id ? esc(shortName(schoolName(p.school_id))) : "–"}</td><td class="n">${delBtn("people/" + p.id)}</td></tr>`).join("")}</tbody></table>` : `<p class="note">Ninguém cadastrado.</p>`;
}
$("#cadSeg").innerHTML = [["escolas", "Escolas"], ["turmas", "Turmas"], ["criancas", "Crianças"], ["pessoas", "Pessoas"]].map(([c, t]) => `<button type="button" data-c="${c}" aria-pressed="false">${t}</button>`).join("");
$("#cadSeg").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; cadTab = b.dataset.c; renderCad() });
$("#formEsc").onsubmit = async e => { e.preventDefault(); if (await mut(() => sb.from("schools").insert({ name: $("#eN").value.trim(), ciclo: +$("#eC").value }), "Escola cadastrada.", ["schools"])) $("#eN").value = "" };
$("#formTur").onsubmit = async e => { e.preventDefault(); if (!$("#tS").value) { toast("Cadastre uma escola primeiro."); return } if (await mut(() => sb.from("classes").insert({ school_id: $("#tS").value, name: $("#tN").value.trim(), ano: +$("#tA").value }), "Turma cadastrada.", ["classes"])) $("#tN").value = "" };
$("#formKid").onsubmit = async e => {
  e.preventDefault(); const sid = $("#kS").value, cid = $("#kC").value; if (!sid || !cid) { toast("Escolha escola e turma."); return }
  const si = schoolsSorted().findIndex(s => s.id === sid) + 1, cl = S.classes.filter(c => c.school_id === sid).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))), ti = cl.findIndex(c => c.id === cid) + 1;
  let seq = S.kids.filter(k => k.class_id === cid).length; const q = Math.max(1, Math.min(40, +$("#kQ").value || 1)), rows = [];
  for (let i = 0; i < q; i++) { seq++; rows.push({ code: `E${String(si).padStart(2, "0")}-T${ti}-${String(seq).padStart(3, "0")}`, class_id: cid, school_id: sid, consent: $("#kA").checked }) }
  await mut(() => sb.from("kids").insert(rows), `${q} código(s) gerado(s).`, ["kids"]);
};
$("#formPes").onsubmit = async e => { e.preventDefault(); if (await mut(() => sb.from("people").insert({ name: $("#pN").value.trim(), role: $("#pR").value, school_id: $("#pS").value || null, trained: $("#pT").checked }), "Pessoa cadastrada.", ["people"])) $("#pN").value = "" };

document.addEventListener("click", e => {
  const b = e.target.closest("[data-del]");
  if (b) {
    if (b.dataset.armed) {
      const [t, id] = b.dataset.del.split("/");
      mut(async () => {
        if (t === "media") { const m = S.media.find(x => x.id === id); if (m) await sb.storage.from("midia").remove([m.path]) }
        return sb.from(t).delete().eq("id", id)
      }, "Excluído.", [t]);
    } else { b.dataset.armed = "1"; b.textContent = "Confirmar"; b.style.color = "var(--crit)"; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = "Excluir"; b.style.color = "" } }, 3000) }
    return;
  }
  const cp = e.target.closest("[data-copy]"); if (cp) { navigator.clipboard.writeText(cp.dataset.copy).then(() => toast("Link copiado."), () => toast("Não foi possível copiar. Use o botão de e-mail ou WhatsApp.")); return }
  const g = e.target.closest("[data-go]"); if (g) setTab(g.dataset.go);
  const sd = e.target.closest("[data-seed]"); if (sd) seedExamples(sd);
  const rm = e.target.closest("[data-unseed]"); if (rm) unseed(rm);
  if (e.target.closest("[data-logout]")) sb.auth.signOut();
});

/* ---------- campo: oficinas e mídia ---------- */
$("#fD").value = new Date().toISOString().slice(0, 10);
$("#fC").addEventListener("change", () => { const n = S.kids.filter(k => k.class_id === $("#fC").value).length, last = S.sessions.filter(s => s.class_id === $("#fC").value).sort((a, b) => String(b.date).localeCompare(a.date))[0]; $("#fE").value = last ? last.enrolled : (n || "") });
$("#fSess").onsubmit = async e => {
  e.preventDefault(); if (!$("#fS").value || !$("#fC").value) { toast("Escolha escola e turma."); return }
  const pr = +$("#fP").value, en = +$("#fE").value; if (!(pr >= 0) || !(en > 0) || pr > en || $("#fP").value === "") { toast("Confira presentes e total da turma."); return }
  if (await saveRow("sessions", { school_id: $("#fS").value, class_id: $("#fC").value, ws: +$("#fW").value, date: $("#fD").value, present: pr, enrolled: en, notes: $("#fN").value.trim() }, "Oficina registrada.")) { $("#fP").value = ""; $("#fN").value = "" }
};
function renderCampo() {
  const l = [...S.sessions].sort((a, b) => String(b.date).localeCompare(a.date) || String(b.created_at).localeCompare(a.created_at)).slice(0, 10);
  $("#sessList").innerHTML = l.length ? `<table class="tbl"><thead><tr><th>Data</th><th>Escola e turma</th><th>Oficina</th><th class="n">Presença</th><th></th></tr></thead><tbody>${l.map(s => `<tr><td>${esc(s.date)}</td><td>${esc(shortName(schoolName(s.school_id)))} · ${esc(className(s.class_id))}</td><td>${esc(s.ws)}</td><td class="n">${esc(s.present)}/${esc(s.enrolled)}</td><td class="n">${delBtn("sessions/" + s.id)}</td></tr>`).join("")}</tbody></table>` : `<p class="note">Nenhuma oficina registrada ainda.</p>`;
  const md = [...S.media].sort((a, b) => String(b.created_at).localeCompare(a.created_at));
  $("#galSub").textContent = `${md.length} arquivo(s). ${md.filter(x => !x.authorized).length} sem autorização de imagem.`;
  $("#gallery").innerHTML = md.length ? `<div class="gallery">${md.slice(0, 36).map(x => { const u = S.urls[x.path]; return `<div class="ph">${!u ? "" : x.kind === "video" ? `<video src="${esc(u)}" controls preload="metadata" playsinline></video>` : `<img src="${esc(u)}" alt="${esc(x.caption || "Registro da oficina")}" loading="lazy">`}${x.authorized ? "" : `<span class="chip warn">Sem autorização</span>`}<div class="cap">${esc(x.caption || "")} <span class="note">${esc(shortName(schoolName(x.school_id)))} · of. ${esc(x.ws ?? "")}</span><div style="margin-top:4px">${delBtn("media/" + x.id)}</div></div></div>` }).join("")}</div>` : `<p class="note">As fotos e vídeos enviados aparecem aqui.</p>`;
}
let picked = [];
function showPicked() { $("#mPicked").textContent = picked.length ? `${picked.length} arquivo(s) pronto(s) para enviar.` : "Nenhum arquivo escolhido." }
["mCam", "mFile"].forEach(id => $("#" + id).addEventListener("change", e => { picked = picked.concat([...e.target.files]); e.target.value = ""; showPicked() }));
async function shrink(file) {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.82)); return blob && blob.size < file.size ? blob : file;
  } catch (_) { return file }
}
$("#mBtn").onclick = async () => {
  if (!can.write) { toast("Seu perfil só permite consultar."); return }
  const files = picked.slice(); if (!files.length) { toast("Escolha ao menos um arquivo."); return } if (!$("#fS").value) { toast("Escolha a escola."); return }
  $("#mBtn").disabled = true; let ok = 0;
  for (const f of files) {
    $("#mNote").textContent = `Enviando ${ok + 1} de ${files.length}…`;
    if (f.size > 50 * 1024 * 1024) { toast(`${f.name}: acima de 50 MB. Grave um clipe mais curto.`); continue }
    const blob = await shrink(f), isVid = f.type.startsWith("video"), ext = isVid ? ((f.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4") : (blob === f ? ((f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg") : "jpg");
    const path = `${$("#fS").value}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const row = { path, kind: isVid ? "video" : "image", school_id: $("#fS").value, class_id: $("#fC").value || null, ws: +$("#fW").value, caption: $("#mCap").value.trim(), authorized: $("#mAuth").checked, date: $("#fD").value || null };
    if (await saveRow("media", row, null, { path, blob, type: blob.type || f.type })) ok++;
  }
  picked = []; showPicked(); $("#mCap").value = ""; $("#mBtn").disabled = false; $("#mNote").textContent = ""; if (ok) toast(`${ok} arquivo(s) enviado(s).`);
};

/* ---------- avaliações ---------- */
function renderAval() {
  const el = $("#avalTable"), cid = $("#aC").value;
  if (el.contains(document.activeElement) && document.activeElement.tagName === "INPUT") { el.dataset.pending = "1"; return }
  delete el.dataset.pending;
  if (!cid) { el.innerHTML = `<p class="note">Escolha escola e turma para lançar as notas.</p>`; return }
  const ks = S.kids.filter(k => k.class_id === cid).sort((a, b) => String(a.code).localeCompare(b.code));
  const v = x => x == null ? "" : String(+x).replace(".", ",");
  el.innerHTML = ks.length ? `<table class="tbl"><thead><tr><th>Código</th><th class="n">Pré</th><th class="n">Pós</th></tr></thead><tbody>${ks.map(k => `<tr><td class="code">${esc(k.code)}</td><td class="n"><input class="score" data-k="${esc(k.id)}" data-f="pre" type="text" inputmode="decimal" value="${v(k.pre)}" aria-label="Pré-teste ${esc(k.code)}" ${can.write ? "" : "disabled"}></td><td class="n"><input class="score" data-k="${esc(k.id)}" data-f="pos" type="text" inputmode="decimal" value="${v(k.pos)}" aria-label="Pós-teste ${esc(k.code)}" ${can.write ? "" : "disabled"}></td></tr>`).join("")}</tbody></table>` : `<p class="note">Esta turma ainda não tem crianças cadastradas.</p>`;
}
$("#avalTable").addEventListener("change", async e => {
  const i = e.target.closest("input.score"); if (!i) return; const k = S.kids.find(x => x.id === i.dataset.k); if (!k) return;
  const raw = i.value.trim().replace(",", "."); let val = null;
  if (raw !== "") { val = parseFloat(raw); if (!(val >= 0 && val <= 10)) { toast("Use uma nota de 0 a 10."); i.value = k[i.dataset.f] == null ? "" : String(+k[i.dataset.f]).replace(".", ","); return } val = Math.round(val * 100) / 100 }
  const ok = await mut(() => sb.from("kids").update({ [i.dataset.f]: val }).eq("id", k.id));
  if (ok) { k[i.dataset.f] = val; i.style.outline = "2px solid var(--good)"; setTimeout(() => { if (i.isConnected) i.style.outline = "" }, 700) }
});
$("#avalTable").addEventListener("focusout", () => setTimeout(() => { const el = $("#avalTable"); if (el.dataset.pending && !el.contains(document.activeElement)) renderAval() }, 50));
$("#faces").innerHTML = [["😞", 1, "Muito ruim"], ["😕", 2, "Ruim"], ["😐", 3, "Regular"], ["🙂", 4, "Bom"], ["😄", 5, "Ótimo"]].map(f => `<button type="button" data-r="${f[1]}" aria-label="${f[2]}">${f[0]}</button>`).join("");
$("#faces").addEventListener("click", async e => { const b = e.target.closest("button"); if (!b) return; if (await saveRow("surveys", { source: $("#sSrc").value, rating: +b.dataset.r, school_id: $("#sS").value || null })) $("#sNote").textContent = `Registrado: ${b.getAttribute("aria-label")}. Total de respostas: ${S.surveys.length}.` });
function cfg(k, id) { $("#" + id).onchange = e => mut(() => sb.from("config").upsert({ id: 1, kit: k === "kit" ? e.target.checked : !!S.config.kit, cartilha: k === "cartilha" ? e.target.checked : !!S.config.cartilha }), null, []).then(async ok => { if (ok) { const c = await sb.from("config").select("*").eq("id", 1).maybeSingle(); S.config = c.data || {}; renderAll() } }) }
cfg("kit", "cfKit"); cfg("cartilha", "cfCart");

/* ---------- equipe e convites ---------- */
const inviteUrl = t => location.origin + location.pathname + "?convite=" + t;
const inviteText = i => `Olá! Você foi convidado(a) para o Observatório do projeto Educação Financeira Infantil (IF Goiano, Rio Verde) como ${PAPEL[i.papel]}.\n\nPara criar sua conta, abra este link (vale por 7 dias):\n${inviteUrl(i.token)}`;
const mailHref = i => `mailto:${i.email}?subject=${encodeURIComponent("Convite para o Observatório EFI")}&body=${encodeURIComponent(inviteText(i))}`;
const waHref = i => `https://wa.me/?text=${encodeURIComponent(inviteText(i))}`;
function inviteStatus(i) { return i.used_at ? ["Aceito", "good"] : new Date(i.expires_at) < new Date() ? ["Vencido", "none"] : ["Aguardando", "warn"] }
function inviteActions(i) { return `<div class="inv-actions"><a class="btn sm" href="${esc(mailHref(i))}">Enviar por e-mail</a><a class="btn ghost sm" href="${esc(waHref(i))}" target="_blank" rel="noopener">WhatsApp</a><button type="button" class="btn ghost sm" data-copy="${esc(inviteUrl(i.token))}">Copiar link</button></div>` }
function renderEquipe() {
  setOpts($("#ivR"), (can.admin ? ["coordenador", "extensionista", "parceiro"] : ["extensionista", "parceiro"]).map(p => ({ v: p, t: PAPEL[p] })));
  const inv = [...S.invites].sort((a, b) => String(b.created_at).localeCompare(a.created_at));
  $("#inviteList").innerHTML = inv.length ? `<table class="tbl"><thead><tr><th>E-mail</th><th>Categoria</th><th>Situação</th><th></th></tr></thead><tbody>${inv.map(i => { const st = inviteStatus(i); return `<tr><td style="word-break:break-all">${esc(i.email)}</td><td>${esc(PAPEL[i.papel] || i.papel)}</td><td><span class="chip ${st[1]}">${st[0]}</span></td><td>${st[0] === "Aguardando" ? inviteActions(i) : ""} ${delBtn("invites/" + i.id)}</td></tr>` }).join("")}</tbody></table>` : `<p class="note">Nenhum convite criado ainda.</p>`;
  $("#teamCard").hidden = !can.admin;
  if (!can.admin) return;
  const el = $("#equipeList");
  if (el.contains(document.activeElement) && document.activeElement.tagName === "SELECT") return;
  el.innerHTML = S.team.length ? `<table class="tbl"><thead><tr><th>Nome</th><th>E-mail</th><th>Categoria</th><th>Situação</th></tr></thead><tbody>${S.team.map(t => `<tr><td>${esc(t.nome || "–")}</td><td style="word-break:break-all">${esc(t.email)}</td><td><select data-tid="${esc(t.id)}" data-tf="papel" ${t.id === me.id ? "disabled" : ""}>${Object.keys(PAPEL).map(p => `<option value="${p}" ${t.papel === p ? "selected" : ""}>${PAPEL[p]}</option>`).join("")}</select></td><td><select data-tid="${esc(t.id)}" data-tf="status" ${t.id === me.id ? "disabled" : ""}>${[["pendente", "Pendente"], ["ativo", "Ativo"], ["bloqueado", "Bloqueado"]].map(([v, l]) => `<option value="${v}" ${t.status === v ? "selected" : ""}>${l}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table>` : `<p class="note">Ninguém cadastrado ainda.</p>`;
}
$("#inviteForm").addEventListener("submit", async e => {
  e.preventDefault(); const email = $("#ivE").value.trim().toLowerCase(); if (!email) return;
  const { data, error } = await sb.from("invites").insert({ email, papel: $("#ivR").value }).select().single();
  if (error) { toast(errMsg(error)); return }
  $("#ivE").value = ""; S.invites.push(data);
  $("#inviteResult").innerHTML = `<div class="msg ok" style="margin:0">Convite criado para ${esc(data.email)} como ${esc(PAPEL[data.papel])}. Envie o link agora:<div style="margin-top:8px">${inviteActions(data)}</div></div>`;
  renderAll();
});
$("#equipeList").addEventListener("change", async e => {
  const s = e.target.closest("select[data-tid]"); if (!s || !can.admin) return;
  const { error } = await sb.from("profiles").update({ [s.dataset.tf]: s.value }).eq("id", s.dataset.tid);
  if (error) { toast(errMsg(error)); return } toast("Acesso atualizado."); const t = await sb.from("profiles").select("*").order("created_at", { ascending: true }); S.team = t.data || []; renderAll();
});

/* ---------- navegação ---------- */
function tabsFor() {
  const all = [["painel", "Painel"], ["campo", "Campo"], ["cad", "Cadastros"], ["aval", "Avaliações"], ["analise", "Análise"], ["info", "Infográfico"]];
  const list = profile && profile.papel === "parceiro" ? all.filter(t => ["painel", "analise", "info"].includes(t[0])) : all;
  return can.manage ? list.concat([["equipe", "Equipe"]]) : list;
}
function buildTabs() {
  const pend = S.team.filter(t => t.status === "pendente").length;
  $("#tabs").innerHTML = tabsFor().map(([k, t]) => `<button role="tab" data-t="${k}" aria-selected="${k === tab}">${t}${k === "equipe" && pend ? `<span class="badge">${pend}</span>` : ""}</button>`).join("");
}
$("#tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) setTab(b.dataset.t) });
function setTab(t) {
  if (!tabsFor().some(x => x[0] === t)) t = "painel"; tab = t; try { localStorage.setItem("efi-tab", t) } catch (_) { }
  ["painel", "campo", "cad", "aval", "analise", "info", "equipe"].forEach(k => { $("#v-" + k).hidden = k !== t });
  renderAll(); scrollTo(0, 0);
}
let raf = 0; function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderAll() }) }
function renderAll() {
  if (!profile || $("#app").hidden) return;
  document.body.classList.toggle("ro-hide", !can.manage);
  $$(".wonly").forEach(el => { if (el.closest("#v-aval") && !can.manage) el.hidden = true; else if (!el.closest("#v-aval")) el.hidden = !can.manage; else el.hidden = false });
  $("#whoami").textContent = `${profile.nome || profile.email} · ${PAPEL[profile.papel]}`;
  buildTabs(); refreshSelects();
  $("#cfKit").checked = !!S.config.kit; $("#cfCart").checked = !!S.config.cartilha;
  const ex = TABLES.some(c => S[c].some(d => d.ex));
  $("#banners").innerHTML = (ex ? `<div class="banner info"><span>Você está vendo dados de exemplo. Eles servem só para testar o painel.</span>${can.admin ? '<button class="btn sm" data-unseed="1">Remover exemplos</button>' : ""}</div>` : "") + (!can.write ? `<div class="banner ro">Seu perfil permite apenas consultar o painel.</div>` : "");
  if (tab === "painel") renderPainel(); else if (tab === "campo") renderCampo(); else if (tab === "cad") renderCad(); else if (tab === "aval") renderAval(); else if (tab === "analise") renderAnalise(); else if (tab === "info") renderInfo(); else if (tab === "equipe") renderEquipe();
}
/* ---------- exemplos (administrador) ---------- */
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
async function seedExamples(btn) {
  if (!can.admin) return; btn.disabled = true; btn.textContent = "Carregando…"; const r = rng(11), id = () => crypto.randomUUID();
  const norm = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) };
  const schools = [], classes = [], kids = [], people = [], sessions = [], surveys = [];
  for (let i = 1; i <= 10; i++) schools.push({ id: id(), name: `Escola Exemplo ${String(i).padStart(2, "0")}`, ciclo: i <= 5 ? 1 : 2, ex: true });
  schools.forEach((s, i) => ["4º A", "4º B", "5º A"].forEach((n, j) => {
    const c = { id: id(), school_id: s.id, name: n, ano: j < 2 ? 4 : 5, ex: true }; classes.push(c);
    for (let k = 1; k <= 4; k++) { const d = { id: id(), code: `X${String(i + 1).padStart(2, "0")}-T${j + 1}-${String(k).padStart(3, "0")}`, class_id: c.id, school_id: s.id, consent: true, ex: true }; if (i < 5) { const pre = Math.max(0, Math.min(10, Math.round((4.4 + 1.4 * norm()) * 2) / 2)); d.pre = pre; d.pos = Math.max(0, Math.min(10, Math.round((pre + 2.1 + 1.1 * norm()) * 2) / 2)) } kids.push(d) }
    if (i < 5) for (let w = 1; w <= 2; w++) { const en = 24 + Math.floor(r() * 6); sessions.push({ id: id(), school_id: s.id, class_id: c.id, ws: w, date: `2026-0${4 + w}-${String(8 + i * 2 + j).padStart(2, "0")}`, present: Math.max(10, en - Math.floor(r() * 5)), enrolled: en, notes: "", ex: true }) }
  }));
  let pi = 0; [["professor", 14], ["familia", 30], ["extensionista", 8], ["voluntario", 4]].forEach(([role, n]) => { for (let k = 1; k <= n; k++) { pi++; people.push({ id: id(), name: `${ROLE[role]} exemplo ${k}`, role, school_id: (role === "professor" || role === "familia") ? schools[k % 10].id : null, trained: role === "professor" && k <= 8, ex: true }) } });
  for (let k = 1; k <= 30; k++) { const x = r(); surveys.push({ id: id(), source: ["crianca", "professor", "familia"][k % 3], rating: x < .05 ? 2 : x < .15 ? 3 : x < .5 ? 4 : 5, school_id: schools[k % 5].id, ex: true }) }
  try { for (const [t, rows] of [["schools", schools], ["classes", classes], ["kids", kids], ["people", people], ["sessions", sessions], ["surveys", surveys]]) { const { error } = await sb.from(t).insert(rows); if (error) throw error } toast("Dados de exemplo carregados.") } catch (e) { toast(errMsg(e)) }
  await reload();
}
async function unseed(btn) {
  if (!can.admin) return; btn.disabled = true; btn.textContent = "Removendo…";
  try { for (const t of ["sessions", "surveys", "kids", "people", "classes", "schools"]) { const { error } = await sb.from(t).delete().eq("ex", true); if (error) throw error } toast("Exemplos removidos.") } catch (e) { toast(errMsg(e)) }
  await reload();
}

/* ---------- autenticação (acesso por convite) ---------- */
const show = id => ["auth", "recover", "pending", "app"].forEach(x => { $("#" + x).hidden = x !== id });
let invite = null;
function authMsg(t, kind) { const m = $("#auMsg"); m.hidden = !t; m.textContent = t || ""; m.className = "msg " + (kind || "err") }
async function initInvite() {
  const tok = new URLSearchParams(location.search).get("convite"); if (!tok) return;
  const { data, error } = await sb.rpc("invite_info", { p_token: tok });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) { authMsg("Este convite é inválido, venceu ou já foi usado. Peça um novo ao coordenador."); return }
  invite = { token: tok, email: row.email, papel: row.papel };
  $("#auE").value = row.email; $("#auE").readOnly = true; $("#nomeWrap").hidden = false; $("#passHint").hidden = false;
  $("#auP").autocomplete = "new-password"; $("#auBtn").textContent = "Criar minha conta"; $("#auForgot").hidden = true; $("#auNote").hidden = true;
  const b = $("#invBanner"); b.hidden = false; b.textContent = `Você foi convidado(a) como ${PAPEL[row.papel]}. Informe seu nome e crie uma senha.`;
}
$("#authForm").addEventListener("submit", async e => {
  e.preventDefault(); authMsg(""); const email = $("#auE").value.trim(), pass = $("#auP").value;
  if (!email || !pass) { authMsg("Preencha e-mail e senha."); return }
  $("#auBtn").disabled = true;
  try {
    if (invite) {
      if (pass.length < 8) throw new Error("Password should be at least 8 characters");
      if (!$("#auN").value.trim()) throw new Error("Informe seu nome.");
      const { data, error } = await sb.auth.signUp({ email: invite.email, password: pass, options: { data: { nome: $("#auN").value.trim(), invite: invite.token } } });
      if (error) throw error;
      history.replaceState(null, "", location.pathname);
      if (!data.session) authMsg("Conta criada. Agora toque em Entrar com seu e-mail e senha. Se pedir confirmação de e-mail, avise o administrador.", "ok");
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password: pass }); if (error) throw error;
    }
  } catch (err) { authMsg(errMsg(err)) }
  $("#auBtn").disabled = false;
});
$("#auForgot").onclick = async () => {
  const email = $("#auE").value.trim(); if (!email) { authMsg("Digite seu e-mail e toque de novo em Esqueci minha senha."); return }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  authMsg(error ? errMsg(error) : "Se este e-mail tiver cadastro, enviamos um link para criar uma nova senha.", error ? "err" : "ok");
};
$("#recForm").addEventListener("submit", async e => {
  e.preventDefault(); const m = $("#rcMsg"); const { error } = await sb.auth.updateUser({ password: $("#rcP").value });
  m.hidden = false; m.className = "msg " + (error ? "err" : "ok"); m.textContent = error ? errMsg(error) : "Senha atualizada. Entrando…";
  if (!error) setTimeout(() => route(true), 800);
});
$("#pendRefresh").onclick = () => route(true);

async function route(force) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { me = null; profile = null; curUid = null; loaded = false; show("auth"); return }
  if (!force && curUid === session.user.id && profile && profile.status === "ativo" && loaded) return;
  curUid = session.user.id; me = session.user;
  const { data: p } = await sb.from("profiles").select("*").eq("id", me.id).maybeSingle();
  profile = p;
  if (!p || p.status === "pendente") { $("#pendTitle").textContent = "Cadastro recebido"; $("#pendTxt").textContent = "O administrador precisa aprovar seu acesso. Assim que isso acontecer, toque em Verificar de novo."; show("pending"); return }
  if (p.status === "bloqueado") { $("#pendTitle").textContent = "Acesso bloqueado"; $("#pendTxt").textContent = "Fale com o administrador do projeto."; show("pending"); return }
  show("app");
  let t0 = "painel"; try { t0 = localStorage.getItem("efi-tab") || "painel" } catch (_) { }
  try { await loadAll() } catch (e) { toast(errMsg(e)) }
  setTab(t0); updateSync(); flushQueue();
}
sb.auth.onAuthStateChange((ev, s) => {
  if (ev === "PASSWORD_RECOVERY") { show("recover"); return }
  if (ev === "SIGNED_OUT") { route(true); return }
  if (ev === "SIGNED_IN") setTimeout(() => route(false), 0);
});
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => { }));
(async () => { try { await initInvite() } catch (_) { } route(false) })();
