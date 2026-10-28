# Phone notifications — setup for Tom

Farm Ledger sends two kinds of notification to phones that have switched them on
(Account and settings → Notifications):

- a **morning summary** (default 7:00 am) of what's late and due across your ledgers;
- a note **the moment a legal job goes late** (once per job), e.g. a NIFAIS move not notified in time.

A small job on GitHub runs every hour, works out what is due using the same code as the app,
and sends the notifications through Firebase. It costs nothing on the free Firebase plan.
Nothing is live until you do the two steps below — and you only do them when you decide to go live.

## Step 1 — the public key for the app (2 minutes)

1. Open <https://console.firebase.google.com>, choose the project **farm-ledger-5ba2e**.
2. Gear icon → **Project settings** → **Cloud Messaging** tab.
3. Scroll to **Web configuration** → **Web Push certificates** → **Generate key pair**.
4. Copy the long key it shows (starts with **B**). This one is public — it is safe in the app.
5. Paste it into `app/js/config.js`, in the line `export const FCM_VAPID_KEY = "";`, between the quotes.

Until this is done, the Notifications screen says "Push to phones isn't set up yet". The bell,
the app badge and the pop-up for late legal jobs when you open the app still work.

## Step 2 — the private key for the hourly job (3 minutes)

This key lets the job read the ledgers and send notifications. **Keep it secret — never paste it
into a chat, an email or a file in the repository.**

1. Same Project settings → **Service accounts** tab → **Generate new private key** → **Generate key**.
   A `.json` file downloads.
2. Open <https://github.com/triddell590-wq/farm-ledger-v10> → **Settings** → **Secrets and variables**
   → **Actions** → **New repository secret**.
3. Name: `FIREBASE_SERVICE_ACCOUNT`. Value: open the downloaded file in a text editor, copy
   **everything** in it, paste. **Add secret**.
4. Delete the downloaded file from your Downloads folder.

Until the secret exists, the hourly job only does a practice run on made-up farm data and sends
nothing. Once it exists, the next hourly run sends for real.

## Check it works

- GitHub → **Actions** → **Notifications** → **Run workflow** (tick "Dry run only" for a practice run).
  The log lists every notification it would send. The key is never printed.
- On your phone: Settings → Notifications → **Send a test notification**.

## iPhone

Notifications only reach an iPhone when Farm Ledger is on the Home Screen (iOS 16.4 or newer):
Safari → Share → **Add to Home Screen**, open it from the new icon, then Settings → Notifications →
**Turn on** → **Allow**. The app explains this on the screen.

## Good to know

- Each phone has its own settings: what to hear about, which ledgers, summary time, quiet hours.
- Workers and Vet / Advisers never see money amounts in notifications.
- A summary with nothing in it is not sent.
- GitHub can start hourly jobs late; the summary is still sent if the job runs within 3 hours of the
  chosen time. Late-job notes wait during quiet hours and go when they end.
- A job that is still late after 60 days is mentioned once more (old log entries are cleared then).
- Phones that are signed out, switched off or uninstalled are removed automatically.
- For developers: `node send.mjs --dry-run` prints what would be sent for the test farm
  (all six sectors) without touching Firebase. Tests: `tests/unit/notify-*.test.mjs`,
  `tests/e2e/notify-flows.test.mjs`.
