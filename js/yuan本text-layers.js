// Canva Standard Rich Text Formatting on Selection & Top Toolbar Controls




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

// mousedown 阶段冻结选区快照（防焦点丢失）
let _savedSelectionContext = null;

document.addEventListener('mousedown', (e) => {
    if (!state.editingLayerId) return;
    const ctx = getActiveSelectionRange();
    if (!ctx || ctx.collapsed) return;

    // 底衬在 sidebar 内：必须先排除，否则 .sidebar-right 仍会 preventDefault
    if (e.target.closest('.backdrop-card')) {
        return;
    }

    if (e.target.closest('.effect-card, .btn, .tool-btn, .sidebar-left, .sidebar-right, .top-text-toolbar')) {
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

     // ✅ 修复：收集"任何带强特效样式的 span"，不再只认 data-effect-span="1"。
    //    叠加特效时只有最外层 span 被打标记，内层嵌套 span 没有标记但同样带样式，
    //    原逻辑会漏掉它们，导致"清了几层就清不动了"。
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

/* 判断一个 span 是不是"看起来像特效"（历史兼容用）
   只认强特效属性，避免把"手动加粗+斜体"误判为特效 */
function looksLikeEffectSpan(sp) {
    if (!sp.style) return false;
    // ✅ 补全属性清单：叠加特效时内层 span 常带 color / background / padding，
    //    原清单漏了这些，导致"清了几层就清不动"。另外，带 data-effect-span 的直接算特效。
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
        // ✅ 修复：用 START_TO_START 判断"节点在选区之前"，
        //    START_TO_END 判断"节点在选区之后"。
        //    原代码用 END_TO_START 方向反了，导致 beforeSel 和 afterSel 同时为 true，
        //    span 被误判为"没选中"，清理函数什么都删不掉。
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

        // ✅ 用"节点与选区是否有交集"判断，不依赖 compareBoundaryPoints 的边界细节。
        //    嵌套 span 里 compareBoundaryPoints 容易算错，导致部分覆盖时整段都不拆。
        let intersects = false;
        try {
            intersects = range.intersectsNode(c.node);
        } catch (e) {
            intersects = c.selected;
        }

        if (intersects) {
            // 用 Range 直接算该文本节点落在选区内的字符区间 [s, e)
            let s = 0, e = c.text.length;
            try {
                const nodeRange = document.createRange();
                nodeRange.selectNodeContents(c.node);

                // 节点整体在选区起点之前 → s = 节点长度（完全不在选区内）
                if (nodeRange.compareBoundaryPoints(Range.END_TO_START, range) <= 0) {
                    s = c.text.length;
                    e = c.text.length;
                } else if (nodeRange.compareBoundaryPoints(Range.START_TO_END, range) >= 0) {
                    // 节点整体在选区终点之后 → 完全不在选区内
                    s = 0;
                    e = 0;
                } else {
                    // 有交集：逐字符判断更稳
                    for (let i = 0; i < c.text.length; i++) {
                        const cr = document.createRange();
                        cr.setStart(c.node, i);
                        cr.setEnd(c.node, i + 1);
                        const inSel = range.compareBoundaryPoints(Range.START_TO_START, cr) <= 0
                                   && range.compareBoundaryPoints(Range.END_TO_END, cr) >= 0;
                        if (inSel && s === 0 && i === 0) s = 0;
                        if (inSel) { e = i + 1; } else if (s !== 0 || i > 0) {
                            if (e > s) break;
                        }
                    }
                    // 简化：用逐字符 intersects 收集
                    s = c.text.length;
                    e = 0;
                    for (let i = 0; i < c.text.length; i++) {
                        const cr = document.createRange();
                        cr.setStart(c.node, i);
                        cr.setEnd(c.node, i + 1);
                        if (range.intersectsNode(c.node)) {
                            const cmpStart = range.compareBoundaryPoints(Range.START_TO_START, cr);
                            const cmpEnd = range.compareBoundaryPoints(Range.END_TO_END, cr);
                            const inSel = cmpStart <= 0 && cmpEnd >= 0;
                            if (inSel) {
                                if (i < s) s = i;
                                if (i + 1 > e) e = i + 1;
                            }
                        }
                    }
                    if (e <= s) { s = 0; e = c.text.length; }
                }
            } catch (err) {
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

    // 4) 按"有内容才插入"的原则，把 sp 替换成 1~3 段
    const hasBefore = beforeFrag.textContent.length > 0;
    const hasCore = coreFrag.textContent.length > 0;
    const hasAfter = afterFrag.textContent.length > 0;

           if (!hasBefore && !hasAfter && hasCore) {
        // ✅ 彻底清理：不管 span 里有什么样式/属性，只要选区完整覆盖它，
        //    就把所有子节点原样提到父层，然后直接删掉 span 本身。
        //    这样 color/background/padding/text-shadow/filter 等所有层叠样式一次清空，
        //    不会出现"清了几层就清不动"的情况。
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

    // 1) 用偏移量把选区对应的文字和前后文字分开
    const startOffset = getTextOffsetInRoot(rootEl, range.startContainer, range.startOffset);
    const endOffset = getTextOffsetInRoot(rootEl, range.endContainer, range.endOffset);
    if (startOffset === null || endOffset === null) return;

    // 2) 把整个图层按"前 / 中 / 后"三段提取出来，每段保留自己的 HTML 结构
    //    方法：遍历所有文本节点，按全局偏移判断该节点属于前/中/后哪一段
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null, false);
    let total = 0;
    const segBefore = [];   // { text, ancestors: [...] }  前段
    const segMiddle = [];   // 中段（要清特效）
    const segAfter = [];    // 后段

    while (walker.nextNode()) {
        const node = walker.currentNode;
        const text = node.nodeValue;
        if (!text) continue;
        const nodeStart = total;
        const nodeEnd = total + text.length;
        total = nodeEnd;

        // 收集该节点的祖先 span 链（从 rootEl 往下）
        const ancestors = [];
        let p = node.parentNode;
        while (p && p !== rootEl) {
            ancestors.unshift(p);
            p = p.parentNode;
        }

        // 计算该节点与 [startOffset, endOffset] 的交集
        const s = Math.max(nodeStart, startOffset);
        const e = Math.min(nodeEnd, endOffset);

        if (nodeEnd <= startOffset) {
            segBefore.push({ text, ancestors });
        } else if (nodeStart >= endOffset) {
            segAfter.push({ text, ancestors });
        } else {
            // 有交集：拆成 前段 / 中段 / 后段
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

    // 3) 重建 HTML：前段 / 中段（无样式）/ 后段
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

    // 中段：只保留纯文本，不带任何特效样式
    const middleHtml = segMiddle.map(s => escapeHtml(s.text)).join('');
    const beforeHtml = buildHtml(segBefore);
    const afterHtml = buildHtml(segAfter);

    rootEl.innerHTML = beforeHtml + middleHtml + afterHtml;

    // 4) 同步 layer.content
    const layer = state.layers.find(l => l.id === state.editingLayerId);
    if (layer) layer.content = rootEl.innerHTML;

    // 5) 恢复选区到清理后的中段文字（方便继续操作）
    try {
        const newStart = beforeHtml.length === 0 ? 0 : null;
        // 简单做法：把光标放回中段末尾
        const sel = window.getSelection();
        const r = document.createRange();
        // 找到中段最后一个文本节点
        const newWalker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null, false);
        let acc = 0, targetNode = null, targetOff = 0;
        const targetStart = startOffset;
        const targetEnd = endOffset;
        while (newWalker.nextNode()) {
            const n = newWalker.currentNode;
            const len = n.nodeValue.length;
            if (acc + len >= targetStart) {
                targetNode = n;
                targetOff = targetStart - acc;
                break;
            }
            acc += len;
        }
        if (targetNode) {
            r.setStart(targetNode, Math.min(targetOff, targetNode.nodeValue.length));
            r.setEnd(targetNode, Math.min(targetOff, targetNode.nodeValue.length));
            sel.removeAllRanges();
            sel.addRange(r);
        }
    } catch (e) {}

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








// 把单个特效应用到当前选区
function applyEffectToSelection(eff) {
    if (!eff || !eff.css) return;
    const ctx = getActiveSelectionRange();
    if (!ctx || ctx.collapsed) return;
    // 先清掉选区里"上一次特效"的 span（只动带 data-effect-span 的），
    // 保留前后未选中部分；清理后 DOM 会变，必须重新取选区再 wrap。
    const layerId = state.editingLayerId;
    const rootEl = ctx.el;
    const saved = clearEffectSpansInSelection(ctx);
    if (saved) {
        restoreSelectionByTextOffset(saved.root, saved.start, saved.end);
    }
    // ✅ 兜底修复：清理后如果选区丢了（getActiveSelectionRange 返回 null/collapsed），
    //    直接用 saved 的文本偏移重建选区，再继续套新特效。
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

        const doMoveLayer = (direction) => {
        // 优先用多选里的"主选中"，没有再退回 selectedLayerId
        let id = state.selectedLayerId;
        if (window.MultiSelect && state.selectedLayerIds && state.selectedLayerIds.length === 1) {
            id = state.selectedLayerIds[0];
        }
        if (!id) return;

        // 先确认这一层确实存在于当前页，避免"点了没反应"
        const exists = state.layers.some(l => l.id === id);
        if (!exists) return;

        const moved = state.moveLayer(id, direction);
        if (!moved) return; // 已经在最顶/最底，什么都不用做

        // 挪完保持选中
        state.selectedLayerId = id;
        if (window.MultiSelect) state.selectedLayerIds = [id];

        renderCanvas();
        renderLayerList();
        updateTopToolbarUI(state.getSelectedLayer());
    };

    document.getElementById('ctx-move-up').addEventListener('click', () => doMoveLayer('up'));
    document.getElementById('ctx-move-down').addEventListener('click', () => doMoveLayer('down'));

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

        // ✅ 清除所选文字特效（行内）
    // 关键：点击菜单项时，选区已经因为菜单获得焦点而丢了，
    // 所以要在 mousedown 阶段先把选区快照下来，点击时用快照清理。
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
            } catch (err) {}
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
            // ✅ 手动关闭右键菜单（因为 stopPropagation 挡住了全局关闭监听）
            const m = document.getElementById('context-menu');
            if (m) m.style.display = 'none';
        });
    }

    // ✅ 清除整层特效
    const clearLayerItem = document.getElementById('ctx-clear-layer-effect');
    if (clearLayerItem) {
        clearLayerItem.addEventListener('click', () => {
            const layer = state.getSelectedLayer();
            if (!layer || layer.type !== 'text') return;
            layer.effectClass = null;
            const tmp = document.createElement('div');
            tmp.innerHTML = layer.content || '';
            tmp.querySelectorAll('span').forEach(sp => {
                sp.removeAttribute('data-effect-span');
                sp.removeAttribute('style');
                if (!sp.attributes.length && !sp.className) {
                    const p = sp.parentNode;
                    while (sp.firstChild) p.insertBefore(sp.firstChild, sp);
                    p.removeChild(sp);
                }
            });
            tmp.normalize();
            layer.content = tmp.innerHTML;
            state.saveState();
            renderCanvas();
            renderLayerList();
            if (typeof renderEffectsGrid === 'function') renderEffectsGrid();
        });
    }
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

    { type: 'polaroid', name: '拍立得', cat: 'decor' },
    { type: 'ticket', name: '车票/电影票', cat: 'decor' },
    { type: 'washi', name: '日式和纸', cat: 'decor' }
];

let currentBackdropCategory = 'paper';
let backdropCache = {};   // custom id -> dataUrl

function setupBackdropPanel() {
    // ✅ 绑定"批量导入形状"按钮
    setupBackdropImport();

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
        // 禁止整表重建，否则侧栏滚动/布局跳动，看起来像光标回弹
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
                // ✅ 根据库里记录的 isMask 决定：是形状蒙版才标记，上传图片不标
                               // ✅ 兼容：从"形状导入"进来的蒙版底衬，标记 isMask + 白色默认色
               // ✅ 严格按 BackdropDB 记录里的 isMask 决定，不再靠 name 猜测
if (item.isMask) {
    layer.backdrop.isMask = true;
    if (!layer.backdrop.color || layer.backdrop.color === '#fff8dc') {
        layer.backdrop.color = '#ffffff';
    }
} else {
    // 普通图片底衬：明确不染色
    layer.backdrop.isMask = false;
    // color 可以保留，但 UI 会隐藏，不影响渲染
}




                state.saveState();
                renderCanvas();
                // 同上：不要 rebuild
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
        await BackdropDB.addBackdrop(file.name, dataUrl, false);   // ⭐ 加 false，表示普通图片
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
      // ✅ 按 isMask 显隐"底衬颜色"控制组
    const colorGroup = document.getElementById('backdrop-color-group');
    if (colorGroup) {
        // 仅「自定义 + 形状蒙版」显示颜色选择器
        const showColor = (bd.type === 'custom' && bd.isMask === true);
        colorGroup.style.display = showColor ? 'block' : 'none';
    }
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





/* ============================================================
   底衬形状批量导入（A 方案：白色透明蒙版 + 每图层独立着色）
   - 支持 { "shapes": [ { name, svg?, path?, viewBox? } ] }
   - 也兼容直接数组 [ { name, svg?, path? } ]
   - 支持 .svg 文件一次性拖入
   - 严格白名单校验，拒绝 script / on* / 外链
   - 所有形状统一转成白色透明蒙版 PNG 存进 BackdropDB
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


// 把任意 SVG 统一成：白色填充、无描边、透明底，然后转 PNG 蒙版
// 把任意 SVG 统一成：白色填充、无描边、透明底，然后转 PNG 蒙版
// 把任意 SVG 统一成：白色填充、无描边、透明底，然后转 PNG 蒙版
// 核心：强制 SVG 的 width/height = 256，用 data:image/svg+xml 加载，
//       直接 drawImage(img,0,0,256,256)，完全不依赖 naturalWidth/Height
function _svgToWhiteMaskDataUrl(svgString) {
    const svg = _sanitizeSvg(svgString);

    // ---------- 1. 保证有合法的 viewBox ----------
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

    // 关键修复：先把 SVG 的 viewBox 扩展为正方形坐标范围，再栅格化为正方形 PNG。
    // 仅设置 preserveAspectRatio 在部分输入/渲染链路中不足以避免宽高比被压缩；
    // 扩展较短的一边而不是拉伸图形，因此圆仍是圆、三角形仍保持原有角度。
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

    // ---------- 2. 强制 intrinsic size = 目标尺寸（关键） ----------
    svg.setAttribute('width', String(SHAPE_MASK_SIZE));
    svg.setAttribute('height', String(SHAPE_MASK_SIZE));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // 确保 xmlns（sanitize 后有时会丢）
    if (!svg.getAttribute('xmlns')) {
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }

    // ---------- 3. 所有图形 → 白色填充、无描边 ----------
    const walker = document.createTreeWalker(svg, NodeFilter.SHOW_ELEMENT, null);
    const all = [svg];
    while (walker.nextNode()) all.push(walker.currentNode);

    all.forEach(node => {
        const tag = node.tagName.toLowerCase();
        if (['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line'].includes(tag)) {
            node.setAttribute('fill', '#ffffff');
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

    // ---------- 4. 序列化 → data:image/svg+xml → 绘制 ----------
    const serialized = new XMLSerializer().serializeToString(svg);
    const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serialized);

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = SHAPE_MASK_SIZE;
                canvas.height = SHAPE_MASK_SIZE;
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, SHAPE_MASK_SIZE, SHAPE_MASK_SIZE);
                // 直接 1:1 画，SVG 已经是 256×256，绝不依赖 naturalWidth
                ctx.drawImage(img, 0, 0, SHAPE_MASK_SIZE, SHAPE_MASK_SIZE);
                resolve(canvas.toDataURL('image/png'));
            } catch (e) {
                reject(e);
            }
        };
        img.onerror = () => reject(new Error('SVG 转 PNG 失败（img onerror）'));
        img.src = svgDataUrl;
    });
}






// 从"只有 path"的简写生成 SVG
function _pathToSvg(pathD, viewBox, fill) {
    const vb = viewBox || '0 0 100 100';
    const f = fill || '#ffffff';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><path d="${pathD}" fill="${f}"/></svg>`;
}

// 解析输入（JSON 文本 或 SVG 文本），返回 shapes 数组
async function _parseShapeInput(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) throw new Error('输入为空');

    // 情况 1：单个 SVG 文本
    if (trimmed.startsWith('<svg')) {
        return [{ name: 'SVG 形状 ' + Date.now(), svg: trimmed }];
    }

    // 情况 2：JSON
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

// 主流程：解析 → 转蒙版 → 存 BackdropDB（同名覆盖）
async function _importShapesFromText(text) {
    const shapes = await _parseShapeInput(text);
    const status = document.getElementById('backdrop-import-status');
    const results = [];
    let ok = 0, fail = 0;

    for (let i = 0; i < shapes.length; i++) {
        const s = shapes[i];
        try {
            const dataUrl = await _svgToWhiteMaskDataUrl(s.svg);
            const id = await BackdropDB.upsertBackdropByName(s.name, dataUrl, true);   // ⭐ 加 true，表示形状蒙版
            results.push({ name: s.name, ok: true, id });
            ok++;
            if (status) status.innerHTML = `处理中 ${i + 1}/${shapes.length}：${s.name} ✔`;
        } catch (e) {
            fail++;
            results.push({ name: s.name, ok: false, error: e.message });
            if (status) status.innerHTML = `处理中 ${i + 1}/${shapes.length}：${s.name} ✖ ${e.message}`;
        }
    }

    await refreshCustomBackdropCache();
    // 切到"自定义"分类，让用户立刻看到
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

// 绑定 UI
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
    // 粘贴绑定用的是立即执行函数，这里只是占位，保证 init 时能调用到
    if (typeof bindExternalPaste === 'function') bindExternalPaste();
}



/* ============================================================
   外部剪贴板粘贴 → 新建文字图层（Canva 风格）
   - 只在"非编辑焦点"时生效：当前没在编辑任何文字框
   - 原有输入框内粘贴逻辑完全不动（见守卫函数）
   - 位置 = 鼠标最后停在画布上的位置，否则画布中心
   - 新图层：align:'left'，fontSize:'24px'，heightMode:'auto'
   ============================================================ */

// 记录鼠标最后停在画布上的坐标（画布坐标系）
window.__lastCanvasMouse = null;

// 判断事件目标是否处于"文字编辑态"（input / textarea / contenteditable）
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

// 把纯文本转成安全的 HTML（转义 + 换行变 <br>）
function _textToHtmlContent(text) {
    const esc = String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    return esc.split(/\r?\n/).map(line => line || '&nbsp;').join('<br>');
}

// 从剪贴板事件里取纯文本（优先 text/plain，最稳）
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

// 主处理器：非编辑态粘贴 → 新建文字图层
function handleExternalPaste(e) {
    const text = _extractPastedText(e);
    if (!text) return;              // 没有文本（如粘贴图片）→ 不拦，放行
    if (!state || !state.pages) return;

    const page = state.pages.find(p => p.id === state.currentPageId);
    if (!page) return;

    e.preventDefault();             // 只在自己的分支阻止默认行为

    // 落点：优先用最后的鼠标位置，否则画布中心（360×640）
    let x = 180, y = 320;
    const m = window.__lastCanvasMouse;
    if (m && m.pageId === page.id) {
        x = m.x;
        y = m.y;
    }
    // 稍微左上偏移，避免文字正好压在鼠标下
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

// 绑定：捕获阶段监听 paste，先做守卫，编辑态直接放行
(function bindExternalPaste() {
    if (window.__externalPasteBound) return;
    window.__externalPasteBound = true;

    // 1) 记录鼠标在画布上的最后坐标
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

    // 2) 粘贴守卫：编辑态放行，非编辑态走新逻辑
    document.addEventListener('paste', (e) => {
        if (_isEditingTextTarget(e.target) || _isEditingTextTarget(document.activeElement)) {
            return; // ⚠️ 原有输入框粘贴逻辑，完全不动
        }
        handleExternalPaste(e);
    }, true);
})();




