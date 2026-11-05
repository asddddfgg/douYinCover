// ============================================================
// exporter.js — 导出系统（P3：从 app.js 迁出）
// 职责边界：
//   ✅ 负责：exportElementToPNG（html2canvas 导出核心）
//            _buildOnCloneForExport（onclone 预处理：行内 invert / padding 补偿 / 波浪线栅格化 / risky 文字栅格化）
//            _needsRasterize / _parseEffectStyle / _parseLinearGradient / _drawTextToDataUrl /
//            _isBgBoxEffectClass / isBgBoxLayer / _rasterizeByOffscreenHtml2Canvas /
//            _rasterizeTextNodeIntoClone / _rasterizeRiskyText / _invertCssColor
//            导出面板：openExportPanel / closeExportPanel / runExportFromPanel / initExportPanel / exportAllPagesAsPNG
//   ❌ 不负责：画布渲染（在 app.js 的 renderCanvas）
//   ❌ 不负责：特效定义（在 effects.js）
//   ❌ 不负责：选区 / 字体 / 背景（各自模块）
// 依赖：state / html2canvas（CDN）/ getAllEffectsMaster / renderEffectCss 等全局
// 被依赖：app.js 的 DOMContentLoaded 调 initExportPanel()
//          app.js 的 DOMContentLoaded 里保留 initExportPanel() 调用（函数声明会提升到全局）
// 加载顺序：必须晚于 app.js（本文件函数声明覆盖 app.js 同名旧声明）
// ============================================================

window.__EXPORTER_READY__ = true;
console.log('[Exporter] P3 骨架就位，等待函数体迁移');

// ============================================================
// 第 1 批：_needsRasterize / _parseEffectStyle / _parseLinearGradient
// ============================================================

function _needsRasterize(effectClass) {
    if (!effectClass) return false;
    let eff = null;
    try {
        if (typeof getAllEffectsMaster === 'function') {
            eff = getAllEffectsMaster().find(e => e.id === effectClass);
        }
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[Exporter] 读取特效定义失败', effectClass, e);
    }
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
    const hasBg = /(^|;|\s)background(-color)?\s*:/.test(c) && !c.includes('background-clip');
    if (hasBg) return true;
    const risky = ['my_custom_eff_10','my_custom_eff_11','my_custom_eff_12','my_custom_eff_13','my_custom_eff_14','my_custom_eff_15','my_custom_eff_16','my_custom_eff_17','my_custom_eff_18','my_custom_eff_19','my_custom_eff_20','my_custom_eff_26','my_custom_eff_27','my_custom_eff_28','my_custom_eff_29','my_custom_eff_30','my_custom_eff_87','my_custom_eff_88','my_custom_eff_89','my_custom_eff_90','my_custom_eff_91','my_custom_eff_92','my_custom_eff_93','my_custom_eff_94','my_custom_eff_95','my_custom_eff_99','my_custom_eff_100','my_custom_eff_74','my_custom_eff_75','my_custom_eff_76','my_custom_eff_77','my_custom_eff_78','my_custom_eff_60','my_custom_eff_61','my_custom_eff_41','my_custom_eff_42','my_custom_eff_43','my_custom_eff_44','my_custom_eff_45','my_custom_eff_46','my_custom_eff_47','my_custom_eff_48','my_custom_eff_49','my_custom_eff_50','my_custom_eff_51','my_custom_eff_52','my_custom_eff_97','my_custom_eff_98'];
    return risky.includes(effectClass);
}

function _parseEffectStyle(effectClass, computedStyle) {
    const cs = computedStyle;
    const out = { fill: cs.color || '#ffffff', stroke: null, strokeWidth: 0, shadow: null, backgroundGradient: null };
    const ts = cs.textShadow;
    if (ts && ts !== 'none') out.shadow = ts;
    if (/^my_custom_eff_2[6-9]$/.test(effectClass) || effectClass === 'my_custom_eff_30') {
        const strokeMap = {
            my_custom_eff_26: { color: '#000', width: 1 },
            my_custom_eff_27: { color: '#ff0000', width: 2 },
            my_custom_eff_28: { color: '#0088ff', width: 2 },
            my_custom_eff_29: { color: '#ffd700', width: 2 },
            my_custom_eff_30: { color: null, width: 2 }
        };
        const s = strokeMap[effectClass];
        if (s) { out.stroke = s.color; out.strokeWidth = s.width; }
    }
    if (cs.backgroundImage && cs.backgroundImage.includes('gradient')) {
        out.backgroundGradient = cs.backgroundImage;
        out.fill = null;
    }
    return out;
}

function _parseLinearGradient(cssGradient) {
    const m = cssGradient.match(/linear-gradient\(\s*([\d.]+)deg\s*,(.+)\)\s*$/i);
    if (!m) return null;
    const angleDeg = parseFloat(m[1]);
    const rest = m[2];
    const stops = [];
    let depth = 0, cur = '';
    for (let i = 0; i < rest.length; i++) {
        const ch = rest[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { stops.push(cur.trim()); cur = ''; }
        else { cur += ch; }
    }
    if (cur.trim()) stops.push(cur.trim());
    const parsed = [];
    stops.forEach((s, idx) => {
        const mm = s.match(/^(rgba?\([^)]+\))(?:\s+([\d.]+%))?/i);
        if (!mm) return;
        const color = mm[1];
        const pos = mm[2] ? parseFloat(mm[2]) / 100 : (idx / Math.max(1, stops.length - 1));
        parsed.push({ color, pos });
    });
    return parsed.length >= 2 ? { angleDeg, stops: parsed } : null;
}

console.log('[Exporter] 第1批已接管：_needsRasterize / _parseEffectStyle / _parseLinearGradient');

// ============================================================
// 第 2 批：_drawTextToDataUrl
// ============================================================

function _drawTextToDataUrl(el, layerStyle) {
    let styleTarget = el;
    const innerSpan = el.querySelector('span[data-effect-span], span[class*="eff"], span[class*="effect"]');
    if (innerSpan) {
        styleTarget = innerSpan;
    }
    const cs = window.getComputedStyle(styleTarget);

    const fontSize = parseFloat(cs.fontSize) || 28;
    let fontFamily = cs.fontFamily || 'sans-serif';
    const fontWeight = cs.fontWeight || 'normal';
    const fontStyle = cs.fontStyle || 'normal';

    // ✅ 字体优先级（从高到低）：
    //    1) 图层数据里的 fontFamily（最权威，不受特效 CSS 干扰）
    //    2) 沿 DOM 祖先链找第一个具体字体名
    //    3) computedStyle 兜底
    //    手写体 Xiaolai 被 effect-chalk 等特效的 font-family:cursive 覆盖时，
    //    仅靠 computedStyle 会拿到 cursive → canvas 画出黑体，这里必须从图层数据拿。
    (function resolveRealFont() {
        const generic = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|-apple-system|inherit|initial|unset)$/i;

        // 1) 优先从图层数据取
        const layerEl = el.closest && el.closest('.canvas-layer');
        if (layerEl && layerEl.dataset && layerEl.dataset.id && window.state) {
            const layerId = layerEl.dataset.id;
            let layer = null;
            for (const p of (state.pages || [])) {
                const found = (p.layers || []).find(l => l.id === layerId);
                if (found) { layer = found; break; }
            }
            if (layer && layer.fontFamily) {
                const safe = (typeof window._safeFontFamily === 'function')
                    ? window._safeFontFamily(layer.fontFamily)
                    : layer.fontFamily;
                fontFamily = safe;
                return;
            }
        }

        // 2) computedStyle 是通用回退 → 沿祖先链找
        const first = fontFamily.split(',')[0].replace(/["']/g, '').trim();
        if (!generic.test(first)) return;
        let node = el;
        while (node && node !== document.body) {
            const ncs = window.getComputedStyle(node);
            const nf = (ncs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
            if (nf && !generic.test(nf)) {
                fontFamily = ncs.fontFamily;
                return;
            }
            if (node === layerEl) break;
            node = node.parentElement;
        }
    })();
    const letterSpacing = parseFloat(cs.letterSpacing) || 0;
    const lineHeightRaw = cs.lineHeight;
    let lineHeight = fontSize * 1.2;
    if (lineHeightRaw && lineHeightRaw !== 'normal') lineHeight = parseFloat(lineHeightRaw);
    const align = cs.textAlign || 'left';

    const rawText = el.innerText || '';
    const lines = rawText.split('\n');

    const measureCanvas = document.createElement('canvas');
    const mctx = measureCanvas.getContext('2d');
    const fontStr = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    mctx.font = fontStr;

    function measureLineWidth(line) {
        const base = mctx.measureText(line).width;
        const spacing = letterSpacing > 0 ? Math.max(0, line.length - 1) * letterSpacing : 0;
        return base + spacing;
    }
    let maxWidth = 0;
    lines.forEach(line => {
        const w = measureLineWidth(line);
        if (w > maxWidth) maxWidth = w;
    });
    const pad = 8 + (layerStyle.strokeWidth || 0) * 2;
    const canvasW = Math.ceil(maxWidth + pad * 2);
    const canvasH = Math.ceil(lines.length * lineHeight + pad * 2);

    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvasW * scale;
    canvas.height = canvasH * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') {
        ctx.fillStyle = cs.backgroundColor;
        ctx.fillRect(0, 0, canvasW, canvasH);
    }
    ctx.font = fontStr;
    ctx.textBaseline = 'alphabetic';
    const fontAscent = (function(){
        try { const m = mctx.measureText('Hg'); return m.actualBoundingBoxAscent || (fontSize * 0.8); } catch(e){ return fontSize * 0.8; }
    })();
    ctx.textAlign = 'left';

    let fillStyle = layerStyle.fill || cs.color || '#ffffff';
    if (layerStyle.backgroundGradient) {
        const g = _parseLinearGradient(layerStyle.backgroundGradient);
        if (g) {
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

    if (layerStyle.shadow) {
        const firstShadow = layerStyle.shadow.split(/,(?![^(]*\))/)[0].trim();
        const sm = firstShadow.match(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px\s+(.+)/);
        if (sm) {
            ctx.shadowOffsetX = parseFloat(sm[1]);
            ctx.shadowOffsetY = parseFloat(sm[2]);
            ctx.shadowBlur = parseFloat(sm[3]);
            ctx.shadowColor = sm[4];
        }
    }

    lines.forEach((line, i) => {
        const w = measureLineWidth(line);
        let x = pad;
        if (align === 'center') x = pad + (maxWidth - w) / 2;
        else if (align === 'right') x = pad + (maxWidth - w);
        const y = pad + i * lineHeight;

        const chars = Array.from(line);
        let charX = x;
        chars.forEach((ch, ci) => {
            if (layerStyle.strokeWidth > 0) {
                if (layerStyle.stroke) {
                    ctx.lineWidth = layerStyle.strokeWidth * 2;
                    ctx.strokeStyle = layerStyle.stroke;
                    ctx.lineJoin = 'round';
                    ctx.strokeText(ch, charX, y);
                } else if (layerStyle.backgroundGradient) {
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
                        ctx.strokeText(ch, charX, y);
                    }
                }
            }

            ctx.fillStyle = fillStyle;
            ctx.fillText(ch, charX, y);

            charX += mctx.measureText(ch).width + (letterSpacing > 0 ? letterSpacing : 0);
        });
        const deco = cs.textDecorationLine || cs.textDecoration || '';
        if (deco && deco !== 'none') {
            const decoColor = cs.textDecorationColor || cs.color;
            const decoStyle = cs.textDecorationStyle || 'solid';
            ctx.strokeStyle = decoColor;
            ctx.lineWidth = 1.5;
            if (decoStyle === 'wavy') {
                const yBase = yBaseline + 2;
                ctx.beginPath();
                for (let xx = x; xx < x + w; xx += 4) {
                    const yy = yBase + Math.sin((xx - x) / 2) * 1.5;
                    xx === x ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
                }
                ctx.stroke();
            } else if (decoStyle === 'dotted') {
                for (let xx = x; xx < x + w; xx += 4) {
                    ctx.beginPath();
                    ctx.arc(xx, yBaseline + 2, 1, 0, Math.PI * 2);
                    ctx.fillStyle = decoColor;
                    ctx.fill();
                }
            } else if (decoStyle === 'double') {
                ctx.beginPath();
                ctx.moveTo(x, yBaseline + 1); ctx.lineTo(x + w, yBaseline + 1);
                ctx.moveTo(x, yBaseline + 4); ctx.lineTo(x + w, yBaseline + 4);
                ctx.stroke();
            } else {
                const yLine = deco.includes('line-through') ? (yBaseline - fontSize * 0.3) : (yBaseline + 2);
                ctx.beginPath();
                ctx.moveTo(x, yLine);
                ctx.lineTo(x + w, yLine);
                ctx.stroke();
            }
        }
    });

    const filterCss = cs.filter;
    if (filterCss && filterCss !== 'none') {
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

console.log('[Exporter] 第2批已接管：_drawTextToDataUrl');

// ============================================================
// 第 3 批-A：_isBgBoxEffectClass / isBgBoxLayer
// ============================================================

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
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[Exporter] 判断背景框特效失败', effectClass, e);
        return false;
    }
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

console.log('[Exporter] 第3批-A已接管：_isBgBoxEffectClass / isBgBoxLayer');

// ============================================================
// 第 3 批-B：_rasterizeByOffscreenHtml2Canvas
// ============================================================

async function _rasterizeByOffscreenHtml2Canvas(originalNode, clonedNode) {
    if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[Exporter] 等待字体 ready 失败', e);
        }
    }
    const measureNode = (originalNode.classList && originalNode.classList.contains('canvas-layer'))
        ? originalNode
        : (originalNode.closest('.canvas-layer') || originalNode);
    const ownW = measureNode.offsetWidth || 1;
    const ownH = measureNode.offsetHeight || 1;
    const backdrops = measureNode.querySelectorAll('.layer-backdrop');
    const prevOverflows = [];
    let overflowLeft = 0, overflowTop = 0, overflowRight = 0, overflowBottom = 0;
    backdrops.forEach(bd => {
        const bdLeft = parseFloat(bd.style.left) || 0;
        const bdTop = parseFloat(bd.style.top) || 0;
        const bdW = bd.offsetWidth || 0;
        const bdH = bd.offsetHeight || 0;
        if (bdW === 0 || bdH === 0) return;
        overflowLeft = Math.min(overflowLeft, bdLeft);
        overflowTop = Math.min(overflowTop, bdTop);
        overflowRight = Math.max(overflowRight, bdLeft + bdW);
        overflowBottom = Math.max(overflowBottom, bdTop + bdH);
        prevOverflows.push({ el: bd.parentElement, old: bd.parentElement.style.overflow });
        bd.parentElement.style.overflow = 'visible';
    });
    const boxLeft = Math.min(0, overflowLeft);
    const boxTop = Math.min(0, overflowTop);
    const boxRight = Math.max(ownW, overflowRight);
    const boxBottom = Math.max(ownH, overflowBottom);
    const w = Math.max(1, Math.round(boxRight - boxLeft));
    const h = Math.max(1, Math.round(boxBottom - boxTop));
    let dataUrl = '';
    const maskBackdrops = originalNode.querySelectorAll('.layer-backdrop');
    const prevBgSizes = [];
    maskBackdrops.forEach(bd => {
        const bs = bd.style.backgroundSize;
        if (bs && bs.includes('%')) {
            const parts = bs.split(/\s+/);
            const boxW = bd.offsetWidth;
            const boxH = bd.offsetHeight;
            const wPct = parseFloat(parts[0]) || 100;
            const hPct = parts[1] ? (parseFloat(parts[1]) || 100) : 100;
            prevBgSizes.push({ el: bd, old: bs });
            bd.style.backgroundSize = (boxW * wPct / 100) + 'px ' + (boxH * hPct / 100) + 'px';
        }
    });
    const prevTransform = measureNode.style.transform;
    const prevTransformOrigin = measureNode.style.transformOrigin;
    measureNode.style.transform = 'none';
    measureNode.style.transformOrigin = 'center center';
    try {
        const c = await html2canvas(measureNode, {
            scale: 2, backgroundColor: null, logging: false,
            useCORS: true, allowTaint: true,
            x: boxLeft,
            y: boxTop,
            width: w,
            height: h,
            onclone: (clonedDoc) => {
                clonedDoc.querySelectorAll('input[type="color"]').forEach(el => {
                    const span = clonedDoc.createElement('span');
                    span.style.cssText = el.style.cssText;
                    if (el.parentNode) el.parentNode.replaceChild(span, el);
                });
            }
        });
        dataUrl = c.toDataURL('image/png');
    } catch (e) {
        console.warn('离屏截图失败，退回原逻辑:', e);
        measureNode.style.transform = prevTransform;
        measureNode.style.transformOrigin = prevTransformOrigin;
        prevBgSizes.forEach(({ el, old }) => { el.style.backgroundSize = old; });
        prevOverflows.forEach(({ el, old }) => { el.style.overflow = old; });
        return;
    }
    measureNode.style.transform = prevTransform;
    measureNode.style.transformOrigin = prevTransformOrigin;
    prevBgSizes.forEach(({ el, old }) => { el.style.backgroundSize = old; });
    prevOverflows.forEach(({ el, old }) => { el.style.overflow = old; });
    if (!dataUrl) return;
    const isLayerNode = originalNode.classList && originalNode.classList.contains('canvas-layer');
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.width = w + 'px';
    img.style.height = h + 'px';
    img.style.display = 'block';
    img.style.objectFit = 'fill';
    img.crossOrigin = 'anonymous';
    img.dataset.offscreenRasterized = '1';
    if (isLayerNode) {
        const cs = window.getComputedStyle(originalNode);
        const baseLeftPx = parseFloat(originalNode.style.left || cs.left) || 0;
        const baseTopPx = parseFloat(originalNode.style.top || cs.top) || 0;
        img.style.position = 'absolute';
        img.style.left = (baseLeftPx + boxLeft) + 'px';
        img.style.top = (baseTopPx + boxTop) + 'px';
        img.style.marginLeft = '0px';
        img.style.marginTop = '0px';
        img.style.transformOrigin = originalNode.style.transformOrigin || cs.transformOrigin;
        img.style.opacity = originalNode.style.opacity || cs.opacity;
        img.style.zIndex = originalNode.style.zIndex || cs.zIndex;
        if (originalNode.classList) {
            originalNode.classList.forEach(cls => {
                if (cls === 'selected' || cls === 'editing') return;
                img.classList.add(cls);
            });
        }
    }
    if (clonedNode && clonedNode.parentNode) {
        clonedNode.parentNode.replaceChild(img, clonedNode);
    }
}

console.log('[Exporter] 第3批-B已接管：_rasterizeByOffscreenHtml2Canvas');

// ============================================================
// 第 4 批-A：_rasterizeTextNodeIntoClone / _rasterizeRiskyText / _invertCssColor
// ============================================================

function _rasterizeTextNodeIntoClone(originalNode, clonedNode, effectClass) {
    if (!originalNode || !clonedNode) return Promise.resolve();
    try {
        if (originalNode.querySelector('span, b, i, u, s, strong, em')) {
            return Promise.resolve();
        }
        const w = originalNode.offsetWidth || 0;
        const h = originalNode.offsetHeight || 0;
        if (w === 0 || h === 0) return Promise.resolve();

        let styleNode = originalNode;
        const innerSpan = originalNode.querySelector('span[data-effect-span], span[class*="eff"], span[class*="effect"]');
        if (innerSpan) styleNode = innerSpan;
        const computed = window.getComputedStyle(styleNode);
        const layerStyle = _parseEffectStyle(effectClass, computed);
        const dataUrl = _drawTextToDataUrl(originalNode, layerStyle);
        if (!dataUrl) return Promise.resolve();

        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.width = w + 'px';
        img.style.height = h + 'px';
        img.style.display = 'block';
        img.style.objectFit = 'contain';
        img.crossOrigin = 'anonymous';

        if (clonedNode.parentNode) {
            clonedNode.parentNode.replaceChild(img, clonedNode);
        }
        return Promise.resolve();
    } catch (e) {
        console.warn('rasterize text into clone failed:', e);
        return Promise.resolve();
    }
}

function _rasterizeRiskyText(originalNode, clonedNode, effectClass) {
    if (!originalNode || !clonedNode) return;
    if (originalNode.querySelector('span[data-effect-span]')) {
        return;
    }

    const layerEl = originalNode.closest('.canvas-layer');
    if (layerEl && layerEl.querySelector('.layer-backdrop')) {
        const clonedLayerEl = clonedNode.closest('.canvas-layer');
        if (clonedLayerEl) {
            _rasterizeTextNodeIntoClone(originalNode, clonedNode, effectClass);
            return _rasterizeByOffscreenHtml2Canvas(layerEl, clonedLayerEl);
        }
    }

    if (isBgBoxLayer(originalNode)) {
        return _rasterizeByOffscreenHtml2Canvas(originalNode, clonedNode);
    }

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

        clonedNode.parentNode.replaceChild(img, clonedNode);
    } catch (e) {
        console.warn('rasterize text failed:', e);
    }
}

function _invertCssColor(cssColor) {
    if (!cssColor || cssColor === 'transparent' || cssColor === 'rgba(0, 0, 0, 0)') {
        return cssColor || 'transparent';
    }
    const ctx = _invertCssColor._ctx || (_invertCssColor._ctx = (() => {
        const c = document.createElement('canvas');
        c.width = 1; c.height = 1;
        return c.getContext('2d');
    })());
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = cssColor;
    const resolved = ctx.fillStyle;
    if (resolved.startsWith('#')) {
        const r = parseInt(resolved.slice(1, 3), 16);
        const g = parseInt(resolved.slice(3, 5), 16);
        const b = parseInt(resolved.slice(5, 7), 16);
        const to2 = n => (255 - n).toString(16).padStart(2, '0');
        return '#' + to2(r) + to2(g) + to2(b);
    }
    const m = resolved.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)/);
    if (m) {
        const r = 255 - parseInt(m[1], 10);
        const g = 255 - parseInt(m[2], 10);
        const b = 255 - parseInt(m[3], 10);
        const a = m[4] !== undefined ? m[4] : 1;
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
    return cssColor;
}

console.log('[Exporter] 第4批-A已接管：_rasterizeTextNodeIntoClone / _rasterizeRiskyText / _invertCssColor');

// ============================================================
// 第 4 批-B：_buildOnCloneForExport
// ============================================================

function _buildOnCloneForExport(originalCanvasNode) {
    return async function (clonedDoc, clonedCanvasEl) {
        console.log('🎯 onclone 开始，clone 里 effect-span 数量:', clonedCanvasEl.querySelectorAll('.text-content-editable span[data-effect-span]').length);

        try {
            const origTextElsAll = originalCanvasNode.querySelectorAll('.text-content-editable');
            origTextElsAll.forEach(origEl => {
                const layerEl0 = origEl.closest('.canvas-layer');
                if (!layerEl0) return;
                const layerId0 = layerEl0.dataset.id;
                const clonedLayer0 = clonedCanvasEl.querySelector(`.canvas-layer[data-id="${layerId0}"]`);
                if (!clonedLayer0) return;
                const clonedTextEl0 = clonedLayer0.querySelector('.text-content-editable');
                if (!clonedTextEl0) return;

                const origSpans = origEl.querySelectorAll('span[data-effect-span]');
                const cloneSpans = clonedTextEl0.querySelectorAll('span[data-effect-span]');
                const sn = Math.min(origSpans.length, cloneSpans.length);
                for (let si = 0; si < sn; si++) {
                    const osp = origSpans[si];
                    const csp = cloneSpans[si];
                    const inlineStyle = osp.getAttribute('style') || '';
                    const cs = window.getComputedStyle(osp);
                    const hasInvert = /filter\s*:\s*invert\s*\(/i.test(inlineStyle) || /filter\s*:\s*invert\s*\(/i.test(cs.filter);
                    if (!hasInvert) continue;
                    const rawColor = osp.style.color || cs.color;
                    const rawBg = osp.style.background || osp.style.backgroundColor || cs.backgroundColor;
                    const invColor = _invertCssColor(rawColor);
                    const invBg = _invertCssColor(rawBg);
                    csp.style.setProperty('color', invColor, 'important');
                    csp.style.setProperty('-webkit-text-fill-color', invColor, 'important');
                    csp.style.setProperty('background-color', invBg, 'important');
                    csp.style.setProperty('background-image', 'none', 'important');
                    csp.style.setProperty('background-clip', 'border-box', 'important');
                    csp.style.setProperty('-webkit-background-clip', 'border-box', 'important');
                    csp.style.setProperty('filter', 'none', 'important');
                    csp.style.setProperty('padding', cs.padding, 'important');
                    const _padTop = parseFloat(cs.paddingTop) || 0;
                    const _padBottom = parseFloat(cs.paddingBottom) || 0;
                    const _disp = cs.display || '';
                    if (_disp === 'inline-block' && (_padTop > 0 || _padBottom > 0)) {
                        const _lift = Math.max(1, Math.round((_padTop + _padBottom) * 0.4));
                        csp.style.setProperty('vertical-align', '-' + _lift + 'px', 'important');
                    } else {
                        csp.style.setProperty('vertical-align', 'baseline', 'important');
                    }
                }
            });
        } catch (e) {
            console.warn('处理行内 invert 失败:', e);
        }

        try {
            const origTextElsAll2 = originalCanvasNode.querySelectorAll('.text-content-editable');
            origTextElsAll2.forEach(origEl => {
                const layerEl0 = origEl.closest('.canvas-layer');
                if (!layerEl0) return;
                const layerId0 = layerEl0.dataset.id;
                const clonedLayer0 = clonedCanvasEl.querySelector(`.canvas-layer[data-id="${layerId0}"]`);
                if (!clonedLayer0) return;
                const clonedTextEl0 = clonedLayer0.querySelector('.text-content-editable');
                if (!clonedTextEl0) return;
                const origSpans = origEl.querySelectorAll('span[data-effect-span]');
                const cloneSpans = clonedTextEl0.querySelectorAll('span[data-effect-span]');
                const sn2 = Math.min(origSpans.length, cloneSpans.length);
                for (let si = 0; si < sn2; si++) {
                    const osp = origSpans[si];
                    const csp = cloneSpans[si];
                    const cs2 = window.getComputedStyle(osp);
                    const disp2 = cs2.display || '';
                    const pTop = parseFloat(cs2.paddingTop) || 0;
                    const pBottom = parseFloat(cs2.paddingBottom) || 0;
                    const borderTop = parseFloat(cs2.borderTopWidth) || 0;
                    const borderBottom = parseFloat(cs2.borderBottomWidth) || 0;
                    if ((disp2 === 'inline-block') && (pTop + pBottom + borderTop + borderBottom > 0)) {
                        const lift = Math.max(1, Math.round((pTop + pBottom + borderTop + borderBottom) * 0.4));
                        csp.style.setProperty('vertical-align', '-' + lift + 'px', 'important');
                    } else if (disp2 === 'inline-block') {
                        csp.style.setProperty('vertical-align', 'baseline', 'important');
                    }
                }
            });
        } catch (e) {
            console.warn('inline-block padding 补偿失败:', e);
        }

        try {
            const origInlineEls = originalCanvasNode.querySelectorAll('.text-content-editable');
            origInlineEls.forEach(origEl => {
                const origSpans = origEl.querySelectorAll('span');
                if (!origSpans.length) return;
                const layerEl = origEl.closest('.canvas-layer');
                if (!layerEl) return;
                const layerId = layerEl.dataset.id;
                const clonedLayer = clonedCanvasEl.querySelector(`.canvas-layer[data-id="${layerId}"]`);
                if (!clonedLayer) return;
                const clonedTextEl = clonedLayer.querySelector('.text-content-editable');
                if (!clonedTextEl) return;
                const clonedSpans = clonedTextEl.querySelectorAll('span');
                for (let i = 0; i < Math.min(origSpans.length, clonedSpans.length); i++) {
                    const osp = origSpans[i];
                    const csp = clonedSpans[i];
                    const deco = (osp.style.textDecoration || '') + ' ' + (osp.style.textDecorationLine || '');
                    const hasWavy = /wavy/i.test(deco);
                    const hasStrike = /line-through/i.test(deco);
                    if (!hasWavy && !hasStrike) continue;
                    try {
                        const rect = osp.getBoundingClientRect();
                        const w = Math.max(1, Math.round(rect.width));
                        const cs = window.getComputedStyle(osp);
                        const fontSize = parseFloat(cs.fontSize) || 28;
                        const fontFamily = cs.fontFamily || 'sans-serif';
                        const fontWeight = cs.fontWeight || 'normal';
                        const fontStyle = cs.fontStyle || 'normal';
                        const color = cs.color || '#ffffff';
                        const lineColor = cs.textDecorationColor && cs.textDecorationColor !== 'currentcolor' ? cs.textDecorationColor : color;
                        const lineW = parseFloat(cs.textDecorationThickness) || 2;
                        const amp = Math.max(1, lineW * 0.8);
                        const measureCanvas = document.createElement('canvas');
                        const mctx = measureCanvas.getContext('2d');
                        mctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
                        const text = osp.innerText || '';
                        const m = mctx.measureText(text);
                        const asc = m.actualBoundingBoxAscent || (fontSize * 0.8);
                        const desc = m.actualBoundingBoxDescent || (fontSize * 0.2);
                        const extraTop = Math.ceil(fontSize * 0.15) + 2;
                        const glyphH = asc + desc;
                        const extraBottom = hasWavy ? Math.ceil(amp * 2 + lineW * 2 + 4) : 0;
                        const h = extraTop + glyphH + extraBottom;
                        const scale = 2;
                        const canvas = document.createElement('canvas');
                        canvas.width = w * scale;
                        canvas.height = h * scale;
                        const ctx = canvas.getContext('2d');
                        ctx.scale(scale, scale);
                        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
                        ctx.textBaseline = 'top';
                        ctx.fillStyle = color;
                        ctx.fillText(text, 0, extraTop);
                        ctx.strokeStyle = lineColor;
                        ctx.lineWidth = lineW;
                        const baselineY = extraTop + asc;
                        if (hasWavy) {
                            const yBase = baselineY + desc + amp + lineW * 0.5;
                            ctx.beginPath();
                            for (let x = 0; x < w; x += 1) {
                                const y = yBase + Math.sin(x / 2) * amp;
                                x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                            }
                            ctx.stroke();
                        }
                        if (hasStrike) {
                            const yStrike = baselineY - asc * 0.45;
                            ctx.beginPath();
                            ctx.moveTo(0, yStrike);
                            ctx.lineTo(w, yStrike);
                            ctx.stroke();
                        }
                        const dataUrl = canvas.toDataURL('image/png');
                        const img = document.createElement('img');
                        img.src = dataUrl;
                        img.style.width = w + 'px';
                        img.style.height = h + 'px';
                        img.style.display = 'inline-block';
                        img.style.verticalAlign = 'baseline';
                        img.style.marginBottom = (-(desc + extraBottom + 4)) + 'px';
                        if (csp.parentNode) csp.parentNode.replaceChild(img, csp);
                    } catch (e) {
                        console.warn('[InlineWavy] 栅格化失败:', e);
                    }
                }
            });
        } catch (e) {
            console.warn('[InlineWavy] 处理失败:', e);
        }

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
            try {
                const ret = _rasterizeRiskyText(origEl, clonedTextEl, layer.effectClass);
                if (ret && typeof ret.then === 'function') {
                    tasks.push(ret);
                }
            } catch (err) {
                console.warn('rasterize risky text failed:', err);
            }
        });
        if (tasks.length > 0) {
            await Promise.all(tasks.map(p => Promise.resolve(p).catch(err => {
                console.warn('rasterize task failed:', err);
            })));
        }
    };
}

console.log('[Exporter] 第4批-B已接管：_buildOnCloneForExport');

// ============================================================
// 第 5 批-A：exportElementToPNG
// ============================================================

function exportElementToPNG(canvasDOMNode, filename, scale) {
    const exportScale = (typeof scale === 'number' && scale > 0) ? scale : 2;
    return new Promise((resolve, reject) => {
        const _start = async () => {
        const guidesLayer = canvasDOMNode.querySelector('.custom-guides-layer');
        const snapLayer = canvasDOMNode.querySelector('.snap-lines-layer');
        const selectionBox = canvasDOMNode.querySelector('.selection-box');
        const handles = canvasDOMNode.querySelectorAll('.resize-handle, .edge-handle, .rotate-handle');
        const selectedLayers = [...canvasDOMNode.querySelectorAll('.canvas-layer.selected')];

        const toHide = [guidesLayer, snapLayer, selectionBox, ...handles].filter(Boolean);
        const prevDisplays = toHide.map(el => el.style.display);
        toHide.forEach(el => el.style.display = 'none');
        selectedLayers.forEach(el => el.classList.remove('selected'));

        const bgEl = canvasDOMNode.querySelector('.canvas-bg');
        const overlayEl = canvasDOMNode.querySelector('.canvas-bg-overlay');
        let bgReplaced = null;
        let overlayHidden = null;
        const _bgComposePromise = (async () => {
            if (!bgEl) return;
            try {
                const rect = bgEl.getBoundingClientRect();
                const W = Math.round(rect.width) || 360;
                const H = Math.round(rect.height) || 640;
                if (W <= 0 || H <= 0) return;

                const tempWrap = document.createElement('div');
                tempWrap.style.cssText = `position:fixed;left:-99999px;top:0;width:${W}px;height:${H}px;overflow:hidden;`;
                const bgClone = bgEl.cloneNode(true);
                bgClone.style.cssText = bgEl.style.cssText;
                const cs = window.getComputedStyle(bgEl);
                ['background','backgroundImage','backgroundSize','backgroundPosition','backgroundRepeat','backgroundColor','filter','transform','transformOrigin','opacity','inset','position','left','top','width','height'].forEach(p => {
                    try { bgClone.style.setProperty(p, cs.getPropertyValue(p)); } catch (e) {
                        if (window.Utils && Utils.log) Utils.log.warn('[Exporter] 复制背景样式失败', p, e);
                    }
                });
                bgClone.style.position = 'absolute';
                bgClone.style.left = '0';
                bgClone.style.top = '0';
                bgClone.style.width = W + 'px';
                bgClone.style.height = H + 'px';
                bgClone.style.visibility = 'visible';
                bgClone.style.zIndex = '0';
                tempWrap.appendChild(bgClone);

                if (overlayEl) {
                    const ovClone = overlayEl.cloneNode(true);
                    const ocs = window.getComputedStyle(overlayEl);
                    ovClone.style.cssText = overlayEl.style.cssText;
                    ['background','backgroundImage','opacity','inset','position','left','top','width','height'].forEach(p => {
                        try { ovClone.style.setProperty(p, ocs.getPropertyValue(p)); } catch (e) {
                            if (window.Utils && Utils.log) Utils.log.warn('[Exporter] 复制遮罩样式失败', p, e);
                        }
                    });
                    ovClone.style.position = 'absolute';
                    ovClone.style.left = '0';
                    ovClone.style.top = '0';
                    ovClone.style.width = W + 'px';
                    ovClone.style.height = H + 'px';
                    ovClone.style.zIndex = '1';
                    ovClone.style.pointerEvents = 'none';
                    tempWrap.appendChild(ovClone);
                }

                document.body.appendChild(tempWrap);
                await new Promise(r => requestAnimationFrame(r));

                const c = await html2canvas(tempWrap, {
                    scale: 1,
                    backgroundColor: null,
                    logging: false,
                    useCORS: true,
                    allowTaint: true,
                    width: W,
                    height: H,
                    onclone: (clonedDoc) => {
                        clonedDoc.querySelectorAll('input[type="color"]').forEach(el => {
                            const span = clonedDoc.createElement('span');
                            span.style.cssText = el.style.cssText;
                            if (el.parentNode) el.parentNode.replaceChild(span, el);
                        });
                    }
                });
                document.body.removeChild(tempWrap);

                const dataUrl = c.toDataURL('image/png');
                const imgEl = document.createElement('img');
                imgEl.src = dataUrl;
                imgEl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:fill;z-index:0;pointer-events:none;';
                imgEl.className = 'canvas-bg-composited';
                bgEl.parentNode.insertBefore(imgEl, bgEl);
                bgEl.style.visibility = 'hidden';
                if (overlayEl) {
                    overlayHidden = { el: overlayEl, prev: overlayEl.style.visibility };
                    overlayEl.style.visibility = 'hidden';
                }
                bgReplaced = { img: imgEl, orig: bgEl };
            } catch (e) {
                console.warn('导出背景合成失败:', e);
            }
        })();

        const pageWrapper = canvasDOMNode.closest('.canvas-page-wrapper');
        const hadActive = pageWrapper ? pageWrapper.classList.contains('active-page') : false;
        if (pageWrapper) pageWrapper.classList.remove('active-page');

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

        document.body.classList.add('exporting');

        const cleanup = () => {
            document.body.classList.remove('exporting');
            toHide.forEach((el, i) => { el.style.display = prevDisplays[i] || ''; });
            selectedLayers.forEach(el => el.classList.add('selected'));
            if (pageWrapper && hadActive) pageWrapper.classList.add('active-page');
            canvasDOMNode.style.border = orig.border;
            canvasDOMNode.style.borderColor = orig.borderColor;
            canvasDOMNode.style.boxShadow = orig.boxShadow;
            canvasDOMNode.style.borderRadius = orig.borderRadius;
            if (bgReplaced) {
                bgReplaced.orig.style.visibility = '';
                if (bgReplaced.img && bgReplaced.img.parentNode) bgReplaced.img.parentNode.removeChild(bgReplaced.img);
                bgReplaced = null;
            }
            if (overlayHidden) {
                overlayHidden.el.style.visibility = overlayHidden.prev || '';
                overlayHidden = null;
            }
        };

        await _bgComposePromise;

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
                clonedEl.querySelectorAll('.canvas-layer').forEach(el => {
                    el.classList.remove('selected');
                    el.style.background = 'transparent';
                    el.style.backgroundColor = 'transparent';
                    el.style.border = '1px solid transparent';
                    el.style.boxShadow = 'none';
                    el.style.outline = 'none';
                });
                clonedEl.querySelectorAll('.layer-fill').forEach(el => {
                    el.style.border = 'none';
                    el.style.boxShadow = 'none';
                    el.style.outline = 'none';
                });
                clonedDoc.querySelectorAll('input[type="color"]').forEach(el => {
                    const span = clonedDoc.createElement('span');
                    span.style.cssText = el.style.cssText;
                    if (el.parentNode) el.parentNode.replaceChild(span, el);
                });
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
        };
        _start();
    });
}

console.log('[Exporter] 第5批-A已接管：exportElementToPNG');

// ============================================================
// 第 5 批-B：导出面板
// 注意：let _exportScale = 2; 仍由 app.js 声明，本文件读写全局 _exportScale
// ============================================================

function openExportPanel() {
    const panel = document.getElementById('export-panel');
    if (!panel) return;
    const rangeCurrent = panel.querySelector('input[name="export-range"][value="current"]');
    if (rangeCurrent) rangeCurrent.checked = true;
    const scale3 = panel.querySelector('input[name="export-scale"][value="3"]');
    if (scale3) scale3.checked = true;
    const checkboxes = document.getElementById('export-page-checkboxes');
    if (checkboxes) checkboxes.style.display = 'none';
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
    window._exportScale = scale;
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
    // ✅ P1-2：导出前后背景重应用统一走 BG（若已收口则用命名空间）
    window.__reapplyBackground = function () {
        const applyBg = (window.BG && BG.applyBackgroundToCanvases) || window.applyBackgroundToCanvases;
        if (typeof applyBg === 'function' && window.state) {
            applyBg(state.background);
        }
    };
    const btnExport = document.getElementById('btn-export');
    if (btnExport) {
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

// ✅ P1-2：exporter.js 收口到 window.EXPORT
(function exposeExporterNamespace() {
    if (!window.EXPORT) return;
    EXPORT.exportElementToPNG = exportElementToPNG;
    EXPORT.openExportPanel = openExportPanel;
    EXPORT.closeExportPanel = closeExportPanel;
    EXPORT.runExportFromPanel = runExportFromPanel;
    EXPORT.initExportPanel = initExportPanel;
    EXPORT.exportAllPagesAsPNG = exportAllPagesAsPNG;
    console.log('[EXPORT] ✅ exporter.js 已收口到 window.EXPORT（' +
        Object.keys(EXPORT).length + ' 个函数）');
})();

console.log('[Exporter] 第5批-B已接管：导出面板');
console.log('[Exporter] ✅ 导出系统全部收口完成');