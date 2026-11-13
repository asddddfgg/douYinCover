// ============================================================
// exporter.js ?导出系统（P3：从 app.js 迁出?// 职责边界?//   ?负责：exportElementToPNG（html2canvas 导出核心?//            _buildOnCloneForExport（onclone 预处理：行内 invert / padding 补偿 / 波浪线栅格化 / risky 文字栅格化）
//            _needsRasterize / _parseEffectStyle / _parseLinearGradient / _drawTextToDataUrl /
//            _isBgBoxEffectClass / isBgBoxLayer / _rasterizeByOffscreenHtml2Canvas /
//            _rasterizeTextNodeIntoClone / _rasterizeRiskyText / _invertCssColor
//            导出面板：openExportPanel / closeExportPanel / runExportFromPanel / initExportPanel / exportAllPagesAsPNG
//   ?不负责：画布渲染（在 app.js ?renderCanvas?//   ?不负责：特效定义（在 effects.js?//   ?不负责：选区 / 字体 / 背景（各自模块）
// 依赖：state / html2canvas（CDN? getAllEffectsMaster / renderEffectCss 等全局
// 被依赖：app.js ?DOMContentLoaded ?initExportPanel()
//          app.js ?DOMContentLoaded 里保?initExportPanel() 调用（函数声明会提升到全局?// 加载顺序：必须晚?app.js（本文件函数声明覆盖 app.js 同名旧声明）
// ============================================================

window.__EXPORTER_READY__ = true;
console.log('[Exporter] module ready');

// ============================================================
// ?1 批：_needsRasterize / _parseEffectStyle / _parseLinearGradient
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

console.log('[Exporter] module ready');

// ============================================================
// ?2 批：_drawTextToDataUrl
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
    let fontWeight = cs.fontWeight || 'normal';
    let fontStyle = cs.fontStyle || 'normal';
    if (cs.fontSynthesis === 'none') {
        if (fontWeight === 'bold' || parseInt(fontWeight, 10) >= 600) fontWeight = 'normal';
        if (fontStyle === 'italic' || fontStyle === 'oblique') fontStyle = 'normal';
    }

    // Resolve the real font from layer data first, then ancestor chain, then computed style.
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

        // fallback: ancestor chain
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
    // Keep the canvas size aligned with the DOM text box; pad is compensated by negative margin.
    const elW = Math.max(1, el.offsetWidth || 0);
    const elH = Math.max(1, el.offsetHeight || 0);
    let shadowPad = 0;
    if (layerStyle.shadow) {
        const firstShadow = layerStyle.shadow.split(/,(?![^(]*\))/)[0].trim();
        const sm = firstShadow.match(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px\s+(.+)/);
        if (sm) shadowPad = Math.max(Math.abs(parseFloat(sm[1]) || 0), Math.abs(parseFloat(sm[2]) || 0)) + (parseFloat(sm[3]) || 0);
    }
    const pad = Math.ceil(8 + (layerStyle.strokeWidth || 0) * 2 + shadowPad);
    const contentW = Math.max(elW, Math.ceil(maxWidth));
    const contentH = Math.max(elH, Math.ceil(lines.length * lineHeight));
    const canvasW = Math.ceil(contentW + pad * 2);
    const canvasH = Math.ceil(contentH + pad * 2);

    const scale = _rasterScale();
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
    const fontMetrics = (function () {
        try { return mctx.measureText(lines[0] || '国'); } catch (e) { return null; }
    })();
    const fontAscent = fontMetrics && isFinite(fontMetrics.fontBoundingBoxAscent)
        ? fontMetrics.fontBoundingBoxAscent
        : (fontMetrics && isFinite(fontMetrics.actualBoundingBoxAscent)
            ? fontMetrics.actualBoundingBoxAscent
            : fontSize * 0.8);
    const fontDescent = fontMetrics && isFinite(fontMetrics.fontBoundingBoxDescent)
        ? fontMetrics.fontBoundingBoxDescent
        : (fontMetrics && isFinite(fontMetrics.actualBoundingBoxDescent)
            ? fontMetrics.actualBoundingBoxDescent
            : fontSize * 0.2);
    const halfLeading = (lineHeight - (fontAscent + fontDescent)) / 2;
    const firstBaseline = pad + halfLeading + fontAscent;
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
        if (align === 'center') x = pad + (contentW - w) / 2;
        else if (align === 'right') x = pad + (contentW - w);
        const y = firstBaseline + i * lineHeight;

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
            const decoColor = _spanColor(cs.textDecorationColor, cs.color);
            const decoStyle = cs.textDecorationStyle || 'solid';
            const decoOffset = _spanPx(cs.textUnderlineOffset);
            const decoThickness = _spanPx(cs.textDecorationThickness) || Math.max(1, fontSize / 16);
            const decoAmp = Math.max(1, decoThickness * 0.8);
            const solidCenter = y + decoOffset - fontSize * 0.033;
            const wavyCenter = y + fontSize * 0.06 + decoOffset;
            ctx.strokeStyle = decoColor;
            ctx.fillStyle = decoColor;
            ctx.lineWidth = decoThickness;
            if (decoStyle === 'wavy') {
                ctx.beginPath();
                let guard = 0;
                for (let xx = x; xx < x + w && guard < 20000; xx += 1, guard++) {
                    const yy = wavyCenter + Math.sin((xx - x) / 2) * decoAmp;
                    xx === x ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
                }
                ctx.stroke();
            } else if (decoStyle === 'dotted') {
                const step = Math.max(2, decoThickness * 2);
                let guard = 0;
                for (let xx = x; xx < x + w && guard < 20000; xx += step, guard++) {
                    ctx.beginPath();
                    ctx.arc(xx, solidCenter, Math.max(0.5, decoThickness / 2), 0, Math.PI * 2);
                    ctx.fill();
                }
            } else if (decoStyle === 'double') {
                ctx.beginPath();
                ctx.moveTo(x, solidCenter - decoThickness); ctx.lineTo(x + w, solidCenter - decoThickness);
                ctx.moveTo(x, solidCenter + decoThickness); ctx.lineTo(x + w, solidCenter + decoThickness);
                ctx.stroke();
            } else {
                const yLine = deco.includes('line-through') ? (y - fontSize * 0.36) : solidCenter;
                ctx.beginPath();
                ctx.moveTo(x, yLine);
                ctx.lineTo(x + w, yLine);
                ctx.stroke();
            }
        }
    });

    const rasterMeta = {
        width: canvasW,
        height: canvasH,
        pad: pad,
        contentW: contentW,
        contentH: contentH
    };
    window.__lastTextRasterMeta = rasterMeta;
    try {
        window.__effectRasterDebug = window.__effectRasterDebug || [];
        window.__effectRasterDebug.push({
            kind: 'drawText',
            fontSize: fontSize,
            lineHeight: lineHeight,
            fontAscent: fontAscent,
            fontDescent: fontDescent,
            halfLeading: halfLeading,
            pad: pad,
            firstBaseline: firstBaseline,
            elW: elW,
            elH: elH,
            lineCount: lines.length
        });
    } catch (e) { }

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

console.log('[Exporter] module ready');

// ============================================================
// ?3 ?A：_isBgBoxEffectClass / isBgBoxLayer
// ============================================================

function _isBgBoxEffectClass(effectClass) {
    // 判定逻辑唯一实现?effects.js ?isEffectBgBox（带 CSS 级缓存）
    if (!effectClass) return false;
    if (typeof window.isEffectBgBox === 'function') return window.isEffectBgBox(effectClass);
    return false;
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

console.log('[Exporter] module ready');

// ============================================================
// ?3 ?B：_rasterizeByOffscreenHtml2Canvas
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
            scale: _rasterScale(), backgroundColor: null, logging: false,
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

console.log('[Exporter] module ready');

// ============================================================
// ?4 ?A：_rasterizeTextNodeIntoClone / _rasterizeRiskyText / _invertCssColor
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
        const meta = window.__lastTextRasterMeta || {};
        window.__lastTextRasterMeta = null;

        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.width = (meta.width || w) + 'px';
        img.style.height = (meta.height || h) + 'px';
        img.style.marginLeft = (-(meta.pad || 0)) + 'px';
        img.style.marginTop = (-(meta.pad || 0)) + 'px';
        img.style.marginRight = (-(meta.pad || 0)) + 'px';
        img.style.marginBottom = (-(meta.pad || 0)) + 'px';
        img.style.display = 'block';
        img.style.objectFit = 'fill';
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
        const meta = window.__lastTextRasterMeta || {};
        window.__lastTextRasterMeta = null;

        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.width = (meta.width || originalNode.offsetWidth) + 'px';
        img.style.height = (meta.height || originalNode.offsetHeight) + 'px';
        img.style.marginLeft = (-(meta.pad || 0)) + 'px';
        img.style.marginTop = (-(meta.pad || 0)) + 'px';
        img.style.marginRight = (-(meta.pad || 0)) + 'px';
        img.style.marginBottom = (-(meta.pad || 0)) + 'px';
        img.style.display = 'block';
        img.style.objectFit = 'fill';
        img.crossOrigin = 'anonymous';

        try {
            window.__effectRasterDebug = window.__effectRasterDebug || [];
            const or = originalNode.getBoundingClientRect();
            const cr = clonedNode.getBoundingClientRect();
            window.__effectRasterDebug.push({
                kind: 'risky',
                effectClass: effectClass,
                origTop: or.top,
                cloneTop: cr.top,
                metaPad: meta.pad,
                metaW: meta.width,
                metaH: meta.height
            });
        } catch (e) { }

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

console.log('[Exporter] module ready');

// ============================================================
// ?4 ?B：行内特效栅格化（统一按“实测基?+ 自绘”输出）
// ============================================================

function _spanPx(v) {
    const n = parseFloat(v);
    return isFinite(n) ? n : 0;
}

// 取元素自身的 computedStyle（克隆节点可能在 html2canvas ?iframe 文档里）
function _getCS(el) {
    try {
        const view = (el.ownerDocument && el.ownerDocument.defaultView) || window;
        return view.getComputedStyle(el);
    } catch (e) {
        try { return window.getComputedStyle(el); } catch (e2) { return null; }
    }
}

// 行内/图层特效栅格化分辨率跟随导出倍率?~4x），避免 3x 导出?2x 图片拉糊
function _rasterScale() {
    const s = Number(window.__currentExportScale || window._exportScale) || 2;
    return Math.max(2, Math.min(4, s));
}

function _spanFinite(v, fallback) {
    return (typeof v === 'number' && isFinite(v)) ? v : fallback;
}

function _spanColor(c, fallback) {
    if (!c || c === 'currentcolor' || c === 'currentColor') return fallback;
    return c;
}

function _roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
}

function _firstTextShadow(cs) {
    const raw = cs.textShadow;
    if (!raw || raw === 'none') return null;
    const first = raw.split(/,(?![^(]*\))/)[0].trim();
    const m = first.match(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px\s+(.+)/);
    if (!m) return null;
    return {
        x: parseFloat(m[1]) || 0,
        y: parseFloat(m[2]) || 0,
        blur: parseFloat(m[3]) || 0,
        color: m[4]
    };
}

// 用零?inline-block 探针量出“span 边框盒顶??文字基线”的真实距离
function _measureSpanBaseline(sp) {
    let marker = null;
    try {
        marker = document.createElement('i');
        marker.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;';
        sp.appendChild(marker);
        const sr = sp.getBoundingClientRect();
        const mr = marker.getBoundingClientRect();
        const value = mr.bottom - sr.top;
        marker.remove();
        return isFinite(value) ? value : null;
    } catch (e) {
        if (marker && marker.parentNode) marker.parentNode.removeChild(marker);
        return null;
    }
}

function _spanHasLocalShadowOrStroke(sp, cs) {
    try {
        const parent = sp.parentElement;
        const pcs = parent ? window.getComputedStyle(parent) : null;
        const ts = cs.textShadow || 'none';
        const pts = pcs ? (pcs.textShadow || 'none') : 'none';
        if (ts !== pts) return true;
        const sw = _spanPx(cs.webkitTextStrokeWidth);
        const psw = pcs ? _spanPx(pcs.webkitTextStrokeWidth) : 0;
        if (sw !== psw) return true;
        return false;
    } catch (e) {
        return true;
    }
}

function _isSimpleBorderBottomSpan(sp) {
    try {
        const cs = _getCS(sp);
        const otherSides = ['Top', 'Right', 'Left'];
        if (otherSides.some(side => {
            const w = _spanPx(cs['border' + side + 'Width']);
            const st = cs['border' + side + 'Style'];
            return w > 0 && st && st !== 'none';
        })) return false;
        const bb = _spanPx(cs.borderBottomWidth);
        if (!(bb > 0) || !cs.borderBottomStyle || cs.borderBottomStyle === 'none') return false;
        if (cs.backgroundColor && cs.backgroundColor !== 'transparent' && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') return false;
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return false;
        if ((cs.textDecorationLine || 'none') !== 'none') return false;
        if (_spanHasLocalShadowOrStroke(sp, cs)) return false;
        if (cs.filter && cs.filter !== 'none') return false;
        return true;
    } catch (e) {
        return false;
    }
}

// 跨行/单行下划线：保留文字，只按每?client rect 补一条绝对定位线
function _decorateBorderBottomInClone(osp, csp, clonedTextEl) {
    try {
        if (!osp || !csp || !clonedTextEl) return false;
        const cs = _getCS(osp);
        const bw = _spanPx(cs.borderBottomWidth);
        if (!(bw > 0)) return false;
        const color = _spanColor(cs.borderBottomColor, cs.color);
        const rects = Array.from(osp.getClientRects()).filter(r => r.width > 0 && r.height > 0);
        if (!rects.length) return false;
        const originEl = osp.closest('.text-content-editable') || clonedTextEl;
        const teRect = originEl.getBoundingClientRect();
        const teCs = _getCS(clonedTextEl);
        if (teCs.position === 'static') clonedTextEl.style.position = 'relative';
        csp.style.setProperty('border-bottom', 'none', 'important');
        csp.style.setProperty('padding-bottom', '0px', 'important');
        rects.forEach(rect => {
            const line = document.createElement('div');
            line.setAttribute('data-export-underline', '1');
            line.style.cssText =
                'position:absolute;pointer-events:none;z-index:3;' +
                'left:' + (rect.left - teRect.left) + 'px;' +
                'top:' + (rect.bottom - teRect.top - bw) + 'px;' +
                'width:' + rect.width + 'px;' +
                'height:' + bw + 'px;' +
                'background:' + color + ';';
            clonedTextEl.appendChild(line);
        });
        return true;
    } catch (e) {
        return false;
    }
}

function _isSimpleTextDecorationSpan(sp) {
    try {
        const cs = _getCS(sp);
        const deco = cs.textDecorationLine || 'none';
        if (!/underline|line-through/.test(deco)) return false;
        if (cs.writingMode && /^vertical/.test(cs.writingMode)) return false;
        const layer = sp.closest('.canvas-layer');
        if (layer) {
            const lcs = window.getComputedStyle(layer);
            if (lcs.transform && lcs.transform !== 'none') return false;
        }
        const sides = ['Top', 'Right', 'Bottom', 'Left'];
        if (sides.some(side => {
            const w = _spanPx(cs['border' + side + 'Width']);
            const st = cs['border' + side + 'Style'];
            return w > 0 && st && st !== 'none';
        })) return false;
        if (cs.backgroundColor && cs.backgroundColor !== 'transparent' && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') return false;
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return false;
        if (_spanHasLocalShadowOrStroke(sp, cs)) return false;
        if (cs.filter && cs.filter !== 'none') return false;
        if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') return false;
        return true;
    } catch (e) {
        return false;
    }
}

// 简单下划线/删除线：保留文字，按每个行片段补线（波浪用密集圆点近似）
function _decorateTextDecorationInClone(osp, csp, clonedTextEl) {
    try {
        if (!osp || !csp || !clonedTextEl) return false;
        const cs = _getCS(osp);
        const deco = cs.textDecorationLine || '';
        if (!/underline|line-through/.test(deco)) return false;
        const rects = Array.from(osp.getClientRects()).filter(r => r.width > 0 && r.height > 0);
        if (!rects.length) return false;
        const fontSize = parseFloat(cs.fontSize) || 16;
        const fontFamily = cs.fontFamily || 'sans-serif';
        const fontWeight = cs.fontWeight || 'normal';
        const fontStyle = cs.fontStyle || 'normal';
        const mctx = document.createElement('canvas').getContext('2d');
        mctx.font = fontStyle + ' ' + fontWeight + ' ' + fontSize + 'px ' + fontFamily;
        const fm = mctx.measureText(osp.textContent || '国');
        const fontAsc = _spanFinite(fm.fontBoundingBoxAscent,
            _spanFinite(fm.actualBoundingBoxAscent, fontSize * 0.8));
        const thickness = _spanPx(cs.textDecorationThickness) || Math.max(1, fontSize / 16);
        const offset = _spanPx(cs.textUnderlineOffset);
        const color = _spanColor(cs.textDecorationColor, cs.color);
        const decoStyle = cs.textDecorationStyle || 'solid';
        const originEl = osp.closest('.text-content-editable') || clonedTextEl;
        const teRect = originEl.getBoundingClientRect();
        const teCs = _getCS(clonedTextEl);
        if (teCs.position === 'static') clonedTextEl.style.position = 'relative';
        csp.style.setProperty('text-decoration', 'none', 'important');

        const addLine = (left, width, center, wavy) => {
            if (wavy) {
                if (width <= 0) return;
                const amp = Math.max(1, thickness * 0.8);
                const hCss = amp * 2 + thickness;
                const scale = _rasterScale();
                const cw = Math.max(1, Math.round(width * scale));
                const ch = Math.max(1, Math.round(hCss * scale));
                const wc = document.createElement('canvas');
                wc.width = cw;
                wc.height = ch;
                const g = wc.getContext('2d');
                g.scale(scale, scale);
                g.strokeStyle = color;
                g.lineWidth = thickness;
                g.lineCap = 'round';
                g.beginPath();
                for (let x = 0; x <= width; x += 1) {
                    const y = hCss / 2 + Math.sin(x / 2) * amp;
                    if (x === 0) g.moveTo(x, y);
                    else g.lineTo(x, y);
                }
                g.stroke();
                const line = document.createElement('div');
                line.style.cssText =
                    'position:absolute;pointer-events:none;z-index:3;' +
                    'left:' + left + 'px;' +
                    'top:' + (center - teRect.top - hCss / 2) + 'px;' +
                    'width:' + width + 'px;height:' + hCss + 'px;' +
                    'background-image:url(' + wc.toDataURL('image/png') + ');' +
                    'background-repeat:no-repeat;background-size:' + width + 'px ' + hCss + 'px;';
                clonedTextEl.appendChild(line);
            } else {
                const line = document.createElement('div');
                line.style.cssText =
                    'position:absolute;pointer-events:none;z-index:3;' +
                    'left:' + left + 'px;' +
                    'top:' + (center - teRect.top - thickness / 2) + 'px;' +
                    'width:' + width + 'px;height:' + thickness + 'px;' +
                    'background:' + color + ';';
                clonedTextEl.appendChild(line);
            }
        };

        rects.forEach(rect => {
            const left = rect.left - teRect.left;
            const width = rect.width;
            const baseline = rect.top + fontAsc;
            if (/underline/.test(deco)) {
                const center = baseline + (decoStyle === 'wavy'
                    ? fontSize * 0.06 + offset
                    : offset - fontSize * 0.033);
                addLine(left, width, center, decoStyle === 'wavy');
            }
            if (/line-through/.test(deco)) {
                addLine(left, width, baseline - fontSize * 0.36, decoStyle === 'wavy');
            }
        });
        return true;
    } catch (e) {
        return false;
    }
}

function _isSimpleBackgroundSpan(sp) {
    try {
        const cs = _getCS(sp);
        if ((cs.textDecorationLine || 'none') !== 'none') return false;
        const sides = ['Top', 'Right', 'Bottom', 'Left'];
        if (sides.some(side => {
            const w = _spanPx(cs['border' + side + 'Width']);
            const st = cs['border' + side + 'Style'];
            return w > 0 && st && st !== 'none';
        })) return false;
        const bg = cs.backgroundColor && cs.backgroundColor !== 'transparent' && cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
        const bgImg = cs.backgroundImage && cs.backgroundImage !== 'none';
        if (!bg && !bgImg) return false;
        if (_spanHasLocalShadowOrStroke(sp, cs)) return false;
        if (cs.filter && cs.filter !== 'none') return false;
        if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') return false;
        return true;
    } catch (e) {
        return false;
    }
}

function _decorateBackgroundInClone(osp, csp, clonedTextEl) {
    try {
        const cs = _getCS(osp);
        const rects = Array.from(osp.getClientRects()).filter(r => r.width > 0 && r.height > 0);
        if (!rects.length) return false;
        const originEl = osp.closest('.text-content-editable') || clonedTextEl;
        const teRect = originEl.getBoundingClientRect();
        const teCs = _getCS(clonedTextEl);
        if (teCs.position === 'static') clonedTextEl.style.position = 'relative';
        if (!clonedTextEl.style.zIndex) clonedTextEl.style.zIndex = '1';
        const radius = Math.max(
            _spanPx(cs.borderTopLeftRadius),
            _spanPx(cs.borderTopRightRadius),
            _spanPx(cs.borderBottomRightRadius),
            _spanPx(cs.borderBottomLeftRadius)
        );
        const bg = cs.backgroundColor;
        const bgImg = cs.backgroundImage;
        csp.style.setProperty('background-color', 'transparent', 'important');
        csp.style.setProperty('background-image', 'none', 'important');
        rects.forEach(rect => {
            const div = document.createElement('div');
            let css = 'position:absolute;pointer-events:none;z-index:-1;box-sizing:border-box;' +
                'left:' + (rect.left - teRect.left) + 'px;' +
                'top:' + (rect.top - teRect.top) + 'px;' +
                'width:' + rect.width + 'px;height:' + rect.height + 'px;' +
                'border-radius:' + radius + 'px;';
            if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') css += 'background-color:' + bg + ';';
            if (bgImg && bgImg !== 'none') {
                css += 'background-image:' + bgImg + ';' +
                    'background-size:' + (cs.backgroundSize || 'auto') + ';' +
                    'background-position:' + (cs.backgroundPosition || '0% 0%') + ';' +
                    'background-repeat:' + (cs.backgroundRepeat || 'repeat') + ';';
            }
            div.style.cssText = css;
            clonedTextEl.appendChild(div);
        });
        return true;
    } catch (e) {
        return false;
    }
}

function _isSimpleBorderBoxSpan(sp) {
    try {
        const cs = _getCS(sp);
        if ((cs.textDecorationLine || 'none') !== 'none') return false;
        const sides = ['Top', 'Right', 'Bottom', 'Left'];
        const any = sides.some(side => {
            const w = _spanPx(cs['border' + side + 'Width']);
            const st = cs['border' + side + 'Style'];
            return w > 0 && st && st !== 'none';
        });
        if (!any) return false;
        if (_spanHasLocalShadowOrStroke(sp, cs)) return false;
        if (cs.filter && cs.filter !== 'none') return false;
        if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') return false;
        return true;
    } catch (e) {
        return false;
    }
}

function _decorateBorderBoxInClone(osp, csp, clonedTextEl) {
    try {
        const cs = _getCS(osp);
        const rects = Array.from(osp.getClientRects()).filter(r => r.width > 0 && r.height > 0);
        if (!rects.length) return false;
        const originEl = osp.closest('.text-content-editable') || clonedTextEl;
        const teRect = originEl.getBoundingClientRect();
        const teCs = _getCS(clonedTextEl);
        if (teCs.position === 'static') clonedTextEl.style.position = 'relative';
        if (!clonedTextEl.style.zIndex) clonedTextEl.style.zIndex = '1';
        const radius = Math.max(
            _spanPx(cs.borderTopLeftRadius),
            _spanPx(cs.borderTopRightRadius),
            _spanPx(cs.borderBottomRightRadius),
            _spanPx(cs.borderBottomLeftRadius)
        );
        const bw = Math.max(
            _spanPx(cs.borderTopWidth),
            _spanPx(cs.borderRightWidth),
            _spanPx(cs.borderBottomWidth),
            _spanPx(cs.borderLeftWidth)
        ) || 1;
        const color = _spanColor(cs.borderTopColor, cs.color);
        const bg = cs.backgroundColor;
        const bgImg = cs.backgroundImage;
        csp.style.setProperty('border-color', 'transparent', 'important');
        csp.style.setProperty('background-color', 'transparent', 'important');
        csp.style.setProperty('background-image', 'none', 'important');
        rects.forEach(rect => {
            if (bg || bgImg) {
                const fill = document.createElement('div');
                let fcss = 'position:absolute;pointer-events:none;z-index:-1;box-sizing:border-box;' +
                    'left:' + (rect.left - teRect.left) + 'px;' +
                    'top:' + (rect.top - teRect.top) + 'px;' +
                    'width:' + rect.width + 'px;height:' + rect.height + 'px;' +
                    'border-radius:' + radius + 'px;';
                if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') fcss += 'background-color:' + bg + ';';
                if (bgImg && bgImg !== 'none') fcss += 'background-image:' + bgImg + ';';
                fill.style.cssText = fcss;
                clonedTextEl.appendChild(fill);
            }
            const bd = document.createElement('div');
            bd.style.cssText =
                'position:absolute;pointer-events:none;z-index:2;box-sizing:border-box;' +
                'left:' + (rect.left - teRect.left) + 'px;' +
                'top:' + (rect.top - teRect.top) + 'px;' +
                'width:' + rect.width + 'px;height:' + rect.height + 'px;' +
                'border:' + bw + 'px solid ' + color + ';' +
                'border-radius:' + radius + 'px;';
            clonedTextEl.appendChild(bd);
        });
        return true;
    } catch (e) {
        return false;
    }
}

function _isSimpleStrokeSpan(sp) {
    try {
        const cs = _getCS(sp);
        if (!(_spanPx(cs.webkitTextStrokeWidth) > 0)) return false;
        if ((cs.textDecorationLine || 'none') !== 'none') return false;
        const sides = ['Top', 'Right', 'Bottom', 'Left'];
        if (sides.some(side => {
            const w = _spanPx(cs['border' + side + 'Width']);
            const st = cs['border' + side + 'Style'];
            return w > 0 && st && st !== 'none';
        })) return false;
        if (cs.backgroundColor && cs.backgroundColor !== 'transparent' && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') return false;
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return false;
        if (cs.filter && cs.filter !== 'none') return false;
        if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') return false;
        return true;
    } catch (e) {
        return false;
    }
}

function _decorateStrokeInClone(osp, csp) {
    try {
        const cs = _getCS(osp);
        const w = _spanPx(cs.webkitTextStrokeWidth);
        if (!(w > 0)) return false;
        const color = _spanColor(cs.webkitTextStrokeColor, cs.color);
        const shadows = [];
        const dirs = [[-w, 0], [w, 0], [0, -w], [0, w], [-w, -w], [w, -w], [-w, w], [w, w]];
        dirs.forEach(([dx, dy]) => shadows.push(dx + 'px ' + dy + 'px 0 ' + color));
        const existing = cs.textShadow && cs.textShadow !== 'none' ? cs.textShadow + ',' : '';
        csp.style.setProperty('-webkit-text-stroke', '0px transparent', 'important');
        csp.style.setProperty('text-shadow', existing + shadows.join(','), 'important');
        return true;
    } catch (e) {
        return false;
    }
}

function _shouldRasterizeInlineSpan(sp) {
    if (!sp || !sp.parentNode || !sp.closest('.canvas-layer')) return false;
    if (sp.children && sp.children.length > 0) return false;
    const text = sp.textContent || '';
    if (!text || !text.trim()) return false;
    if (text.indexOf('\n') >= 0) return false;
    let rects = null;
    try { rects = sp.getClientRects(); } catch (e) { rects = null; }
    if (!rects || rects.length !== 1) return false;
    const cs = _getCS(sp);
    if (/invert\s*\(/i.test(cs.filter || '')) return false;
    // Gradient text / filters are left to html2canvas or layer effects.
    if (cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text') return false;
    if (cs.webkitTextFillColor === 'transparent' || cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)') return false;
    if (cs.filter && cs.filter !== 'none') return false;
    if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') return false;
    const sides = ['Top', 'Right', 'Bottom', 'Left'];
    const hasBorder = sides.some(side => {
        const w = _spanPx(cs['border' + side + 'Width']);
        const st = cs['border' + side + 'Style'];
        return w > 0 && st && st !== 'none';
    });
    const bg = cs.backgroundColor && cs.backgroundColor !== 'transparent' && cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
    const bgImg = cs.backgroundImage && cs.backgroundImage !== 'none';
    const deco = (cs.textDecorationLine || 'none') !== 'none';
    const strokeW = _spanPx(cs.webkitTextStrokeWidth);
    const shadow = cs.textShadow && cs.textShadow !== 'none';
    if (_isSimpleBorderBottomSpan(sp)) return false;
    if (_isSimpleTextDecorationSpan(sp)) return false;
    if (_isSimpleBackgroundSpan(sp)) return false;
    if (_isSimpleBorderBoxSpan(sp)) return false;
    if (_isSimpleStrokeSpan(sp)) return false;
    return hasBorder || bg || bgImg || deco || strokeW > 0 || !!shadow;
}

function _renderInlineSpanToImage(sp) {
    const cs = _getCS(sp);
    const fillColor = _spanColor(cs.webkitTextFillColor, cs.color) || cs.color;
    const rect = sp.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const boxH = Math.max(1, Math.round(rect.height));
    const text = sp.textContent || '';
    if (!text) return null;

    const fontSize = parseFloat(cs.fontSize) || 16;
    const fontFamily = cs.fontFamily || 'sans-serif';
    let fontWeight = cs.fontWeight || 'normal';
    let fontStyle = cs.fontStyle || 'normal';
    if (cs.fontSynthesis === 'none') {
        if (fontWeight === 'bold' || parseInt(fontWeight, 10) >= 600) fontWeight = 'normal';
        if (fontStyle === 'italic' || fontStyle === 'oblique') fontStyle = 'normal';
    }
    const fontStr = fontStyle + ' ' + fontWeight + ' ' + fontSize + 'px ' + fontFamily;
    const letterSpacing = _spanPx(cs.letterSpacing);

    const measureCanvas = document.createElement('canvas');
    const mctx = measureCanvas.getContext('2d');
    mctx.font = fontStr;
    const fullMeasure = mctx.measureText(text);
    const chars = Array.from(text);
    const inkAsc = _spanFinite(fullMeasure.actualBoundingBoxAscent, fontSize * 0.8);
    const inkDesc = _spanFinite(fullMeasure.actualBoundingBoxDescent, fontSize * 0.2);
    const fontAsc = _spanFinite(fullMeasure.fontBoundingBoxAscent, inkAsc);
    const fontDesc = _spanFinite(fullMeasure.fontBoundingBoxDescent, inkDesc);
    let textW = fullMeasure.width;
    if (letterSpacing && chars.length > 1) textW += (chars.length - 1) * letterSpacing;

    // 真实基线：优先用探针实测，拿不到再用字体度量兜底
    let baseline = _measureSpanBaseline(sp);
    if (baseline === null || !isFinite(baseline)) {
        const lineHeightPx = parseFloat(cs.lineHeight);
        const lh = isFinite(lineHeightPx) && lineHeightPx > 0 ? lineHeightPx : fontSize * 1.2;
        baseline = _spanPx(cs.borderTopWidth) + _spanPx(cs.paddingTop) +
            (lh - (fontAsc + fontDesc)) / 2 + fontAsc;
    }

    const borderTop = _spanPx(cs.borderTopWidth);
    const borderRight = _spanPx(cs.borderRightWidth);
    const borderBottom = _spanPx(cs.borderBottomWidth);
    const borderLeft = _spanPx(cs.borderLeftWidth);
    const padTop = _spanPx(cs.paddingTop);
    const padRight = _spanPx(cs.paddingRight);
    const padBottom = _spanPx(cs.paddingBottom);
    const padLeft = _spanPx(cs.paddingLeft);

    const decoLineRaw = cs.textDecorationLine || 'none';
    const hasWavy = /wavy/i.test(cs.textDecorationStyle || '') &&
        /underline|line-through/i.test(decoLineRaw);
    const decoThickness = _spanPx(cs.textDecorationThickness) || Math.max(1, fontSize / 16);
    const decoAmp = Math.max(1, decoThickness * 0.8);
    const underlineOffset = _spanPx(cs.textUnderlineOffset);
    const underlineCenter = baseline + (hasWavy
        ? fontSize * 0.06 + underlineOffset
        : underlineOffset - fontSize * 0.033);
    const strikeCenter = baseline - fontSize * 0.36;

    let decoBottom = baseline + fontDesc;
    if (/underline/i.test(decoLineRaw)) {
        decoBottom = Math.max(decoBottom, underlineCenter + (hasWavy ? decoAmp + decoThickness / 2 : decoThickness / 2));
    }
    if (/line-through/i.test(decoLineRaw)) {
        decoBottom = Math.max(decoBottom, strikeCenter + decoThickness / 2);
    }
    const shadow = _firstTextShadow(cs);
    if (shadow) {
        decoBottom = Math.max(decoBottom, baseline + inkDesc + shadow.y + shadow.blur);
    }
    const extraBottom = Math.max(0, Math.ceil(decoBottom - boxH) + 2);
    const imgH = boxH + extraBottom;
    const scale = _rasterScale();

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(imgH * scale));
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    // ---- 背景 ----
    const radius = Math.max(
        _spanPx(cs.borderTopLeftRadius),
        _spanPx(cs.borderTopRightRadius),
        _spanPx(cs.borderBottomRightRadius),
        _spanPx(cs.borderBottomLeftRadius)
    );
    const bgColor = cs.backgroundColor;
    const bgImage = cs.backgroundImage;
    let painted = false;
    if (bgImage && bgImage !== 'none') {
        const g = (typeof _parseLinearGradient === 'function') ? _parseLinearGradient(bgImage) : null;
        if (g) {
            const rad = (g.angleDeg - 90) * Math.PI / 180;
            const cx = w / 2, cy = boxH / 2;
            const len = Math.abs(w * Math.cos(rad)) + Math.abs(boxH * Math.sin(rad));
            const grad = ctx.createLinearGradient(
                cx - Math.cos(rad) * len / 2, cy - Math.sin(rad) * len / 2,
                cx + Math.cos(rad) * len / 2, cy + Math.sin(rad) * len / 2
            );
            g.stops.forEach(s => grad.addColorStop(s.pos, s.color));
            _roundRectPath(ctx, 0, 0, w, boxH, radius);
            ctx.fillStyle = grad;
            ctx.fill();
            painted = true;
        }
    }
    if (!painted && bgColor && bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)') {
        _roundRectPath(ctx, 0, 0, w, boxH, radius);
        ctx.fillStyle = bgColor;
        ctx.fill();
    }

    // ---- 边框 ----
    const hasTopBorder = borderTop > 0 && cs.borderTopStyle !== 'none';
    const hasRightBorder = borderRight > 0 && cs.borderRightStyle !== 'none';
    const hasBottomBorder = borderBottom > 0 && cs.borderBottomStyle !== 'none';
    const hasLeftBorder = borderLeft > 0 && cs.borderLeftStyle !== 'none';
    const fullBorder = hasTopBorder && hasRightBorder && hasBottomBorder && hasLeftBorder;
    if (fullBorder) {
        const bw = Math.max(borderTop, borderRight, borderBottom, borderLeft);
        _roundRectPath(ctx, bw / 2, bw / 2, w - bw, boxH - bw, Math.max(0, radius - bw / 2));
        ctx.lineWidth = bw;
        ctx.strokeStyle = _spanColor(cs.borderTopColor, cs.color);
        ctx.stroke();
    } else {
        if (hasTopBorder) {
            ctx.fillStyle = _spanColor(cs.borderTopColor, cs.color);
            ctx.fillRect(0, 0, w, borderTop);
        }
        if (hasBottomBorder) {
            ctx.fillStyle = _spanColor(cs.borderBottomColor, cs.color);
            ctx.fillRect(0, boxH - borderBottom, w, borderBottom);
        }
        if (hasLeftBorder) {
            ctx.fillStyle = _spanColor(cs.borderLeftColor, cs.color);
            ctx.fillRect(0, 0, borderLeft, boxH);
        }
        if (hasRightBorder) {
            ctx.fillStyle = _spanColor(cs.borderRightColor, cs.color);
            ctx.fillRect(w - borderRight, 0, borderRight, boxH);
        }
    }

    // ---- 文字 ----
    ctx.font = fontStr;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = fillColor;
    ctx.lineJoin = 'round';
    if (shadow) {
        ctx.shadowColor = shadow.color;
        ctx.shadowOffsetX = shadow.x;
        ctx.shadowOffsetY = shadow.y;
        ctx.shadowBlur = shadow.blur;
    }

    const innerLeft = borderLeft + padLeft;
    const innerW = w - borderLeft - borderRight - padLeft - padRight;
    let textX = innerLeft;
    if (cs.textAlign === 'center') textX = innerLeft + (innerW - textW) / 2;
    else if (cs.textAlign === 'right') textX = innerLeft + innerW - textW;

    const strokeW = _spanPx(cs.webkitTextStrokeWidth);
    function paintText(mode) {
        let xx = textX;
        for (let i = 0; i < chars.length; i++) {
            const ch = chars[i];
            if (mode === 'stroke') ctx.strokeText(ch, xx, baseline);
            else ctx.fillText(ch, xx, baseline);
            xx += mctx.measureText(ch).width + letterSpacing;
        }
    }
    if (strokeW > 0) {
        ctx.lineWidth = strokeW;
        ctx.strokeStyle = _spanColor(cs.webkitTextStrokeColor, cs.color);
        paintText('stroke');
    }
    ctx.fillStyle = fillColor;
    paintText('fill');
    if (shadow) {
        ctx.shadowColor = 'transparent';
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.shadowBlur = 0;
    }

    // ---- 文本装饰?----
    const decoColor = _spanColor(cs.textDecorationColor, cs.color);
    const decoStart = textX;
    const decoEnd = textX + textW;
    const decoStyle = cs.textDecorationStyle || 'solid';
    function drawDeco(center) {
        if (decoEnd <= decoStart) return;
        if (!isFinite(decoStart) || !isFinite(decoEnd) || !isFinite(center)) return;
        ctx.strokeStyle = decoColor;
        ctx.fillStyle = decoColor;
        ctx.lineWidth = decoThickness;
        if (decoStyle === 'wavy') {
            ctx.beginPath();
            let guard = 0;
            for (let x = decoStart; x <= decoEnd && guard < 20000; x += 1, guard++) {
                const y = center + Math.sin((x - decoStart) / 2) * decoAmp;
                if (x === decoStart) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        } else if (decoStyle === 'dotted') {
            const step = Math.max(2, decoThickness * 2);
            let guard = 0;
            for (let x = decoStart; x <= decoEnd && guard < 20000; x += step, guard++) {
                ctx.beginPath();
                ctx.arc(x, center, Math.max(0.5, decoThickness / 2), 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (decoStyle === 'double') {
            ctx.beginPath();
            ctx.moveTo(decoStart, center - decoThickness);
            ctx.lineTo(decoEnd, center - decoThickness);
            ctx.moveTo(decoStart, center + decoThickness);
            ctx.lineTo(decoEnd, center + decoThickness);
            ctx.stroke();
        } else {
            ctx.fillRect(decoStart, center - decoThickness / 2, decoEnd - decoStart, decoThickness);
        }
    }
    if (/underline/i.test(decoLineRaw)) drawDeco(underlineCenter);
    if (/line-through/i.test(decoLineRaw)) drawDeco(strikeCenter);

    return {
        dataUrl: canvas.toDataURL('image/png'),
        width: w,
        height: imgH,
        baseline: baseline
    };
}

function _findClonedLayer(root, layerId) {
    if (!root) return null;
    try {
        if (root.matches && root.matches(`.canvas-layer[data-id="${layerId}"]`)) return root;
    } catch (e) { }
    return root.querySelector ? root.querySelector(`.canvas-layer[data-id="${layerId}"]`) : null;
}

function _buildOnCloneForExport(originalCanvasNode) {
    return async function (clonedDoc, clonedCanvasEl) {
console.log('[Exporter] onclone start');

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
                    const cs = _getCS(osp);
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
                    if (_isSimpleBorderBoxSpan(osp) || _isSimpleBackgroundSpan(osp) ||
                        _isSimpleBorderBottomSpan(osp) || _isSimpleTextDecorationSpan(osp)) {
                        continue;
                    }
                    const cs2 = _getCS(osp);
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
            window.__inlineRasterDebug = [];
            const origInlineEls = originalCanvasNode.querySelectorAll('.text-content-editable');
            origInlineEls.forEach(origEl => {
                const layerEl = origEl.closest('.canvas-layer');
                if (!layerEl) return;
                const layerId = layerEl.dataset.id;
                const clonedLayer = _findClonedLayer(clonedCanvasEl, layerId);
                if (!clonedLayer) return;
                const clonedTextEl = clonedLayer.querySelector('.text-content-editable');
                if (!clonedTextEl) return;
                const origSpans = origEl.querySelectorAll('span');
                const clonedSpans = clonedTextEl.querySelectorAll('span');
                for (let i = 0; i < Math.min(origSpans.length, clonedSpans.length); i++) {
                    const osp = origSpans[i];
                    const csp = clonedSpans[i];
                    const simpleUnderline = _isSimpleBorderBottomSpan(osp);
                    const simpleDeco = _isSimpleTextDecorationSpan(osp);
                    const simpleBg = _isSimpleBackgroundSpan(osp);
                    const simpleBox = _isSimpleBorderBoxSpan(osp);
                    const simpleStroke = _isSimpleStrokeSpan(osp);
                    const should = _shouldRasterizeInlineSpan(osp);
                    try {
                        const dcs = _getCS(osp);
                        let rects = 0;
                        try { rects = osp.getClientRects().length; } catch (e) { rects = -1; }
                        const dbg = {
                            layerId: layerId,
                            text: osp.textContent,
                            should: should,
                            simpleUnderline: simpleUnderline,
                            simpleDeco: simpleDeco,
                            simpleBg: simpleBg,
                            simpleBox: simpleBox,
                            simpleStroke: simpleStroke,
                            rects: rects,
                            font: dcs.fontFamily,
                            fontSize: dcs.fontSize,
                            display: dcs.display,
                            borderBottom: dcs.borderBottom,
                            deco: dcs.textDecorationLine,
                            decoStyle: dcs.textDecorationStyle,
                            whiteSpace: dcs.whiteSpace,
                            inline: osp.getAttribute('style')
                        };
                        if (window.__inlineRasterDebug) window.__inlineRasterDebug.push(dbg);
                    } catch (e) { }
                    if (simpleUnderline) {
                        _decorateBorderBottomInClone(csp, csp, clonedTextEl);
                        continue;
                    }
                    if (simpleDeco) {
                        if (_decorateTextDecorationInClone(csp, csp, clonedTextEl)) continue;
                    }
                    let handled = false;
                    if (simpleBg || simpleBox) {
                        // Leave background/border on the clone span: html2canvas paints them
                        // together with the text, so they cannot drift vertically.
                        continue;
                    }
                    if (handled) continue;
                    if (simpleStroke) {
                        if (_decorateStrokeInClone(csp, csp)) continue;
                    }
                    if (!should) continue;
                    try {
                        const rendered = _renderInlineSpanToImage(osp);
                        if (!rendered) continue;
                        if (window.__inlineRasterDebug && window.__inlineRasterDebug.length) {
                            window.__inlineRasterDebug[window.__inlineRasterDebug.length - 1].render = {
                                width: rendered.width,
                                height: rendered.height,
                                baseline: rendered.baseline,
                                marginBottom: rendered.baseline - rendered.height
                            };
                        }
                        const img = document.createElement('img');
                        img.src = rendered.dataUrl;
                        img.style.width = rendered.width + 'px';
                        img.style.height = rendered.height + 'px';
                        img.style.display = 'inline-block';
                        img.style.verticalAlign = 'baseline';
                        img.style.marginTop = '0px';
                        img.style.marginBottom = (rendered.baseline - rendered.height) + 'px';
                        img.dataset.inlineRasterized = '1';
                        if (csp.parentNode) csp.parentNode.replaceChild(img, csp);
                    } catch (e) {
                        console.warn('[InlineRaster] rasterize failed:', e);
                    }
                }
            });
        } catch (e) {
                        console.warn('[InlineRaster] rasterize failed:', e);
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
            const clonedLayer = _findClonedLayer(clonedCanvasEl, layerId);
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

console.log('[Exporter] module ready');

// ============================================================
// ?5 ?A：exportElementToPNG
// ============================================================

function exportElementToPNG(canvasDOMNode, filename, scale) {
    const exportScale = (typeof scale === 'number' && scale > 0) ? scale : 2;
    window.__currentExportScale = exportScale;
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

console.log('[Exporter] module ready');

// ============================================================
// ?5 ?B：导出面?// 注意：let _exportScale = 2; 仍由 app.js 声明，本文件读写全局 _exportScale
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
    // ?P1-2：导出前后背景重应用统一?BG（若已收口则用命名空间）
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

// ?P1-2：exporter.js 收口?window.EXPORT
(function exposeExporterNamespace() {
    if (!window.EXPORT) return;
    EXPORT.exportElementToPNG = exportElementToPNG;
    EXPORT.openExportPanel = openExportPanel;
    EXPORT.closeExportPanel = closeExportPanel;
    EXPORT.runExportFromPanel = runExportFromPanel;
    EXPORT.initExportPanel = initExportPanel;
    EXPORT.exportAllPagesAsPNG = exportAllPagesAsPNG;
    console.log('[EXPORT] exporter.js namespace ready');
})();

console.log('[Exporter] module ready');
console.log('[Exporter] module ready');


