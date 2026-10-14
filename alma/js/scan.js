/* Scan a QR code or barcode to check a record. Uses the phone's own scanner where there is one,
   and a small built-in reader where there is not. A photo of the code works too. Camera needs https or localhost. */
const Scan = {
  parse: t => { const m = String(t || "").match(/[a-f0-9]{64}/i); return m ? m[0].toLowerCase() : null; },
  _lib: null, _stream: null, _on: false,
  lib() { return this._lib || (this._lib = new Promise((ok, no) => { if (window.jsQR) return ok(); const s = document.createElement("script"); s.src = "js/vendor/jsqr.js"; s.onload = ok; s.onerror = () => no(new Error("Could not load the reader")); document.head.appendChild(s); })); },
  async read(source, w, h) {   // source: video or image
    if ("BarcodeDetector" in window) { try { const det = new BarcodeDetector({ formats: ["qr_code", "code_128", "code_39", "ean_13"] }); const r = await det.detect(source); for (const b of r) { const x = Scan.parse(b.rawValue); if (x) return x; } } catch (e) { /* try the built-in reader */ } }
    await this.lib(); const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(source, 0, 0, w, h);
    const q = window.jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "attemptBoth" }); return q ? Scan.parse(q.data) : null;
  },
  close() { this._on = false; if (this._stream) this._stream.getTracks().forEach(t => t.stop()); this._stream = null; const o = document.getElementById("scanov"); if (o) o.remove(); },
  async open(onHash) {
    this.close(); const o = document.createElement("div"); o.id = "scanov"; o.className = "scanov";
    o.innerHTML = `<div class="scanbox"><h3>Scan a code</h3><video id="scv" playsinline muted></video><p class="hint" id="scm">Point the camera at the QR code or barcode.</p><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><label class="btn o sm" style="margin:0;cursor:pointer">Use a photo<input id="scf" type="file" accept="image/*" hidden></label><button class="btn sm" id="scx">Close</button></div></div>`; document.body.appendChild(o);
    const done = h => { this.close(); onHash(h); }, msg = t => { const m = document.getElementById("scm"); if (m) m.textContent = t; };
    document.getElementById("scx").onclick = () => this.close();
    document.getElementById("scf").onchange = async e => { try { const f = e.target.files[0], img = await createImageBitmap(f), h = await this.read(img, img.width, img.height); h ? done(h) : msg("No record code found in that photo. Try a clearer one."); } catch (x) { msg("Could not read that photo."); } };
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); const v = document.getElementById("scv"); v.srcObject = this._stream; await v.play(); this._on = true;
      const tick = async () => { if (!this._on) return; if (v.videoWidth) { try { const h = await this.read(v, v.videoWidth, v.videoHeight); if (h) return done(h); } catch (e) { /* keep looking */ } } setTimeout(tick, 200); }; tick();
    } catch (e) { msg("The camera is not available here. You can use a photo instead."); }
  }
};
