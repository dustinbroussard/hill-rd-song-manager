# Hill Rd. Song Manager

A **modern, touch-friendly web app** for musicians to manage setlists and lyrics with zero clutter and maximum clarity. Designed for live band rehearsals, gigging, and on-stage performance. Fast, offline-first, and fully mobile/tablet-friendly.

---

## 🚀 Features

- **Local-first**: All data (songs, setlists, preferences) saved in your browser—no cloud required!
- **Batch song upload**: Drag in `.txt` or `.docx` lyric files to add your entire songbook in minutes.
- **Smart title normalization**: Cleans up messy file names into proper titles automatically.
- **Full setlist management**: Create, rename, duplicate, reorder, and delete setlists. Drag and drop songs to build your set.
- **Fuzzy setlist import**: Paste a setlist (with or without numbering) and the app matches titles to your song library—even if the spelling isn’t perfect.
- **Import from Image (OCR)**: Use a photo of a written/printed setlist and convert it via OCR with fuzzy matching.
- **Voice search**: Microphone button in search bars for speech-to-text search.
- **Quick search and filter**: Instantly search by song title or lyrics.
- **Performance Mode**: Beautiful fullscreen lyric display with swipe navigation, adjustable font size, theme toggle, and auto-scroll for hands-free performing.
- **Light/Dark themes**: AMOLED Dark (default) and Light. Toggle instantly—even during performance.
- **PWA support**: Install on your phone/tablet/desktop and use offline.
- **Export/Import**: Back up your setlists in `.json`, `.txt`, `.csv`, or print-friendly **PDF (auto-fit)**.
 - **New (Audit Enhancements)**:
   - Safer CSV export (handles missing lyrics), debounced search for smoother typing on large libraries, and global keyboard shortcuts:
     - `/` focuses the active search bar (Songs/Lyrics tab).
     - Ctrl/Cmd+E opens Export.
     - Ctrl/Cmd+N starts a new song (Songs tab).
   - Drag-to-reorder now degrades gracefully offline if SortableJS CDN is unavailable.

---

## 🛠️ Installation & Usage

### 1. **Quick Start (Web/PWA)**
- Open `index.html` in your browser, or serve the folder locally with `npx serve .` or any static server.
- For best offline/PWA behavior (service worker) and cross-page data access, use `http(s)` (e.g., `http://localhost`) rather than `file://`.
- Install the app on your device (Add to Home Screen) if desired.

### 2. **Add Your Songs**
- Click **Songs** tab.
- Drag-and-drop `.txt` or `.docx` files or use the **Upload** button.
- Each file is imported as a song (title auto-normalized).

### 3. **Build a Setlist**
- Go to the **Setlists** tab.
- Click **+** to create a new setlist.
- Drag songs from the left ("Available Songs") column to your setlist on the right.
- Reorder songs by drag-and-drop or use the up/down buttons.

### 4. **Performance Mode**
- Switch to the **Lyrics** tab.
- Pick a setlist (or show all songs).
- Tap a song or click **Start** to enter performance mode.
- In performance mode:
    - Swipe/arrow between songs
    - Adjust font size on the fly
    - Enable autoscroll for hands-free lyrics
    - Toggle dark/light themes for visibility

---

## 🧑‍🎤 Core Workflow

1. **Batch Import**: Add all your lyric files at once.
2. **Clean Titles**: No more "01_Crazy_Song_FINAL2.txt"—titles are cleaned up for you.
3. **Setlists**: Make, duplicate, and customize as many setlists as you need (by event, gig, etc.).
4. **Stage Mode**: Lyrics are fullscreen, high-contrast, and dead simple. Perfect for tablets.

---

## 📋 Features In Detail

### **Songs Tab**
- Upload, search, add, edit, or delete lyrics.
- Import via `.txt` or `.docx` files.
- Song titles are normalized on upload (removes numbers, underscores, weird capitalization).

### **Setlists Tab**
- Create new setlists or edit existing ones.
- Add/remove songs with a single click.
- Reorder with drag-and-drop.
- Import setlists from text files or pasted lists (smart matching to your songbook).
- Import setlists from an image (OCR): click the image button, pick a photo of the setlist, confirm the name, and fuzzy-match to your library.
- Export setlists as JSON, TXT, CSV, or PDF.

### JSON Compatibility
- Imports LyricSmith JSON exports directly:
  - Use Import → Restore (JSON backup) for LyricSmith library files (`{ songs: [...] }`).
  - Import Songs also accepts plain arrays of songs (`[ { title, lyrics, ... } ]`).
- Setlist JSON exports from this app can be imported into LyricSmith; it will import the song content.

### LyricSmith Library Export
- When exporting Songs, you can choose:
  - `JSON (array)`: `[ { title, lyrics, ... } ]` — also compatible with LyricSmith.
  - `LyricSmith JSON`: `{ version, exportDate, songCount, songs: [...] }` — matches LyricSmith’s default export shape.

### Everything Export
- Under Export → Everything, you can now pick:
  - `JSON (songs + setlists)`: Full backup for this app.
  - `LyricSmith Library (songs only)`: `{ songs: [...] }` for quick import into LyricSmith.

### **Performance (Lyrics) Tab**
- Pick a setlist and enter performance mode.
- Fullscreen, responsive, touch-optimized display.
- Font size controls (per-song memory).
- Autoscroll with customizable speed/delay.
- Quick theme toggle for any lighting condition.
- Fast navigation: next/previous song arrows or swipe.
- When "All Songs" is selected, the list is alphabetical; when a setlist is selected, song order matches the setlist.
- Running from `file://`? A local fallback passes the setlist song order to performance mode so it still respects your order.

### **Theming**
- Choose from AMOLED dark, Light, Blue, Red, and more.
- Theme toggle in the corner (persistent per device).

### **Offline First / PWA**
- Works fully offline.
- Installable as an app (Add to Home Screen).
- Data is stored in browser/IndexedDB (no server needed).
- Service worker auto-registers and pre-caches app assets with a cache-first fetch strategy, including OCR binaries (WASM/data).
- Note: service workers require `https` or `http://localhost`; `file://` won’t register a SW (the app still works, including OCR and setlist order fallback).

---

## 🧩 Dependencies

- [Fuse.js](https://fusejs.io/) (fuzzy song matching)
- [SortableJS](https://sortablejs.github.io/Sortable/) (drag-and-drop in setlists)
- [Mammoth.js](https://github.com/mwilliamson/mammoth.js) (parsing `.docx` lyrics)
- [Tesseract.js](https://github.com/naptha/tesseract.js) (OCR for image setlist import) — vendored locally
- FontAwesome (icons)
- Google Fonts (optional decorative font)

---

## 💾 Data & Privacy

- **No cloud storage, no account needed.** All data stays in your browser/device.
- Export and back up your data as you like.
- Delete data at any time with the "Delete All Songs" or "Delete Setlist" buttons.

---

## 🔥 Tips & Gotchas

- **Backup your data**: Export setlists/songs occasionally—especially before clearing browser data.
- **DOCX Upload**: Only text content is imported—formatting is ignored.
- **PDF export**: Uses the browser print dialog; each song auto-fits on one page.
- **Mic search**: Click the microphone icon in Songs or Lyrics search; not all browsers support Web Speech API.
- **App updates**: After code changes, refresh the service worker (Ctrl/Cmd+Shift+R) to pick up new assets.
- **Local vs hosted**: For best results, run via `http(s)` (localhost or GitHub Pages/Vercel). `file://` mode works, with setlist-order and OCR fallbacks.

---

## 🧑‍💻 Development & Contribution

This app is intentionally "no build, no framework, no backend."  
If you want to add features, just fork and hack away. Open issues or suggestions welcome!

Developer tooling added by the audit:
- ESLint + Prettier config and GitHub Actions CI for lint/format checks.
- Scripts: `npm run lint`, `npm run format`.

---

## 📜 License

ISC License (do what you want, just don’t sue).

---

## 🙏 Credits

- [Fuse.js](https://fusejs.io/) for fuzzy search
- [SortableJS](https://sortablejs.github.io/Sortable/) for drag-and-drop
- [Mammoth.js](https://github.com/mwilliamson/mammoth.js) for DOCX parsing
- FontAwesome & Google Fonts for visual polish

---

## 🎸 Built by musicians, for musicians. Enjoy your next gig!

---

## 📸 Screenshots

Add screenshots to make the README more visual. Suggested images and paths (place files under `assets/screenshots/`):

- Songs tab: `assets/screenshots/songs.png`
- Setlists tab (with OCR import button): `assets/screenshots/setlists.png`
- OCR import flow (image -> detected text prompt): `assets/screenshots/ocr-import.png`
- Lyrics tab (All Songs alphabetical): `assets/screenshots/lyrics-list.png`
- Performance mode (lyrics fullscreen, controls visible): `assets/screenshots/performance.png`
- PDF export preview (auto-fit per song): `assets/screenshots/pdf-export.png`

Example markdown (uncomment after adding files):

<!--
![Songs](assets/screenshots/songs.png)
![Setlists](assets/screenshots/setlists.png)
![OCR Import](assets/screenshots/ocr-import.png)
![Lyrics List](assets/screenshots/lyrics-list.png)
![Performance](assets/screenshots/performance.png)
![PDF Export](assets/screenshots/pdf-export.png)
-->

Tips for great screenshots:
- Use a consistent window size and theme (e.g., Dark) for cohesion.
- For mobile/tablet views, open DevTools device emulator and capture at typical sizes (e.g., iPad portrait).

---

## 🧰 Troubleshooting

- Service worker not updating changes
  - Hard refresh: Ctrl/Cmd+Shift+R.
  - Or DevTools → Application → Service Workers → Unregister, then reload.

- Offline/PWA not working
  - Service workers require https or http://localhost; `file://` will not register a SW.
  - Check DevTools → Application → Service Workers for registration and activation.

- Performance page shows all songs instead of setlist (local file mode)
  - Fixed by passing a fallback list of song IDs in the URL and reading them in performance mode.
  - Make sure you’re on the latest version and open via `index.html` before clicking Start.

- PDF export doesn’t open
  - The export uses the browser print dialog; allow pop‑ups for the site.
  - If the preview looks off, try printing to PDF and check margins are “Default” or “None”.

- OCR accuracy is poor
  - Use well-lit, straight-on photos; crop to the setlist area.
  - Handwriting varies: printed text recognizes better than cursive.
  - After OCR, you can edit the setlist name; fuzzy matching tolerates minor spelling differences.

- Mic button not working
  - Speech Recognition (Web Speech API) isn’t supported in all browsers. Chrome/Edge desktop and Android generally work; iOS support varies.
  - Ensure mic permissions are granted.

- Data missing after browser cleanup
  - Data is stored in IndexedDB. Clearing site data removes songs/setlists. Restore from your JSON backup via Import.

- Drag-and-drop reordering isn’t working
  - Ensure you’re interacting in the Setlists tab’s right column (Current Setlist). Some mobile browsers need a firm press before dragging.
