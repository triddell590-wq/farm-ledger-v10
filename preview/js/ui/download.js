// Hand the person a file (CSV / JSON / HTML for print).
export function download(name, text, type = "text/plain") {
  const blob = new Blob([text], { type: type + ";charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
