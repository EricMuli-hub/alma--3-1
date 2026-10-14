# Architecture

    Browser (alma/)  --->  Server (server/src)  --->  Smart contract (AlmaRegistry)
       landing, sign-in        routes.js                roles, issue, revoke, hold, anchor
       role screens            core.js  accounts, audit log, encryption
                               ai.js    isolation forest, alerts
                               chain.js ethers, one wallet per institution
                               ipfs.js  IPFS blocks on several nodes

Two stores with two jobs:

- **Chain**: fingerprint, storage address, status. Public, permanent, no personal data.
- **IPFS**: the record's details, encrypted. Can be shared, exported or erased.

An issue is: check the role and approval, score it with the AI, encrypt and pin to IPFS, write to the chain, log it, hold it on the chain if the AI flagged it.

Also: `mailer.js` (claim emails), `totp.js` (two-step sign-in), `backup.js` (encrypted backups), `config.js` (settings check), `modules/` (drop-in features).

## Adding to it

- **A route**: add a file to `server/src/modules/`. It gets the helpers the built-in routes use.
- **A screen**: from a new script, push `[title, subtitle, view, loader]` into `Live.LV[role]`. See `alma/js/ext-security.js`.


Each concern is one file with a small surface, so a new feature touches one place:

- New record type: add it to the type list in `alma/js/live.js`. Nothing else changes.
- Another chain or storage service: replace `chain.js` or `ipfs.js` internals.
- New check: add a rule in `ai.js` or a feature to the model.
- New role: one line in `POLICY` (`core.js`), one in the contract, one screen set in `live.js`.
- Database: replace the block marked in `core.js`.
