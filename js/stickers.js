document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('sticker-grid');
    const catBtns = document.querySelectorAll('.cat-btn');
    const btnAddSticker = document.getElementById('btn-add-custom-sticker');

    function renderStickers(cat = 'all') {
        if (!grid) return;
        grid.innerHTML = '';
        
        const filtered = cat === 'all' ? AppState.stickersData : AppState.stickersData.filter(s => s.cat === cat);
        filtered.forEach(item => {
            const el = document.createElement('div');
            el.className = 'sticker-item';
            el.innerHTML = item.symbol;
            el.title = item.name;

            // 点击贴纸直接放置到中间画布
            el.addEventListener('click', () => {
                addStickerToCanvas(item.symbol);
            });

            grid.appendChild(el);
        });
    }

    function addStickerToCanvas(symbol) {
        const canvasContainer = document.getElementById('canvas-container');
        const stickerLayer = document.createElement('div');
        stickerLayer.className = 'draggable-layer sticker-layer active';
        stickerLayer.style.cssText = 'top: 40%; left: 40%; width: 60px; height: 60px; z-index: 15; font-size: 40px; display:flex; align-items:center; justify-content:center;';

        stickerLayer.innerHTML = `
            <div class="layer-content" style="text-shadow: none;">${symbol}</div>
            <div class="resize-handle top-left" data-handle="tl"></div>
            <div class="resize-handle top-right" data-handle="tr"></div>
            <div class="resize-handle bottom-left" data-handle="bl"></div>
            <div class="resize-handle bottom-right" data-handle="br"></div>
        `;

        canvasContainer.appendChild(stickerLayer);
        if (typeof initDragAndResize === 'function') {
            initDragAndResize(stickerLayer);
        }
    }

    catBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            catBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderStickers(btn.getAttribute('data-cat'));
        });
    });

    if (btnAddSticker) {
        btnAddSticker.addEventListener('click', () => {
            const symbol = prompt("请输入Emoji或字符贴纸 (例: 🚀):");
            if (!symbol) return;
            const name = prompt("请输入贴纸名称:", "自定义贴纸");

            const newSticker = {
                id: Date.now(),
                cat: "custom",
                symbol: symbol,
                name: name || "自定义"
            };

            AppState.stickersData.push(newSticker);
            LocalDB.saveProject(AppState);
            renderStickers('custom');
            alert("贴纸添加成功！已自动切换至自定义分类。");
        });
    }

    renderStickers('all');
});
