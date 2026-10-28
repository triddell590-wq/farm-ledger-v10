// Reading text from a photo, on the phone (works offline). Same engine as v9.14: the Tesseract
// worker, core and English data live in ocr/ on the site and the service worker keeps them.
// NOTE (build gap): the ocr/ folder is not in reference/v9_14; copy it from the live v9 site
// into build/app/ocr/ before publishing. Without it, recognize() throws and the screens say
// "type it in instead".
const LocalOCR = (() => {
  let w = null, ready = null, seq = 0, pending = {};
  const simd = () => { try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch (e) { return false; } };
  function call(msg, transfer) {
    return new Promise((res, rej) => { const id = ++seq; pending[id] = { res, rej }; w.postMessage(Object.assign({ id }, msg), transfer || []); });
  }
  async function blobUrl(path) { const r = await fetch(path); if (!r.ok) throw new Error(path + " " + r.status); return URL.createObjectURL(await r.blob()); }
  function start() {
    if (ready) return ready;
    ready = (async () => {
      const [workerUrl, coreUrl, langRes] = await Promise.all([
        blobUrl("ocr/ocr-worker.js"),
        blobUrl(simd() ? "ocr/tesseract-core-simd-lstm.wasm.js" : "ocr/tesseract-core-lstm.wasm.js"),
        fetch("ocr/eng.traineddata"),
      ]);
      if (!langRes.ok) throw new Error("language data " + langRes.status);
      const lang = await langRes.arrayBuffer();
      w = new Worker(workerUrl);
      w.onmessage = (e) => { const p = pending[e.data.id]; if (!p) return; delete pending[e.data.id]; e.data.ok ? p.res(e.data.text || "") : p.rej(new Error(e.data.error)); };
      w.onerror = (e) => { e.preventDefault && e.preventDefault(); Object.values(pending).forEach((p) => p.rej(new Error("reader crashed"))); pending = {}; w = null; ready = null; };
      await call({ type: "init", coreUrl, lang }, [lang]);
      return true;
    })();
    ready.catch(() => { if (w) { try { w.terminate(); } catch (e) {} } w = null; ready = null; });
    return ready;
  }
  function dataUrlBytes(dataUrl) {
    const b64 = String(dataUrl).split(",")[1] || "";
    const bin = atob(b64), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  return {
    async recognize(dataUrl) { await start(); const buf = dataUrlBytes(dataUrl); return call({ type: "recognize", image: buf }, [buf]); },
  };
})();
export async function readPhoto(file) {
  const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  return LocalOCR.recognize(dataUrl);
}
/** Ask for a photo (camera on phones). Resolves with a File or null. */
export function choosePhoto() {
  return new Promise((res) => { const i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; i.capture = "environment"; i.onchange = () => res(i.files[0] || null); i.click(); });
}
