/* Alma data layer. In production, replace the bodies of Store methods with calls to CONFIG.api. UI files never touch storage directly. */
const DAY=864e5;
const TYPES=["University","College","Technical or vocational institute","Senior secondary school","Junior secondary school","Primary school","Other recognised institution"];
const CT=["Degree","Diploma","Certificate","Transcript","Results slip","Secondary school leaving certificate","Primary school certificate","Award or prize","Professional licence","Other"];
const VERIFIERS=["Employer","Admissions office or school (continuing studies)","Scholarship or funding body","Professional or licensing body","Government or immigration authority","Bank, landlord or other organisation","Individual or other"];
const PURPOSES=["Hiring","Admission or continuing studies","Scholarship or funding","Professional licensing","Visa or immigration","Loan or tenancy","Other"];
const PLANS={
admin:[{id:"i1",n:"Starter",price:120,per:"year",quota:200,days:365,feat:["Up to 200 records a year","Hardcopy approvals","Bulk issuing"]},{id:"i2",n:"Standard",price:480,per:"year",quota:2000,days:365,feat:["Up to 2,000 records a year","Hardcopy approvals","Bulk issuing","Priority support"]},{id:"i3",n:"Enterprise",price:1800,per:"year",quota:1e9,days:365,feat:["Unlimited records","Hardcopy approvals","Bulk issuing","Dedicated support"]}],
student:[{id:"s1",n:"Hardcopy Plus",price:5,per:"month",quota:1e9,days:30,feat:["Request hardcopies from your institution","Download approved copies","Unlimited downloads"]}],
employer:[{id:"v1",n:"Basic",price:15,per:"month",quota:20,days:30,feat:["20 verifications a month","Printable report"]},{id:"v2",n:"Professional",price:60,per:"month",quota:200,days:30,feat:["200 verifications a month","Printable report","History export"]},{id:"v3",n:"Organisation",price:200,per:"month",quota:1e9,days:30,feat:["Unlimited verifications","Printable report","History export"]}],
regulator:[{id:"r1",n:"Audit Suite",price:300,per:"month",quota:1e9,days:30,feat:["Full audit dashboards","Event log with CSV export","Institution oversight"]}]};
const ROLES={
admin:{n:"Institution",c:"#1f3a8a",does:"Register your school, college or university and issue records.",allow:["Issue records","Revoke your own records","Approve hardcopy requests"],deny:["Check other institutions' records","See the audit"],note:"Your registration number is your sign-in code. New institutions are approved before they can issue.",
 f:[["institution","Institution name"],["instType","Institution type","select",TYPES],["accred","Institution registration number","text","Issued by your education authority. Used to sign in."],["country","Country or region"],["staffId","Your staff ID"]],signin:[["accred","Institution registration number"]],mail:"Use an official institution email."},
student:{n:"Student or graduate",c:"#0d7a6b",does:"Claim your records, choose who sees them and ask for hardcopies.",allow:["Claim records with a code","Share and withdraw access","Request hardcopies","Erase your private file"],deny:["Issue records","Change results"],note:"Your institution must already be on Alma. Use the same details it has for you.",
 f:[["institution","Your institution","inst","Start typing. It must already be on Alma."],["sno","Student or candidate number"],["dob","Date of birth","date"]],signin:[],mail:"Use the email your institution has for you."},
employer:{n:"Verifier",c:"#9a5b13",does:"Check that any record is real and print a report.",allow:["Check any record","Print reports","See details owners share"],deny:["Issue records","See unshared details"],note:"Open to employers, schools, funders, licensing bodies, authorities and individuals.",
 f:[["company","Name shown to owners (organisation or yourself)"],["regNo","Registration or ID number"],["industry","Who you are","select",VERIFIERS]],signin:[],mail:"Use your organisation or personal email."},
regulator:{n:"Regulator",c:"#6b2f80",does:"Watch every institution with live audit charts.",allow:["Full audit charts","Event log and export","Institution list"],deny:["Issue records","Edit records"],note:"Your agency gets an access code from Alma.",
 f:[["agency","Agency or authority"],["authId","Authority ID"],["jurisdiction","Jurisdiction (country or region)"],["accessCode","Agency access code","text","Demo code: REG-2026"]],signin:[],mail:"Use your official agency email."},
owner:{n:"Platform owner",c:"#222222",does:"Run Alma.",allow:["Manage accounts","Set prices","Approve institutions"],deny:[],f:[],signin:[],mail:""}};
const BL={ISSUE:"Record issued",CHECK:"Verification",DENIED:"Blocked action",REVOKE_CRED:"Record revoked",CLAIM:"Owner confirmed",SIGNUP:"Account created",VERIFY:"Email verified",GRANT:"Access granted",REVOKE:"Access withdrawn",ERASE:"File erased",COPY_REQ:"Hardcopy requested",COPY_OK:"Hardcopy approved",COPY_NO:"Hardcopy declined",SUB:"Subscription started",PW_RESET:"Password reset",WALLET_LOGIN:"Wallet sign-in",WALLET_LINK:"Wallet linked",REGISTER:"Institution registered",PAY:"Payment received",APPROVE:"Institution approved",TICKET:"Support message"};
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
const sha=async t=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(t)))].map(x=>x.toString(16).padStart(2,"0")).join("");
const cidOf=h=>"Qm"+h.slice(0,44).replace(/[0-9]/g,c=>"ABCDEFGHJK"[c]);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fd=t=>new Date(t).toLocaleDateString([], {day:"numeric",month:"short",year:"numeric"}),ft=t=>new Date(t).toLocaleString([], {day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
function toast(m){const t=$("#toast");if(!t)return;t.textContent=m;t.classList.add("on");setTimeout(()=>t.classList.remove("on"),2600)}
const MARK='<span class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg></span>';
function sealSVG(h,sz=56){const b=h.replace(/\D/g,"x").length?h:"0",n=i=>parseInt(h[i%h.length],16)||0,hue=(n(0)*16+n(1))%360;let r="";
 for(let y=0;y<5;y++)for(let x=0;x<3;x++)if(n(y*3+x+2)%2){r+=`<rect x="${x*10+5}" y="${y*10+5}" width="10" height="10"/>`;if(x<2)r+=`<rect x="${(4-x)*10+5}" y="${y*10+5}" width="10" height="10"/>`}
 return`<span class="seal" style="width:${sz}px;height:${sz}px;border:2px solid hsl(${hue} 45% 28%)"><svg viewBox="0 0 60 60" width="${sz-4}" height="${sz-4}" fill="hsl(${hue} 45% 28%)" role="img" aria-label="Record seal">${r}</svg></span>`}
const Store={d:null,K:"alma_v2",
 save(){try{localStorage.setItem(this.K,JSON.stringify(this.d))}catch(e){}},
 me(){return this.d.users.find(u=>u.email===this.d.session)||null},
 mail(to,subject,body){const m=this.d.mail=this.d.mail||[];m.unshift({id:Date.now().toString(36)+Math.random().toString(36).slice(2,5),to,subject,body,ts:Date.now()});m.length=Math.min(m.length,120);this.save()},
 planOf(u){const s=u&&u.sub;return s&&s.exp>Date.now()?(PLANS[u.role]||[]).find(p=>p.id===s.plan)||null:null},
 price(p){const o=this.d.prices[p.id];return o==null?p.price:o},
 subscribe(u,id){const p=PLANS[u.role].find(x=>x.id===id);u.sub={plan:id,exp:Date.now()+p.days*DAY,used:0,since:Date.now()};this.note(u.email,"Subscription active: "+p.n);this.save();return p},
 note(email,msg){const n=this.d.notes[email]=this.d.notes[email]||[];n.unshift({t:Date.now(),msg});n.length=Math.min(n.length,30)},
 inst(id){return this.d.users.find(u=>u.role==="admin"&&u.accred===id)},
 async block(type,payload,actor,o={}){const b=this.d.blocks,prev=b.length?b[b.length-1].hash:"0".repeat(64);
  const ts=o.ts||Date.now();b.push({n:b.length,type,pl:String(payload),hash:await sha(prev+type+payload+ts),actor,ts,st:(o.risk||0)>=50?"flag":o.st||"ok",inst:o.inst||"",risk:o.risk||0,why:o.why||[]});this.save()},
 risk(inst,sno,title,result){const d=this.d;let s=6,w=[],h=new Date().getHours();
  if(/first class|distinction|summa|^a\*?$|division (i|1)\b/i.test(result)){s+=18;w.push("Top result outside the usual distribution")}
  if(h<6||h>21){s+=40;w.push("Issued outside office hours")}
  if(d.blocks.filter(b=>b.type==="ISSUE"&&b.inst===inst&&Date.now()-b.ts<6e4&&Date.now()>=b.ts).length>=2){s+=40;w.push("Burst of issuances in under a minute")}
  if(d.creds.some(c=>c.inst===inst&&c.sno===sno&&c.title.toLowerCase()===title.toLowerCase())){s+=30;w.push("Same record already issued to this number")}
  return{s:Math.min(s,99),w}},
 async init(){try{this.d=JSON.parse(localStorage.getItem(this.K))}catch(e){}if(this.d)return;
  const d=this.d={users:[],session:null,blocks:[],creds:[],requests:[],checks:[],notes:{},grants:{},prices:{},codes:{},mail:[],invoices:[],tickets:[]},now=Date.now();
  const U=(role,name,email,x)=>d.users.push({role,name,email,pw:"demo1234",verified:true,approved:true,status:"active",created:now-20*DAY,...x});
  const sub=(plan,used)=>({plan,exp:now+300*DAY,used,since:now-30*DAY});
  U("owner","Platform Owner","owner@alma.app",{key:"ALMA-OWNER-2026"});
  U("admin","Registrar Office","admin@kingsway.edu",{institution:"Kingsway University",instType:"University",accred:"UNI-0142",country:"Kenya",staffId:"K-01",sub:sub("i2",4)});
  U("admin","School Office","admin@riverside.edu",{institution:"Riverside Senior Secondary School",instType:"Senior secondary school",accred:"SCH-0204",country:"Kenya",staffId:"R-07",sub:sub("i1",1)});
  U("admin","Registrar","admin@lakeview.edu",{institution:"Lakeview Technical College",instType:"Technical or vocational institute",accred:"COL-0087",country:"Kenya",staffId:"L-03",sub:sub("i1",1)});
  U("student","Amina Otieno","student@mail.com",{institution:"Kingsway University",sno:"S-1001",dob:"2001-04-12"});
  U("employer","Acme Labs HR","hr@acme.com",{company:"Acme Labs",regNo:"REG-7788",industry:"Employer",sub:sub("v1",3)});
  U("regulator","Higher Education Authority","audit@gov.org",{agency:"Higher Education Authority",authId:"AUTH-5",jurisdiction:"National",accessCode:"REG-2026",sub:sub("r1",0)});
  const mkc=async(name,sno,dob,email,inst,type,title,result,otp,owner)=>{const h=await sha([name,sno,inst,type,title,result].join("|")),c={hash:h,cid:cidOf(h),name,sno,dob,email,inst,type,title,result,otp,owner,t:now-10*DAY,flag:false,revoked:false,erased:false};d.creds.push(c);return c};
  const a=await mkc("Amina Otieno","S-1001","2001-04-12","student@mail.com","UNI-0142","Degree","BSc Computer Science","Second Class Upper","",  "student@mail.com");
  await mkc("Daniel Mwangi","S-1002","2000-09-03","daniel@mail.com","UNI-0142","Diploma","Diploma in Electrical Engineering","Credit","482913",null);
  await mkc("Grace Atieno","RS-2001","2006-11-20","grace@mail.com","SCH-0204","Secondary school leaving certificate","Senior Secondary Certificate","Grade B","730551",null);
  await mkc("Peter Kamau","LT-3310","1998-02-14","peter@mail.com","COL-0087","Certificate","Certificate in Welding","Pass","115207",null);
  d.grants["student@mail.com"]=["Acme Labs"];d.requests.push({id:"R1",hash:a.hash,by:"student@mail.com",inst:"UNI-0142",status:"pending",ts:now-DAY});
  d.notes["admin@kingsway.edu"]=[{t:now-DAY,msg:"Hardcopy request from Amina Otieno"}];
  let z=7;const R=()=>{z|=0;z=z+0x6D2B79F5|0;let t=Math.imul(z^z>>>15,1|z);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
  const I=[["UNI-0142","Kingsway University"],["SCH-0204","Riverside Senior Secondary School"],["COL-0087","Lakeview Technical College"]],ev=[];
  const mk=(type,inst,actor,day,hr,risk,why=[])=>{const t=new Date();t.setHours(hr,Math.floor(R()*59),0,0);let ts=t.getTime()-day*DAY;if(ts>Date.now())ts=Date.now()-(1+R()*8)*36e5;ev.push({type,inst,actor,ts,risk,why})};
  for(let day=13;day>=0;day--)for(const [id,nm] of I){const k=1+Math.floor(R()*(id[0]==="U"?6:3));for(let i=0;i<k;i++)mk("ISSUE",id,nm,day,8+Math.floor(R()*9),4+Math.floor(R()*18));
   for(let i=0,v=1+Math.floor(R()*4);i<v;i++)mk("CHECK",id,["Acme Labs","Orion Bank","State Scholarship Board"][Math.floor(R()*3)],day,9+Math.floor(R()*9),3+Math.floor(R()*12))}
  for(let i=0;i<3;i++)mk("ISSUE","COL-0087","Lakeview Technical College",[9,6,2][i],2+i,60+Math.floor(R()*18),["Issued outside office hours"]);
  for(let i=0;i<7;i++)mk("ISSUE","SCH-0204","Riverside Senior Secondary School",3,10,52+Math.floor(R()*16),["Burst of issuances in under a minute"]);
  for(let i=0;i<5;i++)mk("CHECK","","Unknown verifier",1,21+i%2,58+Math.floor(R()*10),["Repeated lookup of a record that does not exist"]);
  for(let i=0;i<2;i++)mk("DENIED","","Record owner",4+i,15,70,["Blocked by role policy"]);
  mk("CHECK","UNI-0142","Orion Bank",2,11,42,["Check on a revoked record"]);
  ev.sort((x,y)=>x.ts-y.ts);let prev="0".repeat(64);
  for(const e of ev){prev=await sha(prev+e.type+e.ts);d.blocks.push({n:d.blocks.length,type:e.type,hash:prev,actor:e.actor,ts:e.ts,st:e.risk>=50?"flag":"ok",inst:e.inst,risk:e.risk,why:e.why})}
  this.save()}};
Store.ready=Store.init();
async function getWallet(){let a;try{if(window.ethereum){a=(await ethereum.request({method:"eth_requestAccounts"}))[0];const m="Sign in to Alma";await ethereum.request({method:"personal_sign",params:["0x"+[...new TextEncoder().encode(m)].map(x=>x.toString(16).padStart(2,"0")).join(""),a]})}}catch(e){toast("Wallet request was cancelled");return null}
 if(!a){try{a=localStorage.getItem("alma_demo_wallet")}catch(e){}if(!a){a="0x"+[...crypto.getRandomValues(new Uint8Array(20))].map(x=>x.toString(16).padStart(2,"0")).join("");try{localStorage.setItem("alma_demo_wallet",a)}catch(e){}}}
 return a.toLowerCase()}

const pwf=(id,l,ac)=>`<label for="${id}">${l}</label><div class="pw"><input id="${id}" type="password" autocomplete="${ac}"><button type="button" class="eye" data-eye="${id}" aria-pressed="false">Show</button></div>`;
document.addEventListener("click",e=>{const b=e.target.closest("[data-eye]");if(!b)return;const i=$("#"+b.dataset.eye),s=i.type==="password";i.type=s?"text":"password";b.textContent=s?"Hide":"Show";b.setAttribute("aria-pressed",s)});
function setTheme(t){document.documentElement.dataset.theme=t;try{localStorage.setItem("alma_theme",t)}catch(e){}}
function toggleTheme(){setTheme(document.documentElement.dataset.theme==="dark"?"light":"dark")}
try{setTheme(localStorage.getItem("alma_theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"))}catch(e){try{setTheme("light")}catch(x){}}

/* The AI layer. Trust scores and the auditor run in the browser for now; swap for model calls when the backend exists. */
const AI={
 trust(c){const d=Store.d;if(c.revoked)return{s:0,n:["Withdrawn by the issuing institution"]};let s=99,n=[];
  if(c.flag){s-=45;n.push("Held for a human check after unusual issuing")}
  if(!c.owner){s-=10;n.push("The owner has not claimed it yet")}
  const f=d.blocks.filter(b=>b.inst===c.inst&&b.risk>=50&&b.ts>Date.now()-14*DAY).length;if(f){s-=Math.min(25,f*2);n.push(f+" flagged event"+(f>1?"s":"")+" at this institution in 14 days")}
  if(Date.now()-c.t<DAY){s-=5;n.push("Issued in the last 24 hours")}if(!n.length)n.push("Nothing unusual found");return{s:Math.max(s,1),n}},
 ask(q){const d=Store.d,t=q.toLowerCase(),B=d.blocks.filter(b=>b.ts>Date.now()-14*DAY),fl=B.filter(b=>b.risk>=50),nm=id=>{const u=Store.inst(id);return u?u.institution:"the platform"},
  grp=f=>{const g={};f.forEach(b=>{const k=nm(b.inst);g[k]=(g[k]||0)+1});return Object.entries(g).sort((a,b)=>b[1]-a[1]).map(x=>x[0]+" ("+x[1]+")").join(", ")||"none"},has=(f,re)=>f.filter(b=>b.why.some(w=>re.test(w)));
  if(/late|night|hours|outside/.test(t)){const f=has(fl,/office hours/);return f.length?f.length+" issuing events happened outside office hours in the last 14 days: "+grp(f)+". Late-night issuing often means a borrowed login, so it is worth calling the institution.":"Nothing was issued outside office hours in the last 14 days."}
  if(/burst|batch|bulk|many at once/.test(t)){const f=has(fl,/Burst/);return f.length?f.length+" events came in a burst: "+grp(f)+". Ask the institution to explain the batch and spot-check a few records.":"No bursts of issuing in the last 14 days."}
  if(/fake|forg|not found|lookup|invalid/.test(t)){const f=has(fl,/does not exist/);return f.length?f.length+" lookups were for records that do not exist. That pattern looks like someone trying out forged codes. Look at the verifier behind them and consider suspending the account.":"No repeated fake lookups in the last 14 days."}
  if(/revok|withdr/.test(t)){const n=d.creds.filter(c=>c.revoked).length;return n+" record"+(n===1?" is":"s are")+" revoked right now. Checks on revoked records in 14 days: "+has(B,/revoked/).length+"."}
  if(/hold|held|review|pending|approv/.test(t)){const h=d.creds.filter(c=>c.flag&&!c.revoked).length,p=d.users.filter(u=>u.role==="admin"&&u.approved===false).length;return h+" record"+(h===1?" is":"s are")+" held for review and "+p+" institution"+(p===1?" is":"s are")+" waiting for approval."}
  if(/institution|school|college|universit|who|where|worst|riskiest/.test(t)){const r=d.users.filter(u=>u.role==="admin").map(u=>{const e=B.filter(b=>b.inst===u.accred);return{n:u.institution,e:e.length,f:e.filter(b=>b.risk>=50).length}}).sort((a,b)=>b.f-a.f);return "Flagged events by institution: "+r.map(x=>x.n+" "+x.f+" of "+x.e).join("; ")+(r[0]&&r[0].f?". "+r[0].n+" needs the closest look.":".")}
  if(/flag|suspic|risk|fraud|anomal|alert|wrong/.test(t)){if(!fl.length)return "Nothing was flagged in the last 14 days.";const g={};fl.forEach(b=>{const w=b.why[0]||"Unusual activity";g[w]=(g[w]||0)+1});return fl.length+" events were flagged (risk 50 or more) in the last 14 days. Top reasons: "+Object.entries(g).sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>x[0]+" ("+x[1]+")").join("; ")+"."}
  if(/verif|check|genuine/.test(t)){const c=B.filter(b=>b.type==="CHECK").length;return c+" verifications in 14 days. "+has(B,/does not exist/).length+" were repeated lookups of records that do not exist."}
  if(/summary|overview|status|doing/.test(t)){const a=B.length?Math.round(B.reduce((x,b)=>x+b.risk,0)/B.length):0;return "Last 14 days: "+B.length+" events, "+B.filter(b=>b.type==="ISSUE").length+" issued, "+B.filter(b=>b.type==="CHECK").length+" verified, "+fl.length+" flagged. Average risk is "+a+" out of 100."}
  return "I can answer questions about flags, late-night issuing, bursts, fake lookups, revoked records, held records and institutions. Try one of the suggestions."}};

const PAGE={"/":"index.html","/role":"role.html","/auth":"auth.html","/app":"dashboard.html","/legal":"legal.html"},go=p=>{const a=p.split("?");location.href=(PAGE[a[0]]||"index.html")+(a[1]?"?"+a[1]:"")},qp=()=>new URLSearchParams(location.search),closeModal=()=>{$("#modal").innerHTML=""};
function copyText(v){const ok=()=>toast("Copied"),fb=()=>{const t=document.createElement("textarea");t.value=v;t.style.cssText="position:fixed;opacity:0";document.body.appendChild(t);t.select();let r=false;try{r=document.execCommand("copy")}catch(e){}t.remove();r?ok():toast("Copy is not available. Select the text instead.")};try{navigator.clipboard.writeText(v).then(ok,fb)}catch(e){fb()}}
function askText(title,hint,cb){$("#modal").innerHTML=`<div class="ov"><div class="md"><h3>${esc(title)}</h3><p class="hint">${esc(hint)}</p><textarea id="atx" rows="3"></textarea><div style="margin-top:12px;display:flex;gap:8px"><button class="btn" id="aok">Confirm</button><button class="btn o" id="acn">Cancel</button></div></div></div>`;$("#acn").onclick=closeModal;$("#aok").onclick=()=>{const v=$("#atx").value.trim();if(!v)return;closeModal();cb(v)};$("#atx").focus()}
function askYes(title,hint,cb){$("#modal").innerHTML=`<div class="ov"><div class="md"><h3>${esc(title)}</h3><p>${esc(hint)}</p><div style="margin-top:12px;display:flex;gap:8px"><button class="btn x" id="aok">Yes, do it</button><button class="btn o" id="acn">Cancel</button></div></div></div>`;$("#acn").onclick=closeModal;$("#aok").onclick=()=>{closeModal();cb()}}
function showText(title,text){$("#modal").innerHTML=`<div class="ov"><div class="md"><h3>${esc(title)}</h3><p class="hint">Copy this and paste it into a spreadsheet.</p><textarea id="stx" rows="10" readonly style="font:12px ui-monospace,monospace">${esc(text)}</textarea><div style="margin-top:12px;display:flex;gap:8px"><button class="btn" id="scp">Copy all</button><button class="btn o" id="scl">Close</button></div></div></div>`;$("#scl").onclick=closeModal;$("#scp").onclick=()=>copyText(text);$("#stx").select()}
function openMail(){const draw=()=>{const q=$("#mq").value.toLowerCase();$("#ml").innerHTML=(Store.d.mail||[]).filter(x=>!q||x.to.toLowerCase().includes(q)).map(x=>'<div class="mailitem"><b>'+esc(x.subject)+'</b><br><span class="hint">To '+esc(x.to)+' · '+ft(x.ts)+'</span><pre>'+esc(x.body)+'</pre></div>').join("")||"<p>No emails yet.</p>"};
 $("#modal").innerHTML='<div class="ov"><div class="md" style="max-width:640px"><h3>Demo mailbox</h3><p class="hint">Alma has no email service yet. Every email it would send appears here.</p><input id="mq" placeholder="Filter by address" style="margin:8px 0 12px"><div id="ml"></div><button class="btn o sm" id="mcl" style="margin-top:12px">Close</button></div></div>';draw();$("#mq").oninput=draw;$("#mcl").onclick=closeModal}
document.addEventListener("click",e=>{if(e.target.closest("[data-mail]")){e.preventDefault();Store.ready.then(openMail)}});

/* Demo banner: shown while MODE is "demo". Reset puts the sample data back. */
if(CONFIG.MODE==="demo")document.addEventListener("DOMContentLoaded",()=>{const b=document.createElement("div");b.id="demobar";
 b.style.cssText="position:fixed;left:0;right:0;bottom:0;z-index:50;display:flex;gap:10px;justify-content:center;align-items:center;padding:6px 10px calc(6px + env(safe-area-inset-bottom,0px));background:#111c;color:#fff;font:12px Manrope,sans-serif;backdrop-filter:blur(6px)";
 b.innerHTML='Demo: sample data, nothing here is real <button style="font:inherit;border:1px solid #fff8;background:none;color:#fff;border-radius:6px;padding:2px 8px;cursor:pointer">Reset</button>';
 b.querySelector("button").onclick=()=>{if(confirm("Put the sample data back?")){localStorage.removeItem(Store.K);location.reload()}};document.body.appendChild(b)});
