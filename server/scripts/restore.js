'use strict';
// Restores the data file from a backup. Stop the server first. Usage: npm run restore -- backups/alma-....bak
try { require('fs').readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8').split('\n').forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]; }); } catch (e) { /* no .env */ }
const b = require('../src/backup'), f = process.argv[2] || b.latest();
if (!f) { console.error('No backup found.'); process.exit(1); }
console.log('Restored from', f, '->', b.restore(f).join(', '));
