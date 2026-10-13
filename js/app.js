// Main Application Entry
document.addEventListener('DOMContentLoaded', () => {
    initEffectsLibrary();
    initTextLayersModule();
    initStickersModule();
    initDragModule();
    initBackgroundControls();
    initPaginationModule();
    
    renderAll();
    
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
        renderAll();
    });

    // 修复：每次点击导出时直接无条件顺序渲染导出，支持随时修改后反复导出
    document.getElementById('btn-export').addEventListener('click', () => {
        exportAllPagesAsPNG();
    });

    renderCanvas();
    renderLayerList();
    updateTopToolbarUI(state.getSelectedLayer());
});

// 使用 html2canvas 将指定画布 DOM 节点转换为 PNG 并触发下载
function exportElementToPNG(canvasDOMNode, filename) {
    return new Promise((resolve) => {
        const selectedLayers = canvasDOMNode.querySelectorAll('.canvas-layer.selected');
        selectedLayers.forEach(el => el.classList.remove('selected'));

        html2canvas(canvasDOMNode, {
            scale: 2, // 2倍高清
            useCORS: true,
            allowTaint: true,
            backgroundColor: null
        }).then(canvas => {
            selectedLayers.forEach(el => el.classList.add('selected'));

            const pngURL = canvas.toDataURL('image/png');
            const downloadLink = document.createElement('a');
            downloadLink.href = pngURL;
            downloadLink.download = filename;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            resolve();
        }).catch(err => {
            console.error('导出失败:', err);
            resolve();
        });
    });
}

// 顺序导出所有分页为独立 PNG 图像（绝不使用 ZIP）
async function exportAllPagesAsPNG() {
    const wrappers = document.querySelectorAll('.canvas-page-wrapper');
    if (wrappers.length === 0) {
        alert('当前没有可导出的画布页面！');
        return;
    }

    if (wrappers.length === 1) {
        const canvasNode = wrappers[0].querySelector('.cover-canvas');
        if (canvasNode) {
            await exportElementToPNG(canvasNode, `抖音封面_第1页_${Date.now()}.png`);
            alert('第 1 页高清 PNG 导出成功！');
        }
        return;
    }

    for (let i = 0; i < wrappers.length; i++) {
        const canvasNode = wrappers[i].querySelector('.cover-canvas');
        if (canvasNode) {
            await exportElementToPNG(canvasNode, `抖音长文封面_第${i + 1}页_${Date.now()}.png`);
            // 每次下载间隔 500ms，确保浏览器稳定连续触发下载
            await new Promise(r => setTimeout(r, 500));
        }
    }
    alert(`所有 ${wrappers.length} 个分页已按顺序全部独立导出完毕！`);
}

function renderAll() {
    renderCanvas();
    renderLayerList();
    renderPageList();
    updateBackgroundView();
    updateTopToolbarUI(state.getSelectedLayer());
}

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
        
        item.innerHTML = `
            <span><i class="fa-solid fa-file-lines"></i> ${page.title} (第 ${index + 1} 页)</span>
            <span style="font-size: 10px; color: #8b949e;">${page.layers.length} 个图层</span>
        `;
        
        item.addEventListener('click', () => {
            state.switchPage(page.id);
            renderAll();
            
            const targetWrapper = document.querySelector(`.canvas-page-wrapper[data-page-id="${page.id}"]`);
            if (targetWrapper) {
                targetWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
        
        listEl.appendChild(item);
    });
}

function initBackgroundControls() {
    const bgType = document.getElementById('bg-type');
    const colorControls = document.getElementById('bg-color-controls');
    const imageControls = document.getElementById('bg-image-controls');
    const c1 = document.getElementById('bg-color-1');
    const c2 = document.getElementById('bg-color-2');
    const imgFile = document.getElementById('bg-image-file');

    if (bgType) {
        bgType.addEventListener('change', (e) => {
            state.background.type = e.target.value;
            if (e.target.value === 'solid' || e.target.value === 'gradient') {
                if (colorControls) colorControls.style.display = 'block';
                if (imageControls) imageControls.style.display = 'none';
            } else {
                if (colorControls) colorControls.style.display = 'none';
                if (imageControls) imageControls.style.display = 'block';
            }
            updateBackgroundView();
        });
    }

    if (c1) c1.addEventListener('input', (e) => { state.background.color1 = e.target.value; updateBackgroundView(); });
    if (c2) c2.addEventListener('input', (e) => { state.background.color2 = e.target.value; updateBackgroundView(); });
    
    if (imgFile) {
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
}

function updateBackgroundView() {
    const bg = state.background;
    const bgType = document.getElementById('bg-type');
    if (bgType) bgType.value = bg.type;
    const colorControls = document.getElementById('bg-color-controls');
    const imageControls = document.getElementById('bg-image-controls');
    
    if (colorControls && imageControls) {
        if (bg.type === 'solid' || bg.type === 'gradient') {
            colorControls.style.display = 'block';
            imageControls.style.display = 'none';
        } else {
            colorControls.style.display = 'none';
            imageControls.style.display = 'block';
        }
    }

    const activeCanvasBg = document.querySelector(`.canvas-page-wrapper[data-page-id="${state.currentPageId}"] .canvas-bg`);
    if (activeCanvasBg) {
        if (bg.type === 'gradient') {
            activeCanvasBg.style.background = `linear-gradient(135deg, ${bg.color1} 0%, ${bg.color2} 100%)`;
        } else if (bg.type === 'solid') {
            activeCanvasBg.style.background = bg.color1;
        } else if (bg.type === 'image' && bg.imageUrl) {
            activeCanvasBg.style.background = `url(${bg.imageUrl}) center/cover no-repeat`;
        }
    }
}

function enterTextEditMode(layerId) {
    state.editingLayerId = layerId;
    renderCanvas();
    renderLayerList();
    updateTopToolbarUI(state.getSelectedLayer());

    setTimeout(() => {
        const currentEditable = document.querySelector(`.canvas-layer[data-id="${layerId}"] .text-content-editable`);
        if (currentEditable) {
            currentEditable.contentEditable = 'true';
            currentEditable.focus();
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(currentEditable);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }, 30);
}

function renderCanvas() {
    const container = document.querySelector('.canvas-container');
    if (!container) return;
    container.innerHTML = '';

    state.pages.forEach((page, index) => {
        const isCurrentPage = page.id === state.currentPageId;

        const pageWrapper = document.createElement('div');
        pageWrapper.className = `canvas-page-wrapper ${isCurrentPage ? 'active-page' : ''}`;
        pageWrapper.dataset.pageId = page.id;

        const badge = document.createElement('div');
        badge.className = 'page-badge';
        badge.innerHTML = `<i class="fa-solid fa-file-lines"></i> 第 ${index + 1} 页`;
        pageWrapper.appendChild(badge);

        const canvasEl = document.createElement('div');
        canvasEl.className = 'cover-canvas';

        const canvasBg = document.createElement('div');
        canvasBg.className = 'canvas-bg';
        const bg = page.background;
        if (bg.type === 'gradient') {
            canvasBg.style.background = `linear-gradient(135deg, ${bg.color1} 0%, ${bg.color2} 100%)`;
        } else if (bg.type === 'solid') {
            canvasBg.style.background = bg.color1;
        } else if (bg.type === 'image' && bg.imageUrl) {
            canvasBg.style.background = `url(${bg.imageUrl}) center/cover no-repeat`;
        }
        canvasEl.appendChild(canvasBg);

        const layersWrapper = document.createElement('div');
        layersWrapper.className = 'layers-wrapper';

        page.layers.forEach(layer => {
            const isSelected = isCurrentPage && (layer.id === state.selectedLayerId);
            const isEditing = isCurrentPage && (layer.id === state.editingLayerId);

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

                canvasEl.addEventListener('click', () => {
                    if (state.currentPageId !== page.id) {
                        state.switchPage(page.id);
                        renderAll();
                    }
                });

                el.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
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

                el.appendChild(textInner);
            } else if (layer.type === 'sticker') {
                el.style.fontSize = layer.fontSize;
                el.style.display = 'flex';
                el.style.alignItems = 'center';
                el.style.justifyContent = 'center';
                el.innerText = layer.content;
            }

            ['nw', 'ne', 'sw', 'se'].forEach(dir => {
                const handle = document.createElement('div');
                handle.className = `resize-handle ${dir}`;
                handle.dataset.direction = dir;
                el.appendChild(handle);
            });

            ['left', 'right'].forEach(dir => {
                const handle = document.createElement('div');
                handle.className = `edge-handle ${dir}`;
                handle.dataset.direction = dir;
                el.appendChild(handle);
            });

            layersWrapper.appendChild(el);
        });

        canvasEl.appendChild(layersWrapper);
        pageWrapper.appendChild(canvasEl);
        container.appendChild(pageWrapper);
    });
}

function renderLayerList() {
    const listEl = document.getElementById('layer-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    state.layers.forEach(layer => {
        const item = document.createElement('div');
        item.className = `layer-item ${layer.id === state.selectedLayerId ? 'active' : ''}`;
        
        const cleanContent = (layer.content || '').replace(/<[^>]*>/g, '').substring(0, 10);
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