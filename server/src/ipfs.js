'use strict';
/* Storage adapter. Records are stored as IPFS blocks with real CIDs (v1, raw, sha-256) on every node that is up.
   With IPFS_API set (comma separated Kubo API addresses) it pins to those IPFS nodes.
   Without it, it keeps the same blocks in local folders so the system runs anywhere. */
const fs = require('fs'), path = require('path'), core = require('./core');
let mf = null, nodes = [];
const M = async () => mf || (mf = { CID: (await import('multiformats/cid')).CID, sha256: (await import('multiformats/hashes/sha2')).sha256 });
const cidOf = async b => { const m = await M(); return m.CID.createV1(0x55, await m.sha256.digest(b)).toString(); };
const T = { timeout: 8000 };

async function init() {
  const urls = (process.env.IPFS_API || '').split(',').map(s => s.trim()).filter(Boolean);
  if (urls.length) { const { create } = await import('kubo-rpc-client'); nodes = urls.map(u => ({ id: new URL(u).host, kind: 'kubo', c: create({ url: u }) })); }
  else nodes = (process.env.NODES || 'Nairobi,Mombasa,Kisumu').split(',').map(s => s.trim()).map(id => { const dir = path.join(core.DIR, 'nodes', id); fs.mkdirSync(dir, { recursive: true }); return { id, kind: 'local', dir }; });
  return status();
}
const up = () => nodes.filter(n => !core.D().down[n.id]);
async function put(n, bytes, cid) {
  if (n.kind === 'local') return fs.writeFileSync(path.join(n.dir, cid), bytes);
  const r = await n.c.block.put(bytes, { format: 'raw', mhtype: 'sha2-256', version: 1, pin: true, ...T });
  if (r.toString() !== cid) throw new Error('Node returned a different address');
}
async function get(n, cid) {
  try {
    if (n.kind === 'local') return fs.readFileSync(path.join(n.dir, cid));
    return Buffer.from(await n.c.block.get((await M()).CID.parse(cid), T));
  } catch (e) { return null; }
}
async function rm(n, cid) {
  try {
    if (n.kind === 'local') return fs.unlinkSync(path.join(n.dir, cid));
    const id = (await M()).CID.parse(cid); try { await n.c.pin.rm(id, T); } catch (e) { /* not pinned */ } await n.c.block.rm(id, { force: true, ...T }).next();
  } catch (e) { /* already gone */ }
}
async function pin(bytes) {
  const cid = await cidOf(bytes); let ok = 0;
  for (const n of up()) { try { await put(n, bytes, cid); ok++; } catch (e) { /* node unreachable */ } }
  if (!ok) throw new core.HttpError(503, 'No storage node accepted the record');
  return cid;
}
async function fetchBytes(cid) {
  const bad = []; let good = null, node = null;
  for (const n of up()) { const b = await get(n, cid); if (!b) continue; if ((await cidOf(b)) === cid) { good = b; node = n.id; break; } bad.push(n); }
  if (!good) return { ok: false, bad: bad.map(n => n.id) };
  for (const n of bad) { try { await put(n, good, cid); } catch (e) { /* repair later */ } }
  return { ok: true, bytes: good, node, bad: bad.map(n => n.id) };
}
const unpin = async cid => { for (const n of nodes) await rm(n, cid); };
async function scan(cids) {
  let checked = 0, bad = 0, healed = 0;
  for (const cid of cids) {
    const have = {}; for (const n of up()) have[n.id] = await get(n, cid);
    let good = null; for (const n of up()) if (have[n.id] && (await cidOf(have[n.id])) === cid) { good = have[n.id]; break; }
    for (const n of up()) { checked++; if (!have[n.id] || (await cidOf(have[n.id])) !== cid) { bad++; if (good) { try { await put(n, good, cid); healed++; } catch (e) { /* retry next scan */ } } } }
  }
  return { checked, bad, healed };
}
async function status() {
  const out = [];
  for (const n of nodes) {
    let copies = 0, reachable = true;
    if (n.kind === 'local') copies = fs.readdirSync(n.dir).length;
    else { try { await n.c.id(T); for await (const p of n.c.pin.ls({ type: 'all', ...T })) { copies++; void p; } } catch (e) { reachable = false; } }
    out.push({ id: n.id, kind: n.kind, up: !core.D().down[n.id] && reachable, maintenance: !!core.D().down[n.id], copies });
  }
  return out;
}
async function copies(cid) { let n = 0; for (const x of up()) if (await get(x, cid)) n++; return n; }
const ids = () => nodes.map(n => n.id);
const rawNode = id => nodes.find(n => n.id === id);
module.exports = { copies, init, pin, fetchBytes, unpin, scan, status, cidOf, ids, rawNode, put, get, gateway: () => process.env.IPFS_GATEWAY || 'https://ipfs.io/ipfs/' };
