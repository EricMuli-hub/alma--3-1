/* Security tab for every role: change password and two-step sign-in. Example of adding a tab without touching live.js:
   push a [title, subtitle, view, loader] entry into Live.LV[role]. */
if (typeof Live !== "undefined" && Live.LV && Live.on()) {
  const S = {}, v = id => ($("#" + id) || {}).value || "";
  const view = () => {
    const tf = me.twofa;
    return (me.must2fa ? `<div class="res warn">Your role needs two-step sign-in. Turn it on to continue.</div>` : "") +
      card("Two-step sign-in", tf ? `<p>${tg("On", "ok")} Each sign-in asks for a code from your phone.</p>${me.must2fa ? `<p class="hint">Your role must keep this on.</p>` : `<label for="dP">Password</label><input id="dP" type="password"><label for="dC">Code</label><input id="dC" inputmode="numeric"><button class="btn sm o" data-a="tfoff" style="margin-top:12px">Turn off</button>`}`
        : S.setup ? `<p>Scan this with an authenticator app (Google Authenticator, Authy, or similar), then enter the 6-digit code.</p><div style="width:180px;background:#fff;padding:6px;border-radius:10px">${S.setup.qr}</div><p class="hint mono">${esc(S.setup.secret)}</p><label for="eC">Code from the app</label><input id="eC" inputmode="numeric" maxlength="7"><button class="btn sm" data-a="tfon" style="margin-top:12px">Turn on</button>`
          : `<p>${tg("Off", "warn")} A password alone can be stolen. A code from your phone stops that.</p><button class="btn sm" data-a="tfsetup">Set up</button>`) +
      card("Change password", `<label for="pC">Current password</label><input id="pC" type="password"><label for="pN">New password (10+ characters)</label><input id="pN" type="password"><button class="btn sm" data-a="pwchange" style="margin-top:12px">Change</button><p class="hint">Other devices are signed out.</p>`);
  };
  Object.values(Live.LV).forEach(V => { V.security = ["Security", "Password and two-step sign-in.", view]; });
  const refresh = async tok => { if (tok) sessionStorage.setItem("alma_tok", tok); me = await Api.get("/me"); if (me.must2fa === false && Object.keys(VIEWS[me.role]).length === 1) VIEWS[me.role] = Live.LV[me.role]; render(); };
  ACT.tfsetup = async () => { try { S.setup = await Api.post("/me/2fa/setup"); render(); } catch (e) { toast(e.message); } };
  ACT.tfon = async () => { try { const r = await Api.post("/me/2fa/enable", { code: v("eC") }); S.setup = null; await refresh(r.token); modal(`<h3>Two-step sign-in is on</h3><p>${esc(r.note)}</p><p class="mono">${r.recoveryCodes.join("<br>")}</p><button class="btn sm" data-a="copy" data-v="${esc(r.recoveryCodes.join("\n"))}">Copy</button>`); } catch (e) { toast(e.message); } };
  ACT.tfoff = async () => { try { const r = await Api.post("/me/2fa/disable", { password: v("dP"), code: v("dC") }); await refresh(r.token); toast("Two-step sign-in is off"); } catch (e) { toast(e.message); } };
  ACT.pwchange = async () => { try { const r = await Api.post("/me/password", { current: v("pC"), next: v("pN") }); sessionStorage.setItem("alma_tok", r.token); toast("Password changed"); render(); } catch (e) { toast(e.message); } };
}
