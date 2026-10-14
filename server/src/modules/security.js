'use strict';
/* Password change and two-step sign-in. */
const QR = require('qrcode'), totp = require('../totp');
module.exports = ({ add, E, core, pub, str }) => {
  add('POST', '/me/password', 'any', async x => {
    if (!(await core.checkPw(String(x.body.current || ''), x.user.pw))) throw new E(401, 'Your current password is not right');
    const n = x.body.next; if (typeof n !== 'string' || n.length < 10 || n.length > 100) throw new E(400, 'The new password needs at least 10 characters');
    x.user.pw = await core.hashPw(n); x.user.tv = (x.user.tv || 0) + 1; core.block('PASSWORD', x.user.id, x.user.id, x.user.inst); x.dirty = true; core.flush();
    return { body: { token: core.sign({ id: x.user.id, tv: x.user.tv }), note: 'Other devices have been signed out.' } };
  });
  add('POST', '/me/2fa/setup', 'any', async x => {
    if (x.user.totp) throw new E(409, 'Two-step sign-in is already on');
    x.user.totpPending = totp.newSecret(); x.dirty = true; const url = totp.url(x.user.totpPending, x.user.email);
    return { body: { secret: x.user.totpPending, otpauth: url, qr: await QR.toString(url, { type: 'svg', margin: 1 }) } };
  });
  add('POST', '/me/2fa/enable', 'any', x => {
    if (!x.user.totpPending || !totp.verify(x.user.totpPending, String(x.body.code || '').replace(/\s/g, ''))) throw new E(400, 'That code is not right. Check the time on your phone.');
    const r = totp.makeRecovery(); x.user.totp = x.user.totpPending; delete x.user.totpPending; x.user.recovery = r.hashes; x.user.tv = (x.user.tv || 0) + 1;
    core.block('2FA_ON', x.user.id, x.user.id, x.user.inst); x.dirty = true; core.flush();
    return { body: { token: core.sign({ id: x.user.id, tv: x.user.tv }), recoveryCodes: r.codes, note: 'Keep these recovery codes somewhere safe. Each works once.' } };
  });
  add('POST', '/me/2fa/disable', 'any', async x => {
    if (!x.user.totp) throw new E(409, 'Two-step sign-in is not on');
    if ((process.env.REQUIRE_2FA || '').split(',').includes(x.user.role)) throw new E(403, 'Your role must keep two-step sign-in on');
    if (!(await core.checkPw(String(x.body.password || ''), x.user.pw)) || !totp.verify(x.user.totp, String(x.body.code || '').replace(/\s/g, ''))) throw new E(401, 'Password or code not right');
    delete x.user.totp; delete x.user.recovery; x.user.tv = (x.user.tv || 0) + 1; core.block('2FA_OFF', x.user.id, x.user.id, x.user.inst); x.dirty = true; core.flush();
    return { body: { token: core.sign({ id: x.user.id, tv: x.user.tv }) } };
  });
};
