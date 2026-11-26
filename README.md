# RawRun — RAW / FRAME
New independent mobile app. Initial version 0.1.0 is a **local development milestone**, not a beta or App Store build.

## Implemented in source
Spanish interface, centralized design tokens, foreground GPS distance, active-time timer, pause/resume, local persistence and recovery, local history, and a prototype Raw Moment eligibility signal. No sample social accounts or fabricated running results. Leaving the foreground pauses the run intentionally until native background tracking is implemented.

## Run on a Mac
Use Node 22 LTS (SDK 54 needs Node 20.19.4 or newer), Xcode and CocoaPods.
```sh
npm install
npm test
npm run typecheck
npx expo install --check
npm run ios
```
For a physical iPhone, connect it, enable Developer Mode and select your Personal Team for signing if Xcode asks. After the first build use npm start. Keep package-lock.json under version control once generated.

## Backend
The new Supabase project has private profiles and runs with owner-only RLS. The client does not yet authenticate or synchronize. See docs/backend.md. Never use the old backend or put secrets in Git.

## Status
Camera, notification delivery, background GPS, true offline sync, authentication, friends, social feed, moderation, photo archive, sharing, streaks, challenges and English localization remain to be implemented and tested. Native compilation and on-device GPS accuracy not yet verified.
