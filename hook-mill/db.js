// db.js
(function(){
  const DB_NAME = 'hook-mill';
  const DB_VERSION = 1;
  const STORE = 'library';

  const openDB = () => new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { resolve(null); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('createdAt', 'createdAt', { unique: false });
        os.createIndex('starred', 'starred', { unique: false });
        os.createIndex('model', 'model', { unique: false });
        os.createIndex('tags', 'tags', { multiEntry: true });
        os.createIndex('hash', 'hash', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null); // fallback later
  });

  const localKey = (id='') => `HM_LIB_${id}`;

  const Lib = {
    async put(item){
      const db = await openDB();
      if (!db){ // fallback localStorage
        localStorage.setItem(localKey(item.id), JSON.stringify(item));
        return item.id;
      }
      return new Promise((resolve,reject)=>{
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(item);
        tx.oncomplete=()=>resolve(item.id);
        tx.onerror=()=>reject(tx.error);
      });
    },
    async get(id){
      const db = await openDB();
      if (!db){
        const raw = localStorage.getItem(localKey(id));
        return raw ? JSON.parse(raw) : null;
      }
      return new Promise((resolve,reject)=>{
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(id);
        req.onsuccess=()=>resolve(req.result||null);
        req.onerror=()=>reject(req.error);
      });
    },
    async delete(id){
      const db = await openDB();
      if (!db){ localStorage.removeItem(localKey(id)); return; }
      return new Promise((resolve,reject)=>{
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete=()=>resolve();
        tx.onerror=()=>reject(tx.error);
      });
    },
    async list(){
      const db = await openDB();
      if (!db){
        const arr=[];
        for (let i=0;i<localStorage.length;i++){
          const k=localStorage.key(i);
          if (k && k.startsWith('HM_LIB_') && k !== 'HM_LIB_') {
            const v = localStorage.getItem(k);
            if (v) try { arr.push(JSON.parse(v)); } catch{}
          }
        }
        return arr.sort((a,b)=>b.createdAt-a.createdAt);
      }
      return new Promise((resolve,reject)=>{
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>b.createdAt-a.createdAt));
        req.onerror=()=>reject(req.error);
      });
    },
    async byHash(hash){
      const db = await openDB();
      if (!db){
        const list = await Lib.list();
        return list.filter(x=>x.hash===hash);
      }
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readonly');
        const idx=tx.objectStore(STORE).index('hash');
        const req=idx.getAll(hash);
        req.onsuccess=()=>resolve(req.result||[]);
        req.onerror=()=>reject(req.error);
      });
    },
    async clearAll(){
      const db = await openDB();
      if (!db){
        const keys=[];
        for (let i=0;i<localStorage.length;i++){
          const k=localStorage.key(i);
          if (k && (k.startsWith('HM_LIB_') || k.startsWith('HM_SETTINGS_'))) keys.push(k);
        }
        keys.forEach(k=>localStorage.removeItem(k));
        return;
      }
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete=()=>resolve();
        tx.onerror=()=>reject(tx.error);
      });
      // also clean settings
      Object.keys(localStorage).forEach(k=>{
        if (k.startsWith('HM_SETTINGS_')) localStorage.removeItem(k);
      });
    }
  };

  window.HookMillDB = Lib;
})();