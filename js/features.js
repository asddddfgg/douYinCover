// ============================================================
// features.js —— 标记 / 主题 / 排版 / 安全区
// 挂在 window.Features，由 app.js 末尾初始化
// ============================================================

const Features = (function () {
    let markColor = '#ff2442';
    let markWidth = 4;

    function getSelectedTextLayer() {
        const layer = state.getSelectedLayer && state.getSelectedLayer();
        if (!layer || layer.type !== 'text') return null;
        return layer;
    }

    // ============================================================
    // 1. 文字强调标记
    // ============================================================

    // ============================================================
    // 行内标记：只标记选中的文字（走 SelectionCore）
    // ============================================================
    function applyInlineMark(kind) {
        // ✅ P0：正在编辑文字但无选区 → 提示，不退回整层
        if (state.editingLayerId) {
            if (typeof SelectionCore === 'undefined' || !SelectionCore.hasUsableSelection || !SelectionCore.hasUsableSelection()) {
                if (typeof showBgToast === 'function') {
                    showBgToast('请先选中要强调的文字，再点标记');
                }
                return;
            }
        } else {
            // 真的没有编辑态 → 才退回整层标记
            return applyMark(kind);
        }

        // 圈/框这类“外框”在行内用 border 表现；下划线/高亮用装饰/背景
        const styleList = [];
        if (kind === 'circle' || kind === 'box') {
            styleList.push({ prop: 'border', val: `${markWidth}px solid ${markColor}` });
            styleList.push({ prop: 'border-radius', val: kind === 'circle' ? '999px' : '6px' });
            styleList.push({ prop: 'padding', val: `0 ${Math.max(2, markWidth)}px` });
            styleList.push({ prop: 'display', val: 'inline-block' });
        } else if (kind === 'underline') {
            styleList.push({ prop: 'border-bottom', val: `${markWidth}px solid ${markColor}` });
            styleList.push({ prop: 'padding-bottom', val: '1px' });
        } else if (kind === 'highlight') {
            styleList.push({ prop: 'background-color', val: hexToRgba(markColor, 0.35) });
            styleList.push({ prop: 'border-radius', val: '3px' });
            styleList.push({ prop: 'padding', val: '0 2px' });
        } else if (kind === 'wavy') {
            styleList.push({ prop: 'text-decoration', val: `underline wavy ${markColor}` });
            styleList.push({ prop: 'text-decoration-thickness', val: `${markWidth}px` });
            styleList.push({ prop: 'text-underline-offset', val: '2px' });
        } else if (kind === 'strike') {
            styleList.push({ prop: 'text-decoration', val: `line-through ${markColor}` });
            styleList.push({ prop: 'text-decoration-thickness', val: `${markWidth}px` });
        } else if (kind === 'block') {
            styleList.push({ prop: 'background-color', val: markColor });
            styleList.push({ prop: 'color', val: '#ffffff' });
            styleList.push({ prop: 'padding', val: `0 ${Math.max(2, markWidth)}px` });
            styleList.push({ prop: 'border-radius', val: '3px' });
            styleList.push({ prop: 'box-decoration-break', val: 'clone' });
            styleList.push({ prop: '-webkit-box-decoration-break', val: 'clone' });
        } else if (kind === 'marker') {
            const base = hexToRgba(markColor, 0.45);
            const soft = hexToRgba(markColor, 0.18);
            styleList.push({
                prop: 'background-image',
                val: `linear-gradient(100deg, ${soft} 0%, ${base} 12%, ${base} 88%, ${soft} 100%)`
            });
            styleList.push({ prop: 'padding', val: `0 ${Math.max(3, markWidth)}px` });
            styleList.push({ prop: 'border-radius', val: '2px' });
            styleList.push({ prop: 'box-decoration-break', val: 'clone' });
            styleList.push({ prop: '-webkit-box-decoration-break', val: 'clone' });
        } else if (kind === 'stroke') {
            styleList.push({ prop: '-webkit-text-stroke', val: `${Math.max(1, markWidth / 2)}px ${markColor}` });
            styleList.push({ prop: 'paint-order', val: 'stroke fill' });
        }

        const res = SelectionCore.applyStyle(styleList);
        if (!res || !res.ok) {
            console.warn('[InlineMark] 包裹失败');
            if (typeof showBgToast === 'function') {
                showBgToast('标记应用失败，请重新选中文字后再试');
            }
        }
    }



        function applyMark(kind) {
        const layer = getSelectedTextLayer();
        if (!layer) { alert('请先选中一个文字图层'); return; }
        // 波浪/删除线/描边是纯文字样式，不需要底衬盒子，直接套到整层文字上
        if (kind === 'wavy' || kind === 'strike' || kind === 'stroke') {
            const ti = document.querySelector(`.canvas-layer[data-id="${layer.id}"] .text-content-editable`);
            if (ti) {
                if (kind === 'wavy') {
                    ti.style.textDecoration = `underline wavy ${markColor}`;
                    ti.style.textDecorationThickness = `${markWidth}px`;
                    ti.style.textUnderlineOffset = '2px';
                } else if (kind === 'strike') {
                    ti.style.textDecoration = `line-through ${markColor}`;
                    ti.style.textDecorationThickness = `${markWidth}px`;
                } else if (kind === 'stroke') {
                    ti.style.webkitTextStroke = `${Math.max(1, markWidth / 2)}px ${markColor}`;
                    ti.style.paintOrder = 'stroke fill';
                }
            }
            // 同步到 layer 字段，方便持久化
            if (!layer.textStyle) layer.textStyle = {};
            layer.textStyle[kind] = { color: markColor, width: markWidth };
            state.saveState();
            return;
        }
        // 其它 6 种走 backdrop 盒子
        if (!layer.backdrop) {
            layer.backdrop = { type: 'none', color: '#fff8dc', opacity: 1, padding: 12, rotate: 0 };
        }
        const bd = layer.backdrop;
        bd.type = 'mark';
        bd.markKind = kind;
        bd.markColor = markColor;
        bd.markWidth = markWidth;
        bd.padding = Math.max(8, markWidth * 3);
        bd.opacity = 1;
        bd.rotate = 0;
        state.saveState();
        renderCanvas();
        renderLayerList();
    }

        function clearMark() {
                // 1. 有选区 → 清选区内的行内标记 span
        let ctx = (typeof getActiveSelectionRange === 'function') ? getActiveSelectionRange() : null;
        if ((!ctx || ctx.collapsed) && typeof _savedSelectionContext !== 'undefined' && _savedSelectionContext) {
            try {
                const r = _savedSelectionContext.range;
                r.startContainer; r.endContainer;
                if (!r.collapsed && _savedSelectionContext.el && document.body.contains(_savedSelectionContext.el)) {
                    ctx = { el: _savedSelectionContext.el, range: r, sel: null, collapsed: false };
                }
            } catch (e) {}
        }
        if (ctx && !ctx.collapsed) {
            if (typeof clearEffectSpansInSelection === 'function') {
                clearEffectSpansInSelection(ctx);
            }
            const layer = state.layers.find(l => l.id === state.editingLayerId);
            if (layer) layer.content = ctx.el.innerHTML;
            if (typeof updateTopToolbarUI === 'function') updateTopToolbarUI(state.getSelectedLayer());
            state.saveState();
            return;
        }
                // 2. 无选区 → 清整层 mark 底衬 + 纯文字样式
        const layer = getSelectedTextLayer();
        if (!layer) return;
        if (layer.backdrop && layer.backdrop.type === 'mark') {
            layer.backdrop.type = 'none';
        }
        if (layer.textStyle) {
            const ti = document.querySelector(`.canvas-layer[data-id="${layer.id}"] .text-content-editable`);
            if (ti) {
                ti.style.textDecoration = '';
                ti.style.textDecorationThickness = '';
                ti.style.textUnderlineOffset = '';
                ti.style.webkitTextStroke = '';
                ti.style.paintOrder = '';
            }
            delete layer.textStyle;
        }
        state.saveState();
        renderCanvas();
    }

    // ============================================================
    // 2. 智能排版模板
    // ============================================================
    function applyLayout(kind) {
        const page = state.getCurrentPage();
        const texts = page.layers.filter(l => l.type === 'text');
        const stickers = page.layers.filter(l => l.type === 'sticker');
        const W = 360, H = 640, M = 24;
        if (kind === 'title-center') {
            if (texts[0]) { texts[0].x = M; texts[0].y = 60; texts[0].width = W - M * 2; texts[0].align = 'center'; }
            if (texts[1]) { texts[1].x = M; texts[1].y = H - 180; texts[1].width = W - M * 2; texts[1].align = 'center'; }
            if (stickers[0]) { stickers[0].x = (W - stickers[0].width) / 2; stickers[0].y = 240; }
        } else if (kind === 'left-right') {
            if (texts[0]) { texts[0].x = M; texts[0].y = 120; texts[0].width = W / 2 - M; texts[0].align = 'left'; }
            if (texts[1]) { texts[1].x = M; texts[1].y = 320; texts[1].width = W / 2 - M; texts[1].align = 'left'; }
            if (stickers[0]) { stickers[0].x = W / 2 + 10; stickers[0].y = H / 2 - stickers[0].height / 2; }
        } else if (kind === 'big-center') {
            if (texts[0]) { texts[0].x = M; texts[0].y = H / 2 - 60; texts[0].width = W - M * 2; texts[0].align = 'center'; texts[0].fontSize = '48px'; }
            if (texts[1]) { texts[1].x = M; texts[1].y = H / 2 + 60; texts[1].width = W - M * 2; texts[1].align = 'center'; }
        } else if (kind === 'three-col') {
            const colW = (W - M * 2) / 3;
            texts.forEach((t, i) => {
                if (i < 3) { t.x = M + i * colW; t.y = 200; t.width = colW - 8; t.align = 'center'; }
            });
            stickers.forEach((s, i) => {
                if (i < 3) { s.x = M + i * colW + (colW - s.width) / 2; s.y = 420; }
            });
        }
        state.saveState();
        renderCanvas();
        renderLayerList();
        if (typeof showBgToast === 'function') showBgToast('排版已应用 ✓');
    }

    // ============================================================
    // 6. 安全区参考线
    // ============================================================
    let safeAreaVisible = false;
    function toggleSafeArea() {
        safeAreaVisible = !safeAreaVisible;
        document.querySelectorAll('.safe-area-layer').forEach(el => el.remove());
        if (!safeAreaVisible) return;
        document.querySelectorAll('.canvas-page-wrapper').forEach(wrapper => {
            const canvas = wrapper.querySelector('.cover-canvas');
            if (!canvas) return;
            const layer = document.createElement('div');
            layer.className = 'safe-area-layer';
            layer.style.cssText = 'position:absolute;left:10%;top:12%;right:10%;bottom:16%;border:2px dashed rgba(0,229,255,0.7);border-radius:4px;pointer-events:none;z-index:60;';
            const label = document.createElement('div');
            label.style.cssText = 'position:absolute;top:-18px;left:0;font-size:10px;color:#00e5ff;background:rgba(0,0,0,0.6);padding:1px 6px;border-radius:3px;';
            label.textContent = '抖音安全区';
            layer.appendChild(label);
            canvas.appendChild(layer);
        });
    }

    // ============================================================
    // 初始化
    // ============================================================
    function init() {
                               // ===== 标记按钮：点一下弹出设置面板，选种类后应用 =====
        const markPopover = document.getElementById('mark-popover');
        const tbMark = document.getElementById('tb-mark');

        // ✅ P0：选区冻结统一走 SelectionCore.freezeFromEvent，不再自己维护 _markSavedCtx
        function freezeMarkSelection(e) {
            if (typeof SelectionCore !== 'undefined' && SelectionCore.freezeFromEvent) {
                SelectionCore.freezeFromEvent(e);
            }
        }

        function openMarkPopover(anchorEl) {
            if (!markPopover || !anchorEl) return;
            const rect = anchorEl.getBoundingClientRect();
            markPopover.style.display = 'block';
            // 先展示测宽高，再决定左右/上下翻转
            markPopover.style.visibility = 'hidden';
            markPopover.style.left = '0px';
            markPopover.style.top = '0px';
            const pr = markPopover.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            let left = Math.max(8, rect.left);
            let top = rect.bottom + 6;
            if (left + pr.width > vw - 8) left = Math.max(8, vw - pr.width - 8);
            if (top + pr.height > vh - 8) top = Math.max(8, rect.top - pr.height - 6);
            markPopover.style.left = left + 'px';
            markPopover.style.top = top + 'px';
            markPopover.style.visibility = '';
        }
        function closeMarkPopover() {
            if (markPopover) markPopover.style.display = 'none';
        }

        if (tbMark) {
            tbMark.addEventListener('mousedown', (e) => {
                // mousedown 阶段冻结选区（此时焦点还在编辑区）
                e.preventDefault();
                e.stopPropagation();
                freezeMarkSelection(e);
            });
            tbMark.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const isOpen = markPopover && markPopover.style.display === 'block';
                if (isOpen) closeMarkPopover();
                else openMarkPopover(tbMark);
            });
        }
        // 点击面板外面关闭（菜单内其它控件不触发关闭）
        document.addEventListener('click', (e) => {
            if (!markPopover || markPopover.style.display !== 'block') return;
            if (markPopover.contains(e.target)) return;
            if (e.target.closest('#tb-mark')) return;
            // 菜单面板内的交互不关闭标记 popover
            if (e.target.closest('.menu-panel')) return;
            closeMarkPopover();
        });

        // 面板里的种类按钮：有选区走行内，无选区走整层
        if (markPopover) {
            markPopover.querySelectorAll('.mark-kind-btn').forEach(btn => {
                btn.addEventListener('mousedown', (e) => {
                    // 防止 mousedown 把焦点从编辑区抢走，同时冻结当前选区
                    e.preventDefault();
                    freezeMarkSelection(e);
                });
                btn.addEventListener('click', () => {
                    const kind = btn.dataset.mark;
                    const hasSel = (typeof SelectionCore !== 'undefined' && SelectionCore.hasUsableSelection)
                        ? SelectionCore.hasUsableSelection()
                        : false;
                    if (hasSel) {
                        applyInlineMark(kind);
                    } else if (state.editingLayerId) {
                        // 编辑态但无选区：提示，不退回整层
                        if (typeof showBgToast === 'function') {
                            showBgToast('请先选中要强调的文字，再点标记');
                        }
                    } else {
                        applyMark(kind);
                    }
                    closeMarkPopover();
                });
            });
        }

        // 顶部工具栏的“清除标记”按钮：唯一清除入口
        const tbMarkClear = document.getElementById('tb-mark-clear');
        if (tbMarkClear) {
            tbMarkClear.addEventListener('click', (e) => {
                e.stopPropagation();
                clearMark();
                // 关闭任何打开的菜单面板
                document.querySelectorAll('.menu-panel.open').forEach(p => p.classList.remove('open'));
            });
        }
        const markColorInput = document.getElementById('mark-color');
        if (markColorInput) markColorInput.addEventListener('input', e => { markColor = e.target.value; });
        const markWidthInput = document.getElementById('mark-width');
        const markWidthVal = document.getElementById('mark-width-val');
        if (markWidthInput) markWidthInput.addEventListener('input', e => {
            markWidth = parseInt(e.target.value, 10) || 4;
            if (markWidthVal) markWidthVal.textContent = markWidth;
        });



        let safeBtn = document.getElementById('btn-safe-area');
        if (!safeBtn) {
            safeBtn = document.createElement('button');
            safeBtn.id = 'btn-safe-area';
            safeBtn.className = 'btn';
            safeBtn.style.cssText = 'font-size:11px;';
            safeBtn.innerHTML = '<i class="fa-solid fa-crop-simple"></i> 安全区';
            const actions = document.querySelector('.app-header .actions');
            if (actions) actions.insertBefore(safeBtn, actions.lastElementChild);
        }
        safeBtn.addEventListener('click', toggleSafeArea);

        console.log('[Features] 初始化完成：标记 / 主题 / 排版 / 安全区');
    }

        return { init, applyMark, applyInlineMark, toggleSafeArea };
})();


// ============================================================
// 行内标记 5 种新样式（波浪 / 删除线 / 底色块 / 马克笔 / 描边）
// 直接注入到 <head>，不依赖 style.css
// ============================================================
(function injectInlineMarkStyles() {
    if (document.getElementById('inline-mark-styles')) return;
    const style = document.createElement('style');
    style.id = 'inline-mark-styles';
    style.textContent = `
.text-content-editable span[style*="underline wavy"] {
    text-decoration-skip-ink: none;
}
.text-content-editable span[style*="line-through"] {
    text-decoration-skip-ink: none;
}
.text-content-editable span[style*="linear-gradient"][style*="100deg"] {
    background-repeat: no-repeat;
}
.text-content-editable span[style*="-webkit-text-stroke"] {
    text-shadow: none;
}
`;
    document.head.appendChild(style);
})();



window.Features = Features;