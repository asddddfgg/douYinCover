// ============================================================
// state.js — 全局状态 + HistoryManager
// 职责边界：
//   ✅ 负责：数据模型（pages/layers/background/guides）、选中态、建组/锁定、
//            HistoryManager 快照与撤销
//   ❌ 不负责：DOM 操作、canvas 渲染、导出、选区、背景面板 UI
// 依赖：window.DEFAULT_BACKGROUND（background-presets.js）
// 被依赖：几乎全部模块（state 是单一数据源）
// ============================================================
// Global State Management (Supports Uniform Background, Consistent Style & Full Undo/Redo System)

class HistoryManager {
    constructor(stateInstance) {
        this.state = stateInstance;
        this.stack = [];
        this.pointer = -1;
        this.maxStackSize = 30;
    }

    record() {
        const snapshot = JSON.parse(JSON.stringify({
            background: this.state.background,
            pages: this.state.pages,
            currentPageId: this.state.currentPageId,
            selectedLayerId: this.state.selectedLayerId,
            selectedLayerIds: this.state.selectedLayerIds || []
        }));

        if (this.pointer < this.stack.length - 1) {
            this.stack = this.stack.slice(0, this.pointer + 1);
        }

        this.stack.push(snapshot);
        if (this.stack.length > this.maxStackSize) {
            this.stack.shift();
        } else {
            this.pointer++;
        }
    }

    undo() {
        if (this.pointer > 0) {
            this.pointer--;
            this.restore(this.stack[this.pointer]);
            return true;
        }
        return false;
    }

    restore(snapshot) {
        this.state.background = JSON.parse(JSON.stringify(snapshot.background));
        this.state.pages = JSON.parse(JSON.stringify(snapshot.pages));
        this.state.currentPageId = snapshot.currentPageId;
        this.state.selectedLayerId = snapshot.selectedLayerId;
        this.state.editingLayerId = null;
        if (snapshot.selectedLayerId && this.state.pages.some(p =>
            p.layers.some(l => l.id === snapshot.selectedLayerId))) {
            this.state.selectedLayerIds = [snapshot.selectedLayerId];
        } else {
            this.state.selectedLayerIds = [];
        }
    }
}

class AppState {
    constructor() {
        this.background = (window.DEFAULT_BACKGROUND
    ? JSON.parse(JSON.stringify(window.DEFAULT_BACKGROUND))
    : {
        type: 'gradient',
        color1: '#ff2442',
        color2: '#2575fc',
        imageUrl: '',
        angle: 135,
        texture: 'none',
        presetId: null,
        fit: 'cover',
        scale: 1,
        positionX: 50,
        positionY: 50,
        blur: 0,
        overlayColor: '#000000',
        overlayOpacity: 0,
        overlayType: 'solid',
        overlayStops: [
            { pos: 0, color: '#FFF9F0', opacity: 0.12 },
            { pos: 0.40, color: '#FFF9F0', opacity: 0.05 },
            { pos: 1, color: '#F0E6D8', opacity: 0.35 }
        ],
        overlayAngle: 180,
        overlayCenter: { x: 50, y: 40 },
        colorFilter: 'none'
    }
);

        this.pages = [
            {
                id: 'page-1',
                title: '第 1 页',
                layers: [
                    {
                        id: 'layer-1',
                        type: 'text',
                        content: '🔥 抖音爆款连胜长文封面',
                        fontSize: '32px',
                        fontFamily: 'sans-serif',
                        color: '#ffffff',
                        bgColor: 'transparent',
                        bold: true,
                        italic: false,
                        underline: false,
                        strike: false,
                        align: 'center',
                        vertical: false,
                        letterSpacing: 0,
                        lineHeight: 1.2,
                        opacity: 1,
                        effectClass: 'effect-viral',
                        x: 30,
                        y: 160,
                        width: 300,
                        height: 120
                    },
                    {
                        id: 'layer-2',
                        type: 'text',
                        content: '单击选定 · 双击插入光标划选文字 · 拖拽平滑移动',
                        fontSize: '18px',
                        fontFamily: 'sans-serif',
                        color: '#ffeb3b',
                        bgColor: 'transparent',
                        bold: false,
                        italic: false,
                        underline: false,
                        strike: false,
                        align: 'center',
                        vertical: false,
                        letterSpacing: 0,
                        lineHeight: 1.2,
                        opacity: 1,
                        effectClass: 'effect-neon',
                        x: 30,
                        y: 320,
                        width: 300,
                        height: 90
                    }
                ]
            }
        ];

        this.currentPageId = 'page-1';
        this.selectedLayerId = 'layer-1';
        this.editingLayerId = null;
        this.copiedStyle = null;

        // ===== 顶级升级：多选 / 参考线 / 吸附 =====
        this.selectedLayerIds = ['layer-1'];
        this.guides = [];
        this.snapEnabled = true;

        this.history = new HistoryManager(this);

        setTimeout(() => {
            if (this.history.stack.length === 0) {
                this.history.record();
            }
        }, 500);
    }

        saveState() {
        if (this.history) {
            this.history.record();
        }
    }

    // ✅ P0-3：批量变更入口
    // 用法：state.mutate(() => { layer.x = 100; layer.color = '#fff'; });
    mutate(fn) {
        if (typeof fn !== 'function') {
            if (window.Utils && Utils.log) Utils.log.warn('[state.mutate] 参数不是函数');
            return;
        }
        this.__mutating = true;
        try {
            fn.call(this);
        } finally {
            this.__mutating = false;
        }
        this.saveState();
    }

    getCurrentPage() {
        return this.pages.find(p => p.id === this.currentPageId) || this.pages[0];
    }

    get layers() {
        return this.getCurrentPage().layers;
    }
    set layers(newLayers) {
        this.getCurrentPage().layers = newLayers;
    }

    getSelectedLayer() {
        return this.layers.find(l => l.id === this.selectedLayerId);
    }

    // ✅ 跨页查找图层（所有模块统一用它，避免 state.layers 只查当前页的误用）
    findLayerById(id) {
        if (!id) return null;
        for (const page of this.pages) {
            const found = (page.layers || []).find(l => l.id === id);
            if (found) return found;
        }
        return null;
    }

    addLayer(layer) {
        // ✅ 自动补齐新字段，兼容老数据
        if (layer.locked === undefined) layer.locked = false;
        if (layer.groupId === undefined) layer.groupId = null;
        this.layers.push(layer);
        this.selectedLayerId = layer.id;
        if (this.selectedLayerIds) this.selectedLayerIds = [layer.id];
        this.saveState();
    }

    removeLayer(id) {
        const curLayers = this.layers;
        this.getCurrentPage().layers = curLayers.filter(l => l.id !== id);
        if (this.selectedLayerId === id) {
            this.selectedLayerId = this.layers.length > 0 ? this.layers[0].id : null;
        }
        if (this.selectedLayerIds) {
            this.selectedLayerIds = this.selectedLayerIds.filter(x => x !== id);
        }
        this.saveState();
    }

    /* ============================================================
       建组 / 解组 / 锁定 / 解锁
       ============================================================ */

    // 把当前选中的多个图层合并成一个组
    groupSelected() {
        const ids = (this.selectedLayerIds || []).slice();
        if (ids.length < 2) {
            alert('请至少选中 2 个图层才能建组（按住 Ctrl/Cmd 点击多个图层）');
            return false;
        }
        const groupId = 'group-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        const page = this.getCurrentPage();
        page.layers.forEach(l => {
            if (ids.includes(l.id)) {
                l.groupId = groupId;
            }
        });
        this.selectedLayerIds = ids.slice();
        this.saveState();
        return groupId;
    }

    // 拆散选中图层所在的组
    ungroupSelected() {
        const ids = (this.selectedLayerIds || []).slice();
        if (ids.length === 0) {
            alert('请先选中一个组里的图层');
            return false;
        }
        const page = this.getCurrentPage();
        const groupIds = new Set();
        page.layers.forEach(l => {
            if (ids.includes(l.id) && l.groupId) {
                groupIds.add(l.groupId);
            }
        });
        if (groupIds.size === 0) {
            alert('选中的图层不在任何组里');
            return false;
        }
        page.layers.forEach(l => {
            if (groupIds.has(l.groupId)) {
                l.groupId = null;
            }
        });
        this.saveState();
        return true;
    }

    // 锁定 / 解锁指定图层
    setLayerLocked(id, locked) {
        const page = this.getCurrentPage();
        const layer = page.layers.find(l => l.id === id);
        if (!layer) return false;
        layer.locked = !!locked;
        this.saveState();
        return true;
    }

    // 切换锁定状态
    toggleLayerLocked(id) {
        const layer = this.layers.find(l => l.id === id);
        if (!layer) return false;
        return this.setLayerLocked(id, !layer.locked);
    }

    // 判断图层是否被锁定
    isLayerLocked(id) {
        const layer = this.layers.find(l => l.id === id);
        return !!(layer && layer.locked);
    }

    // 取某个图层同组的所有图层 id（包含它自己）
    getGroupMemberIds(id) {
        const layer = this.layers.find(l => l.id === id);
        if (!layer || !layer.groupId) return [id];
        return this.layers
            .filter(l => l.groupId === layer.groupId)
            .map(l => l.id);
    }

    moveLayer(id, direction) {
        const curLayers = this.layers;
        const index = curLayers.findIndex(l => l.id === id);
        if (index === -1) return false;

        let targetIndex;
        if (direction === 'top') targetIndex = curLayers.length - 1;
        else if (direction === 'bottom') targetIndex = 0;
        else if (direction === 'up') targetIndex = index + 1;
        else targetIndex = index - 1;

        if (targetIndex < 0 || targetIndex >= curLayers.length) return false;
        if (targetIndex === index) return false;

        const [layer] = curLayers.splice(index, 1);
        curLayers.splice(targetIndex, 0, layer);

        this.saveState();
        return true;
    }

    addPage() {
        const newPageId = 'page-' + Date.now();
        const newPageNum = this.pages.length + 1;

        const newPage = {
            id: newPageId,
            title: `第 ${newPageNum} 页`,
            layers: [
                {
                    id: 'text-' + Date.now(),
                    type: 'text',
                    content: `🔥 长文连胜第 ${newPageNum} 页内容`,
                    fontSize: '28px',
                    fontFamily: 'sans-serif',
                    color: '#ffffff',
                    bgColor: 'transparent',
                    bold: false,
                    italic: false,
                    underline: false,
                    strike: false,
                    align: 'center',
                    vertical: false,
                    letterSpacing: 0,
                    lineHeight: 1.2,
                    opacity: 1,
                    effectClass: 'effect-black-stroke',
                    x: 35,
                    y: 250,
                    width: 290,
                    height: 100
                }
            ]
        };
        this.pages.push(newPage);
        this.switchPage(newPageId);
        this.saveState();
    }

    switchPage(pageId) {
        this.currentPageId = pageId;
        this.editingLayerId = null;
        const curLayers = this.layers;
        this.selectedLayerId = curLayers.length > 0 ? curLayers[0].id : null;
        if (this.selectedLayerIds) {
            this.selectedLayerIds = this.selectedLayerId ? [this.selectedLayerId] : [];
        }
    }
}

const state = new AppState();

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.target.isContentEditable || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
            return;
        }
        e.preventDefault();
        if (state.history && state.history.undo()) {
            if (typeof renderAll === 'function') {
                renderAll();
            } else if (typeof renderCanvas === 'function') {
                renderCanvas();
                if (typeof renderLayerList === 'function') renderLayerList();
            }
        }
    }
});