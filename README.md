# AuthentiScan

AuthentiScan is a Chrome extension that helps users detect AI-generated content, deepfakes, and verify viral posts. It provides tools for screen recording, screenshot capture, and text analysis, Content you choose to analyse is sent to the project's analysis service (a Supabase Edge Function) for AI analysis; when that service cannot be reached, local heuristics give a fallback result.

## Features
- Detect AI-generated text with confidence scores and explanatory reasons
- Detect deepfakes in video recordings or screenshots via AI frame analysis
- Analyze screenshots for AI-generated visual content
- Verify factual claims in text using verification and news cross‑check
- Record screen (full screen or custom area) for video deepfake detection
- Capture screenshots (full screen or custom area) for image analysis
- Context menu item to analyze selected text on any webpage
- View statistics: total scanned, AI detected, verified, flagged, videos analyzed, deepfakes detected
- Bookmark analyzed items for later reference
- Submit feedback on analysis results
- Adjust settings: auto‑scan posts, show badges, theme (light/dark)
- Reset all stored data
- Local fallback detection when AI‑service API is unavailable
- Select analysis focus (visuals, audio, face, colors, motion, text/font) for video recording

## Getting started
Prerequisites: Google Chrome or a Chromium‑based browser.

1. Ensure Chrome is installed on your system.
2. Download or clone this repository to your local machine.
3. Open Chrome and navigate to `chrome://extensions`.
4. Enable **Developer mode** using the toggle in the top‑right corner.
5. Click **Load unpacked** and select the folder containing the `manifest.json` file.
6. The AuthentiScan extension will appear in your toolbar and is ready to use.

## Project structure
- manifest.json – Extension manifest defining permissions, background service worker, content scripts, and UI.
- background.js – Service worker handling AI analysis, messaging, statistics, bookmarks, feedback, and settings.
- content.js – Injected script for screen recording, screenshot capture, area selection, and AI frame analysis.
- content.css – Styles for the content script UI (notifications, overlays, recording bar, result panels).
- popup.html – Popup UI with tabs for analysis, statistics, and settings.
- popup.js – Popup logic for tab switching, capture actions, text analysis, stats loading, settings, and theme.
- icon48.png, icon128.png – Extension icons displayed in the Chrome toolbar and extension page.

## License
AuthentiScan is released under the MIT License (see LICENSE).
