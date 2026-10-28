window.state = state;

// Main Application Entry
/* ============================================================
   导出补丁：复杂文字特效 → 内联 PNG
   覆盖：渐变文字 / -webkit-text-stroke / text-shadow / filter /
        text-decoration 线型 / animation 当前帧
   ============================================================ */

// ============================================================
// ⚠️ [DEPRECATED — moved to background-core.js]
// 以下 4 个函数声明已被 background-core.js 里的同名函数覆盖（后加载覆盖先加载），
// 实际执行的是 background-core.js 里的版本。保留此处仅为 P2 阶段可回退，P3 物理删除。
//   - normalizeBackground(bg)
//   - textureOverlayCss(texture)
//   - backgroundToCss(bg)
//   - BG.applyBackgroundToCanvases(bg)
// 查找新实现：js/background-core.js 第一组
// ============================================================
// ⚠️ 以下 DOMContentLoaded 不包裹（它要执行）

document.addEventListener('DOMContentLoaded', () => {
    initEffectsLibrary();
    initTextLayersModule();
    initStickersModule();
    initDragModule();
        initBackgroundPanelV2();
    initPaginationModule();
    initCustomFontUpload();
    renderAll();
    document.getElementById('btn-add-text').addEventListener('click', () => {
        const newLayer = {
            id: 'text-' + Date.now(),
            type: 'text',
            content: '双击插入光标编辑文本',
            fontSize: '20px',
            fontFamily: 'sans-serif',
            color: '#ffffff',
            bgColor: 'transparent',
            bold: false, italic: false, underline: false, strike: false,
            align: 'left', vertical: false,
            letterSpacing: 0, lineHeight: 1.2, opacity: 1,
            effectClass: 'effect-black-stroke',
            rotation: 0, flipH: false, flipV: false,
            x: 35, y: 250, width: 290, height: 48,
            heightMode: 'auto'
        };
        state.addLayer(newLayer);
        renderAll();
    });
        initExportPanel();
    renderCanvas();
    renderLayerList();
    updateTopToolbarUI(state.getSelectedLayer());

    // ===== 顶级升级模块初始化 =====
    try { MultiSelect.init(); } catch (err) { console.warn('MultiSelect init failed:', err); }
    try { Guides.init(); } catch (err) { console.warn('Guides init failed:', err); }
    try { ProjectManager.init(); } catch (err) { console.warn('ProjectManager init failed:', err); }
    try { Doodle.init(); } catch (err) { console.warn('Doodle init failed:', err); }
    try { Features.init(); } catch (err) { console.warn('Features init failed:', err); }
});

function renderAll() {
    renderCanvas();
    renderLayerList();
    renderPageList();
    updateBackgroundView();
    updateTopToolbarUI(state.getSelectedLayer());
    if (window.BatchEdit && typeof BatchEdit.updateBadge === 'function') {
        try { BatchEdit.updateBadge(); } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[App] BatchEdit.updateBadge 失败', e);
        }
    }
}

function initPaginationModule() {
    const btnAddPage = document.getElementById('btn-add-page');
    if (btnAddPage) {
        btnAddPage.replaceWith(btnAddPage.cloneNode(true));
        const newBtnAddPage = document.getElementById('btn-add-page');
        newBtnAddPage.addEventListener('click', () => {
            state.addPage();
            renderAll();
        });
    }
}

function renderPageList() {
    const listEl = document.getElementById('page-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    state.pages.forEach((page, index) => {
        const item = document.createElement('div');
        const isActive = page.id === state.currentPageId;
        item.className = `page-item ${isActive ? 'active' : ''}`;
        item.innerHTML = `
            <span><i class="fa-solid fa-file-lines"></i> ${page.title} (第 ${index + 1} 页)</span>
            <span style="font-size: 10px; color: #8b949e;">${page.layers.length} 个图层</span>
        `;
        item.addEventListener('click', () => {
            state.switchPage(page.id);
            renderAll();
            const targetWrapper = document.querySelector(`.canvas-page-wrapper[data-page-id="${page.id}"]`);
            if (targetWrapper) targetWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        listEl.appendChild(item);
    });
}

function enterTextEditMode(layerId) {
    // ✅ 关键：进入编辑前，先把「选中」切到这个图层
    state.selectedLayerId = layerId;
    if (window.MultiSelect) {
        state.selectedLayerIds = [layerId];
    }
    state.editingLayerId = layerId;

    renderCanvas();
    renderLayerList();
    updateTopToolbarUI(state.getSelectedLayer());
        const container = document.querySelector('.canvas-container');
        const _prevScrollTop = container ? container.scrollTop : 0;
        const _prevScrollLeft = container ? container.scrollLeft : 0;
    setTimeout(() => {
        const currentEditable = document.querySelector(`.canvas-layer[data-id="${layerId}"] .text-content-editable`);
        if (currentEditable) {
            currentEditable.contentEditable = 'true';

            // preventScroll：避免浏览器在聚焦时把画布滚动到图层位置
            // （点击/双击靠近画布底部的图层时，视图会突然上跳）
            currentEditable.focus({ preventScroll: true });
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(currentEditable);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }

        // 部分浏览器在设置 Range 时仍会滚动，强制把滚动位置还原
        if (container) {
            container.scrollTop = _prevScrollTop;
            container.scrollLeft = _prevScrollLeft;
        }
    }, 30);
}

function createBackdropElement(layer) {
    if (!layer.backdrop || !layer.backdrop.type || layer.backdrop.type === 'none') return null;
    const bd = layer.backdrop;


    const el = document.createElement('div');
    el.className = 'layer-backdrop';
    el.style.zIndex = '0';
        const pad = (bd.padding !== undefined ? bd.padding : 12);
    if (bd.isMask) {
        // ✅ 形状蒙版：盒子跟随文字宽高比（编辑时不上下过肥），
        //    同时保证盒子足够大以完整容纳 SVG（contain），不裁掉图形
        const w = layer.width || 0;
        const h = layer.height || 0;
        const sizeScale = (bd.sizeScale != null && isFinite(bd.sizeScale))
            ? Math.max(0.3, Math.min(12, bd.sizeScale))
            : 4;

        // 以较长边为基准等比放大盒子的两条边，保持文字宽高比
        const baseSide = Math.max(w, h) || 1;
        const maskW = (w / baseSide) * baseSide * sizeScale + pad * 2;
        const maskH = (h / baseSide) * baseSide * sizeScale + pad * 2;

        el.style.width = maskW + 'px';
        el.style.height = maskH + 'px';
       el.style.left = ((w - maskW) / 2 + 15) + 'px';
        el.style.top = ((h - maskH) / 2) + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
    } else {
        el.style.left = (-pad) + 'px';
        el.style.top = (-pad) + 'px';
        el.style.right = (-pad) + 'px';
        el.style.bottom = (-pad) + 'px';
    }

    el.style.opacity = (bd.opacity !== undefined ? bd.opacity : 1);
    el.style.transform = `rotate(${bd.rotate || 0}deg)`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.style.backgroundRepeat = 'no-repeat';


    if (bd.type === 'mark') {
        el.classList.add('backdrop-mark');
        el.dataset.markKind = bd.markKind || 'box';
        el.style.setProperty('--mark-c', bd.markColor || '#ff2442');
        el.style.setProperty('--mark-w', (bd.markWidth || 4) + 'px');
        const pad = bd.padding !== undefined ? bd.padding : 12;
        el.style.left = (-pad) + 'px';
        el.style.top = (-pad) + 'px';
        el.style.right = (-pad) + 'px';
        el.style.bottom = (-pad) + 'px';
        el.style.opacity = bd.opacity !== undefined ? bd.opacity : 1;
        return el;
    }
       if (bd.type === 'custom') {
        const cid = bd.customId;
        if (cid !== undefined && cid !== null) {
            const isMask = !!bd.isMask;
            const maskColor = bd.color || '#ffffff';
            let dataUrl = (typeof backdropCache !== 'undefined' && backdropCache[cid]) || null;

            const applyTinted = (url) => {
                if (!url) return;
                if (isMask) {
                    // 先尝试同步着色（缓存命中时可用）
                    const sync = tintMaskToColor(url, maskColor);
                    if (sync) {
                        el.style.backgroundImage = `url(${sync})`;
                        applyCustomBackdropStyle(el, sync, bd);
                        return;
                    }
                    // 缓存未命中 → 异步着色
                    tintMaskToColorAsync(url, maskColor).then(tinted => {
                        if (!tinted) return;
                        el.style.backgroundImage = `url(${tinted})`;
                        applyCustomBackdropStyle(el, tinted, bd);
                    });
                } else {
                    el.style.backgroundImage = `url(${url})`;
                    applyCustomBackdropStyle(el, url, bd);
                }
            };

            if (dataUrl) {
                applyTinted(dataUrl);
            } else {
                el.style.background = isMask ? maskColor : (bd.color || '#ffffff');
                BackdropDB.getBackdropById(cid).then(item => {
                    if (!item) return;
                    if (typeof backdropCache !== 'undefined') backdropCache[cid] = item.dataUrl;
                    const target = document.querySelector(`.canvas-layer[data-id="${layer.id}"] .layer-backdrop`);
                    if (target) {
                        if (isMask) {
                            tintMaskToColorAsync(item.dataUrl, maskColor).then(tinted => {
                                if (!tinted) return;
                                target.style.backgroundImage = `url(${tinted})`;
                                applyCustomBackdropStyle(target, tinted, bd);
                            });
                        } else {
                            target.style.backgroundImage = `url(${item.dataUrl})`;
                            applyCustomBackdropStyle(target, item.dataUrl, bd);
                        }
                    }
                }).catch((e) => {
                    if (window.Utils && Utils.log) Utils.log.warn('[App] 读取自定义底衬失败', cid, e);
                });
            }
        }
    } else if (window.BackdropTextures && BackdropTextures.isCanvasTexture(bd.type)) {
        const dataUrl = BackdropTextures.get(bd.type, bd.color);
        if (dataUrl) {
            el.style.background = 'transparent';
            el.style.backgroundImage = `url(${dataUrl})`;
            el.style.backgroundSize = 'cover';
            el.style.backgroundPosition = 'center';
            el.style.backgroundRepeat = 'no-repeat';
        } else {
            el.style.background = bd.color || '#d2b48c';
        }
        el.classList.add(`backdrop-${bd.type}`);
    } else {
        el.style.background = '';
        el.style.backgroundImage = '';
        el.classList.add(`backdrop-${bd.type}`);
 if (bd.type === 'sticky') {
            el.style.background = bd.color || '#fff740';
        } else if (bd.type === 'polaroid') {
            el.style.background = bd.color || '#ffffff';
        } else if (bd.type === 'ticket') {
            el.style.background = bd.color || '#fff5e6';
        } else if (bd.type === 'washi') {
            el.style.background = bd.color || '#fdf2f8';
        } else if (bd.type === 'torn' || bd.type === 'tape') {
            if (bd.color) el.style.background = bd.color;
        }
    }

    return el;
}

// 把 #rrggbb 转 rgba(r,g,b,a)
function hexToRgbaLocal(hex, alpha) {
    if (!hex) return `rgba(0,0,0,${alpha})`;
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.substring(0, 2), 16) || 0;
    const g = parseInt(h.substring(2, 4), 16) || 0;
    const b = parseInt(h.substring(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyCustomBackdropStyle(el, dataUrl, bd) {
    // ✅ 蒙版着色：如果这个底衬是"形状蒙版"，按 bd.color 着色
    let finalUrl = dataUrl;
    if (bd && bd.isMask === true && bd.color) {
        finalUrl = tintMaskToColor(dataUrl, bd.color);
        if (!finalUrl) finalUrl = dataUrl;
    }

    el.style.backgroundImage = `url(${finalUrl})`;
    // ✅ 形状蒙版默认用 contain（不裁切），其它自定义底衬保持 cover
        // ✅ 形状蒙版一律用 contain（不裁切），忽略 bd.sizeMode；
    //    其它自定义底衬保持原逻辑
    const mode = (bd && bd.isMask) ? 'contain' : (bd.sizeMode || 'cover');
    if (bd && bd.isMask) {
        // ✅ 形状蒙版：横向拉伸 1.5 倍（箭头变长），高度仍 contain
        el.style.backgroundSize = '30% 100%';
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundPosition = 'center';
    } else if (mode === 'cover') {
        el.style.backgroundSize = 'cover';
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundPosition = 'center';
    } else if (mode === 'contain') {
        el.style.backgroundSize = 'contain';
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundPosition = 'center';
    } else if (mode === 'repeat') {
        el.style.backgroundSize = 'auto';
        el.style.backgroundRepeat = 'repeat';
        el.style.backgroundPosition = 'top left';
    }
        if (bd.overlayColor) {
        // ✅ 半透明遮罩，而不是不透明色 + multiply
        //    避免 PNG 透明区被不透明色填满，导致底衬图形看不见
        el.style.backgroundImage = `linear-gradient(${hexToRgbaLocal(bd.overlayColor, 0.35)}, ${hexToRgbaLocal(bd.overlayColor, 0.35)}), url(${finalUrl})`;
        el.style.backgroundBlendMode = 'normal';
    } else {
        el.style.backgroundBlendMode = 'normal';
    }
}

/* ============================================================
   蒙版着色：白色透明 PNG → 按 color 着色（同步返回 dataUrl）
   原理：把白色蒙版画到 canvas，再用 'source-in' 填色，白色区域变彩色，透明区域保持透明。
   用同步缓存避免同一 (dataUrl+color) 重复计算。
   ============================================================ */
const _tintCache = new Map();
function tintMaskToColor(maskDataUrl, color) {
    if (!maskDataUrl) return null;
    const key = color + '::' + maskDataUrl.slice(-120);
    if (_tintCache.has(key)) return _tintCache.get(key);

    // ✅ P1：SVG 蒙版 → 直接替换 currentColor（矢量，不失真）
    if (maskDataUrl.startsWith('data:image/svg+xml')) {
        try {
            const decoded = decodeURIComponent(maskDataUrl.split('utf8,')[1] || '');
            const tinted = decoded.replace(/fill="currentColor"/g, `fill="${color}"`);
            const out = 'data:image/svg+xml;utf8,' + encodeURIComponent(tinted);
            _tintCache.set(key, out);
            return out;
        } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[App] SVG 蒙版着色解码失败', e);
            return maskDataUrl;
        }
    }

    // PNG 蒙版：保留原逐像素着色逻辑
    try {
        const img = new Image();
        img.src = maskDataUrl;
        if (!img.complete || !img.naturalWidth) {
            return null;
        }
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, w, h);
        const out = c.toDataURL('image/png');
        _tintCache.set(key, out);
        return out;
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[App] PNG 蒙版着色失败', e);
        return null;
    }
}

/* 异步版：确保图片加载完再着色，给 createBackdropElement 的异步链用 */
/* 异步版：确保图片加载完再着色，给 createBackdropElement 的异步链用 */
function tintMaskToColorAsync(maskDataUrl, color) {
    if (!maskDataUrl) return Promise.resolve(null);
    const key = color + '::' + maskDataUrl.slice(-120);
    if (_tintCache.has(key)) return Promise.resolve(_tintCache.get(key));

    // ✅ P1：SVG 蒙版 → 直接替换 currentColor（矢量，不失真）
    if (maskDataUrl.startsWith('data:image/svg+xml')) {
        try {
            const decoded = decodeURIComponent(maskDataUrl.split('utf8,')[1] || '');
            const tinted = decoded.replace(/fill="currentColor"/g, `fill="${color}"`);
            const out = 'data:image/svg+xml;utf8,' + encodeURIComponent(tinted);
            _tintCache.set(key, out);
            return Promise.resolve(out);
        } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[App] SVG 蒙版着色（异步）解码失败', e);
            return Promise.resolve(maskDataUrl);
        }
    }

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            try {
                const w = img.naturalWidth;
                const h = img.naturalHeight;
                const c = document.createElement('canvas');
                c.width = w;
                c.height = h;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0);
                ctx.globalCompositeOperation = 'source-in';
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, w, h);
                const out = c.toDataURL('image/png');
                _tintCache.set(key, out);
                resolve(out);
            } catch (e) {
                if (window.Utils && Utils.log) Utils.log.warn('[App] PNG 蒙版着色（异步）失败', e);
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = maskDataUrl;
    });
}

function renderCanvas() {
    const container = document.querySelector('.canvas-container');
    if (!container) return;


    // 选中图层会触发整层重绘；innerHTML 清空后 scrollTop 会被浏览器归零，
    // 导致点击靠近画布底部的图层时视图突然上跳（表现为“视觉焦点滚到了中部”）。
    // 因此先快照，重建后再恢复。
    const _prevScrollTop = container.scrollTop;
    const _prevScrollLeft = container.scrollLeft;
    container.innerHTML = '';

    state.pages.forEach((page, index) => {
        const isCurrentPage = page.id === state.currentPageId;
        const pageWrapper = document.createElement('div');
        pageWrapper.className = `canvas-page-wrapper ${isCurrentPage ? 'active-page' : ''}`;
        pageWrapper.dataset.pageId = page.id;

        const badge = document.createElement('div');
        badge.className = 'page-badge';
        badge.innerHTML = `<i class="fa-solid fa-file-lines"></i> 第 ${index + 1} 页`;
        pageWrapper.appendChild(badge);

        const canvasEl = document.createElement('div');
        canvasEl.className = 'cover-canvas';

        const canvasBg = document.createElement('div');
        canvasBg.className = 'canvas-bg';
        canvasBg.style.background = '#000';
        canvasEl.appendChild(canvasBg);

        const layersWrapper = document.createElement('div');
        layersWrapper.className = 'layers-wrapper';

        page.layers.forEach(layer => {
            const isSelected = isCurrentPage && (
                (window.MultiSelect && MultiSelect.isSelected(layer.id)) ||
                (!window.MultiSelect && layer.id === state.selectedLayerId)
            );
            const isEditing = isCurrentPage && (layer.id === state.editingLayerId);

            const el = document.createElement('div');
            // ✅ 新增 layer-type-* 类名，供 CSS 做文本自适应
            el.className = `canvas-layer layer-type-${layer.type} ${isSelected ? 'selected' : ''} ${isEditing ? 'editing' : ''}`;
            // ✅ 锁定 / 组状态类名
            if (layer.locked) el.classList.add('locked');
            if (layer.groupId) el.classList.add('in-group');
            if (isSelected && layer.groupId) el.classList.add('group-selected');
            el.dataset.id = layer.id;
            el.style.left = layer.x + 'px';
            el.style.top = layer.y + 'px';
            el.style.width = layer.width + 'px';

            // ✅ 文本图层高度模式：auto 则交给 CSS 自适应，fixed 则用固定 px

            // draw 图层不需要 DOM 内容，由 canvas 层统一绘制
            if (layer.type === 'draw') {
                // 仍然创建包裹层以便选中/拖拽/缩放
                el.style.background = 'transparent';
                el.style.border = 'none';
                // 添加缩放手柄
                ['nw', 'ne', 'sw', 'se'].forEach(dir => {
                    const handle = document.createElement('div');
                    handle.className = `resize-handle ${dir}`;
                    handle.dataset.direction = dir;
                    el.appendChild(handle);
                });
                ['left', 'right', 'top', 'bottom'].forEach(dir => {
                    const handle = document.createElement('div');
                    handle.className = `edge-handle ${dir}`;
                    handle.dataset.direction = dir;
                    el.appendChild(handle);
                });
                const rotateHandle = document.createElement('div');
                rotateHandle.className = 'rotate-handle';
                el.appendChild(rotateHandle);
                layersWrapper.appendChild(el);
                return;
            }

            if (layer.type === 'text') {
                const isFixed = layer.heightMode === 'fixed';
                el.classList.add(isFixed ? 'fixed-height' : 'auto-height');
                if (!isFixed) {
                    el.style.height = 'auto';
                } else {
                    el.style.height = layer.height + 'px';
                }
            } else {
                el.style.height = layer.height + 'px';
            }

            el.style.opacity = layer.opacity !== undefined ? layer.opacity : 1;

            const rot = layer.rotation || 0;
            const flipH = layer.flipH ? -1 : 1;
            const flipV = layer.flipV ? -1 : 1;
            let transforms = [];
            if (rot) transforms.push(`rotate(${rot}deg)`);
            if (flipH !== 1 || flipV !== 1) transforms.push(`scale(${flipH}, ${flipV})`);
            if (transforms.length > 0) el.style.transform = transforms.join(' ');

            // ✅ 所有类型统一设 zIndex（text / sticker / draw 都生效）
            const layerOrderIndex = page.layers.findIndex(l => l.id === layer.id);
                        el.style.zIndex = String(10 + layerOrderIndex * 10);

            if (layer.type === 'text') {

                const backdropEl = createBackdropElement(layer);
                if (backdropEl) el.appendChild(backdropEl);

// 判断是否是"背景框 / 高亮类"特效：这类特效的 background 不能加在外层（会撑满）
// ✅ 不再靠 ID 列表判断：直接看当前特效的 CSS 里是否有"背景框类"属性
let isBgBox = false;
if (layer.effectClass) {
    try {
        const allFx = (typeof getAllEffectsMaster === 'function') ? getAllEffectsMaster() : [];
        const fx = allFx.find(e => e.id === layer.effectClass);
        if (fx && fx.css) {
            const cssLower = fx.css.toLowerCase();
            // 只要出现 background（非渐变文字）或 padding 或 border-radius
            const hasBg = /(^|;|\s)background(-color)?\s*:/.test(cssLower)
                       && !cssLower.includes('background-clip')
                       && !cssLower.includes('-webkit-text-fill-color');
            const hasPadding = /(^|;|\s)padding\s*:/.test(cssLower);
            const hasRadius = cssLower.includes('border-radius');
            isBgBox = hasBg || hasPadding || hasRadius;
        }
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[App] 判断背景框类特效失败', e);
        isBgBox = false;
    }
}

const textInner = document.createElement('div');
textInner.className = 'text-content-editable';
textInner.contentEditable = isEditing ? 'true' : 'false';
textInner.innerHTML = layer.content || '';
textInner.style.fontSize = layer.fontSize;
// ✅ 字体名安全化：中文/含空格的字体名一律加引号，避免浏览器把它当多个 fallback
(function applySafeFontFamily(rawName, node) {
    if (!node) return;
    const safe = (typeof window._safeFontFamily === 'function')
        ? window._safeFontFamily(rawName)
        : (rawName || '');
    if (safe) node.style.fontFamily = safe;
})(layer.fontFamily, textInner);


// ✅ 手写体保护：自定义字体（中文/前缀/已加载表命中）默认 weight/style=normal，
//    避免浏览器把只有 Regular 字重的手写字体伪加粗/伪斜体，笔画被拉粗后完全失去手写感
try {
    const rawFam = layer.fontFamily || '';
    const isCustomFont = !!(rawFam && (
        rawFam.startsWith('CustomFont_') ||
        /[\u4e00-\u9fa5]/.test(rawFam) ||
        (window.__loadedCustomFonts && window.__loadedCustomFonts[rawFam])
    ));
    if (isCustomFont) {
        // 用户没有显式 bold/italic 时，强制 normal（用 !important 级别覆盖后续 bold 效果）
        if (!layer.bold) textInner.style.setProperty('font-weight', 'normal', 'important');
        if (!layer.italic) textInner.style.setProperty('font-style', 'normal', 'important');
        // 禁止浏览器做伪加粗/伪斜体合成
        textInner.style.setProperty('font-synthesis', 'none');
        // 手写体细笔画下，让浏览器更贴近原字形
        textInner.style.setProperty('text-rendering', 'geometricPrecision');
    }
} catch (e) {
    if (window.Utils && Utils.log) Utils.log.warn('[App] 手写体保护样式应用失败', e);
}

// ✅ 字体加载保证：如果自定义字体还没注册完，等它 ready 后再刷一次该图层字体
(function ensureFontApplied(fontName, node) {
    if (!fontName || !node) return;
    if (!document.fonts || !document.fonts.load) return;
    const safe = (typeof window._safeFontFamily === 'function')
        ? window._safeFontFamily(fontName) : '"' + fontName + '"';
    // ✅ 用 normal normal，避免请求去匹配 700/italic 触发合成字体
    document.fonts.load(`normal normal 16px ${safe}`)
        .then(() => {
            if (node.isConnected) node.style.fontFamily = safe;
        })
        .catch((e) => {
            if (window.Utils && Utils.log) Utils.log.warn('[App] 字体加载失败', fontName, e);
        });
})(layer.fontFamily, textInner);

// ✅ 图层填充：用独立的 .layer-fill 块垫在文字后面，形成有 padding/圆角的色块
//    同时移除 textInner 自身的 backgroundColor（避免双重背景）
textInner.style.backgroundColor = 'transparent';
try {
    if (layer.bgColor && layer.bgColor !== 'transparent' && layer.bgColor !== 'rgba(0, 0, 0, 0)') {
        const radius = (layer.bgRadius !== undefined ? layer.bgRadius : 6);
        const pad = (layer.bgPadding !== undefined ? layer.bgPadding : 6);
        const layerFill = document.createElement('div');
        layerFill.className = 'layer-fill';
        layerFill.style.cssText = 'position:absolute; inset:' + (-pad) + 'px ' + (-pad) + 'px; background-color:' + layer.bgColor + '; background-image: none; border-radius:' + radius + 'px; z-index:0; pointer-events:none; border:1px solid rgba(0,0,0,0.08); box-sizing:border-box; transition: background 0.12s ease;';
        el.insertBefore(layerFill, el.firstChild);
    }
} catch (e) { console.warn('[layer-fill] 生成失败', e); }
textInner.style.fontWeight = layer.bold ? 'bold' : 'normal';
textInner.style.fontStyle = layer.italic ? 'italic' : 'normal';
let textDecorations = [];
if (layer.underline) textDecorations.push('underline');
if (layer.strike) textDecorations.push('line-through');
textInner.style.textDecoration = textDecorations.join(' ');
textInner.style.textAlign = layer.align;
textInner.style.writingMode = layer.vertical ? 'vertical-rl' : 'horizontal-tb';
// ✅ 自定义字体保留原生字距：仅当用户显式调过 letterSpacing（非 0）时才应用，
//    否则用 normal 让手写体的连笔/自然字距生效
textInner.style.letterSpacing = (layer.letterSpacing && parseFloat(layer.letterSpacing) !== 0)
    ? layer.letterSpacing
    : 'normal';
textInner.style.lineHeight = layer.lineHeight || 1.2;
textInner.style.setProperty('color', layer.color || '#ffffff', 'important');
/* ============================================================
   P0 + P2：文字特效渲染（统一格式：所有特效都走 template + params）
   数据结构：
     layer.effectClasses = ['effect-black-stroke', 'effect-neon']  // 叠加
     layer.effectParams  = { 'effect-neon': { blur: 20, color: '#ff0' } }
   向后兼容：layer.effectClass 单值仍生效
   ============================================================ */
const effectList = (() => {
    if (Array.isArray(layer.effectClasses) && layer.effectClasses.length > 0) {
        return layer.effectClasses;
    }
    return layer.effectClass ? [layer.effectClass] : [];
})();
const effectParams = layer.effectParams || {};

// 判断这批特效里是否有"背景框类"
let bgBoxEffectId = null;
for (const eid of effectList) {
    try {
        const cssText = (typeof renderEffectCss === 'function')
            ? renderEffectCss(eid, effectParams[eid] || {})
            : '';
        const cssLower = cssText.toLowerCase();
        const hasBg = /(^|;|\s)background(-color)?\s*:/.test(cssLower)
                   && !cssLower.includes('background-clip')
                   && !cssLower.includes('-webkit-text-fill-color');
        const hasPadding = /(^|;|\s)padding\s*:/.test(cssLower);
        const hasRadius = cssLower.includes('border-radius');
        if (hasBg || hasPadding || hasRadius) {
            bgBoxEffectId = eid;
            break;
        }
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[App] 检测特效背景框属性失败', eid, e);
    }
}

if (bgBoxEffectId) {
    textInner.style.textAlign = layer.align;
    textInner.style.display = 'block';

    // 背景框类：只取这一个特效的 CSS 拆背景相关属性
    try {
        const cssText = (typeof renderEffectCss === 'function')
            ? renderEffectCss(bgBoxEffectId, effectParams[bgBoxEffectId] || {})
            : '';
        cssText.split(';').forEach(rule => {
            const idx = rule.indexOf(':');
            if (idx === -1) return;
            const prop = rule.slice(0, idx).trim().toLowerCase();
            const val = rule.slice(idx + 1).trim();
            if (!prop || !val) return;
            if (prop === 'background' || prop === 'background-color'
                || prop === 'padding' || prop === 'border-radius'
                || prop === 'border' || prop === 'color'
                || prop === 'font-weight' || prop === 'font-style') {
                textInner.style.setProperty(prop, val);
            }
        });
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[App] 应用背景框特效 CSS 失败', bgBoxEffectId, e);
    }

    if (typeof hasLocalInlineColor === 'function' && hasLocalInlineColor(layer.content)) {
        textInner.classList.add('has-local-color');
    }
} else {
    /* ----------------------------------------------------------
       普通文字特效：逐个套用，支持叠加
       所有特效统一走 renderEffectCss(eid, params) 生成 CSS
       （老特效没 params 时用 default，参数化特效用用户参数）
       ---------------------------------------------------------- */
    let mergedInlineStyle = '';
    effectList.forEach(eid => {
        const cssText = (typeof renderEffectCss === 'function')
            ? renderEffectCss(eid, effectParams[eid] || {})
            : '';
        if (cssText) mergedInlineStyle += cssText + ';';
    });

    if (mergedInlineStyle) {
        mergedInlineStyle.split(';').forEach(rule => {
            const idx = rule.indexOf(':');
            if (idx === -1) return;
            const prop = rule.slice(0, idx).trim();
            const val = rule.slice(idx + 1).trim();
            if (!prop || !val) return;
            try { textInner.style.setProperty(prop, val); } catch (e) {
                if (window.Utils && Utils.log) Utils.log.warn('[App] 应用特效 CSS 属性失败', prop, val, e);
            }
        });
    }

    if (typeof hasLocalInlineColor === 'function' && hasLocalInlineColor(layer.content)) {
        textInner.classList.add('has-local-color');
    }
}

                // ✅ Auto 模式：内容变化时同步图层 height（避免末行下方留白）
                if (layer.heightMode !== 'fixed') {
                    const syncAutoHeight = () => {
                        if (layer.heightMode === 'fixed') return;
                        const h = textInner.offsetHeight + 4; // padding 2*2
                        if (Math.abs((layer.height || 0) - h) > 1) {
                            layer.height = h;
                        }
                    };
                    requestAnimationFrame(syncAutoHeight);
                    let syncTimer = null;
                    textInner.addEventListener('input', () => {
                        if (syncTimer) clearTimeout(syncTimer);
                        syncTimer = setTimeout(syncAutoHeight, 80);
                    });
                    if (document.fonts && document.fonts.ready) {
                        Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))])
                            .then(syncAutoHeight).catch((e) => {
                                if (window.Utils && Utils.log) Utils.log.warn('[App] 字体 ready 后同步高度失败', e);
                            });
                    }
                }

                el.addEventListener('dblclick', (e) => {
                    e.stopPropagation(); e.preventDefault();
                    if (layer.type === 'text') {
                        state.switchPage(page.id);
                        enterTextEditMode(layer.id);
                    }
                });

                textInner.addEventListener('blur', () => {



    layer.content = textInner.innerHTML;
                    if (state.editingLayerId === layer.id) {
                        state.editingLayerId = null;
                        setTimeout(() => {
                            if (!state.editingLayerId) {
                                renderCanvas();
                                renderLayerList();
                            }
                        }, 50);
                    }
                });

                try { textInner.style.setProperty('color', layer.color || '#ffffff', 'important'); } catch (e) {
                    if (window.Utils && Utils.log) Utils.log.warn('[App] 强制设置文字颜色失败', layer.color, e);
                }
                textInner.style.position = 'relative';
                textInner.style.zIndex = '1';
                el.appendChild(textInner);
} else if (layer.type === 'sticker') {
    // ✅ 改成普通块级布局 + 行高居中，html2canvas 导出才不会丢内容
    el.style.display = 'block';
    el.style.textAlign = 'center';
    el.style.lineHeight = layer.height + 'px';
    el.style.fontSize = layer.fontSize;
    el.style.overflow = 'hidden';
    el.style.pointerEvents = 'auto';

                    const _isEmoji = layer.stickerType === 'emoji'
            || (layer.content && /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(layer.content) && layer.content.length < 10);
        const _imgExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg', 'avif', 'ico', 'image'];
        const _hasImgExt = layer.stickerType && _imgExts.includes(String(layer.stickerType).toLowerCase());
        const _isImg = !_isEmoji && (
            _hasImgExt
            || layer.stickerType === 'uploaded'
            || (layer.content && (
                layer.content.startsWith('data:image/')
                || layer.content.startsWith('http')
                || layer.content.startsWith('<svg')
                || layer.content.startsWith('blob:')
            ))
        );

        if (_isImg) {
        let src = layer.content;
        if (src && src.startsWith('<svg')) {
                src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
            }
        if (layer.stickerType === 'svg' && layer.stickerColor) {
    try {
        let svgRaw = '';
        if (src.startsWith('data:image/svg+xml')) {
            const idx = src.indexOf(',');
            svgRaw = decodeURIComponent(src.slice(idx + 1));
        } else if (src.startsWith('<svg')) {
            svgRaw = src;
        }
        if (svgRaw) {
            src = 'data:image/svg+xml;utf8,' + encodeURIComponent(
                svgRaw.replace(/fill="currentColor"/g, `fill="${layer.stickerColor}"`)
            );
        }
    } catch (err) {
        if (window.Utils && Utils.log) Utils.log.warn('[App] SVG 贴纸改色解码失败', err);
    }
}
        const img = document.createElement('img');
        img.crossOrigin = 'anonymous';
        img.src = src;
        img.style.display = 'block';          // ← block 消除 inline 基线问题
        img.style.verticalAlign = 'top';      // ← 冗余但保险
        img.style.margin = '0 auto';          // ← 水平居中（block 下才有效）

        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.draggable = false;
        img.style.pointerEvents = 'none';


        // ✅ 父元素 flex 居中，让 <img> 永远在盒子正中间
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.lineHeight = '1';
        el.style.overflow = 'hidden';

        el.appendChild(img);
    } else {
    // ✅ emoji 贴纸：完全居中，不裁剪，字形内缩 10% 防止字体 em box 溢出
    el.innerText = layer.content;
    el.style.overflow = 'visible';          // ← 关键：不裁剪
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.textAlign = 'center';
    el.style.lineHeight = '1';              // ← 关键：不用 lineHeight 撑高
    // 字号 = 盒子短边 × 0.9（留 10% 余量给字形 em box 超出部分）
    const _boxMin = Math.min(layer.width || 80, layer.height || 80);
    const _fontSizePx = Math.max(10, Math.round(_boxMin * 0.9));
    el.style.fontSize = _fontSizePx + 'px';
    el.style.pointerEvents = 'auto';
}
}

            ['nw', 'ne', 'sw', 'se'].forEach(dir => {
                const handle = document.createElement('div');
                handle.className = `resize-handle ${dir}`;
                handle.dataset.direction = dir;
                el.appendChild(handle);
            });
            ['left', 'right', 'top', 'bottom'].forEach(dir => {
                const handle = document.createElement('div');
                handle.className = `edge-handle ${dir}`;
                handle.dataset.direction = dir;
                el.appendChild(handle);
            });

            const rotateHandle = document.createElement('div');
            rotateHandle.className = 'rotate-handle';
            rotateHandle.title = '拖拽旋转（按住 Shift 15° 步进）';
            el.appendChild(rotateHandle);

            layersWrapper.appendChild(el);
        });

        canvasEl.appendChild(layersWrapper);
        pageWrapper.appendChild(canvasEl);
        container.appendChild(pageWrapper);
        if (typeof applyBackgroundToCanvases === 'function') {
            BG.applyBackgroundToCanvases(state.background);
        }
    });

    if (typeof applyBackgroundToCanvases === 'function') {
        BG.applyBackgroundToCanvases(state.background);
    }

            // 拖动/缩放/旋转进行中：跳过参考线重绘和特效面板刷新，避免每帧重开销
    if (!window.__layerDragging) {
        if (window.Guides) Guides.renderGuides();
        if (typeof refreshEffectParamsPanel === 'function' && !window.__effectParamsDragging) {
            refreshEffectParamsPanel();
        }
    }

    // 恢复滚动位置（见函数开头注释）
    container.scrollTop = _prevScrollTop;
    container.scrollLeft = _prevScrollLeft;
    // 重建 DOM 后重绘涂鸦画布
    if (window.Doodle) Doodle.redrawDrawLayers();

}

function renderLayerList() {
    const listEl = document.getElementById('layer-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    state.layers.forEach(layer => {
        const item = document.createElement('div');
        const isSel = window.MultiSelect
            ? MultiSelect.isSelected(layer.id)
            : (layer.id === state.selectedLayerId);
        item.className = `layer-item ${isSel ? 'active' : ''}`;
                const cleanContent = layer.type === 'draw'
            ? `${layer.mode === 'eraser' ? '橡皮' : (layer.mode === 'highlighter' ? '高亮' : '笔迹')}`
            : (layer.content || '').replace(/<[^>]*>/g, '').substring(0, 10);
                const iconName = layer.type === 'text' ? 'fa-font' : (layer.type === 'draw' ? 'fa-paintbrush' : 'fa-face-smile');
        const typeLabel = layer.type === 'sticker' ? `[${layer.stickerType || 'emoji'}]` : '';
        const lockBadge = layer.locked
            ? '<span class="layer-lock-badge" title="已锁定">🔒</span>'
            : '';
        const groupBadge = layer.groupId
            ? '<span class="layer-group-badge" title="在组中">📦</span>'
            : '';
        const lockBtnHtml = `
            <button class="btn" title="${layer.locked ? '解锁' : '锁定'}"
                onclick="event.stopPropagation(); toggleLayerLockFromList('${layer.id}')"
                style="padding: 2px 6px; font-size:11px;">
                <i class="fa-solid ${layer.locked ? 'fa-lock' : 'fa-lock-open'}"></i>
            </button>
        `;
        item.innerHTML = `
            <span><i class="fa-solid ${iconName}"></i> ${typeLabel}${cleanContent || '图层'}${lockBadge}${groupBadge}</span>
            <span style="display:flex; gap:2px;">
                ${lockBtnHtml}
                <button class="btn" style="padding: 2px 6px; font-size:11px;" onclick="selectLayerFromList('${layer.id}')">选择</button>
            </span>
        `;
        item.addEventListener('click', () => {
            state.selectedLayerId = layer.id;
            if (window.MultiSelect) {
                state.selectedLayerIds = [layer.id];
            }
            renderCanvas();
            renderLayerList();
            updateTopToolbarUI(state.getSelectedLayer());
            if (typeof showStickerColorBar === 'function') {
                showStickerColorBar(layer.type === 'sticker' && layer.stickerType === 'svg');
            }
        });
        listEl.appendChild(item);
    });
}

function selectLayerFromList(id) {
    state.selectedLayerId = id;
    if (window.MultiSelect) {
        state.selectedLayerIds = [id];
    }
    renderCanvas();
    renderLayerList();
    updateTopToolbarUI(state.getSelectedLayer());
    const layer = state.getSelectedLayer();
    if (layer && typeof showStickerColorBar === 'function') {
        showStickerColorBar(layer.type === 'sticker' && layer.stickerType === 'svg');
    }
}

// ✅ 从图层列表点锁图标切换锁定
function toggleLayerLockFromList(id) {
    state.toggleLayerLocked(id);
    renderCanvas();
    renderLayerList();
    if (typeof showBgToast === 'function') {
        const l = state.layers.find(x => x.id === id);
        showBgToast(l && l.locked ? '🔒 已锁定' : '🔓 已解锁');
    }
}
window.toggleLayerLockFromList = toggleLayerLockFromList;

/* ============================================================
   背景系统 v2 —— 智能预设库 + 一键随机 + 主色提取
   ============================================================ */

const BG_FAV_KEY = 'douyin_bg_favs_v2';
const BG_RECENT_KEY = 'douyin_bg_recent_v2';
const BG_RECENT_MAX = 12;
let currentBgCategory = 'hot';
let _bgToastTimer = null;

/* ============================================================
   图片背景收藏夹（v3 —— IndexedDB 版本）
   ============================================================ */

const BG_FAV_IMG_DB_NAME = 'douyin_bg_fav_images_db';
const BG_FAV_IMG_STORE = 'images';

let bgFavImgMemory = {};
let bgFavImgKeys = [];
let bgFavImgReady = false;

const BG_FavImageDB = (function () {
    let dbPromise = null;
    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(BG_FAV_IMG_DB_NAME, 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(BG_FAV_IMG_STORE)) {
                    db.createObjectStore(BG_FAV_IMG_STORE, { keyPath: 'key' });
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e);
        });
        return dbPromise;
    }

    async function put(key, entry) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(BG_FAV_IMG_STORE, 'readwrite');
            const req = tx.objectStore(BG_FAV_IMG_STORE).put({ key, entry });
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e);
        });
    }

    async function getAll() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(BG_FAV_IMG_STORE, 'readonly');
            const req = tx.objectStore(BG_FAV_IMG_STORE).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = (e) => reject(e);
        });
    }

    async function remove(key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(BG_FAV_IMG_STORE, 'readwrite');
            const req = tx.objectStore(BG_FAV_IMG_STORE).delete(key);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e);
        });
    }

    return { put, getAll, remove };
})();

function getFavImageStore() {
    return bgFavImgMemory;
}

function saveFavImageEntry(key, bg) {
    try {
        let dataUrl = bg.imageUrl || '';
        if (!dataUrl && bg.customImageId) {
            if (typeof bgImageCache !== 'undefined' && bgImageCache[bg.customImageId]) {
                dataUrl = bgImageCache[bg.customImageId];
            }
        }
        if (!dataUrl) {
            console.warn('saveFavImageEntry: 没有可用 dataUrl', key, bg);
            return;
        }

        const entry = {
            key,
            dataUrl,
            bg: {
                type: 'image',
                imageUrl: dataUrl,
                customImageId: bg.customImageId || null,
                fit: bg.fit || 'cover',
                scale: bg.scale !== undefined ? bg.scale : 1,
                positionX: bg.positionX !== undefined ? bg.positionX : 50,
                positionY: bg.positionY !== undefined ? bg.positionY : 50,
                blur: bg.blur || 0,
                overlayColor: bg.overlayColor || '#000000',
                overlayOpacity: bg.overlayOpacity !== undefined ? bg.overlayOpacity : 0,
                angle: 135,
                texture: 'none',
                presetId: null
            }
        };

        bgFavImgMemory[key] = entry;
        if (!bgFavImgKeys.includes(key)) bgFavImgKeys.push(key);

        BG_FavImageDB.put(key, entry).catch(err => {
            console.error('IndexedDB 写入图片收藏失败:', err);
        });

        console.log('图片收藏快照已保存到 IndexedDB:', key);
    } catch (e) {
        console.error('saveFavImageEntry 失败:', e);
    }
}

function removeFavImageEntry(key) {
    if (bgFavImgMemory[key]) {
        delete bgFavImgMemory[key];
    }
    bgFavImgKeys = bgFavImgKeys.filter(k => k !== key);
    BG_FavImageDB.remove(key).catch(err => {
        console.error('IndexedDB 移除图片收藏失败:', err);
    });
}

function applyFavImageEntry(key) {
    const entry = bgFavImgMemory[key];
    if (!entry || !entry.bg) return;
    state.background = normalizeBackground(entry.bg);
    BG.applyBackgroundToCanvases(state.background);
    syncBgPanelInputs(state.background);
    BG.renderBgPresetGrid();
    state.saveState();
    if (typeof showBgToast === 'function') showBgToast('已应用收藏的图片背景 🖼️');
}

function hashString(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(36);
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(async () => {
        try {
            const rows = await BG_FavImageDB.getAll();
            bgFavImgMemory = {};
            bgFavImgKeys = [];
            rows.forEach(row => {
                if (row && row.entry && row.entry.bg && row.entry.dataUrl) {
                    bgFavImgMemory[row.key] = row.entry;
                    bgFavImgKeys.push(row.key);
                }
            });
            try {
                const legacy = JSON.parse(localStorage.getItem('douyin_bg_fav_images_v1') || '{}');
                const legacyKeys = Object.keys(legacy);
                if (legacyKeys.length > 0) {
                    for (const key of legacyKeys) {
                        if (!bgFavImgMemory[key] && legacy[key] && legacy[key].dataUrl) {
                            bgFavImgMemory[key] = legacy[key];
                            bgFavImgKeys.push(key);
                            await BG_FavImageDB.put(key, legacy[key]);
                        }
                    }
                    try { localStorage.removeItem('douyin_bg_fav_images_v1'); } catch(e) {
                        if (window.Utils && Utils.log) Utils.log.warn('[App] 移除旧版图片收藏缓存失败', e);
                    }
                }
            } catch (e) {
                if (window.Utils && Utils.log) Utils.log.warn('[App] 迁移旧版图片收藏失败', e);
            }

            bgFavImgReady = true;

            if (typeof renderBgPresetGrid === 'function') BG.renderBgPresetGrid();
            if (typeof renderFavBackgrounds === 'function') renderFavBackgrounds();
        } catch (e) {
            console.error('加载图片收藏失败:', e);
            bgFavImgReady = true;
        }
    }, 100);
});

