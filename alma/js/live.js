/* Live mode: the same screens, talking to the server. In js/config.js set MODE to "live" and api to the server address.
   This file also holds the public record check used by the landing page. */
const Live = { on: () => CONFIG.MODE === "live" };
const Api = {
  async call(m, p, b) {
    const t = sessionStorage.getItem("alma_tok");
    const r = await fetch(CONFIG.api + p, { method: m, headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) }, body: b ? JSON.stringify(b) : undefined });
    let j = {}; try { j = await r.json(); } catch (e) { /* empty */ }
    if (!r.ok) { if (r.status === 401 && t && !j.needs2fa) { sessionStorage.removeItem("alma_tok"); go("/role?mode=signin"); } const er = new Error(j.error || "Request failed"); er.needs2fa = j.needs2fa; er.setup2fa = j.setup2fa; throw er; }
    return j;
  },
  get: p => Api.call("GET", p), post: (p, b) => Api.call("POST", p, b || {}), del: p => Api.call("DELETE", p)
};

/* Public check, landing numbers and findings. Works in the demo too. */
const Quick = {
  async check(h) {
    h = (Scan.parse(h) || ""); if (!/^[a-f0-9]{64}$/.test(h)) throw new Error("A fingerprint is 64 letters and numbers.");
    if (Live.on()) return Api.get("/public/verify/" + h);
    await Store.ready; const c = Store.d.creds.find(x => x.hash === h); if (!c) return { genuine: false, status: "not found" };
    return { genuine: !c.revoked && !c.flag, status: c.revoked ? "revoked" : c.flag ? "held for review" : "genuine", issuer: (Store.inst(c.inst) || {}).institution, issuedAt: c.t };
  },
  wire(inp, btn, out) {
    btn.onclick = async () => {
      out.innerHTML = "Checking…";
      try { const r = await Quick.check(inp.value), cls = r.genuine ? "ok" : r.status === "not found" ? "bad" : "warn";
        out.innerHTML = `<div class="res ${cls}"><b>${r.genuine ? "Genuine" : esc(r.status)}</b>${r.issuer ? `<br>Issued by ${esc(r.issuer)}${r.issuedAt ? " on " + new Date(r.issuedAt).toLocaleDateString() : ""}` : ""}${r.erased ? "<br>The owner has erased the details." : ""}</div>`;
      } catch (e) { out.innerHTML = `<div class="res bad">${esc(e.message)}</div>`; }
    };
    inp.onkeydown = e => { if (e.key === "Enter") btn.click(); };
  },
  async stats() {
    if (Live.on()) { try { return await Api.get("/public/stats"); } catch (e) { return {}; } }
    await Store.ready; const d = Store.d; return { records: d.creds.length, institutions: d.users.filter(u => u.role === "admin").length, checks: (d.checks || []).length };
  },
  async findings() { if (!Live.on()) return null; try { return await Api.get("/public/stats"); } catch (e) { return null; } }
};

/* Sign in and sign up */
Live.auth = () => {
  const q = qp(), role = q.get("role"), mode = q.get("mode") === "signin" ? "signin" : "signup", up = mode === "signup", R = ROLES[role];
  if (!R || role === "owner") return go("/role?mode=" + mode);
  $("#mk").innerHTML = MARK; document.documentElement.style.setProperty("--ac", R.c); document.title = (up ? "Sign up" : "Sign in") + " · " + R.n + " – Alma";
  $("#st").textContent = R.n; $("#sp").textContent = R.does; $("#sa").innerHTML = R.allow.map(a => "<li>" + a + "</li>").join(""); $("#sn").hidden = true;
  $("#h").textContent = up ? "Create your " + R.n.toLowerCase() + " account" : "Sign in as " + R.n.toLowerCase(); $("#back").href = "role.html?mode=" + mode;
  $("#t1").href = "auth.html?role=" + role + "&mode=signup"; $("#t2").href = "auth.html?role=" + role + "&mode=signin"; $(up ? "#t1" : "#t2").setAttribute("aria-current", "page");
  const f = (id, l, t = "text") => `<label for="${id}">${l}</label><input id="${id}" type="${t}">`;
  if (q.get("h")) sessionStorage.setItem("alma_claim_h", q.get("h"));
  $("#ex").innerHTML = up ? f("nm", "Full name") + (role === "admin" ? f("ins", "Institution name") : "") + (role === "regulator" ? f("rc", "Regulator code") : "") : "";
  $("#pws").innerHTML = f("pw", "Password" + (up ? " (10+ characters)" : ""), "password") + (up ? "" : `<label for="cd">Two-step code <span class="hint">(only if you turned it on)</span></label><input id="cd" inputmode="numeric" autocomplete="one-time-code">`) + (up ? `<label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px"><input id="tc" type="checkbox" style="width:auto;margin-top:3px"><span>I accept the <a href="legal.html#terms" target="_blank">terms and conditions</a> and the <a href="legal.html#privacy" target="_blank">privacy notice</a>.</span></label>` : "");
  ["#mt", "#tools", "#dm", "#mh", "#tcn"].forEach(s => { const e = $(s); if (e) e.hidden = true; });
  $("#sub").textContent = up ? "Create account" : "Sign in";
  $("#f").onsubmit = async e => {
    e.preventDefault(); $("#er").textContent = "";
    try {
      if (up && !$("#tc").checked) throw new Error("Please accept the terms and conditions to continue.");
      const b = { email: $("#em").value.trim(), password: $("#pw").value, code: up ? undefined : val("cd") };
      if (up) Object.assign(b, { role, name: $("#nm").value, acceptTerms: true, institution: role === "admin" ? $("#ins").value : undefined, code: role === "regulator" ? $("#rc").value : undefined });
      const r = await Api.post(up ? "/auth/register" : "/auth/login", b);
      if (r.user.role !== role) throw new Error("That is not a " + R.n.toLowerCase() + " account.");
      sessionStorage.setItem("alma_tok", r.token); go("/app");
    } catch (x) { $("#er").textContent = x.message; }
  };
};
Live.ownerSubmit = async e => {
  e.preventDefault();
  try { const r = await Api.post("/auth/login", { email: $("#em").value.trim(), password: $("#pw").value, code: ($("#ky") || {}).value || "" }); if (r.user.role !== "owner") throw new Error("Those details were not recognised."); sessionStorage.setItem("alma_tok", r.token); go("/app"); }
  catch (x) { $("#er").textContent = x.message; }
};
if (typeof mountAuth === "function") { const _ma = mountAuth; mountAuth = function () { return Live.on() ? Live.auth() : _ma(); }; }

if (typeof mountDashboard === "function") {
  const lT = (h, rows) => `<div class="sc"><table><thead><tr>${h.map(x => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  const when = t => new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }), LD = {};
  const tags = r => (r.revoked ? tg("Revoked", "bad") : r.held ? tg("Held for review", "warn") : tg("Genuine", "ok")) + (r.erased ? " " + tg("Details erased", "neutral") : "");
  const val = id => ($("#" + id) || {}).value || "", mono = (h, n = 12) => h ? `<span class="mono">${h.slice(0, n)}…</span>` : "–";
  const proof = r => r.tx ? `<span class="hint">Block ${r.block} · tx ${r.tx.slice(0, 10)}… · ${r.ipfs ? `<a href="${r.ipfs}" target="_blank" rel="noopener">IPFS</a>` : ""}</span>` : "";
  const row = (k, v) => `<div class="row"><span class="hint">${k}</span><span>${v}</span></div>`;
  const reload = async () => { const f = VIEWS[me.role][tab] && VIEWS[me.role][tab][3]; if (f) { try { await f(); } catch (e) { toast(e.message); } } render(); };
  const run = async (fn, ok) => { try { const r = await fn(); if (ok) toast(ok); await reload(); return r; } catch (e) { toast(e.message); } };
  const dl = (name, mime, b64) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
  const fileB64 = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = () => no(new Error("Could not read the file")); r.readAsDataURL(f); });
  const parseCSV = txt => { const rows = []; let cur = [], f = "", q = false; for (let i = 0; i < txt.length; i++) { const ch = txt[i]; if (q) { if (ch === '"' && txt[i + 1] === '"') { f += '"'; i++; } else if (ch === '"') q = false; else f += ch; } else if (ch === '"') q = true; else if (ch === ",") { cur.push(f); f = ""; } else if (ch === "\n" || ch === "\r") { if (ch === "\r" && txt[i + 1] === "\n") i++; cur.push(f); f = ""; if (cur.some(x => x.trim())) rows.push(cur); cur = []; } else f += ch; } cur.push(f); if (cur.some(x => x.trim())) rows.push(cur); const h = (rows.shift() || []).map(x => x.trim().toLowerCase()); return rows.map(r => Object.fromEntries(h.map((k, i) => [k, (r[i] || "").trim()]))); };
  const TEMPLATE = "name,sno,email,type,title,result,dob\nAmina Otieno,S1001,amina@example.com,Degree,BSc Computer Science,Second Class Upper,2001-04-12\n";

  /* Institution */
  const admHome = () => { const i = me.institution, I = LD.issued || [], good = i.status === "approved"; return card("Your institution", `<p><b>${esc(i.name)}</b> ${tg(good ? "Approved" : i.status === "suspended" ? "Suspended" : "Waiting for approval", good ? "ok" : "warn")}</p>${good ? "" : "<p class='hint'>You can issue records once the platform owner approves you.</p>"}`) + `<div class="kpis">${kpi("Issued", I.length)}${kpi("Held for review", I.filter(r => r.held && !r.revoked).length)}${kpi("Revoked", I.filter(r => r.revoked).length)}</div>`; };
  const admIssue = () => card("Key in one record", `<div class="grid2"><div><label for="iN">Student name</label><input id="iN"></div><div><label for="iS">Student number</label><input id="iS"></div><div><label for="iE">Student email</label><input id="iE" type="email"></div><div><label for="iD">Date of birth</label><input id="iD" type="date"></div><div><label for="iY">Type</label><select id="iY"><option>Degree</option><option>Diploma</option><option>Certificate</option><option>Transcript</option></select></div><div><label for="iT">Title</label><input id="iT"></div><div><label for="iR">Result</label><input id="iR"></div><div><label for="iF">Certificate file <span class="hint">(optional, PDF or image, up to 500 KB)</span></label><input id="iF" type="file" accept=".pdf,image/*"></div></div><button class="btn" data-a="issue" style="margin-top:12px">Issue</button>`);
  const admUpload = () => card("Upload a spreadsheet", `<p class="hint">One CSV file with the columns name, sno, email, type, title, result and dob (optional). Up to 100 records per batch, any number of batches.</p><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input id="uF" type="file" accept=".csv,text/csv" onchange="Live.csvLoad(this)" style="max-width:320px"><button class="btn sm o" data-a="csvtemplate">Get the template</button></div>` + (LD.csv ? `<p style="margin-top:12px"><b>${LD.csv.length}</b> rows ready.</p>${lT(["Name", "No.", "Email", "Title", "Result"], LD.csv.slice(0, 5).map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.sno)}</td><td>${esc(r.email)}</td><td>${esc(r.title)}</td><td>${esc(r.result)}</td></tr>`))}${LD.csv.length > 5 ? `<p class="hint">and ${LD.csv.length - 5} more</p>` : ""}<button class="btn" data-a="bulk" style="margin-top:12px">Issue ${LD.csv.length} records</button>` : ""));
  const admConnect = () => card("Connect your student system", `<p>Your system can issue records by itself. Make a key, then send each record to Alma when it is ready.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="kN" placeholder="Name this key" style="max-width:240px"><button class="btn sm" data-a="keynew">Make a key</button></div>` + ((LD.keys || []).length ? lT(["Name", "Key", "Last used", ""], LD.keys.map(k => `<tr><td>${esc(k.name)}</td><td class="mono">${esc(k.prefix)}…</td><td>${k.last ? when(k.last) : "never"}</td><td><button class="btn sm o" data-a="keydel" data-k="${k.id}">Remove</button></td></tr>`)) : "") + `<p class="hint" style="margin-top:12px">Example</p><pre class="mono" style="white-space:pre-wrap;background:var(--acb);padding:12px;border-radius:10px;font-size:12px">curl -X POST ${esc(CONFIG.api || location.origin)}/v1/issue \\\n  -H "X-Api-Key: YOUR_KEY" -H "Content-Type: application/json" \\\n  -d '{"name":"Amina Otieno","sno":"S1001","email":"amina@example.com","type":"Degree","title":"BSc Computer Science","result":"Second Class Upper"}'</pre><p class="hint">Keys can only issue and list records. Send up to 100 at once to <span class="mono">/v1/issue/bulk</span> as {"records":[...]}.</p>`);
  const admRecords = () => card("Records", (LD.issued || []).length ? lT(["Record", "Student", "Status", "How", "Proof", ""], LD.issued.map(r => `<tr><td>${r.details ? esc(r.details.title) : "Erased"}<br>${mono(r.hash)}</td><td>${r.details ? esc(r.details.name) : "–"}</td><td>${tags(r)}</td><td>${esc(r.via || "")}</td><td>${proof(r)}</td><td>${r.revoked ? "" : `<button class="btn sm o" data-a="revoke" data-h="${r.hash}">Revoke</button>`}</td></tr>`)) : "<p>Nothing issued yet.</p>");

  /* Graduate */
  const stuRecords = () => { const M = LD.mine || []; return card("Claim a record", `<p class="hint">Enter the fingerprint and the 6-digit code from your institution.</p><label for="cH">Fingerprint</label><input id="cH" value="${esc(sessionStorage.getItem("alma_claim_h") || "")}"><label for="cC">Code</label><input id="cC" inputmode="numeric" maxlength="6"><button class="btn" data-a="claim" style="margin-top:12px">Claim</button>`) + (M.length ? M.map(r => card(r.details ? esc(r.details.title) : "Erased record", `<p>${tags(r)}</p>${r.details ? `<p>${esc(r.details.result)} · ${esc(r.issuer || "")}</p>` : ""}<p class="hint">${mono(r.hash, 20)}</p><p>${proof(r)}</p><div style="display:flex;gap:8px;flex-wrap:wrap">${r.erased ? "" : `<button class="btn sm" data-a="shareask" data-h="${r.hash}" data-f="${r.hasFile ? 1 : 0}">Share</button><button class="btn sm o" data-a="qr" data-h="${r.hash}">QR code</button><button class="btn sm o" data-a="erase" data-h="${r.hash}">Erase my details</button>`}</div>`)).join("") : card("My records", "<p>No records yet.</p>")); };
  const stuData = () => card("Take your data with you", `<p>Everything held about you, your consent record, and who has checked your records.</p><button class="btn" data-a="mydata">Get my data</button>`);

  /* Verifier */
  const empVerify = () => card("Verify a record", `<label for="vH">Record fingerprint</label><input id="vH"><div style="display:flex;gap:8px;margin-top:12px"><button class="btn" data-a="verify">Check</button><button class="btn o" data-a="scan">Scan a code</button></div><div id="vOut" style="margin-top:12px"></div>`);

  /* Regulator and owner */
  const audOver = () => { const a = LD.ov || {}, fl = a.fl || [], al = (a.al || []).filter(x => x.open); return `<div class="kpis">${kpi("Ledger blocks", a.led ? a.led.n : "–")}${kpi("Held for review", fl.length)}${kpi("Open alerts", al.length)}${kpi("Institutions", (a.ins || []).length)}</div>` + card("Ledger", a.led ? `<p>${a.led.ok ? tg("Chain unbroken", "ok") : tg("Broken at block #" + a.led.at, "bad")} ${a.led.anchored === null ? tg("Not anchored yet", "neutral") : a.led.anchored ? tg("Matches the blockchain", "ok") : tg("Does not match the blockchain", "bad")}</p>` : "") + card("Alerts", al.length ? lT(["When", "Institution", "What", ""], al.map(x => `<tr><td>${when(x.ts)}</td><td>${esc((a.ins.find(i => i.id === x.inst) || {}).name || x.inst)}</td><td>${esc(x.kind)}<br><span class="hint">${esc(x.detail)}</span></td><td><button class="btn sm o" data-a="alertclose" data-i="${x.id}">Close</button></td></tr>`)) : "<p>No open alerts.</p>") + card("Held for review", fl.length ? lT(["Record", "Institution", "Score", "Why", ""], fl.map(r => `<tr><td>${mono(r.hash)}</td><td>${esc(r.issuer || "")}</td><td>${r.risk}</td><td>${(r.why || []).map(esc).join("; ")}</td><td><button class="btn sm" data-a="release" data-h="${r.hash}">Release</button></td></tr>`)) : "<p>Nothing held.</p>"); };
  const audEvents = () => card("Event log", lT(["When", "Type", "By", "Score", "Fingerprint", "Transaction"], (LD.ev || []).map(b => `<tr><td>${when(b.ts)}</td><td>${tg(esc(b.type), b.type === "DENIED" ? "bad" : b.type === "HOLD" ? "warn" : "neutral")}</td><td class="hint">${esc(b.actor)}</td><td>${b.risk || ""}</td><td>${b.pl.length === 64 ? mono(b.pl) : esc(b.pl)}</td><td>${b.ref ? mono(b.ref, 10) : ""}</td></tr>`)));
  const audInsts = () => card("Institutions", lT(["Name", "Status", "Wallet", "Issued", "Held", "Revoked", ""], (LD.ins || []).map(i => `<tr><td>${esc(i.name)}</td><td>${tg(esc(i.status), i.status === "approved" ? "ok" : "warn")}</td><td>${mono(i.wallet, 10)}</td><td>${i.issued}</td><td>${i.held}</td><td>${i.revoked}</td><td>${me.role === "owner" ? (i.status !== "approved" ? `<button class="btn sm" data-a="appr" data-i="${i.id}">Approve</button>` : `<button class="btn sm o" data-a="susp" data-i="${i.id}">Suspend</button>`) : ""}</td></tr>`)) + `<p class="hint" style="margin-top:10px">Approving writes the institution's role to the smart contract.</p>`);
  const audModel = () => { const m = LD.md; if (!m) return card("AI model", "<p>Loading…</p>"); const t = m.test; return `<div class="kpis">${kpi("Precision", t.precision)}${kpi("Recall", t.recall)}${kpi("AUC", t.auc)}${kpi("False alarms", (t.falsePositiveRate * 100).toFixed(1) + "%")}</div>` + card("How it works", `<p>An isolation forest scores every record as it is issued. Above ${Math.round(m.threshold * 100)} out of 100 it is held on the chain until a regulator releases it.</p><p>${m.features.map(f => `<span class="chip">${esc(f)}</span>`).join("")}</p><p class="hint">Trained ${when(m.trainedAt)} on ${m.samples.synthetic} reference cases and ${m.samples.real} real records. Tested on ${t.normal} normal and ${t.anomalies} unusual cases it had not seen.</p><button class="btn sm" data-a="retrain">Retrain now</button>`) + card("How well it catches each kind", lT(["Kind", "Caught"], Object.entries(t.recallByType).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${Math.round(v * 100)}%</td></tr>`))) + card("Try it", `<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end"><div><label for="mH">Hour (0 to 23)</label><input id="mH" type="number" min="0" max="23" value="3" style="width:100px"></div><label class="chip"><input id="mD" type="checkbox"> Duplicate record</label><button class="btn sm" data-a="mscore">Score it</button></div><div id="mRes" style="margin-top:12px"></div>`); };
  const audChain = () => { const c = LD.ch; if (!c) return card("Blockchain", "<p>Loading…</p>"); const L = c.ledger; return card("Smart contract", row("Network", esc(c.mode) + " · chain " + c.chainId) + row("Contract", `<span class="mono">${esc(c.contract)}</span>`) + row("Latest block", c.block) + row("Anchors", c.anchors) + `<p class="hint" style="margin-top:10px">The contract holds the role rules and each record's fingerprint, storage address and status. No personal details.</p>`) + card("Audit log proof", `<p>${L.ok ? tg("Chain unbroken (" + L.n + " blocks)", "ok") : tg("Broken at block #" + L.at, "bad")} ${L.anchored === null ? tg("Not anchored yet", "neutral") : L.anchored ? tg("Matches every anchor", "ok") : tg("Does not match an anchor", "bad")}</p><p class="hint">The log's latest hash is written to the blockchain. If anyone rewrites the log later, it no longer matches.</p>${me.role === "owner" ? `<button class="btn sm" data-a="anchor">Anchor now</button>` : ""}`) + card("Anchors", c.anchorList.length ? lT(["When", "Blocks covered", "Hash"], c.anchorList.slice().reverse().map(a => `<tr><td>${when(a.at)}</td><td>${a.blocks}</td><td>${mono(a.head, 16)}</td></tr>`)) : "<p>None yet.</p>"); };
  const audStorage = () => { const s = LD.st || { nodes: [], checks: [] }; return card("Storage nodes", s.nodes.map(n => `<div class="row"><span><b>${esc(n.id)}</b> ${tg(n.kind === "kubo" ? "IPFS" : "local", "neutral")}<br><span class="hint">${n.copies} copies${n.maintenance ? " · in maintenance" : ""}${!n.up && !n.maintenance ? " · unreachable" : ""}</span></span><button class="btn sm ${n.up ? "" : "o"}" data-a="node" data-n="${esc(n.id)}" data-u="${n.maintenance ? 1 : 0}">${n.maintenance ? "Turn on" : "Take offline"}</button></div>`).join("")) + card("Check the proof", `<button class="btn sm" data-a="scan">Run full check</button><div id="sRes" style="margin-top:12px">${LD.sr || ""}</div>`) + card("Privacy checks", s.checks.map(c => `<div class="row"><span>${esc(c.name)}</span>${tg(c.pass ? "Pass" : "Fail", c.pass ? "ok" : "bad")}</div>`).join("")); };
  const audPerf = () => { const b = LD.bn, n = v => v == null ? "–" : v; return card("Run the test", `<p>Measures this system as it runs: storage, chain, checks and the audit log.</p><button class="btn" data-a="bench">${b ? "Run again" : "Run the test"}</button>`) + (b ? card("Alma next to a paper registry", lT(["", "Alma", "Paper registry"], [["Check a record", `${n(b.verifyEndToEndMs)} ms`, `${b.legacy.days} days`], ["Chain reads a second", n(b.lookupsPerSec), `${b.legacy.perHour} an hour per officer`], ["Cost to issue", `$${b.issueCostUsd}`, `$${b.legacy.feeUsd} per check`], ["Store and read a record", `${n(b.ipfsPinMs)} / ${n(b.ipfsFetchMs)} ms`, "–"], ["Issue transaction", `${n(b.txConfirmMs)} ms · ${b.issueGas} gas`, "–"]].map(r => `<tr><td>${r[0]}</td><td><b>${r[1]}</b></td><td>${r[2]}</td></tr>`)) + `<p class="hint" style="margin-top:10px">${when(b.at)}. Chain: ${b.mode === "local" ? "local test chain, so block time is near zero. Public networks add 2 to 15 seconds to an issue." : "external network"}. Cost assumes ${b.assumptions.gasPriceGwei} gwei and $${b.assumptions.nativeUsd} per coin. The paper figures are typical assumptions.</p>`) + card("Checking the audit log as it grows", Ch.bars(b.ledgerScale.map(s => ({ l: s.blocks + " blocks", v: Math.max(1, Math.round(s.ms)), c: "#1f3a8a" }))) + `<p class="hint">Milliseconds. A single record check does not slow down as the ledger grows.</p>`) : ""); };
  const lo = {
    ov: async () => { const [led, fl, ins, al] = await Promise.all([Api.get("/audit/ledger"), Api.get("/audit/flagged"), Api.get("/institutions"), Api.get("/audit/alerts")]); LD.ov = { led, fl, ins, al }; },
    ev: async () => { LD.ev = await Api.get("/audit/events?limit=100"); }, ins: async () => { LD.ins = await Api.get("/institutions"); }, md: async () => { LD.md = await Api.get("/audit/model"); },
    ch: async () => { LD.ch = await Api.get("/audit/chain"); }, st: async () => { LD.st = await Api.get("/audit/storage"); }, bn: async () => { LD.bn = await Api.get("/audit/benchmark"); }
  };
  const A = { audit: ["Overview", "Ledger health, alerts and records held for review.", audOver, lo.ov], events: ["Event log", "Every action, newest first.", audEvents, lo.ev], insts: ["Institutions", "Who can issue and how they are behaving.", audInsts, lo.ins], model: ["AI model", "Fraud detection: how it works and how well.", audModel, lo.md], chain: ["Blockchain", "Contract, anchors and the audit log proof.", audChain, lo.ch], storage: ["Storage and proof", "Encrypted copies on several nodes.", audStorage, lo.st], perf: ["Performance", "Speed, scale and cost, measured here.", audPerf, lo.bn] };
  const issued = async () => { LD.issued = await Api.get("/credentials/issued"); };
  const LV = {
    admin: { home: ["Overview", "Your institution at a glance.", admHome, issued], issue: ["Issue a record", "Key it in and attach the certificate if you have it.", admIssue], upload: ["Upload a spreadsheet", "Issue many records at once.", admUpload], connect: ["Connect your system", "Issue automatically from your student system.", admConnect, async () => { LD.keys = await Api.get("/apikeys"); }], records: ["Records", "Everything your institution has issued.", admRecords, issued] },
    student: { creds: ["My records", "Claim, share and erase.", stuRecords, async () => { LD.mine = await Api.get("/credentials/mine"); }], mydata: ["My data", "Take your data with you.", stuData] },
    employer: { verify: ["Verify a record", "Check a record against the blockchain.", empVerify] },
    regulator: A, owner: { insts: A.insts, audit: A.audit, events: A.events, model: A.model, chain: A.chain, storage: A.storage, perf: A.perf }
  };
  Live.LV = LV;
  Live.csvLoad = async inp => { try { const rows = parseCSV(await inp.files[0].text()); if (!rows.length) throw new Error("No rows found. Check the column names."); LD.csv = rows; render(); } catch (e) { toast(e.message); } };

  const _md = mountDashboard;
  mountDashboard = function () { if (!Live.on()) return _md(); Live.mount(); };
  Live.mount = async () => {
    if (!sessionStorage.getItem("alma_tok")) return go("/role?mode=signin");
    try { me = await Api.get("/me"); } catch (e) { return go("/role?mode=signin"); }
    d = Store.d; $("#mk").innerHTML = MARK; const M = document.querySelector(".mailfab"); if (M) M.hidden = true;
    VIEWS[me.role] = me.must2fa && LV[me.role].security ? { security: LV[me.role].security } : LV[me.role]; tab = ""; render(); await reload();
  };
  if (Live.on()) {
    render = function () {
      const R = ROLES[me.role]; document.documentElement.style.setProperty("--ac", R.c); $("#un").textContent = me.name; $("#ur").textContent = R.n + (me.institution ? " · " + me.institution.name : ""); $("#us").textContent = ""; $("#lw").hidden = true;
      const V = VIEWS[me.role]; if (!V[tab]) tab = Object.keys(V)[0];
      $("#nav").innerHTML = Object.keys(V).map(k => `<button class="nv" data-a="tab" data-t="${k}" ${tab === k ? 'aria-current="page"' : ""}>${V[k][0]}</button>`).join(""); $("#title").textContent = V[tab][0]; $("#sub").textContent = V[tab][1];
      $("#view").innerHTML = V[tab][2]();
    };
    ACT.tab = b => { tab = b.dataset.t; render(); reload(); try { scrollTo(0, 0); } catch (e) { /* ok */ } };
    ACT.out = () => { sessionStorage.removeItem("alma_tok"); go("/"); };
    ACT.issue = async () => {
      let file; try { const f = $("#iF").files[0]; if (f) { if (f.size > 500 * 1024) return toast("The file must be under 500 KB"); file = { name: f.name, mime: f.type || "application/octet-stream", b64: await fileB64(f) }; } } catch (e) { return toast(e.message); }
      const r = await run(() => Api.post("/credentials", { name: val("iN"), sno: val("iS"), email: val("iE"), dob: val("iD"), type: val("iY"), title: val("iT"), result: val("iR"), file }));
      if (r) modal(`<h3>Record issued</h3>${r.claimCode ? `<p>Give the student this code. It is shown once.</p><p class="serif" style="font-size:32px">${r.claimCode}</p>` : `<p>The claim code was emailed to the student.</p>`}<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><img src="${CONFIG.api}/public/qr/${r.hash}.svg" alt="QR code" width="120" height="120" style="background:#fff;border-radius:8px"><div><p class="hint" style="margin:0">Fingerprint</p><p class="mono" style="margin:0">${r.hash}</p></div></div><p class="hint">Anyone who scans the QR code can check the record. It shows no details.</p><button class="btn sm o noprint" onclick="window.print()">Print</button><p class="hint">Written to the blockchain in block ${r.block} · stored on IPFS as ${r.cid.slice(0, 18)}…</p><p class="hint">Fraud check score ${r.risk.score} (held above ${r.risk.threshold})</p>${r.held ? `<div class="res warn">Held for review: ${(r.risk.why || []).map(esc).join("; ")}</div>` : ""}`);
    };
    ACT.csvtemplate = () => modal(`<h3>CSV template</h3><textarea readonly rows="5" style="width:100%">${esc(TEMPLATE)}</textarea><button class="btn sm" data-a="copy" data-v="${esc(TEMPLATE)}">Copy</button>`);
    ACT.bulk = async b => {
      const rows = LD.csv || [], res = []; b.disabled = true;
      try { for (let i = 0; i < rows.length; i += 100) { toast(`Issuing ${Math.min(i + 100, rows.length)} of ${rows.length}…`); const r = await Api.post("/credentials/bulk", { records: rows.slice(i, i + 100) }); res.push(...r.results.map(x => ({ ...x, row: x.row + i }))); } } catch (e) { toast(e.message); }
      LD.csv = null; const okRows = res.filter(r => r.ok), bad = res.filter(r => !r.ok), csv = "row,email,fingerprint,claim_code\n" + okRows.map(r => `${r.row},${rows[r.row - 1].email},${r.hash},${r.claimCode || "emailed"}`).join("\n");
      await reload(); modal(`<h3>${okRows.length} issued, ${bad.length} failed</h3>${bad.length ? `<p class="hint">Failed rows</p>${bad.slice(0, 8).map(r => `<div class="row"><span>Row ${r.row}</span><span>${esc(r.error)}</span></div>`).join("")}` : ""}<p class="hint">${okRows.some(r => r.claimCode) ? "Claim codes (shown once). Send each student their code." : "Every student was emailed their code."}</p><textarea readonly rows="8" style="width:100%">${esc(csv)}</textarea><button class="btn sm" data-a="copy" data-v="${esc(csv)}">Copy</button>`);
    };
    ACT.keynew = async () => { try { const k = await Api.post("/apikeys", { name: val("kN") || "Student system" }); await reload(); modal(`<h3>Your key</h3><p>${esc(k.note)}</p><p class="mono">${esc(k.key)}</p><button class="btn sm" data-a="copy" data-v="${esc(k.key)}">Copy</button>`); } catch (e) { toast(e.message); } };
    ACT.keydel = b => confirm("Remove this key? Systems using it will stop working.") && run(() => Api.del("/apikeys/" + b.dataset.k), "Key removed");
    ACT.revoke = b => confirm("Revoke this record?") && run(() => Api.post(`/credentials/${b.dataset.h}/revoke`), "Revoked");
    ACT.claim = () => run(() => Api.post("/credentials/claim", { hash: val("cH").trim(), code: val("cC").trim() }), "Record claimed");
    ACT.shareask = b => modal(`<h3>Share details</h3><label for="sV">Verifier email</label><input id="sV" type="email"><div>${["name", "title", "result", "type", "sno", "dob"].concat(b.dataset.f === "1" ? ["file"] : []).map(k => `<label class="chip"><input type="checkbox" class="sf" value="${k}" ${["name", "title", "result"].includes(k) ? "checked" : ""}> ${k === "file" ? "certificate file" : k}</label>`).join("")}</div><button class="btn" data-a="share" data-h="${b.dataset.h}" style="margin-top:12px">Share</button>`);
    ACT.share = async b => { const ok = await run(() => Api.post(`/credentials/${b.dataset.h}/share`, { verifier: val("sV"), fields: [...document.querySelectorAll(".sf:checked")].map(x => x.value) }), "Shared"); if (ok) $("#modal").innerHTML = ""; };
    ACT.qr = b => modal(`<h3>Your record's QR code</h3><p style="text-align:center"><img src="${CONFIG.api}/public/qr/${b.dataset.h}.svg" alt="QR code" width="220" height="220" style="background:#fff;border-radius:10px"></p><p class="hint">Put it on your CV. Anyone who scans it can check the record is genuine. It shows none of your details.</p><p class="mono hint">${b.dataset.h}</p><button class="btn sm o noprint" onclick="window.print()">Print</button>`);
    ACT.erase = b => confirm("Erase the details? The proof stays, the details are gone for good.") && run(() => Api.del(`/credentials/${b.dataset.h}/data`), "Details erased");
    ACT.mydata = async () => { try { const j = JSON.stringify(await Api.get("/me/export"), null, 2); modal(`<h3>Your data</h3><textarea readonly rows="12" style="width:100%">${esc(j)}</textarea><button class="btn sm" data-a="copy" data-v="${esc(j)}">Copy</button>`); } catch (e) { toast(e.message); } };
    ACT.verify = async () => {
      const o = $("#vOut"); o.innerHTML = "Checking…";
      try {
        const h = val("vH").trim(), r = await Api.get("/verify/" + h), cls = r.genuine ? "ok" : r.status === "not found" ? "bad" : "warn", p = r.proof;
        o.innerHTML = `<div class="res ${cls}"><b>${r.genuine ? "Genuine" : esc(r.status)}</b>${r.issuer ? `<br>Issued by ${esc(r.issuer)} on ${when(r.issuedAt)}` : ""}${r.note ? "<br>" + esc(r.note) : ""}${r.storage ? `<br><span class="hint">Stored copy ${r.storage.intact ? "matches its fingerprint" : "failed the check"}${r.storage.repaired.length ? ", damaged copy repaired" : ""}</span>` : ""}</div>` + (p ? card("Proof", row("Contract", `<span class="mono">${esc(p.contract)}</span>`) + row("Issuer wallet", `<span class="mono">${esc(p.issuerWallet)}</span>`) + (p.tx ? row("Transaction", `<span class="mono">${esc(p.tx)}</span>`) + row("Block", p.block) : "") + (p.ipfs ? row("Stored on IPFS", `<a href="${p.ipfs}" target="_blank" rel="noopener">${esc((p.cid || "").slice(0, 20))}…</a>`) : "")) : "") + (r.details ? card("Shared with you", Object.entries(r.details).map(([k, v]) => row(esc(k), esc(v))).join("") + (r.fileAvailable ? `<p style="margin-top:10px"><button class="btn sm" data-a="getfile" data-h="${h}">Download the certificate</button></p>` : "")) : r.storage ? "<p class='hint'>The owner has not shared any details with you.</p>" : "");
      } catch (e) { o.innerHTML = `<div class="res bad">${esc(e.message)}</div>`; }
    };
    ACT.scan = () => Scan.open(h => { $("#vH").value = h; ACT.verify(); });
    ACT.getfile = async b => { try { const f = await Api.get(`/credentials/${b.dataset.h}/file`); dl(f.name, f.mime, f.b64); } catch (e) { toast(e.message); } };
    ACT.release = b => run(() => Api.post(`/credentials/${b.dataset.h}/release`), "Released");
    ACT.alertclose = b => run(() => Api.post(`/audit/alerts/${b.dataset.i}/close`), "Closed");
    ACT.appr = b => run(() => Api.post(`/institutions/${b.dataset.i}/approve`), "Approved and written to the contract");
    ACT.susp = b => run(() => Api.post(`/institutions/${b.dataset.i}/suspend`), "Suspended");
    ACT.retrain = () => run(() => Api.post("/audit/model/retrain"), "Model retrained");
    ACT.mscore = async () => { try { const r = await Api.post("/audit/model/score", { inst: "TEST", hour: +val("mH"), dup: $("#mD").checked }); $("#mRes").innerHTML = `<div class="res ${r.flagged ? "warn" : "ok"}"><b>Score ${r.score} of 100</b> (held above ${r.threshold})<br>${r.flagged ? r.why.map(esc).join("<br>") : "Looks normal."}</div>`; } catch (e) { toast(e.message); } };
    ACT.anchor = () => run(() => Api.post("/audit/chain/anchor"), "Anchored on the blockchain");
    ACT.node = b => run(() => Api.post(`/audit/nodes/${b.dataset.n}`, { up: b.dataset.u === "1" }));
    ACT.scan = async () => { try { const s = await Api.post("/audit/storage/scan"); LD.sr = `<div class="res ${s.bad || !s.ledger.ok ? "warn" : "ok"}">Ledger: ${s.ledger.ok ? s.ledger.n + " blocks, chain unbroken" : "broken at block #" + s.ledger.at}<br>Stored copies: ${s.checked} checked, ${s.bad} damaged or missing${s.healed ? ", " + s.healed + " repaired" : ""}</div>`; LD.st = await Api.get("/audit/storage"); render(); } catch (e) { toast(e.message); } };
    ACT.bench = async b => { b.disabled = true; b.textContent = "Running…"; try { LD.bn = await Api.post("/audit/benchmark"); } catch (e) { toast(e.message); } render(); };
  }
}
