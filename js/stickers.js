// ========== 贴纸系统 v3：位图/SVG/Emoji + 旋转翻转 + 拖拽入画布 + 上传 + 频次 + 改色 + 面板拖动记忆 ==========

const STICKER_RECENT_KEY = 'douyin_sticker_recent_v3';
const STICKER_FREQ_KEY = 'douyin_sticker_freq_v3';
const STICKER_MAX_RECENT = 24;
const STICKER_PANEL_POS_KEY = 'douyin_sticker_panel_pos_v1';

// ---------- 内置贴纸库 ----------
function svg(inner, viewBox = '0 0 24 24') {
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="currentColor">${inner}</svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svgStr);
}

const STICKER_LIBRARY = {
    emoji: {
        name: '表情', icon: '😀', type: 'emoji',
        items: [
            { c: '😀', k: '笑 开心' }, { c: '😂', k: '笑哭' }, { c: '🥰', k: '爱' },
            { c: '😍', k: '心动' }, { c: '🤩', k: '星星眼' }, { c: '😎', k: '酷' },
            { c: '🤔', k: '思考' }, { c: '😱', k: '震惊' }, { c: '😭', k: '哭' },
            { c: '😡', k: '生气' }, { c: '🤯', k: '爆炸头' }, { c: '🥳', k: '庆祝' },
            { c: '😴', k: '困' }, { c: '🤗', k: '拥抱' }, { c: '🙏', k: '拜托' },
            { c: '👍', k: '赞' }, { c: '👎', k: '差' }, { c: '👏', k: '鼓掌' },
            { c: '🙌', k: '欢呼' }, { c: '💪', k: '加油' }, { c: '👀', k: '看' },
            { c: '🧠', k: '大脑' }, { c: '💀', k: '骷髅' }, { c: '👻', k: '鬼' },
            { c: '🤖', k: '机器人' }, { c: '👽', k: '外星' }, { c: '💩', k: '屎' },
            { c: '🤡', k: '小丑' }, { c: '🥶', k: '冷' }, { c: '🤝', k: '握手' }
        ]
    },
    decor: {
        name: '装饰', icon: '✨', type: 'emoji',
        items: [
            { c: '🔥', k: '火 热门' }, { c: '⭐', k: '星' }, { c: '🌟', k: '星星' },
            { c: '✨', k: '闪光' }, { c: '💫', k: '眩晕' }, { c: '💥', k: '爆炸' },
            { c: '⚡', k: '闪电' }, { c: '🌈', k: '彩虹' }, { c: '☀️', k: '太阳' },
            { c: '🌙', k: '月亮' }, { c: '❄️', k: '雪花' }, { c: '💧', k: '水滴' },
            { c: '💦', k: '汗' }, { c: '🎈', k: '气球' }, { c: '🎉', k: '派对' },
            { c: '🎊', k: '彩带' }, { c: '🎁', k: '礼物' }, { c: '🎀', k: '蝴蝶结' },
            { c: '💎', k: '钻石' }, { c: '👑', k: '皇冠' }, { c: '🔮', k: '水晶球' },
            { c: '🕯️', k: '蜡烛' }, { c: '🎵', k: '音乐' }, { c: '🎶', k: '音符' },
            { c: '💤', k: '睡' }, { c: '💯', k: '满分' }, { c: '‼️', k: '双感叹' },
            { c: '❓', k: '问号' }, { c: '❗', k: '感叹号' }, { c: '💢', k: '生气符' }
        ]
    },
    arrow: {
        name: '箭头', icon: '➡️', type: 'emoji',
        items: [
            { c: '➡️', k: '右箭头' }, { c: '⬅️', k: '左箭头' }, { c: '⬆️', k: '上箭头' },
            { c: '⬇️', k: '下箭头' }, { c: '↗️', k: '右上' }, { c: '↘️', k: '右下' },
            { c: '↙️', k: '左下' }, { c: '↖️', k: '左上' }, { c: '🔄', k: '刷新' },
            { c: '🔃', k: '循环' }, { c: '🔙', k: '返回' }, { c: '🔚', k: '结束' },
            { c: '🔛', k: '开' }, { c: '🔜', k: 'soon' }, { c: '🔝', k: 'top' },
            { c: '👇', k: '下指' }, { c: '👆', k: '上指' }, { c: '👈', k: '左指' },
            { c: '👉', k: '右指' }, { c: '☝️', k: '食指' }
        ]
    },
    badge: {
        name: '徽章', icon: '🏆', type: 'emoji',
        items: [
            { c: '🏆', k: '冠军' }, { c: '🥇', k: '金牌' }, { c: '🥈', k: '银牌' },
            { c: '🥉', k: '铜牌' }, { c: '🎖️', k: '勋章' }, { c: '🏅', k: '奖牌' },
            { c: '📛', k: '姓名牌' }, { c: '🔖', k: '书签' }, { c: '🏷️', k: '标签' },
            { c: '✅', k: '对 勾' }, { c: '❌', k: '错 叉' }, { c: '⭕', k: '圈' },
            { c: '🚫', k: '禁止' }, { c: '⚠️', k: '警告' }, { c: '♻️', k: '回收' },
            { c: '🔰', k: '新手' }, { c: '🆕', k: '新' }, { c: '🆗', k: 'OK' },
            { c: '🆒', k: '酷' }, { c: '🆓', k: '免费' }
        ]
    },
    number: {
        name: '数字', icon: '①', type: 'emoji',
        items: [
            { c: '①', k: '1' }, { c: '②', k: '2' }, { c: '③', k: '3' },
            { c: '④', k: '4' }, { c: '⑤', k: '5' }, { c: '⑥', k: '6' },
            { c: '⑦', k: '7' }, { c: '⑧', k: '8' }, { c: '⑨', k: '9' },
            { c: '⑩', k: '10' }, { c: '❶', k: '1 黑' }, { c: '❷', k: '2 黑' },
            { c: '❸', k: '3 黑' }, { c: '❹', k: '4 黑' }, { c: '❺', k: '5 黑' },
            { c: '⓵', k: '1 圆' }, { c: '⓶', k: '2 圆' }, { c: '⓷', k: '3 圆' },
            { c: 'Ⅰ', k: '罗马1' }, { c: 'Ⅱ', k: '罗马2' }, { c: 'Ⅲ', k: '罗马3' },
            { c: 'Ⅳ', k: '罗马4' }, { c: 'Ⅴ', k: '罗马5' }
        ]
    },
    symbol: {
        name: '符号', icon: '★', type: 'emoji',
        items: [
            { c: '♥', k: '红心' }, { c: '♡', k: '空爱心' }, { c: '★', k: '实心星' },
            { c: '☆', k: '空心星' }, { c: '▲', k: '上三角' }, { c: '▼', k: '下三角' },
            { c: '●', k: '实心圆' }, { c: '○', k: '空心圆' }, { c: '◆', k: '实心菱' },
            { c: '◇', k: '空心菱' }, { c: '■', k: '方块' }, { c: '□', k: '空方块' },
            { c: '✿', k: '花' }, { c: '❀', k: '花朵' }, { c: '☀', k: '太阳' },
            { c: '☂', k: '伞' }, { c: '☁', k: '云' }, { c: '☘', k: '三叶草' },
            { c: '✂', k: '剪刀' }, { c: '✈', k: '飞机' }, { c: '☎', k: '电话' },
            { c: '✉', k: '信封' }, { c: '⌚', k: '手表' }, { c: '☕', k: '咖啡' }
        ]
    },
    pngStickers: {
        name: 'PNG', icon: '🖼', type: 'image',
        items: [
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f525.png', k: '火焰 热门' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f4a5.png', k: '爆炸' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2728.png', k: '闪光' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2b50.png', k: '星星' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f31f.png', k: '发光星星' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/26a1.png', k: '闪电' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f389.png', k: '派对礼花' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f38a.png', k: '彩带' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f381.png', k: '礼物' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f388.png', k: '气球' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f44d.png', k: '赞 点赞' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f44f.png', k: '鼓掌' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f3c6.png', k: '奖杯' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f947.png', k: '金牌' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f4af.png', k: '100分' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f48e.png', k: '钻石' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f451.png', k: '皇冠' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2764.png', k: '红心' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f494.png', k: '心碎' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f495.png', k: '两颗心' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f496.png', k: '闪亮的心' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f600.png', k: '大笑' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f602.png', k: '笑哭' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f60d.png', k: '花痴' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f60e.png', k: '酷' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f62d.png', k: '大哭' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f621.png', k: '生气' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f631.png', k: '惊恐' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f914.png', k: '思考' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f44c.png', k: 'OK' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/27a1.png', k: '右箭头' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2b05.png', k: '左箭头' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2b06.png', k: '上箭头' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2b07.png', k: '下箭头' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f449.png', k: '右指' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f448.png', k: '左指' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f447.png', k: '下指' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f446.png', k: '上指' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2705.png', k: '对勾 完成' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/274c.png', k: '叉 错误' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2757.png', k: '感叹号' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2753.png', k: '问号' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f4a1.png', k: '灯泡 灵感' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f4cc.png', k: '图钉' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f4cd.png', k: '圆形图钉' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f517.png', k: '链接' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/0031-20e3.png', k: '1️⃣ 数字一' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/0032-20e3.png', k: '2️⃣ 数字二' },
            { c: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/0033-20e3.png', k: '3️⃣ 数字三' }
        ]
    },
    svg: {
        name: '矢量', icon: '⬢', type: 'svg',
        items: [
            { c: svg('<path d="M12 2l3 7h7l-5.5 4.5 2 7L12 17l-6.5 3.5 2-7L2 9h7z"/>'), k: '星标 收藏' },
            { c: svg('<path d="M12 21s-7-4.5-9-9a5 5 0 019-3 5 5 0 019 3c-2 4.5-9 9-9 9z"/>'), k: '爱心 喜欢' },
            { c: svg('<path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z"/>'), k: '定位 位置' },
            { c: svg('<path d="M12 2l2.4 7.2H22l-6 4.6 2.3 7.2L12 16.6 5.7 21l2.3-7.2-6-4.6h7.6z"/>'), k: '五角星' },
            { c: svg('<path d="M20 6h-3V4a2 2 0 00-2-2H9a2 2 0 00-2 2v2H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2zM9 4h6v2H9z"/>'), k: '购物 包' },
            { c: svg('<path d="M7 4v16l13-8z"/>'), k: '播放 三角' },
            { c: svg('<path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2zm0-4h-2V7h2z"/>'), k: '信息 提示' },
            { c: svg('<path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z"/>'), k: '闪光' },
            { c: svg('<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1 15v-2h2v2zm2-4h-2V7h2z"/>'), k: '感叹' },
            { c: svg('<path d="M12 2l10 18H2z"/>'), k: '警告 三角' },
            { c: svg('<circle cx="12" cy="12" r="10"/>'), k: '圆点 徽章' },
            { c: svg('<path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>'), k: '对勾 完成' },
            { c: svg('<path d="M19 6.4L17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/>'), k: '叉 失败' },
            { c: svg('<path d="M12 2l2.9 6.2 6.8.9-5 4.7 1.3 6.7L12 17.3 5.9 20.5l1.3-6.7-5-4.7 6.8-.9z"/>'), k: '实心星2' },
            { c: svg('<path d="M17 3H7a4 4 0 00-4 4v10a4 4 0 004 4h10a4 4 0 004-4V7a4 4 0 00-4-4zm-5 14l-4-4 1.4-1.4L12 14.2l5.6-5.6L19 10z"/>'), k: '完成框' },
            { c: svg('<path d="M4 4h16v16H4z"/>'), k: '方块' },
            { c: svg('<path d="M12 3l9 9-9 9-9-9z"/>'), k: '菱形' },
            { c: svg('<path d="M3 3h18v4H3zM3 10h18v4H3zM3 17h18v4H3z"/>'), k: '横条 列表' },
            { c: svg('<path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>'), k: '星形' },
            { c: svg('<path d="M12 6l6 6-6 6-6-6z"/>'), k: '钻石2' },
            { c: svg('<path d="M6 2l-4 8 10 12L22 10 18 2z"/>'), k: '钻石 3D' },
            { c: svg('<path d="M2 12l20-8-8 20-2-10z"/>'), k: '导航 箭头' },
            { c: svg('<path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>'), k: '闪光4' },
            { c: svg('<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 14v-4l5 2-5 2z"/>'), k: '播放圆' }
        ]
    }
};

// ---------- 状态 ----------
let currentStickerCategory = 'all';
let currentStickerSearch = '';
let draggedStickerData = null;

// ---------- 初始化 ----------
function initStickersModule() {
    const btn = document.getElementById('btn-add-sticker');
    if (!btn) return;

    buildStickerPanel();
    buildStickerColorBar();
    restoreStickerPanelPosition();  // 恢复上次拖动位置
    initStickerPanelDrag();          // 启用面板拖动

    // 打开面板（不再自动关闭）
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = document.getElementById('sticker-panel');
        if (panel) {
            panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
        }
    });

    // 只有点 X 才关闭
    document.getElementById('sticker-panel-close').addEventListener('click', () => {
        document.getElementById('sticker-panel').style.display = 'none';
    });

    // ★ 删除了"点击空白关闭"的 document.addEventListener('click', ...) 逻辑 ★

    const searchInput = document.getElementById('sticker-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentStickerSearch = e.target.value.trim().toLowerCase();
            renderStickerGrid();
        });
    }

    const btnUpload = document.getElementById('btn-upload-sticker');
    const fileInput = document.getElementById('local-sticker-file');
    if (btnUpload && fileInput) {
        btnUpload.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });
        fileInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || []);
            for (const file of files) {
                await saveUploadedSticker(file);
            }
            fileInput.value = '';
            if (currentStickerCategory === 'uploaded') renderStickerGrid();
        });
    }

    buildStickerDragDrop();
}

// ---------- 面板拖动 + 位置记忆 ----------
function initStickerPanelDrag() {
    const panel = document.getElementById('sticker-panel');
    const handle = document.getElementById('sticker-panel-drag-handle');
    if (!panel || !handle) return;

    let isPanelDragging = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;

    handle.addEventListener('mousedown', (e) => {
        // 点击 关闭/上传 按钮时不触发拖拽
        if (e.target.closest('#sticker-panel-close') || e.target.closest('#btn-upload-sticker')) return;
        e.preventDefault();
        e.stopPropagation();

        isPanelDragging = true;
        panel.classList.add('dragging');

        const rect = panel.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;

        panel.style.left = startLeft + 'px';
        panel.style.top = startTop + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';

        startX = e.clientX;
        startY = e.clientY;

        document.addEventListener('mousemove', onPanelDragMove);
        document.addEventListener('mouseup', onPanelDragEnd);
    });

    function onPanelDragMove(e) {
        if (!isPanelDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        let newLeft = startLeft + dx;
        let newTop = startTop + dy;

        // 边界限制：不让面板完全跑出屏幕
        const panelW = panel.offsetWidth;
        const panelH = panel.offsetHeight;
        const maxLeft = window.innerWidth - 60;
        const maxTop = window.innerHeight - 40;
        newLeft = Math.max(-panelW + 60, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        panel.style.left = newLeft + 'px';
        panel.style.top = newTop + 'px';
    }

    function onPanelDragEnd() {
        isPanelDragging = false;
        panel.classList.remove('dragging');
        document.removeEventListener('mousemove', onPanelDragMove);
        document.removeEventListener('mouseup', onPanelDragEnd);

        // 记住位置
        try {
            localStorage.setItem(STICKER_PANEL_POS_KEY, JSON.stringify({
                left: panel.style.left,
                top: panel.style.top
            }));
        } catch (err) {}
    }
}

function restoreStickerPanelPosition() {
    const panel = document.getElementById('sticker-panel');
    if (!panel) return;
    try {
        const saved = JSON.parse(localStorage.getItem(STICKER_PANEL_POS_KEY) || 'null');
        if (saved && saved.left && saved.top) {
            panel.style.left = saved.left;
            panel.style.top = saved.top;
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        }
    } catch (err) {}
}

// ---------- 面板构建 ----------
function buildStickerPanel() {
    const tabsEl = document.getElementById('sticker-tabs');
    if (!tabsEl || tabsEl.dataset.built === 'true') return;
    tabsEl.dataset.built = 'true';

    const categories = [
        { key: 'all', name: '全部', icon: '📦' },
        { key: 'freq', name: '常用', icon: '🔥' },
        { key: 'recent', name: '最近', icon: '⏱' },
        { key: 'uploaded', name: '我的', icon: '📁' },
        ...Object.keys(STICKER_LIBRARY).map(k => ({
            key: k,
            name: STICKER_LIBRARY[k].name,
            icon: STICKER_LIBRARY[k].icon
        }))
    ];

    tabsEl.innerHTML = '';
    categories.forEach(cat => {
        const tab = document.createElement('div');
        tab.className = `sticker-tab ${cat.key === currentStickerCategory ? 'active' : ''}`;
        tab.dataset.cat = cat.key;
        tab.innerText = `${cat.icon} ${cat.name}`;
        tab.addEventListener('click', () => {
            currentStickerCategory = cat.key;
            currentStickerSearch = '';
            const si = document.getElementById('sticker-search');
            if (si) si.value = '';
            document.querySelectorAll('.sticker-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderStickerGrid();
        });
        tabsEl.appendChild(tab);
    });

    renderStickerGrid();
}

// ---------- 频次 & 最近 ----------
function getRecentStickers() {
    try { return JSON.parse(localStorage.getItem(STICKER_RECENT_KEY) || '[]'); }
    catch (e) { return []; }
}
function addToRecentStickers(content) {
    let recent = getRecentStickers();
    recent = recent.filter(c => c !== content);
    recent.unshift(content);
    if (recent.length > STICKER_MAX_RECENT) recent = recent.slice(0, STICKER_MAX_RECENT);
    try { localStorage.setItem(STICKER_RECENT_KEY, JSON.stringify(recent)); } catch (e) {}
}
function getStickerFreq() {
    try { return JSON.parse(localStorage.getItem(STICKER_FREQ_KEY) || '{}'); }
    catch (e) { return {}; }
}
function bumpStickerFreq(content) {
    const freq = getStickerFreq();
    freq[content] = (freq[content] || 0) + 1;
    try { localStorage.setItem(STICKER_FREQ_KEY, JSON.stringify(freq)); } catch (e) {}
}

// ---------- 网格渲染 ----------
function renderStickerGrid() {
    const grid = document.getElementById('sticker-grid');
    if (!grid) return;
    grid.innerHTML = '';

    let items = [];
    const freq = getStickerFreq();

    if (currentStickerSearch) {
        Object.keys(STICKER_LIBRARY).forEach(catKey => {
            STICKER_LIBRARY[catKey].items.forEach(item => {
                const t = STICKER_LIBRARY[catKey].type;
                if (item.c.toLowerCase().includes(currentStickerSearch) ||
                    item.k.toLowerCase().includes(currentStickerSearch)) {
                    items.push({ ...item, type: t });
                }
            });
        });
    } else if (currentStickerCategory === 'all') {
        Object.keys(STICKER_LIBRARY).forEach(catKey => {
            STICKER_LIBRARY[catKey].items.forEach(item => {
                items.push({ ...item, type: STICKER_LIBRARY[catKey].type });
            });
        });
    } else if (currentStickerCategory === 'freq') {
        const all = [];
        Object.keys(STICKER_LIBRARY).forEach(catKey => {
            STICKER_LIBRARY[catKey].items.forEach(item => {
                all.push({ ...item, type: STICKER_LIBRARY[catKey].type });
            });
        });
        items = all.filter(it => freq[it.c] > 0)
                   .sort((a, b) => (freq[b.c] || 0) - (freq[a.c] || 0))
                   .slice(0, 40);
    } else if (currentStickerCategory === 'recent') {
        const recent = getRecentStickers();
        items = recent.map(c => {
            for (const ck of Object.keys(STICKER_LIBRARY)) {
                const found = STICKER_LIBRARY[ck].items.find(it => it.c === c);
                if (found) return { ...found, type: STICKER_LIBRARY[ck].type, recent: true };
            }
            return { c, k: '最近使用', type: 'image', recent: true };
        });
    } else if (currentStickerCategory === 'uploaded') {
        renderUploadedStickers(grid);
        return;
    } else if (STICKER_LIBRARY[currentStickerCategory]) {
        const lib = STICKER_LIBRARY[currentStickerCategory];
        items = lib.items.map(it => ({ ...it, type: lib.type }));
    }

    if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'sticker-empty';
        empty.innerText = currentStickerCategory === 'recent'
            ? '暂无最近使用记录，点击任意贴纸即可添加'
            : (currentStickerCategory === 'freq' ? '暂无使用数据，添加几个贴纸后这里会自动排序'
                : '没有找到匹配的贴纸');
        grid.appendChild(empty);
        return;
    }

    const seen = new Set();
    items.forEach(item => {
        if (seen.has(item.c)) return;
        seen.add(item.c);
        grid.appendChild(createStickerItemEl(item));
    });
}

function createStickerItemEl(item) {
    const el = document.createElement('div');
    el.className = 'sticker-item';
    el.dataset.content = item.c;
    el.dataset.type = item.type || 'emoji';

    if (item.recent) el.classList.add('recent-flag');
    const freq = getStickerFreq();
    if (freq[item.c] > 0 && currentStickerCategory !== 'freq') {
        el.classList.add('freq-flag');
        el.dataset.freq = freq[item.c];
    }

    el.title = (item.k || '') + '  ·  单击添加到画布中央，或拖拽到指定位置';

    if (item.type === 'svg' || item.type === 'image') {
        const img = document.createElement('img');
        img.src = item.c;
        img.draggable = false;
        el.appendChild(img);
    } else {
        el.innerText = item.c;
    }

    el.addEventListener('click', () => {
        addStickerToCanvas(item.c, item.type, null, null);
    });

    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', (e) => {
        draggedStickerData = { c: item.c, type: item.type };
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'copy';
        try { e.dataTransfer.setData('text/plain', item.c); } catch (err) {}
    });
    el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        draggedStickerData = null;
        document.querySelectorAll('.cover-canvas.drop-target').forEach(c => c.classList.remove('drop-target'));
    });

    return el;
}

// ---------- 拖拽入画布 ----------
function buildStickerDragDrop() {
    document.addEventListener('dragover', (e) => {
        if (!draggedStickerData) return;
        const canvas = e.target.closest('.cover-canvas');
        if (canvas) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            document.querySelectorAll('.cover-canvas.drop-target').forEach(c => c.classList.remove('drop-target'));
            canvas.classList.add('drop-target');
        }
    });

    document.addEventListener('dragleave', (e) => {
        const canvas = e.target.closest('.cover-canvas');
        if (canvas) canvas.classList.remove('drop-target');
    });

    document.addEventListener('drop', (e) => {
        const canvas = e.target.closest('.cover-canvas');
        if (!canvas || !draggedStickerData) return;
        e.preventDefault();
        canvas.classList.remove('drop-target');

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const pageWrapper = canvas.closest('.canvas-page-wrapper');
        if (pageWrapper && pageWrapper.dataset.pageId && state.currentPageId !== pageWrapper.dataset.pageId) {
            state.switchPage(pageWrapper.dataset.pageId);
        }

        const w = 80, h = 80;
        addStickerToCanvas(draggedStickerData.c, draggedStickerData.type, x - w / 2, y - h / 2);
        draggedStickerData = null;
    });
}

// ---------- 添加到画布 ----------
function addStickerToCanvas(content, type, xOverride, yOverride) {
    const w = 80, h = 80;
    const newLayer = {
        id: 'sticker-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        type: 'sticker',
        stickerType: type || 'emoji',
        content: content,
        fontSize: '64px',
        stickerColor: null,
        flipH: false,
        flipV: false,
        rotation: 0,
        opacity: 1,
        x: xOverride !== null && xOverride !== undefined ? Math.max(0, xOverride) : 140,
        y: yOverride !== null && yOverride !== undefined ? Math.max(0, yOverride) : 280,
        width: w,
        height: h
    };

    state.addLayer(newLayer);
    renderCanvas();
    renderLayerList();

    addToRecentStickers(content);
    bumpStickerFreq(content);

    if (currentStickerCategory === 'recent' || currentStickerCategory === 'freq') {
        renderStickerGrid();
    }
}

// ---------- 用户上传贴纸（IndexedDB） ----------
let stickerDB = null;
function openStickerDB() {
    return new Promise((resolve, reject) => {
        if (stickerDB) return resolve(stickerDB);
        const req = indexedDB.open('douyin_stickers_db', 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('stickers')) {
                db.createObjectStore('stickers', { keyPath: 'id', autoIncrement: true });
            }
        };
        req.onsuccess = (e) => { stickerDB = e.target.result; resolve(stickerDB); };
        req.onerror = (e) => reject(e);
    });
}

async function saveUploadedSticker(file) {
    try {
        const db = await openStickerDB();
        const dataUrl = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = e => res(e.target.result);
            r.onerror = rej;
            r.readAsDataURL(file);
        });
        const tx = db.transaction('stickers', 'readwrite');
        tx.objectStore('stickers').add({
            name: file.name,
            dataUrl: dataUrl,
            createdAt: Date.now()
        });
        await new Promise(r => tx.oncomplete = r);
        alert(`贴纸 "${file.name}" 上传成功！已保存到"我的"贴纸库。`);
    } catch (err) {
        console.error('上传贴纸失败:', err);
        alert('上传失败：' + err.message);
    }
}

async function getAllUploadedStickers() {
    try {
        const db = await openStickerDB();
        const tx = db.transaction('stickers', 'readonly');
        const req = tx.objectStore('stickers').getAll();
        return await new Promise((res, rej) => {
            req.onsuccess = () => res(req.result || []);
            req.onerror = rej;
        });
    } catch (e) {
        return [];
    }
}

async function deleteUploadedSticker(id) {
    const db = await openStickerDB();
    const tx = db.transaction('stickers', 'readwrite');
    tx.objectStore('stickers').delete(id);
    await new Promise(r => tx.oncomplete = r);
}

async function renderUploadedStickers(grid) {
    const uploaded = await getAllUploadedStickers();
    if (uploaded.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'sticker-empty';
        empty.innerText = '还没有上传过贴纸，点击右上角"上传"按钮添加本地图片';
        grid.appendChild(empty);
        return;
    }
    uploaded.forEach(item => {
        const el = document.createElement('div');
        el.className = 'sticker-item';
        el.dataset.content = item.dataUrl;
        el.dataset.type = 'image';
        el.title = item.name;

        const img = document.createElement('img');
        img.src = item.dataUrl;
        img.draggable = false;
        el.appendChild(img);

        const del = document.createElement('div');
        del.className = 'del-uploaded';
        del.innerHTML = '×';
        del.title = '删除此贴纸';
        del.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm(`确定删除贴纸 "${item.name}" 吗？`)) return;
            await deleteUploadedSticker(item.id);
            renderStickerGrid();
        });
        el.appendChild(del);

        el.addEventListener('click', () => {
            addStickerToCanvas(item.dataUrl, 'image', null, null);
        });

        el.setAttribute('draggable', 'true');
        el.addEventListener('dragstart', (e) => {
            draggedStickerData = { c: item.dataUrl, type: 'image' };
            el.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'copy';
        });
        el.addEventListener('dragend', () => {
            el.classList.remove('dragging');
            draggedStickerData = null;
        });

        grid.appendChild(el);
    });
}

// ---------- 贴纸改色（仅 SVG） ----------
function buildStickerColorBar() {
    const bar = document.getElementById('sticker-color-bar');
    const swatches = document.getElementById('sticker-color-swatches');
    if (!bar || !swatches) return;

    const colors = ['#ff2442', '#2575fc', '#00e5ff', '#ffeb3b', '#ffffff', '#000000', '#11998e', '#ff8c00'];
    colors.forEach(c => {
        const s = document.createElement('div');
        s.className = 'sticker-color-swatch';
        s.style.background = c;
        s.title = c;
        s.addEventListener('click', () => applyStickerColor(c));
        swatches.appendChild(s);
    });

    const custom = document.getElementById('sticker-color-custom');
    if (custom) {
        custom.addEventListener('input', (e) => applyStickerColor(e.target.value));
    }
}

function applyStickerColor(color) {
    const layer = state.getSelectedLayer();
    if (!layer || layer.type !== 'sticker') {
        alert('请先在画布中选中一个【矢量贴纸】！');
        return;
    }
    if (layer.stickerType !== 'svg') {
        alert('只有"矢量"分类的 SVG 贴纸支持改色。位图/emoji 贴纸不能改色。');
        return;
    }
    layer.stickerColor = color;
    state.saveState();
    renderCanvas();
}

function showStickerColorBar(show) {
    const bar = document.getElementById('sticker-color-bar');
    if (bar) bar.style.display = show ? 'flex' : 'none';
}