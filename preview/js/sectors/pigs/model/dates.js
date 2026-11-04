// Pig records carry date-times (a farrowing at 06:20, a load at 06:00, a room emptied at 09:00).
// These wrap the shared date helpers so day arithmetic takes either "YYYY-MM-DD" or
// "YYYY-MM-DDTHH:MM" and always works on the date part.
import { addDays as add, daysBetween as between, todayStr, addMonths, shortDate } from "../../../core/dates.js";
const day = (x) => String(x ?? "").slice(0, 10);
export const addDays = (iso, n) => add(day(iso), n);
export const daysBetween = (a, b) => between(day(a), day(b));
export { todayStr, addMonths, shortDate, day };
