// A mock Falcon backend for the portfolio screen (components/FalconScreen.astro). It stands in for falcon_v11's data
// pulls (HPSM, topology, sessions, syslog, VIPAM): the options behind every dropdown, and a time-window pull that answers
// after a network-like delay, so the screen shows its real loading states. The data is a deterministic sample — the same
// window always returns the same network — and no real Vodafone Idea data is used.
const CONFIG_CHANGE_KEYWORDS = ['reload', 'cfglog', 'cli_hist', 'config', 'commit'];

export type P = 'P1' | 'P2' | 'P3';
export interface Ticket {
  number: string; type: 'EN' | 'SN'; priority: P; label: string; status: 'Open' | 'In Progress';
  ip: string | null; device: string; circle: string; city: string; vendor: string; model: string; nss: string;
  problem: string; category: string; layer: string; open: Date; impact: boolean; change: boolean; syslogHit: boolean;
  score?: number; reasons?: string[];
}
export interface Win { day: number; sh: number; sm: number; eh: number; em: number }   // day: 0 = today, 1 = yesterday …

// ------------------------------------------------------------------ the sample network
export const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const CIRCLES: [string, string, number][] = [['KAR', 'BENGALURU', 144], ['MPCG', 'INDORE', 121], ['MUM', 'MUMBAI', 93], ['DEL', 'NEW DELHI', 34], ['TNC', 'CHENNAI', 26], ['ROB', 'SILIGURI', 20]];
export const CAUSES: [string, string, number][] = [['ThresholdCrossed', 'Performance', 186], ['High CPU', 'Performance', 82], ['Link Down', 'Transport', 57], ['Fibre Cut', 'Transport', 57], ['PAC Input fail', 'Power', 56]];
export const VENDORS = [['NOKIA', '7750 SR-12'], ['ECI', 'NPT-1800'], ['HUAWEI', 'NE40E-X8'], ['CISCO', 'ASR-9010'], ['VERTIV', 'NetSure 7100']];
const LAYERS = ['Access', 'Aggregation', 'Core', 'Pre-Agg'];
// the five rows on the Figma frame come first
const FIGMA_ROWS: Partial<Ticket>[] = [
  { number: 'EN_IM_20072026_930283', type: 'EN', ip: '192.0.2.171', device: 'DEMO_WST_EDGE_RTR903' },
  { number: 'SN_IM_20072026_931164', type: 'SN', ip: '198.51.100.136', device: 'DEMO_CEN_4G_RING_604' },
  { number: 'SN_IM_20072026_931033', type: 'SN', ip: null, device: 'DEMO_UPE_SVR05' },
  { number: 'SN_IM_20072026_931207', type: 'SN', ip: '203.0.113.2', device: 'DEMO_NE_2G_RING_782' },
  { number: 'EN_IM_20072026_930751', type: 'EN', ip: '203.0.113.76', device: 'DEMO_WST_NIXR6' },
];

export function windowRange(w: Win, now = new Date()) {
  const day = new Date(now); day.setDate(day.getDate() - w.day);
  const start = new Date(day); start.setHours(w.sh, w.sm, 0, 0);
  const end = new Date(day); end.setHours(w.eh, w.em, 0, 0);
  if (end <= start) end.setTime(start.getTime() + 15 * 60_000);
  return { start, end };
}

function makeTickets(w: Win): Ticket[] {
  const r = rng(1000 + w.day * 97 + w.sh * 7 + w.eh * 3 + w.sm + w.em);
  const live = w.day === 0;
  const now = new Date();
  const { start, end } = windowRange(w, now);
  const scale = live ? 1 : 0.7 + r() * 0.5;
  const counts: Record<P, number> = { P1: Math.round(51 * scale), P2: Math.round(280 * scale), P3: Math.round(107 * scale) };
  const total = counts.P1 + counts.P2 + counts.P3;
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  const weighted = (arr: [string, string, number][]) => { const sum = arr.reduce((s, a) => s + a[2], 0); let x = r() * sum; for (const a of arr) { if ((x -= a[2]) < 0) return a; } return arr[0]; };
  // a pool of shared upstream IPs, so clusters and "common upstream IP" appear
  const shared = Array.from({ length: 14 }, () => `${pick(['192.0.2', '198.51.100', '203.0.113'])}.${Math.floor(r() * 250)}`);
  const order: P[] = [...Array(counts.P1).fill('P1'), ...Array(counts.P2).fill('P2'), ...Array(counts.P3).fill('P3')];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const span = Math.max(15 * 60_000, (live ? now.getTime() : end.getTime()) - start.getTime() + 3 * 3600_000);
  const latest = live ? now.getTime() : end.getTime();
  const tickets: Ticket[] = order.map((p, i) => {
    const [circle, city] = weighted(CIRCLES);
    const [problem, category] = weighted(CAUSES);
    const [vendor, model] = pick(VENDORS);
    const type = r() < 0.4 ? 'EN' : 'SN';
    const seq = 925000 + Math.floor(r() * 9999);
    const ip = r() < 0.06 ? null : r() < 0.3 ? pick(shared) : `${pick(['192.0.2', '198.51.100', '203.0.113'])}.${Math.floor(r() * 250)}`;
    return {
      number: `${type}_IM_${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}_${seq}`, type, priority: p,
      label: p === 'P1' ? 'P1 (EME)' : `${p} (MAJ)`, status: r() < 0.82 ? 'Open' : 'In Progress',
      ip, device: `${circle}_${pick(['VERTIVE_GFSU', 'RON_LOOIN', 'AGG_RTR', 'NIXR', 'CSR_'])}${Math.floor(r() * 900 + 100)}`,
      circle, city, vendor, model, nss: `I${circle.slice(0, 2)}P${100000 + Math.floor(r() * 899999)}`, problem, category, layer: pick(LAYERS),
      open: new Date(latest - 3 * 60_000 - Math.floor(r() * span)), impact: r() < 0.22, change: r() < 0.08,
      syslogHit: r() < 0.06 || CONFIG_CHANGE_KEYWORDS.some(k => problem.toLowerCase().includes(k)), score: 0, reasons: [],
    } as Ticket;
  });
  // the Figma rows lead the recent activity (live view)
  if (live) FIGMA_ROWS.forEach((f, i) => Object.assign(tickets[i], { ...f, priority: 'P3', label: 'P3 (MAJ)', status: 'Open', open: new Date(now.getTime() - (i + 1) * 30_000) }));
  // and the recommended incident from the Figma frame: a P1 in KAR, 14 minutes from its SLA, with customer impact
  if (live) {
    const t = tickets.find(x => x.priority === 'P1')!;
    Object.assign(t, { number: 'SN_IM_20072026_925415', type: 'SN', circle: 'KAR', city: 'BENGALURU', problem: 'PAC Input fail', category: 'Power',
      device: 'KAR_VERTIVE_GFSU_MIC', vendor: 'VERTIV', model: 'NetSure 7100', ip: shared[0], impact: true, change: true, priority: 'P1', label: 'P1 (EME)',
      open: new Date(now.getTime() - (60 - 14) * 60_000 - 20_000) });
    // two more tickets behind the same upstream IP, in another circle: a shared upstream across circles
    tickets.filter(x => x !== t && x.priority !== 'P1').slice(6, 8).forEach(x => Object.assign(x, { ip: shared[0], circle: 'MPCG', city: 'INDORE' }));
  }
  tickets.sort((a, b) => b.open.getTime() - a.open.getTime());
  return tickets.slice(0, total);
}
export const pad = (n: number) => String(n).padStart(2, '0');

// ------------------------------------------------------------------ the API the screen calls
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const latency = (min: number, max: number) => new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
export interface Options {
  ranges: { value: number; label: string }[]; hours: number[]; minutes: number[];
  circles: string[]; priorities: P[]; causes: string[]; vendors: string[];
}
export const falconApi = {
  /** everything the dropdowns offer: date range presets, hours, minutes, and the filter values */
  async options(): Promise<Options> {
    await latency(120, 260);
    const today = new Date();
    return {
      ranges: [0, 1, 2, 3, 6].map(n => { const d = new Date(today); d.setDate(d.getDate() - n); return { value: n, label: n === 0 ? 'Today' : n === 1 ? 'Yesterday' : `${d.getDate()} ${MONTHS[d.getMonth()]}` }; }),
      hours: Array.from({ length: 24 }, (_, h) => h), minutes: [0, 15, 30, 45],
      circles: CIRCLES.map(c => c[0]), priorities: ['P1', 'P2', 'P3'], causes: CAUSES.map(c => c[0]), vendors: VENDORS.map(v => v[0]),
    };
  },
  /** the HPSM tickets for a time window (KPIs, tables, regions and the recommendation are all derived from them) */
  async pull(w: Win): Promise<Ticket[]> {
    await latency(900, 1500);
    return makeTickets(w);
  },
  /** suggestions under the search box: the five IPs with the most open tickets in the loaded window */
  suggestions(tickets: Ticket[]): string[] {
    const n = new Map<string, number>();
    tickets.forEach(t => t.ip && n.set(t.ip, (n.get(t.ip) || 0) + 1));
    return [...n].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([ip]) => ip);
  },
  /** the same pull, answered at once — for the still frame before the screen is started */
  pullNow: (w: Win) => makeTickets(w),
};
