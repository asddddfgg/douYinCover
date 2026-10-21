// ============================================================
// background-image.js
// 自定义图片背景 —— IndexedDB 存储 + 完整控制（适配/缩放/位置/模糊/遮罩）
// ============================================================

const BG_IMG_DB_NAME = 'douyin_bg_images_db';
const BG_IMG_STORE = 'images';
const BG_IMG_RECENT_KEY = 'douyin_bg_image_recent_v1';
const BG_IMG_RECENT_MAX = 20;

// ---------- IndexedDB 封装 ----------
const BGImageDB = (function () {
    let dbPromise = null;
    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(BG_IMG_DB_NAME, 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(BG_IMG_STORE)) {
                    db.createObjectStore(BG_IMG_STORE, { keyPath: 'id', autoIncrement: true });
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e);
        });
        return dbPromise;
    }



        // 增加可选第三参数 category，默认 null
    // 现有调用点（handleUploadBgImageFile 等）不用改
    async function addImage(name, dataUrl, category = null) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(BG_IMG_STORE, 'readwrite');
            const req = tx.objectStore(BG_IMG_STORE).add({
                name: name || '背景图片',
                dataUrl,
                category,
                createdAt: Date.now()
            });
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e);
        });
    }

    async function getAllImages() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(BG_IMG_STORE, 'readonly');
            const req = tx.objectStore(BG_IMG_STORE).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = (e) => reject(e);
        });
    }

    async function getImageById(id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(BG_IMG_STORE, 'readonly');
            const req = tx.objectStore(BG_IMG_STORE).get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = (e) => reject(e);
        });
    }

    async function deleteImage(id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(BG_IMG_STORE, 'readwrite');
            const req = tx.objectStore(BG_IMG_STORE).delete(id);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e);
        });
    }

    return { addImage, getAllImages, getImageById, deleteImage };
})();
window.BGImageDB = BGImageDB;

// 运行时缓存：id -> dataUrl，避免每次渲染都异步读
const bgImageCache = {};










// 最近使用 id 列表（前端 localStorage）
function getBgImageRecentIds() {
    try { return JSON.parse(localStorage.getItem(BG_IMG_RECENT_KEY) || '[]'); }
    catch (e) { return []; }
}
function saveBgImageRecentIds(ids) {
    try { localStorage.setItem(BG_IMG_RECENT_KEY, JSON.stringify(ids)); } catch (e) {}
}
function pushBgImageRecentId(id) {
    let list = getBgImageRecentIds();
    list = list.filter(x => x !== id);
    list.unshift(id);
    if (list.length > BG_IMG_RECENT_MAX) list = list.slice(0, BG_IMG_RECENT_MAX);
    saveBgImageRecentIds(list);
}

/* ============================================================
   应用背景（图片模式渲染到 .canvas-bg）
   ============================================================ */

// 把 state.background 的图片模式转成可渲染的 CSS（配合子层使用）
function buildImageBackgroundStyle(bg) {
    const fit = bg.fit || 'cover';
    const scale = (bg.scale !== undefined ? bg.scale : 1);
    const posX = (bg.positionX !== undefined ? bg.positionX : 50);
    const posY = (bg.positionY !== undefined ? bg.positionY : 50);
    const blur = (bg.blur !== undefined ? bg.blur : 0);

    let sizeCss;
    if (fit === 'cover') sizeCss = `cover`;
    else if (fit === 'contain') sizeCss = `contain`;
    else if (fit === 'fill') sizeCss = `100% 100%`;
    else if (fit === 'repeat') sizeCss = 'auto';

    // scale 叠加：用 background-size + CSS 变量放大效果
    if (fit !== 'fill' && scale !== 1 && fit !== 'repeat') {
        // cover 时 scale 用 transform 表现（见下方 applyImageToCanvasBg）
        sizeCss = sizeCss;
    }

    const repeatCss = fit === 'repeat' ? 'repeat' : 'no-repeat';

    // 滤镜解耦：blur 单独拼，colorFilter 不含 blur（防双叠加）
    const parts = [];
    if (bg.blur > 0) parts.push(`blur(${bg.blur}px)`);
    if (bg.colorFilter && bg.colorFilter !== 'none' && !/blur\s*\(/i.test(bg.colorFilter)) {
        parts.push(bg.colorFilter);
    }
    const filterValue = parts.length ? parts.join(' ') : 'none';

    return {
        backgroundSize: sizeCss,
        backgroundPosition: `${posX}% ${posY}%`,
        backgroundRepeat: repeatCss,
        filter: filterValue,
        transform: (fit === 'cover' && scale !== 1) ? `scale(${scale})` : 'none',
        transformOrigin: `${posX}% ${posY}%`
    };
}






// 将图片应用到所有 .canvas-bg（不会破坏文字/图层结构）
function applyImageBackgroundToCanvases(bg) {
    if (!bg || bg.type !== 'image') return;

    const apply = (dataUrl) => {
        document.querySelectorAll('.cover-canvas').forEach(canvasEl => {
            let bgEl = canvasEl.querySelector('.canvas-bg');
            if (!bgEl) return;

            // 清理之前可能存在的纹理/渐变样式，改为图片
            bgEl.style.background = '';
            bgEl.style.backgroundImage = `url(${dataUrl})`;
            bgEl.style.backgroundSize = '';
            bgEl.style.backgroundPosition = '';
            bgEl.style.backgroundRepeat = '';
            bgEl.style.overflow = 'hidden';

            const styleObj = buildImageBackgroundStyle(bg);
            bgEl.style.backgroundSize = styleObj.backgroundSize;
            bgEl.style.backgroundPosition = styleObj.backgroundPosition;
            bgEl.style.backgroundRepeat = styleObj.backgroundRepeat;
            bgEl.style.filter = styleObj.filter;
            bgEl.style.transform = styleObj.transform;
            bgEl.style.transformOrigin = styleObj.transformOrigin;

                        // 遮罩层（支持 solid / linear / radial）
            let overlay = canvasEl.querySelector('.canvas-bg-overlay');
            const hasOverlay =
                (bg.overlayType === 'linear' || bg.overlayType === 'radial')
                    ? Array.isArray(bg.overlayStops) && bg.overlayStops.length > 0
                    : (bg.overlayColor && (bg.overlayOpacity || 0) > 0);

            if (hasOverlay) {
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.className = 'canvas-bg-overlay';
                    overlay.style.position = 'absolute';
                    overlay.style.inset = '0';
                    overlay.style.zIndex = '1';
                    overlay.style.pointerEvents = 'none';
                    const layersWrapper = canvasEl.querySelector('.layers-wrapper');
                    if (layersWrapper) canvasEl.insertBefore(overlay, layersWrapper);
                    else canvasEl.appendChild(overlay);
                }
                if (bg.overlayType === 'linear') {
                    overlay.style.background =
                        `linear-gradient(${bg.overlayAngle}deg, ${stopsToCss(bg.overlayStops)})`;
                } else if (bg.overlayType === 'radial') {
                    overlay.style.background =
                        `radial-gradient(circle at ${bg.overlayCenter.x}% ${bg.overlayCenter.y}%, ${stopsToCss(bg.overlayStops)})`;
                } else {
                    overlay.style.background = hexToRgba(bg.overlayColor, bg.overlayOpacity);
                }
            } else if (overlay) {
                overlay.remove();
            }
        });
    };

    // 优先使用已缓存 dataUrl
    if (bg.imageUrl) {
        apply(bg.imageUrl);
    } else if (bg.customImageId !== undefined && bg.customImageId !== null) {
        const cid = bg.customImageId;
        if (bgImageCache[cid]) {
            apply(bgImageCache[cid]);
        } else {
            // 异步取一次
            BGImageDB.getImageById(cid).then(item => {
                if (!item) return;
                bgImageCache[cid] = item.dataUrl;
                // 二次校验：只有在当前仍是该图片时才应用
                if (state.background.type === 'image'
                    && String(state.background.customImageId) === String(cid)) {
                    apply(item.dataUrl);
                }
            }).catch(() => {});
        }
    }
}

function stopsToCss(stops) {
  return (stops || []).map(s => {
    const rgba = hexToRgba(s.color, s.opacity);
    return `${rgba} ${(Number(s.pos) || 0) * 100}%`;
  }).join(', ');
}




function hexToRgba(hex, opacity) {
    if (!hex) return 'transparent';
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.substring(0, 2), 16) || 0;
    const g = parseInt(h.substring(2, 4), 16) || 0;
    const b = parseInt(h.substring(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/* ============================================================
   供 app.js 调用的统一入口（图片模式）
   ============================================================ */

// 被 app.js 的 applyBackgroundToCanvases 调用（见协作说明）
function applyBackgroundToCanvasesWithImage(bg) {
    if (bg.type === 'image') {
        // 用图片逻辑接管（不使用 backgroundToCss）
        const baseCss = '';
        document.querySelectorAll('.canvas-bg').forEach(el => {
            el.style.background = '';
        });
                applyImageBackgroundToCanvases(bg);
        // 清理旧 overlay（与新遮罩逻辑保持一致）
        document.querySelectorAll('.cover-canvas').forEach(canvasEl => {
            const overlay = canvasEl.querySelector('.canvas-bg-overlay');
            const bg2 = state.background;
            const hasOverlay =
                (bg2.overlayType === 'linear' || bg2.overlayType === 'radial')
                    ? Array.isArray(bg2.overlayStops) && bg2.overlayStops.length > 0
                    : (bg2.overlayColor && (bg2.overlayOpacity || 0) > 0);
            if (!hasOverlay && overlay) overlay.remove();
        });
        return true;
    }

    // 其它类型：清掉图片特有的 filter / transform / overlay
    document.querySelectorAll('.canvas-bg').forEach(el => {
        el.style.filter = '';
        el.style.transform = '';
        el.style.transformOrigin = '';
    });
    document.querySelectorAll('.canvas-bg-overlay').forEach(o => o.remove());
    return false;
}

/* ============================================================
   上传 & 应用入口
   ============================================================ */

function initBackgroundImageModule() {
    const dropzone = document.getElementById('bg-image-dropzone');
    const fileInput = document.getElementById('bg-image-file');
    const clearBtn = document.getElementById('bg-image-clear');

    // 1. 点击上传
    if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files || []);
            files.forEach(file => handleUploadBgImageFile(file));
            fileInput.value = '';
        });

        // 2. 拖拽上传（面板内的 dropzone）
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('dragover');
        });
        dropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
        });
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');
            const files = Array.from(e.dataTransfer.files || []);
            const img = files.find(f => f.type.startsWith('image/'));
            if (img) handleUploadBgImageFile(img);
        });
    }

    // 3. 全局拖拽到画布也支持（拖到 .cover-canvas 上时触发）
    document.addEventListener('dragover', (e) => {
        // 贴纸拖拽用的是 text/plain，这里只接文件
        const isFileDrag = e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
        if (!isFileDrag) return;
        const canvas = e.target.closest('.cover-canvas');
        if (canvas) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            canvas.classList.add('drop-target');
        }
    });
    document.addEventListener('dragleave', (e) => {
        const canvas = e.target.closest('.cover-canvas');
        if (canvas) canvas.classList.remove('drop-target');
    });
    document.addEventListener('drop', (e) => {
        const canvas = e.target.closest('.cover-canvas');
        if (!canvas) return;
        const isFileDrag = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0;
        if (!isFileDrag) return;
        const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
        if (!file) return;
        e.preventDefault();
        e.stopPropagation();
        canvas.classList.remove('drop-target');
        // 弹一个简单选择：作为背景 or 仅提取主色？
        // 为了不过度打扰用户，直接作为图片背景（用户随时可以点"从图片提取"切换）
        handleUploadBgImageFile(file, { applyAsBackground: true });
    });

    // 4. "恢复默认背景"
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            state.background = normalizeBackground({
                type: 'gradient',
                color1: '#ff2442',
                color2: '#2575fc',
                imageUrl: '',
                angle: 135,
                texture: 'none',
                presetId: null
            });
            applyBackgroundToCanvases(state.background);
            syncBgPanelInputs(state.background);
            state.saveState();
            showBgToast('已恢复默认背景');
        });
    }

    // 5. 控制面板事件
    bindImageControlEvents();

    // 6. 初次进入：如果有旧图片背景（customImageId）先缓存好
    BGImageDB.getAllImages().then(items => {
        items.forEach(it => { bgImageCache[it.id] = it.dataUrl; });
    }).catch(() => {});

    // 若当前 state.background 是 image 且带 customImageId，就把控制面板显示出来并同步
    syncImagePanelVisibility(state.background);
}

/* ============================================================
   上传文件处理
   ============================================================ */
function handleUploadBgImageFile(file, opts) {
    opts = opts || {};
    if (!file || !file.type.startsWith('image/')) {
        showBgToast('请上传图片文件（JPG/PNG/WEBP/GIF）');
        return;
    }
    // 大小提示（>8MB 依旧允许，给个提醒）
    if (file.size > 8 * 1024 * 1024) {
        showBgToast('图片较大（' + (file.size / 1024 / 1024).toFixed(1) + 'MB），可能稍慢');
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
        const dataUrl = evt.target.result;
        try {
            const id = await BGImageDB.addImage(file.name || '背景图片', dataUrl);
            bgImageCache[id] = dataUrl;
            pushBgImageRecentId(id);

            if (opts.applyAsBackground !== false) {
                applyUploadedImageAsBackground(id, dataUrl);
            }

            // 刷新"我的上传"网格
            if (typeof renderUploadedBgImages === 'function') {
                renderUploadedBgImages();
            }
            showBgToast('图片上传成功 ✓');
        } catch (err) {
            console.error('上传背景图片失败:', err);
            showBgToast('上传失败：' + err.message, 3000);
        }
    };
    reader.onerror = () => showBgToast('读取文件失败', 2600);
    reader.readAsDataURL(file);
}

/**
 * @param {string} id
 * @param {string} dataUrl
 * @param {object} [overrides={}] 整体覆盖对象。
 *        任何字段（包括 overlayStops 数组）都会整体替换默认值，
 *        而不是按元素合并。传 overlayStops 时请传完整数组。
 */
function applyUploadedImageAsBackground(id, dataUrl, overrides = {}) {
    state.background = normalizeBackground(Object.assign({
        type: 'image',
        imageUrl: dataUrl,
        customImageId: id,
        fit: 'cover',
        scale: 1,
        positionX: 50,
        positionY: 50,
        blur: 0,
        overlayType: 'solid',
        overlayColor: '#000000',
        overlayOpacity: 0,
        colorFilter: 'none'
    }, overrides));
    applyBackgroundToCanvases(state.background);
    syncBgPanelInputs(state.background);
    syncImagePanelVisibility(state.background);
    syncImageControlsToState();
    state.saveState();
}

/* ============================================================
   控制面板：绑定 + 同步
   ============================================================ */
function bindImageControlEvents() {
    const fit = document.getElementById('bg-img-fit');
    const scale = document.getElementById('bg-img-scale');
    const scaleVal = document.getElementById('bg-img-scale-val');
    const xRange = document.getElementById('bg-img-x');
    const xVal = document.getElementById('bg-img-x-val');
    const yRange = document.getElementById('bg-img-y');
    const yVal = document.getElementById('bg-img-y-val');
    const blur = document.getElementById('bg-img-blur');
    const blurVal = document.getElementById('bg-img-blur-val');
    const overlayColor = document.getElementById('bg-img-overlay-color');
    const overlayOpacity = document.getElementById('bg-img-overlay-opacity');
    const overlayOpacityVal = document.getElementById('bg-img-overlay-opacity-val');
    const clearOverlayBtn = document.getElementById('bg-img-clear-overlay');
    const smartBtn = document.getElementById('bg-img-smart-optimize');
    const anchorGrid = document.getElementById('bg-img-anchor-grid');

    const update = (mutator, withHistory) => {
        if (state.background.type !== 'image') return;
        mutator(state.background);
        applyBackgroundToCanvases(state.background);
        if (withHistory) state.saveState();
    };

    if (fit) fit.addEventListener('change', (e) => {
        update(bg => bg.fit = e.target.value, true);
    });

    if (scale) scale.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        if (scaleVal) scaleVal.textContent = v;
        update(bg => bg.scale = v / 100);
    });
    if (scale) scale.addEventListener('change', () => state.saveState());

    if (xRange) xRange.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        if (xVal) xVal.textContent = v;
        update(bg => bg.positionX = 50 + v);
    });
    if (xRange) xRange.addEventListener('change', () => state.saveState());

    if (yRange) yRange.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        if (yVal) yVal.textContent = v;
        update(bg => bg.positionY = 50 + v);
    });
    if (yRange) yRange.addEventListener('change', () => state.saveState());

    if (blur) blur.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        if (blurVal) blurVal.textContent = v;
        update(bg => bg.blur = v);
    });
    if (blur) blur.addEventListener('change', () => state.saveState());

    if (overlayColor) overlayColor.addEventListener('input', (e) => {
        update(bg => bg.overlayColor = e.target.value);
    });
    if (overlayColor) overlayColor.addEventListener('change', () => state.saveState());

    if (overlayOpacity) overlayOpacity.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        if (overlayOpacityVal) overlayOpacityVal.textContent = v;
        update(bg => bg.overlayOpacity = v / 100);
    });
    if (overlayOpacity) overlayOpacity.addEventListener('change', () => state.saveState());

    if (clearOverlayBtn) clearOverlayBtn.addEventListener('click', () => {
        update(bg => { bg.overlayColor = '#000000'; bg.overlayOpacity = 0; }, true);
        if (overlayOpacity) overlayOpacity.value = 0;
        if (overlayOpacityVal) overlayOpacityVal.textContent = 0;
    });

    // 九宫格锚点
    if (anchorGrid) {
        anchorGrid.querySelectorAll('div[data-pos]').forEach(cell => {
            cell.addEventListener('click', () => {
                anchorGrid.querySelectorAll('div[data-pos]').forEach(c => c.classList.remove('active'));
                cell.classList.add('active');
                const [h, v] = cell.dataset.pos.split(' ');
                const mapX = { left: 0, center: 50, right: 100 };
                const mapY = { top: 0, center: 50, bottom: 100 };
                update(bg => {
                    bg.positionX = mapX[h];
                    bg.positionY = mapY[v];
                }, true);
                // 同步偏移滑块
                if (xRange) xRange.value = 0;
                if (yRange) yRange.value = 0;
                if (xVal) xVal.textContent = 0;
                if (yVal) yVal.textContent = 0;
            });
        });
    }

    // 一键优化可读性
    if (smartBtn) smartBtn.addEventListener('click', () => {
        if (state.background.type !== 'image') {
            showBgToast('请先上传或选择一张图片背景');
            return;
        }
        update(bg => {
            bg.blur = Math.max(bg.blur || 0, 4);
            bg.overlayColor = '#000000';
            bg.overlayOpacity = 0.45;
        }, true);
        // 同步 UI
        const blurInput = document.getElementById('bg-img-blur');
        const blurValEl = document.getElementById('bg-img-blur-val');
        if (blurInput) blurInput.value = 4;
        if (blurValEl) blurValEl.textContent = 4;
        if (overlayOpacity) overlayOpacity.value = 45;
        if (overlayOpacityVal) overlayOpacityVal.textContent = 45;
        if (overlayColor) overlayColor.value = '#000000';
        showBgToast('已自动添加深色遮罩 + 轻微模糊 ✨');
    });
}

// 显示/隐藏图片控制面板
function syncImagePanelVisibility(bg) {
    const panel = document.getElementById('bg-image-controls-panel');
    if (!panel) return;
    panel.style.display = (bg && bg.type === 'image' && (bg.imageUrl || bg.customImageId)) ? 'block' : 'none';
}

// 用 state.background 反向同步到控制面板
function syncImageControlsToState() {
    const bg = state.background;
    if (!bg || bg.type !== 'image') return;

    const fit = document.getElementById('bg-img-fit');
    const scale = document.getElementById('bg-img-scale');
    const scaleVal = document.getElementById('bg-img-scale-val');
    const xRange = document.getElementById('bg-img-x');
    const xVal = document.getElementById('bg-img-x-val');
    const yRange = document.getElementById('bg-img-y');
    const yVal = document.getElementById('bg-img-y-val');
    const blur = document.getElementById('bg-img-blur');
    const blurVal = document.getElementById('bg-img-blur-val');
    const overlayColor = document.getElementById('bg-img-overlay-color');
    const overlayOpacity = document.getElementById('bg-img-overlay-opacity');
    const overlayOpacityVal = document.getElementById('bg-img-overlay-opacity-val');

    if (fit) fit.value = bg.fit || 'cover';
    if (scale) {
        const v = Math.round((bg.scale !== undefined ? bg.scale : 1) * 100);
        scale.value = v;
        if (scaleVal) scaleVal.textContent = v;
    }
    if (xRange) {
        const v = Math.round((bg.positionX !== undefined ? bg.positionX : 50) - 50);
        xRange.value = v;
        if (xVal) xVal.textContent = v;
    }
    if (yRange) {
        const v = Math.round((bg.positionY !== undefined ? bg.positionY : 50) - 50);
        yRange.value = v;
        if (yVal) yVal.textContent = v;
    }
    if (blur) {
        const v = bg.blur || 0;
        blur.value = v;
        if (blurVal) blurVal.textContent = v;
    }
    if (overlayColor) overlayColor.value = bg.overlayColor || '#000000';
    if (overlayOpacity) {
        const v = Math.round((bg.overlayOpacity || 0) * 100);
        overlayOpacity.value = v;
        if (overlayOpacityVal) overlayOpacityVal.textContent = v;
    }

    // 九宫格高亮
    const anchorGrid = document.getElementById('bg-img-anchor-grid');
    if (anchorGrid) {
        const px = bg.positionX !== undefined ? bg.positionX : 50;
        const py = bg.positionY !== undefined ? bg.positionY : 50;
        const h = px < 33 ? 'left' : (px > 67 ? 'right' : 'center');
        const v = py < 33 ? 'top' : (py > 67 ? 'bottom' : 'center');
        const targetPos = `${h} ${v}`;
        anchorGrid.querySelectorAll('div[data-pos]').forEach(cell => {
            cell.classList.toggle('active', cell.dataset.pos === targetPos);
        });
    }
}

// 把控制面板挂到 initBackgroundPanelV2 之后调用
document.addEventListener('DOMContentLoaded', () => {
    // 等 app.js 的 initBackgroundPanelV2 完成再初始化
    setTimeout(() => {
        initBackgroundImageModule();
    }, 0);
});

/* ============================================================
   扩展：让「我的收藏 / 最近使用」分类显示"我的上传"图片
   —— 通过 monkey-patch renderBgPresetGrid 的方式共存，不侵入 app.js
   ============================================================ */
async function renderUploadedBgImages() {
    // 装饰 renderBgPresetGrid，只在 cat === 'uploaded' 时展示
    // 但当前分类 Tab 里没有 'uploaded'，我们在 Tabs 里动态插入一个 "我的上传" 分类
    ensureUploadedTabExists();
    if (currentBgCategory === 'uploaded') {
        renderBgPresetGridWithUploads();
    }
}

function ensureUploadedTabExists() {
    const tabsEl = document.getElementById('bg-category-tabs');
    if (!tabsEl) return;
    if (tabsEl.querySelector('.bg-cat-tab[data-cat="uploaded"]')) return;

    const tab = document.createElement('div');
    tab.className = 'bg-cat-tab';
    tab.dataset.cat = 'uploaded';
    tab.textContent = '我的上传';
    tab.addEventListener('click', () => {
        tabsEl.querySelectorAll('.bg-cat-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentBgCategory = 'uploaded';
        renderBgPresetGridWithUploads();
    });
    tabsEl.appendChild(tab);
}

async function renderBgPresetGridWithUploads() {
    const grid = document.getElementById('bg-preset-grid');
    if (!grid) return;
    grid.innerHTML = '';

    let items = [];
    try { items = await BGImageDB.getAllImages(); } catch (e) { items = []; }
    items.forEach(it => { bgImageCache[it.id] = it.dataUrl; });
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'bg-preset-empty';
        empty.innerHTML = '还没有上传过图片<br><small style="color:#6e7681;">点击上方「高级自定义 → 点击或拖拽图片」上传</small>';
        grid.appendChild(empty);
        return;
    }

    const currentId = (state.background && state.background.customImageId) || null;

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'bg-preset-card is-uploaded';
        card.dataset.presetId = 'uploaded-' + item.id;
        if (String(item.id) === String(currentId)) card.classList.add('active');

        const swatch = document.createElement('div');
        swatch.className = 'bp-swatch';
        swatch.style.backgroundImage = `url(${item.dataUrl})`;
        card.appendChild(swatch);

        const label = document.createElement('div');
        label.className = 'bp-label';
        label.textContent = item.name || '背景图片';
        card.appendChild(label);

        const del = document.createElement('div');
        del.className = 'bp-star';
        del.style.background = '#f85149';
        del.style.color = '#fff';
        del.innerHTML = '×';
        del.title = '删除此图片';
        del.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm(`确定删除 "${item.name}" 吗？`)) return;
            try {
                await BGImageDB.deleteImage(item.id);
                delete bgImageCache[item.id];
                let recent = getBgImageRecentIds().filter(x => x !== item.id);
                saveBgImageRecentIds(recent);
                // 若当前正使用它，切回默认渐变
                if (String((state.background.customImageId || '')) === String(item.id)) {
                    state.background = normalizeBackground({
                        type: 'gradient', color1: '#ff2442', color2: '#2575fc',
                        imageUrl: '', angle: 135, texture: 'none', presetId: null
                    });
                    applyBackgroundToCanvases(state.background);
                    syncBgPanelInputs(state.background);
                    syncImagePanelVisibility(state.background);
                }
                renderBgPresetGridWithUploads();
                showBgToast('已删除');
            } catch (err) {
                showBgToast('删除失败：' + err.message);
            }
        });
        card.appendChild(del);

        card.addEventListener('click', () => {
            applyUploadedImageAsBackground(item.id, item.dataUrl);
            pushBgImageRecentId(item.id);
        });

        grid.appendChild(card);
    });
}

// 让 app.js 的 renderBgPresetGrid 也能正确处理 'uploaded' 分类
// （在 app.js 里它调用的 getPresetsByCategory('uploaded') 会返回空数组，
//  所以我们在切分类时直接拦截：见下面 patch）
(function patchCategorySwitching() {
    document.addEventListener('DOMContentLoaded', () => {
        const orig = window.renderBgPresetGrid;
        // 不覆写原函数，只是额外观察：每次点击分类后如果是 uploaded，重新渲染
        const tabsEl = document.getElementById('bg-category-tabs');
        if (!tabsEl) return;
        tabsEl.addEventListener('click', (e) => {
            const tab = e.target.closest('.bg-cat-tab');
            if (!tab) return;
            if (tab.dataset.cat === 'uploaded') {
                setTimeout(() => renderBgPresetGridWithUploads(), 0);
            }
        });
    });
})();

window.applyImageBackgroundToCanvases = applyImageBackgroundToCanvases;
window.applyBackgroundToCanvasesWithImage = applyBackgroundToCanvasesWithImage;
window.syncImagePanelVisibility = syncImagePanelVisibility;
window.syncImageControlsToState = syncImageControlsToState;
window.renderUploadedBgImages = renderUploadedBgImages;