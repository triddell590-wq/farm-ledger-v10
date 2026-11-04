// Screen transitions (design/00 §8.3–8.5, §8.8) with the Web Animations API. Works without
// View Transitions (iOS 15 / old Android), always on transform + opacity only.
// kind: 'push' | 'pop' | 'tab' | 'ledger' | 'fade' | 'none'
import { reduceMotion } from "./dom.js";

const OUT = "cubic-bezier(.22,1,.36,1)", IN = "cubic-bezier(.4,0,1,1)";
let running = [];

/** Finish any running transition at once (a tap during a push completes the push — §8.9). */
export function finishTransitions() { running.forEach((a) => { try { a.finish(); } catch (e) { /* gone */ } }); running = []; }

export async function transition(stage, oldEl, newEl, kind, { scrollTo = 0 } = {}) {
  finishTransitions();
  if (!oldEl || kind === "none") {
    stage.replaceChildren(newEl); window.scrollTo(0, scrollTo);
    if (kind !== "none" && oldEl === null) fadeIn(newEl);
    return;
  }
  // Freeze the old screen where it is, mount the new one on top of the same spot.
  const y = window.scrollY;
  Object.assign(oldEl.style, { position: "absolute", left: 0, right: 0, top: `${-y}px`, pointerEvents: "none" });
  oldEl.setAttribute("aria-hidden", "true"); oldEl.inert = true;
  if (kind === "pop") stage.insertBefore(newEl, oldEl); else stage.appendChild(newEl);
  window.scrollTo(0, scrollTo);
  if (kind !== "pop") { /* new on top */ } else { oldEl.style.zIndex = 2; }

  const rm = reduceMotion();
  const anims = [];
  const A = (el, kf, o) => { const a = el.animate(kf, { fill: "both", ...o }); anims.push(a); return a; };
  if (rm || kind === "fade") {
    A(oldEl, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: "linear" });
    A(newEl, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "linear" });
  } else if (kind === "push") {
    A(newEl, [{ transform: "translateX(100%)" }, { transform: "none" }], { duration: 340, easing: OUT });
    A(oldEl, [{ transform: "none", filter: "brightness(1)" }, { transform: "translateX(-24%)", filter: "brightness(.9)" }], { duration: 340, easing: OUT });
  } else if (kind === "pop") {
    A(oldEl, [{ transform: "none" }, { transform: "translateX(100%)" }], { duration: 280, easing: OUT });
    A(newEl, [{ transform: "translateX(-24%)", filter: "brightness(.9)" }, { transform: "none", filter: "brightness(1)" }], { duration: 280, easing: OUT });
  } else if (kind === "tab") {
    A(oldEl, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(4px)" }], { duration: 120, easing: IN });
    A(newEl, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 200, delay: 80, easing: OUT });
  } else if (kind === "ledger") {
    A(oldEl, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.98)" }], { duration: 160, easing: IN });
    A(newEl, [{ opacity: 0, transform: "scale(1.02)" }, { opacity: 1, transform: "none" }], { duration: 340, delay: 120, easing: OUT });
  }
  running = anims;
  await Promise.all(anims.map((a) => a.finished.catch(() => {})));
  oldEl.remove();
  anims.forEach((a) => { try { a.cancel(); } catch (e) { /* gone */ } });
  newEl.style.transform = ""; newEl.style.opacity = "";
  running = [];
}
export function fadeIn(el, ms = 340) {
  if (reduceMotion()) return;
  el.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: ms, easing: OUT });
}
