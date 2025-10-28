document.addEventListener('DOMContentLoaded', () => {
  // ==== TOAST (minimal) ====
  function showToast(message, type = 'success', timeout = 2000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type} show`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(0)'; });
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; setTimeout(() => toast.remove(), 300); }, timeout);
  }

  // ==== SIMPLE ESCAPER (avoid XSS in titles) ====
  function escapeHtml(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ==== DATA ACCESS (localStorage) ====
  const Store = {
    getSongs() {
      try { const arr = JSON.parse(localStorage.getItem('songs') || '[]'); return Array.isArray(arr) ? arr : []; } catch { return []; }
    },
    getSetlists() {
      try { const arr = JSON.parse(localStorage.getItem('setlists') || '[]'); return Array.isArray(arr) ? arr : []; } catch { return []; }
    }
  };

  const app = {
    performanceMode: document.getElementById('performance-mode'),
    performanceSongInfo: document.getElementById('performance-song-info'),
    lyricsDisplay: document.getElementById('lyrics-display'),
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

    songs: [],
    setlists: [],
    performanceSetlistId: null,
    performanceSongs: [],
    currentPerformanceSongIndex: 0,
    autoScrollTimer: null,
    autoScrollDelayTimer: null,
    autoScrollSpeed: Number(localStorage.getItem('autoscrollSpeed')) || 1,
    autoscrollDelay: Number(localStorage.getItem('autoscrollDelay')) || 3,
    autoScrollActive: false,
    showChords: (localStorage.getItem('perfShowChords') || '0') === '1',
    fontSize: 32,
    perSongFontSizes: JSON.parse(localStorage.getItem('perSongFontSizes') || '{}'),
    minFontSize: 16,
    maxFontSize: 72,
    fontSizeStep: 1,

    init() {
      this.songs = Store.getSongs();
      this.setlists = Store.getSetlists();
      try { this.performanceSetlistId = localStorage.getItem('performanceSetlistId') || null; } catch {}
      this.buildPerformanceQueue();
      // If a lastPerformance exists and matches setlist, set index
      try {
        const last = JSON.parse(localStorage.getItem('lastPerformance')||'null');
        if (last && last.setlistId && last.songIndex != null && last.setlistId === this.performanceSetlistId) {
          this.currentPerformanceSongIndex = Math.max(0, Math.min(this.performanceSongs.length-1, Number(last.songIndex)||0));
        }
      } catch {}
      this.setupEventListeners();
      this.displayCurrentPerformanceSong();
      this.initSwipeNav();
      this.initFontControlsMobile();
    },

    buildPerformanceQueue() {
      let listSongs = [];
      if (this.performanceSetlistId) {
        const s = this.setlists.find(x => x.id === this.performanceSetlistId);
        if (s) listSongs = s.songs.map(id => this.songs.find(sn => sn.id === id)).filter(Boolean);
      }
      if (!listSongs.length) listSongs = this.songs.slice().sort((a,b)=>a.title.localeCompare(b.title));
      this.performanceSongs = listSongs.map(s => ({ id: s.id, title: s.title, lyrics: String(s.lyrics||''), chords: String(s.chords||'') }));
      this.currentPerformanceSongIndex = 0;
    },

    mergeLyricsAndChords(song) {
      const lyrics = String(song.lyrics || '').replace(/\r\n?/g,'\n');
      const chords = String(song.chords || '').replace(/\r\n?/g,'\n');
      if (!chords.trim()) return lyrics;
      const ll = lyrics.split('\n'); const cl = chords.split('\n');
      return ll.map((line,i) => (cl[i] && cl[i].trim() ? cl[i] + '\n' + line : line)).join('\n');
    },

    setupEventListeners() {
      this.decreaseFontBtn.addEventListener('click', () => this.adjustFontSize(-this.fontSizeStep));
      this.increaseFontBtn.addEventListener('click', () => this.adjustFontSize(this.fontSizeStep));
      this.toggleThemeBtn.addEventListener('click', () => this.toggleTheme());
      this.exitPerformanceBtn.addEventListener('click', () => this.exitPerformance());
      this.prevSongBtn.addEventListener('click', () => this.navigate(-1));
      this.nextSongBtn.addEventListener('click', () => this.navigate(1));
      this.scrollToTopBtn.addEventListener('click', () => this.lyricsDisplay.scrollTo({ top: 0, behavior: 'smooth' }));
      this.autoScrollBtn.addEventListener('click', () => this.toggleAutoScroll());
      const toggleChordsBtn = document.getElementById('toggle-chords-btn');
      toggleChordsBtn?.addEventListener('click', () => {
        this.showChords = !this.showChords;
        localStorage.setItem('perfShowChords', this.showChords ? '1' : '0');
        this.displayCurrentPerformanceSong();
      });
      this.autoscrollSettingsBtn.addEventListener('click', () => {
        this.autoscrollDelayModal.style.display = 'block';
        this.autoscrollDelaySlider.value = this.autoscrollDelay;
        this.autoscrollDelayValue.textContent = this.autoscrollDelay + 's';
        this.autoscrollSpeedSlider.value = this.autoScrollSpeed;
        this.autoscrollSpeedValue.textContent = this.autoScrollSpeed;
      });
      this.autoscrollDelaySlider.addEventListener('input', (e) => { this.autoscrollDelayValue.textContent = e.target.value + 's'; });
      this.autoscrollSpeedSlider.addEventListener('input', (e) => { this.autoscrollSpeedValue.textContent = e.target.value; });
      this.closeAutoscrollDelayModal.addEventListener('click', () => {
        this.autoscrollDelay = Number(this.autoscrollDelaySlider.value);
        localStorage.setItem('autoscrollDelay', this.autoscrollDelay);
        this.autoScrollSpeed = Number(this.autoscrollSpeedSlider.value);
        localStorage.setItem('autoscrollSpeed', this.autoScrollSpeed);
        this.autoscrollDelayModal.style.display = 'none';
      });
      this.lyricsDisplay.addEventListener('scroll', () => this.updateScrollButtonsVisibility());
      this.lyricsDisplay.addEventListener('touchstart', () => this.stopAutoScroll());
      this.lyricsDisplay.addEventListener('mousedown', () => this.stopAutoScroll());

      // Keyboard controls: ←/→ navigate, Space toggles autoscroll, +/- font size
      document.addEventListener('keydown', (e) => {
        if (e.target && (/input|textarea|select/i.test(e.target.tagName))) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); this.navigate(-1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); this.navigate(1); }
        else if (e.key === ' ') { e.preventDefault(); this.toggleAutoScroll(); }
        else if (e.key === '+') { e.preventDefault(); this.adjustFontSize(this.fontSizeStep); this.resetFontControlsHideTimer?.(); }
        else if (e.key === '-') { e.preventDefault(); this.adjustFontSize(-this.fontSizeStep); this.resetFontControlsHideTimer?.(); }
      });
    },

    initFontControlsMobile() {
      const controls = this.fontControlsEl || document.getElementById('font-controls');
      if (!controls) return;
      const isMobile = window.innerWidth <= 1024;
      if (!isMobile) {
        controls.classList.add('visible');
        if (this.fontFab && this.fontFab.parentNode) this.fontFab.parentNode.removeChild(this.fontFab);
        this.fontFab = null;
        this.clearFontControlsHideTimer?.();
        return;
      }
      controls.classList.remove('visible');
      if (!this.fontFab) {
        const btn = document.createElement('button');
        btn.className = 'font-fab';
        btn.title = 'Font controls';
        btn.innerHTML = '<i class="fas fa-text-height"></i>';
        document.body.appendChild(btn);
        btn.addEventListener('click', () => this.showFontControls());
        this.fontFab = btn;
      }
      if (!this._fontOutsideHandler) {
        this._fontOutsideHandler = (e) => {
          if (!controls.classList.contains('visible')) return;
          if (controls.contains(e.target)) return;
          if (this.fontFab && this.fontFab.contains(e.target)) return;
          this.hideFontControls();
        };
        document.addEventListener('click', this._fontOutsideHandler);
      }
      const reset = () => this.resetFontControlsHideTimer();
      controls.addEventListener('mousemove', reset);
      controls.addEventListener('touchstart', reset, { passive: true });
    },
    showFontControls() {
      const controls = this.fontControlsEl || document.getElementById('font-controls');
      if (!controls) return;
      controls.classList.add('visible');
      if (this.fontFab) this.fontFab.classList.add('hidden');
      this.resetFontControlsHideTimer();
    },
    hideFontControls() {
      const controls = this.fontControlsEl || document.getElementById('font-controls');
      if (!controls) return;
      controls.classList.remove('visible');
      if (this.fontFab) this.fontFab.classList.remove('hidden');
      this.clearFontControlsHideTimer();
    },
    resetFontControlsHideTimer() {
      this.clearFontControlsHideTimer();
      this._fontControlsTimer = setTimeout(() => this.hideFontControls(), 4000);
    },
    clearFontControlsHideTimer() {
      if (this._fontControlsTimer) { clearTimeout(this._fontControlsTimer); this._fontControlsTimer = null; }
    },

    displayCurrentPerformanceSong() {
      const song = this.performanceSongs[this.currentPerformanceSongIndex]; if (!song) return;
      const content = this.showChords ? this.mergeLyricsAndChords(song) : String(song.lyrics||'');
      let lines = content.split('\n').map(l=>l.trim());
      const normTitle = String(song.title||'').trim().toLowerCase();
      let removed = 0; while (lines.length && removed < 2) { if (!lines[0] || lines[0].toLowerCase() === normTitle) { lines.shift(); removed++; } else break; }
      this.performanceSongInfo.innerHTML = `<h2>${escapeHtml(song.title)}</h2><div class="song-progress">${this.currentPerformanceSongIndex+1} / ${this.performanceSongs.length}</div>`;
      this.lyricsDisplay.textContent = lines.join('\n');
      const fs = (typeof this.perSongFontSizes[song.id] === 'number') ? this.perSongFontSizes[song.id] : this.fontSize;
      this.fontSize = fs; this.updateFontSize();
      this.prevSongBtn.style.display = this.currentPerformanceSongIndex > 0 ? 'block' : 'none';
      this.nextSongBtn.style.display = this.currentPerformanceSongIndex < this.performanceSongs.length - 1 ? 'block' : 'none';
      this.stopAutoScroll(); this.updateAutoScrollButton(); this.autoScrollBtn.blur();
    },

    adjustFontSize(amount) {
      this.fontSize = Math.max(this.minFontSize, Math.min(this.maxFontSize, this.fontSize + amount));
      this.updateFontSize();
      const song = this.performanceSongs[this.currentPerformanceSongIndex];
      if (song && song.id) {
        this.perSongFontSizes[song.id] = this.fontSize;
        localStorage.setItem('perSongFontSizes', JSON.stringify(this.perSongFontSizes));
      }
    },
    updateFontSize() {
      if (this.lyricsDisplay) this.lyricsDisplay.style.fontSize = this.fontSize + 'px';
      if (this.fontSizeDisplay) this.fontSizeDisplay.textContent = `${Math.round(this.fontSize)}px`;
      setTimeout(() => this.updateScrollButtonsVisibility(), 100);
    },

    navigate(dir) {
      const idx = this.currentPerformanceSongIndex + dir;
      if (idx >= 0 && idx < this.performanceSongs.length) { this.currentPerformanceSongIndex = idx; this.displayCurrentPerformanceSong(); }
    },

    toggleTheme() {
      const cur = document.documentElement.dataset.theme || (localStorage.getItem('theme')||'default-dark');
      const next = /dark/i.test(cur) ? cur.replace(/dark/i,'light') : cur.replace(/light/i,'dark');
      const target = next || (cur.includes('dark') ? 'default-light' : 'default-dark');
      document.documentElement.dataset.theme = target; localStorage.setItem('theme', target);
    },
    exitPerformance() {
      try { localStorage.setItem('lastPerformance', JSON.stringify({ setlistId: this.performanceSetlistId, index: this.currentPerformanceSongIndex, t: Date.now() })); } catch {}
      window.location.href = '../index.html#performance';
    },

    startAutoScroll() {
      this.stopAutoScroll(); const c = this.lyricsDisplay; if (!c) return; if (c.scrollHeight <= c.clientHeight) return;
      this.autoScrollActive = true;
      this.autoScrollDelayTimer = setTimeout(() => {
        this.autoScrollTimer = setInterval(() => {
          if (!this.autoScrollActive) return;
          if (c.scrollTop + c.clientHeight >= c.scrollHeight - 2) { this.stopAutoScroll(); return; }
          c.scrollTop += this.autoScrollSpeed;
        }, 50);
      }, this.autoscrollDelay * 1000);
      this.updateAutoScrollButton();
    },
    stopAutoScroll() {
      this.autoScrollActive = false;
      if (this.autoScrollTimer) { clearInterval(this.autoScrollTimer); this.autoScrollTimer = null; }
      if (this.autoScrollDelayTimer) { clearTimeout(this.autoScrollDelayTimer); this.autoScrollDelayTimer = null; }
      this.updateAutoScrollButton();
    },
    toggleAutoScroll() { if (this.autoScrollActive) this.stopAutoScroll(); else this.startAutoScroll(); },
    updateAutoScrollButton() { this.autoScrollBtn.innerHTML = this.autoScrollActive ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-angle-double-down"></i>'; },
    updateScrollButtonsVisibility() {
      const c = this.lyricsDisplay; if (!c) return;
      const needs = c.scrollHeight > c.clientHeight; const has = c.scrollTop > 2;
      if (has) this.scrollToTopBtn.classList.remove('invisible'); else this.scrollToTopBtn.classList.add('invisible');
      this.autoScrollBtn.style.display = needs ? 'flex' : 'none'; if (!needs) this.stopAutoScroll();
    },

    initSwipeNav() {
      const zone = document.getElementById('lyrics-display'); if (!zone) return;
      let startX=0, startY=0, startTime=0, dragging=false, movedY=0, multi=false, targetWasControl=false;
      const MIN_X = 60; const MAX_TAN = Math.tan(30 * Math.PI / 180); const MAX_DUR = 600; const MAX_PREF_Y = 30;
      function isControl(el) { return el.closest('.performance-controls, .font-fab, #font-controls, .auto-scroll-btn, .scroll-to-top-btn, .modal'); }
      zone.addEventListener('touchstart', (e)=>{ if(e.touches.length!==1){ multi=true; return;} multi=false; const t=e.touches[0]; startX=t.clientX; startY=t.clientY; startTime=performance.now(); dragging=true; movedY=0; targetWasControl=!!isControl(e.target); }, {passive:true});
      zone.addEventListener('touchmove', (e)=>{ if(!dragging||multi) return; const t=e.touches[0]; movedY=Math.max(movedY, Math.abs(t.clientY-startY)); }, {passive:true});
      zone.addEventListener('touchend', (e)=>{ if(!dragging||multi){ dragging=false; return;} dragging=false; if(targetWasControl) return; const dt=performance.now()-startTime; if(dt>MAX_DUR) return; const end=e.changedTouches[0]; const dx=end.clientX-startX; const dy=end.clientY-startY; if(Math.abs(dx)<MIN_X) return; if(Math.abs(dy)>Math.abs(dx)*MAX_TAN) return; if(movedY>MAX_PREF_Y) return; if(dx<0) this.navigate(1); else this.navigate(-1); }, {passive:true});
    }
  };

  app.init();
});
