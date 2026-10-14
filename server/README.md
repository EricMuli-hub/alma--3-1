# Alma server

Accounts, role rules on a smart contract, encrypted storage on IPFS, AI fraud checks and a tamper-evident audit log.

## Run it

    npm install
    cp .env.example .env      # fill in the secrets
    npm start                 # port 8080
    npm test                  # 71 checks, about a minute
    npm run doctor            # checks your settings and connections before go-live
    npm run setup             # writes .env with strong secrets
    npm run backup            # encrypted backup now (restore: npm run restore -- file.bak)

With no `.env` it runs in dev mode on a built-in local chain with local storage, and prints an owner login once. It also serves the web interface from `../alma`, so open http://localhost:8080. Use `WEB_DIR` to serve it from somewhere else.

## What is real

| Part | How it works here | For production |
|---|---|---|
| Blockchain | `contracts/AlmaRegistry.sol` compiled and deployed on a local EVM. The contract enforces who may issue, revoke, hold, release and erase. | Set `CHAIN_RPC` (Polygon, Sepolia, Anvil, a private chain) and fund the owner wallet. |
| IPFS | Records are IPFS blocks with real CIDs. Without `IPFS_API` they sit in local folders. With it, they are pinned on your Kubo nodes (tested on three real nodes). | Set `IPFS_API` to two or more Kubo nodes in your country. |
| AI | Isolation forest, trained on reference cases and your ledger, scoring every issuance. Test results at `/audit/model`. | Retrain when real data builds up. |
| Audit log | Hash-chained, head anchored on the chain. | Same. |

## Security and go-live

See `../docs/DEPLOY.md` (step by step) and `../docs/SECURITY.md` (what is in place and what is not). In production the server refuses to start with weak secrets, no real chain, or no IPFS nodes.

## Adding a feature

Drop a file in `src/modules/`. It receives the same helpers as the built-in routes. `qr.js` and `security.js` are examples. On the web side, push a tab into `Live.LV[role]` from a new script, as `alma/js/ext-security.js` does.

## Issuing

Keying and file upload use `POST /credentials`. A spreadsheet uses `POST /credentials/bulk` (100 rows a batch). Automation uses an API key from `POST /apikeys` with `POST /v1/issue` or `/v1/issue/bulk` and the `X-Api-Key` header.

## Main calls

| Call | Who |
|---|---|
| `POST /auth/register` (needs `acceptTerms`), `POST /auth/login`, `GET /me`, `GET /me/export` | everyone |
| `POST /credentials`, `/credentials/bulk`, `GET /credentials/issued`, `POST /credentials/:hash/revoke` | institution |
| `GET/POST/DELETE /apikeys` | institution |
| `POST /credentials/claim`, `GET /credentials/mine`, `POST /credentials/:hash/share`, `/unshare`, `DELETE /credentials/:hash/data` | graduate |
| `GET /verify/:hash`, `GET /credentials/:hash/file` | verifier (file only if shared) |
| `GET /public/verify/:hash`, `GET /public/stats`, `GET /health` | open |
| `/audit/events`, `/flagged`, `/alerts`, `/ledger`, `/chain`, `/model`, `/storage`, `/metrics`, `/benchmark` | regulator, owner |
| `POST /credentials/:hash/release`, `/hold`, `POST /audit/storage/scan`, `/audit/model/retrain` | regulator, owner |
| `POST /institutions/:id/approve`, `/suspend`, `POST /audit/chain/anchor`, `POST /audit/benchmark` | owner |

Send the token as `Authorization: Bearer <token>`.

## Before real credentials

- The data file is one JSON file. Move it to Postgres if you run more than one server.
- Set `SMTP_URL` so claim codes go to students by email. Without it the institution sees the code.
- Institutions sign with wallets the server holds for them. For a fully decentralised version, let institutions bring their own wallets.
- Have a lawyer review `alma/legal.html`.
