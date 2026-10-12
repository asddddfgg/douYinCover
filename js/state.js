/**
 * js/state.js - 全局状态管理
 */
const state = {
    text: "抖音爆款文字排版与 AE 质感特效生成器",
    fontSize: 64,
    lineHeight: 1.2,
    letterSpacing: 0,
    align: "center",
    bold: true,
    textColor: "#ffffff",
    boxBg: "transparent",
    bgImage: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1080&auto=format&fit=crop",
    bgBrightness: 100,
    bgOpacity: 50,
    viewMode: "single",
    exportScale: 2,
    textBox: { x: 50, y: 50, w: 320, h: 400 },
    savedBgs: [],
    enabledEffects: [],
    stickers: [
        { id: 's1', emoji: '🔥', x: 20, y: 15, scale: 1 },
        { id: 's2', emoji: '✨', x: 75, y: 20, scale: 1 }
    ],
    textLayers: [
        { id: 'l1', text: '⚡ 独家精选爆款', x: 50, y: 10, fontSize: 16, color: '#05D9E8' },
        { id: 'l2', text: '✨ AE PRO STUDIO', x: 50, y: 88, fontSize: 14, color: '#FFE600' }
    ],
    presets: []
};

// State persistence & listener helper
const StateManager = {
    subscribers: [],
    subscribe(callback) {
        this.subscribers.push(callback);
    },
    notify() {
        this.subscribers.forEach(cb => cb(state));
    },
    update(partial) {
        Object.assign(state, partial);
        this.notify();
    }
};
