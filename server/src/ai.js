'use strict';
/* Anomaly detection. An isolation forest scores every issuance in real time. It is trained on normal patterns plus the
   institution's own ledger history, and checked against labelled test data it has not seen (precision, recall, AUC). */
const core = require('./core'), DAY = core.DAY;
const FEATURES = ['hour_sin', 'hour_cos', 'log_gap', 'per_hour', 'day_ratio', 'duplicate', 'denied', 'off_hours'];
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const H = n => Math.log(n) + 0.5772156649, cn = n => n > 2 ? 2 * H(n - 1) - 2 * (n - 1) / n : n === 2 ? 1 : 0;
function build(S, d, lim, r) {
  if (d >= lim || S.length <= 1) return { size: S.length };
  const q = Math.floor(r() * S[0].length); let lo = Infinity, hi = -Infinity;
  for (const s of S) { if (s[q] < lo) lo = s[q]; if (s[q] > hi) hi = s[q]; }
  if (lo === hi) return { size: S.length };
  const p = lo + r() * (hi - lo);
  return { q, p, l: build(S.filter(s => s[q] < p), d + 1, lim, r), r: build(S.filter(s => s[q] >= p), d + 1, lim, r) };
}
const depth = (t, x, d) => t.size !== undefined ? d + cn(t.size) : depth(x[t.q] < t.p ? t.l : t.r, x, d + 1);
class Forest {
  constructor(trees = 120, psi = 256, seed = 7) { this.trees = trees; this.psi = psi; this.seed = seed; }
  fit(X) { const r = rng(this.seed), psi = Math.min(this.psi, X.length), lim = Math.ceil(Math.log2(psi)); this.n = psi; this.t = []; for (let i = 0; i < this.trees; i++) { const S = []; for (let j = 0; j < psi; j++) S.push(X[Math.floor(r() * X.length)]); this.t.push(build(S, 0, lim, r)); } return this; }
  score(x) { let s = 0; for (const t of this.t) s += depth(t, x, 0); return Math.pow(2, -(s / this.t.length) / cn(this.n)); }
}
const vec = c => { const a = 2 * Math.PI * c.hour / 24; return [Math.sin(a), Math.cos(a), Math.log1p(c.gap), c.perHour, c.dayRatio, c.dup ? 1 : 0, c.denied, c.hour < 6 || c.hour > 21 ? 1 : 0]; };
const gauss = r => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const clip = (x, a, b) => Math.min(b, Math.max(a, x));
const normal = r => ({ hour: clip(11.5 + 2.6 * gauss(r), 7, 18), gap: clip(Math.exp(Math.log(900) + 1.8 * gauss(r)), 5, 86400), perHour: clip(Math.round(Math.exp(0.4 + 0.8 * gauss(r))) - 1, 0, 8), dayRatio: clip(1 + 0.4 * gauss(r), 0.2, 2.2), dup: 0, denied: r() < 0.02 ? 1 : 0 });
const oddities = { night: r => ({ ...normal(r), hour: r() < 0.5 ? r() * 5.5 : 21.5 + r() * 2.5 }), burst: r => ({ ...normal(r), gap: 0.2 + r() * 4, perHour: 10 + r() * 30, dayRatio: 3 + r() * 9 }), duplicate: r => ({ ...normal(r), dup: 1 }), flood: r => ({ ...normal(r), dayRatio: 6 + r() * 14 }), unauthorised: r => ({ ...normal(r), denied: 3 + Math.floor(r() * 8) }) };
const auc = (pos, neg) => { let w = 0; for (const p of pos) for (const n of neg) w += p > n ? 1 : p === n ? 0.5 : 0; return w / (pos.length * neg.length); };

/* Context for an issuance, read from the ledger */
function context(inst, ts, dup, db = core.D()) {
  const I = db.blocks.filter(b => b.type === 'ISSUE' && b.inst === inst && b.ts < ts), last = I[I.length - 1];
  const first = I[0], days = first ? Math.max(1, (ts - first.ts) / DAY) : 1, mean = I.length / days;
  return { hour: new Date(ts + (+process.env.UTC_OFFSET_HOURS || 3) * 36e5).getUTCHours(), gap: last ? Math.min((ts - last.ts) / 1000, 86400) : 86400, perHour: I.filter(b => ts - b.ts < 36e5).length, dayRatio: (I.filter(b => ts - b.ts < DAY).length + 1) / (mean + 1), dup: !!dup, denied: db.blocks.filter(b => b.inst === inst && b.type === 'DENIED' && ts - b.ts < DAY).length };
}
let forest = null;
function train() {
  const db = core.D(), r = rng(11), X = [];
  for (let i = 0; i < 600; i++) X.push(vec(normal(r)));
  const ro = rng(23); for (let i = 0; i < 40; i++) X.push(vec(Object.values(oddities)[i % 5](ro)));   // a little contamination, as isolation forests expect
  let real = 0;
  for (const b of db.blocks) if (b.type === 'ISSUE' && b.risk < 50) { X.push(vec(context(b.inst, b.ts, (b.why || []).includes('Same student and title issued before'), { blocks: db.blocks.filter(x => x.ts < b.ts) }))); real++; }
  forest = new Forest().fit(X);
  // Calibrate the cut-off on one labelled set, report on a different one
  const lab = seed => { const q = rng(seed), rows = [], add = (y, k, c) => { const v = vec(c); rows.push({ y, k, s: forest.score(v), d: v[5] === 1 }); }; for (let i = 0; i < 400; i++) add(0, 'normal', normal(q)); for (const [k, f] of Object.entries(oddities)) for (let i = 0; i < 24; i++) add(1, k, f(q)); return rows; };
  const hit = (x, t) => x.s >= t || x.d;   // the detector is the model plus the duplicate rule
  const val = lab(101), test = lab(202); let best = { t: 0.85 };   // the lowest cut-off that keeps false alarms near 1%
  for (let t = 0.45; t <= 0.85; t += 0.005) { const fp = val.filter(x => !x.y && hit(x, t)).length; if (fp / 400 <= 0.01) { best = { t }; break; } }
  const th = +best.t.toFixed(3), tp = test.filter(x => x.y && hit(x, th)).length, fp = test.filter(x => !x.y && hit(x, th)).length, fn = test.filter(x => x.y && !hit(x, th)).length, neg = test.filter(x => !x.y);
  const perType = Object.fromEntries(Object.keys(oddities).map(k => { const rows = test.filter(x => x.k === k); return [k, +(rows.filter(x => hit(x, th)).length / rows.length).toFixed(2)]; }));
  const m = { trainedAt: Date.now(), samples: { synthetic: 640, real }, threshold: th, features: FEATURES, test: { normal: neg.length, anomalies: test.length - neg.length, precision: +(tp / Math.max(1, tp + fp)).toFixed(3), recall: +(tp / Math.max(1, tp + fn)).toFixed(3), f1: +(2 * tp / Math.max(1, 2 * tp + fp + fn)).toFixed(3), auc: +auc(test.filter(x => x.y).map(x => x.s), neg.map(x => x.s)).toFixed(3), falsePositiveRate: +(fp / neg.length).toFixed(3), recallByType: perType } };
  core.D().meta.ai = m; return m;
}
const model = () => core.D().meta.ai || train();
function score(inst, dup, ts = Date.now()) {
  if (!forest) train();
  const c = context(inst, ts, dup), s = forest.score(vec(c)), th = model().threshold, why = [];
  if (c.hour < 6 || c.hour > 21) why.push('Issued outside office hours');
  if (c.gap < 10 && c.perHour >= 3) why.push('Records arriving seconds apart');
  if (c.dayRatio > 4) why.push('Far above its usual daily volume');
  if (c.dup) why.push('Same student and title issued before');
  if (c.denied >= 3) why.push('Repeated blocked actions');
  const flagged = s >= th || c.dup;
  if (flagged && !why.length) why.push('Unusual pattern for this institution');
  return { score: Math.round(s * 100), threshold: Math.round(th * 100), flagged, why, features: c };
}
/* Unauthorised administrative behaviour: raises an alert for the regulator */
function watch(inst, actor) {
  const db = core.D(), now = Date.now(), out = [], n = (t, ms) => db.blocks.filter(b => b.inst === inst && b.type === t && now - b.ts < ms).length;
  const rules = [['Repeated blocked actions', n('DENIED', DAY) >= 3, n('DENIED', DAY) + ' blocked attempts in 24 hours'], ['Mass revocation', n('REVOKE', 36e5) >= 5, n('REVOKE', 36e5) + ' records revoked in an hour'], ['Many API keys created', n('KEY_CREATE', 36e5) >= 3, n('KEY_CREATE', 36e5) + ' keys created in an hour']];
  for (const [kind, hit, detail] of rules) if (hit && !db.alerts.some(a => a.open && a.inst === inst && a.kind === kind && now - a.ts < 36e5)) { const a = { id: core.rid('AL'), ts: now, inst, actor, kind, detail, open: true }; db.alerts.push(a); out.push(a); }
  return out;
}
module.exports = { train, model, score, watch, FEATURES };
