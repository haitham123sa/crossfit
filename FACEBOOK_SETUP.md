# H-FORGE Facebook Login Setup (no paid services)

**Current status: NOT ACTIVE.** As of November 26, 2026, the Firebase project `h-forge` uses the **Spark / no-billing** plan and has Email/Password and Google providers enabled. Facebook is **not configured** in Firebase, so H-FORGE intentionally shows a disabled "Facebook sign-in · setup pending" button. App-side popup sign-in and account linking code is ready.

## What the H-FORGE owner needs

1. Sign in to [Meta for Developers](https://developers.facebook.com/apps/) with a Facebook account. If Meta requires developer registration, complete it yourself. Never share your Facebook password here.
2. Create a developer app named **H-FORGE** with a suitable **Facebook Login (consumer / website)** use case. Meta's interface, required app details, and review process can vary.
3. Set website URL to **https://haitham123sa.github.io/crossfit/** and configure the exact app's public privacy policy and data-deletion instructions/URL if Meta requires them. Do **not** invent these URLs.
4. In **Facebook Login → Settings**, add this **Valid OAuth Redirect URI** (exactly, including HTTPS):
   `https://h-forge.firebaseapp.com/__/auth/handler`
   Include the authorized website domain `haitham123sa.github.io` in Meta's applicable app-domain settings.
5. Use Meta's dashboard to obtain the **App ID** and **App Secret**. The **App Secret is sensitive**. Enter it **only into Firebase Console**, not GitHub, not `firebase-config.js`, and not a chat message.
6. In [Firebase Authentication → Sign-in method](https://console.firebase.google.com/project/h-forge/authentication/providers), select **Facebook**, enter the Meta App ID/Secret, and enable it. Retain **Google** and **Email/Password** sign-in.
7. Confirm the Meta app is in the correct **Live** state and any required review or verification is complete for public users; otherwise only authorized Meta developers/testers may be able to sign in.
8. Complete a real Facebook login test in Safari/iPhone using an authorized test account, including a pre-existing user's **Link Facebook account** flow and verifying that the original PR history stays under the same Firebase UID.
9. Only **after** the above are verified, change **`window.HFORGE_FACEBOOK_READY = false;`** to **`true`** in `firebase-config.js`, then bump the config's query version and service-worker cache version in GitHub to refresh installed iPhone apps. This removes the disabled state and exposes the active linking control.

## Safety rules

- **Never** attach a billing account or upgrade Firebase to Blaze or Identity Platform. Stay on Spark, with quota-limited free usage.
- Never store **App Secret**, access tokens, passwords or other Meta secrets in public GitHub files.
- Use only basic sign-in; don't request Facebook friends, posts, birthdays or other unnecessary data.
- Do not automatically merge accounts by email. Existing users should log into their original H-FORGE account first and link Facebook from Settings; Firebase linkWithPopup preserves the UID.
- Do not delete the installed H-FORGE app or its browser data without exporting a backup first.
- Meta's app review / policy / privacy requirements and free-availability conditions can change. Verify them before launching publicly.

Official references:
- https://firebase.google.com/docs/auth/web/facebook-login
- https://firebase.google.com/docs/auth/web/account-linking
- https://developers.facebook.com/docs/facebook-login/
