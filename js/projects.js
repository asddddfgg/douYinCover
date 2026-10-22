// ============================================================
// projects.js — 本地项目管理（IndexedDB）
// ============================================================

const ProjectDB = (function () {
    const DB_NAME = 'douyin_cover_projects_db';
    const STORE = 'projects';
    let dbPromise = null;

    function open() {
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

    async function put(project) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(project);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e);
        });
    }
    async function getAll() {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = (e) => reject(e);
        });
    }
    async function get(id) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = (e) => reject(e);
        });
    }
    async function remove(id) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e);
        });
    }
    return { put, getAll, get, remove };
})();

const ProjectManager = (function () {
    const AUTOSAVE_KEY = 'douyin_autosave_project_id';
    let currentProjectId = null;
    let currentProjectName = '未命名项目';
    let autosaveTimer = null;
    let isDirty = false;
    let suspendAutosave = false;

    function serializeState() {
        return {
            background: JSON.parse(JSON.stringify(state.background)),
            pages: JSON.parse(JSON.stringify(state.pages)),
            currentPageId: state.currentPageId,
            guides: JSON.parse(JSON.stringify(state.guides || [])),
            snapEnabled: state.snapEnabled !== false
        };
    }

    function captureThumbnail() {
        return new Promise((resolve) => {
            const wrapper = document.querySelector(`.canvas-page-wrapper[data-page-id="${state.currentPageId}"]`);
            if (!wrapper || typeof html2canvas === 'undefined') return resolve('');
            const canvasNode = wrapper.querySelector('.cover-canvas');
            if (!canvasNode) return resolve('');
            const selected = canvasNode.querySelectorAll('.canvas-layer.selected');
            selected.forEach(el => el.classList.remove('selected'));
            const wrapActive = wrapper.classList.contains('active-page');
            wrapper.classList.remove('active-page');
            const oldShadow = canvasNode.style.boxShadow;
            canvasNode.style.boxShadow = 'none';
            html2canvas(canvasNode, { scale: 0.35, useCORS: true, allowTaint: true, backgroundColor: null })
                .then(c => {
                    selected.forEach(el => el.classList.add('selected'));
                    if (wrapActive) wrapper.classList.add('active-page');
                    canvasNode.style.boxShadow = oldShadow;
                    resolve(c.toDataURL('image/jpeg', 0.7));
                })
                .catch(() => {
                    selected.forEach(el => el.classList.add('selected'));
                    if (wrapActive) wrapper.classList.add('active-page');
                    canvasNode.style.boxShadow = oldShadow;
                    resolve('');
                });
        });
    }


    // ✅ 关闭页面/刷新专用：纯数据写入，不截图，能赶在 beforeunload 前完成
    function saveSync() {
        if (!state) return;
        const now = Date.now();
        if (!currentProjectId) currentProjectId = 'proj-' + now;
        // 复用已有缩略图（避免关页面时再跑 html2canvas 被杀掉）
        ProjectDB.get(currentProjectId).then(existing => {
            const record = {
                id: currentProjectId,
                name: currentProjectName,
                thumbnail: existing?.thumbnail || '',
                updatedAt: now,
                createdAt: existing?.createdAt || now,
                data: serializeState()
            };
            // 不 await，但 IndexedDB 的 put 事务在页面卸载前通常会完成
            ProjectDB.put(record).catch(() => {});
            localStorage.setItem(AUTOSAVE_KEY, currentProjectId);
            isDirty = false;
        }).catch(() => {
            // 读不到旧记录也照样存
            const record = {
                id: currentProjectId,
                name: currentProjectName,
                thumbnail: '',
                updatedAt: now,
                createdAt: now,
                data: serializeState()
            };
            ProjectDB.put(record).catch(() => {});
            localStorage.setItem(AUTOSAVE_KEY, currentProjectId);
            isDirty = false;
        });
    }





    async function save(silent = false) {
        if (!state) return;
        const thumb = await captureThumbnail();
        const now = Date.now();
        if (!currentProjectId) currentProjectId = 'proj-' + now;
        const existing = await ProjectDB.get(currentProjectId);
        const record = {
            id: currentProjectId,
            name: currentProjectName,
            thumbnail: thumb,
            updatedAt: now,
            createdAt: existing?.createdAt || now,
            data: serializeState()
        };
        await ProjectDB.put(record);
        isDirty = false;
        localStorage.setItem(AUTOSAVE_KEY, currentProjectId);
        updateProjectTitleUI();
        if (!silent) showProjectToast('项目已保存 ✓');
    }

    async function saveAs() {
        const name = prompt('请输入新项目名称：', currentProjectName + ' 副本');
        if (!name) return;
        currentProjectId = 'proj-' + Date.now();
        currentProjectName = name.trim();
        await save();
    }

    async function newProject() {
        const ok = confirm('新建项目会先保存当前项目，然后清空画布开始新项目。是否继续？');
        if (!ok) return;
        if (isDirty) await save(true);
        currentProjectId = null;
        currentProjectName = '未命名项目';

        state.background = JSON.parse(JSON.stringify(window.DEFAULT_BACKGROUND));
        state.pages = [{
            id: 'page-1',
            title: '第 1 页',
            layers: [{
                id: 'layer-1', type: 'text', content: '双击插入光标编辑文本',
                fontSize: '32px', fontFamily: 'sans-serif', color: '#ffffff',
                bgColor: 'transparent', bold: true, italic: false, underline: false,
                strike: false, align: 'center', vertical: false,
                letterSpacing: 0, lineHeight: 1.2, opacity: 1,
                effectClass: 'effect-viral', x: 30, y: 200, width: 300, height: 120,
                rotation: 0, flipH: false, flipV: false
            }]
        }];
        state.currentPageId = 'page-1';
        state.selectedLayerId = 'layer-1';
        state.selectedLayerIds = ['layer-1'];
        state.editingLayerId = null;
        state.guides = [];
        state.snapEnabled = true;
        state.history.stack = [];
        state.history.pointer = -1;
        state.history.record();

        if (typeof renderAll === 'function') renderAll();
        updateProjectTitleUI();
        showProjectToast('已新建项目');
    }

    async function openProject(id) {
        const proj = await ProjectDB.get(id);
        if (!proj) return;
        if (isDirty) {
            const ok = confirm('当前项目有未保存修改，是否先保存？');
            if (ok) await save(true);
        }
        suspendAutosave = true;
                state.background = normalizeBackground(JSON.parse(JSON.stringify(proj.data.background)));
        state.pages = JSON.parse(JSON.stringify(proj.data.pages));
        state.currentPageId = proj.data.currentPageId || state.pages[0]?.id;
        state.guides = JSON.parse(JSON.stringify(proj.data.guides || []));
        state.snapEnabled = proj.data.snapEnabled !== false;
        state.selectedLayerIds = [];
        state.selectedLayerId = null;
        state.editingLayerId = null;
        state.history.stack = [];
        state.history.pointer = -1;
        state.history.record();

        currentProjectId = proj.id;
        currentProjectName = proj.name;
        isDirty = false;
        localStorage.setItem(AUTOSAVE_KEY, proj.id);

        if (typeof renderAll === 'function') renderAll();
        if (window.Guides) Guides.renderGuides();
        closeProjectPanel();
        updateProjectTitleUI();
        showProjectToast(`已打开「${proj.name}」`);
        setTimeout(() => { suspendAutosave = false; }, 500);
    }

    async function duplicateProject(id) {
        const proj = await ProjectDB.get(id);
        if (!proj) return;
        const copy = {
            ...proj,
            id: 'proj-' + Date.now(),
            name: proj.name + ' 副本',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        await ProjectDB.put(copy);
        renderProjectList();
        showProjectToast('项目已复制');
    }

    async function renameProject(id) {
        const proj = await ProjectDB.get(id);
        if (!proj) return;
        const name = prompt('输入新名称：', proj.name);
        if (!name) return;
        proj.name = name.trim();
        proj.updatedAt = Date.now();
        await ProjectDB.put(proj);
        if (id === currentProjectId) {
            currentProjectName = proj.name;
            updateProjectTitleUI();
        }
        renderProjectList();
    }

    async function deleteProject(id) {
        const proj = await ProjectDB.get(id);
        if (!proj) return;
        if (!confirm(`确定删除项目「${proj.name}」？该操作不可恢复。`)) return;
        await ProjectDB.remove(id);
        if (id === currentProjectId) {
            currentProjectId = null;
            currentProjectName = '未命名项目';
            updateProjectTitleUI();
        }
        renderProjectList();
    }

    function markDirty() { isDirty = true; }

    function scheduleAutosave() {
        if (suspendAutosave) return;
        if (autosaveTimer) clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(async () => {
            if (isDirty) {
                await save(true);
                const hint = document.getElementById('autosave-hint');
                if (hint) hint.textContent = '已自动保存 ' + new Date().toLocaleTimeString();
            }
        }, 3000);
    }

    function hookStateChange() {
        if (state.__projectHooked) return;
        state.__projectHooked = true;
        const origSaveState = state.saveState.bind(state);
        state.saveState = function () {
            origSaveState();
            markDirty();
            scheduleAutosave();
        };
    }

    function updateProjectTitleUI() {
        const el = document.getElementById('project-title');
        if (el) el.textContent = currentProjectName;
    }

    let toastTimer = null;
    function showProjectToast(msg) {
        let el = document.getElementById('project-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'project-toast';
            el.className = 'bg-toast';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        void el.offsetWidth;
        el.classList.add('show');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }

    function openProjectPanel() {
        const panel = document.getElementById('project-panel');
        if (!panel) return;
        panel.style.display = 'flex';
        renderProjectList();
    }
    function closeProjectPanel() {
        const panel = document.getElementById('project-panel');
        if (panel) panel.style.display = 'none';
    }

    async function renderProjectList() {
        const list = document.getElementById('project-list');
        if (!list) return;
        list.innerHTML = '<div class="project-empty">加载中…</div>';
        const items = await ProjectDB.getAll();
        items.sort((a, b) => b.updatedAt - a.updatedAt);
        list.innerHTML = '';
        if (items.length === 0) {
            list.innerHTML = '<div class="project-empty">还没有保存过项目<br><small>点「保存」或「另存为」创建第一个项目</small></div>';
            return;
        }
        const currentId = currentProjectId;
        items.forEach(proj => {
            const card = document.createElement('div');
            card.className = 'project-card' + (proj.id === currentId ? ' current' : '');
            card.innerHTML = `
                <div class="pc-thumb" style="${proj.thumbnail ? `background-image:url(${proj.thumbnail})` : ''}"></div>
                <div class="pc-info">
                    <div class="pc-name" title="${proj.name}">${proj.name}</div>
                    <div class="pc-time">${new Date(proj.updatedAt).toLocaleString()}</div>
                </div>
                <div class="pc-actions">
                    <button class="pc-btn" data-act="open" title="打开"><i class="fa-solid fa-folder-open"></i></button>
                    <button class="pc-btn" data-act="copy" title="复制"><i class="fa-solid fa-copy"></i></button>
                    <button class="pc-btn" data-act="rename" title="重命名"><i class="fa-solid fa-pen"></i></button>
                    <button class="pc-btn danger" data-act="delete" title="删除"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
            card.addEventListener('click', (e) => {
                const btn = e.target.closest('.pc-btn');
                if (!btn) {
                    if (e.target.closest('.pc-actions')) return;
                    openProject(proj.id);
                    return;
                }
                e.stopPropagation();
                const act = btn.dataset.act;
                if (act === 'open') openProject(proj.id);
                else if (act === 'copy') duplicateProject(proj.id);
                else if (act === 'rename') renameProject(proj.id);
                else if (act === 'delete') deleteProject(proj.id);
            });
            list.appendChild(card);
        });
    }

    function init() {
        hookStateChange();

        const btnProjects = document.getElementById('btn-projects');
        if (btnProjects) btnProjects.addEventListener('click', openProjectPanel);

        const btnClose = document.getElementById('project-panel-close');
        if (btnClose) btnClose.addEventListener('click', closeProjectPanel);
        const panel = document.getElementById('project-panel');
        if (panel) {
            panel.addEventListener('click', (e) => {
                if (e.target === panel) closeProjectPanel();
            });
        }

        const btnSave = document.getElementById('btn-save-project');
        if (btnSave) btnSave.addEventListener('click', () => save());
        const btnSaveAs = document.getElementById('btn-saveas-project');
        if (btnSaveAs) btnSaveAs.addEventListener('click', saveAs);
        const btnNew = document.getElementById('btn-new-project');
        if (btnNew) btnNew.addEventListener('click', newProject);

        const lastId = localStorage.getItem(AUTOSAVE_KEY);
        if (lastId) {
            ProjectDB.get(lastId).then(proj => {
                if (proj) {
                    currentProjectId = proj.id;
                    currentProjectName = proj.name;
                    updateProjectTitleUI();
                }
            }).catch(() => {});
        }
        updateProjectTitleUI();

        window.addEventListener('beforeunload', (e) => {
            if (isDirty && !suspendAutosave) {
                // ✅ 关页面/刷新：走同步纯数据保存（不截图），避免 html2canvas 被杀掉导致丢数据
                saveSync();
                // 不弹确认框，直接让浏览器正常卸载（数据已尽量同步写入）
            }
        });
    }

    return {
        init,
        save,
        saveSync,
        saveAs,
        newProject,
        openPanel: openProjectPanel,
        closePanel: closeProjectPanel,
        markDirty,
        scheduleAutosave,
        getCurrentId: () => currentProjectId,
        getName: () => currentProjectName
    };
})();

window.ProjectManager = ProjectManager;