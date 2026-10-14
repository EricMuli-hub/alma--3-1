'use strict';
/* Two-step sign-in: time-based codes (RFC 6238), works with Google Authenticator, Authy and similar apps. */
const c = require('crypto'), A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32 = buf => { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += A[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; };
const unb32 = s => { let bits = ''; for (const ch of s.replace(/=+$/, '')) bits += A.indexOf(ch).toString(2).padStart(5, '0'); const o = []; for (let i = 0; i + 8 <= bits.length; i += 8) o.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(o); };
const code = (secret, t = Date.now()) => { const n = Buffer.alloc(8); n.writeBigUInt64BE(BigInt(Math.floor(t / 30000))); const h = c.createHmac('sha1', unb32(secret)).update(n).digest(), o = h[19] & 15; return String(((h[o] & 127) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1e6).padStart(6, '0'); };
const verify = (secret, given, t = Date.now()) => [-1, 0, 1].some(d => { const a = Buffer.from(code(secret, t + d * 30000)), b = Buffer.from(String(given)); return a.length === b.length && c.timingSafeEqual(a, b); });
const newSecret = () => b32(c.randomBytes(20));
const url = (secret, email, issuer = 'Alma') => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
const sha = s => c.createHash('sha256').update(s).digest('hex');
const makeRecovery = () => { const codes = Array.from({ length: 8 }, () => c.randomBytes(5).toString('hex')); return { codes, hashes: codes.map(sha) }; };
const useRecovery = (u, given) => { const h = sha(String(given).toLowerCase()), i = (u.recovery || []).indexOf(h); if (i < 0) return false; u.recovery.splice(i, 1); return true; };
module.exports = { code, verify, newSecret, url, makeRecovery, useRecovery };
