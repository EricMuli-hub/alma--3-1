# Putting Alma online

About an hour, once you have a server and a domain. Use a test network first.

## 1. What you need

- A server (2 CPU, 4 GB, 40 GB disk is plenty to start) running Linux, with Docker.
- A domain name pointing at the server.
- An email account that can send (any SMTP service).
- A blockchain RPC address. For a pilot use a test network such as Polygon Amoy or Sepolia (free). For launch use Polygon or another network you choose.

## 2. Settings

    cd server
    npm install
    npm run setup -- --url https://your-domain

This writes `server/.env` with strong secrets and prints the owner login and the regulator code. Save them.

**Back up `MASTER_KEY` now**, somewhere safe and separate from the server. Without it, stored records cannot be read, even from a backup.

Edit `server/.env` and fill in:

- `CHAIN_RPC` the network address.
- `SMTP_URL` and `MAIL_FROM` for email.
- `ALLOW_LOCAL_STORAGE=1` only if you run without IPFS nodes. With the compose file below you do not need it.

## 3. Fund the owner wallet

    npm run doctor

It prints the owner wallet address. Send a little of the network's coin to it (from a faucet on a test network). Each issue costs a small amount, and each new institution costs a few transactions. Run `npm run doctor` again until it says Ready.

## 4. Start

From the folder that holds `docker-compose.yml`:

    DOMAIN=your-domain docker compose up -d --build

HTTPS certificates are fetched automatically. Open `https://your-domain`.
On supported browsers, choose **Install Alma** to add it to your device. On iPhone or iPad, open the site in Safari, tap **Share**, then **Add to Home Screen**.


## 5. First sign-in

Open `https://your-domain/studio-k7q2.html`, sign in as the owner, and turn on two-step sign-in when asked. Then create an institution account, approve it, and issue a test record.

## 6. Backups

The server makes an encrypted backup every 6 hours in the data volume and keeps the last 14. Copy them off the server every day, for example:

    docker compose cp alma:/data/backups ./backups-copy

To restore: stop the server, then `npm run restore -- path/to/file.bak`. A backup can only be opened with the same `MASTER_KEY`.

## 7. IPFS nodes

The compose file starts three nodes on the one server, which protects against a node failing but not the server failing. For real protection run the nodes on at least two different servers or providers, and list them in `IPFS_API`.

## 8. Before you invite real users

- [ ] Lawyer has reviewed the terms and privacy pages (`alma/legal.html`), and the contact details in them are yours.
- [ ] Registered with the Office of the Data Protection Commissioner.
- [ ] `npm run doctor` says Ready on the live settings.
- [ ] Owner and regulator accounts have two-step sign-in on.
- [ ] A restore from a backup has been tried once.
- [ ] You tried the whole flow with test records: issue, claim, share, check, scan, erase.

## 9. Updating

Pull the new files, then `docker compose up -d --build`. Data and keys live in volumes and are kept.
