// Copied from design/assets/icons.js (Designer) as an ES module. Ledgers append their own icons below.
/* Farm Ledger 10 icon set. One style: 24×24 grid, 2px stroke, round caps/joins, no fills
   (except where noted with fill="currentColor"). 2px padding inside the grid.
   Usage: icon('beef', {size:24}) -> '<svg ...>'.  Builder: copy to build/js/icons.js. */
export const FL_ICONS = {
  /* ---- sectors (always this order) ---- */
  beef:     '<path d="M8 4c-1 1.6-.6 3 .7 3.8M16 4c1 1.6.6 3-.7 3.8"/><path d="M7.2 9.3C7.2 7.6 9 6.6 12 6.6s4.8 1 4.8 2.7v3.9c0 3.4-2.1 6.8-4.8 6.8s-4.8-3.4-4.8-6.8z"/><path d="M7.2 9.6 3.5 9c.2 1.6 1.7 2.6 3.7 2.4M16.8 9.6l3.7-.6c-.2 1.6-1.7 2.6-3.7 2.4"/><path d="M9.6 17.2c.6-1.1 1.4-1.5 2.4-1.5s1.8.4 2.4 1.5"/>',
  sheep:    '<path d="M6.3 15.4a2.5 2.5 0 0 1-1.8-4.3 2.6 2.6 0 0 1 2.8-3.6 3 3 0 0 1 5.3-.8 2.8 2.8 0 0 1 4.3 1.2"/><path d="M16.9 7.9c1.2-.9 2.9-.8 3.7.3.6.8.3 2-.4 2.7l-1.6 1.6c-.5 2.3-2.2 3.3-4.4 3.1l-8.2-.2"/><path d="M17.4 8 16.6 6.3"/><path d="M8 15.4V20M11 15.6V20M14.2 15.6V20"/>',
  dairy:    '<path d="M9 3h6M9.8 3v3L7 9.2V19a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9.2L14.2 6V3"/><path d="M7 12.5h10"/><path d="M7 9.8H5.2v4M17 9.8h1.8v4"/>',
  pigs:     '<path d="M7.4 7.6 5.6 3.8l4 1.9M16.6 7.6l1.8-3.8-4 1.9"/><circle cx="12" cy="12.8" r="7.2"/><ellipse cx="12" cy="15" rx="3" ry="2.2"/><path d="M11 15h.01M13 15h.01"/>',
  layers:   '<path d="M12 3c3.6 0 6.4 5.4 6.4 10.2A6.3 6.3 0 0 1 12 21a6.3 6.3 0 0 1-6.4-7.8C5.6 8.4 8.4 3 12 3z"/><path d="M9 13.5c.3-2 1.2-3.6 2.4-4.4"/>',
  broilers: '<path d="M7 4.3c-.2-1.2.6-1.9 1.4-1.6.4-.8 1.6-.8 1.8.3"/><path d="M5.2 7.3 3.2 8.2l2.2.6"/><path d="M5.2 7.3C5.4 5.3 6.7 4.1 8.3 4.1c1.7 0 3 1.3 3 3.1 0 1-.4 1.8-1 2.4 1.6 1.3 3.6 1.6 5.6.6l3.6-3.6v6.2c0 4.2-3.3 7.2-7.6 7.2s-7.5-3-7.5-7.2c0-2.2.8-4 1.9-5.3"/><path d="M9.6 14.2c1.5 1.4 3.9 1.5 5.4 0"/><path d="M10.5 20v1.5M14 20v1.5"/>',
  /* ---- navigation ---- */
  farm:     '<path d="M3 11 12 4l9 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
  today:    '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/><path d="m9 15 2 2 4-4"/>',
  money:    '<circle cx="12" cy="12" r="8.5"/><path d="M14.6 8.6c-.5-.9-1.4-1.3-2.4-1.3-1.5 0-2.6 1.1-2.6 2.6v6.4M8.2 12.3h4.8M8.2 16.3h7.4"/>',
  map:      '<path d="M9 3.5 3.5 5.6v15l5.5-2.1 6 2.1 5.5-2.1v-15L15 5.6z"/><path d="M9 3.5v15M15 5.6v15"/>',
  people:   '<circle cx="9" cy="8.5" r="3.3"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 6M17.6 14.8c1.6.7 2.6 2.3 2.9 4.7"/>',
  more:     '<circle cx="5.5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18.5" cy="12" r="1.2" fill="currentColor"/>',
  records:  '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
  /* ---- actions ---- */
  plus:     '<path d="M12 5v14M5 12h14"/>',
  close:    '<path d="M6 6l12 12M18 6 6 18"/>',
  back:     '<path d="M15 5l-7 7 7 7"/>',
  chevron:  '<path d="m9.5 6 6 6-6 6"/>',
  down:     '<path d="m6 9.5 6 6 6-6"/>',
  check:    '<path d="M5 12.5l4.5 4.5L19 7"/>',
  search:   '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
  edit:     '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  expand:   '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  trash:    '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7"/>',
  share:    '<path d="M12 3.5v11M7.5 8 12 3.5 16.5 8"/><path d="M5 12.5v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  download: '<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5"/><path d="M4.5 19.5h15"/>',
  print:    '<path d="M7 9V3.5h10V9"/><path d="M7 17.5H5a1.5 1.5 0 0 1-1.5-1.5v-5.5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 1-1.5 1.5h-2"/><rect x="7" y="14" width="10" height="6.5" rx="1"/>',
  camera:   '<path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.3" r="3.4"/>',
  scan:     '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M4 12h16"/>',
  link:     '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  message:  '<path d="M4 18.5V7a2.5 2.5 0 0 1 2.5-2.5h11A2.5 2.5 0 0 1 20 7v7.5a2.5 2.5 0 0 1-2.5 2.5H8z"/><path d="M8.5 9.5h7M8.5 13h4.5"/>',
  mail:     '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  /* ---- status ---- */
  alert:    '<path d="M10.3 4.6 2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4.5M12 17h.01"/>',
  clock:    '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  info:     '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8h.01"/>',
  lock:     '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  cloud:    '<path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.6A3.8 3.8 0 0 1 17.2 18.5z"/>',
  cloudOff: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-9M9.6 6.3A6 6 0 0 1 17.8 11a3.8 3.8 0 0 1 2.6 6"/><path d="M3.5 3.5l17 17"/>',
  shield:   '<path d="M12 3.5 5 6v5.5c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6z"/>',
  /* ---- farm things ---- */
  tag:      '<path d="M12 3.5c3.3 0 6 2.5 6 5.7V18a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 6 18V9.2c0-3.2 2.7-5.7 6-5.7z"/><circle cx="12" cy="8" r="1.4"/><path d="M9 14h6M9 17h4"/>',
  syringe:  '<path d="m18 3 3 3M19.5 4.5l-3 3M14.5 6l3.5 3.5M16 7.5 7.5 16l-2.5.5.5-2.5L14 5.5"/><path d="M5.5 18.5 3 21M10 11l1.5 1.5M12 9l1.5 1.5"/>',
  scale:    '<path d="M4 20.5h16"/><path d="M6.5 20.5 8 9.5h8l1.5 11"/><path d="M12 9.5V5.5M9 5.5h6"/><path d="M12 15.5l2-2"/>',
  feed:     '<path d="M12 21V8M12 12c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4zM12 12c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4zM12 16.5c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4zM12 16.5c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4zM12 7.5c-1.3-.8-1.3-3 0-4.5 1.3 1.5 1.3 3.7 0 4.5z"/>',
  water:    '<path d="M12 3.5s6 6.4 6 10.8A6 6 0 0 1 6 14.3C6 9.9 12 3.5 12 3.5z"/>',
  temp:     '<path d="M14 14.3V5a2 2 0 0 0-4 0v9.3a4 4 0 1 0 4 0z"/><path d="M12 9.5v7"/>',
  truck:    '<path d="M3 6.5h10.5v10H3zM13.5 10h4l3 3.2v3.3h-7"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  document: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9 12.5h6M9 16h6"/>',
  birth:    '<path d="M12 21c-4 0-7-2.7-7-6.3C5 10 9 5.5 12 3c3 2.5 7 7 7 11.7 0 3.6-3 6.3-7 6.3z"/><path d="M12 11v6M9 14h6"/>',
  fuel:     '<path d="M4.5 20.5V5A1.5 1.5 0 0 1 6 3.5h7A1.5 1.5 0 0 1 14.5 5v15.5M3 20.5h13M7.5 7.5h4"/><path d="M14.5 9.5h2a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
};

/* ---- platform additions (Builder, same 24 grid / 2px stroke) ---- */
Object.assign(FL_ICONS, {
  eye:      '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:   '<path d="M4 4l16 16"/><path d="M9.9 6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.9 3.7M6.4 7.4C3.9 9.2 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1"/><path d="M10 10.2a3 3 0 0 0 4 4"/>',
  copy:     '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>',
  logout:   '<path d="M14.5 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3"/><path d="M10 16.5 5.5 12 10 7.5M5.5 12h10"/>',
  sun:      '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  refresh:  '<path d="M20 11.5A8 8 0 0 0 5.6 7M4 12.5A8 8 0 0 0 18.4 17"/><path d="M5 3.5V7.5h4M19 20.5v-4h-4"/>',
  user:     '<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20c.8-3.9 3.8-6 7.5-6s6.7 2.1 7.5 6"/>',
  help:     '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.1-2.4 3.6M12 17h.01"/>',
  grid:     '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  bell:     '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  whatsapp: '<path d="M4.5 19.5l1.2-3.6A8 8 0 1 1 8.4 18.6z"/><path d="M9.2 8.8c.2 2.8 2.9 5.6 5.9 6l1-1.3-1.8-1-.9.8c-1-.4-2-1.4-2.4-2.4l.8-.9-1-1.8z"/>',
});

export function icon(name, opts = {}) {
  const s = opts.size || 24, sw = opts.stroke || 2;
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${FL_ICONS[name] || ''}</svg>`;
}

