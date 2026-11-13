// ============================================================
// floating-toolbar.js — 选中文字时的浮动工具条
// 职责边界：
//   ✅ 负责：在选中文字图层右上角浮出 6 按钮小工具条（B/I/U/Aa/色块/更多）
//   ✅ 负责：跟随选中图层位置（renderCanvas 后调用 sync）
//   ✅ 负责：点击按钮时委托到顶栏真实按钮，不重复业务逻辑
//   ❌ 不负责：样式修改业务（全部走顶栏按钮 click）
//   ❌ 不负责：菜单/浮层本身（⋯ 按钮点击 = 打开文字更多菜单）
// 依赖：state / renderCanvas / updateTopToolbarUI
// 加载顺序：必须晚于 app.js（依赖 renderCanvas 完成后调用 sync）
// ============================================================

window.__FLOATING_TOOLBAR_READY__ = true;

const FloatingToolbar = (function () {
    let hostEl = null;
    let currentLayerId = null;

    function ensureHost() {
        if (hostEl) return hostEl;
        hostEl = document.createElement('div');
        hostEl.className = 'floating-toolbar';
        hostEl.style.cssText = [
            'position:fixed',
            'z-index:400',
            'display:none',
            'align-items:center',
            'gap:2px',
            'padding:4px',
            'background:#161b22',
            'border:1px solid #30363d',
            'border-radius:10px',
            'box-shadow:0 8px 24px rgba(0,0,0,0.7)',
            'pointer-events:auto',
            'transition:opacity 0.12s'
        ].join(';');

        // 6 个按钮
        const buttonsHtml = [
            { id: 'ft-bold', icon: 'fa-bold', iconName: 'bold', tip: '粗体 (Ctrl+B)' },
            { id: 'ft-italic', icon: 'fa-italic', iconName: 'italic', tip: '斜体 (Ctrl+I)' },
            { id: 'ft-underline', icon: 'fa-underline', iconName: 'underline', tip: '下划线 (Ctrl+U)' },
            { id: 'ft-fontsize', icon: 'fa-text-height', iconName: 'text-height', tip: '字号 / 更多排版' },
            { id: 'ft-color', icon: 'fa-palette', iconName: 'palette', tip: '文字颜色' },
            { id: 'ft-more', icon: 'fa-ellipsis', iconName: 'ellipsis', tip: '更多设置' }
        ];
        buttonsHtml.forEach(cfg => {
            const b = document.createElement('button');
            b.type = 'button';
            b.id = cfg.id;
            b.className = 'floating-toolbar-btn';
            b.title = cfg.tip;
            b.innerHTML = `<i class="fa-solid ${cfg.icon}" data-icon="${cfg.iconName}"></i>`;
            hostEl.appendChild(b);
        });
        if (window.Icons && typeof Icons.apply === 'function') {
            try { Icons.apply(hostEl); } catch (e) {}
        }

        document.body.appendChild(hostEl);
        bindEvents();
        return hostEl;
    }

    // 委托给顶栏真实按钮：click 一次就等于点了顶栏那个按钮
    function delegateClick(targetId) {
        const target = document.getElementById(targetId);
        if (!target) return;
        // 如果目标在菜单面板里，先打开菜单再点
        const panel = target.closest('.menu-panel');
        if (panel) {
            const trigger = document.querySelector(`.menu-trigger[data-menu="${panel.id.replace('menu-', '').replace('-panel', '')}"]`);
            if (trigger && !panel.classList.contains('open')) trigger.click();
            // 再触发目标按钮
            setTimeout(() => { try { target.click(); } catch (e) {} }, 10);
        } else {
            try { target.click(); } catch (e) {}
        }
    }

    function bindEvents() {
        const on = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', (e) => { e.stopPropagation(); fn(e); });
        };
        on('ft-bold', () => delegateClick('tb-bold'));
        on('ft-italic', () => delegateClick('tb-italic'));
        on('ft-underline', () => delegateClick('tb-underline'));
        on('ft-fontsize', () => {
            // 打开「文字更多」菜单面板
            const trigger = document.querySelector('.menu-trigger[data-menu="text-more"]');
            if (trigger && !trigger.classList.contains('is-disabled')) trigger.click();
        });
        on('ft-color', () => {
            // 直接打开原生颜色选择器
            const colorInput = document.getElementById('tb-color');
            if (colorInput) colorInput.click();
        });
        on('ft-more', () => {
            const trigger = document.querySelector('.menu-trigger[data-menu="text-more"]');
            if (trigger && !trigger.classList.contains('is-disabled')) trigger.click();
        });
    }

    function hide() {
        if (!hostEl) return;
        hostEl.style.display = 'none';
        currentLayerId = null;
    }

    // 供左栏「选择」按钮调用：若当前有文字选中就同步显示浮条
    function maybeShow() {
        try { sync(); } catch (e) {}
    }

    function showForLayer(layer, layerEl) {
        ensureHost();
        if (!layer || !layerEl) { hide(); return; }
        const rect = layerEl.getBoundingClientRect();
        if (!rect || rect.width === 0) { hide(); return; }

        currentLayerId = layer.id;
        hostEl.style.display = 'flex';
        hostEl.style.visibility = 'hidden';
        hostEl.style.left = '0px';
        hostEl.style.top = '0px';

        const tipRect = hostEl.getBoundingClientRect();
        
        // 1. 恢复原有的合理定位方式：默认在图层右上方，向上偏移 8px
        let left = rect.right - tipRect.width;
        let top = rect.top - tipRect.height - 8;

        // 2. 获取真实 DOM 中的旋转按钮位置，判断是否重叠
        const rotateBtn = layerEl.querySelector('.rotate-handle');
        if (rotateBtn && rotateBtn.offsetParent !== null) {
            const rotRect = rotateBtn.getBoundingClientRect();
            // 检查两个矩形是否相交
            const isOverlap = !(left + tipRect.width <= rotRect.left || 
                                left >= rotRect.right || 
                                top + tipRect.height <= rotRect.top || 
                                top >= rotRect.bottom);
            
            if (isOverlap) {
                // 发生重叠时，将工具条向左水平移动，直到不挡旋转按钮
                left = rotRect.left - tipRect.width - 12;
            }
        }

        // 3. 顶部空间不足的兜底：如果顶部放不下，放到图层下方
        if (top < 8) {
            top = rect.bottom + 12;
        }

        // 4. 左右越界兜底：确保不超出屏幕左右边缘
        if (left < 8) left = 8;
        if (left + tipRect.width > window.innerWidth - 8) {
            left = window.innerWidth - tipRect.width - 8;
        }

        hostEl.style.left = left + 'px';
        hostEl.style.top = top + 'px';
        hostEl.style.visibility = 'visible';
    }

    // 主入口：由 renderCanvas 末尾调用；根据选中状态决定显示/隐藏
    function sync() {
        if (!window.state) { hide(); return; }
        const layer = state.getSelectedLayer ? state.getSelectedLayer() : null;
        const selectedCount = (state.selectedLayerIds || []).length;

        // 只在「单选文字图层」且非编辑态时显示
        if (!layer || layer.type !== 'text' || selectedCount !== 1 || state.editingLayerId === layer.id) {
            hide();
            return;
        }

        // 找当前图层 DOM
        const layerEl = document.querySelector(
            `.canvas-page-wrapper[data-page-id="${state.currentPageId}"] .canvas-layer[data-id="${layer.id}"]`
        );
        if (!layerEl) { hide(); return; }

        // 同步按钮 active 状态
        const btnBold = document.getElementById('ft-bold');
        const btnItalic = document.getElementById('ft-italic');
        const btnUnderline = document.getElementById('ft-underline');
        if (btnBold) btnBold.classList.toggle('active', !!layer.bold);
        if (btnItalic) btnItalic.classList.toggle('active', !!layer.italic);
        if (btnUnderline) btnUnderline.classList.toggle('active', !!layer.underline);

        showForLayer(layer, layerEl);
    }

    // 滚动 / resize 时重定位（fixed 定位需要跟随）
    function initFloatingReposition() {
        if (window.__floatingToolbarRepositionInited) return;
        window.__floatingToolbarRepositionInited = true;
        const canvasContainer = document.querySelector('.canvas-container');
        if (canvasContainer) {
            canvasContainer.addEventListener('scroll', () => {
                if (currentLayerId) sync();
            }, { passive: true });
        }
        window.addEventListener('resize', () => {
            if (currentLayerId) sync();
        });
    }

    function init() {
        ensureHost();
        initFloatingReposition();
        console.log('[FloatingToolbar] 初始化完成');
    }

    return { init, sync, hide, maybeShow };
})();

window.FloatingToolbar = FloatingToolbar;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { try { FloatingToolbar.init(); FloatingToolbar.sync(); } catch (e) { console.warn(e); } }, 250);
});