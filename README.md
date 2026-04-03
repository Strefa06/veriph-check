# VeriPH Check

A React Native-style mobile app + backend API that analyzes text/audio/video claims and cross-checks with trusted Philippine sources.

## Important Limits

- This is a decision-support tool, not a legal truth engine.
- Deepfake detection and misinformation checks are probabilistic.
- Results should be verified manually for high-stakes decisions.

## Platform Behavior (Social Apps)

- Android: can support floating overlay with special permission in a custom native build.
- iOS: no true system-wide overlay; use Share Extension flow.
- MVP here: analyze pasted text, transcribed speech, and video metadata through app/API.

## Project Structure

- `mobile/` Expo React Native app UI
- `backend/` Node.js API for scoring and trusted-source checks

## Quick Start

1. Install backend dependencies and run API:
   - `cd backend`
   - `npm install`
   - `npm run dev`
2. Install mobile dependencies and run app:
   - `cd ../mobile`
   - `npm install`
   - `npm run start`
3. Update API base URL in `mobile/src/api/client.ts` if needed.

## API

- `GET /api/health`
- `POST /api/analyze/text`
- `POST /api/analyze/audio`
- `POST /api/analyze/video`
- `POST /api/realtime/session` (start realtime stream)
- `POST /api/realtime/session/:id/chunk` (push transcript/audio/text chunk)
- `GET /api/realtime/session/:id` (get current rolling verdict)
- `DELETE /api/realtime/session/:id` (end session)

## Realtime Use

- App supports live chunk scoring (manual push or auto-push every 2.5s).
- For true cross-app detection while browsing social apps:
   - Android: needs native overlay + accessibility/media-audio pipeline.
   - iOS: use Share Extension flow; true global overlay is not allowed.

## Trusted PH Sources (initial)

Includes government and mainstream fact-based outlets in the Philippines (configured in backend data file).

- VERA Files
- Rappler
- Philippine Star
- Inquirer.net
- ABS-CBN News
- GMA News
- PressOne PH
- FactsFirstPH

## Output Percentages

The analyzer response includes overlay-friendly percentages:

- Confidence %
- Risk Score %
- AI Likelihood %
- Human/Authentic Likelihood %
- Trusted Source Match %
