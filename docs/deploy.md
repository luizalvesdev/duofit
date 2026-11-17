# Deploy

| Target  | URL / output                                         | Command (from repo root)      |
| ------- | ---------------------------------------------------- | ----------------------------- |
| API     | https://duofit-api.luizalves.dev                     | `npm run deploy -w api`       |
| Web/PWA | https://duofit.luizalves.dev                         | `npm run deploy -w web`       |
| Android | `apps/web/android/app/build/outputs/apk/debug/app-debug.apk` | `npm run apk -w web`  |

The API and the dev environment share the same Neon database (`DATABASE_URL` in `apps/api/.dev.vars` is also the Worker secret).

## API

Cloudflare Worker `duofit-api`. Secrets (`DATABASE_URL`, `JWT_SECRET`) live in Cloudflare; update with `npx wrangler secret put <NAME>` from `apps/api`.

Password reset e-mails go out through Gmail SMTP (`apps/api/src/lib/mail.ts`) and need two more secrets: `SMTP_USER` (the Gmail address) and `SMTP_PASS` (a Gmail app password, which requires 2-Step Verification). Without them, `POST /auth/forgot` answers `503 email_unavailable`. Reset links point at `APP_URL` (a plain var in `wrangler.jsonc`; `.dev.vars` overrides it locally).

CORS origins are listed in `apps/api/src/index.ts`. A new web host must be added there and the API redeployed.

## Web / PWA (iPhone and browsers)

Cloudflare Worker `duofit` serving `apps/web/dist` as static assets with SPA fallback (`apps/web/wrangler.jsonc`). The production build reads `apps/web/.env.production` (`VITE_API_URL`).

The service worker auto-updates: installed home-screen apps pick up a deploy on next launch.

Install on iPhone: open the URL in **Safari** → Share → **Add to Home Screen**.

Safe areas: `viewport-fit=cover` is set, so the app draws under the status bar/notch. `body` gets `padding-top: env(safe-area-inset-top)` plus an opaque strip behind the status bar (`src/index.css`); full-screen overlays, sticky headers and bottom bars use `env(safe-area-inset-*)` themselves.

## Android (Capacitor)

The same bundle packaged with Capacitor; the native project lives in `apps/web/android/`.

- `vite build --mode android` reads `apps/web/.env.android` and disables the service worker (the bundle ships inside the APK).
- WebView origin is `https://localhost`, allowed in the API CORS config.
- Launcher icons and splash: "DF" monogram on `#09090b`.

Requirements: JDK 21 (`/usr/lib/jvm/java-21-openjdk`), Android SDK at `~/Android/Sdk` (`platform-tools`, `platforms;android-36`, `build-tools;36.0.0`), and `apps/web/android/local.properties` with `sdk.dir=...` (gitignored).

```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk ANDROID_HOME=~/Android/Sdk
npm run apk -w web
~/Android/Sdk/platform-tools/adb install -r apps/web/android/app/build/outputs/apk/debug/app-debug.apk
```

Or copy the APK to the phone and open it (allow "install unknown apps"). Reinstalling over the old version keeps data as long as the APK is signed with the same debug key (same machine).
