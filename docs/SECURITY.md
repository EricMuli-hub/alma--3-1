# Security

## In place

- **Passwords** are hashed with scrypt. Sign-in tokens are signed and expire after 12 hours. Changing a password signs out every other device.
- **Two-step sign-in** with an authenticator app and recovery codes. `REQUIRE_2FA` makes it compulsory for chosen roles.
- **Role rules** are checked on the server for every call, and for institutions and regulators on the smart contract too. Every refused attempt is logged and watched by the AI.
- **Personal details** are encrypted (AES-256-GCM) before they leave the server. Only fingerprints and storage addresses go on the blockchain.
- **Stored copies** are verified against their address on every read. A damaged copy is skipped and repaired.
- **Audit log** is hash-chained and its head is anchored on the blockchain.
- **Uploads** are limited in size and must really be PDF, PNG or JPEG.
- **API keys** are stored hashed, can only issue and list, and are rate limited.
- **Web headers**: content security policy, no framing, HTTPS only (HSTS), camera allowed only on this site.
- **Rate limits** on all calls, and tighter ones on login.
- **Settings check**: in production the server refuses to start with weak secrets, no real chain or no IPFS nodes.
- **Backups** are encrypted and scheduled.
- **Logs** hold the method, path (fingerprints removed), status and time. No personal data.

## Known limits

- Institutions sign with wallets the server holds for them. Whoever controls the server and `MASTER_KEY` controls those wallets. Keep the key out of the code and consider a key vault for launch.
- The data file is on the server's disk. Use an encrypted disk.
- The content security policy allows inline scripts because the pages use them. Moving them out is on the backlog.
- Rate limits are kept in memory, so they are per server.
- No independent security test yet. Commission one before launch.
- Camera scanning needs HTTPS (or localhost).
