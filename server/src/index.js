'use strict';
const fs = require('fs'), pth = require('path'), http = require('http'), core = require('./core'), chain = require('./chain'), ipfs = require('./ipfs'), ai = require('./ai'), { routes, anchorNow } = require('./routes'), backup = require('./backup'), config = require('./config'), { HttpError } = core;
const ORIGINS = (process.env.ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean), ANCHOR_EVERY = +process.env.ANCHOR_EVERY || 20;
const WEB = pth.resolve(process.env.WEB_DIR || pth.join(__dirname, '..', '..', 'alma'));
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";
const secure = (req) => ({ 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()', 'Cross-Origin-Opener-Policy': 'same-origin', ...(req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}) });
const clientIp = req => (process.env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';
function serveStatic(p, res, req) {   // the web interface is served from the same address, so no cross-site settings are needed
  try {
    if (p === '/') p = '/index.html'; const f = pth.normalize(pth.join(WEB, decodeURIComponent(p)));
    if (!f.startsWith(WEB + pth.sep) || !fs.statSync(f).isFile()) return false; const ext = pth.extname(f);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600', ...secure(req) });
    fs.createReadStream(f).pipe(res); return true;
  } catch (e) { return false; }
}
const hits = new Map(), lat = [], count = { requests: 0, errors: 0 };
const limited = (key, max, ms) => { const now = Date.now(), a = (hits.get(key) || []).filter(t => now - t < ms); a.push(now); hits.set(key, a); return a.length > max; };
const metrics = () => { const s = lat.slice().sort((a, b) => a - b), q = p => s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1) : 0; return { ...count, medianMs: q(0.5), p95Ms: q(0.95), sample: s.length }; };

async function setup() {
  const cfg = config.check(); cfg.warnings.forEach(w => console.warn('warning:', w)); if (cfg.errors.length) { cfg.errors.forEach(e => console.error('error:', e)); throw new Error('Fix the settings above before starting in production.'); }
  const db = core.D(); await chain.init(); await ipfs.init(); ai.train();
  if (!db.meta.guard) { await chain.grantRole('r:ai', 'Regulator'); db.meta.guard = true; }   // the AI guard may place holds, nothing more
  if (!db.users.some(u => u.role === 'owner')) {
    let email = process.env.OWNER_EMAIL, pw = process.env.OWNER_PASSWORD, shown = false;
    if (!email || !pw) { if (process.env.NODE_ENV === 'production') throw new Error('Set OWNER_EMAIL and OWNER_PASSWORD'); email = 'owner@alma.local'; pw = core.c.randomBytes(9).toString('base64url'); shown = true; }
    db.users.push({ id: core.rid('U'), role: 'owner', name: 'Platform owner', email: email.toLowerCase(), pw: await core.hashPw(pw) }); db.consents.push({ user: db.users[db.users.length - 1].id, terms: '1.0', ts: Date.now() });
    if (shown) console.log(`Owner account made: ${email} / ${pw}  (shown once)`);
  }
  core.save(); core.flush(); backup.schedule();
}
let anchoring = false;
function maybeAnchor() {
  const bl = core.D().blocks; if (anchoring || bl.length - (core.D().meta.anchoredBlocks || 0) < ANCHOR_EVERY) return;
  anchoring = true; anchorNow().then(t => { core.block('ANCHOR', core.D().blocks.length, 'system', '', 0, [], t.tx); core.save(); }).catch(e => console.error('anchor failed', e.message)).finally(() => { anchoring = false; });
}

function createServer() {
  return http.createServer(async (req, res) => {
    const t0 = process.hrtime.bigint(), url = new URL(req.url, 'http://x'), ip = clientIp(req);
    const origin = req.headers.origin, allow = ORIGINS.includes('*') || (origin && ORIGINS.includes(origin));
    const send = (status, body, raw) => {
      res.writeHead(status, { 'Content-Type': raw ? raw : 'application/json', 'Cache-Control': 'no-store', ...secure(req), ...(allow ? { 'Access-Control-Allow-Origin': origin || '*', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Api-Key', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS' } : {}) });
      res.end(raw ? body : JSON.stringify(body)); count.requests++; if (status >= 500) count.errors++; const ms = Number(process.hrtime.bigint() - t0) / 1e6; lat.push(ms); if (lat.length > 500) lat.shift();
      if (process.env.LOG_REQUESTS === '1' || process.env.NODE_ENV === 'production') console.log(JSON.stringify({ t: new Date().toISOString(), m: req.method, p: url.pathname.replace(/[a-f0-9]{64}/g, ':hash'), s: status, ms: +ms.toFixed(1) }));
    };
    if (process.env.FORCE_HTTPS === '1' && req.headers['x-forwarded-proto'] === 'http') { res.writeHead(301, { Location: 'https://' + req.headers.host + req.url }); return res.end(); }
    if (req.method === 'OPTIONS') return send(204, {});
    try {
      if (limited('ip:' + ip, 600, 6e4)) throw new HttpError(429, 'Too many requests');
      const big = /^\/(credentials|v1)/.test(url.pathname) && req.method === 'POST', max = big ? 3e6 : 1e5;
      let raw = ''; for await (const ch of req) { raw += ch; if (raw.length > max) throw new HttpError(413, 'Request too large'); }
      let body = {}; if (raw) { try { body = JSON.parse(raw); } catch (e) { throw new HttpError(400, 'Body must be JSON'); } }
      if (url.pathname === '/auth/login' && limited('login:' + ip + String(body.email), 8, 9e5)) throw new HttpError(429, 'Too many tries. Wait a few minutes.');
      let path = url.pathname.replace(/^\/v1\/issue\/bulk$/, '/credentials/bulk').replace(/^\/v1\/issue$/, '/credentials').replace(/^\/v1\/records$/, '/credentials/issued');
      let hit = null, params = {}; for (const r of routes) { if (r.m !== req.method) continue; const m = r.re.exec(path); if (m) { hit = r; params = m.groups || {}; break; } }
      if (!hit) { if (req.method === 'GET' && serveStatic(url.pathname, res, req)) return; throw new HttpError(404, 'Not found'); }
      const x = { origin: (process.env.PUBLIC_URL || ((req.headers['x-forwarded-proto'] || 'http') + '://' + req.headers.host)).replace(/\/$/, ''), body, params, query: url.searchParams, dirty: false, metrics, user: null, viaKey: false };
      if (hit.action) {
        const key = req.headers['x-api-key'], db = core.D();
        if (key) {
          if (!hit.api) throw new HttpError(403, 'API keys only work for issuing and listing records');
          const k = db.keys.find(k => k.hash === core.sha(String(key))); if (!k) throw new HttpError(401, 'API key not recognised');
          if (limited('key:' + k.id, 120, 6e4)) throw new HttpError(429, 'Too many requests for this key');
          k.last = Date.now(); x.user = db.users.find(u => u.role === 'admin' && u.inst === k.inst); x.viaKey = true; if (!x.user) throw new HttpError(401, 'No administrator for this key');
        } else {
          const tok = core.unsign((req.headers.authorization || '').replace(/^Bearer /, '')), u = tok && db.users.find(u => u.id === tok.id && (u.tv || 0) === (tok.tv || 0));
          if (!u) throw new HttpError(401, 'Sign in first'); x.user = u;
        }
        if ((process.env.REQUIRE_2FA || '').split(',').includes(x.user.role) && !x.user.totp && !/^\/me/.test(path)) throw new HttpError(403, 'Turn on two-step sign-in first', { setup2fa: true });
        if (hit.action !== 'any' && !core.POLICY[hit.action].includes(x.user.role)) { core.block('DENIED', hit.action, x.user.id, x.user.inst, 70, ['Blocked by role policy']); const ar = ai.watch(x.user.inst, x.user.id); core.save(); throw new HttpError(403, 'Your role cannot do that'); }
      }
      const out = await hit.h(x); if (x.dirty || req.method !== 'GET') { core.save(); maybeAnchor(); }
      if (out.raw) return send(200, out.body, out.type); send(out.status || 200, out.body);
    } catch (e) { if (!(e instanceof HttpError)) console.error(e); send(e.status || 500, { error: e instanceof HttpError ? e.message : 'Something went wrong', ...(e.extra || {}) }); }
  });
}
const stop = srv => () => { core.flush(); srv.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
if (require.main === module) setup().then(() => { const srv = createServer(); ['SIGTERM', 'SIGINT'].forEach(sg => process.on(sg, stop(srv))); return srv.listen(process.env.PORT || 8080, () => console.log('Alma server on port ' + (process.env.PORT || 8080) + ' · chain ' + (process.env.CHAIN_RPC ? 'external' : 'local') + ' · storage ' + (process.env.IPFS_API ? 'IPFS' : 'local blocks') + '\nOpen http://localhost:' + (process.env.PORT || 8080))); }).catch(e => { console.error(e); process.exit(1); });
module.exports = { createServer, setup };
