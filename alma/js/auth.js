function mountAuth(){const q=qp(),role=q.get("role"),mode=q.get("mode")==="signin"?"signin":"signup",up=mode==="signup";
if(!ROLES[role]||role==="owner"){go("/role?mode="+mode);return}
const pwOK=p=>p.length>=8&&/[A-Z]/.test(p)&&/[a-z]/.test(p)&&/\d/.test(p),str=p=>[p.length>=8,/[A-Z]/.test(p)&&/[a-z]/.test(p),/\d/.test(p),/[^\w]/.test(p)||p.length>=12].filter(Boolean).length;
const fld=([k,l,t,o])=>`<label for="${k}">${l}${typeof o==="string"?` <span class="hint">${o}</span>`:""}</label>`+(t==="select"?`<select id="${k}">${o.map(x=>`<option>${x}</option>`).join("")}</select>`:t==="inst"?`<input id="${k}" list="insts" autocomplete="off">`:t==="date"?`<input id="${k}" type="date" max="${new Date().toISOString().slice(0,10)}">`:`<input id="${k}">`);
window.showCode=(em,purpose)=>{const d=Store.d,c=String(Math.floor(100000+Math.random()*900000)),rs=purpose==="reset";d.codes[em]=c;Store.mail(em,rs?"Your password reset code":"Your email confirmation code","Your 6-digit code is "+c+". It works once.");Store.save();
 $("#f").hidden=true;$("#dm").hidden=true;$("#tools").hidden=true;$("#tb").hidden=true;$("#h").textContent=rs?"Reset your password":"Verify your email";
 $("#pnl").innerHTML=`<p>We sent a 6-digit code to <b>${esc(em)}</b>.</p><div class="help"><b>Check your email</b>Demo: <a href="#" data-mail>open the demo mailbox</a> to read it.</div><label for="cd">6-digit code</label><input id="cd" inputmode="numeric" maxlength="6" autocomplete="one-time-code">${rs?pwf("np","New password <span class='hint'>(8+ characters, upper and lower case, a number)</span>","new-password"):""}<div class="err" id="er2" role="alert"></div><button class="btn" id="go2" style="width:100%">${rs?"Set new password":"Verify and continue"}</button><p><a href="#" id="rs">Send a new code</a></p>`;
 $("#rs").onclick=e=>{e.preventDefault();showCode(em,purpose)};
 $("#go2").onclick=async()=>{const er=m=>$("#er2").textContent=m,u=d.users.find(x=>x.email===em);
  if($("#cd").value.trim()!==d.codes[em])return er("That code is not right. Check it or send a new code.");
  if(rs){const p=$("#np").value;if(!pwOK(p))return er("Password is too weak. Use 8+ characters with upper and lower case letters and a number.");u.pw=p;u.verified=true;delete d.codes[em];await Store.block("PW_RESET",em,u.name);Store.save();toast("Password updated. Please sign in.");go("/auth?role="+u.role+"&mode=signin")}
  else{u.verified=true;delete d.codes[em];d.session=em;await Store.block("VERIFY",em,u.name,{inst:u.accred||""});Store.save();go("/app")}}};
Store.ready.then(()=>{const R=ROLES[role],d=Store.d;$("#mk").innerHTML=MARK;document.documentElement.style.setProperty("--ac",R.c);document.title=(up?"Sign up":"Sign in")+" · "+R.n+" – Alma";
 $("#st").textContent=R.n;$("#sp").textContent=R.does;$("#sa").innerHTML=R.allow.map(a=>"<li>"+a+"</li>").join("");$("#sn").textContent=R.note||"";$("#sn").hidden=!R.note;
 $("#h").textContent=up?"Create your "+R.n.toLowerCase()+" account":"Sign in as "+R.n.toLowerCase();$("#back").href="role.html?mode="+mode;$("#back").hidden=role==="owner";$("#tb").hidden=role==="owner";
 $("#t1").href="auth.html?role="+role+"&mode=signup";$("#t2").href="auth.html?role="+role+"&mode=signin";$(up?"#t1":"#t2").setAttribute("aria-current","page");
 $("#insts").innerHTML=d.users.filter(u=>u.role==="admin"&&u.approved!==false&&u.status==="active").map(u=>`<option value="${esc(u.institution)}">`).join("");
 $("#mh").textContent=R.mail?"("+R.mail+")":"";$("#sub").textContent=up?"Create account":"Sign in";$("#mt").hidden=!up;$("#tools").hidden=up;$("#wl").hidden=role==="owner";$("#dm").hidden=up;
 $("#pws").innerHTML=up?pwf("pw","Password <span class='hint'>(8+ characters, upper and lower case, a number)</span>","new-password")+pwf("pw2","Confirm password","new-password"):pwf("pw","Password","current-password");
 $("#ex").innerHTML=up?'<label for="nm">'+(role==="admin"?"Your full name (account holder)":"Full name")+'</label><input id="nm" autocomplete="name">'+R.f.map(fld).join(""):R.signin.map(fld).join("");
 $("#pw").oninput=e=>{if(!up)return;const s=str(e.target.value);$$("#mt i").forEach((b,i)=>b.style.background=i<s?(s<3?"#b8862b":"#1d7a4d"):"")};
 $("#demo").onclick=()=>{const u=d.users.find(x=>x.role===role);$("#em").value=u.email;$("#pw").value="demo1234";R.signin.forEach(([k])=>$("#"+k).value=u[k])};
 $("#fg").onclick=e=>{e.preventDefault();const em=$("#em").value.trim().toLowerCase();if(!d.users.some(u=>u.email===em&&u.role===role))return $("#er").textContent="Type the email of your "+R.n.toLowerCase()+" account first, then press Forgot password.";showCode(em,"reset")};
 $("#wl").onclick=async()=>{const a=await getWallet();if(!a)return;const u=d.users.find(x=>x.wallet===a),er=m=>$("#er").textContent=m;
  if(!u)return er("No account is linked to this wallet. Sign in with email first, then press Link wallet in your workspace.");if(u.role!==role)return er("This wallet belongs to a "+ROLES[u.role].n.toLowerCase()+" account. Choose that role.");
  if(u.status==="suspended")return er("This account is suspended. Contact Alma support.");d.session=u.email;await Store.block("WALLET_LOGIN",a,u.name,{inst:u.accred||""});Store.save();go("/app")};
 $("#f").onsubmit=async e=>{e.preventDefault();const em=$("#em").value.trim().toLowerCase(),pw=$("#pw").value,er=m=>($("#er").textContent=m,false),v=k=>$("#"+k).value.trim();
  if(!/^\S+@\S+\.\S+$/.test(em))return er("Enter a valid email address, like name@example.com.");
  if(up){const nm=v("nm");if(nm.length<2)return er("Enter your full name.");const x={};
   for(const [k,l] of R.f){if(!v(k))return er("Fill in: "+l+".");x[k]=v(k)}
   if(role==="admin"){if(d.users.some(u=>u.role==="admin"&&u.accred.toLowerCase()===x.accred.toLowerCase()))return er("This registration number is already registered on Alma.");if(d.users.some(u=>u.role==="admin"&&u.institution.toLowerCase()===x.institution.toLowerCase()))return er("An institution with this name is already registered.")}
   if(role==="student"){const i=d.users.find(u=>u.role==="admin"&&u.approved!==false&&u.status==="active"&&u.institution.toLowerCase()===x.institution.toLowerCase());if(!i)return er("We could not find “"+x.institution+"” on Alma. Ask your institution to register first, then try again.");x.institution=i.institution;
    if(d.users.some(u=>u.role==="student"&&u.sno===x.sno&&u.institution===x.institution))return er("This student number is already registered at that institution.")}
   if(role==="regulator"&&x.accessCode!==CONFIG.demoRegulatorCode)return er("That agency access code is not valid.");
   if(!pwOK(pw))return er("Password is too weak. Use 8+ characters with upper and lower case letters and a number.");if(pw!==$("#pw2").value)return er("The two passwords do not match.");
   if(d.users.some(u=>u.email===em))return er("This email already has an account. Use Sign in instead.");
   d.users.push({role,name:nm,email:em,pw,verified:false,approved:role!=="admin",status:"active",created:Date.now(),...x});await Store.block(role==="admin"?"REGISTER":"SIGNUP",em,nm,{inst:x.accred||""});return showCode(em,"verify")}
  const u=d.users.find(x=>x.email===em&&x.role===role);if(!u)return er("No "+R.n.toLowerCase()+" account with this email. Check the role or create an account.");
  if(role==="admin"&&String(u.accred).toLowerCase()!==v("accred").toLowerCase())return er("The institution registration number does not match this account.");
  if(u.status==="suspended")return er("This account is suspended. Contact Alma support.");if(u.pw!==pw)return er("Wrong password. Try again or use Forgot password.");
  if(u.verified===false)return showCode(em,"verify");d.session=em;Store.save();go("/app")}});
}
