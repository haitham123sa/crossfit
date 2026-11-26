# H-FORGE Firebase Cloud Sync

## Current project (November 26, 2026)

- Firebase project **H-FORGE** — project ID `h-forge`.
- **Spark (free) plan**; no billing account linked.
- Email/Password Authentication **enabled**.
- Authorized sign-in domain: `haitham123sa.github.io`.
- Default Cloud Firestore **Standard** database created.
- Owner-only Firestore rules published on November 26, 2026. See [firestore.rules](./firestore.rules).
- Public web app settings in [firebase-config.js](./firebase-config.js).
- Web app hosted on GitHub Pages: https://haitham123sa.github.io/crossfit/

## Important zero-cost constraints

Do not add a billing account or upgrade to Blaze. Do not enable SMS/Phone auth, Cloud Functions, or paid APIs. The Spark plan can temporarily block services if usage limits are reached. If that happens, H-FORGE keeps locally saved data and offline calculations working; cloud sync can resume once allowed. Firebase and Google may change free-tier policies; indefinite free cloud service cannot be guaranteed.

## How accounts work

- **Settings → Account & Cloud Sync**: create an account or sign in using email and password.
- The original `crossfitToolsDataV1` guest profile is untouched when signing in.
- Signing in loads a separate account-scoped local profile and the owner's Firestore profile.
- If this device has guest PRs, use **Import device PRs** to copy them explicitly (no destructive migration).
- Signed-in changes save on the device immediately and sync when online.
- If the cloud record changed on another device, H-FORGE asks the user to choose a copy rather than silently overwriting an unsynced one.
- **Export Backup** remains available. Test restores before depending on cloud sync.
- A mobile-web account deletion and privacy management flow should be added before promoting the app broadly.

## Before inviting external users

1. Test email registration and login on a physical iPhone.
2. Test PR editing, deletion and sync across two devices.
3. Check that a different account cannot read another account's Firestore profile.
4. Test offline entry, reconnect, and conflict resolution.
5. Write and publish a privacy policy and a self-service account deletion process.
6. Monitor Firebase free quotas. Keep billing unlinked.

Official docs:
- https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- https://firebase.google.com/docs/auth/web/start
- https://firebase.google.com/docs/firestore/security/rules-conditions
