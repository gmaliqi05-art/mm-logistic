# Native Push Notifications Setup (Android FCM + iOS APNs)

This document describes the one-time setup required to enable push
notifications in the native Android and iOS builds. The frontend client
code (Capacitor plugin + Supabase wiring) is already in place — what
remains is to provision provider credentials with Google and Apple and
plug them into Supabase secrets + the native Android/iOS projects.

The web push (browser / installed PWA) flow already works without any of
this; it uses VAPID and the standard Web Push API. Native setup is only
required for delivery when the app is **force-closed** or the phone is
**locked** outside a browser.

---

## What you need

- **Google account** with access to the Firebase console
  (https://console.firebase.google.com)
- **Apple Developer Program** membership ($99/yr) — for APNs Auth Key
- Owner access to this Supabase project (to set secrets)

---

## Android (FCM) — step by step

### 1. Create a Firebase project

1. Go to https://console.firebase.google.com and **Add project**.
2. Project name: `MM Logistic` (or anything).
3. **Disable** Google Analytics — not needed for push.
4. After creation, click the gear icon → **Project settings**.

### 2. Register the Android app

1. In Project settings → **General** → **Your apps** → **Add app** →
   Android icon.
2. **Android package name**: `eu.mmlogistic.app`
   (must match `capacitor.config.ts` → `appId`).
3. **App nickname**: `MM Logistic Android` (optional).
4. **Debug signing certificate SHA-1**: optional, skip for now.
5. Click **Register app**.
6. **Download `google-services.json`**.

### 3. Place the config file

Put the downloaded `google-services.json` inside the repo at:

```
android/app/google-services.json
```

(This is the standard location Capacitor's Android shell looks for.)

The Gradle Firebase plugin and the Capacitor push plugin will pick it up
automatically — no further code changes needed.

### 4. Generate the FCM service account JSON (for sending pushes)

1. In Project settings → **Service accounts** tab.
2. Choose **Firebase Admin SDK** → click **Generate new private key**.
3. Download the JSON file. Treat it as a secret.

### 5. Add the JSON to Supabase secrets

In a terminal that has the Supabase CLI installed:

```bash
supabase secrets set FCM_SERVICE_ACCOUNT_JSON="$(cat path/to/firebase-adminsdk.json)"
```

Or via the Supabase dashboard → **Project Settings** → **Edge Functions**
→ **Secrets** → add `FCM_SERVICE_ACCOUNT_JSON` and paste the JSON.

### 6. Verify

Run the diagnostic edge function from the super-admin panel
("Push Notifications" → "Platform" tab) or hit
`POST /functions/v1/notification-config-status` with a super-admin JWT.
You should see `android.configured: true`.

### 7. Sync and rebuild

```bash
npx cap sync android
npx cap open android
# In Android Studio, Build → Generate Signed Bundle/APK, upload to Play Store.
```

---

## iOS (APNs) — step by step

### 1. Apple Developer account setup

1. Sign in at https://developer.apple.com/account.
2. **Certificates, Identifiers & Profiles**.

### 2. Create an Identifier

1. **Identifiers** → **+** → App IDs → continue.
2. **Bundle ID** (Explicit): `eu.mmlogistic.app`
   (must match `capacitor.config.ts` → `appId`).
3. **Capabilities**: enable **Push Notifications**.
4. Continue → Register.

### 3. Generate an APNs Auth Key (.p8)

1. **Keys** tab → **+** to create a new key.
2. Key Name: `MM Logistic APNs Key`.
3. **Enable**: APNs (check the box).
4. Continue → Register → **Download** the `.p8` file. You can only
   download this **once**, so save it somewhere safe.
5. Note the **Key ID** (10 chars) on the same page.
6. Note your **Team ID**: top right of the Apple Developer portal.

### 4. Add the four iOS secrets to Supabase

```bash
supabase secrets set APNS_BUNDLE_ID="eu.mmlogistic.app"
supabase secrets set APNS_TEAM_ID="<your 10-char Team ID>"
supabase secrets set APNS_KEY_ID="<your 10-char Key ID>"
supabase secrets set APNS_KEY_P8="$(cat path/to/AuthKey_XXXXXXXXXX.p8)"
```

The `APNS_KEY_P8` value should include the BEGIN/END lines exactly as
they appear in the file.

### 5. Enable push in the iOS project

1. `npx cap sync ios`
2. `npx cap open ios` → opens Xcode.
3. Select the **App** target → **Signing & Capabilities** tab.
4. Click **+ Capability** → **Push Notifications**.
5. Click **+ Capability** again → **Background Modes** → check
   **Remote notifications**.
6. Make sure the bundle ID at the top matches `eu.mmlogistic.app` and
   you're signed in with the developer team.

### 6. Verify

Same diagnostic endpoint as Android:
`notification-config-status` should now report `ios.configured: true`.

### 7. Distribute

Archive → upload to App Store Connect → TestFlight → App Store review.

---

## How push delivery works end-to-end

```
                       +---------------------------+
                       |  dispatch-notification    |
                       |  (existing edge function) |
                       +-------------+-------------+
                                     |
              +----------------------+----------------------+
              |                      |                      |
              v                      v                      v
   +---------------------+  +-----------------+  +---------------------+
   | send-push-          |  | send-fcm-       |  | send-apns-          |
   | notification (web)  |  | notification    |  | notification        |
   | reads VAPID,        |  | reads FCM       |  | reads APNS_KEY_P8,  |
   | push to             |  | service account |  | signs JWT, POSTs    |
   | push_subscriptions  |  | JSON, OAuth2,   |  | to api.push.apple.  |
   |                     |  | POSTs to FCM v1 |  | com                 |
   +---------------------+  +-----------------+  +---------------------+
              |                      |                      |
              v                      v                      v
       Browser PushManager      Android FCM SDK       iOS APNs
       (Chrome, Edge, Safari)   (eu.mmlogistic.app)   (eu.mmlogistic.app)
              |                      |                      |
              v                      v                      v
       Service worker shows     Android OS              iOS OS
       notification             shows notification      shows notification
       even when tab closed     even when app closed    even when app closed
                                or phone locked         or phone locked
```

The `dispatch-notification` orchestrator already fans out across all
three channels in parallel — no per-platform code branch needed in the
business logic.

---

## Tokens & lifecycle

- **Web**: `push_subscriptions` row keyed by `(user_id, endpoint)`. Cleared
  in `signOut()` (PR #151).
- **Native**: `device_tokens` row keyed by `(user_id, token)`. The token is
  registered on first auth and on every cold start (FCM/APNs may rotate).
  On `signOut`, all of the user's `device_tokens` are flipped
  `is_active=false` so the next user on the same device doesn't inherit
  their push deliveries.

## Troubleshooting

- **No native token arrives** → check that
  `notification-config-status` reports the platform as configured. If
  the secrets are missing the registration listener silently no-ops.
- **iOS push doesn't fire** → confirm the Push Notifications capability
  is enabled in Xcode AND that `APNS_BUNDLE_ID` exactly matches the
  Xcode bundle ID.
- **Android push doesn't fire** → confirm `google-services.json` is in
  `android/app/` AND the bundle ID in the file matches `eu.mmlogistic.app`.
- **Push works in TestFlight but not Production** → APNs has separate
  sandbox vs production endpoints; `send-apns-notification` uses the
  production endpoint by default. To test against sandbox, point
  `APNS_HOST` to `api.sandbox.push.apple.com`.
