// Main Application Entry
document.addEventListener('DOMContentLoaded', () => {
    initEffectsLibrary();
    initTextLayersModule();
    initStickersModule();
    initDragModule();
    initBackgroundControls();
    initPaginationModule();
    initCustomFontUpload();
    initBackgroundFavorites(); // 初始化极速流畅的背景收藏与删除
    
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

    document.getElementById('btn-export').addEventListener('click', () => {
        exportAllPagesAsPNG();
    });

    renderCanvas();
    renderLayerList();
    updateTopToolbarUI(state.getSelectedLayer());
});

// 本地手写字体上传及持久化
function initCustomFontUpload() {
    const btnUpload = document.getElementById('btn-upload-font');
    const fileInput = document.getElementById('local-font-file');
    const fontSelect = document.getElementById('tb-font');

    if (!btnUpload || !fileInput || !fontSelect) return;

    loadCachedCustomFonts(fontSelect);

    btnUpload.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(evt) {
            const fontDataUrl = evt.target.result;
            const fontName = 'CustomFont_' + Date.now();
            const displayName = file.name.replace(/\.[^/.]+$/, "");

            registerAndApplyFont(fontName, displayName, fontDataUrl, true);

            try {
                let savedFonts = JSON.parse(localStorage.getItem('douyin_cover_custom_fonts') || '[]');
                savedFonts.push({ fontName, displayName, fontDataUrl });
                localStorage.setItem('douyin_cover_custom_fonts', JSON.stringify(savedFonts));
                alert(`本地手写字体 "${file.name}" 上传成功并已永久保存！刷新网页也不会消失。`);
            } catch (err) {
                console.error('字体缓存失败:', err);
            }
        };
        reader.readAsDataURL(file);
    });
}

function registerAndApplyFont(fontName, displayName, fontDataUrl, autoSelect = false) {
    const fontSelect = document.getElementById('tb-font');
    if (!fontSelect) return;

    fetch(fontDataUrl)
        .then(res => res.arrayBuffer())
        .then(buffer => {
            const fontFace = new FontFace(fontName, buffer);
            return fontFace.load();
        })
        .then((loadedFace) => {
            document.fonts.add(loadedFace);

            let exists = Array.from(fontSelect.options).some(opt => opt.value === fontName);
            if (!exists) {
                const option = document.createElement('option');
                option.value = fontName;
                option.innerText = '✍️ ' + displayName;
                fontSelect.appendChild(option);
            }

            if (autoSelect) {
                fontSelect.value = fontName;
                const layer = state.getSelectedLayer();
                if (layer && layer.type === 'text') {
                    layer.fontFamily = fontName;
                    renderCanvas();
                }
            }
        })
        .catch(err => {
            console.error('注册字体失败:', err);
        });
}

function loadCachedCustomFonts(fontSelect) {
    try {
        let savedFonts = JSON.parse(localStorage.getItem('douyin_cover_custom_fonts') || '[]');
        savedFonts.forEach(font => {
            registerAndApplyFont(font.fontName, font.displayName, font.fontDataUrl, false);
        });
    } catch (err) {
        console.error('读取字体缓存出错:', err);
    }
}

// 完美重构的背景收藏与删除功能
function initBackgroundFavorites() {
    const btnFav = document.getElementById('btn-fav-bg');
    if (!btnFav) return;

    btnFav.addEventListener('click', () => {
        const currentBg = JSON.parse(JSON.stringify(state.background));
        let favs = JSON.parse(localStorage.getItem('douyin_cover_fav_bgs') || '[]');
        
        favs.push(currentBg);
        localStorage.setItem('douyin_cover_fav_bgs', JSON.stringify(favs));
        renderFavBackgrounds();
        alert('当前背景已成功加入收藏夹！');
    });

    renderFavBackgrounds();
}

function renderFavBackgrounds() {
    const listEl = document.getElementById('fav-bg-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    let favs = JSON.parse(localStorage.getItem('douyin_cover_fav_bgs') || '[]');
    
    if (favs.length === 0) {
        favs = [
            { type: 'gradient', color1: '#ff2442', color2: '#2575fc' },
            { type: 'gradient', color1: '#f7ff00', color2: '#db36a4' },
            { type: 'solid', color1: '#000000' },
            { type: 'solid', color1: '#ffffff' }
        ];
    }

    favs.forEach((bg, index) => {
        const item = document.createElement('div');
        item.style.cssText = 'height: 32px; border-radius: 4px; border: 1px solid #30363d; cursor: pointer; position: relative; overflow: hidden;';
        
        if (bg.type === 'gradient') {
            item.style.background = `linear-gradient(135deg, ${bg.color1} 0%, ${bg.color2} 100%)`;
        } else if (bg.type === 'solid') {
            item.style.background = bg.color1;
        } else if (bg.type === 'image' && bg.imageUrl) {
            item.style.background = `url(${bg.imageUrl}) center/cover no-repeat`;
        }

        item.title = `点击应用收藏背景 (右上角 × 可删除)`;

        // 独立精准的删除按钮
        const delBtn = document.createElement('div');
        delBtn.innerHTML = '&times;';
        delBtn.style.cssText = 'position: absolute; top: 1px; right: 2px; background: rgba(0,0,0,0.7); color: #fff; font-size: 13px; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; border-radius: 50%; opacity: 0; transition: opacity 0.2s; z-index: 10;';
        
        item.addEventListener('mouseenter', () => delBtn.style.opacity = '1');
        item.addEventListener('mouseleave', () => delBtn.style.opacity = '0');

        delBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 绝对阻止冒泡，防止误触应用背景
            let currentFavs = JSON.parse(localStorage.getItem('douyin_cover_fav_bgs') || '[]');
            if (currentFavs.length > 0 && currentFavs[index]) {
                currentFavs.splice(index, 1);
                localStorage.setItem('douyin_cover_fav_bgs', JSON.stringify(currentFavs));
                renderFavBackgrounds();
            }
        });

        item.appendChild(delBtn);

        // 点击应用背景
        item.addEventListener('click', () => {
            state.background.type = bg.type;
            state.background.color1 = bg.color1 || '#ff2442';
            state.background.color2 = bg.color2 || '#2575fc';
            state.background.imageUrl = bg.imageUrl || '';
            updateBackgroundView();
        });

        listEl.appendChild(item);
    });
}

function exportElementToPNG(canvasDOMNode, filename) {
    return new Promise((resolve) => {
        const selectedLayers = canvasDOMNode.querySelectorAll('.canvas-layer.selected');
        selectedLayers.forEach(el => el.classList.remove('selected'));

        html2canvas(canvasDOMNode, {
            scale: 2,
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
            await new Promise(r => setTimeout(r, 500));
        }
    }
    alert(`所有 ${wrappers.length} 个分页面已按顺序全部独立导出完毕！`);
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

const PRESET_SOLID_COLORS = [
    '#000000', '#ffffff', '#ff2442', '#2575fc', 
    '#00ffcc', '#ffeb3b', '#7b1fa2', '#11998e', '#ff4500', '#0f1117'
];

function initBackgroundControls() {
    const bgType = document.getElementById('bg-type');
    const colorControls = document.getElementById('bg-color-controls');
    const imageControls = document.getElementById('bg-image-controls');
    const c1 = document.getElementById('bg-color-1');
    const c2 = document.getElementById('bg-color-2');
    const imgFile = document.getElementById('bg-image-file');

    renderPresetColorSwatches();

    if (bgType) {
        bgType.addEventListener('change', (e) => {
            state.background.type = e.target.value;
            updateBackgroundView();
        });
    }

    if (c1) c1.addEventListener('input', (e) => { 
        state.background.color1 = e.target.value; 
        updateBackgroundView(); 
    });

    if (c2) c2.addEventListener('input', (e) => { 
        state.background.color2 = e.target.value; 
        updateBackgroundView(); 
    });
    
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

function renderPresetColorSwatches() {
    const container = document.getElementById('bg-color-controls');
    if (!container || document.getElementById('preset-swatches')) return;

    const swatchWrapper = document.createElement('div');
    swatchWrapper.id = 'preset-swatches';
    swatchWrapper.style.cssText = 'display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-top: 8px; margin-bottom: 8px;';

    PRESET_SOLID_COLORS.forEach(color => {
        const swatch = document.createElement('div');
        swatch.style.cssText = `height: 24px; background: ${color}; border: 1px solid #30363d; border-radius: 4px; cursor: pointer; transition: transform 0.1s;`;
        swatch.title = color;
        swatch.addEventListener('click', () => {
            state.background.type = 'solid';
            state.background.color1 = color;
            updateBackgroundView();
        });
        swatchWrapper.appendChild(swatch);
    });

    container.appendChild(swatchWrapper);
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

    document.querySelectorAll('.canvas-bg').forEach(canvasBg => {
        if (bg.type === 'gradient') {
            canvasBg.style.background = `linear-gradient(135deg, ${bg.color1} 0%, ${bg.color2} 100%)`;
        } else if (bg.type === 'solid') {
            canvasBg.style.background = bg.color1;
        } else if (bg.type === 'image' && bg.imageUrl) {
            canvasBg.style.background = `url(${bg.imageUrl}) center/cover no-repeat`;
        }
    });
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
        const bg = state.background;
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