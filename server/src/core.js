'use strict';
const fs = require('fs'), path = require('path'), c = require('crypto'), { promisify } = require('util'), scrypt = promisify(c.scrypt);
const DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DIR, { recursive: true });
const DAY = 864e5, sha = s => c.createHash('sha256').update(s).digest('hex'), rid = p => p + '-' + c.randomBytes(4).toString('hex');
class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }

/* Keys: from the environment in production, otherwise made once and kept in data/keys.json */
const KF = path.join(DIR, 'keys.json'); let K = {};
try { K = JSON.parse(fs.readFileSync(KF, 'utf8')); } catch (e) { /* first run */ }
if (process.env.TOKEN_SECRET) K.token = process.env.TOKEN_SECRET;
if (process.env.MASTER_KEY) K.master = process.env.MASTER_KEY;
if (!K.token || !K.master) {
  if (process.env.NODE_ENV === 'production') throw new Error('Set TOKEN_SECRET and MASTER_KEY');
  K.token = K.token || c.randomBytes(32).toString('hex'); K.master = K.master || c.randomBytes(32).toString('hex');
  fs.writeFileSync(KF, JSON.stringify(K), { mode: 0o600 });
}
const derive = label => '0x' + Buffer.from(c.hkdfSync('sha256', Buffer.from(K.master, 'hex'), Buffer.alloc(0), 'alma:' + label, 32)).toString('hex');

/* Data. One JSON file, written safely. Swap this block for Postgres when you need more than one server. */
const DBF = path.join(DIR, 'db.json'); let db;
const load = () => {
  db = fs.existsSync(DBF) ? JSON.parse(fs.readFileSync(DBF, 'utf8')) : {};
  for (const k of ['users', 'insts', 'creds', 'grants', 'blocks', 'mail', 'keys', 'alerts', 'consents']) db[k] = db[k] || [];
  db.down = db.down || {}; db.meta = db.meta || {};
};
let dirty = false, timer = null;   // writes are batched, so saving stays fast as the data grows
const flush = () => { if (!dirty) return; dirty = false; clearTimeout(timer); timer = null; fs.writeFileSync(DBF + '.tmp', JSON.stringify(db)); fs.renameSync(DBF + '.tmp', DBF); };
const save = () => { dirty = true; if (!timer) timer = setTimeout(flush, +process.env.SAVE_DELAY_MS || 400); };
const snapshot = () => { flush(); return Buffer.from(JSON.stringify(db)); };
process.on('exit', flush);
load();
const D = () => db;

/* Passwords and sign-in tokens */
const hashPw = async pw => { const s = c.randomBytes(16), k = await scrypt(pw, s, 64); return 's1$' + s.toString('hex') + '$' + k.toString('hex'); };
const checkPw = async (pw, st) => { const [, s, k] = st.split('$'), x = await scrypt(pw, Buffer.from(s, 'hex'), 64); return c.timingSafeEqual(x, Buffer.from(k, 'hex')); };
const b64u = b => Buffer.from(b).toString('base64url'), mac = s => c.createHmac('sha256', K.token).update(s).digest('base64url');
const sign = (p, hours = 12) => { const b = b64u(JSON.stringify({ ...p, exp: Date.now() + hours * 36e5 })); return b + '.' + mac(b); };
const unsign = t => { const [b, m] = String(t || '').split('.'); if (!b || !m) return null; const a = Buffer.from(mac(b)), z = Buffer.from(m); if (a.length !== z.length || !c.timingSafeEqual(a, z)) return null; const p = JSON.parse(Buffer.from(b, 'base64url')); return p.exp > Date.now() ? p : null; };

/* Role rules. The contract enforces the same table for institutions and regulators. */
const POLICY = { issue: ['admin'], revoke: ['admin'], keys: ['admin'], claim: ['student'], share: ['student'], erase: ['student'], check: ['employer'], audit: ['regulator', 'owner'], release: ['regulator', 'owner'], approve: ['owner'], nodes: ['owner', 'regulator'], anchor: ['owner'] };

/* Off-chain audit ledger. Each block carries the hash of the one before it, and the head is anchored on chain. */
const lh = b => sha(JSON.stringify([b.prev, b.type, b.pl, b.actor, b.inst, b.ts, b.risk, b.why, b.ref]));
const block = (type, pl, actor, inst, risk = 0, why = [], ref = '') => {
  const bl = db.blocks, b = { n: bl.length, type, pl: String(pl == null ? '' : pl), actor: actor || '', inst: inst || '', risk, why, ref, ts: Date.now(), prev: bl.length ? bl[bl.length - 1].hash : '0'.repeat(64) };
  b.hash = lh(b); bl.push(b); return b;
};
const verifyChain = bl => { bl = bl || db.blocks; let p = '0'.repeat(64); for (let i = 0; i < bl.length; i++) { if (bl[i].prev !== p || bl[i].hash !== lh(bl[i])) return { ok: false, at: i, n: bl.length }; p = bl[i].hash; } return { ok: true, n: bl.length }; };

/* Encryption of personal details. The key comes from the master key and the record fingerprint. */
const dk = h => Buffer.from(c.hkdfSync('sha256', Buffer.from(K.master, 'hex'), Buffer.alloc(0), 'alma:' + h, 32));
const seal = (h, o) => { const iv = c.randomBytes(12), ci = c.createCipheriv('aes-256-gcm', dk(h), iv), ct = Buffer.concat([ci.update(Buffer.isBuffer(o) ? o : Buffer.from(JSON.stringify(o))), ci.final()]); return Buffer.concat([iv, ci.getAuthTag(), ct]); };
const unseal = (h, x, asBuffer) => { const d = c.createDecipheriv('aes-256-gcm', dk(h), x.subarray(0, 12)); d.setAuthTag(x.subarray(12, 28)); const out = Buffer.concat([d.update(x.subarray(28)), d.final()]); return asBuffer ? out : JSON.parse(out.toString()); };

module.exports = { HttpError, DAY, sha, rid, c, D, save, flush, snapshot, load, K, DBF, DIR, hashPw, checkPw, sign, unsign, POLICY, block, verifyChain, lh, derive, seal, unseal };
