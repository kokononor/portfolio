// The pictures the Falcon film (scripts/falcon-film.ts) is built from, as HTML that is drawn into textures.
//
// The dashboard is the final Falcon screen, Figma "falcon-motion" 1:2 (1600 × 814), here 1600 × 900 so it fills a
// 16:9 display (the page simply shows more of the Root Cause Table, as it would on a taller window). Its palette,
// DM Sans and the coordinates are the frame's; the sample data is the site's anonymised set (data/falcon-mock.ts:
// documentation IPs, DEMO_ device names) rather than the frame's network addresses.
//
// Every part that moves on its own in the film (top bar, sidebar, each KPI card, each card, each table row) carries a
// data-layer and is drawn into its own texture. The five "sources" of the opening are separate small panels.
import dmSansUrl from '@fontsource-variable/dm-sans/files/dm-sans-latin-opsz-normal.woff2?url';
import dmMonoUrl from '@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2?url';

export type Rect = [number, number, number, number];   // x, y, w, h in the screen's native px
export const SCREEN_W = 1600, SCREEN_H = 900;

const I = (n: string) => `/falcon-screen/${n}.svg`;

// ------------------------------------------------------------------ the dashboard
const rowYs = [106, 165, 244, 304, 364];
const dividers = [94, 154, 233, 293, 353, 413];
const rows = [
  { id: ['EN_IM_200720', '26_930283'], t: 'EN', ip: '192.0.2.171', dev: ['DEMO_WST_EDG', 'E_RTR903'] },
  { id: ['SN_IM_200720', '26_931164'], t: 'SN', ip: '198.51.100.136', dev: ['DEMO_CEN_4G_', 'RING_604'] },
  { id: ['SN_IM_200720', '26_931033'], t: 'SN', ip: 'None', dev: ['DEMO_UPE_SVR05'] },
  { id: ['SN_IM_200720', '26_931207'], t: 'SN', ip: '203.0.113.2', dev: ['DEMO_NE_2G_RI', 'NG_782'] },
  { id: ['EN_IM_200720', '26_930751'], t: 'EN', ip: '203.0.113.76', dev: ['DEMO_WST_NIXR6'] },
];
const kpis = [
  { label: 'Active P1', n: 51, x: 88, bg: 'linear-gradient(90deg, #f03333, #f76b29 55%, #fcad17)', chip: true },
  { label: 'Active P2', n: 280, x: 290, bg: '#f0a30a' },
  { label: 'Active P3', n: 107, x: 493, bg: '#5b5ceb' },
  { label: 'HPSM Tickets', n: 438, x: 695, bg: '#17b39b' },
];
export const CAUSES: [string, number, number][] = [['ThresholdCrossed', 258, 172], ['High CPU', 82, 57], ['Link Down', 57, 41], ['Fibre Cut', 57, 41], ['PAC Input fail', 56, 40]];
const sideIcons: [string, number][] = [['cluster', 72], ['building', 120], ['analytics', 169], ['settings', 216], ['help', 571], ['profile', 612], ['logout', 655]];
const br = (a: string[]) => a.join('<br/>');

export const LAYERS: Record<string, Rect> = {
  base: [0, 0, 1600, 900],
  top: [16, 14, 1552, 66],
  side: [12, 100, 56, 700],
  kpi0: [88, 124, 187, 99], kpi1: [290, 124, 187, 99], kpi2: [493, 124, 187, 99], kpi3: [695, 124, 187, 99],
  recent: [88, 238, 794, 434],
  region: [900, 90, 258, 497],
  rec: [1176, 86, 388, 760],
  rct: [88, 690, 1070, 180],
  chat: [1483, 716, 88, 88],
  ...Object.fromEntries(rowYs.map((_, i) => [`row${i}`, [89, 238 + dividers[i] + 1, 792, dividers[i + 1] - dividers[i] - 1] as Rect])),
};
// each part's corner radius (px), so the glass slab under it has the same shape
export const RADIUS: Record<string, number> = { top: 33, side: 14, kpi0: 8, kpi1: 8, kpi2: 8, kpi3: 8, recent: 12, region: 12, rec: 12, rct: 12 };
export const FRAG_RADIUS = 10;
// the root-cause bars are drawn by the film itself, so they can grow: their place on the screen
export const BARS: Rect[] = CAUSES.map(([, , w], i) => [900 + 16 + 12, 90 + 288 + 37 + i * 29.6 + 17, w, 3]);

export function dashboardHtml() {
  const kpiHtml = kpis.map((k, i) => `<div class="fd-kpi" data-layer="kpi${i}" style="left:${k.x}px;background:${k.bg}">
    <p class="fd-kpi__label">${k.label}${k.chip ? '<span class="fd-kpi__chip">• Critical</span>' : ''}</p><p class="fd-kpi__n">${k.n}</p></div>`).join('');
  const rowHtml = rows.map((r, i) => `<div class="fd-row" data-layer="row${i}" style="top:${rowYs[i]}px">
    <p style="left:35px">${br(r.id)}</p>
    <span class="fd-chip ${r.t === 'EN' ? 'fd-chip--en' : 'fd-chip--sn'}" style="left:160px">${r.t}</span>
    <span class="fd-chip fd-chip--p3" style="left:285px">• P3 (MAJ)</span>
    <span class="fd-chip fd-chip--st" style="left:410px">• Open</span>
    <p style="left:534px">${r.ip}</p><p style="left:659px">${br(r.dev)}</p></div>`).join('');
  return `<div class="fd">
  <span class="fd__bg" data-layer="base"></span>
  <p class="fd-note" data-layer="base">(KPI data refreshes every 30 seconds)</p>
  <span class="fd-scroll" data-layer="base"><i></i></span>
  <div class="fd-top" data-layer="top">
    <img class="fd-a" style="left:17px;top:23px" src="${I('menu')}" width="30" height="18"/>
    <p class="fd-a fd-top__logo">Falcon</p><p class="fd-a fd-top__sub">NOC Intelligence</p>
    <div class="fd-a fd-search"><img src="${I('search')}" width="18" height="18" style="left:11px;top:14px"/><span>Search TT ID, IP, Device Name</span><img src="${I('search-go')}" width="20" height="20" style="left:206px;top:13px"/></div>
    <span class="fd-a fd-top__dash"></span><p class="fd-a fd-top__users">TOTAL UNIQUE<br/>USERS</p>
    <div class="fd-a fd-pill" style="left:865px;width:170px;padding:0 22px;justify-content:space-between;font-size:13px"><span style="display:flex;gap:10px;align-items:center">20 Jul <img src="${I('arrow')}" width="14" height="12"/> 20 Jul</span><img src="${I('chevron')}" width="10" height="6"/></div>
    <div class="fd-a fd-pill fd-pill--t" style="left:1042px;width:191px"><b>START</b><span>11:00</span><img src="${I('chevron')}" width="10" height="6"/><span style="margin-left:18px">:15</span><img src="${I('chevron')}" width="10" height="6"/></div>
    <div class="fd-a fd-pill fd-pill--t" style="left:1240px;width:187px"><b>STOP</b><span>12:00</span><img src="${I('chevron')}" width="10" height="6"/><span style="margin-left:18px">:15</span><img src="${I('chevron')}" width="10" height="6"/></div>
    <p class="fd-a fd-pull">PULL DATA</p>
  </div>
  <div class="fd-side" data-layer="side">
    <span class="fd-side__on"><img src="${I('home')}" width="22" height="22"/></span>
    ${sideIcons.map(([n, y]) => `<img class="fd-side__i" style="top:${y}px" src="${I(n)}" width="22" height="22"/>`).join('')}
  </div>
  ${kpiHtml}
  <div class="fd-card fd-recent" data-layer="recent">
    <p class="fd-title" style="left:22px;top:22px">Recent Activity</p>
    ${[['TT ID', 34], ['TYPE', 159], ['PRIORITY', 284], ['STATUS', 409], ['IP ADDRESS', 533], ['DEVICE NAME', 658]].map(([h, x]) => `<p class="fd-th" style="left:${x}px">${h}</p>`).join('')}
    ${dividers.map(y => `<span class="fd-div" style="top:${y}px"></span>`).join('')}
    ${rowHtml}
  </div>
  <div class="fd-card fd-region" data-layer="region">
    <p class="fd-title" style="left:15px;top:18px">Region Wise Activity</p>
    ${[['KAR', 144], ['MPCG', 121], ['MUM', 93]].map(([c, n], i) => `<p class="fd-region__row" style="top:${61 + i * 33}px"><span>${c}</span><span>${n}</span></p>`).join('')}
    <span class="fd-div" style="left:15px;width:226px;top:158px"></span>
    <p class="fd-title" style="left:15px;top:176px;line-height:25px">Common IPs HPSM &amp;<br/>Session</p>
    <p class="fd-region__ip"><i></i>203.0.113.93</p>
    <span class="fd-div" style="left:15px;width:226px;top:271px"></span>
    <div class="fd-causes"><p class="fd-causes__title">TOP ROOT CAUSES</p>
      ${CAUSES.map(([c, n], i) => `<div class="fd-cause" style="top:${37 + i * 29.6}px"><span>${c}</span><b>${n}</b><i></i></div>`).join('')}
    </div>
  </div>
  <div class="fd-card fd-rec" data-layer="rec">
    <p class="fd-rec__title">Recommended Investigation</p>
    <div class="fd-rec__card">
      <p class="fd-a fd-rec__eye" style="left:16px;top:24px">INVESTIGATE FIRST</p>
      <p class="fd-a" style="left:16px;top:55px;font-size:14px">SN_IM_20072026_925415</p>
      <span class="fd-a fd-rec__chip" style="left:264px;top:54px">• P1 (EME)</span>
      <p class="fd-a fd-rec__rank" style="left:16px;top:84px">Highest Ranked Incident</p>
      <p class="fd-a fd-label" style="left:16px;top:107px;letter-spacing:0">#1 of 894 active incidents evaluated</p>
      <p class="fd-a fd-label" style="left:16px;top:136px">SLA REMAINING</p>
      <p class="fd-a fd-rec__timer" style="left:16px;top:148px">-02:08:44</p>
      <div class="fd-a fd-attn" style="left:16px;top:192px"><p>⚠ Immediate Attention</p><p>• SLA expires in 14 minutes</p><p>• High business impact</p></div>
      <p class="fd-a fd-label" style="left:16px;top:295px">WHY FALCON RECOMMENDS THIS</p>
      ${['Highest active priority incident', 'SLA expires in 14 minutes', 'High customer impact'].map((w, i) => `<p class="fd-a fd-why" style="left:16px;top:${317 + i * 25}px"><i>✓</i>${w}</p>`).join('')}
      <span class="fd-a fd-div" style="left:16px;width:314px;top:402px"></span>
      <p class="fd-a fd-label" style="left:16px;top:419px">PRIMARY IMPACTED CIRCLE</p>
      <p class="fd-a fd-rec__v is-net" style="left:16px;top:436px">KAR</p>
      <p class="fd-a fd-label" style="left:178px;top:417px;width:110px">MOST PROBABLE ROOT CAUSE</p>
      <p class="fd-a fd-rec__v" style="left:178px;top:451px">PAC Input fail</p>
      <p class="fd-a fd-label" style="left:16px;top:482px">PRIMARY AFFECTED DEVICE</p>
      <p class="fd-a fd-rec__v is-net" style="left:16px;top:499px">KAR_VERTIVE_GFSU_MIC</p>
      <p class="fd-a fd-label" style="left:178px;top:480px;width:96px">RECOMMENDATION GENERATED</p>
      <p class="fd-a fd-rec__v" style="left:178px;top:514px">20-Jul 12:27:41</p>
    </div>
    <p class="fd-a fd-rec__dismiss">✕ Dismiss Recommendation</p>
  </div>
  <div class="fd-card fd-rct" data-layer="rct">
    <p class="fd-a fd-rct__title">Root Cause Table</p>
    <img class="fd-a" style="left:278px;top:33px" src="${I('refresh')}" width="16" height="16"/>
    <p class="fd-a fd-rct__upd">·&#160; Updated 12:27 PM</p>
    <p class="fd-a fd-btn" style="left:669px;top:23px;width:132px"><img src="${I('cluster-view')}" width="16" height="16"/>Cluster View</p>
    <p class="fd-a fd-btn fd-btn--red" style="left:810px;top:23px;width:236px">Wan Link Explorer (Digital Twin) ↗</p>
    <p class="fd-a" style="left:22px;top:84px;font-size:14px">HPSM</p>
    <p class="fd-a fd-btn fd-btn--sm" style="left:907px;top:80px;width:64px"><img src="${I('download')}" width="8" height="10"/>CSV</p>
    <p class="fd-a fd-btn fd-btn--sm" style="left:977px;top:80px;width:69px"><img src="${I('download')}" width="8" height="10"/>Excel</p>
  </div>
  <div class="fd-chat" data-layer="chat"><img src="${I('chat-button')}" width="88" height="88" style="left:0;top:0"/><img src="${I('chat')}" width="28" height="26" style="left:30px;top:24px"/></div>
</div>`;
}

const DASH_CSS = `
.fd { position: absolute; left: 0; top: 0; width: 1600px; height: 900px; color: #1e1e1e; font-family: DMS, sans-serif; font-variation-settings: 'opsz' 14;
  font-weight: 400; font-size: 12.5px; line-height: normal; -webkit-font-smoothing: antialiased; }
.fd * { box-sizing: border-box; margin: 0; font-weight: inherit; }
.fd img { display: block; max-width: none; }
.fd [data-layer] { visibility: hidden; }
.fd__bg { position: absolute; inset: 0; background: #f3f1ee; }
.fd-a, .fd-top > *, .fd-search > img, .fd-chat > img { position: absolute; }
.fd-top { position: absolute; left: 16px; top: 14px; width: 1552px; height: 66px; border-radius: 33px; background: #faf6f1; border: 1px solid #eee7de;
  box-shadow: 0 4px 7px rgba(102, 77, 51, .08); }
.fd-top__logo { left: 61px; top: 17px; font-size: 23px; color: #e8392e; }
.fd-top__sub { left: 135px; top: 26px; font-size: 14px; color: #2b2b2b; }
.fd-search { left: 245px; top: 9px; width: 240px; height: 48px; border-radius: 24px; background: #fff; border: 1px solid #ece6de; }
.fd-search span { position: absolute; left: 44px; top: 15px; width: 150px; overflow: hidden; white-space: nowrap; font-size: 12px; color: #555; }
.fd-top__dash { left: 496px; top: 32px; width: 14px; height: 2px; background: #e8392e; }
.fd-top__users { left: 518px; top: 22px; font-size: 8.5px; line-height: 11px; font-weight: 600; color: #555; }
.fd-pill { top: 10px; height: 46px; border-radius: 23px; background: #fff; display: flex; align-items: center; }
.fd-pill--t { padding: 0 10px; gap: 8px; font-size: 10.5px; font-weight: 600; }
.fd-pill--t b { width: 40px; font-size: 10px; font-weight: 700; }
.fd-pull { left: 1434px; top: 18px; width: 102px; height: 29px; border-radius: 6px; background: #e8392e; color: #fff; font-size: 12px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; }
.fd-side { position: absolute; left: 12px; top: 100px; width: 56px; height: 700px; border-radius: 14px; background: #f7f5f2; border: 1px solid #ece8e2; }
.fd-side__on { position: absolute; left: 7px; top: 14px; width: 40px; height: 40px; border-radius: 10px; background: #fff; box-shadow: 0 2px 3px rgba(0, 0, 0, .1); }
.fd-side__on img { position: absolute; left: 9px; top: 9px; }
.fd-side__i { position: absolute; left: 16px; }
.fd-note { position: absolute; left: 90px; top: 87px; font-size: 11px; color: #666; }
.fd-kpi { position: absolute; top: 124px; width: 187px; height: 99px; border-radius: 8px; color: #fff; padding: 18px 17px; }
.fd-kpi__label { display: flex; align-items: center; gap: 6px; height: 20px; font-size: 12px; font-weight: 500; }
.fd-kpi__chip { padding: 2px 7px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, .6); background: rgba(255, 255, 255, .18); font-size: 10.5px; }
.fd-kpi__n { margin-top: 2px; font-size: 34px; font-weight: 300; letter-spacing: -1.02px; line-height: 44px; }
.fd-card { position: absolute; background: #fff; border: 1px solid #e6e2dc; border-radius: 12px; }
.fd-card > * { position: absolute; }
.fd-title { font-size: 20px; }
.fd-recent { left: 88px; top: 238px; width: 794px; height: 434px; }
.fd-th { top: 67px; font-size: 10.5px; letter-spacing: .63px; color: #555; }
.fd-div { left: 22px; width: 749px; height: 1px; background: #ece9e4; }
.fd-row { left: 0; width: 792px; height: 50px; }
.fd-row > * { position: absolute; top: 0; }
.fd-row p { font-size: 12.5px; line-height: 19px; }
.fd-chip { display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 12px; border: 1px solid; font-size: 10.5px; white-space: nowrap; }
.fd-chip--en { background: #e6f6ec; border-color: #bfe6cc; color: #1e8e4e; font-weight: 700; padding: 0 7px; }
.fd-chip--sn { background: #e5eeff; border-color: #bfd3fa; color: #2d63d8; font-weight: 700; padding: 0 7px; }
.fd-chip--p3 { background: #eef0ff; border-color: #c9ccf5; color: #4b54d1; }
.fd-chip--st { background: #f1efec; border-color: #e3dfd9; color: #555; }
.fd-region { left: 900px; top: 90px; width: 258px; height: 497px; }
.fd-region__row { left: 15px; width: 226px; display: flex; justify-content: space-between; font-size: 14px; color: #444; }
.fd-region__ip { left: 19px; top: 242px; display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: #444; }
.fd-region__ip i { width: 4px; height: 4px; border-radius: 50%; background: #444; }
.fd-causes { left: 15px; top: 287px; width: 226px; height: 188px; border-radius: 8px; background: #f7f5f2; border: 1px solid #e3dfd9; }
.fd-causes > * { position: absolute; }
.fd-causes__title { left: 12px; top: 12px; font-size: 11px; font-weight: 600; letter-spacing: .33px; color: #444; }
.fd-cause { left: 12px; width: 201px; height: 22px; }
.fd-cause span { position: absolute; left: 0; top: 0; font-size: 11px; }
.fd-cause b { position: absolute; right: 0; top: 3px; font-size: 10.5px; color: #777; }
.fd-cause i { position: absolute; left: 0; top: 17px; width: 172px; height: 3px; border-radius: 2px; background: #e9e5e0; }
.fd-rec { left: 1176px; top: 86px; width: 388px; height: 760px; }
.fd-rec__title { left: 19px; top: 19px; font-size: 16px; }
.fd-rec__card { left: 20px; top: 41px; width: 346px; height: 548px; border-radius: 10px; border: 1px solid #d3ece7; background: #fff; }
.fd-rec__eye { font-size: 9.5px; font-weight: 500; letter-spacing: .57px; color: #e8392e; }
.fd-rec__chip { padding: 3px 9px; border-radius: 12px; background: #f1efec; font-size: 10.5px; color: #777; }
.fd-rec__rank { font-size: 13.5px; color: #12a08a; }
.fd-label { font-size: 9.5px; letter-spacing: .57px; color: #8a8a8a; line-height: 15px; }
.fd-rec__timer { font-size: 20px; color: #e8392e; }
.fd-attn { width: 314px; height: 85px; padding: 10px 11px; border-radius: 6px; background: #fff7e3; border: 1px solid #f3d27c; }
.fd-attn p:first-child { color: #d9770a; font-size: 11px; margin-bottom: 8px; }
.fd-attn p + p { color: #5a4a1c; font-size: 12px; margin-bottom: 5px; }
.fd-why { display: flex; gap: 4px; font-size: 12.5px; color: #333; }
.fd-why i { font-style: normal; color: #12a08a; }
.fd-rec__v { font-size: 12.5px; }
.fd-rec__v.is-net { color: #3d5bd9; font-size: 12px; }
.fd-rec__dismiss { left: 223px; top: 599px; font-size: 11px; color: #8a8a8a; }
.fd-rct { left: 88px; top: 690px; width: 1070px; height: 180px; }
.fd-rct__title { left: 22px; top: 18px; font-size: 34px; letter-spacing: -.68px; font-variation-settings: 'opsz' 32; }
.fd-rct__upd { left: 304px; top: 32px; font-size: 14px; color: #666; white-space: pre; }
.fd-btn { height: 36px; display: flex; align-items: center; justify-content: center; gap: 6px; border-radius: 6px; border: 1px solid #cfcac3; font-size: 13px; }
.fd-btn--red { background: #e8392e; border-color: #e8392e; color: #fff; font-weight: 500; }
.fd-btn--sm { height: 26px; font-size: 12px; color: #333; }
.fd-chat { position: absolute; left: 1483px; top: 716px; width: 88px; height: 88px; }
.fd-scroll { position: absolute; left: 1586px; top: 0; width: 14px; height: 900px; background: #f1f1f1; }
.fd-scroll i { position: absolute; left: 3px; top: 16px; width: 8px; height: 340px; border-radius: 4px; background: #a8a8a8; }`;

// ------------------------------------------------------------------ the five sources (changelog, Feature 2: HPSM
// tickets, network topology, sessions, syslog, VIPAM, each searched in its own tab before the redesign)
export const FRAG_SIZE: [number, number][] = [[470, 210], [330, 290], [380, 170], [500, 200], [300, 140]];
const fragHead = (a: string, b: string) => `<p class="fr-head"><span>${a}</span><span>${b}</span></p>`;
export const FRAGMENTS = [
  fragHead('HPSM · Tickets', 'Tab 1 / 5') + [['SN_IM_20072026_925415', 'P1'], ['EN_IM_20072026_930283', 'P3'], ['SN_IM_20072026_931164', 'P3'], ['SN_IM_20072026_931033', 'P3']]
    .map(([n, p]) => `<p class="fr-row"><span>${n}</span><b class="fr-chip${p === 'P1' ? ' is-p1' : ''}">${p}</b></p>`).join(''),
  fragHead('Topology', 'Tab 2 / 5') + `<svg class="fr-topo" viewBox="0 0 290 190" xmlns="http://www.w3.org/2000/svg"><path d="M145 88 L52 36 M145 88 L238 40 M145 88 L64 156 M145 88 L226 152 M52 36 L238 40 M64 156 L226 152" fill="none" stroke="#0f0e0c" stroke-opacity=".45"/>${[[145, 88, 9], [52, 36, 6], [238, 40, 6], [64, 156, 6], [226, 152, 6]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="#0f0e0c" stroke-width="1.2"/>`).join('')}</svg><p class="fr-cap">KAR_VERTIVE_GFSU_MIC</p>`,
  fragHead('Sessions', 'Tab 3 / 5') + `<svg class="fr-spark" viewBox="0 0 340 50" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><path d="M0 38 L34 30 L68 34 L102 18 L136 24 L170 12 L204 28 L238 20 L272 32 L306 14 L340 22" fill="none" stroke="#0f0e0c" stroke-width="1.2"/></svg><p class="fr-bar" style="width:62%"></p><p class="fr-bar" style="width:38%"></p>`,
  fragHead('Syslog', 'Tab 4 / 5') + [['12:27:41', 78], ['12:27:38', 56], ['12:27:30', 70], ['12:27:12', 44]].map(([ts, w]) => `<p class="fr-log"><span>${ts}</span><i style="width:${w}%"></i></p>`).join(''),
  fragHead('VIPAM · IP records', 'Tab 5 / 5') + `<p class="fr-ip">203.0.113.93</p><p class="fr-bar" style="width:54%"></p>`,
];
const FRAG_CSS = `
.fr { position: absolute; inset: 0; padding: 18px 20px; background: #fff; border: 1px solid rgba(15, 14, 12, .14); border-radius: 10px; color: #0f0e0c;
  font-family: DMM, monospace; -webkit-font-smoothing: antialiased; }
.fr * { box-sizing: border-box; margin: 0; }
.fr-head { display: flex; justify-content: space-between; padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid rgba(15, 14, 12, .16);
  font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: #626262; }
.fr-row { display: flex; justify-content: space-between; align-items: center; height: 34px; font-size: 15px; }
.fr-chip { font-weight: 400; padding: 2px 9px; border: 1px solid rgba(15, 14, 12, .22); border-radius: 20px; font-size: 12px; color: #626262; }
.fr-chip.is-p1 { border-color: #b51b03; color: #b51b03; }
.fr-topo { display: block; width: 100%; height: 180px; }
.fr-cap { font-size: 12px; color: #626262; text-align: center; }
.fr-spark { display: block; width: 100%; height: 50px; }
.fr-bar { height: 6px; margin-top: 12px; border-radius: 3px; background: rgba(15, 14, 12, .1); }
.fr-log { display: flex; align-items: center; gap: 18px; height: 30px; font-size: 14px; color: #626262; }
.fr-log i { height: 6px; border-radius: 3px; background: rgba(15, 14, 12, .1); }
.fr-ip { font-size: 26px; letter-spacing: -.01em; }
/* dark glass */
.fr--dark { background: linear-gradient(160deg, rgba(52, 46, 42, .92), rgba(24, 21, 19, .9)); border-color: rgba(255, 255, 255, .14); color: #f3efe8;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .1); }
.fr--dark .fr-head { color: #a39d94; border-bottom-color: rgba(255, 255, 255, .12); }
.fr--dark .fr-chip { border-color: rgba(255, 255, 255, .2); color: #a39d94; }
.fr--dark .fr-chip.is-p1 { border-color: #e0907c; color: #e0907c; }
.fr--dark .fr-cap, .fr--dark .fr-log { color: #a39d94; }
.fr--dark .fr-bar, .fr--dark .fr-log i { background: rgba(255, 255, 255, .12); }
.fr--dark .fr-topo path, .fr--dark .fr-spark path { stroke: #f3efe8; }
.fr--dark .fr-topo circle { fill: #2a2522; stroke: #f3efe8; }`;

// ------------------------------------------------------------------ drawing HTML into a canvas
// SVG <foreignObject> rendered as an image: everything it uses (fonts, icons) must be inside it, as data URIs.
const toDataUrl = async (url: string) => {
  const blob = await (await fetch(url)).blob();
  return await new Promise<string>(r => { const f = new FileReader(); f.onload = () => r(f.result as string); f.readAsDataURL(blob); });
};
let kit: Promise<{ css: string; icons: Map<string, string> }> | null = null;
function loadKit() {
  return (kit ??= (async () => {
    const [sans, mono] = await Promise.all([toDataUrl(dmSansUrl), toDataUrl(dmMonoUrl)]);
    const names = [...new Set([...dashboardHtml().matchAll(/\/falcon-screen\/[\w-]+\.svg/g)].map(m => m[0]))];
    const icons = new Map(await Promise.all(names.map(async n => [n, await toDataUrl(n)] as [string, string])));
    const css = `@font-face { font-family: DMS; src: url(${sans}) format('woff2'); font-weight: 100 1000; }
      @font-face { font-family: DMM; src: url(${mono}) format('woff2'); }` + DASH_CSS + FRAG_CSS;
    return { css, icons };
  })());
}

async function draw(markup: string, w: number, h: number, scale: number) {
  const { css, icons } = await loadKit();
  const body = markup.replace(/\/falcon-screen\/[\w-]+\.svg/g, m => icons.get(m) ?? m);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}"><foreignObject x="0" y="0" width="${w * scale}" height="${h * scale}">`
    + `<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${w}px;height:${h}px;overflow:hidden;transform:scale(${scale});transform-origin:0 0">`
    + `<style>${css}</style>${body}</div></foreignObject></svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c;
}

/** one part of the dashboard, cropped to its rect plus a margin for its shadow */
export function drawLayer(name: string, scale = 2, pad = 10) {
  const [x, y, w, h] = LAYERS[name];
  const show = `.fd [data-layer="${name}"], .fd [data-layer="${name}"] * { visibility: visible; }
    .fd [data-layer="${name}"] [data-layer], .fd [data-layer="${name}"] [data-layer] * { visibility: hidden; }`;
  const W = w + pad * 2, H = h + pad * 2;
  return draw(`<style>${show}</style><div style="position:absolute;left:${pad - x}px;top:${pad - y}px">${dashboardHtml()}</div>`, W, H, scale)
    .then(canvas => ({ canvas, pad, rect: LAYERS[name] }));
}
export function drawFragment(i: number, scale = 2) {
  const [w, h] = FRAG_SIZE[i];
  return draw(`<div class="fr fr--dark">${FRAGMENTS[i]}</div>`, w, h, scale);
}
