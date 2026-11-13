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
    // btn-add-text 已从顶栏删除，改由左栏 text 工具接管（见 left-rail.js）
    // 这里保留兼容：如果按钮存在（老版本）才绑定
    const _btnAddText = document.getElementById('btn-add-text');
    if (_btnAddText) {
        _btnAddText.addEventListener('click', () => {
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
    }
        initExportPanel();
    renderCanvas();
    renderLayerList();
    updateTopToolbarUI(state.getSelectedLayer());

    // ===== 顶级升级模块初始化 =====
    try { MultiSelect.init(); } catch (err) { console.warn('MultiSelect init failed:', err); }
    try { Guides.init(); } catch (err) { console.warn('Guides init failed:', err); }
    try { ProjectManager.init(); } catch (err) { console.warn('ProjectManager init failed:', err); }
    try { Doodle.init(); } catch (err) { console.warn('Doodle init failed:', err); }
    try { Features.init(); } catch (err) { console.warn('Features.init failed:', err); }

    // ===== 顶栏菜单按钮重新绑定（原 actions 区已迁入菜单） =====
    try { rebindToolbarMenuActions(); } catch (err) { console.warn('[App] rebindToolbarMenuActions failed:', err); }

    // ===== 顶栏常驻 AI 推荐按钮（HTML 里没有则自动注入） =====
    try { ensureAiButton(); } catch (err) { console.warn('[App] ensureAiButton failed:', err); }

    // ===== 形状模块初始化（内部会 install 渲染补丁） =====
    setTimeout(() => {
        try {
            if (window.Shapes && typeof Shapes.init === 'function') Shapes.init();
        } catch (err) { console.warn('[App] Shapes.init failed:', err); }
    }, 350);

    // ===== AI 方案导入面板（可选模块，存在才初始化） =====
    setTimeout(() => {
        try {
            if (window.AiImportUI && typeof AiImportUI.init === 'function') AiImportUI.init();
        } catch (err) { console.warn('[App] AiImportUI.init failed:', err); }
    }, 700);

    // ===== AI 管道自测 + 依赖自检（仅 console 输出，不打扰用户） =====
    setTimeout(() => {
        try {
            if (typeof checkAiSpecDependencies === 'function') {
                const dep = checkAiSpecDependencies();
                if (dep.ok) console.log('[AI-Spec] ✅ 依赖自检通过');
                else console.warn('[AI-Spec] ⚠️ 依赖缺失:', dep.missing.join(', '));
                if (dep.optionalMissing && dep.optionalMissing.length) {
                    console.log('[AI-Spec] ℹ️ 可选依赖未加载（已走内置兜底）:', dep.optionalMissing.join(', '));
                }
            }
            if (typeof selfTestAiSpecPipeline === 'function') {
                const r = selfTestAiSpecPipeline();
                if (r.ok) console.log('[AI-Spec] ✅ 内置管道自测通过（' + r.results.length + ' 用例）');
                else {
                    console.warn('[AI-Spec] ⚠️ 自测有失败用例:');
                    r.results.forEach(x => { if (!x.ok) console.warn('  -', x.name, x.error || x.steps); });
                }
                window.__aiSelfTest = selfTestAiSpecPipeline;
            }
        } catch (err) { console.warn('[AI-Spec] 自测执行失败:', err); }
    }, 1200);
});

/* ============================================================
   顶栏常驻 AI 推荐按钮：如果 HTML 没写，自动注入到「添加文本」前
   ============================================================ */
function ensureAiButton() {
    // 顶栏 AI 推荐按钮已移除；AI 入口只剩左侧 AI 面板和工具栏空状态提示条
    return;
}

/* ============================================================
   顶栏菜单动作重新绑定
   原 actions 区的 btn-projects / btn-save-project / btn-saveas-project
   已迁入「文件▾」菜单，btn-toggle-snap / btn-clear-guides 已迁入「视图▾」菜单。
   ProjectManager.init / Guides.init 只对旧位置按钮做了绑定，迁移后需补绑。
   ============================================================ */
function rebindToolbarMenuActions() {
    // 项目列表
    const btnProjects = document.getElementById('btn-projects');
    if (btnProjects && !btnProjects.dataset.rebound) {
        btnProjects.dataset.rebound = '1';
        btnProjects.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.menu-panel.open').forEach(p => p.classList.remove('open'));
            if (window.ProjectManager && ProjectManager.openPanel) ProjectManager.openPanel();
        });
    }
    // 保存
    const btnSave = document.getElementById('btn-save-project');
    if (btnSave && !btnSave.dataset.rebound) {
        btnSave.dataset.rebound = '1';
        btnSave.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.menu-panel.open').forEach(p => p.classList.remove('open'));
            if (window.ProjectManager && ProjectManager.save) ProjectManager.save();
        });
    }
    // 另存为
    const btnSaveAs = document.getElementById('btn-saveas-project');
    if (btnSaveAs && !btnSaveAs.dataset.rebound) {
        btnSaveAs.dataset.rebound = '1';
        btnSaveAs.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.menu-panel.open').forEach(p => p.classList.remove('open'));
            if (window.ProjectManager && ProjectManager.saveAs) ProjectManager.saveAs();
        });
    }
    // 上传字体
    const btnUploadFont = document.getElementById('btn-upload-font');
    if (btnUploadFont && !btnUploadFont.dataset.rebound) {
        btnUploadFont.dataset.rebound = '1';
        btnUploadFont.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.menu-panel.open').forEach(p => p.classList.remove('open'));
            const fileInput = document.getElementById('local-font-file');
            if (fileInput) fileInput.click();
        });
    }
    // 管理字体
    const btnManageFont = document.getElementById('btn-manage-font');
    if (btnManageFont && !btnManageFont.dataset.rebound) {
        btnManageFont.dataset.rebound = '1';
        btnManageFont.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.menu-panel.open').forEach(p => p.classList.remove('open'));
            if (typeof openFontManagerModal === 'function') openFontManagerModal();
        });
    }
    // 吸附开关
    const btnSnap = document.getElementById('btn-toggle-snap');
    if (btnSnap && !btnSnap.dataset.rebound) {
        btnSnap.dataset.rebound = '1';
        btnSnap.addEventListener('click', (e) => {
            e.stopPropagation();
            // Guides.toggleSnap 内部会调 updateSnapButtonUI 更新 active 状态，此处不再手动翻转
            if (window.Guides && Guides.toggleSnap) Guides.toggleSnap();
        });
    }
    // 清参考线
    const btnClearGuides = document.getElementById('btn-clear-guides');
    if (btnClearGuides && !btnClearGuides.dataset.rebound) {
        btnClearGuides.dataset.rebound = '1';
        btnClearGuides.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.menu-panel.open').forEach(p => p.classList.remove('open'));
            if (window.state) {
                state.guides = [];
                if (window.Guides && Guides.renderGuides) Guides.renderGuides();
                if (state.saveState) state.saveState();
            }
        });
    }

    // 「视图」菜单打开时同步吸附开关按钮的 active 态
    const viewMenuTrigger = document.querySelector('.menu-trigger[data-menu="view"]');
    if (viewMenuTrigger && !viewMenuTrigger.dataset.rebound) {
        viewMenuTrigger.dataset.rebound = '1';
        viewMenuTrigger.addEventListener('click', () => {
            const snap = document.getElementById('btn-toggle-snap');
            if (snap && window.state) snap.classList.toggle('active', state.snapEnabled !== false);
        });
    }

    // 首次加载时同步一次吸附开关的初始态
    const snap0 = document.getElementById('btn-toggle-snap');
    if (snap0 && window.state) {
        snap0.classList.toggle('active', state.snapEnabled !== false);
    }

    // AI 方案面板入口（顶栏按钮）
    const btnAiPanel = document.getElementById('btn-ai-panel');
    if (btnAiPanel && !btnAiPanel.dataset.rebound) {
        btnAiPanel.dataset.rebound = '1';
        btnAiPanel.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.LeftRail && typeof LeftRail.openAiPanel === 'function') {
                LeftRail.openAiPanel();
            }
        });
    }
}

function renderAll() {
    renderCanvas();
    renderLayerList();
    renderPageList();
    updateBackgroundView();
    if (typeof updateTopToolbarUI === 'function') {
        try { updateTopToolbarUI(state.getSelectedLayer()); }
        catch (e) {
            console.error('[renderAll] updateTopToolbarUI 抛错:', e);
            if (window.Utils && Utils.log) Utils.log.error('[renderAll] updateTopToolbarUI 抛错', e);
        }
    }
    updateToolbarContext();
    if (window.BatchEdit && typeof BatchEdit.updateBadge === 'function') {
        try { BatchEdit.updateBadge(); } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[App] BatchEdit.updateBadge 失败', e);
        }
    }
}

/* ============================================================
   工具栏上下文显隐（P1）
   规则：data-ctx="always" 永远显示；"text" 仅单选文字；"multi" 仅多选
   ============================================================ */
function updateToolbarContext() {
    const toolbar = document.getElementById('text-toolbar');
    if (!toolbar) return;

    const layer = (window.state && state.getSelectedLayer) ? state.getSelectedLayer() : null;
    const selectedCount = (window.state && state.selectedLayerIds) ? state.selectedLayerIds.length : 0;
    const isMulti = selectedCount > 1;
    const isText = !!(layer && layer.type === 'text');

    // 有选中任何东西时，工具栏激活（去掉 is-inactive）
    const shouldActivate = !!layer || isMulti;
    toolbar.classList.toggle('is-inactive', !shouldActivate);

    toolbar.querySelectorAll('.toolbar-group[data-ctx]').forEach(group => {
        const ctx = group.dataset.ctx;
        let show = false;
        if (ctx === 'always') show = true;
        else if (ctx === 'text') show = isText && !isMulti;  // 多选时让位于图层组
        else if (ctx === 'multi') show = isMulti;
        group.hidden = !show;
    });

    // 空状态引导：未选中时在文字组位置显示提示 + AI 推荐入口（幂等，只创建一次）
    let emptyHint = toolbar.querySelector('.toolbar-empty-hint');
    if (!emptyHint) {
        emptyHint = document.createElement('div');
        emptyHint.className = 'toolbar-empty-hint';
        emptyHint.style.cssText = 'display:flex; align-items:center; gap:10px; color:#6e7681; font-size:12px; padding:0 12px; height:32px; white-space:nowrap;';
        emptyHint.innerHTML =
            '<span style="display:inline-flex;align-items:center;gap:6px;"><i class="fa-solid fa-arrow-pointer" style="font-size:11px;"></i> 点击画布中的图层开始编辑</span>' +
            '<span style="width:1px;height:14px;background:#30363d;"></span>' +
            '<button type="button" class="toolbar-ai-btn" title="根据当前内容智能匹配背景与特效"><i class="fa-solid fa-wand-magic-sparkles"></i> AI 智能生成</button>';
        // 插到 always 组（全局菜单）后面，而不是工具栏末尾
        const alwaysGroup = toolbar.querySelector('.toolbar-group[data-ctx="always"]');
        if (alwaysGroup && alwaysGroup.nextSibling) {
            toolbar.insertBefore(emptyHint, alwaysGroup.nextSibling);
        } else if (alwaysGroup) {
            toolbar.appendChild(emptyHint);
        } else {
            toolbar.appendChild(emptyHint);
        }
        // AI 推荐按钮绑定（空状态时走 handleEmptyStateAI，有选中时走 handleSmartRecommend）
        const aiBtn = emptyHint.querySelector('.toolbar-ai-btn');
        if (aiBtn) {
            aiBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const layer = (window.state && state.getSelectedLayer) ? state.getSelectedLayer() : null;
                if (!layer && typeof window.handleEmptyStateAI === 'function') {
                    window.handleEmptyStateAI();
                } else if (typeof window.handleSmartRecommend === 'function') {
                    window.handleSmartRecommend();
                } else if (typeof showBgToast === 'function') {
                    showBgToast('AI 推荐功能尚未就绪');
                }
            });
        }
    }
    emptyHint.hidden = shouldActivate;

    // 文字更多菜单触发按钮：无文字图层时灰显禁用（用 class 控制，disabled 会丢 tooltip）
    const moreTrigger = toolbar.querySelector('.menu-trigger[data-menu="text-more"]');
    if (moreTrigger) {
        moreTrigger.classList.toggle('is-disabled', !isText);
        moreTrigger.setAttribute('aria-disabled', String(!isText));
    }

    // 图层组里的多选徽章：仅在多选时显示
    const multiBadge = document.getElementById('multi-edit-badge');
    if (multiBadge) {
        multiBadge.style.display = (isMulti && layer) ? 'inline-flex' : 'none';
    }
}

/* ============================================================
   空状态 AI 推荐：无选中图层时，先新建文字图层 → 套智能背景
   ============================================================ */
function handleEmptyStateAI() {
    if (!window.state) return;
    // 先补一个文字图层（用户能看到“变化”）
    const newLayer = {
        id: 'text-' + Date.now(),
        type: 'text',
        content: '🔥 双击编辑爆款标题',
        fontSize: '32px',
        fontFamily: 'sans-serif',
        color: '#ffffff',
        bgColor: 'transparent',
        bold: true, italic: false, underline: false, strike: false,
        align: 'center', vertical: false,
        letterSpacing: 0, lineHeight: 1.2, opacity: 1,
        effectClass: 'effect-viral',
        rotation: 0, flipH: false, flipV: false,
        x: 35, y: 220, width: 290, height: 120,
        heightMode: 'auto'
    };
    state.addLayer(newLayer);
    if (typeof renderAll === 'function') renderAll();
    // 再套智能背景
    if (typeof window.handleSmartRecommend === 'function') {
        setTimeout(() => { try { window.handleSmartRecommend(); } catch (e) {} }, 100);
    }
}
window.handleEmptyStateAI = handleEmptyStateAI;

/* ============================================================
   工具栏菜单下拉（文件 / 视图 / 文字更多）
   ============================================================ */
function initToolbarMenus() {
    if (window.__toolbarMenusInited) return;
    window.__toolbarMenusInited = true;

    function positionPanel(trigger, panel) {
        // ✅ 用 fixed 定位相对视口，避免被顶栏 overflow 裁切
        panel.classList.add('open');
        panel.style.visibility = 'hidden';
        panel.style.position = 'fixed';
        panel.style.left = '0px';
        panel.style.top = '0px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';

        const pr = panel.getBoundingClientRect();
        const tr = trigger.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let left = tr.left;
        let top = tr.bottom + 6;

        // 右侧溢出 → 靠右对齐
        if (left + pr.width > vw - 8) {
            left = Math.max(8, tr.right - pr.width);
        }
        // 下方溢出 → 向上弹出
        if (top + pr.height > vh - 8 && tr.top - pr.height - 6 > 8) {
            top = tr.top - pr.height - 6;
        }

        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.style.visibility = '';
    }

    const triggers = document.querySelectorAll('.menu-trigger');
    triggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (trigger.classList.contains('is-disabled')) return;
            const menuName = trigger.dataset.menu;
            const panel = document.getElementById(`menu-${menuName}-panel`);
            if (!panel) return;
            const isOpen = panel.classList.contains('open');
            // 先关掉所有其它面板
            document.querySelectorAll('.menu-panel.open').forEach(p => p.classList.remove('open'));
            if (!isOpen) {
                if (typeof window.__hideTooltipImmediate === 'function') {
                    window.__hideTooltipImmediate();
                }
                positionPanel(trigger, panel);
            }
        });
    });

    // 点击面板外关闭（mark-popover / 顶栏自身 / 菜单内点击 不计入外部）
    document.addEventListener('click', (e) => {
        if (e.target.closest('.menu-dropdown')) return;
        if (e.target.closest('#mark-popover')) return;
        if (e.target.closest('.mark-popover')) return;
        // 点击顶栏其它按钮（如 B/I/U/S）不应关闭已经打开的菜单
        if (e.target.closest('#text-toolbar') && !e.target.closest('.menu-panel')) return;
        document.querySelectorAll('.menu-panel.open').forEach(p => p.classList.remove('open'));
    });

    // 菜单内部的一次性动作按钮（非 range/color/select）：点击后自动关闭菜单
    document.addEventListener('click', (e) => {
        const menuPanel = e.target.closest('.menu-panel');
        if (!menuPanel) return;
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' && (e.target.type === 'range' || e.target.type === 'color' || e.target.type === 'number')) return;
        if (tag === 'select') return;
        if (tag === 'option') return;
        // 点击的按钮若显式声明 data-keep-open，则保留菜单
        if (e.target.closest('[data-keep-open]')) return;
        const btn = e.target.closest('button');
        if (!btn) return;
        // 与 menu-trigger 同级的触发按钮不关闭（切菜单时由 trigger 逻辑控制）
        if (btn.classList.contains('menu-trigger')) return;
        menuPanel.classList.remove('open');
    });

    // ESC 关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.menu-panel.open').forEach(p => p.classList.remove('open'));
        }
    });

    // 窗口尺寸变化时关闭已打开菜单，避免锚点漂移（若焦点在滑块/颜色控件则保留）
    window.addEventListener('resize', () => {
        const ae = document.activeElement;
        if (ae && ae.tagName === 'INPUT' && (ae.type === 'range' || ae.type === 'color')) return;
        document.querySelectorAll('.menu-panel.open').forEach(p => p.classList.remove('open'));
    });
    // 只在画布容器滚动时关闭菜单，避免顶栏自身横滚（overflow-x:auto）触发菜单关闭
    const canvasContainerEl = document.querySelector('.canvas-container');
    if (canvasContainerEl) {
        canvasContainerEl.addEventListener('scroll', () => {
            if (document.querySelector('.menu-panel.open')) {
                document.querySelectorAll('.menu-panel.open').forEach(p => p.classList.remove('open'));
            }
        }, { passive: true });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initToolbarMenus();
    setTimeout(() => { try { updateToolbarContext(); } catch (e) {} }, 200);
});

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

        item.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-page-act]');
            if (btn) {
                e.stopPropagation();
                const act = btn.dataset.pageAct;
                
                if (act === 'delete') {
                    if (state.pages.length <= 1) {
                        if (typeof showBgToast === 'function') showBgToast('至少保留一页');
                        return;
                    }
                    if (!confirm(`确定删除「${page.title}」吗？该操作不可撤销。`)) return;
                    state.pages = state.pages.filter(p => p.id !== page.id);
                    if (state.currentPageId === page.id) {
                        state.currentPageId = state.pages[0].id;
                    }
                    state.saveState();
                    renderAll();
                    if (typeof showBgToast === 'function') showBgToast('已删除该页');
                } 
                else if (act === 'export') {
                    const fn = (window.EXPORT && window.EXPORT.exportElementToPNG) || window.exportElementToPNG;
                    const canvasEl = document.querySelector(`.canvas-page-wrapper[data-page-id="${page.id}"] .cover-canvas`);
                    if (fn && canvasEl) {
                        if (typeof showBgToast === 'function') showBgToast('正在导出此页…');
                        fn(canvasEl, `第${index + 1}页.png`, 3).then(() => {
                            if (typeof showBgToast === 'function') showBgToast('导出成功 ✓');
                        });
                    } else {
                        if (typeof showBgToast === 'function') showBgToast('导出模块未就绪');
                    }
                }
                return;
            }
            
            // 没点按钮，就是正常切换页面
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

    if (window.FloatingToolbar && typeof FloatingToolbar.hide === 'function') {
        try { FloatingToolbar.hide(); } catch (e) {}
    }

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
    // 底衬颜色属于品牌约束：缺省/非品牌色 → 解析为精确品牌色（只读解析，不改 layer 本体）
    let bd = layer.backdrop;
    let brandFill = null, brandMark = null;
    if (window.BackdropBrand) {
        try {
            const resolved = BackdropBrand.resolve(layer);
            if (resolved && resolved.backdrop) bd = resolved.backdrop;
            brandFill = BackdropBrand.defaultColor(bd.type, layer);
            const bi = BackdropBrand.info();
            brandMark = (bi && bi.roles && bi.roles.accent) || brandFill;
        } catch (e) { }
    }


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
        el.style.setProperty('--mark-c', bd.markColor || brandMark || 'currentColor');
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
            const maskColor = bd.color || brandFill || 'transparent';
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
                el.style.background = isMask ? maskColor : (bd.color || brandFill || 'transparent');
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
            el.style.backgroundColor = bd.color || brandFill || 'transparent';
        }
        el.classList.add(`backdrop-${bd.type}`);
    } else {
        el.style.background = '';
        el.style.backgroundImage = '';
        el.classList.add(`backdrop-${bd.type}`);
        // 所有非自定义底衬统一吃品牌色填充；缺省也不回落到 #fff740/#fff8dc 等写死色
        el.style.backgroundColor = bd.color || brandFill || 'transparent';
    }

    return el;
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
        // ✅ hexToRgba 唯一实现在 utils.js（window.hexToRgba）
        const _overlayRgba = hexToRgba(bd.overlayColor, 0.35);
        el.style.backgroundImage = `linear-gradient(${_overlayRgba}, ${_overlayRgba}), url(${finalUrl})`;
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
        if (page._planLabel) pageWrapper.dataset.planLabel = page._planLabel;
        if (page._planLabel) pageWrapper.dataset.planLabel = page._planLabel;

        const badge = document.createElement('div');
        badge.className = 'page-badge';
        const _planLabel = page._planLabel || '';
        const _planPageNo = (page._planPageNo != null) ? page._planPageNo : (index + 1);
        badge.innerHTML = _planLabel
            ? `<i class="fa-solid fa-file-lines"></i> ${_planLabel}方案：第 ${_planPageNo} 页`
            : `<i class="fa-solid fa-file-lines"></i> 第 ${index + 1} 页`;
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

// 背景框类特效的判定已收口到 effects.js 的 isEffectBgBox（见下方 effectList 循环）

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

// 判断这批特效里是否有"背景框类"（唯一实现：effects.js → isEffectBgBox）
let bgBoxEffectId = null;
for (const eid of effectList) {
    const isBox = (typeof isEffectBgBox === 'function')
        ? isEffectBgBox(eid, effectParams[eid])
        : false;
    if (isBox) {
        bgBoxEffectId = eid;
        break;
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
        Utils.dom.applyCssText(textInner, cssText, [
            'background', 'background-color', 'padding', 'border-radius',
            'border', 'color', 'font-weight', 'font-style'
        ]);
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
        Utils.dom.applyCssText(textInner, mergedInlineStyle);
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
                // ✅ 字体继承修复：特效 CSS（如粉笔手写 font-family:cursive）会覆盖图层字体，
                //    导致手写体 Xiaolai 变回系统黑体。这里把所有特效 span 的 font-family
                //    强制 inherit 回图层字体，只保留非字体的其它特效属性。
                (function forceFontInheritOnEffectSpans(node) {
                    if (!node) return;
                    const spans = node.querySelectorAll('span[data-effect-span], span[class*="effect-"]');
                    spans.forEach(sp => {
                        try {
                            sp.style.setProperty('font-family', 'inherit', 'important');
                            sp.style.setProperty('font-size', 'inherit', 'important');
                            sp.style.setProperty('font-synthesis', 'none');
                        } catch (e) { /* 忽略 */ }
                    });
                })(textInner);
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
} else if (layer.type === 'shape') {
    // 形状图层：内层 DOM 由 Shapes 模块构建；这里先挂占位，Shapes 的 render patch 会补
    el.style.background = 'transparent';
    el.style.border = 'none';
    el.style.overflow = 'visible';
    if (window.Shapes && typeof Shapes.buildShapeDom === 'function') {
        try {
            el.appendChild(Shapes.buildShapeDom(layer));
        } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[App] Shapes.buildShapeDom 失败', e);
        }
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

        // ✅ 国际做法：给画布加上悬浮操作条（鼠标移入才显示）
        const pageActions = document.createElement('div');
        pageActions.className = 'page-actions-bar';
        pageActions.innerHTML = `
            <button class="btn btn-mini-pad" data-act="export" style="background:#fff; border:1px solid #e5e7eb; border-radius:4px; padding:2px 6px; font-size:11px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);" title="导出此页"><i class="fa-solid fa-download"></i> 导出</button>
            <button class="btn btn-mini-pad" data-act="delete" style="background:#fff; border:1px solid #e5e7eb; border-radius:4px; padding:2px 6px; font-size:11px; color:#f85149; box-shadow: 0 1px 2px rgba(0,0,0,0.05);" title="删除此页"><i class="fa-solid fa-trash"></i></button>
        `;
        
        // 阻止冒泡，防止点击按钮时触发画布的选中/拖拽
        pageActions.addEventListener('mousedown', (e) => e.stopPropagation());
        pageActions.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-act]');
            if (!btn) return;
            e.stopPropagation();
            const act = btn.dataset.act;
            
            if (act === 'delete') {
                if (state.pages.length <= 1) {
                    if (typeof showBgToast === 'function') showBgToast('至少保留一页');
                    return;
                }
                if (!confirm(`确定删除「${page.title}」吗？`)) return;
                state.pages = state.pages.filter(p => p.id !== page.id);
                if (state.currentPageId === page.id) state.currentPageId = state.pages[0].id;
                state.saveState();
                renderAll();
            } else if (act === 'export') {
                const fn = (window.EXPORT && window.EXPORT.exportElementToPNG) || window.exportElementToPNG;
                if (fn && canvasEl) {
                    if (typeof showBgToast === 'function') showBgToast('正在导出…');
                    fn(canvasEl, `${page.title}.png`, 3).then(() => {
                        if (typeof showBgToast === 'function') showBgToast('导出成功 ✓');
                    });
                }
            }
        });
        pageWrapper.appendChild(pageActions);
        container.appendChild(pageWrapper);
        if (window.BG && typeof BG.applyBackgroundToCanvases === 'function') {
            BG.applyBackgroundToCanvases(state.background);
        }
    });

    if (window.BG && typeof BG.applyBackgroundToCanvases === 'function') {
        BG.applyBackgroundToCanvases(state.background);
    }

    // ✅ 逐页背景覆盖：页自带 bg（AI 多方案 / 一键成图）优先于全局背景
    //    唯一实现在 background-core.js → applyPageBackgrounds（含遮罩合成 + 清理图片遗留滤镜）
    try {
        if (typeof applyPageBackgrounds === 'function') applyPageBackgrounds();
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[renderCanvas] 逐页背景覆盖失败', e);
    }

            // 拖动/缩放/旋转进行中：跳过参考线重绘和特效面板刷新，避免每帧重开销
    if (!window.__layerDragging) {
        if (window.Guides) Guides.renderGuides();
        if (typeof refreshEffectParamsPanel === 'function' && !window.__effectParamsDragging) {
            refreshEffectParamsPanel();
        }
    }

    // ✅ 在这里加上安全区的挂载（因为此时所有的 canvasEl 都生成好了）
    if (window.Features && typeof window.Features.renderSafeAreaDOM === 'function') {
        try { window.Features.renderSafeAreaDOM(); } catch (e) {}
    }

    // 恢复滚动位置（见函数开头注释）
    container.scrollTop = _prevScrollTop;
    container.scrollLeft = _prevScrollLeft;
    // 重建 DOM 后重绘涂鸦画布
    if (window.Doodle) Doodle.redrawDrawLayers();
    // 同步浮动工具条位置与显隐
    if (window.FloatingToolbar && typeof FloatingToolbar.sync === 'function') {
        try { FloatingToolbar.sync(); } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[App] FloatingToolbar.sync 失败', e);
        }
    }

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
            : layer.type === 'shape'
                ? ({ rect: '矩形', ellipse: '圆形', line: '直线', arrow: '箭头' }[layer.shapeKind] || '形状')
                : (layer.content || '').replace(/<[^>]*>/g, '').substring(0, 10);
        const iconName = layer.type === 'text'
            ? 'fa-font'
            : layer.type === 'draw'
                ? 'fa-paintbrush'
                : layer.type === 'shape'
                    ? ({ rect: 'fa-square', ellipse: 'fa-circle', line: 'fa-minus', arrow: 'fa-arrow-right' }[layer.shapeKind] || 'fa-shapes')
                    : 'fa-face-smile';
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
/* 背景系统 v2 常量已迁移到 background-core.js，此处不再重复声明（避免 const 冲突） */

/* ============================================================
   图片背景收藏夹（v3）—— 只存在于本文件（background-core.js 依赖它）
   ⚠️ 这几段是唯一定义，删掉会让 renderBgPresetGrid / btn-fav-bg 崩溃
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

// ✅ hashString 唯一实现在 utils.js（window.hashString → Utils.string.hash）
/* ✅ 图片背景收藏夹 v3（BG_FavImageDB / saveFavImageEntry / applyFavImageEntry） */
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

            bgFavImgReady = true;

            if (typeof renderBgPresetGrid === 'function') BG.renderBgPresetGrid();
            if (typeof renderFavBackgrounds === 'function') renderFavBackgrounds();
        } catch (e) {
            console.error('加载图片收藏失败:', e);
            bgFavImgReady = true;
        }
    }, 100);
});