// Database & Presets
const DB = { presets: [] };

// ============================================================
// 底衬自定义上传存储（IndexedDB，永久保存）
// ============================================================
const BackdropDB = (function () {
    let dbPromise = null;
    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open('douyin_backdrops_db', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('backdrops')) {
                    db.createObjectStore('backdrops', { keyPath: 'id', autoIncrement: true });
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e);
        });
        return dbPromise;
    }

            async function addBackdrop(name, dataUrl, isMask = false) {          // ⭐ 加了第三个参数
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('backdrops', 'readwrite');
        const req = tx.objectStore('backdrops').add({
            name: name,
            dataUrl: dataUrl,
            isMask: !!isMask,                                         // ⭐ 新增这行
            createdAt: Date.now()
        });
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e);
    });
}

    async function getAllBackdrops() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('backdrops', 'readonly');
            const req = tx.objectStore('backdrops').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = (e) => reject(e);
        });
    }

    async function getBackdropById(id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('backdrops', 'readonly');
            const req = tx.objectStore('backdrops').get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = (e) => reject(e);
        });
    }

    async function deleteBackdrop(id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('backdrops', 'readwrite');
            const req = tx.objectStore('backdrops').delete(id);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e);
        });
    }


       async function upsertBackdropByName(name, dataUrl, isMask = true) {   // ⭐ 加参数，默认 true
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('backdrops', 'readwrite');
        const store = tx.objectStore('backdrops');
        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => {
            const all = getAllReq.result || [];
            const existing = all.find(it => it.name === name);
            if (existing) {
                existing.dataUrl = dataUrl;
                existing.isMask = !!isMask;                            // ⭐ 覆盖时更新 isMask
                existing.createdAt = existing.createdAt || Date.now();
                const putReq = store.put(existing);
                putReq.onsuccess = () => resolve(existing.id);
                putReq.onerror = (e) => reject(e);
            } else {
                const addReq = store.add({
                    name: name,
                    dataUrl: dataUrl,
                    isMask: !!isMask,                                  // ⭐ 新增时带上 isMask
                    createdAt: Date.now()
                });
                addReq.onsuccess = () => resolve(addReq.result);
                addReq.onerror = (e) => reject(e);
            }
        };
        getAllReq.onerror = (e) => reject(e);
    });
}



        return { addBackdrop, getAllBackdrops, getBackdropById, deleteBackdrop, upsertBackdropByName };
})();



// ============================================================
// 特效库 IndexedDB 存储（替代 localStorage 的 douyin_custom_effects_v3）
// ============================================================
const EffectsDB = (function () {
    const DB_NAME = 'douyin_effects_db';
    const STORE = 'effects';
    let dbPromise = null;

    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e);
        });
        return dbPromise;
    }

    async function getAllEffects() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = (e) => reject(e);
        });
    }

    async function putEffect(effect) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            const req = tx.objectStore(STORE).put(effect);
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e);
        });
    }

    async function deleteEffect(id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            const req = tx.objectStore(STORE).delete(id);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e);
        });
    }

    async function clearAll() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            const req = tx.objectStore(STORE).clear();
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e);
        });
    }

    return { getAllEffects, putEffect, deleteEffect, clearAll };
})();
window.EffectsDB = EffectsDB;