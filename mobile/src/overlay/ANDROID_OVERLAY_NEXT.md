# Android Overlay Next Build Step

This project now includes a JS bridge contract for Android overlay integration:

- `src/overlay/types.ts`
- `src/overlay/OverlayBridge.ts`

## Native module to implement

Create Android native module named `VeriphOverlay` with methods:

- `requestOverlayPermission()`
- `requestAccessibilityPermission()`
- `startOverlayService()`
- `stopOverlayService()`
- `getOverlayStatus()`
- `pushFrame(payload)`

## Runtime flow

1. Accessibility service extracts visible text from TikTok/Facebook/other app views.
2. Optional media audio capture generates speech transcript chunks.
3. Chunk text is sent to backend realtime endpoints.
4. Overlay displays percentages:
   - AI %
   - Authentic %
   - Trusted Source Match %
   - Current verdict

## Note

This requires Expo prebuild or bare React Native, not plain Expo Go.
