// Global State Management (Supports Uniform Background & Consistent Style)
class AppState {
    constructor() {
        // 统一背景：无论主页还是分页，所有页面共用此背景
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
                        content: '🔥 抖音爆款连泼长文封面',
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
    }

    removeLayer(id) {
        const curLayers = this.layers;
        this.getCurrentPage().layers = curLayers.filter(l => l.id !== id);
        if (this.selectedLayerId === id) {
            this.selectedLayerId = this.layers.length > 0 ? this.layers[0].id : null;
        }
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
                    content: `🔥 长文连泼第 ${newPageNum} 页内容`,
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
    }

    switchPage(pageId) {
        this.currentPageId = pageId;
        this.editingLayerId = null;
        const curLayers = this.layers;
        this.selectedLayerId = curLayers.length > 0 ? curLayers[0].id : null;
    }
}

const state = new AppState();