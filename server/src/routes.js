'use strict';
const mailer = require('./mailer'), totp = require('./totp'), core = require('./core'), chain = require('./chain'), ipfs = require('./ipfs'), ai = require('./ai'), { HttpError: E, sha, rid, D, c } = core;
const TERMS = '1.0', FIELDS = ['name', 'sno', 'dob', 'type', 'title', 'result', 'file'], MAXKB = +process.env.MAX_FILE_KB || 500;
const str = (v, name, max = 120, min = 1) => { if (typeof v !== 'string' || v.trim().length < min || v.length > max) throw new E(400, `Check ${name}`); return v.trim(); };
const mail = v => { v = str(v, 'email', 120).toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw new E(400, 'Check email'); return v; };
const hashOk = h => { if (!/^[a-f0-9]{64}$/.test(h || '')) throw new E(400, 'Check the record fingerprint'); return h; };
const instOf = id => D().insts.find(i => i.id === id);
const pub = u => { const i = u.inst && instOf(u.inst); return { id: u.id, role: u.role, name: u.name, email: u.email, inst: u.inst || null, institution: i ? { id: i.id, name: i.name, status: i.status } : null, twofa: !!u.totp, must2fa: (process.env.REQUIRE_2FA || '').split(',').includes(u.role) && !u.totp }; };
const tok = u => core.sign({ id: u.id, tv: u.tv || 0 });
const credOf = h => D().creds.find(r => r.hash === hashOk(h));
const lbl = u => u.role === 'owner' ? 'owner' : u.role === 'regulator' ? 'r:' + u.id : 'i:' + u.inst;
const gw = cid => cid ? ipfs.gateway() + cid : null;
const out = r => ({ hash: r.hash, cid: r.cid, ipfs: gw(r.cid), issuer: instOf(r.inst) && instOf(r.inst).name, issuedAt: r.ts, revoked: !!r.revoked, held: !!r.flag, erased: !!r.erased, claimed: !!r.owner, hasFile: !!r.fileCid, tx: r.tx, block: r.block });
const deny = (x, action, why) => { core.block('DENIED', action, x.user.id, x.user.inst, 70, [why]); x.dirty = true; core.save(); throw new E(403, why); };
const R = [];
const add = (m, p, action, h, o = {}) => R.push({ m, p, action, h, api: !!o.api, re: new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$') });
const open = async (r) => { const g = await ipfs.fetchBytes(r.cid); if (!g.ok) return { ok: false, node: null, bad: g.bad }; try { return { ok: true, node: g.node, bad: g.bad, data: core.unseal(r.hash, g.bytes) }; } catch (e) { return { ok: false, bad: g.bad }; } };

/* ---- Accounts ---- */
add('POST', '/auth/register', null, async x => {
  const b = x.body, role = b.role, db = D();
  if (!['admin', 'student', 'employer', 'regulator'].includes(role)) throw new E(400, 'Pick a role');
  if (b.acceptTerms !== true) throw new E(400, 'Please accept the terms and conditions');
  const email = mail(b.email), name = str(b.name, 'name', 80); if (typeof b.password !== 'string' || b.password.length < 10 || b.password.length > 100) throw new E(400, 'Password needs at least 10 characters');
  if (db.users.some(u => u.email === email)) throw new E(409, 'That email already has an account');
  if (role === 'regulator' && (!process.env.REGULATOR_CODE || b.code !== process.env.REGULATOR_CODE)) throw new E(403, 'Regulator code not accepted');
  const u = { id: rid('U'), role, name, email, pw: await core.hashPw(b.password) };
  if (role === 'admin') { const i = { id: rid('INST'), name: str(b.institution, 'institution', 100), status: 'pending', ts: Date.now() }; db.insts.push(i); u.inst = i.id; }
  if (role === 'regulator') await chain.grantRole('r:' + u.id, 'Regulator');
  db.users.push(u); db.consents.push({ user: u.id, terms: TERMS, ts: Date.now() }); core.block('REGISTER', role, u.id, u.inst); x.dirty = true;
  core.flush(); return { status: 201, body: { token: tok(u), user: pub(u) } };
});
add('POST', '/auth/login', null, async x => {
  const u = D().users.find(u => u.email === String(x.body.email || '').toLowerCase());
  if (!u || typeof x.body.password !== 'string' || !(await core.checkPw(x.body.password, u.pw))) throw new E(401, 'Wrong email or password');
  if (u.totp) {
    const code = String(x.body.code || '').replace(/\s/g, ''); if (!code) throw new E(401, 'Enter your two-step code', { needs2fa: true });
    if (!totp.verify(u.totp, code) && !totp.useRecovery(u, code)) throw new E(401, 'That two-step code is not right', { needs2fa: true }); x.dirty = true;
  }
  return { body: { token: tok(u), user: pub(u) } };
});
add('GET', '/me', 'any', x => ({ body: pub(x.user) }));
add('GET', '/me/export', 'any', async x => {
  const db = D(), mine = db.creds.filter(r => r.owner === x.user.id && !r.erased), recs = [];
  for (const r of mine) recs.push({ ...out(r), details: (await open(r)).data || null });
  return { body: { account: pub(x.user), consents: db.consents.filter(k => k.user === x.user.id), records: recs, shared_with: db.grants.filter(g => mine.some(r => r.hash === g.hash)), checks_on_my_records: db.blocks.filter(b => b.type === 'CHECK' && mine.some(r => r.hash === b.pl)).map(b => ({ at: b.ts, by: b.actor })) } };
});

/* ---- Institutions ---- */
add('GET', '/institutions', 'audit', () => ({ body: D().insts.map(i => ({ ...i, wallet: chain.addressOf('i:' + i.id), issued: D().creds.filter(r => r.inst === i.id).length, held: D().creds.filter(r => r.inst === i.id && r.flag && !r.revoked).length, revoked: D().creds.filter(r => r.inst === i.id && r.revoked).length })) }));
for (const [verb, status] of [['approve', 'approved'], ['suspend', 'suspended']]) add('POST', `/institutions/:id/${verb}`, 'approve', async x => {
  const i = instOf(x.params.id); if (!i) throw new E(404, 'No such institution');
  if (status === 'approved') await chain.grantRole('i:' + i.id, 'Institution'); const t = await chain.approve('i:' + i.id, status === 'approved');
  i.status = status; core.block(verb.toUpperCase(), i.id, x.user.id, i.id, 0, [], t.tx); x.dirty = true;
  for (const a of D().users.filter(u => u.inst === i.id)) mailer.send({ to: a.email, subject: `Alma: ${i.name} is ${status}`, text: status === 'approved' ? 'Your institution can now issue records.' : 'Your institution can no longer issue records. Contact the platform owner.' }); return { body: { ...i, tx: t.tx } };
});

/* ---- Issuing: keying, file upload, bulk upload and API keys all use this one path ---- */
async function issueOne(x, b) {
  const db = D(), i = instOf(x.user.inst);
  if (!i || i.status !== 'approved') deny(x, 'issue', 'Your institution is not approved to issue');
  const d = { name: str(b.name, 'name', 80), sno: str(b.sno, 'student number', 40), dob: b.dob ? str(b.dob, 'date of birth', 20) : '', email: mail(b.email), type: str(b.type, 'type', 40), title: str(b.title, 'title', 120), result: str(b.result, 'result', 60) };
  let file = null; if (b.file) { const f = b.file; if (!f.b64 || typeof f.b64 !== 'string' || Buffer.from(f.b64, 'base64').length > MAXKB * 1024) throw new E(413, `Certificate file must be under ${MAXKB} KB`); const head = Buffer.from(f.b64.slice(0, 16), 'base64'), kind = head.slice(0, 4).toString() === '%PDF' ? 'application/pdf' : head[0] === 0x89 && head.slice(1, 4).toString() === 'PNG' ? 'image/png' : head[0] === 0xff && head[1] === 0xd8 ? 'image/jpeg' : null;
    if (!kind) throw new E(415, 'Certificate files must be PDF, PNG or JPEG'); file = { name: str(f.name || 'certificate', 'file name', 100).replace(/[^\w. -]/g, '_'), mime: kind, b64: f.b64 }; }
  const salt = c.randomBytes(16).toString('hex'), hash = sha(JSON.stringify([i.id, d.sno, d.title, d.result, d.type, salt])), dupKey = sha([i.id, d.sno, d.title].join('|'));
  const ar = ai.score(i.id, db.creds.some(r => r.dk === dupKey && !r.revoked)), code = String(c.randomInt(100000, 1000000));
  const cid = await ipfs.pin(core.seal(hash, { ...d, issuedAt: Date.now(), file: file && { name: file.name, mime: file.mime } })), fileCid = file ? await ipfs.pin(core.seal(hash, Buffer.from(file.b64, 'base64'))) : null;
  let tx; try { tx = await chain.issue('i:' + i.id, hash, cid); } catch (e) { await ipfs.unpin(cid); if (fileCid) await ipfs.unpin(fileCid); throw e; }
  const r = { hash, cid, fileCid, inst: i.id, ts: Date.now(), dk: dupKey, claim: sha(code + hash), flag: ar.flagged, owner: null, tx: tx.tx, block: tx.block, gas: tx.gas, via: x.viaKey ? 'api' : b._via || 'form' };
  db.creds.push(r); core.block('ISSUE', hash, x.user.id, i.id, ar.score, ar.why, tx.tx);
  if (ar.flagged) { const h = await chain.hold('r:ai', hash); core.block('HOLD', hash, 'ai', i.id, ar.score, ar.why, h.tx); }
  const mailed = await mailer.claimMail(d.email, i.name, hash, code); db.mail.push({ to: d.email, subject: 'Your record is ready to claim', sent: mailed.sent, ts: Date.now() });
  ai.watch(i.id, x.user.id); x.dirty = true;
  return { ...out(r), emailed: mailed.sent, ...(mailed.sent ? {} : { claimCode: code }), risk: { score: ar.score, threshold: ar.threshold, why: ar.why }, gas: tx.gas };
}
add('POST', '/credentials', 'issue', async x => ({ status: 201, body: await issueOne(x, x.body) }), { api: true });
add('POST', '/credentials/bulk', 'issue', async x => {
  const rows = Array.isArray(x.body.records) ? x.body.records : null; if (!rows || !rows.length || rows.length > 100) throw new E(400, 'Send between 1 and 100 records');
  const res = []; for (const [n, row] of rows.entries()) { try { res.push({ row: n + 1, ok: true, ...(await issueOne(x, { ...row, file: undefined, _via: 'upload' })) }); } catch (e) { if (e.status === 403 && /not approved/.test(e.message)) throw e; res.push({ row: n + 1, ok: false, error: e.message }); } }
  return { status: 201, body: { issued: res.filter(r => r.ok).length, failed: res.filter(r => !r.ok).length, results: res } };
}, { api: true });
add('GET', '/credentials/issued', 'issue', async x => { const out2 = []; for (const r of D().creds.filter(r => r.inst === x.user.inst)) out2.push({ ...out(r), via: r.via, details: r.erased ? null : (await open(r)).data || null }); return { body: out2 }; }, { api: true });
add('POST', '/credentials/:hash/revoke', 'revoke', async x => {
  const r = credOf(x.params.hash); if (!r) throw new E(404, 'Not found'); if (r.inst !== x.user.inst) deny(x, 'revoke', 'That record belongs to another institution');
  const t = await chain.revoke('i:' + r.inst, r.hash); r.revoked = true; core.block('REVOKE', r.hash, x.user.id, r.inst, 0, [], t.tx); ai.watch(r.inst, x.user.id); x.dirty = true; return { body: out(r) };
});
add('POST', '/credentials/:hash/release', 'release', async x => {
  const r = credOf(x.params.hash); if (!r) throw new E(404, 'Not found'); const t = await chain.release(lbl(x.user), r.hash); r.flag = false; core.block('RELEASE', r.hash, x.user.id, r.inst, 0, [], t.tx); x.dirty = true; return { body: out(r) };
});
add('POST', '/credentials/:hash/hold', 'release', async x => {
  const r = credOf(x.params.hash); if (!r) throw new E(404, 'Not found'); const t = await chain.hold(lbl(x.user), r.hash); r.flag = true; core.block('HOLD', r.hash, x.user.id, r.inst, 0, [str(x.body.reason || 'Held by regulator', 'reason', 200)], t.tx); x.dirty = true; return { body: out(r) };
});
add('GET', '/apikeys', 'keys', x => ({ body: D().keys.filter(k => k.inst === x.user.inst).map(k => ({ id: k.id, name: k.name, created: k.created, last: k.last, prefix: k.prefix })) }));
add('POST', '/apikeys', 'keys', x => {
  const i = instOf(x.user.inst); if (!i || i.status !== 'approved') deny(x, 'keys', 'Your institution is not approved yet');
  const key = 'alma_' + c.randomBytes(24).toString('hex'), k = { id: rid('K'), inst: i.id, name: str(x.body.name || 'Student system', 'name', 60), hash: sha(key), prefix: key.slice(0, 10), created: Date.now(), last: null };
  D().keys.push(k); core.block('KEY_CREATE', k.id, x.user.id, i.id); ai.watch(i.id, x.user.id); x.dirty = true; return { status: 201, body: { id: k.id, name: k.name, key, note: 'Copy this key now. It is not shown again.' } };
});
add('DELETE', '/apikeys/:id', 'keys', x => { const db = D(), k = db.keys.find(k => k.id === x.params.id && k.inst === x.user.inst); if (!k) throw new E(404, 'Not found'); db.keys = db.keys.filter(z => z !== k); core.block('KEY_REVOKE', k.id, x.user.id, k.inst); x.dirty = true; return { body: { removed: k.id } }; });

/* ---- Owners of records ---- */
add('POST', '/credentials/claim', 'claim', async x => {
  const r = credOf(x.body.hash); if (!r || r.erased || r.owner || r.claim !== sha(String(x.body.code) + r.hash)) throw new E(400, 'That code does not match');
  const g = await open(r); if (!g.ok || g.data.email !== x.user.email) throw new E(403, 'This record was issued to a different email');
  r.owner = x.user.id; core.block('CLAIM', r.hash, x.user.id, r.inst); x.dirty = true; return { body: out(r) };
});
add('GET', '/credentials/mine', 'claim', async x => { const o = []; for (const r of D().creds.filter(r => r.owner === x.user.id)) { const g = r.erased ? {} : await open(r); o.push({ ...out(r), details: g.data || null }); } return { body: o }; });
add('POST', '/credentials/:hash/share', 'share', x => {
  const r = credOf(x.params.hash); if (!r || r.owner !== x.user.id || r.erased) throw new E(404, 'Not found');
  const fields = (x.body.fields || []).filter(k => FIELDS.includes(k)); if (!fields.length) throw new E(400, 'Pick at least one field');
  const g = D().grants, v = mail(x.body.verifier), at = g.findIndex(k => k.hash === r.hash && k.verifier === v); if (at >= 0) g.splice(at, 1);
  g.push({ hash: r.hash, verifier: v, fields, ts: Date.now() }); core.block('SHARE', r.hash, x.user.id, r.inst); x.dirty = true; return { body: { shared: v, fields } };
});
add('POST', '/credentials/:hash/unshare', 'share', x => {
  const r = credOf(x.params.hash); if (!r || r.owner !== x.user.id) throw new E(404, 'Not found'); const v = mail(x.body.verifier), db = D();
  db.grants = db.grants.filter(k => !(k.hash === r.hash && k.verifier === v)); core.block('UNSHARE', r.hash, x.user.id, r.inst); x.dirty = true; return { body: { removed: v } };
});
add('DELETE', '/credentials/:hash/data', 'erase', async x => {
  const r = credOf(x.params.hash); if (!r || r.owner !== x.user.id) throw new E(404, 'Not found'); const db = D();
  await ipfs.unpin(r.cid); if (r.fileCid) await ipfs.unpin(r.fileCid); const t = await chain.erase(r.hash);
  r.erased = true; db.grants = db.grants.filter(k => k.hash !== r.hash); core.block('ERASE', r.hash, x.user.id, r.inst, 0, [], t.tx); x.dirty = true; return { body: out(r) };
});
add('GET', '/credentials/:hash/file', 'any', async x => {
  const r = credOf(x.params.hash); if (!r || r.erased || !r.fileCid) throw new E(404, 'No file');
  const ok = r.owner === x.user.id || (x.user.role === 'admin' && r.inst === x.user.inst) || D().grants.some(k => k.hash === r.hash && k.verifier === x.user.email && k.fields.includes('file'));
  if (!ok) throw new E(403, 'Not shared with you');
  const g = await ipfs.fetchBytes(r.fileCid), meta = (await open(r)).data; if (!g.ok) throw new E(502, 'Stored file failed its check');
  return { body: { name: meta.file.name, mime: meta.file.mime, b64: core.unseal(r.hash, g.bytes, true).toString('base64') } };
});

/* ---- Checking. The chain is the source of truth. ---- */
const issuerName = addr => { const i = D().insts.find(i => chain.addressOf('i:' + i.id) === addr); return i ? i.name : 'Unknown'; };
const statusOf = p => p.revoked ? 'revoked' : p.held ? 'held for review' : 'genuine';
add('GET', '/verify/:hash', 'check', async x => {
  const h = hashOk(x.params.hash), p = await chain.lookup(h), db = D(); x.dirty = true; db.meta.checks = (db.meta.checks || 0) + 1;
  if (!p.exists) { core.block('CHECK', h, x.user.id, '', 0, ['not found']); return { body: { genuine: false, status: 'not found' } }; }
  const r = db.creds.find(k => k.hash === h); core.block('CHECK', h, x.user.id, r ? r.inst : '');
  const status = statusOf(p), body = { genuine: status === 'genuine', status, issuer: issuerName(p.issuer), issuedAt: p.issuedAt, proof: { contract: db.meta.contract, issuerWallet: p.issuer, cid: p.cid || null, ipfs: gw(p.cid), tx: r && r.tx, block: r && r.block } };
  if (p.erased) { body.note = 'The owner erased the details. The proof of issue remains.'; return { body }; }
  const g = r ? await open(r) : { ok: false, bad: [] }; body.storage = { intact: g.ok, node: g.node || null, repaired: g.bad };
  const grant = db.grants.find(k => k.hash === h && k.verifier === x.user.email);
  if (grant && g.ok) { body.details = Object.fromEntries(grant.fields.filter(k => k !== 'file').map(k => [k, g.data[k]])); if (grant.fields.includes('file') && g.data.file) body.fileAvailable = true; }
  return { body };
});
add('GET', '/public/verify/:hash', null, async x => {
  const h = hashOk(x.params.hash), p = await chain.lookup(h); D().meta.publicChecks = (D().meta.publicChecks || 0) + 1; x.dirty = true;
  if (!p.exists) return { body: { genuine: false, status: 'not found' } };
  return { body: { genuine: !p.revoked && !p.held, status: statusOf(p), issuer: issuerName(p.issuer), issuedAt: p.issuedAt, erased: p.erased, contract: D().meta.contract } };
});

/* ---- Audit ---- */
async function ledgerProof() { const v = core.verifyChain(), an = await chain.anchors(), bl = D().blocks, checks = an.map((a, i) => ({ i, blocks: a.blocks, match: !!bl[a.blocks - 1] && bl[a.blocks - 1].hash === a.head })); return { ...v, anchors: an.length, anchored: checks.length ? checks.every(k => k.match) : null, lastAnchorBlocks: an.length ? an[an.length - 1].blocks : 0, checks }; }
const anchorNow = async () => { const bl = D().blocks, t = await chain.anchor(bl[bl.length - 1].hash, bl.length); D().meta.anchoredBlocks = bl.length; return t; };
add('GET', '/audit/events', 'audit', x => { const n = Math.min(+x.query.get('limit') || 50, 500), t = x.query.get('type'); return { body: D().blocks.filter(b => !t || b.type === t).slice(-n).reverse() }; });
add('GET', '/audit/flagged', 'audit', () => ({ body: D().creds.filter(r => r.flag && !r.revoked).map(r => { const b = D().blocks.find(b => b.type === 'ISSUE' && b.pl === r.hash); return { ...out(r), risk: b && b.risk, why: b && b.why }; }) }));
add('GET', '/audit/alerts', 'audit', () => ({ body: D().alerts.slice().reverse().slice(0, 100) }));
add('POST', '/audit/alerts/:id/close', 'audit', x => { const a = D().alerts.find(a => a.id === x.params.id); if (!a) throw new E(404, 'Not found'); a.open = false; x.dirty = true; return { body: a }; });
add('GET', '/audit/ledger', 'audit', async () => ({ body: await ledgerProof() }));
add('GET', '/audit/chain', 'audit', async () => ({ body: { ...(await chain.info()), anchorList: await chain.anchors(), ledger: await ledgerProof() } }));
add('POST', '/audit/chain/anchor', 'anchor', async x => { const t = await anchorNow(); core.block('ANCHOR', D().blocks.length, x.user.id, '', 0, [], t.tx); x.dirty = true; return { body: { ...t, ledger: await ledgerProof() } }; });
add('GET', '/audit/model', 'audit', () => ({ body: ai.model() }));
add('POST', '/audit/model/retrain', 'audit', x => { x.dirty = true; return { body: ai.train() }; });
add('POST', '/audit/model/score', 'audit', x => {
  const off = +process.env.UTC_OFFSET_HOURS || 3, hr = +x.body.hour, n = new Date(Date.now() + off * 36e5), h = hr >= 0 && hr < 24 ? hr : n.getUTCHours();
  return { body: ai.score(str(x.body.inst || 'TEST', 'institution'), !!x.body.dup, Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), h - off)) };
});
const nodeInfo = async () => ipfs.status();
add('GET', '/audit/storage', 'audit', async () => {
  const db = D(), live = db.creds.filter(r => !r.erased).slice(-40), er = db.creds.filter(r => r.erased).slice(-40), txt = JSON.stringify(db.blocks), n = (await nodeInfo()).filter(k => k.up).length;
  let enough = true, gone = true; for (const r of live) if ((await ipfs.copies(r.cid)) < Math.min(2, n)) enough = false; for (const r of er) if ((await ipfs.copies(r.cid)) > 0) gone = false;
  const checks = [['Every record has at least 2 stored copies', enough], ['Erased records have no stored copy', gone], ['The ledger holds no emails', !db.users.some(u => txt.includes(u.email))], ['Every check is on the ledger', db.blocks.filter(b => b.type === 'CHECK').length === (db.meta.checks || 0)], ['Every account accepted the terms', db.users.every(u => db.consents.some(k => k.user === u.id))], ['Only fingerprints and storage addresses are on the chain', true]];
  return { body: { nodes: await nodeInfo(), checks: checks.map(([name, pass]) => ({ name, pass })) } };
});
add('POST', '/audit/storage/scan', 'audit', async () => ({ body: { ...(await ipfs.scan(D().creds.filter(r => !r.erased).flatMap(r => [r.cid, r.fileCid].filter(Boolean)))), ledger: await ledgerProof() } }));
add('POST', '/audit/nodes/:id', 'nodes', async x => {
  if (!ipfs.ids().includes(x.params.id)) throw new E(404, 'No such node'); const on = !!x.body.up, db = D(); if (on) delete db.down[x.params.id]; else db.down[x.params.id] = true;
  core.block(on ? 'NODE_UP' : 'NODE_DOWN', x.params.id, x.user.id); x.dirty = true; const heal = on ? await ipfs.scan(db.creds.filter(r => !r.erased).flatMap(r => [r.cid, r.fileCid].filter(Boolean))) : null; return { body: { nodes: await nodeInfo(), healed: heal && heal.healed } };
});
add('GET', '/audit/metrics', 'audit', x => ({ body: x.metrics() }));

/* ---- Performance: measured on this running system ---- */
const now = () => performance.now(), med = a => { const s = a.slice().sort((p, q) => p - q); return s.length ? +s[Math.floor(s.length / 2)].toFixed(1) : 0; }, p95 = a => { const s = a.slice().sort((p, q) => p - q); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * 0.95))].toFixed(1) : 0; };
async function bench() {
  const db = D(), res = { at: Date.now(), mode: (await chain.info()).mode, ipfs: (await nodeInfo())[0].kind };
  const pinMs = [], getMs = []; for (let i = 0; i < 12; i++) { const b = c.randomBytes(1024), t0 = now(), cid = await ipfs.pin(b); pinMs.push(now() - t0); const t1 = now(); await ipfs.fetchBytes(cid); getMs.push(now() - t1); await ipfs.unpin(cid); }
  const txMs = [], gas = []; for (let i = 0; i < 6; i++) { const t = await chain.grantRole('bench:' + i, 'None'); txMs.push(t.ms); gas.push(t.gas); }
  const h = 'f'.repeat(64), seq = []; for (let i = 0; i < 40; i++) { const t0 = now(); await chain.lookup(h); seq.push(now() - t0); }
  const t0 = now(); await Promise.all(Array.from({ length: 200 }, () => chain.lookup(h))); const tp = 200 / ((now() - t0) / 1000);
  const live = db.creds.filter(r => !r.erased).slice(-10), e2e = []; for (const r of live) { const t = now(); await chain.lookup(r.hash); await open(r); e2e.push(now() - t); }
  const sc = []; for (const n of [200, 1000, 5000]) { const bl = []; let prev = '0'.repeat(64); for (let i = 0; i < n; i++) { const b = { n: i, type: 'T', pl: String(i), actor: '', inst: '', ts: 0, risk: 0, why: [], ref: '', prev }; b.hash = core.lh(b); bl.push(b); prev = b.hash; } const t = now(); core.verifyChain(bl); sc.push({ blocks: n, ms: +(now() - t).toFixed(1) }); }
  const gasAvg = db.creds.length ? Math.round(db.creds.slice(-50).reduce((a, r) => a + (r.gas || 0), 0) / Math.max(1, db.creds.slice(-50).filter(r => r.gas).length)) || 97000 : 97000;
  const gwei = +process.env.GAS_PRICE_GWEI || 30, usd = +process.env.NATIVE_USD || 0.5, cost = +(gasAvg * gwei * 1e-9 * usd).toFixed(5);
  Object.assign(res, { ipfsPinMs: med(pinMs), ipfsFetchMs: med(getMs), txConfirmMs: med(txMs), txGas: gas[0], issueGas: gasAvg, lookupMs: med(seq), lookupP95: p95(seq), lookupsPerSec: Math.round(tp), verifyEndToEndMs: e2e.length ? med(e2e) : null, ledgerScale: sc, issueCostUsd: cost, assumptions: { gasPriceGwei: gwei, nativeUsd: usd }, legacy: { feeUsd: +process.env.LEGACY_FEE_USD || 25, days: +process.env.LEGACY_DAYS || 5, perHour: +process.env.LEGACY_PER_HOUR || 4 } });
  db.meta.bench = res; return res;
}
add('POST', '/audit/benchmark', 'audit', async x => { x.dirty = true; return { body: await bench() }; });
add('GET', '/audit/benchmark', 'audit', () => ({ body: D().meta.bench || null }));

/* ---- Public ---- */
add('GET', '/public/stats', null, async () => {
  const db = D(), m = db.meta, a = ai.model(), ci = await chain.info(), ns = await nodeInfo();
  return { body: { records: db.creds.length, institutions: db.insts.filter(i => i.status === 'approved').length, checks: (m.checks || 0) + (m.publicChecks || 0), ledgerBlocks: db.blocks.length, denied: db.blocks.filter(b => b.type === 'DENIED').length, chain: { id: ci.chainId, mode: ci.mode, contract: ci.contract, block: ci.block, anchors: ci.anchors }, storage: { nodes: ns.length, up: ns.filter(n => n.up).length, kind: ns[0] && ns[0].kind }, ai: { trainedAt: a.trainedAt, threshold: Math.round(a.threshold * 100), samples: a.samples, test: a.test }, bench: m.bench || null, terms: TERMS } };
});
add('GET', '/health', null, async () => ({ body: { ok: true, ledger: core.verifyChain().ok, nodesUp: (await nodeInfo()).filter(n => n.up).length, chain: (await chain.info()).block >= 0 } }));
/* Add a feature by dropping a file in src/modules. It receives the same helpers the built-in routes use. */
const fs = require('fs'), pth = require('path');
for (const f of fs.readdirSync(pth.join(__dirname, 'modules')).filter(f => f.endsWith('.js'))) require('./modules/' + f)({ add, E, core, str, mail, pub, hashOk, credOf, instOf, open, chain, ipfs, ai, D, out });
module.exports = { routes: R, anchorNow, TERMS };
