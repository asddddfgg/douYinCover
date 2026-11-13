// ============================================================
// backdrop-panel.js — 底衬面板 + 形状导入（P1：从 text-layers.js 迁出）
// 职责边界：
//   ✅ 负责：底衬面板 UI（setupBackdropPanel）、预设网格渲染、
//            自定义底衬上传/删除、底衬格式查看弹窗、
//            形状批量导入（SVG/JSON）
//   ❌ 不负责：底衬在画布上的实际渲染（在 app.js 的 createBackdropElement）
//   ❌ 不负责：底衬纹理生成（在 backdrop-textures.js）
//   ❌ 不负责：底衬 IndexedDB 存取（在 db.js 的 BackdropDB）
// 依赖：state / BACKDROP_PRESETS（text-layers.js 声明）/ BackdropDB /
//       BackdropTextures / AssetRegistry
// 被依赖：app.js（initTextLayersModule → setupBackdropPanel）
// 加载顺序：必须晚于 text-layers.js（本文件函数声明覆盖 text-layers.js 同名旧声明）
//          必须晚于 app.js
// ============================================================

window.__BACKDROP_PANEL_READY__ = true;
console.log('[BackdropPanel] P1 骨架就位，等待函数体迁移');

// ⚠️ 不重复声明以下全局数据（由 text-layers.js 声明，本文件读全局）：
//    BACKDROP_PRESETS / currentBackdropCategory / backdropCache
//    SHAPE_FORMAT / SHAPE_MASK_SIZE / SVG_ALLOWED_TAGS / SVG_ALLOWED_ATTRS

// 底衬颜色属于品牌约束：新建底衬时不再写死 #fff8dc / #d2b48c，改取品牌角色色
function _brandBackdropColor(type, layer) {
    try {
        if (window.BackdropBrand && BackdropBrand.defaultColor) return BackdropBrand.defaultColor(type, layer);
    } catch (e) { }
    return null;
}

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
            layer.backdrop = { type: 'none', color: _brandBackdropColor('none', layer), opacity: 1, padding: 12, rotate: 0 };
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
            layer.backdrop = { color: _brandBackdropColor(preset.type, layer), opacity: 1, padding: 12, rotate: 0 };
        }
        layer.backdrop.type = preset.type;
        if (preset.type === 'custom') return;

        if (!layer.backdrop.color) {
            layer.backdrop.color = _brandBackdropColor(preset.type, layer);
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
                } catch (err) {
                    if (window.Utils && Utils.log) Utils.log.warn('[BackdropPanel] 删除底衬时清理资产失败', item && item.id, err);
                }
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
                    layer.backdrop = { color: _brandBackdropColor('custom', layer), opacity: 1, padding: 12, rotate: 0 };
                }
                layer.backdrop.type = 'custom';
                layer.backdrop.customId = item.id;
                layer.backdrop.sizeMode = layer.backdrop.sizeMode || 'cover';
                if (item.isMask) {
                    layer.backdrop.isMask = true;
                    if (!layer.backdrop.color) {
                        layer.backdrop.color = _brandBackdropColor('custom', layer) || '#FFFFFF';
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

console.log('[BackdropPanel] 第1批已接管：setupBackdropPanel / renderBackdropGrid / createBackdropCard / renderCustomBackdropGrid');

// ============================================================
// 第2批：上传 / 缓存 / 同步 / 格式弹窗 / 形状导入
// ============================================================

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
            } catch (e) {
                if (window.Utils && Utils.log) Utils.log.warn('[BackdropPanel] 写底衬 asset 映射失败', file.name, e);
            }
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
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[BackdropPanel] 刷新自定义底衬缓存失败', e);
    }
}

function syncBackdropPanelToLayer(layer) {
    if (!layer || layer.type !== 'text') return;
    const bd = layer.backdrop || { type: 'none', color: _brandBackdropColor('none', layer), opacity: 1, padding: 12, rotate: 0 };

    const colorInput = document.getElementById('backdrop-color');
    const padInput = document.getElementById('backdrop-padding');
    const padVal = document.getElementById('backdrop-pad-val');
    const rotInput = document.getElementById('backdrop-rotate');
    const rotVal = document.getElementById('backdrop-rot-val');
    const opInput = document.getElementById('backdrop-opacity');
    const opVal = document.getElementById('backdrop-opacity-val');

    if (colorInput) colorInput.value = bd.color || _brandBackdropColor(bd.type, layer) || '#FFFFFF';
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

    const sampleJson = `{
  "type": "kraft",
  "color": "#d2b48c",
  "opacity": 0.95,
  "padding": 16,
  "rotate": -1.5
}`;
    const sampleCustomJson = `{
  "type": "custom",
  "customId": 3,
  "sizeMode": "cover",
  "opacity": 0.9,
  "padding": 14,
  "rotate": -2,
  "overlayColor": "#000000"
}`;

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
            Utils.clipboard.copy(text);
            btn.innerHTML = '<i class="fa-solid fa-check"></i> 已复制';
            setTimeout(() => { btn.innerHTML = '<i class="fa-solid fa-copy"></i> 复制'; }, 1200);
        });
    });
    const copyCurrentBtn = box.querySelector('[data-copy-current]');
    if (copyCurrentBtn) {
        copyCurrentBtn.addEventListener('click', () => {
            Utils.clipboard.copy(currentJson);
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

// ✅ P0-1：复制能力已收口到 Utils.clipboard.copy，本文件不再保留同名薄别名
//    内部调用点直接写 Utils.clipboard.copy（见 showBackdropFormatModal）

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
                } catch (e) {
                    if (window.Utils && Utils.log) Utils.log.warn('[BackdropPanel] 写形状蒙版 asset 映射失败', s.name, e);
                }
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

console.log('[BackdropPanel] ✅ 全部接管完成：底衬面板 + 上传 + 同步 + 格式弹窗 + 形状导入');

// ============================================================
// P1-2 步骤 2.4c：backdrop-panel.js 收口到 window.ASSET
// ============================================================
(function exposeBackdropPanelNamespace() {
    if (!window.ASSET) {
        console.warn('[ASSET] namespaces.js 未加载，跳过收口');
        return;
    }
    ASSET.setupBackdropPanel = setupBackdropPanel;
    ASSET.renderBackdropGrid = renderBackdropGrid;
    ASSET.uploadBackdropImage = uploadBackdropImage;
    ASSET.refreshCustomBackdropCache = refreshCustomBackdropCache;
    ASSET.syncBackdropPanelToLayer = syncBackdropPanelToLayer;
    ASSET.showBackdropFormatModal = showBackdropFormatModal;
    ASSET.setupBackdropImport = setupBackdropImport;
    console.log('[ASSET] ✅ backdrop-panel.js 已收口到 window.ASSET（' +
        Object.keys(ASSET).length + ' 个函数）');
})();