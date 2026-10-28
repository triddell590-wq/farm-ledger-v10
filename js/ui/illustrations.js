// Sector illustrations (design/00 §7.3): 72-grid line drawings, 2px stroke, two colours only —
// the line in currentColor (ink-2) and one detail in the sector accent (class "acc").
// design/mockups/platform.html did not exist when these were needed, so the Builder drew them
// to the brief; the Designer may replace the path data without touching any screen.
const S = {
  // A suckler cow and calf at a gate (accent: the ear tags)
  beef: `<path d="M50 30h18M50 38h18M50 46h18M52 26v32M66 26v32"/>
    <path d="M8 34c0-5 4-8 9-8h20c5 0 9 3 9 8v9c0 3-2 5-5 5H13c-3 0-5-2-5-5z"/><path d="M14 48v10M20 48v10M34 48v10M40 48v10"/>
    <path d="M37 26c2-6 6-9 10-8 3 1 3 5 1 9"/><path d="M45 21l4-2M40 20l-3-3"/>
    <path d="M22 50c0-4 3-6 7-6h4c3 0 5 2 5 5v1c0 2-1 3-3 3h-9c-2 0-4-1-4-3z" transform="translate(-14 4) scale(.0)"/>
    <path d="M6 58h44"/><g class="acc"><path d="M48 22.5l2.5 1.5M36 18.5l-2 2.5"/></g>`,
  // A ewe with twin lambs by a hurdle (accent: the raddle mark)
  sheep: `<path d="M4 40h22M4 50h22M7 34v24M23 34v24"/>
    <path d="M32 40c-3 0-5-3-4-6 0-3 3-5 6-4 1-3 5-4 8-2 2-2 6-2 8 1 3-1 6 1 6 4 3 1 4 5 2 7-1 3-4 4-7 3H33z"/>
    <path d="M58 32c3-2 6-1 7 2 1 2-1 4-3 5"/><path d="M36 43v13M44 43v13M52 43v13"/>
    <path d="M30 56c0-3 2-5 5-5"/><circle cx="31" cy="54" r="0" />
    <path d="M58 52c-2 0-3-2-2-3 0-2 2-3 3-2 1-1 3-1 4 0 2 0 3 2 2 3 0 2-2 2-3 2z"/><path d="M58 52v6M63 52v6"/>
    <path d="M45 52c-2 0-3-2-2-3 0-2 2-3 3-2" transform="translate(-6 0)"/>
    <path d="M2 58h68"/><g class="acc"><path d="M42 33c3-1 6-1 9 1" stroke-width="3"/></g>`,
  // A cow's head over a feed barrier with a churn (accent: the churn band)
  dairy: `<path d="M4 44h40M4 52h40M8 40v18M20 40v18M32 40v18M44 40v18"/>
    <path d="M18 20c0-4 3-6 8-6s8 2 8 6v12c0 5-3 9-8 9s-8-4-8-9z"/><path d="M18 22l-7-2c0 3 3 5 7 5M34 22l7-2c0 3-3 5-7 5"/>
    <path d="M22 36c1-2 2-3 4-3s3 1 4 3"/><path d="M21 14c-1-3 0-5 2-6M31 14c1-3 0-5-2-6"/>
    <path d="M54 28h10M56 28v5l-3 4v19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V37l-3-4v-5"/>
    <path d="M2 58h68"/><g class="acc"><path d="M53 44h14" stroke-width="3"/></g>`,
  // A sow with a row of piglets at a creep rail (accent: the heat lamp glow)
  pigs: `<path d="M6 30c0-6 6-10 14-10h16c8 0 13 4 13 10v4c0 6-5 10-12 10H18c-7 0-12-4-12-10z"/><path d="M49 30h4c2 0 3 2 2 4l-3 1"/>
    <path d="M12 44v6M20 44v6M36 44v6M44 44v6"/><path d="M8 22l-3-5 6 2"/>
    <path d="M52 14v8M48 22h8"/>
    <circle cx="44" cy="54" r="3"/><circle cx="54" cy="54" r="3"/><circle cx="64" cy="54" r="3"/>
    <path d="M38 50h30"/><path d="M2 58h68"/><g class="acc"><path d="M46 28c2-3 10-3 12 0M44 32c3-4 13-4 16 0"/></g>`,
  // A nest box with three eggs in a tray (accent: one egg)
  layers: `<path d="M8 12h44v24H8z"/><path d="M8 20h44M22 20v16M38 20v16"/><path d="M6 12l24-6 24 6"/>
    <path d="M14 48h44l-3 8H17z"/>
    <path d="M24 48c-3 0-4-2-4-4 0-3 2-6 4-6s4 3 4 6c0 2-1 4-4 4z"/>
    <path d="M48 48c-3 0-4-2-4-4 0-3 2-6 4-6s4 3 4 6c0 2-1 4-4 4z"/>
    <path d="M2 58h68"/><g class="acc"><path d="M36 48c-3 0-4-2-4-4 0-3 2-6 4-6s4 3 4 6c0 2-1 4-4 4z"/></g>`,
  // A house gable with a fan and a few chicks under a brooder (accent: the brooder light)
  broilers: `<path d="M6 30 34 12l28 18v28H6z"/><circle cx="20" cy="38" r="6"/><path d="M20 32v12M14 38h12"/>
    <path d="M44 22v8M38 30h12"/>
    <path d="M38 54c0-2 1-3 3-3s3 1 3 3"/><path d="M48 54c0-2 1-3 3-3s3 1 3 3"/><path d="M43 50c0-2 1-3 3-3s3 1 3 3" transform="translate(0 4)"/>
    <path d="M2 58h68"/><g class="acc"><path d="M38 34c2 3 10 3 12 0M36 38c3 4 13 4 16 0"/></g>`,
};
export function illustration(sector, size = 72) {
  return `<svg class="illus" width="${size}" height="${size}" viewBox="0 0 72 72" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${S[sector] || ""}</svg>`;
}
export const ILLUSTRATED = Object.keys(S);
