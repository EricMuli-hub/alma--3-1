# Backlog and sprints

Built in short sprints. Each one ends with something that runs and a test that passes.

| Sprint | Goal | Done |
|---|---|---|
| 1 | Screens and demo: roles, issue, claim, verify | yes |
| 2 | Real accounts, server, role rules, ledger | yes |
| 3 | Smart contract and local chain | yes |
| 4 | IPFS storage with repair, encryption | yes |
| 5 | AI scoring, alerts, held records | yes |
| 6 | Issuing by upload, spreadsheet and API key; terms; findings; benchmark | yes |
| 7 | Ready for real data: email, QR and barcode scanning, two-step sign-in, backups, HTTPS deployment, settings check, extension points | yes |

Definition of done: works in the browser, covered by `npm test`, no personal data on the chain, role rules enforced on the server and the contract.

## Next

| Epic | Stories |
|---|---|
| Production | Postgres and more than one server. Monitoring and alerts. Key vault for wallet keys. |
| Security | Independent security test. Move inline scripts out so the policy can be tightened. |
| Chain | Deploy to a public network. Institutions bring their own wallets. Gas sponsoring. |
| IPFS | Pin to nodes in two regions. Pinning service as a third copy. |
| AI | Retrain on real data on a schedule. Per-institution thresholds. Review queue with reasons. |
| Verifier | Certificate QR code that opens the public check. Batch verification for employers. |
| Money | Plans and invoices in live mode. Payment provider. |
| Standards | Open Badges and W3C Verifiable Credentials export. |
| Admin | Two-person approval for new institutions. Audit export for regulators. |
| Compliance | Lawyer review. Data protection impact assessment. Retention jobs. |
