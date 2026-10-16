/* 独立的可编辑副本画布实验室。只读取主 state 做初始克隆，不改写主编辑器逻辑。 */
(() => {
    'use strict';
    const LAB = { root:null, cards:[], textA:'', textB:'', layerAIndex:-1, layerBIndex:-1, effectB:null, sourceBackground:null, sourcePageId:null, effects:[] };
    const clone = value => JSON.parse(JSON.stringify(value));
    const uid = prefix => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

    function initEffectComparisonLab() {
        LAB.root = document.getElementById('effect-comparison-lab');
        if (!LAB.root || typeof state === 'undefined') return;
        LAB.effects = typeof ART_EFFECTS !== 'undefined' && Array.isArray(ART_EFFECTS) ? ART_EFFECTS.slice() : [];
        LAB.effectB = LAB.effects.length ? LAB.effects[0].id : 'effect-gradient';
        buildLabShell();
        const jumpButton = document.getElementById('btn-open-ecl-lab');
        if (jumpButton) jumpButton.addEventListener('click', () => LAB.root.scrollIntoView({ behavior:'smooth', block:'start' }));
        createCopiesFromMain();
    }

    function buildLabShell() {
        LAB.root.innerHTML = '';
        LAB.root.className = 'ecl-real-lab';
        const header = document.createElement('div');
        header.className = 'ecl-real-header';
        const intro = document.createElement('div');
        const heading = document.createElement('h2');
        heading.textContent = '特效对比实验室';
        const desc = document.createElement('p');
        desc.textContent = '从主编辑区克隆真实可编辑画布。A 特效逐张变化，B 特效在全部副本中保持一致；副本修改不会自动改动主画布。';
        intro.append(heading, desc);
        const actions = document.createElement('div');
        actions.className = 'ecl-real-header-actions';
        const sync = makeButton('从主画布重新生成副本', 'primary');
        sync.addEventListener('click', () => {
            if (LAB.cards.some(card => card.dirty || card.pinned) && !confirm('重新生成会丢弃实验室副本中的修改。确定从当前主画布重新克隆吗？')) return;
            createCopiesFromMain();
        });
        actions.appendChild(sync);
        header.append(intro, actions);

        const globals = document.createElement('div');
        globals.className = 'ecl-real-global-controls';
        globals.innerHTML = '<div class="ecl-real-control"><label for="ecl-global-text-a">全局唯一的 A 文字（同步到全部副本）</label><textarea id="ecl-global-text-a" rows="2"></textarea></div><div class="ecl-real-control"><label for="ecl-global-text-b">全局唯一的 B 文字（同步到全部副本）</label><textarea id="ecl-global-text-b" rows="2"></textarea></div><div class="ecl-real-control"><label for="ecl-global-effect-b">B 特效（全部副本统一）</label><select id="ecl-global-effect-b"></select><small>默认使用特效库第 1 项；修改后同步全部 B 文本框。</small></div>';
        const effectSelect = globals.querySelector('#ecl-global-effect-b');
        LAB.effects.forEach((effect, index) => {
            const option = document.createElement('option');
            option.value = effect.id;
            option.textContent = 'E' + (index + 1) + ' · ' + effect.name;
            effectSelect.appendChild(option);
        });
        effectSelect.value = LAB.effectB;
        globals.querySelector('#ecl-global-text-a').addEventListener('input', e => {
            LAB.textA = e.target.value;
            syncGroupText('A', LAB.textA, null);
        });
        globals.querySelector('#ecl-global-text-b').addEventListener('input', e => {
            LAB.textB = e.target.value;
            syncGroupText('B', LAB.textB, null);
        });
        effectSelect.addEventListener('change', e => {
            LAB.effectB = e.target.value;
            LAB.cards.forEach(card => {
                const layer = card.layers[LAB.layerBIndex];
                if (layer && layer.type === 'text') { layer.effectClass = LAB.effectB; card.dirty = true; refreshCardLayer(card, layer.id); }
            });
        });
        const note = document.createElement('div');
        note.className = 'ecl-real-note';
        note.textContent = '双击文字进入编辑；拖动图层可移动，拖动控制点可缩放；选中图层后可调整字号、颜色、粗体、对齐和透明度。A 特效每张独立，B 特效全局统一。副本之间相互隔离，只有 A/B 文字和 B 特效按全局字段同步。';
        LAB.root.append(header, globals, note);
        const grid = document.createElement('div');
        grid.className = 'ecl-real-grid';
        grid.id = 'ecl-real-grid';
        LAB.root.appendChild(grid);
    }

    function createCopiesFromMain() {
        if (!state || !state.getCurrentPage) return;
        const page = state.getCurrentPage();
        if (!page) return;
        const baseLayers = clone(page.layers || []);
        const textIndexes = [];
        baseLayers.forEach((layer, index) => { if (layer.type === 'text') textIndexes.push(index); });
        LAB.layerAIndex = textIndexes.length ? textIndexes[0] : -1;
        LAB.layerBIndex = textIndexes.length > 1 ? textIndexes[1] : -1;
        LAB.textA = LAB.layerAIndex >= 0 ? stripText(baseLayers[LAB.layerAIndex].content) : '';
        LAB.textB = LAB.layerBIndex >= 0 ? stripText(baseLayers[LAB.layerBIndex].content) : '';
        LAB.sourceBackground = clone(state.background);
        LAB.sourcePageId = page.id;
        LAB.cards = [];
        const aInput = LAB.root.querySelector('#ecl-global-text-a');
        const bInput = LAB.root.querySelector('#ecl-global-text-b');
        if (aInput) { aInput.value = LAB.textA; aInput.disabled = LAB.layerAIndex < 0; }
        if (bInput) { bInput.value = LAB.textB; bInput.disabled = LAB.layerBIndex < 0; }
        const bEffectSelect = LAB.root.querySelector('#ecl-global-effect-b');
        if (bEffectSelect) bEffectSelect.value = LAB.effectB;

        const effects = LAB.effects.length ? LAB.effects : [{ id:'effect-gradient', name:'默认特效' }];
        effects.forEach((effect, index) => {
            const layers = clone(baseLayers).map(layer => Object.assign({}, layer, { id:uid('ecl-layer') }));
            const card = { id:uid('ecl-canvas'), number:index + 1, effectId:effect.id, layers, background:clone(LAB.sourceBackground), selectedLayerId:null, pinned:false, pinnedAt:0, dirty:false, manualOrder:index, pageTitle:page.title || '主画布' };
            if (LAB.layerAIndex >= 0 && layers[LAB.layerAIndex]) {
                layers[LAB.layerAIndex].content = escapeHTML(LAB.textA);
                layers[LAB.layerAIndex].effectClass = effect.id;
                card.selectedLayerId = layers[LAB.layerAIndex].id;
            }
            if (LAB.layerBIndex >= 0 && layers[LAB.layerBIndex]) {
                layers[LAB.layerBIndex].content = escapeHTML(LAB.textB);
                layers[LAB.layerBIndex].effectClass = LAB.effectB;
            }
            LAB.cards.push(card);
        });
        renderCards();
    }

    function getSortedCards() {
        return LAB.cards.slice().sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            if (a.pinned && b.pinned && a.pinnedAt !== b.pinnedAt) return a.pinnedAt - b.pinnedAt;
            return (a.manualOrder ?? a.number) - (b.manualOrder ?? b.number);
        });
    }

    function renderCards() {
        const grid = LAB.root.querySelector('#ecl-real-grid');
        if (!grid) return;
        grid.innerHTML = '';
        getSortedCards().forEach(card => grid.appendChild(renderCard(card)));
    }

    function renderCard(card) {
        const shell = document.createElement('section');
        shell.className = 'ecl-real-card' + (card.pinned ? ' is-pinned' : '');
        shell.dataset.cardId = card.id;
        const head = document.createElement('div');
        head.className = 'ecl-real-card-head';
        const title = document.createElement('strong');
        title.textContent = 'Canvas-' + card.number;
        const status = document.createElement('span');
        status.className = 'ecl-real-card-status';
        status.textContent = card.pinned ? '已固定' : '可编辑副本';
        head.append(title, status);

        const effectRow = document.createElement('div');
        effectRow.className = 'ecl-real-card-effect';
        const effectLabel = document.createElement('label');
        effectLabel.textContent = 'A 特效';
        const select = document.createElement('select');
        LAB.effects.forEach((effect, index) => {
            const option = document.createElement('option');
            option.value = effect.id;
            option.textContent = 'E' + (index + 1) + ' · ' + effect.name;
            select.appendChild(option);
        });
        select.value = card.effectId;
        select.addEventListener('change', () => {
            card.effectId = select.value;
            const layer = card.layers[LAB.layerAIndex];
            if (layer && layer.type === 'text') { layer.effectClass = card.effectId; card.dirty = true; refreshCardLayer(card, layer.id); }
        });
        effectRow.append(effectLabel, select);

        const canvasWrap = document.createElement('div');
        canvasWrap.className = 'ecl-real-canvas-wrap';
        const canvas = document.createElement('div');
        canvas.className = 'ecl-real-canvas';
        canvas.dataset.cardId = card.id;
        applyBackground(canvas, card.background);
        const layersWrap = document.createElement('div');
        layersWrap.className = 'ecl-real-layers';
        card.layers.forEach(layer => layersWrap.appendChild(renderLayer(card, layer)));
        canvas.appendChild(layersWrap);
        canvas.addEventListener('click', event => {
            if (event.target === canvas || event.target === layersWrap) {
                card.selectedLayerId = null;
                updateCardSelection(card);
            }
        });
        canvasWrap.appendChild(canvas);

        const toolbar = renderCardToolbar(card);
        const footer = document.createElement('div');
        footer.className = 'ecl-real-card-footer';
        const pin = makeButton(card.pinned ? '取消固定' : '固定方案');
        pin.addEventListener('click', () => {
            card.pinned = !card.pinned;
            card.pinnedAt = card.pinned ? Date.now() : 0;
            renderCards();
        });
        const up = makeButton('↑');
        up.title = '向前调整顺序';
        up.addEventListener('click', () => moveCard(card.id, -1));
        const down = makeButton('↓');
        down.title = '向后调整顺序';
        down.addEventListener('click', () => moveCard(card.id, 1));
        footer.append(pin, up, down);
        shell.append(head, effectRow, canvasWrap, toolbar, footer);
        return shell;
    }

    function renderLayer(card, layer) {
        const el = document.createElement('div');
        el.className = 'ecl-real-layer' + (card.selectedLayerId === layer.id ? ' selected' : '');
        el.dataset.layerId = layer.id;
        el.style.left = (Number(layer.x) || 0) + 'px';
        el.style.top = (Number(layer.y) || 0) + 'px';
        el.style.width = (Number(layer.width) || 80) + 'px';
        el.style.height = (Number(layer.height) || 60) + 'px';
        el.style.opacity = layer.opacity === undefined ? 1 : layer.opacity;
        if (layer.type === 'text') {
            const text = document.createElement('div');
            text.className = 'ecl-real-text';
            if (layer.effectClass) text.classList.add(layer.effectClass);
            text.contentEditable = 'false';
            text.innerHTML = layer.content || '';
            text.style.fontSize = layer.fontSize || '28px';
            text.style.fontFamily = layer.fontFamily || 'sans-serif';
            text.style.color = layer.color || '#ffffff';
            text.style.backgroundColor = layer.bgColor || 'transparent';
            text.style.fontWeight = layer.bold ? 'bold' : 'normal';
            text.style.fontStyle = layer.italic ? 'italic' : 'normal';
            text.style.textDecoration = [layer.underline ? 'underline' : '', layer.strike ? 'line-through' : ''].filter(Boolean).join(' ');
            text.style.textAlign = layer.align || 'center';
            text.style.writingMode = layer.vertical ? 'vertical-rl' : 'horizontal-tb';
            text.style.letterSpacing = typeof layer.letterSpacing === 'number' ? layer.letterSpacing + 'px' : (layer.letterSpacing || '0px');
            text.style.lineHeight = layer.lineHeight || 1.2;
            text.addEventListener('dblclick', event => {
                event.stopPropagation();
                selectLayer(card, layer.id);
                text.contentEditable = 'true';
                el.classList.add('editing');
                text.focus();
                const range = document.createRange();
                range.selectNodeContents(text);
                range.collapse(false);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
            });
            text.addEventListener('input', () => {
                layer.content = text.innerHTML;
                card.dirty = true;
                if (layer.id === card.layers[LAB.layerAIndex]?.id) {
                    LAB.textA = stripText(layer.content);
                    const input = LAB.root.querySelector('#ecl-global-text-a');
                    if (input && document.activeElement !== input) input.value = LAB.textA;
                    syncGroupText('A', LAB.textA, card.id);
                } else if (layer.id === card.layers[LAB.layerBIndex]?.id) {
                    LAB.textB = stripText(layer.content);
                    const input = LAB.root.querySelector('#ecl-global-text-b');
                    if (input && document.activeElement !== input) input.value = LAB.textB;
                    syncGroupText('B', LAB.textB, card.id);
                }
            });
            text.addEventListener('blur', () => {
                layer.content = text.innerHTML;
                text.contentEditable = 'false';
                el.classList.remove('editing');
                refreshCardLayer(card, layer.id);
            });
            el.appendChild(text);
        } else if (layer.type === 'sticker') {
            el.classList.add('ecl-real-sticker');
            el.style.fontSize = layer.fontSize || '64px';
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
            el.textContent = layer.content || '';
        } else {
            el.textContent = layer.content || '';
        }
        ['nw', 'ne', 'sw', 'se'].forEach(dir => {
            const handle = document.createElement('span');
            handle.className = 'ecl-real-resize ' + dir;
            handle.dataset.direction = dir;
            el.appendChild(handle);
        });
        el.addEventListener('pointerdown', event => handlePointerDown(event, card, layer, el));
        el.addEventListener('click', event => { event.stopPropagation(); selectLayer(card, layer.id); });
        return el;
    }

    function renderCardToolbar(card) {
        const bar = document.createElement('div');
        bar.className = 'ecl-real-layer-toolbar';
        const layer = card.layers.find(item => item.id === card.selectedLayerId);
        if (!layer) { bar.textContent = '点击图层以调整样式'; return bar; }
        if (layer.type !== 'text') { bar.textContent = '已选中贴纸/其他图层：可拖动和缩放'; return bar; }
        const size = document.createElement('input');
        size.type = 'number'; size.min = '8'; size.max = '180'; size.value = parseFloat(layer.fontSize) || 28; size.title = '字号';
        size.addEventListener('change', () => { layer.fontSize = Math.max(8, Math.min(180, Number(size.value) || 28)) + 'px'; card.dirty = true; refreshCardLayer(card, layer.id); });
        const color = document.createElement('input');
        color.type = 'color'; color.value = normalizeColor(layer.color); color.title = '文字颜色';
        color.addEventListener('input', () => { layer.color = color.value; card.dirty = true; refreshCardLayer(card, layer.id); });
        const bold = makeButton(layer.bold ? 'B✓' : 'B');
        bold.title = '切换粗体';
        bold.addEventListener('click', () => { layer.bold = !layer.bold; card.dirty = true; refreshCardLayer(card, layer.id); });
        const align = document.createElement('select');
        [['left','左'],['center','中'],['right','右']].forEach(pair => { const option=document.createElement('option'); option.value=pair[0]; option.textContent=pair[1]; align.appendChild(option); });
        align.value = layer.align || 'center'; align.title = '对齐';
        align.addEventListener('change', () => { layer.align = align.value; card.dirty = true; refreshCardLayer(card, layer.id); });
        const opacity = document.createElement('input');
        opacity.type = 'range'; opacity.min = '0.1'; opacity.max = '1'; opacity.step = '0.05'; opacity.value = layer.opacity === undefined ? 1 : layer.opacity; opacity.title = '透明度';
        opacity.addEventListener('input', () => { layer.opacity = Number(opacity.value); card.dirty = true; refreshCardLayer(card, layer.id); });
        bar.append(size, color, bold, align, opacity);
        return bar;
    }

    function selectLayer(card, layerId) {
        card.selectedLayerId = layerId;
        const shell = LAB.root.querySelector('[data-card-id="' + card.id + '"]');
        if (!shell) return;
        shell.querySelectorAll('.ecl-real-layer').forEach(el => el.classList.toggle('selected', el.dataset.layerId === layerId));
        const oldToolbar = shell.querySelector('.ecl-real-layer-toolbar');
        if (oldToolbar) oldToolbar.replaceWith(renderCardToolbar(card));
    }

    function updateCardSelection(card) {
        const shell = LAB.root.querySelector('[data-card-id="' + card.id + '"]');
        if (!shell) return;
        shell.querySelectorAll('.ecl-real-layer').forEach(el => el.classList.toggle('selected', el.dataset.layerId === card.selectedLayerId));
        const toolbar = shell.querySelector('.ecl-real-layer-toolbar');
        if (toolbar) toolbar.replaceWith(renderCardToolbar(card));
    }

    function refreshCardLayer(card, layerId) {
        if (!layerId) return;
        const shell = LAB.root.querySelector('[data-card-id="' + card.id + '"]');
        if (!shell) return;
        const layer = card.layers.find(item => item.id === layerId);
        if (!layer) return;
        const old = shell.querySelector('[data-layer-id="' + layerId + '"]');
        if (old) old.replaceWith(renderLayer(card, layer));
        const toolbar = shell.querySelector('.ecl-real-layer-toolbar');
        if (toolbar) toolbar.replaceWith(renderCardToolbar(card));
        const select = shell.querySelector('.ecl-real-card-effect select');
        if (select && LAB.layerAIndex >= 0 && layerId === card.layers[LAB.layerAIndex]?.id) select.value = card.effectId;
    }

    function syncGroupText(group, value, sourceCardId) {
        LAB.cards.forEach(card => {
            if (card.id === sourceCardId) return;
            const index = group === 'A' ? LAB.layerAIndex : LAB.layerBIndex;
            const layer = card.layers[index];
            if (!layer || layer.type !== 'text') return;
            layer.content = escapeHTML(value);
            card.dirty = true;
            const shell = LAB.root.querySelector('[data-card-id="' + card.id + '"]');
            const text = shell && shell.querySelector('[data-layer-id="' + layer.id + '"] .ecl-real-text');
            if (text && document.activeElement !== text) text.innerHTML = layer.content;
        });
    }

    function handlePointerDown(event, card, layer, element) {
        if (event.button !== 0 || event.target.isContentEditable || event.target.closest('.editing')) return;
        const resize = event.target.closest('.ecl-real-resize');
        selectLayer(card, layer.id);
        const canvas = element.closest('.ecl-real-canvas');
        const scale = canvas ? (canvas.getBoundingClientRect().width / 360 || 0.5) : 0.5;
        const startX = event.clientX, startY = event.clientY;
        const initial = { x:Number(layer.x)||0, y:Number(layer.y)||0, width:Number(layer.width)||80, height:Number(layer.height)||60 };
        const direction = resize ? resize.dataset.direction : '';
        let moved = false;
        const move = moveEvent => {
            const rawDx = moveEvent.clientX - startX;
            const rawDy = moveEvent.clientY - startY;
            if (!moved && Math.abs(rawDx) < 2 && Math.abs(rawDy) < 2) return;
            moved = true;
            const dx = rawDx / scale;
            const dy = rawDy / scale;
            if (resize) {
                let width=initial.width, height=initial.height, x=initial.x, y=initial.y;
                if (direction.includes('e')) width=Math.max(30, initial.width+dx);
                if (direction.includes('s')) height=Math.max(24, initial.height+dy);
                if (direction.includes('w')) { width=Math.max(30, initial.width-dx); x=initial.x+initial.width-width; }
                if (direction.includes('n')) { height=Math.max(24, initial.height-dy); y=initial.y+initial.height-height; }
                layer.x=x; layer.y=y; layer.width=width; layer.height=height;
            } else { layer.x=initial.x+dx; layer.y=initial.y+dy; }
            card.dirty = true;
            element.style.left=layer.x+'px'; element.style.top=layer.y+'px'; element.style.width=layer.width+'px'; element.style.height=layer.height+'px';
        };
        const up = () => {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
            if (moved) refreshCardLayer(card, layer.id);
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up, { once:true });
        event.preventDefault();
    }

    function moveCard(cardId, direction) {
        const sorted = getSortedCards();
        const index = sorted.findIndex(card => card.id === cardId);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= sorted.length) return;
        const item = sorted[index];
        sorted.splice(index, 1);
        sorted.splice(nextIndex, 0, item);
        sorted.forEach((card, order) => {
            card.manualOrder = order;
            if (card.pinned) card.pinnedAt = order;
        });
        renderCards();
    }

    function applyBackground(canvas, bg) {
        if (!bg) return;
        if (bg.type === 'solid') canvas.style.background = bg.color1 || '#000000';
        else if (bg.type === 'image' && bg.imageUrl) {
            canvas.style.backgroundImage = 'url("' + bg.imageUrl + '")';
            canvas.style.backgroundSize = 'cover';
            canvas.style.backgroundPosition = 'center';
        } else canvas.style.background = 'linear-gradient(135deg,' + (bg.color1 || '#ff2442') + ' 0%,' + (bg.color2 || '#2575fc') + ' 100%)';
    }

    function normalizeColor(value) {
        if (/^#[0-9a-f]{6}$/i.test(value || '')) return value;
        return '#ffffff';
    }
    function stripText(value) {
        const div = document.createElement('div');
        div.innerHTML = value || '';
        return div.textContent || div.innerText || '';
    }
    function escapeHTML(value) {
        return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }
    function makeButton(text, kind) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ecl-real-btn' + (kind ? ' ' + kind : '');
        button.textContent = text;
        return button;
    }
    document.addEventListener('DOMContentLoaded', initEffectComparisonLab);
})();
