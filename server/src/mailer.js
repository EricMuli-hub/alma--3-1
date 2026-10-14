'use strict';
/* Email. Set SMTP_URL (for example smtps://user:pass@smtp.example.com:465) and MAIL_FROM. Without it, nothing is sent. */
const nodemailer = require('nodemailer'); let tr = null;
const enabled = () => !!process.env.SMTP_URL;
const transport = () => tr || (tr = nodemailer.createTransport(process.env.SMTP_URL));
const base = () => (process.env.PUBLIC_URL || '').replace(/\/$/, '');
async function send({ to, subject, text }) {
  if (!enabled()) return { sent: false };
  try { await transport().sendMail({ from: process.env.MAIL_FROM || 'Alma <no-reply@localhost>', to, subject, text }); return { sent: true }; }
  catch (e) { console.error('email failed:', e.message); return { sent: false, error: e.message }; }
}
const claimMail = (to, institution, hash, code) => send({ to, subject: `Your record from ${institution} is ready`, text: `Hello,\n\n${institution} has issued a record to you on Alma.\n\nTo claim it, create a free account (or sign in) as a graduate and choose "Claim a record".\n\nFingerprint: ${hash}\nClaim code: ${code}\n\n${base() ? `Open: ${base()}/auth.html?role=student&mode=signup&h=${hash}\n\n` : ''}If you were not expecting this, you can ignore this email.\n` });
module.exports = { enabled, send, claimMail };
