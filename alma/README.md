# Alma

This is the front end for Alma, a system where schools, colleges and universities issue academic records and anyone can check them. An AI layer watches for fraud, scores how far a record can be trusted, and answers a regulator's questions in plain words.

Open `index.html` in Chrome or Edge, nothing to install. In Firefox, or if pages seem to forget your data, run `python3 -m http.server` in this folder and open http://localhost:8000.

Extra tabs for the regulator and owner: Access rules, AI model, Storage and proof, Performance. Students get My data. `js/trust.js` holds all of it. `contracts/AlmaAccess.sol` is the same access rules as a smart contract.

Pages: `index.html` (landing), `role.html` (pick a role), `auth.html` (sign up or sign in for that role), `dashboard.html` (the workspace), `mailbox.html`, `legal.html`.

Printing opens the report on screen with a Print button. Exports (CSV) open as text you can copy. Everything is fake for now: no real email, no real payments, no real ledger. All the data sits in the browser. `js/store.js` is the one file that touches data, so that is the file to replace when the backend is ready. The AI parts (risk scoring, trust score, the auditor) are in the same file, in the `AI` object and `Store.risk`.

## Private
The owner page is `studio-k7q2.html`. Nothing links to it. Sign in with owner@alma.app, demo1234 and the key ALMA-OWNER-2026, then change all three, and rename the file before anyone else sees the site.

## Demo mailbox
The "Demo mailbox" button (bottom right of every page) and `mailbox.html` show every email Alma would send: sign-up codes, record codes, receipts, support replies.

## Logins (password demo1234)
- Institution: admin@kingsway.edu, registration number UNI-0142
- Student: student@mail.com
- Verifier: hr@acme.com
- Regulator: audit@gov.org
- Test card: 4242 4242 4242 4242, any future date, any three digits

## A good run-through
1. As Kingsway, open Issue records and type a result like "Distinction" and watch the risk preview move. Issue it, then read the code in the mailbox.
2. Sign up as a student (Daniel Mwangi, Kingsway University, S-1002, born 2000-09-03). Claim his record with the code from the mailbox.
3. As the verifier, check the share code and print the report. Try a made-up code three times.
4. As the regulator, open AI audit, then Ask the AI auditor and try "which institution is riskiest?".
5. Register a new institution and approve it from the owner page.

7. As the regulator, open Storage and proof. Turn a node off, run the full check, then damage a copy and change a ledger entry. Open Performance and run the test.
8. In AI model, try 3 in the morning with 40 records and see the score.
