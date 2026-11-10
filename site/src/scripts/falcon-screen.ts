// The Falcon NOC Intelligence dashboard (falcon_v11) as a working screen, following the change log
// (FALCON_Changelog_original_to_v11): the same scoring rules, recommendation card, SLA countdown, selectable KPIs, unified
// search with an investigation workbench and timeline, historical view, filters, clusters, root causes page, WAN link
// explorer and chat. The data is a deterministic sample (no real network data), generated per time window.
//
// Each screen starts as a still poster of the Figma frame. play() only shows the loading (skeletons until the mock
// backend in data/falcon-mock.ts answers, then each section as soon as its data exists); from then on the visitor drives
// it — Pull Data asks the backend for the chosen window; KPI cards and filters re-query what is loaded; every change
// shows its loading state first.

import { falconApi, pad, rng, windowRange, type Options, type P, type Ticket } from '../data/falcon-mock';

// ------------------------------------------------------------------ rules from falcon_v11 (lines 90–113)
const SCORE_WEIGHTS = { P1: 100, P2: 70, P3: 40, SLA_UNDER_15: 80, SLA_UNDER_30: 50, COMMON_UPSTREAM_IP: 60, MULTIPLE_CIRCLES: 50, CONFIG_CHANGE: 40, CUSTOMER_IMPACT: 60 };
const SLA_TARGET_MINUTES: Record<string, number> = { P1: 60, P2: 120, P3: 240 };
const CONFIG_CHANGE_KEYWORDS = ['reload', 'cfglog', 'cli_hist', 'config', 'commit'];


// ------------------------------------------------------------------ scoring (falcon_v11 lines 138–287)
const slaMinutes = (t: Ticket, now = Date.now()) => SLA_TARGET_MINUTES[t.priority] - (now - t.open.getTime()) / 60_000;
const slaDeadline = (t: Ticket) => t.open.getTime() + SLA_TARGET_MINUTES[t.priority] * 60_000;
function deriveContext(ts: Ticket[]) {
  const upstream = new Map<string, number>(), circles = new Map<string, Set<string>>(), config = new Set<string>();
  for (const t of ts) {
    if (!t.ip) continue;
    upstream.set(t.ip, (upstream.get(t.ip) || 0) + 1);
    if (!circles.has(t.ip)) circles.set(t.ip, new Set());
    circles.get(t.ip)!.add(t.circle);
    if (t.change || t.syslogHit || CONFIG_CHANGE_KEYWORDS.some(k => `${t.problem} ${t.category}`.toLowerCase().includes(k))) config.add(t.ip);
  }
  return { upstream, circles, config };
}
function scoreAll(ts: Ticket[]) {
  const ctx = deriveContext(ts);
  return ts.map(t => {
    let score = SCORE_WEIGHTS[t.priority];
    const reasons: string[] = [];
    if (t.priority === 'P1') reasons.push('Highest Priority Incident');
    const sla = slaMinutes(t);
    if (sla < 15) score += SCORE_WEIGHTS.SLA_UNDER_15; else if (sla < 30) score += SCORE_WEIGHTS.SLA_UNDER_30;
    if (sla < 30 && sla > -9999) reasons.push('SLA Expiring Soon');
    if (t.ip) {
      if ((ctx.upstream.get(t.ip) || 0) > 1) { score += SCORE_WEIGHTS.COMMON_UPSTREAM_IP; reasons.push('Common Upstream IP'); }
      if ((ctx.circles.get(t.ip)?.size || 0) > 1) { score += SCORE_WEIGHTS.MULTIPLE_CIRCLES; reasons.push('Multiple Circles Affected'); }
      if (ctx.config.has(t.ip)) { score += SCORE_WEIGHTS.CONFIG_CHANGE; reasons.push('Configuration Change Detected'); }
    }
    if (t.impact) { score += SCORE_WEIGHTS.CUSTOMER_IMPACT; reasons.push('Customer Impact Available'); }
    return { ...t, score, reasons };
  }).sort((a, b) => b.score! - a.score!);
}
function formatReasons(t: Ticket) {
  const sla = Math.max(Math.floor(slaMinutes(t)), 0);
  return (t.reasons || []).map(r => ({
    'Highest Priority Incident': 'Highest active priority incident',
    'SLA Expiring Soon': `SLA expires in ${sla} minute${sla !== 1 ? 's' : ''}`,
    'Common Upstream IP': 'Shared upstream IP detected',
    'Multiple Circles Affected': 'Affects multiple circles',
    'Configuration Change Detected': 'Configuration change detected',
    'Customer Impact Available': 'High customer impact',
  } as Record<string, string>)[r] || r);
}

// ------------------------------------------------------------------ helpers
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dShort = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const dTime = (d: Date) => `${pad(d.getDate())}-${MONTHS[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const hm12 = (d: Date) => `${((d.getHours() + 11) % 12) + 1}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
const chipP = (t: Ticket) => `<span class="fs-chip fs-chip--${t.priority.toLowerCase()}">• ${esc(t.label)}</span>`;
const chipT = (t: Ticket) => `<span class="fs-chip fs-chip--${t.type.toLowerCase()}">${t.type}</span>`;
const chipS = (t: Ticket) => `<span class="fs-chip ${t.status === 'Open' ? 'fs-chip--st' : 'fs-chip--wip'}">• ${t.status}</span>`;
const skel = (w: string, h = 11, r = 4, delay = 0) => `<i class="fs-skel" style="width:${w};height:${h}px;border-radius:${r}px;animation-delay:${delay}s"></i>`;
const countBy = <T,>(xs: T[], f: (x: T) => string) => { const m = new Map<string, number>(); xs.forEach(x => m.set(f(x), (m.get(f(x)) || 0) + 1)); return [...m].sort((a, b) => b[1] - a[1]); };

// ------------------------------------------------------------------ one screen
function mount(root: HTMLElement) {
  const $ = <T extends HTMLElement = HTMLElement>(k: string) => root.querySelector<T>(`[data-fs="${k}"]`)!;
  const timers: number[] = [];
  const S = {
    live: false, win: { day: 0, sh: 11, sm: 15, eh: 12, em: 15 } as Win, tickets: [] as Ticket[], scored: [] as Ticket[],
    dismissed: [] as string[], query: '', filters: { circle: '', priority: '', category: '' }, rctPage: 0, rctMode: 'table' as 'table' | 'clusters' | 'wan',
    kpi: { P1: 51, P2: 280, P3: 107, HPSM: 438 }, hist: false, loading: false, updated: new Date(), page: '' as string,
    options: null as Options | null,
  };
  const now = new Date();
  S.win.sh = Math.max(0, now.getHours() - 1); S.win.eh = now.getHours(); S.win.sm = S.win.em = Math.floor(now.getMinutes() / 15) * 15;

  // -------------------------------------------------------------- filters and views of the data
  const visible = () => S.tickets.filter(t =>
    (!S.filters.circle || t.circle === S.filters.circle) && (!S.filters.priority || t.priority === S.filters.priority) &&
    (!S.filters.category || t.problem === S.filters.category) && (!S.query || matches(t, S.query)));
  const matches = (t: Ticket, q: string) => { const s = q.toLowerCase(); return [t.number, t.ip, t.device, t.nss].some(v => String(v ?? '').toLowerCase().includes(s)); };
  const recommended = () => {
    const pool = S.scored.filter(t => !S.dismissed.includes(t.number));
    return { t: pool[0], rank: S.scored.indexOf(pool[0]) + 1 };
  };

  // -------------------------------------------------------------- renderers
  const renderNote = () => {
    const n = $('note');
    if (S.hist) {
      const { start, end } = windowRange(S.win);
      n.className = 'fs-note fs-note--hist';
      n.innerHTML = `<span><b>◷ Historical View</b> · Showing data from ${dShort(start)} ${pad(start.getHours())}:${pad(start.getMinutes())} → ${pad(end.getHours())}:${pad(end.getMinutes())} · Live updates are paused.</span><button type="button" data-action="live">Return to Live</button>`;
    } else { n.className = 'fs-note'; n.textContent = '(KPI data refreshes every 30 seconds)'; }
  };
  // the KPI cards: selecting one filters the screen to that priority (HPSM Tickets shows them all again)
  const kpiCard = (k: string, cls: string, label: string, value: number | null, chip = '') => {
    const on = k === 'HPSM' ? !S.filters.priority : S.filters.priority === k;
    return `<button type="button" class="fs-kpi fs-kpi--${cls} ${S.live && on && value !== null ? 'is-selected' : ''} ${S.live && S.filters.priority && !on ? 'is-dim' : ''}" data-kpi="${k}" data-action="kpi" data-v="${k}" aria-pressed="${on}"><p class="fs-kpi__label">${label}${chip}</p>${value === null ? `<p style="margin-top:12px">${skel('55%', 36, 6)}</p>` : `<p class="fs-kpi__value">${value}</p>`}</button>`;
  };
  const renderKpis = (loading = false) => {
    const v = (k: keyof typeof S.kpi) => loading ? null : S.kpi[k];
    $('kpis').innerHTML = kpiCard('P1', 'p1', 'Active P1', v('P1'), ' <span class="fs-kpi__chip">• Critical</span>') + kpiCard('P2', 'p2', 'Active P2', v('P2'))
      + kpiCard('P3', 'p3', 'Active P3', v('P3')) + kpiCard('HPSM', 'hpsm', 'HPSM Tickets', v('HPSM'));
  };
  const renderRecent = (loading = false) => {
    const rows = loading
      ? Array.from({ length: 5 }, (_, i) => `<tr><td>${skel('90px', 11, 3, i * .08)}</td><td>${skel('30px', 20, 100, i * .08)}</td><td>${skel('60px', 20, 100, i * .08)}</td><td>${skel('46px', 20, 100, i * .08)}</td><td>${skel('80px', 11, 3, i * .08)}</td><td>${skel('100px', 11, 3, i * .08)}</td></tr>`).join('')
      : visible().slice(0, 40).map((t, i) => `<tr data-action="investigate" data-id="${esc(t.number)}" class="${S.live && i < 8 ? 'is-new' : ''}" style="animation-delay:${i * .04}s"><td>${esc(t.number)}</td><td>${chipT(t)}</td><td>${chipP(t)}</td><td>${chipS(t)}</td><td>${esc(t.ip ?? 'None')}</td><td>${esc(t.device)}</td></tr>`).join('');
    const banner = S.query ? `<p class="fs-banner">Showing results for: "${esc(S.query)}" · ${visible().length} ticket${visible().length !== 1 ? 's' : ''}<button type="button" data-action="clear-search">✕ Clear</button></p>` : '';
    $('recent').innerHTML = `<p class="fs-card__title">Recent Activity</p>${banner}
      <table class="fs-table fs-recent__head"><colgroup><col style="width:125px"><col style="width:125px"><col style="width:125px"><col style="width:124px"><col style="width:125px"><col></colgroup>
      <thead><tr><th>TT ID</th><th>TYPE</th><th>PRIORITY</th><th>STATUS</th><th>IP ADDRESS</th><th>DEVICE NAME</th></tr></thead></table>
      <div class="fs-recent__body" data-lenis-prevent><table class="fs-table"><colgroup><col style="width:125px"><col style="width:125px"><col style="width:125px"><col style="width:124px"><col style="width:125px"><col></colgroup>
      <tbody>${rows || `<tr><td colspan="6" class="fs-empty">No results found for "${esc(S.query)}".</td></tr>`}</tbody></table></div>`;
  };
  const renderRegion = (loading = false) => {
    if (loading) { $('region').innerHTML = `${skel('70%', 16)}<p style="margin:18px 0 0">${skel('85%', 12)}</p><p style="margin:10px 0">${skel('60%', 12, 4, .06)}</p><p>${skel('45%', 12, 4, .12)}</p><div class="fs-divider"></div>${skel('80%', 16, 4, .04)}${[65, 60, 72, 55].map((w, i) => `<p style="margin-top:10px">${skel(w + '%', 12, 4, i * .07)}</p>`).join('')}`; return; }
    const vs = visible();
    const regions = countBy(vs, t => t.circle).slice(0, 3);
    const byIp = countBy(vs.filter(t => t.ip), t => t.ip!).filter(([, n]) => n > 1).slice(0, 2);
    const causes = countBy(vs, t => t.problem).slice(0, 5);
    const max = causes[0]?.[1] || 1;
    $('region').innerHTML = `<p class="fs-card__title">Region Wise Activity</p><div style="margin-top:12px">${regions.map(([c, n]) => `<p class="fs-region__row ${S.filters.circle === c ? 'is-on' : ''}" data-action="filter-circle" data-v="${c}"><span>${c}</span><span>${n}</span></p>`).join('') || '<p class="fs-empty">No activity</p>'}</div>
      <div class="fs-divider"></div><p class="fs-card__title" style="line-height:25px">Common IPs HPSM &amp;<br>Session</p>
      <ul class="fs-region__ips">${byIp.map(([ip]) => `<li data-action="search" data-v="${esc(ip)}">${esc(ip)}</li>`).join('') || '<li style="list-style:none;margin-left:-18px;color:#8a8a8a">None in this range</li>'}</ul>
      <div class="fs-divider" style="margin:16px 0 0"></div>
      <div class="fs-causes"><p class="fs-causes__title">TOP ROOT CAUSES</p>${causes.map(([c, n]) => `<div class="fs-cause ${S.filters.category === c ? 'is-on' : ''}" data-action="filter-cause" data-v="${esc(c)}"><span>${esc(c)}</span><b>${n}</b><i style="--w:${Math.round(n / max * 100)}%"></i></div>`).join('')}</div>`;
  };
  // the recommendation card (falcon_v11 _recommendation_panel)
  const renderRec = (loading = false, swap = false) => {
    if (loading) { $('rec').innerHTML = `<p class="fs-rec__title">Recommended Investigation</p><div class="fs-rec__card" style="cursor:default"><p class="fs-empty">Refreshing recommendation for the new time range…</p></div>`; return; }
    const { t, rank } = recommended();
    if (!t) { $('rec').innerHTML = `<p class="fs-rec__title">Recommended Investigation</p><div class="fs-rec__card"><p class="fs-empty">No data yet — pull data from the top nav to see a recommendation.</p></div>`; return; }
    const sla = slaMinutes(t);
    const urgent = [sla < 30 ? `SLA expires in ${Math.max(Math.floor(sla), 0)} minutes` : '', t.reasons!.includes('Multiple Circles Affected') ? 'Affecting multiple network circles' : '', t.impact ? 'High business impact' : ''].filter(Boolean);
    $('rec').innerHTML = `<p class="fs-rec__title">Recommended Investigation</p>
      <div class="fs-rec__card ${swap ? 'is-swap' : ''}" data-action="investigate" data-id="${esc(t.number)}" title="Click to investigate this ticket">
        <p class="fs-rec__eyebrow">INVESTIGATE FIRST</p>
        <p class="fs-rec__id"><span>${esc(t.number)}</span><span class="fs-rec__pchip">• ${esc(t.label.replace('EME', 'EME'))}</span></p>
        <p class="fs-rec__rank">${rank === 1 ? 'Highest Ranked Incident' : `Rank #${rank}`}</p>
        <p class="fs-rec__of">#${rank} of ${(S.tickets.length * 2 + 18).toLocaleString()} active incidents evaluated</p>
        <div class="fs-rec__sla"><p class="fs-label">SLA Remaining</p><p class="fs-rec__timer" data-fs="timer" data-deadline="${slaDeadline(t)}">--:--:--</p></div>
        ${urgent.length ? `<div class="fs-attn"><p>⚠ Immediate Attention</p>${urgent.map(u => `<p>• ${u}</p>`).join('')}</div>` : ''}
        <div class="fs-why"><p class="fs-label" style="display:block">Why Falcon recommends this</p>${formatReasons(t).map(r => `<p>${esc(r)}</p>`).join('') || '<p>No specific factors identified.</p>'}</div>
        <div class="fs-rec__grid">
          <div><p class="fs-label">Primary Impacted Circle</p><p class="is-net">${esc(t.circle)}</p></div>
          <div><p class="fs-label">Most Probable Root<br>Cause</p><p>${esc(t.problem)}</p></div>
          <div><p class="fs-label">Primary Affected Device</p><p class="is-net">${esc(t.device)}</p></div>
          <div><p class="fs-label">Recommendation<br>Generated</p><p>${dTime(new Date())}</p></div>
        </div>
      </div>
      <button type="button" class="fs-rec__dismiss" data-action="dismiss" data-id="${esc(t.number)}">✕ Dismiss Recommendation</button>`;
    tickTimer();
  };
  // the SLA countdown: HH:MM:SS to the deadline, red under 15 min, amber under 30 (falcon_v11 _sla_countdown)
  const tickTimer = () => {
    const el = $('timer'); if (!el?.dataset.deadline) return;
    const ms = +el.dataset.deadline - Date.now();
    const s = Math.abs(Math.round(ms / 1000));
    el.textContent = `${ms < 0 ? '-' : ''}${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
    el.classList.toggle('is-amber', ms >= 15 * 60_000 && ms < 30 * 60_000);
    el.classList.toggle('is-calm', ms >= 30 * 60_000);
  };
  const rctRows = (ts: Ticket[]) => `<table class="fs-table"><thead><tr><th style="width:190px">TT ID</th><th style="width:110px">PRIORITY</th><th style="width:100px">STATUS</th><th style="width:130px">OPEN TIME</th><th style="width:120px">IP ADDRESS</th><th>DEVICE NAME</th><th style="width:130px">PROBLEM</th><th style="width:70px">CIRCLE</th></tr></thead>
    <tbody>${ts.map(t => `<tr data-action="investigate" data-id="${esc(t.number)}"><td>${esc(t.number)}</td><td>${chipP(t)}</td><td>${chipS(t)}</td><td>${dTime(t.open)}</td><td>${esc(t.ip ?? 'None')}</td><td>${esc(t.device)}</td><td>${esc(t.problem)}</td><td>${esc(t.circle)}</td></tr>`).join('') || '<tr><td colspan="8" class="fs-empty">No tickets match.</td></tr>'}</tbody></table>`;
  const clusters = (ts: Ticket[]) => {
    const groups = new Map<string, Ticket[]>();
    ts.forEach(t => { const k = t.ip ? `ip:${t.ip}` : `dev:${t.device}`; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(t); });
    const rank = (p: P) => +p[1];
    const list = [...groups].filter(([, g]) => g.length > 1).map(([k, g]) => ({ k, g, best: g.reduce((b, t) => rank(t.priority) < rank(b) ? t.priority : b, 'P3' as P) }))
      .sort((a, b) => rank(a.best) - rank(b.best) || b.g.length - a.g.length);
    if (!list.length) return '<p class="fs-empty">No related incident clusters found — every incident in the current range is on a distinct device/IP.</p>';
    const common = (vals: string[]) => { const c = countBy(vals, v => v); return c.length === 1 ? c[0][0] : `${c[0][0]} (+${vals.length - c[0][1]} more)`; };
    const col = { P1: '#ee3b2f', P2: '#f0a202', P3: '#5f5fef' };
    return list.slice(0, 12).map(({ g, best }) => `<details class="fs-cluster"><summary><strong>${esc(common(g.map(t => t.device)))} (${esc(g[0].ip ?? '—')})</strong>
      <span class="fs-badge" style="background:${col[best]}">${best}</span><em>${g.length} related incidents</em><span>Root Cause: ${esc(common(g.map(t => t.problem)))}</span></summary>
      <div>${rctRows(g)}</div></details>`).join('');
  };
  // WAN link explorer (digital twin): a small topology around the affected circle, incident nodes in red
  const wan = (focus?: Ticket) => {
    const vs = visible();
    const hot = new Set(vs.slice(0, 40).map(t => t.ip).filter(Boolean));
    const nodes = [{ id: 'CORE-BLR-01', x: 760, y: 70, role: 'core' }, { id: 'CORE-MUM-01', x: 430, y: 70, role: 'core' },
      ...['AGG', 'AGG', 'AGG', 'AGG'].map((r, i) => ({ id: `${r}-${['KAR', 'MPCG', 'MUM', 'DEL'][i]}-0${i + 1}`, x: 200 + i * 230, y: 190, role: 'agg' })),
      ...vs.slice(0, 9).map((t, i) => ({ id: t.ip ?? t.device, x: 110 + i * 110, y: 310, role: 'access', t }))];
    const links = nodes.filter(n => n.role !== 'core').map((n, i) => n.role === 'agg' ? [i % 2 ? 'CORE-BLR-01' : 'CORE-MUM-01', n.id] : [nodes[2 + (i % 4)].id, n.id]);
    links.push(['CORE-BLR-01', 'CORE-MUM-01']);
    const at = (id: string) => nodes.find(n => n.id === id)!;
    const color = (n: any) => n.t && hot.has(n.t.ip) ? '#ee3b2f' : n.role === 'core' ? '#3730a3' : n.role === 'agg' ? '#5f5fef' : '#0daf94';
    const sel = focus ? nodes.find((n: any) => n.t?.number === focus.number) : null;
    return `<div class="fs-wan"><svg viewBox="0 0 1030 380">${links.map(([a, b]) => { const A = at(a), B = at(b); const hotL = (B as any).t && hot.has((B as any).t.ip); return `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="${hotL ? '#ee3b2f' : '#cfcac3'}" stroke-width="${hotL ? 2 : 1.2}" ${hotL ? 'stroke-dasharray="5 4"' : ''}/>`; }).join('')}
      ${nodes.map((n: any) => `<g class="fs-wan__node" data-action="wan-node" data-id="${esc(n.t?.number ?? '')}"><circle cx="${n.x}" cy="${n.y}" r="${n === sel ? 16 : 12}" fill="${color(n)}" stroke="#fff" stroke-width="3"/><text x="${n.x}" y="${n.y + 30}" text-anchor="middle" font-size="10" fill="#555">${esc(String(n.id).slice(0, 16))}</text></g>`).join('')}</svg>
      <div class="fs-wan__info" data-fs="wan-info">${sel ? wanInfo(sel.t) : 'Select a node to see its incidents. Red nodes and dashed links carry open incidents in this range.'}</div>
      <p class="fs-wan__legend"><span><i style="background:#3730a3"></i>Core</span><span><i style="background:#5f5fef"></i>Aggregation</span><span><i style="background:#0daf94"></i>Access</span><span><i style="background:#ee3b2f"></i>Incident</span></p></div>`;
  };
  const wanInfo = (t: Ticket) => `<b>${esc(t.device)}</b><br>IP ${esc(t.ip ?? '—')} · ${esc(t.vendor)} ${esc(t.model)}<br>${chipP(t)} ${esc(t.problem)}<br><button type="button" class="fs-btn fs-btn--sm" style="margin-top:8px" data-action="investigate" data-id="${esc(t.number)}">Investigate ${esc(t.number.slice(-6))} →</button>`;
  const renderRct = (loading = false, focus?: Ticket) => {
    const vs = visible();
    const pages = Math.max(1, Math.ceil(vs.length / 8));
    S.rctPage = Math.min(S.rctPage, pages - 1);
    const body = loading ? `<table class="fs-table"><tbody>${Array.from({ length: 6 }, (_, i) => `<tr>${['90px', '60px', '70px', '80px', '100px', '70px', '60px', '50px'].map(w => `<td>${skel(w, 11, 3, i * .07)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      : S.rctMode === 'wan' ? wan(focus) : S.rctMode === 'clusters' ? clusters(vs)
      : `${rctRows(vs.slice(S.rctPage * 8, S.rctPage * 8 + 8))}<p class="fs-pager"><button type="button" data-action="rct-page" data-v="-1" ${S.rctPage === 0 ? 'disabled' : ''}>‹</button>${S.rctPage + 1} / ${pages}<button type="button" data-action="rct-page" data-v="1" ${S.rctPage >= pages - 1 ? 'disabled' : ''}>›</button></p>`;
    $('rct').innerHTML = `<div class="fs-rct__head"><p class="fs-rct__title">${S.rctMode === 'wan' ? 'WAN Link Explorer' : 'Root Cause Table'}</p>
      <button type="button" class="fs-rct__refresh" data-action="rct-refresh" aria-label="Refresh"><img src="/falcon-screen/refresh.svg" width="16" height="16" alt=""></button>
      <span class="fs-rct__updated">·  Updated ${hm12(S.updated)}</span>
      <span class="fs-rct__tools">${S.rctMode === 'wan' ? `<button type="button" class="fs-btn" data-action="wan-back">← Back to Root Cause Table</button>`
        : `<button type="button" class="fs-btn ${S.rctMode === 'clusters' ? 'is-on' : ''}" data-action="clusters"><img src="/falcon-screen/cluster-view.svg" width="16" height="16" alt="">Cluster View</button>
        <button type="button" class="fs-btn fs-btn--red" data-action="wan">Wan Link Explorer (Digital Twin) ↗</button>`}</span></div>
      ${S.rctMode === 'wan' ? '' : `<p class="fs-rct__sub"><span>HPSM${S.rctMode === 'clusters' ? ' · related incidents grouped by device / IP' : ''}</span>
        <button type="button" class="fs-btn fs-btn--sm" data-action="export" data-v="csv"><img src="/falcon-screen/download.svg" width="8" height="10" alt="">CSV</button>
        <button type="button" class="fs-btn fs-btn--sm" data-action="export" data-v="xls"><img src="/falcon-screen/download.svg" width="8" height="10" alt="">Excel</button></p>`}
      <div class="fs-rct__body">${body}</div>`;
  };

  // scroll the dashboard (not the page) to the root cause table
  const toRct = () => $('scroll').scrollTo({ top: $('rct').offsetTop - 20, behavior: 'smooth' });

  // -------------------------------------------------------------- pages: investigation workbench, root causes
  const openPage = (name: string, html: string, wide = false) => {
    const p = $('page'); p.hidden = false; p.className = `fs-page ${wide ? 'fs-page--wide' : ''}`; p.innerHTML = html; S.page = name;
    root.querySelectorAll<HTMLElement>('.fs-side__item[data-page]').forEach(b => b.classList.toggle('is-active', b.dataset.page === name));
    $('scroll').scrollTo({ top: 0, behavior: 'smooth' });
  };
  const closePage = () => { $('page').hidden = true; S.page = ''; root.querySelectorAll<HTMLElement>('.fs-side__item[data-page]').forEach(b => b.classList.toggle('is-active', b.dataset.page === 'home')); };
  const workbench = (q: string) => {
    const hits = S.tickets.filter(t => matches(t, q));
    if (!q) return openPage('workbench', `<div class="fs-page__head"><p class="fs-page__title">Investigation Workbench</p><button class="fs-btn fs-page__close" data-action="close-page">Close</button></div><p class="fs-empty">Enter a TT ID, IP address, or device name in the search bar and press Search.</p>`);
    if (!hits.length) return openPage('workbench', `<div class="fs-page__head"><p class="fs-page__title">Investigation Workbench</p><button class="fs-btn fs-page__close" data-action="close-page">Close</button></div><p class="fs-empty">No results found for "${esc(q)}".</p>`);
    const t = hits[0];
    const r = rng(t.number.length * 31 + (t.ip ? t.ip.length : 3));
    const base = t.open.getTime();
    const user = ['IPMARIO', '22010782', '22010822', 'NokiaMSScript'][Math.floor(r() * 4)];
    const sess = [0, 1, 2].map(i => ({ start: new Date(base + (i * 7 + 3) * 60_000), cmd: [`/configure service vprn 1003 interface "lag-34:1747" ip-mtu 9000`, `show router ${1000 + i} interface`, `ping ${t.ip ?? '10.113.249.36'} rapid count 50`][i] }));
    const sys = [0, 1, 2, 3].map(i => ({ at: new Date(base + (i * 4 + 1) * 60_000), kw: ['MPLS', 'UI_CMDLINE_READ_LINE', 'command-log', 'LDP-Session-Down'][i] }));
    const events = [
      { at: t.open, src: 'HPSM', c: '#ee3b2f', type: 'Ticket Opened', desc: `${t.number} — ${t.problem}` },
      { at: new Date(base - 3 * 60_000), src: 'HPSM', c: '#ee3b2f', type: 'Downtime Started', desc: `${t.number} — downtime began` },
      ...sess.map(s => ({ at: s.start, src: 'Session', c: '#5f5fef', type: 'Session Started', desc: `${user} started a session` })),
      ...(t.change ? [{ at: new Date(base + 9 * 60_000), src: 'Configuration', c: '#f0a202', type: 'Change CR-' + (40000 + Math.floor(r() * 9999)), desc: 'Phase: Implementation · Status: Approved' }] : []),
      ...sys.map(s => ({ at: s.at, src: 'Syslog', c: '#0daf94', type: `Syslog — ${s.kw}`, desc: `${t.device} ${s.kw} event` })),
      { at: new Date(base + 18 * 60_000), src: 'VIPAM', c: '#6b685f', type: 'VIPAM Session', desc: `${user} executed commands` },
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    const tab = (k: string, label: string, html: string) => `<div data-iw="${k}" ${k === 'hpsm' ? '' : 'hidden'}>${html}</div>`;
    openPage('workbench', `<div class="fs-page__head"><p class="fs-page__title">Investigation Workbench</p><span class="fs-chip fs-chip--st">${hits.length} matching ticket${hits.length > 1 ? 's' : ''}</span><button type="button" class="fs-btn fs-page__close" data-action="close-page">Close</button></div>
      <div class="fs-iw__dev"><span class="is-link">TT ID – ${esc(t.number)} ${chipP(t)}</span><span>NSS ID – ${esc(t.nss)}</span><span>CIRCLE/CITY – ${esc(t.circle)}/${esc(t.city)}</span>
        <span class="is-link">IP – ${esc(t.ip ?? '—')}</span><span>VENDOR – ${esc(t.vendor)}</span><span>NETWORK LAYER – ${esc(t.layer)}</span>
        <span class="is-link">DEVICE NAME – ${esc(t.device)}</span><span>MODEL – ${esc(t.model)}</span><span><button type="button" class="fs-btn fs-btn--sm" data-action="topology" data-id="${esc(t.number)}">Open in topology ↗</button></span></div>
      <div class="fs-iw__grid"><div>
        <div class="fs-iw__tabs">${['HPSM', 'TOPOLOGY', 'SESSION', 'SYSLOG', 'VIPAM'].map((k, i) => `<button type="button" data-action="iw-tab" data-v="${k.toLowerCase()}" class="${i ? '' : 'is-on'}">${k}</button>`).join('')}</div>
        ${tab('hpsm', 'HPSM', rctRows(hits.slice(0, 8)))}
        ${tab('topology', 'TOPOLOGY', `<table class="fs-table"><thead><tr><th>A-END IP</th><th>TOPOLOGY IP</th><th>ROLE</th><th>CLUBBING</th><th>CR TIDs</th></tr></thead><tbody>${[0, 1, 2].map(i => `<tr><td>${esc(t.ip ?? '10.211.185.2')}</td><td>10.211.${184 + i}.${2 + i * 7}</td><td>${['A-End IP', 'Agg', 'Core'][i]}</td><td>${['Regional', 'Circle', 'National'][i]}</td><td>${t.change && i === 0 ? 'CR-48211' : '—'}</td></tr>`).join('')}</tbody></table>`)}
        ${tab('session', 'SESSION', `<table class="fs-table"><thead><tr><th style="width:150px">START TIME</th><th style="width:110px">USER</th><th>COMMANDS</th></tr></thead><tbody>${sess.map(s => `<tr><td>${dTime(s.start)}</td><td>${user}</td><td class="fs-mono">${esc(s.cmd)}</td></tr>`).join('')}</tbody></table>`)}
        ${tab('syslog', 'SYSLOG', `<table class="fs-table"><thead><tr><th style="width:150px">TIME (IST)</th><th style="width:170px">KEYWORD</th><th>TEXT</th></tr></thead><tbody>${sys.map(s => `<tr><td>${dTime(s.at)}</td><td>${s.kw}</td><td class="fs-mono">${esc(`${t.device} ${s.kw}: neid="4002" key="//object=ldp" severity="event" category="protocols"`)}</td></tr>`).join('')}</tbody></table>`)}
        ${tab('vipam', 'VIPAM', `<table class="fs-table"><thead><tr><th style="width:200px">DEVICE NAME</th><th style="width:120px">IP ADDRESS</th><th>SESSION COMMANDS</th></tr></thead><tbody><tr><td>${esc(t.device)}</td><td>${esc(t.ip ?? '—')}</td><td class="fs-mono">['ping router 1001 ${esc(t.ip ?? '')} rapid count 50', 'show router', 'traceroute router 1001']</td></tr></tbody></table>`)}
      </div><div><p class="fs-label" style="margin:24px 0 12px">Incident timeline · all sources</p><div class="fs-timeline">${events.map(e => `<div class="fs-tl" style="--c:${e.c}"><time>${dTime(e.at)}</time><p>${esc(e.type)}</p><small>${esc(e.desc)}</small><span>${e.src}</span></div>`).join('')}</div></div></div>`, true);
  };
  const causesPage = () => {
    const vs = visible();
    const top = countBy(vs, t => t.problem).slice(0, 5);
    openPage('causes', `<div class="fs-page__head"><p class="fs-page__title">Root Causes</p><span class="fs-label">Top 5 causes in this range</span><button type="button" class="fs-btn fs-page__close" data-action="close-page">Close</button></div>
      <div class="fs-causes-page">${top.map(([c, n]) => `<section><h4>${esc(c)} <span>${n} tickets</span></h4>${rctRows(vs.filter(t => t.problem === c).slice(0, 5))}</section>`).join('')}</div>`, true);
  };

  // -------------------------------------------------------------- toasts, filters, chat, users
  let toastTimer = 0;
  const toast = (html: string, good = false, ms = 5000) => {
    $('toast').innerHTML = `<div class="${good ? 'is-good' : ''}">${html}</div>`;
    clearTimeout(toastTimer); toastTimer = window.setTimeout(() => ($('toast').innerHTML = ''), ms);
  };
  const renderFilters = () => {
    const opts = (vals: string[], cur: string) => `<option value="">All</option>${vals.map(v => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('')}`;
    $('filters').innerHTML = `<p style="font-size:14px">Filters</p>
      <label>Circle<select data-filter="circle">${opts(S.options?.circles ?? [], S.filters.circle)}</select></label>
      <label>Priority<select data-filter="priority">${opts(S.options?.priorities ?? [], S.filters.priority)}</select></label>
      <label>Root cause<select data-filter="category">${opts(S.options?.causes ?? [], S.filters.category)}</select></label>
      <p class="fs-filters__foot"><button type="button" class="fs-btn fs-btn--sm" data-action="filters-clear">Clear all</button><button type="button" class="fs-btn fs-btn--sm" data-action="filters">Done</button></p>`;
    const n = Object.values(S.filters).filter(Boolean).length;
    const b = $('filter-badge'); b.hidden = !n; b.textContent = String(n);
  };
  const renderUsers = () => {
    const days = [182, 196, 201, 188, 214, 207, 216];
    const max = Math.max(...days), min = Math.min(...days);
    const pts = days.map((v, i) => `${i * 30},${30 - ((v - min) / (max - min)) * 26}`).join(' ');
    const pct = ((days[6] - days[5]) / days[5] * 100).toFixed(1);
    $('users').innerHTML = `<p class="fs-label">Total unique users · today</p><p style="font-size:22px;margin-top:4px">${days[6]}</p>
      <svg viewBox="-4 -4 188 40" width="180" height="36"><polyline points="${pts}" fill="none" stroke="#ee3b2f" stroke-width="2"/>${days.map((v, i) => `<circle cx="${i * 30}" cy="${30 - ((v - min) / (max - min)) * 26}" r="2.5" fill="#ee3b2f"/>`).join('')}</svg>
      <p style="font-size:11px;color:#0daf94">↑ ${pct}% <span style="color:#9c9189">vs yesterday</span></p>`;
  };
  const chatAnswer = (q: string) => {
    const { t } = recommended();
    const ip = q.match(/\d{1,3}(\.\d{1,3}){3}/)?.[0];
    if (ip) { const hs = S.tickets.filter(x => x.ip === ip); return hs.length ? `${hs.length} open ticket${hs.length > 1 ? 's' : ''} on ${ip}: ${countBy(hs, x => x.problem).map(([c, n]) => `${n}× ${c}`).join(', ')}. Highest priority: ${hs.sort((a, b) => +a.priority[1] - +b.priority[1])[0].label}.` : `No open tickets on ${ip} in this range.`; }
    if (/why|recommend/i.test(q) && t) return `${t.number} scored ${t.score} points — ${formatReasons(t).join('; ').toLowerCase()}. The score is rule-based: priority, SLA proximity, shared upstream IP, multiple circles, configuration change and customer impact.`;
    if (/sla/i.test(q) && t) { const m = Math.floor(slaMinutes(t)); return m >= 0 ? `${t.number} has ${m} minutes left before it breaches its ${SLA_TARGET_MINUTES[t.priority]}-minute ${t.priority} target.` : `${t.number} breached its SLA ${-m} minutes ago.`; }
    if (/cause|root/i.test(q)) return `Top root causes right now: ${countBy(visible(), x => x.problem).slice(0, 3).map(([c, n]) => `${c} (${n})`).join(', ')}.`;
    return 'I can explain the recommendation, check an SLA, summarise an IP (paste one), or list the top root causes.';
  };
  const openChat = () => {
    const c = $('chat');
    if (!c.hidden) { c.hidden = true; return; }
    c.hidden = false;
    c.innerHTML = `<p class="fs-chat__head"><span>Falcon AI · incident assistant</span><button type="button" data-action="chat" style="color:#fff">✕</button></p>
      <div class="fs-chat__log" data-fs="chatlog" data-lenis-prevent><p class="fs-chat__msg fs-chat__msg--ai">Hi — ask me about the incidents on screen. Answers come from the same data, with the reasoning shown.</p></div>
      <p class="fs-chat__chips">${['Why this recommendation?', 'How long until SLA?', 'Top root causes'].map(q => `<button type="button" data-action="ask" data-v="${q}">${q}</button>`).join('')}</p>
      <form data-fs="chatform"><input name="q" placeholder="Ask about a ticket, IP or cause…" autocomplete="off"><button type="submit" class="fs-btn fs-btn--sm fs-btn--red">Send</button></form>`;
  };
  const ask = (q: string) => {
    const log = $('chatlog'); if (!log) return;
    log.insertAdjacentHTML('beforeend', `<p class="fs-chat__msg fs-chat__msg--me">${esc(q)}</p>`);
    setTimeout(() => { log.insertAdjacentHTML('beforeend', `<p class="fs-chat__msg fs-chat__msg--ai">${esc(chatAnswer(q))}</p>`); log.scrollTop = log.scrollHeight; }, 450);
    log.scrollTop = log.scrollHeight;
  };

  // -------------------------------------------------------------- time window controls
  // the dropdowns are filled from the backend's options
  const fillSelects = () => {
    const o = S.options; if (!o) return;
    const d = (k: string) => $<HTMLSelectElement>(k);
    d('range').innerHTML = o.ranges.map(r => `<option value="${r.value}" ${r.value === S.win.day ? 'selected' : ''}>${r.label}</option>`).join('');
    d('sh').innerHTML = o.hours.map(h => `<option ${h === S.win.sh ? 'selected' : ''}>${h}</option>`).join('');
    d('eh').innerHTML = o.hours.map(h => `<option ${h === S.win.eh ? 'selected' : ''}>${h}</option>`).join('');
    d('sm').innerHTML = o.minutes.map(m => `<option ${m === S.win.sm ? 'selected' : ''}>${m}</option>`).join('');
    d('em').innerHTML = o.minutes.map(m => `<option ${m === S.win.em ? 'selected' : ''}>${m}</option>`).join('');
    labels();
  };
  const labels = () => {
    const { start } = windowRange(S.win);
    $('range-label').innerHTML = `${dShort(start)} <img src="/falcon-screen/arrow.svg" width="14" height="12" alt=""> ${dShort(start)}`;
    $('sh-label').textContent = `${pad(S.win.sh)}:00`; $('sm-label').textContent = `:${pad(S.win.sm)}`;
    $('eh-label').textContent = `${pad(S.win.eh)}:00`; $('em-label').textContent = `:${pad(S.win.em)}`;
  };

  // -------------------------------------------------------------- loading: skeletons, then each section as it exists
  // the screen asks the backend for the window and shows skeletons until it answers; then each section fills in
  // as soon as its part is ready (the KPIs first, the recommendation and the root cause table last)
  const pull = async () => {
    if (S.loading) return;
    S.loading = true; S.hist = S.win.day !== 0; closePage();
    root.querySelector('.fs-pull')?.classList.add('is-busy');
    renderNote(); renderKpis(true); renderRecent(true); renderRegion(true); renderRec(true); renderRct(true);
    const tickets = await falconApi.pull({ ...S.win });
    S.tickets = tickets;
    const steps: [number, () => void][] = [
      [0, () => renderKpisFromView()],
      [180, () => renderRecent()],
      [360, () => renderRegion()],
      [560, () => { S.scored = scoreAll(tickets); renderRec(false, true); }],
      [760, () => { S.updated = new Date(); renderRct(); S.loading = false; root.querySelector('.fs-pull')?.classList.remove('is-busy'); syncThumb(); }],
    ];
    steps.forEach(([ms, f]) => timers.push(window.setTimeout(f, ms)));
  };
  const rerender = () => { renderKpisFromView(); renderRecent(); renderRegion(); renderRct(); renderFilters(); if (S.page === 'causes') causesPage(); };
  // a new selection is a new query: the affected sections show their loading state briefly, then the result
  let refreshTimer = 0;
  const refresh = () => {
    renderKpisFromView(); renderFilters();
    renderRecent(true); renderRegion(true); renderRct(true);
    clearTimeout(refreshTimer); refreshTimer = window.setTimeout(rerender, 420);
  };
  // the KPI cards count every priority (a selected card filters the rest of the screen, not the cards)
  const renderKpisFromView = () => {
    const vs = S.tickets.filter(t => (!S.filters.circle || t.circle === S.filters.circle) && (!S.filters.category || t.problem === S.filters.category));
    const c = countBy(vs, t => t.priority); const g = (p: string) => c.find(x => x[0] === p)?.[1] || 0;
    S.kpi = { P1: g('P1'), P2: g('P2'), P3: g('P3'), HPSM: vs.length }; renderKpis();
  };

  // -------------------------------------------------------------- search (falcon_v11 nav_search: IP / TT ID / device)
  const search = (raw: string) => {
    const q = raw.trim();
    const input = root.querySelector<HTMLInputElement>('.fs-search__input')!;
    input.value = q;
    root.querySelector<HTMLElement>('.fs-search__clear')!.hidden = !q;
    S.query = q; S.rctPage = 0;
    renderRecent(); renderRct();
    if (q) workbench(q); else closePage();
  };

  // -------------------------------------------------------------- events
  root.addEventListener('click', e => {
    const el = (e.target as Element).closest<HTMLElement>('[data-action]');
    if (!el || !S.live) return;
    const a = el.dataset.action, v = el.dataset.v ?? '';
    const t = el.dataset.id ? S.tickets.find(x => x.number === el.dataset.id) : undefined;
    switch (a) {
      case 'sidebar': $('side').classList.toggle('is-open'); break;
      case 'page': $('side').classList.remove('is-open');
        if (el.dataset.page === 'home') closePage();
        else if (el.dataset.page === 'causes') causesPage();
        else if (el.dataset.page === 'workbench') workbench(S.query);
        else if (el.dataset.page === 'wan') { closePage(); S.rctMode = 'wan'; renderRct(); toRct(); }
        break;
      case 'filters': { const f = $('filters'); f.hidden = !f.hidden; $('help').hidden = true; renderFilters(); break; }
      case 'kpi': S.filters.priority = v === 'HPSM' || S.filters.priority === v ? '' : v; refresh(); break;
      case 'filters-clear': S.filters = { circle: '', priority: '', category: '' }; refresh(); break;
      case 'filter-circle': S.filters.circle = S.filters.circle === v ? '' : v; refresh(); break;
      case 'filter-cause': S.filters.category = S.filters.category === v ? '' : v; refresh(); break;
      case 'help': { const h = $('help'); h.hidden = !h.hidden; $('filters').hidden = true; h.innerHTML = `<p style="font-size:14px;margin-bottom:6px">Using Falcon</p>Search a TT ID, IP or device to pull every source into one investigation. The recommendation card shows the incident to look at first and why. Pick a past date and Pull Data for a historical view.`; break; }
      case 'profile': toast('Signed in as noc.engineer@vodafoneidea.com', true, 2500); break;
      case 'logout': toast('This is a demo — the real Falcon signs you out through the corporate directory.', false, 3500); break;
      case 'pull': root.querySelector('.fs-pull')?.classList.remove('is-ready'); pull(); break;
      case 'live': S.win = { ...S.win, day: 0 }; { const n = new Date(); S.win.sh = Math.max(0, n.getHours() - 1); S.win.eh = n.getHours(); } fillSelects(); pull(); break;
      case 'search': search(v); break;
      case 'clear-search': search(''); break;
      case 'investigate': if (t) search(t.number); break;
      case 'topology': closePage(); S.rctMode = 'wan'; renderRct(false, t); toRct(); break;
      case 'close-page': closePage(); break;
      case 'iw-tab': root.querySelectorAll<HTMLElement>('[data-iw]').forEach(p => (p.hidden = p.dataset.iw !== v)); el.parentElement!.querySelectorAll('button').forEach(b => b.classList.toggle('is-on', b === el)); break;
      case 'dismiss': {
        e.stopPropagation();
        S.dismissed.push(el.dataset.id!);
        renderRec(false, true);
        toast(`Dismissed ${esc(el.dataset.id)} from recommendations. <button type="button" data-action="undo" data-id="${esc(el.dataset.id)}">Undo</button>`);
        break;
      }
      case 'undo': S.dismissed = S.dismissed.filter(n => n !== el.dataset.id); renderRec(false, true); $('toast').innerHTML = ''; break;
      case 'clusters': S.rctMode = S.rctMode === 'clusters' ? 'table' : 'clusters'; renderRct(); break;
      case 'wan': S.rctMode = 'wan'; renderRct(); break;
      case 'wan-back': S.rctMode = 'table'; renderRct(); break;
      case 'wan-node': if (t) { $('wan-info').innerHTML = wanInfo(t); } break;
      case 'rct-page': S.rctPage += +v; renderRct(); break;
      case 'rct-refresh': el.classList.remove('is-spin'); void el.offsetWidth; el.classList.add('is-spin'); S.updated = new Date(); renderRct(); break;
      case 'export': {
        const rows = visible().map(x => [x.number, x.priority, x.status, dTime(x.open), x.ip ?? '', x.device, x.problem, x.circle]);
        const sep = v === 'xls' ? '\t' : ',';
        const text = [['TT ID', 'PRIORITY', 'STATUS', 'OPEN TIME', 'IP ADDRESS', 'DEVICE NAME', 'PROBLEM', 'CIRCLE'], ...rows].map(r => r.join(sep)).join('\n');
        const a2 = document.createElement('a');
        a2.href = URL.createObjectURL(new Blob([text], { type: v === 'xls' ? 'application/vnd.ms-excel' : 'text/csv' }));
        a2.download = `falcon-root-cause-table.${v === 'xls' ? 'xls' : 'csv'}`; a2.click(); URL.revokeObjectURL(a2.href);
        toast(`Exported ${rows.length} tickets (${v === 'xls' ? 'Excel' : 'CSV'})`, true, 2500);
        break;
      }
      case 'chat': openChat(); break;
      case 'ask': ask(v); break;
    }
  });
  root.addEventListener('submit', e => {
    e.preventDefault();
    if (!S.live) return;
    const f = e.target as HTMLFormElement;
    const q = (f.elements.namedItem('q') as HTMLInputElement).value;
    if (f.dataset.fs === 'search') { closeMenu(); search(q); }
    if (f.dataset.fs === 'chatform' && q.trim()) { ask(q.trim()); f.reset(); }
  });
  root.addEventListener('change', e => {
    const el = e.target as HTMLSelectElement;
    if (!S.live) return;
    if (el.dataset.filter) { (S.filters as any)[el.dataset.filter] = el.value; refresh(); return; }
    const k = el.dataset.fs;
    if (k === 'range') S.win.day = +el.value; else if (k === 'sh' || k === 'sm' || k === 'eh' || k === 'em') (S.win as any)[k] = +el.value;
    labels();
    root.querySelector('.fs-pull')?.classList.add('is-ready');                // Pull Data glows: the window changed
  });
  // the dashboard's own scrollbar (Figma draws one at the right edge)
  const syncThumb = () => {};                              // the screen shows no scrollbar

  // ---- menus: the date and time pills, and suggestions under the search box ----
  let menu: HTMLElement | null = null;
  const closeMenu = () => { menu?.remove(); menu = null; };
  const openMenu = (anchor: HTMLElement, title: string, items: { label: string; value: string; on?: boolean }[], pick: (v: string) => void) => {
    closeMenu();
    const canvas = $('canvas'), a = anchor.getBoundingClientRect(), c = canvas.getBoundingClientRect(), k = c.width / canvas.offsetWidth || 1;
    menu = document.createElement('div');
    menu.className = 'fs-menu';
    menu.style.left = `${(a.left - c.left) / k}px`;
    menu.style.top = `${(a.bottom - c.top) / k + 6}px`;
    menu.innerHTML = `<p class="fs-menu__title">${title}</p>` + items.map(i => `<button type="button" data-v="${esc(i.value)}" class="${i.on ? 'is-on' : ''}">${esc(i.label)}</button>`).join('');
    menu.addEventListener('mousedown', e => e.preventDefault());       // keep focus in the search box
    menu.addEventListener('click', e => {
      const b = (e.target as Element).closest<HTMLElement>('button[data-v]'); if (!b) return;
      e.stopPropagation(); const v = b.dataset.v!; closeMenu(); pick(v);
    });
    canvas.appendChild(menu);
  };
  // a pill opens its own menu, built from the hidden select the backend filled
  const TITLES: Record<string, string> = { range: 'Date range', sh: 'Start hour', sm: 'Start minute', eh: 'Stop hour', em: 'Stop minute' };
  root.querySelectorAll<HTMLElement>('.fs-pill--range, .fs-pill__sel').forEach(el => el.addEventListener('click', e => {
    if (!S.live) return;
    e.preventDefault(); e.stopPropagation();
    const sel = el.querySelector('select')!, k = sel.dataset.fs!;
    const label = (v: string, text: string) => (k === 'sh' || k === 'eh' ? `${pad(+v)}:00` : k === 'sm' || k === 'em' ? `:${pad(+v)}` : text);
    openMenu(el, TITLES[k], [...sel.options].map(o => ({ label: label(o.value, o.text), value: o.value, on: o.selected })),
      v => { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); });
  }));
  // the search box offers five IPs as soon as it is focused, narrowing as you type
  const qInput = $<HTMLInputElement>('q');
  const suggest = () => {
    if (!S.live) return;
    const t = qInput.value.trim().toLowerCase();
    const ips = falconApi.suggestions(S.tickets).filter(ip => ip.includes(t));
    if (!ips.length) { closeMenu(); return; }
    openMenu($('search'), 'IP addresses', ips.map(ip => ({ label: ip, value: ip })), v => search(v));
  };
  qInput.addEventListener('focus', suggest);
  qInput.addEventListener('input', suggest);
  qInput.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  root.addEventListener('click', e => { if (menu && !(e.target as Element).closest('.fs-menu, .fs-search')) closeMenu(); }, true);

  // -------------------------------------------------------------- the poster: the Figma frame, still
  const poster = () => {
    S.tickets = falconApi.pullNow(S.win); S.scored = scoreAll(S.tickets);
    renderNote(); renderKpis(); renderRecent(); renderRegion();
    // the Figma values for the still frame
    const fig: Record<string, string> = { P1: '51', P2: '280', P3: '107', HPSM: '438' };
    root.querySelectorAll<HTMLElement>('[data-kpi]').forEach(c => (c.querySelector('.fs-kpi__value')!.textContent = fig[c.dataset.kpi!]));
    // the region panel and the recommendation, exactly as drawn in Figma
    $('region').innerHTML = `<p class="fs-card__title">Region Wise Activity</p><div style="margin-top:12px">${[['KAR', 144], ['MPCG', 121], ['MUM', 93]].map(([c, n]) => `<p class="fs-region__row"><span>${c}</span><span>${n}</span></p>`).join('')}</div>
      <div class="fs-divider"></div><p class="fs-card__title" style="line-height:25px">Common IPs HPSM &amp;<br>Session</p><ul class="fs-region__ips"><li>203.0.113.93</li></ul>
      <div class="fs-divider" style="margin:16px 0 0"></div><div class="fs-causes"><p class="fs-causes__title">TOP ROOT CAUSES</p>${[['ThresholdCrossed', 258, 100], ['High CPU', 82, 33], ['Link Down', 57, 24], ['Fibre Cut', 57, 24], ['PAC Input fail', 56, 23]].map(([c, n, w]) => `<div class="fs-cause"><span>${c}</span><b>${n}</b><i style="--w:${w}%"></i></div>`).join('')}</div>`;
    renderRec();
    const card = $('rec');
    card.querySelector('.fs-rec__of')!.textContent = '#1 of 894 active incidents evaluated';
    card.querySelector('.fs-attn')!.innerHTML = '<p>⚠ Immediate Attention</p><p>• SLA expires in 14 minutes</p><p>• High business impact</p>';
    card.querySelector('.fs-why')!.innerHTML = '<p class="fs-label" style="display:block">Why Falcon recommends this</p><p>Highest active priority incident</p><p>SLA expires in 14 minutes</p><p>High customer impact</p>';
    card.querySelectorAll('.fs-rec__grid > div')[3].querySelector('p:last-child')!.textContent = '20-Jul 12:27:41';
    const timer = $('timer'); if (timer) { delete timer.dataset.deadline; timer.textContent = '-02:08:44'; }
    renderRct();
    $('range-label').innerHTML = '20 Jul <img src="/falcon-screen/arrow.svg" width="14" height="12" alt=""> 20 Jul';
    $('sh-label').textContent = '11:00'; $('sm-label').textContent = ':15'; $('eh-label').textContent = '12:00'; $('em-label').textContent = ':15';
    $('rct').querySelector('.fs-rct__updated')!.textContent = '·  Updated 12:27 PM';
    syncThumb();
  };
  poster();

  return {
    // "See in motion": the screen comes alive
    play() {
      if (S.live) return;
      S.live = true;
      root.classList.remove('is-poster');
      // only the loading is shown; from then on the screen is the visitor's: nothing changes unless they ask for it
      pull();
      falconApi.options().then(o => { S.options = o; fillSelects(); renderUsers(); renderFilters(); });
      timers.push(window.setInterval(tickTimer, 1000));                // the SLA countdown is a clock, so it runs
    },
    get live() { return S.live; },
  };
}

// ------------------------------------------------------------------ boot every screen on the page
const screens = new Map<HTMLElement, ReturnType<typeof mount>>();
export function mountFalconScreens() {
  document.querySelectorAll<HTMLElement>('[data-falcon-screen]').forEach(el => { if (!screens.has(el)) screens.set(el, mount(el)); });
}
export function playFalcon(el: HTMLElement) { (screens.get(el) ?? (mountFalconScreens(), screens.get(el)))?.play(); }
(window as any).__falcon = { play: playFalcon };
