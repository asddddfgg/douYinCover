// ============================================================
// icons.js — 内联 SVG 图标库（取代高频 Font Awesome 依赖）
// 用法：
//   1. 直接取字符串： Icons.get('bold')        → '<svg ...>'
//   2. 批量替换： 在 HTML 里写 <i data-icon="bold"></i>
//      然后 Icons.apply(document) 会把 <i> 内部替换成 SVG
//   3. MutationObserver 自动接管动态插入的元素
// 设计：
//   - 24x24 视口，stroke=currentColor，随父色变化
//   - 与 Font Awesome 视觉接近（线宽 1.8，圆角 2）
//   - 未匹配的 name 原样返回空串（调用方应保留原 <i> 以让 FA 兜底）
// 加载顺序：必须早于 app.js（DOMContentLoaded 里会调 Icons.apply）
//         但为了不阻塞现有流程，Icons 会在 DOMContentLoaded 后自行扫描
// ============================================================

window.__ICONS_READY__ = true;

const Icons = (function () {
    const wrap = (inner, opts) => {
        opts = opts || {};
        const fill = opts.fill ? 'currentColor' : 'none';
        const stroke = opts.fill ? 'none' : 'currentColor';
        const sw = opts.strokeWidth != null ? opts.strokeWidth : 1.8;
        return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
            'fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '" ' +
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
    };

    const LIB = {
        // ---- 文字 / 编辑 ----
        'bold':        wrap('<path d="M6 4h7a4 4 0 0 1 0 8H6z"/><path d="M6 12h8a4 4 0 0 1 0 8H6z"/>'),
        'italic':      wrap('<path d="M19 4h-9M14 20H5M15 4L9 20"/>'),
        'underline':   wrap('<path d="M6 4v7a6 6 0 0 0 12 0V4M4 20h16"/>'),
        'strike':      wrap('<path d="M4 12h16M16.5 6.5A4.5 4.5 0 0 0 12 4C9.5 4 8 5.5 8 7.5s1.2 3.1 3 4M17 16c0 2.2-1.8 4-4 4-2 0-3.5-1-4-2.5"/>'),
        'font':        wrap('<path d="M4 20L10 4h4l6 16M7 14h10"/>'),
        'text-height': wrap('<path d="M4 6h16M4 18h16M9 6v12M15 6v12"/>'),
        'align-left':  wrap('<path d="M4 6h16M4 12h10M4 18h14"/>'),
        'align-center':wrap('<path d="M4 6h16M7 12h10M5 18h14"/>'),
        'align-right': wrap('<path d="M4 6h16M10 12h10M6 18h14"/>'),
        'list':        wrap('<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'),
        'marker':      wrap('<path d="M12 3l6 6-8 8H4v-6z"/><path d="M4 21h16"/>'),
        'eraser':      wrap('<path d="M3 21h18M15 4l5 5-9 9H6l-3-3z"/>'),

        // ---- 对齐 / 排列 ----
        'arrows-to-line':      wrap('<path d="M4 20h16M12 4v12M8 8l4-4 4 4"/>'),
        'arrows-down-to-line': wrap('<path d="M4 4h16M12 20V8M8 16l4 4 4-4"/>'),
        'arrows-lr':           wrap('<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>'),
        'arrows-ud':           wrap('<path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/>'),
        'grip-lines':          wrap('<path d="M4 8h16M4 12h16M4 16h16"/>'),
        'grip-lines-v':        wrap('<path d="M8 4v16M12 4v16M16 4v16"/>'),

        // ---- 图层 ----
        'layer-group': wrap('<path d="M12 2 2 7l10 5 10-5zM2 12l10 5 10-5M2 17l10 5 10-5"/>'),
        'object-group': wrap('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><path d="M10 6h4a4 4 0 0 1 4 4v4"/>'),
        'object-ungroup': wrap('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><path d="M10 6h2M6 10v2M18 14h-2M14 18v-2"/>'),
        'lock':   wrap('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
        'unlock': wrap('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7-2.5"/>'),

        // ---- 工具 ----
        'cursor':      wrap('<path d="M4 3l7 17 2-6 6-2z"/>'),
        'pointer':     wrap('<path d="M4 3l7 17 2-6 6-2z"/>'),
        'smile':       wrap('<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>'),
        'paintbrush':  wrap('<path d="M14 4l6 6-8 8-4 1 1-4z"/><path d="M3 21h6"/>'),
        'image':       wrap('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),
        'shapes':      wrap('<rect x="3" y="12" width="8" height="8" rx="1"/><circle cx="16" cy="16" r="4"/><path d="M11 3l4 7H7z"/>'),
        'square':      wrap('<rect x="4" y="4" width="16" height="16" rx="2"/>'),
        'circle':      wrap('<circle cx="12" cy="12" r="8"/>'),
        'minus':       wrap('<path d="M4 12h16"/>'),
        'arrow-right': wrap('<path d="M4 12h16M14 6l6 6-6 6"/>'),

        // ---- 菜单 / 系统 ----
        'folder':        wrap('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
        'folder-open':   wrap('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3zM3 10h18l-2 8a2 2 0 0 1-2 1.5H5A2 2 0 0 1 3 18z"/>'),
        'eye':           wrap('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
        'magnet':        wrap('<path d="M5 4v8a7 7 0 0 0 14 0V4M5 4h4M15 4h4M5 12h4M15 12h4"/>'),
        'x':             wrap('<path d="M6 6l12 12M18 6L6 18"/>'),
        'chevron-down':  wrap('<path d="M6 9l6 6 6-6"/>'),
        'ellipsis':      wrap('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>', { fill: true, strokeWidth: 0 }),
        'wand':          wrap('<path d="M15 4l5 5M4 20l11-11M9 4l1.5 1.5M4 9l1.5 1.5M17 15l1.5 1.5M13 19l1.5 1.5"/>'),
        'sparkles':      wrap('<path d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3z"/><path d="M19 14l.9 2.3 2.3.9-2.3.9L19 20.4l-.9-2.3-2.3-.9 2.3-.9z"/>', { fill: true, strokeWidth: 0 }),
        'history':       wrap('<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>'),
        'palette':       wrap('<path d="M12 3a9 9 0 1 0 0 18c1.7 0 2.5-1 2.5-2.5S13.7 16 15 16h3a3 3 0 0 0 3-3 10 10 0 0 0-9-10z"/><circle cx="8" cy="10" r="1"/><circle cx="10" cy="6.5" r="1"/><circle cx="14" cy="6.5" r="1"/><circle cx="16" cy="10" r="1"/>'),
        'image-regular': wrap('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),
        'sliders':       wrap('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h8M16 18h4"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="14" cy="18" r="2"/>'),
        'download':      wrap('<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>'),
        'plus':          wrap('<path d="M12 5v14M5 12h14"/>'),
        'floppy':        wrap('<path d="M4 4h12l4 4v12H4z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/>'),
        'file-export':   wrap('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M14 3v5h5M12 12l6-6M14 6h4v4"/>'),
        'upload':        wrap('<path d="M12 20V4M7 9l5-5 5 5M4 20h16"/>'),
        'list-icon':     wrap('<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'),
        'type':          wrap('<path d="M4 6h16M10 6v14M14 6v14"/>'),
        'clock':         wrap('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')
    };

    function get(name) {
        return LIB[name] || '';
    }

    // 把容器内所有 [data-icon] 元素的内容替换为对应 SVG
    // 未匹配的保留原内容（让 FA 兜底）
    function apply(root) {
        const scope = root || document;
        scope.querySelectorAll('[data-icon]').forEach(el => {
            if (el.dataset.iconApplied === '1') return;
            const name = el.getAttribute('data-icon');
            const svg = get(name);
            if (!svg) return;
            // ✅ 关键修复：先移除 Font Awesome 的类，防止 FA 伪元素和 SVG 同时显示（双图标 bug）
            el.classList.remove('fa-solid', 'fa-regular', 'fa-brands', 'fa-light', 'fa-thin', 'fa-duotone');
            // 移除所有 fa-xxx 图标类（保留其它非 fa 类）
            Array.from(el.classList).forEach(cls => {
                if (/^fa-/.test(cls) && !/^fa-(solid|regular|brands|light|thin|duotone)$/.test(cls)) {
                    el.classList.remove(cls);
                }
            });
            el.innerHTML = svg;
            el.dataset.iconApplied = '1';
            // 保证 SVG 垂直居中
            el.style.display = 'inline-flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
            // 兜底：清掉伪元素内容（双保险）
            el.style.setProperty('--fa-content', 'none');
        });
    }

    function init() {
        apply(document);
        // 动态元素（renderCanvas 重建的按钮等）自动接管
        if (!window.__iconsObserver) {
            window.__iconsObserver = new MutationObserver((mutations) => {
                let need = false;
                for (const m of mutations) {
                    if (m.type === 'childList' && m.addedNodes.length) { need = true; break; }
                }
                if (need) apply(document);
            });
            window.__iconsObserver.observe(document.body, { childList: true, subtree: true });
        }
        console.log('[Icons] 初始化完成，已加载 ' + Object.keys(LIB).length + ' 个图标');
    }

    return { get, apply, init };
})();

window.Icons = Icons;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { try { Icons.init(); } catch (e) { console.warn('[Icons] 初始化失败', e); } }, 200);
});