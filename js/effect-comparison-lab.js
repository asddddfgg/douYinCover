/* Embedded, isolated 20-canvas effect comparison lab.
 * Does not replace or patch the existing editor modules.
 */
(function () {
    'use strict';
    const EFFECTS = (typeof ART_EFFECTS !== 'undefined' && ART_EFFECTS.length)
        ? ART_EFFECTS : [];
    const $ = (id) => document.getElementById(id);
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const lab = { cards: [], textA: '', textB: '', effectB: '', scale: 0.5, selected: null, copiedStyle: null, menuTarget: null };
    let initialized = false;

    function init() {
        if (initialized || !$('effect-comparison-lab') || typeof state === 'undefined') return;
        initialized = true;
        $('btn-open-effect-comparison-lab').addEventListener('click', () => {
            $('effect-comparison-lab').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        $('ecl-regenerate').addEventListener('click', regenerate);
        $('ecl-text-a').addEventListener('input', (e) => syncText('A', e.target.value));
        $('ecl-text-b').addEventListener('input', (e) => syncText('B', e.target.value));
        $('ecl-effect-b').addEventListener('change', (e) => {
            lab.effectB = e.target.value;
            lab.cards.forEach(card => { const b = card.layers.find(l => l.__role === 'B'); if (b) b.effectClass = lab.effectB; });
            renderCards();
            status('B 特效已统一更新：' + effectName(lab.effectB));
        });
        $('ecl-scale').addEventListener('change', (e) => {
            lab.scale = Number(e.target.value) || 0.5;
            document.querySelectorAll('.ecl-cover-canvas').forEach(canvas => canvas.style.transform = 'scale(' + lab.scale + ')');
            document.querySelectorAll('.ecl-canvas-frame').forEach(frame => {
                frame.style.width = (360 * lab.scale) + 'px';
                frame.style.height = (640 * lab.scale) + 'px';
            });
        });
        $('ecl-context-menu').addEventListener('click', contextAction);
        document.addEventListener('pointerdown', (e) => {
            if (!$('ecl-context-menu').contains(e.target)) hideMenu();
        });
        regenerate();
    }

    function effectName(id) {
        const found = EFFECTS.find(e => e.id === id);
        return found ? found.name : (id || '无特效');
    }
    function status(message) { $('ecl-live-status').textContent = message; }
    function getCurrentPage() {
        return typeof state.getCurrentPage === 'function' ? state.getCurrentPage() : state.pages[0];
    }
    function backgroundCss(bg) {
        if (!bg) return '#000';
        if (bg.type === 'gradient') return 'linear-gradient(135deg,' + (bg.color1 || '#ff2442') + ' 0%,' + (bg.color2 || '#2575fc') + ' 100%)';
        if (bg.type === 'solid') return bg.color1 || '#000';
        if (bg.type === 'image' && bg.imageUrl) return 'url("' + bg.imageUrl + '") center/cover no-repeat';
        return '#000';
    }
    function regenerate() {
        const page = getCurrentPage();
        if (!page || !Array.isArray(page.layers)) { status('无法读取主画布当前分页。'); return; }
        const sourceLayers = clone(page.layers);
        const textLayers = sourceLayers.filter(layer => layer.type === 'text');
        if (!textLayers.length) { status('主画布当前分页没有文本图层，请先添加文本。'); return; }
        const aSource = textLayers[0];
        const bSource = textLayers[1] || clone(aSource);
        lab.textA = stripHtml(aSource.content || '');
        lab.textB = stripHtml(bSource.content || '');
        lab.effectB = EFFECTS[0] ? EFFECTS[0].id : (bSource.effectClass || '');
        lab.cards = Array.from({ length: 20 }, (_, index) => {
            const layers = clone(sourceLayers).map((layer, n) => {
                layer.id = 'ecl-' + (index + 1) + '-layer-' + n + '-' + Date.now();
                layer.__role = layer === aSource ? 'A' : '';
                return layer;
            });
            // Match roles by source-layer index rather than object identity after cloning.
            const aIndex = sourceLayers.findIndex(l => l.id === aSource.id);
            const bIndex = sourceLayers.findIndex(l => l.id === bSource.id);
            if (layers[aIndex]) { layers[aIndex].__role = 'A'; layers[aIndex].content = escapeHtml(lab.textA); layers[aIndex].effectClass = EFFECTS[index] ? EFFECTS[index].id : layers[aIndex].effectClass; }
            if (layers[bIndex]) { layers[bIndex].__role = 'B'; layers[bIndex].content = escapeHtml(lab.textB); layers[bIndex].effectClass = lab.effectB; }
            // Extra text layers remain independently editable; non-text layers are cloned too.
            layers.forEach(layer => { if (!layer.__role) delete layer.__role; });
            return { index, effectA: EFFECTS[index] ? EFFECTS[index].id : '', layers, background: clone(state.background), pageId: page.id, selectedLayerId: layers[aIndex] ? layers[aIndex].id : null };
        });
        $('ecl-text-a').value = lab.textA;
        $('ecl-text-b').value = lab.textB;
        const select = $('ecl-effect-b');
        select.innerHTML = EFFECTS.map(e => '<option value="' + e.id + '">' + e.name + '</option>').join('');
        select.value = lab.effectB;
        renderCards();
        status('已从主画布第 ' + (state.pages.indexOf(page) + 1) + ' 页生成 20 张独立可编辑副本。');
    }
    function stripHtml(html) {
        const el = document.createElement('div'); el.innerHTML = html;
        return (el.textContent || el.innerText || '').replace(/\u00a0/g, ' ');
    }
    function escapeHtml(text) {
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\n/g, '<br>');
    }
    function syncText(role, value) {
        const key = role === 'A' ? 'textA' : 'textB';
        lab[key] = value;
        lab.cards.forEach(card => {
            const layer = card.layers.find(l => l.__role === role);
            if (layer) layer.content = escapeHtml(value);
        });
        // Update visible text without rerendering the whole card, preserving caret.
        document.querySelectorAll('.ecl-text-' + role.toLowerCase()).forEach(el => {
            if (document.activeElement !== el) el.innerHTML = escapeHtml(value);
        });
        status(role + ' 文字已同步到全部 20 张副本。');
    }
    function renderCards() {
        const grid = $('ecl-canvas-grid');
        grid.innerHTML = '';
        lab.cards.forEach(card => grid.appendChild(renderCard(card)));
    }
    function renderCard(card) {
        const wrapper = document.createElement('article');
        wrapper.className = 'ecl-card';
        wrapper.dataset.card = card.index;
        const effect = EFFECTS[card.index] || { id: card.effectA, name: effectName(card.effectA) };
        wrapper.innerHTML = '<div class="ecl-card-head"><strong>副本 ' + (card.index + 1) + ' / 20</strong><span class="ecl-chip">A · ' + escapeHtml(effect.name) + '</span></div>';
        const tools = document.createElement('div');
        tools.className = 'ecl-card-tools';
        const effectLabel = document.createElement('label');
        effectLabel.className = 'ecl-wide';
        effectLabel.textContent = 'A 特效（本张独立）';
        const aSelect = document.createElement('select');
        aSelect.innerHTML = EFFECTS.map(e => '<option value="' + e.id + '">' + e.name + '</option>').join('');
        aSelect.value = card.effectA;
        aSelect.addEventListener('change', () => {
            card.effectA = aSelect.value;
            const a = card.layers.find(l => l.__role === 'A');
            if (a) a.effectClass = card.effectA;
            renderCards();
            status('副本 ' + (card.index + 1) + ' 的 A 特效已更改。');
        });
        effectLabel.appendChild(aSelect); tools.appendChild(effectLabel);
        const selected = card.layers.find(l => l.id === card.selectedLayerId) || card.layers.find(l => l.__role === 'A') || card.layers[0];
        const fontLabel = document.createElement('label'); fontLabel.textContent = '字号';
        const fontInput = document.createElement('input'); fontInput.type = 'number'; fontInput.min = '8'; fontInput.max = '160'; fontInput.value = parseFloat(selected && selected.fontSize) || 28;
        fontInput.addEventListener('change', () => { if (!selected) return; selected.fontSize = Math.max(8, Math.min(160, Number(fontInput.value) || 28)) + 'px'; renderCards(); });
        fontLabel.appendChild(fontInput); tools.appendChild(fontLabel);
        const colorLabel = document.createElement('label'); colorLabel.textContent = '文字颜色';
        const colorInput = document.createElement('input'); colorInput.type = 'color'; colorInput.value = /^#[0-9a-f]{6}$/i.test(selected && selected.color || '') ? selected.color : '#ffffff';
        colorInput.addEventListener('input', () => { if (!selected) return; selected.color = colorInput.value; renderCards(); });
        colorLabel.appendChild(colorInput); tools.appendChild(colorLabel);
        const boldBtn = document.createElement('button'); boldBtn.type = 'button'; boldBtn.textContent = '粗体切换'; boldBtn.addEventListener('click', () => { if (!selected) return; selected.bold = !selected.bold; renderCards(); }); tools.appendChild(boldBtn);
        const alignBtn = document.createElement('button'); alignBtn.type = 'button'; alignBtn.textContent = '切换对齐'; alignBtn.addEventListener('click', () => { if (!selected) return; selected.align = selected.align === 'left' ? 'center' : selected.align === 'center' ? 'right' : 'left'; renderCards(); }); tools.appendChild(alignBtn);
        wrapper.appendChild(tools);
        const frame = document.createElement('div'); frame.className = 'ecl-canvas-frame'; frame.style.width = (360 * lab.scale) + 'px'; frame.style.height = (640 * lab.scale) + 'px';
        const canvas = document.createElement('div'); canvas.className = 'ecl-cover-canvas'; canvas.style.transform = 'scale(' + lab.scale + ')';
        const bg = document.createElement('div'); bg.className = 'canvas-bg'; bg.style.background = backgroundCss(card.background); canvas.appendChild(bg);
        const layers = document.createElement('div'); layers.className = 'layers-wrapper';
        card.layers.forEach(layer => {
            const el = document.createElement('div');
            el.className = 'canvas-layer' + (layer.id === card.selectedLayerId ? ' ecl-selected' : '');
            el.dataset.layerId = layer.id;
            el.style.left = (Number(layer.x) || 0) + 'px'; el.style.top = (Number(layer.y) || 0) + 'px';
            el.style.width = (Number(layer.width) || 280) + 'px'; el.style.height = (Number(layer.height) || 100) + 'px';
            el.style.opacity = layer.opacity == null ? 1 : layer.opacity;
            if (layer.type === 'text') {
                const inner = document.createElement('div');
                inner.className = 'text-content-editable' + (layer.__role ? ' ecl-text-' + layer.__role.toLowerCase() : '');
                inner.innerHTML = layer.content || '';
                Object.assign(inner.style, {
                    fontSize: layer.fontSize || '28px', fontFamily: layer.fontFamily || 'sans-serif', color: layer.color || '#fff',
                    backgroundColor: layer.bgColor || 'transparent', fontWeight: layer.bold ? 'bold' : 'normal',
                    fontStyle: layer.italic ? 'italic' : 'normal',
                    textDecoration: [layer.underline ? 'underline' : '', layer.strike ? 'line-through' : ''].filter(Boolean).join(' '),
                    textAlign: layer.align || 'center', writingMode: layer.vertical ? 'vertical-rl' : 'horizontal-tb',
                    letterSpacing: (layer.letterSpacing || 0) + 'px', lineHeight: layer.lineHeight || 1.2
                });
                if (layer.effectClass) inner.classList.add(layer.effectClass);
                inner.contentEditable = 'false';
                inner.spellcheck = false;
                inner.addEventListener('input', () => {
                    layer.content = inner.innerHTML;
                    if (layer.__role) syncText(layer.__role, stripHtml(inner.innerHTML));
                });
                inner.addEventListener('blur', () => { el.classList.remove('ecl-editing'); });
                el.appendChild(inner);
            } else if (layer.type === 'sticker' || layer.type === 'image') {
                const item = document.createElement('div'); item.textContent = layer.content || layer.emoji || '⭐'; item.style.fontSize = layer.fontSize || '36px'; el.appendChild(item);
            } else {
                const item = document.createElement('div'); item.textContent = layer.content || ''; el.appendChild(item);
            }
            el.addEventListener('pointerdown', (e) => beginDrag(e, card, layer, el, canvas));
            el.addEventListener('click', (e) => { e.stopPropagation(); card.selectedLayerId = layer.id; lab.selected = { card, layer }; renderCards(); });
            el.addEventListener('dblclick', (e) => {
                e.preventDefault(); e.stopPropagation();
                if (layer.type !== 'text') return;
                card.selectedLayerId = layer.id;
                const content = el.querySelector('.text-content-editable');
                if (content) { content.contentEditable = 'true'; el.classList.add('ecl-editing'); content.focus(); const range = document.createRange(); range.selectNodeContents(content); range.collapse(false); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); }
                lab.selected = { card, layer };
            });
            el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); card.selectedLayerId = layer.id; lab.menuTarget = { card, layer }; showMenu(e.clientX, e.clientY); });
            layers.appendChild(el);
        });
        canvas.appendChild(layers); frame.appendChild(canvas); wrapper.appendChild(frame);
        return wrapper;
    }
    function beginDrag(e, card, layer, el, canvas) {
        if (e.button !== 0 || e.target.isContentEditable || e.target.closest('.ecl-editing')) return;
        if (e.target.closest('button,select,input')) return;
        card.selectedLayerId = layer.id;
        const startX = e.clientX, startY = e.clientY, x = Number(layer.x) || 0, y = Number(layer.y) || 0;
        const scale = lab.scale;
        let moved = false;
        const move = (ev) => {
            const dx = (ev.clientX - startX) / scale, dy = (ev.clientY - startY) / scale;
            if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
            layer.x = Math.round(x + dx); layer.y = Math.round(y + dy);
            el.style.left = layer.x + 'px'; el.style.top = layer.y + 'px';
        };
        const up = () => {
            window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
            if (moved) status('图层位置已更新（仅本张副本）。');
        };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true });
    }
    function showMenu(x, y) {
        const menu = $('ecl-context-menu'); menu.hidden = false;
        menu.style.left = Math.min(x, window.innerWidth - 175) + 'px';
        menu.style.top = Math.min(y, window.innerHeight - 230) + 'px';
    }
    function hideMenu() { $('ecl-context-menu').hidden = true; }
    function contextAction(e) {
        const btn = e.target.closest('button[data-action]');
        if (!btn || !lab.menuTarget) return;
        const { card, layer } = lab.menuTarget;
        const action = btn.dataset.action;
        if (action === 'copy') {
            const copied = clone(layer); copied.id = 'ecl-copy-' + Date.now(); delete copied.__role; copied.x = (Number(copied.x) || 0) + 16; copied.y = (Number(copied.y) || 0) + 16; card.layers.push(copied); card.selectedLayerId = copied.id;
        } else if (action === 'copy-style') {
            lab.copiedStyle = {}; ['fontSize','fontFamily','color','bgColor','bold','italic','underline','strike','align','vertical','letterSpacing','lineHeight','opacity','effectClass'].forEach(k => lab.copiedStyle[k] = layer[k]);
            status('已复制当前图层样式。');
        } else if (action === 'paste-style') {
            if (!lab.copiedStyle) { status('请先使用“复制样式”。' ); return; }
            Object.assign(layer, clone(lab.copiedStyle));
        } else if (action === 'up' || action === 'down') {
            const i = card.layers.indexOf(layer), j = action === 'up' ? i - 1 : i + 1;
            if (i >= 0 && j >= 0 && j < card.layers.length) [card.layers[i], card.layers[j]] = [card.layers[j], card.layers[i]];
        } else if (action === 'delete') {
            if (layer.__role === 'A' || layer.__role === 'B') { status('A/B 是全局唯一文本框，不能删除；可以删除其他副本图层。'); hideMenu(); return; }
            card.layers = card.layers.filter(l => l.id !== layer.id);
        }
        hideMenu(); renderCards(); status('右键菜单操作已完成（仅当前副本）。');
    }

    document.addEventListener('DOMContentLoaded', init);
    // app.js also renders on DOMContentLoaded; a later microtask ensures state/pages exist.
    window.addEventListener('load', () => { if (!initialized) init(); });
})();