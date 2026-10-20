'use strict';

const { createServer, setup } = require('../server/src/index');

// Vercel keeps a warm Node process between requests. Reuse the app server and
// initialize its external services once per function instance.
const app = createServer();
const ready = setup();

module.exports = async function almaApi(req, res) {
  try {
    await ready;
    req.url = String(req.url || '/').replace(/^\/api(?=\/|\?|$)/, '') || '/';
    const finished = new Promise(resolve => res.once('finish', resolve));
    app.emit('request', req, res);
    await finished;
  } catch (error) {
    console.error('Alma serverless initialization failed:', error.message);
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ error: 'Alma API is not configured' }));
    }
  }
};
