/**
 * js/db.js - IndexedDB 本地存储封装
 */
const DB = {
    dbName: 'DouyinTextFXDB',
    storeName: 'projects',
    db: null,

    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    },

    saveProject(data) {
        return new Promise((resolve, reject) => {
            if (!this.db) return resolve();
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put({ id: 'current_project', ...data, updatedAt: new Date() });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    loadProject() {
        return new Promise((resolve, reject) => {
            if (!this.db) return resolve(null);
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get('current_project');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
};
