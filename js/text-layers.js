// ============================================================
// text-layers.js — 文字编辑 + 工具栏 + 选区写入落地
// 职责边界：
//   ✅ 负责：SelectionCore（唯一选区入口）、wrapSelectionWithStyle、
//            工具栏事件（字体/字号/颜色/加粗/对齐/行高……）、右键菜单、
//            外部粘贴、initTextLayersModule
//   ❌ 不负责：底衬面板（已迁到 backdrop-panel.js，本文件同名函数被覆盖）
//   ❌ 不负责：背景 v2（已迁到 background-core.js）
//   ❌ 不负责：画布渲染、导出
// 依赖：state、SelectionCore 消费者（brand-manager / features / app）
// 被依赖：brand-manager.js（品牌色作用于选区）、features.js（行内标记）
// ============================================================
// Canva Standard Rich Text Formatting on Selection & Top Toolbar Controls

/* ============================================================
   SelectionCore —— 选区能力的唯一收口入口（P0）
   规则：
     1) 取选区：只允许调 SelectionCore.getCtx()
     2) 写样式：只允许调 SelectionCore.applyStyle(styleList)
     3) 冻结：只允许调 SelectionCore.freezeFromEvent(e)
     4) 任何模块不得再自定义 _savedSelectionContext，不得自己调 execCommand 做行内样式
   ============================================================ */
const SelectionCore = (function () {
    let _saved = null;

    function _fromLiveSelection() {
        if (!window.state || !state.editingLayerId) return null;
        const el = document.querySelector(
            `.canvas-layer[data-id="${state.editingLayerId}"] .text-content-editable`
        );
        if (!el || !el.isContentEditable) return null;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        const range = sel.getRangeAt(0);
        if (!el.contains(range.commonAncestorContainer)) return null;
        return { el, range, sel, collapsed: range.collapsed, source: 'live' };
    }

    function _fromSaved() {
        if (!_saved) return null;
        if (!window.state || !state.editingLayerId) return null;
        if (_saved.layerId !== state.editingLayerId) return null;
        if (!document.body.contains(_saved.el)) return null;
        const r = _saved.range;
        try {
            r.startContainer; r.endContainer;
        } catch (e) {
            _saved = null;
            return null;
        }
        return { el: _saved.el, range: r, sel: null, collapsed: r.collapsed, source: 'saved' };
    }

    function getCtx() {
        return _fromSaved() || _fromLiveSelection();
    }

    function freezeFromEvent(e) {
        if (!window.state || !state.editingLayerId) return false;
        if (e && e.target && e.target.closest && e.target.closest('.backdrop-card')) return false;

        const live = _fromLiveSelection();
        if (!live || live.collapsed) return false;

        _saved = {
            layerId: state.editingLayerId,
            el: live.el,
            range: live.range.cloneRange()
        };
        return true;
    }

    function clearSaved() {
        _saved = null;
    }

    function hasUsableSelection() {
        const ctx = getCtx();
        return !!(ctx && !ctx.collapsed && ctx.el && ctx.range);
    }

    function applyStyle(styleList, options) {
        options = options || {};
        const ctx = options.ctx || getCtx();
        if (!ctx || ctx.collapsed || !ctx.el || !ctx.range) {
            return { ok: false, ctx: null };
        }
        if (!ctx.el.isContentEditable || !document.body.contains(ctx.el)) {
            return { ok: false, ctx: null };
        }
        try {
            if (!ctx.el.contains(ctx.range.commonAncestorContainer)) {
                return { ok: false, ctx: null };
            }
        } catch (e) {
            return { ok: false, ctx: null };
        }
        if (typeof wrapSelectionWithStyle !== 'function') {
            return { ok: false, ctx };
        }

        let wrapped = false;
        try {
            wrapped = wrapSelectionWithStyle(styleList, options.markAsEffect !== false, ctx);
        } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[Text] SelectionCore.applyStyle 包裹选区失败', e);
            wrapped = false;
        }

        if (!wrapped) return { ok: false, ctx };

        const layerId = ctx.el && state.editingLayerId;
        let layer = state.layers.find(l => l.id === layerId);
        if (!layer) {
            for (const p of state.pages) {
                const found = p.layers.find(l => l.id === layerId);
                if (found) { layer = found; break; }
            }
        }
        if (layer) {
            layer.content = ctx.el.innerHTML;
            if (typeof hasLocalInlineColor === 'function') {
                ctx.el.classList.toggle('has-local-color', hasLocalInlineColor(layer.content));
            }
        }

        _saved = null;

        if (typeof state.saveState === 'function') state.saveState();
        if (typeof updateTopToolbarUI === 'function') updateTopToolbarUI(state.getSelectedLayer());

        return { ok: true, ctx };
    }

    function setSavedContext(layerId, el, range) {
        _saved = { layerId, el, range };
    }

    return {
        getCtx,
        freezeFromEvent,
        clearSaved,
        hasUsableSelection,
        applyStyle,
        setSavedContext
    };
})();
window.SelectionCore = SelectionCore;

function initTextLayersModule() {
    setupTopToolbarEvents();
    setupContextMenuEvents();
    setupBackdropPanel();
    setupExternalPasteEntry();
}

function applyFormattingToSelection(command, value = null) {
    document.execCommand(command, false, value);
}

/* ============================================================
   选区级特效 v3 —— 焦点保护 + 冻结 range + 手写 span
   ============================================================ */

let _savedSelectionContext = null;

document.addEventListener('mousedown', (e) => {
    if (!window.state || !state.editingLayerId) return;

    if (e.target.closest('.backdrop-card')) {
        return;
    }

    if (e.target.closest('#tb-inline-offset, #btn-inline-offset-apply, #btn-inline-offset-clear')) {
        console.log('InlineOffset capture mousedown, try freeze');
        if (typeof SelectionCore !== 'undefined' && SelectionCore.freezeFromEvent) {
            const frozen = SelectionCore.freezeFromEvent(e);
            console.log('InlineOffset freeze result =', frozen);
        }
        return;
    }

    if (e.target.closest('.effect-card, .btn, .tool-btn, .sidebar-left, .sidebar-right, .top-text-toolbar')) {
        const frozen = (typeof SelectionCore !== 'undefined')
            ? SelectionCore.freezeFromEvent(e)
            : false;
        if (frozen) {
            e.preventDefault();
        }
    }
}, true);

function getActiveSelectionRange() {
    if (typeof SelectionCore !== 'undefined' && SelectionCore && SelectionCore.getCtx) {
        return SelectionCore.getCtx();
    }
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

function hasLocalInlineColor(html) {
    if (!html) return false;
    return /<span[^>]*style="[^"]*color\s*:\s*[^;"]+/i.test(html);
}

function ensureStyleWithCSS() {
    try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
}

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
            try { span.style.setProperty(prop, val); } catch (e) {
                if (window.Utils && Utils.log) Utils.log.warn('[Text] 应用选区样式属性失败', prop, val, e);
            }
        });
        span.textContent = selectedText;
        parent.insertBefore(span, node);
        if (after) parent.insertBefore(document.createTextNode(after), node);
        parent.removeChild(node);
    });

    if (tasks.length > 0) {
        try {
            const spans = el.querySelectorAll('span[data-effect-span]');
            if (spans.length > 0) {
                const lastSpan = spans[spans.length - 1];
                const newRange = document.createRange();
                newRange.selectNodeContents(lastSpan);
                const sel = window.getSelection();
                if (sel) {
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                }
            }
        } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[Text] 恢复选区失败（不影响已应用样式）', e);
        }
    }
    _savedSelectionContext = null;
    return tasks.length > 0;
}

function clearEffectSpansInSelection(ctx) {
    if (!ctx || !ctx.el || !ctx.range) return null;
    const root = ctx.el;
    const range = ctx.range;

    const startInfo = getTextOffsetInRoot(root, range.startContainer, range.startOffset);
    const endInfo = getTextOffsetInRoot(root, range.endContainer, range.endOffset);
    if (startInfo === null || endInfo === null) return null;

    const effectSpans = [];
    root.querySelectorAll('span').forEach(sp => {
        if (!range.intersectsNode(sp)) return;
        const hasMarker = sp.dataset.effectSpan === '1';
        if (hasMarker || looksLikeEffectSpan(sp)) {
            if (!hasMarker) sp.dataset.effectSpan = '1';
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

function looksLikeEffectSpan(sp) {
    if (!sp.style) return false;
    if (sp.dataset.effectSpan === '1') return true;
    const styleProps = Array.from(sp.style).map(p => p.toLowerCase());
    const strongEffectProps = [
        'color',
        'text-shadow',
        '-webkit-text-stroke',
        '-webkit-text-fill-color',
        'background-clip',
        '-webkit-background-clip',
        'filter',
        'background',
        'background-color',
        'padding',
        'border'
    ];
    for (const p of styleProps) {
        if (strongEffectProps.includes(p)) return true;
    }
    return false;
}

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
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[Text] restoreSelectionByTextOffset 恢复选区失败', e);
    }
}

function splitAndClearEffectSpan(sp, root, range) {
    const parent = sp.parentNode;
    if (!parent) return;

    const startContainer = range.startContainer;
    const startOffset = range.startOffset;
    const endContainer = range.endContainer;
    const endOffset = range.endOffset;

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

    const charMap = [];
    textNodes.forEach(node => {
        const text = node.nodeValue;
        if (!text) return;
        let s = 0, e = text.length;
        const nr = document.createRange();
        nr.selectNodeContents(node);
        const beforeSel = nr.compareBoundaryPoints(Range.START_TO_START, range) < 0;
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

        let intersects = false;
        try {
            intersects = range.intersectsNode(c.node);
        } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[Text] intersectsNode 判断失败，回退到字符级判断', e);
            intersects = c.selected;
        }

        if (intersects) {
            let s = c.text.length;
            let e = 0;
            try {
                for (let i = 0; i < c.text.length; i++) {
                    const cr = document.createRange();
                    cr.setStart(c.node, i);
                    cr.setEnd(c.node, i + 1);
                    if (range.intersectsNode(c.node)) {
                        const cmpStart = range.compareBoundaryPoints(Range.START_TO_START, cr);
                        const cmpEnd = range.compareBoundaryPoints(Range.END_TO_END, cr);
                        if (cmpStart <= 0 && cmpEnd >= 0) {
                            if (i < s) s = i;
                            if (i + 1 > e) e = i + 1;
                        }
                    }
                }
                if (e <= s) { s = 0; e = c.text.length; }
            } catch (err) {
                if (window.Utils && Utils.log) Utils.log.warn('[Text] 字符级选区范围计算失败，回退到整段', err);
                s = 0;
                e = c.text.length;
            }

            s = Math.max(0, Math.min(s, c.text.length));
            e = Math.max(0, Math.min(e, c.text.length));

            if (s > 0) appendTextWithPath(beforeFrag, path, c.text.slice(0, s));
            if (e > s) appendTextWithPath(coreFrag, path, c.text.slice(s, e));
            if (e < c.text.length) appendTextWithPath(afterFrag, path, c.text.slice(e));
        } else {
            const nr = document.createRange();
            nr.selectNodeContents(c.node);
            const beforeSel = nr.compareBoundaryPoints(Range.START_TO_START, range) < 0;
            appendTextWithPath(beforeSel ? beforeFrag : afterFrag, path, c.text);
        }
    });

    const hasBefore = beforeFrag.textContent.length > 0;
    const hasCore = coreFrag.textContent.length > 0;
    const hasAfter = afterFrag.textContent.length > 0;

    if (!hasBefore && !hasAfter && hasCore) {
        const p = sp.parentNode;
        if (p) {
            while (sp.firstChild) p.insertBefore(sp.firstChild, sp);
            p.removeChild(sp);
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

function clearLocalFormat() {
    const ctx = getActiveSelectionRange();
    if (!ctx || ctx.collapsed) {
        if (typeof showBgToast === 'function') {
            showBgToast('请先在文本中选中要清除特效的文字');
        }
        return;
    }

    const rootEl = ctx.el;
    const range = ctx.range;

    const startOffset = getTextOffsetInRoot(rootEl, range.startContainer, range.startOffset);
    const endOffset = getTextOffsetInRoot(rootEl, range.endContainer, range.endOffset);
    if (startOffset === null || endOffset === null) return;

    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null, false);
    let total = 0;
    const segBefore = [];
    const segMiddle = [];
    const segAfter = [];

    while (walker.nextNode()) {
        const node = walker.currentNode;
        const text = node.nodeValue;
        if (!text) continue;
        const nodeStart = total;
        const nodeEnd = total + text.length;
        total = nodeEnd;

        const ancestors = [];
        let p = node.parentNode;
        while (p && p !== rootEl) {
            ancestors.unshift(p);
            p = p.parentNode;
        }

        const s = Math.max(nodeStart, startOffset);
        const e = Math.min(nodeEnd, endOffset);

        if (nodeEnd <= startOffset) {
            segBefore.push({ text, ancestors });
        } else if (nodeStart >= endOffset) {
            segAfter.push({ text, ancestors });
        } else {
            if (nodeStart < startOffset) {
                segBefore.push({ text: text.slice(0, startOffset - nodeStart), ancestors });
            }
            if (e > s) {
                segMiddle.push({ text: text.slice(s - nodeStart, e - nodeStart), ancestors });
            }
            if (nodeEnd > endOffset) {
                segAfter.push({ text: text.slice(endOffset - nodeStart), ancestors });
            }
        }
    }

    const buildHtml = (segments) => {
        let html = '';
        segments.forEach(seg => {
            let inner = escapeHtml(seg.text);
            for (let i = seg.ancestors.length - 1; i >= 0; i--) {
                const a = seg.ancestors[i];
                const tag = a.tagName.toLowerCase();
                if (tag !== 'span' && tag !== 'b' && tag !== 'i' && tag !== 'u' && tag !== 's' && tag !== 'em' && tag !== 'strong') {
                    continue;
                }
                let attrs = '';
                if (a.className) attrs += ` class="${a.className}"`;
                const style = a.getAttribute('style');
                if (style) attrs += ` style="${style}"`;
                inner = `<${tag}${attrs}>${inner}</${tag}>`;
            }
            html += inner;
        });
        return html;
    };

    const middleHtml = segMiddle.map(s => escapeHtml(s.text)).join('');
    const beforeHtml = buildHtml(segBefore);
    const afterHtml = buildHtml(segAfter);

    rootEl.innerHTML = beforeHtml + middleHtml + afterHtml;

    const layer = state.layers.find(l => l.id === state.editingLayerId);
    if (layer) layer.content = rootEl.innerHTML;

    _savedSelectionContext = null;
    updateTopToolbarUI(state.getSelectedLayer());
    state.saveState();
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function applyEffectToSelection(eff) {
    if (!eff || !eff.css) return;
    const ctx = getActiveSelectionRange();
    if (!ctx || ctx.collapsed) return;

    const layerId = state.editingLayerId;
    const rootEl = ctx.el;
    const saved = clearEffectSpansInSelection(ctx);
    if (saved) {
        restoreSelectionByTextOffset(saved.root, saved.start, saved.end);
    }

    let newCtx = getActiveSelectionRange();
    if ((!newCtx || newCtx.collapsed) && saved && saved.root) {
        restoreSelectionByTextOffset(saved.root, saved.start, saved.end);
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const r = sel.getRangeAt(0);
            if (saved.root.contains(r.commonAncestorContainer) && !r.collapsed) {
                newCtx = { el: saved.root, range: r, sel, collapsed: r.collapsed };
            }
        }
    }
    if (!newCtx || newCtx.collapsed) {
        console.warn('套新特效失败：清理后选区丢失');
        if (typeof showBgToast === 'function') {
            showBgToast('选区已丢失，请重新选中文字后再套特效');
        }
        return;
    }

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
        const wrapped = wrapSelectionWithStyle(manualList, true, newCtx);
        if (!wrapped) {
            console.warn('套新特效失败：wrapSelectionWithStyle 返回 false');
        }
    }

    const layer = state.layers.find(l => l.id === layerId);
    if (layer) {
        layer.content = newCtx.el.innerHTML;
        newCtx.el.classList.toggle('has-local-color', hasLocalInlineColor(layer.content));
    }

    _savedSelectionContext = null;
    updateTopToolbarUI(state.getSelectedLayer());
}

function handleEffectClick(eff) {
    const layer = state.getSelectedLayer();
    if (!layer || layer.type !== 'text') {
        alert('请先在画布中点击选中一个【文本图层】！');
        return;
    }

    let ctx = getActiveSelectionRange();
    if ((!ctx || ctx.collapsed) && state.editingLayerId && typeof _savedSelectionContext !== 'undefined' && _savedSelectionContext) {
        try {
            const r = _savedSelectionContext.range;
            r.startContainer; r.endContainer;
            if (!r.collapsed && _savedSelectionContext.el && document.body.contains(_savedSelectionContext.el)) {
                ctx = { el: _savedSelectionContext.el, range: r, sel: null, collapsed: false };
            }
        } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[Text] 恢复冻结选区快照失败', e);
        }
    }
    const hasSelection = ctx && !ctx.collapsed;

    if (hasSelection && canEffectApplyToSelection(eff.css)) {
        applyEffectToSelection(eff);
        return;
    }

    if (hasSelection && !canEffectApplyToSelection(eff.css || '')) {
        if (typeof showBgToast === 'function') {
            showBgToast(`「${eff.name}」只能作用于整个图层，已为你整层套用`);
        }
    }

    layer.effectClass = eff.id;
    if (layer.effectClasses) delete layer.effectClasses;
    state.saveState();
    if (typeof renderCanvas === 'function') renderCanvas();
    if (typeof renderLayerList === 'function') renderLayerList();
    if (typeof renderEffectsGrid === 'function') renderEffectsGrid();
}

/* ============================================================
   顶部工具栏
   ============================================================ */
function setupTopToolbarEvents() {
    const fontSelect = document.getElementById('tb-font');
    if (fontSelect) {
        fontSelect.addEventListener('mousedown', (e) => e.stopPropagation());
        fontSelect.addEventListener('click', (e) => e.stopPropagation());
        fontSelect.addEventListener('change', (e) => {
            let val = e.target.value;
            if (!val) return;

            const exists = Array.from(fontSelect.options).some(o => o.value === val);
            if (!exists) {
                console.warn('[Font] 字体选项不存在:', val);
                return;
            }

            const safeVal = (typeof window._safeFontFamily === 'function') ? window._safeFontFamily(val) : val;

            const ensureReady = (typeof document !== 'undefined' && document.fonts && document.fonts.load)
                ? document.fonts.load(`normal normal 16px ${safeVal}`).catch(() => {})
                : Promise.resolve();

            ensureReady.then(() => {
                const ctx = getActiveSelectionRange();
                if (ctx && !ctx.collapsed) {
                    ensureStyleWithCSS();
                    try { document.execCommand('fontName', false, val); } catch (err) {}
                    const layer = state.layers.find(l => l.id === state.editingLayerId);
                    if (layer) {
                        layer.content = ctx.el.innerHTML;
                        state.saveState();
                    }
                    updateTopToolbarUI(state.getSelectedLayer());
                    renderCanvas();
                } else {
                    const layer = state.getSelectedLayer();
                    if (layer) {
                        layer.fontFamily = val;
                        const layerEl = document.querySelector(
                            `.canvas-page-wrapper[data-page-id="${state.currentPageId}"] .canvas-layer[data-id="${layer.id}"] .text-content-editable`
                        );
                        if (layerEl) layerEl.style.fontFamily = safeVal;
                        state.saveState();
                        renderCanvas();
                    }
                }
            });
        });
    }

    const fontSizeSelect = document.getElementById('tb-fontsize');
    if (fontSizeSelect) {
        fontSizeSelect.addEventListener('mousedown', (e) => e.stopPropagation());
        fontSizeSelect.addEventListener('click', (e) => e.stopPropagation());
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
        colorPicker.addEventListener('mousedown', (e) => e.stopPropagation());
        colorPicker.addEventListener('click', (e) => e.stopPropagation());
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
            const color = e.target.value;
            if (typeof SelectionCore !== 'undefined' && SelectionCore.hasUsableSelection && SelectionCore.hasUsableSelection()) {
                const res = SelectionCore.applyStyle([
                    { prop: 'background-color', val: color },
                    { prop: 'padding', val: '0 2px' },
                    { prop: 'border-radius', val: '3px' }
                ]);
                if (res && res.ok) return;
            }
            const layer = state.getSelectedLayer();
            if (layer) { layer.bgColor = color; state.saveState(); renderCanvas(); }
        });
        bgColorPicker.addEventListener('click', (e) => e.stopPropagation());
        bgColorPicker.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    const bgRadius = document.getElementById('tb-bg-radius');
    if (bgRadius) {
        bgRadius.addEventListener('input', (e) => {
            const v = parseInt(e.target.value, 10) || 0;
            const layer = state.getSelectedLayer();
            if (layer && layer.type === 'text') {
                layer.bgRadius = v;
                state.saveState();
                renderCanvas();
            }
        });
        bgRadius.addEventListener('click', (e) => e.stopPropagation());
        bgRadius.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    const btnBgClear = document.getElementById('btn-bgcolor-clear');
    if (btnBgClear) {
        btnBgClear.addEventListener('click', (e) => {
            e.stopPropagation();
            const layer = state.getSelectedLayer();
            if (!layer || layer.type !== 'text') {
                if (typeof showBgToast === 'function') showBgToast('请先选中一个文字图层');
                return;
            }
            layer.bgColor = 'transparent';
            state.saveState();
            renderCanvas();
            updateTopToolbarUI(layer);
            if (typeof showBgToast === 'function') showBgToast('已清除背景色');
        });
    }

    const bindCommand = (id, cmd) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
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
        bulletBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const ctx = getActiveSelectionRange();
            if (ctx && !ctx.collapsed) {
                document.execCommand('insertUnorderedList');
                const layer = state.layers.find(l => l.id === state.editingLayerId);
                if (layer) layer.content = ctx.el.innerHTML;
            }
            document.querySelectorAll('.menu-panel.open').forEach(p => p.classList.remove('open'));
        });
    }

    ['left', 'center', 'right'].forEach(align => {
        const btn = document.getElementById(`tb-align-${align}`);
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const layer = state.getSelectedLayer();
                if (layer) { layer.align = align; state.saveState(); renderCanvas(); }
                document.querySelectorAll('.menu-panel.open').forEach(p => p.classList.remove('open'));
            });
        }
    });

    const verticalBtn = document.getElementById('tb-vertical');
    if (verticalBtn) {
        verticalBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const layer = state.getSelectedLayer();
            if (layer) { layer.vertical = !layer.vertical; state.saveState(); renderCanvas(); }
        });
    }

    const letterSpacing = document.getElementById('tb-letter-spacing');
    if (letterSpacing) {
        letterSpacing.addEventListener('input', (e) => {
            const layer = state.getSelectedLayer();
            if (!layer) return;
            const v = parseFloat(e.target.value) || 0;
            layer.letterSpacing = (v === 0) ? 0 : (v + 'px');
            state.saveState();
            renderCanvas();
        });
        letterSpacing.addEventListener('click', (e) => e.stopPropagation());
        letterSpacing.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    const lineHeight = document.getElementById('tb-line-height');
    if (lineHeight) {
        lineHeight.addEventListener('input', (e) => {
            const layer = state.getSelectedLayer();
            if (layer) { layer.lineHeight = e.target.value; state.saveState(); renderCanvas(); }
        });
        lineHeight.addEventListener('click', (e) => e.stopPropagation());
        lineHeight.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    const lineHeightExact = document.getElementById('tb-line-height-exact');
    if (lineHeightExact) {
        lineHeightExact.addEventListener('change', (e) => {
            let v = parseFloat(e.target.value);
            if (!isFinite(v)) v = 1.2;
            v = Math.max(0.8, Math.min(3.0, v));
            e.target.value = v.toFixed(2);
            const layer = state.getSelectedLayer();
            if (layer && layer.type === 'text') {
                layer.lineHeight = v;
                state.saveState();
                renderCanvas();
            }
        });
        lineHeightExact.addEventListener('click', (e) => e.stopPropagation());
    }

    // F5 预览快捷键（只注册一次）
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F5') {
            if (e.target.isContentEditable) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
            if (window.PreviewMode && typeof PreviewMode.open === 'function') {
                e.preventDefault();
                PreviewMode.open();
            }
        }
    });

    const opacity = document.getElementById('tb-opacity');
    if (opacity) {
        opacity.addEventListener('input', (e) => {
            const layer = state.getSelectedLayer();
            if (!layer) return;
            layer.opacity = parseFloat(e.target.value);
            if (layer.type === 'draw' && window.Doodle) {
                Doodle.redrawDrawLayers();
            } else {
                renderCanvas();
            }
        });
        opacity.addEventListener('change', () => {
            state.saveState();
        });
        opacity.addEventListener('click', (e) => e.stopPropagation());
        opacity.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    const boldBtn = document.getElementById('tb-bold');
    if (boldBtn) {
        boldBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            clearLocalFormat();
        });
    }

    // ===== 行内特效升降 =====
    const inlineOffset = document.getElementById('tb-inline-offset');
    const inlineOffsetVal = document.getElementById('tb-inline-offset-val');
    if (inlineOffset) {
        inlineOffset.disabled = false;
        inlineOffset.readOnly = false;
        inlineOffset.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        inlineOffset.addEventListener('click', (e) => e.stopPropagation());
        inlineOffset.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
        inlineOffset.addEventListener('input', (e) => {
            const v = parseInt(e.target.value, 10) || 0;
            if (inlineOffsetVal) inlineOffsetVal.textContent = v + 'px';
        });
    }

    const applyInlineOffset = (px, clear) => {
        const ctx = getActiveSelectionRange();
        if (!ctx || ctx.collapsed) {
            if (typeof showBgToast === 'function') showBgToast('请先在文本中选中要调的行内特效文字（保持选中状态再点按钮）');
            return;
        }
        const el = ctx.el;
        let changed = 0;
        const allSpans = el.querySelectorAll('span');
        allSpans.forEach(sp => {
            let intersects = false;
            try { intersects = ctx.range.intersectsNode(sp); } catch (e) { intersects = false; }
            if (!intersects) return;
            const isEffect = sp.dataset.effectSpan === '1' || looksLikeEffectSpan(sp);
            if (!isEffect) return;
            if (clear) {
                sp.style.removeProperty('top');
                sp.style.removeProperty('position');
                sp.style.removeProperty('transform');
                sp.style.removeProperty('display');
            } else {
                sp.style.setProperty('display', 'inline-block');
                sp.style.setProperty('vertical-align', 'baseline');
                sp.style.setProperty('transform', 'translateY(' + px + 'px)');
                sp.style.setProperty('font-family', 'inherit');
                sp.style.setProperty('font-size', 'inherit');
                sp.style.setProperty('font-weight', 'inherit');
                sp.style.setProperty('font-style', 'inherit');
                sp.style.setProperty('font-synthesis', 'none');
                sp.style.removeProperty('top');
                sp.style.removeProperty('position');
            }
            changed++;
        });
        if (changed === 0) {
            if (typeof showBgToast === 'function') showBgToast('选区里没有行内特效文字，请先选中带特效的文字');
            return;
        }
        const layer = state.layers.find(l => l.id === state.editingLayerId);
        if (layer) layer.content = el.innerHTML;
        if (typeof state.saveState === 'function') state.saveState();
        if (typeof renderCanvas === 'function') renderCanvas();
        if (typeof updateTopToolbarUI === 'function') updateTopToolbarUI(state.getSelectedLayer());
        if (typeof showBgToast === 'function') showBgToast(clear ? '已清除行内特效升降' : ('已升降 ' + px + 'px（' + changed + ' 处）'));
    };

    const btnInlineApply = document.getElementById('btn-inline-offset-apply');
    if (btnInlineApply) {
        btnInlineApply.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        btnInlineApply.addEventListener('click', (e) => {
            e.stopPropagation();
            const px = inlineOffset ? parseInt(inlineOffset.value, 10) || 0 : 0;
            applyInlineOffset(px, false);
        });
    }
    const btnInlineClear = document.getElementById('btn-inline-offset-clear');
    if (btnInlineClear) {
        btnInlineClear.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
        btnInlineClear.addEventListener('click', (e) => {
            e.stopPropagation();
            applyInlineOffset(0, true);
            if (inlineOffset) inlineOffset.value = 0;
            if (inlineOffsetVal) inlineOffsetVal.textContent = '0px';
        });
    }

    const typePresetSelect = document.getElementById('tb-type-preset');
    if (typePresetSelect) {
        typePresetSelect.addEventListener('change', () => {
            document.querySelectorAll('.menu-panel.open').forEach(p => p.classList.remove('open'));
        });
    }
    const autoContrastBtn = document.getElementById('btn-auto-contrast');
    if (autoContrastBtn) {
        autoContrastBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.menu-panel.open').forEach(p => p.classList.remove('open'));
        });
    }
}

function safeSetColorInput(id, value, fallback) {
    const el = document.getElementById(id);
    if (!el) return;
    let v = (value || '').trim();
    if (/^#[0-9a-fA-F]{3}$/.test(v)) {
        v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
        v = fallback;
    }
    try { el.value = v; } catch (e) {}
}

function updateTopToolbarUI(layer) {
    const toolbar = document.getElementById('text-toolbar');
    if (!toolbar) return;

    if (layer && layer.type === 'draw') {
        toolbar.classList.remove('is-inactive');
        toolbar.querySelectorAll('select, button, input[type="range"]').forEach(el => {
            if (el.id === 'tb-opacity') {
                el.disabled = false;
                el.style.opacity = '';
            } else {
                el.disabled = true;
                el.style.opacity = '0.35';
            }
        });
        const opacityEl = document.getElementById('tb-opacity');
        if (opacityEl) opacityEl.value = layer.opacity !== undefined ? layer.opacity : 1;
        return;
    }

    toolbar.querySelectorAll('select, button, input[type="range"]').forEach(el => {
        el.disabled = false;
        el.style.opacity = '';
    });

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

    {
        const fontSelectEl = document.getElementById('tb-font');
        const targetFont = layer.fontFamily || 'sans-serif';
        if (fontSelectEl) {
            const hasOption = Array.from(fontSelectEl.options).some(o => o.value === targetFont);
            if (!hasOption && targetFont) {
                const opt = document.createElement('option');
                opt.value = targetFont;
                opt.innerText = targetFont;
                fontSelectEl.appendChild(opt);
            }
            try { fontSelectEl.value = targetFont; } catch (e) {
                if (window.Utils && Utils.log) Utils.log.warn('[Text] 回填字体下拉值失败', targetFont, e);
            }
        }
    }
    const _fsEl = document.getElementById('tb-fontsize');
    if (_fsEl && _fsEl.offsetParent !== null) {
        _fsEl.value = layer.fontSize || '28px';
    }

    safeSetColorInput('tb-color', layer.color, '#ffffff');
    safeSetColorInput('tb-bgcolor', layer.bgColor === 'transparent' ? '#000000' : layer.bgColor, '#000000');
    const _bgRadiusEl = document.getElementById('tb-bg-radius');
    if (_bgRadiusEl) {
        const _r = (layer.bgRadius !== undefined ? layer.bgRadius : 6);
        _bgRadiusEl.value = _r;
    }
    const _btnBgClear = document.getElementById('btn-bgcolor-clear');
    if (_btnBgClear) {
        const hasBg = layer.bgColor && layer.bgColor !== 'transparent' && layer.bgColor !== 'rgba(0, 0, 0, 0)';
        _btnBgClear.classList.toggle('active', !!hasBg);
        _btnBgClear.style.opacity = hasBg ? '' : '0.4';
    }
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

    const _exactLH = document.getElementById('tb-line-height-exact');
    if (_exactLH) {
        const v = parseFloat(layer.lineHeight) || 1.2;
        _exactLH.value = v.toFixed(2);
    }

    syncBackdropPanelToLayer(layer);

    if (typeof window.updateToolbarContext === 'function') {
        window.updateToolbarContext();
    }
}

document.addEventListener('selectionchange', () => {
    if (!state.editingLayerId) return;
    const ctx = getActiveSelectionRange();
    if (!ctx) return;
    const layer = state.layers.find(l => l.id === state.editingLayerId);
    if (layer) updateTopToolbarUI(layer);
});

function setupContextMenuEvents() {
    const menu = document.getElementById('context-menu');
    document.addEventListener('mousedown', (e) => {
        if (!menu || menu.style.display !== 'block') return;
        if (menu.contains(e.target)) return;
        if (e.button !== 0) return;
        menu.style.display = 'none';
    }, true);
    document.addEventListener('click', (e) => {
        if (!menu) return;
        if (menu.style.display !== 'block') return;
        if (menu.contains(e.target)) return;
        menu.style.display = 'none';
    }, true);

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

    const doMoveLayer = (direction) => {
        let id = state.selectedLayerId;
        if (window.MultiSelect && state.selectedLayerIds && state.selectedLayerIds.length === 1) {
            id = state.selectedLayerIds[0];
        }
        if (!id) return;
        const exists = state.layers.some(l => l.id === id);
        if (!exists) return;

        let moved = false;
        if (direction === 'up' || direction === 'top') moved = state.moveLayer(id, 'top');
        else if (direction === 'down' || direction === 'bottom') moved = state.moveLayer(id, 'bottom');
        else moved = state.moveLayer(id, direction);

        if (!moved) return;
        state.selectedLayerId = id;
        if (window.MultiSelect) state.selectedLayerIds = [id];
        renderCanvas();
        renderLayerList();
        updateTopToolbarUI(state.getSelectedLayer());
    };

    const _ctxMoveTop = document.getElementById('ctx-move-top');
    if (_ctxMoveTop) _ctxMoveTop.addEventListener('click', () => doMoveLayer('top'));
    const _ctxMoveBottom = document.getElementById('ctx-move-bottom');
    if (_ctxMoveBottom) _ctxMoveBottom.addEventListener('click', () => doMoveLayer('bottom'));

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

    const clearInlineItem = document.getElementById('ctx-clear-inline-effect');
    if (clearInlineItem) {
        let _inlineClearCtx = null;
        clearInlineItem.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                const c = getActiveSelectionRange();
                if (c && !c.collapsed) {
                    _inlineClearCtx = {
                        el: c.el,
                        range: c.range.cloneRange(),
                        collapsed: false
                    };
                }
            } catch (err) {
                if (window.Utils && Utils.log) Utils.log.warn('[Text] 冻结行内清除选区失败', err);
            }
        }, true);
        clearInlineItem.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (_inlineClearCtx && _inlineClearCtx.el && _inlineClearCtx.range) {
                const prevCtx = _savedSelectionContext;
                _savedSelectionContext = {
                    layerId: state.editingLayerId || '',
                    el: _inlineClearCtx.el,
                    range: _inlineClearCtx.range
                };
                clearLocalFormat();
                _savedSelectionContext = prevCtx;
            } else {
                clearLocalFormat();
            }
            _inlineClearCtx = null;
            const m = document.getElementById('context-menu');
            if (m) m.style.display = 'none';
        });
    }

    const clearLayerItem = document.getElementById('ctx-clear-layer-effect');
    if (clearLayerItem) {
        clearLayerItem.addEventListener('click', () => {
            const layer = state.getSelectedLayer();
            if (!layer || layer.type !== 'text') return;
            layer.effectClass = null;
            if (layer.effectClasses) delete layer.effectClasses;
            if (layer.effectParams) delete layer.effectParams;
            state.saveState();
            renderCanvas();
            renderLayerList();
            if (typeof renderEffectsGrid === 'function') renderEffectsGrid();
            if (typeof refreshEffectParamsPanel === 'function') refreshEffectParamsPanel();
            if (typeof showBgToast === 'function') showBgToast('已清除整层特效（行内特效保留）');
        });
    }

    document.addEventListener('contextmenu', (e) => {
        const menu = document.getElementById('context-menu');
        if (!menu || menu.style.display === 'none') return;
        const layer = state.getSelectedLayer();
        const inlineItem = document.getElementById('ctx-clear-inline-effect');
        const layerItem = document.getElementById('ctx-clear-layer-effect');

        let showInline = false;
        if (layer && layer.type === 'text' && state.editingLayerId === layer.id) {
            const hasInlineSpan = /<span[^>]*style="[^"]*(color|background|text-shadow|text-decoration|-webkit-text-stroke|background-image|border|padding)/i.test(layer.content || '');
            if (hasInlineSpan) {
                const ctx = (typeof getActiveSelectionRange === 'function') ? getActiveSelectionRange() : null;
                if (ctx && !ctx.collapsed) showInline = true;
                if (!showInline) showInline = true;
            }
        }
        if (inlineItem) inlineItem.style.display = showInline ? '' : 'none';

        const hasLayerEffect = !!(layer && (
            layer.effectClass ||
            (Array.isArray(layer.effectClasses) && layer.effectClasses.length > 0)
        ));
        if (layerItem) layerItem.style.display = hasLayerEffect ? '' : 'none';
    }, true);
}

/* ============================================================
   文字底衬面板（部分函数已被 backdrop-panel.js 覆盖，保留数据声明）
   ============================================================ */

const BACKDROP_PRESETS = [
    { type: 'none', name: '无', cat: 'paper' },
    { type: 'paper', name: '横线便笺', cat: 'paper' },
    { type: 'grid', name: '方格便笺', cat: 'paper' },
    { type: 'sticky', name: '便利贴', cat: 'paper' },
    { type: 'notebook', name: '笔记本内页', cat: 'paper' },
    { type: 'tape', name: '胶带贴纸', cat: 'paper' },
    { type: 'torn', name: '基础撕边', cat: 'paper' },
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
    { type: 'glass', name: '毛玻璃', cat: 'decor' },
    { type: 'polaroid', name: '拍立得', cat: 'decor' },
    { type: 'ticket', name: '车票/电影票', cat: 'decor' },
    { type: 'washi', name: '日式和纸', cat: 'decor' }
];

let currentBackdropCategory = 'paper';
let backdropCache = {};

function setupBackdropPanel() {
    setupBackdropImport();

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

    const btnFormat = document.getElementById('btn-backdrop-format');
    if (btnFormat) {
        btnFormat.addEventListener('click', showBackdropFormatModal);
    }

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
    card.setAttribute('draggable', 'false');
    card.addEventListener('dragstart', (e) => e.preventDefault());

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
    } else if (window.BackdropTextures && BackdropTextures.isCanvasTexture(preset.type)) {
        const dataUrl = BackdropTextures.get(preset.type, null);
        if (dataUrl) {
            preview.style.background = 'transparent';
            preview.style.backgroundImage = `url(${dataUrl})`;
            preview.style.backgroundSize = 'cover';
        } else {
            preview.style.background = '#30363d';
        }
    } else {
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

        if (window.BackdropTextures && BackdropTextures.isCanvasTexture(preset.type)) {
            if (!layer.backdrop.color || layer.backdrop.color === '#fff8dc') {
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
            card.setAttribute('draggable', 'false');
            card.addEventListener('dragstart', (e) => e.preventDefault());

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
                try {
                    const map = JSON.parse(localStorage.getItem('douyin_backdrop_asset_map') || '{}');
                    const assetId = map[item.id];
                    if (assetId && window.AssetRegistry) {
                        await AssetRegistry.remove(assetId);
                    }
                    delete map[item.id];
                    localStorage.setItem('douyin_backdrop_asset_map', JSON.stringify(map));
                } catch (err) {}
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
                if (item.isMask) {
                    layer.backdrop.isMask = true;
                    if (!layer.backdrop.color || layer.backdrop.color === '#fff8dc') {
                        layer.backdrop.color = '#ffffff';
                    }
                } else {
                    layer.backdrop.isMask = false;
                }
                state.saveState();
                renderCanvas();
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
        let assetId = null;
        if (window.AssetRegistry && AssetRegistry.registerBackdrop) {
            assetId = await AssetRegistry.registerBackdrop({
                name: file.name,
                data: dataUrl,
                tags: ['backdrop', 'uploaded'],
                source: 'user'
            });
        }
        const legacyId = await BackdropDB.addBackdrop(file.name, dataUrl, false);
        if (assetId && legacyId != null) {
            try {
                const map = JSON.parse(localStorage.getItem('douyin_backdrop_asset_map') || '{}');
                map[legacyId] = assetId;
                localStorage.setItem('douyin_backdrop_asset_map', JSON.stringify(map));
            } catch (e) {}
        }
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
    } catch (e) {}
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

    const customCtrl = document.getElementById('backdrop-custom-controls');
    if (customCtrl) {
        customCtrl.style.display = (bd.type === 'custom') ? 'block' : 'none';
    }
    const sizeModeSel = document.getElementById('backdrop-sizemode');
    if (sizeModeSel) sizeModeSel.value = bd.sizeMode || 'cover';
    const overlayInput = document.getElementById('backdrop-overlay-color');
    if (overlayInput && bd.overlayColor) overlayInput.value = bd.overlayColor;

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

    const colorGroup = document.getElementById('backdrop-color-group');
    if (colorGroup) {
        const showColor = (bd.type === 'custom' && bd.isMask === true);
        colorGroup.style.display = showColor ? 'block' : 'none';
    }
}

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

    box.querySelectorAll('textarea').forEach(ta => {
        ta.addEventListener('focus', () => ta.select());
    });
}

function copyToClipboard(text) {
    if (window.Utils && Utils.clipboard && Utils.clipboard.copy) {
        return Utils.clipboard.copy(text);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).catch(() => {});
    }
    return Promise.resolve();
}

/* ============================================================
   底衬形状批量导入
   ============================================================ */

const SHAPE_FORMAT = 'douyin-backdrop-shapes';
const SHAPE_MASK_SIZE = 256;

const SVG_ALLOWED_TAGS = new Set([
    'svg', 'g', 'defs', 'path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline',
    'line', 'linearGradient', 'radialGradient', 'stop'
]);
const SVG_ALLOWED_ATTRS = new Set([
    'xmlns', 'viewbox', 'preserveaspectratio', 'width', 'height',
    'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linejoin', 'stroke-linecap', 'stroke-opacity',
    'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
    'points', 'transform', 'gradientunits', 'offset', 'stop-color', 'stop-opacity',
    'id', 'opacity'
]);

function _sanitizeSvg(rawSvg) {
    if (!rawSvg || typeof rawSvg !== 'string') throw new Error('svg 为空');
    const trimmed = rawSvg.trim();
    if (!trimmed.startsWith('<svg')) throw new Error('svg 必须以 <svg 开头');

    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error('svg 解析失败');
    const svg = doc.documentElement;
    if (!svg || svg.tagName.toLowerCase() !== 'svg') throw new Error('根节点不是 <svg>');

    const walker = doc.createTreeWalker(svg, NodeFilter.SHOW_ELEMENT, null);
    const toCheck = [svg];
    while (walker.nextNode()) toCheck.push(walker.currentNode);

    toCheck.forEach(node => {
        const tag = node.tagName.toLowerCase();
        if (!SVG_ALLOWED_TAGS.has(tag)) {
            throw new Error('SVG 含不允许的标签 <' + tag + '>');
        }
        for (const attr of Array.from(node.attributes)) {
            const name = attr.name.toLowerCase();
            if (name.startsWith('on')) throw new Error('SVG 含事件属性 ' + name);
            if (name === 'href' || name === 'xlink:href') {
                if (!/^data:image\//i.test(attr.value)) throw new Error('SVG 含外链引用');
                continue;
            }
            if (!SVG_ALLOWED_ATTRS.has(name)) {
                throw new Error('SVG 含不允许的属性 ' + name);
            }
        }
    });

    return svg;
}

function _svgToWhiteMaskDataUrl(svgString) {
    const svg = _sanitizeSvg(svgString);

    let vb = svg.getAttribute('viewBox') || svg.getAttribute('viewbox');
    if (!vb) {
        const w = parseFloat(svg.getAttribute('width')) || 0;
        const h = parseFloat(svg.getAttribute('height')) || 0;
        vb = (w > 0 && h > 0) ? `0 0 ${w} ${h}` : '0 0 100 100';
    }
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    const vx = parts[0], vy = parts[1], vw = parts[2], vh = parts[3];
    const safeVb = (parts.length === 4 && vw > 0 && vh > 0)
        ? `${vx} ${vy} ${vw} ${vh}`
        : '0 0 100 100';
    svg.setAttribute('viewBox', safeVb);

    const viewBoxParts = safeVb.split(/\s+/).map(Number);
    const [viewX, viewY, viewWidth, viewHeight] = viewBoxParts;
    const squareSide = Math.max(viewWidth, viewHeight);
    const squareViewBox = [
        viewX - (squareSide - viewWidth) / 2,
        viewY - (squareSide - viewHeight) / 2,
        squareSide,
        squareSide
    ].join(' ');
    svg.setAttribute('viewBox', squareViewBox);

    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    if (!svg.getAttribute('xmlns')) {
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }

    const walker = document.createTreeWalker(svg, NodeFilter.SHOW_ELEMENT, null);
    const all = [svg];
    while (walker.nextNode()) all.push(walker.currentNode);

    all.forEach(node => {
        const tag = node.tagName.toLowerCase();
        if (['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line'].includes(tag)) {
            node.setAttribute('fill', 'currentColor');
            node.removeAttribute('stroke');
            node.removeAttribute('stroke-width');
            node.removeAttribute('stroke-linejoin');
            node.removeAttribute('stroke-linecap');
            node.removeAttribute('fill-opacity');
            node.removeAttribute('stroke-opacity');
            node.removeAttribute('opacity');
        }
        if (node.hasAttribute('style')) node.removeAttribute('style');
    });

    const serialized = new XMLSerializer().serializeToString(svg);
    const svgDataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(serialized);
    return Promise.resolve(svgDataUrl);
}

function _pathToSvg(pathD, viewBox, fill) {
    const vb = viewBox || '0 0 100 100';
    const f = fill || '#ffffff';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><path d="${pathD}" fill="${f}"/></svg>`;
}

async function _parseShapeInput(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) throw new Error('输入为空');

    if (trimmed.startsWith('<svg')) {
        return [{ name: 'SVG 形状 ' + Date.now(), svg: trimmed }];
    }

    let data;
    try { data = JSON.parse(trimmed); }
    catch (e) { throw new Error('JSON 解析失败：' + e.message); }

    let shapes;
    if (Array.isArray(data)) shapes = data;
    else if (data && Array.isArray(data.shapes)) shapes = data.shapes;
    else if (data && data.format === SHAPE_FORMAT && Array.isArray(data.shapes)) shapes = data.shapes;
    else throw new Error('JSON 必须是数组，或 { "shapes": [...] }');

    if (shapes.length === 0) throw new Error('shapes 为空');

    return shapes.map((s, i) => {
        if (!s || typeof s !== 'object') throw new Error(`第 ${i + 1} 项不是对象`);
        const name = (s.name || '').trim() || `形状 ${i + 1}`;
        if (s.svg) return { name, svg: s.svg };
        if (s.path) return { name, svg: _pathToSvg(s.path, s.viewBox, '#ffffff') };
        throw new Error(`第 ${i + 1} 项（${name}）缺少 svg 或 path`);
    });
}

async function _importShapesFromText(text) {
    const shapes = await _parseShapeInput(text);
    const status = document.getElementById('backdrop-import-status');
    const results = [];
    let ok = 0, fail = 0;

    for (let i = 0; i < shapes.length; i++) {
        const s = shapes[i];
        try {
            const dataUrl = await _svgToWhiteMaskDataUrl(s.svg);
            let assetId = null;
            if (window.AssetRegistry && AssetRegistry.registerBackdrop) {
                assetId = await AssetRegistry.registerBackdrop({
                    name: s.name,
                    data: dataUrl,
                    tags: ['backdrop', 'shape', 'mask'],
                    colorable: true,
                    source: 'user'
                });
            }
            const id = await BackdropDB.upsertBackdropByName(s.name, dataUrl, true);
            if (assetId && id != null) {
                try {
                    const map = JSON.parse(localStorage.getItem('douyin_backdrop_asset_map') || '{}');
                    map[id] = assetId;
                    localStorage.setItem('douyin_backdrop_asset_map', JSON.stringify(map));
                } catch (e) {}
            }
            results.push({ name: s.name, ok: true, id, assetId });
            ok++;
            if (status) status.innerHTML = `处理中 ${i + 1}/${shapes.length}：${s.name} ✔`;
        } catch (e) {
            fail++;
            results.push({ name: s.name, ok: false, error: e.message });
            if (status) status.innerHTML = `处理中 ${i + 1}/${shapes.length}：${s.name} ✖ ${e.message}`;
        }
    }

    await refreshCustomBackdropCache();
    currentBackdropCategory = 'custom';
    const tabsEl = document.getElementById('backdrop-tabs');
    if (tabsEl) {
        tabsEl.querySelectorAll('.backdrop-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.cat === 'custom');
        });
    }
    renderBackdropGrid();

    if (status) {
        const okNames = results.filter(r => r.ok).map(r => r.name).join('、') || '无';
        const failLines = results.filter(r => !r.ok).map(r => `${r.name}：${r.error}`).join('<br>') || '无';
        status.innerHTML = `✅ 成功 ${ok} 个：${okNames}<br>❌ 失败 ${fail} 个：<br>${failLines}`;
    }

    return { ok, fail };
}

function setupBackdropImport() {
    const btnOpen = document.getElementById('btn-backdrop-import');
    const panel = document.getElementById('backdrop-import-panel');
    const btnRun = document.getElementById('btn-backdrop-import-run');
    const btnCancel = document.getElementById('btn-backdrop-import-cancel');
    const textarea = document.getElementById('backdrop-import-json');
    if (!btnOpen || !panel || !btnRun) return;

    if (btnOpen.dataset.bound !== 'true') {
        btnOpen.dataset.bound = 'true';
        btnOpen.addEventListener('click', () => {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });
    }
    if (btnCancel && btnCancel.dataset.bound !== 'true') {
        btnCancel.dataset.bound = 'true';
        btnCancel.addEventListener('click', () => {
            panel.style.display = 'none';
            const status = document.getElementById('backdrop-import-status');
            if (status) status.innerHTML = '';
        });
    }
    if (btnRun.dataset.bound !== 'true') {
        btnRun.dataset.bound = 'true';
        btnRun.addEventListener('click', async () => {
            const text = textarea.value;
            if (!text.trim()) {
                alert('请先粘贴 JSON 或 SVG');
                return;
            }
            btnRun.disabled = true;
            btnRun.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 导入中…';
            try {
                await _importShapesFromText(text);
            } catch (e) {
                const status = document.getElementById('backdrop-import-status');
                if (status) status.innerHTML = `<span style="color:#f85149;">❌ ${e.message}</span>`;
            } finally {
                btnRun.disabled = false;
                btnRun.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> 开始导入';
            }
        });
    }
}

function setupExternalPasteEntry() {
    if (typeof bindExternalPaste === 'function') bindExternalPaste();
}

/* ============================================================
   外部剪贴板粘贴 → 新建文字图层
   ============================================================ */

window.__lastCanvasMouse = null;

function _isEditingTextTarget(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return true;
    let n = el;
    while (n && n !== document.body) {
        if (n.isContentEditable) return true;
        n = n.parentElement;
    }
    return false;
}

function _textToHtmlContent(text) {
    const esc = String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    return esc.split(/\r?\n/).map(line => line || '&nbsp;').join('<br>');
}

function _extractPastedText(e) {
    const cd = e.clipboardData;
    if (!cd) return '';
    const text = cd.getData('text/plain');
    let raw = text || '';
    if (!raw) {
        const html = cd.getData('text/html');
        if (html) {
            const div = document.createElement('div');
            div.innerHTML = html;
            raw = div.innerText || div.textContent || '';
        }
    }
    return raw ? raw.replace(/\r\n/g, '\n').trim() : '';
}

function handleExternalPaste(e) {
    let text = _extractPastedText(e);
    if (!text) return;
    if (!state || !state.pages) return;
    try {
        if (typeof cleanTextForCanvasPaste === 'function') {
            text = cleanTextForCanvasPaste(text);
        }
    } catch (err) {}
    if (!text) return;

    const page = state.pages.find(p => p.id === state.currentPageId);
    if (!page) return;

    e.preventDefault();

    let x = 180, y = 320;
    const m = window.__lastCanvasMouse;
    if (m && m.pageId === page.id) {
        x = m.x;
        y = m.y;
    }
    x = Math.max(0, Math.min(x - 10, 360 - 40));
    y = Math.max(0, Math.min(y - 10, 640 - 40));

    const newLayer = {
        id: 'text-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        type: 'text',
        content: _textToHtmlContent(text),
        fontSize: '20px',
        fontFamily: 'sans-serif',
        color: '#ffffff',
        bgColor: 'transparent',
        bold: false, italic: false, underline: false, strike: false,
        align: 'left',
        vertical: false,
        letterSpacing: 0,
        lineHeight: 1.2,
        opacity: 1,
        effectClass: null,
        rotation: 0, flipH: false, flipV: false,
        x: x, y: y,
        width: 280,
        height: 40,
        heightMode: 'auto'
    };

    state.addLayer(newLayer);
    if (typeof renderAll === 'function') {
        renderAll();
    } else if (typeof renderCanvas === 'function') {
        renderCanvas();
        if (typeof renderLayerList === 'function') renderLayerList();
        if (typeof updateTopToolbarUI === 'function') updateTopToolbarUI(state.getSelectedLayer());
    }
}
window.handleExternalPaste = handleExternalPaste;

(function bindExternalPaste() {
    if (window.__externalPasteBound) return;
    window.__externalPasteBound = true;

    document.addEventListener('mousemove', (e) => {
        const canvas = e.target.closest && e.target.closest('.cover-canvas');
        if (!canvas) return;
        const wrapper = canvas.closest('.canvas-page-wrapper');
        if (!wrapper) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const scaleX = rect.width / 360 || 1;
        const scaleY = rect.height / 640 || 1;
        window.__lastCanvasMouse = {
            pageId: wrapper.dataset.pageId,
            x: (e.clientX - rect.left) / scaleX,
            y: (e.clientY - rect.top) / scaleY
        };
    }, true);

    document.addEventListener('paste', (e) => {
        if (_isEditingTextTarget(e.target) || _isEditingTextTarget(document.activeElement)) {
            return;
        }
        handleExternalPaste(e);
    }, true);
})();