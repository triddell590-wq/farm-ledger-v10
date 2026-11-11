// Role display names and help text (design/01 §9.1). Keys match core/policy.js.
export const ROLE_DISPLAY = { owner: "Owner", manager: "Manager", worker: "Worker", viewer: "Vet / Adviser", accountant: "Accountant" };
export const ROLE_SHORT_HELP = {
  manager: "Everything except delete it.",
  worker: "Add records. Can't see money.",
  viewer: "Look, don't change. No money.",
  accountant: "Money only.",
};
/** "As a Worker you can add and edit cattle, medicine and feed records. You won't see money." */
export function joinBlurb(role, animals = "animal") {
  return {
    manager: `As a Manager you can do everything day to day, including money and inviting helpers.`,
    worker: `As a Worker you can add and edit ${animals}, medicine and feed records. You won't see money.`,
    viewer: `As a Vet / Adviser you can look at records and print registers, but not change them. You won't see money.`,
    accountant: `As an Accountant you'll see the money side only: money in and out, invoices and reports.`,
    owner: "",
  }[role] || "";
}
