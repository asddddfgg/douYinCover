// ============================================================
// hex-input.js — 为所有 input[type=color] 增强可粘贴 HEX 文本框
// 特性：
//   1. 自动扫描页面所有 input[type=color]，在旁边插入一个文本框
//   2. 文本框支持直接输入/粘贴 HEX，实时校验
//   3. 合法时同步写入 color input 并触发 input 事件（不破坏原有逻辑）
//   4. color input 原生选色后文本框自动同步
//   5. 自动监听 DOM 变化（适配动态渲染的特效参数面板）
// ============================================================

const HexInputEnhancer = (function () {
    const BOUND_ATTR = 'data-hex-enhanced';

    function normalizeHex(raw) {
        if (!raw) return null;
        let s = String(raw).trim();
        // 支持 rgb(r,g,b) / rgba(r,g,b,a)
        const rgbMatch = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (rgbMatch) {
            const to2 = n => Math.max(0, Math.min(255, parseInt(n, 10) || 0)).toString(16).padStart(2, '0');
            return ('#' + to2(rgbMatch[1]) + to2(rgbMatch[2]) + to2(rgbMatch[3])).toUpperCase();
        }
        // 去掉 # 和非法字符
        s = s.replace(/^#+/, '').replace(/[^0-9a-fA-F]/g, '');
        if (s.length === 3) {
            s = s.split('').map(c => c + c).join('');
        }
        if (s.length !== 6) return null;
        return '#' + s.toUpperCase();
    }

    function createHexBox(colorInput) {
        const box = document.createElement('input');
        box.type = 'text';
        box.className = 'hex-input-box';
        box.maxLength = 9;
        box.spellcheck = false;
        box.autocomplete = 'off';
        box.placeholder = '#RRGGBB';
        box.value = (colorInput.value || '#000000').toUpperCase();
        box.title = '点击可编辑，支持粘贴 HEX（如 #FF2442 / FF2442 / F24）';

        // 样式：紧凑、深色、等宽
        box.style.cssText =
            'width:78px; min-width:78px; max-width:78px; height:24px; ' +
            'background:#161b22; border:1px solid #30363d; color:#c9d1d9; ' +
            'border-radius:4px; padding:0 6px; font-size:11px; font-family:monospace; ' +
            'outline:none; text-align:center; text-transform:uppercase; ' +
            'transition:border-color 0.12s, box-shadow 0.12s;';

        // 输入时：合法则同步
        box.addEventListener('input', () => {
            const hex = normalizeHex(box.value);
            if (hex) {
                box.style.borderColor = '#30363d';
                box.style.boxShadow = '';
                if (colorInput.value.toLowerCase() !== hex.toLowerCase()) {
                    try { colorInput.value = hex; } catch (e) { return; }
                    colorInput.dispatchEvent(new Event('input', { bubbles: true }));
                    colorInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } else if (box.value.trim() === '') {
                box.style.borderColor = '#30363d';
                box.style.boxShadow = '';
            } else {
                box.style.borderColor = '#f85149';
                box.style.boxShadow = '0 0 0 2px rgba(248,81,73,0.2)';
            }
        });

        // 失焦：修正为当前 color input 的值
        box.addEventListener('blur', () => {
            const hex = normalizeHex(box.value);
            if (hex) {
                box.value = hex;
            } else {
                box.value = (colorInput.value || '#000000').toUpperCase();
            }
            box.style.borderColor = '#30363d';
            box.style.boxShadow = '';
        });

        // 回车：确认并失焦
        box.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                box.blur();
            }
        });

        // 粘贴：清洗后写入
        box.addEventListener('paste', (e) => {
            const cd = e.clipboardData || window.clipboardData;
            if (!cd) return;
            const text = cd.getData('text');
            if (!text) return;
            const hex = normalizeHex(text);
            if (hex) {
                e.preventDefault();
                box.value = hex;
                try { colorInput.value = hex; } catch (err) {}
                colorInput.dispatchEvent(new Event('input', { bubbles: true }));
                colorInput.dispatchEvent(new Event('change', { bubbles: true }));
                box.style.borderColor = '#30363d';
                box.style.boxShadow = '';
            }
        });

        // 选中全选，便于直接覆盖
        box.addEventListener('focus', () => {
            setTimeout(() => { try { box.select(); } catch (e) {} }, 0);
        });

        // 原生 color input 改变时反向同步
        colorInput.addEventListener('input', () => {
            const v = (colorInput.value || '#000000').toUpperCase();
            if (box.value.toUpperCase() !== v) box.value = v;
        });
        colorInput.addEventListener('change', () => {
            const v = (colorInput.value || '#000000').toUpperCase();
            if (box.value.toUpperCase() !== v) box.value = v;
        });

        return box;
    }

    function enhanceOne(colorInput) {
        if (!colorInput) return;
        if (colorInput.getAttribute(BOUND_ATTR) === '1') return;
        colorInput.setAttribute(BOUND_ATTR, '1');

        // 已有相邻的 hex-input-box 就不重复插入
        const parent = colorInput.parentElement;
        if (parent && parent.querySelector('.hex-input-box')) return;

        const box = createHexBox(colorInput);

        // 插入位置：
        // - 若外层是 .color-picker-wrapper（工具栏的 32x32 色块），把文本框放在 wrapper 后面
        // - 否则直接紧跟 colorInput
        if (parent && parent.classList && parent.classList.contains('color-picker-wrapper')) {
            parent.parentElement.insertBefore(box, parent.nextSibling);
        } else if (parent) {
            // 若父元素是 flex 行（如 .color-pickers），插在 input 后面
            parent.insertBefore(box, colorInput.nextSibling);
        }
    }

    function scan(root) {
        const scope = root || document;
        const inputs = scope.querySelectorAll('input[type="color"]');
        inputs.forEach(el => enhanceOne(el));
    }

    function init() {
        scan(document);

        // 监听 DOM 变化：特效参数面板、品牌面板等动态渲染时自动增强
        const mo = new MutationObserver((mutations) => {
            let need = false;
            for (const m of mutations) {
                if (m.type === 'childList' && m.addedNodes.length) {
                    need = true;
                    break;
                }
            }
            if (need) scan(document);
        });
        mo.observe(document.body, { childList: true, subtree: true });

        console.log('[HexInput] 初始化完成，已增强所有 input[type=color]');
    }

    return { init, scan, normalizeHex };
})();

window.HexInputEnhancer = HexInputEnhancer;

document.addEventListener('DOMContentLoaded', () => {
    // 等所有模块渲染完成后再扫描
    setTimeout(() => { try { HexInputEnhancer.init(); } catch (e) { console.warn(e); } }, 600);
});