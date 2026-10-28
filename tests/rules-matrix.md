# Security rules matrix — Farm Ledger 10

Generated from `tests/rules/matrix.mjs` by `tests/rules/gen-matrix-md.mjs`. Do not edit by hand.

Each row is one action; each column is who tries it on ledger **L1** (a Beef ledger on farm F1).
Owner, Manager, Worker, Viewer (shown to users as "Vet / Adviser"), Accountant are members of L1.
Stranger is signed in but not a member. Anon is not signed in.

Checked by: `tests/rules/model.test.mjs` (JS model of the rules, runs every build) and
`tests/rules/emulator.test.mjs` (the real `firebase/firestore.rules` in the Firestore emulator;
ready to run, blocked in the build sandbox because the emulator download is not allowed).

| Action | Owner | Manager | Worker | Viewer | Accountant | Stranger | Anon |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Open the ledger `readLedger` | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny |
| List all ledgers `listLedgers` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Rename the ledger `renameLedger` | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Move the ledger to Recently deleted `binLedger` | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Change ledger type `changeType` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Delete the ledger document `deleteLedgerDoc` | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| See who is on the ledger `readMembers` | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny |
| Read an animal record `readAnimal` | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny |
| List animal records `listAnimals` | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny |
| Add an animal record `addAnimal` | ✅ allow | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Add a record stamped as someone else `addAnimalSpoof` | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Edit an animal record `editAnimal` | ✅ allow | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Rewrite who created a record `editCreatedBy` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Soft-delete (mark deleted) `softDelete` | ✅ allow | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Hard-delete a record `hardDelete` | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Delete one part (chunk) of a photo `deleteSubRecord` | ✅ allow | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Write a part (chunk) of a photo `writeSubRecord` | ✅ allow | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Photos: open a photo on an animal record `readPhoto` | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny |
| Photos: list record photos (where money == false) `listPhotos` | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny |
| Photos: list one animal's photos (parentId + money == false) `listPhotosForRecord` | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny |
| Photos: list every photo (no filter) `listAllPhotos` | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Photos: load the image of a record photo `readPhotoChunk` | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny |
| Money photos: open a photo on a money record `readMoneyPhoto` | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ✅ allow | ⛔ deny | ⛔ deny |
| Money photos: list (where money == true) `listMoneyPhotos` | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ✅ allow | ⛔ deny | ⛔ deny |
| Money photos: load the image `readMoneyPhotoChunk` | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ✅ allow | ⛔ deny | ⛔ deny |
| Photos: add a photo to an animal record (doc + image chunk) `addPhoto` | ✅ allow | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Money photos: add a photo to a money record `addMoneyPhoto` | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ✅ allow | ⛔ deny | ⛔ deny |
| Photos: add a money-record photo marked not-money `addPhotoWrongFlag` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Photos: attach to a members doc `addPhotoReservedParent` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Photos: image chunk over 750,000 characters `addPhotoBigChunk` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Photos: change a photo's caption `captionPhoto` | ✅ allow | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Photos: move a photo to a money record `movePhoto` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Photos: delete a record photo (chunk + doc) `deletePhoto` | ✅ allow | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Money photos: delete (chunk + doc) `deleteMoneyPhoto` | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ✅ allow | ⛔ deny | ⛔ deny |
| Read money records `readFinance` | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ✅ allow | ⛔ deny | ⛔ deny |
| Add a money record `addFinance` | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ✅ allow | ⛔ deny | ⛔ deny |
| Read keeper details (meta) `readMeta` | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny |
| Change keeper details (meta) `writeMeta` | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Mark silage used today (meta/silage) `writeOpsMeta` | ✅ allow | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Change ledger targets (meta/settings) `writeSettingsMeta` | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Create a farm space (type farm, farmId = its id) `createFarmSpace` | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ⛔ deny |
| Create a farm space pointing at another farm `createFarmSpaceBadId` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Open the farm space (F1) `readFarmSpace` | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Read whole-farm money (F1 finance) `farmFinance` | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Read Morning Board token (private) `readPrivate` | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Invite a worker `inviteWorker` | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Invite a manager `inviteManager` | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Invite an owner `inviteOwner` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Invite lasting 30 days `inviteLong` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| List all invites `listInvites` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Read an invite by its code `getInvite` | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow |
| See the ledger's open invites `readInviteIndex` | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Cancel an invite `revokeInvite` | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Change someone's role (worker to viewer) `changeRole` | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Make myself owner `promoteSelf` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Remove the worker `removeWorker` | ✅ allow | ⛔ deny | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Leave the ledger `leave` | ⛔ deny | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ⛔ deny | ⛔ deny |
| Open someone else's ledger `readOtherLedger` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| List someone else's records `readOtherRecords` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Find my ledgers (members group query uid==me) `myMemberships` | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ⛔ deny |
| Query everyone's memberships `allMemberships` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Read my profile `readOwnProfile` | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ⛔ deny |
| Read the owner's profile `readOwnerProfile` | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Notifications: save my phone (users/me/devices) `addMyDevice` | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ⛔ deny |
| Notifications: list my phones `listMyDevices` | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ⛔ deny |
| Notifications: read the owner's phone token `readOwnerDevice` | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Notifications: list the owner's phones `listOwnerDevices` | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Notifications: change the owner's phone `writeOwnerDevice` | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Notifications: remove the owner's phone `deleteOwnerDevice` | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Notifications: write my notification log `writeMyLog` | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ⛔ deny |
| Notifications: read the owner's notification log `readOwnerLog` | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Notifications: write the owner's notification log `writeOwnerLog` | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Notifications: query every phone (collection group) `devicesGroup` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Morning Board: read with token `boardGet` | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow |
| Morning Board: list `boardList` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Morning Board: write `boardWrite` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Read v9 farm document `v9Read` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Create a new ledger (+ my owner member doc) `createLedger` | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ✅ allow | ⛔ deny |
| Create a ledger owned by someone else `createLedgerForOther` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Create a ledger of unknown type `createBadType` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Add myself as owner of an existing ledger `hijackOwner` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Add myself as worker without an invite `joinNoInvite` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Accept a valid invite (worker) `acceptValid` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ✅ allow | ⛔ deny |
| Accept a worker invite as manager `acceptWrongRole` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Accept without marking the invite used `acceptNoMark` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Accept an expired invite `acceptExpired` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Accept an invite already used `acceptUsed` | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Hand the ledger to the manager `transferOwnership` | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |
| Final step of deleting a ledger (ledger + own member doc) `deleteLedgerFinal` | ✅ allow | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny | ⛔ deny |

Extra cases: Tom's UID may write `boardFeed/{token}` (Morning Board) ✅ and read the v9 `farms/` document ✅ (needed for migration).

Notes
- "Soft-delete" = setting `deleted: true`; records stay for inspections. Only owner and manager hard-delete.
- Records must be stamped `createdBy`/`updatedBy` = the writer, and `createdBy`/`createdAt` can never change.
- Accept-invite only works in one batch that creates the member doc with the invite's exact role **and** marks the invite used by the same person, before it expires.
- Photos have two kinds: on an ordinary record (`money: false`, seen by owner/manager/worker/viewer) and on a money record (`money: true`, seen by owner/manager/accountant). Whoever may write the parent may add or delete. Workers, viewers and accountants must filter lists on `money` (an unfiltered list is refused). Image chunks over 750,000 characters are refused.
- Ledger delete is allowed for the owner as a single write, but the app always deletes records → meta → private → invites → other members → ledger + own member doc (see `services/ledgers.js deleteLedger`), so nothing is orphaned.
