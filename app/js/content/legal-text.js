// DRAFT legal text — FOR TOM'S REVIEW, NOT ADVICE. To be checked by a solicitor before launch
// (design/01 §10). Plain-English summary first (Designer's exact copy), full text below.
export const LEGAL_STATUS = "Draft for review — 14 Oct 2026. Not yet checked by a solicitor.";
export const PRIVACY = {
  title: "Privacy notice",
  summary: [
    ["What we keep", "your name, email, and the farm records you and your team type in."],
    ["Why", "to run your ledgers, sync them between phones and let the people you invite see them."],
    ["Who sees it", "only people you invite, with the role you chose. We don't sell or share your data. It's stored with Google Firebase. (The storage region of the live database still has to be confirmed before launch.)"],
    ["How long", "until you delete it. Some records the law says you must keep (e.g. medicine records for at least 5 years) — if you delete your account, export them first."],
    ["Your rights", "see, download, correct or delete your data at any time from Account and settings. Questions: privacy@… (to be set up). You can complain to the ICO (ico.org.uk)."],
  ],
  full: `<h2>1. Who we are</h2>
<p>Farm Ledger is operated by [operator to be decided — Tom as sole trader or a company] ("we"). For the account details you give us (name, email) we are the data controller. For the farm records you keep in a ledger, the farm business that owns the ledger is the controller and we act as its processor (to be confirmed by a solicitor).</p>
<h2>2. What we collect</h2>
<ul><li>Account: your name, email address, a password (stored by Google Firebase Authentication — we never see it), the date you accepted these terms.</li>
<li>Farm records you or people you invite type in, in each ledger you keep: cattle, sheep and goats, pigs and poultry (animals, mobs, batches, houses and crops), breeding, lambing and calving, milk, egg and bird-weight records, medicines and withdrawal periods, movements, sales and purchases, deaths, feed, money, fields and notes, and photos of documents.</li>
<li>Other people's details you choose to record: names, phone numbers and addresses of buyers, hauliers, vets and contractors; names on staff training records; and names of visitors signed in on a pig or poultry visitor log. Only record what the farm needs; these people can ask the farm (the ledger owner) to see or remove them.</li>
<li>Who did what: each record keeps who added or changed it and when, so shared ledgers can be trusted.</li>
<li>On your phone only: appearance settings and a copy of your records for working offline.</li></ul>
<h2>3. Why we use it (lawful basis)</h2>
<p>To provide the service you signed up for (contract), to keep records secure and show who changed what (legitimate interests), and to help you meet record-keeping laws (legal obligation, yours).</p>
<h2>4. Who can see it</h2>
<p>Only people you invite to a ledger, with the role you choose (Owner, Manager, Worker, Vet / Adviser, Accountant). Workers and Vet / Advisers never see money; Accountants see money only. Our service providers: Google Firebase (database and sign-in) and GitHub Pages (the app files). We don't sell your data or use it for advertising.</p>
<h2>5. Where it's stored</h2>
<p>With Google Firebase. The region of the database must be confirmed before launch; if any data is held outside the UK, appropriate safeguards (UK adequacy or the UK International Data Transfer Addendum) apply.</p>
<h2>6. How long we keep it</h2>
<p>Until you delete it or delete your account. When you delete a ledger or your account, the records are removed from the live database straight away and from backups within 30 days (to be confirmed). The law may require you to keep some farm records for years (for example medicine records for at least 5 years) — download them before you delete.</p>
<h2>7. Your rights</h2>
<p>You can see, correct, download (Account and settings → Download my data) or delete (Account and settings → Delete account) your data at any time. You can also object to or ask us to restrict how we use it. Contact: privacy@… (to be set up). If you're unhappy you can complain to the Information Commissioner's Office, ico.org.uk, 0303 123 1113.</p>
<h2>8. Changes</h2>
<p>If we change this notice we'll tell you in the app before the change takes effect.</p>`,
};
export const TERMS = {
  title: "Terms of use",
  summary: [["In short", "Farm Ledger helps you keep records. You're responsible for checking they're correct and for meeting your legal duties. Checklists are based on published standards (named with version and date on each one); they are not issued or endorsed by DAERA, LMC, Red Tractor or any other body."]],
  full: `<h2>1. The service</h2>
<p>Farm Ledger is an app for keeping farm records. It works offline and syncs when you have a signal. We aim to keep it available but can't promise it will never be interrupted.</p>
<h2>2. Your account</h2>
<p>Keep your password safe. You're responsible for what happens under your account and for the people you invite and the roles you give them.</p>
<h2>3. Your records</h2>
<p>Your records are yours. You give us permission to store and process them only to run the service for you and the people you invite. You're responsible for the accuracy of your records and for meeting your legal duties (for example cattle movement notifications, medicine records and inspections).</p>
<h2>4. Checklists and standards</h2>
<p>Checklists and reminders are <b>based on</b> published standards and rules, and each names the version and date it follows. They are not issued, approved or endorsed by DAERA, LMC, Red Tractor, the Veterinary Medicines Directorate or any other body. Always check the official source.</p>
<h2>5. Fair use</h2>
<p>Don't misuse the service, try to get at other people's data, or use it for anything unlawful.</p>
<h2>6. Liability</h2>
<p>We're not liable for losses caused by records being wrong or incomplete, or by the service being unavailable, except where the law says we can't limit liability. [Solicitor to complete.]</p>
<h2>7. Ending</h2>
<p>You can delete your account at any time. We may suspend accounts that break these terms.</p>
<h2>8. Law</h2>
<p>These terms are governed by the law of Northern Ireland. [Solicitor to confirm.]</p>`,
};
