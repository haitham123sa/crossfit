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

## Mandatory sign-in

- H-FORGE now requires Firebase Email/Password registration or sign-in **before entering the app**.
- Signed-in sessions use Firebase browser-local persistence, allowing a returning authenticated user to re-enter without repeated login while their session remains valid.
- On sign-out, the barbell and PR screens are hidden and the member sign-in screen returns.
- Before registration, old guest records can be exported from the sign-in page with **Export existing device PRs**. After sign-in, they can be copied into the account via **Settings → Import device PRs**.
- If Firebase cannot initialize or an unauthenticated user is offline, the sign-in gate remains locked; access requires an authenticated session. This is a UI gate, **not a server-side authorization boundary**: Firestore rules protect cloud records.
- A returning signed-in session may work offline if its Firebase authentication libraries and session can load from device cache, but this has not been verified on a physical iPhone. Keep a JSON backup.

## Google sign-in (enabled November 26, 2026)

- **Google Authentication** is enabled in Firebase project `h-forge` alongside Email/Password Authentication.
- New users can tap **Continue with Google** on the H-FORGE welcome screen.
- Users with existing H-FORGE email/password accounts must sign in normally, then go to **Settings → Account & Cloud Sync → Link Google account**. Linking preserves their existing Firebase UID and therefore their PRs and personal preferences.
- Google identity collisions (for example, email already tied to a different method) are not automatically merged. Sign in with the existing method, then link Google from Settings.
- On GitHub Pages, Firebase's browser popup OAuth flow is used because redirect-based OAuth requires additional cross-origin storage/proxy setup for modern Safari. Mobile popup blockers can interfere; if this happens in the iPhone Home Screen app, open H-FORGE in Safari.
- Google sign-in uses the Firebase project's existing free **Spark** Authentication provider. Never upgrade to Identity Platform or Blaze solely for this feature.
- Test on iPhone and other devices before broad use.

## Facebook sign-in — integration built, provider setup required

**Current state:** Firebase project's Facebook provider is **not enabled** as of November 26, 2026. To avoid a broken sign-in, Facebook buttons are marked `setup pending` and disabled via `window.HFORGE_FACEBOOK_READY = false` in `firebase-config.js`.

- For the exact Meta Developer / Firebase Console setup and launch checklist, see [FACEBOOK_SETUP.md](./FACEBOOK_SETUP.md).
- The app code already supports Facebook popup sign-in and **Link Facebook account**, preserving the original Firebase UID and existing PRs.
- Enable the public switch only after the Meta app is live, Firebase Facebook provider enabled, and OAuth/authorized-domain settings have been verified.

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
