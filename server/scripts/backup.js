'use strict';
// Makes an encrypted backup now. Usage: npm run backup   (restore: npm run restore -- path/to/file.bak)
try { require('fs').readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8').split('\n').forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]; }); } catch (e) { /* no .env */ }
const b = require('../src/backup');
console.log('Backup written:', b.make());
