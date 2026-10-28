// On-screen keyboard handling (mainly iPhone Safari / home-screen app).
// iOS doesn't shrink the page when the keyboard opens: it shrinks the *visual* viewport and
// scrolls the page, which pushed sheets and the field being typed in out of sight. Here we:
//  • publish the visible area as CSS variables and an `html.kb-open` class, so sheets sit in the
//    visible area (css/components.css) and the tab bar and + button step aside;
//  • after the keyboard settles, bring the focused field to the middle of whatever scrolls it.
const TYPING = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="file"]),textarea,select,[contenteditable="true"]';

export function startKeyboardWatch() {
  const vv = window.visualViewport; const root = document.documentElement;
  if (!vv || root.dataset.kbWatch) return; root.dataset.kbWatch = "1";
  let open = false;
  const update = () => {
    // iOS keeps innerHeight (the layout viewport) the same and shrinks only the visual viewport,
    // then pans it (offsetTop) to the field — so the keyboard is innerHeight − vv.height. Taking
    // offsetTop off as well (as the first version did) cancelled out once iOS panned, so the fix
    // never switched on and the sheet's bottom was shown instead of the field.
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height));
    open = kb > 120; // anything smaller is the Safari toolbar, not a keyboard
    root.style.setProperty("--vv-top", `${Math.round(vv.offsetTop)}px`);
    root.style.setProperty("--vv-h", `${Math.round(vv.height)}px`);
    root.style.setProperty("--kb", `${open ? kb : 0}px`);
    root.classList.toggle("kb-open", open);
  };
  const reveal = () => {
    const a = document.activeElement; if (!a || !a.matches || !a.matches(TYPING)) return;
    const r = a.getBoundingClientRect(); const top = vv.offsetTop + 56, bottom = vv.offsetTop + vv.height - 24;
    if (r.top < top || r.bottom > bottom) a.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
  };
  let t = 0; const soon = () => { clearTimeout(t); t = setTimeout(() => { update(); reveal(); }, 60); };
  vv.addEventListener("resize", () => { update(); soon(); });
  vv.addEventListener("scroll", update);
  document.addEventListener("focusin", (e) => { if (e.target.matches && e.target.matches(TYPING)) { soon(); setTimeout(soon, 350); } });
  update();
}
