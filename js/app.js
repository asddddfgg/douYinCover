// Main Application Entry
document.addEventListener('DOMContentLoaded', () => {
    initEffectsLibrary();
    initTextLayersModule();
    initStickersModule();
    initDragModule();
        initBackgroundPanelV2();
    initPaginationModule();
    initCustomFontUpload();
    
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
            bold: false, italic: false, underline: false, strike: false,
            align: 'center', vertical: false,
            letterSpacing: 0, lineHeight: 1.2, opacity: 1,
            effectClass: 'effect-black-stroke',
            rotation: 0, flipH: false, flipV: false,
            x: 35, y: 250, width: 290, height: 48,
            heightMode: 'auto'
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

    // ===== 顶级升级模块初始化 =====
    try { MultiSelect.init(); } catch (err) { console.warn('MultiSelect init failed:', err); }
    try { Guides.init(); } catch (err) { console.warn('Guides init failed:', err); }
    try { ProjectManager.init(); } catch (err) { console.warn('ProjectManager init failed:', err); }
});

function initCustomFontUpload() {
    const btnUpload = document.getElementById('btn-upload-font');
    const fileInput = document.getElementById('local-font-file');
    const fontSelect = document.getElementById('tb-font');
    if (!btnUpload || !fileInput || !fontSelect) return;

    loadCachedCustomFonts(fontSelect);
    btnUpload.addEventListener('click', () => fileInput.click());

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
            } catch (err) { console.error('字体缓存失败:', err); }
        };
        reader.readAsDataURL(file);
    });
}

function registerAndApplyFont(fontName, displayName, fontDataUrl, autoSelect = false) {
    const fontSelect = document.getElementById('tb-font');
    if (!fontSelect) return;
    fetch(fontDataUrl).then(res => res.arrayBuffer())
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
                if (layer && layer.type === 'text') { layer.fontFamily = fontName; renderCanvas(); }
            }
        })
        .catch(err => console.error('注册字体失败:', err));
}

function loadCachedCustomFonts(fontSelect) {
    try {
        let savedFonts = JSON.parse(localStorage.getItem('douyin_cover_custom_fonts') || '[]');
        savedFonts.forEach(font => registerAndApplyFont(font.fontName, font.displayName, font.fontDataUrl, false));
    } catch (err) { console.error('读取字体缓存出错:', err); }
}

function exportElementToPNG(canvasDOMNode, filename) {
    return new Promise((resolve) => {
        const selectedLayers = canvasDOMNode.querySelectorAll('.canvas-layer.selected');
        selectedLayers.forEach(el => el.classList.remove('selected'));

        const pageWrapper = canvasDOMNode.closest('.canvas-page-wrapper');
        let hadActivePage = false;
        if (pageWrapper) {
            hadActivePage = pageWrapper.classList.contains('active-page');
            pageWrapper.classList.remove('active-page');
        }

        const originalStyles = {
            border: canvasDOMNode.style.border,
            borderColor: canvasDOMNode.style.borderColor,
            boxShadow: canvasDOMNode.style.boxShadow,
            borderRadius: canvasDOMNode.style.borderRadius
        };
        canvasDOMNode.style.border = 'none';
        canvasDOMNode.style.borderColor = 'transparent';
        canvasDOMNode.style.boxShadow = 'none';
        canvasDOMNode.style.borderRadius = '0';

        html2canvas(canvasDOMNode, {
            scale: 2, useCORS: true, allowTaint: true, backgroundColor: null
        }).then(canvas => {
            selectedLayers.forEach(el => el.classList.add('selected'));
            if (pageWrapper && hadActivePage) pageWrapper.classList.add('active-page');
            canvasDOMNode.style.border = originalStyles.border;
            canvasDOMNode.style.borderColor = originalStyles.borderColor;
            canvasDOMNode.style.boxShadow = originalStyles.boxShadow;
            canvasDOMNode.style.borderRadius = originalStyles.borderRadius;

            const pngURL = canvas.toDataURL('image/png');
            const downloadLink = document.createElement('a');
            downloadLink.href = pngURL;
            downloadLink.download = filename;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            resolve();
        }).catch(err => {
            selectedLayers.forEach(el => el.classList.add('selected'));
            if (pageWrapper && hadActivePage) pageWrapper.classList.add('active-page');
            canvasDOMNode.style.border = originalStyles.border;
            canvasDOMNode.style.borderColor = originalStyles.borderColor;
            canvasDOMNode.style.boxShadow = originalStyles.boxShadow;
            canvasDOMNode.style.borderRadius = originalStyles.borderRadius;
            console.error('导出失败:', err);
            resolve();
        });
    });
}

async function exportAllPagesAsPNG() {
    const wrappers = document.querySelectorAll('.canvas-page-wrapper');
    if (wrappers.length === 0) { alert('当前没有可导出的画布页面！'); return; }
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
            if (targetWrapper) targetWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        listEl.appendChild(item);
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

function createBackdropElement(layer) {
    if (!layer.backdrop || !layer.backdrop.type || layer.backdrop.type === 'none') return null;
    const bd = layer.backdrop;
    const el = document.createElement('div');
    el.className = 'layer-backdrop';
    const pad = (bd.padding !== undefined ? bd.padding : 12);
    el.style.left = (-pad) + 'px';
    el.style.top = (-pad) + 'px';
    el.style.right = (-pad) + 'px';
    el.style.bottom = (-pad) + 'px';
    el.style.opacity = (bd.opacity !== undefined ? bd.opacity : 1);
    el.style.transform = `rotate(${bd.rotate || 0}deg)`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.style.backgroundRepeat = 'no-repeat';

    if (bd.type === 'custom') {
        const cid = bd.customId;
        if (cid !== undefined && cid !== null) {
            let dataUrl = (typeof backdropCache !== 'undefined' && backdropCache[cid]) || null;
            if (dataUrl) {
                el.style.backgroundImage = `url(${dataUrl})`;
                applyCustomBackdropStyle(el, dataUrl, bd);
            } else {
                el.style.background = bd.color || '#ffffff';
                BackdropDB.getBackdropById(cid).then(item => {
                    if (!item) return;
                    if (typeof backdropCache !== 'undefined') backdropCache[cid] = item.dataUrl;
                    const target = document.querySelector(`.canvas-layer[data-id="${layer.id}"] .layer-backdrop`);
                    if (target) {
                        target.style.backgroundImage = `url(${item.dataUrl})`;
                        applyCustomBackdropStyle(target, item.dataUrl, bd);
                    }
                }).catch(() => {});
            }
        }
    } else if (window.BackdropTextures && BackdropTextures.isCanvasTexture(bd.type)) {
        const dataUrl = BackdropTextures.get(bd.type, bd.color);
        if (dataUrl) {
            el.style.background = 'transparent';
            el.style.backgroundImage = `url(${dataUrl})`;
            el.style.backgroundSize = 'cover';
            el.style.backgroundPosition = 'center';
            el.style.backgroundRepeat = 'no-repeat';
        } else {
            el.style.background = bd.color || '#d2b48c';
        }
        el.classList.add(`backdrop-${bd.type}`);
    } else {
        el.style.background = '';
        el.style.backgroundImage = '';
        el.classList.add(`backdrop-${bd.type}`);
        if (bd.type === 'brush') {
            el.style.background = bd.color || 'rgba(255,235,59,0.55)';
        } else if (bd.type === 'sticky') {
            el.style.background = bd.color || '#fff740';
        } else if (bd.type === 'polaroid') {
            el.style.background = bd.color || '#ffffff';
        } else if (bd.type === 'ticket') {
            el.style.background = bd.color || '#fff5e6';
        } else if (bd.type === 'washi') {
            el.style.background = bd.color || '#fdf2f8';
        } else if (bd.type === 'torn' || bd.type === 'tape') {
            if (bd.color) el.style.background = bd.color;
        }
    }

    return el;
}

function applyCustomBackdropStyle(el, dataUrl, bd) {
    el.style.backgroundImage = `url(${dataUrl})`;
    const mode = bd.sizeMode || 'cover';
    if (mode === 'cover') {
        el.style.backgroundSize = 'cover';
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundPosition = 'center';
    } else if (mode === 'contain') {
        el.style.backgroundSize = 'contain';
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundPosition = 'center';
    } else if (mode === 'repeat') {
        el.style.backgroundSize = 'auto';
        el.style.backgroundRepeat = 'repeat';
        el.style.backgroundPosition = 'top left';
    }
    if (bd.overlayColor) {
        el.style.backgroundImage = `linear-gradient(${bd.overlayColor}, ${bd.overlayColor}), url(${dataUrl})`;
        el.style.backgroundBlendMode = 'multiply';
    }
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
        canvasBg.style.background = '#000';
        canvasEl.appendChild(canvasBg);

        const layersWrapper = document.createElement('div');
        layersWrapper.className = 'layers-wrapper';

        page.layers.forEach(layer => {
            const isSelected = isCurrentPage && (
                (window.MultiSelect && MultiSelect.isSelected(layer.id)) ||
                (!window.MultiSelect && layer.id === state.selectedLayerId)
            );
            const isEditing = isCurrentPage && (layer.id === state.editingLayerId);

            const el = document.createElement('div');
            // ✅ 新增 layer-type-* 类名，供 CSS 做文本自适应
            el.className = `canvas-layer layer-type-${layer.type} ${isSelected ? 'selected' : ''} ${isEditing ? 'editing' : ''}`;
            el.dataset.id = layer.id;
            el.style.left = layer.x + 'px';
            el.style.top = layer.y + 'px';
            el.style.width = layer.width + 'px';

            // ✅ 文本图层高度模式：auto 则交给 CSS 自适应，fixed 则用固定 px
            if (layer.type === 'text') {
                const isFixed = layer.heightMode === 'fixed';
                el.classList.add(isFixed ? 'fixed-height' : 'auto-height');
                if (!isFixed) {
                    el.style.height = 'auto';
                } else {
                    el.style.height = layer.height + 'px';
                }
            } else {
                el.style.height = layer.height + 'px';
            }

            el.style.opacity = layer.opacity !== undefined ? layer.opacity : 1;

            const rot = layer.rotation || 0;
            const flipH = layer.flipH ? -1 : 1;
            const flipV = layer.flipV ? -1 : 1;
            let transforms = [];
            if (rot) transforms.push(`rotate(${rot}deg)`);
            if (flipH !== 1 || flipV !== 1) transforms.push(`scale(${flipH}, ${flipV})`);
            if (transforms.length > 0) el.style.transform = transforms.join(' ');

            if (layer.type === 'text') {
                const backdropEl = createBackdropElement(layer);
                if (backdropEl) el.appendChild(backdropEl);

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
                if (layer.effectClass) textInner.classList.add(layer.effectClass);

                // ✅ Auto 模式：内容变化时同步图层 height（避免末行下方留白）
                if (layer.heightMode !== 'fixed') {
                    const syncAutoHeight = () => {
                        if (layer.heightMode === 'fixed') return;
                        const h = textInner.offsetHeight + 4; // padding 2*2
                        if (Math.abs((layer.height || 0) - h) > 1) {
                            layer.height = h;
                        }
                    };
                    requestAnimationFrame(syncAutoHeight);
                    let syncTimer = null;
                    textInner.addEventListener('input', () => {
                        if (syncTimer) clearTimeout(syncTimer);
                        syncTimer = setTimeout(syncAutoHeight, 80);
                    });
                    if (document.fonts && document.fonts.ready) {
                        document.fonts.ready.then(syncAutoHeight);
                    }
                }

                el.addEventListener('dblclick', (e) => {
                    e.stopPropagation(); e.preventDefault();
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
                el.style.display = 'flex';
                el.style.alignItems = 'center';
                el.style.justifyContent = 'center';
                el.style.pointerEvents = 'none';

                if (layer.stickerType === 'svg' || layer.stickerType === 'image' || layer.stickerType === 'uploaded') {
                    let src = layer.content;
                    if (layer.stickerType === 'svg' && layer.stickerColor) {
                        try {
                            const decoded = decodeURIComponent(src.split('utf8,')[1] || '');
                            src = 'data:image/svg+xml;utf8,' + encodeURIComponent(decoded.replace(/fill="currentColor"/g, `fill="${layer.stickerColor}"`));
                        } catch (err) { }
                    }
                    const img = document.createElement('img');
                    img.src = src;
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.objectFit = 'contain';
                    img.draggable = false;
                    img.style.pointerEvents = 'none';
                    el.appendChild(img);
                } else {
                    el.style.fontSize = layer.fontSize;
                    el.style.pointerEvents = 'auto';
                    el.innerText = layer.content;
                }
                el.style.pointerEvents = 'auto';
            }

            ['nw', 'ne', 'sw', 'se'].forEach(dir => {
                const handle = document.createElement('div');
                handle.className = `resize-handle ${dir}`;
                handle.dataset.direction = dir;
                el.appendChild(handle);
            });
            ['left', 'right', 'top', 'bottom'].forEach(dir => {
                const handle = document.createElement('div');
                handle.className = `edge-handle ${dir}`;
                handle.dataset.direction = dir;
                el.appendChild(handle);
            });

            const rotateHandle = document.createElement('div');
            rotateHandle.className = 'rotate-handle';
            rotateHandle.title = '拖拽旋转（按住 Shift 15° 步进）';
            el.appendChild(rotateHandle);

            layersWrapper.appendChild(el);
        });

        canvasEl.appendChild(layersWrapper);
        pageWrapper.appendChild(canvasEl);
        container.appendChild(pageWrapper);
        if (typeof applyBackgroundToCanvases === 'function') {
            applyBackgroundToCanvases(state.background);
        }
    });

    if (typeof applyBackgroundToCanvases === 'function') {
        applyBackgroundToCanvases(state.background);
    }

    // 重绘参考线
    if (window.Guides) Guides.renderGuides();
}

function renderLayerList() {
    const listEl = document.getElementById('layer-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    state.layers.forEach(layer => {
        const item = document.createElement('div');
        const isSel = window.MultiSelect
            ? MultiSelect.isSelected(layer.id)
            : (layer.id === state.selectedLayerId);
        item.className = `layer-item ${isSel ? 'active' : ''}`;
        const cleanContent = (layer.content || '').replace(/<[^>]*>/g, '').substring(0, 10);
        const iconName = layer.type === 'text' ? 'fa-font' : 'fa-face-smile';
        const typeLabel = layer.type === 'sticker' ? `[${layer.stickerType || 'emoji'}]` : '';
        item.innerHTML = `
            <span><i class="fa-solid ${iconName}"></i> ${typeLabel}${cleanContent || '图层'}</span>
            <button class="btn" style="padding: 2px 6px; font-size:11px;" onclick="selectLayerFromList('${layer.id}')">选择</button>
        `;
        item.addEventListener('click', () => {
            state.selectedLayerId = layer.id;
            if (window.MultiSelect) {
                state.selectedLayerIds = [layer.id];
            }
            renderCanvas();
            renderLayerList();
            updateTopToolbarUI(state.getSelectedLayer());
            if (typeof showStickerColorBar === 'function') {
                showStickerColorBar(layer.type === 'sticker' && layer.stickerType === 'svg');
            }
        });
        listEl.appendChild(item);
    });
}

function selectLayerFromList(id) {
    state.selectedLayerId = id;
    if (window.MultiSelect) {
        state.selectedLayerIds = [id];
    }
    renderCanvas();
    renderLayerList();
    updateTopToolbarUI(state.getSelectedLayer());
    const layer = state.getSelectedLayer();
    if (layer && typeof showStickerColorBar === 'function') {
        showStickerColorBar(layer.type === 'sticker' && layer.stickerType === 'svg');
    }
}

/* ============================================================
   背景系统 v2 —— 智能预设库 + 一键随机 + 主色提取
   ============================================================ */

const BG_FAV_KEY = 'douyin_bg_favs_v2';
const BG_RECENT_KEY = 'douyin_bg_recent_v2';
const BG_RECENT_MAX = 12;
let currentBgCategory = 'hot';

function normalizeBackground(bg) {
    const base = window.DEFAULT_BACKGROUND || {
        type: 'gradient', color1: '#ff2442', color2: '#2575fc',
        imageUrl: '', angle: 135, texture: 'none', presetId: null
    };
    return Object.assign({}, base, bg || {});
}

function textureOverlayCss(texture) {
    switch (texture) {
        case 'noise':
            return `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.16'/></svg>")`;
        case 'grid':
            return `linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)`;
        case 'dots':
            return `radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1.5px)`;
        case 'vignette':
            return `radial-gradient(ellipse at center, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 100%)`;
        default:
            return '';
    }
}

function backgroundToCss(bg) {
    bg = normalizeBackground(bg);
    const angle = (bg.angle !== undefined && bg.angle !== null) ? bg.angle : 135;
    const texture = bg.texture || 'none';

    let baseCss = '';
    if (bg.type === 'gradient') {
        baseCss = `linear-gradient(${angle}deg, ${bg.color1} 0%, ${bg.color2} 100%)`;
    } else if (bg.type === 'solid') {
        baseCss = bg.color1;
    } else if (bg.type === 'image' && bg.imageUrl) {
        return `url(${bg.imageUrl}) center/cover no-repeat`;
    } else {
        baseCss = '#000';
    }

    const overlay = textureOverlayCss(texture);
    if (!overlay) return baseCss;
    return `${overlay}, ${baseCss}`;
}

function applyBackgroundToCanvases(bg) {
    bg = normalizeBackground(bg);

    if (bg.type === 'image' && window.applyBackgroundToCanvasesWithImage) {
        window.applyBackgroundToCanvasesWithImage(bg);
        return;
    }

    if (window.applyBackgroundToCanvasesWithImage) {
        window.applyBackgroundToCanvasesWithImage(bg);
    }

    const css = backgroundToCss(bg);
    document.querySelectorAll('.canvas-bg').forEach(el => {
        el.style.background = css;
        el.style.backgroundSize = '';
        if (bg.texture === 'grid') {
            el.style.backgroundSize = '22px 22px, 22px 22px, 100% 100%';
        } else if (bg.texture === 'dots') {
            el.style.backgroundSize = '14px 14px, 100% 100%';
        }
    });
}

function updateBackgroundView() {
    applyBackgroundToCanvases(state.background);
    syncBgPanelInputs(state.background);
    renderBgPresetGrid();
}

function syncBgPanelInputs(bg) {
    bg = normalizeBackground(bg);
    const typeEl = document.getElementById('bg-type');
    if (typeEl) typeEl.value = bg.type;

    const c1 = document.getElementById('bg-color-1');
    const c2 = document.getElementById('bg-color-2');
    if (c1) c1.value = bg.color1 || '#ff2442';
    if (c2) c2.value = bg.color2 || '#2575fc';

    const angleEl = document.getElementById('bg-angle');
    const angleVal = document.getElementById('bg-angle-val');
    if (angleEl) angleEl.value = bg.angle ?? 135;
    if (angleVal) angleVal.textContent = bg.angle ?? 135;

    const texEl = document.getElementById('bg-texture');
    if (texEl) texEl.value = bg.texture || 'none';

    const colorControls = document.getElementById('bg-color-controls');
    const imageControls = document.getElementById('bg-image-controls');
    if (colorControls && imageControls) {
        const showColor = (bg.type === 'gradient' || bg.type === 'solid');
        colorControls.style.display = showColor ? 'block' : 'none';
        imageControls.style.display = showColor ? 'none' : 'block';
    }

    if (typeof window.syncImagePanelVisibility === 'function') {
        window.syncImagePanelVisibility(bg);
    }
    if (typeof window.syncImageControlsToState === 'function') {
        window.syncImageControlsToState();
    }
}

function getFavPresetIds() {
    try { return JSON.parse(localStorage.getItem(BG_FAV_KEY) || '[]'); }
    catch (e) { return []; }
}
function saveFavPresetIds(ids) {
    try { localStorage.setItem(BG_FAV_KEY, JSON.stringify(ids)); } catch (e) {}
}
function getRecentPresetIds() {
    try { return JSON.parse(localStorage.getItem(BG_RECENT_KEY) || '[]'); }
    catch (e) { return []; }
}
function pushRecentPresetId(id) {
    let list = getRecentPresetIds();
    list = list.filter(x => x !== id);
    list.unshift(id);
    if (list.length > BG_RECENT_MAX) list = list.slice(0, BG_RECENT_MAX);
    try { localStorage.setItem(BG_RECENT_KEY, JSON.stringify(list)); } catch (e) {}
}

function findPresetById(id) {
    return BG_PRESETS.find(p => p.id === id) || null;
}

function getPresetsByCategory(cat) {
    if (cat === 'fav') {
        return getFavPresetIds().map(id => findPresetById(id)).filter(Boolean);
    }
    if (cat === 'recent') {
        return getRecentPresetIds().map(id => findPresetById(id)).filter(Boolean);
    }
    return BG_PRESETS.filter(p => p.cat === cat);
}

function toggleFavPreset(id) {
    let favIds = getFavPresetIds();
    if (favIds.includes(id)) {
        favIds = favIds.filter(x => x !== id);
        if (id.startsWith('img-') || id.startsWith('url-')) {
            removeFavImageEntry(id);
        }
    } else {
        favIds.push(id);
    }
    saveFavPresetIds(favIds);
    renderBgPresetGrid();
    renderFavBackgrounds();
}

function applyPresetToState(preset) {
    if (!preset) return;
    const newBg = {
        type: preset.type,
        color1: preset.color1 || '#000000',
        color2: preset.color2 || preset.color1 || '#000000',
        imageUrl: '',
        angle: preset.angle ?? 135,
        texture: preset.texture || 'none',
        presetId: preset.id
    };
    state.background = normalizeBackground(newBg);
    applyBackgroundToCanvases(state.background);
    syncBgPanelInputs(state.background);
    renderBgPresetGrid();
    pushRecentPresetId(preset.id);
    state.saveState();
}

function handleSmartRecommend() {
    const layer = state.getSelectedLayer && state.getSelectedLayer();
    let candidates = [];

    if (layer && layer.type === 'text' && layer.content) {
        const text = String(layer.content).replace(/<[^>]*>/g, '').toLowerCase();
        SMART_KEYWORD_MAP.forEach(rule => {
            if (rule.keys.some(k => text.includes(k))) {
                candidates.push(...rule.presets);
            }
        });
    }

    if (layer && layer.effectClass && SMART_EFFECT_MAP[layer.effectClass]) {
        candidates.push(...SMART_EFFECT_MAP[layer.effectClass]);
    }

    if (candidates.length === 0) {
        candidates = BG_PRESETS.filter(p => p.cat === 'hot').map(p => p.id);
    }

    const currentId = state.background && state.background.presetId;
    candidates = Array.from(new Set(candidates)).filter(id => id !== currentId);

    if (candidates.length === 0) {
        showBgToast('已是最佳匹配，无需更换 ✨');
        return;
    }

    const pickId = candidates[Math.floor(Math.random() * candidates.length)];
    const preset = findPresetById(pickId);
    if (preset) {
        applyPresetToState(preset);
        showBgToast(`智能推荐：<b>${preset.name}</b> ✨`);
        setTimeout(() => {
            const card = document.querySelector(`.bg-preset-card[data-preset-id="${preset.id}"]`);
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 80);
    }
}

function handleRandomAdvanced() {
    const pool = BG_PRESETS.filter(p =>
        ['hot', 'fresh', 'dark', 'neon', 'festival', 'knowledge'].includes(p.cat)
    );
    const currentId = state.background && state.background.presetId;
    const filtered = pool.filter(p => p.id !== currentId);
    const finalPool = filtered.length > 0 ? filtered : pool;
    const pick = finalPool[Math.floor(Math.random() * finalPool.length)];
    if (pick) {
        applyPresetToState(pick);
        showBgToast(`随机高级背景：<b>${pick.name}</b> 🎲`);
    }
}

function handleExtractColorClick() {
    const layer = state.getSelectedLayer && state.getSelectedLayer();
    if (layer && layer.type === 'sticker' && layer.content) {
        if (layer.content.startsWith('data:image') || /^https?:/.test(layer.content)) {
            extractColorsFromImageSrc(layer.content, `贴纸「${layer.stickerType || 'image'}」`);
            return;
        }
    }
    const fileInput = document.getElementById('bg-extract-file');
    if (fileInput) fileInput.click();
}

function extractColorsFromImageSrc(src, sourceLabel) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        try {
            const colors = extractDominantColors(img, 3);
            if (!colors || colors.length < 2) {
                showBgToast('未能提取到足够颜色，请换一张图试试', 3000);
                return;
            }
            const [c1, c2] = buildHarmoniousGradientColors(colors);
            const angle = 90 + Math.floor(Math.random() * 90);
            state.background = normalizeBackground({
                type: 'gradient',
                color1: c1,
                color2: c2,
                imageUrl: '',
                angle,
                texture: 'none',
                presetId: null
            });
            applyBackgroundToCanvases(state.background);
            syncBgPanelInputs(state.background);
            state.saveState();
            showBgToast(`已从${sourceLabel}提取主色生成渐变 🎨`);
        } catch (err) {
            console.error(err);
            showBgToast('提取失败：' + err.message, 3200);
        }
    };
    img.onerror = () => showBgToast('图片加载失败，请更换图片', 3200);
    img.src = src;
}

function extractDominantColors(img, count) {
    const maxW = 120, maxH = 120;
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('图片尺寸为 0');
    const ratio = Math.min(maxW / w, maxH / h, 1);
    w = Math.max(1, Math.round(w * ratio));
    h = Math.max(1, Math.round(h * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    const buckets = new Map();
    const Q = 24;
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 100) continue;
        const brightness = (r + g + b) / 3;
        if (brightness > 245 || brightness < 8) continue;
        const qr = Math.round(r / Q), qg = Math.round(g / Q), qb = Math.round(b / Q);
        const key = `${qr},${qg},${qb}`;
        const existing = buckets.get(key);
        if (existing) {
            existing.count++;
            existing.r += r; existing.g += g; existing.b += b;
        } else {
            buckets.set(key, { count: 1, r, g, b });
        }
    }

    if (buckets.size === 0) return [];

    const list = Array.from(buckets.values())
        .map(v => ({ r: v.r / v.count, g: v.g / v.count, b: v.b / v.count, count: v.count }))
        .sort((a, b) => b.count - a.count);

    const picked = [];
    const minDist = 60;
    for (const item of list) {
        if (picked.length >= count) break;
        if (picked.every(p => colorDistance(p, item) > minDist)) {
            picked.push(item);
        }
    }
    if (picked.length < 2) {
        for (const item of list) {
            if (picked.length >= Math.max(2, count)) break;
            if (!picked.includes(item)) picked.push(item);
        }
    }
    return picked.map(p => ({ r: Math.round(p.r), g: Math.round(p.g), b: Math.round(p.b) }));
}

function colorDistance(a, b) {
    const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

function rgbToHex({ r, g, b }) {
    const to2 = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return '#' + to2(r) + to2(g) + to2(b);
}

function rgbToHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
            case g: h = ((b - r) / d + 2); break;
            case b: h = ((r - g) / d + 4); break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255)
    };
}

function buildHarmoniousGradientColors(extracted) {
    const base = extracted[0];
    const hsl = rgbToHsl(base);

    if (extracted[1]) {
        const hsl2 = rgbToHsl(extracted[1]);
        let hueDiff = Math.abs(hsl.h - hsl2.h);
        if (hueDiff > 180) hueDiff = 360 - hueDiff;
        if (hueDiff >= 25 && hueDiff <= 200) {
            const c1 = rgbToHex(hslToRgb(hsl.h, Math.min(90, Math.max(45, hsl.s)), Math.min(70, Math.max(35, hsl.l))));
            const c2 = rgbToHex(hslToRgb(hsl2.h, Math.min(90, Math.max(45, hsl2.s)), Math.min(75, Math.max(30, hsl2.l))));
            return [c1, c2];
        }
    }

    const offset = 30 + Math.random() * 25;
    const sign = Math.random() > 0.5 ? 1 : -1;
    const h1 = hsl.h;
    const h2 = hsl.h + sign * offset;
    const s1 = Math.min(92, Math.max(55, hsl.s));
    const s2 = Math.min(92, Math.max(55, hsl.s));
    const l1 = Math.min(68, Math.max(38, hsl.l));
    const l2 = Math.min(72, Math.max(30, hsl.l - 10));
    const c1 = rgbToHex(hslToRgb(h1, s1, l1));
    const c2 = rgbToHex(hslToRgb(h2, s2, l2));
    return [c1, c2];
}

function initExtractFileInput() {
    const input = document.getElementById('bg-extract-file');
    if (!input || input.dataset.bound === 'true') return;
    input.dataset.bound = 'true';
    input.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            extractColorsFromImageSrc(evt.target.result, `图片「${file.name}」`);
        };
        reader.readAsDataURL(file);
        input.value = '';
    });
}

let _bgToastTimer = null;
function showBgToast(html, duration) {
    let el = document.getElementById('bg-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'bg-toast';
        el.className = 'bg-toast';
        document.body.appendChild(el);
    }
    el.innerHTML = html;
    void el.offsetWidth;
    el.classList.add('show');
    if (_bgToastTimer) clearTimeout(_bgToastTimer);
    _bgToastTimer = setTimeout(() => {
        el.classList.remove('show');
    }, duration || 2200);
}

function renderBgPresetGrid() {
    const grid = document.getElementById('bg-preset-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const favIds = getFavPresetIds();
    const currentPresetId = (state.background && state.background.presetId) || null;
    const store = getFavImageStore();

    if (currentBgCategory === 'fav') {
        const presetList = favIds.map(id => findPresetById(id)).filter(Boolean);
        const imgKeys = favIds.filter(id => store[id] && (id.startsWith('img-') || id.startsWith('url-')));

        if (presetList.length === 0 && imgKeys.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'bg-preset-empty';
            empty.innerHTML = '还没有收藏任何背景<br><small style="color:#6e7681;">点击任意预设右上角 ★ 或「收藏当前背景」即可收藏</small>';
            grid.appendChild(empty);
            return;
        }

        presetList.forEach(preset => {
            const card = document.createElement('div');
            card.className = 'bg-preset-card';
            card.dataset.presetId = preset.id;
            if (preset.id === currentPresetId) card.classList.add('active');
            if (favIds.includes(preset.id)) card.classList.add('fav-on');

            const swatch = document.createElement('div');
            swatch.className = 'bp-swatch';
            swatch.style.background = backgroundToCss(preset);
            if (preset.texture === 'grid') swatch.style.backgroundSize = '22px 22px, 22px 22px, 100% 100%';
            if (preset.texture === 'dots') swatch.style.backgroundSize = '14px 14px, 100% 100%';
            card.appendChild(swatch);

            const label = document.createElement('div');
            label.className = 'bp-label';
            label.textContent = preset.name;
            card.appendChild(label);

            const star = document.createElement('div');
            star.className = 'bp-star';
            star.innerHTML = '★';
            star.title = '取消收藏';
            star.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavPreset(preset.id);
            });
            card.appendChild(star);

            card.addEventListener('click', () => applyPresetToState(preset));
            grid.appendChild(card);
        });

        imgKeys.forEach(key => {
            const entry = store[key];
            if (!entry) return;

            const card = document.createElement('div');
            card.className = 'bg-preset-card is-uploaded';
            card.dataset.presetId = key;

            const curBg = state.background;
            if (curBg && curBg.type === 'image' &&
                ((curBg.customImageId && ('img-' + curBg.customImageId) === key) ||
                 (!curBg.customImageId && curBg.imageUrl === entry.dataUrl))) {
                card.classList.add('active');
            }

            const swatch = document.createElement('div');
            swatch.className = 'bp-swatch';
            if (entry.dataUrl) {
                swatch.style.background = `url(${entry.dataUrl}) center/cover no-repeat`;
            } else {
                swatch.style.background = '#30363d';
            }
            card.appendChild(swatch);

            const label = document.createElement('div');
            label.className = 'bp-label';
            label.textContent = '图片背景';
            card.appendChild(label);

            const del = document.createElement('div');
            del.className = 'bp-star';
            del.style.background = '#f85149';
            del.style.color = '#fff';
            del.innerHTML = '×';
            del.title = '移出收藏';
            del.style.display = 'flex';
            del.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('从收藏夹移除这张图片背景？')) {
                    toggleFavPreset(key);
                }
            });
            card.appendChild(del);

            card.addEventListener('click', () => {
                applyFavImageEntry(key);
            });

            grid.appendChild(card);
        });

        return;
    }

    const list = getPresetsByCategory(currentBgCategory);

    if (list.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'bg-preset-empty';
        empty.innerHTML = currentBgCategory === 'recent'
            ? '暂无最近使用记录<br><small style="color:#6e7681;">应用任意预设后会自动出现在这里</small>'
            : '暂无预设';
        grid.appendChild(empty);
        return;
    }

    list.forEach(preset => {
        const card = document.createElement('div');
        card.className = 'bg-preset-card';
        card.dataset.presetId = preset.id;
        if (preset.id === currentPresetId) card.classList.add('active');
        if (favIds.includes(preset.id)) card.classList.add('fav-on');

        const swatch = document.createElement('div');
        swatch.className = 'bp-swatch';
        swatch.style.background = backgroundToCss(preset);
        if (preset.texture === 'grid') swatch.style.backgroundSize = '22px 22px, 22px 22px, 100% 100%';
        if (preset.texture === 'dots') swatch.style.backgroundSize = '14px 14px, 100% 100%';
        card.appendChild(swatch);

        const label = document.createElement('div');
        label.className = 'bp-label';
        label.textContent = preset.name;
        card.appendChild(label);

        const star = document.createElement('div');
        star.className = 'bp-star';
        star.innerHTML = '★';
        star.title = '收藏 / 取消收藏';
        star.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavPreset(preset.id);
        });
        card.appendChild(star);

        card.addEventListener('click', () => applyPresetToState(preset));
        grid.appendChild(card);
    });
}

function renderFavBackgrounds() {
    const listEl = document.getElementById('fav-bg-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const favIds = getFavPresetIds();
    const store = getFavImageStore();

    if (favIds.length === 0) {
        const demo = BG_PRESETS.filter(p => p.cat === 'hot').slice(0, 4);
        demo.forEach(preset => listEl.appendChild(buildFavQuickItem(preset, false)));
        return;
    }

    favIds.forEach(id => {
        if (store[id] && (id.startsWith('img-') || id.startsWith('url-'))) {
            listEl.appendChild(buildFavQuickImageItem(id, store[id], true));
            return;
        }
        const preset = findPresetById(id);
        if (preset) listEl.appendChild(buildFavQuickItem(preset, true));
    });
}

function buildFavQuickItem(preset, showDelete) {
    const item = document.createElement('div');
    item.style.cssText = 'height: 32px; border-radius: 4px; border: 1px solid #30363d; cursor: pointer; position: relative; overflow: hidden;';
    item.style.background = backgroundToCss(preset);
    if (preset.texture === 'grid') item.style.backgroundSize = '22px 22px, 22px 22px, 100% 100%';
    if (preset.texture === 'dots') item.style.backgroundSize = '14px 14px, 100% 100%';
    item.title = `点击应用「${preset.name}」`;

    item.addEventListener('click', () => applyPresetToState(preset));

    if (showDelete) {
        const del = document.createElement('div');
        del.innerHTML = '×';
        del.title = '取消收藏';
        del.style.cssText = 'position:absolute;top:1px;right:1px;width:14px;height:14px;background:#f85149;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;z-index:5;font-weight:bold;line-height:1;box-shadow:0 1px 3px rgba(0,0,0,0.5);';
        del.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`把「${preset.name}」从收藏夹移除？`)) {
                toggleFavPreset(preset.id);
            }
        });
        item.appendChild(del);
    }

    return item;
}

function buildFavQuickImageItem(key, entry, showDelete) {
    const item = document.createElement('div');
    item.dataset.favImgKey = key;
    item.style.cssText = 'height: 32px; border-radius: 4px; border: 1px solid #30363d; cursor: pointer; position: relative; overflow: hidden;';
    if (entry.dataUrl) {
        item.style.background = `url(${entry.dataUrl}) center/cover no-repeat`;
    } else {
        item.style.background = '#30363d';
    }
    item.title = '点击应用这张图片背景';

    item.addEventListener('click', () => applyFavImageEntry(key));

    if (showDelete) {
        const del = document.createElement('div');
        del.innerHTML = '×';
        del.title = '取消收藏';
        del.style.cssText = 'position:absolute;top:1px;right:1px;width:14px;height:14px;background:#f85149;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;z-index:5;font-weight:bold;line-height:1;box-shadow:0 1px 3px rgba(0,0,0,0.5);';
        del.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('把这张图片背景从收藏夹移除？')) {
                toggleFavPreset(key);
            }
        });
        item.appendChild(del);
    }

    return item;
}

function initBackgroundPanelV2() {
    state.background = normalizeBackground(state.background);

    const bAi = document.getElementById('bg-smart-recommend');
    const bRand = document.getElementById('bg-random-advanced');
    const bExtract = document.getElementById('bg-extract-color');
    if (bAi) bAi.addEventListener('click', handleSmartRecommend);
    if (bRand) bRand.addEventListener('click', handleRandomAdvanced);
    if (bExtract) bExtract.addEventListener('click', handleExtractColorClick);
    initExtractFileInput();

    const tabsEl = document.getElementById('bg-category-tabs');
    if (tabsEl && tabsEl.dataset.bound !== 'true') {
        tabsEl.dataset.bound = 'true';
        tabsEl.querySelectorAll('.bg-cat-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                tabsEl.querySelectorAll('.bg-cat-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentBgCategory = tab.dataset.cat;
                renderBgPresetGrid();
            });
        });
    }

    const advToggle = document.getElementById('bg-advanced-toggle');
    const advBody = document.getElementById('bg-advanced-body');
    if (advToggle && advBody && advToggle.dataset.bound !== 'true') {
        advToggle.dataset.bound = 'true';
        advToggle.addEventListener('click', () => {
            const isOpen = advToggle.classList.toggle('open');
            advBody.style.display = isOpen ? 'block' : 'none';
        });
    }

    const bgType = document.getElementById('bg-type');
    if (bgType) {
        bgType.addEventListener('change', (e) => {
            state.background.type = e.target.value;
            state.background.presetId = null;
            applyBackgroundToCanvases(state.background);
            syncBgPanelInputs(state.background);
            renderBgPresetGrid();
            state.saveState();
        });
    }
    const c1 = document.getElementById('bg-color-1');
    const c2 = document.getElementById('bg-color-2');
    if (c1) c1.addEventListener('input', (e) => {
        state.background.color1 = e.target.value;
        state.background.presetId = null;
        applyBackgroundToCanvases(state.background);
        renderBgPresetGrid();
    });
    if (c2) c2.addEventListener('input', (e) => {
        state.background.color2 = e.target.value;
        state.background.presetId = null;
        applyBackgroundToCanvases(state.background);
        renderBgPresetGrid();
    });

    const angleEl = document.getElementById('bg-angle');
    const angleVal = document.getElementById('bg-angle-val');
    if (angleEl) angleEl.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        state.background.angle = v;
        if (angleVal) angleVal.textContent = v;
        state.background.presetId = null;
        applyBackgroundToCanvases(state.background);
    });

    const texEl = document.getElementById('bg-texture');
    if (texEl) texEl.addEventListener('change', (e) => {
        state.background.texture = e.target.value;
        state.background.presetId = null;
        applyBackgroundToCanvases(state.background);
        renderBgPresetGrid();
        state.saveState();
    });

    const imgFile = document.getElementById('bg-image-file');
    if (imgFile) imgFile.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            state.background.type = 'image';
            state.background.imageUrl = evt.target.result;
            state.background.presetId = null;
            applyBackgroundToCanvases(state.background);
            state.saveState();
        };
        reader.readAsDataURL(file);
    });

    const btnFav = document.getElementById('btn-fav-bg');
    if (btnFav && btnFav.dataset.bound !== 'true') {
        btnFav.dataset.bound = 'true';
        btnFav.addEventListener('click', () => {
            const bg = state.background;

            if (bg && bg.type === 'image' && (bg.customImageId || bg.imageUrl)) {
                const imgKey = bg.customImageId
                    ? ('img-' + bg.customImageId)
                    : ('url-' + hashString(bg.imageUrl || ''));
                const favIds = getFavPresetIds();
                if (favIds.includes(imgKey)) {
                    showBgToast('该图片背景已在收藏夹中');
                } else {
                    saveFavImageEntry(imgKey, bg);
                    favIds.push(imgKey);
                    saveFavPresetIds(favIds);
                    renderBgPresetGrid();
                    renderFavBackgrounds();
                    showBgToast('图片背景已加入收藏夹 ⭐');
                }
                return;
            }

            const pid = bg && bg.presetId;
            if (pid && findPresetById(pid)) {
                if (!getFavPresetIds().includes(pid)) {
                    toggleFavPreset(pid);
                    showBgToast('已加入收藏夹 ⭐');
                } else {
                    showBgToast('该预设已在收藏夹中');
                }
            } else {
                showBgToast('请先点击一款预设，再收藏为快捷背景 ⭐', 2600);
            }
        });
    }

    renderBgPresetGrid();
    renderFavBackgrounds();
    syncBgPanelInputs(state.background);
    applyBackgroundToCanvases(state.background);

    if (typeof window.syncImagePanelVisibility === 'function') {
        window.syncImagePanelVisibility(state.background);
    }
    if (typeof window.syncImageControlsToState === 'function') {
        window.syncImageControlsToState();
    }
}

/* ============================================================
   图片背景收藏夹（v3 —— IndexedDB 版本）
   ============================================================ */

const BG_FAV_IMG_DB_NAME = 'douyin_bg_fav_images_db';
const BG_FAV_IMG_STORE = 'images';

let bgFavImgMemory = {};
let bgFavImgKeys = [];
let bgFavImgReady = false;

const BG_FavImageDB = (function () {
    let dbPromise = null;
    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(BG_FAV_IMG_DB_NAME, 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(BG_FAV_IMG_STORE)) {
                    db.createObjectStore(BG_FAV_IMG_STORE, { keyPath: 'key' });
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e);
        });
        return dbPromise;
    }

    async function put(key, entry) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(BG_FAV_IMG_STORE, 'readwrite');
            const req = tx.objectStore(BG_FAV_IMG_STORE).put({ key, entry });
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e);
        });
    }

    async function getAll() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(BG_FAV_IMG_STORE, 'readonly');
            const req = tx.objectStore(BG_FAV_IMG_STORE).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = (e) => reject(e);
        });
    }

    async function remove(key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(BG_FAV_IMG_STORE, 'readwrite');
            const req = tx.objectStore(BG_FAV_IMG_STORE).delete(key);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e);
        });
    }

    return { put, getAll, remove };
})();

function getFavImageStore() {
    return bgFavImgMemory;
}

function saveFavImageEntry(key, bg) {
    try {
        let dataUrl = bg.imageUrl || '';
        if (!dataUrl && bg.customImageId) {
            if (typeof bgImageCache !== 'undefined' && bgImageCache[bg.customImageId]) {
                dataUrl = bgImageCache[bg.customImageId];
            }
        }
        if (!dataUrl) {
            console.warn('saveFavImageEntry: 没有可用 dataUrl', key, bg);
            return;
        }

        const entry = {
            key,
            dataUrl,
            bg: {
                type: 'image',
                imageUrl: dataUrl,
                customImageId: bg.customImageId || null,
                fit: bg.fit || 'cover',
                scale: bg.scale !== undefined ? bg.scale : 1,
                positionX: bg.positionX !== undefined ? bg.positionX : 50,
                positionY: bg.positionY !== undefined ? bg.positionY : 50,
                blur: bg.blur || 0,
                overlayColor: bg.overlayColor || '#000000',
                overlayOpacity: bg.overlayOpacity !== undefined ? bg.overlayOpacity : 0,
                angle: 135,
                texture: 'none',
                presetId: null
            }
        };

        bgFavImgMemory[key] = entry;
        if (!bgFavImgKeys.includes(key)) bgFavImgKeys.push(key);

        BG_FavImageDB.put(key, entry).catch(err => {
            console.error('IndexedDB 写入图片收藏失败:', err);
        });

        console.log('图片收藏快照已保存到 IndexedDB:', key);
    } catch (e) {
        console.error('saveFavImageEntry 失败:', e);
    }
}

function removeFavImageEntry(key) {
    if (bgFavImgMemory[key]) {
        delete bgFavImgMemory[key];
    }
    bgFavImgKeys = bgFavImgKeys.filter(k => k !== key);
    BG_FavImageDB.remove(key).catch(err => {
        console.error('IndexedDB 移除图片收藏失败:', err);
    });
}

function applyFavImageEntry(key) {
    const entry = bgFavImgMemory[key];
    if (!entry || !entry.bg) return;
    state.background = normalizeBackground(entry.bg);
    applyBackgroundToCanvases(state.background);
    syncBgPanelInputs(state.background);
    renderBgPresetGrid();
    state.saveState();
    if (typeof showBgToast === 'function') showBgToast('已应用收藏的图片背景 🖼️');
}

function hashString(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(36);
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(async () => {
        try {
            const rows = await BG_FavImageDB.getAll();
            bgFavImgMemory = {};
            bgFavImgKeys = [];
            rows.forEach(row => {
                if (row && row.entry && row.entry.bg && row.entry.dataUrl) {
                    bgFavImgMemory[row.key] = row.entry;
                    bgFavImgKeys.push(row.key);
                }
            });
            try {
                const legacy = JSON.parse(localStorage.getItem('douyin_bg_fav_images_v1') || '{}');
                const legacyKeys = Object.keys(legacy);
                if (legacyKeys.length > 0) {
                    for (const key of legacyKeys) {
                        if (!bgFavImgMemory[key] && legacy[key] && legacy[key].dataUrl) {
                            bgFavImgMemory[key] = legacy[key];
                            bgFavImgKeys.push(key);
                            await BG_FavImageDB.put(key, legacy[key]);
                        }
                    }
                    try { localStorage.removeItem('douyin_bg_fav_images_v1'); } catch(e) {}
                }
            } catch (e) { }

            bgFavImgReady = true;

            if (typeof renderBgPresetGrid === 'function') renderBgPresetGrid();
            if (typeof renderFavBackgrounds === 'function') renderFavBackgrounds();
        } catch (e) {
            console.error('加载图片收藏失败:', e);
            bgFavImgReady = true;
        }
    }, 100);
});