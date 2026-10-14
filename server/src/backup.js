'use strict';
/* Encrypted backups of the data file. Safe to copy off the server: they can only be opened with MASTER_KEY. */
const fs = require('fs'), path = require('path'), zlib = require('zlib'), core = require('./core');
const dir = () => { const d = process.env.BACKUP_DIR || path.join(core.DIR, 'backups'); fs.mkdirSync(d, { recursive: true }); return d; };
function make() {
  const file = path.join(dir(), 'alma-' + new Date().toISOString().replace(/[:.]/g, '-') + '.bak');
  fs.writeFileSync(file, core.seal('backup', zlib.gzipSync(core.snapshot())), { mode: 0o600 });
  const all = fs.readdirSync(dir()).filter(f => f.endsWith('.bak')).sort(), keep = +process.env.BACKUP_KEEP || 14;
  all.slice(0, Math.max(0, all.length - keep)).forEach(f => fs.unlinkSync(path.join(dir(), f)));
  return file;
}
const read = file => JSON.parse(zlib.gunzipSync(core.unseal('backup', fs.readFileSync(file), true)).toString());
function restore(file) { const data = read(file); fs.writeFileSync(core.DBF, JSON.stringify(data)); return Object.keys(data); }
const latest = () => { const f = fs.readdirSync(dir()).filter(x => x.endsWith('.bak')).sort().pop(); return f && path.join(dir(), f); };
function schedule() { const mins = +process.env.BACKUP_EVERY_MIN || 360; if (mins > 0) setInterval(() => { try { make(); } catch (e) { console.error('backup failed', e.message); } }, mins * 6e4).unref(); }
module.exports = { make, read, restore, latest, schedule, dir };
