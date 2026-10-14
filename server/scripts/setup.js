'use strict';
// Writes a .env with strong secrets. Usage: node scripts/setup.js --url https://alma.example.com [--force]
const fs = require('fs'), path = require('path'), c = require('crypto');
const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
const file = path.join(__dirname, '..', '.env');
if (fs.existsSync(file) && !process.argv.includes('--force')) { console.error('.env already exists. Use --force to replace it.'); process.exit(1); }
const hex = n => c.randomBytes(n).toString('hex'), ownerPw = c.randomBytes(15).toString('base64url'), reg = c.randomBytes(12).toString('base64url');
const url = arg('url') || 'https://alma.example.com', email = arg('email') || 'owner@' + url.replace(/^https?:\/\//, '').replace(/\/.*/, '');
const tpl = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8')
  .replace(/^TOKEN_SECRET=.*$/m, 'TOKEN_SECRET=' + hex(32)).replace(/^MASTER_KEY=.*$/m, 'MASTER_KEY=' + hex(32))
  .replace(/^OWNER_EMAIL=.*$/m, 'OWNER_EMAIL=' + email).replace(/^OWNER_PASSWORD=.*$/m, 'OWNER_PASSWORD=' + ownerPw)
  .replace(/^REGULATOR_CODE=.*$/m, 'REGULATOR_CODE=' + reg).replace(/^PUBLIC_URL=.*$/m, 'PUBLIC_URL=' + url);
fs.writeFileSync(file, tpl, { mode: 0o600 });
console.log(`Wrote .env (only you can read it).\n\nOwner login:      ${email}  /  ${ownerPw}\nRegulator code:  ${reg}\n\nNow:\n 1. Back up MASTER_KEY somewhere safe and separate. If it is lost, stored records cannot be read.\n 2. Set CHAIN_RPC and IPFS_API (and SMTP_URL, MAIL_FROM) in .env.\n 3. Run: npm run doctor`);
