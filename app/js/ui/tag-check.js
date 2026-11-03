// One inline check-digit message for every ear-tag field in every sheet (review A #24): the
// message sits under the field, says what is wrong and what the last digit should be, and the
// field is marked invalid for screen readers. Wired once per sheet by ui/sheet.js, so new rows
// ("+ Add another") are covered too.
import { parseTag } from "../sectors/beef/model/tags.js";

const TAG_NAME = /^(tag\d*|newTag|damTag|calfTag\d*|tagFrom|tagTo|nextTag)$/;
export const isTagInput = (i) => i && i.tagName === "INPUT" && (i.hasAttribute("data-tag-field") || TAG_NAME.test(i.name || ""));

/** The message for a typed tag, or "" when it is fine (or not a UK/XI 9 tag we can check). */
export function tagProblem(value) {
  const p = parseTag(value);
  if (!p || p.check == null || p.valid) return "";
  return `Check digit doesn't match — for ${p.herd} ${p.animal} the last digit should be ${p.expected}. Check the tag.`;
}

let n = 0;
function paint(input) {
  const field = input.closest(".field") || input.parentElement;
  const msg = tagProblem(input.value);
  let box = field.nextElementSibling && field.nextElementSibling.matches(".tag-msg") ? field.nextElementSibling : null;
  if (!msg) {
    if (box) box.remove();
    input.removeAttribute("aria-invalid");
    if (input.getAttribute("aria-describedby")?.startsWith("tagmsg-")) input.removeAttribute("aria-describedby");
    return;
  }
  if (!box) { box = document.createElement("p"); box.className = "tag-msg late-ink"; box.id = `tagmsg-${++n}`; box.setAttribute("role", "alert"); field.after(box); }
  box.textContent = msg;
  input.setAttribute("aria-invalid", "true"); input.setAttribute("aria-describedby", box.id);
}

export function wireTagChecks(root) {
  if (!root || root.__tagChecks) return; root.__tagChecks = true;
  const on = (e) => { if (isTagInput(e.target)) paint(e.target); };
  root.addEventListener("input", on); root.addEventListener("change", on);
  // tags already filled in (e.g. read from a docket) are checked straight away
  setTimeout(() => root.querySelectorAll("input").forEach((i) => isTagInput(i) && i.value && paint(i)), 0);
}
