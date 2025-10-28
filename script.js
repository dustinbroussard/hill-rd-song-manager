document.addEventListener('DOMContentLoaded', () => {
  // Ensure touch devices trigger button actions
  document.addEventListener(
    'touchstart',
    (e) => {
      const btn = e.target.closest('button');
      if (btn) {
        e.preventDefault();
        btn.click();
      }
    },
    { passive: false }
  );
  // === THEME TOGGLE ===
  function getSystemPreferredTheme() {
    try { return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'default-dark' : 'default-light'; } catch { return 'default-dark'; }
  }
  function resolveEffectiveTheme(name) {
    if (!name) return 'default-dark';
    if (name === 'system') return getSystemPreferredTheme();
    if (name === 'dark') return 'default-dark';
    if (name === 'light') return 'default-light';
    return name;
  }
  let savedTheme = localStorage.getItem('theme') || 'default-dark';
  const effective = resolveEffectiveTheme(savedTheme);
  localStorage.setItem('theme', savedTheme);
  document.documentElement.dataset.theme = effective;
  // Live-update on system theme change when in System mode
  try {
    const mm = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (mm && typeof mm.addEventListener === 'function') {
      mm.addEventListener('change', () => {
        const t = localStorage.getItem('theme') || 'default-dark';
        if (t === 'system') applyTheme('system');
      });
    }
  } catch {}

  function setThemeColorMeta(theme) {
    try {
      const meta = document.querySelector('meta[name="theme-color"]') || (function(){
        const m = document.createElement('meta');
        m.name = 'theme-color';
        document.head.appendChild(m);
        return m;
      })();
      const isDark = /dark/i.test(String(theme||''));
      meta.setAttribute('content', isDark ? '#000000' : '#ffffff');
    } catch {}
  }
  setThemeColorMeta(effective);

  function applyTheme(name) {
    const actual = resolveEffectiveTheme(name);
    document.documentElement.dataset.theme = actual;
    localStorage.setItem('theme', name);
    setThemeColorMeta(actual);
    try { const sel = document.getElementById('theme-select'); if (sel) sel.value = name; } catch {}
    try { ClipboardManager.showToast(`Theme: ${name === 'system' ? `System (${actual})` : name}`, 'info'); } catch {}
  }

  function attachThemeToggle() {
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    themeToggleBtn?.addEventListener('click', () => {
      const stored = localStorage.getItem('theme') || 'default-dark';
      if (stored === 'system') {
        // Toggle away from system to explicit opposite of current effective
        const cur = resolveEffectiveTheme('system');
        applyTheme(/dark/i.test(cur) ? 'default-light' : 'default-dark');
        return;
      }
      const cur = resolveEffectiveTheme(stored);
      const next = /dark/i.test(cur) ? cur.replace(/dark/i,'light') : cur.replace(/light/i,'dark');
      applyTheme(next || (cur.includes('dark') ? 'default-light' : 'default-dark'));
    });
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
      themeSelect.value = savedTheme;
      themeSelect.addEventListener('change', (e)=> applyTheme(e.target.value));
    }
  }

  // Settings menu popover
  function attachSettingsMenu() {
    const btn = document.getElementById('settings-btn');
    const overlay = document.getElementById('settings-menu');
    if (!btn || !overlay) return;
    const closeMenu = () => {
      if (overlay.hidden) return;
      btn.setAttribute('aria-expanded', 'false');
      overlay.hidden = true;
      try { document.body.classList.remove('no-scroll'); } catch {}
    };
    const openMenu = () => {
      btn.setAttribute('aria-expanded', 'true');
      overlay.hidden = false;
      try { document.body.classList.add('no-scroll'); } catch {}
    };
    const toggleMenu = () => { if (overlay.hidden) openMenu(); else closeMenu(); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('.modal-close-x')) closeMenu();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  }

  // Global busy overlay helpers
  function showGlobalBusy(text = 'Working…') {
    try {
      const overlay = document.getElementById('busy-overlay');
      const label = document.getElementById('busy-text');
      if (!overlay || !label) return;
      label.textContent = text;
      overlay.hidden = false;
      overlay.classList.add('show');
    } catch {}
  }
  function hideGlobalBusy() {
    try {
      const overlay = document.getElementById('busy-overlay');
      if (!overlay) return;
      overlay.classList.remove('show');
      overlay.hidden = true;
    } catch {}
  }
  attachThemeToggle();
  attachSettingsMenu();

  // === HOOK MILL INTEGRATION ===
  function attachHookMillButton() {
    const btn = document.getElementById('hookmill-btn');
    if (!btn) return;

    btn.addEventListener('click', async (e) => {
      // Quick open shortcut: Shift or Meta key
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        window.open('hook-mill/index.html', '_blank');
        return;
      }

      const choice = (prompt('Hook Mill: type "open" to open, "starred" to sync starred, or "all" to sync all.', 'starred') || '').trim().toLowerCase();
      if (choice === 'open') {
        window.open('hook-mill/index.html', '_blank');
        return;
      }
      if (choice === 'all' || choice === 'starred' || choice === '') {
        const starredOnly = choice !== 'all';
        btn.classList.add('loading');
        try {
          await app.syncHookMill(starredOnly);
        } finally {
          btn.classList.remove('loading');
        }
      }
    });
  }

  // Open Hook Mill IndexedDB, fall back to localStorage mirror if needed
  async function getHookMillItems() {
    const fromLocal = () => {
      const items = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('HM_LIB_') && k !== 'HM_LIB_') {
            const raw = localStorage.getItem(k);
            if (!raw) continue;
            try { items.push(JSON.parse(raw)); } catch {}
          }
        }
      } catch {}
      return items;
    };

    try {
      if (!('indexedDB' in window)) return fromLocal();
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('hook-mill', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      if (!db) return fromLocal();
      const items = await new Promise((resolve) => {
        try {
          const tx = db.transaction('library', 'readonly');
          const store = tx.objectStore('library');
          const all = store.getAll();
          all.onsuccess = () => resolve(all.result || []);
          all.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      });
      return Array.isArray(items) ? items : [];
    } catch {
      return fromLocal();
    }
  }

  // === TEXT → {lyrics, chords} SPLITTER ===
  function splitLyricsAndChordsFromText(rawText = '') {
    const prefix = (window.CONFIG && window.CONFIG.chordLinePrefix) || '~';
    const hasMarker = rawText
      .split(/\r?\n/)
      .some(line => line.trim().startsWith(prefix));
    // Fast path: no chord markers at all → purely lyrics
    if (!hasMarker && window.CONFIG?.assumeNoChords !== false) {
      return { lyrics: app.normalizeSectionLabels(rawText || ''), chords: '' };
    }

    const lines = (rawText || '').replace(/\r\n?/g, '\n').split('\n');
    const lyricsLines = [];
    const chordLines = [];
    let pendingChord = null;
    const isSection = (s) =>
      /^\s*[\(\[\{].*[\)\]\}]\s*$/.test(s.trim()) || /^\s*\[.*\]\s*$/.test(s.trim());

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const trimmed = line.trim();
      if (trimmed.startsWith(prefix)) {
        // chord line → keep last one wins
        const chord = trimmed.slice(prefix.length).replace(/^\s/, '');
        pendingChord = chord;
        continue;
      }
      // Treat the line as lyrics (including section labels and blank lines)
      lyricsLines.push(line);
      if (trimmed === '' || isSection(trimmed)) {
        // Never attach chords to empty lines or section labels
        chordLines.push('');
        pendingChord = null;
      } else {
        chordLines.push(pendingChord || '');
        pendingChord = null;
      }
    }

    return {
      lyrics: app.normalizeSectionLabels(lyricsLines.join('\n')),
      chords: chordLines.join('\n')
    };
  }

  // === CLIPBOARD MANAGER ===
  function escapeHtml(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  class ClipboardManager {
    static async copyToClipboard(text, showToast = true) {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          // Fallback for mobile/older browsers
          const textArea = document.createElement('textarea');
          textArea.value = text;
          textArea.style.position = 'fixed';
          textArea.style.left = '-999999px';
          textArea.style.top = '-999999px';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          document.execCommand('copy');
          textArea.remove();
        }
        
        if (showToast) {
          this.showToast('Copied to clipboard!', 'success');
        }
        return true;
      } catch (err) {
        console.error('Failed to copy:', err);
        if (showToast) {
          this.showToast('Failed to copy to clipboard', 'error');
        }
        return false;
      }
    }

    static showToast(message, type = 'info', duration = 3000) {
      let container = document.querySelector('.toast-container');
      if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
      }

      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.setAttribute('role', 'status');
      toast.setAttribute('tabindex', '0');

      const content = document.createElement('div');
      content.className = 'toast-content';
      content.textContent = message;
      toast.appendChild(content);

      const closeBtn = document.createElement('button');
      closeBtn.className = 'toast-close';
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.innerHTML = '&times;';
      closeBtn.onclick = () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      };
      toast.appendChild(closeBtn);

      toast.addEventListener('click', () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      });

      toast.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toast.classList.remove('show');
          setTimeout(() => toast.remove(), 300);
        }
      });

      container.appendChild(toast);
      setTimeout(() => toast.classList.add('show'), 10);

      if (duration <= 0) {
        toast.classList.add('toast-sticky');
        return;
      }

      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }

    static formatLyricsWithChords(lyrics, chords) {
      const lyricLines = lyrics.split('\n');
      const chordLines = chords.split('\n');
      
      return lyricLines.map((lyricLine, i) => {
        const chordLine = chordLines[i] || '';
        if (chordLine.trim()) {
          return `${chordLine}\n${lyricLine}`;
        }
        return lyricLine;
      }).join('\n');
    }
  }

  // === APP LOGIC ===
  const app = {
    songList: document.getElementById('song-list'),
    songs: [],
    // tabs
    currentTab: 'songs',
    // setlists state
    setlists: [], // [{id,name,songs:[],createdAt,updatedAt}]
    currentSetlistId: null,
    performanceSetlistId: null,
    currentSongId: null,
    defaultSections: "[Intro]\n\n[Verse 1]\n\n[Pre-Chorus]\n\n[Chorus]\n\n[Verse 2]\n\n[Bridge]\n\n[Outro]",
    sortOrder: localStorage.getItem('songSortOrder') || 'titleAsc',

    async init() {
      try { await window.StorageSafe?.init?.(); } catch {}
      // Load mammoth for DOCX processing
      if (typeof mammoth === 'undefined') {
        console.warn('Mammoth.js not loaded - DOCX support will not work');
      }

      this.loadSongs();
      this.renderSongs();
      this.setupNav();
      this.renderToolbar();
      this.renderTabContent();
      this.setupExportModal();
      this.bindEvents();
      this.initDragSort();

      // Handle PWA shortcut-triggered creation
      if (window.__CREATE_NEW_SONG_ON_LOAD__ === true) {
        // Create and navigate to the editor for the new song
        this.createNewSong();
        // Ensure the flag is single-use
        window.__CREATE_NEW_SONG_ON_LOAD__ = false;
      }
    },

    // ===== NAV TABS =====
    setupNav() {
      const navButtons = Array.from(document.querySelectorAll('.nav-button'));
      const showTab = (tab) => {
        this.currentTab = tab;
        document.querySelectorAll('.tab').forEach(sec => sec.classList.remove('active'));
        document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(tab)?.classList.add('active');
        document.querySelector(`.nav-button[data-tab="${tab}"]`)?.classList.add('active');
        this.renderToolbar();
        this.renderTabContent();
      };
      navButtons.forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
      // default
      showTab('songs');
    },

    loadSongs() {
      this.songs = JSON.parse(localStorage.getItem('songs') || '[]');
      // Migrate old songs to new format
      this.songs = this.songs.map(song => this.migrateSongFormat(song));
      // Ensure unique IDs across the library
      const changed = this.ensureUniqueIds();
      if (changed) this.saveSongs();
    },

    migrateSongFormat(song) {
      // Ensure all songs have the new metadata fields
      const updated = {
        id: song.id || this.generateId(),
        title: song.title || 'Untitled',
        lyrics: this.stripTitleFromLyrics(song.title || 'Untitled', this.normalizeSectionLabels(song.lyrics || '')),
        chords: song.chords || '',
        key: song.key || '',
        tempo: song.tempo || 120,
        timeSignature: song.timeSignature || '4/4',
        notes: song.notes || '',
        createdAt: song.createdAt || new Date().toISOString(),
        lastEditedAt: song.lastEditedAt || new Date().toISOString(),
        tags: song.tags || []
      };
      const spaced = this.normalizeSectionSpacing(updated.lyrics, updated.chords);
      updated.lyrics = spaced.lyrics;
      updated.chords = spaced.chords;
      return updated;
    },

    createSong(title, lyrics = '', chords = '') {
      const normalizedLyrics = lyrics.trim()
        ? this.normalizeSectionLabels(lyrics)
        : this.defaultSections;
      const cleanLyrics = this.stripTitleFromLyrics(title, normalizedLyrics);
      const spaced = this.normalizeSectionSpacing(cleanLyrics, chords);
      return {
        id: this.generateId(),
        title,
        lyrics: spaced.lyrics,
        chords: spaced.chords,
        key: '',
        tempo: 120,
        timeSignature: '4/4',
        notes: '',
        createdAt: new Date().toISOString(),
        lastEditedAt: new Date().toISOString(),
        tags: []
      };
    },

    saveSongs() {
      const data = JSON.stringify(this.songs);
      try {
        localStorage.setItem('songs', data);
      } catch (e) {
        console.warn('localStorage write failed', e);
        try { window.StorageSafe?.snapshotWithData?.(data, 'main:lsFail'); } catch {}
      }
      try { window.StorageSafe?.snapshotLater?.('saveSongs'); } catch {}
    },

    generateId() {
      return (
        Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
      );
    },

    ensureUniqueIds() {
      const seen = new Set();
      let changed = false;
      for (const song of this.songs) {
        let id = String(song.id || '');
        if (!id || seen.has(id)) {
          id = this.generateId();
          song.id = id;
          changed = true;
        }
        seen.add(id);
      }
      return changed;
    },


    normalizeTitle(title) {
      return title
        .replace(/\.[^/.]+$/, '')
        .replace(/[_\-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
    },

    normalizeSectionLabels(text = '') {
      const sectionKeywords = [
        'intro',
        'verse',
        'prechorus',
        'chorus',
        'bridge',
        'outro',
        'hook',
        'refrain',
        'coda',
        'solo',
        'interlude',
        'ending',
        'breakdown',
        'tag'
      ];
      return text.split(/\r?\n/).map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        const match = trimmed.match(/^[\*\s\-_=~`]*[\(\[\{]?\s*([^\]\)\}]+?)\s*[\)\]\}]?[\*\s\-_=~`]*:?$/);
        if (match) {
          const label = match[1].trim();
          const normalized = label.toLowerCase().replace(/[^a-z]/g, '');
          if (sectionKeywords.some(k => normalized.startsWith(k))) {
            const formatted = label
              .replace(/\s+/g, ' ')
              .replace(/(^|\s)\S/g, c => c.toUpperCase());
            return `[${formatted}]`;
          }
        }
        return line;
      }).join('\n');
    },

    stripTitleFromLyrics(title = '', text = '') {
      const t = String(title || '').trim().replace(/\s+/g, '');
      if (!t) return String(text || '');
      return String(text || '')
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .filter(line => {
          const trimmed = (line || '').trim();
          // Keep section labels intact
          if (/^\s*\[[^\n\]]+\]\s*$/.test(trimmed)) return true;
          const norm = trimmed.replace(/\s+/g, '').toLowerCase();
          return norm !== t.toLowerCase();
        })
        .join('\n');
    },

    normalizeSectionSpacing(lyricsText = '', chordsText = '') {
      const isLabel = (line = '') => /^\s*\[[^\n\]]+\]\s*$/.test(line || '');
      const lyricsIn = String(lyricsText || '').replace(/\r\n?/g, '\n').split('\n');
      const chordsIn = String(chordsText || '').replace(/\r\n?/g, '\n').split('\n');

      const outLyrics = [];
      const outChords = [];
      let chordIdx = 0;

      // Ensure first non-empty is a section label; if not, insert a default one
      const firstNonEmpty = lyricsIn.find(l => (l || '').trim() !== '') || '';
      if (!isLabel(firstNonEmpty)) {
        outLyrics.push('[Verse 1]');
        outChords.push('');
      }

      for (let i = 0; i < lyricsIn.length; i++) {
        const raw = lyricsIn[i] ?? '';
        const trimmed = raw.trim();
        if (isLabel(trimmed)) {
          // Ensure a single blank line before each section label (except at very start)
          if (outLyrics.length > 0) {
            const last = outLyrics[outLyrics.length - 1] ?? '';
            if (last.trim() !== '') {
              outLyrics.push('');
              outChords.push('');
            }
          }
          outLyrics.push(trimmed);
          outChords.push('');
          continue;
        }
        if (trimmed === '') {
          // Drop blank lyric lines inside sections; still consume corresponding chord line
          if (lyricsIn[i] !== undefined) {
            // consume a chord entry if present for this lyric line
            if (chordIdx < chordsIn.length) chordIdx++;
          }
          continue;
        }
        // Regular lyric line
        outLyrics.push(raw);
        outChords.push(chordsIn[chordIdx] ?? '');
        chordIdx++;
      }

      // Trim trailing blanks
      while (outLyrics.length && outLyrics[outLyrics.length - 1].trim() === '') {
        outLyrics.pop();
        outChords.pop();
      }

      return { lyrics: outLyrics.join('\n'), chords: outChords.join('\n') };
    },

    cleanAIOutput(text) {
      return text
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+$/gm, '')
        .replace(/^\s+|\s+$/g, '')
        .replace(/^(Verse|Chorus|Bridge|Outro)[^\n]*$/gmi, '[$1]')
        .replace(/^#+\s*/gm, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/^(Capo|Key|Tempo|Time Signature).*$/gmi, '')
        .trim();
    },

    enforceAlternating(lines) {
      const chords = [];
      const lyrics = [];
      for (let i = 0; i < lines.length; i++) {
        if (i % 2 === 0) {
          chords.push(lines[i] || '');
        } else {
          lyrics.push(lines[i] || '');
        }
      }
      return { chords, lyrics };
    },

    parseSongContent(content) {
      const cleaned = this.cleanAIOutput(content || '');
      const lines = cleaned.split(/\r?\n/);
      let lyricsText = cleaned;
      let chordsText = '';
      if (lines.length > 1) {
        const { chords, lyrics } = this.enforceAlternating(lines);
        if (chords.some(line => line.trim() !== '')) {
          chordsText = chords.join('\n');
          lyricsText = lyrics.join('\n');
        }
      }
      lyricsText = this.normalizeSectionLabels(lyricsText);
      return { lyrics: lyricsText, chords: chordsText };
    },

    formatTimeAgo(dateString) {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now - date;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays} days ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
      return date.toLocaleDateString();
    },

    highlightMatch(text, query) {
      if (!query) return text;
      const terms = query
        .split(/\s+/)
        .filter(Boolean)
        .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      if (!terms.length) return text;
      const regex = new RegExp(`(${terms.join('|')})`, 'ig');
      return text.replace(regex, match => `<strong>${match}</strong>`);
    },

    renderSongs(searchQuery = "") {
      this.songList.innerHTML = '';

      let filtered = this.songs;
      if (searchQuery && searchQuery.trim()) {
        const terms = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
        filtered = this.songs.filter(song => {
          const title = song.title.toLowerCase();
          const tags = (song.tags || []).map(t => t.toLowerCase());
          const key = song.key?.toLowerCase() || '';
          return terms.every(term =>
            title.includes(term) ||
            tags.some(tag => tag.includes(term)) ||
            key.includes(term)
          );
        });
      }

      filtered.sort((a, b) => {
        switch (this.sortOrder) {
          case 'titleDesc':
            return b.title.localeCompare(a.title);
          case 'recent':
            return new Date(b.lastEditedAt) - new Date(a.lastEditedAt);
          default:
            return a.title.localeCompare(b.title);
        }
      });

      if (filtered.length === 0) {
        this.songList.innerHTML = `<p class="empty-state">No songs found.</p>`;
        return;
      }

      for (const song of filtered) {
        const item = document.createElement('div');
        item.className = 'song-item';
        item.dataset.id = song.id;
        
        // Build metadata display
        const metadata = [];
        if (song.key) metadata.push(escapeHtml(song.key));
        if (song.tempo && song.tempo !== 120) metadata.push(`${song.tempo} BPM`);
        if (song.timeSignature && song.timeSignature !== '4/4') metadata.push(escapeHtml(song.timeSignature));
        
        const lastEdited = this.formatTimeAgo(song.lastEditedAt);

        const safeTitleHtml = this.highlightMatch(escapeHtml(song.title), searchQuery);
        const safeTitleAttr = escapeHtml(song.title);
        item.innerHTML = `
          <div class="song-info">
            <span class="song-title">${safeTitleHtml}</span>
            ${metadata.length > 0 ? `<div class="song-metadata">${metadata.join(' • ')}</div>` : ''}
            <div class="song-details">
              <span class="song-tags"></span>
              <span class="song-edited">Last edited: ${lastEdited}</span>
            </div>
          </div>
          <div class="song-actions">
            <button class="song-copy-btn icon-btn" title="Quick Copy" aria-label="Quick copy ${safeTitleAttr}" data-song-id="${song.id}">
              <i class="fas fa-copy"></i>
            </button>
            <a class="song-edit-btn icon-btn edit-song-btn" href="editor/editor.html?songId=${song.id}" title="Edit" aria-label="Edit ${safeTitleAttr}">
              <i class="fas fa-pen"></i>
            </a>
            <button class="song-delete-btn icon-btn delete-song-btn" title="Delete" aria-label="Delete ${safeTitleAttr}" data-song-id="${song.id}">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        `;

        // Safely render tags
        const tagsContainer = item.querySelector('.song-tags');
        if (tagsContainer && song.tags?.length > 0) {
          const frag = document.createDocumentFragment();
          song.tags.forEach(tag => {
            const span = document.createElement('span');
            span.className = 'song-tag';
            span.innerHTML = this.highlightMatch(escapeHtml(tag), searchQuery);
            frag.appendChild(span);
            const comma = document.createTextNode(', ');
            frag.appendChild(comma);
          });
          if (frag.lastChild) frag.removeChild(frag.lastChild);
          tagsContainer.appendChild(frag);
        }

        // Add event listeners
        const copyBtn = item.querySelector('.song-copy-btn');
        copyBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.quickCopySong(song);
        });

        const deleteBtn = item.querySelector('.song-delete-btn');
        deleteBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (confirm(`Delete "${song.title}"?`)) {
            this.songs = this.songs.filter(s => s.id !== song.id);
            this.saveSongs();
            this.renderSongs(searchQuery);
            ClipboardManager.showToast('Song deleted', 'info');
          }
        });

        // Explicitly handle edit link navigation to avoid any
        // interference from other click handlers or mobile quirks
        const editLink = item.querySelector('.song-edit-btn');
        if (editLink) {
          editLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            try { sessionStorage.setItem('lastSongId', String(song.id)); } catch {}
            window.location.href = `editor/editor.html?songId=${song.id}`;
          });
        }

        item.querySelectorAll('.song-tag').forEach(tagEl => {
          tagEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const tag = tagEl.textContent;
            const input = document.getElementById('song-search-input');
            if (input) input.value = tag;
            this.renderSongs(tag);
          });
        });

        item.addEventListener('click', (e) => {
          if (!e.target.closest('.song-actions')) {
            try { sessionStorage.setItem('lastSongId', String(song.id)); } catch {}
            window.location.href = `editor/editor.html?songId=${song.id}`;
          }
      });

      this.songList.appendChild(item);
    }
  },

    initDragSort() {
      if (!this.songList || typeof Sortable === 'undefined') return;
      Sortable.create(this.songList, {
        handle: '.drag-handle',
        animation: 150,
        ghostClass: 'drag-ghost',
        onEnd: () => {
          const order = Array.from(this.songList.children).map(child => child.dataset.id);
          const map = new Map(this.songs.map(s => [s.id, s]));
          this.songs = order.map(id => map.get(id)).filter(Boolean);
          this.saveSongs();
        }
      });
    },

    async quickCopySong(song) {
      const title = String(song.title || 'Untitled').trim();
      const stripDuplicateTitle = (t, text) => {
        const ttl = String(t || '').trim().replace(/\s+/g, ' ');
        const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
        let i = 0;
        while (i < lines.length && lines[i].trim() === '') i++;
        if (i < lines.length) {
          const first = lines[i].trim().replace(/\s+/g, ' ');
          if (first.toLowerCase() === ttl.toLowerCase()) {
            lines.splice(i, 1);
            if (i < lines.length && lines[i].trim() === '') lines.splice(i, 1);
          }
        }
        return lines.join('\n');
      };

      const normalizedLyrics = String(song.lyrics || '').replace(/\r\n?/g, '\n');
      let body = stripDuplicateTitle(title, normalizedLyrics);
      if (song.chords && String(song.chords).trim()) {
        const chords = String(song.chords || '').replace(/\r\n?/g, '\n');
        body = ClipboardManager.formatLyricsWithChords(body, chords);
      }
      const textToCopy = `${title}\n\n${body}`;
      await ClipboardManager.copyToClipboard(textToCopy);
    },

    renderToolbar() {
      const toolbar = document.getElementById('tab-toolbar');
      if (this.currentTab === 'songs') {
        toolbar.innerHTML = `
          <div class="search-with-voice">
            <input type="text" id="song-search-input" class="search-input" placeholder="Search by title, tag, or key...">
            <button id="voice-search-btn" class="btn icon-btn" title="Voice Search" aria-label="Voice search"><i class="fas fa-microphone"></i></button>
          </div>
          <div class="toolbar-buttons-group">
            <select id="song-sort-select" class="sort-select">
              <option value="titleAsc">Title A–Z</option>
              <option value="titleDesc">Title Z–A</option>
              <option value="recent">Recently Edited</option>
            </select>
            <button id="add-song-btn" class="btn icon-btn" title="Add Song"><i class="fas fa-plus"></i></button>
            <button id="export-library-btn" class="btn icon-btn" title="Export Library"><i class="fas fa-download"></i></button>
            <button id="normalize-library-btn" class="btn icon-btn" title="Normalize Library"><i class="fas fa-broom"></i></button>
            <button id="import-clipboard-btn" class="btn icon-btn" title="Paste Song"><i class="fas fa-paste"></i></button>
            <button id="delete-all-songs-btn" class="btn icon-btn danger" title="Delete All Songs"><i class="fas fa-trash"></i></button>
            <label for="song-upload-input" class="btn icon-btn" title="Upload Files"><i class="fas fa-upload"></i></label>
          </div>
          <input type="file" id="song-upload-input" multiple accept=".txt,.docx,.json" class="hidden-file">
        `;
      } else if (this.currentTab === 'setlists') {
        toolbar.innerHTML = `
          <select id="setlist-select" class="setlist-select"></select>
          <div class="toolbar-buttons-group">
            <button id="new-setlist-btn" class="btn icon-btn" title="New Setlist"><i class="fas fa-plus"></i></button>
            <button id="rename-setlist-btn" class="btn icon-btn" title="Rename"><i class="fas fa-pen"></i></button>
            <button id="delete-setlist-btn" class="btn icon-btn danger" title="Delete"><i class="fas fa-trash"></i></button>
            <button id="import-setlist-btn" class="btn icon-btn" title="Import Setlist (TXT/DOCX)"><i class="fas fa-file-import"></i></button>
            <button id="import-setlist-image-btn" class="btn icon-btn" title="Import from Image (OCR)"><i class="fas fa-image"></i></button>
            <button id="export-setlist-btn" class="btn icon-btn" title="Export"><i class="fas fa-file-export"></i></button>
          </div>
          <input type="file" id="import-setlist-file" accept=".txt,.docx" class="hidden-file">
          <input type="file" id="import-setlist-image" accept="image/*" class="hidden-file">
        `;
      } else {
        // performance
        toolbar.innerHTML = `
          <select id="performance-setlist-select" class="setlist-select"></select>
          <input type="text" id="performance-song-search" class="search-input" placeholder="Find any song...">
          <div class="toolbar-buttons-group">
            <button id="start-performance-btn" class="btn icon-btn primary"><i class="fas fa-play"></i></button>
            <button id="resume-performance-btn" class="btn icon-btn" title="Resume last"><i class="fas fa-redo"></i></button>
          </div>
        `;
      }

      if (this.currentTab === 'songs') {
        document.getElementById('song-sort-select').value = this.sortOrder;
        document.getElementById('song-sort-select')?.addEventListener('change', (e) => {
          this.sortOrder = e.target.value;
          localStorage.setItem('songSortOrder', this.sortOrder);
          const query = document.getElementById('song-search-input')?.value || '';
          this.renderSongs(query);
          const labels = { titleAsc: 'Title A–Z', titleDesc: 'Title Z–A', recent: 'Recently Edited' };
          ClipboardManager.showToast(`Sort: ${labels[this.sortOrder] || this.sortOrder}`, 'info');
        });

        document.getElementById('add-song-btn')?.addEventListener('click', () => this.createNewSong());
        document.getElementById('export-library-btn')?.addEventListener('click', () => this.openExportModal?.());
        document.getElementById('normalize-library-btn')?.addEventListener('click', async (e) => {
          const btn = e.currentTarget;
          btn.classList.add('loading');
          try { await Promise.resolve(this.normalizeLibrary()); }
          finally { btn.classList.remove('loading'); }
        });
        document.getElementById('import-clipboard-btn')?.addEventListener('click', async (e) => {
          const btn = e.currentTarget;
          btn.classList.add('loading');
          try {
            const text = await navigator.clipboard.readText();
            if (text.trim()) {
              const title = prompt("Title for pasted song?", "New Song");
              if (title) {
                const { lyrics, chords } = splitLyricsAndChordsFromText(text);
                const newSong = this.createSong(title, lyrics, chords);
                this.songs.push(newSong);
                this.saveSongs();
                this.renderSongs();
                ClipboardManager.showToast('Song pasted from clipboard', 'success');
              }
            } else {
              ClipboardManager.showToast('Clipboard is empty', 'info');
            }
          } catch (err) {
            console.error('Clipboard read failed', err);
            ClipboardManager.showToast('Clipboard not accessible', 'error');
          } finally {
            btn.classList.remove('loading');
          }
        });
        document.getElementById('delete-all-songs-btn')?.addEventListener('click', () => this.confirmDeleteAll());
        document.getElementById('song-search-input')?.addEventListener('input', (e) => {
          const query = e.target.value;
          this.renderSongs(query);
        });

      // Voice search setup
        const voiceBtn = document.getElementById('voice-search-btn');
        const inputEl = document.getElementById('song-search-input');
        voiceBtn?.addEventListener('click', () => {
          const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
          if (!SR) { ClipboardManager.showToast('Voice input not supported on this browser', 'error'); return; }
          try {
            const rec = new SR();
            rec.lang = (navigator.language || 'en-US');
            rec.interimResults = true;
            rec.continuous = false;
            voiceBtn.classList.add('mic-listening');
            ClipboardManager.showToast('Listening… Speak your search', 'info', 1500);
            let finalText = inputEl?.value || '';
            rec.onresult = (event) => {
              let interim = '';
              for (let i = event.resultIndex; i < event.results.length; i++) {
                const tr = event.results[i][0].transcript;
                if (event.results[i].isFinal) { finalText = (finalText ? finalText + ' ' : '') + tr; }
                else { interim += tr; }
              }
              if (inputEl) {
                inputEl.value = (finalText + ' ' + interim).trim();
                this.renderSongs(inputEl.value);
              }
            };
            rec.onerror = (e) => { ClipboardManager.showToast(`Voice error: ${e.error || e.message}`, 'error'); };
            rec.onend = () => { voiceBtn.classList.remove('mic-listening'); };
            rec.start();
          } catch (err) {
            voiceBtn.classList.remove('mic-listening');
            ClipboardManager.showToast('Could not start voice input', 'error');
          }
        });

        document.getElementById('song-upload-input')?.addEventListener('change', async (e) => {
          const files = Array.from(e.target.files);
          if (!files.length) return;

        // Check if it's a JSON library import
        const jsonFiles = files.filter(f => f.name.endsWith('.json'));
        if (jsonFiles.length > 0) {
          await this.importLibrary(jsonFiles[0]);
          e.target.value = "";
          return;
        }

        const processFile = (file) => {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
              let content = e.target.result;

              if (file.name.endsWith('.docx')) {
                try {
                  const result = await mammoth.extractRawText({ arrayBuffer: e.target.result });
                  content = result.value;
                } catch (err) {
                  console.error('Error processing DOCX:', err);
                  return resolve(null);
                }
              }

              // Extract title from filename (without extension)
              const title = this.normalizeTitle(file.name);
              const parsed = splitLyricsAndChordsFromText(String(content || '').trim());

              if (title && (parsed.lyrics?.trim()?.length || parsed.chords?.trim()?.length)) {
                resolve(this.createSong(title, parsed.lyrics, parsed.chords));
              } else {
                resolve(null);
              }
            };

            if (file.name.endsWith('.docx')) {
              reader.readAsArrayBuffer(file);
            } else {
              reader.readAsText(file);
            }
          });
        };

        // Show loading indicator on the upload button label + global busy
        const uploadLabel = document.querySelector('label[for="song-upload-input"]');
        uploadLabel?.classList.add('loading');
        ClipboardManager.showToast(`Processing ${files.length} file(s)...`, 'info');
        showGlobalBusy('Importing files…');

        const songs = await Promise.all(files.map(processFile));
        const validSongs = songs.filter(Boolean);
        this.songs.push(...validSongs);
        const importCount = validSongs.length;

        this.saveSongs();
        this.renderSongs();
        ClipboardManager.showToast(`Imported ${importCount} song(s)`, 'success');
        e.target.value = ""; // Clear input
        uploadLabel?.classList.remove('loading');
        hideGlobalBusy();
        });
      } else if (this.currentTab === 'setlists') {
        this.loadSetlists();
        this.refreshSetlistSelect();
        document.getElementById('setlist-select')?.addEventListener('change', (e) => {
          this.currentSetlistId = e.target.value || null;
          this.renderSetlistEditor();
        });
        document.getElementById('new-setlist-btn')?.addEventListener('click', () => this.openSetlistModal());
        document.getElementById('rename-setlist-btn')?.addEventListener('click', () => this.openSetlistModal('rename'));
        document.getElementById('delete-setlist-btn')?.addEventListener('click', () => this.deleteCurrentSetlist());
        // Import modal triggers
        document.getElementById('import-setlist-btn')?.addEventListener('click', () => {
          const overlay = document.getElementById('setlist-import-modal-overlay');
          if (overlay) overlay.hidden = false;
        });
        document.getElementById('setlist-import-cancel-btn')?.addEventListener('click', () => {
          const overlay = document.getElementById('setlist-import-modal-overlay');
          if (overlay) overlay.hidden = true;
        });
        document.querySelectorAll('[data-close="setlist-import-modal-overlay"]').forEach(btn => btn.addEventListener('click', ()=>{
          const overlay = document.getElementById('setlist-import-modal-overlay');
          if (overlay) overlay.hidden = true;
        }));
        document.getElementById('setlist-import-txt-btn')?.addEventListener('click', ()=> document.getElementById('import-setlist-file')?.click());
        document.getElementById('setlist-import-ocr-btn')?.addEventListener('click', ()=> document.getElementById('import-setlist-image')?.click());
        document.getElementById('import-setlist-file')?.addEventListener('change', (e) => { this.handleImportSetlistText(e); const o=document.getElementById('setlist-import-modal-overlay'); if(o) o.hidden=true; });
        document.getElementById('import-setlist-image')?.addEventListener('change', (e) => { this.handleImportSetlistImage(e); const o=document.getElementById('setlist-import-modal-overlay'); if(o) o.hidden=true; });

        // Export modal triggers
        document.getElementById('export-setlist-btn')?.addEventListener('click', () => {
          const overlay = document.getElementById('setlist-export-modal-overlay');
          if (overlay) overlay.hidden = false;
        });
        document.getElementById('setlist-export-cancel-btn')?.addEventListener('click', ()=> { const o=document.getElementById('setlist-export-modal-overlay'); if(o) o.hidden=true; });
        document.querySelectorAll('[data-close="setlist-export-modal-overlay"]').forEach(btn => btn.addEventListener('click', ()=>{ const o=document.getElementById('setlist-export-modal-overlay'); if(o) o.hidden=true; }));
        document.getElementById('setlist-export-confirm-btn')?.addEventListener('click', ()=> this.handleExportSetlistsModal());
      } else {
        // performance toolbar
        this.loadSetlists();
        this.refreshPerformanceSetlistSelect();
        document.getElementById('performance-setlist-select')?.addEventListener('change', (e) => {
          this.performanceSetlistId = e.target.value || null;
          this.renderPerformanceList();
        });
        document.getElementById('performance-song-search')?.addEventListener('input', () => this.renderPerformanceList());
        document.getElementById('start-performance-btn')?.addEventListener('click', () => this.startPerformance());
        const lastPerf = this.getLastPerformance();
        const resumeBtn = document.getElementById('resume-performance-btn');
        if (lastPerf && resumeBtn) {
          resumeBtn.disabled = false;
          resumeBtn.addEventListener('click', () => this.startPerformance(true));
        } else if (resumeBtn) {
          resumeBtn.disabled = true;
        }
      }
    },

    renderTabContent() {
      if (this.currentTab === 'songs') {
        const query = document.getElementById('song-search-input')?.value || '';
        this.renderSongs(query);
      } else if (this.currentTab === 'setlists') {
        this.renderSetlistEditor();
      } else if (this.currentTab === 'performance') {
        this.renderPerformanceList();
      }
    },

    // ===== SETLISTS STORAGE =====
    loadSetlists() {
      try { this.setlists = JSON.parse(localStorage.getItem('setlists') || '[]'); } catch { this.setlists = []; }
      if (!Array.isArray(this.setlists)) this.setlists = [];
    },
    saveSetlists() {
      try { localStorage.setItem('setlists', JSON.stringify(this.setlists)); } catch {}
    },
    getSetlistById(id) { return this.setlists.find(s=>s.id===id) || null; },
    addSetlist(name) {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2,8);
      const setlist = { id, name: this.normalizeTitle(String(name||'Untitled')), songs: [], createdAt: Date.now(), updatedAt: Date.now() };
      this.setlists.push(setlist);
      this.saveSetlists();
      return setlist;
    },
    renameSetlist(id, newName) {
      const s = this.getSetlistById(id); if (!s) return;
      s.name = this.normalizeTitle(String(newName||'Untitled'));
      s.updatedAt = Date.now();
      this.saveSetlists();
    },
    deleteSetlist(id) {
      this.setlists = this.setlists.filter(s=>s.id!==id);
      if (this.currentSetlistId === id) this.currentSetlistId = null;
      this.saveSetlists();
    },
    updateSetlistSongs(id, songIds) {
      const s = this.getSetlistById(id); if (!s) return;
      s.songs = songIds.slice();
      s.updatedAt = Date.now();
      this.saveSetlists();
    },

    // ===== SETLISTS UI =====
    refreshSetlistSelect() {
      const sel = document.getElementById('setlist-select'); if (!sel) return;
      const opts = ['<option value="">— Select setlist —</option>'];
      for (const s of this.setlists.slice().sort((a,b)=>a.name.localeCompare(b.name))) {
        opts.push(`<option value="${s.id}">${escapeHtml(s.name)}</option>`);
      }
      sel.innerHTML = opts.join('');
      if (this.currentSetlistId) sel.value = this.currentSetlistId;
      else if (this.setlists.length) { this.currentSetlistId = this.setlists[0].id; sel.value = this.currentSetlistId; }
    },
    renderSetlistEditor() {
      // Titles
      const titleEl = document.getElementById('current-setlist-title');
      const available = document.getElementById('available-songs');
      const current = document.getElementById('current-setlist-songs');
      if (!available || !current) return;
      const setlist = this.getSetlistById(this.currentSetlistId);
      titleEl.textContent = setlist ? `Current Setlist — ${setlist.name}` : 'Current Setlist';
      // Available songs
      const inSet = new Set(setlist ? setlist.songs : []);
      const availSongs = this.songs.filter(s => !inSet.has(s.id)).sort((a,b)=>a.title.localeCompare(b.title));
      available.innerHTML = availSongs.map(s => `
        <div class="song-item" data-id="${s.id}">
          <div class="song-info"><span class="song-title">${escapeHtml(s.title)}</span></div>
          <div class="song-actions">
            <button class="btn icon-btn add-to-setlist" title="Add"><i class="fas fa-plus"></i></button>
          </div>
        </div>
      `).join('');
      available.querySelectorAll('.add-to-setlist').forEach(btn => btn.addEventListener('click', (e) => {
        const id = e.currentTarget.closest('.song-item')?.dataset.id;
        if (!id || !setlist) return;
        setlist.songs.push(id);
        this.saveSetlists();
        this.renderSetlistEditor();
      }));

      // Current setlist songs
      const curSongs = (setlist ? setlist.songs : []).map(id => this.songs.find(s=>s.id===id)).filter(Boolean);
      current.innerHTML = curSongs.map(s => `
        <div class="song-item" data-id="${s.id}">
          <div class="song-info"><span class="song-title">${escapeHtml(s.title)}</span></div>
          <div class="song-actions">
            <button class="btn icon-btn remove-from-setlist" title="Remove"><i class="fas fa-minus"></i></button>
            <span class="drag-handle" title="Drag to reorder"><i class="fas fa-grip-vertical"></i></span>
          </div>
        </div>
      `).join('');
      current.querySelectorAll('.remove-from-setlist').forEach(btn => btn.addEventListener('click', (e) => {
        const id = e.currentTarget.closest('.song-item')?.dataset.id;
        if (!id || !setlist) return;
        setlist.songs = setlist.songs.filter(x => x !== id);
        this.saveSetlists();
        this.renderSetlistEditor();
      }));
      // Make sortable
      if (typeof Sortable !== 'undefined') {
        Sortable.create(current, {
          handle: '.drag-handle',
          animation: 150,
          onEnd: () => {
            const ids = Array.from(current.querySelectorAll('.song-item')).map(el => el.dataset.id);
            this.updateSetlistSongs(this.currentSetlistId, ids);
          }
        });
      }
    },
    openSetlistModal(mode='new') {
      const overlay = document.getElementById('setlist-modal');
      const title = document.getElementById('setlist-modal-title');
      const input = document.getElementById('setlist-name-input');
      const saveBtn = document.getElementById('save-setlist-btn');
      const cancelBtn = document.getElementById('cancel-setlist-btn');
      if (!overlay || !title || !input || !saveBtn || !cancelBtn) return;
      const setlist = this.getSetlistById(this.currentSetlistId);
      title.textContent = mode === 'rename' ? 'Rename Setlist' : 'New Setlist';
      input.value = mode === 'rename' && setlist ? setlist.name : '';
      overlay.hidden = false;
      const onSave = () => {
        const name = input.value.trim();
        if (!name) { ClipboardManager.showToast('Enter a name', 'error'); return; }
        if (mode === 'rename' && setlist) { this.renameSetlist(setlist.id, name); }
        else { const s = this.addSetlist(name); this.currentSetlistId = s.id; }
        overlay.hidden = true;
        this.refreshSetlistSelect();
        this.renderSetlistEditor();
        saveBtn.removeEventListener('click', onSave);
        cancelBtn.removeEventListener('click', onCancel);
      };
      const onCancel = () => {
        overlay.hidden = true;
        saveBtn.removeEventListener('click', onSave);
        cancelBtn.removeEventListener('click', onCancel);
      };
      saveBtn.addEventListener('click', onSave);
      cancelBtn.addEventListener('click', onCancel);
    },
    deleteCurrentSetlist() {
      const s = this.getSetlistById(this.currentSetlistId);
      if (!s) { ClipboardManager.showToast('No setlist selected', 'info'); return; }
      if (!confirm(`Delete setlist "${s.name}"?`)) return;
      this.deleteSetlist(s.id);
      this.refreshSetlistSelect();
      this.renderSetlistEditor();
      ClipboardManager.showToast('Setlist deleted', 'success');
    },

    // ===== Setlist Import/Export =====
    async handleImportSetlistText(e) {
      const file = (e.target.files||[])[0]; if (!file) return;
      try {
        const isDocx = /\.docx$/i.test(file.name);
        let text = '';
        if (isDocx) {
          const buf = await file.arrayBuffer();
          const res = await mammoth.extractRawText({ arrayBuffer: buf });
          text = String(res.value||'');
        } else {
          text = await file.text();
        }
        const name = prompt('Name for imported setlist?', this.normalizeTitle(file.name.replace(/\.[^/.]+$/, '')));
        if (!name) return;
        const ids = this.extractSetlistSongIdsFromText(text);
        const s = this.addSetlist(name);
        s.songs = ids; s.updatedAt = Date.now(); this.saveSetlists();
        this.currentSetlistId = s.id; this.refreshSetlistSelect(); this.renderSetlistEditor();
        ClipboardManager.showToast(`Imported setlist with ${ids.length} songs`, 'success');
      } catch (err) {
        console.error('Import setlist failed', err);
        ClipboardManager.showToast('Setlist import failed', 'error');
      } finally { e.target.value = ''; }
    },

    async handleImportSetlistImage(e) {
      const file = (e.target.files||[])[0]; if (!file) return;
      try {
        await this.ensureTesseract();
        const { data } = await Tesseract.recognize(file, 'eng', {
          workerPath: '../hill-rd-setlist/lib/tesseract/worker.min.js',
          corePath: '../hill-rd-setlist/lib/tesseract/tesseract-core.wasm.js',
          langPath: '../hill-rd-setlist/lib/tesseract'
        });
        const raw = String((data && data.text) || '');
        const name = prompt('Name for imported setlist (OCR)?', 'Imported Setlist');
        if (!name) return;
        const ids = this.extractSetlistSongIdsFromText(raw);
        const s = this.addSetlist(name);
        s.songs = ids; s.updatedAt = Date.now(); this.saveSetlists();
        this.currentSetlistId = s.id; this.refreshSetlistSelect(); this.renderSetlistEditor();
        ClipboardManager.showToast(`OCR imported ${ids.length} songs`, 'success');
      } catch (err) {
        console.error('OCR import failed', err);
        ClipboardManager.showToast('OCR import failed', 'error');
      } finally { e.target.value = ''; }
    },

    async ensureTesseract() {
      if (window.Tesseract) return;
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '../hill-rd-setlist/lib/tesseract/tesseract.min.js';
        s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
      });
    },

    extractSetlistSongIdsFromText(text) {
      const cleanLine = (s) => String(s||'')
        .replace(/[\u2018\u2019\u201A\u2032\u00B4]/g, "'")
        .replace(/[\u201C\u201D\u2033]/g, '"')
        .replace(/[\u2013\u2014\u2212]/g, '-')
        .replace(/^\s*[•*\-–—]\s*/, '')
        .replace(/^\s*\d+[\).\:\-]?\s*/, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      const lines = String(text||'').replace(/\r\n?/g,'\n').split('\n').map(cleanLine).filter(Boolean);
      const titles = [];
      for (const ln of lines) {
        // skip likely chord lines (two+ chord tokens)
        const toks = ln.split(/\s+/).filter(Boolean);
        const chordToken = /^[A-G](#|b)?(maj|min|m|sus|add|dim|aug)?\d*(\/[A-G](#|b)?)?$/;
        const chordCount = toks.filter(t=> chordToken.test(t)).length;
        if (chordCount >= Math.max(2, Math.ceil(toks.length*0.6))) continue;
        // reasonable length/title-ish
        if (ln.length >= 2 && ln.length <= 64) titles.push(ln);
      }
      const allSongs = this.songs;
      const fuse = (typeof Fuse !== 'undefined') ? new Fuse(allSongs, { keys:['title'], threshold: 0.35, includeScore: true }) : null;
      const norm = (s)=> String(s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
      const byNorm = new Map(allSongs.map(s=> [norm(s.title), s]));
      const ids = [];
      const used = new Set();
      for (const t of titles) {
        let pick = null;
        // exact normalized match
        const n = norm(t); if (byNorm.has(n)) pick = byNorm.get(n);
        // substring match
        if (!pick) { pick = allSongs.find(s=> norm(s.title).includes(n) || n.includes(norm(s.title))); }
        // fuzzy
        if (!pick && fuse) { const r = fuse.search(t); if (r && r.length && r[0].score <= 0.35) pick = r[0].item; }
        if (pick && !used.has(pick.id)) { ids.push(pick.id); used.add(pick.id); }
      }
      return ids;
    },

    handleExportSetlists() {
      if (!this.setlists.length) { ClipboardManager.showToast('No setlists to export', 'info'); return; }
      const which = prompt('Export: type "all" for all setlists, or leave blank for current setlist.', '');
      if (which && which.toLowerCase() === 'all') {
        const payload = { setlists: this.setlists, songs: this.songs };
        const blob = new Blob([JSON.stringify(payload,null,2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'setlists-export.json'; a.click();
        ClipboardManager.showToast('Exported all setlists', 'success');
        return;
      }
      const s = this.getSetlistById(this.currentSetlistId);
      if (!s) { ClipboardManager.showToast('Select a setlist', 'info'); return; }
      const payload = { setlist: { id: s.id, name: s.name }, songs: s.songs.map(id => this.songs.find(x=>x.id===id)).filter(Boolean) };
      const blob = new Blob([JSON.stringify(payload,null,2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${s.name.replace(/\s+/g,'_')}.json`; a.click();
      ClipboardManager.showToast('Exported setlist', 'success');
    },

    handleExportSetlistsModal() {
      const overlay = document.getElementById('setlist-export-modal-overlay');
      const which = (document.querySelector('input[name="setlist-export-which"]:checked')?.value) || 'current';
      const format = (document.querySelector('input[name="setlist-export-format"]:checked')?.value) || 'json';
      if (which === 'all') {
        if (format === 'txt') {
          const content = this.exportAllSetlistsTxt();
          this.downloadFile('setlists.txt', content, 'text/plain');
        } else {
          const payload = { setlists: this.setlists, songs: this.songs };
          this.downloadFile('setlists-export.json', JSON.stringify(payload, null, 2), 'application/json');
        }
        ClipboardManager.showToast('Exported all setlists', 'success');
        if (overlay) overlay.hidden = true; return;
      }
      const s = this.getSetlistById(this.currentSetlistId);
      if (!s) { ClipboardManager.showToast('Select a setlist', 'info'); return; }
      if (format === 'txt') {
        const content = this.exportSingleSetlistTxt(s);
        const name = `${s.name.replace(/\s+/g,'_')}.txt`;
        this.downloadFile(name, content, 'text/plain');
      } else {
        const payload = { setlist: { id: s.id, name: s.name }, songs: s.songs.map(id => this.songs.find(x=>x.id===id)).filter(Boolean) };
        const name = `${s.name.replace(/\s+/g,'_')}.json`;
        this.downloadFile(name, JSON.stringify(payload, null, 2), 'application/json');
      }
      ClipboardManager.showToast('Export ready', 'success');
      if (overlay) overlay.hidden = true;
    },

    exportSingleSetlistTxt(setlist) {
      const titles = setlist.songs.map(id => (this.songs.find(s=>s.id===id)?.title)||'').filter(Boolean);
      const lines = [setlist.name, ''];
      titles.forEach((t,i)=> lines.push(`${i+1}. ${t}`));
      lines.push('');
      return lines.join('\n');
    },
    exportAllSetlistsTxt() {
      const parts = [];
      for (const s of this.setlists) {
        parts.push(this.exportSingleSetlistTxt(s));
      }
      return parts.join('\n');
    },

    downloadFile(name, content, mime) {
      const blob = (content instanceof Blob) ? content : new Blob([content], { type: mime });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    },

    // ===== PERFORMANCE TAB LIST =====
    refreshPerformanceSetlistSelect() {
      const sel = document.getElementById('performance-setlist-select'); if (!sel) return;
      const opts = ['<option value="">— Select setlist —</option>'];
      for (const s of this.setlists.slice().sort((a,b)=>a.name.localeCompare(b.name))) {
        opts.push(`<option value="${s.id}">${escapeHtml(s.name)}</option>`);
      }
      sel.innerHTML = opts.join('');
      if (this.performanceSetlistId) sel.value = this.performanceSetlistId;
    },
    renderPerformanceList() {
      const list = document.getElementById('performance-song-list'); if (!list) return;
      const setlist = this.getSetlistById(this.performanceSetlistId);
      const query = (document.getElementById('performance-song-search')?.value || '').toLowerCase();
      let songsToShow = [];
      if (setlist) songsToShow = setlist.songs.map(id => this.songs.find(s=>s.id===id)).filter(Boolean);
      if (query) {
        const q = query.split(/\s+/).filter(Boolean);
        const matches = this.songs.filter(s => q.every(t => s.title.toLowerCase().includes(t)));
        // merge: search results first, then setlist songs (dedup)
        const seen = new Set(matches.map(s=>s.id));
        for (const s of songsToShow) if (!seen.has(s.id)) matches.push(s);
        songsToShow = matches;
      }
      list.innerHTML = songsToShow.map(s => `<div class="song-item"><div class="song-info"><span class="song-title">${escapeHtml(s.title)}</span></div></div>`).join('') || '<p class="empty-state">Choose a setlist or search any song.</p>';
    },
    startPerformance() {
      if (!this.performanceSetlistId) { ClipboardManager.showToast('Select a setlist', 'info'); return; }
      try { localStorage.setItem('performanceSetlistId', this.performanceSetlistId); } catch {}
      window.location.href = 'performance/performance.html';
    },

    getLastPerformance() {
      try { const raw = localStorage.getItem('lastPerformance'); if (!raw) return null; const data = JSON.parse(raw); if (!data || typeof data !== 'object') return null; return data; } catch { return null; }
    },

    createNewSong() {
      const newSong = this.createSong('New Song', '');
      this.songs.push(newSong);
      this.saveSongs();
      // Redirect to editor for the new song
      try { sessionStorage.setItem('lastSongId', String(newSong.id)); } catch {}
      window.location.href = `editor/editor.html?songId=${newSong.id}`;
    },

    async exportLibrary(includeMetadata = true) {
      try {
        const songs = includeMetadata
          ? this.songs
          : this.songs.map(({ title, lyrics, chords }) => ({ title, lyrics, chords }));
        // Create export data
        const exportData = {
          version: '1.0',
          exportDate: new Date().toISOString(),
          songCount: songs.length,
          songs
        };

        // Create and download JSON file
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `lyricsmith-library-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        ClipboardManager.showToast(`Exported ${this.songs.length} songs`, 'success');
      } catch (err) {
        console.error('Export failed:', err);
        ClipboardManager.showToast('Export failed', 'error');
      }
    },

    // Export library as plain text (.txt): Title, blank line, lyrics (with [Section] labels).
    // Optionally include chords above lyrics lines. Removes duplicate title if it appears
    // as the first non-empty line of the lyrics.
    async exportLibraryTxt(includeChords = false) {
      try {
        const parts = [];
        const sep = '--------------------';
        const stripDuplicateTitle = (title, text) => {
          const t = String(title || '').trim().replace(/\s+/g, ' ');
          const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
          let i = 0;
          while (i < lines.length && lines[i].trim() === '') i++;
          if (i < lines.length) {
            const first = lines[i].trim().replace(/\s+/g, ' ');
            if (first.toLowerCase() === t.toLowerCase()) {
              lines.splice(i, 1);
              // If next line is blank, collapse single leading blank
              if (i < lines.length && lines[i].trim() === '') lines.splice(i, 1);
            }
          }
          return lines.join('\n');
        };
        for (const song of this.songs) {
          const title = String(song.title || 'Untitled').trim();
          const normalizedLyrics = this.normalizeSectionLabels(String(song.lyrics || ''))
            .replace(/\r\n?/g, '\n');
          let body = stripDuplicateTitle(title, normalizedLyrics);
          if (includeChords && song.chords && String(song.chords).trim()) {
            const chords = String(song.chords || '').replace(/\r\n?/g, '\n');
            // Merge chords with the lyrics AFTER stripping duplicate title
            body = ClipboardManager.formatLyricsWithChords(body, chords);
          }
          parts.push(title);
          parts.push(''); // blank line between title and body
          if (body) parts.push(body);
          parts.push(sep);
          parts.push(''); // extra blank line between songs
        }
        // Join with newlines; keep a trailing newline for readability
        let content = parts.join('\n');

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `lyricsmith-library-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        ClipboardManager.showToast(`Exported ${this.songs.length} songs to TXT`, 'success');
      } catch (err) {
        console.error('TXT export failed:', err);
        ClipboardManager.showToast('TXT export failed', 'error');
      }
    },

    async importLibrary(file) {
      try {
        showGlobalBusy('Importing library…');
        const text = await file.text();
        let data;
        try { data = JSON.parse(text); } catch (e) { throw new Error('Invalid JSON'); }

        // Normalize several possible formats into an array of songs:
        // 1) Hill Rd. Song Manager export: { version, exportDate, songCount, songs: [...] }
        // 2) Hill Rd Setlist full export: { songs: [...], setlists: [...] }
        // 3) Hill Rd Setlist songs export: [ {title, lyrics, id?}, ... ]
        // 4) Hill Rd Setlist setlists export: { setlist, songs: [...] } or [ { setlist, songs }, ... ]
        let songsToImport = [];
        if (Array.isArray(data)) {
          // Could be an array of songs or array of { setlist, songs }
          if (data.length && typeof data[0] === 'object' && data[0] && 'setlist' in data[0] && 'songs' in data[0]) {
            for (const entry of data) { if (entry && Array.isArray(entry.songs)) songsToImport.push(...entry.songs); }
          } else {
            songsToImport = data;
          }
        } else if (data && typeof data === 'object') {
          if (Array.isArray(data.songs)) {
            songsToImport = data.songs;
          } else if (data.setlist && Array.isArray(data.songs)) {
            songsToImport = data.songs;
          }
        }

        if (!Array.isArray(songsToImport)) songsToImport = [];
        // Filter to objects that at least have a title or lyrics
        songsToImport = songsToImport.filter(s => s && (s.title || s.lyrics));
        if (!songsToImport.length) throw new Error('Invalid library format');

        // Confirm import and optionally handle duplicates by title
        const confirmMsg = `Import ${songsToImport.length} songs? This will add to your existing library.`;
        if (!confirm(confirmMsg)) return;
        const norm = (t)=> String(t||'').trim().toLowerCase();
        const existingTitles = new Set(this.songs.map(s=> norm(s.title)));
        const dupCount = songsToImport.reduce((n,s)=> n + (existingTitles.has(norm(s.title)) ? 1 : 0), 0);
        let skipDup = false;
        if (dupCount > 0) {
          skipDup = confirm(`${dupCount} duplicate title(s) detected. Click OK to skip duplicates, or Cancel to import copies.`);
        }
        const ensureUniqueTitle = (title)=>{
          let base = String(title||'Untitled');
          if (skipDup) return base; // Won't be used for duplicates
          let cand = base, n = 1;
          while (existingTitles.has(norm(cand))) { n++; cand = `${base} (Copy ${n})`; }
          existingTitles.add(norm(cand));
          return cand;
        };

        // Process and migrate imported songs
        let importCount = 0;
        for (const songData of songsToImport) {
          if (skipDup && existingTitles.has(norm(songData.title))) {
            continue;
          }
          const song = this.migrateSongFormat(songData);
          if (!skipDup) song.title = ensureUniqueTitle(song.title);
          // Generate new ID to avoid conflicts
          song.id = Date.now().toString() + Math.random().toString(36).slice(2, 11);
          song.lastEditedAt = new Date().toISOString();
          this.songs.push(song);
          importCount++;
        }

        this.saveSongs();
        this.renderSongs();
        ClipboardManager.showToast(`Imported ${importCount} songs`, 'success');
      } catch (err) {
        console.error('Import failed:', err);
        ClipboardManager.showToast('Import failed - invalid file format', 'error');
      } finally {
        hideGlobalBusy();
      }
    },

    normalizeLibrary() {
      try {
        let idFixes = 0;
        let normalized = 0;
        // Ensure unique IDs
        const beforeIds = new Set(this.songs.map(s => String(s.id || '')));
        if (this.ensureUniqueIds()) {
          const afterIds = new Set(this.songs.map(s => String(s.id)));
          idFixes = Math.max(0, beforeIds.size - afterIds.size);
        }

        // Normalize song fields using migrateSongFormat
        this.songs = this.songs.map((song) => {
          const migrated = this.migrateSongFormat(song);
          // Keep original timestamps if present
          migrated.createdAt = song.createdAt || migrated.createdAt;
          migrated.lastEditedAt = song.lastEditedAt || migrated.lastEditedAt;
          if (JSON.stringify(song) != JSON.stringify(migrated)) normalized++;
          return migrated;
        });

        this.saveSongs();
        const msg = `Library normalized${idFixes ? `, fixed IDs: ${idFixes}` : ''}${normalized ? `, updated: ${normalized}` : ''}`;
        ClipboardManager.showToast(msg, 'success');
        const query = document.getElementById('song-search-input')?.value || '';
        this.renderSongs(query);
      } catch (e) {
        console.error('Normalize failed', e);
        ClipboardManager.showToast('Normalize failed', 'error');
      }
    },

    confirmDeleteAll() {
      if (confirm("Delete all songs? This cannot be undone.")) {
        this.songs = [];
        this.saveSongs();
        this.renderSongs();
        ClipboardManager.showToast('All songs deleted', 'info');
      }
    },

    bindEvents() {
      // Add keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + N for new song
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
          e.preventDefault();
          this.createNewSong();
        }
        
        // Ctrl/Cmd + E for export
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
          e.preventDefault();
          this.openExportModal?.();
        }
      });

      // Focus search on '/' key
      document.addEventListener('keydown', (e) => {
        if (e.key === '/' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          document.getElementById('song-search-input')?.focus();
        }
      });
    }
    ,

    setupExportModal() {
      const overlay = document.getElementById('export-modal-overlay');
      if (!overlay) return;
      // Close with top-right X
      overlay.querySelector('.modal-close-x')?.addEventListener('click', () => { overlay.hidden = true; });
      const formatRadios = Array.from(document.querySelectorAll('input[name="export-format"]'));
      const jsonOptions = document.getElementById('json-options');
      const txtOptions = document.getElementById('txt-options');
      const cancelBtn = document.getElementById('export-cancel-btn');
      const confirmBtn = document.getElementById('export-confirm-btn');

      const updateOptions = () => {
        const fmt = (formatRadios.find(r => r.checked)?.value) || 'json';
        if (fmt === 'txt') {
          if (jsonOptions) jsonOptions.style.display = 'none';
          if (txtOptions) txtOptions.style.display = '';
        } else {
          if (jsonOptions) jsonOptions.style.display = '';
          if (txtOptions) txtOptions.style.display = 'none';
        }
      };

      formatRadios.forEach(r => r.addEventListener('change', updateOptions));
      cancelBtn?.addEventListener('click', () => { overlay.hidden = true; });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.hidden = true; });

      confirmBtn?.addEventListener('click', async () => {
        confirmBtn.classList.add('loading');
        try {
          const fmt = (formatRadios.find(r => r.checked)?.value) || 'json';
          if (fmt === 'txt') {
            const includeChords = !!document.getElementById('export-include-chords')?.checked;
            await this.exportLibraryTxt(includeChords);
          } else {
            const includeMetadata = !!document.getElementById('export-include-metadata')?.checked;
            await this.exportLibrary(includeMetadata);
          }
          overlay.hidden = true;
        } finally {
          confirmBtn.classList.remove('loading');
        }
      });

      this.openExportModal = () => {
        try {
          const jsonRadio = document.querySelector('input[name="export-format"][value="json"]');
          if (jsonRadio) jsonRadio.checked = true;
          const incMeta = document.getElementById('export-include-metadata');
          if (incMeta) incMeta.checked = true;
          const incChords = document.getElementById('export-include-chords');
          if (incChords) incChords.checked = false;
          updateOptions();
        } catch {}
        overlay.hidden = false;
      };
    }
  };

  app.init();
  attachHookMillButton();
  window.app = app;

  // Extend app with Hook Mill sync routine
  app.syncHookMill = async function(starredOnly = true) {
    try {
      ClipboardManager.showToast(starredOnly ? 'Syncing starred Hook Mill items…' : 'Syncing Hook Mill items…', 'info');
      showGlobalBusy('Syncing Hook Mill…');
      const items = await getHookMillItems();
      if (!items.length) {
        ClipboardManager.showToast('No Hook Mill items found', 'info');
        return;
      }

      const filtered = starredOnly ? items.filter(x => x && x.starred) : items;
      if (!filtered.length) {
        ClipboardManager.showToast(starredOnly ? 'No starred Hook Mill items' : 'No Hook Mill items', 'info');
        return;
      }

      // Build a quick index of existing hm hashes in notes for dedupe
      const existingHashes = new Set();
      try {
        for (const s of this.songs) {
          const note = (s.notes || '').toString();
          const m = note.match(/hm_hash:([a-f0-9]{32,64})/i);
          if (m) existingHashes.add(m[1].toLowerCase());
        }
      } catch {}

      let imported = 0;
      let skipped = 0;
      for (const it of filtered) {
        const output = (it && it.output) ? String(it.output) : '';
        if (!output.trim()) { skipped++; continue; }
        const hash = (it.hash || '').toString().toLowerCase();
        if (hash && existingHashes.has(hash)) { skipped++; continue; }

        // Title = first non-empty line, trimmed
        const firstLine = output.split(/\r?\n/).find(l => l.trim()) || 'Hook';
        const title = firstLine.slice(0, 120);

        const newSong = this.createSong(title, output, '');
        // Tag and note metadata
        const tags = new Set([...(newSong.tags || []), 'hook-mill']);
        if (Array.isArray(it.tags)) it.tags.forEach(t => t && tags.add(String(t)));
        newSong.tags = Array.from(tags);
        const created = it.createdAt ? new Date(it.createdAt).toISOString() : new Date().toISOString();
        const metaBits = [
          `Imported from Hook Mill on ${new Date().toLocaleString()}`,
          it.model ? `model: ${it.model}` : '',
          it.preset ? `preset: ${it.preset}` : '',
          it.lens ? `lens: ${it.lens}` : '',
          hash ? `hm_hash:${hash}` : ''
        ].filter(Boolean);
        newSong.notes = metaBits.join(' \n ');
        newSong.createdAt = created;
        newSong.lastEditedAt = new Date().toISOString();

        this.songs.push(newSong);
        if (hash) existingHashes.add(hash);
        imported++;
      }

      if (imported > 0) {
        this.saveSongs();
        const query = document.getElementById('song-search-input')?.value || '';
        this.renderSongs(query);
      }

      const msg = `Hook Mill sync: imported ${imported}${skipped ? `, skipped ${skipped}` : ''}`;
      ClipboardManager.showToast(msg, imported ? 'success' : 'info');
    } catch (err) {
      console.error('Hook Mill sync failed', err);
      ClipboardManager.showToast('Hook Mill sync failed', 'error');
    } finally {
      hideGlobalBusy();
    }
  };
});
  // Global: close modals when clicking overlay or pressing ESC
  (function attachGlobalModalHandlers(){
    function onOverlayClick(e){ if (e.target.classList && e.target.classList.contains('modal-overlay')) e.target.hidden = true; }
    document.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', (e)=>{
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(ov => ov.hidden = true);
      }
    });
    // Close buttons with data-close attr
    document.addEventListener('click', (e)=>{
      const closeId = e.target?.closest('[data-close]')?.getAttribute('data-close');
      if (closeId) { const ov = document.getElementById(closeId); if (ov) ov.hidden = true; }
    });
  })();
