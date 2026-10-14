'use strict';
/* QR codes for records. Scanning one opens the public check page for that record. */
const QR = require('qrcode');
module.exports = ({ add, E, core, hashOk }) => {
    add('GET', '/public/qr/:hash', null, async x => {
    const h = hashOk(String(x.params.hash).replace(/\.svg$/, '')), url = `${x.origin}/verify.html?h=${h}`;
    return { raw: true, type: 'image/svg+xml', body: await QR.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) };
  });
};
