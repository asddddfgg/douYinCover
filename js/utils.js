// ============================================================
// utils.js — 全站公共工具层（P0-1）
// 职责：颜色 / 剪贴板 / SVG / 字符串 / DOM / 异步 六类纯函数
// 原则：不依赖任何业务模块，谁都能调，谁都不许改它的内部状态
// ============================================================

window.Utils = (function () {

    // ---------- 1. 颜色 ----------
    const hex = {
        // '#abc' / 'abc' / '#aabbcc' / 'rgb(1,2,3)' → '#AABBCC'，非法返回 null
        normalize(raw) {
            if (raw === undefined || raw === null) return null;
            let s = String(raw).trim();
            const rgbMatch = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
            if (rgbMatch) {
                const to2 = n => Math.max(0, Math.min(255, parseInt(n, 10) || 0)).toString(16).padStart(2, '0');
                return ('#' + to2(rgbMatch[1]) + to2(rgbMatch[2]) + to2(rgbMatch[3])).toUpperCase();
            }
            s = s.replace(/^#+/, '').replace(/[^0-9a-fA-F]/g, '');
            if (s.length === 3) s = s.split('').map(c => c + c).join('');
            if (s.length !== 6) return null;
            return '#' + s.toUpperCase();
        },

        isValid(raw) {
            return hex.normalize(raw) !== null;
        },

        // '#rrggbb' + alpha(0~1) → 'rgba(r,g,b,a)'
        toRgba(raw, alpha) {
            const h = hex.normalize(raw);
            if (!h) return 'rgba(0,0,0,' + (alpha === undefined ? 1 : alpha) + ')';
            const r = parseInt(h.slice(1, 3), 16);
            const g = parseInt(h.slice(3, 5), 16);
            const b = parseInt(h.slice(5, 7), 16);
            return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + (alpha === undefined ? 1 : alpha) + ')';
        }
    };

    const color = {
        // 反色（导出 invert 补丁用）
        invert(raw) {
            const h = hex.normalize(raw);
            if (!h) return raw || 'transparent';
            const to2 = n => (255 - n).toString(16).padStart(2, '0');
            return '#' + to2(parseInt(h.slice(1, 3), 16))
                       + to2(parseInt(h.slice(3, 5), 16))
                       + to2(parseInt(h.slice(5, 7), 16));
        },

        // WCAG 相对亮度
        relativeLuminance(hexColor) {
            const h = hex.normalize(hexColor) || '#000000';
            const toLinear = c => {
                const v = c / 255;
                return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            };
            const r = toLinear(parseInt(h.slice(1, 3), 16));
            const g = toLinear(parseInt(h.slice(3, 5), 16));
            const b = toLinear(parseInt(h.slice(5, 7), 16));
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        },

        // WCAG 对比度 1~21
        contrastRatio(hexA, hexB) {
            const lA = color.relativeLuminance(hexA);
            const lB = color.relativeLuminance(hexB);
            const lighter = Math.max(lA, lB);
            const darker = Math.min(lA, lB);
            return (lighter + 0.05) / (darker + 0.05);
        }
    };

    // ---------- 2. 剪贴板 ----------
    const clipboard = {
        copy(text) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                return navigator.clipboard.writeText(text).catch(() => clipboard._fallback(text));
            }
            clipboard._fallback(text);
            return Promise.resolve();
        },
        _fallback(text) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch (e) {}
            document.body.removeChild(ta);
        }
    };

    // ---------- 3. SVG ----------
    const svg = {
        // 把任意 SVG 字符串/ dataUrl 解成纯 XML
        toRawXml(raw) {
            if (!raw) return '';
            let s = String(raw).trim();
            if (s.startsWith('<svg')) return s;
            const idx = s.indexOf(',');
            let tail = idx >= 0 ? s.slice(idx + 1) : s;
            try { tail = decodeURIComponent(tail); } catch (e) {}
            if (tail.includes('<svg')) return tail;
            try {
                const b = decodeURIComponent(escape(atob(tail.replace(/[^A-Za-z0-9+/=]/g, ''))));
                if (b.includes('<svg')) return b;
            } catch (e) {}
            const i = raw.indexOf('<svg');
            return i >= 0 ? raw.slice(i) : '';
        },

        // 统一编码成 dataUrl
        toDataUrl(raw) {
            const xml = svg.toRawXml(raw);
            if (!xml) return '';
            return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
        }
    };

    // ---------- 4. 字符串 ----------
    const string = {
        escapeHtml(str) {
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        },
        // 稳定 hash（背景图 fav key 用）
        hash(str) {
            let h = 5381;
            for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
            return (h >>> 0).toString(36);
        }
    };

    // ---------- 5. DOM ----------
    const dom = {
        // 安全写 input[type=color]，非法值回退 fallback
        safeSetColorInput(id, value, fallback) {
            const el = document.getElementById(id);
            if (!el) return;
            let v = value || '';
            if (/^#[0-9a-fA-F]{3}$/.test(v)) {
                v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
            }
            if (!/^#[0-9a-fA-F]{6}$/.test(v)) v = fallback || '#000000';
            try { el.value = v; } catch (e) {}
        }
    };

    // ---------- 6. 异步 ----------
    const async = {
        debounce(fn, wait) {
            let t = null;
            return function () {
                const args = arguments, ctx = this;
                if (t) clearTimeout(t);
                t = setTimeout(() => { t = null; fn.apply(ctx, args); }, wait);
            };
        },
        throttle(fn, wait) {
            let last = 0;
            return function () {
                const now = Date.now();
                if (now - last < wait) return;
                last = now;
                fn.apply(this, arguments);
            };
        },
        rafThrottle(fn) {
            let id = null;
            let lastArgs = null;
            return function () {
                lastArgs = arguments;
                if (id) return;
                id = requestAnimationFrame(() => {
                    id = null;
                    fn.apply(this, lastArgs);
                });
            };
        }
    };

    // ---------- 7. 日志（P0-2 的底座） ----------
    const log = {
        buffer: [],
        maxBuffer: 50,
        _push(level, args) {
            const item = { level, args, time: Date.now() };
            log.buffer.push(item);
            if (log.buffer.length > log.maxBuffer) log.buffer.shift();
            if (window.AppRuntime && Array.isArray(window.AppRuntime.errors)) {
                window.AppRuntime.errors.push(item);
                if (window.AppRuntime.errors.length > log.maxBuffer) window.AppRuntime.errors.shift();
            }
        },
        warn() {
            log._push('warn', Array.from(arguments));
            console.warn.apply(console, arguments);
        },
        error() {
            log._push('error', Array.from(arguments));
            console.error.apply(console, arguments);
        }
    };

    return { hex, color, clipboard, svg, string, dom, async, log };
})();

console.log('[Utils] ✅ 公共工具层已就位');