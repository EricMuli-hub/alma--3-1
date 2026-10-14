'use strict';
// Checks the settings and the connections before you go live. Usage: npm run doctor
try { require('fs').readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8').split('\n').forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]; }); } catch (e) { /* no .env */ }
const config = require('../src/config'), { ethers } = require('ethers'), core = require('../src/core');
const line = (ok, t, d = '') => console.log((ok === null ? ' !  ' : ok ? ' ok ' : 'FAIL') + ' ' + t + (d ? '  ' + d : ''));
(async () => {
  const cfg = config.check(); let bad = cfg.errors.length;
  cfg.errors.forEach(e => line(false, e)); cfg.warnings.forEach(w => line(null, w));
  if (!cfg.errors.length) line(true, 'Settings look right');
  if (process.env.CHAIN_RPC) {
    try { const p = new ethers.JsonRpcProvider(process.env.CHAIN_RPC), n = await p.getNetwork(), key = process.env.OWNER_PRIVATE_KEY || core.derive('owner'), w = new ethers.Wallet(key), bal = await p.getBalance(w.address);
      line(true, `Chain reachable (id ${n.chainId}, block ${await p.getBlockNumber()})`); line(bal > 0n, `Owner wallet ${w.address} holds ${ethers.formatEther(bal)}`, bal > 0n ? '' : 'Send some coin to this address'); if (bal === 0n) bad++;
    } catch (e) { line(false, 'Chain not reachable: ' + e.message); bad++; }
  } else line(null, 'No CHAIN_RPC: using the built-in local test chain');
  if (process.env.IPFS_API) {
    const { create } = await import('kubo-rpc-client');
    for (const u of process.env.IPFS_API.split(',')) { try { const id = await create({ url: u.trim() }).id({ timeout: 6000 }); line(true, 'IPFS node reachable: ' + u.trim(), id.agentVersion || ''); } catch (e) { line(false, 'IPFS node not reachable: ' + u.trim()); bad++; } }
  } else line(null, 'No IPFS_API: keeping records in local folders');
  if (process.env.SMTP_URL) { try { await require('nodemailer').createTransport(process.env.SMTP_URL).verify(); line(true, 'Email server accepts our login'); } catch (e) { line(false, 'Email server: ' + e.message); bad++; } }
  console.log(bad ? `\n${bad} problem(s) to fix.` : '\nReady.'); process.exit(bad ? 1 : 0);
})();
