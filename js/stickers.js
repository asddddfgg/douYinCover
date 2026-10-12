document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('sticker-grid');
    const catBtns = document.querySelectorAll('.cat-btn');

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
});
