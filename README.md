# Hill Rd. Song Manager

## Progressive Web App

Hill Rd. Song Manager is a fully installable PWA with offline support powered by a service worker.

### Test installability

1. Serve the project over HTTPS (e.g. `npx http-server -p 8080`).
2. Open the site in Chrome and visit **Application → Manifest** in DevTools to verify install readiness.
3. Use the built in install banner or Chrome's install option to add the app to your device.

### Generate an Android APK with Bubblewrap

1. Install Bubblewrap globally: `npm i -g @bubblewrap/cli`.
2. Initialize: `bubblewrap init --manifest https://your-domain/manifest.webmanifest`.
3. Build the project: `bubblewrap build`.
4. Sign and install the generated APK on your device.

# lyrics-create-edit
# Hill Rd. Song Manager

## Voice Input (Speech-to-Text)

Hill Rd. Song Manager supports speech-to-text for both searching your library and dictating lyrics in the editor.

- Voice Search (Library)
  - Click the microphone button next to the search field.
  - Speak your query; results filter live as you talk.
  - If your browser doesn’t support speech recognition, a toast explains that voice input isn’t available.

- Voice Dictation (Editor)
  - Select a lyric line (click into the line so the caret is visible).
  - Click the microphone button in the editor header to start dictation.
  - The mic pulses while listening. Dictation inserts text into the selected line.
  - Commands during dictation:
    - “next line”, “new line”, “go next”, “line next” → move focus to the next line (creates a new line if needed).
    - “previous line”, “prev line”, “go back”, “line previous” → move focus to the previous line (creates one above if needed).
    - “stop dictation”, “stop listening”, “end dictation”, “cancel dictation”, “done dictation” → stop dictation.
  - The above command phrases are not inserted into your lyrics; they only control navigation.

Browser support
- Voice features use the Web Speech API (`SpeechRecognition`/`webkitSpeechRecognition`). These are supported in Chromium-based browsers and some versions of Safari. If not supported, the app will show a friendly toast.

## Processing Indicators & Notifications

- Button spinners appear on long-running actions like Normalize Library, Paste from Clipboard, Upload/Import, Export, and Hook Mill sync.
- A global busy overlay shows status for heavier operations (e.g., importing files, Hook Mill sync).
- Toast notifications communicate success, info, and errors; many toasts are accessible and dismissible, with a sticky mode for long messages.

## JSON Compatibility

- Import JSON from Hill Rd. Setlist Manager:
  - Accepts their library backup (`{ songs: [...], setlists: [...] }`), songs-only exports (array), and setlist exports (`{ setlist, songs }` or an array of such). All recognized songs are added to your library.
- Exported Hill Rd. Song Manager libraries (`lyricsmith-library-YYYY-MM-DD.json`) can be imported into Hill Rd. Setlist Manager via its Import → Restore (JSON backup) option.

### Duplicate Handling on Import
- When importing JSON, Hill Rd. Song Manager detects duplicate titles vs your current library and asks whether to skip duplicates or import copies. Copies are suffixed with “(Copy N)”.

## Development

- Linting: `npm run lint` (uses ESLint with `eslint:recommended`).
- Auto-fix: `npm run lint:fix` for safe, automatic fixes.
- CI: GitHub Actions runs lint on pushes and PRs.
