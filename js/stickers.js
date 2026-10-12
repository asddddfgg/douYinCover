document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('sticker-grid');
    const catBtns = document.querySelectorAll('.cat-btn');
    const canvasContainer = document.getElementById('canvas-container');
    const stickerCount = document.getElementById('sticker-count');

    if (stickerCount) stickerCount.textContent = "72+";

    function renderStickers(cat = 'all') {
        grid.innerHTML = '';
        let fullList = [...AppState.stickersData];
        if (fullList.length < 72) {
            const symbols = ['🔥', '💯', '⭐', '👑', '🚀', '💰', '⚡', '🎯', '💡', '📌', '🎁', '💎', '🎉', '🌟', '💥', '✨'];
            for (let i = fullList.length + 1; i <= 72; i++) {
                fullList.push({
                    id: i,
                    cat: ['badge', 'arrow', 'emoji', 'hot'][i % 4],
                    symbol: symbols[i % symbols.length],
                    name: '贴纸' + i
                });
            }
        }

        const filtered = cat === 'all' ? fullList : fullList.filter(s => s.cat === cat);
        filtered.forEach(item => {
            const el = document.createElement('div');
            el.className = 'sticker-item';
            el.innerHTML = item.symbol;
            el.title = item.name;
            el.addEventListener('click', () => addStickerToCanvas(item.symbol));
            grid.appendChild(el);
        });
    }

    catBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            catBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderStickers(btn.getAttribute('data-cat'));
        });
    });

    renderStickers('all');

    function addStickerToCanvas(symbol) {
        const layerId = 'sticker-' + Date.now();
        const layer = document.createElement('div');
        layer.className = 'draggable-layer sticker-layer active';
        layer.id = layerId;
        layer.style.top = '50%';
        layer.style.left = '50%';
        layer.style.transform = 'translate(-50%, -50%)';
        layer.innerHTML = `
            <div class="layer-content" style="font-size: 50px;">${symbol}</div>
            <div class="resize-handle top-left" data-handle="tl"></div>
            <div class="resize-handle top-right" data-handle="tr"></div>
            <div class="resize-handle bottom-left" data-handle="bl"></div>
            <div class="resize-handle bottom-right" data-handle="br"></div>
        `;
        document.querySelectorAll('.draggable-layer').forEach(l => l.classList.remove('active'));
        canvasContainer.appendChild(layer);
        if (typeof initDragAndResize === 'function') initDragAndResize(layer);
    }
});
