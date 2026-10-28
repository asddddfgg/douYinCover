// ============================================================
// left-rail.js — 左侧竖排工具条交互
// 职责边界：
//   ✅ 负责：点击左侧工具条按钮 → 打开对应功能（文本 / 贴纸 / 画笔 / 背景 / 设置）
//   ✅ 负责：快捷键 V / T / S / P / B 的映射
//   ✅ 负责：激活态同步（选择 vs 画笔等互斥）
//   ❌ 不负责：功能本身（全部调现有入口）
// 依赖：state / 各类 panel 的开关函数 / showBgToast
// 加载顺序：必须晚于 app.js（renderCanvas 等就绪）
// ============================================================

window.__LEFT_RAIL_READY__ = true;

const LeftRail = (function () {
    let inited = false;

    function setActive(tool) {
        document.querySelectorAll('.rail-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
    }

    function openTextPanel() {
        // 直接新建一个文字图层（不再依赖顶栏按钮）
        if (!window.state) return;
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
        if (typeof renderAll === 'function') renderAll();
    }
    function openStickerPanel() {
        // 直接打开贴纸面板（不再依赖顶栏按钮）
        const panel = document.getElementById('sticker-panel');
        if (!panel) return;
        if (panel.style.display === 'none' || panel.style.display === '') {
            panel.style.display = 'flex';
        } else {
            panel.style.display = 'none';
        }
    }
    function openDoodle() {
        if (window.FloatingToolbar && typeof FloatingToolbar.hide === 'function') {
            try { FloatingToolbar.hide(); } catch (e) {}
        }
        // 进入涂鸦模式（同时切按钮态）
        if (window.Doodle && typeof Doodle.setDrawMode === 'function') {
            Doodle.setDrawMode(true);
            setActive('draw');
        } else {
            const btn = document.getElementById('btn-doodle');
            if (btn) btn.click();
            setActive('draw');
        }
    }
    function exitDoodleIfNeeded() {
        if (window.Doodle && Doodle.isActive && Doodle.isActive()) {
            Doodle.setDrawMode(false);
        }
    }
    function openBgPanel() {
        // 滚动到背景面板 / 折叠展开
        const sidebarRight = document.querySelector('.sidebar-right');
        const bgSection = document.getElementById('bg-panel-section');
        if (sidebarRight && bgSection) {
            bgSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function openShapeMenu() {
        if (!window.Shapes) {
            if (typeof showBgToast === 'function') showBgToast('形状模块尚未加载');
            return;
        }
        const old = document.getElementById('shape-menu-popover');
        if (old) old.remove();
        const rail = document.getElementById('left-rail');
        const btn = rail ? rail.querySelector('[data-tool="shape"]') : null;
        if (!btn) return;
        const r = btn.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.id = 'shape-menu-popover';
        menu.style.cssText = 'position:fixed;left:' + (r.right + 8) + 'px;top:' + r.top + 'px;background:#161b22;border:1px solid #30363d;border-radius:8px;box-shadow:0 12px 32px rgba(0,0,0,0.8);padding:4px;z-index:9999;display:flex;flex-direction:column;gap:2px;min-width:140px;';
        const items = [
            { kind: 'rect', icon: 'fa-square', iconName: 'square', label: '矩形' },
            { kind: 'ellipse', icon: 'fa-circle', iconName: 'circle', label: '圆形' },
            { kind: 'line', icon: 'fa-minus', iconName: 'minus', label: '直线' },
            { kind: 'arrow', icon: 'fa-arrow-right', iconName: 'arrow-right', label: '箭头' }
        ];
        items.forEach(it => {
            const item = document.createElement('button');
            item.type = 'button';
            item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 10px;border:none;background:transparent;color:#c9d1d9;font-size:12px;border-radius:5px;cursor:pointer;text-align:left;';
            item.innerHTML = '<i class="fa-solid ' + it.icon + '" data-icon="' + it.iconName + '" style="width:14px;display:inline-flex;"></i> ' + it.label;
            if (window.Icons && typeof Icons.apply === 'function') {
                try { Icons.apply(item); } catch (e) {}
            }
            item.addEventListener('mouseenter', () => { item.style.background = '#30363d'; });
            item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
            item.addEventListener('click', () => {
                menu.remove();
                try {
                    Shapes.setDrawMode(it.kind);
                    setActive('shape');
                    if (typeof showBgToast === 'function') showBgToast('在画布上拖动绘制' + it.label);
                } catch (e) {
                    console.warn('[LeftRail] Shapes.setDrawMode failed:', e);
                }
            });
            menu.appendChild(item);
        });
        document.body.appendChild(menu);
        setTimeout(() => {
            document.addEventListener('mousedown', function onDoc(ev) {
                if (!menu.contains(ev.target) && !ev.target.closest('[data-tool="shape"]')) {
                    menu.remove();
                    document.removeEventListener('mousedown', onDoc, true);
                }
            }, true);
        }, 0);
    }
    function openSettings() {
        // 打开「文件」菜单作为设置入口（用户可在这里找到字体、项目等）
        const trigger = document.querySelector('.menu-trigger[data-menu="file"]');
        if (trigger) trigger.click();
    }

    function handleToolClick(tool) {
        // 🔒 死循环保护：500ms 内同一工具只处理 1 次
        const now = Date.now();
        if (!window.__lastToolClick) window.__lastToolClick = {};
        if (window.__lastToolClick[tool] && now - window.__lastToolClick[tool] < 500) {
            console.warn('[LeftRail] 500ms 内重复点击 ' + tool + '，忽略');
            return;
        }
        window.__lastToolClick[tool] = now;
        
        console.log('[LeftRail] 点击工具:', tool);
        
        try {
            switch (tool) {
                case 'select':
                    exitDoodleIfNeeded();
                    setActive('select');
                    if (window.FloatingToolbar && typeof FloatingToolbar.maybeShow === 'function') {
                        try { FloatingToolbar.maybeShow(); } catch (e) {}
                    }
                    break;
                case 'shape':
                    exitDoodleIfNeeded();
                    openShapeMenu();
                    break;
                case 'text':
                    console.log('[LeftRail] text → 开始');
                    exitDoodleIfNeeded();
                    setActive('text');
                    openTextPanel();
                    setTimeout(() => setActive('select'), 300);
                    console.log('[LeftRail] text → 完成');
                    break;
                case 'sticker':
                    exitDoodleIfNeeded();
                    setActive('sticker');
                    openStickerPanel();
                    setTimeout(() => setActive('select'), 300);
                    break;
                case 'draw':
                    openDoodle();
                    break;
                case 'bg':
                    exitDoodleIfNeeded();
                    setActive('bg');
                    openBgPanel();
                    setTimeout(() => setActive('select'), 300);
                    break;
                case 'settings':
                    exitDoodleIfNeeded();
                    openSettings();
                    break;
            }
        } catch (e) {
            console.error('[LeftRail] handleToolClick 抛错:', tool, e, e.stack);
        }
    }

    function bindEvents() {
        const rail = document.getElementById('left-rail');
        if (!rail) return;
        rail.addEventListener('click', (e) => {
            const btn = e.target.closest('.rail-btn');
            if (!btn) return;
            e.stopPropagation();
            handleToolClick(btn.dataset.tool);
        });
    }

    function bindShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.target.isContentEditable) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const k = e.key.toLowerCase();
            if (k === 'v') { handleToolClick('select'); }
            else if (k === 't') { e.preventDefault(); handleToolClick('text'); }
            else if (k === 's') { handleToolClick('sticker'); }
            else if (k === 'p') { e.preventDefault(); handleToolClick('draw'); }
            else if (k === 'b') { handleToolClick('bg'); }
            else if (k === 'r') { e.preventDefault(); handleToolClick('shape'); }
            else if (k === 'escape') {
                if (window.Doodle && Doodle.isActive && Doodle.isActive()) {
                    Doodle.setDrawMode(false);
                    setActive('select');
                }
                if (window.Shapes && typeof Shapes.setDrawMode === 'function') {
                    try { Shapes.setDrawMode(null); } catch (e) {}
                    setActive('select');
                }
            }
        });
    }

    function init() {
        if (inited) return;
        inited = true;
        bindEvents();
        bindShortcuts();
        setActive('select');
        console.log('[LeftRail] 初始化完成');
    }

    return { init, setActive };
})();

window.LeftRail = LeftRail;

// ✅ 立即初始化（不等 300ms，让左栏工具尽快可用）
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        try { LeftRail.init(); } catch (e) { console.warn('[LeftRail] 初始化失败', e); }
    });
} else {
    // DOM 已就绪，立即初始化
    try { LeftRail.init(); } catch (e) { console.warn('[LeftRail] 初始化失败', e); }
}