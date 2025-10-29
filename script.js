// ==== THEME HANDLING ====
document.addEventListener('DOMContentLoaded', function() {
    // Initialize theme with strict dark/light only
    let savedTheme = localStorage.getItem('theme');
    if (savedTheme !== 'dark' && savedTheme !== 'light') {
        savedTheme = 'dark';
        localStorage.setItem('theme', 'dark');
    }
    document.documentElement.dataset.theme = savedTheme;
});

// ==== DB MODULE (IndexedDB via idb) ====
/* global idb */
const DB = (() => {
  const DB_NAME = 'hrr-setlist-db';
  const DB_VERSION = 1; // bump when schema changes
  let _db;

  async function open() {
    if (_db) return _db;
    _db = await idb.openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('songs')) {
          const songs = db.createObjectStore('songs', { keyPath: 'id' });
          if (songs.createIndex) songs.createIndex('title', 'title', { unique: false });
        }
        if (!db.objectStoreNames.contains('setlists')) {
          const setlists = db.createObjectStore('setlists', { keyPath: 'id' });
          if (setlists.createIndex) setlists.createIndex('name', 'name', { unique: false });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta'); // for flags like 'migrated'
        }
      }
    });
    return _db;
  }

  async function getMeta(key) {
    const db = await open();
    return db.get('meta', key);
  }
  async function setMeta(key, val) {
    const db = await open();
    return db.put('meta', val, key);
  }

  // Songs
  async function getAllSongs() {
    const db = await open();
    return db.getAll('songs');
  }
  async function putSong(song) {
    const db = await open();
    return db.put('songs', song);
  }
  async function putSongs(songs) {
    const db = await open();
    const tx = db.transaction('songs', 'readwrite');
    for (const s of songs) await tx.store.put(s);
    await tx.done;
  }
  async function deleteSong(id) {
    const db = await open();
    return db.delete('songs', id);
  }
  async function clearSongs() {
    const db = await open();
    const tx = db.transaction('songs', 'readwrite');
    await tx.store.clear();
    await tx.done;
  }

  // Setlists
  async function getAllSetlists() {
    const db = await open();
    return db.getAll('setlists');
  }
  async function getSetlist(id) {
    const db = await open();
    return db.get('setlists', id);
  }
  async function putSetlist(setlist) {
    const db = await open();
    return db.put('setlists', setlist);
  }
  async function deleteSetlist(id) {
    const db = await open();
    return db.delete('setlists', id);
  }

  return {
    getMeta, setMeta,
    getAllSongs, putSong, putSongs, deleteSong, clearSongs,
    getAllSetlists, getSetlist, putSetlist, deleteSetlist,
  };
})();

// ==== SETLIST MANAGER MODULE 
function normalizeSetlistName(name) {
    return name.replace(/\.[^/.]+$/, '')  // Remove file extension
        .replace(/[_\-]+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase());
}

// ==== TOASTS ====
function showToast(message, type = 'success', timeout = 2500) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type} show`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, timeout);
}

function confirmDialog(message, onYes, onNo) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-content">
      <h2>Confirm</h2>
      <p>${message}</p>
      <div class="modal-actions">
        <button class="btn" id="confirm-yes">Yes</button>
        <button class="btn" id="confirm-no">No</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#confirm-yes').onclick = () => { modal.remove(); onYes && onYes(); };
  modal.querySelector('#confirm-no').onclick = () => { modal.remove(); onNo && onNo(); };
}

const SetlistsManager = (() => {
    let setlists = new Map();

    async function load() {
        try {
            const arr = await DB.getAllSetlists();
            const repaired = [];
            for (const obj of (arr || [])) {
                const fixed = { ...obj };
                // Repair missing or malformed fields from older local data
                if (!fixed || typeof fixed !== 'object') continue;
                if (!fixed.id) {
                    fixed.id = (Date.now().toString() + Math.random().toString(16).slice(2));
                    fixed.updatedAt = Date.now();
                    try { await DB.putSetlist(fixed); } catch {}
                }
                if (!Array.isArray(fixed.songs)) fixed.songs = [];
                repaired.push(fixed);
            }
            setlists = new Map(repaired.map(obj => [obj.id, obj]));
        } catch (error) {
            console.error('Failed loading setlists from DB', error);
            setlists = new Map();
        }
    }

    function save() { /* no-op; per-change writes to DB */ }

    function getAllSetlists() {
        return Array.from(setlists.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    function getSetlistById(id) {
        return setlists.get(id) || null;
    }

    function addSetlist(name, songIds = []) {
        const normalized = normalizeSetlistName(name);
        const existing = Array.from(setlists.values()).find(s => 
            s.name.toLowerCase() === normalized.toLowerCase()
        );
        let finalName = normalized;
        if (existing) {
            let counter = 1;
            while (Array.from(setlists.values()).find(s => 
                s.name.toLowerCase() === `${normalized} (${counter})`.toLowerCase()
            )) { counter++; }
            finalName = `${normalized} (${counter})`;
        }
        const setlist = {
            id: (Date.now().toString() + Math.random().toString(16).slice(2)), 
            name: finalName,
            songs: [...songIds],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        setlists.set(setlist.id, setlist);
        DB.putSetlist(setlist);
        return setlist;
    }

    function renameSetlist(id, newName) {
        const setlist = setlists.get(id);
        if (setlist) {
            const normalized = normalizeSetlistName(newName);
            const existing = Array.from(setlists.values()).find(s => 
                s.id !== id && s.name.toLowerCase() === normalized.toLowerCase()
            );
            if (existing) throw new Error(`A setlist named "${normalized}" already exists`);
            setlist.name = newName.trim();
            setlist.updatedAt = Date.now();
            DB.putSetlist(setlist);
            return setlist;
        }
        return null;
    }

    function duplicateSetlist(id) {
        const orig = getSetlistById(id);
        if (orig) return addSetlist(orig.name + ' Copy', orig.songs);
        return null;
    }

    function deleteSetlist(id) {
        const deleted = setlists.delete(id);
        if (deleted) DB.deleteSetlist(id);
        return deleted;
    }

    function updateSetlistSongs(id, songIds) {
        const setlist = setlists.get(id);
        if (setlist) {
            setlist.songs = [...songIds];
            setlist.updatedAt = Date.now();
            DB.putSetlist(setlist);
            return setlist;
        }
        return null;
    }

    function addSongToSetlist(setlistId, songId) {
        const setlist = setlists.get(setlistId);
        if (setlist && !setlist.songs.includes(songId)) {
            setlist.songs.push(songId);
            setlist.updatedAt = Date.now();
            DB.putSetlist(setlist);
            return setlist;
        }
        return null;
    }

    function removeSongFromSetlist(setlistId, songId) {
        const setlist = setlists.get(setlistId);
        if (setlist) {
            const index = setlist.songs.indexOf(songId);
            if (index > -1) {
                setlist.songs.splice(index, 1);
                setlist.updatedAt = Date.now();
                DB.putSetlist(setlist);
                return setlist;
            }
        }
        return null;
    }

    function moveSongInSetlist(setlistId, songId, direction) {
        const setlist = setlists.get(setlistId);
        if (!setlist) return null;
        const currentIndex = setlist.songs.indexOf(songId);
        if (currentIndex === -1) return null;
        const newIndex = currentIndex + direction;
        if (newIndex < 0 || newIndex >= setlist.songs.length) return null;
        [setlist.songs[currentIndex], setlist.songs[newIndex]] = 
        [setlist.songs[newIndex], setlist.songs[currentIndex]];
        setlist.updatedAt = Date.now();
        DB.putSetlist(setlist);
        return setlist;
    }

   function importSetlistFromText(name, text, allSongs) {
    // Normalize and trim setlist name
    const normalizedName = String(name||'').trim();
    if (!normalizedName) { showToast('Setlist name cannot be empty.', 'error'); return null; }

    // Helpers for OCR cleanup and normalization
    const cleanLine = (s) => String(s||'')
      .replace(/[\u2018\u2019\u201A\u2032\u00B4]/g, "'")
      .replace(/[\u201C\u201D\u2033]/g, '"')
      .replace(/[\u2013\u2014\u2212]/g, '-')
      .replace(/[\u2022\u2023\u25E6\u2043\u2219\u00B7]/g, '') // bullets/middots
      .replace(/^\s*[•*\-–—]\s*/, '') // leading bullets/dashes
      .replace(/^\s*\d+[\).\:\-]?\s*/, '') // leading numbering
      .replace(/\s{2,}/g, ' ')
      .trim();
    const normalize = (s) => cleanLine(s)
      .normalize('NFD')
      .replace(/\p{Diacritic}+/gu, '')
      .toLowerCase()
      .replace(/[“”‘’]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\b0\b/g, 'o')
      .replace(/\b1\b/g, 'l')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const isChordToken = (tok) => /^[A-G](#|b)?(maj|min|m|sus|add|dim|aug)?\d*(\/[A-G](#|b)?)?$/.test(tok);
    const isChordLine = (line) => {
      const toks = cleanLine(line).split(/\s+/).filter(Boolean);
      if (toks.length < 2 || toks.length > 8) return false;
      const chordCount = toks.filter(isChordToken).length;
      return chordCount >= Math.max(2, Math.ceil(toks.length * 0.6));
    };
    const isProbableTitle = (line) => {
      const t = cleanLine(line);
      if (!t) return false;
      if (t.length < 2 || t.length > 64) return false;
      const letters = (t.match(/[A-Za-z]/g)||[]).length;
      const digits = (t.match(/\d/g)||[]).length;
      const ratio = letters / Math.max(1, t.length);
      if (ratio < 0.35) return false;
      if (digits > letters) return false;
      if (isChordLine(t)) return false;
      return true;
    };

    // Build a search index with normalized titles alongside originals (no DB change)
    const indexed = (allSongs||[]).map(s => ({ item: s, title: s.title || '', _n: normalize(s.title||'') }));
    const fuse = new Fuse(indexed, {
        keys: [
          { name: 'title', weight: 0.65 },
          { name: '_n', weight: 0.35 }
        ],
        threshold: 0.45,
        includeScore: true,
        ignoreLocation: true,
        minMatchCharLength: 2,
        shouldSort: true,
    });

    // Split text into lines, filter likely titles, dedupe
    let lines = String(text||'').split(/\r?\n/)
      .map(cleanLine)
      .filter(Boolean)
      .filter(isProbableTitle);
    // Dedupe nearby duplicates
    const seen = new Set();
    lines = lines.filter(l => { const k = normalize(l); if (seen.has(k)) return false; seen.add(k); return true; });

    const songIds = [];
    const notFound = [];

    const tryMatch = (q) => {
      const results = fuse.search(q);
      if (!results.length) return null;
      const best = results[0];
      // Accept if reasonably close; calibrate using score and length
      if (best.score <= 0.5) return best.item.item.id;
      return null;
    };

    for (const line of lines) {
      // Try original, then normalized, then with common OCR digit->letter swaps
      const variants = [line, normalize(line), normalize(line).replace(/0/g,'o').replace(/1/g,'l').replace(/5/g,'s')];
      let matchedId = null;
      for (const v of variants) { matchedId = tryMatch(v); if (matchedId) break; }
      if (matchedId) songIds.push(matchedId); else notFound.push(line);
    }

    if (songIds.length === 0) { showToast('No matching songs found to import.', 'info'); return null; }

    // Add setlist with fuzzy matched songs
    let setlist;
    try {
        setlist = SetlistsManager.addSetlist(normalizedName, songIds);
    } catch (err) { showToast(err.message || 'Failed to create setlist.', 'error'); return null; }

    // Notify user of any missing songs
    if (notFound.length > 0) { showToast(`${notFound.length} titles not found.`, 'info', 3500); }

    return { setlist, imported: songIds.length, notFound };
}


    function exportSetlist(setlistId, allSongs, format = 'json') {
        const setlist = getSetlistById(setlistId);
        if (!setlist) return null;
        const songs = setlist.songs
            .map(songId => allSongs.find(s => s.id === songId))
            .filter(song => song !== undefined);
        switch (format) {
            case 'json':
                return JSON.stringify({ setlist, songs }, null, 2);
            case 'txt':
                return songs.map(song => song.title).join('\n');
            case 'csv':
                const header = 'Title,Lyrics\n';
                const rows = songs.map(song => 
                    `"${song.title.replace(/"/g, '""')}","${song.lyrics.replace(/"/g, '""')}"`
                ).join('\n');
                return header + rows;
            default:
                return null;
        }
    }

    // initial load triggered by app.init()

    return {
        getAllSetlists,
        getSetlistById,
        addSetlist,
        renameSetlist,
        duplicateSetlist,
        deleteSetlist,
        updateSetlistSongs,
        addSongToSetlist,
        removeSongFromSetlist,
        moveSongInSetlist,
        importSetlistFromText,
        exportSetlist,
        load,
        save,
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    async function migrateIfNeeded() {
        try {
            const migrated = await DB.getMeta('migrated');
            if (migrated === true) return;
            const songsRaw = localStorage.getItem('songs');
            const setlistsRaw = localStorage.getItem('setlists');
            const songs = songsRaw ? JSON.parse(songsRaw) : [];
            const setlists = setlistsRaw ? JSON.parse(setlistsRaw) : [];
            if (songs && songs.length) {
                await DB.putSongs(songs);
            }
            if (setlists && setlists.length) {
                for (const s of setlists) await DB.putSetlist(s);
            }
            localStorage.removeItem('songs');
            localStorage.removeItem('setlists');
            await DB.setMeta('migrated', true);
        } catch (e) {
            console.error('Migration failed', e);
        }
    }
  const app = {
        normalizeTitle(title) {
            let t = title.replace(/\.[^/.]+$/, '');
            t = t.replace(/[_\-]+/g, ' ');
            t = t.replace(/\s+/g, ' ').trim();
            t = t.replace(/([a-z])([A-Z])/g, '$1 $2');
            t = t.replace(/\w\S*/g, (w) =>
                w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
            );
            return t;
        },

        isDuplicateTitle(title) {
            const normalized = title.trim().toLowerCase();
            return this.songs.some(song => song.title.trim().toLowerCase() === normalized);
        },

        // DOM Elements
        navButtons: document.querySelectorAll('.nav-button'),
        tabs: document.querySelectorAll('.tab'),
        songList: document.getElementById('song-list'),
        addSongBtn: document.getElementById('add-song-btn'),
        deleteAllSongsBtn: document.getElementById('delete-all-songs-btn'),
        songModal: document.getElementById('song-modal'),
        songModalTitle: document.getElementById('song-modal-title'),
        saveSongBtn: document.getElementById('save-song-btn'),
        cancelSongBtn: document.getElementById('cancel-song-btn'),
        songTitleInput: document.getElementById('song-title-input'),
        songLyricsInput: document.getElementById('song-lyrics-input'),
        songSearchInput: document.getElementById('song-search-input'),
        songUploadInput: document.getElementById('song-upload-input'),
        setlistSelect: document.getElementById('setlist-select'),
        newSetlistBtn: document.getElementById('new-setlist-btn'),
        renameSetlistBtn: document.getElementById('rename-setlist-btn'),
        duplicateSetlistBtn: document.getElementById('duplicate-setlist-btn'),
        deleteSetlistBtn: document.getElementById('delete-setlist-btn'),
        availableSongsContainer: document.getElementById('available-songs'),
        currentSetlistSongsContainer: document.getElementById('current-setlist-songs'),
        currentSetlistTitle: document.getElementById('current-setlist-title'),
        setlistModal: document.getElementById('setlist-modal'),
        setlistModalTitle: document.getElementById('setlist-modal-title'),
        setlistNameInput: document.getElementById('setlist-name-input'),
        saveSetlistBtn: document.getElementById('save-setlist-btn'),
        cancelSetlistBtn: document.getElementById('cancel-setlist-btn'),
        performanceSetlistSelect: document.getElementById('performance-setlist-select'),
        performanceSongSearch: document.getElementById('performance-song-search'),
        startPerformanceBtn: document.getElementById('start-performance-btn'),
        performanceSongList: document.getElementById('performance-song-list'),

        // Tab Toolbars
        tabToolbars: {
            songs: `
                <input type="text" id="song-search-input" class="search-input" placeholder="Search songs...">
                <button id="song-voice-btn" class="icon-btn" title="Voice search"><i class="fas fa-microphone"></i></button>
                <div class="toolbar-buttons-group">
                    <label for="song-upload-input" class="btn" title="Upload"><i class="fas fa-upload"></i></label>
                    <button id="delete-all-songs-btn" class="btn danger" title="Delete All"><i class="fas fa-trash"></i></button>
                    <button id="add-song-btn" class="btn" title="Add Song"><i class="fas fa-plus"></i></button>
                </div>
                <input type="file" id="song-upload-input" multiple accept=".txt,.docx" class="hidden-file">
            `,
            setlists: `
                <select id="setlist-select" class="setlist-select"></select>
                <div class="toolbar-buttons-group">
                    <button id="new-setlist-btn" class="btn" title="New Setlist"><i class="fas fa-plus"></i></button>
                    <button id="rename-setlist-btn" class="btn" title="Rename"><i class="fas fa-pen"></i></button>
                    <button id="duplicate-setlist-btn" class="btn" title="Duplicate"><i class="fas fa-copy"></i></button>
                    <button id="delete-setlist-btn" class="btn danger" title="Delete"><i class="fas fa-trash"></i></button>
                    <button id="import-setlist-btn" class="btn" title="Import"><i class="fas fa-file-import"></i></button>
                    <button id="import-setlist-image-btn" class="btn" title="Import from Image (OCR)"><i class="fas fa-image"></i></button>
                    <button id="export-setlist-btn" class="btn" title="Export"><i class="fas fa-file-export"></i></button>
                </div>
                <input type="file" id="import-setlist-file" accept=".txt,.docx" class="hidden-file">
                <input type="file" id="import-setlist-image" accept="image/*" class="hidden-file">
            `,
            performance: `
                <select id="performance-setlist-select" class="setlist-select"></select>
                <input type="text" id="performance-song-search" class="search-input" placeholder="Find any song...">
                <button id="performance-voice-btn" class="icon-btn" title="Voice search"><i class="fas fa-microphone"></i></button>
                <button id="start-performance-btn" class="btn primary"><i class="fas fa-play"></i> Start</button>
            `
        },

        // State
        songs: [],
        currentSongId: null,
        currentSetlistId: null,
        performanceSetlistId: null,
        activeRecognition: null,
        modalMode: null,
        sortableSetlist: null,
        lastPerformance: null,

        // Render the toolbar for the given tab and attach event listeners
        renderToolbar(tab) {
            const toolbarDiv = document.getElementById('tab-toolbar');
            if (!toolbarDiv) {
                console.error('Tab toolbar element not found');
                return;
            }
            // Stop any active speech recognition when switching toolbars
            if (this.activeRecognition && typeof this.activeRecognition.stop === 'function') {
                try { this.activeRecognition.stop(); } catch {}
                this.activeRecognition = null;
            }
            toolbarDiv.innerHTML = this.tabToolbars[tab] || '';
            
            if (tab === 'setlists' || tab === 'performance') {
                this.setlistSelect = document.getElementById('setlist-select');
                this.performanceSetlistSelect = document.getElementById('performance-setlist-select');
            }

            if (tab === 'songs') {
                this.songSearchInput = document.getElementById('song-search-input');
                this.addSongBtn = document.getElementById('add-song-btn');
                this.deleteAllSongsBtn = document.getElementById('delete-all-songs-btn');
                this.songUploadInput = document.getElementById('song-upload-input');

                this.songSearchInput.addEventListener('input', () => this.renderSongs());
                const songVoiceBtn = document.getElementById('song-voice-btn');
                this.setupSpeechToText(this.songSearchInput, songVoiceBtn, () => this.renderSongs());
                this.addSongBtn.addEventListener('click', () => this.openSongModal());
                this.deleteAllSongsBtn.addEventListener('click', () => {
                    confirmDialog('Delete ALL songs? This cannot be undone!', async () => {
                        this.songs = [];
                        try { await DB.clearSongs(); } catch {}
                        await this.saveData();
                        this.renderSongs();
                        showToast('Deleted all songs.', 'success');
                    });
                });
                this.songUploadInput.addEventListener('change', (e) => this.handleFileUpload(e));
            } else if (tab === 'setlists') {
                this.setlistSelect = document.getElementById('setlist-select');
                this.newSetlistBtn = document.getElementById('new-setlist-btn');
                this.renameSetlistBtn = document.getElementById('rename-setlist-btn');
                this.duplicateSetlistBtn = document.getElementById('duplicate-setlist-btn');
                this.deleteSetlistBtn = document.getElementById('delete-setlist-btn');
                this.setlistSelect.addEventListener('change', (e) => this.handleSetlistSelectChange(e));
                this.newSetlistBtn.addEventListener('click', () => this.openSetlistModal());
                this.renameSetlistBtn.addEventListener('click', () => this.openSetlistModal('rename'));
                this.duplicateSetlistBtn.addEventListener('click', () => this.handleDuplicateSetlist());
                this.deleteSetlistBtn.addEventListener('click', () => this.handleDeleteSetlist());
                document.getElementById('import-setlist-btn').addEventListener('click', () => {
                    const m = document.getElementById('import-modal');
                    if (m) m.style.display = 'flex';
                });
                // OCR image import triggers hidden input
                document.getElementById('import-setlist-image-btn')?.addEventListener('click', () => {
                    document.getElementById('import-setlist-image')?.click();
                });
                document.getElementById('import-setlist-image')?.addEventListener('change', (e) => this.handleImportSetlistImage(e));
                document.getElementById('export-setlist-btn').addEventListener('click', () => {
                    const m = document.getElementById('export-modal');
                    if (m) m.style.display = 'flex';
                    this.updateExportFormatOptions();
                });
            } else if (tab === 'performance') {
                this.performanceSetlistSelect = document.getElementById('performance-setlist-select');
                this.performanceSongSearch = document.getElementById('performance-song-search');
                this.startPerformanceBtn = document.getElementById('start-performance-btn');
                this.performanceSetlistSelect.addEventListener('change', () => this.handlePerformanceSetlistChange());
                this.performanceSongSearch.addEventListener('input', () => this.handlePerformanceSongSearch());
                const perfVoiceBtn = document.getElementById('performance-voice-btn');
                this.setupSpeechToText(this.performanceSongSearch, perfVoiceBtn, () => this.handlePerformanceSongSearch());
                this.startPerformanceBtn.addEventListener('click', () => this.handleStartPerformance());
            }
        },

        async handleImportSetlistImage(event) {
            try {
                const input = event.target;
                const file = input?.files?.[0];
                if (!file) return;
                if (!window.Tesseract || !window.Tesseract.recognize) {
                    showToast('OCR not available (Tesseract failed to load).', 'error', 3500);
                    return;
                }
                showToast('Running OCR on image…', 'info', 2000);
                const tessBase = `${window.location.origin}/lib/tesseract`;
                // Proactively check headers; choose CDN first if local looks mis-served
                const hdr = await this.checkTesseractLangHeaders(tessBase);
                let data;
                // Prefer CDN lang first if local headers look wrong
                const attemptConfigs = (hdr && hdr.ok) ? [
                  { workerPath: `${tessBase}/worker.min.js`, corePath: `${tessBase}/tesseract-core-simd.wasm.js`, langPath: `${tessBase}` },
                  { workerPath: `${tessBase}/worker.min.js`, corePath: `${tessBase}/tesseract-core-simd.wasm.js`, langPath: 'https://tessdata.projectnaptha.com/4.0.0' }
                ] : [
                  { workerPath: `${tessBase}/worker.min.js`, corePath: `${tessBase}/tesseract-core-simd.wasm.js`, langPath: 'https://tessdata.projectnaptha.com/4.0.0' },
                  { workerPath: `${tessBase}/worker.min.js`, corePath: `${tessBase}/tesseract-core-simd.wasm.js`, langPath: `${tessBase}` }
                ];
                let lastErr;
                for (const cfg of attemptConfigs) {
                  try {
                    ({ data } = await Tesseract.recognize(file, 'eng', cfg));
                    lastErr = null;
                    break;
                  } catch (e) { lastErr = e; }
                }
                if (lastErr) throw lastErr;
                let text = (data && data.text) ? data.text : '';
                text = String(text).replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n');
                if (!text.trim()) { showToast('No text detected in image.', 'info'); return; }

                const suggested = this.normalizeTitle(file.name.replace(/\.[^.]+$/, '')) || 'New Setlist';
                const name = prompt('Name for this setlist:', suggested);
                if (!name) { showToast('Import cancelled.', 'info'); return; }

                const result = SetlistsManager.importSetlistFromText(name, text, this.songs);
                if (!result) return; // Import function shows its own toasts
                // Switch to new setlist
                this.currentSetlistId = result.setlist.id;
                await this.saveData();
                this.renderSetlists();
                showToast(`Imported ${result.imported} songs from image.`, 'success');
            } catch (e) {
                console.error('OCR import failed', e);
                showToast('Failed to import from image.', 'error');
            } finally {
                // Reset file input for subsequent imports
                const el = document.getElementById('import-setlist-image');
                if (el) el.value = '';
            }
        },

        // Verify headers for local eng.traineddata.gz to avoid OCR failures
        async checkTesseractLangHeaders(tessBase) {
            try {
                const url = `${tessBase}/eng.traineddata.gz`;
                const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
                if (!res.ok) return { ok: false, reason: 'not-ok' };
                const enc = (res.headers.get('content-encoding') || '').toLowerCase();
                const type = (res.headers.get('content-type') || '').toLowerCase();
                if (enc.includes('gzip')) {
                    console.warn('eng.traineddata.gz is served with Content-Encoding:gzip. Serve it without Content-Encoding.');
                    showToast('OCR note: fix eng.traineddata.gz headers (no Content-Encoding).', 'info', 4500);
                    return { ok: false, reason: 'encoded-gzip' };
                }
                if (type && (type.includes('text') || type.includes('html'))) {
                    console.warn('eng.traineddata.gz served with text/* Content-Type. Prefer application/octet-stream.');
                }
                return { ok: true };
            } catch (_) { return { ok: false, reason: 'head-failed' }; }
        },

        // Attach speech-to-text to an input + button pair
        setupSpeechToText(inputEl, btnEl, onChange) {
            if (!inputEl || !btnEl) return;
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SR) { btnEl.style.display = 'none'; return; }

            const recognition = new SR();
            recognition.lang = navigator.language || 'en-US';
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.maxAlternatives = 1;

            let finalTranscript = '';

            const setActive = (active) => {
                btnEl.classList.toggle('recording', !!active);
            };

            recognition.onstart = () => {
                this.activeRecognition = recognition;
                finalTranscript = '';
                setActive(true);
            };
            recognition.onerror = () => {
                setActive(false);
            };
            recognition.onend = () => {
                setActive(false);
                if (this.activeRecognition === recognition) this.activeRecognition = null;
            };
            recognition.onresult = (event) => {
                let interim = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const res = event.results[i];
                    if (res.isFinal) finalTranscript += res[0].transcript;
                    else interim += res[0].transcript;
                }
                const value = (finalTranscript || interim).trim();
                if (value) {
                    inputEl.value = value;
                    if (typeof onChange === 'function') onChange();
                    else inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                }
            };

            btnEl.addEventListener('click', () => {
                // Toggle recognition; ensure we stop other active instance
                if (this.activeRecognition && this.activeRecognition !== recognition) {
                    try { this.activeRecognition.stop(); } catch {}
                    this.activeRecognition = null;
                }
                try {
                    if (btnEl.classList.contains('recording')) recognition.stop();
                    else recognition.start();
                } catch (e) {
                    // Some browsers may throw if called too quickly
                }
            });
        },

        // Core App Initialization
        async init() {
            await migrateIfNeeded();
            this.loadData();
            this.renderToolbar('songs');
            this.setlistSelect = document.getElementById('setlist-select');
            this.performanceSetlistSelect = document.getElementById('performance-setlist-select');
            this.setupEventListeners();
            // Load from IDB
            try {
                this.songs = await DB.getAllSongs();
            } catch (e) {
                console.error('Failed to load songs from DB', e);
                this.songs = [];
            }
            await SetlistsManager.load();
            this.renderSongs();
            if (this.setlistSelect && this.performanceSetlistSelect) {
                this.renderSetlists();
            }

        },

        // Data Management
        loadData() {
            this.songs = JSON.parse(localStorage.getItem('songs')) || [];
            const theme = (localStorage.getItem('theme') === 'light') ? 'light' : 'dark';
            document.documentElement.dataset.theme = theme;
        },

        async saveData() {
            // Bulk write as a fallback for places still calling saveData
            try { await DB.putSongs(this.songs); } catch (e) { console.error('saveData failed', e); }
        },

        // Lyrics Management
        getAllLyrics() {
            return this.songs;
        },

        getLyricById(id) {
            return this.songs.find(song => song.id === id);
        },

        async addLyric(song) {
            this.songs.push(song);
            try { await DB.putSong(song); } catch (e) { console.error('putSong failed', e); }
            await this.saveData();
        },

        async removeLyric(id) {
            this.songs = this.songs.filter(song => song.id !== id);
            try { await DB.deleteSong(id); } catch (e) { console.error('deleteSong failed', e); }
            await this.saveData();
        },

        searchLyrics(query) {
            const q = String(query || '').trim();
            if (!q) return this.songs.slice();
            // Use Fuse.js for fuzzy search across title and lyrics
            try {
                const fuse = new Fuse(this.songs, {
                    keys: [
                        { name: 'title', weight: 0.75 },
                        { name: 'lyrics', weight: 0.25 }
                    ],
                    includeScore: true,
                    threshold: 0.35,
                    ignoreLocation: true,
                    minMatchCharLength: 2,
                });
                return fuse.search(q).map(r => r.item);
            } catch (e) {
                // Fallback to simple includes if Fuse isn't available
                const low = q.toLowerCase();
                return this.songs.filter(song =>
                    song.title.toLowerCase().includes(low) ||
                    (song.lyrics && song.lyrics.toLowerCase().includes(low))
                );
            }
        },

        renameLyric(id, newTitle) {
            const song = this.getLyricById(id);
            if (song) {
                song.title = newTitle;
                this.saveData();
            }
        },

        editLyric(id, newLyrics) {
            const song = this.getLyricById(id);
            if (song) {
                song.lyrics = newLyrics;
                this.saveData();
            }
        },

        // Event Listeners

        setupEventListeners() {
            this.navButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    this.tabs.forEach(tab => tab.classList.remove('active'));
                    this.navButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const tabName = btn.getAttribute('data-tab');
                    document.getElementById(tabName).classList.add('active');
                    this.renderToolbar(tabName);
                    if (tabName === 'songs') this.renderSongs();
                    if (tabName === 'setlists') this.renderSetlists();
                    if (tabName === 'performance') this.renderPerformanceTab();
                });
            });

            this.saveSongBtn.onclick = () => this.saveSong();
            this.cancelSongBtn.onclick = () => this.closeSongModal();
            this.saveSetlistBtn.addEventListener('click', () => this.saveSetlist());
            this.cancelSetlistBtn.addEventListener('click', () => this.closeSetlistModal());
            this.availableSongsContainer.addEventListener('click', (e) => this.handleAvailableSongsClick(e));
            this.currentSetlistSongsContainer.addEventListener('click', (e) => this.handleCurrentSetlistSongsClick(e));
            this.performanceSongList.addEventListener('click', (e) => this.handlePerformanceSongClick(e));
            // Add theme toggle button handler
            document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
                const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
                const next = current === 'dark' ? 'light' : 'dark';
                document.documentElement.dataset.theme = next;
                localStorage.setItem('theme', next);
            });

            // Export modal controls
            const exportModal = document.getElementById('export-modal');
            if (exportModal) {
                exportModal.addEventListener('click', (e)=>{ if (e.target === exportModal) exportModal.style.display='none'; });
                document.getElementById('export-cancel-btn')?.addEventListener('click', ()=> exportModal.style.display='none');
                document.querySelectorAll('input[name="export-what"]').forEach(r=> r.addEventListener('change', ()=> this.updateExportFormatOptions()));
                document.getElementById('export-download-btn')?.addEventListener('click', ()=> this.handleExportDownload());
            }

            // Import modal controls
            const importModal = document.getElementById('import-modal');
            if (importModal) {
                importModal.addEventListener('click', (e)=>{ if (e.target === importModal) importModal.style.display='none'; });
                document.getElementById('import-cancel-btn')?.addEventListener('click', ()=> importModal.style.display='none');
                document.getElementById('import-run-btn')?.addEventListener('click', ()=> this.handleImportRun());
                document.querySelectorAll('input[name="import-type"]').forEach(r=> r.addEventListener('change', ()=> this.updateImportOptionsVisibility()));
                this.updateImportOptionsVisibility();
            }
        },

        showEditChoice(id) {
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.style.display = 'flex';
            modal.innerHTML = `
              <div class="modal-content">
                <h2>Edit Options</h2>
                <div class="modal-actions">
                  <button class="btn" id="edit-quick">Quick Edit</button>
                  <button class="btn primary" id="edit-full">Full Editor</button>
                  <button class="btn" id="edit-cancel">Cancel</button>
                </div>
              </div>`;
            document.body.appendChild(modal);
            const close = ()=> modal.remove();
            modal.addEventListener('click', (e)=> { if (e.target === modal) close(); });
            modal.querySelector('#edit-quick').onclick = () => { close(); this.openSongModal(id); };
            modal.querySelector('#edit-full').onclick = () => { close(); window.location.href = `editor/editor.html?songId=${encodeURIComponent(id)}`; };
            modal.querySelector('#edit-cancel').onclick = () => close();
        },

        updateExportFormatOptions() {
            const what = (document.querySelector('input[name="export-what"]:checked')?.value)||'current';
            const options = document.getElementById('export-format-options');
            if (!options) return;
            if (what === 'everything') {
                options.innerHTML = '<label><input type="radio" name="export-format" value="json" checked> JSON (songs + setlists)</label> <label><input type="radio" name="export-format" value="json-songs"> LyricSmith Library (songs only)</label>';
            } else if (what === 'songs') {
                options.innerHTML = '<label><input type="radio" name="export-format" value="json" checked> JSON (array)</label> <label><input type="radio" name="export-format" value="json-lyricsmith"> LyricSmith JSON</label> <label><input type="radio" name="export-format" value="csv"> CSV</label> <label><input type="radio" name="export-format" value="txt"> TXT (one file)</label> <label><input type="radio" name="export-format" value="txt-separate"> TXT (separate files)</label> <label><input type="radio" name="export-format" value="pdf"> PDF</label>';
            } else {
                options.innerHTML = '<label><input type="radio" name="export-format" value="json" checked> JSON</label> <label><input type="radio" name="export-format" value="txt"> TXT list</label> <label><input type="radio" name="export-format" value="pdf"> PDF</label>';
            }
        },

        handleExportDownload() {
            const what = (document.querySelector('input[name="export-what"]:checked')?.value)||'current';
            const format = (document.querySelector('input[name="export-format"]:checked')?.value)||'json';
            try {
                if (what === 'everything') {
                    if (format === 'json-songs') {
                        const payload = { songs: this.songs };
                        this.downloadFile('lyricsmith-library.json', JSON.stringify(payload, null, 2), 'application/json');
                    } else {
                        const blob = this.exportEverything();
                        this.downloadFile('setlist-backup.json', blob, 'application/json');
                    }
                } else if (what === 'songs') {
                    if (format === 'pdf') {
                        this.exportSongsPDF();
                    } else if (format === 'txt-separate') {
                        this.exportSongsAsSeparateTxt();
                    } else {
                        const { content, mime, ext } = this.exportSongs({ format });
                        this.downloadFile(`songs.${ext}`, content, mime);
                    }
                } else {
                    if (format === 'pdf') {
                        this.exportSetlistsPDF({ which: what });
                    } else {
                        const { content, mime, ext, name } = this.exportSetlists({ which: what, format });
                        this.downloadFile(`${name}.${ext}`, content, mime);
                    }
                }
                showToast('Export ready.', 'success');
                const m = document.getElementById('export-modal'); if (m) m.style.display='none';
            } catch (e) {
                console.error(e); showToast('Export failed.', 'error');
            }
        },

        // Export songs to a print-friendly PDF with per-page autofit
        exportSongsPDF() {
            const songs = this.songs.slice();
            const escapeHTML = (s) => String(s||'')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');

            const htmlParts = [];
            htmlParts.push(`<!DOCTYPE html><html><head><meta charset="utf-8">`);
            htmlParts.push(`<title>Songs - PDF</title>`);
            htmlParts.push(`<style>
                @page { size: A4; margin: 0.75in; }
                html, body { height: 100%; }
                body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #000; }
                /* Fixed-height page area: page height minus margins */
                .song { page-break-after: always; display: flex; flex-direction: column; justify-content: flex-start; align-items: stretch; height: calc(100vh - 1.5in); box-sizing: border-box; padding: 0.75in; overflow: hidden; font-size: 14pt; text-align: left; }
                .song:last-child { page-break-after: auto; }
                h1 { font-weight: 700; margin: 0 0 0.6em; line-height: 1.15; }
                .lyrics { white-space: pre-wrap; line-height: 1.4; overflow-wrap: anywhere; hyphens: auto; }
                /* On screen, add some padding */
                @media screen { body { background:#f5f5f5; } .song { box-sizing: border-box; width: 8.27in; height: 11.69in; margin: 12px auto; background:#fff; border: 1px solid #ddd; padding: 0.75in; } }
            </style></head><body>`);
            for (const s of songs) {
                const title = escapeHTML(s.title || 'Untitled');
                const lyrics = escapeHTML(s.lyrics || '');
                htmlParts.push(`<section class="song"><h1>${title}</h1><div class="lyrics">${lyrics}</div></section>`);
            }
            // Inject improved autofit + auto-print logic
            htmlParts.push(`<script>
              (function(){
                function fits(page){
                  // small safety margin to avoid last-line cutoff
                  return page.scrollHeight <= page.clientHeight - 1;
                }
                function applySizes(page, tSize, lSize, lHeight){
                  const title = page.querySelector('h1');
                  const lyrics = page.querySelector('.lyrics');
                  if (title) title.style.fontSize = tSize + 'pt';
                  if (lyrics) { lyrics.style.fontSize = lSize + 'pt'; lyrics.style.lineHeight = lHeight; }
                  // reflow
                  void page.offsetHeight;
                }
                function fitPage(page){
                  const titleMin = 16;
                  let titleSize = 26; // start large
                  let lyricsLow = 9, lyricsHigh = 20;
                  let lyricsSize = lyricsHigh;
                  let lineHeight = 1.4;

                  applySizes(page, titleSize, lyricsSize, lineHeight);
                  // Shrink lyrics first via binary search
                  if (!fits(page)){
                    let low = lyricsLow, high = lyricsHigh;
                    for (let i=0; i<14; i++){
                      const mid = Math.floor((low + high) / 2);
                      applySizes(page, titleSize, mid, lineHeight);
                      if (fits(page)) { lyricsSize = mid; low = mid; }
                      else { high = mid - 1; }
                      if (high <= low) break;
                    }
                    applySizes(page, titleSize, lyricsSize, lineHeight);
                  }
                  // If still overflowing, start shrinking the title
                  while (!fits(page) && titleSize > titleMin){
                    titleSize -= 2;
                    applySizes(page, titleSize, lyricsSize, lineHeight);
                  }
                  // If still overflowing, tighten lyrics line-height a bit
                  if (!fits(page)){
                    lineHeight = 1.28;
                    applySizes(page, titleSize, lyricsSize, lineHeight);
                  }
                  // As a last resort, reduce internal padding slightly to gain space
                  if (!fits(page)){
                    page.style.padding = '0.6in';
                    void page.offsetHeight;
                  }
                }
                function fitAll(){
                  const pages = document.querySelectorAll('.song');
                  pages.forEach(p => {
                    // reset any inline styles
                    p.removeAttribute('style');
                    const t = p.querySelector('h1'); const l = p.querySelector('.lyrics');
                    if (t) t.removeAttribute('style'); if (l) l.removeAttribute('style');
                  });
                  requestAnimationFrame(() => {
                    pages.forEach(p => fitPage(p));
                    setTimeout(() => { try { window.focus(); window.print(); } catch(e){} }, 200);
                  });
                }
                if (document.readyState === 'complete') fitAll();
                else window.addEventListener('load', fitAll);
              })();
            </script>`);
            htmlParts.push(`</body></html>`);
            const html = htmlParts.join('');

            const win = window.open('', '_blank');
            if (!win) { alert('Popup blocked: allow popups to export PDF.'); return; }
            win.document.open();
            win.document.write(html);
            win.document.close();
            // Printing will be triggered by the injected script after autofit.
        },

        exportSongs({ format }) {
            const songs = this.songs.slice();
            if (format === 'json') return { content: JSON.stringify(songs, null, 2), mime: 'application/json', ext: 'json' };
            if (format === 'json-lyricsmith') {
                const payload = {
                    version: '1.0',
                    exportDate: new Date().toISOString(),
                    songCount: songs.length,
                    songs
                };
                return { content: JSON.stringify(payload, null, 2), mime: 'application/json', ext: 'json' };
            }
            if (format === 'csv') {
                const header = 'Title,Lyrics\n';
                const esc = (s)=> '"'+String(s||'').replace(/"/g,'""')+'"';
                const rows = songs.map(s=> `${esc(s.title)},${esc(s.lyrics)}`).join('\n');
                return { content: header+rows, mime: 'text/csv', ext: 'csv' };
            }
            // txt concatenation
            const txt = songs.map(s=> `${s.title}\n\n${s.lyrics}`).join('\n\n-----\n\n');
            return { content: txt, mime: 'text/plain', ext: 'txt' };
        },

        exportSetlists({ which, format }) {
            const all = SetlistsManager.getAllSetlists();
            const current = which === 'current' ? all.find(s=> s.id === this.currentSetlistId) : null;
            if (which === 'current' && !current) throw new Error('No setlist selected');
            const setlists = which === 'current' ? [current] : all;
            if (format === 'json') {
                const data = setlists.map(sl=> ({ setlist: sl, songs: sl.songs.map(id=> this.songs.find(s=> s.id===id)).filter(Boolean) }));
                const name = which === 'current' ? (current.name || 'setlist') : 'setlists';
                return { content: JSON.stringify(data, null, 2), mime: 'application/json', ext: 'json', name: name.replace(/\s+/g,'_') };
            }
            // txt list of titles
            const content = setlists.map(sl=> `# ${sl.name}\n` + sl.songs.map(id=> (this.songs.find(s=> s.id===id)?.title)||'').filter(Boolean).join('\n')).join('\n\n');
            const name = which === 'current' ? (current.name || 'setlist') : 'setlists';
            return { content, mime: 'text/plain', ext: 'txt', name: name.replace(/\s+/g,'_') };
        },

        exportEverything() {
            const setlists = SetlistsManager.getAllSetlists();
            const data = { songs: this.songs, setlists };
            return JSON.stringify(data, null, 2);
        },

        // Export songs as separate .txt files (bundled into a ZIP)
        exportSongsAsSeparateTxt() {
            const sanitizeFilename = (name) => {
                const base = String(name || 'Untitled').replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '_');
                return base.slice(0, 80) || 'song';
            };
            const encoder = new TextEncoder();
            const files = this.songs.map(s => {
                const title = s.title || 'Untitled';
                const text = `${title}\n\n${s.lyrics || ''}`;
                return { name: sanitizeFilename(title) + '.txt', bytes: encoder.encode(text) };
            });
            const blob = this._buildZipFromFiles(files);
            this.downloadFile('songs_txt_bundle.zip', blob, 'application/zip');
        },

        // Minimal ZIP builder (store mode, no compression)
        _buildZipFromFiles(files) {
            const makeUint8 = (len) => new Uint8Array(len);
            const writeU16 = (arr, off, val) => { arr[off] = val & 0xff; arr[off+1] = (val >>> 8) & 0xff; };
            const writeU32 = (arr, off, val) => { arr[off] = val & 0xff; arr[off+1] = (val >>> 8) & 0xff; arr[off+2] = (val >>> 16) & 0xff; arr[off+3] = (val >>> 24) & 0xff; };
            const dosDateTime = (d) => {
                const year = d.getFullYear();
                const month = d.getMonth() + 1; // 1-12
                const day = d.getDate();
                const hours = d.getHours();
                const minutes = d.getMinutes();
                const seconds = Math.floor(d.getSeconds() / 2);
                const dt = ((year - 1980) << 9) | (month << 5) | day;
                const tm = (hours << 11) | (minutes << 5) | seconds;
                return { dt, tm };
            };
            // CRC32 table
            const crcTable = (() => {
                const table = new Uint32Array(256);
                for (let n = 0; n < 256; n++) {
                    let c = n;
                    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
                    table[n] = c >>> 0;
                }
                return table;
            })();
            const crc32 = (bytes) => {
                let c = 0xffffffff;
                for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
                return (c ^ 0xffffffff) >>> 0;
            };

            const parts = [];
            const central = [];
            let offset = 0;
            const now = new Date();
            const { dt, tm } = dosDateTime(now);
            for (const f of files) {
                const nameBytes = new TextEncoder().encode(f.name);
                const data = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes);
                const crc = crc32(data);
                // Local file header
                const lf = makeUint8(30 + nameBytes.length);
                writeU32(lf, 0, 0x04034b50);
                writeU16(lf, 4, 20); // version needed
                writeU16(lf, 6, 0);  // flags
                writeU16(lf, 8, 0);  // compression (0=store)
                writeU16(lf, 10, tm);
                writeU16(lf, 12, dt);
                writeU32(lf, 14, crc);
                writeU32(lf, 18, data.length);
                writeU32(lf, 22, data.length);
                writeU16(lf, 26, nameBytes.length);
                writeU16(lf, 28, 0); // extra len
                lf.set(nameBytes, 30);
                parts.push(lf, data);
                const localOffset = offset;
                offset += lf.length + data.length;
                // Central directory header
                const cf = makeUint8(46 + nameBytes.length);
                writeU32(cf, 0, 0x02014b50);
                writeU16(cf, 4, 20); // version made by
                writeU16(cf, 6, 20); // version needed
                writeU16(cf, 8, 0);  // flags
                writeU16(cf, 10, 0); // compression
                writeU16(cf, 12, tm);
                writeU16(cf, 14, dt);
                writeU32(cf, 16, crc);
                writeU32(cf, 20, data.length);
                writeU32(cf, 24, data.length);
                writeU16(cf, 28, nameBytes.length);
                writeU16(cf, 30, 0); // extra len
                writeU16(cf, 32, 0); // comment len
                writeU16(cf, 34, 0); // disk number
                writeU16(cf, 36, 0); // internal attrs
                writeU32(cf, 38, 0); // external attrs
                writeU32(cf, 42, localOffset);
                cf.set(nameBytes, 46);
                central.push(cf);
            }
            const centralStart = offset;
            for (const c of central) { parts.push(c); offset += c.length; }
            const centralSize = offset - centralStart;
            // End of central directory
            const eocd = makeUint8(22);
            writeU32(eocd, 0, 0x06054b50);
            writeU16(eocd, 4, 0); // disk
            writeU16(eocd, 6, 0); // start disk
            writeU16(eocd, 8, files.length);
            writeU16(eocd, 10, files.length);
            writeU32(eocd, 12, centralSize);
            writeU32(eocd, 16, centralStart);
            writeU16(eocd, 20, 0); // comment len
            parts.push(eocd);
            return new Blob(parts, { type: 'application/zip' });
        },

        // Export current/all setlists to a print-friendly PDF with per-page autofit
        exportSetlistsPDF({ which }) {
            const all = SetlistsManager.getAllSetlists();
            const current = which === 'current' ? all.find(s=> s.id === this.currentSetlistId) : null;
            if (which === 'current' && !current) { alert('No setlist selected.'); return; }
            const setlists = which === 'current' ? [current] : all;

            const songsInOrder = [];
            for (const sl of setlists) {
                for (const id of sl.songs) {
                    const song = this.songs.find(s=> s.id === id);
                    if (song) songsInOrder.push(song);
                }
            }

            const escapeHTML = (s) => String(s||'')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');

            const htmlParts = [];
            htmlParts.push(`<!DOCTYPE html><html><head><meta charset="utf-8">`);
            const titleBase = which === 'current' ? (current?.name || 'Setlist') : 'All Setlists';
            htmlParts.push(`<title>${escapeHTML(titleBase)} - PDF</title>`);
            htmlParts.push(`<style>
                @page { size: A4; margin: 0.75in; }
                html, body { height: 100%; }
                body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #000; }
                .song { page-break-after: always; display: flex; flex-direction: column; justify-content: flex-start; align-items: stretch; height: calc(100vh - 1.5in); box-sizing: border-box; padding: 0.75in; overflow: hidden; font-size: 14pt; text-align: left; }
                .song:last-child { page-break-after: auto; }
                h1 { font-weight: 700; margin: 0 0 0.6em; line-height: 1.15; }
                .lyrics { white-space: pre-wrap; line-height: 1.4; overflow-wrap: anywhere; hyphens: auto; }
                @media screen { body { background:#f5f5f5; } .song { box-sizing: border-box; width: 8.27in; height: 11.69in; margin: 12px auto; background:#fff; border: 1px solid #ddd; padding: 0.75in; } }
            </style></head><body>`);
            for (const s of songsInOrder) {
                const title = escapeHTML(s.title || 'Untitled');
                const lyrics = escapeHTML(s.lyrics || '');
                htmlParts.push(`<section class="song"><h1>${title}</h1><div class="lyrics">${lyrics}</div></section>`);
            }
            htmlParts.push(`<script>
              (function(){
                function fits(page){
                  return page.scrollHeight <= page.clientHeight - 1;
                }
                function applySizes(page, tSize, lSize, lHeight){
                  const title = page.querySelector('h1');
                  const lyrics = page.querySelector('.lyrics');
                  if (title) title.style.fontSize = tSize + 'pt';
                  if (lyrics) { lyrics.style.fontSize = lSize + 'pt'; lyrics.style.lineHeight = lHeight; }
                  void page.offsetHeight;
                }
                function fitPage(page){
                  const titleMin = 16;
                  let titleSize = 26;
                  let lyricsLow = 9, lyricsHigh = 20;
                  let lyricsSize = lyricsHigh;
                  let lineHeight = 1.4;
                  applySizes(page, titleSize, lyricsSize, lineHeight);
                  if (!fits(page)){
                    let low = lyricsLow, high = lyricsHigh;
                    for (let i=0; i<14; i++){
                      const mid = Math.floor((low + high) / 2);
                      applySizes(page, titleSize, mid, lineHeight);
                      if (fits(page)) { lyricsSize = mid; low = mid; }
                      else { high = mid - 1; }
                      if (high <= low) break;
                    }
                    applySizes(page, titleSize, lyricsSize, lineHeight);
                  }
                  while (!fits(page) && titleSize > titleMin){
                    titleSize -= 2;
                    applySizes(page, titleSize, lyricsSize, lineHeight);
                  }
                  if (!fits(page)){
                    lineHeight = 1.28;
                    applySizes(page, titleSize, lyricsSize, lineHeight);
                  }
                  if (!fits(page)){
                    page.style.padding = '0.6in';
                    void page.offsetHeight;
                  }
                }
                function fitAll(){
                  const pages = document.querySelectorAll('.song');
                  pages.forEach(p => {
                    p.removeAttribute('style');
                    const t = p.querySelector('h1'); const l = p.querySelector('.lyrics');
                    if (t) t.removeAttribute('style'); if (l) l.removeAttribute('style');
                  });
                  requestAnimationFrame(() => {
                    pages.forEach(p => fitPage(p));
                    setTimeout(() => { try { window.focus(); window.print(); } catch(e){} }, 200);
                  });
                }
                if (document.readyState === 'complete') fitAll();
                else window.addEventListener('load', fitAll);
              })();
            </script>`);
            htmlParts.push(`</body></html>`);
            const html = htmlParts.join('');

            const win = window.open('', '_blank');
            if (!win) { alert('Popup blocked: allow popups to export PDF.'); return; }
            win.document.open();
            win.document.write(html);
            win.document.close();
            // Printing will be triggered by the injected script after autofit.
        },

        updateImportOptionsVisibility() {
            const type = (document.querySelector('input[name="import-type"]:checked')?.value)||'songs';
            const dup = document.getElementById('songs-dup-label');
            if (dup) dup.style.display = type === 'songs' ? 'block' : 'none';
        },

        async handleImportRun() {
            const type = (document.querySelector('input[name="import-type"]:checked')?.value)||'songs';
            const filesInput = document.getElementById('import-file-input');
            const files = filesInput?.files;
            if (!files || !files.length) { showToast('Choose file(s) to import', 'info'); return; }
            try {
                if (type === 'songs') {
                    const mode = document.getElementById('songs-dup-mode')?.value || 'skip';
                    const result = await this.importSongs(files, mode);
                    showToast(`Imported ${result.added} songs (${result.skipped} skipped).`, 'success');
                } else if (type === 'setlist') {
                    const result = await this.importSetlistFiles(files);
                    if (result && result.setlist) {
                        this.currentSetlistId = result.setlist.id;
                        this.renderSetlists();
                    }
                } else {
                    const result = await this.restoreFromJSON(files[0]);
                    if (result) {
                        this.songs = await DB.getAllSongs();
                        await SetlistsManager.load();
                        this.renderSongs();
                        this.renderSetlists();
                        showToast('Restore complete.', 'success');
                    }
                }
                const m = document.getElementById('import-modal'); if (m) m.style.display='none';
                filesInput.value = '';
            } catch (e) { console.error(e); showToast('Import failed.', 'error'); }
        },

        async importSongs(fileList, dupMode) {
            let added=0, skipped=0;
            const titleKey = (s)=> (s.title||'').trim().toLowerCase();
            const existing = new Map(this.songs.map(s=> [titleKey(s), 1]));
            const ensureUniqueTitle = (t)=>{
                if (dupMode === 'copy') {
                    let base=t, n=1; let cand=base;
                    while (existing.has(cand.trim().toLowerCase())) { n++; cand = `${base} (Copy ${n})`; }
                    return cand;
                }
                return t;
            };
            const addOne = async (song)=>{
                const key = titleKey(song);
                if (existing.has(key) && dupMode==='skip') { skipped++; return; }
                const title = ensureUniqueTitle(song.title||'Untitled');
                const s = { id: song.id || (Date.now().toString()+Math.random().toString(16).slice(2)), title, lyrics: song.lyrics||'' };
                this.songs.push(s); existing.set(title.trim().toLowerCase(),1); added++;
                await DB.putSong(s);
            };
            for (const file of fileList) {
                if (/\.json$/i.test(file.name)) {
                    const text = await file.text();
                    let parsed;
                    try { parsed = JSON.parse(text); } catch { parsed = null; }
                    if (!parsed) continue;
                    // Accept multiple formats:
                    // - Array of songs [{ title, lyrics, ... }]
                    // - Object with { songs: [...] } (e.g., LyricSmith export or full backups)
                    // - Object with { setlist, songs } or Array of such (import just the songs)
                    let songsToAdd = [];
                    if (Array.isArray(parsed)) {
                        // Could be an array of songs, or an array of { setlist, songs }
                        if (parsed.length && parsed[0] && typeof parsed[0] === 'object' && 'setlist' in parsed[0] && 'songs' in parsed[0]) {
                            for (const entry of parsed) { if (entry && Array.isArray(entry.songs)) songsToAdd.push(...entry.songs); }
                        } else {
                            songsToAdd = parsed;
                        }
                    } else if (parsed && typeof parsed === 'object') {
                        if (Array.isArray(parsed.songs)) {
                            songsToAdd = parsed.songs;
                        } else if (parsed.setlist && Array.isArray(parsed.songs)) {
                            songsToAdd = parsed.songs;
                        }
                    }
                    for (const s of songsToAdd) await addOne(s);
                } else if (/\.csv$/i.test(file.name)) {
                    const text = await file.text();
                    const rows = this.parseCSV(text);
                    for (let i=1;i<rows.length;i++){ const [Title, Lyrics] = rows[i]; if (!Title) continue; await addOne({ title: Title, lyrics: Lyrics||'' }); }
                } else if (/\.txt$/i.test(file.name)) {
                    const text = await file.text();
                    const title = this.normalizeTitle(file.name);
                    await addOne({ title, lyrics: text });
                } else if (/\.docx$/i.test(file.name)) {
                    const buf = await file.arrayBuffer();
                    const result = await mammoth.extractRawText({ arrayBuffer: buf });
                    const title = this.normalizeTitle(file.name);
                    await addOne({ title, lyrics: result.value });
                }
            }
            await this.saveData();
            this.renderSongs();
            return { added, skipped };
        },

        async importSetlistFiles(fileList) {
            const file = fileList[0]; if (!file) return null;
            if (/\.json$/i.test(file.name)) {
                const text = await file.text();
                const obj = JSON.parse(text);
                if (Array.isArray(obj)) {
                    // array of { setlist, songs }
                    let last=null;
                    for (const entry of obj) {
                        const { setlist, songs } = entry;
                        if (songs && songs.length) await this.mergeSongsByTitle(songs, 'skip');
                        last = SetlistsManager.addSetlist(setlist.name, (setlist.songs||[]).filter(Boolean));
                    }
                    return { setlist: last };
                } else if (obj && obj.setlist) {
                    if (obj.songs && obj.songs.length) await this.mergeSongsByTitle(obj.songs, 'skip');
                    const sl = SetlistsManager.addSetlist(obj.setlist.name, (obj.setlist.songs||[]).filter(Boolean));
                    return { setlist: sl };
                }
                return null;
            }
            // txt/docx flow with fuzzy matching
            if (/\.docx$/i.test(file.name)) {
                const buf = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer: buf });
                return finishImportSetlist(file.name.replace(/\.[^/.]+$/, ''), result.value);
            } else {
                const text = await file.text();
                return finishImportSetlist(file.name.replace(/\.[^/.]+$/, ''), text);
            }
        },

        async restoreFromJSON(file) {
            const text = await file.text();
            const obj = JSON.parse(text);
            if (!obj || (!Array.isArray(obj.songs) && !Array.isArray(obj.setlists))) return false;
            if (Array.isArray(obj.songs)) {
                await this.mergeSongsByTitle(obj.songs, 'skip');
            }
            if (Array.isArray(obj.setlists)) {
                for (const s of obj.setlists) {
                    // de-dup setlist names
                    let name = s.name?.trim() || 'Imported';
                    const existing = SetlistsManager.getAllSetlists().map(x=>x.name.toLowerCase());
                    let base=name, n=1; while (existing.includes(name.toLowerCase())) { name = `${base} (Imported ${n++})`; }
                    const sl = { id: s.id || (Date.now().toString()+Math.random().toString(16).slice(2)), name, songs: (s.songs||[]).filter(Boolean), createdAt: Date.now(), updatedAt: Date.now() };
                    await DB.putSetlist(sl);
                }
                await SetlistsManager.load();
            }
            return true;
        },

        async mergeSongsByTitle(incoming, dupMode) {
            const titleKey = (s)=> (s.title||'').trim().toLowerCase();
            const existing = new Map(this.songs.map(s=> [titleKey(s), s]));
            for (const s of incoming) {
                const k = titleKey(s);
                if (existing.has(k) && dupMode==='skip') continue;
                let title = s.title || 'Untitled';
                if (existing.has(k) && dupMode==='copy') {
                    let base=title, n=1; let cand=base;
                    while (existing.has(cand.trim().toLowerCase())) { n++; cand = `${base} (Copy ${n})`; }
                    title = cand;
                }
                const song = { id: s.id || (Date.now().toString()+Math.random().toString(16).slice(2)), title, lyrics: s.lyrics||'' };
                this.songs.push(song); existing.set(title.trim().toLowerCase(), song);
                await DB.putSong(song);
            }
            await this.saveData();
        },

        parseCSV(text) {
            const rows = [];
            let i=0, field='', row=[], inq=false; const push=()=>{ row.push(field); field=''; };
            while (i<text.length){
                const c=text[i++];
                if (inq){
                    if (c==='"'){ if (text[i]==='"'){ field+='"'; i++; } else { inq=false; } }
                    else field+=c;
                } else {
                    if (c===','){ push(); }
                    else if (c==='\n'){ push(); rows.push(row); row=[]; }
                    else if (c==='\r'){ /* ignore */ }
                    else if (c==='"'){ inq=true; }
                    else field+=c;
                }
            }
            push(); rows.push(row); return rows;
        },

        // Song UI and Actions
        renderSongs() {
            // Empty state when there are no songs in the DB
            if (!Array.isArray(this.songs) || this.songs.length === 0) {
                this.songList.innerHTML = `
                    <div class="empty-message">
                      <p>Add your first song to get started.</p>
                      <div style="display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:center;">
                        <button id="new-song-btn" class="btn primary"><i class="fas fa-plus"></i> New Song</button>
                        <button id="upload-hint-btn" class="btn"><i class="fas fa-upload"></i> Upload Songs (.txt, .docx)</button>
                      </div>
                    </div>
                `;
                // Wire the hint button to the hidden file input
                const hintBtn = document.getElementById('upload-hint-btn');
                if (hintBtn) {
                    hintBtn.addEventListener('click', () => {
                        document.getElementById('song-upload-input')?.click();
                    });
                }
                const newBtn = document.getElementById('new-song-btn');
                if (newBtn) {
                    newBtn.addEventListener('click', async () => {
                        try {
                            const id = Date.now().toString() + Math.random().toString(16).slice(2);
                            const song = { id, title: 'New Song', lyrics: '' };
                            await DB.putSong(song);
                            this.songs = await DB.getAllSongs();
                            window.location.href = `editor/editor.html?songId=${encodeURIComponent(id)}`;
                        } catch (e) { console.error('Failed to create new song', e); }
                    });
                }
                return;
            }

            const query = (this.songSearchInput?.value || '').trim();
            const filteredSongs = !query
                ? this.searchLyrics(query).sort((a, b) => a.title.localeCompare(b.title))
                : this.searchLyrics(query); // Keep Fuse relevance order when searching
            this.songList.innerHTML = filteredSongs.map(song => `
                <div class="song-item" data-id="${song.id}">
                    <span>${song.title}</span>
                    <div class="song-actions">
                        <button class="btn edit-song-btn" title="Edit"><i class="fas fa-pen"></i></button>
                        <button class="btn danger delete-song-btn" title="Delete"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `).join('');

            document.querySelectorAll('.edit-song-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.target.closest('.song-item').dataset.id;
                    this.showEditChoice(id);
                });
            });

            document.querySelectorAll('.delete-song-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.target.closest('.song-item').dataset.id;
                    this.deleteSong(id);
                });
            });
        },

        openSongModal(id = null) {
            this.currentSongId = id;
            if (id) {
                const song = this.getLyricById(id);
                this.songModalTitle.textContent = 'Edit Song';
                this.songTitleInput.value = song.title;
                this.songLyricsInput.value = song.lyrics;
            } else {
                this.songModalTitle.textContent = 'Add Song';
                this.songTitleInput.value = '';
                this.songLyricsInput.value = '';
            }
            this.songModal.style.display = 'block';
        },

        closeSongModal() {
            this.songModal.style.display = 'none';
        },

        async saveSong() {
            const title = this.normalizeTitle(this.songTitleInput.value.trim());
            const lyrics = this.songLyricsInput.value.trim();
            if (!title) return;
            if (this.currentSongId) {
                const song = this.songs.find(s => s.id === this.currentSongId);
                song.title = title;
                song.lyrics = lyrics;
                try { await DB.putSong(song); } catch (e) {}
            } else {
                if (this.isDuplicateTitle(title)) {
                    this.closeSongModal();
                    return;
                }
                const newSong = {
                    id: Date.now().toString(),
                    title,
                    lyrics,
                };
                this.songs.push(newSong);
                try { await DB.putSong(newSong); } catch (e) {}
            }
            await this.saveData();
            this.renderSongs();
            this.closeSongModal();
        },

        deleteSong(id) {
            const inSetlists = SetlistsManager.getAllSetlists().filter(s => s.songs.includes(id));
            const count = inSetlists.length;
            const msg = count ? `Delete this song and update ${count} setlist(s)?` : 'Delete this song?';
            confirmDialog(msg, async () => {
                await this.removeLyric(id);
                inSetlists.forEach(s => SetlistsManager.removeSongFromSetlist(s.id, id));
                this.renderSongs();
                this.renderSetlists();
                showToast(count ? `Deleted song and updated ${count} setlists.` : 'Deleted song.', 'success');
            });
        },

        async handleFileUpload(event) {
            const files = Array.from(event.target.files || []);
            if (!files.length) return;

            let imported = 0, skipped = 0, failed = 0;

            const readAsArrayBuffer = (file) => new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onerror = () => reject(new Error('read-failed'));
                r.onload = () => resolve(r.result);
                r.readAsArrayBuffer(file);
            });
            const readAsText = (file) => new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onerror = () => reject(new Error('read-failed'));
                r.onload = () => resolve(r.result);
                r.readAsText(file);
            });

            const tasks = files.map(async (file) => {
                try {
                    const title = this.normalizeTitle(file.name);
                    if (this.isDuplicateTitle(title)) { skipped++; return; }
                    let lyrics = '';
                    if (/\.docx$/i.test(file.name)) {
                        const buf = await readAsArrayBuffer(file);
                        const res = await mammoth.extractRawText({ arrayBuffer: buf });
                        lyrics = String(res?.value || '');
                    } else {
                        lyrics = String(await readAsText(file));
                    }
                    const s = { id: Date.now().toString() + Math.random().toString(16).slice(2), title, lyrics };
                    this.songs.push(s);
                    try { await DB.putSong(s); } catch {}
                    imported++;
                } catch (e) {
                    console.warn('Upload import failed for', file?.name, e);
                    failed++;
                }
            });

            await Promise.all(tasks);
            try { await this.saveData(); } catch {}
            this.renderSongs();

            // Reset input for subsequent imports
            event.target.value = '';

            const parts = [];
            if (imported) parts.push(`${imported} imported`);
            if (skipped) parts.push(`${skipped} skipped (duplicates)`);
            if (failed) parts.push(`${failed} failed`);
            const msg = parts.length ? `Upload complete: ${parts.join(', ')}.` : 'No files were imported.';
            showToast(msg, imported ? 'success' : 'info', 4000);
        },

        // Setlist Management
        renderSetlists() {
            const setlists = SetlistsManager.getAllSetlists();
            if (this.setlistSelect) {
                this.setlistSelect.innerHTML = '<option value="">Select a setlist...</option>';
            }
            if (this.performanceSetlistSelect) {
                const prev = this.performanceSetlistSelect.value || this.performanceSetlistId || '';
                this.performanceSetlistSelect.innerHTML = '<option value="">All Songs</option>';
                this.performanceSetlistSelect.dataset.prevValue = prev;
            }

            setlists.forEach(s => {
                if (this.setlistSelect) {
                    const opt = document.createElement('option');
                    opt.value = s.id;
                    opt.textContent = s.name;
                    this.setlistSelect.appendChild(opt);
                }
                if (this.performanceSetlistSelect) {
                    const perfOpt = document.createElement('option');
                    perfOpt.value = s.id || '';
                    perfOpt.textContent = s.name;
                    this.performanceSetlistSelect.appendChild(perfOpt);
                }
            });

            if (this.performanceSetlistSelect) {
                const restore = this.performanceSetlistSelect.dataset.prevValue || '';
                if (restore) this.performanceSetlistSelect.value = restore;
            }

            if (setlists.length && this.currentSetlistId) {
                if (this.setlistSelect) this.setlistSelect.value = this.currentSetlistId;
                this.renderSetlistSongs();
            } else if (setlists.length > 0) {
                this.currentSetlistId = setlists[0].id;
                if (this.setlistSelect) this.setlistSelect.value = this.currentSetlistId;
                this.renderSetlistSongs();
            } else {
                this.currentSetlistId = null;
                this.availableSongsContainer.innerHTML = '<p>No songs available</p>';
                this.currentSetlistSongsContainer.innerHTML = '<p>No setlist selected</p>';
                this.currentSetlistTitle.textContent = 'Current Setlist';
            }
        },

        renderSetlistSongs() {
            const setlist = SetlistsManager.getSetlistById(this.currentSetlistId);
            const allSongs = this.songs;

            if (!setlist) {
                this.availableSongsContainer.innerHTML = '<p>No setlist selected</p>';
                this.currentSetlistSongsContainer.innerHTML = '<p>No setlist selected</p>';
                return;
            }

            const availableSongs = allSongs
                .filter(s => !setlist.songs.includes(s.id))
                .sort((a, b) => a.title.localeCompare(b.title));
            this.availableSongsContainer.innerHTML = availableSongs.length > 0 
                ? availableSongs.map(s =>
                    `<div class="song-item" data-id="${s.id}">
                        <span>${s.title}</span>
                        <button class="btn add-to-setlist-btn" title="Add to Setlist"><i class="fas fa-arrow-right"></i></button>
                    </div>`
                ).join('')
                : '<p>All songs are in this setlist</p>';

            const setlistSongs = setlist.songs.map(id => allSongs.find(s => s.id === id)).filter(Boolean);
            this.currentSetlistSongsContainer.innerHTML = setlistSongs.length > 0
                ? setlistSongs.map(s =>
                    `<div class="song-item sortable-setlist-song" data-id="${s.id}">
                        <span class="drag-handle" title="Drag to reorder" style="cursor:grab;"><i class="fas fa-grip-vertical"></i></span>
                        <span class="song-title">${s.title}</span>
                        <div>
                            <button class="btn move-up-btn" title="Move Up"><i class="fas fa-arrow-up"></i></button>
                            <button class="btn move-down-btn" title="Move Down"><i class="fas fa-arrow-down"></i></button>
                            <button class="btn remove-from-setlist-btn" title="Remove from Setlist"><i class="fas fa-times"></i></button>
                        </div>
                    </div>`
                ).join('')
                : '<p>No songs in this setlist</p>';

            if (this.sortableSetlist) {
                this.sortableSetlist.destroy();
            }
            this.sortableSetlist = Sortable.create(this.currentSetlistSongsContainer, {
                animation: 150,
                handle: '.drag-handle',
                ghostClass: 'drag-ghost',
                delay: 0,
                touchStartThreshold: 2,
                onEnd: (evt) => {
                    const newOrder = Array.from(this.currentSetlistSongsContainer.querySelectorAll('.song-item')).map(item => item.dataset.id);
                    SetlistsManager.updateSetlistSongs(this.currentSetlistId, newOrder);
                    this.renderSetlistSongs();
                }
            });
        },

        openSetlistModal(mode = 'add') {
            this.modalMode = mode;
            if (mode === 'rename' && this.currentSetlistId) {
                const setlist = SetlistsManager.getSetlistById(this.currentSetlistId);
                this.setlistModalTitle.textContent = 'Rename Setlist';
                this.setlistNameInput.value = setlist?.name || '';
            } else {
                this.setlistModalTitle.textContent = 'New Setlist';
                this.setlistNameInput.value = '';
            }
            this.setlistModal.style.display = 'block';
            this.setlistNameInput.focus();
        },

        closeSetlistModal() {
            this.setlistModal.style.display = 'none';
            this.modalMode = null;
        },

        saveSetlist() {
            const name = this.setlistNameInput.value.trim();
            if (!name) {
                showToast('Please enter a setlist name', 'error');
                return;
            }

            try {
                if (this.modalMode === 'rename' && this.currentSetlistId) {
                    SetlistsManager.renameSetlist(this.currentSetlistId, name);
                } else {
                    const setlist = SetlistsManager.addSetlist(name, []);
                    this.currentSetlistId = setlist.id;
                }
            } catch (err) {
                showToast(err.message || 'Could not save setlist.', 'error');
                return;
            }
            this.renderSetlists();
            this.closeSetlistModal();
        },

        handleDuplicateSetlist() {
            if (!this.currentSetlistId) return;
            const newSetlist = SetlistsManager.duplicateSetlist(this.currentSetlistId);
            if (newSetlist) {
                this.currentSetlistId = newSetlist.id;
                this.renderSetlists();
            }
        },

        handleDeleteSetlist() {
            if (!this.currentSetlistId) return;
            confirmDialog('Delete this setlist?', () => {
                SetlistsManager.deleteSetlist(this.currentSetlistId);
                this.currentSetlistId = null;
                this.renderSetlists();
                showToast('Deleted setlist.', 'success');
            });
        },

        handleSetlistSelectChange(e) {
            this.currentSetlistId = e.target.value || null;
            this.renderSetlistSongs();
        },

        handleAvailableSongsClick(e) {
            if (!e.target.closest('.add-to-setlist-btn')) return;
            const songItem = e.target.closest('.song-item');
            if (!songItem || !this.currentSetlistId) return;
            const id = songItem.dataset.id;
            SetlistsManager.addSongToSetlist(this.currentSetlistId, id);
            this.renderSetlistSongs();
        },

        handleCurrentSetlistSongsClick(e) {
            const songItem = e.target.closest('.song-item');
            if (!songItem || !this.currentSetlistId) return;
            const id = songItem.dataset.id;
            if (e.target.closest('.remove-from-setlist-btn')) {
                SetlistsManager.removeSongFromSetlist(this.currentSetlistId, id);
                this.renderSetlistSongs();
            } else if (e.target.closest('.move-up-btn')) {
                SetlistsManager.moveSongInSetlist(this.currentSetlistId, id, -1);
                this.renderSetlistSongs();
            } else if (e.target.closest('.move-down-btn')) {
                SetlistsManager.moveSongInSetlist(this.currentSetlistId, id, 1);
                this.renderSetlistSongs();
            }
        },

        // Performance Mode
        renderPerformanceTab() {
            this.renderSetlists();
            this.handlePerformanceSetlistChange();
        },

        handlePerformanceSetlistChange() {
            this.performanceSetlistId = this.performanceSetlistSelect.value || null;
            this.renderPerformanceSongList();
        },

        handlePerformanceSongSearch() {
            this.renderPerformanceSongList();
        },

        renderPerformanceSongList() {
            let songs = [];
            const query = (this.performanceSongSearch?.value || '').trim();

            if (this.performanceSetlistId) {
                const setlist = SetlistsManager.getSetlistById(this.performanceSetlistId);
                if (setlist) {
                    songs = setlist.songs.map(id => this.songs.find(s => s.id === id)).filter(Boolean);
                }
            } else {
                songs = this.songs.slice();
            }

            if (query) {
                try {
                    const fuse = new Fuse(songs, {
                        keys: [
                            { name: 'title', weight: 0.85 },
                            { name: 'lyrics', weight: 0.15 }
                        ],
                        includeScore: true,
                        threshold: 0.35,
                        ignoreLocation: true,
                        minMatchCharLength: 2,
                    });
                    songs = fuse.search(query).map(r => r.item);
                } catch (e) {
                    const low = query.toLowerCase();
                    songs = songs.filter(song =>
                        song.title.toLowerCase().includes(low) ||
                        (song.lyrics && song.lyrics.toLowerCase().includes(low))
                    );
                }
            }

            // When showing "All Songs", present the list alphabetically by title if no query
            if (!this.performanceSetlistId && !query) {
                songs.sort((a, b) => a.title.localeCompare(b.title));
            }

            this.performanceSongList.innerHTML = songs.map(song => `
                <div class="song-item" data-id="${song.id}">
                    <span>${song.title}</span>
                    <button class="btn primary perform-song-btn" title="Perform This Song"><i class="fas fa-play"></i></button>
                </div>
            `).join('');
        },

        handlePerformanceSongClick(e) {
            if (!e.target.closest('.perform-song-btn')) return;
            const songItem = e.target.closest('.song-item');
            if (!songItem) return;
            const songId = songItem.dataset.id;
            this.startPerformanceWithSong(songId);
        },

        handleStartPerformance() {
            if (this.performanceSetlistId) {
                const setlist = SetlistsManager.getSetlistById(this.performanceSetlistId);
                if (setlist && setlist.songs.length > 0) {
                    this.startPerformanceWithSong(setlist.songs[0]);
                } else {
                    showToast('No songs in selected setlist', 'info');
                }
            } else {
                if (this.songs.length > 0) {
                    const firstId = this.songs
                        .slice()
                        .sort((a, b) => a.title.localeCompare(b.title))[0].id;
                    this.startPerformanceWithSong(firstId);
                } else {
                    showToast('No songs available', 'info');
                }
            }
        },

        startPerformanceWithSong(songId) {
            const params = new URLSearchParams();
            if (this.performanceSetlistId) {
                params.set('setlistId', this.performanceSetlistId);
                // Include a fallback list of IDs for local file environments
                const setlist = SetlistsManager.getSetlistById(this.performanceSetlistId);
                if (setlist && Array.isArray(setlist.songs) && setlist.songs.length) {
                    // Compact encode: comma-separated IDs
                    try { params.set('ids', setlist.songs.join(',')); } catch (_) {}
                }
            }
            params.set('songId', songId);
            window.location.href = `performance/performance.html?${params.toString()}`;
        },

 // Helper for downloading a file
        downloadFile(filename, content, mime = "text/plain") {
            const blob = new Blob([content], { type: mime });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            setTimeout(() => {
                URL.revokeObjectURL(link.href);
                document.body.removeChild(link);
            }, 150);
        }
    };

    app.init();

    function finishImportSetlist(name, text) {
        const result = SetlistsManager.importSetlistFromText(name, text, app.songs);
        if (result) {
            app.currentSetlistId = result.setlist.id;
            app.renderSetlists();
            const skipped = result.notFound.length;
            showToast(`Imported ${result.imported} songs${skipped ? ` (${skipped} not found)` : ''}.`, skipped ? 'info' : 'success');
        } else {
            showToast('Import failed.', 'error');
        }
    }
});
