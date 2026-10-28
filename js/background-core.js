// ============================================================
// background-core.js — 背景系统 v2（P1：从 app.js 迁出）
// 职责边界：
//   ✅ 负责：背景状态归一化、CSS 生成、应用到画布、面板同步、
//            预设渲染（含收藏/最近/上传）、智能推荐、随机高级、
//            提取主色、快捷收藏、bg toast
//   ❌ 不负责：背景图片的 IndexedDB 存取（在 background-image.js）
//   ❌ 不负责：预设数据本身（在 background-presets.js）
//   ❌ 不负责：画布渲染（在 app.js 的 renderCanvas）
// 依赖：state / BG_PRESETS / DEFAULT_BACKGROUND（background-presets.js）
//       BGImageDB / bgImageCache（background-image.js）
// 被依赖：app.js（initBackgroundPanelV2 / applyBackgroundToCanvases /
//         normalizeBackground / renderBgPresetGrid / updateBackgroundView）
// 加载顺序：必须晚于 app.js（本文件函数声明覆盖 app.js 同名旧声明）
// ============================================================

window.__BACKGROUND_CORE_READY__ = true;

// ============================================================
// 第一组：背景状态归一化 + CSS 生成 + 应用到画布
// 从 app.js 逐字迁入，函数名不变，覆盖 app.js 里的同名声明
// ============================================================

function normalizeBackground(bg) {
      // ✅ v2：优先用已有的 __v2（可能含 overlay 层，migrateLegacy 会丢），否则 migrate
  if (window.BackgroundEngine && BackgroundEngine.migrateLegacy) {
    let migrated;
    if (bg && bg.__v2 && bg.__v2.version === 2 && Array.isArray(bg.__v2.layers)) {
      migrated = bg.__v2;
    } else {
      migrated = BackgroundEngine.migrateLegacy(bg);
    }
        // ✅ 关键修复：外层字段显式存在时，覆盖 __v2.base 对应字段
    //    这样 bg-color-1 / bg-color-2 / bg-angle / bg-image-file / bg-img-* 等
    //    只要改了 state.background.xxx，就一定会反映到渲染
    if (bg) {
      const wantKind = bg.type === 'image' ? 'image'
                     : (bg.type === 'solid' ? 'solid' : 'gradient');
      const base = Object.assign({}, migrated.base);
      let changed = false;

      if (bg.type && base.kind !== wantKind) { base.kind = wantKind; changed = true; }
      if (bg.color1 !== undefined && base.color1 !== bg.color1) { base.color1 = bg.color1; changed = true; }
      if (bg.color2 !== undefined && base.color2 !== bg.color2) { base.color2 = bg.color2; changed = true; }
      if (bg.angle !== undefined && base.angle !== bg.angle) { base.angle = bg.angle; changed = true; }
      if (bg.imageUrl !== undefined && base.imageUrl !== bg.imageUrl) { base.imageUrl = bg.imageUrl; changed = true; }
      if (bg.customImageId !== undefined && base.customImageId !== bg.customImageId) { base.customImageId = bg.customImageId; changed = true; }
      if (bg.fit !== undefined && base.fit !== bg.fit) { base.fit = bg.fit; changed = true; }
      if (bg.scale !== undefined && base.scale !== bg.scale) { base.scale = bg.scale; changed = true; }
      if (bg.positionX !== undefined && base.positionX !== bg.positionX) { base.positionX = bg.positionX; changed = true; }
      if (bg.positionY !== undefined && base.positionY !== bg.positionY) { base.positionY = bg.positionY; changed = true; }
      if (bg.blur !== undefined && base.blur !== bg.blur) { base.blur = bg.blur; changed = true; }
      if (bg.colorFilter !== undefined && base.colorFilter !== bg.colorFilter) { base.colorFilter = bg.colorFilter; changed = true; }
      if (bg.overlayColor !== undefined && base.overlayColor !== bg.overlayColor) { base.overlayColor = bg.overlayColor; changed = true; }
      if (bg.overlayOpacity !== undefined && base.overlayOpacity !== bg.overlayOpacity) { base.overlayOpacity = bg.overlayOpacity; changed = true; }
      if (bg.overlayType !== undefined && base.overlayType !== bg.overlayType) { base.overlayType = bg.overlayType; changed = true; }
      if (bg.overlayAngle !== undefined && base.overlayAngle !== bg.overlayAngle) { base.overlayAngle = bg.overlayAngle; changed = true; }
      if (bg.presetId !== undefined && base.presetId !== bg.presetId) { base.presetId = bg.presetId; changed = true; }

      if (changed) {
        migrated = { version: 2, base, layers: migrated.layers };
      }
    }
    // 把 v2 的 base 平铺回老字段，保证下游 syncBgPanelInputs / renderBgPresetGrid 读老字段不崩
    const flat = Object.assign({}, migrated.base);
    flat.type = migrated.base.kind === 'image' ? 'image'
             : (migrated.base.kind === 'solid' ? 'solid' : 'gradient');
    // 旧 texture 字段从 layers 里取第一条 texture（面板下拉仍读这个）
    const texLayer = (migrated.layers || []).find(l => l.kind === 'texture');
    flat.texture = texLayer ? texLayer.texture : 'none';
    // 保留 v2 结构，供新引擎和叠加层 UI 使用
    flat.__v2 = migrated;
    bg = flat;
  }

  // hardDefaults 是模块级共享对象，仅用作兜底快照。。
  // 切勿在外部 mutate hardDefaults.overlayStops / .overlayCenter，
  // 本函数每次都会返回深拷贝。
  const hardDefaults = {
    type: 'gradient',
    color1: '#ff2442',
    color2: '#2575fc',
    imageUrl: '',
    angle: 135,
    texture: 'none',
    presetId: null,
    fit: 'cover',
    scale: 1,
    positionX: 50,
    positionY: 50,
    blur: 0,
    overlayColor: '#000000',
    overlayOpacity: 0,
    overlayType: 'solid',
    // pos 为 0~1（注意：不是 0~100），渲染时会 ×100 转 %
    overlayStops: [
      { pos: 0,    color: '#FFF9F0', opacity: 0.12 },
      { pos: 0.40, color: '#FFF9F0', opacity: 0.05 },
      { pos: 1,    color: '#F0E6D8', opacity: 0.35 }
    ],
    // CSS 语义：0=下→上，90=左→右，180=上→下（默认上亮下暗）
    overlayAngle: 180,
    overlayCenter: { x: 50, y: 40 },
    colorFilter: 'none'
  };

  const base = Object.assign({}, hardDefaults, window.DEFAULT_BACKGROUND || {}, bg || {});

  base.overlayStops = (Array.isArray(base.overlayStops) ? base.overlayStops : [])
    .map(s => ({
      pos: Math.max(0, Math.min(1, Number(s.pos) || 0)),
      color: s.color || '#000000',
      opacity: Math.max(0, Math.min(1, Number(s.opacity) || 0))
    }));
  if (!base.overlayStops.length) {
    base.overlayStops = hardDefaults.overlayStops.map(s => ({...s}));
  }
  base.overlayCenter = Object.assign({ x: 50, y: 40 }, base.overlayCenter || {});

  return base;
}

function textureOverlayCss(texture) {
    switch (texture) {
        case 'noise':
            return `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.16'/></svg>")`;
        case 'grid':
            return `linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)`;
        case 'dots':
            return `radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1.5px)`;
        case 'vignette':
            return `radial-gradient(ellipse at center, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 100%)`;
        default:
            return '';
    }
}

function backgroundToCss(bg) {
    bg = normalizeBackground(bg);
    // ✅ v2：交给新引擎渲染（等价于旧逻辑，且支持叠加层）
    if (window.BackgroundEngine && BackgroundEngine.render) {
        const r = BackgroundEngine.render(bg.__v2 || bg);
        if (r.needsImageApply) {
            return bg.imageUrl ? `url(${bg.imageUrl}) center/cover no-repeat` : '#000';
        }
        return r.css;
    }
    // 兜底：引擎未加载时走旧逻辑（不应发生，保留防崩）
    const angle = (bg.angle !== undefined && bg.angle !== null) ? bg.angle : 135;
    const texture = bg.texture || 'none';
    let baseCss = '';
    if (bg.type === 'gradient') {
        baseCss = `linear-gradient(${angle}deg, ${bg.color1} 0%, ${bg.color2} 100%)`;
    } else if (bg.type === 'solid') {
        baseCss = bg.color1;
    } else if (bg.type === 'image' && bg.imageUrl) {
        return `url(${bg.imageUrl}) center/cover no-repeat`;
    } else {
        baseCss = '#000';
    }
    const overlay = textureOverlayCss(texture);
    if (!overlay) return baseCss;
    return `${overlay}, ${baseCss}`;
}

function applyBackgroundToCanvases(bg) {
    bg = normalizeBackground(bg);

    // ✅ v2：图片 base 仍交给 background-image.js，但只在“确实是图片”时调
    if (bg.type === 'image') {
        if (window.applyBackgroundToCanvasesWithImage) {
            window.applyBackgroundToCanvasesWithImage(bg);
        }
        return;
    }

    // 非图片 base：先清掉图片模式可能残留的 filter/transform/overlay，再走引擎
    document.querySelectorAll('.canvas-bg').forEach(el => {
        el.style.filter = '';
        el.style.transform = '';
        el.style.transformOrigin = '';
    });
    document.querySelectorAll('.canvas-bg-overlay').forEach(o => o.remove());

    // 新引擎统一渲染（含叠加层）
    if (window.BackgroundEngine && BackgroundEngine.applyToCanvas) {
        BackgroundEngine.applyToCanvas(bg.__v2 || bg);
        return;
    }

    // 兜底（不应发生）
    const css = backgroundToCss(bg);
    document.querySelectorAll('.canvas-bg').forEach(el => {
        el.style.background = css;
        el.style.backgroundSize = '';
        if (bg.texture === 'grid') {
            el.style.backgroundSize = '22px 22px, 22px 22px, 100% 100%';
        } else if (bg.texture === 'dots') {
            el.style.backgroundSize = '14px 14px, 100% 100%';
        }
    });
}

// 挂到 window，确保跨文件可访问（函数声明会自动挂全局，但显式挂更稳）
window.normalizeBackground = normalizeBackground;
window.textureOverlayCss = textureOverlayCss;
window.backgroundToCss = backgroundToCss;
window.applyBackgroundToCanvases = applyBackgroundToCanvases;

console.log('[BackgroundCore] 第一组函数已接管：normalizeBackground / textureOverlayCss / backgroundToCss / applyBackgroundToCanvases');

// ============================================================
// 第二组：面板同步 + 视图刷新 + 收藏/最近/查找工具
// ============================================================

// ✅ 不声明全局常量（app.js 里已有同名 const，任何全局重复声明都会 SyntaxError）
//    改为各函数内部局部常量，彻底避开冲突

function syncBgPanelInputs(bg) {
    bg = normalizeBackground(bg);
    const typeEl = document.getElementById('bg-type');
    if (typeEl) typeEl.value = bg.type;

    const c1 = document.getElementById('bg-color-1');
    const c2 = document.getElementById('bg-color-2');
    if (c1) c1.value = bg.color1 || '#ff2442';
    if (c2) c2.value = bg.color2 || '#2575fc';

    const angleEl = document.getElementById('bg-angle');
    const angleVal = document.getElementById('bg-angle-val');
    if (angleEl) angleEl.value = bg.angle ?? 135;
    if (angleVal) angleVal.textContent = bg.angle ?? 135;

    const texEl = document.getElementById('bg-texture');
    if (texEl) texEl.value = bg.texture || 'none';

    const colorControls = document.getElementById('bg-color-controls');
    const imageControls = document.getElementById('bg-image-controls');
    if (colorControls && imageControls) {
        const showColor = (bg.type === 'gradient' || bg.type === 'solid');
        colorControls.style.display = showColor ? 'block' : 'none';
        imageControls.style.display = showColor ? 'none' : 'block';
    }

    if (typeof window.syncImagePanelVisibility === 'function') {
        window.syncImagePanelVisibility(bg);
    }
        if (typeof window.syncImageControlsToState === 'function') {
        window.syncImageControlsToState();
    }
    // ✅ v2：同步后刷新叠加层面板
    if (window.BackgroundLayersUI && typeof window.BackgroundLayersUI.render === 'function') {
        try { window.BackgroundLayersUI.render(); } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[BG] BackgroundLayersUI.render 失败', e);
        }
    }
}

function updateBackgroundView() {
    applyBackgroundToCanvases(state.background);
    syncBgPanelInputs(state.background);
    renderBgPresetGrid();
}

function getFavPresetIds() {
    const BG_FAV_KEY = 'douyin_bg_favs_v2';
    try { return JSON.parse(localStorage.getItem(BG_FAV_KEY) || '[]'); }
    catch (e) { return []; }
}
function saveFavPresetIds(ids) {
    const BG_FAV_KEY = 'douyin_bg_favs_v2';
    try { localStorage.setItem(BG_FAV_KEY, JSON.stringify(ids)); } catch (e) {}
}
function getRecentPresetIds() {
    const BG_RECENT_KEY = 'douyin_bg_recent_v2';
    try { return JSON.parse(localStorage.getItem(BG_RECENT_KEY) || '[]'); }
    catch (e) { return []; }
}
function pushRecentPresetId(id) {
    const BG_RECENT_KEY = 'douyin_bg_recent_v2';
    const BG_RECENT_MAX = 12;
    let list = getRecentPresetIds();
    list = list.filter(x => x !== id);
    list.unshift(id);
    if (list.length > BG_RECENT_MAX) list = list.slice(0, BG_RECENT_MAX);
    try { localStorage.setItem(BG_RECENT_KEY, JSON.stringify(list)); } catch (e) {}
}

function findPresetById(id) {
    return (window.BG_PRESETS || []).find(p => p.id === id)
        || getCustomBgFavs().find(p => p.id === id)
        || null;
}

window.syncBgPanelInputs = syncBgPanelInputs;
window.updateBackgroundView = updateBackgroundView;
window.getFavPresetIds = getFavPresetIds;
window.saveFavPresetIds = saveFavPresetIds;
window.getRecentPresetIds = getRecentPresetIds;
window.pushRecentPresetId = pushRecentPresetId;
window.findPresetById = findPresetById;

console.log('[BackgroundCore] 第二组函数已接管：syncBgPanelInputs / updateBackgroundView / 收藏·最近工具 / findPresetById');

// ============================================================
// 第三组：预设网格渲染 + 应用预设 + 自定义收藏库
// ============================================================

function getCustomBgFavs() {
    try {
        const raw = localStorage.getItem('douyin_custom_bg_favs_v1');
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
}

function applyPresetToState(preset) {
    if (!preset) return;
    const newBg = {
        type: preset.type || 'gradient',
        color1: preset.color1 || '#000000',
        color2: preset.color2 || preset.color1 || '#000000',
        imageUrl: '',
        angle: preset.angle ?? 135,
        texture: preset.texture || 'none',
        presetId: preset.id
    };
    state.background = normalizeBackground(newBg);
    applyBackgroundToCanvases(state.background);
    syncBgPanelInputs(state.background);
    renderBgPresetGrid();
    pushRecentPresetId(preset.id);
    state.saveState();
}

function renderBgPresetGrid() {
    const grid = document.getElementById('bg-preset-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const favIds = getFavPresetIds();
    const currentPresetId = (state.background && state.background.presetId) || null;
    const store = (typeof getFavImageStore === 'function') ? getFavImageStore() : {};
    const currentBgCategory = (typeof window.__currentBgCategory !== 'undefined')
        ? window.__currentBgCategory
        : (window.currentBgCategory || 'hot');

    if (currentBgCategory === 'fav') {
        const presetList = favIds.map(id => findPresetById(id)).filter(Boolean);
        const imgKeys = favIds.filter(id => store[id] && (id.startsWith('img-') || id.startsWith('url-')));

        if (presetList.length === 0 && imgKeys.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'bg-preset-empty';
            empty.innerHTML = '还没有收藏任何背景<br><small style="color:#6e7681;">点击任意预设右上角 ★ 或「收藏当前背景」即可收藏</small>';
            grid.appendChild(empty);
            return;
        }

        presetList.forEach(preset => {
            const card = document.createElement('div');
            card.className = 'bg-preset-card';
            card.dataset.presetId = preset.id;
            if (preset.id === currentPresetId) card.classList.add('active');
            if (favIds.includes(preset.id)) card.classList.add('fav-on');

            const swatch = document.createElement('div');
            swatch.className = 'bp-swatch';
            swatch.style.background = backgroundToCss(preset);
            if (preset.texture === 'grid') swatch.style.backgroundSize = '22px 22px, 22px 22px, 100% 100%';
            if (preset.texture === 'dots') swatch.style.backgroundSize = '14px 14px, 100% 100%';
            card.appendChild(swatch);

            const label = document.createElement('div');
            label.className = 'bp-label';
            label.textContent = preset.name;
            card.appendChild(label);

            const star = document.createElement('div');
            star.className = 'bp-star';
            star.innerHTML = '★';
            star.title = '取消收藏';
            star.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavPreset(preset.id);
            });
            card.appendChild(star);

            card.addEventListener('click', () => applyPresetToState(preset));
            grid.appendChild(card);
        });

        imgKeys.forEach(key => {
            const entry = store[key];
            if (!entry) return;

            const card = document.createElement('div');
            card.className = 'bg-preset-card is-uploaded';
            card.dataset.presetId = key;

            const curBg = state.background;
            if (curBg && curBg.type === 'image' &&
                ((curBg.customImageId && ('img-' + curBg.customImageId) === key) ||
                 (!curBg.customImageId && curBg.imageUrl === entry.dataUrl))) {
                card.classList.add('active');
            }

            const swatch = document.createElement('div');
            swatch.className = 'bp-swatch';
            if (entry.dataUrl) {
                swatch.style.background = `url(${entry.dataUrl}) center/cover no-repeat`;
            } else {
                swatch.style.background = '#30363d';
            }
            card.appendChild(swatch);

            const label = document.createElement('div');
            label.className = 'bp-label';
            label.textContent = '图片背景';
            card.appendChild(label);

            const del = document.createElement('div');
            del.className = 'bp-star';
            del.style.background = '#f85149';
            del.style.color = '#fff';
            del.innerHTML = '×';
            del.title = '移出收藏';
            del.style.display = 'flex';
            del.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('从收藏夹移除这张图片背景？')) {
                    toggleFavPreset(key);
                }
            });
            card.appendChild(del);

            card.addEventListener('click', () => {
                applyFavImageEntry(key);
            });

            grid.appendChild(card);
        });

        return;
    }

    const list = getPresetsByCategory(currentBgCategory);

    if (list.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'bg-preset-empty';
        empty.innerHTML = currentBgCategory === 'recent'
            ? '暂无最近使用记录<br><small style="color:#6e7681;">应用任意预设后会自动出现在这里</small>'
            : '暂无预设';
        grid.appendChild(empty);
        return;
    }

    list.forEach(preset => {
        const card = document.createElement('div');
        card.className = 'bg-preset-card';
        card.dataset.presetId = preset.id;
        if (preset.id === currentPresetId) card.classList.add('active');
        if (favIds.includes(preset.id)) card.classList.add('fav-on');

        const swatch = document.createElement('div');
        swatch.className = 'bp-swatch';
        swatch.style.background = backgroundToCss(preset);
        if (preset.texture === 'grid') swatch.style.backgroundSize = '22px 22px, 22px 22px, 100% 100%';
        if (preset.texture === 'dots') swatch.style.backgroundSize = '14px 14px, 100% 100%';
        card.appendChild(swatch);

        const label = document.createElement('div');
        label.className = 'bp-label';
        label.textContent = preset.name;
        card.appendChild(label);

        const star = document.createElement('div');
        star.className = 'bp-star';
        star.innerHTML = '★';
        star.title = '收藏 / 取消收藏';
        star.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavPreset(preset.id);
        });
        card.appendChild(star);

        card.addEventListener('click', () => applyPresetToState(preset));
        grid.appendChild(card);
    });
}

function getPresetsByCategory(cat) {
    if (cat === 'fav') {
        const favIds = getFavPresetIds();
        return favIds.map(id => findPresetById(id)).filter(Boolean);
    }
    if (cat === 'recent') {
        return getRecentPresetIds().map(id => findPresetById(id)).filter(Boolean);
    }
    return (window.BG_PRESETS || []).filter(p => p.cat === cat);
}

function renderFavBackgrounds() {
    const listEl = document.getElementById('fav-bg-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const favIds = getFavPresetIds();
    const store = (typeof getFavImageStore === 'function') ? getFavImageStore() : {};

    if (favIds.length === 0) {
        const demo = (window.BG_PRESETS || []).filter(p => p.cat === 'hot').slice(0, 4);
        demo.forEach(preset => listEl.appendChild(buildFavQuickItem(preset, false)));
        return;
    }

    favIds.forEach(id => {
        if (store[id] && (id.startsWith('img-') || id.startsWith('url-'))) {
            listEl.appendChild(buildFavQuickImageItem(id, store[id], true));
            return;
        }
        const preset = findPresetById(id);
        if (preset) listEl.appendChild(buildFavQuickItem(preset, true));
    });
}

function buildFavQuickItem(preset, showDelete) {
    const item = document.createElement('div');
    item.style.cssText = 'height: 32px; border-radius: 4px; border: 1px solid #30363d; cursor: pointer; position: relative; overflow: hidden;';
    item.style.background = backgroundToCss(preset);
    if (preset.texture === 'grid') item.style.backgroundSize = '22px 22px, 22px 22px, 100% 100%';
    if (preset.texture === 'dots') item.style.backgroundSize = '14px 14px, 100% 100%';
    item.title = `点击应用「${preset.name}」`;

    item.addEventListener('click', () => applyPresetToState(preset));

    if (showDelete) {
        const del = document.createElement('div');
        del.innerHTML = '×';
        del.title = '取消收藏';
        del.style.cssText = 'position:absolute;top:1px;right:1px;width:14px;height:14px;background:#f85149;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;z-index:5;font-weight:bold;line-height:1;box-shadow:0 1px 3px rgba(0,0,0,0.5);';
        del.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`把「${preset.name}」从收藏夹移除？`)) {
                toggleFavPreset(preset.id);
            }
        });
        item.appendChild(del);
    }

    return item;
}

function buildFavQuickImageItem(key, entry, showDelete) {
    const item = document.createElement('div');
    item.dataset.favImgKey = key;
    item.style.cssText = 'height: 32px; border-radius: 4px; border: 1px solid #30363d; cursor: pointer; position: relative; overflow: hidden;';
    if (entry.dataUrl) {
        item.style.background = `url(${entry.dataUrl}) center/cover no-repeat`;
    } else {
        item.style.background = '#30363d';
    }
    item.title = '点击应用这张图片背景';

    item.addEventListener('click', () => applyFavImageEntry(key));

    if (showDelete) {
        const del = document.createElement('div');
        del.innerHTML = '×';
        del.title = '取消收藏';
        del.style.cssText = 'position:absolute;top:1px;right:1px;width:14px;height:14px;background:#f85149;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;z-index:5;font-weight:bold;line-height:1;box-shadow:0 1px 3px rgba(0,0,0,0.5);';
        del.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('把这张图片背景从收藏夹移除？')) {
                toggleFavPreset(key);
            }
        });
        item.appendChild(del);
    }

    return item;
}

window.getCustomBgFavs = getCustomBgFavs;
window.applyPresetToState = applyPresetToState;
window.renderBgPresetGrid = renderBgPresetGrid;
window.getPresetsByCategory = getPresetsByCategory;
window.renderFavBackgrounds = renderFavBackgrounds;
window.buildFavQuickItem = buildFavQuickItem;
window.buildFavQuickImageItem = buildFavQuickImageItem;

console.log('[BackgroundCore] 第三组函数已接管：预设网格渲染 / 应用预设 / 自定义收藏');

// ============================================================
// 第四组（最终块）：分类状态同步 + 收藏切换 + 智能推荐/随机/提取 + toast + 面板初始化
// ============================================================

// ✅ 分类状态收口：统一存在 window 上，renderBgPresetGrid 读这里
if (typeof window.__currentBgCategory === 'undefined') {
    window.__currentBgCategory = 'hot';
}
function setBgCategory(cat) {
    window.__currentBgCategory = cat;
    if (typeof window.currentBgCategory !== 'undefined') {
        try { window.currentBgCategory = cat; } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[BG] 同步 currentBgCategory 失败', e);
        }
    }
}
function getBgCategory() {
    return window.__currentBgCategory || 'hot';
}

function toggleFavPreset(id) {
    let favIds = getFavPresetIds();
    if (favIds.includes(id)) {
        favIds = favIds.filter(x => x !== id);
        if (id.startsWith('img-') || id.startsWith('url-')) {
            if (typeof removeFavImageEntry === 'function') removeFavImageEntry(id);
        }
        if (id.startsWith('custom-bg-')) {
            try {
                const raw = localStorage.getItem('douyin_custom_bg_favs_v1') || '[]';
                let list = JSON.parse(raw);
                if (Array.isArray(list)) {
                    list = list.filter(it => it.id !== id);
                    localStorage.setItem('douyin_custom_bg_favs_v1', JSON.stringify(list));
                }
            } catch (e) {
                if (window.Utils && Utils.log) Utils.log.warn('[BG] 移除自定义背景收藏失败', e);
            }
        }
    } else {
        favIds.push(id);
    }
    saveFavPresetIds(favIds);
    renderBgPresetGrid();
    renderFavBackgrounds();
}

function handleSmartRecommend() {
    const layer = state.getSelectedLayer && state.getSelectedLayer();
    let candidates = [];
    const presets = window.BG_PRESETS || [];
    const kwMap = window.SMART_KEYWORD_MAP || [];
    const fxMap = window.SMART_EFFECT_MAP || {};

    if (layer && layer.type === 'text' && layer.content) {
        const text = String(layer.content).replace(/<[^>]*>/g, '').toLowerCase();
        kwMap.forEach(rule => {
            if (rule.keys.some(k => text.includes(k))) {
                candidates.push(...rule.presets);
            }
        });
    }

    if (layer && layer.effectClass && fxMap[layer.effectClass]) {
        candidates.push(...fxMap[layer.effectClass]);
    }

    if (candidates.length === 0) {
        candidates = presets.filter(p => p.cat === 'hot').map(p => p.id);
    }

    const currentId = state.background && state.background.presetId;
    candidates = Array.from(new Set(candidates)).filter(id => id !== currentId);

    if (candidates.length === 0) {
        showBgToast('已是最佳匹配，无需更换 ✨');
        return;
    }

    const pickId = candidates[Math.floor(Math.random() * candidates.length)];
    const preset = findPresetById(pickId);
    if (preset) {
        applyPresetToState(preset);
        showBgToast(`智能推荐：<b>${preset.name}</b> ✨`);
        setTimeout(() => {
            const card = document.querySelector(`.bg-preset-card[data-preset-id="${preset.id}"]`);
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 80);
    }
}

function handleRandomAdvanced() {
    const presets = window.BG_PRESETS || [];
    const pool = presets.filter(p =>
        ['hot', 'fresh', 'dark', 'neon', 'festival', 'knowledge'].includes(p.cat)
    );
    const currentId = state.background && state.background.presetId;
    const filtered = pool.filter(p => p.id !== currentId);
    const finalPool = filtered.length > 0 ? filtered : pool;
    const pick = finalPool[Math.floor(Math.random() * finalPool.length)];
    if (pick) {
        applyPresetToState(pick);
        showBgToast(`随机高级背景：<b>${pick.name}</b> 🎲`);
    }
}

function handleExtractColorClick() {
    const layer = state.getSelectedLayer && state.getSelectedLayer();
    if (layer && layer.type === 'sticker' && layer.content) {
        if (layer.content.startsWith('data:image') || /^https?:/.test(layer.content)) {
            extractColorsFromImageSrc(layer.content, `贴纸「${layer.stickerType || 'image'}」`);
            return;
        }
    }
    const fileInput = document.getElementById('bg-extract-file');
    if (fileInput) fileInput.click();
}

function extractColorsFromImageSrc(src, sourceLabel) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        try {
            const colors = extractDominantColors(img, 3);
            if (!colors || colors.length < 2) {
                showBgToast('未能提取到足够颜色，请换一张图试试', 3000);
                return;
            }
            const [c1, c2] = buildHarmoniousGradientColors(colors);
            const angle = 90 + Math.floor(Math.random() * 90);
            state.background = normalizeBackground({
                type: 'gradient',
                color1: c1,
                color2: c2,
                imageUrl: '',
                angle,
                texture: 'none',
                presetId: null
            });
            applyBackgroundToCanvases(state.background);
            syncBgPanelInputs(state.background);
            state.saveState();
            showBgToast(`已从${sourceLabel}提取主色生成渐变 🎨`);
        } catch (err) {
            console.error(err);
            showBgToast('提取失败：' + err.message, 3200);
        }
    };
    img.onerror = () => showBgToast('图片加载失败，请更换图片', 3200);
    img.src = src;
}

function extractDominantColors(img, count) {
    const maxW = 120, maxH = 120;
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('图片尺寸为 0');
    const ratio = Math.min(maxW / w, maxH / h, 1);
    w = Math.max(1, Math.round(w * ratio));
    h = Math.max(1, Math.round(h * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    const buckets = new Map();
    const Q = 24;
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 100) continue;
        const brightness = (r + g + b) / 3;
        if (brightness > 245 || brightness < 8) continue;
        const qr = Math.round(r / Q), qg = Math.round(g / Q), qb = Math.round(b / Q);
        const key = `${qr},${qg},${qb}`;
        const existing = buckets.get(key);
        if (existing) {
            existing.count++;
            existing.r += r; existing.g += g; existing.b += b;
        } else {
            buckets.set(key, { count: 1, r, g, b });
        }
    }

    if (buckets.size === 0) return [];

    const list = Array.from(buckets.values())
        .map(v => ({ r: v.r / v.count, g: v.g / v.count, b: v.b / v.count, count: v.count }))
        .sort((a, b) => b.count - a.count);

    const picked = [];
    const minDist = 60;
    for (const item of list) {
        if (picked.length >= count) break;
        if (picked.every(p => colorDistance(p, item) > minDist)) {
            picked.push(item);
        }
    }
    if (picked.length < 2) {
        for (const item of list) {
            if (picked.length >= Math.max(2, count)) break;
            if (!picked.includes(item)) picked.push(item);
        }
    }
    return picked.map(p => ({ r: Math.round(p.r), g: Math.round(p.g), b: Math.round(p.b) }));
}

function colorDistance(a, b) {
    const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

function rgbToHex({ r, g, b }) {
    const to2 = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return '#' + to2(r) + to2(g) + to2(b);
}

function rgbToHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
            case g: h = ((b - r) / d + 2); break;
            case b: h = ((r - g) / d + 4); break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255)
    };
}

function buildHarmoniousGradientColors(extracted) {
    const base = extracted[0];
    const hsl = rgbToHsl(base);

    if (extracted[1]) {
        const hsl2 = rgbToHsl(extracted[1]);
        let hueDiff = Math.abs(hsl.h - hsl2.h);
        if (hueDiff > 180) hueDiff = 360 - hueDiff;
        if (hueDiff >= 25 && hueDiff <= 200) {
            const c1 = rgbToHex(hslToRgb(hsl.h, Math.min(90, Math.max(45, hsl.s)), Math.min(70, Math.max(35, hsl.l))));
            const c2 = rgbToHex(hslToRgb(hsl2.h, Math.min(90, Math.max(45, hsl2.s)), Math.min(75, Math.max(30, hsl2.l))));
            return [c1, c2];
        }
    }

    const offset = 30 + Math.random() * 25;
    const sign = Math.random() > 0.5 ? 1 : -1;
    const h1 = hsl.h;
    const h2 = hsl.h + sign * offset;
    const s1 = Math.min(92, Math.max(55, hsl.s));
    const s2 = Math.min(92, Math.max(55, hsl.s));
    const l1 = Math.min(68, Math.max(38, hsl.l));
    const l2 = Math.min(72, Math.max(30, hsl.l - 10));
    const c1 = rgbToHex(hslToRgb(h1, s1, l1));
    const c2 = rgbToHex(hslToRgb(h2, s2, l2));
    return [c1, c2];
}

function initExtractFileInput() {
    const input = document.getElementById('bg-extract-file');
    if (!input || input.dataset.bound === 'true') return;
    input.dataset.bound = 'true';
    input.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            extractColorsFromImageSrc(evt.target.result, `图片「${file.name}」`);
        };
        reader.readAsDataURL(file);
        input.value = '';
    });
}

function showBgToast(html, duration) {
    let el = document.getElementById('bg-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'bg-toast';
        el.className = 'bg-toast';
        document.body.appendChild(el);
    }
    el.innerHTML = html;
    void el.offsetWidth;
    el.classList.add('show');
    if (window.__bgToastTimer) clearTimeout(window.__bgToastTimer);
    window.__bgToastTimer = setTimeout(() => {
        el.classList.remove('show');
    }, duration || 2200);
}

function initBackgroundPanelV2() {
    state.background = normalizeBackground(state.background);

    const bAi = document.getElementById('bg-smart-recommend');
    const bRand = document.getElementById('bg-random-advanced');
    const bExtract = document.getElementById('bg-extract-color');
    if (bAi) bAi.addEventListener('click', handleSmartRecommend);
    if (bRand) bRand.addEventListener('click', handleRandomAdvanced);
    if (bExtract) bExtract.addEventListener('click', handleExtractColorClick);
    initExtractFileInput();

    const tabsEl = document.getElementById('bg-category-tabs');
    if (tabsEl && tabsEl.dataset.bound !== 'true') {
        tabsEl.dataset.bound = 'true';
        tabsEl.querySelectorAll('.bg-cat-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                tabsEl.querySelectorAll('.bg-cat-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                setBgCategory(tab.dataset.cat);
                renderBgPresetGrid();
            });
        });
    }

    const advToggle = document.getElementById('bg-advanced-toggle');
    const advBody = document.getElementById('bg-advanced-body');
    if (advToggle && advBody && advToggle.dataset.bound !== 'true') {
        advToggle.dataset.bound = 'true';
        advToggle.addEventListener('click', () => {
            const isOpen = advToggle.classList.toggle('open');
            advBody.style.display = isOpen ? 'block' : 'none';
        });
    }

        const bgType = document.getElementById('bg-type');
    if (bgType) {
        bgType.addEventListener('change', (e) => {
            const newType = e.target.value;
            // ✅ 显式构造新对象，并把 __v2.base.kind 一起改，避免 normalizeBackground 回退
            const old = state.background || {};
            const v2 = (old.__v2 && old.__v2.version === 2) ? old.__v2 : null;
            const newKind = newType === 'image' ? 'image' : (newType === 'solid' ? 'solid' : 'gradient');
            const next = Object.assign({}, old, { type: newType, presetId: null });
            if (v2) {
                next.__v2 = {
                    version: 2,
                    base: Object.assign({}, v2.base, { kind: newKind }),
                    layers: v2.layers
                };
            }
            state.background = next;
            applyBackgroundToCanvases(state.background);
            syncBgPanelInputs(state.background);
            renderBgPresetGrid();
            state.saveState();
        });
    }
    const c1 = document.getElementById('bg-color-1');
    const c2 = document.getElementById('bg-color-2');
    if (c1) c1.addEventListener('input', (e) => {
        state.background.color1 = e.target.value;
        state.background.presetId = null;
        applyBackgroundToCanvases(state.background);
        renderBgPresetGrid();
    });
    if (c2) c2.addEventListener('input', (e) => {
        state.background.color2 = e.target.value;
        state.background.presetId = null;
        applyBackgroundToCanvases(state.background);
        renderBgPresetGrid();
    });

    function bindEyeDropperForBgColor(btnId, colorInputId, applyColor) {
        const btn = document.getElementById(btnId);
        const input = document.getElementById(colorInputId);
        if (!btn || !input) return;
        if (typeof window.EyeDropper === 'undefined') {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.title = '当前浏览器不支持吸管取色，请使用 Chrome / Edge 等';
            return;
        }
        btn.addEventListener('click', async () => {
            try {
                const eyeDropper = new EyeDropper();
                const result = await eyeDropper.open();
                const hex = (result && result.sRGBHex) || '';
                if (!hex) return;
                input.value = hex;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                applyColor(hex);
            } catch (err) {
                // eslint-disable-next-line no-empty
                // 合法降级：用户在吸管取色时按 Esc 取消 / 浏览器拒绝授权，属正常流程，不记录日志
            }
        });
    }

    bindEyeDropperForBgColor('bg-color-1-eyedropper', 'bg-color-1', (hex) => {
        state.background.color1 = hex;
        state.background.presetId = null;
        applyBackgroundToCanvases(state.background);
        renderBgPresetGrid();
        state.saveState();
    });
    bindEyeDropperForBgColor('bg-color-2-eyedropper', 'bg-color-2', (hex) => {
        state.background.color2 = hex;
        state.background.presetId = null;
        applyBackgroundToCanvases(state.background);
        renderBgPresetGrid();
        state.saveState();
    });

    const angleEl = document.getElementById('bg-angle');
    const angleVal = document.getElementById('bg-angle-val');
    if (angleEl) angleEl.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        state.background.angle = v;
        if (angleVal) angleVal.textContent = v;
        state.background.presetId = null;
        applyBackgroundToCanvases(state.background);
    });

    const texEl = document.getElementById('bg-texture');
    if (texEl) texEl.addEventListener('change', (e) => {
        state.background.texture = e.target.value;
        state.background.presetId = null;
        applyBackgroundToCanvases(state.background);
        renderBgPresetGrid();
        state.saveState();
    });

            // bg-image-file 的 change 统一由 background-image.js 的 initBackgroundImageModule 绑定

    const btnFav = document.getElementById('btn-fav-bg');
    if (btnFav && btnFav.dataset.bound !== 'true') {
        btnFav.dataset.bound = 'true';
        btnFav.addEventListener('click', () => {
            const bg = state.background;
            if (!bg) return;

            if (bg.type === 'image' && (bg.customImageId || bg.imageUrl)) {
                const imgKey = bg.customImageId
                    ? ('img-' + bg.customImageId)
                    : ('url-' + hashString(bg.imageUrl || ''));
                const favIds = getFavPresetIds();
                if (favIds.includes(imgKey)) {
                    showBgToast('该图片背景已在收藏夹中');
                } else {
                    saveFavImageEntry(imgKey, bg);
                    favIds.push(imgKey);
                    saveFavPresetIds(favIds);
                    renderBgPresetGrid();
                    renderFavBackgrounds();
                    showBgToast('图片背景已加入收藏夹 ⭐');
                }
                return;
            }

            const pid = bg.presetId;
            if (pid && findPresetById(pid)) {
                if (!getFavPresetIds().includes(pid)) {
                    toggleFavPreset(pid);
                    showBgToast('已加入收藏夹 ⭐');
                } else {
                    showBgToast('该预设已在收藏夹中');
                }
                return;
            }

            const customKey = 'custom-bg-' + Date.now();
            const snapshot = {
                type: bg.type || 'gradient',
                color1: bg.color1 || '#000000',
                color2: bg.color2 || bg.color1 || '#000000',
                angle: bg.angle ?? 135,
                texture: bg.texture || 'none',
                presetId: customKey,
                imageUrl: ''
            };
            try {
                const raw = localStorage.getItem('douyin_custom_bg_favs_v1') || '[]';
                let list = JSON.parse(raw);
                if (!Array.isArray(list)) list = [];
                const isDup = list.some(it =>
                    it.type === snapshot.type &&
                    it.color1 === snapshot.color1 &&
                    it.color2 === snapshot.color2 &&
                    it.angle === snapshot.angle &&
                    it.texture === snapshot.texture
                );
                if (isDup) {
                    showBgToast('当前背景已在自定义收藏中');
                    return;
                }
                snapshot.id = customKey;
                snapshot.cat = 'fav-custom';
                snapshot.name = '自定义 ' + (list.length + 1);
                list.push(snapshot);
                localStorage.setItem('douyin_custom_bg_favs_v1', JSON.stringify(list));
            } catch (e) {
                showBgToast('收藏失败：' + e.message, 3000);
                return;
            }
            const favIds = getFavPresetIds();
            if (!favIds.includes(customKey)) {
                favIds.push(customKey);
                saveFavPresetIds(favIds);
            }
            renderBgPresetGrid();
            renderFavBackgrounds();
            showBgToast('当前自定义背景已加入收藏 ⭐');
        });
    }

    renderBgPresetGrid();
    renderFavBackgrounds();
    syncBgPanelInputs(state.background);
    applyBackgroundToCanvases(state.background);

    if (typeof window.syncImagePanelVisibility === 'function') {
        window.syncImagePanelVisibility(state.background);
    }
    if (typeof window.syncImageControlsToState === 'function') {
        window.syncImageControlsToState();
    }
}

window.setBgCategory = setBgCategory;
window.getBgCategory = getBgCategory;
window.toggleFavPreset = toggleFavPreset;
window.handleSmartRecommend = handleSmartRecommend;
window.handleRandomAdvanced = handleRandomAdvanced;
window.handleExtractColorClick = handleExtractColorClick;
window.extractColorsFromImageSrc = extractColorsFromImageSrc;
window.extractDominantColors = extractDominantColors;
window.colorDistance = colorDistance;
window.rgbToHex = rgbToHex;
window.rgbToHsl = rgbToHsl;
window.hslToRgb = hslToRgb;
window.buildHarmoniousGradientColors = buildHarmoniousGradientColors;
window.initExtractFileInput = initExtractFileInput;
window.showBgToast = showBgToast;
window.initBackgroundPanelV2 = initBackgroundPanelV2;

console.log('[BackgroundCore] ✅ 背景 v2 全部接管完成：面板初始化 / 智能推荐 / 随机 / 提取色 / 收藏 / toast');
// ============================================================
// P1-2 步骤 2.2：background-core.js 定义方收口
// 把所有裸函数挂到 window.BG 下，老裸函数名保留做兼容
// ============================================================
(function exposeBackgroundCoreNamespace() {
    if (!window.BG) {
        console.warn('[BG] namespaces.js 未加载，跳过收口');
        return;
    }

    // 第一组：背景归一化 + CSS + 应用
    BG.normalizeBackground = normalizeBackground;
    BG.textureOverlayCss = textureOverlayCss;
    BG.backgroundToCss = backgroundToCss;
    BG.applyBackgroundToCanvases = applyBackgroundToCanvases;

    // 第二组：面板同步 + 视图刷新 + 收藏工具
    BG.syncBgPanelInputs = syncBgPanelInputs;
    BG.updateBackgroundView = updateBackgroundView;
    BG.getFavPresetIds = getFavPresetIds;
    BG.saveFavPresetIds = saveFavPresetIds;
    BG.getRecentPresetIds = getRecentPresetIds;
    BG.pushRecentPresetId = pushRecentPresetId;
    BG.findPresetById = findPresetById;

    // 第三组：预设网格 + 应用预设
    BG.getCustomBgFavs = getCustomBgFavs;
    BG.applyPresetToState = applyPresetToState;
    BG.renderBgPresetGrid = renderBgPresetGrid;
    BG.getPresetsByCategory = getPresetsByCategory;
    BG.renderFavBackgrounds = renderFavBackgrounds;
    BG.buildFavQuickItem = buildFavQuickItem;
    BG.buildFavQuickImageItem = buildFavQuickImageItem;

    // 第四组：分类 + 收藏切换 + 智能推荐 + 随机 + 提取色
    BG.setBgCategory = setBgCategory;
    BG.getBgCategory = getBgCategory;
    BG.toggleFavPreset = toggleFavPreset;
    BG.handleSmartRecommend = handleSmartRecommend;
    BG.handleRandomAdvanced = handleRandomAdvanced;
    BG.handleExtractColorClick = handleExtractColorClick;
    BG.extractColorsFromImageSrc = extractColorsFromImageSrc;
    BG.extractDominantColors = extractDominantColors;
    BG.colorDistance = colorDistance;
    BG.rgbToHex = rgbToHex;
    BG.rgbToHsl = rgbToHsl;
    BG.hslToRgb = hslToRgb;
    BG.buildHarmoniousGradientColors = buildHarmoniousGradientColors;
    BG.initExtractFileInput = initExtractFileInput;
    BG.showBgToast = showBgToast;
    BG.initBackgroundPanelV2 = initBackgroundPanelV2;

    console.log('[BG] ✅ background-core.js 已收口到 window.BG（' +
        Object.keys(BG).length + ' 个函数）');

    // ✅ 加载顺序自检：若 app.js 后加载覆盖了本文件的 applyBackgroundToCanvases，
    //    会静默降级到旧实现（不报错但背景系统坏）。这里打 warn 提示。
    if (typeof window.applyBackgroundToCanvases === 'function'
        && !String(window.applyBackgroundToCanvases).includes('BackgroundEngine')) {
        console.warn('[BG] ⚠️ 加载顺序错误：background-core.js 没有覆盖 app.js 的 applyBackgroundToCanvases，请检查 <script> 顺序');
    }
})();