// ============================================================
// cover-templates.js — 封面模板库（方向 A1）
// 职责边界：
//   ✅ 负责：10 个成品封面模板（背景 + 文字布局 + 特效 + 底衬全配好）、
//            模板预览网格渲染、点击套用到当前页面
//   ❌ 不负责：画布渲染（套用后只调 window.renderAll）、导出、选区、字体
// 依赖：state / normalizeBackground / applyBackgroundToCanvases / renderAll /
//       renderCanvas / renderLayerList / updateTopToolbarUI / showBgToast
// 加载顺序：必须晚于 app.js 与 background-core.js
// ============================================================

window.__COVER_TEMPLATES_READY__ = true;

// 每个模板 = { id, name, bg, layers: [...] }
// layer 字段与 state.addLayer 完全一致，套用时补 id
const COVER_TEMPLATES = [
    {
        id: 'tpl-viral-red',
        name: '爆款红黑',
        bg: { type: 'gradient', color1: '#ff2442', color2: '#1a0000', angle: 110, texture: 'vignette' },
        layers: [
            { type: 'text', content: '普通人\n如何逆袭', fontSize: '52px', fontFamily: 'sans-serif', color: '#ffffff', bold: true, italic: false, underline: false, strike: false, align: 'center', vertical: false, letterSpacing: 0, lineHeight: 1.15, opacity: 1, effectClass: 'effect-viral', x: 30, y: 120, width: 300, height: 180, heightMode: 'auto', rotation: 0, flipH: false, flipV: false },
            { type: 'text', content: '3 个月做到月入 5 万\n方法全公开', fontSize: '20px', fontFamily: 'sans-serif', color: '#ffeb3b', bold: true, italic: false, underline: false, strike: false, align: 'center', vertical: false, letterSpacing: 0, lineHeight: 1.4, opacity: 1, effectClass: 'effect-black-stroke', x: 40, y: 340, width: 280, height: 80, heightMode: 'auto', rotation: 0, flipH: false, flipV: false },
            { type: 'text', content: '🔥 建议收藏', fontSize: '16px', fontFamily: 'sans-serif', color: '#ffffff', bold: true, italic: false, underline: false, strike: false, align: 'center', vertical: false, letterSpacing: 0, lineHeight: 1.2, opacity: 1, effectClass: 'effect-neon', x: 110, y: 500, width: 140, height: 40, heightMode: 'auto', rotation: 0, flipH: false, flipV: false }
        ]
    },
    {
        id: 'tpl-knowledge-blue',
        name: '知识干货蓝',
        bg: { type: 'gradient', color1: '#0f2027', color2: '#2c5364', angle: 140, texture: 'grid' },
        layers: [
            { type: 'text', content: '90% 的人\n都做错了', fontSize: '50px', fontFamily: 'sans-serif', color: '#ffffff', bold: true, italic: false, underline: false, strike: false, align: 'left', vertical: false, letterSpacing: 0, lineHeight: 1.1, opacity: 1, effectClass: null, x: 28, y: 90, width: 304, height: 160, heightMode: 'auto', rotation: 0, flipH: false, flipV: false },
            { type: 'text', content: '掌握这 3 个底层逻辑\n效率直接翻倍', fontSize: '22px', fontFamily: 'sans-serif', color: '#00e5ff', bold: false, italic: false, underline: false, strike: false, align: 'left', vertical: false, letterSpacing: 0, lineHeight: 1.5, opacity: 1, effectClass: null, x: 28, y: 300, width: 304, height: 100, heightMode: 'auto', rotation: 0, flipH: false, flipV: false, backdrop: { type: 'paper', color: '#fff8dc', opacity: 0.92, padding: 14, rotate: -1 } },
            { type: 'text', content: '第 01 期', fontSize: '14px', fontFamily: 'monospace', color: '#ffffff', bold: true, italic: false, underline: false, strike: false, align: 'center', vertical: false, letterSpacing: 2, lineHeight: 1.2, opacity: 1, effectClass: null, x: 130, y: 560, width: 100, height: 30, heightMode: 'auto', rotation: 0, flipH: false, flipV: false }
        ]
    },
    {
        id: 'tpl-fresh-cream',
        name: '清新奶油',
        bg: { type: 'gradient', color1: '#fdfbfb', color2: '#ebedee', angle: 135, texture: 'none' },
        layers: [
            { type: 'text', content: '春日限定', fontSize: '44px', fontFamily: 'sans-serif', color: '#ff6b9d', bold: true, italic: false, underline: false, strike: false, align: 'center', vertical: false, letterSpacing: 2, lineHeight: 1.2, opacity: 1, effectClass: null, x: 40, y: 160, width: 280, height: 80, heightMode: 'auto', rotation: 0, flipH: false, flipV: false, backdrop: { type: 'washi', color: '#fdf2f8', opacity: 0.95, padding: 16, rotate: -2 } },
            { type: 'text', content: '温柔系穿搭指南\n显瘦又高级', fontSize: '24px', fontFamily: 'sans-serif', color: '#5a4a42', bold: false, italic: false, underline: false, strike: false, align: 'center', vertical: false, letterSpacing: 1, lineHeight: 1.6, opacity: 1, effectClass: null, x: 40, y: 300, width: 280, height: 100, heightMode: 'auto', rotation: 0, flipH: false, flipV: false },
            { type: 'text', content: '🌸 收藏慢慢看', fontSize: '15px', fontFamily: 'sans-serif', color: '#d81b60', bold: true, italic: false, underline: false, strike: false, align: 'center', vertical: false, letterSpacing: 0, lineHeight: 1.2, opacity: 1, effectClass: null, x: 100, y: 480, width: 160, height: 36, heightMode: 'auto', rotation: 0, flipH: false, flipV: false }
        ]
    },
    {
        id: 'tpl-dark-gold',
        name: '黑金奢华',
        bg: { type: 'gradient', color1: '#0a0a0a', color2: '#c9a227', angle: 130, texture: 'noise' },
        layers: [
            { type: 'text', content: '顶级思维', fontSize: '48px', fontFamily: 'serif', color: '#c9a227', bold: true, italic: false, underline: false, strike: false, align: 'center', vertical: false, letterSpacing: 6, lineHeight: 1.2, opacity: 1, effectClass: 'effect-gold', x: 40, y: 140, width: 280, height: 80, heightMode: 'auto', rotation: 0, flipH: false, flipV: false },
            { type: 'text', content: '拉开人与人差距的\n从来不是努力', fontSize: '26px', fontFamily: 'serif', color: '#ffffff', bold: false, italic: false, underline: false, strike: false, align: 'center', vertical: false, letterSpacing: 2, lineHeight: 1.5, opacity: 1, effectClass: null, x: 40, y: 280, width: 280, height: 120, heightMode: 'auto', rotation: 0, flipH: false, flipV: false, backdrop: { type: 'glass', color: '#ffffff', opacity: 0.18, padding: 16, rotate: 0 } }
        ]
    },
    {
        id: 'tpl-cyber-neon',
        name: '赛博霓虹',
        bg: { type: 'gradient', color1: '#ff00de', color2: '#00e5ff', angle: 130, texture: 'none' },
        layers: [
            { type: 'text', content: 'AI 时代\n普通人怎么赚', fontSize: '46px', fontFamily: 'sans-serif', color: '#ffffff', bold: true, italic: false, underline: false, strike: false, align: 'center', vertical: false, letterSpacing: 0, lineHeight: 1.1, opacity: 1, effectClass: 'effect-cyber', x: 30, y: 110, width: 300, height: 170, heightMode: 'auto', rotation: 0, flipH: false, flipV: false },
            { type: 'text', content: '3 个工具 + 1 套方法\n月入过万不是梦', fontSize: '20px', fontFamily: 'sans-serif', color: '#ffffff', bold: false, italic: false, underline: false, strike: false, align: 'center', vertical: false, letterSpacing: 0, lineHeight: 1.5, opacity: 1, effectClass: 'effect-glitch', x: 40, y: 340, width: 280, height: 90, heightMode: 'auto', rotation: 0, flipH: false, flipV: false }
        ]
    },
    {
        id: 'tpl-food-warm',
        name: '美食暖橙',
        bg: { type: 'gradient', color1: '#ff4500', color2: '#ffcc00', angle: 120, texture: 'noise' },
        layers: [
            { type: 'text', content: '一口入魂', fontSize: '50px', fontFamily: 'sans-serif', color: '#ffffff', bold: true, italic: false, underline: false, strike: false, align: 'center', vertical: false, letterSpacing: 4, lineHeight: 1.2, opacity: 1, effectClass: 'effect-red-stroke', x: 40, y: 150, width: 280, height: 80, heightMode: 'auto', rotation: 0, flipH: false, flipV: false },
            { type: 'text', content: '这家藏在巷子里的\n神仙小馆', fontSize: '24px', fontFamily: 'sans-serif', color: '#1a1a1a', bold: true, italic: false, underline: false, strike: false, align: 'center', vertical: false, letterSpacing: 1, lineHeight: 1.5, opacity: 1, effectClass: null, x: 50, y: 300, width: 260, height: 100, heightMode: 'auto', rotation: 0, flipH: false, flipV: false, backdrop: { type: 'sticky', color: '#fff740', opacity: 0.95, padding: 14, rotate: 2 } }
        ]
    },
    {
        id: 'tpl-travel-sky',
        name: '旅行天空',
        bg: { type: 'gradient', color1: '#e0f7fa', color2: '#80deea', angle: 135, texture: 'none' },
        layers: [
            { type: 'text', content: '说走就走', fontSize: '48px', fontFamily: 'sans-serif', color: '#0277bd', bold: true, italic: false, underline: false, strike: false, align: 'center', vertical: false, letterSpacing: 4, lineHeight: 1.2, opacity: 1, effectClass: null, x: 40, y: 140, width: 280, height: 80, heightMode: 'auto', rotation: 0, flipH: false, flipV: false },
            { type: 'text', content: '人均 800 玩转海岛\n5 天 4 夜全攻略', fontSize: '22px', fontFamily: 'sans-serif', color: '#ffffff', bold: true, italic: false, underline: false, strike: false, align: 'center', vertical: false, letterSpacing: 1, lineHeight: 1.5, opacity: 1, effectClass: 'effect-black-stroke', x: 40, y: 300, width: 280, height: 100, heightMode: 'auto', rotation: 0, flipH: false, flipV: false }
        ]
    },
    {
        id: 'tpl-fitness-energy',
        name: '健身燃脂',
        bg: { type: 'gradient', color1: '#ff4500', color2: '#1a1a1a', angle: 120, texture: 'vignette' },
        layers: [
            { type: 'text', content: '30 天\n暴瘦 20 斤', fontSize: '54px', fontFamily: 'sans-serif', color: '#ffffff', bold: true, italic: false, underline: false, strike: false, align: 'center', vertical: false, letterSpacing: 0, lineHeight: 1.1, opacity: 1, effectClass: 'effect-viral', x: 30, y: 100, width: 300, height: 180, heightMode: 'auto', rotation: 0, flipH: false, flipV: false },
            { type: 'text', content: '不节食 不反弹\n每天 20 分钟', fontSize: '22px', fontFamily: 'sans-serif', color: '#ffeb3b', bold: true, italic: false, underline: false, strike: false, align: 'center', vertical: false, letterSpacing: 1, lineHeight: 1.5, opacity: 1, effectClass: 'effect-black-stroke', x: 50, y: 380, width: 260, height: 90, heightMode: 'auto', rotation: 0, flipH: false, flipV: false }
        ]
    },
    {
        id: 'tpl-love-pink',
        name: '情感粉紫',
        bg: { type: 'gradient', color1: '#ffdde1', color2: '#ee9ca7', angle: 140, texture: 'none' },
        layers: [
            { type: 'text', content: '他到底\n爱不爱你', fontSize: '46px', fontFamily: 'sans-serif', color: '#d81b60', bold: true, italic: false, underline: false, strike: false, align: 'center', vertical: false, letterSpacing: 2, lineHeight: 1.15, opacity: 1, effectClass: null, x: 40, y: 130, width: 280, height: 150, heightMode: 'auto', rotation: 0, flipH: false, flipV: false },
            { type: 'text', content: '这 5 个细节骗不了人', fontSize: '22px', fontFamily: 'sans-serif', color: '#6a1b9a', bold: false, italic: false, underline: false, strike: false, align: 'center', vertical: false, letterSpacing: 1, lineHeight: 1.5, opacity: 1, effectClass: null, x: 40, y: 330, width: 280, height: 60, heightMode: 'auto', rotation: 0, flipH: false, flipV: false, backdrop: { type: 'highlight', color: '#ffffff', opacity: 0.55, padding: 12, rotate: -1 } }
        ]
    },
    {
        id: 'tpl-emoji-fun',
        name: '趣味表情',
        bg: { type: 'gradient', color1: '#ff9a9e', color2: '#fad0c4', angle: 135, texture: 'dots' },
        layers: [
            { type: 'text', content: '今天的我\n又摆烂了', fontSize: '46px', fontFamily: 'sans-serif', color: '#ffffff', bold: true, italic: false, underline: false, strike: false, align: 'center', vertical: false, letterSpacing: 0, lineHeight: 1.15, opacity: 1, effectClass: 'effect-black-stroke', x: 30, y: 130, width: 300, height: 150, heightMode: 'auto', rotation: 0, flipH: false, flipV: false },
            { type: 'text', content: '但还是要笑着面对 😂', fontSize: '20px', fontFamily: 'sans-serif', color: '#6a1b9a', bold: true, italic: false, underline: false, strike: false, align: 'center', vertical: false, letterSpacing: 0, lineHeight: 1.4, opacity: 1, effectClass: null, x: 40, y: 340, width: 280, height: 60, heightMode: 'auto', rotation: 0, flipH: false, flipV: false }
        ]
    }
];

// 补全 layer 默认字段（与 state.addLayer 的自动补齐逻辑一致）
function _normalizeTemplateLayer(src, idx) {
    const layer = Object.assign({
        id: 'tpl-layer-' + Date.now() + '-' + idx + '-' + Math.floor(Math.random() * 1000),
        type: 'text',
        content: '',
        fontSize: '20px',
        fontFamily: 'sans-serif',
        color: '#ffffff',
        bgColor: 'transparent',
        bold: false, italic: false, underline: false, strike: false,
        align: 'left', vertical: false,
        letterSpacing: 0, lineHeight: 1.2, opacity: 1,
        effectClass: null,
        rotation: 0, flipH: false, flipV: false,
        x: 35, y: 250, width: 290, height: 48,
        heightMode: 'auto',
        locked: false,
        groupId: null
    }, JSON.parse(JSON.stringify(src)));
    return layer;
}

// 套用模板到当前页面
function applyCoverTemplate(tpl) {
    if (!tpl || !window.state) return;
    const page = state.getCurrentPage && state.getCurrentPage();
    if (!page) {
        if (typeof showBgToast === 'function') showBgToast('当前没有可套用的页面');
        return;
    }

    // 1) 套背景
    if (tpl.bg) {
        state.background = (typeof normalizeBackground === 'function')
            ? normalizeBackground(Object.assign({}, tpl.bg, { presetId: null, imageUrl: '' }))
            : Object.assign({}, state.background, tpl.bg);
    }

    // 2) 清空当前页面图层并写入模板图层
    page.layers = (tpl.layers || []).map((src, idx) => _normalizeTemplateLayer(src, idx));

    // 3) 重置选中态
    state.selectedLayerId = page.layers[0] ? page.layers[0].id : null;
    state.selectedLayerIds = state.selectedLayerId ? [state.selectedLayerId] : [];
    state.editingLayerId = null;

    // 4) 保存 + 渲染
    if (typeof state.saveState === 'function') state.saveState();
    if (typeof applyBackgroundToCanvases === 'function') applyBackgroundToCanvases(state.background);
    if (typeof renderAll === 'function') {
        renderAll();
    } else {
        if (typeof renderCanvas === 'function') renderCanvas();
        if (typeof renderLayerList === 'function') renderLayerList();
        if (typeof updateTopToolbarUI === 'function') updateTopToolbarUI(state.getSelectedLayer());
    }

    if (typeof showBgToast === 'function') showBgToast('已套用模板：' + tpl.name + ' ✨');
}

// 渲染模板网格
function renderCoverTemplateGrid() {
    const grid = document.getElementById('cover-template-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!COVER_TEMPLATES.length) {
        const empty = document.createElement('div');
        empty.className = 'cover-template-empty';
        empty.textContent = '暂无模板';
        grid.appendChild(empty);
        return;
    }

    COVER_TEMPLATES.forEach(tpl => {
        const card = document.createElement('div');
        card.className = 'cover-template-card';
        card.dataset.templateId = tpl.id;
        card.title = tpl.name + '（点击套用）';

        // 预览背景
        if (typeof backgroundToCss === 'function') {
            card.style.background = backgroundToCss(tpl.bg);
            if (tpl.bg && tpl.bg.texture === 'grid') card.style.backgroundSize = '22px 22px, 22px 22px, 100% 100%';
            if (tpl.bg && tpl.bg.texture === 'dots') card.style.backgroundSize = '14px 14px, 100% 100%';
        }

        const preview = document.createElement('div');
        preview.className = 'ct-preview';

        const textLayers = (tpl.layers || []).filter(l => l.type === 'text');
        if (textLayers[0]) {
            const titleEl = document.createElement('div');
            titleEl.className = 'ct-title';
            titleEl.textContent = (textLayers[0].content || '').replace(/<[^>]*>/g, '');
            titleEl.style.fontSize = '14px';
            titleEl.style.color = textLayers[0].color || '#fff';
            preview.appendChild(titleEl);
        }
        if (textLayers[1]) {
            const subEl = document.createElement('div');
            subEl.className = 'ct-subtitle';
            subEl.textContent = (textLayers[1].content || '').replace(/<[^>]*>/g, '');
            preview.appendChild(subEl);
        }

        card.appendChild(preview);

        const badge = document.createElement('div');
        badge.className = 'ct-badge';
        badge.textContent = tpl.name;
        card.appendChild(badge);

        card.addEventListener('click', () => {
            if (!confirm('套用模板「' + tpl.name + '」会覆盖当前页面的图层，是否继续？')) return;
            applyCoverTemplate(tpl);
        });

        grid.appendChild(card);
    });
}

// 初始化
function initCoverTemplates() {
    if (window.__coverTemplatesInited) return;
    window.__coverTemplatesInited = true;
    renderCoverTemplateGrid();
    console.log('[CoverTemplates] 封面模板库初始化完成，共 ' + COVER_TEMPLATES.length + ' 个模板');
}

window.CoverTemplates = {
    list: COVER_TEMPLATES,
    apply: applyCoverTemplate,
    render: renderCoverTemplateGrid,
    init: initCoverTemplates
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        try { initCoverTemplates(); } catch (e) { console.warn('[CoverTemplates] 初始化失败:', e); }
    }, 350);
});