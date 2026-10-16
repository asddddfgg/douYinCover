// Global State Management (Supports Uniform Background, Consistent Style & Full Undo/Redo System)

class HistoryManager {
    constructor(stateInstance) {
        this.state = stateInstance;
        this.stack = [];
        this.pointer = -1;
        this.maxStackSize = 30;
    }

    record() {
        // 深拷贝当前整个画布的 state 状态
        const snapshot = JSON.parse(JSON.stringify({
            background: this.state.background,
            pages: this.state.pages,
            currentPageId: this.state.currentPageId,
            selectedLayerId: this.state.selectedLayerId
        }));

        // 如果指针不在末尾，截断后面的历史
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
    }
}

class AppState {
    constructor() {
        this.background = {
            type: 'gradient',
            color1: '#ff2442',
            color2: '#2575fc',
            imageUrl: ''
        };

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

        // 初始化历史记录管理器
        this.history = new HistoryManager(this);
        
        // 延迟半秒记录初始状态
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

    addLayer(layer) {
        this.layers.push(layer);
        this.selectedLayerId = layer.id;
        this.saveState();
    }

    removeLayer(id) {
        const curLayers = this.layers;
        this.getCurrentPage().layers = curLayers.filter(l => l.id !== id);
        if (this.selectedLayerId === id) {
            this.selectedLayerId = this.layers.length > 0 ? this.layers[0].id : null;
        }
        this.saveState();
    }

    moveLayer(id, direction) {
        const curLayers = this.layers;
        const index = curLayers.findIndex(l => l.id === id);
        if (index === -1) return;
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex >= 0 && targetIndex < curLayers.length) {
            const temp = curLayers[index];
            curLayers[index] = curLayers[targetIndex];
            curLayers[targetIndex] = temp;
            this.saveState();
        }
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
    }
}

const state = new AppState();

// 全局监听 Ctrl + Z 快捷键实现一键撤销
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        // 如果当前正在编辑富文本输入框内部，让浏览器原生处理内部文本撤销
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