// Main Application Entry
document.addEventListener('DOMContentLoaded', () => {
    initEffectsLibrary();
    initTextLayersModule();
    initStickersModule();
    initDragModule();
    initBackgroundControls();
    
    document.getElementById('btn-add-text').addEventListener('click', () => {
        const newLayer = {
            id: 'text-' + Date.now(),
            type: 'text',
            content: '双击插入光标编辑文本',
            fontSize: '28px',
            fontFamily: 'sans-serif',
            color: '#ffffff',
            bgColor: 'transparent',
            bold: false,
            italic: false,
            underline: false,
            strike: false,
            align: 'center',
            vertical: false,
            letterSpacing: 0,
            lineHeight: 1.2,
            opacity: 1,
            effectClass: 'effect-black-stroke',
            x: 35,
            y: 250,
            width: 290,
            height: 100
        };
        state.addLayer(newLayer);
        renderCanvas();
        renderLayerList();
        updateTopToolbarUI(newLayer);
    });

    document.getElementById('btn-export').addEventListener('click', () => {
        alert('抖音 9:16 高清封面渲染就绪！可无缝导出为 PNG 高清图像。');
    });

    renderCanvas();
    renderLayerList();
    updateTopToolbarUI(state.getSelectedLayer());
});

function initBackgroundControls() {
    const bgType = document.getElementById('bg-type');
    const colorControls = document.getElementById('bg-color-controls');
    const imageControls = document.getElementById('bg-image-controls');
    const c1 = document.getElementById('bg-color-1');
    const c2 = document.getElementById('bg-color-2');
    const imgFile = document.getElementById('bg-image-file');

    bgType.addEventListener('change', (e) => {
        state.background.type = e.target.value;
        if (e.target.value === 'solid' || e.target.value === 'gradient') {
            colorControls.style.display = 'block';
            imageControls.style.display = 'none';
        } else {
            colorControls.style.display = 'none';
            imageControls.style.display = 'block';
        }
        updateBackgroundView();
    });

    c1.addEventListener('input', (e) => { state.background.color1 = e.target.value; updateBackgroundView(); });
    c2.addEventListener('input', (e) => { state.background.color2 = e.target.value; updateBackgroundView(); });
    
    imgFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                state.background.imageUrl = evt.target.result;
                updateBackgroundView();
            };
            reader.readAsDataURL(file);
        }
    });
}

function updateBackgroundView() {
    const canvasBg = document.getElementById('canvas-bg');
    const bg = state.background;
    if (bg.type === 'gradient') {
        canvasBg.style.background = `linear-gradient(135deg, ${bg.color1} 0%, ${bg.color2} 100%)`;
    } else if (bg.type === 'solid') {
        canvasBg.style.background = bg.color1;
    } else if (bg.type === 'image' && bg.imageUrl) {
        canvasBg.style.background = `url(${bg.imageUrl}) center/cover no-repeat`;
    }
}

function renderCanvas() {
    const wrapper = document.getElementById('layers-wrapper');
    wrapper.innerHTML = '';

    state.layers.forEach(layer => {
        const isSelected = layer.id === state.selectedLayerId;
        const isEditing = layer.id === state.editingLayerId;

        const el = document.createElement('div');
        el.className = `canvas-layer ${isSelected ? 'selected' : ''} ${isEditing ? 'editing' : ''}`;
        el.dataset.id = layer.id;
        el.style.left = layer.x + 'px';
        el.style.top = layer.y + 'px';
        el.style.width = layer.width + 'px';
        el.style.height = layer.height + 'px';
        el.style.opacity = layer.opacity !== undefined ? layer.opacity : 1;

        if (layer.type === 'text') {
            const textInner = document.createElement('div');
            textInner.className = 'text-content-editable';
            textInner.contentEditable = isEditing ? 'true' : 'false';
            textInner.innerHTML = layer.content;

            textInner.style.fontSize = layer.fontSize;
            textInner.style.fontFamily = layer.fontFamily;
            textInner.style.color = layer.color;
            textInner.style.backgroundColor = layer.bgColor;
            textInner.style.fontWeight = layer.bold ? 'bold' : 'normal';
            textInner.style.fontStyle = layer.italic ? 'italic' : 'normal';
            
            let textDecorations = [];
            if (layer.underline) textDecorations.push('underline');
            if (layer.strike) textDecorations.push('line-through');
            textInner.style.textDecoration = textDecorations.join(' ');

            textInner.style.textAlign = layer.align;
            textInner.style.writingMode = layer.vertical ? 'vertical-rl' : 'horizontal-tb';
            textInner.style.letterSpacing = layer.letterSpacing || '0px';
            textInner.style.lineHeight = layer.lineHeight || 1.2;

            if (layer.effectClass) {
                textInner.classList.add(layer.effectClass);
            }

            // Canva-standard Double Click to enter contentEditable inline text mode
            el.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                state.editingLayerId = layer.id;
                renderCanvas();

                // Focus and place cursor at end
                setTimeout(() => {
                    const currentEditable = document.querySelector(`.canvas-layer[data-id="${layer.id}"] .text-content-editable`);
                    if (currentEditable) {
                        currentEditable.focus();
                        const range = document.createRange();
                        const sel = window.getSelection();
                        range.selectNodeContents(currentEditable);
                        range.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                }, 10);
            });

            textInner.addEventListener('blur', () => {
                layer.content = textInner.innerHTML;
            });

            el.appendChild(textInner);
        } else if (layer.type === 'sticker') {
            el.style.fontSize = layer.fontSize;
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
            el.innerText = layer.content;
        }

        // Canva-style 4-corner resize handles
        ['nw', 'ne', 'sw', 'se'].forEach(dir => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${dir}`;
            handle.dataset.direction = dir;
            el.appendChild(handle);
        });

        wrapper.appendChild(el);
    });
}

function renderLayerList() {
    const listEl = document.getElementById('layer-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    state.layers.forEach(layer => {
        const item = document.createElement('div');
        item.className = `layer-item ${layer.id === state.selectedLayerId ? 'active' : ''}`;
        
        // Strip HTML tags for clean preview title
        const cleanContent = layer.content.replace(/<[^>]*>/g, '').substring(0, 10);
        item.innerHTML = `
            <span><i class="fa-solid ${layer.type === 'text' ? 'fa-font' : 'fa-face-smile'}"></i> ${cleanContent || '图层'}</span>
            <button class="btn" style="padding: 2px 6px; font-size:11px;" onclick="selectLayerFromList('${layer.id}')">选择</button>
        `;
        item.addEventListener('click', () => {
            state.selectedLayerId = layer.id;
            renderCanvas();
            renderLayerList();
            updateTopToolbarUI(state.getSelectedLayer());
        });
        listEl.appendChild(item);
    });
}

function selectLayerFromList(id) {
    state.selectedLayerId = id;
    renderCanvas();
    renderLayerList();
    updateTopToolbarUI(state.getSelectedLayer());
}
