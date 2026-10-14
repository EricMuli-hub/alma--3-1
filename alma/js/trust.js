/* Alma trust layer: access rules, learned baseline, encrypted node storage, ledger checks, benchmark.
   Swap Net for a real IPFS pin and Policy for the contract in contracts/AlmaAccess.sol when the backend is ready. */
CONFIG.nodes=[{id:"Nairobi",rtt:35},{id:"Mombasa",rtt:60},{id:"Kisumu",rtt:70}];
CONFIG.legacy={days:5,fee:25,perHour:4};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),hexB=h=>new Uint8Array(h.match(/../g).map(x=>parseInt(x,16))),b64=u=>btoa(String.fromCharCode(...u)),unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));

/* Access rules */
const POLICY={issue:["admin"],revoke:["admin"],copies:["admin"],claim:["student"],share:["student"],erase:["student"],check:["employer"],audit:["regulator","owner"],approve:["owner"],prices:["owner"]};
const ACTION_N={issue:"Issue records",revoke:"Revoke own records",copies:"Approve hardcopies",claim:"Claim a record",share:"Share details",erase:"Erase private file",check:"Check a record",audit:"Open the audit",approve:"Approve institutions",prices:"Set prices"};
const Policy={hash:"",can(role,a){return(POLICY[a]||[]).includes(role)},
 ok(u,a){let why=null;if(!this.can(u.role,a))why="your role cannot do that";else if(u.role==="admin"&&a==="issue"&&(u.approved===false||u.status==="suspended"))why="your institution is not approved to issue";
  if(!why)return true;Store.block("DENIED",a,u.name,{inst:u.accred||"",risk:70,why:["Blocked by role policy"]});toast("Blocked: "+why);render();return false}};
sha(JSON.stringify(POLICY)).then(h=>Policy.hash=h);
Object.entries({issue:"issue",bulk:"issue",revoke:"revoke",rq:"copies",claim:"claim",erase:"erase",appr:"approve",rej:"approve",susp:"approve",prices:"prices",csv:"audit",ask:"audit"}).forEach(([n,a])=>{const f=ACT[n];if(f)ACT[n]=function(){return Policy.ok(me,a)?f.apply(this,arguments):undefined}});

/* Ledger check */
Store.verifyChain=async function(bl){bl=bl||this.d.blocks;let p="0".repeat(64);for(let i=0;i<bl.length;i++){const b=bl[i];if(b.hash!==await sha(p+b.type+(b.pl??"")+b.ts))return{ok:false,at:i,n:bl.length};p=b.hash}return{ok:true,n:bl.length}};

/* Node storage: details are encrypted, then copied to several nodes under an address made from the copy itself */
const Net={
 db(){return Store.d.ipfs=Store.d.ipfs||{}},
 up(){const s=Store.d.nodes=Store.d.nodes||{};return CONFIG.nodes.filter(n=>s[n.id]!==false)},
 async key(h,u){return crypto.subtle.importKey("raw",hexB(await sha(h+"|key")),"AES-GCM",false,u)},
 async pin(c){const iv=crypto.getRandomValues(new Uint8Array(12)),m=JSON.stringify({name:c.name,sno:c.sno,dob:c.dob,email:c.email,type:c.type,title:c.title,result:c.result}),
  ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},await this.key(c.hash,["encrypt"]),new TextEncoder().encode(m))),blob=b64(iv)+"."+b64(ct);
  c.cid=cidOf(await sha(blob));this.db()[c.cid]=Object.fromEntries(this.up().map(n=>[n.id,blob]))},
 unpin(c){delete this.db()[c.cid];Store.save()},
 async sync(){for(const c of Store.d.creds)if(!c.erased&&!Object.keys(this.db()[c.cid]||{}).length)await this.pin(c);Store.save()},
 async get(c){const t=performance.now(),row=this.db()[c.cid]||{},tried=[],bad=[];let good=null,node="";
  for(const n of this.up().slice().sort((a,b)=>a.rtt-b.rtt)){tried.push(n.id);await sleep(n.rtt);const b=row[n.id];if(!b)continue;if(cidOf(await sha(b))===c.cid){good=b;node=n.id;break}bad.push(n.id)}
  if(!good)return{ok:false,tried,bad,ms:performance.now()-t};
  bad.forEach(id=>row[id]=good);if(bad.length)Store.save();
  const [iv,ct]=good.split(".").map(unb64);let data=null;try{data=JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv},await this.key(c.hash,["decrypt"]),ct)))}catch(e){}
  return{ok:true,node,tried,bad,data,ms:performance.now()-t}},
 async scan(){let n=0,bad=0;for(const c of Store.d.creds){if(c.erased)continue;const row=this.db()[c.cid]||{},ids=Object.keys(row);let good=null;
  for(const i of ids){n++;if(cidOf(await sha(row[i]))===c.cid)good=row[i];else bad++}
  if(good)ids.forEach(i=>row[i]=good)}Store.save();return{n,bad}},
 audit(){const d=Store.d,live=d.creds.filter(c=>!c.erased),er=d.creds.filter(c=>c.erased),db=this.db(),txt=JSON.stringify(d.blocks);
  return[["Every record has at least 2 stored copies",live.every(c=>Object.keys(db[c.cid]||{}).length>=2),live.length+" records"],
   ["Erased records have no stored copy",er.every(c=>!db[c.cid]),er.length+" erased"],
   ["The ledger holds no numbers, birth dates or emails",!d.creds.some(c=>[c.sno,c.dob,c.email].some(x=>x&&txt.includes(x))),d.blocks.length+" blocks"],
   ["Every check is on the ledger",d.blocks.filter(b=>b.type==="CHECK").length>=d.checks.length,d.checks.length+" checks"],
   ["Storage nodes are inside the country",true,CONFIG.nodes.map(n=>n.id).join(", ")]]}};
Store.ready=Store.ready.then(()=>Net.sync());
const v0=ACT.verify;ACT.verify=async function(){if(!Policy.ok(me,"check"))return;await v0.apply(this,arguments);const c=d.creds.find(x=>x.hash===$("#h").value.trim()),o=$("#out");if(!c||c.erased||!o)return;
 const r=await Net.get(c);o.insertAdjacentHTML("beforeend",`<p class="hint">${r.ok?"Stored copy read from "+r.node+" in "+Math.round(r.ms)+" ms and it matches its fingerprint."+(r.bad.length?" A damaged copy on "+r.bad.join(", ")+" was skipped and repaired.":""):"No stored copy passed the check."}</p>`)};

/* Learned baseline: what normal looks like for each institution, from the ledger */
const Model={fit(){const d=Store.d,out={};d.users.filter(u=>u.role==="admin").forEach(u=>{const E=d.blocks.filter(b=>b.type==="ISSUE"&&b.inst===u.accred),h=Array(24).fill(0),dc={};
  E.forEach(b=>{h[new Date(b.ts).getHours()]++;const k=Math.floor(b.ts/DAY);dc[k]=(dc[k]||0)+1});const v=Object.values(dc),m=v.length?v.reduce((a,x)=>a+x,0)/v.length:0,sd=v.length?Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/v.length):0;
  out[u.accred]={name:u.institution,n:E.length,h,m,sd,ok:E.length>=6}});return out},
 extra(inst,hr,k=0){const d=Store.d,f=this.fit()[inst],s=[],w=[];
  if(f&&f.ok){if(!f.h[hr]&&!f.h[(hr+23)%24]&&!f.h[(hr+1)%24]){s.push(25);w.push("An hour this institution has never issued in")}
   const day=d.blocks.filter(b=>b.type==="ISSUE"&&b.inst===inst&&Date.now()-b.ts<DAY).length+k;if(day>f.m+3*Math.max(f.sd,1)){s.push(25);w.push("Far above its usual daily volume")}}
  if(d.blocks.filter(b=>b.inst===inst&&["DENIED","REVOKE_CRED"].includes(b.type)&&Date.now()-b.ts<DAY).length>=3){s.push(25);w.push("Repeated blocked or revoke actions")}
  return{s:s.reduce((a,x)=>a+x,0),w}}};
const r0=Store.risk;Store.risk=function(){const r=r0.apply(this,arguments),m=Model.extra(arguments[0],new Date().getHours());r.s=Math.min(99,r.s+m.s);r.w=r.w.concat(m.w);return r};

/* Views */
const tbl=(head,rows)=>`<div class="sc"><table><thead><tr>${head.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
const roles5=["admin","student","employer","regulator","owner"];let IRES="";
const rulesView=()=>{const ins=d.blocks.filter(b=>b.type==="DENIED").slice(-8).reverse();
 return card("Who can do what",tbl(["Action",...roles5.map(r=>ROLES[r].n)],Object.keys(ACTION_N).map(a=>`<tr><td>${ACTION_N[a]}</td>${roles5.map(r=>`<td>${Policy.can(r,a)?tg("Yes","ok"):"–"}</td>`).join("")}</tr>`))+`<p class="hint" style="margin-top:10px">Rules fingerprint</p><p class="mono">${Policy.hash||"…"}</p><p class="hint">Change one rule and this fingerprint changes. The same rules are written as a contract in contracts/AlmaAccess.sol.</p>`)
 +`<div class="grid2">`+card("Try an action",`<label for="rr">Role</label><select id="rr">${roles5.map(r=>`<option value="${r}">${ROLES[r].n}</option>`).join("")}</select><label for="ra">Action</label><select id="ra">${Object.keys(ACTION_N).map(a=>`<option value="${a}">${ACTION_N[a]}</option>`).join("")}</select><button class="btn" data-a="rtry" style="margin-top:12px">Try it</button><div id="rres" style="margin-top:12px"></div>`)
 +card("Recent blocked actions",ins.length?ins.map(b=>`<div class="row"><span>${esc(BL.DENIED)} · ${esc(b.actor)}</span><span class="hint">${new Date(b.ts).toLocaleString()}</span></div>`).join(""):"<p>Nothing blocked yet.</p>")+`</div>`};
ACT.rtry=async()=>{const r=$("#rr").value,a=$("#ra").value,ok=Policy.can(r,a);if(!ok)await Store.block("DENIED",a,ROLES[r].n+" (test)",{risk:70,why:["Blocked by role policy"]});$("#rres").innerHTML=`<div class="res ${ok?"ok":"bad"}">${ok?"Allowed":"Blocked and logged"}: ${ROLES[r].n} · ${ACTION_N[a]}</div>`};

const modelView=()=>{const F=Model.fit(),B=d.blocks.filter(b=>b.ts>=Date.now()-14*DAY),ids=Object.keys(F),hr=h=>{const u=h.map((x,i)=>x?i:-1).filter(i=>i>=0);return u.length?u[0]+":00 to "+(u[u.length-1]+1)+":00":"none yet"};
 return`<div class="kpis">${kpi("Events learned",d.blocks.length)}${kpi("Institutions modelled",ids.filter(i=>F[i].ok).length+" of "+ids.length)}${kpi("Flagged in 14 days",B.filter(b=>b.risk>=50).length)}${kpi("Held records",d.creds.filter(c=>c.flag&&!c.revoked).length)}</div>`
 +card("What normal looks like",tbl(["Institution","Issued","Usual hours","A day (average)","Model"],ids.map(i=>`<tr><td>${esc(F[i].name)}</td><td>${F[i].n}</td><td>${hr(F[i].h)}</td><td>${F[i].m.toFixed(1)} ± ${F[i].sd.toFixed(1)}</td><td>${F[i].ok?tg("Trained","ok"):tg("Needs more history","neutral")}</td></tr>`))+`<p class="hint" style="margin-top:10px">The model learns from the ledger, so it gets sharper as records are issued. It adds to the usual rules at issuing time and holds anything that reaches 50.</p>`)
 +card("Test the model",`<div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));align-items:end"><div><label for="mi">Institution</label><select id="mi">${ids.map(i=>`<option value="${i}">${esc(F[i].name)}</option>`).join("")}</select></div><div><label for="mh">Hour of day (0 to 23)</label><input id="mh" type="number" min="0" max="23" value="3"></div><div><label for="mk2">Issued in the last day</label><input id="mk2" type="number" min="0" value="40"></div><button class="btn" data-a="mtest">Score it</button></div><div id="mres" style="margin-top:12px"></div>`)};
ACT.mtest=()=>{const m=Model.extra($("#mi").value,+$("#mh").value||0,+$("#mk2").value||0);$("#mres").innerHTML=m.s?`<div class="res ${m.s>=50?"bad":"warn"}"><b>+${m.s} risk from the model</b><br>${m.w.map(esc).join("<br>")}</div>`:'<div class="res ok">Looks normal for this institution.</div>'};

const nodeCopies=id=>Object.values(Net.db()).filter(r=>r[id]).length;
const storageView=()=>{const live=d.creds.filter(c=>!c.erased),up=Net.up().length;
 return`<div class="kpis">${kpi("Nodes up",up+" of "+CONFIG.nodes.length)}${kpi("Records stored",live.length)}${kpi("Ledger blocks",d.blocks.length)}</div>`
 +`<div class="grid2">`+card("Storage nodes",CONFIG.nodes.map(n=>{const on=d.nodes[n.id]!==false;return`<div class="row"><span><b>${n.id}</b><br><span class="hint">${nodeCopies(n.id)} copies · ${n.rtt} ms</span></span><button class="btn sm ${on?"":"o"}" data-a="node" data-n="${n.id}">${on?"Up · turn off":"Down · turn on"}</button></div>`}).join("")+`<p class="hint" style="margin-top:10px">Turn one off and open a record. It still loads from another node.</p>`)
 +card("Check the proof",`<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-a="integ">Run full check</button><button class="btn sm o" data-a="tcopy">Damage a stored copy</button><button class="btn sm o" data-a="tchain">Change a ledger entry</button></div><div id="ires" style="margin-top:12px">${IRES}</div>`)+`</div>`
 +card("Privacy checks",Net.audit().map(a=>`<div class="row"><span>${a[0]}<br><span class="hint">${esc(a[2])}</span></span>${tg(a[1]?"Pass":"Fail",a[1]?"ok":"bad")}</div>`).join(""))};
const done=(h,k)=>{IRES=`<div class="res ${k}">${h}</div>`;render()};
ACT.node=b=>{const id=b.dataset.n,s=d.nodes=d.nodes||{};s[id]=s[id]===false;if(s[id])Object.values(Net.db()).forEach(r=>{if(!r[id]){const x=Object.values(r)[0];if(x)r[id]=x}});Store.save();render()};
ACT.integ=async b=>{b.disabled=true;b.textContent="Checking…";const t=performance.now(),ch=await Store.verifyChain(),sc=await Net.scan(),ms=Math.round(performance.now()-t);
 done(`<b>${ch.ok&&!sc.bad?"All good":"Problems found"}</b><br>Ledger: ${ch.ok?ch.n+" blocks, chain unbroken":"broken at block #"+ch.at}.<br>Stored copies: ${sc.n} checked, ${sc.bad} damaged${sc.bad?" and repaired":""}.<br><span class="hint">${ms} ms</span>`,ch.ok&&!sc.bad?"ok":"warn")};
ACT.tcopy=async()=>{const up=Net.up().sort((a,b)=>a.rtt-b.rtt),cs=d.creds.filter(c=>!c.erased&&Net.db()[c.cid]);if(up.length<2||!cs.length)return done("Turn at least two nodes on first.","warn");
 const c=cs[Math.floor(Math.random()*cs.length)],row=Net.db()[c.cid],id=up[0].id;row[id]=(row[id][0]==="x"?"y":"x")+row[id].slice(1);const r=await Net.get(c);
 done(`The copy of "${esc(c.title)}" on ${id} was damaged.<br>${r.ok?`The check spotted it, read the record from ${r.node} instead and repaired ${id}. The record still opens.`:"No good copy was left."}`,r.ok?"ok":"bad")};
ACT.tchain=async()=>{const i=Math.floor(d.blocks.length/2),b=d.blocks[i],o=b.ts;b.ts=o+1;const r=await Store.verifyChain();b.ts=o;
 done(`Block #${i} was changed by one millisecond.<br>The check failed at block #${r.at}, so the change is caught. The entry has been put back.`,r.ok?"bad":"ok")};

const perfView=()=>{const x=d.bench,L=CONFIG.legacy,p=PLANS.employer[1],per=p.price/p.quota;
 return card("Run the test",`<p>Checks real lookups, reads from the nodes, a node failure and a growing ledger.</p><button class="btn" data-a="bench">${x?"Run again":"Run the test"}</button>`)
 +(x?card("Alma next to a paper registry",tbl(["","Alma","Paper registry"],[
  ["Time for one check",`${Math.round(x.med)} ms`,`${L.days} days`],["Cost per check",`$${per.toFixed(2)}`,`$${L.fee}`],["Checks at once",`${Math.round(x.tp)} a second`,`${L.perHour} an hour per officer`],
  ["Main server fails",x.out?"Still served by "+x.node:"Unavailable","Unavailable until it is fixed"]].map(r=>`<tr><td>${r[0]}</td><td><b>${r[1]}</b></td><td>${r[2]}</td></tr>`))
  +`<p class="hint" style="margin-top:10px">Measured ${new Date(x.at).toLocaleTimeString()}. Network delay is simulated at 35 to 70 ms per node. Alma cost is the Professional plan price over its checks. Paper registry figures are typical, set in js/trust.js.</p>`)
  +card("Checking the whole ledger as it grows",Ch.bars(x.sc.map(s=>({l:s.n+" blocks",v:Math.max(1,Math.round(s.ms)),c:"#1f3a8a"})))+`<p class="hint">Milliseconds. One record check does not slow down as the ledger grows.</p>`):"")};
ACT.bench=async b=>{b.disabled=true;b.textContent="Running…";const cs=d.creds.filter(c=>!c.erased&&Net.db()[c.cid]),one=async c=>{const t=performance.now(),r=await Net.get(c);return{ok:r.ok,node:r.node,ms:performance.now()-t}};
 const seq=[];for(let i=0;i<15;i++)seq.push((await one(cs[i%cs.length])).ms);seq.sort((a,c)=>a-c);
 const t0=performance.now();await Promise.all(Array.from({length:100},(_,i)=>one(cs[i%cs.length])));const tp=100/((performance.now()-t0)/1000);
 const st=d.nodes=d.nodes||{},keep={...st};CONFIG.nodes.slice(0,-1).forEach(n=>st[n.id]=false);const o=await one(cs[0]);Object.keys(st).forEach(k=>delete st[k]);Object.assign(st,keep);
 const sc=[];for(const n of[200,1000,4000]){const bl=[];let p="0".repeat(64);for(let i=0;i<n;i++){p=await sha(p+"T"+i+0);bl.push({type:"T",pl:String(i),ts:0,hash:p})}const t=performance.now();await Store.verifyChain(bl);sc.push({n,ms:performance.now()-t})}
 d.bench={at:Date.now(),med:seq[7],tp,out:o.ok,node:o.node,sc};Store.save();render()};

const myData=()=>{const o=d.creds.filter(c=>c.owner===me.email);
 return card("Where your records live",o.length?tbl(["Record","Address","Copies"],o.map(c=>`<tr><td>${esc(c.title)}</td><td class="mono">${c.erased?"Erased":esc(c.cid.slice(0,16))+"…"}</td><td>${c.erased?0:Object.keys(Net.db()[c.cid]||{}).length}</td></tr>`))+`<p class="hint" style="margin-top:10px">Your details are encrypted and kept on ${CONFIG.nodes.length} nodes. Only the fingerprint is public.</p>`:"<p>No records yet.</p>")
 +card("Take your data with you",`<p>Everything held about you, as plain text.</p><button class="btn" data-a="mydata">Get my data</button>`)};
ACT.mydata=async()=>{const rs=[];for(const c of d.creds.filter(c=>c.owner===me.email&&!c.erased)){const r=await Net.get(c);rs.push({fingerprint:c.hash,address:c.cid,issuer:instName(c.inst),details:r.data,revoked:c.revoked})}
 const j=JSON.stringify({account:{name:me.name,email:me.email},records:rs,shared_with:d.grants[me.email]||[]},null,2);modal(`<h3>Your data</h3><textarea readonly rows="12" style="width:100%">${esc(j)}</textarea><button class="btn sm" data-a="copy" data-v="${esc(j)}">Copy</button>`)};

const addViews=(role,add)=>{const V=VIEWS[role],k={};["help","settings","support"].forEach(n=>{if(V[n]){k[n]=V[n];delete V[n]}});Object.assign(V,add,k)};
const T4={rules:["Access rules","Who can do what. Every blocked try is logged.",rulesView],model:["AI model","Learns what normal looks like for each institution.",modelView],storage:["Storage and proof","Details are encrypted on several nodes. The ledger holds only fingerprints.",storageView],perf:["Performance","Speed, scale and cost next to a paper registry.",perfView]};
addViews("regulator",T4);addViews("owner",T4);addViews("student",{mydata:["My data","Where your records live and how to take them with you.",myData]});
