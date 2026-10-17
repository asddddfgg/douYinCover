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

    async function addBackdrop(name, dataUrl) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('backdrops', 'readwrite');
            const req = tx.objectStore('backdrops').add({
                name: name,
                dataUrl: dataUrl,
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

    return { addBackdrop, getAllBackdrops, getBackdropById, deleteBackdrop };
})();