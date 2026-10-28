// ========== 贴纸系统 v4：AssetRegistry 国际化架构 ==========
// 改动说明：
//   1. 所有素材统一进 AssetRegistry（IndexedDB: douyin_assets_db）
//   2. 图层只存 assetId，content 仅作兼容兜底
//   3. 支持 emoji / svg / png / url / upload 五种类型
//   4. 暴露 window.DouyinCover.registerSticker API

const STICKER_RECENT_KEY = 'douyin_sticker_recent_ids_v4';
const STICKER_FREQ_KEY = 'douyin_sticker_freq_v4';
const STICKER_MAX_RECENT = 24;
const STICKER_PANEL_POS_KEY = 'douyin_sticker_panel_pos_v1';
const STICKER_BUILTIN_SEED_KEY = 'douyin_sticker_builtin_seeded_v1';

// ---------- 内置贴纸库（保留原结构，作为"分类元数据"） ----------
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

// ============================================================
// AssetRegistry —— 统一资产注册中心
// ============================================================
const AssetDB = (function () {
    const DB_NAME = 'douyin_assets_db';
    const STORE = 'assets';
    const DB_VER = 1;
    let dbPromise = null;

    function open() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VER);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    const store = db.createObjectStore(STORE, { keyPath: 'id' });
                    store.createIndex('type', 'type', { unique: false });
                    store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
                    store.createIndex('source', 'source', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e);
        });
        return dbPromise;
    }

    async function put(asset) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(asset);
            tx.oncomplete = () => resolve(asset.id);
            tx.onerror = (e) => reject(e);
        });
    }

    async function get(id) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = (e) => reject(e);
        });
    }

    async function getAll() {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = (e) => reject(e);
        });
    }

    async function remove(id) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e);
        });
    }

    return { put, get, getAll, remove };
})();

// ==================== AssetRegistry 安全修正版 v2 ====================
const AssetRegistry = (function () {
  const memoryCache = new Map();
  let db = null;
  let initPromise = null;
  const DB_NAME = 'douyin_assets_db';
  const STORE = 'assets';

  function openDB() {
    if (initPromise) return initPromise;
    initPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) {
          const store = d.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
          store.createIndex('source', 'source', { unique: false });
        }
      };
      req.onsuccess = async (e) => {
        db = e.target.result;
        try { await loadAllIntoCache(); } catch (err) {}
        resolve();
      };
      req.onerror = (e) => reject(e.error);
    });
    return initPromise;
  }

  function loadAllIntoCache() {
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        memoryCache.clear();
        (req.result || []).forEach(item => memoryCache.set(item.id, item));
        resolve();
      };
      req.onerror = () => resolve();
    });
  }

  function cleanSvg(data) {
    if (typeof data !== 'string') return data;
    const isDataUrl = data.startsWith('data:image/svg+xml');
    let raw = data;
    if (isDataUrl) {
      const idx = raw.indexOf(',');
      try { raw = decodeURIComponent(raw.slice(idx + 1)); } catch (e) { raw = raw.slice(idx + 1); }
    }
    raw = raw.replace(/fill="(?!none|currentColor|url\()[^"]*"/gi, 'fill="currentColor"');
    raw = raw.replace(/stroke="(?!none|currentColor|url\()[^"]*"/gi, 'stroke="currentColor"');
    return isDataUrl
      ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(raw)
      : raw;
  }

  async function register(assetData) {
    await openDB();
    let { type, name, data, tags = [], source = 'user', colorable = false } = assetData;
    if (type === 'svg') data = cleanSvg(data);

    for (const [id, a] of memoryCache) {
      if (a.type === type && a.data === data) return id;
    }

    const id = `${type}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const asset = {
      id, type, name: name || '', data,
      tags: Array.isArray(tags) ? tags : [],
      source, colorable: !!colorable,
      createdAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(asset);
      req.onsuccess = () => { memoryCache.set(id, asset); resolve(id); };
      req.onerror = () => reject(req.error);
    });
  }

  async function registerBatch(list) {
    const ids = [];
    for (const a of list) ids.push(await register(a));
    return ids;
  }

  async function get(id) {
    if (!id) return null;
    if (memoryCache.has(id)) return memoryCache.get(id);
    await openDB();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(id);
        req.onsuccess = () => {
          const a = req.result || null;
          if (a) memoryCache.set(id, a);
          resolve(a);
        };
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  async function list(opts = {}) {
    await openDB();
    let arr = Array.from(memoryCache.values());
    if (opts.type) arr = arr.filter(a => a.type === opts.type);
    if (opts.source) arr = arr.filter(a => a.source === opts.source);
    if (opts.tag) arr = arr.filter(a => a.tags.includes(opts.tag));
    if (opts.keyword) {
      const kw = opts.keyword.toLowerCase();
      arr = arr.filter(a =>
        (a.name || '').toLowerCase().includes(kw) ||
        a.tags.some(t => t.toLowerCase().includes(kw))
      );
    }
    return arr;
  }

  async function remove(id) {
    memoryCache.delete(id);
    await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

    function toSrc(asset, color) {
    if (!asset) return '';
    if (asset.type === 'svg') {
      const raw = asset.data || '';
      if (!raw) return '';

      // 已经是标准 URL 编码格式 → 直接用
      if (raw.startsWith('data:image/svg+xml;charset=utf-8,%3C')) return raw;
      if (raw.startsWith('data:image/svg+xml;utf8,%3C')) return raw;

      // 其它格式 → 自愈
      try {
        let tail = raw;
        if (raw.startsWith('data:')) {
          const idx = raw.indexOf(',');
          if (idx >= 0) tail = raw.slice(idx + 1);
        }
        let xml = '';

        // 1) 裸 SVG
        if (tail.trim().startsWith('<svg')) xml = tail;
        // 2) URL 编码 XML
        if (!xml) {
          try { const u = decodeURIComponent(tail); if (u.includes('<svg')) xml = u; } catch (e) {}
        }
        // 3) URL 编码的 base64 → base64
        if (!xml) {
          try {
            const u = decodeURIComponent(tail);
            if (/^[A-Za-z0-9+/=]+$/.test(u)) {
              const b = decodeURIComponent(escape(atob(u)));
              if (b.includes('<svg')) xml = b;
            }
          } catch (e) {}
        }
        // 4) 纯 base64
        if (!xml) {
          try {
            const clean = tail.replace(/[^A-Za-z0-9+/=]/g, '');
            if (clean.length > 20) {
              const b = decodeURIComponent(escape(atob(clean)));
              if (b.includes('<svg')) xml = b;
            }
          } catch (e) {}
        }
        // 5) 字符串里含 <svg 就截取出来
        if (!xml) {
          const i = raw.indexOf('<svg');
          if (i >= 0) xml = raw.slice(i);
        }

        if (xml) return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
      } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[Sticker] AssetRegistry.toSrc 解码 SVG 失败', e);
      }

      return raw;
    }
    return asset.data || '';
  }

  // ============================================================
  // P2-5：自动清理孤儿资产
  // ============================================================
  // 扫当前所有页的图层 + 背景 + 品牌包，收集"现在还在用"的 assetId 集合
  function collectLiveAssetIds() {
    const live = new Set();
    try {
      const st = window.state;
      if (!st) return live;
      // 1) 所有页的图层
      (st.pages || []).forEach(page => {
        (page.layers || []).forEach(layer => {
          if (!layer) return;
          if (layer.assetId) live.add(layer.assetId);
          if (layer.backdrop && layer.backdrop.customId != null) {
            // 底衬 customId 是 legacy 数字 id，需查 douyin_backdrop_asset_map 映射到 assetId
            try {
              const map = JSON.parse(localStorage.getItem('douyin_backdrop_asset_map') || '{}');
              const aid = map[layer.backdrop.customId];
              if (aid) live.add(aid);
            } catch (e) { /* ignore */ }
          }
        });
      });
      // 2) 背景图片
      const bg = st.background;
      if (bg) {
        if (bg.customImageId != null) {
          const key = String(bg.customImageId);
          if (key.startsWith('bgImage-')) {
            live.add(key);
          } else {
            try {
              const map = JSON.parse(localStorage.getItem('douyin_bgimage_asset_map') || '{}');
              const aid = map[key];
              if (aid) live.add(aid);
            } catch (e) { /* ignore */ }
          }
        }
      }
      // 3) 品牌资产：字体 / Logo
      if (window.BrandManager && BrandManager.data) {
        (BrandManager.data.fonts || []).forEach(f => { if (f.assetId) live.add(f.assetId); });
        (BrandManager.data.logos || []).forEach(l => { if (l.id && String(l.id).startsWith('image-')) live.add(l.id); });
      }
    } catch (e) {
      if (window.Utils && Utils.log) Utils.log.warn('[AssetRegistry] 收集 live 资产失败', e);
    }
    return live;
  }

  // 清理孤儿资产：默认只清 source=user/migrated 且超过 7 天没被引用的
  // 返回 { removed, keptBuiltin, keptRecent, keptLive, totalBytes }，不实际删（dryRun=true）
  async function cleanupUnused(opts) {
    opts = opts || {};
    const dryRun = opts.dryRun !== false;
    const minAgeDays = opts.minAgeDays != null ? opts.minAgeDays : 7;
    const now = Date.now();
    const minAgeMs = minAgeDays * 24 * 60 * 60 * 1000;

    await openDB();
    const all = Array.from(memoryCache.values());
    const live = collectLiveAssetIds();
    const toRemove = [];
    let keptBuiltin = 0;
    let keptRecent = 0;
    let keptLive = 0;
    let totalBytes = 0;

    for (const a of all) {
      // 内置素材永久保留
      if (a.source === 'builtin' || a.source === 'api') { keptBuiltin++; continue; }
      // 还在用
      if (live.has(a.id)) { keptLive++; continue; }
      // 太新（最近 minAgeDays 天新增的），先不删，防止误删
      const createdAt = a.createdAt || 0;
      if (now - createdAt < minAgeMs) { keptRecent++; continue; }
      // 计算大小（data 是字符串，按 UTF-16 2 字节估算）
      const dataLen = (a.data && typeof a.data === 'string') ? a.data.length * 2 : 0;
      totalBytes += dataLen;
      toRemove.push(a);
    }

    if (!dryRun) {
      for (const a of toRemove) {
        try {
          memoryCache.delete(a.id);
          await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            const req = tx.objectStore(STORE).delete(a.id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          });
        } catch (e) {
          if (window.Utils && Utils.log) Utils.log.warn('[AssetRegistry] 删除孤儿资产失败', a.id, e);
        }
      }
    }

    return {
      dryRun,
      removed: toRemove.length,
      keptBuiltin,
      keptRecent,
      keptLive,
      totalBytes,
      items: toRemove.map(a => ({
        id: a.id, type: a.type, name: a.name || '',
        bytes: (a.data && typeof a.data === 'string') ? a.data.length * 2 : 0
      }))
    };
  }



0000000000000000000000000000
    // ============================================================
  // P2-5：自动清理孤儿资产
  // ============================================================
  // 扫当前所有页的图层 + 背景 + 品牌包，收集"现在还在用"的 assetId 集合
  function collectLiveAssetIds() {
    const live = new Set();
    try {
      const st = window.state;
      if (!st) return live;
      (st.pages || []).forEach(page => {
        (page.layers || []).forEach(layer => {
          if (!layer) return;
          if (layer.assetId) live.add(layer.assetId);
          if (layer.backdrop && layer.backdrop.customId != null) {
            try {
              const map = JSON.parse(localStorage.getItem('douyin_backdrop_asset_map') || '{}');
              const aid = map[layer.backdrop.customId];
              if (aid) live.add(aid);
            } catch (e) { /* ignore */ }
          }
        });
      });
      const bg = st.background;
      if (bg) {
        if (bg.customImageId != null) {
          const key = String(bg.customImageId);
          if (key.startsWith('bgImage-')) {
            live.add(key);
          } else {
            try {
              const map = JSON.parse(localStorage.getItem('douyin_bgimage_asset_map') || '{}');
              const aid = map[key];
              if (aid) live.add(aid);
            } catch (e) { /* ignore */ }
          }
        }
      }
      if (window.BrandManager && BrandManager.data) {
        (BrandManager.data.fonts || []).forEach(f => { if (f.assetId) live.add(f.assetId); });
        (BrandManager.data.logos || []).forEach(l => { if (l.id && String(l.id).startsWith('image-')) live.add(l.id); });
      }
    } catch (e) {
      if (window.Utils && Utils.log) Utils.log.warn('[AssetRegistry] 收集 live 资产失败', e);
    }
    return live;
  }

  async function cleanupUnused(opts) {
    opts = opts || {};
    const dryRun = opts.dryRun !== false;
    const minAgeDays = opts.minAgeDays != null ? opts.minAgeDays : 7;
    const now = Date.now();
    const minAgeMs = minAgeDays * 24 * 60 * 60 * 1000;

    await openDB();
    const all = Array.from(memoryCache.values());
    const live = collectLiveAssetIds();
    const toRemove = [];
    let keptBuiltin = 0;
    let keptRecent = 0;
    let keptLive = 0;
    let totalBytes = 0;

    for (const a of all) {
      if (a.source === 'builtin' || a.source === 'api') { keptBuiltin++; continue; }
      if (live.has(a.id)) { keptLive++; continue; }
      const createdAt = a.createdAt || 0;
      if (now - createdAt < minAgeMs) { keptRecent++; continue; }
      const dataLen = (a.data && typeof a.data === 'string') ? a.data.length * 2 : 0;
      totalBytes += dataLen;
      toRemove.push(a);
    }

    if (!dryRun) {
      for (const a of toRemove) {
        try {
          memoryCache.delete(a.id);
          await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            const req = tx.objectStore(STORE).delete(a.id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          });
        } catch (e) {
          if (window.Utils && Utils.log) Utils.log.warn('[AssetRegistry] 删除孤儿资产失败', a.id, e);
        }
      }
    }

    return {
      dryRun,
      removed: toRemove.length,
      keptBuiltin,
      keptRecent,
      keptLive,
      totalBytes,
      items: toRemove.map(a => ({
        id: a.id, type: a.type, name: a.name || '',
        bytes: (a.data && typeof a.data === 'string') ? a.data.length * 2 : 0
      }))
    };
  }

  return {
    init: openDB,
    register, registerBatch, get, list, remove, toSrc,
    collectLiveAssetIds, cleanupUnused,
    isReady: () => !!db
  };
})();

window.AssetRegistry = AssetRegistry;


// ============================================================
// 初始化
// ============================================================
async function initStickersModule() {
    // btn-add-sticker 已从顶栏删除，改由左栏 sticker 工具通过 LeftRail 触发
    // 这里仍然初始化贴纸模块（AssetRegistry 注册、面板构建），只是不绑按钮
    // 面板的打开由 left-rail.js 的 openStickerPanel() 调用
    // 兼容：如果按钮存在（老版本）就绑定
    const btn = document.getElementById('btn-add-sticker');

    await AssetRegistry.init();
    await seedBuiltinStickers();

    buildStickerPanel();
    buildStickerColorBar();
    restoreStickerPanelPosition();
    initStickerPanelDrag();

    if (btn) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const panel = document.getElementById('sticker-panel');
            if (panel) {
                panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
            }
        });
    }

    const _closeBtn = document.getElementById('sticker-panel-close');
    if (_closeBtn) {
        _closeBtn.addEventListener('click', () => {
            document.getElementById('sticker-panel').style.display = 'none';
        });
    }

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

// ---------- 内置素材 → AssetRegistry（只做一次） ----------
async function seedBuiltinStickers() {
    if (localStorage.getItem(STICKER_BUILTIN_SEED_KEY) === 'done') return;

    const list = [];
    Object.keys(STICKER_LIBRARY).forEach(catKey => {
        const lib = STICKER_LIBRARY[catKey];
        lib.items.forEach(it => {
            list.push({
                type: lib.type === 'image' ? 'png' : lib.type,
                name: it.k || '',
                data: it.c,
                tags: [catKey, ...(it.k || '').split(/\s+/)].filter(Boolean),
                source: 'builtin',
                colorable: lib.type === 'svg'
            });
        });
    });
    try {
        await AssetRegistry.registerBatch(list);
        localStorage.setItem(STICKER_BUILTIN_SEED_KEY, 'done');
    } catch (e) {
        console.warn('内置贴纸初始化失败:', e);
    }
}

// ---------- 面板拖动 ----------
function initStickerPanelDrag() {
    const panel = document.getElementById('sticker-panel');
    const handle = document.getElementById('sticker-panel-drag-handle');
    if (!panel || !handle) return;

    let isPanelDragging = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;

    handle.addEventListener('mousedown', (e) => {
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

        try {
            localStorage.setItem(STICKER_PANEL_POS_KEY, JSON.stringify({
                left: panel.style.left,
                top: panel.style.top
            }));
        } catch (err) {
            if (window.Utils && Utils.log) Utils.log.warn('[Sticker] 保存贴纸面板位置失败', err);
        }
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
    } catch (err) {
        if (window.Utils && Utils.log) Utils.log.warn('[Sticker] 恢复贴纸面板位置失败', err);
    }
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

// ---------- 最近 / 频次（改存 assetId） ----------
function getRecentStickerIds() {
    try { return JSON.parse(localStorage.getItem(STICKER_RECENT_KEY) || '[]'); }
    catch (e) { return []; }
}
function addToRecentStickers(assetId) {
    let list = getRecentStickerIds();
    list = list.filter(x => x !== assetId);
    list.unshift(assetId);
    if (list.length > STICKER_MAX_RECENT) list = list.slice(0, STICKER_MAX_RECENT);
    try { localStorage.setItem(STICKER_RECENT_KEY, JSON.stringify(list)); } catch (e) {}
}
function getStickerFreq() {
    try { return JSON.parse(localStorage.getItem(STICKER_FREQ_KEY) || '{}'); }
    catch (e) { return {}; }
}
function bumpStickerFreq(assetId) {
    const freq = getStickerFreq();
    freq[assetId] = (freq[assetId] || 0) + 1;
    try { localStorage.setItem(STICKER_FREQ_KEY, JSON.stringify(freq)); } catch (e) {}
}

// ---------- 网格渲染（全部从 AssetRegistry 拉） ----------
async function renderStickerGrid() {
    const grid = document.getElementById('sticker-grid');
    if (!grid) return;
    grid.innerHTML = '';
    await AssetRegistry.init();

    let items = [];

    if (currentStickerSearch) {
        items = await AssetRegistry.list({ keyword: currentStickerSearch });
    } else if (currentStickerCategory === 'all') {
        items = await AssetRegistry.list({});
    } else if (currentStickerCategory === 'freq') {
        const freq = getStickerFreq();
        const all = await AssetRegistry.list({});
        items = all
            .filter(a => freq[a.id] > 0)
            .sort((a, b) => (freq[b.id] || 0) - (freq[a.id] || 0))
            .slice(0, 40);
    } else if (currentStickerCategory === 'recent') {
        const recent = getRecentStickerIds();
        const map = new Map((await AssetRegistry.list({})).map(a => [a.id, a]));
        items = recent.map(id => map.get(id)).filter(Boolean);
    } else if (currentStickerCategory === 'uploaded') {
        items = await AssetRegistry.list({ source: 'user' });
        items = items.filter(a => {
            // ✅ 严格白名单：只保留贴纸类型
            if (a.type === 'backdrop' || a.type === 'bgImage' || a.type === 'font') return false;
            if (a.type === 'emoji' || a.type === 'svg') return true;
            if (a.type === 'image' || a.type === 'png') return true;
            if (a.type === 'upload') {
                const d = String(a.data || '');
                return d.startsWith('data:image/') || d.startsWith('http') || d.startsWith('blob:');
            }
            return false;
        });
    } else {
        items = await AssetRegistry.list({ tag: currentStickerCategory });
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

    items.forEach(asset => {
        grid.appendChild(createStickerItemEl(asset));
    });
}

function createStickerItemEl(asset) {
    const el = document.createElement('div');
    el.className = 'sticker-item';
    el.dataset.assetId = asset.id;
    el.dataset.type = asset.type;

    if (currentStickerCategory === 'recent') el.classList.add('recent-flag');
    const freq = getStickerFreq();
    if (freq[asset.id] > 0 && currentStickerCategory !== 'freq') {
        el.classList.add('freq-flag');
        el.dataset.freq = freq[asset.id];
    }

    el.title = (asset.name || '') + '  ·  单击添加，或拖拽到画布';

    if (asset.type === 'emoji') {
        el.innerText = asset.data;
    } else {
        let src = '';
        try { src = AssetRegistry.toSrc(asset, asset.colorable ? '#ffffff' : null); } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[Sticker] toSrc 生成贴纸源失败', asset && asset.id, e);
            src = '';
        }
        if (src && src.startsWith('<svg')) {
            src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
        }
        const img = document.createElement('img');
        img.src = src;
        img.draggable = false;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.style.pointerEvents = 'none';
        el.appendChild(img);
    }

    el.addEventListener('click', () => {
        addStickerToCanvas(asset.id, null, null);
    });

    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', (e) => {
        draggedStickerData = { assetId: asset.id };
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'copy';
        try { e.dataTransfer.setData('text/plain', asset.id); } catch (err) {}
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
        addStickerToCanvas(draggedStickerData.assetId, x - w / 2, y - h / 2);
        draggedStickerData = null;
    });
}

// ---------- 添加到画布（核心：存 assetId） ----------
async function addStickerToCanvas(assetId, xOverride, yOverride) {
    const asset = await AssetRegistry.get(assetId);
    if (!asset) {
        alert('素材不存在，请刷新后重试');
        return;
    }
    // ✅ 严格白名单：backdrop/bgImage/font 一律拒绝
    if (asset.type === 'backdrop' || asset.type === 'bgImage' || asset.type === 'font') {
        alert('这个素材是底衬/背景图/字体，不能作为贴纸添加。');
        return;
    }
    const _d = String(asset.data || '');
    const _okType = asset.type === 'emoji' || asset.type === 'svg' || asset.type === 'image' || asset.type === 'png'
        || (asset.type === 'upload' && (_d.startsWith('data:image/') || _d.startsWith('http') || _d.startsWith('blob:')));
    if (!_okType) {
        alert('这个素材不是图片，无法作为贴纸使用。');
        return;
    }

    const w = 80, h = 80;
    const newLayer = {
        id: 'sticker-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        type: 'sticker',
        assetId: asset.id,
        stickerType: (function(t) {
            if (t === 'svg') return 'svg';
            if (t === 'emoji') return 'emoji';
            if (t === 'png' || t === 'image' || t === 'upload') return 'image';
            return 'image';
        })(asset.type),
        stickerColor: null,
        content: AssetRegistry.toSrc(asset),
        fontSize: Math.min(w, h) + 'px',   // emoji 贴纸用，w/h 是 80
        flipH: false,
        flipV: false,
        rotation: 0,
        opacity: 1,
        x: Math.max(0, Math.min(
            (xOverride !== null && xOverride !== undefined) ? xOverride : 140,
            360 - w
        )),
        y: Math.max(0, Math.min(
            (yOverride !== null && yOverride !== undefined) ? yOverride : 280,
            640 - h
        )),
        width: w,
        height: h
    };

    state.addLayer(newLayer);
    renderCanvas();
    renderLayerList();

    addToRecentStickers(asset.id);
    bumpStickerFreq(asset.id);

    if (currentStickerCategory === 'recent' || currentStickerCategory === 'freq') {
        renderStickerGrid();
    }
}

// ---------- 用户上传（走 AssetRegistry） ----------
async function saveUploadedSticker(file) {
    try {
        const dataUrl = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = e => res(e.target.result);
            r.onerror = rej;
            r.readAsDataURL(file);
        });
        const _ext = (file.name.split('.').pop() || '').toLowerCase();
        const _isImg = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg', 'avif', 'ico'].includes(_ext);
        if (!_isImg) {
            alert('只支持图片格式：jpg / jpeg / png / webp / gif / bmp / svg / avif / ico');
            return;
        }

        // ✅ SVG 上传：先把 dataURL 解成纯 XML，再交给 register 统一编码
        let finalData = dataUrl;
        if (_ext === 'svg') {
            try {
                const idx = dataUrl.indexOf(',');
                let raw = dataUrl.slice(idx + 1);
                try { raw = decodeURIComponent(raw); } catch (e) {}
                // 兼容 base64 形式
                if (!raw.includes('<svg') && /^[A-Za-z0-9+/=]+$/.test(raw)) {
                    try { raw = decodeURIComponent(escape(atob(raw))); } catch (e) {}
                }
                if (raw.includes('<svg')) {
                    finalData = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(raw);
                }
            } catch (e) {}
        }

        await AssetRegistry.register({
            type: _ext === 'svg' ? 'svg' : 'upload',
            name: file.name,
            data: finalData,
            tags: ['uploaded', _ext, file.name.replace(/\.[^.]+$/, '')],
            source: 'user',
            colorable: _ext === 'svg'
        });
        alert(`贴纸 "${file.name}" 已加入素材库`);
    } catch (err) {
        console.error('上传贴纸失败:', err);
        alert('上传失败：' + err.message);
    }
}

async function deleteUploadedSticker(assetId) {
    await AssetRegistry.remove(assetId);
    let recent = getRecentStickerIds().filter(x => x !== assetId);
    try { localStorage.setItem(STICKER_RECENT_KEY, JSON.stringify(recent)); } catch (e) {}
    const freq = getStickerFreq();
    delete freq[assetId];
    try { localStorage.setItem(STICKER_FREQ_KEY, JSON.stringify(freq)); } catch (e) {}
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

async function applyStickerColor(color) {
    const layer = state.getSelectedLayer();
    if (!layer || layer.type !== 'sticker') {
        alert('请先在画布中选中一个【矢量贴纸】！');
        return;
    }
    const asset = layer.assetId ? await AssetRegistry.get(layer.assetId) : null;
    const isSvg = (asset && asset.type === 'svg') || layer.stickerType === 'svg';
    if (!isSvg) {
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

// ============================================================
// 对外 API（国际化对齐）
// ============================================================
window.DouyinCover = window.DouyinCover || {};
window.DouyinCover.registerSticker = async function (def) {
    return AssetRegistry.register({
        ...def,
        source: 'api',
        colorable: def.colorable !== undefined ? def.colorable : (def.type === 'svg')
    });
};
window.DouyinCover.listStickers = (opts) => AssetRegistry.list(opts);
window.DouyinCover.addStickerToCanvas = addStickerToCanvas;
window.DouyinCover.getStickerAsset = (id) => AssetRegistry.get(id);




// ============================================================
// 国际版扩展：让底衬 / 字体 / 背景图 也走 AssetRegistry
// 本段由 stickers.js 末尾追加，不改动上方任何贴纸代码
// ============================================================

// 注册"底衬"资产（type:'backdrop'）
AssetRegistry.registerBackdrop = async function(def) {
    return AssetRegistry.register({
        ...def,
        type: 'backdrop',
        source: def.source || 'user',
        colorable: def.colorable !== undefined ? def.colorable : (def.svg ? true : false)
    });
};

// 注册"字体"资产（type:'font'）
AssetRegistry.registerFont = async function(def) {
    return AssetRegistry.register({
        ...def,
        type: 'font',
        source: def.source || 'user',
        colorable: false
    });
};

// 注册"背景图"资产（type:'bgImage'）
AssetRegistry.registerBgImage = async function(def) {
    return AssetRegistry.register({
        ...def,
        type: 'bgImage',
        source: def.source || 'user',
        colorable: false
    });
};

// 列出某类型资产
AssetRegistry.listByType = async function(type, opts) {
    return AssetRegistry.list(Object.assign({ type }, opts || {}));
};

// 把对外 API 扩展一下
window.DouyinCover.registerBackdrop = AssetRegistry.registerBackdrop;
window.DouyinCover.registerFont = AssetRegistry.registerFont;
window.DouyinCover.registerBgImage = AssetRegistry.registerBgImage;
window.DouyinCover.listByType = AssetRegistry.listByType;


// ============================================================
// 国际版扩展：字体上传时同步写 AssetRegistry（不修改 app.js）
// 原理：monkey-patch app.js 的 fileInput change 事件，在它处理完后补写一份
// ============================================================
(function patchFontUploadToRegistry() {
    document.addEventListener('DOMContentLoaded', () => {
        const fileInput = document.getElementById('local-font-file');
        if (!fileInput) return;
        // 用 capture 阶段在 app.js 的 handler 之前拿到文件，
        // 但真正的写 AssetRegistry 放在 setTimeout 里等 app.js 处理完
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const fileName = file.name;
            // 延迟执行，让 app.js 的 handler 先跑完（它会把字体写 localStorage）
            setTimeout(() => {
                try {
                    const savedFonts = JSON.parse(localStorage.getItem('douyin_cover_custom_fonts') || '[]');
                    // 找到刚存进去的那条（按 displayName 匹配）
                    const displayName = fileName.replace(/\.[^/.]+$/, "");
                    const justSaved = savedFonts.find(f => f.displayName === displayName);
                    if (!justSaved) return;
                    if (window.AssetRegistry && AssetRegistry.registerFont) {
                        AssetRegistry.registerFont({
                            name: displayName,
                            data: justSaved.fontDataUrl,
                            tags: ['font', 'custom', displayName],
                            source: 'user'
                        }).then(id => {
                            console.log('[AssetRegistry] 字体已入库:', displayName, id);
                        }).catch(err => {
                            console.warn('[AssetRegistry] 字体入库失败:', err);
                        });
                    }
                } catch (err) {
                    if (window.Utils && Utils.log) Utils.log.warn('[Sticker] 字体入库同步失败', err);
                }
            }, 300);
        }, true);
    });
})();




// ============================================================
// 国际版扩展：字体持久化保险（每次页面加载时，从 AssetRegistry 反查一遍）
// 原理：localStorage 被清 / 写入失败时，只要 IndexedDB 有 font 资产就能恢复
// ============================================================
(function fontPersistenceGuard() {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(async () => {
            try {
                if (!window.AssetRegistry) return;
                await AssetRegistry.init();
                const fontAssets = await AssetRegistry.list({ type: 'font' });
                if (!fontAssets || fontAssets.length === 0) return;

                const fontSelect = document.getElementById('tb-font');
                if (!fontSelect) return;

                const savedFonts = JSON.parse(localStorage.getItem('douyin_cover_custom_fonts') || '[]');
                const savedNames = new Set(savedFonts.map(f => f.displayName));

                for (const asset of fontAssets) {
                    if (savedNames.has(asset.name)) continue;

                    console.log('[FontGuard] 从 AssetRegistry 恢复字体:', asset.name);
                    const fontName = 'CustomFont_recovered_' + asset.id.replace(/[^a-zA-Z0-9]/g, '_');
                    const displayName = asset.name;
                    const fontDataUrl = asset.data;

                    if (!fontDataUrl || typeof fontDataUrl !== 'string' || !fontDataUrl.startsWith('data:')) {
                        console.warn('[FontGuard] 字体资产缺少有效 data，跳过:', asset.name, asset.id);
                        continue;
                    }

                    try {
                        const res = await fetch(fontDataUrl);
                        const buffer = await res.arrayBuffer();
                        const fontFace = new FontFace(fontName, buffer);
                        const loaded = await fontFace.load();
                        document.fonts.add(loaded);
                    } catch (e) {
                        console.warn('[FontGuard] 字体加载失败:', displayName, e);
                        continue;
                    }

                    let exists = Array.from(fontSelect.options).some(opt => opt.value === fontName);
                    if (!exists) {
                        const option = document.createElement('option');
                        option.value = fontName;
                        option.innerText = '✍️ ' + displayName;
                        fontSelect.appendChild(option);
                    }

                    try {
                        const list = JSON.parse(localStorage.getItem('douyin_cover_custom_fonts') || '[]');
                        if (!list.some(f => f.displayName === displayName)) {
                            list.push({ fontName, displayName, assetId: asset.id });
                            localStorage.setItem('douyin_cover_custom_fonts', JSON.stringify(list));
                        }
                    } catch (e) {
                        if (window.Utils && Utils.log) Utils.log.warn('[Sticker] FontGuard 写回 localStorage 失败', e);
                    }
                }
                        } catch (err) {
                console.warn('[FontGuard] 字体恢复流程出错:', err);
            }
        }, 1500);
    });
})();


// ============================================================
// P2-5 步骤 2：清理未使用资产 按钮 → 弹窗 → 确认 → 真删
// ============================================================
(function initAssetCleanupUI() {
    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('btn-cleanup-assets');
        if (!btn) return;
        btn.addEventListener('click', async () => {
            if (!window.AssetRegistry || typeof AssetRegistry.cleanupUnused !== 'function') {
                alert('AssetRegistry 未就绪，请刷新后重试');
                return;
            }
            btn.disabled = true;
            const oldHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 扫描中…';
            try {
                const r = await AssetRegistry.cleanupUnused({ dryRun: true });
                btn.disabled = false;
                btn.innerHTML = oldHtml;
                showAssetCleanupModal(r);
            } catch (err) {
                btn.disabled = false;
                btn.innerHTML = oldHtml;
                alert('扫描失败：' + (err && err.message ? err.message : err));
            }
        });
    });

    function fmtBytes(n) {
        if (!n || n <= 0) return '0 B';
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / 1024 / 1024).toFixed(2) + ' MB';
    }

    function showAssetCleanupModal(result) {
        const old = document.getElementById('asset-cleanup-modal');
        if (old) old.remove();

        const modal = document.createElement('div');
        modal.id = 'asset-cleanup-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);';

        const box = document.createElement('div');
        box.style.cssText = 'background:#161b22;border:1px solid #30363d;border-radius:10px;width:520px;max-width:92vw;max-height:80vh;display:flex;flex-direction:column;color:#c9d1d9;box-shadow:0 20px 50px rgba(0,0,0,0.8);font-size:12px;overflow:hidden;';

        const header = document.createElement('div');
        header.style.cssText = 'padding:12px 16px;border-bottom:1px solid #30363d;background:#1c2128;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;';
        header.innerHTML = '<h3 style="margin:0;color:#f1e05a;font-size:13px;"><i class="fa-solid fa-broom"></i> 清理未使用资产</h3>';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'tool-btn';
        closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        closeBtn.addEventListener('click', () => modal.remove());
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.style.cssText = 'padding:14px 16px;overflow-y:auto;flex:1 1 auto;min-height:0;';

        if (result.removed === 0) {
            body.innerHTML =
                '<div style="text-align:center;padding:24px 0;line-height:1.8;">' +
                '<div style="font-size:32px;margin-bottom:8px;">✨</div>' +
                '<div style="font-size:13px;color:#7ee787;font-weight:600;margin-bottom:6px;">没有可清理的孤儿资产</div>' +
                '<div style="font-size:11px;color:#8b949e;line-height:1.8;">' +
                '内置素材 ' + result.keptBuiltin + ' 个（永久保留）<br>' +
                '最近新增 ' + result.keptRecent + ' 个（7 天内不删）<br>' +
                '正在使用 ' + result.keptLive + ' 个' +
                '</div></div>';
        } else {
            let listHtml = '<div style="margin-bottom:10px;line-height:1.7;color:#c9d1d9;">' +
                '可释放 <b style="color:#7ee787;">' + fmtBytes(result.totalBytes) + '</b>，共 <b style="color:#ff7b72;">' + result.removed + '</b> 个孤儿资产：' +
                '</div>';
            listHtml += '<div style="max-height:260px;overflow-y:auto;border:1px solid #30363d;border-radius:6px;background:#0d1117;">';
            result.items.forEach((it, idx) => {
                listHtml += '<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 10px;' +
                    (idx > 0 ? 'border-top:1px solid #21262d;' : '') + 'font-size:11px;">' +
                    '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + (it.id || '') + '">' +
                    '[' + it.type + '] ' + (it.name || '(无名)') + '</span>' +
                    '<span style="color:#8b949e;flex-shrink:0;">' + fmtBytes(it.bytes) + '</span>' +
                    '</div>';
            });
            listHtml += '</div>';
            listHtml += '<div style="margin-top:10px;font-size:11px;color:#8b949e;line-height:1.7;">' +
                '只删：不在任何页、背景、品牌包里的资产，且创建超过 7 天。<br>' +
                '不会删：内置素材、最近 7 天新增的、正在被引用的。' +
                '</div>';
            body.innerHTML = listHtml;
        }

        const footer = document.createElement('div');
        footer.style.cssText = 'padding:12px 16px;border-top:1px solid #30363d;background:#1c2128;display:flex;justify-content:flex-end;gap:8px;flex-shrink:0;';

        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn';
        btnCancel.textContent = result.removed === 0 ? '关闭' : '取消';
        btnCancel.addEventListener('click', () => modal.remove());
        footer.appendChild(btnCancel);

        if (result.removed > 0) {
            const btnConfirm = document.createElement('button');
            btnConfirm.className = 'btn btn-primary';
            btnConfirm.innerHTML = '<i class="fa-solid fa-trash"></i> 确认清理 ' + result.removed + ' 个';
            btnConfirm.addEventListener('click', async () => {
                btnConfirm.disabled = true;
                btnConfirm.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 清理中…';
                try {
                    const r2 = await AssetRegistry.cleanupUnused({ dryRun: false });
                    btnConfirm.disabled = false;
                    btnConfirm.innerHTML = '<i class="fa-solid fa-check"></i> 已清理 ' + r2.removed + ' 个';
                    if (typeof showBgToast === 'function') {
                        showBgToast('已清理 ' + r2.removed + ' 个孤儿资产，释放 ' + fmtBytes(r2.totalBytes) + ' ✓');
                    }
                    setTimeout(() => modal.remove(), 1200);
                } catch (err) {
                    btnConfirm.disabled = false;
                    btnConfirm.innerHTML = '<i class="fa-solid fa-trash"></i> 重试';
                    alert('清理失败：' + (err && err.message ? err.message : err));
                }
            });
            footer.appendChild(btnConfirm);
        }

        box.appendChild(header);
        box.appendChild(body);
        box.appendChild(footer);
        modal.appendChild(box);
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }
})();


// ==================== 增量挂载外部 API ====================
window.DouyinCover = window.DouyinCover || {};
Object.assign(window.DouyinCover, {
  version: '1.0.0',
  _listeners: window.DouyinCover._listeners || {},
  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
  },
  emit(event, data) {
    (this._listeners[event] || []).forEach(cb => { try { cb(data); } catch (e) {} });
  }
});