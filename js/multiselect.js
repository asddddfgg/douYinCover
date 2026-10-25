// ============================================================
// multiselect.js — 多选、框选、整体拖拽、批量删除、方向键微调
// 依赖：state, renderCanvas, renderLayerList, updateTopToolbarUI
// ============================================================

const MultiSelect = (function () {
    let isBoxSelecting = false;
    let boxStart = { x: 0, y: 0 };
    let boxEl = null;
    let saveTimer = null;

    function getSelectedLayers() {
        const ids = state.selectedLayerIds || [];
        return state.layers.filter(l => ids.includes(l.id));
    }

    function syncPrimarySelected() {
        const ids = state.selectedLayerIds || [];
        if (ids.length === 0) {
            state.selectedLayerId = null;
        } else if (!ids.includes(state.selectedLayerId)) {
            state.selectedLayerId = ids[ids.length - 1];
        }
    }

    function selectOnly(id) {
        state.selectedLayerIds = id ? [id] : [];
        state.selectedLayerId = id || null;
    }

    function toggleSelect(id) {
        const ids = (state.selectedLayerIds || []).slice();
        const idx = ids.indexOf(id);
        if (idx >= 0) {
            ids.splice(idx, 1);
        } else {
            ids.push(id);
        }
        state.selectedLayerIds = ids;
        syncPrimarySelected();
    }

    function addToSelection(id) {
        const ids = (state.selectedLayerIds || []).slice();
        if (!ids.includes(id)) ids.push(id);
        state.selectedLayerIds = ids;
        state.selectedLayerId = id;
    }

    function isSelected(id) {
        return (state.selectedLayerIds || []).includes(id);
    }

    // ============ 框选 ============
    function initBoxSelection() {
        const container = document.querySelector('.canvas-container');
        if (!container) return;

        container.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (e.target.isContentEditable) return;
            if (e.target.closest('.canvas-layer')) return;
            if (e.target.closest('.custom-guide-line')) return;
            if (e.target.closest('.editing')) return;

            const canvas = e.target.closest('.cover-canvas');
            if (!canvas) return;
            if (state.editingLayerId) return;

            e.preventDefault();
            isBoxSelecting = true;

            const rect = canvas.getBoundingClientRect();
            boxStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };

            boxEl = document.createElement('div');
            boxEl.className = 'selection-box';
            canvas.appendChild(boxEl);
            boxEl.style.left = boxStart.x + 'px';
            boxEl.style.top = boxStart.y + 'px';
            boxEl.style.width = '0px';
            boxEl.style.height = '0px';

            document.addEventListener('mousemove', onBoxMove);
            document.addEventListener('mouseup', onBoxUp);
        });
    }

    function onBoxMove(e) {
        if (!isBoxSelecting || !boxEl) return;
        const canvas = boxEl.closest('.cover-canvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const x = Math.min(cx, boxStart.x);
        const y = Math.min(cy, boxStart.y);
        const w = Math.abs(cx - boxStart.x);
        const h = Math.abs(cy - boxStart.y);
        boxEl.style.left = x + 'px';
        boxEl.style.top = y + 'px';
        boxEl.style.width = w + 'px';
        boxEl.style.height = h + 'px';
    }

    function onBoxUp(e) {
        if (!isBoxSelecting) return;
        isBoxSelecting = false;
        document.removeEventListener('mousemove', onBoxMove);
        document.removeEventListener('mouseup', onBoxUp);

        if (!boxEl) return;
        const canvas = boxEl.closest('.cover-canvas');
        const boxRect = boxEl.getBoundingClientRect();
        boxEl.remove();
        boxEl = null;

        if (!canvas) return;
        if (boxRect.width < 4 || boxRect.height < 4) return;

        const mode = e.shiftKey ? 'add' : 'replace';
        const layers = state.layers;
        const selectedIds = [];

        layers.forEach(layer => {
            const el = canvas.querySelector(`.canvas-layer[data-id="${layer.id}"]`);
            if (!el) return;
            const r = el.getBoundingClientRect();
            const hit = !(r.right < boxRect.left || r.left > boxRect.right ||
                          r.bottom < boxRect.top || r.top > boxRect.bottom);
            if (hit) selectedIds.push(layer.id);
        });

        if (mode === 'replace') {
            state.selectedLayerIds = selectedIds.slice();
        } else {
            const merged = new Set([...(state.selectedLayerIds || []), ...selectedIds]);
            state.selectedLayerIds = Array.from(merged);
        }
        syncPrimarySelected();

        if (typeof renderCanvas === 'function') renderCanvas();
        if (typeof renderLayerList === 'function') renderLayerList();
        if (typeof updateTopToolbarUI === 'function') updateTopToolbarUI(state.getSelectedLayer());
    }

    // ============ 整体拖拽 ============
    function getDragLayers(primaryLayer) {
        if (!primaryLayer) return [];
        // ✅ 图层属于组：整组一起拖（排除锁定的）
        if (primaryLayer.groupId) {
            const memberIds = state.getGroupMemberIds(primaryLayer.id);
            const members = state.layers.filter(l => memberIds.includes(l.id) && !l.locked);
            if (members.length > 0) return members;
        }
        const sel = getSelectedLayers();
        if (sel.length > 1 && isSelected(primaryLayer.id)) {
            return sel.filter(l => !l.locked);
        }
        return primaryLayer.locked ? [] : [primaryLayer];
    }

    function captureInitialPositions(layers) {
        const map = new Map();
        layers.forEach(l => map.set(l.id, { x: l.x, y: l.y }));
        return map;
    }

    function applyMove(layers, initPositions, dx, dy, pageWrapperSelector) {
        layers.forEach(l => {
            const init = initPositions.get(l.id);
            if (!init) return;
            l.x = init.x + dx;
            l.y = init.y + dy;
            const el = document.querySelector(
                `${pageWrapperSelector} .canvas-layer[data-id="${l.id}"]`
            );
            if (el) {
                el.style.left = l.x + 'px';
                el.style.top = l.y + 'px';
            }
        });
    }

    // ============ 批量删除 ============
    function deleteSelected() {
        const ids = state.selectedLayerIds || [];
        if (ids.length === 0) return;
        state.getCurrentPage().layers = state.layers.filter(l => !ids.includes(l.id));
        state.selectedLayerIds = [];
        state.selectedLayerId = null;
        state.editingLayerId = null;
        state.saveState();
        if (typeof renderCanvas === 'function') renderCanvas();
        if (typeof renderLayerList === 'function') renderLayerList();
        if (typeof updateTopToolbarUI === 'function') updateTopToolbarUI(null);
    }

    // ============ 键盘 ============
    function initKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (e.target.isContentEditable) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if ((state.selectedLayerIds || []).length > 0 && !state.editingLayerId) {
                    e.preventDefault();
                    deleteSelected();
                }
                return;
            }

            const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
            if (!arrows.includes(e.key)) return;
            const sel = getSelectedLayers();
            if (sel.length === 0) return;
            if (state.editingLayerId) return;
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            let dx = 0, dy = 0;
            if (e.key === 'ArrowUp') dy = -step;
            else if (e.key === 'ArrowDown') dy = step;
            else if (e.key === 'ArrowLeft') dx = -step;
            else if (e.key === 'ArrowRight') dx = step;

            sel.forEach(l => { l.x += dx; l.y += dy; });
            const activeWrapper = `.canvas-page-wrapper[data-page-id="${state.currentPageId}"]`;
            sel.forEach(l => {
                const el = document.querySelector(`${activeWrapper} .canvas-layer[data-id="${l.id}"]`);
                if (el) {
                    el.style.left = l.x + 'px';
                    el.style.top = l.y + 'px';
                }
            });
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(() => state.saveState(), 400);
        });
    }

    function init() {
        initBoxSelection();
        initKeyboard();
    }

    return {
        init,
        getSelectedLayers,
        isSelected,
        selectOnly,
        toggleSelect,
        addToSelection,
        syncPrimarySelected,
        getDragLayers,
        captureInitialPositions,
        applyMove,
        deleteSelected,
        // ✅ 新增：建组 / 解组
        groupSelected: () => state.groupSelected(),
        ungroupSelected: () => state.ungroupSelected()
    };
})();

window.MultiSelect = MultiSelect;