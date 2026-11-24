/* Finanzas Casimiro: lógica de la página.
   Datos en Supabase (tabla movimientos), acceso con mail y contraseña,
   dictado con el reconocimiento de voz del navegador e interpretación con Claude
   a través de la función "interpretar" de Supabase. */
{
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = new Intl.NumberFormat('es-AR', {style:'currency', currency:'ARS', maximumFractionDigits:0});
const money = n => fmt.format(Math.round(n || 0));
const compact = n => { const a = Math.abs(n), s = n < 0 ? '-' : ''; return a >= 1e6 ? s + (a/1e6).toLocaleString('es-AR',{maximumFractionDigits:1}) + ' M' : a >= 1e3 ? s + Math.round(a/1e3) + ' mil' : s + Math.round(a); };
const BOOK = {n:'Casimiro', f:'Franche', p:'Patri'};
const TIPO = {venta:'Venta', alquiler:'Alquiler de traje', fijo:'Gasto fijo', variable:'Gasto variable', cheque:'Cheque',
  sueldo:'Sueldo o ingreso', gasto:'Gasto', ahorro:'Ahorro', puse:'Puso en Casimiro', devolvio:'Le devolvió Casimiro'};
const NEG = ['venta','alquiler','fijo','variable','cheque'], PER = ['sueldo','gasto','ahorro','puse','devolvio'];
const LT = {n: NEG.map(t => ['n|'+t, TIPO[t]]), f: PER.map(t => ['f|'+t, TIPO[t]]), p: PER.map(t => ['p|'+t, TIPO[t]])};
const LTV = Object.values(LT).flat().map(x => x[0]);
const PAGOS = ['Efectivo','Tarjeta','Transferencia','Otro'];
const RUBROS = ['Comida','Casa y servicios','Tarjetas y créditos','Salud','Auto y transporte','Ropa y cuidado','Salidas y regalos','Fiestas','Cursos','Suscripciones','Inversiones','Otros'];
const RX = [['Fiestas',/fiesta|\bdj\b|salon|picada|bebida|torta|chorizo|sonido|deco/],['Tarjetas y créditos',/visa|master|tarjeta|credit|prestamo|cuota casa|bancario/],
  ['Auto y transporte',/nafta|gasoil|combustible|taller|lavado auto|remis|pasaje|bicicleta/],['Comida',/comida|verdu|carnic|carne|pollo|chino|pizza|pasta|chipa|pastel|hamburg|salame|comestible/],
  ['Casa y servicios',/\bluz\b|\bgas\b|gasnea|\bagua\b|rosa|limpieza|pasto|imp muni|ferreteria|cortina|varios casa|casa varios|telef|plancha/],
  ['Salud',/farmacia|odont|nutri|derma|endocr|periodon|optica|lentes|\brx\b|sancor|\bgim|gym|veterin|cosmiatr|medic/],
  ['Ropa y cuidado',/ropa|zapato|bota|campera|remera|chaleco|reloj|peluquer|crema|gilette/],['Salidas y regalos',/regalo|salida|cerveza|teatro|quiniela|rifa|finde|asado|helado|rural|flores|mate/],
  ['Cursos',/curso|ingles|libro|musica|velas/],['Suscripciones',/claude|chatgpt|disney|netflix|spotify/],['Inversiones',/balanz|inversion/]];
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const rubro = i => i.c || (RX.find(([, r]) => r.test(norm(i.d))) || ['Otros'])[0];
const MES = new Intl.DateTimeFormat('es-AR', {month:'long', year:'numeric', timeZone:'UTC'});
const MESL = new Intl.DateTimeFormat('es-AR', {month:'long', timeZone:'UTC'});
const MESC = new Intl.DateTimeFormat('es-AR', {month:'short', timeZone:'UTC'});
const pad = n => String(n).padStart(2,'0');
const today = () => { const d = new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); };
const addM = (mk, k) => { let [y,m] = mk.split('-').map(Number); m += k; while (m > 12) {m -= 12; y++;} while (m < 1) {m += 12; y--;} return y+'-'+pad(m); };
const mDate = mk => new Date(Date.UTC(+mk.slice(0,4), +mk.slice(5,7)-1, 1));
const capf = t => t.charAt(0).toUpperCase() + t.slice(1);
const mlong = mk => capf(MES.format(mDate(mk)).replace(' de ', ' '));
const mshort = mk => MESC.format(mDate(mk)).replace('.', '');
const dm = f => f ? f.slice(8,10)+'/'+f.slice(5,7) : '';
const parseMonto = v => { let s = String(v ?? '').replace(/[^\d,.\-]/g,''); if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g,'').replace(',','.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g,''); return parseFloat(s); };
const newId = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const touch = matchMedia('(pointer:coarse)').matches;

let sb = null, me = null, all = [], channel = null;
let tab = ({'#franche':'f','#patri':'p'})[location.hash] || 'n', sel = today().slice(0,7), chip = 'all', showAll = false;
let rev = [], listening = false, heard = false, rec = null, lastUndo = null, repItems = null;
const who = () => me ? me.libro : 'f';

/* ---------- acceso ---------- */
const cfg = window.CONFIG || {};
function showLogin(msg) { $('#app').hidden = true; $('#login').hidden = false; $('#loginerr').textContent = msg || ''; }
async function boot() {
  if (!cfg.SUPABASE_URL || /TU-PROYECTO/.test(cfg.SUPABASE_URL) || !cfg.SUPABASE_KEY || /TU-CLAVE/.test(cfg.SUPABASE_KEY)) {
    showLogin(); $('#loginsub').textContent = 'Falta configurar la conexión: completá config.js con los datos de Supabase (paso 3 de la guía).';
    $('#enter').disabled = true; return; }
  if (!window.supabase) { showLogin('No se pudo cargar la conexión. Revisá tu internet y recargá la página.'); return; }
  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {auth: {persistSession: true, autoRefreshToken: true}});
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { stopLive(); me = null; all = []; showLogin(); } });
  const { data } = await sb.auth.getSession();
  if (data && data.session) start(); else showLogin();
}
async function start() {
  const { data, error } = await sb.from('miembros').select('nombre,libro').maybeSingle();
  if (error || !data) { await sb.auth.signOut(); showLogin('Tu usuario existe pero no está habilitado. Revisá que tu mail esté en la tabla "miembros" (paso 1 de la guía).'); return; }
  me = data; $('#hola').textContent = 'Hola, ' + data.nombre;
  $('#login').hidden = true; $('#app').hidden = false;
  render(); await load(); startLive();
}
$('#loginform').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#email').value.trim(), password = $('#pass').value;
  if (!email || !password) { $('#loginerr').textContent = 'Completá el mail y la contraseña.'; return; }
  $('#enter').disabled = true; $('#loginerr').textContent = '';
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) $('#loginerr').textContent = /invalid/i.test(error.message) ? 'El mail o la contraseña no coinciden.' : 'No se pudo entrar: ' + error.message;
    else { $('#pass').value = ''; await start(); }
  } catch (err) { $('#loginerr').textContent = 'No se pudo conectar. Revisá tu internet.'; }
  finally { $('#enter').disabled = false; }
});
$('#salir').onclick = () => sb.auth.signOut();

/* ---------- datos ---------- */
const COLS = 'id,fecha,libro,tipo,monto,detalle,pago,rubro,origen,nota';
async function load() {
  $('#load').textContent = all.length ? '' : 'Cargando datos…';
  try {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('movimientos').select(COLS).order('fecha').order('id').range(from, from + 999);
      if (error) throw error;
      rows.push(...data); if (data.length < 1000) break;
    }
    all = rows.map(r => ({id:r.id, f:String(r.fecha).slice(0,10), b:r.libro, t:r.tipo, m:Number(r.monto) || 0, miss:r.monto == null,
      d:r.detalle || '', p:r.pago || '', c:r.rubro || '', s:r.origen || '', x:r.nota || ''}));
    $('#load').textContent = '';
  } catch (e) { $('#load').textContent = 'No se pudieron leer los datos. Revisá tu internet y recargá la página.'; }
  render();
}
let liveT = 0;
function startLive() {
  stopLive();
  channel = sb.channel('movimientos').on('postgres_changes', {event:'*', schema:'public', table:'movimientos'}, () => { clearTimeout(liveT); liveT = setTimeout(load, 500); }).subscribe();
}
function stopLive() { if (channel) { sb.removeChannel(channel); channel = null; } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && me) load(); });
const toRow = (id, it) => ({id, fecha:it.f, libro:it.b, tipo:it.t, monto:it.m, detalle:it.d || '', pago:it.p || '', rubro:it.c || '', origen:it.s || '', nota:it.x || ''});
async function upsert(rows, ignore) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from('movimientos').upsert(rows.slice(i, i + 500), {onConflict:'id', ignoreDuplicates: !!ignore});
    if (error) throw error;
  }
}
function dbErr(e) {
  const m = String(e && (e.message || e.code) || '');
  if (/row-level security|permission|42501/i.test(m)) return 'No se guardó: tu usuario no tiene permiso. Revisá la tabla "miembros" en Supabase.';
  if (/JWT|session/i.test(m)) return 'Se cerró la sesión. Volvé a entrar.';
  return 'No se guardó por un problema de conexión. Probá de nuevo en un momento.';
}

/* ---------- cálculos ---------- */
const inM = (i, mk) => i.f.slice(0,7) === mk;
function sums(b, mk) {
  const r = {pagos:{}}, list = all.filter(i => i.b === b && inM(i, mk));
  for (const i of list) { r[i.t] = (r[i.t]||0) + i.m; if (i.t === 'venta') r.pagos[i.p || 'Sin dato'] = (r.pagos[i.p || 'Sin dato']||0) + i.m; }
  const v = k => r[k] || 0;
  if (b === 'n') { r.ing = v('venta') + v('alquiler'); r.gas = v('fijo') + v('variable') + v('cheque'); r.res = r.ing - r.gas; }
  else { r.ing = v('sueldo'); r.gas = v('gasto'); r.res = r.ing - r.gas - v('puse') + v('devolvio'); }
  r.v = v; r.list = list; return r;
}
const owed = (b, mk) => all.filter(i => i.b === b && i.f.slice(0,7) <= mk).reduce((a,i) => a + (i.t === 'puse' ? i.m : i.t === 'devolvio' ? -i.m : 0), 0);

/* ---------- tablero ---------- */
const kpi = (l, v, d, cls='') => `<div class="kpi ${cls}"><div class="l">${l}</div><div class="v ${v < 0 ? 'neg' : ''}">${esc(money(v))}</div><div class="d">${d}</div></div>`;
function delta(a, b) { if (!b) return '&nbsp;'; const pc = Math.round((a - b) / Math.abs(b) * 100);
  return `${pc >= 0 ? '▲' : '▼'} ${Math.abs(pc)}% contra ${esc(MESL.format(mDate(addM(sel,-1))))}`; }
function bar(label, v, total, color) { const w = total ? Math.max(0, Math.min(100, v / total * 100)) : 0;
  return `<div class="bar"><span>${esc(label)}</span><span class="t"><i style="width:${w.toFixed(1)}%;background:${color}"></i></span><span class="n">${esc(money(v))}</span></div>`; }
function render() {
  $$('#tabs button').forEach(b => { const on = b.dataset.b === tab; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
  $('#main').setAttribute('aria-labelledby', 't-' + tab);
  $('#asklab').textContent = tab === 'n' ? '¿Qué pasó en Casimiro?' : `¿Qué gastó o cobró ${BOOK[tab]}?`;
  $('#txt').placeholder = tab === 'n' ? 'Ej.: pagué la luz del local, 74 mil por transferencia. Alquilé un traje, 80 lucas en efectivo.'
    : 'Ej.: cobré el sueldo, 1.500.000. Super 45 mil con tarjeta. Puse 200 mil para el cheque de Idrogeno.';
  $('#mname').textContent = mlong(sel);
  const s = sums(tab, sel), pr = sums(tab, addM(sel,-1));
  if (tab === 'n') {
    const hoy = today(), pend = all.filter(i => i.t === 'cheque' && i.f >= hoy).reduce((a,i) => a + i.m, 0);
    $('#kpis').innerHTML = kpi('Entró: ventas y alquileres', s.ing, delta(s.ing, pr.ing)) + kpi('Salió: gastos y cheques', s.gas, delta(s.gas, pr.gas))
      + kpi('Quedó en el mes', s.res, delta(s.res, pr.res), 'hero') + kpi('Cheques por pagar desde hoy', pend, 'Todos los cargados a futuro');
  } else {
    $('#kpis').innerHTML = kpi('Entró: sueldo e ingresos', s.ing, delta(s.ing, pr.ing)) + kpi('Salió: gastos', s.gas, delta(s.gas, pr.gas))
      + kpi('Quedó en el mes', s.res, 'Descuenta lo que puso en Casimiro', 'hero') + kpi(`Casimiro le debe a ${BOOK[tab]}`, owed(tab, sel), 'Acumulado hasta este mes');
  }
  $('#legend').innerHTML = `<span><i class="key" style="background:var(--in)"></i>${tab === 'n' ? 'Entró' : 'Sueldo e ingresos'}</span><span><i class="key" style="background:var(--out)"></i>${tab === 'n' ? 'Salió' : 'Gastos'}</span><span><i class="key line" style="background:var(--ink)"></i>Quedó</span><span>Tocá un mes para verlo</span>`;
  renderCards(s); renderChips(); renderMovs(); draw();
}
function renderCards(s) {
  let h = '';
  if (tab === 'n') {
    const pg = Object.entries(s.pagos).sort((a,b) => b[1]-a[1]);
    h += `<article class="card"><h3>Ventas por forma de pago</h3>${pg.length ? pg.map(([k,v]) => bar(k, v, s.v('venta'), 'var(--in)')).join('') + `<p class="total"><span>Ventas</span><span>${esc(money(s.v('venta')))}</span></p><p class="total" style="font-weight:400;border:0;padding:0;margin:4px 0 0"><span>Alquileres de trajes</span><span>${esc(money(s.v('alquiler')))}</span></p>` : `<p class="empty">No hay ventas cargadas en ${esc(MESL.format(mDate(sel)))}. Subí el reporte del sistema en Herramientas.</p>`}</article>`;
    const big = s.list.filter(i => ['fijo','variable','cheque'].includes(i.t)).sort((a,b) => b.m - a.m).slice(0,5);
    h += `<article class="card"><h3>En qué se fue la plata</h3>${s.gas ? [['Gastos fijos', s.v('fijo')], ['Gastos variables', s.v('variable')], ['Cheques', s.v('cheque')]].map(([k,v]) => bar(k, v, s.gas, 'var(--out)')).join('')
      + `<table class="mini" style="margin-top:10px"><caption class="sr">Los gastos más grandes</caption><tbody>${big.map(i => `<tr><td>${esc(i.d || TIPO[i.t])}</td><td class="num">${esc(money(i.m))}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No hay gastos cargados este mes.</p>'}</article>`;
    const hoy = today(), next = Array.from({length:6}, (_, k) => addM(hoy.slice(0,7), k));
    const tot = next.map(mk => [mk, all.filter(i => i.t === 'cheque' && inM(i, mk) && i.f >= hoy).reduce((a,i) => a + i.m, 0)]), mx = Math.max(1, ...tot.map(t => t[1]));
    h += `<article class="card"><h3>Cheques que vienen</h3>${tot.map(([mk,v]) => bar(capf(mshort(mk)) + ' ' + mk.slice(2,4), v, mx, 'var(--out)')).join('')}${tot.some(t => t[1]) ? '' : '<p class="status">No hay cheques futuros cargados. Dictalos así: "seis cheques de 500 mil a Idrogeno, el primero el 15 de diciembre".</p>'}</article>`;
    h += `<article class="card"><h3>Lo que Casimiro les debe</h3><table class="mini"><thead><tr><th>Quién</th><th class="num">Le debe en total</th></tr></thead><tbody>${['f','p'].map(b => { const q = sums(b, sel);
      return `<tr><td>${BOOK[b]}<span class="note">Este mes puso ${esc(money(q.v('puse')))} y se le devolvió ${esc(money(q.v('devolvio')))}</span></td><td class="num"><strong>${esc(money(owed(b, sel)))}</strong></td></tr>`; }).join('')}</tbody></table><p class="status">Se carga en la libreta de cada una: "puse 200 mil en el local" o "el local me devolvió 100 mil".</p></article>`;
  } else {
    const gs = s.list.filter(i => i.t === 'gasto'), byR = {};
    for (const i of gs) byR[rubro(i)] = (byR[rubro(i)]||0) + i.m;
    const rr = Object.entries(byR).sort((a,b) => b[1]-a[1]), mx = rr.length ? rr[0][1] : 1;
    h += `<article class="card"><h3>Gastos por rubro</h3>${rr.length ? rr.map(([k,v]) => bar(k, v, mx, 'var(--out)')).join('') + `<p class="total"><span>Total gastos</span><span>${esc(money(s.gas))}</span></p>` : `<p class="empty">No hay gastos de ${BOOK[tab]} en ${esc(MESL.format(mDate(sel)))}.</p>`}</article>`;
    const big = gs.slice().sort((a,b) => b.m - a.m).slice(0,6);
    h += `<article class="card"><h3>Los gastos más grandes</h3>${big.length ? `<table class="mini"><tbody>${big.map(i => `<tr><td>${esc(i.d || 'Gasto')}<span class="note">${esc(rubro(i))} · ${esc(dm(i.f))}</span></td><td class="num">${esc(money(i.m))}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Nada para mostrar.</p>'}</article>`;
    h += `<article class="card"><h3>Plata en Casimiro</h3><table class="mini"><tbody><tr><td>Puso este mes</td><td class="num">${esc(money(s.v('puse')))}</td></tr><tr><td>Casimiro le devolvió este mes</td><td class="num">${esc(money(s.v('devolvio')))}</td></tr></tbody></table><p class="total"><span>Casimiro le debe en total</span><span>${esc(money(owed(tab, sel)))}</span></p></article>`;
    const acc = all.filter(i => i.b === tab && i.t === 'ahorro' && i.f.slice(0,7) <= sel).reduce((a,i) => a + i.m, 0);
    h += `<article class="card"><h3>Ahorro</h3><table class="mini"><tbody><tr><td>Ahorró este mes</td><td class="num">${esc(money(s.v('ahorro')))}</td></tr></tbody></table><p class="total"><span>Ahorro anotado hasta este mes</span><span>${esc(money(acc))}</span></p><p class="status">Las compras de dólares sin monto en pesos no suman: completalas en Movimientos.</p></article>`;
  }
  $('#cards').innerHTML = h;
}
function renderChips() {
  const opts = tab === 'n' ? [['all','Todo'],['ing','Ingresos'],['fijo','Fijos'],['variable','Variables'],['cheque','Cheques']] : [['all','Todo'],['sueldo','Ingresos'],['gasto','Gastos'],['otros','Ahorro y Casimiro']];
  if (!opts.some(o => o[0] === chip)) chip = 'all';
  $('#chips').innerHTML = opts.map(([k,l]) => `<button data-c="${k}" aria-pressed="${k === chip}">${l}</button>`).join('');
}
function renderMovs() {
  const f = i => chip === 'all' || i.t === chip || (chip === 'ing' && ['venta','alquiler'].includes(i.t)) || (chip === 'otros' && ['ahorro','puse','devolvio'].includes(i.t));
  const rows = all.filter(i => i.b === tab && inM(i, sel) && f(i)).reverse(), show = showAll ? rows : rows.slice(0, 25);
  $('#movtitle').textContent = `Movimientos de ${MESL.format(mDate(sel))}`;
  $('#more').hidden = rows.length <= 25; $('#more').textContent = showAll ? 'Mostrar menos' : `Ver los ${rows.length} movimientos`;
  $('#movs').innerHTML = show.map(i => `<tr class="${i.miss ? 'miss' : ''}"><td data-l="Fecha">${esc(dm(i.f))}</td><td data-l="Qué">${esc(TIPO[i.t] || i.t)}${tab !== 'n' && i.t === 'gasto' ? ` <span class="tag">${esc(rubro(i))}</span>` : ''}</td>
    <td data-l="Detalle">${esc(i.d)}${i.x ? `<span class="note">${esc(i.x)}</span>` : ''}</td><td data-l="Monto" class="num">${i.miss ? 'Falta el monto' : esc(money(i.m))}</td><td data-l="Pago">${esc(i.p)}</td>
    <td class="rowact"><button class="btn sm" data-ed="${esc(i.id)}" aria-label="Editar ${esc(i.d || TIPO[i.t])}">Editar</button> <button class="btn sm" data-del="${esc(i.id)}" aria-label="Borrar ${esc(i.d || TIPO[i.t])}">Borrar</button></td></tr>`).join('')
    || `<tr><td colspan="6" class="empty">No hay movimientos en ${esc(MESL.format(mDate(sel)))}. Dictá o escribí el primero arriba.</td></tr>`;
}
let chartData = [];
function draw() {
  const s = $('#chart'), W = s.clientWidth, H = s.clientHeight; $('#tip').hidden = true; if (!W || !H) return;
  const mine = all.filter(i => i.b === tab), first = mine.length ? mine[0].f.slice(0,7) : sel, hm = today().slice(0,7);
  const end = addM(sel > hm ? sel : hm, tab === 'n' ? 2 : 0); let start = addM(end, -11);
  if (start < first) start = first; if (start > addM(end, -4)) start = addM(end, -4); if (start > sel) start = sel;
  const ms = []; for (let mk = start; mk <= end; mk = addM(mk, 1)) ms.push(mk);
  chartData = ms.map(mk => ({mk, ...sums(tab, mk)}));
  const narrow = W < 520, pl = narrow ? 40 : 60, pr = 8, pt = 14, pb = 30;
  const raw = Math.max(1, ...chartData.map(d => Math.max(d.ing, d.gas, d.res))), lo0 = Math.min(0, ...chartData.map(d => d.res));
  const step = (() => { const r = (raw - lo0) / 4, p = 10 ** Math.floor(Math.log10(r)), n = r / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; })();
  const hi = Math.ceil(raw / step) * step, lo = Math.floor(lo0 / step) * step;
  const y = v => pt + (hi - v) / (hi - lo) * (H - pt - pb), bw = (W - pl - pr) / ms.length, w = Math.max(4, Math.min(24, bw * .3));
  const col = (x, v, c) => { const h = Math.max(0, y(0) - y(v)), r = Math.min(4, h, w/2); if (!h) return '';
    return `<path d="M${x},${y(0)}V${y(v)+r}Q${x},${y(v)} ${x+r},${y(v)}H${x+w-r}Q${x+w},${y(v)} ${x+w},${y(v)+r}V${y(0)}Z" fill="${c}"/>`; };
  let g = '';
  for (let v = lo; v <= hi + 1; v += step) g += `<line x1="${pl}" x2="${W-pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(${v === 0 ? '--mut' : '--grid'})"/><text x="${pl-8}" y="${y(v)+4}" text-anchor="end" font-size="12" fill="var(--mut)">${esc(compact(v))}</text>`;
  const pts = [];
  chartData.forEach((d, k) => { const x = pl + k * bw, c = x + bw / 2;
    if (d.mk === sel) g += `<rect x="${x+2}" y="${pt}" width="${bw-4}" height="${H-pt-pb}" fill="var(--btint)" rx="6"/>`;
    g += col(c - w - 1, d.ing, 'var(--in)') + col(c + 1, d.gas, 'var(--out)');
    const lab = (narrow ? mshort(d.mk).slice(0,1).toUpperCase() : mshort(d.mk)) + (!narrow && (d.mk.endsWith('-01') || k === 0) ? ' ' + d.mk.slice(2,4) : '');
    g += `<text x="${c}" y="${H-9}" text-anchor="middle" font-size="12" fill="var(${d.mk === sel ? '--ink' : '--mut'})" font-weight="${d.mk === sel ? 700 : 400}">${esc(lab)}</text>`;
    if (d.ing || d.gas) pts.push([c, y(d.res)]); });
  if (pts.length > 1) g += `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  g += pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="4.5" fill="var(--ink)" stroke="var(--bg)" stroke-width="2"/>`).join('');
  chartData.forEach((d, k) => { g += `<rect class="hit" data-k="${k}" x="${pl + k*bw}" y="0" width="${bw}" height="${H}" fill="transparent" tabindex="0" role="button" aria-label="${esc(mlong(d.mk))}: entró ${esc(money(d.ing))}, salió ${esc(money(d.gas))}, quedó ${esc(money(d.res))}" style="cursor:pointer;outline:none"/>`; });
  s.innerHTML = g;
  $('#mtable').innerHTML = `<thead><tr><th>Mes</th><th class="num">Entró</th><th class="num">Salió</th><th class="num">Quedó</th></tr></thead><tbody>${chartData.filter(d => d.ing || d.gas).map(d => `<tr><td>${esc(mlong(d.mk))}</td><td class="num">${esc(money(d.ing))}</td><td class="num">${esc(money(d.gas))}</td><td class="num">${esc(money(d.res))}</td></tr>`).join('')}</tbody>`;
}
function showTip(k) {
  const d = chartData[k], s = $('#chart'), t = $('#tip'); if (!d) { t.hidden = true; return; }
  const bw = (s.clientWidth - (s.clientWidth < 520 ? 48 : 68)) / chartData.length, x = (s.clientWidth < 520 ? 40 : 60) + k * bw + bw / 2;
  t.innerHTML = `<b>${esc(mlong(d.mk))}</b><div><span>${tab === 'n' ? 'Entró' : 'Ingresos'}</span><strong>${esc(money(d.ing))}</strong></div><div><span>${tab === 'n' ? 'Salió' : 'Gastos'}</span><strong>${esc(money(d.gas))}</strong></div><div><span>Quedó</span><strong>${esc(money(d.res))}</strong></div>`;
  t.hidden = false; const tw = t.offsetWidth; t.style.left = Math.max(0, Math.min(s.clientWidth - tw, x + 14 > s.clientWidth - tw ? x - tw - 14 : x + 14)) + 'px'; t.style.top = '8px';
}

/* ---------- carga y revisión ---------- */
const blank = () => ({f: today(), lt: (tab === 'n' ? 'n|variable' : tab + '|gasto'), d:'', m:'', p:'', c:''});
function openReview(list) { rev = list; $('#review').hidden = false; $('#savemsg').textContent = ''; renderRev(); }
function renderRev() {
  if (!rev.length) { $('#review').hidden = true; return; }
  const opt = r => Object.entries(LT).map(([b, l]) => `<optgroup label="${BOOK[b]}">${l.map(([v,t]) => `<option value="${v}" ${v === r.lt ? 'selected' : ''}>${BOOK[b]}: ${t}</option>`).join('')}</optgroup>`).join('');
  $('#revrows').innerHTML = rev.map((r, i) => { const pg = /^[fp]\|gasto$/.test(r.lt); return `<tr>
    <td><input type="date" id="rf${i}" data-i="${i}" data-k="f" value="${esc(r.f)}" aria-label="Fecha"></td>
    <td><select id="rl${i}" data-i="${i}" data-k="lt" aria-label="Dónde va">${opt(r)}</select></td>
    <td><input id="rd${i}" data-i="${i}" data-k="d" value="${esc(r.d)}" placeholder="Detalle" aria-label="Detalle"></td>
    <td><select id="rc${i}" data-i="${i}" data-k="c" aria-label="Rubro" ${pg ? '' : 'disabled'}><option value="">${pg ? 'Elegir solo' : 'No aplica'}</option>${RUBROS.map(x => `<option ${x === r.c ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
    <td><input id="rm${i}" data-i="${i}" data-k="m" value="${esc(r.m)}" inputmode="decimal" placeholder="0" aria-label="Monto" style="text-align:right"></td>
    <td><select id="rp${i}" data-i="${i}" data-k="p" aria-label="Forma de pago"><option value="">Sin dato</option>${PAGOS.map(p => `<option ${p === r.p ? 'selected' : ''}>${p}</option>`).join('')}</select></td>
    <td><button class="btn sm" data-rm="${i}">Quitar</button></td></tr>`; }).join('');
}
async function saveRev() {
  const bad = rev.findIndex(r => !/^\d{4}-\d{2}-\d{2}$/.test(r.f) || !(parseMonto(r.m) > 0));
  if (bad >= 0) { $('#savemsg').textContent = `Falta la fecha o el monto en la fila ${bad+1}.`; return; }
  const rows = rev.map(r => { const [b, t] = r.lt.split('|');
    return toRow(r.id || newId(), {f:r.f, b, t, m:parseMonto(r.m), d:String(r.d).trim(), p:r.p || '', c:(b !== 'n' && t === 'gasto') ? (r.c || '') : '', s:r.s || 'carga', x:''}); });
  $('#save').disabled = true; $('#savemsg').textContent = 'Guardando…';
  try { await upsert(rows); const n = rows.length; rev = []; renderRev(); $('#txt').value = ''; toast(n === 1 ? 'Guardado.' : `Guardados ${n} movimientos.`);
    const mk = rows[0].fecha.slice(0,7); if (mk !== sel) sel = mk; await load(); }
  catch (e) { $('#savemsg').textContent = dbErr(e); } finally { $('#save').disabled = false; }
}
async function interpret() {
  const text = $('#txt').value.trim(); if (!text) { $('#status').textContent = 'Escribí o dictá algo primero.'; return; }
  const hoy = today(), dia = new Intl.DateTimeFormat('es-AR', {weekday:'long'}).format(new Date());
  $('#go').disabled = true; $('#status').textContent = 'Interpretando…';
  try {
    const { data, error } = await sb.functions.invoke('interpretar', {body: {texto: text, libro: tab, quien: who(), hoy, dia}, headers: {apikey: cfg.SUPABASE_KEY}});
    if (error) throw error;
    const arr = (Array.isArray(data && data.movimientos) ? data.movimientos : []).map(o => ({f: /^\d{4}-\d{2}-\d{2}$/.test(String(o?.fecha)) ? String(o.fecha) : hoy,
      lt: LTV.includes(o?.donde) ? String(o.donde) : blank().lt, d: String(o?.detalle ?? '').slice(0,120),
      m: Number(o?.monto) > 0 ? String(Number(o.monto)) : '', p: PAGOS.includes(o?.pago) ? o.pago : '', c: RUBROS.includes(o?.rubro) ? o.rubro : '', s:'voz'}));
    if (!arr.length) $('#status').textContent = 'No encontré movimientos de plata en el texto. Probá de nuevo o agregalo a mano.';
    else { $('#status').textContent = ''; openReview([...rev, ...arr]); }
  } catch (e) {
    const st = e && e.context && e.context.status;
    $('#status').textContent = st === 403 ? 'Tu usuario no está habilitado para usar Claude. Revisá la tabla "miembros".'
      : st === 500 ? 'Falta la clave de Claude en Supabase (paso 2 de la guía). Mientras tanto, agregalo a mano.'
      : st === 404 ? 'Falta publicar la función "interpretar" en Supabase (paso 2 de la guía). Mientras tanto, agregalo a mano.'
      : 'No se pudo interpretar el texto. Probá de nuevo o agregalo a mano.';
  } finally { $('#go').disabled = false; }
}

/* ---------- reporte de ventas y CSV ---------- */
function loadXlsx() { return new Promise((res, rej) => { if (window.XLSX) return res(); const sc = document.createElement('script');
  sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; sc.onload = () => window.XLSX ? res() : rej(); sc.onerror = rej; document.head.appendChild(sc); }); }
async function readReport(file) {
  $('#repmsg').textContent = 'Leyendo el archivo…'; $('#repgo').hidden = true; repItems = null;
  try {
    await loadXlsx();
    const wb = XLSX.read(await file.arrayBuffer(), {type:'array'}), rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:null});
    const MP = {EFECTIVO:'Efectivo', TARJETA:'Tarjeta', TRANSFERENCIA:'Transferencia'}, out = [];
    for (const r of rows) { const tot = Number(r['Total Venta']), id = String(r['ID Venta'] ?? '').replace(/[^A-Za-z0-9]/g,'');
      if (!id || !(tot > 0)) continue;
      const f = String(r['Fecha'] ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); let fecha;
      if (f) fecha = f[3]+'-'+f[2]+'-'+f[1];
      else { const ts = parseInt(id.slice(1,9), 36); if (!(ts > 1.6e12)) continue; const d = new Date(ts - 3*3600e3); fecha = d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate()); }
      out.push(toRow('v'+id, {f:fecha, b:'n', t:'venta', m:tot, d:'', p:MP[String(r['Método de Pago'] ?? '').trim()] || '', s:'sistema', x: f ? '' : 'El reporte no traía fecha; es el día en que se creó la venta'})); }
    if (!out.length) { $('#repmsg').textContent = 'No se encontraron ventas en ese archivo. Revisá que sea el reporte de ventas del sistema.'; return; }
    const have = new Set(all.map(i => i.id)), nuevas = out.filter(o => !have.has(o.id)), fs = out.map(o => o.fecha).sort();
    repItems = nuevas;
    $('#repmsg').textContent = `${out.length} ventas del ${dm(fs[0])} al ${dm(fs[fs.length-1])}. ${nuevas.length ? `${nuevas.length} son nuevas, por ${money(nuevas.reduce((a,o) => a + o.monto, 0))}.` : 'Ya estaban todas cargadas.'}`;
    $('#repgo').hidden = !nuevas.length;
  } catch (e) { $('#repmsg').textContent = 'No se pudo leer el archivo. Subí el Excel tal como lo baja el sistema.'; }
}
async function importReport() {
  if (!repItems || !repItems.length) return; $('#repgo').disabled = true; $('#repmsg').textContent = 'Importando…';
  try { await upsert(repItems, true); $('#repmsg').textContent = `Ventas importadas: ${repItems.length}.`; $('#repgo').hidden = true; repItems = null; $('#rep').value = ''; await load(); }
  catch (e) { $('#repmsg').textContent = dbErr(e); } finally { $('#repgo').disabled = false; }
}
function exportCsv() {
  const q = v => '"' + String(v).replace(/"/g,'""') + '"';
  const lines = ['Fecha;Libreta;Tipo;Rubro;Detalle;Monto;Pago;Nota', ...all.map(i => [i.f, BOOK[i.b], TIPO[i.t] || i.t, i.b !== 'n' && i.t === 'gasto' ? rubro(i) : '', i.d, i.miss ? '' : String(i.m).replace('.', ','), i.p, i.x].map(q).join(';'))];
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], {type:'text/csv;charset=utf-8'}));
  a.download = `finanzas-casimiro-${today()}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------- interacción ---------- */
function toast(t, undo) { lastUndo = undo || null; $('#toastt').textContent = t; $('#toastb').hidden = !undo; $('#toast').hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { $('#toast').hidden = true; }, 6000); }
function setTab(b, focus) { if (b === tab) return; tab = b; showAll = false; chip = 'all'; rev = []; renderRev(); $('#status').textContent = '';
  const h = '#' + ({n:'casimiro', f:'franche', p:'patri'})[b]; try { history.replaceState(null, '', h); } catch (e) { location.hash = h; } render(); if (focus) $('#t-' + b).focus(); }
$('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-b]'); if (b) setTab(b.dataset.b); });
$('#tabs').addEventListener('keydown', e => { const k = ['n','f','p'], i = k.indexOf(tab);
  if (e.key === 'ArrowRight') setTab(k[(i+1)%3], true); else if (e.key === 'ArrowLeft') setTab(k[(i+2)%3], true); });
addEventListener('hashchange', () => { const b = ({'#franche':'f','#patri':'p','#casimiro':'n'})[location.hash]; if (b) setTab(b); });
$('#prev').onclick = () => { sel = addM(sel, -1); showAll = false; render(); };
$('#next').onclick = () => { sel = addM(sel, 1); showAll = false; render(); };
const chart = $('#chart');
chart.addEventListener('click', e => { const r = e.target.closest('.hit'); if (r) { sel = chartData[+r.dataset.k].mk; render(); } });
chart.addEventListener('keydown', e => { const r = e.target.closest('.hit'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); const k = +r.dataset.k; sel = chartData[k].mk; render(); const n = chart.querySelector(`.hit[data-k="${k}"]`); if (n) n.focus(); } });
chart.addEventListener('pointermove', e => { const r = e.target.closest('.hit'); if (r) showTip(+r.dataset.k); });
chart.addEventListener('pointerleave', () => { $('#tip').hidden = true; });
chart.addEventListener('focusin', e => { const r = e.target.closest('.hit'); if (r) showTip(+r.dataset.k); });
chart.addEventListener('focusout', () => { $('#tip').hidden = true; });
$('#chips').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; chip = b.dataset.c; showAll = false; renderChips(); renderMovs(); });
$('#go').onclick = interpret;
$('#manual').onclick = () => openReview([...rev, blank()]);
$('#addrow').onclick = () => { rev.push(blank()); renderRev(); const n = $(`#rf${rev.length-1}`); if (n) n.focus(); };
$('#cancel').onclick = () => { rev = []; renderRev(); };
$('#save').onclick = saveRev;
$('#revrows').addEventListener('input', e => { const el = e.target, i = +el.dataset.i; if (rev[i] && el.dataset.k) rev[i][el.dataset.k] = el.value; });
$('#revrows').addEventListener('change', e => { const el = e.target; if (el.dataset.k === 'lt') { const i = +el.dataset.i; rev[i].lt = el.value; renderRev(); const n = $(`#rl${i}`); if (n) n.focus(); } });
$('#revrows').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { rev.splice(+b.dataset.rm, 1); renderRev(); } });
$('#movs').addEventListener('click', async e => {
  const ed = e.target.closest('[data-ed]'), del = e.target.closest('[data-del]'), id = ed ? ed.dataset.ed : del && del.dataset.del; if (!id) return;
  const it = all.find(i => i.id === id); if (!it) return;
  if (ed) { openReview([...rev, {id:it.id, f:it.f, lt:it.b+'|'+it.t, d:it.d, m:it.miss ? '' : String(it.m), p:it.p, c:it.c, s:it.s}]); $('#entry').scrollIntoView({behavior:'smooth'}); return; }
  const row = toRow(it.id, {...it, m: it.miss ? null : it.m});
  try { const { error } = await sb.from('movimientos').delete().eq('id', it.id); if (error) throw error; await load();
    toast(`Borrado: ${it.d || TIPO[it.t]}, ${money(it.m)}.`, async () => { await upsert([row]); await load(); }); }
  catch (err) { toast(dbErr(err)); }
});
$('#toastb').onclick = async () => { const u = lastUndo; $('#toast').hidden = true; if (u) try { await u(); toast('Restaurado.'); } catch (e) { toast(dbErr(e)); } };
$('#more').onclick = () => { showAll = !showAll; renderMovs(); };
$('#rep').addEventListener('change', e => { const f = e.target.files[0]; if (f) readReport(f); });
$('#repgo').onclick = importReport;
$('#csv').onclick = exportCsv;

/* ---------- dictado ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition, mic = $('#mic');
function micIdle(msg) { listening = false; mic.classList.remove('on'); mic.setAttribute('aria-label', 'Dictar'); $('#miclab').textContent = msg || (SR ? 'Tocá y hablá' : touch ? 'Dictá con el teclado' : 'Escribí o usá Chrome para dictar'); }
function noDictation(msg) { const t = $('#txt'); t.focus(); $('#status').textContent = msg; }
if (SR || touch) mic.setAttribute('aria-disabled', 'false');
micIdle();
mic.addEventListener('click', () => {
  if (!SR) { noDictation(touch ? 'Tocá el micrófono del teclado para dictar y después “Anotar”.' : 'Este navegador no dicta. Usá Chrome, Edge o Safari, o escribí acá.'); return; }
  if (listening) { rec.stop(); return; }
  rec = new SR(); rec.lang = 'es-AR'; rec.interimResults = true; rec.continuous = true; heard = false;
  rec.onresult = ev => { let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) { const r = ev.results[i];
      if (r.isFinal) { const t = $('#txt'); t.value = (t.value.trim() ? t.value.trim() + ' ' : '') + r[0].transcript.trim(); heard = true; }
      else interim += r[0].transcript; }
    $('#partial').textContent = interim; };
  rec.onerror = ev => {
    const m = ev.error === 'not-allowed' || ev.error === 'service-not-allowed'
      ? (touch ? 'Sin permiso para el micrófono. En el iPhone: Ajustes > Safari > Micrófono, y que el Dictado esté activado. También podés usar el micrófono del teclado.' : 'Sin permiso para el micrófono. Habilitalo desde el candado de la barra de direcciones.')
      : ev.error === 'no-speech' ? 'No se escuchó nada. Probá de nuevo.' : 'El dictado se cortó. Probá de nuevo o usá el micrófono del teclado.';
    $('#status').textContent = m; };
  rec.onend = () => { $('#partial').textContent = ''; micIdle(); if (heard) { heard = false; interpret(); } };
  try { rec.start(); listening = true; mic.classList.add('on'); mic.setAttribute('aria-label', 'Terminar de dictar'); $('#miclab').textContent = 'Escuchando… tocá para terminar'; $('#status').textContent = ''; }
  catch (e) { noDictation('No se pudo abrir el micrófono. Usá el del teclado.'); }
});

new ResizeObserver(() => { if (!$('#app').hidden) draw(); }).observe(chart);
boot();
}
