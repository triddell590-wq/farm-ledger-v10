// Picking and shrinking photos on the phone (browser only). The camera's picture is drawn onto
// a canvas at most 1600 px on the long side and re-encoded as JPEG, stepping the quality down
// until it is 350 KB or less. Re-encoding drops the EXIF block (GPS position, phone model);
// the browser applies the EXIF rotation when it decodes, so the picture stays the right way up.
import { shrink, fitSize, b64Bytes, stripDataUrl, THUMB_SIDE, THUMB_QUALITY } from "./photo-codec.js";

/** Open the camera / photo library. Resolves with the chosen File objects ([] if cancelled). */
export function pickFiles({ camera = false, multiple = true } = {}) {
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*"; inp.multiple = multiple;
    if (camera) inp.setAttribute("capture", "environment");
    inp.style.cssText = "position:fixed;left:-9999px;opacity:0";
    inp.setAttribute("data-photo-input", "");
    let done = false;
    const finish = (files) => { if (done) return; done = true; inp.remove(); resolve(files); };
    inp.addEventListener("change", () => finish([...(inp.files || [])]));
    inp.addEventListener("cancel", () => finish([]));
    document.body.appendChild(inp);
    inp.click();
  });
}

async function decode(file) {
  // createImageBitmap honours EXIF orientation ("from-image") in current browsers.
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { /* fall back to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.decoding = "async"; img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
const dims = (src) => ({ w: src.naturalWidth || src.width, h: src.naturalHeight || src.height });

function encoder(src) {
  const cv = document.createElement("canvas"); const cx = cv.getContext("2d");
  return async (w, h, q) => {
    cv.width = w; cv.height = h;
    cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h); // transparent PNGs get a white page, not black
    cx.imageSmoothingQuality = "high";
    cx.drawImage(src, 0, 0, w, h);
    const dataUrl = cv.toDataURL("image/jpeg", q);
    return { dataUrl, bytes: b64Bytes(dataUrl) };
  };
}

/**
 * File -> { b64, w, h, bytes, thumb (data URL), takenAt, mime, quality }.
 * Throws { code: "photo/unreadable" } if the browser can't read the picture (e.g. a RAW file).
 */
export async function preparePhoto(file) {
  let src;
  try { src = await decode(file); } catch (e) { const err = new Error("Couldn't read that picture"); err.code = "photo/unreadable"; throw err; }
  const { w: w0, h: h0 } = dims(src);
  if (!w0 || !h0) { const err = new Error("Couldn't read that picture"); err.code = "photo/unreadable"; throw err; }
  const enc = encoder(src);
  const big = await shrink(w0, h0, enc);
  const t = fitSize(w0, h0, THUMB_SIDE);
  const thumb = (await enc(t.w, t.h, THUMB_QUALITY)).dataUrl;
  if (src.close) src.close();
  const taken = file.lastModified ? new Date(file.lastModified) : new Date();
  const takenAt = Math.abs(Date.now() - taken.getTime()) < 400 * 86400000 ? taken.toISOString() : new Date().toISOString();
  return { b64: stripDataUrl(big.dataUrl), w: big.w, h: big.h, bytes: big.bytes, thumb, takenAt, mime: "image/jpeg", quality: big.quality };
}
