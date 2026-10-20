'use strict';
const fs = require('fs'), path = require('path'), c = require('crypto'), { promisify } = require('util'), scrypt = promisify(c.scrypt);
class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }
const SUPABASE_URL = process.env.SUPABASE_URL, SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!!SUPABASE_URL !== !!SUPABASE_KEY) throw new Error('Set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
const remote = !!SUPABASE_URL;
const supabaseClient = remote ? require('@supabase/supabase-js').createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;
const DIR = process.env.DATA_DIR || path.join(remote ? require('os').tmpdir() : path.join(__dirname, '..'), remote ? 'alma' : 'data');
fs.mkdirSync(DIR, { recursive: true });
const DAY = 864e5, sha = s => c.createHash('sha256').update(s).digest('hex'), rid = p => p + '-' + c.randomBytes(4).toString('hex');
let revision = 0, gate = Promise.resolve(), lockToken = null;

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

/* Local mode uses an atomic JSON file. Vercel stores the same state in a locked Supabase row. */
const DBF = path.join(DIR, 'db.json'); let db;
const emptyDb = () => ({ users: [], insts: [], creds: [], grants: [], blocks: [], mail: [], keys: [], alerts: [], consents: [], down: {}, meta: {} });
const normalize = data => {
  const result = data || {};
  for (const k of ['users', 'insts', 'creds', 'grants', 'blocks', 'mail', 'keys', 'alerts', 'consents']) result[k] = result[k] || [];
  result.down = result.down || {}; result.meta = result.meta || {};
  return result;
};
const load = () => {
  if (remote) throw new Error('Use loadRemote() when Supabase persistence is enabled');
  db = normalize(fs.existsSync(DBF) ? JSON.parse(fs.readFileSync(DBF, 'utf8')) : emptyDb());
};
let dirty = false, timer = null;
const supabaseRpc = async (name, args) => {
  const { data, error } = await supabaseClient.rpc(name, args);
  if (error) throw new Error(`Supabase RPC ${name} failed: ${error.message}`);
  return data;
};
async function acquireRemoteLock() {
  if (!remote) return async () => {};
  const previous = gate;
  let unlock;
  gate = new Promise(resolve => { unlock = resolve; });
  await previous;
  const token = c.randomUUID(), deadline = Date.now() + 15000;
  try {
    while (Date.now() < deadline) {
      const acquired = await supabaseRpc('alma_acquire_runtime', { p_token: token, p_lease_seconds: 300 });
      if (acquired === true) {
        lockToken = token;
        return async () => {
          try { await supabaseRpc('alma_release_runtime', { p_token: token }); }
          finally { lockToken = null; unlock(); }
        };
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('Alma database is busy; retry the request shortly');
  } catch (error) {
    unlock();
    throw error;
  }
}
const loadRemote = async () => {
  if (!remote) return db;
  const { data, error } = await supabaseClient.from('alma_runtime').select('state,revision').eq('id', true).maybeSingle();
  if (error) throw new Error(`Supabase load failed: ${error.message}`);
  if (!data) throw new Error('Supabase Alma state row is missing; apply the database migration first');
  db = normalize(data.state || emptyDb());
  revision = Number(data.revision);
  dirty = false;
  return db;
};
const flush = () => {
  if (!dirty) return remote ? Promise.resolve() : undefined;
  if (!remote) {
    dirty = false; clearTimeout(timer); timer = null;
    fs.writeFileSync(DBF + '.tmp', JSON.stringify(db)); fs.renameSync(DBF + '.tmp', DBF);
    return;
  }
  if (!lockToken) throw new Error('Supabase state can only be saved while holding the runtime lock');
  return (async () => {
    const nextRevision = Number(await supabaseRpc('alma_save_runtime', { p_token: lockToken, p_revision: revision, p_state: db }));
    if (!Number.isSafeInteger(nextRevision) || nextRevision <= revision) throw new Error('Supabase did not confirm the Alma state update');
    revision = nextRevision;
    dirty = false;
  })();
};
const save = () => {
  dirty = true;
  if (!remote && !timer) timer = setTimeout(flush, +process.env.SAVE_DELAY_MS || 400);
};
const snapshot = () => { flush(); return Buffer.from(JSON.stringify(db)); };
process.on('exit', flush);
if (remote) db = emptyDb();
else load();
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

module.exports = { HttpError, DAY, sha, rid, c, D, save, flush, snapshot, load, loadRemote, acquireRemoteLock, isRemote: remote, K, DBF, DIR, hashPw, checkPw, sign, unsign, POLICY, block, verifyChain, lh, derive, seal, unseal };
