// Canva Standard Rich Text Formatting on Selection & Top Toolbar Controls




function initTextLayersModule() {
    setupTopToolbarEvents();
    setupContextMenuEvents();
    setupBackdropPanel();
}

function applyFormattingToSelection(command, value = null) {
    document.execCommand(command, false, value);
}



/* ============================================================
   选区级特效 v3 —— 焦点保护 + 冻结 range + 手写 span
   ============================================================ */

// mousedown 阶段冻结选区快照（防焦点丢失）
let _savedSelectionContext = null;

document.addEventListener('mousedown', (e) => {
    if (!state.editingLayerId) return;
    const ctx = getActiveSelectionRange();
    if (!ctx || ctx.collapsed) return;
    // 只有点在面板类按钮上才冻结（画布内点击正常）
    if (e.target.closest('.effect-card, .btn, .tool-btn, .sidebar-left, .sidebar-right, .top-text-toolbar, .backdrop-card')) {
        _savedSelectionContext = {
            layerId: state.editingLayerId,
            el: ctx.el,
            range: ctx.range.cloneRange()
        };
        e.preventDefault();
    }
}, true);

// 取当前编辑容器内选区（优先用快照）
function getActiveSelectionRange() {
    if (!state.editingLayerId) return null;

    if (_savedSelectionContext &&
        _savedSelectionContext.layerId === state.editingLayerId &&
        document.body.contains(_savedSelectionContext.el)) {
        const r = _savedSelectionContext.range;
        try {
            r.startContainer; r.endContainer;
            return {
                el: _savedSelectionContext.el,
                range: r,
                sel: null,
                collapsed: r.collapsed
            };
        } catch (e) {
            _savedSelectionContext = null;
        }
    }

    const el = document.querySelector(
        `.canvas-layer[data-id="${state.editingLayerId}"] .text-content-editable`
    );
    if (!el || !el.isContentEditable) return null;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return null;
    return { el, range, sel, collapsed: range.collapsed };
}

// 判断特效 CSS 能否安全作用于选区
function canEffectApplyToSelection(cssText) {
    const css = (cssText || '').toLowerCase();
    if (!css) return false;
    if (css.includes('background-clip') && css.includes('text')) return false;
    if (css.includes('-webkit-text-fill-color')) return false;
    if (/(^|;|\s)animation\s*:/.test(css)) return false;
    if (css.includes('backdrop-filter')) return false;
    if (css.includes('clip-path')) return false;
    if (css.includes('mix-blend-mode')) return false;
    if (/(^|;|\s)border\s*:/.test(css)) return false;
    if (css.includes('border-radius')) return false;
    return true;
}

// 检测 HTML 是否含局部内联 color
function hasLocalInlineColor(html) {
    if (!html) return false;
    return /<span[^>]*style="[^"]*color\s*:\s*[^;"]+/i.test(html);
}

// 确保 styleWithCSS
function ensureStyleWithCSS() {
    try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
}

// 用 Range 逐文本节点切割 + 包 span（跨行安全）
function wrapSelectionWithStyle(styleList, markAsEffect = false, passedCtx = null) {
    const ctx = passedCtx || getActiveSelectionRange();
    if (!ctx || ctx.collapsed) return false;
    const range = ctx.range;
    const el = ctx.el;

    const startContainer = range.startContainer;
    const startOffset = range.startOffset;
    const endContainer = range.endContainer;
    const endOffset = range.endOffset;

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    const tasks = [];
    while (walker.nextNode()) {
        const n = walker.currentNode;
        if (!range.intersectsNode(n)) continue;
        if (!n.nodeValue || !n.nodeValue.length) continue;
        let start = 0, end = n.nodeValue.length;
        if (n === startContainer) start = startOffset;
        if (n === endContainer) end = endOffset;
        if (start >= end) continue;
        tasks.push({ node: n, start, end });
    }

    tasks.forEach(({ node, start, end }) => {
        if (!node.parentNode) return;
        const full = node.nodeValue;
        const selectedText = full.slice(start, end);
        if (!selectedText) return;
        const before = full.slice(0, start);
        const after = full.slice(end);
        const parent = node.parentNode;

        if (before) parent.insertBefore(document.createTextNode(before), node);
        const span = document.createElement('span');
        if (markAsEffect) span.dataset.effectSpan = '1';
        styleList.forEach(({ prop, val }) => {
            try { span.style.setProperty(prop, val); } catch (e) {}
        });
        span.textContent = selectedText;
        parent.insertBefore(span, node);
        if (after) parent.insertBefore(document.createTextNode(after), node);
        parent.removeChild(node);
    });

    _savedSelectionContext = null;
    return tasks.length > 0;
}


/* ============================================================
   清除选区内的"特效 span"（只清 data-effect-span="1" 的）
   - 只影响与选区相交的部分，不误伤未选中文字
   - 从内到外拆，避免嵌套 span 拆解错位
   - 只对强特效属性做清理，保留用户手动颜色/背景
   ============================================================ */
function clearEffectSpansInSelection(ctx) {
    if (!ctx || !ctx.el || !ctx.range) return null;
    const root = ctx.el;
    const range = ctx.range;

    const startInfo = getTextOffsetInRoot(root, range.startContainer, range.startOffset);
    const endInfo = getTextOffsetInRoot(root, range.endContainer, range.endOffset);
    if (startInfo === null || endInfo === null) return null;

    const effectSpans = [];
    root.querySelectorAll('[data-effect-span="1"]').forEach(sp => {
        if (range.intersectsNode(sp)) effectSpans.push(sp);
    });

    // 历史兼容：无标记、但内联 style 里含有"强特效属性"的 span 也打标
    root.querySelectorAll('span[style]').forEach(sp => {
        if (sp.dataset.effectSpan === '1') return;
        if (!range.intersectsNode(sp)) return;
        if (looksLikeEffectSpan(sp)) {
            sp.dataset.effectSpan = '1';
            effectSpans.push(sp);
        }
    });

    if (effectSpans.length === 0) {
        return { root, start: startInfo, end: endInfo };
    }

    const depthOf = (el) => {
        let d = 0, p = el;
        while (p && p !== root) { d++; p = p.parentNode; }
        return d;
    };
    effectSpans.sort((a, b) => depthOf(b) - depthOf(a));

    effectSpans.forEach(sp => {
        if (!sp.parentNode) return;
        splitAndClearEffectSpan(sp, root, range);
    });

    root.normalize();

    return { root, start: startInfo, end: endInfo };
}

/* 判断一个 span 是不是"看起来像特效"（历史兼容用）
   只认强特效属性，避免把"手动加粗+斜体"误判为特效 */
function looksLikeEffectSpan(sp) {
    if (!sp.style) return false;
    const styleProps = Array.from(sp.style).map(p => p.toLowerCase());
    const strongEffectProps = [
        'text-shadow',
        '-webkit-text-stroke',
        '-webkit-text-fill-color',
        'background-clip',
        '-webkit-background-clip',
        'filter'
    ];
    for (const p of styleProps) {
        if (strongEffectProps.includes(p)) return true;
    }
    return false;
}

/* 记录 (node, offset) 在 root 里的纯文本偏移 */
function getTextOffsetInRoot(root, node, offset) {
    if (!root.contains(node)) return null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    let total = 0;
    while (walker.nextNode()) {
        const n = walker.currentNode;
        if (n === node) return total + Math.min(offset, n.nodeValue.length);
        total += n.nodeValue.length;
    }
    return null;
}

/* 按文本偏移恢复 Selection */
function restoreSelectionByTextOffset(root, start, end) {
    if (!root || start === null || end === null) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    let acc = 0;
    let startNode = null, startOff = 0, endNode = null, endOff = 0;
    while (walker.nextNode()) {
        const n = walker.currentNode;
        const len = n.nodeValue.length;
        if (!startNode && start <= acc + len) {
            startNode = n; startOff = start - acc;
        }
        if (!endNode && end <= acc + len) {
            endNode = n; endOff = end - acc;
            break;
        }
        acc += len;
    }
    if (!startNode || !endNode) return;
    try {
        const sel = window.getSelection();
        const r = document.createRange();
        r.setStart(startNode, Math.min(startOff, startNode.nodeValue.length));
        r.setEnd(endNode, Math.min(endOff, endNode.nodeValue.length));
        sel.removeAllRanges();
        sel.addRange(r);
    } catch (e) { /* 恢复失败不抛 */ }
}

/* ============================================================
   一次性把特效 span 拆成"兄弟级三段"：
     <span data-effect-span>before</span>
     <span>core</span>                      ← core 是 sp 的兄弟，不是后代
     <span data-effect-span>after</span>
   中间层 <b>/<i>/<a> 原样保留；只去掉 sp 这一层的特效。
   ============================================================ */
function splitAndClearEffectSpan(sp, root, range) {
    const parent = sp.parentNode;
    if (!parent) return;

    const startContainer = range.startContainer;
    const startOffset = range.startOffset;
    const endContainer = range.endContainer;
    const endOffset = range.endOffset;

    // 1) 收集 sp 下所有文本节点
    const textNodes = [];
    const walker = document.createTreeWalker(sp, NodeFilter.SHOW_TEXT, null, false);
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    if (textNodes.length === 0) {
        stripEffectFromElement(sp);
        if (!sp.attributes.length && !sp.textContent && !sp.querySelector('*')) {
            parent.removeChild(sp);
        }
        return;
    }

    // 2) 计算每个文本节点与选区的交集 [s, e)
    const charMap = [];
    textNodes.forEach(node => {
        const text = node.nodeValue;
        if (!text) return;
        let s = 0, e = text.length;
        const nr = document.createRange();
        nr.selectNodeContents(node);
        const beforeSel = nr.compareBoundaryPoints(Range.END_TO_START, range) <= 0;
        const afterSel = nr.compareBoundaryPoints(Range.START_TO_END, range) >= 0;
        if (beforeSel || afterSel) {
            charMap.push({ node, text, startChar: 0, endChar: text.length, selected: false });
            return;
        }
        if (node === startContainer) s = startOffset;
        if (node === endContainer) e = endOffset;
        s = Math.max(0, Math.min(s, text.length));
        e = Math.max(0, Math.min(e, text.length));
        charMap.push({ node, text, startChar: s, endChar: e, selected: s < e });
    });

    // 3) 构造三个 fragment：before / core / after
    const beforeFrag = document.createDocumentFragment();
    const coreFrag = document.createDocumentFragment();
    const afterFrag = document.createDocumentFragment();

    const pathFromSp = (node) => {
        const path = [];
        let cur = node.parentNode;
        while (cur && cur !== sp) {
            path.unshift(cur);
            cur = cur.parentNode;
        }
        return path;
    };

    charMap.forEach(c => {
        if (!c.text) return;
        const path = pathFromSp(c.node);
        if (c.selected) {
            if (c.startChar > 0) {
                appendTextWithPath(beforeFrag, path, c.text.slice(0, c.startChar));
            }
            if (c.endChar > c.startChar) {
                appendTextWithPath(coreFrag, path, c.text.slice(c.startChar, c.endChar));
            }
            if (c.endChar < c.text.length) {
                appendTextWithPath(afterFrag, path, c.text.slice(c.endChar));
            }
        } else {
            const nr = document.createRange();
            nr.selectNodeContents(c.node);
            const beforeSel = nr.compareBoundaryPoints(Range.END_TO_START, range) <= 0;
            appendTextWithPath(beforeSel ? beforeFrag : afterFrag, path, c.text);
        }
    });

    // 4) 按"有内容才插入"的原则，把 sp 替换成 1~3 段
    const hasBefore = beforeFrag.textContent.length > 0;
    const hasCore = coreFrag.textContent.length > 0;
    const hasAfter = afterFrag.textContent.length > 0;

    if (!hasBefore && !hasAfter && hasCore) {
        stripEffectFromElement(sp);
        if (!sp.attributes.length) {
            const p = sp.parentNode;
            if (p) {
                while (sp.firstChild) p.insertBefore(sp.firstChild, sp);
                p.removeChild(sp);
            }
        }
        return;
    }

    if (hasBefore) {
        const beforeWrapper = cloneElementShallow(sp, true);
        beforeWrapper.appendChild(beforeFrag);
        parent.insertBefore(beforeWrapper, sp);
    }
    if (hasCore) {
        const coreWrapper = cloneElementShallow(sp, false);
        coreWrapper.appendChild(coreFrag);
        parent.insertBefore(coreWrapper, sp);
    }
    if (hasAfter) {
        const afterWrapper = cloneElementShallow(sp, true);
        afterWrapper.appendChild(afterFrag);
        parent.insertBefore(afterWrapper, sp);
    }
    parent.removeChild(sp);
}

/* 沿原始祖先链（<b>/<i> 等）递归克隆，把一段文本塞进 frag */
function appendTextWithPath(frag, path, text) {
    if (!text) return;
    if (path.length === 0) {
        frag.appendChild(document.createTextNode(text));
        return;
    }
    let inner = document.createTextNode(text);
    for (let i = path.length - 1; i >= 0; i--) {
        const el = path[i].cloneNode(false);
        el.removeAttribute('data-effect-span');
        el.appendChild(inner);
        inner = el;
    }
    frag.appendChild(inner);
}

/* 浅克隆 sp（含 class / 非特效样式），按 keepEffect 决定是否保留特效与标记 */
function cloneElementShallow(sp, keepEffect) {
    const clone = document.createElement(sp.tagName);
    if (sp.className) clone.className = sp.className;
    for (const attr of Array.from(sp.attributes)) {
        if (attr.name === 'style' || attr.name === 'data-effect-span') continue;
        clone.setAttribute(attr.name, attr.value);
    }
    const styleAttr = sp.getAttribute('style') || '';
    if (styleAttr) {
        const tmp = document.createElement('span');
        tmp.setAttribute('style', styleAttr);
        ['text-shadow', '-webkit-text-stroke', '-webkit-text-fill-color',
         'background-clip', '-webkit-background-clip', 'filter'].forEach(p => {
            tmp.style.removeProperty(p);
        });
        const kept = tmp.getAttribute('style');
        if (kept) clone.setAttribute('style', kept);
    }
    if (keepEffect) {
        clone.dataset.effectSpan = '1';
        if (styleAttr) {
            const tmp = document.createElement('span');
            tmp.setAttribute('style', styleAttr);
            ['text-shadow', '-webkit-text-stroke', '-webkit-text-fill-color',
             'background-clip', '-webkit-background-clip', 'filter'].forEach(p => {
                const v = tmp.style.getPropertyValue(p);
                if (v) clone.style.setProperty(p, v);
            });
        }
    }
    return clone;
}

/* 去掉元素上的特效属性与标记 */
function stripEffectFromElement(el) {
    el.removeAttribute('data-effect-span');
    if (el.style) {
        ['text-shadow', '-webkit-text-stroke', '-webkit-text-fill-color',
         'background-clip', '-webkit-background-clip', 'filter'].forEach(p => {
            el.style.removeProperty(p);
        });
        if (el.style.cssText === '') el.removeAttribute('style');
    }
}






// 清除选区内局部样式
function clearLocalFormat() {
    const ctx = getActiveSelectionRange();
    if (!ctx || ctx.collapsed) {
        const layer = state.getSelectedLayer();
        if (layer && layer.type === 'text') {
            const tmp = document.createElement('div');
            tmp.innerHTML = layer.content || '';
            tmp.querySelectorAll('span').forEach(sp => {
                sp.removeAttribute('style');
            });
            layer.content = tmp.innerHTML;
            state.saveState();
            renderCanvas();
        }
        return;
    }
    ensureStyleWithCSS();
    try { document.execCommand('removeFormat'); } catch (e) {}
    const spans = ctx.el.querySelectorAll('span');
    const sel = ctx.sel;
    if (sel) {
        spans.forEach(sp => {
            if (sel.containsNode(sp, true)) {
                sp.style.backgroundColor = '';
                sp.style.color = '';
                if (!sp.getAttribute('style')) {
                    const parent = sp.parentNode;
                    while (sp.firstChild) parent.insertBefore(sp.firstChild, sp);
                    parent.removeChild(sp);
                }
            }
        });
    }
    const layer = state.layers.find(l => l.id === state.editingLayerId);
    if (layer) layer.content = ctx.el.innerHTML;
    updateTopToolbarUI(state.getSelectedLayer());
}

// 把单个特效应用到当前选区
function applyEffectToSelection(eff) {
    if (!eff || !eff.css) return;
    const ctx = getActiveSelectionRange();
    if (!ctx || ctx.collapsed) return;
    // 先清掉选区里"上一次特效"的 span（只动带 data-effect-span 的），
    // 保留前后未选中部分；清理后 DOM 会变，必须重新取选区再 wrap。
    const layerId = state.editingLayerId;
    const saved = clearEffectSpansInSelection(ctx);
    if (saved) {
        restoreSelectionByTextOffset(saved.root, saved.start, saved.end);
    }
    const newCtx = getActiveSelectionRange();
    if (!newCtx || newCtx.collapsed) return;

    const rules = [];
    eff.css.split(';').forEach(rule => {
        const colon = rule.indexOf(':');
        if (colon === -1) return;
        const prop = rule.slice(0, colon).trim();
        const val = rule.slice(colon + 1).trim();
        if (prop && val) rules.push({ prop, val });
    });
    if (rules.length === 0) return;

    const toggleCmds = {
        'font-weight': (v) => { if (v === 'bold' || parseInt(v, 10) >= 600) document.execCommand('bold'); },
        'font-style': (v) => { if (v.includes('italic')) document.execCommand('italic'); },
        'text-decoration': (v) => {
            if (v.includes('underline')) document.execCommand('underline');
            if (v.includes('line-through')) document.execCommand('strikeThrough');
        }
    };

    ensureStyleWithCSS();

    const manualList = [];
    rules.forEach(({ prop, val }) => {
        const p = prop.toLowerCase();
        if (toggleCmds[p]) {
            try { toggleCmds[p](val); } catch (e) {}
        } else {
            manualList.push({ prop, val });
        }
    });

    if (manualList.length > 0) {
        wrapSelectionWithStyle(manualList, true, newCtx);
    }

    const layer = state.layers.find(l => l.id === layerId);
    if (layer) {
        layer.content = newCtx.el.innerHTML;
        newCtx.el.classList.toggle('has-local-color', hasLocalInlineColor(layer.content));
    }

    _savedSelectionContext = null;
    updateTopToolbarUI(state.getSelectedLayer());
}

// 核心入口：有选区且特效允许 → 局部；否则 → 整层
function handleEffectClick(eff) {
    const layer = state.getSelectedLayer();
    if (!layer || layer.type !== 'text') {
        alert('请先在画布中点击选中一个【文本图层】！');
        return;
    }

    const ctx = getActiveSelectionRange();
    const hasSelection = ctx && !ctx.collapsed;

    if (hasSelection && canEffectApplyToSelection(eff.css)) {
        applyEffectToSelection(eff);
        return;
    }

    // 有选区，但这特效只支持整层 → 弹提示后再整层套
    if (hasSelection && !canEffectApplyToSelection(eff.css)) {
        if (typeof showBgToast === 'function') {
            showBgToast(`「${eff.name}」只能作用于整个图层，已为你整层套用`);
        }
    }

    layer.effectClass = eff.id;
    state.saveState();
    if (typeof renderCanvas === 'function') renderCanvas();
    if (typeof renderLayerList === 'function') renderLayerList();
    if (typeof renderEffectsGrid === 'function') renderEffectsGrid();
}

// ============ 顶部工具栏（新版：编辑态自动走选区） ============
function setupTopToolbarEvents() {
    const fontSelect = document.getElementById('tb-font');
    if (fontSelect) {
        fontSelect.addEventListener('change', (e) => {
            const ctx = getActiveSelectionRange();
            if (ctx && !ctx.collapsed) {
                ensureStyleWithCSS();
                document.execCommand('fontName', false, e.target.value);
                const layer = state.layers.find(l => l.id === state.editingLayerId);
                if (layer) layer.content = ctx.el.innerHTML;
                updateTopToolbarUI(state.getSelectedLayer());
            } else {
                const layer = state.getSelectedLayer();
                if (layer) { layer.fontFamily = e.target.value; state.saveState(); renderCanvas(); }
            }
        });
    }

    const fontSizeSelect = document.getElementById('tb-fontsize');
    if (fontSizeSelect) {
        fontSizeSelect.addEventListener('change', (e) => {
            const ctx = getActiveSelectionRange();
            if (ctx && !ctx.collapsed) {
                wrapSelectionWithStyle([{ prop: 'font-size', val: e.target.value }]);
                const layer = state.layers.find(l => l.id === state.editingLayerId);
                if (layer) layer.content = ctx.el.innerHTML;
                updateTopToolbarUI(state.getSelectedLayer());
            } else {
                const layer = state.getSelectedLayer();
                if (layer) { layer.fontSize = e.target.value; state.saveState(); renderCanvas(); }
            }
        });
    }

    const colorPicker = document.getElementById('tb-color');
    if (colorPicker) {
        colorPicker.addEventListener('input', (e) => {
            const ctx = getActiveSelectionRange();
            if (ctx && !ctx.collapsed) {
                ensureStyleWithCSS();
                document.execCommand('foreColor', false, e.target.value);
                const layer = state.layers.find(l => l.id === state.editingLayerId);
                if (layer) layer.content = ctx.el.innerHTML;
                updateTopToolbarUI(state.getSelectedLayer());
            } else {
                const layer = state.getSelectedLayer();
                if (layer) { layer.color = e.target.value; state.saveState(); renderCanvas(); }
            }
        });
    }

    const bgColorPicker = document.getElementById('tb-bgcolor');
    if (bgColorPicker) {
        bgColorPicker.addEventListener('input', (e) => {
            const ctx = getActiveSelectionRange();
            if (ctx && !ctx.collapsed) {
                ensureStyleWithCSS();
                document.execCommand('hiliteColor', false, e.target.value);
                const layer = state.layers.find(l => l.id === state.editingLayerId);
                if (layer) layer.content = ctx.el.innerHTML;
                updateTopToolbarUI(state.getSelectedLayer());
            } else {
                const layer = state.getSelectedLayer();
                if (layer) { layer.bgColor = e.target.value; state.saveState(); renderCanvas(); }
            }
        });
    }

    const bindCommand = (id, cmd) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => {
                const ctx = getActiveSelectionRange();
                if (ctx && !ctx.collapsed) {
                    ensureStyleWithCSS();
                    document.execCommand(cmd);
                    const layer = state.layers.find(l => l.id === state.editingLayerId);
                    if (layer) layer.content = ctx.el.innerHTML;
                    updateTopToolbarUI(state.getSelectedLayer());
                } else {
                    const layer = state.getSelectedLayer();
                    if (layer) {
                        const propMap = { bold: 'bold', italic: 'italic', underline: 'underline', strikeThrough: 'strike' };
                        const prop = propMap[cmd];
                        if (prop) layer[prop] = !layer[prop];
                        state.saveState(); renderCanvas();
                    }
                }
            });
        }
    };

    bindCommand('tb-bold', 'bold');
    bindCommand('tb-italic', 'italic');
    bindCommand('tb-underline', 'underline');
    bindCommand('tb-strike', 'strikeThrough');

    const bulletBtn = document.getElementById('tb-bullet');
    if (bulletBtn) {
        bulletBtn.addEventListener('click', () => {
            const ctx = getActiveSelectionRange();
            if (ctx && !ctx.collapsed) {
                document.execCommand('insertUnorderedList');
                const layer = state.layers.find(l => l.id === state.editingLayerId);
                if (layer) layer.content = ctx.el.innerHTML;
            }
        });
    }

    ['left', 'center', 'right'].forEach(align => {
        const btn = document.getElementById(`tb-align-${align}`);
        if (btn) {
            btn.addEventListener('click', () => {
                const layer = state.getSelectedLayer();
                if (layer) { layer.align = align; state.saveState(); renderCanvas(); }
            });
        }
    });

    const verticalBtn = document.getElementById('tb-vertical');
    if (verticalBtn) {
        verticalBtn.addEventListener('click', () => {
            const layer = state.getSelectedLayer();
            if (layer) { layer.vertical = !layer.vertical; state.saveState(); renderCanvas(); }
        });
    }

    const letterSpacing = document.getElementById('tb-letter-spacing');
    if (letterSpacing) {
        letterSpacing.addEventListener('input', (e) => {
            const layer = state.getSelectedLayer();
            if (layer) { layer.letterSpacing = e.target.value + 'px'; state.saveState(); renderCanvas(); }
        });
    }

    const lineHeight = document.getElementById('tb-line-height');
    if (lineHeight) {
        lineHeight.addEventListener('input', (e) => {
            const layer = state.getSelectedLayer();
            if (layer) { layer.lineHeight = e.target.value; state.saveState(); renderCanvas(); }
        });
    }

    const opacity = document.getElementById('tb-opacity');
    if (opacity) {
        opacity.addEventListener('input', (e) => {
            const layer = state.getSelectedLayer();
            if (layer) { layer.opacity = parseFloat(e.target.value); state.saveState(); renderCanvas(); }
        });
    }

    // 清除局部样式：右键粗体按钮
    const boldBtn = document.getElementById('tb-bold');
    if (boldBtn) {
        boldBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            clearLocalFormat();
        });
    }
}

// ============ 顶部工具栏状态同步（编辑态回显选区样式） ============
function updateTopToolbarUI(layer) {
    const toolbar = document.getElementById('text-toolbar');
    if (!toolbar) return;

    if (!layer || layer.type !== 'text') {
        toolbar.classList.add('is-inactive');
        return;
    }
    toolbar.classList.remove('is-inactive');

    const ctx = getActiveSelectionRange();
    const inEditing = !!ctx && !ctx.collapsed;

    let curBold, curItalic, curUnderline, curStrike;

    if (inEditing) {
        try {
            curBold = document.queryCommandState('bold');
            curItalic = document.queryCommandState('italic');
            curUnderline = document.queryCommandState('underline');
            curStrike = document.queryCommandState('strikeThrough');
        } catch (e) {
            curBold = layer.bold; curItalic = layer.italic;
            curUnderline = layer.underline; curStrike = layer.strike;
        }
    } else {
        curBold = !!layer.bold;
        curItalic = !!layer.italic;
        curUnderline = !!layer.underline;
        curStrike = !!layer.strike;
    }

    document.getElementById('tb-font').value = layer.fontFamily || 'sans-serif';
    document.getElementById('tb-fontsize').value = layer.fontSize || '28px';
    document.getElementById('tb-color').value = layer.color || '#ffffff';
    document.getElementById('tb-bgcolor').value = layer.bgColor === 'transparent' ? '#000000' : (layer.bgColor || '#000000');
    document.getElementById('tb-bold').classList.toggle('active', !!curBold);
    document.getElementById('tb-italic').classList.toggle('active', !!curItalic);
    document.getElementById('tb-underline').classList.toggle('active', !!curUnderline);
    document.getElementById('tb-strike').classList.toggle('active', !!curStrike);
    ['left', 'center', 'right'].forEach(a => {
        const btn = document.getElementById(`tb-align-${a}`);
        if (btn) btn.classList.toggle('active', layer.align === a);
    });
    document.getElementById('tb-vertical').classList.toggle('active', !!layer.vertical);
    document.getElementById('tb-letter-spacing').value = parseInt(layer.letterSpacing) || 0;
    document.getElementById('tb-line-height').value = layer.lineHeight || 1.2;
    document.getElementById('tb-opacity').value = layer.opacity !== undefined ? layer.opacity : 1;

    syncBackdropPanelToLayer(layer);
}

// 选区变化时刷新工具栏
document.addEventListener('selectionchange', () => {
    if (!state.editingLayerId) return;
    const ctx = getActiveSelectionRange();
    if (!ctx) return;
    const layer = state.layers.find(l => l.id === state.editingLayerId);
    if (layer) updateTopToolbarUI(layer);
});




function setupContextMenuEvents() {
    const menu = document.getElementById('context-menu');
    document.addEventListener('click', () => { menu.style.display = 'none'; });

    document.getElementById('ctx-copy').addEventListener('click', () => {
        const layer = state.getSelectedLayer();
        if (layer) {
            const clone = JSON.parse(JSON.stringify(layer));
            clone.id = 'layer-' + Date.now();
            clone.x += 20; clone.y += 20;
            state.addLayer(clone);
            renderCanvas();
            renderLayerList();
        }
    });

    document.getElementById('ctx-copy-style').addEventListener('click', () => {
        const layer = state.getSelectedLayer();
        if (layer) {
            state.copiedStyle = { ...layer };
            delete state.copiedStyle.id;
            delete state.copiedStyle.content;
            delete state.copiedStyle.x;
            delete state.copiedStyle.y;
            alert('图层样式已成功复制！');
        }
    });

    document.getElementById('ctx-paste').addEventListener('click', () => {
        const layer = state.getSelectedLayer();
        if (layer && state.copiedStyle) {
            Object.assign(layer, state.copiedStyle);
            state.saveState();
            renderCanvas();
            updateTopToolbarUI(layer);
        }
    });

    document.getElementById('ctx-move-up').addEventListener('click', () => {
        if (state.selectedLayerId) {
            state.moveLayer(state.selectedLayerId, 'up');
            renderCanvas();
            renderLayerList();
            updateTopToolbarUI(state.getSelectedLayer());
        }
    });

    document.getElementById('ctx-move-down').addEventListener('click', () => {
        if (state.selectedLayerId) {
            state.moveLayer(state.selectedLayerId, 'down');
            renderCanvas();
            renderLayerList();
            updateTopToolbarUI(state.getSelectedLayer());
        }
    });

    document.getElementById('ctx-flip-h').addEventListener('click', () => {
        const layer = state.getSelectedLayer();
        if (layer) { layer.flipH = !layer.flipH; state.saveState(); renderCanvas(); }
    });
    document.getElementById('ctx-flip-v').addEventListener('click', () => {
        const layer = state.getSelectedLayer();
        if (layer) { layer.flipV = !layer.flipV; state.saveState(); renderCanvas(); }
    });
    document.getElementById('ctx-rotate-90').addEventListener('click', () => {
        const layer = state.getSelectedLayer();
        if (layer) {
            layer.rotation = ((layer.rotation || 0) + 90) % 360;
            state.saveState(); renderCanvas();
        }
    });

    document.getElementById('ctx-delete').addEventListener('click', () => {
        if (state.selectedLayerId) {
            state.removeLayer(state.selectedLayerId);
            renderCanvas();
            renderLayerList();
            updateTopToolbarUI(null);
            if (typeof showStickerColorBar === 'function') showStickerColorBar(false);
        }
    });
}

/* ============================================================
   文字底衬面板
   ============================================================ */

const BACKDROP_PRESETS = [
    // 纸质
    { type: 'none', name: '无', cat: 'paper' },
    { type: 'paper', name: '横线便笺', cat: 'paper' },
    { type: 'grid', name: '方格便笺', cat: 'paper' },
    { type: 'sticky', name: '便利贴', cat: 'paper' },
    { type: 'notebook', name: '笔记本内页', cat: 'paper' },
    { type: 'tape', name: '胶带贴纸', cat: 'paper' },
    { type: 'torn', name: '基础撕边', cat: 'paper' },
    // 材质
    { type: 'kraft', name: '牛皮纸', cat: 'texture' },
    { type: 'fiber', name: '纸张纤维', cat: 'texture' },
    { type: 'watercolor', name: '水彩纸', cat: 'texture' },
    { type: 'xuan', name: '宣纸', cat: 'texture' },
    { type: 'parchment', name: '羊皮纸', cat: 'texture' },
    { type: 'newspaper', name: '旧报纸', cat: 'texture' },
    { type: 'chalkboard', name: '黑板', cat: 'texture' },
    { type: 'cork', name: '软木板', cat: 'texture' },
    { type: 'canvas-texture', name: '油画布', cat: 'texture' },
    { type: 'linen', name: '亚麻布', cat: 'texture' },
    // 装饰
    { type: 'glass', name: '毛玻璃', cat: 'decor' },
    { type: 'brush', name: '荧光笔', cat: 'decor' },
    { type: 'polaroid', name: '拍立得', cat: 'decor' },
    { type: 'ticket', name: '车票/电影票', cat: 'decor' },
    { type: 'washi', name: '日式和纸', cat: 'decor' }
];

let currentBackdropCategory = 'paper';
let backdropCache = {};   // custom id -> dataUrl

function setupBackdropPanel() {
    // 分类切换
    const tabsEl = document.getElementById('backdrop-tabs');
    if (tabsEl) {
        tabsEl.querySelectorAll('.backdrop-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                tabsEl.querySelectorAll('.backdrop-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentBackdropCategory = tab.dataset.cat;
                renderBackdropGrid();
            });
        });
    }

    renderBackdropGrid();

    // 上传
    const btnUpload = document.getElementById('btn-backdrop-upload');
    const fileInput = document.getElementById('backdrop-file-input');
    if (btnUpload && fileInput) {
        btnUpload.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || []);
            for (const file of files) {
                await uploadBackdropImage(file);
            }
            fileInput.value = '';
            await refreshCustomBackdropCache();
            renderBackdropGrid();
        });
    }

    // 查看格式
    const btnFormat = document.getElementById('btn-backdrop-format');
    if (btnFormat) {
        btnFormat.addEventListener('click', showBackdropFormatModal);
    }

    // 通用控制
    const colorInput = document.getElementById('backdrop-color');
    const padInput = document.getElementById('backdrop-padding');
    const rotInput = document.getElementById('backdrop-rotate');
    const opacityInput = document.getElementById('backdrop-opacity');

    const updateLayerBackdrop = (mutator) => {
        const layer = state.getSelectedLayer();
        if (!layer || layer.type !== 'text') {
            return false;
        }
        if (!layer.backdrop) {
            layer.backdrop = { type: 'none', color: '#fff8dc', opacity: 1, padding: 12, rotate: 0 };
        }
        mutator(layer.backdrop);
        state.saveState();
        renderCanvas();
        return true;
    };

    if (colorInput) colorInput.addEventListener('input', (e) => {
        updateLayerBackdrop(bd => bd.color = e.target.value);
    });
    if (padInput) padInput.addEventListener('input', (e) => {
        const valEl = document.getElementById('backdrop-pad-val');
        if (valEl) valEl.textContent = e.target.value;
        updateLayerBackdrop(bd => bd.padding = parseInt(e.target.value, 10));
    });
    if (rotInput) rotInput.addEventListener('input', (e) => {
        const valEl = document.getElementById('backdrop-rot-val');
        if (valEl) valEl.textContent = e.target.value;
        updateLayerBackdrop(bd => bd.rotate = parseInt(e.target.value, 10));
    });
    if (opacityInput) opacityInput.addEventListener('input', (e) => {
        const valEl = document.getElementById('backdrop-opacity-val');
        if (valEl) valEl.textContent = e.target.value;
        updateLayerBackdrop(bd => bd.opacity = parseInt(e.target.value, 10) / 100);
    });

    // 自定义专用控件
    const sizeModeSel = document.getElementById('backdrop-sizemode');
    if (sizeModeSel) sizeModeSel.addEventListener('change', (e) => {
        updateLayerBackdrop(bd => bd.sizeMode = e.target.value);
    });
    const overlayInput = document.getElementById('backdrop-overlay-color');
    if (overlayInput) overlayInput.addEventListener('input', (e) => {
        updateLayerBackdrop(bd => bd.overlayColor = e.target.value);
    });
    const clearOverlayBtn = document.getElementById('btn-backdrop-clear-overlay');
    if (clearOverlayBtn) clearOverlayBtn.addEventListener('click', () => {
        updateLayerBackdrop(bd => bd.overlayColor = null);
    });

    // 初始化自定义底衬缓存
    refreshCustomBackdropCache().then(() => renderBackdropGrid());
}

function renderBackdropGrid() {
    const grid = document.getElementById('backdrop-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (currentBackdropCategory === 'custom') {
        renderCustomBackdropGrid(grid);
        return;
    }

    const list = BACKDROP_PRESETS.filter(p => p.cat === currentBackdropCategory);
    list.forEach(preset => {
        const card = createBackdropCard(preset);
        grid.appendChild(card);
    });
}

function createBackdropCard(preset) {
    const card = document.createElement('div');
    card.className = 'backdrop-card';
    card.dataset.backdropType = preset.type;

    const currentLayer = state.getSelectedLayer();
    if (currentLayer && currentLayer.backdrop && currentLayer.backdrop.type === preset.type) {
        card.classList.add('active');
    }

    const preview = document.createElement('div');
    preview.className = 'bd-preview';
    preview.style.backgroundSize = 'cover';
    preview.style.backgroundPosition = 'center';
    preview.style.backgroundRepeat = 'no-repeat';

    if (preset.type === 'none') {
        preview.innerHTML = '<span style="color:#8b949e;font-size:11px;">无</span>';
        preview.style.background = 'repeating-linear-gradient(45deg, #21262d, #21262d 4px, #161b22 4px, #161b22 8px)';
    } else if (preset.type === 'custom') {
        // 由 renderCustomBackdropGrid 处理
    } else if (window.BackdropTextures && BackdropTextures.isCanvasTexture(preset.type)) {
        // Canvas 纹理预览：显式用 backgroundImage
        const dataUrl = BackdropTextures.get(preset.type, null);
        if (dataUrl) {
            preview.style.background = 'transparent';
            preview.style.backgroundImage = `url(${dataUrl})`;
            preview.style.backgroundSize = 'cover';
        } else {
            preview.style.background = '#30363d';
        }
    } else {
        // CSS 底衬预览：使用 CSS 类
        preview.classList.add(`backdrop-${preset.type}`);
        if (preset.type === 'brush') {
            preview.style.background = 'rgba(255,235,59,0.55)';
        }
    }

    const name = document.createElement('div');
    name.className = 'bd-name';
    name.textContent = preset.name;

    card.appendChild(preview);
    card.appendChild(name);

    card.addEventListener('click', () => {
        const layer = state.getSelectedLayer();
        if (!layer || layer.type !== 'text') {
            alert('请先选中一个文字图层');
            return;
        }
        if (!layer.backdrop) {
            layer.backdrop = { color: '#fff8dc', opacity: 1, padding: 12, rotate: 0 };
        }
        layer.backdrop.type = preset.type;
        if (preset.type === 'custom') return;

        // Canvas 纹理的默认颜色（如果用户没设过）
        if (window.BackdropTextures && BackdropTextures.isCanvasTexture(preset.type)) {
            if (!layer.backdrop.color || layer.backdrop.color === '#fff8dc') {
                // 给个更接近材质本身的默认色
                const defaults = {
                    kraft: '#d2b48c', fiber: '#f5efe0', watercolor: '#f0f4f8',
                    xuan: '#faf6ec', parchment: '#f4e4c1', newspaper: '#e8e4d8',
                    chalkboard: '#2b3a32', cork: '#b88a4e',
                    'canvas-texture': '#e6dcc8', linen: '#f0ead8'
                };
                layer.backdrop.color = defaults[preset.type] || layer.backdrop.color;
            }
        }
        state.saveState();
        renderCanvas();
        renderBackdropGrid();
        syncBackdropPanelToLayer(layer);
    });

    return card;
}

async function renderCustomBackdropGrid(grid) {
    const uploadCard = document.createElement('div');
    uploadCard.className = 'backdrop-card';
    uploadCard.style.cssText = 'display:flex;align-items:center;justify-content:center;min-height:70px;border-style:dashed;';
    uploadCard.innerHTML = '<div style="color:#8b949e;font-size:20px;">+</div>';
    uploadCard.addEventListener('click', () => {
        document.getElementById('backdrop-file-input').click();
    });
    grid.appendChild(uploadCard);

    try {
        const items = await BackdropDB.getAllBackdrops();
        if (items.length === 0) return;
        for (const item of items) {
            backdropCache[item.id] = item.dataUrl;
            const card = document.createElement('div');
            card.className = 'backdrop-card';
            card.dataset.backdropType = 'custom';
            card.dataset.customId = item.id;

            const currentLayer = state.getSelectedLayer();
            if (currentLayer && currentLayer.backdrop && currentLayer.backdrop.type === 'custom'
                && String(currentLayer.backdrop.customId) === String(item.id)) {
                card.classList.add('active');
            }

            const preview = document.createElement('div');
            preview.className = 'bd-preview';
            preview.style.backgroundImage = `url(${item.dataUrl})`;
            preview.style.backgroundSize = 'cover';
            preview.style.backgroundPosition = 'center';

            const name = document.createElement('div');
            name.className = 'bd-name';
            name.textContent = item.name;

            const del = document.createElement('div');
            del.className = 'bd-del';
            del.innerHTML = '×';
            del.title = '删除此底衬';
            del.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm(`确定删除底衬 "${item.name}" 吗？`)) return;
                await BackdropDB.deleteBackdrop(item.id);
                delete backdropCache[item.id];
                renderBackdropGrid();
            });

            card.appendChild(preview);
            card.appendChild(name);
            card.appendChild(del);

            card.addEventListener('click', () => {
                const layer = state.getSelectedLayer();
                if (!layer || layer.type !== 'text') {
                    alert('请先选中一个文字图层');
                    return;
                }
                if (!layer.backdrop) {
                    layer.backdrop = { color: '#ffffff', opacity: 1, padding: 12, rotate: 0 };
                }
                layer.backdrop.type = 'custom';
                layer.backdrop.customId = item.id;
                layer.backdrop.sizeMode = layer.backdrop.sizeMode || 'cover';
                state.saveState();
                renderCanvas();
                renderBackdropGrid();
                syncBackdropPanelToLayer(layer);
            });

            grid.appendChild(card);
        }
    } catch (e) {
        console.error('读取自定义底衬失败:', e);
    }
}

async function uploadBackdropImage(file) {
    try {
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = evt => resolve(evt.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        await BackdropDB.addBackdrop(file.name, dataUrl);
        alert(`底衬图片 "${file.name}" 上传成功！已保存到"自定义"分类。`);
    } catch (err) {
        console.error('上传底衬失败:', err);
        alert('上传失败：' + err.message);
    }
}

async function refreshCustomBackdropCache() {
    try {
        const items = await BackdropDB.getAllBackdrops();
        backdropCache = {};
        items.forEach(it => { backdropCache[it.id] = it.dataUrl; });
    } catch (e) { /* ignore */ }
}

function syncBackdropPanelToLayer(layer) {
    if (!layer || layer.type !== 'text') return;
    const bd = layer.backdrop || { type: 'none', color: '#fff8dc', opacity: 1, padding: 12, rotate: 0 };

    const colorInput = document.getElementById('backdrop-color');
    const padInput = document.getElementById('backdrop-padding');
    const padVal = document.getElementById('backdrop-pad-val');
    const rotInput = document.getElementById('backdrop-rotate');
    const rotVal = document.getElementById('backdrop-rot-val');
    const opInput = document.getElementById('backdrop-opacity');
    const opVal = document.getElementById('backdrop-opacity-val');

    if (colorInput) colorInput.value = bd.color || '#fff8dc';
    if (padInput) padInput.value = bd.padding !== undefined ? bd.padding : 12;
    if (padVal) padVal.textContent = bd.padding !== undefined ? bd.padding : 12;
    if (rotInput) rotInput.value = bd.rotate || 0;
    if (rotVal) rotVal.textContent = bd.rotate || 0;
    if (opInput) opInput.value = Math.round((bd.opacity !== undefined ? bd.opacity : 1) * 100);
    if (opVal) opVal.textContent = Math.round((bd.opacity !== undefined ? bd.opacity : 1) * 100);

    // 自定义控件显隐
    const customCtrl = document.getElementById('backdrop-custom-controls');
    if (customCtrl) {
        customCtrl.style.display = (bd.type === 'custom') ? 'block' : 'none';
    }
    const sizeModeSel = document.getElementById('backdrop-sizemode');
    if (sizeModeSel) sizeModeSel.value = bd.sizeMode || 'cover';
    const overlayInput = document.getElementById('backdrop-overlay-color');
    if (overlayInput && bd.overlayColor) overlayInput.value = bd.overlayColor;

    // 刷新网格 active 状态
    document.querySelectorAll('.backdrop-card').forEach(card => {
        const t = card.dataset.backdropType;
        const cid = card.dataset.customId;
        if (bd.type === 'custom' && cid && String(cid) === String(bd.customId)) {
            card.classList.add('active');
        } else if (bd.type !== 'custom' && t === bd.type) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });
}

/* ============================================================
   底衬格式查看/复制弹窗
   ============================================================ */
function showBackdropFormatModal() {
    let existing = document.getElementById('backdrop-format-modal');
    if (existing) existing.remove();

    const sampleJson = `{\n  "type": "kraft",\n  "color": "#d2b48c",\n  "opacity": 0.95,\n  "padding": 16,\n  "rotate": -1.5\n}`;
    const sampleCustomJson = `{\n  "type": "custom",\n  "customId": 3,\n  "sizeMode": "cover",\n  "opacity": 0.9,\n  "padding": 14,\n  "rotate": -2,\n  "overlayColor": "#000000"\n}`;

    const currentLayer = state.getSelectedLayer();
    let currentJson = '';
    if (currentLayer && currentLayer.type === 'text' && currentLayer.backdrop) {
        currentJson = JSON.stringify(currentLayer.backdrop, null, 2);
    }

    const modal = document.createElement('div');
    modal.id = 'backdrop-format-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#161b22;border:1px solid #30363d;border-radius:8px;width:520px;max-width:92vw;max-height:88vh;overflow-y:auto;padding:20px;color:#c9d1d9;box-shadow:0 8px 24px rgba(0,0,0,0.8);font-size:12px;';

    box.innerHTML = `
        <h3 style="margin-bottom:10px;color:#f1e05a;font-size:14px;"><i class="fa-solid fa-code"></i> 底衬格式说明</h3>
        <p style="margin-bottom:8px;line-height:1.4;color:#8b949e;">下面是可以直接粘贴到 <code style="color:#58a6ff;">layer.backdrop</code> 的结构。所有字段均为可选，缺省时用默认值。</p>

        <div style="margin-bottom:10px;">
            <div style="font-weight:bold;color:#c9d1d9;margin-bottom:4px;">预设底衬示例</div>
            <textarea readonly style="width:100%;height:110px;background:#0d1117;border:1px solid #30363d;color:#58a6ff;padding:8px;border-radius:4px;font-family:monospace;font-size:11px;resize:none;outline:none;user-select:text;">${sampleJson}</textarea>
            <div style="margin-top:4px;text-align:right;">
                <button class="btn" data-copy-sample="preset" style="padding:2px 8px;font-size:10px;"><i class="fa-solid fa-copy"></i> 复制</button>
            </div>
        </div>

        <div style="margin-bottom:10px;">
            <div style="font-weight:bold;color:#c9d1d9;margin-bottom:4px;">自定义上传底衬示例</div>
            <textarea readonly style="width:100%;height:130px;background:#0d1117;border:1px solid #30363d;color:#58a6ff;padding:8px;border-radius:4px;font-family:monospace;font-size:11px;resize:none;outline:none;user-select:text;">${sampleCustomJson}</textarea>
            <div style="margin-top:4px;text-align:right;">
                <button class="btn" data-copy-sample="custom" style="padding:2px 8px;font-size:10px;"><i class="fa-solid fa-copy"></i> 复制</button>
            </div>
        </div>

        ${currentJson ? `
        <div style="margin-bottom:10px;border-top:1px dashed #30363d;padding-top:8px;">
            <div style="font-weight:bold;color:#f1e05a;margin-bottom:4px;">当前选中图层的底衬配置</div>
            <textarea readonly style="width:100%;height:120px;background:#0d1117;border:1px solid #30363d;color:#7ee787;padding:8px;border-radius:4px;font-family:monospace;font-size:11px;resize:none;outline:none;user-select:text;">${currentJson}</textarea>
            <div style="margin-top:4px;text-align:right;">
                <button class="btn" data-copy-current="1" style="padding:2px 8px;font-size:10px;"><i class="fa-solid fa-copy"></i> 复制当前</button>
            </div>
        </div>
        ` : ''}

        <div style="margin-top:10px;font-size:11px;color:#8b949e;line-height:1.6;">
            <b>字段说明：</b><br>
            <code style="color:#58a6ff;">type</code>：底衬类型，可选值见下方完整列表<br>
            <code style="color:#58a6ff;">color</code>：主色（十六进制）<br>
            <code style="color:#58a6ff;">opacity</code>：透明度 0~1<br>
            <code style="color:#58a6ff;">padding</code>：外扩边距（px）<br>
            <code style="color:#58a6ff;">rotate</code>：轻微旋转角度（度）<br>
            <code style="color:#58a6ff;">customId</code>：仅 custom 类型，IndexedDB 中的 id<br>
            <code style="color:#58a6ff;">sizeMode</code>：仅 custom，cover / contain / repeat<br>
            <code style="color:#58a6ff;">overlayColor</code>：仅 custom，颜色叠加，可为 null
        </div>

        <div style="margin-top:10px;font-size:11px;color:#8b949e;line-height:1.6;">
            <b>完整 type 列表：</b><br>
            <span style="color:#7ee787;">CSS</span>: none, paper, grid, sticky, notebook, tape, torn, glass, brush, polaroid, ticket, washi<br>
            <span style="color:#f1e05a;">Canvas</span>: kraft, fiber, watercolor, xuan, parchment, newspaper, chalkboard, cork, canvas-texture, linen<br>
            <span style="color:#ff7b72;">Custom</span>: custom
        </div>

        <div style="margin-top:15px;text-align:right;">
            <button id="btn-close-backdrop-modal" class="btn btn-primary" style="padding:4px 14px;font-size:11px;">关闭</button>
        </div>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);

    // 复制按钮
    box.querySelectorAll('[data-copy-sample]').forEach(btn => {
        btn.addEventListener('click', () => {
            const which = btn.dataset.copySample;
            const text = which === 'preset' ? sampleJson : sampleCustomJson;
            copyToClipboard(text);
            btn.innerHTML = '<i class="fa-solid fa-check"></i> 已复制';
            setTimeout(() => { btn.innerHTML = '<i class="fa-solid fa-copy"></i> 复制'; }, 1200);
        });
    });
    const copyCurrentBtn = box.querySelector('[data-copy-current]');
    if (copyCurrentBtn) {
        copyCurrentBtn.addEventListener('click', () => {
            copyToClipboard(currentJson);
            copyCurrentBtn.innerHTML = '<i class="fa-solid fa-check"></i> 已复制';
            setTimeout(() => { copyCurrentBtn.innerHTML = '<i class="fa-solid fa-copy"></i> 复制当前'; }, 1200);
        });
    }

    document.getElementById('btn-close-backdrop-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    // 全选方便复制
    box.querySelectorAll('textarea').forEach(ta => {
        ta.addEventListener('focus', () => ta.select());
    });
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
}
function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
}