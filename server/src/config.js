'use strict';
/* Checks the settings before the server starts. In production a weak setup stops the server. */
function check() {
  const e = [], w = [], env = process.env, prod = env.NODE_ENV === 'production';
  if (prod) {
    if ((env.TOKEN_SECRET || '').length < 32) w.push('TOKEN_SECRET is unset or too short; a signing key will be derived from MASTER_KEY');
    if (!/^[0-9a-f]{64}$/i.test(env.MASTER_KEY || '')) e.push('MASTER_KEY must be 64 hex characters (32 random bytes)');
    if ((env.OWNER_PASSWORD || '').length < 12) e.push('OWNER_PASSWORD must be at least 12 characters');
    if ((env.REGULATOR_CODE || '').length < 12) e.push('REGULATOR_CODE must be at least 12 characters');
    if (!/^https:\/\//.test(env.PUBLIC_URL || '')) e.push('PUBLIC_URL must be your https:// address');
    if (!env.CHAIN_RPC) w.push('CHAIN_RPC is not set. Alma is using its local test chain; chain history is not durable across serverless instances');
    if (!env.IPFS_API) w.push('IPFS_API is not set. Alma is using local file storage; stored files are not durable across serverless instances');
    if (env.FORCE_HTTPS !== '1') w.push('FORCE_HTTPS is not 1');
    if (!env.REQUIRE_2FA) w.push('REQUIRE_2FA is empty. Require two-step sign-in for owner and regulator accounts');
  }
  if (!env.SMTP_URL) w.push('SMTP_URL is not set. Claim codes will be shown to the institution instead of emailed');
  if (env.IPFS_API && env.IPFS_API.split(',').length < 2) w.push('Only one IPFS node. Use at least two');
  return { errors: e, warnings: w };
}
module.exports = { check };
