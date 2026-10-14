'use strict';
/* Blockchain adapter. With CHAIN_RPC set it talks to a real network (Polygon, Sepolia, Anvil, Hardhat).
   Without it, it runs a local EVM (ganache) whose state is kept in the data folder. */
const fs = require('fs'), path = require('path'), { ethers } = require('ethers'), core = require('./core');
const ART = path.join(__dirname, '..', 'build', 'AlmaRegistry.json');
const ROLE = { None: 0, Institution: 1, Regulator: 2 };
let provider, owner, contract, address, embedded = null, gate = Promise.resolve();
const wallets = {};
const wallet = label => wallets[label] || (wallets[label] = new ethers.Wallet(core.derive(label), provider));
const serial = fn => { const run = gate.then(fn, fn); gate = run.catch(() => { }); return run; };   // one transaction at a time keeps nonces in order
const FUND = BigInt(process.env.FUND_WEI || '1000000000000000000');

async function init() {
  if (!fs.existsSync(ART)) require('child_process').execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'compile.js')], { stdio: 'inherit' });
  const art = JSON.parse(fs.readFileSync(ART, 'utf8')), ownerKey = process.env.OWNER_PRIVATE_KEY || core.derive('owner');
  if (process.env.CHAIN_RPC) provider = new ethers.JsonRpcProvider(process.env.CHAIN_RPC, undefined, { cacheTimeout: -1 });
  else {
    const ganache = require('ganache');
    embedded = ganache.provider({ logging: { quiet: true }, chain: { chainId: 1337 }, database: { dbPath: path.join(core.DIR, 'chain') }, wallet: { accounts: [{ secretKey: ownerKey, balance: '0x' + (10n ** 24n).toString(16) }] }, miner: { blockTime: 0 } });
    provider = new ethers.BrowserProvider(embedded, undefined, { cacheTimeout: -1 });
  }
  owner = new ethers.Wallet(ownerKey, provider); wallets.owner = owner;
  const meta = core.D().meta; address = meta.contract;
  if (!address || (await provider.getCode(address)) === '0x') {
    const f = new ethers.ContractFactory(art.abi, art.bytecode, owner), k = await f.deploy(); await k.waitForDeployment();
    address = await k.getAddress(); meta.contract = address; meta.deployedAt = Date.now(); meta.deployBlock = await provider.getBlockNumber(); core.save();
  }
  contract = new ethers.Contract(address, art.abi, owner);
  return info();
}
async function fund(addr) { const bal = await provider.getBalance(addr); if (bal < FUND / 20n) { const tx = await owner.sendTransaction({ to: addr, value: FUND, nonce: await provider.getTransactionCount(owner.address, 'latest') }); await tx.wait(); } }
const w = label => wallet(label), at = label => contract.connect(w(label));
async function send(label, fn) {
  return serial(async () => {
    await fund(w(label).address); const t0 = performance.now(), nonce = await provider.getTransactionCount(w(label).address, 'latest'), tx = await fn(at(label), { nonce }), rc = await tx.wait();
    const g = rc.gasUsed * (rc.gasPrice || 0n);
    return { tx: tx.hash, block: rc.blockNumber, gas: Number(rc.gasUsed), feeWei: g.toString(), ms: Math.round(performance.now() - t0) };
  });
}
const hx = h => '0x' + h;
const decode = e => { if (e instanceof core.HttpError) return e.message; const m = String((e && (e.revert && e.revert.name || e.reason || e.shortMessage)) || e); return /NotApproved/.test(m) ? 'This institution is not approved to issue' : /WrongRole/.test(m) ? 'The contract does not allow this role to do that' : /NotIssuer/.test(m) ? 'Only the issuing institution can do that' : /AlreadyIssued/.test(m) ? 'That fingerprint is already on the chain' : m; };
const run = async (label, fn) => { try { return await send(label, fn); } catch (e) { if (process.env.ALMA_DEBUG) console.error('CHAIN ERR', e.code, e.shortMessage, JSON.stringify(e.error || e.info || {}).slice(0, 300)); const err = new core.HttpError(e.status || 502, decode(e)); throw err; } };

const no = m => { throw new core.HttpError(403, m); };
const roleOf = async label => Number(await contract.roleOf(w(label).address));
const issue = async (label, h, cid) => {   // read the same state the contract checks, so the error is clear
  if ((await roleOf(label)) !== ROLE.Institution) no('The contract does not allow this role to do that');
  if (!(await contract.approved(w(label).address))) no('This institution is not approved to issue');
  if ((await lookup(h)).exists) no('That fingerprint is already on the chain');
  return run(label, (c, o) => c.issue(hx(h), cid, o));
};
const revoke = async (label, h) => { const r = await lookup(h); if (!r.exists) no('Unknown record'); if (r.issuer !== w(label).address) no('Only the issuing institution can do that'); return run(label, (c, o) => c.revoke(hx(h), o)); };
const regulatorOnly = async label => { if ((await roleOf(label)) !== ROLE.Regulator && w(label).address !== owner.address) no('The contract does not allow this role to do that'); };
const hold = async (label, h) => { await regulatorOnly(label); return run(label, (c, o) => c.hold(hx(h), o)); };
const release = async (label, h) => { await regulatorOnly(label); return run(label, (c, o) => c.release(hx(h), o)); };
const grantRole = (label, role) => run('owner', (c, o) => c.grantRole(w(label).address, ROLE[role], o));
const approve = (label, v) => run('owner', (c, o) => c.setApproved(w(label).address, v, o));
const erase = h => run('owner', (c, o) => c.markErased(hx(h), o));
const anchor = (head, n) => run('owner', (c, o) => c.anchor(hx(head), n, o));
async function lookup(h) { const r = await contract.lookup(hx(h)); return { exists: r[0], issuer: r[1], cid: r[2], issuedAt: Number(r[3]) * 1000, revoked: r[4], held: r[5], erased: r[6] }; }
async function anchors() { const n = Number(await contract.anchorCount()), out = []; for (let i = 0; i < n; i++) { const a = await contract.anchors(i); out.push({ head: a[0].slice(2), blocks: Number(a[1]), at: Number(a[2]) * 1000 }); } return out; }
const addressOf = label => w(label).address;
async function info() { const n = await provider.getNetwork(); return { chainId: Number(n.chainId), block: await provider.getBlockNumber(), contract: address, owner: owner.address, mode: process.env.CHAIN_RPC ? 'external' : 'local', anchors: Number(await contract.anchorCount()) }; }
async function close() { try { if (embedded) await embedded.disconnect(); } catch (e) { /* closing */ } }
module.exports = { roleOf, init, info, grantRole, approve, issue, revoke, hold, release, erase, anchor, lookup, anchors, addressOf, close, wallet: w, send, serial };
