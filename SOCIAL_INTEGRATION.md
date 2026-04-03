# Social App Integration Guide

## Can this work as an overlay on Facebook/TikTok?

Short answer: partially.

- Android: Yes, with `SYSTEM_ALERT_WINDOW` permission in a custom native build (not standard Expo Go).
- iOS: No true global overlay allowed by platform policy.

## Recommended Production UX

1. Android Overlay Mode
- Build with Expo prebuild or bare React Native.
- Request draw-over-other-apps permission.
- Show floating button that opens quick analyzer panel.
- Add `AccessibilityService` to capture on-screen text and context labels.
- Add Android 10+ audio playback capture path for allowed apps and run speech-to-text.
- Stream captured chunks to `/api/realtime/session/:id/chunk` every 1-3 seconds.

2. Share Extension Mode (Android + iOS)
- User taps Share on a post/link/video from Facebook/TikTok.
- Selects VeriPH Check.
- App receives URL/text, fetches transcript/metadata, sends to backend.
- Start realtime session on open, then push transcript segments as they arrive.

3. Manual Paste Fallback (already implemented)
- Copy caption/transcript/source links from social app.
- Paste in analyzer app.

## Realtime Detection Status In This MVP

- Implemented now:
  - rolling realtime session API
  - chunk-by-chunk analysis updates
  - live mode in app (manual chunk push + auto push)
  - overlay-style preview showing AI %, Authentic %, and Trusted Source Match %
- Not yet implemented:
  - true background cross-app capture service
  - native Android overlay/accessibility modules
  - iOS share extension code

## Accuracy and Trust Notes

- The current scoring model is heuristic + trusted source weighting.
- For stronger deepfake detection, add:
  - visual deepfake models (face artifacts, lip-sync mismatch)
  - voice cloning detection models (spectral anomaly classifiers)
  - ASR confidence checks from multiple engines
- Keep a human-review workflow for high-impact claims.

## Philippine Trusted Source Layer

Current initial list includes official PH government domains and selected established outlets/fact-checkers.

- officialgazette.gov.ph
- doh.gov.ph
- psa.gov.ph
- dost.gov.ph
- pna.gov.ph
- rappler.com (fact-check section)
- verafiles.org
- news.abs-cbn.com
- gmanetwork.com
- inquirer.net

You can update this list in backend data file and tune trust weights.
