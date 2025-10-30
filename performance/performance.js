document.addEventListener('DOMContentLoaded', () => {
    // ==== TOASTS ====
    function showToast(message, type = 'success', timeout = 2500) {
      const toast = document.createElement('div');
      toast.className = `toast toast-${type} show`;
      toast.textContent = message;
      document.body.appendChild(toast);
      requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(0)'; });
      setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; setTimeout(() => toast.remove(), 300); }, timeout);
    }
    function confirmDialog(message, onYes, onNo) {
      const modal = document.createElement('div');
      modal.className = 'modal'; modal.style.display = 'flex';
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

    // ==== DB MODULE (dupe for performance context)
    const DB = (() => {
      const DB_NAME = 'hrr-setlist-db';
      const DB_VERSION = 1;
      let _db;
      async function open(){ if(_db) return _db; _db = await idb.openDB(DB_NAME, DB_VERSION, { upgrade(db){ if(!db.objectStoreNames.contains('songs')){ const s=db.createObjectStore('songs',{keyPath:'id'}); if(s.createIndex) s.createIndex('title','title',{unique:false}); } if(!db.objectStoreNames.contains('setlists')){ const sl=db.createObjectStore('setlists',{keyPath:'id'}); if(sl.createIndex) sl.createIndex('name','name',{unique:false}); } if(!db.objectStoreNames.contains('meta')){ db.createObjectStore('meta'); } } }); return _db; }
      return {
        async getAllSongs(){ const db=await open(); return db.getAll('songs'); },
        async getAllSetlists(){ const db=await open(); return db.getAll('setlists'); }
      };
    })();
    const app = {
        // DOM Elements
        performanceMode: document.getElementById('performance-mode'),
        performanceSongInfo: document.getElementById('performance-song-info'),
        lyricsDisplay: document.getElementById('lyrics-display'),
        fontControlsEl: document.getElementById('font-controls'),
        decreaseFontBtn: document.getElementById('decrease-font-btn'),
        increaseFontBtn: document.getElementById('increase-font-btn'),
        fontSizeDisplay: document.getElementById('font-size-display'),
        toggleThemeBtn: document.getElementById('theme-toggle-btn'),
        exitPerformanceBtn: document.getElementById('exit-performance-btn'),
        prevSongBtn: document.getElementById('prev-song-btn'),
        nextSongBtn: document.getElementById('next-song-btn'),
        scrollToTopBtn: document.getElementById('scroll-to-top-btn'),
        autoScrollBtn: document.getElementById('auto-scroll-btn'),
        autoscrollSettingsBtn: document.getElementById('autoscroll-settings-btn'),
        autoscrollDelayModal: document.getElementById('autoscroll-delay-modal'),
        autoscrollDelaySlider: document.getElementById('autoscroll-delay-slider'),
        autoscrollDelayValue: document.getElementById('autoscroll-delay-value'),
        autoscrollSpeedSlider: document.getElementById('autoscroll-speed-slider'),
        autoscrollSpeedValue: document.getElementById('autoscroll-speed-value'),
        closeAutoscrollDelayModal: document.getElementById('close-autoscroll-delay-modal'),

        // State
        songs: [],
        performanceSetlistId: null,
        autoFitManuallyOverridden: false,
        performanceSongs: [],
        currentPerformanceSongIndex: 0,
        isPerformanceMode: true,
        autoScrollTimer: null,
        autoScrollDelayTimer: null,
        autoScrollSpeed: Number(localStorage.getItem('autoscrollSpeed')) || 1,
        autoScrollActive: false,
        autoscrollDelay: Number(localStorage.getItem('autoscrollDelay')) || 3,
        resizeObserver: null,

        fontSize: 32, // default value; will set per song
        perSongFontSizes: JSON.parse(localStorage.getItem('perSongFontSizes') || '{}'),
        minFontSize: 16,
        maxFontSize: 72,
        fontSizeStep: 1,
        fontFab: null,
        _fontOutsideHandler: null,
        _fontControlsTimer: null,
        isChordsVisible: (localStorage.getItem('performanceShowChords') === '1'),

        // Initialize
        init() {
            (async () => {
            // Keep screen awake and lock orientation where possible
            try {
                if ('wakeLock' in navigator) {
                    let wl;
                    const request = async () => {
                        try { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', ()=>{}); } catch {}
                    };
                    document.addEventListener('visibilitychange', () => {
                        if (document.visibilityState === 'visible') request();
                    });
                    request();
                }
                if (screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock('landscape').catch(()=>{});
                }
            } catch {}
            // Run migration if needed (e.g., if opened directly)
            try {
              const migrated = await (async ()=>{ try{ const db=await idb.openDB('hrr-setlist-db',1); return db.get('meta','migrated'); } catch(_){ return true; } })();
              if (migrated !== true) {
                const songsRaw = localStorage.getItem('songs');
                const setlistsRaw = localStorage.getItem('setlists');
                if (songsRaw) { try { const arr=JSON.parse(songsRaw)||[]; const db=await idb.openDB('hrr-setlist-db',1); const tx=db.transaction('songs','readwrite'); for (const s of arr) await tx.store.put(s); await tx.done; } catch (e) {} }
                if (setlistsRaw) { try { const arr=JSON.parse(setlistsRaw)||[]; const db=await idb.openDB('hrr-setlist-db',1); const tx=db.transaction('setlists','readwrite'); for (const s of arr) await tx.store.put(s); await tx.done; } catch (e) {} }
                try { const db=await idb.openDB('hrr-setlist-db',1); await db.put('meta', true, 'migrated'); } catch (e) {}
              }
            } catch(e) {}
            await this.loadData();
            this.setupEventListeners();
            await this.loadPerformanceState();
            this.displayCurrentPerformanceSong();
            this.setupResizeObserver();
            this.initFontControlsMobile();
            window.addEventListener('resize', (() => {
                let t;
                return () => { clearTimeout(t); t = setTimeout(() => this.initFontControlsMobile(), 200); };
            })());
            })();
        },

        // Setup resize observer for auto-fit (unchanged)
        setupResizeObserver() {
            if (window.ResizeObserver) {
                this.resizeObserver = new ResizeObserver(() => {
                    if (!this.autoFitManuallyOverridden) {
                        clearTimeout(this.resizeTimeout);
                        this.resizeTimeout = setTimeout(() => {
                            // Optionally, you could auto-fit here if you want
                        }, 100);
                    }
                });
                this.resizeObserver.observe(this.performanceMode);
            }
        },

        // Load data
        async loadData() {
            try { this.songs = await DB.getAllSongs(); } catch (e) { this.songs = []; }
            const theme = (localStorage.getItem('theme') === 'light') ? 'light' : 'dark';
            document.documentElement.dataset.theme = theme;
        },

        // Load performance state from query parameters
        async loadPerformanceState() {
            const params = new URLSearchParams(window.location.search);
            this.performanceSetlistId = params.get('setlistId') || null;
            const songId = params.get('songId');
            const idsParam = params.get('ids');
            if (this.performanceSetlistId) {
                const setlists = await DB.getAllSetlists();
                const setlist = (setlists||[]).find(s => s.id === this.performanceSetlistId);
                if (setlist) {
                    this.performanceSongs = setlist.songs
                        .map(id => this.songs.find(s => s.id === id))
                        .filter(Boolean);
                } else if (idsParam) {
                    // Fallback for local file environments where IDB may not share across pages
                    const ids = idsParam.split(',').filter(Boolean);
                    this.performanceSongs = ids
                        .map(id => this.songs.find(s => s.id === id))
                        .filter(Boolean);
                }
            } else {
                this.performanceSongs = this.songs;
            }
            this.currentPerformanceSongIndex = songId
                ? this.performanceSongs.findIndex(s => s.id === songId)
                : 0;
            if (this.currentPerformanceSongIndex === -1) {
                this.currentPerformanceSongIndex = 0;
            }
            await this.maybeResumeSetlist();
        },

        async maybeResumeSetlist() {
            const lastPerfRaw = localStorage.getItem('lastPerformance');
            let lastPerf = null;
            if (lastPerfRaw) {
                try { lastPerf = JSON.parse(lastPerfRaw); } catch (e) {}
            }
            return await new Promise((resolve) => {
                // Only prompt if we're entering the SAME setlist as before, and it wasn't at the beginning
                if (
                    lastPerf &&
                    lastPerf.setlistId &&
                    lastPerf.setlistId === this.performanceSetlistId &&
                    typeof lastPerf.songIndex === 'number' &&
                    lastPerf.songIndex > 0 &&
                    this.performanceSongs[lastPerf.songIndex]
                ) {
                    confirmDialog(
                        `Resume this setlist where we left off? (Song ${lastPerf.songIndex + 1}: ${this.performanceSongs[lastPerf.songIndex]?.title || 'Unknown'})`,
                        () => { this.currentPerformanceSongIndex = lastPerf.songIndex; resolve(); },
                        () => { this.currentPerformanceSongIndex = 0; resolve(); }
                    );
                } else {
                    this.currentPerformanceSongIndex = 0;
                    resolve();
                }
            });
        },

        // Setup event listeners
        setupEventListeners() {
            // FONT SIZE BUTTONS
            this.decreaseFontBtn.addEventListener('click', () => this.adjustFontSize(-this.fontSizeStep));
            this.increaseFontBtn.addEventListener('click', () => this.adjustFontSize(this.fontSizeStep));
            // Keep floating controls visible while interacting
            if (this.fontControlsEl) {
                const reset = () => this.resetFontControlsHideTimer();
                this.fontControlsEl.addEventListener('mousemove', reset);
                this.fontControlsEl.addEventListener('touchstart', reset, { passive: true });
            }

            this.toggleThemeBtn.addEventListener('click', () => this.handlePerformanceThemeToggle());
            this.exitPerformanceBtn.addEventListener('click', () => this.exitPerformanceMode());
            this.prevSongBtn.addEventListener('click', () => this.navigatePerformanceSong(-1));
            this.nextSongBtn.addEventListener('click', () => this.navigatePerformanceSong(1));
            this.scrollToTopBtn.addEventListener('click', () => {
                this.lyricsDisplay.scrollTo({ top: 0, behavior: 'smooth' });
            });
            this.autoScrollBtn.addEventListener('click', () => this.toggleAutoScroll());
            this.autoscrollSettingsBtn.addEventListener('click', () => {
                this.autoscrollDelayModal.style.display = 'block';
                this.autoscrollDelaySlider.value = this.autoscrollDelay;
                this.autoscrollDelayValue.textContent = this.autoscrollDelay + 's';
                this.autoscrollSpeedSlider.value = this.autoScrollSpeed;
                this.autoscrollSpeedValue.textContent = this.autoScrollSpeed;
                const chordToggle = document.getElementById('show-chords-toggle');
                if (chordToggle) chordToggle.checked = !!this.isChordsVisible;
            });
            this.autoscrollDelaySlider.addEventListener('input', (e) => {
                this.autoscrollDelayValue.textContent = e.target.value + 's';
            });
            this.autoscrollSpeedSlider.addEventListener('input', (e) => {
                this.autoscrollSpeedValue.textContent = e.target.value;
            });
            this.closeAutoscrollDelayModal.addEventListener('click', () => {
                this.autoscrollDelay = Number(this.autoscrollDelaySlider.value);
                localStorage.setItem('autoscrollDelay', this.autoscrollDelay);
                this.autoScrollSpeed = Number(this.autoscrollSpeedSlider.value);
                localStorage.setItem('autoscrollSpeed', this.autoScrollSpeed);
                const chordToggle = document.getElementById('show-chords-toggle');
                if (chordToggle) {
                    this.isChordsVisible = chordToggle.checked;
                    localStorage.setItem('performanceShowChords', this.isChordsVisible ? '1' : '0');
                    this.displayCurrentPerformanceSong();
                    if (this.isChordsVisible && !localStorage.getItem('chordsHintShown')) {
                        try {
                            showToast('Chords shown. Tip: adjust font size for best alignment.', 'info', 3500);
                            localStorage.setItem('chordsHintShown', '1');
                        } catch {}
                    }
                }
                this.autoscrollDelayModal.style.display = 'none';
            });
            const chordToggle = document.getElementById('show-chords-toggle');
            if (chordToggle) chordToggle.addEventListener('change', (e)=>{
                this.isChordsVisible = !!e.target.checked;
                localStorage.setItem('performanceShowChords', this.isChordsVisible ? '1' : '0');
                this.displayCurrentPerformanceSong();
                if (this.isChordsVisible && !localStorage.getItem('chordsHintShown')) {
                    try {
                        showToast('Chords shown. Tip: adjust font size for best alignment.', 'info', 3500);
                        localStorage.setItem('chordsHintShown', '1');
                    } catch {}
                }
            });
            this.lyricsDisplay.addEventListener('scroll', () => this.updateScrollButtonsVisibility());
            this.lyricsDisplay.addEventListener('touchstart', () => this.stopAutoScroll());
            this.lyricsDisplay.addEventListener('mousedown', () => this.stopAutoScroll());

            // Touch swipe navigation is handled by the global setupSwipeNav() below
        },


        // Floating font controls (mobile/tablet) modeled after editor
        initFontControlsMobile() {
            const isMobile = window.innerWidth <= 1024;
            if (!this.fontControlsEl) return;
            if (!isMobile) {
                this.fontControlsEl.classList.add('visible');
                if (this.fontFab && this.fontFab.parentNode) this.fontFab.parentNode.removeChild(this.fontFab);
                this.fontFab = null;
                this.clearFontControlsHideTimer?.();
                return;
            }
            // On mobile: keep hidden until user taps FAB
            this.fontControlsEl.classList.remove('visible');
            if (!this.fontFab) {
                const btn = document.createElement('button');
                btn.className = 'font-fab';
                btn.title = 'Font controls';
                btn.innerHTML = '<i class="fas fa-text-height"></i>';
                document.body.appendChild(btn);
                btn.addEventListener('click', () => this.showFontControls());
                this.fontFab = btn;
            }
            // Hide when clicking outside controls
            if (!this._fontOutsideHandler) {
                this._fontOutsideHandler = (e) => {
                    if (!this.fontControlsEl.classList.contains('visible')) return;
                    if (this.fontControlsEl.contains(e.target)) return;
                    if (this.fontFab && this.fontFab.contains(e.target)) return;
                    this.hideFontControls();
                };
                document.addEventListener('click', this._fontOutsideHandler);
            }
        },

        showFontControls() {
            if (!this.fontControlsEl) return;
            this.fontControlsEl.classList.add('visible');
            if (this.fontFab) this.fontFab.classList.add('hidden');
            this.resetFontControlsHideTimer();
        },

        hideFontControls() {
            if (!this.fontControlsEl) return;
            this.fontControlsEl.classList.remove('visible');
            if (this.fontFab) this.fontFab.classList.remove('hidden');
            this.clearFontControlsHideTimer();
        },

        resetFontControlsHideTimer() {
            this.clearFontControlsHideTimer();
            this._fontControlsTimer = setTimeout(() => this.hideFontControls(), 4000);
        },

        clearFontControlsHideTimer() {
            if (this._fontControlsTimer) {
                clearTimeout(this._fontControlsTimer);
                this._fontControlsTimer = null;
            }
        },

        // Display current song
        displayCurrentPerformanceSong() {
            const song = this.performanceSongs[this.currentPerformanceSongIndex];
            if (!song) return;

            this.autoFitManuallyOverridden = false; // Reset override for new song

            // Process lyrics
            let lines = (song.lyrics || '').split('\n').map(line => line.trimEnd());
            const chordsLines = String(song.chords || '').split('\n');
            const normTitle = song.title.trim().toLowerCase();
            let removed = 0;
            while (lines.length && removed < 2) {
                if (!lines[0] || lines[0].toLowerCase() === normTitle) {
                    lines.shift(); removed++;
                } else break;
            }

            const songNumber = this.currentPerformanceSongIndex + 1;
            const totalSongs = this.performanceSongs.length;
            this.performanceSongInfo.innerHTML = `
                <h2>${song.title}</h2>
                <div class="song-progress">${songNumber} / ${totalSongs}</div>
            `;

            // Render lines with optional chords
            this.lyricsDisplay.classList.toggle('show-chords', !!this.isChordsVisible);
            this.lyricsDisplay.innerHTML = '';
            const frag = document.createDocumentFragment();
            let chordIdx = 0;
            for (let i = 0; i < lines.length; i++) {
                const lyricLine = lines[i];
                if (/^\s*\[[^\n\]]+\]\s*$/.test(lyricLine)) {
                    const el = document.createElement('div');
                    el.className = 'section-label';
                    el.textContent = lyricLine.trim();
                    frag.appendChild(el);
                    continue;
                }
                if (this.isChordsVisible) {
                    const chordText = chordsLines[chordIdx] || '';
                    if (chordText && chordText.trim()) {
                        const chordEl = document.createElement('div');
                        chordEl.className = 'chord-line';
                        chordEl.textContent = chordText;
                        frag.appendChild(chordEl);
                    }
                }
                const lyricEl = document.createElement('div');
                lyricEl.className = 'lyric-line';
                lyricEl.textContent = lyricLine;
                frag.appendChild(lyricEl);
                chordIdx++;
            }
            this.lyricsDisplay.appendChild(frag);

	// Restore per-song font size if present, else use last-used or default
	    let fs = this.perSongFontSizes[song.id];
	    if (typeof fs !== 'number') {
	    // fallback to previous fontSize or default
	         fs = this.fontSize || 32;
	    }
	    this.fontSize = fs;
	    this.updateFontSize();

            this.prevSongBtn.style.display = this.currentPerformanceSongIndex > 0 ? 'block' : 'none';
            this.nextSongBtn.style.display = this.currentPerformanceSongIndex < this.performanceSongs.length - 1 ? 'block' : 'none';
            this.stopAutoScroll();
            this.updateAutoScrollButton();
            this.autoScrollBtn.blur();
        },

        // Font size methods
	adjustFontSize(amount) {
	    this.fontSize = Math.max(this.minFontSize, Math.min(this.maxFontSize, this.fontSize + amount));
	    this.updateFontSize();
	    // Save font size for this song
	    const song = this.performanceSongs[this.currentPerformanceSongIndex];
	    if (song && song.id) {
		this.perSongFontSizes[song.id] = this.fontSize;
		localStorage.setItem('perSongFontSizes', JSON.stringify(this.perSongFontSizes));
	    }
	},

        updateFontSize() {
            if (this.lyricsDisplay) {
                this.lyricsDisplay.style.fontSize = this.fontSize + 'px';
            }
            if (this.fontSizeDisplay) {
                this.fontSizeDisplay.textContent = `${Math.round(this.fontSize)}px`;
            }
            setTimeout(() => this.updateScrollButtonsVisibility(), 100);
        },

        // Navigate to next/previous song
        navigatePerformanceSong(direction) {
            const newIndex = this.currentPerformanceSongIndex + direction;
            if (newIndex >= 0 && newIndex < this.performanceSongs.length) {
                this.currentPerformanceSongIndex = newIndex;
                this.displayCurrentPerformanceSong();
            }
        },

        // Toggle theme
        handlePerformanceThemeToggle() {
            const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = next;
            localStorage.setItem('theme', next);
        },

        // Exit performance mode
        exitPerformanceMode() {
            const perf = {
                setlistId: this.performanceSetlistId || null,
                songIndex: this.currentPerformanceSongIndex,
                timestamp: Date.now()
            };
            localStorage.setItem('lastPerformance', JSON.stringify(perf));
            if (this.resizeObserver) {
                this.resizeObserver.disconnect();
            }
            window.location.href = '../index.html#performance';
        },

        // The rest: autoscroll, buttons, etc. are unchanged from your original

        startAutoScroll() {
            this.stopAutoScroll();
            const container = this.lyricsDisplay;
            if (!container) return;
            if (container.scrollHeight <= container.clientHeight) return;

            this.autoScrollActive = true;
            this.autoScrollDelayTimer = setTimeout(() => {
                this.autoScrollTimer = setInterval(() => {
                    if (!this.autoScrollActive) return;
                    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
                        this.stopAutoScroll();
                        return;
                    }
                    container.scrollTop += this.autoScrollSpeed;
                }, 50);
            }, this.autoscrollDelay * 1000);
        },

        stopAutoScroll() {
            this.autoScrollActive = false;
            if (this.autoScrollTimer) {
                clearInterval(this.autoScrollTimer);
                this.autoScrollTimer = null;
            }
            if (this.autoScrollDelayTimer) {
                clearTimeout(this.autoScrollDelayTimer);
                this.autoScrollDelayTimer = null;
            }
        },

        toggleAutoScroll() {
            if (this.autoScrollActive) {
                this.stopAutoScroll();
            } else {
                this.startAutoScroll();
            }
            this.updateAutoScrollButton();
        },

        updateAutoScrollButton() {
            const btn = this.autoScrollBtn;
            if (!btn) return;
            btn.innerHTML = this.autoScrollActive
                ? '<i class="fas fa-pause"></i>'
                : '<i class="fas fa-angle-double-down"></i>';
            btn.title = this.autoScrollActive ? 'Pause Autoscroll' : 'Start Autoscroll';
        },

        updateScrollButtonsVisibility() {
            const container = this.lyricsDisplay;
            if (!container) return;
            const needsScroll = container.scrollHeight > container.clientHeight;
            const hasScrolled = container.scrollTop > 2;

            if (hasScrolled) {
                this.scrollToTopBtn.classList.remove('invisible');
            } else {
                this.scrollToTopBtn.classList.add('invisible');
            }

            if (needsScroll) {
                this.autoScrollBtn.style.display = 'flex';
            } else {
                this.autoScrollBtn.style.display = 'none';
                this.stopAutoScroll();
            }
        },

        updateScrollBtnVisibility() {
            this.updateScrollButtonsVisibility();
        }
    };

    // ==== SWIPE NAV ====
    (function setupSwipeNav() {
      const zone = document.getElementById('lyrics-display');
      if (!zone) return;
      let startX=0, startY=0, startTime=0, dragging=false, movedY=0, multiTouch=false, targetWasControl=false;
      const MIN_X = 60; // px
      const MAX_ANGLE_TAN = Math.tan(30 * Math.PI / 180);
      const MAX_DURATION = 600; // ms
      const MAX_PREF_SCROLL_Y = 30;
      function isControl(el) {
        return el.closest('.performance-controls, .font-fab, #font-controls, .auto-scroll-btn, .scroll-to-top-btn, .modal');
      }
      zone.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) { multiTouch = true; return; }
        multiTouch = false;
        const t = e.touches[0];
        startX = t.clientX; startY = t.clientY; startTime = performance.now();
        dragging = true; movedY = 0; targetWasControl = !!isControl(e.target);
      }, { passive: true });
      zone.addEventListener('touchmove', (e) => {
        if (!dragging || multiTouch) return; const t = e.touches[0]; movedY = Math.max(movedY, Math.abs(t.clientY - startY));
      }, { passive: true });
      zone.addEventListener('touchend', (e) => {
        if (!dragging || multiTouch) { dragging = false; return; }
        dragging = false; if (targetWasControl) return; const dt = performance.now() - startTime; if (dt > MAX_DURATION) return;
        const end = e.changedTouches[0]; const dx = end.clientX - startX; const dy = end.clientY - startY;
        if (Math.abs(dx) < MIN_X) return; if (Math.abs(dy) > Math.abs(dx) * MAX_ANGLE_TAN) return; if (movedY > MAX_PREF_SCROLL_Y) return;
        if (dx < 0) { app.navigatePerformanceSong(1); } else { app.navigatePerformanceSong(-1); }
      }, { passive: true });
    })();

    app.init();
});
