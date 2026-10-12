// Stickers module
function initStickersModule() {
    const btn = document.getElementById('btn-add-sticker');
    if (!btn) return;
    
    const sampleStickers = ['🔥', '⭐', '❤️', '🚀', '📌', '💡', '💯', '🎯', '💎', '🏆'];
    
    btn.addEventListener('click', () => {
        const randomSticker = sampleStickers[Math.floor(Math.random() * sampleStickers.length)];
        const newLayer = {
            id: 'sticker-' + Date.now(),
            type: 'sticker',
            content: randomSticker,
            fontSize: '64px',
            opacity: 1,
            x: 130 + Math.random() * 40,
            y: 220 + Math.random() * 80,
            width: 80,
            height: 80
        };
        state.addLayer(newLayer);
        renderCanvas();
        renderLayerList();
    });
}
