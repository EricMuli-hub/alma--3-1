# Alma

Proof of every achievement. Institutions issue academic records, graduates own them, employers and regulators check them.

    alma/      the web interface (plain HTML, CSS and JavaScript, no build step)
    server/    the backend: smart contract, IPFS storage, AI fraud checks, audit log
    deploy/    HTTPS and IPFS setup files
    docs/      how to deploy, security, architecture and the backlog

## Try it on your computer

    cd server
    npm install
    npm start

Open http://localhost:8080. It prints an owner login the first time. Add `?demo` to the address for sample data you can click around in.

This mode uses a local test chain and local storage, so it is for trying things out. Do not put real student data in it.

## Put it online for real data

Follow `docs/DEPLOY.md`. In short: `npm run setup`, set a blockchain RPC address, email and your domain, fund the owner wallet, then `docker compose up -d`. `npm run doctor` tells you what is still missing, and in production the server will not start until it is right.
