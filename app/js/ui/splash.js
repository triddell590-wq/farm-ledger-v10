// Splash (design/00 §8.2). index.html already holds the logo at rest in the splash position
// (no flash after the OS launch screen); this plays the drawing, shows a progress rule if boot
// passes 2.5s and "Getting your farm ready…" after 6s, and hands off to the first screen.
const MIN_MS = 1150;
let t0 = 0, slowTimer = null, slowerTimer = null;
export function playSplash() {
  const s = document.getElementById("splash"); if (!s) return Promise.resolve();
  t0 = performance.now();
  s.classList.add("play");
  slowTimer = setTimeout(() => s.classList.add("slow-boot"), 2500);
  slowerTimer = setTimeout(() => { const m = s.querySelector(".slow"); if (m) m.style.opacity = 1; }, 6000);
  return new Promise((r) => setTimeout(r, MIN_MS));
}
export function endSplash() {
  const s = document.getElementById("splash"); if (!s || s.classList.contains("leaving")) return;
  clearTimeout(slowTimer); clearTimeout(slowerTimer);
  s.classList.add("leaving");
  const st = document.getElementById("stage");
  if (st && !document.documentElement.classList.contains("reduce-motion")) st.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 340, delay: 80, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" });
  setTimeout(() => s.remove(), 400);
}
