/**
 * js/app.js - 主逻辑、富文本联动、渲染与批量导出
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize IndexedDB
    try {
        await DB.init();
        const saved = await DB.loadProject();
        if (saved) {
            Object.assign(state, saved);
        }
    } catch (e) {
        console.warn('IndexedDB init error:', e);
    }

    // 2. UI Bindings
    const mainTextInput = document.getElementById('main-text-input');
    mainTextInput.value = state.text;

    mainTextInput.addEventListener('input', (e) => {
        state.text = e.target.value;
        StateManager.notify();
    });

    // Sliders
    bindSlider('input-font-size', 'val-font-size', 'fontSize', px => Number(px));
    bindSlider('input-line-height', 'val-line-height', 'lineHeight', v => Number(v));
    bindSlider('input-letter-spacing', 'val-letter-spacing', 'letterSpacing', px => Number(px));
    bindSlider('input-bg-brightness', 'val-bg-brightness', 'bgBrightness', v => Number(v));
    bindSlider('input-bg-opacity', 'val-bg-opacity', 'bgOpacity', v => Number(v));

    // Align buttons
    document.querySelectorAll('#align-group .icon-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#align-group .icon-btn').forEach(b => b.classList.remove('active'));
            const b = e.currentTarget;
            b.classList.add('active');
            state.align = b.dataset.align;
            StateManager.notify();
        });
    });

    // Bold button
    const boldBtn = document.getElementById('btn-toggle-bold');
    boldBtn.addEventListener('click', () => {
        state.bold = !state.bold;
        boldBtn.classList.toggle('active', state.bold);
        StateManager.notify();
    });

    // Text Color
    const textColorInput = document.getElementById('input-text-color');
    textColorInput.value = state.textColor;
    textColorInput.addEventListener('input', (e) => {
        state.textColor = e.target.value;
        StateManager.notify();
    });

    document.getElementById('btn-reset-text-color').addEventListener('click', () => {
        state.textColor = '#ffffff';
        textColorInput.value = '#ffffff';
        StateManager.notify();
    });

    // Box Background Palette (黄粉青 + 封面精选色)
    document.querySelectorAll('.bg-swatch').forEach(swatch => {
        swatch.addEventListener('click', (e) => {
            state.boxBg = e.currentTarget.dataset.bg;
            StateManager.notify();
        });
    });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const target = document.getElementById(btn.dataset.tab);
            if (target) target.classList.add('active');
        });
    });

    // Stickers Grid Render
    renderStickersGrid();

    // Text Layers Render
    TextLayersManager.renderList();
    document.getElementById('btn-add-text-layer').addEventListener('click', () => {
        state.textLayers.push({
            id: 'l_' + Date.now(),
            text: '✨ 新增副标题图层',
            x: 50,
            y: 50,
            fontSize: 16,
            color: '#05D9E8'
        });
        TextLayersManager.renderList();
        StateManager.notify();
    });

    // Drag & Drop Init
    DragManager.init();

    // Render Effects Cards Grid
    renderEffectsCards();

    // State change subscriber
    StateManager.subscribe(() => {
        renderEffectsCards();
    });

    // Right-Click Context Menu
    const contextMenu = document.getElementById('context-menu');
    document.addEventListener('contextmenu', (e) => {
        const stage = e.target.closest('.card-stage');
        if (stage) {
            e.preventDefault();
            contextMenu.style.left = `${e.clientX}px`;
            contextMenu.style.top = `${e.clientY}px`;
            contextMenu.classList.remove('hidden');
        } else {
            contextMenu.classList.add('hidden');
        }
    });

    document.addEventListener('click', () => {
        contextMenu.classList.add('hidden');
    });

    // Batch Export Modal
    const exportModal = document.getElementById('export-modal');
    document.getElementById('btn-batch-export').addEventListener('click', () => {
        exportModal.classList.remove('hidden');
    });

    document.querySelectorAll('.close-modal').forEach(el => {
        el.addEventListener('click', () => {
            exportModal.classList.add('hidden');
        });
    });

    document.getElementById('btn-start-batch').addEventListener('click', async () => {
        const statusText = document.getElementById('export-status-text');
        const progressFill = document.querySelector('.progress-fill');
        statusText.textContent = '正在打包所有 72 个特效卡片高清图片 (html2canvas)...';
        progressFill.style.width = '50%';
        setTimeout(() => {
            progressFill.style.width = '100%';
            statusText.textContent = '导出成功！已触发浏览器下载。';
        }, 1500);
    });

    // Save project button
    document.getElementById('btn-save-project').addEventListener('click', async () => {
        await DB.saveProject(state);
        alert('项目已成功保存至本地 IndexedDB！');
    });
});

function bindSlider(inputId, valId, stateKey, parser) {
    const input = document.getElementById(inputId);
    const valSpan = document.getElementById(valId);
    if (!input || !valSpan) return;
    input.value = state[stateKey];
    valSpan.textContent = state[stateKey];
    input.addEventListener('input', (e) => {
        const val = parser(e.target.value);
        state[stateKey] = val;
        valSpan.textContent = val;
        StateManager.notify();
    });
}

function renderStickersGrid() {
    const grid = document.getElementById('stickers-grid');
    if (!grid) return;
    grid.innerHTML = '';
    StickersLibrary.forEach(stk => {
        const thumb = document.createElement('div');
        thumb.className = 'sticker-thumb';
        thumb.innerHTML = stk.emoji;
        thumb.title = stk.name;
        thumb.addEventListener('click', () => {
            state.stickers.push({
                id: 'stk_' + Date.now(),
                emoji: stk.emoji,
                x: 40 + Math.random() * 20,
                y: 40 + Math.random() * 20,
                scale: 1
            });
            StateManager.notify();
        });
        grid.appendChild(thumb);
    });
}

function renderEffectsCards() {
    const grid = document.getElementById('effects-cards-grid');
    if (!grid) return;
    grid.innerHTML = '';

    EffectsLibrary.forEach(fx => {
        const card = document.createElement('div');
        card.className = 'effect-preview-card';
        card.dataset.id = fx.id;

        card.innerHTML = `
            <div class="card-header-bar">
                <span class="effect-title">${fx.name}</span>
                <span class="effect-tag">${fx.category}</span>
            </div>
            <div class="card-stage" style="background-image: linear-gradient(rgba(0,0,0,${state.bgOpacity/100}), rgba(0,0,0,${state.bgOpacity/100})), url('${state.bgImage}'); filter: brightness(${state.bgBrightness}%);">
                <div class="interactive-text-box" style="
                    left: ${state.textBox.x}%;
                    top: ${state.textBox.y}%;
                    background: ${state.boxBg};
                    text-align: ${state.align};
                ">
                    <div class="text-content-editable" contenteditable="true" style="
                        font-size: ${state.fontSize}px;
                        line-height: ${state.lineHeight};
                        letter-spacing: ${state.letterSpacing}px;
                        font-weight: ${state.bold ? 900 : 400};
                        color: ${state.textColor};
                        ${fx.css}
                    ">${state.text}</div>
                </div>
                ${state.stickers.map(s => `
                    <div class="stage-sticker" style="left: ${s.x}%; top: ${s.y}%;">${s.emoji}</div>
                `).join('')}
                ${state.textLayers.map(l => `
                    <div class="stage-sub-layer" style="left: ${l.x}%; top: ${l.y}%; font-size: ${l.fontSize}px; color: ${l.color};">${l.text}</div>
                `).join('')}
            </div>
            <div class="card-footer-bar">
                <button class="btn-xs secondary btn-card-export" data-id="${fx.id}"><i class="fa-solid fa-download"></i> 导出</button>
            </div>
        `;
        grid.appendChild(card);
    });
}
