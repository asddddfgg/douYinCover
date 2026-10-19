// Main Application Entry
/* ============================================================
   导出补丁：复杂文字特效 → 内联 PNG
   覆盖：渐变文字 / -webkit-text-stroke / text-shadow / filter /
        text-decoration 线型 / animation 当前帧
   ============================================================ */

// 判断是否属于"html2canvas 画不好"的文字
function _needsRasterize(effectClass) {
    if (!effectClass) return false;

    let eff = null;
    try {
        if (typeof getAllEffectsMaster === 'function') {
            eff = getAllEffectsMaster().find(e => e.id === effectClass);
        }
    } catch (e) {}
    if (!eff || !eff.css) return false;

    const c = eff.css.toLowerCase();

    if (c.includes('background-clip: text') || c.includes('-webkit-background-clip: text')) return true;
    if (c.includes('-webkit-text-fill-color')) return true;
    if (c.includes('-webkit-text-stroke')) return true;
    if (/(^|;|\s)animation\s*:/.test(c)) return true;
    if (/(^|;|\s)filter\s*:/.test(c)) return true;
    if (c.includes('backdrop-filter')) return true;
    if (c.includes('clip-path')) return true;
    if (c.includes('mix-blend-mode')) return true;

    const hasBg = /(^|;|\s)background(-color)?\s*:/.test(c)
                && !c.includes('background-clip');
    // 只要有 background（非渐变文字），就预渲染 —— 因为 html2canvas 处理 inline 元素的 background + padding 有坑
    if (hasBg) return true;

    const risky = [
        'my_custom_eff_10','my_custom_eff_11','my_custom_eff_12','my_custom_eff_13',
        'my_custom_eff_14','my_custom_eff_15','my_custom_eff_16','my_custom_eff_17',
        'my_custom_eff_18','my_custom_eff_19','my_custom_eff_20',
        'my_custom_eff_26','my_custom_eff_27','my_custom_eff_28','my_custom_eff_29',
        'my_custom_eff_30',
        'my_custom_eff_87','my_custom_eff_88','my_custom_eff_89','my_custom_eff_90',
        'my_custom_eff_91','my_custom_eff_92','my_custom_eff_93','my_custom_eff_94',
        'my_custom_eff_95','my_custom_eff_99','my_custom_eff_100',
        'my_custom_eff_74','my_custom_eff_75','my_custom_eff_76',
        'my_custom_eff_77','my_custom_eff_78',
        'my_custom_eff_60','my_custom_eff_61',
        'my_custom_eff_41','my_custom_eff_42','my_custom_eff_43','my_custom_eff_44',
        'my_custom_eff_45','my_custom_eff_46','my_custom_eff_47','my_custom_eff_48',
        'my_custom_eff_49','my_custom_eff_50','my_custom_eff_51','my_custom_eff_52',
        'my_custom_eff_97','my_custom_eff_98'
    ];
    return risky.includes(effectClass);
}

// 从 effectClass 对应 CSS 里解析 color / gradient / stroke / shadow
function _parseEffectStyle(effectClass, computedStyle) {
    const cs = computedStyle;
    const out = {
        fill: cs.color || '#ffffff',
        stroke: null,
        strokeWidth: 0,
        shadow: null,
        backgroundGradient: null
    };

    // 读取 text-shadow（html2canvas 其实能画，但这里为了兼容动画瞬态也抓一次）
    const ts = cs.textShadow;
    if (ts && ts !== 'none') out.shadow = ts;

    // -webkit-text-stroke 在 computedStyle 里通常读不到，靠特效用例表手动补
    if (/^my_custom_eff_2[6-9]$/.test(effectClass) || effectClass === 'my_custom_eff_30') {
        const strokeMap = {
            my_custom_eff_26: { color: '#000', width: 1 },
            my_custom_eff_27: { color: '#ff0000', width: 2 },
            my_custom_eff_28: { color: '#0088ff', width: 2 },
            my_custom_eff_29: { color: '#ffd700', width: 2 },
            my_custom_eff_30: { color: null, width: 2 } // 渐变描边特殊处理
        };
        const s = strokeMap[effectClass];
        if (s) {
            out.stroke = s.color;
            out.strokeWidth = s.width;
        }
    }

    // 渐变背景文字：从 computedStyle 的 backgroundImage 抓（Chrome 能读到 linear-gradient）
    if (cs.backgroundImage && cs.backgroundImage.includes('gradient')) {
        out.backgroundGradient = cs.backgroundImage;
        out.fill = null; // 用渐变
    }
    return out;
}

// 把 CSS 的 linear-gradient(...) 解析成 canvas 用的色标数组 + 角度
function _parseLinearGradient(cssGradient) {
    // 形如 linear-gradient(90deg, rgb(255,0,0), rgb(0,136,255)) 或 linear-gradient(0deg, ...)
    const m = cssGradient.match(/linear-gradient\(\s*([\d.]+)deg\s*,(.+)\)\s*$/i);
    if (!m) return null;
    const angleDeg = parseFloat(m[1]);
    const rest = m[2];

    // 拆出每个色标（按顶层逗号拆，色标里可能有 rgb(...) 逗号）
    const stops = [];
    let depth = 0, cur = '';
    for (let i = 0; i < rest.length; i++) {
        const ch = rest[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (ch === ',' && depth === 0) {
            stops.push(cur.trim());
            cur = '';
        } else {
            cur += ch;
        }
    }
    if (cur.trim()) stops.push(cur.trim());

    const parsed = [];
    stops.forEach((s, idx) => {
        // 形如 "rgb(255, 0, 0)" 或 "rgb(255, 0, 0) 20%"
        const mm = s.match(/^(rgba?\([^)]+\))(?:\s+([\d.]+%))?/i);
        if (!mm) return;
        const color = mm[1];
        const pos = mm[2] ? parseFloat(mm[2]) / 100 : (idx / Math.max(1, stops.length - 1));
        parsed.push({ color, pos });
    });
    return parsed.length >= 2 ? { angleDeg, stops: parsed } : null;
}

// 用原生 Canvas 把一段文字画成 dataURL（支持渐变 / 描边 / 阴影 / 逐行）
function _drawTextToDataUrl(el, layerStyle) {
        // 如果文字被包裹在特效 span 里（有背景色/描边/padding 的特效），
    // 读内层 span 的样式（background/color 都在它上面，外层是透明的）
    let styleTarget = el;
    const innerSpan = el.querySelector('span[data-effect-span], span[class*="eff"], span[class*="effect"]');
    if (innerSpan) {
        styleTarget = innerSpan;
    }
    const cs = window.getComputedStyle(styleTarget);

    const fontSize = parseFloat(cs.fontSize) || 28;
    const fontFamily = cs.fontFamily || 'sans-serif';
    const fontWeight = cs.fontWeight || 'normal';
    const fontStyle = cs.fontStyle || 'normal';
    const letterSpacing = parseFloat(cs.letterSpacing) || 0;
    const lineHeightRaw = cs.lineHeight;
    let lineHeight = fontSize * 1.2;
    if (lineHeightRaw && lineHeightRaw !== 'normal') lineHeight = parseFloat(lineHeightRaw);
    const align = cs.textAlign || 'left';

    // 取纯文本 + 逐行（不处理局部 span 的富文本，富文本交给 html2canvas 原生画）
    const rawText = el.innerText || '';
    const lines = rawText.split('\n');

    // 临时画布测量
    const measureCanvas = document.createElement('canvas');
    const mctx = measureCanvas.getContext('2d');
    const fontStr = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    mctx.font = fontStr;

    let maxWidth = 0;
    lines.forEach(line => {
        const w = mctx.measureText(line).width + Math.max(0, line.length - 1) * letterSpacing;
        if (w > maxWidth) maxWidth = w;
    });
    const pad = 8 + (layerStyle.strokeWidth || 0) * 2;
    const canvasW = Math.ceil(maxWidth + pad * 2);
    const canvasH = Math.ceil(lines.length * lineHeight + pad * 2);

    const scale = 2; // 高清
    const canvas = document.createElement('canvas');
    canvas.width = canvasW * scale;
    canvas.height = canvasH * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    // 背景（若有 bgColor 且不是 transparent）
    if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') {
        ctx.fillStyle = cs.backgroundColor;
        ctx.fillRect(0, 0, canvasW, canvasH);
    }

    // 字体
    ctx.font = fontStr;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left'; // 自己算 x
    ctx.letterSpacing = letterSpacing + 'px';

    // 填充样式：渐变 or 纯色
    let fillStyle = layerStyle.fill || cs.color || '#ffffff';
    if (layerStyle.backgroundGradient) {
        const g = _parseLinearGradient(layerStyle.backgroundGradient);
        if (g) {
            // 角度转换：0deg = to top，90deg = to right
            const rad = (g.angleDeg - 90) * Math.PI / 180;
            const cx = canvasW / 2, cy = canvasH / 2;
            const len = Math.abs(canvasW * Math.cos(rad)) + Math.abs(canvasH * Math.sin(rad));
            const x0 = cx - Math.cos(rad) * len / 2;
            const y0 = cy - Math.sin(rad) * len / 2;
            const x1 = cx + Math.cos(rad) * len / 2;
            const y1 = cy + Math.sin(rad) * len / 2;
            const grad = ctx.createLinearGradient(x0, y0, x1, y1);
            g.stops.forEach(s => grad.addColorStop(s.pos, s.color));
            fillStyle = grad;
        }
    }

    // 阴影
    if (layerStyle.shadow) {
        // text-shadow 可能多个，只取第一个做近似（canvas 只支持单个 shadow）
        const firstShadow = layerStyle.shadow.split(/,(?![^(]*\))/)[0].trim();
        const sm = firstShadow.match(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px\s+(.+)/);
        if (sm) {
            ctx.shadowOffsetX = parseFloat(sm[1]);
            ctx.shadowOffsetY = parseFloat(sm[2]);
            ctx.shadowBlur = parseFloat(sm[3]);
            ctx.shadowColor = sm[4];
        }
    }

    // 逐行绘制
    lines.forEach((line, i) => {
        const w = mctx.measureText(line).width + Math.max(0, line.length - 1) * letterSpacing;
        let x = pad;
        if (align === 'center') x = pad + (maxWidth - w) / 2;
        else if (align === 'right') x = pad + (maxWidth - w);
        const y = pad + i * lineHeight;

        if (layerStyle.strokeWidth > 0) {
            // 有描边：先粗描边再填充（模拟 -webkit-text-stroke）
            if (layerStyle.stroke) {
                ctx.lineWidth = layerStyle.strokeWidth * 2;
                ctx.strokeStyle = layerStyle.stroke;
                ctx.lineJoin = 'round';
                ctx.strokeText(line, x, y);
            } else if (layerStyle.backgroundGradient) {
                // 渐变描边（30 号）：用渐变做 strokeStyle
                const g = _parseLinearGradient(layerStyle.backgroundGradient);
                if (g) {
                    const rad = (g.angleDeg - 90) * Math.PI / 180;
                    const cx = canvasW / 2, cy = canvasH / 2;
                    const len = Math.abs(canvasW * Math.cos(rad)) + Math.abs(canvasH * Math.sin(rad));
                    const grad2 = ctx.createLinearGradient(
                        cx - Math.cos(rad) * len / 2, cy - Math.sin(rad) * len / 2,
                        cx + Math.cos(rad) * len / 2, cy + Math.sin(rad) * len / 2
                    );
                    g.stops.forEach(s => grad2.addColorStop(s.pos, s.color));
                    ctx.lineWidth = layerStyle.strokeWidth * 2;
                    ctx.strokeStyle = grad2;
                    ctx.lineJoin = 'round';
                    ctx.strokeText(line, x, y);
                }
            }
        }

        ctx.fillStyle = fillStyle;
        ctx.fillText(line, x, y);


// 处理 text-decoration
const deco = cs.textDecorationLine || cs.textDecoration || '';
if (deco && deco !== 'none') {
    const decoColor = cs.textDecorationColor || cs.color;
    const decoStyle = cs.textDecorationStyle || 'solid';
    ctx.strokeStyle = decoColor;
    ctx.lineWidth = 1.5;
    if (decoStyle === 'wavy') {
        // 波浪线
        const yBase = y + fontSize + 2;
        ctx.beginPath();
        for (let xx = x; xx < x + w; xx += 4) {
            const yy = yBase + Math.sin((xx - x) / 2) * 1.5;
            xx === x ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
        }
        ctx.stroke();
    } else if (decoStyle === 'dotted') {
        for (let xx = x; xx < x + w; xx += 4) {
            ctx.beginPath();
            ctx.arc(xx, y + fontSize + 2, 1, 0, Math.PI * 2);
            ctx.fillStyle = decoColor;
            ctx.fill();
        }
    } else if (decoStyle === 'double') {
        ctx.beginPath();
        ctx.moveTo(x, y + fontSize + 1); ctx.lineTo(x + w, y + fontSize + 1);
        ctx.moveTo(x, y + fontSize + 4); ctx.lineTo(x + w, y + fontSize + 4);
        ctx.stroke();
    } else {
        // 单线：下划线 / 删除线
        const yLine = deco.includes('line-through') ? (y + fontSize * 0.55) : (y + fontSize + 2);
        ctx.beginPath();
        ctx.moveTo(x, yLine);
        ctx.lineTo(x + w, yLine);
        ctx.stroke();
    }
}






    });

    // 应用 filter（模糊/灰度/反色等）—— 画完后对 canvas 做像素处理
    const filterCss = cs.filter;
    if (filterCss && filterCss !== 'none') {
        // 用 canvas filter 再画一层
        const filtered = document.createElement('canvas');
        filtered.width = canvas.width;
        filtered.height = canvas.height;
        const fctx = filtered.getContext('2d');
        fctx.filter = filterCss;
        fctx.drawImage(canvas, 0, 0);
        return filtered.toDataURL('image/png');
    }

    return canvas.toDataURL('image/png');
}


function _isBgBoxEffectClass(effectClass) {
    if (!effectClass) return false;
    try {
        const allFx = (typeof getAllEffectsMaster === 'function') ? getAllEffectsMaster() : [];
        const fx = allFx.find(e => e.id === effectClass);
        if (!fx || !fx.css) return false;
        const c = fx.css.toLowerCase();
        const hasBg = /(^|;|\s)background(-color)?\s*:/.test(c)
                   && !c.includes('background-clip')
                   && !c.includes('-webkit-text-fill-color');
        const hasPadding = /(^|;|\s)padding\s*:/.test(c);
        const hasRadius = c.includes('border-radius');
        return hasBg || hasPadding || hasRadius;
    } catch (e) { return false; }
}

function isBgBoxLayer(node) {
    if (!node) return false;
    const layerEl = node.closest('.canvas-layer');
    if (!layerEl) return false;
    const layerId = layerEl.dataset.id;
    const layer = state.layers ? state.layers.find(l => l.id === layerId) : null;
    if (!layer || !layer.effectClass) return false;
    return _isBgBoxEffectClass(layer.effectClass);
}

async function _rasterizeByOffscreenHtml2Canvas(originalNode, clonedNode) {
    if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch (e) {}
    }
    const rect = originalNode.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    let dataUrl = '';
    try {
        const c = await html2canvas(originalNode, {
            scale: 2, backgroundColor: null, logging: false,
            useCORS: true, allowTaint: true
        });
        dataUrl = c.toDataURL('image/png');
    } catch (e) {
        console.warn('离屏截图失败，退回原逻辑:', e);
        return;
    }
    if (!dataUrl) return;
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.width = w + 'px';
    img.style.height = h + 'px';
    img.style.display = 'block';
    img.style.objectFit = 'fill';
    img.crossOrigin = 'anonymous';
    img.dataset.offscreenRasterized = '1';


const layerElForLog = originalNode.closest('.canvas-layer');
console.log('📌 离屏截图前 layerId:', layerElForLog ? layerElForLog.dataset.id : '无', '| rect:', w, 'x', h, '| effectClass:', (() => {
    try { const l = state.layers.find(x => x.id === (layerElForLog ? layerElForLog.dataset.id : '')); return l ? l.effectClass : '无'; } catch (e) { return 'err'; }
})());



console.log('✅ 离屏截图替换了 clone 节点, 尺寸:', w, 'x', h, '| dataUrl 长度:', dataUrl.length);


    if (clonedNode && clonedNode.parentNode) {
        clonedNode.parentNode.replaceChild(img, clonedNode);
    }
}








// 核心：onclone 回调，把 risky 文字换成 img
function _rasterizeRiskyText(originalNode, clonedNode, effectClass) {
    // originalNode: 原 DOM 的 .text-content-editable
    // clonedNode:   clone 里的对应节点（会被替换）
    if (!originalNode || !clonedNode) return;


if (isBgBoxLayer(originalNode)) {
    return _rasterizeByOffscreenHtml2Canvas(originalNode, clonedNode);
}



    // 富文本（含 span）不替换，避免丢局部样式；交给 html2canvas 原生画
    if (originalNode.querySelector('span, b, i, u, s, strong, em')) return;




    try {
        let styleNode = originalNode;
const innerSpan = originalNode.querySelector('span[data-effect-span], span[class*="eff"], span[class*="effect"]');
if (innerSpan) styleNode = innerSpan;
const computed = window.getComputedStyle(styleNode);
        const layerStyle = _parseEffectStyle(effectClass, computed);
        const dataUrl = _drawTextToDataUrl(originalNode, layerStyle);
        if (!dataUrl) return;

        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.width = originalNode.offsetWidth + 'px';
        img.style.height = originalNode.offsetHeight + 'px';
        img.style.display = 'block';
        img.style.objectFit = 'contain';
        img.crossOrigin = 'anonymous';

        // 替换 clone 里的节点
        clonedNode.parentNode.replaceChild(img, clonedNode);
    } catch (e) {
        console.warn('rasterize text failed:', e);
    }
}

// 主入口：给 html2canvas 的 onclone 用
function _buildOnCloneForExport(originalCanvasNode) {
    return async function (clonedDoc, clonedCanvasEl) {
        // 找出原始画布上所有带 effectClass 的文字节点
        const originalTextEls = originalCanvasNode.querySelectorAll('.text-content-editable');
        const tasks = [];
        originalTextEls.forEach(origEl => {
            const layerEl = origEl.closest('.canvas-layer');
            if (!layerEl) return;
            const layerId = layerEl.dataset.id;
            const layer = state.layers.find(l => l.id === layerId);
            if (!layer || !layer.effectClass) return;
            if (!_needsRasterize(layer.effectClass)) return;

            const clonedLayer = clonedCanvasEl.querySelector(`.canvas-layer[data-id="${layerId}"]`);
            if (!clonedLayer) return;
            const clonedTextEl = clonedLayer.querySelector('.text-content-editable');
            if (!clonedTextEl) return;

            // 兼容同步返回（原 _rasterizeRiskyText）和 Promise 返回（_rasterizeByOffscreenHtml2Canvas）
            const ret = _rasterizeRiskyText(origEl, clonedTextEl, layer.effectClass);
            if (ret && typeof ret.then === 'function') {
                tasks.push(ret);
            }
        });
        if (tasks.length > 0) {
            await Promise.all(tasks);
        }
    };
}



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
            fontSize: '28px',
            fontFamily: 'sans-serif',
            color: '#ffffff',
            bgColor: 'transparent',
            bold: false, italic: false, underline: false, strike: false,
            align: 'center', vertical: false,
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
});

function initCustomFontUpload() {
    const btnUpload = document.getElementById('btn-upload-font');
    const fileInput = document.getElementById('local-font-file');
    const fontSelect = document.getElementById('tb-font');
    if (!btnUpload || !fileInput || !fontSelect) return;

    loadCachedCustomFonts(fontSelect);
    btnUpload.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            const fontDataUrl = evt.target.result;
            const fontName = 'CustomFont_' + Date.now();
            const displayName = file.name.replace(/\.[^/.]+$/, "");
            registerAndApplyFont(fontName, displayName, fontDataUrl, true);
            try {
                let savedFonts = JSON.parse(localStorage.getItem('douyin_cover_custom_fonts') || '[]');
                savedFonts.push({ fontName, displayName, fontDataUrl });
                localStorage.setItem('douyin_cover_custom_fonts', JSON.stringify(savedFonts));
                alert(`本地手写字体 "${file.name}" 上传成功并已永久保存！刷新网页也不会消失。`);
            } catch (err) { console.error('字体缓存失败:', err); }
        };
        reader.readAsDataURL(file);
    });
}

function registerAndApplyFont(fontName, displayName, fontDataUrl, autoSelect = false) {
    const fontSelect = document.getElementById('tb-font');
    if (!fontSelect) return;
    fetch(fontDataUrl).then(res => res.arrayBuffer())
        .then(buffer => {
            const fontFace = new FontFace(fontName, buffer);
            return fontFace.load();
        })
        .then((loadedFace) => {
            document.fonts.add(loadedFace);
            let exists = Array.from(fontSelect.options).some(opt => opt.value === fontName);
            if (!exists) {
                const option = document.createElement('option');
                option.value = fontName;
                option.innerText = '✍️ ' + displayName;
                fontSelect.appendChild(option);
            }
            if (autoSelect) {
                fontSelect.value = fontName;
                const layer = state.getSelectedLayer();
                if (layer && layer.type === 'text') { layer.fontFamily = fontName; renderCanvas(); }
            }
        })
        .catch(err => console.error('注册字体失败:', err));
}

function loadCachedCustomFonts(fontSelect) {
    try {
        let savedFonts = JSON.parse(localStorage.getItem('douyin_cover_custom_fonts') || '[]');
        savedFonts.forEach(font => registerAndApplyFont(font.fontName, font.displayName, font.fontDataUrl, false));
    } catch (err) { console.error('读取字体缓存出错:', err); }
}









function exportElementToPNG(canvasDOMNode, filename, scale) {
    const exportScale = (typeof scale === 'number' && scale > 0) ? scale : 2;
    return new Promise((resolve, reject) => {
        // 1. 找到所有要隐藏的"编辑辅助"元素
        const guidesLayer = canvasDOMNode.querySelector('.custom-guides-layer');
        const snapLayer = canvasDOMNode.querySelector('.snap-lines-layer');
        const selectionBox = canvasDOMNode.querySelector('.selection-box');
        const handles = canvasDOMNode.querySelectorAll('.resize-handle, .edge-handle, .rotate-handle');
        const selectedLayers = [...canvasDOMNode.querySelectorAll('.canvas-layer.selected')];

        const toHide = [guidesLayer, snapLayer, selectionBox, ...handles].filter(Boolean);
        const prevDisplays = toHide.map(el => el.style.display);
        toHide.forEach(el => el.style.display = 'none');
        selectedLayers.forEach(el => el.classList.remove('selected'));

        // 2. 去掉页面外框高亮
        const pageWrapper = canvasDOMNode.closest('.canvas-page-wrapper');
        const hadActive = pageWrapper ? pageWrapper.classList.contains('active-page') : false;
        if (pageWrapper) pageWrapper.classList.remove('active-page');

        // 3. 去掉画布自己的边框
        const orig = {
            border: canvasDOMNode.style.border,
            borderColor: canvasDOMNode.style.borderColor,
            boxShadow: canvasDOMNode.style.boxShadow,
            borderRadius: canvasDOMNode.style.borderRadius
        };
        canvasDOMNode.style.border = 'none';
        canvasDOMNode.style.borderColor = 'transparent';
        canvasDOMNode.style.boxShadow = 'none';
        canvasDOMNode.style.borderRadius = '0';

        // 4. 不管成功失败都要恢复
        const cleanup = () => {
            toHide.forEach((el, i) => { el.style.display = prevDisplays[i] || ''; });
            selectedLayers.forEach(el => el.classList.add('selected'));
            if (pageWrapper && hadActive) pageWrapper.classList.add('active-page');
            canvasDOMNode.style.border = orig.border;
            canvasDOMNode.style.borderColor = orig.borderColor;
            canvasDOMNode.style.boxShadow = orig.boxShadow;
            canvasDOMNode.style.borderRadius = orig.borderRadius;
        };

        // 5. 截图
                html2canvas(canvasDOMNode, {
            scale: exportScale,
            useCORS: true,
            allowTaint: true,
            backgroundColor: null,
            logging: false,
            imageTimeout: 15000,



onclone: async (clonedDoc, clonedEl) => {
    clonedDoc.querySelectorAll(
        '.custom-guides-layer, .snap-lines-layer, .selection-box, ' +
        '.resize-handle, .edge-handle, .rotate-handle'
    ).forEach(el => el.style.display = 'none');
    clonedEl.querySelectorAll('.canvas-layer.selected')
        .forEach(el => el.classList.remove('selected'));

    // 接回 _buildOnCloneForExport，让"文字预渲染"生效
    const fn = _buildOnCloneForExport(canvasDOMNode);
    await fn(clonedDoc, clonedEl);
}





        }).then(canvas => {
            if (!canvas || canvas.width === 0 || canvas.height === 0) {
                throw new Error('html2canvas 渲染结果为空');
            }
            return new Promise((res, rej) => {
                canvas.toBlob(blob => {
                    if (!blob || blob.size === 0) return rej(new Error('toBlob 返回空'));
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                    res(true);
                }, 'image/png');
            });
        }).then(() => {
            resolve(true);
        }).catch(err => {
            console.error('导出失败:', err);
            alert('导出失败：' + (err && err.message ? err.message : '未知错误'));
            resolve(false);
        }).finally(cleanup);
    });
}







/* ============================================================
   导出面板（世界级：范围可选 + 分辨率可选）
   ============================================================ */
let _exportScale = 2;

function openExportPanel() {
    const panel = document.getElementById('export-panel');
    if (!panel) return;

    // 重置为默认
    const rangeCurrent = panel.querySelector('input[name="export-range"][value="current"]');
    if (rangeCurrent) rangeCurrent.checked = true;
    const scale2 = panel.querySelector('input[name="export-scale"][value="2"]');
    if (scale2) scale2.checked = true;

    const checkboxes = document.getElementById('export-page-checkboxes');
    if (checkboxes) checkboxes.style.display = 'none';

    // 填充页面勾选列表
    const boxWrap = document.getElementById('export-page-checkboxes');
    if (boxWrap) {
        boxWrap.innerHTML = '';
        state.pages.forEach((page, index) => {
            const label = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = page.id;
            cb.checked = true;
            label.appendChild(cb);
            label.appendChild(document.createTextNode(`第 ${index + 1} 页（${page.layers.length} 个图层）`));
            boxWrap.appendChild(label);
        });
    }

    // 监听范围切换
    panel.querySelectorAll('input[name="export-range"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const val = panel.querySelector('input[name="export-range"]:checked').value;
            if (boxWrap) boxWrap.style.display = (val === 'custom') ? 'block' : 'none';
        });
    });

    panel.style.display = 'flex';
}

function closeExportPanel() {
    const panel = document.getElementById('export-panel');
    if (panel) panel.style.display = 'none';
}

async function runExportFromPanel() {
    const panel = document.getElementById('export-panel');
    if (!panel) return;

    const range = panel.querySelector('input[name="export-range"]:checked').value;
    const scale = parseInt(panel.querySelector('input[name="export-scale"]:checked').value, 10) || 2;
    _exportScale = scale;

    let targetPageIds = [];

    if (range === 'current') {
        if (!state.currentPageId) { alert('当前没有可导出的页面！'); return; }
        targetPageIds = [state.currentPageId];
    } else if (range === 'all') {
        targetPageIds = state.pages.map(p => p.id);
    } else {
        const checked = panel.querySelectorAll('#export-page-checkboxes input[type="checkbox"]:checked');
        targetPageIds = Array.from(checked).map(cb => cb.value);
        if (targetPageIds.length === 0) { alert('请至少勾选一个页面！'); return; }
    }

    closeExportPanel();

    let successCount = 0;
    let failCount = 0;

    for (const pageId of targetPageIds) {
        const wrapper = document.querySelector(`.canvas-page-wrapper[data-page-id="${pageId}"]`);
        if (!wrapper) { failCount++; continue; }
        const canvasNode = wrapper.querySelector('.cover-canvas');
        if (!canvasNode) { failCount++; continue; }

        const pageIndex = state.pages.findIndex(p => p.id === pageId);
        const pageNum = pageIndex >= 0 ? pageIndex + 1 : 1;

        const ok = await exportElementToPNG(canvasNode, `龙蛇变_第${pageNum}页_${Date.now()}.png`, scale);
        if (ok) successCount++; else failCount++;

        // 多页导出时给浏览器一点间隔
        if (targetPageIds.length > 1) {
            await new Promise(r => setTimeout(r, 500));
        }
    }

    if (failCount === 0) {
        if (successCount === 1) {
            const idx = state.pages.findIndex(p => p.id === targetPageIds[0]);
            alert(`第 ${idx + 1} 页导出成功！`);
        } else {
            alert(`全部 ${successCount} 页导出成功！`);
        }
    } else {
        alert(`导出完成：成功 ${successCount} 页，失败 ${failCount} 页。`);
    }
}

function initExportPanel() {
    const btnExport = document.getElementById('btn-export');
    if (btnExport) {
        // 用 clone 替换，避免重复绑定
        const newBtn = btnExport.cloneNode(true);
        btnExport.replaceWith(newBtn);
        newBtn.addEventListener('click', openExportPanel);
    }

    const btnClose = document.getElementById('export-panel-close');
    if (btnClose) btnClose.addEventListener('click', closeExportPanel);
    const btnCancel = document.getElementById('export-panel-cancel');
    if (btnCancel) btnCancel.addEventListener('click', closeExportPanel);
    const btnConfirm = document.getElementById('export-panel-confirm');
    if (btnConfirm) btnConfirm.addEventListener('click', runExportFromPanel);

    const panel = document.getElementById('export-panel');
    if (panel) {
        panel.addEventListener('click', (e) => {
            if (e.target === panel) closeExportPanel();
        });
    }
}

async function exportAllPagesAsPNG() {
    openExportPanel();
}

function renderAll() {
    renderCanvas();
    renderLayerList();
    renderPageList();
    updateBackgroundView();
    updateTopToolbarUI(state.getSelectedLayer());
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
    setTimeout(() => {
        const currentEditable = document.querySelector(`.canvas-layer[data-id="${layerId}"] .text-content-editable`);
        if (currentEditable) {
            currentEditable.contentEditable = 'true';
            currentEditable.focus();
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(currentEditable);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }, 30);
}

function createBackdropElement(layer) {
    if (!layer.backdrop || !layer.backdrop.type || layer.backdrop.type === 'none') return null;
    const bd = layer.backdrop;
    const el = document.createElement('div');
    el.className = 'layer-backdrop';
    const pad = (bd.padding !== undefined ? bd.padding : 12);
    el.style.left = (-pad) + 'px';
    el.style.top = (-pad) + 'px';
    el.style.right = (-pad) + 'px';
    el.style.bottom = (-pad) + 'px';
    el.style.opacity = (bd.opacity !== undefined ? bd.opacity : 1);
    el.style.transform = `rotate(${bd.rotate || 0}deg)`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.style.backgroundRepeat = 'no-repeat';

    if (bd.type === 'custom') {
        const cid = bd.customId;
        if (cid !== undefined && cid !== null) {
            let dataUrl = (typeof backdropCache !== 'undefined' && backdropCache[cid]) || null;
            if (dataUrl) {
                el.style.backgroundImage = `url(${dataUrl})`;
                applyCustomBackdropStyle(el, dataUrl, bd);
            } else {
                el.style.background = bd.color || '#ffffff';
                BackdropDB.getBackdropById(cid).then(item => {
                    if (!item) return;
                    if (typeof backdropCache !== 'undefined') backdropCache[cid] = item.dataUrl;
                    const target = document.querySelector(`.canvas-layer[data-id="${layer.id}"] .layer-backdrop`);
                    if (target) {
                        target.style.backgroundImage = `url(${item.dataUrl})`;
                        applyCustomBackdropStyle(target, item.dataUrl, bd);
                    }
                }).catch(() => {});
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
        if (bd.type === 'brush') {
            el.style.background = bd.color || 'rgba(255,235,59,0.55)';
        } else if (bd.type === 'sticky') {
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

function applyCustomBackdropStyle(el, dataUrl, bd) {
    el.style.backgroundImage = `url(${dataUrl})`;
    const mode = bd.sizeMode || 'cover';
    if (mode === 'cover') {
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
        el.style.backgroundImage = `linear-gradient(${bd.overlayColor}, ${bd.overlayColor}), url(${dataUrl})`;
        el.style.backgroundBlendMode = 'multiply';
    }
}

function renderCanvas() {
    const container = document.querySelector('.canvas-container');
    if (!container) return;
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
            el.dataset.id = layer.id;
            el.style.left = layer.x + 'px';
            el.style.top = layer.y + 'px';
            el.style.width = layer.width + 'px';

            // ✅ 文本图层高度模式：auto 则交给 CSS 自适应，fixed 则用固定 px
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
    } catch (e) { isBgBox = false; }
}

const textInner = document.createElement('div');
textInner.className = 'text-content-editable';
textInner.contentEditable = isEditing ? 'true' : 'false';
textInner.innerHTML = layer.content || '';
textInner.style.fontSize = layer.fontSize;
textInner.style.fontFamily = layer.fontFamily;
textInner.style.color = layer.color;
textInner.style.backgroundColor = layer.bgColor;
textInner.style.fontWeight = layer.bold ? 'bold' : 'normal';
textInner.style.fontStyle = layer.italic ? 'italic' : 'normal';
let textDecorations = [];
if (layer.underline) textDecorations.push('underline');
if (layer.strike) textDecorations.push('line-through');
textInner.style.textDecoration = textDecorations.join(' ');
textInner.style.textAlign = layer.align;
textInner.style.writingMode = layer.vertical ? 'vertical-rl' : 'horizontal-tb';
textInner.style.letterSpacing = layer.letterSpacing || '0px';
textInner.style.lineHeight = layer.lineHeight || 1.2;





if (isBgBox) {
    // 背景框类：直接把 background / padding / border-radius 加在外层
    // 不包 wrapSpan —— html2canvas 对 inline-block + background 渲染有 bug
    textInner.style.textAlign = layer.align;
    textInner.style.display = 'block';

    // 从特效 CSS 里拆出背景相关属性，直接应用外层
    try {
        const allFx = (typeof getAllEffectsMaster === 'function') ? getAllEffectsMaster() : [];
        const fx = allFx.find(e => e.id === layer.effectClass);
        if (fx && fx.css) {
            fx.css.split(';').forEach(rule => {
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
        }
    } catch (e) {}

    // 保留用户手动局部色
    if (typeof hasLocalInlineColor === 'function' && hasLocalInlineColor(layer.content)) {
        textInner.classList.add('has-local-color');
    }
} else {
    if (layer.effectClass) textInner.classList.add(layer.effectClass);
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
                        document.fonts.ready.then(syncAutoHeight);
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

                el.appendChild(textInner);
            } else if (layer.type === 'sticker') {
                el.style.display = 'flex';
                el.style.alignItems = 'center';
                el.style.justifyContent = 'center';
                el.style.pointerEvents = 'none';

                if (layer.stickerType === 'svg' || layer.stickerType === 'image' || layer.stickerType === 'uploaded') {
                    let src = layer.content;
                    if (layer.stickerType === 'svg' && layer.stickerColor) {
                        try {
                            const decoded = decodeURIComponent(src.split('utf8,')[1] || '');
                            src = 'data:image/svg+xml;utf8,' + encodeURIComponent(decoded.replace(/fill="currentColor"/g, `fill="${layer.stickerColor}"`));
                        } catch (err) { }
                    }
                    const img = document.createElement('img');
                    // ⭐ 关键修复：给跨域图片加 crossOrigin，避免 canvas 污染导致导出空文件
                    img.crossOrigin = 'anonymous';
                    img.src = src;
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.objectFit = 'contain';
                    img.draggable = false;
                    img.style.pointerEvents = 'none';
                    el.appendChild(img);
                } else {
                    el.style.fontSize = layer.fontSize;
                    el.style.pointerEvents = 'auto';
                    el.innerText = layer.content;
                }
                el.style.pointerEvents = 'auto';
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
            applyBackgroundToCanvases(state.background);
        }
    });

    if (typeof applyBackgroundToCanvases === 'function') {
        applyBackgroundToCanvases(state.background);
    }

    // 重绘参考线
    if (window.Guides) Guides.renderGuides();
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
        const cleanContent = (layer.content || '').replace(/<[^>]*>/g, '').substring(0, 10);
        const iconName = layer.type === 'text' ? 'fa-font' : 'fa-face-smile';
        const typeLabel = layer.type === 'sticker' ? `[${layer.stickerType || 'emoji'}]` : '';
        item.innerHTML = `
            <span><i class="fa-solid ${iconName}"></i> ${typeLabel}${cleanContent || '图层'}</span>
            <button class="btn" style="padding: 2px 6px; font-size:11px;" onclick="selectLayerFromList('${layer.id}')">选择</button>
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

/* ============================================================
   背景系统 v2 —— 智能预设库 + 一键随机 + 主色提取
   ============================================================ */

const BG_FAV_KEY = 'douyin_bg_favs_v2';
const BG_RECENT_KEY = 'douyin_bg_recent_v2';
const BG_RECENT_MAX = 12;
let currentBgCategory = 'hot';

function normalizeBackground(bg) {
    const base = window.DEFAULT_BACKGROUND || {
        type: 'gradient', color1: '#ff2442', color2: '#2575fc',
        imageUrl: '', angle: 135, texture: 'none', presetId: null
    };
    return Object.assign({}, base, bg || {});
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

    if (bg.type === 'image' && window.applyBackgroundToCanvasesWithImage) {
        window.applyBackgroundToCanvasesWithImage(bg);
        return;
    }

    if (window.applyBackgroundToCanvasesWithImage) {
        window.applyBackgroundToCanvasesWithImage(bg);
    }

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

function updateBackgroundView() {
    applyBackgroundToCanvases(state.background);
    syncBgPanelInputs(state.background);
    renderBgPresetGrid();
}

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
}

function getFavPresetIds() {
    try { return JSON.parse(localStorage.getItem(BG_FAV_KEY) || '[]'); }
    catch (e) { return []; }
}
function saveFavPresetIds(ids) {
    try { localStorage.setItem(BG_FAV_KEY, JSON.stringify(ids)); } catch (e) {}
}
function getRecentPresetIds() {
    try { return JSON.parse(localStorage.getItem(BG_RECENT_KEY) || '[]'); }
    catch (e) { return []; }
}
function pushRecentPresetId(id) {
    let list = getRecentPresetIds();
    list = list.filter(x => x !== id);
    list.unshift(id);
    if (list.length > BG_RECENT_MAX) list = list.slice(0, BG_RECENT_MAX);
    try { localStorage.setItem(BG_RECENT_KEY, JSON.stringify(list)); } catch (e) {}
}

function findPresetById(id) {
    return BG_PRESETS.find(p => p.id === id) || null;
}

function getPresetsByCategory(cat) {
    if (cat === 'fav') {
        return getFavPresetIds().map(id => findPresetById(id)).filter(Boolean);
    }
    if (cat === 'recent') {
        return getRecentPresetIds().map(id => findPresetById(id)).filter(Boolean);
    }
    return BG_PRESETS.filter(p => p.cat === cat);
}

function toggleFavPreset(id) {
    let favIds = getFavPresetIds();
    if (favIds.includes(id)) {
        favIds = favIds.filter(x => x !== id);
        if (id.startsWith('img-') || id.startsWith('url-')) {
            removeFavImageEntry(id);
        }
    } else {
        favIds.push(id);
    }
    saveFavPresetIds(favIds);
    renderBgPresetGrid();
    renderFavBackgrounds();
}

function applyPresetToState(preset) {
    if (!preset) return;
    const newBg = {
        type: preset.type,
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

function handleSmartRecommend() {
    const layer = state.getSelectedLayer && state.getSelectedLayer();
    let candidates = [];

    if (layer && layer.type === 'text' && layer.content) {
        const text = String(layer.content).replace(/<[^>]*>/g, '').toLowerCase();
        SMART_KEYWORD_MAP.forEach(rule => {
            if (rule.keys.some(k => text.includes(k))) {
                candidates.push(...rule.presets);
            }
        });
    }

    if (layer && layer.effectClass && SMART_EFFECT_MAP[layer.effectClass]) {
        candidates.push(...SMART_EFFECT_MAP[layer.effectClass]);
    }

    if (candidates.length === 0) {
        candidates = BG_PRESETS.filter(p => p.cat === 'hot').map(p => p.id);
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
    const pool = BG_PRESETS.filter(p =>
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

let _bgToastTimer = null;
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
    if (_bgToastTimer) clearTimeout(_bgToastTimer);
    _bgToastTimer = setTimeout(() => {
        el.classList.remove('show');
    }, duration || 2200);
}

function renderBgPresetGrid() {
    const grid = document.getElementById('bg-preset-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const favIds = getFavPresetIds();
    const currentPresetId = (state.background && state.background.presetId) || null;
    const store = getFavImageStore();

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

function renderFavBackgrounds() {
    const listEl = document.getElementById('fav-bg-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const favIds = getFavPresetIds();
    const store = getFavImageStore();

    if (favIds.length === 0) {
        const demo = BG_PRESETS.filter(p => p.cat === 'hot').slice(0, 4);
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
                currentBgCategory = tab.dataset.cat;
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
            state.background.type = e.target.value;
            state.background.presetId = null;
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

    const imgFile = document.getElementById('bg-image-file');
    if (imgFile) imgFile.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            state.background.type = 'image';
            state.background.imageUrl = evt.target.result;
            state.background.presetId = null;
            applyBackgroundToCanvases(state.background);
            state.saveState();
        };
        reader.readAsDataURL(file);
    });

    const btnFav = document.getElementById('btn-fav-bg');
    if (btnFav && btnFav.dataset.bound !== 'true') {
        btnFav.dataset.bound = 'true';
        btnFav.addEventListener('click', () => {
            const bg = state.background;

            if (bg && bg.type === 'image' && (bg.customImageId || bg.imageUrl)) {
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

            const pid = bg && bg.presetId;
            if (pid && findPresetById(pid)) {
                if (!getFavPresetIds().includes(pid)) {
                    toggleFavPreset(pid);
                    showBgToast('已加入收藏夹 ⭐');
                } else {
                    showBgToast('该预设已在收藏夹中');
                }
            } else {
                showBgToast('请先点击一款预设，再收藏为快捷背景 ⭐', 2600);
            }
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
    applyBackgroundToCanvases(state.background);
    syncBgPanelInputs(state.background);
    renderBgPresetGrid();
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
                    try { localStorage.removeItem('douyin_bg_fav_images_v1'); } catch(e) {}
                }
            } catch (e) { }

            bgFavImgReady = true;

            if (typeof renderBgPresetGrid === 'function') renderBgPresetGrid();
            if (typeof renderFavBackgrounds === 'function') renderFavBackgrounds();
        } catch (e) {
            console.error('加载图片收藏失败:', e);
            bgFavImgReady = true;
        }
    }, 100);
});