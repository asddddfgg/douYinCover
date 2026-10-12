// Global State Management
class AppState {
    constructor() {
        this.layers = [
            {
                id: 'layer-1',
                type: 'text',
                content: '🔥 抖音爆款连载长文封面',
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
        ];
        this.selectedLayerId = 'layer-1';
        this.editingLayerId = null;
        this.copiedStyle = null;
        this.background = {
            type: 'gradient',
            color1: '#ff2442',
            color2: '#2575fc',
            imageUrl: ''
        };
    }

    getSelectedLayer() {
        return this.layers.find(l => l.id === this.selectedLayerId);
    }

    addLayer(layer) {
        this.layers.push(layer);
        this.selectedLayerId = layer.id;
    }

    removeLayer(id) {
        this.layers = this.layers.filter(l => l.id !== id);
        if (this.selectedLayerId === id) {
            this.selectedLayerId = this.layers.length > 0 ? this.layers[0].id : null;
        }
    }

    moveLayer(id, direction) {
        const index = this.layers.findIndex(l => l.id === id);
        if (index === -1) return;
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex >= 0 && targetIndex < this.layers.length) {
            const temp = this.layers[index];
            this.layers[index] = this.layers[targetIndex];
            this.layers[targetIndex] = temp;
        }
    }
}

const state = new AppState();
