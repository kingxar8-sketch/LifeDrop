# LifeDrop (web)

Single-file blood donor & request app: `index.html` (no build step).
Works two ways:
- **Device-only mode** (default): data lives in the browser. Nothing to set up.
- **Shared database mode**: Firebase Auth + Firestore, so every user sees the same requests and donors.

## Turn on the shared database (Firebase, free Spark plan)
1. https://console.firebase.google.com → **Add project**.
2. **Build → Authentication → Get started → enable Email/Password and Google** (Google needs a support email).
3. **Build → Firestore Database → Create database** (production mode).
4. Firestore → **Rules** tab → paste the contents of `firestore.rules` → **Publish**.
5. **Project settings → Your apps → Web (</>)** → register an app → copy the `firebaseConfig`.
6. In `index.html`, find `const FIREBASE_CONFIG={apiKey:"",...}` and paste your values
   (`apiKey`, `authDomain`, `projectId`, `appId`).
7. **Authentication → Settings → Authorized domains** → add your site domain
   (`<user>.github.io` and/or `<name>.onrender.com`).

The Firebase web `apiKey` is not a secret; access is controlled by the Firestore rules.

## Data layout
- `users/{uid}`    – private profile (owner only): name, phone, city, group, available, count, last, history
- `donors/{uid}`   – public donor card shown in Find Donor / Map (any signed-in user can read)
- `requests/{id}`  – blood requests (any signed-in user can read; only the author can edit/close)

## Deploy
**GitHub Pages:** put `index.html` at the repo root → Settings → Pages → Deploy from a branch → `main` / root.
**Render:** New → Static Site → connect the repo → build command empty, publish directory `.`.

## Privacy note
A donor's phone number is visible to every signed-in user (that is how people reach donors).
Add a consent line at sign-up or restrict visibility before a public launch.

## Screens
Login (country + Continue with Google, or email) · Home · Profile · Edit Profile (hide phone, availability, bio) ·
Settings (theme, country, search radius, FAQ, contact, share, privacy, delete account) · Notification Settings ·
Requests · Request Blood (3 steps) · Find Donor · Blood Map · Eligibility · Blood Guide.

## Notes on settings
- Theme mode, notification choices, country and radius are saved per device (`localStorage`).
- **Notifications** use the browser Notification API: they appear while the app is open or in a background tab.
  True background push (app closed) needs a service worker + Firebase Cloud Messaging + a Cloud Function.
- **Search Radius** and **Country** are stored but do not filter results yet (no GPS coordinates are collected).
- Set `CONTACT_EMAIL` in `index.html` to enable "Contact us" and "Rate us".
- "Delete Account" removes the profile, donor card and the user's requests, then the login.
  If Firebase asks for a recent login, sign out and back in and repeat.

## Google Map (in-app)

The Map page is embedded in the app. Nothing opens a new tab or window.

- **With a key:** set `GMAPS_KEY` in `index.html`. In Google Cloud, enable *Maps JavaScript API* and *Geocoding API*, then restrict the key to your site's HTTP referrers (e.g. `https://yourname.github.io/*`, `https://yourapp.onrender.com/*`). You get donor and request pins, an info window, a dark map theme, and a radius filter around your location.
- **Without a key:** the Map page uses an embedded Google Maps frame, so it still works in the page.
- **Hospitals:** the Home "Medical Services" tile and the Map "Hospitals" toggle show nearby hospitals inside the page.
- **Directions:** these open in an in-app pop-up and can start from your current location.

## Donation History and the 90-day rule

- **History page:** it shows a summary card, a 90-day rest tracker and a record list, with an Add Record sheet (date, hospital, address, type, notes) and delete.
- **90-day rule:** after a donation, the donor is hidden from **Find Donor** and the **Map** for 90 days from the donation date. They reappear automatically.
- **Cloud mode:** the donor's last donation date is saved in their public `donors/{uid}` card as `last`, so every user's list applies the same rule.
- **Backdated records:** a record older than 90 days does not hide the donor.

## Responsive layout

One file adapts to every screen:
- **Mobile (under 700px):** bottom navigation bar with the centre ❤ button.
- **Tablet (700px and up):** a wider centred app with the bottom bar and two-column card lists.
- **Desktop (1100px and up):** a left sidebar (Home, Map, Donors, Profile and a Request Blood button) that stays visible on every page, a wider content area, and two-column lists (three on very wide screens).
- **Dialogs:** the Add Donation sheet slides up on mobile and is a centred pop-up on larger screens.

## Install as a mobile app (PWA)

Upload **all** of these files together to GitHub Pages or Render (the site must be served over HTTPS):
`index.html`, `manifest.webmanifest`, `sw.js`, `icons/`, `firestore.rules` (the rules file is only for Firebase).

- **Android (Chrome):** open the site and tap *Install app* in the pop-up, or open Settings → *Install LifeDrop app*. The app gets its own icon and opens full-screen.
- **iPhone (Safari):** tap Share → *Add to Home Screen*.
- **Offline:** the app opens without internet and your data on the device stays available. Firebase, Maps and notifications need a connection.
- **Shortcuts:** long-press the icon on Android for *Request Blood* and *Find Donor*.
- **Updates:** when you upload a new `index.html`, the app picks it up the next time it opens online. If you ever need to force a refresh, change `lifedrop-v1` in `sw.js`.
- **A real APK:** after hosting the site, enter its URL at pwabuilder.com and choose Android to get an installable `.apk` or `.aab` for the Play Store.
