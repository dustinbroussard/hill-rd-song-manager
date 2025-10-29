// Minimal IndexedDB bridge for the editor to share songs with the main app
// Requires ../lib/idb.min.js to be loaded first

(function(){
  const DB_NAME = 'hrr-setlist-db';
  const DB_VERSION = 1;
  let _db;

  async function open() {
    if (_db) return _db;
    // Mirror main app schema as closely as possible
    _db = await idb.openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('songs')) {
          const songs = db.createObjectStore('songs', { keyPath: 'id' });
          try { songs.createIndex('title', 'title', { unique: false }); } catch {}
        }
        if (!db.objectStoreNames.contains('setlists')) {
          const setlists = db.createObjectStore('setlists', { keyPath: 'id' });
          try { setlists.createIndex('name', 'name', { unique: false }); } catch {}
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta');
        }
      }
    });
    return _db;
  }

  async function getAllSongs() {
    const db = await open();
    const rows = await db.getAll('songs');
    return Array.isArray(rows) ? rows : [];
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

  window.EditorDB = { getAllSongs, putSong, putSongs, deleteSong };
})();

