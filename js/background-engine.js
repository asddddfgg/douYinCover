// ============================================================
// background-engine.js — 背景 v2 内核（图层栈模型）
// 职责边界：
//   ✅ 负责：新数据模型 migrate / render / applyToCanvas / 自测
//   ❌ 不负责：面板 UI（第 4 步）、资产存储（第 5 步）
// 设计：
//   state.background = {
//     version: 2,
//     base: { kind:'gradient'|'solid'|'image', color1, color2, angle, imageUrl, ... },
//     layers: [ { id, kind:'texture'|'overlay'|'image', ... , opacity, blendMode } ]
//   }
// 兼容：migrateLegacy 把旧扁平结构转成单层 stack，render 对旧结构自动 migrate
// 加载顺序：必须早于 background-core.js（后者会调本引擎）
// ============================================================

window.__BACKGROUND_ENGINE_READY__ = true;

const BackgroundEngine = (function () {

    // ---------- 工具 ----------
    function _genId(prefix) {
        return (prefix || 'layer') + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    }

    function _num(v, d) {
        const n = Number(v);
        return isFinite(n) ? n : d;
    }

    function _clamp01(v) {
        return Math.max(0, Math.min(1, _num(v, 0)));
    }

    function _hexToRgba(hex, alpha) {
        if (!hex) return 'rgba(0,0,0,' + alpha + ')';
        let h = String(hex).replace('#', '');
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        const r = parseInt(h.substring(0, 2), 16) || 0;
        const g = parseInt(h.substring(2, 4), 16) || 0;
        const b = parseInt(h.substring(4, 6), 16) || 0;
        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
    }

    // ---------- 纹理 SVG ----------
    function _textureCss(texture) {
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

    // ---------- 旧结构 → 新结构（幂等） ----------
    function migrateLegacy(bg) {
        if (!bg || typeof bg !== 'object') {
            return _emptyStack();
        }
        // 已是 v2
        if (bg.version === 2 && bg.base && Array.isArray(bg.layers)) {
            return _normalizeV2(bg);
        }

        // 旧扁平结构
        const old = bg;
        const base = {
            kind: old.type === 'image' ? 'image' : (old.type === 'solid' ? 'solid' : 'gradient'),
            color1: old.color1 || '#ff2442',
            color2: old.color2 || old.color1 || '#2575fc',
            angle: _num(old.angle, 135),
            imageUrl: old.imageUrl || '',
            customImageId: old.customImageId != null ? old.customImageId : null,
            fit: old.fit || 'cover',
            scale: _num(old.scale, 1),
            positionX: _num(old.positionX, 50),
            positionY: _num(old.positionY, 50),
            blur: _num(old.blur, 0),
            colorFilter: old.colorFilter || 'none',
            overlayColor: old.overlayColor || '#000000',
            overlayOpacity: _clamp01(_num(old.overlayOpacity, 0)),
            overlayType: old.overlayType || 'solid',
            overlayStops: Array.isArray(old.overlayStops) ? old.overlayStops.map(s => ({
                pos: Math.max(0, Math.min(1, _num(s.pos, 0))),
                color: s.color || '#000000',
                opacity: _clamp01(_num(s.opacity, 0))
            })) : [],
            overlayAngle: _num(old.overlayAngle, 180),
            overlayCenter: Object.assign({ x: 50, y: 40 }, old.overlayCenter || {}),
            presetId: old.presetId || null
        };

        const layers = [];
        // 旧 texture → 一条 texture 层
        if (old.texture && old.texture !== 'none') {
            layers.push({
                id: _genId('tex'),
                kind: 'texture',
                texture: old.texture,
                opacity: 1,
                blendMode: 'normal'
            });
        }

        return _normalizeV2({ version: 2, base, layers });
    }

    function _emptyStack() {
        return _normalizeV2({
            version: 2,
            base: {
                kind: 'gradient',
                color1: '#ff2442',
                color2: '#2575fc',
                angle: 135,
                imageUrl: '',
                customImageId: null,
                fit: 'cover',
                scale: 1,
                positionX: 50,
                positionY: 50,
                blur: 0,
                colorFilter: 'none',
                overlayColor: '#000000',
                overlayOpacity: 0,
                overlayType: 'solid',
                overlayStops: [],
                overlayAngle: 180,
                overlayCenter: { x: 50, y: 40 },
                presetId: null
            },
            layers: []
        });
    }

    function _normalizeV2(bg) {
        const base = bg.base || {};
        const layers = Array.isArray(bg.layers) ? bg.layers : [];
        return {
            version: 2,
            base: {
                kind: base.kind || 'gradient',
                color1: base.color1 || '#ff2442',
                color2: base.color2 || base.color1 || '#2575fc',
                angle: _num(base.angle, 135),
                imageUrl: base.imageUrl || '',
                customImageId: base.customImageId != null ? base.customImageId : null,
                fit: base.fit || 'cover',
                scale: _num(base.scale, 1),
                positionX: _num(base.positionX, 50),
                positionY: _num(base.positionY, 50),
                blur: _num(base.blur, 0),
                colorFilter: base.colorFilter || 'none',
                overlayColor: base.overlayColor || '#000000',
                overlayOpacity: _clamp01(_num(base.overlayOpacity, 0)),
                overlayType: base.overlayType || 'solid',
                overlayStops: Array.isArray(base.overlayStops) ? base.overlayStops.map(s => ({
                    pos: Math.max(0, Math.min(1, _num(s.pos, 0))),
                    color: s.color || '#000000',
                    opacity: _clamp01(_num(s.opacity, 0))
                })) : [],
                overlayAngle: _num(base.overlayAngle, 180),
                overlayCenter: Object.assign({ x: 50, y: 40 }, base.overlayCenter || {}),
                presetId: base.presetId || null
            },
            layers: layers.map(l => ({
                id: l.id || _genId('layer'),
                kind: l.kind || 'texture',
                texture: l.texture || 'none',
                imageUrl: l.imageUrl || '',
                color: l.color || '#000000',
                opacity: _clamp01(_num(l.opacity, 1)),
                blendMode: l.blendMode || 'normal'
            }))
        };
    }

    // ---------- 渲染：base + layers → CSS ----------
    // 返回 { css, backgroundSize, needsImageApply }
    function render(bg) {
        const stack = migrateLegacy(bg);
        const base = stack.base;

        // base 是图片 → 不生成 css，由 background-image.js 处理，但返回 needsImageApply
        if (base.kind === 'image') {
            return { css: '', backgroundSize: '', needsImageApply: true, stack };
        }

        // base css
        let baseCss = '';
        if (base.kind === 'gradient') {
            baseCss = `linear-gradient(${base.angle}deg, ${base.color1} 0%, ${base.color2} 100%)`;
        } else if (base.kind === 'solid') {
            baseCss = base.color1;
        } else {
            baseCss = '#000';
        }

        // layers css（按顺序，后加的在上层，对应 CSS 多背景里越靠前越在上）
        const parts = [];
        const sizes = [];
        let extraBlend = [];

        // 反向遍历：layers[0] 最底，layers[n] 最上；CSS 多背景里第一个是最上层
        // 所以我们要把 layers 从后往前放到 parts 前面
        for (let i = stack.layers.length - 1; i >= 0; i--) {
            const l = stack.layers[i];
            if (l.opacity <= 0) continue;
            let css = '';
            let size = '';
            if (l.kind === 'texture') {
                css = _textureCss(l.texture);
                if (l.texture === 'grid') size = '22px 22px, 22px 22px';
                else if (l.texture === 'dots') size = '14px 14px';
            } else if (l.kind === 'overlay') {
                // ✅ 纯色遮罩必须包成 linear-gradient，否则在多背景中间层不合法（浏览器整条忽略）
                //    alpha 塞进两个 stop，保证透明度生效
                const c = _hexToRgba(l.color, l.opacity);
                css = `linear-gradient(${c}, ${c})`;
            } else if (l.kind === 'image' && l.imageUrl) {
                css = `url(${l.imageUrl})`;
                size = 'cover';
            }
            if (!css) continue;
            parts.push(css);
            sizes.push(size);
            extraBlend.push(l.blendMode && l.blendMode !== 'normal' ? l.blendMode : 'normal');
        }

        // 旧 base.overlay（solid/linear/radial）— 作为最顶层的一条
        if (base.overlayType === 'linear' && base.overlayStops.length) {
            const stops = base.overlayStops.map(s => `${_hexToRgba(s.color, s.opacity)} ${(s.pos * 100)}%`).join(', ');
            parts.unshift(`linear-gradient(${base.overlayAngle}deg, ${stops})`);
            sizes.unshift('');
            extraBlend.unshift('normal');
        } else if (base.overlayType === 'radial' && base.overlayStops.length) {
            const stops = base.overlayStops.map(s => `${_hexToRgba(s.color, s.opacity)} ${(s.pos * 100)}%`).join(', ');
            parts.unshift(`radial-gradient(circle at ${base.overlayCenter.x}% ${base.overlayCenter.y}%, ${stops})`);
            sizes.unshift('');
            extraBlend.unshift('normal');
        } else if (base.overlayOpacity > 0) {
            // ✅ 同样不能裸 rgba，包成单色渐变
            const c = _hexToRgba(base.overlayColor, base.overlayOpacity);
            parts.unshift(`linear-gradient(${c}, ${c})`);
            sizes.unshift('');
            extraBlend.unshift('normal');
        }

        // base 放最后（最底层）
        parts.push(baseCss);
        sizes.push('');

        const css = parts.join(', ');
        const backgroundSize = sizes.filter(Boolean).length
            ? sizes.map(s => s || 'auto').join(', ')
            : '';

                // ✅ background-blend-mode 必须与背景层数严格一致，否则浏览器整条忽略
        // parts 已经包含了 base，extraBlend 只对应 layers + base.overlay；
        // 这里统一给每一层都生成一个 blend 值（base 用 normal）
        const blendArr = extraBlend.concat(['normal']);
        // 若 parts 长度和 blendArr 不一致，补齐/截断到 parts.length
        while (blendArr.length < parts.length) blendArr.push('normal');
        if (blendArr.length > parts.length) blendArr.length = parts.length;
        const blend = blendArr.some(b => b !== 'normal') ? blendArr.join(', ') : '';

        return { css, backgroundSize, blendMode: blend, needsImageApply: false, stack };
    }

    // ---------- 应用到 .canvas-bg ----------
    function applyToCanvas(bg, docRoot) {
        const root = docRoot || document;
        const r = render(bg);
        root.querySelectorAll('.canvas-bg').forEach(el => {
            el.style.background = '';
            el.style.backgroundImage = '';
            el.style.backgroundSize = '';
            el.style.backgroundPosition = '';
            el.style.backgroundRepeat = '';
            el.style.backgroundBlendMode = '';
            el.style.filter = '';
            el.style.transform = '';
            el.style.transformOrigin = '';

            if (r.needsImageApply) {
                // 图片 base：由 background-image.js 接管
                return;
            }
            el.style.background = r.css;
            if (r.backgroundSize) el.style.backgroundSize = r.backgroundSize;
            if (r.blendMode) el.style.backgroundBlendMode = r.blendMode;
        });
        return r;
    }

    // ---------- 自测 ----------
    function _selftest() {
        try {
            // 1. migrate 幂等
            const legacy = { type: 'gradient', color1: '#ff2442', color2: '#2575fc', angle: 135, texture: 'noise' };
            const v2a = migrateLegacy(legacy);
            const v2b = migrateLegacy(v2a);
            console.assert(v2a.version === 2 && v2b.version === 2, '[BackgroundEngine] migrate 版本错误');
            console.assert(v2a.layers.length === 1 && v2a.layers[0].kind === 'texture', '[BackgroundEngine] legacy texture 未转成 layer');
            console.assert(JSON.stringify(v2a) === JSON.stringify(v2b), '[BackgroundEngine] migrate 非幂等');

            // 2. render gradient
            const rg = render({ type: 'gradient', color1: '#ff2442', color2: '#2575fc', angle: 135 });
            console.assert(rg.css.includes('linear-gradient'), '[BackgroundEngine] gradient render 失败');
            console.assert(rg.needsImageApply === false, '[BackgroundEngine] gradient 误判为 image');

            // 3. render solid
            const rs = render({ type: 'solid', color1: '#000000' });
            console.assert(rs.css.includes('#000000'), '[BackgroundEngine] solid render 失败');

            // 4. render image
            const ri = render({ type: 'image', imageUrl: 'data:image/png;base64,xxx' });
            console.assert(ri.needsImageApply === true, '[BackgroundEngine] image 未标记 needsImageApply');

            // 5. 多图层叠加
            const multi = migrateLegacy({
                version: 2,
                base: { kind: 'gradient', color1: '#ff2442', color2: '#2575fc' },
                layers: [
                    { id: 't1', kind: 'texture', texture: 'noise', opacity: 1, blendMode: 'overlay' },
                    { id: 'o1', kind: 'overlay', color: '#000000', opacity: 0.3, blendMode: 'normal' }
                ]
            });
            const rm = render(multi);
            console.assert(rm.css.split(',').length >= 2, '[BackgroundEngine] 多图层拼接失败');

            console.log('[BackgroundEngine] v2 就绪，自测通过');
            return true;
        } catch (e) {
            console.error('[BackgroundEngine] 自测失败:', e);
            return false;
        }
    }

    return {
        migrateLegacy,
        render,
        applyToCanvas,
        selftest: _selftest,
        version: 2
    };
})();

window.BackgroundEngine = BackgroundEngine;

// 启动自测
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { BackgroundEngine.selftest(); });
} else {
    BackgroundEngine.selftest();
}