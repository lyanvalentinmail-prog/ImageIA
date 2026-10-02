/* ============================================================
   ImageIA — db.js
   Persistencia local de la galería/historial (IndexedDB).
   Guarda cada imagen como Blob + sus metadatos.
   Si IndexedDB no está disponible (navegador privado, iframes
   restringidos…) cae a un almacén en memoria para la sesión.
   ============================================================ */
(function () {
  'use strict';

  const DB_NAME = 'imageia-db';
  const DB_VERSION = 1;
  const STORE = 'items';

  let db = null;
  let memory = null;      /* Map id -> registro (fallback) */
  let available = false;

  function init() {
    if (memory) return Promise.resolve();
    return new Promise(function (resolve) {
      if (typeof indexedDB === 'undefined' || !indexedDB || typeof indexedDB.open !== 'function') {
        memory = new Map();
        resolve();
        return;
      }
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        memory = new Map();
        resolve();
        return;
      }
      req.onupgradeneeded = function (ev) {
        const d = ev.target.result;
        if (!d.objectStoreNames.contains(STORE)) {
          const os = d.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = function (ev) {
        db = ev.target.result;
        available = true;
        resolve();
      };
      req.onerror = function () { memory = new Map(); resolve(); };
      req.onblocked = function () { memory = new Map(); resolve(); };
    });
  }

  function ensureReady() {
    if (!db && !memory) memory = new Map();
  }

  function tx(mode) {
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  function add(record) {
    ensureReady();
    if (memory || !available) { memory.set(record.id, record); return Promise.resolve(record); }
    return new Promise(function (resolve, reject) {
      const r = tx('readwrite').add(record);
      r.onsuccess = () => resolve(record);
      r.onerror = () => reject(r.error || new Error('Error al guardar'));
    });
  }

  function put(record) {
    ensureReady();
    if (memory || !available) { memory.set(record.id, record); return Promise.resolve(record); }
    return new Promise(function (resolve, reject) {
      const r = tx('readwrite').put(record);
      r.onsuccess = () => resolve(record);
      r.onerror = () => reject(r.error || new Error('Error al guardar'));
    });
  }

  function list() {
    ensureReady();
    if (memory || !available) {
      const items = Array.from(memory.values());
      items.sort(function (a, b) { return b.createdAt - a.createdAt; });
      return Promise.resolve(items);
    }
    return new Promise(function (resolve, reject) {
      const r = tx('readonly').getAll();
      r.onsuccess = () => {
        const items = r.result || [];
        items.sort(function (a, b) { return b.createdAt - a.createdAt; });
        resolve(items);
      };
      r.onerror = () => reject(r.error || new Error('Error al leer'));
    });
  }

  function remove(id) {
    ensureReady();
    if (memory || !available) { memory.delete(id); return Promise.resolve(); }
    return new Promise(function (resolve, reject) {
      const r = tx('readwrite').delete(id);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error || new Error('Error al borrar'));
    });
  }

  function clear() {
    ensureReady();
    if (memory || !available) { memory.clear(); return Promise.resolve(); }
    return new Promise(function (resolve, reject) {
      const r = tx('readwrite').clear();
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error || new Error('Error al vaciar'));
    });
  }

  window.Store = {
    init: init,
    add: add,
    put: put,
    list: list,
    remove: remove,
    clear: clear,
    get isPersistent() { return available && !memory; }
  };
})();
