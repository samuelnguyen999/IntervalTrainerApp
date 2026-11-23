# Interval Trainer

A portrait interval timer for iOS, Android, and web. One wheel shows the work and rest split. A 1:00 / 0:30 control changes the cycle length, and a row of set bars tracks how many sets are in the session.

The app uses Expo SDK 58 and React Native 0.88. It does not use Expo Router.

## Requirements

- Node.js 22.13 or newer on the 22 line, or 24.3 or newer on the 24 line
- npm

## Run it locally

```bash
npm install
npx expo start
```

Then open the project in a browser with `w`, or scan the QR code with a matching Expo Go build. The Apple App Store copy of Expo Go does not include SDK 58.

Useful scripts:

```bash
npx expo start
npx expo start --web
npx tsc --noEmit
npx expo-doctor
```

## Project layout

| Path | Role |
| --- | --- |
| `App.tsx` | Screen, start/pause/reset, cycle pill, set count |
| `timerEngine.ts` | Timestamp timer and work/rest math |
| `components/MinuteWheel.tsx` | Wheel, ticker, and draggable work/rest boundary |
| `components/SetSegments.tsx` | Set bars and the set picker |
| `assets/` | App icon, Android adaptive icon, splash image, favicon |
| `app.json` | App identity, icons, splash, bundle identifiers |
| `eas.json` | Preview and production build profiles |

`ios/` and `android/` are not in the repo. Expo generates them at build time from `app.json`.

## App identity

| Field | Value |
| --- | --- |
| Display name | Interval Trainer |
| Slug | `interval-trainer` |
| Version | 1.0.0 |
| iOS bundle identifier | `com.intervaltrainer.timer` |
| Android package | `com.intervaltrainer.timer` |
| iOS build number | 1 |
| Android version code | 1 |

`com.intervaltrainer.timer` is provisional. Confirm that it is available and owned by the Apple Developer account before the first App Store submission. This repo does not contain an Apple Team ID, an App Store Connect app ID, a privacy policy URL, or a support URL. Those are still required for submission.

The project is not linked to Expo Application Services yet. Run `npx eas-cli@latest init` when you are ready to attach an EAS project. Do not commit a guessed project ID.

## Builds

`eas.json` reads the version from `app.json`.

- `preview` — internal distribution. Android builds an APK.
- `production` — store build. The iOS build number and Android version code increment on each production build.

These commands are for later. They are not part of local setup, and they need an Expo account plus Apple and Google credentials.

```bash
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest build --platform android --profile preview
```

A production iOS build is installed through TestFlight or the App Store. Splash screen artwork should be checked on that build. Expo Go shows the app icon in place of the configured splash screen.

There is no development-client profile. Day-to-day work uses `npx expo start`.
