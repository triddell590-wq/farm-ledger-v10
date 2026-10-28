// Mobility and BCS sessions (design/12 §6.5; AHDB mobility 0–3, BCS 1–5). Pure.

/** Summary of one session's scores. Mobility: % lame = score 2–3. BCS: mean and spread. */
export function sessionSummary(method, scores) {
  const s = (scores || []).map(Number).filter((x) => !Number.isNaN(x));
  if (!s.length) return { n: 0, line: "No cows scored" };
  if (method === "bcs") {
    const mean = s.reduce((t, x) => t + x, 0) / s.length;
    const thin = s.filter((x) => x < 2.5).length, fat = s.filter((x) => x > 3.5).length;
    return { n: s.length, mean, thin, fat, line: `${s.length} cows · mean BCS ${mean.toFixed(2)} · ${thin} under 2.5 · ${fat} over 3.5` };
  }
  const lame = s.filter((x) => x >= 2).length, severe = s.filter((x) => x >= 3).length;
  const pct = Math.round((lame / s.length) * 100);
  return { n: s.length, lame, severe, pct, line: `${s.length} cows · ${pct}% lame (score 2–3) · ${severe} severe` };
}

/** Mobility trend: [{ date, pct, n }] oldest first, last `n` sessions. */
export function mobilityTrend(sessions, n = 6) {
  return (sessions || []).filter((x) => !x.deleted && x.method !== "bcs").sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-n)
    .map((x) => { const sm = sessionSummary("mobility", (x.scores || []).map((r) => r.score)); return { date: x.date, pct: sm.pct ?? 0, n: sm.n }; });
}

/** Cows for the foot trimmer: score 2–3 at the latest mobility session, most severe first. */
export function trimmerList(sessions) {
  const last = (sessions || []).filter((x) => !x.deleted && x.method !== "bcs").sort((a, b) => String(a.date).localeCompare(String(b.date))).pop();
  if (!last) return { date: null, cows: [] };
  return { date: last.date, cows: (last.scores || []).filter((r) => +r.score >= 2).sort((a, b) => +b.score - +a.score) };
}
