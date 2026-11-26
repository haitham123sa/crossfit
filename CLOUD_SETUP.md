# H-FORGE Cloud Sync — zero-billing setup

## Current state
The website includes optional account and cloud-sync code, but cloud is **off by default** until the owner connects a Firebase project. Existing guest PRs and calculations continue working locally.

## 1. Create a Firebase project on Spark
1. Open https://console.firebase.google.com/ and create a project called **H-FORGE**.
2. Keep it on **Spark (no-cost)**. **Never link billing, upgrade to Blaze, or enable paid features.**
3. Add a **Web app** under Project settings and copy its Firebase web configuration.
4. Keep hosting at https://haitham123sa.github.io/crossfit/ — no domain or new hosting is necessary.

## 2. Enable Authentication
1. Under Authentication → Sign-in method, enable **Email/Password** (not Phone/SMS).
2. Under Authentication → Settings → Authorized domains, add `haitham123sa.github.io`.

## 3. Create Firestore with private rules
1. Open Firestore Database and create the **default** database (Standard edition) under the free allowance.
2. Open the Firestore **Rules** tab, paste the contents of `firestore.rules`, and **Publish**.
3. Never leave Firestore in public/test mode. The included rules allow a user to access only their own `/profiles/<uid>` document.

## 4. Connect H-FORGE
Edit `firebase-config.js` in the GitHub repository and replace `null` with the exact Firebase **web app** config:

```javascript
window.HFORGE_FIREBASE_CONFIG = {
  apiKey: "YOUR_WEB_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  appId: "YOUR_WEB_APP_ID"
};
```

Use only public web configuration values, never a service-account credential or private key. Commit the change and increase the web asset version and service-worker cache version so iPhone Home Screen installations fetch the updated config.

## 5. Test before inviting users
- Create an account, record a PR, and check it loads on a second device after sign-in.
- Verify a second account cannot read or overwrite the first account's data.
- Test Guest PR import and the Export Backup button.
- Test offline edits and reconnecting. If another device changed the cloud copy, the app should ask which version to retain instead of silently overwriting it.
- Test both login and logout, and confirm local guest PRs are still there.
- Do not promise unlimited free cloud usage. Spark caps some services and access can stop at quota limits; this design should never silently switch to a paid tier.

## Current implementation notes
- One Firestore document per account; writes are delayed and version-checked to reduce free-tier usage and avoid silent overwrites.
- Each signed-in account gets its own locally cached data namespace. The original `crossfitToolsDataV1` guest data remains unchanged.
- The app requires owner action in Firebase Console: account creation, domain authorization, Firestore rules publication, and web config.
- No account/profile data has been migrated or uploaded yet.
- For a wider public launch, add privacy-policy and account-deletion flows, and review the security rules with live Firebase tests.

Reference: https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
Reference: https://firebase.google.com/docs/firestore/security/rules-conditions
Reference: https://firebase.google.com/docs/auth/web/start
