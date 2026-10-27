// ============================================================
// brand-manager.js — 本地品牌资产包（Brand Kit）完整版
// 依赖：window.AssetRegistry / window.DouyinCover.addStickerToCanvas
//      window.state / window.renderCanvas / window.renderAll
// 持久化：localStorage（元数据） + AssetRegistry/IndexedDB（字体/Logo 二进制）
// 存储结构：
//   { palettes: [{ id, name, colors: [...] }], activePaletteId,
//     fonts: [{ name, assetId }], logos: [{ id, name, dataUrl }],
//     strictMode: bool }
// 兼容旧版本 v1（colors 数组）自动迁移为默认色板
// ============================================================

const BrandManager = {
    STORAGE_KEY: 'douyin_brand_kit_v2',
    LEGACY_KEY: 'douyin_brand_kit_v1',
    TEMPLATE_STORAGE_KEY: 'douyin_brand_templates_v1',

    data: {
        palettes: [{ id: 'palette-default', name: '主品牌色', colors: ['#FF0050', '#00F2FE', '#111111', '#FFFFFF'] }],
        activePaletteId: 'palette-default',
        fonts: [],
        logos: [],
        strictMode: false
    },

    templates: [],

    init() {
        this.load();
        this.loadTemplates();
        this.bindEvents();
        this.render();
        this.applyStrictModeToUI();
        setTimeout(() => {
            this.injectBrandColorsToControls();
            this.injectBrandFontsToSelect();
            this.applyStrictModeToUI();
        }, 300);
    },

    // ===== 持久化 =====
    load() {
        try {
            const rawV2 = localStorage.getItem(this.STORAGE_KEY);
            if (rawV2) {
                const saved = JSON.parse(rawV2);
                if (saved && typeof saved === 'object') {
                    this.data = {
                        palettes: Array.isArray(saved.palettes) && saved.palettes.length
                            ? saved.palettes
                            : this.data.palettes,
                        activePaletteId: saved.activePaletteId || this.data.palettes[0].id,
                        fonts: Array.isArray(saved.fonts) ? saved.fonts : [],
                        logos: Array.isArray(saved.logos) ? saved.logos : [],
                        strictMode: !!saved.strictMode
                    };
                    // 颜色结构迁移：string → { hex, label }
                    this.data.palettes.forEach(p => {
                        if (!Array.isArray(p.colors)) p.colors = [];
                        p.colors = p.colors.map(c => this.normalizeColorItem(c)).filter(Boolean);
                    });
                    return;
                }
            }
            const rawV1 = localStorage.getItem(this.LEGACY_KEY);
            if (rawV1) {
                const saved = JSON.parse(rawV1);
                if (saved && Array.isArray(saved.colors) && saved.colors.length) {
                    this.data.palettes = [{
                        id: 'palette-default',
                        name: '主品牌色',
                        colors: saved.colors.map(c => this.normalizeColorItem(c)).filter(Boolean)
                    }];
                    this.data.activePaletteId = 'palette-default';
                    this.data.fonts = Array.isArray(saved.fonts) ? saved.fonts : [];
                    this.data.logos = Array.isArray(saved.logos) ? saved.logos : [];
                }
            }
        } catch (e) {
            console.warn('[Brand] 加载品牌配置失败', e);
        }
    },

    save() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
            try { localStorage.removeItem(this.LEGACY_KEY); } catch (e) {}
        } catch (e) {
            console.warn('[Brand] 保存品牌配置失败', e);
        }
    },

    loadTemplates() {
        try {
            const raw = localStorage.getItem(this.TEMPLATE_STORAGE_KEY);
            this.templates = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(this.templates)) this.templates = [];
        } catch (e) {
            this.templates = [];
        }
    },

    saveTemplates() {
        try {
            localStorage.setItem(this.TEMPLATE_STORAGE_KEY, JSON.stringify(this.templates));
        } catch (e) {
            console.warn('[Brand] 模板保存失败', e);
            if (typeof showBgToast === 'function') showBgToast('模板保存失败：存储空间不足，请删除旧模板');
        }
    },

    // ===== 色板工具 =====
    getActivePalette() {
        return this.data.palettes.find(p => p.id === this.data.activePaletteId)
            || this.data.palettes[0];
    },

    getAllColors() {
        const set = new Set();
        this.data.palettes.forEach(p => (p.colors || []).forEach(c => {
            const hex = (typeof c === 'string') ? c : (c && c.hex);
            if (hex) set.add(hex);
        }));
        return Array.from(set);
    },

    // 把颜色项统一成 { hex, label } 对象
    normalizeColorItem(item) {
        if (!item) return null;
        if (typeof item === 'string') return { hex: this.normalizeHex(item), label: '' };
        if (typeof item === 'object' && item.hex) return { hex: this.normalizeHex(item.hex), label: item.label || '' };
        return null;
    },

    // 拿到色块显示文案（label 优先，否则 HEX）
    getColorDisplayName(item) {
        if (!item) return '';
        if (typeof item === 'string') return item;
        return item.label || item.hex || '';
    },

    // 查找色板中指定颜色的索引
    findColorIndex(palette, hex) {
        if (!palette || !palette.colors) return -1;
        const target = this.normalizeHex(hex);
        return palette.colors.findIndex(c => {
            const item = this.normalizeColorItem(c);
            return item && item.hex === target;
        });
    },

    // ===== 事件绑定 =====
    bindEvents() {
        // Tab 切换
        document.querySelectorAll('#brand-panel .brand-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#brand-panel .brand-tab').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('#brand-panel .brand-tab-content').forEach(c => c.style.display = 'none');
                btn.classList.add('active');
                const target = document.getElementById(btn.dataset.brandTab);
                if (target) target.style.display = 'block';
            });
        });

        // 严格模式
        const strictCb = document.getElementById('brand-strict-mode');
        if (strictCb) {
            strictCb.checked = !!this.data.strictMode;
            strictCb.addEventListener('change', () => {
                this.data.strictMode = !!strictCb.checked;
                this.save();
                this.applyStrictModeToUI();
                if (typeof showBgToast === 'function') {
                    showBgToast(strictCb.checked ? '严格模式：仅允许品牌色/字体' : '严格模式已关闭');
                }
            });
        }

        // 色板下拉切换
        const paletteSelect = document.getElementById('brand-palette-select');
        if (paletteSelect) {
            paletteSelect.addEventListener('change', () => {
                this.data.activePaletteId = paletteSelect.value;
                this.save();
                this.render();
                this.injectBrandColorsToControls();
            });
        }

        // 新建色板
        const btnAddPalette = document.getElementById('btn-add-palette');
        if (btnAddPalette) {
            btnAddPalette.addEventListener('click', () => {
                const name = prompt('新色板名称：', '新色板 ' + (this.data.palettes.length + 1));
                if (!name || !name.trim()) return;
                const id = 'palette-' + Date.now();
                this.data.palettes.push({ id, name: name.trim(), colors: [] });
                this.data.activePaletteId = id;
                this.save();
                this.render();
                this.injectBrandColorsToControls();
            });
        }

        // 重命名色板
        const btnRenamePalette = document.getElementById('btn-rename-palette');
        if (btnRenamePalette) {
            btnRenamePalette.addEventListener('click', () => {
                const p = this.getActivePalette();
                if (!p) return;
                const name = prompt('新的色板名称：', p.name);
                if (!name || !name.trim()) return;
                p.name = name.trim();
                this.save();
                this.render();
            });
        }

        // 删除色板
        const btnDelPalette = document.getElementById('btn-del-palette');
        if (btnDelPalette) {
            btnDelPalette.addEventListener('click', () => {
                if (this.data.palettes.length <= 1) {
                    alert('至少保留一个色板');
                    return;
                }
                const p = this.getActivePalette();
                if (!p) return;
                if (!confirm('删除色板「' + p.name + '」？')) return;
                this.data.palettes = this.data.palettes.filter(x => x.id !== p.id);
                this.data.activePaletteId = this.data.palettes[0].id;
                this.save();
                this.render();
                this.injectBrandColorsToControls();
            });
        }

        // 手动添加颜色（支持粘贴 HEX + 取色器）
        const btnAddManual = document.getElementById('btn-add-manual-color');
        if (btnAddManual) {
            btnAddManual.addEventListener('click', () => this.openAddColorModal());
        }

        // 收藏当前选中颜色
        const btnAddColor = document.getElementById('btn-add-current-color');
        if (btnAddColor) {
            btnAddColor.addEventListener('click', () => {
                const palette = this.getActivePalette();
                if (!palette) return;
                const layer = (window.state && state.getSelectedLayer) ? state.getSelectedLayer() : null;
                let color = null;
                if (layer && (layer.type === 'text' || layer.type === 'draw')) color = layer.color;
                if (!color) {
                    const tb = document.getElementById('tb-color');
                    if (tb && /^#[0-9a-fA-F]{6}$/.test(tb.value)) color = tb.value;
                }
                if (!color) {
                    if (typeof showBgToast === 'function') showBgToast('未取到可用颜色，请先选中一个图层');
                    return;
                }
                color = this.normalizeHex(color);
                if (this.findColorIndex(palette, color) >= 0) {
                    if (typeof showBgToast === 'function') showBgToast('该颜色已在当前色板中');
                    return;
                }
                palette.colors.push({ hex: color, label: '' });
                this.save();
                this.render();
                this.injectBrandColorsToControls();
                if (typeof showBgToast === 'function') showBgToast('已加入色板：' + color);
            });
        }

        // 上传品牌字体
        const fontInput = document.getElementById('input-brand-font');
        const btnFont = document.getElementById('btn-upload-brand-font');
        if (btnFont && fontInput) {
            btnFont.addEventListener('click', () => fontInput.click());
            fontInput.addEventListener('change', async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                const lower = file.name.toLowerCase();
                if (!/\.(ttf|otf|woff2?)$/.test(lower)) {
                    alert('请上传 .ttf / .otf / .woff / .woff2 字体文件');
                    fontInput.value = '';
                    return;
                }
                const fontName = file.name.replace(/\.[^/.]+$/, '');
                try {
                    const fontDataUrl = await this.readFileAsDataURL(file);

                    // 1) 验证
                    let pendingFontFace = null;
                    try {
                        const res = await fetch(fontDataUrl);
                        const buffer = await res.arrayBuffer();
                        pendingFontFace = new FontFace(fontName, buffer);
                        await pendingFontFace.load();
                    } catch (err) {
                        alert('字体文件无法解析，请确认格式正确');
                        return;
                    }

                    // 2) 清旧 IndexedDB 资产
                    const oldEntry = this.data.fonts.find(f => f.name === fontName);
                    if (oldEntry && oldEntry.assetId && window.AssetRegistry && AssetRegistry.remove) {
                        try { await AssetRegistry.remove(oldEntry.assetId); } catch (err) {}
                    }

                    // 3) 清旧 FontFace
                    if (document.fonts && document.fonts.forEach) {
                        const toDelete = [];
                        document.fonts.forEach(face => {
                            const fam = (face.family || '').replace(/^["']|["']$/g, '');
                            if (fam === fontName) toDelete.push(face);
                        });
                        toDelete.forEach(face => { try { document.fonts.delete(face); } catch (err) {} });
                    }

                    // 4) 加入浏览器
                    try { document.fonts.add(pendingFontFace); } catch (err) {}
                    window.__loadedCustomFonts = window.__loadedCustomFonts || {};
                    window.__loadedCustomFonts[fontName] = true;

                    // 5) 写 AssetRegistry
                    let assetId = '';
                    if (window.AssetRegistry && AssetRegistry.register) {
                        try {
                            assetId = await AssetRegistry.register({
                                name: fontName,
                                data: fontDataUrl,
                                type: 'font',
                                tags: ['font', 'brand'],
                                source: 'user'
                            });
                        } catch (err) {}
                    }

                    // 6) 去重 + 保存
                    this.data.fonts = this.data.fonts.filter(f => f.name !== fontName);
                    this.data.fonts.push({ name: fontName, assetId });
                    this.save();
                    this.render();
                    this.injectBrandFontsToSelect();

                    // 7) 自动套用到当前选中文字图层
                    const layer = (window.state && state.getSelectedLayer) ? state.getSelectedLayer() : null;
                    if (layer && layer.type === 'text') {
                        layer.fontFamily = fontName;
                        if (typeof state.saveState === 'function') state.saveState();
                        if (typeof renderCanvas === 'function') renderCanvas();
                        if (typeof updateTopToolbarUI === 'function') updateTopToolbarUI(layer);
                    }

                    if (typeof showBgToast === 'function') showBgToast('品牌字体已添加并应用：' + fontName);
                } catch (err) {
                    alert('字体上传失败：' + (err && err.message ? err.message : '未知错误'));
                } finally {
                    fontInput.value = '';
                }
            });
        }

        // 上传 Logo
        const logoInput = document.getElementById('input-brand-logo');
        const btnLogo = document.getElementById('btn-upload-brand-logo');
        if (btnLogo && logoInput) {
            btnLogo.addEventListener('click', () => logoInput.click());
            logoInput.addEventListener('change', async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                if (!file.type || !file.type.startsWith('image/')) {
                    alert('请上传图片文件作为 Logo');
                    logoInput.value = '';
                    return;
                }
                try {
                    const dataUrl = await this.readFileAsDataURL(file);
                    let assetId = 'brand-logo-' + Date.now();
                    if (window.AssetRegistry && AssetRegistry.register) {
                        try {
                            assetId = await AssetRegistry.register({
                                name: file.name,
                                data: dataUrl,
                                type: 'image',
                                tags: ['brand', 'logo'],
                                source: 'user'
                            });
                        } catch (err) {}
                    }
                    this.data.logos.push({ id: assetId, name: file.name, dataUrl });
                    this.save();
                    this.render();
                    if (typeof showBgToast === 'function') showBgToast('品牌 Logo 已添加');
                } catch (err) {
                    alert('Logo 上传失败：' + (err && err.message ? err.message : '未知错误'));
                } finally {
                    logoInput.value = '';
                }
            });
        }

        // 导出品牌包
        const btnExport = document.getElementById('btn-export-brand');
        if (btnExport) {
            btnExport.addEventListener('click', () => {
                try {
                    const payload = {
                        format: 'douyin-brand-kit',
                        version: 2,
                        exportedAt: new Date().toISOString(),
                        data: this.data
                    };
                    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'brand-kit-' + Date.now() + '.json';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                    if (typeof showBgToast === 'function') showBgToast('品牌包已导出');
                } catch (err) {
                    alert('导出失败：' + err.message);
                }
            });
        }

        // 导入品牌包
        const btnImport = document.getElementById('btn-import-brand');
        if (btnImport) {
            btnImport.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json,application/json';
                input.style.display = 'none';
                input.addEventListener('change', async () => {
                    const file = input.files && input.files[0];
                    if (!file) return;
                    try {
                        const text = await file.text();
                        const payload = JSON.parse(text);
                        await this.importBrandPayload(payload);
                    } catch (err) {
                        alert('导入失败：' + (err && err.message ? err.message : '未知错误'));
                    } finally {
                        input.remove();
                    }
                });
                document.body.appendChild(input);
                input.click();
            });
        }

        // 保存模板
        const btnSaveTemplate = document.getElementById('btn-save-template');
        if (btnSaveTemplate) {
            btnSaveTemplate.addEventListener('click', () => this.saveCurrentPageAsTemplate());
        }
    },

    // ===== 导入品牌包 =====
    async importBrandPayload(payload) {
        if (!payload || typeof payload !== 'object') throw new Error('文件格式错误');
        const data = payload.data || payload;
        if (!data || typeof data !== 'object') throw new Error('缺少 data 字段');

        let palettes = Array.isArray(data.palettes) ? data.palettes : null;
        if (!palettes && Array.isArray(data.colors)) {
            palettes = [{
                id: 'palette-imported-' + Date.now(),
                name: '导入色板',
                colors: data.colors.map(c => this.normalizeHex(c))
            }];
        }
        if (palettes && palettes.length) {
            palettes.forEach(p => {
                if (!p || !Array.isArray(p.colors)) return;
                const id = p.id || 'palette-imported-' + Date.now();
                const exist = this.data.palettes.find(x => x.id === id || x.name === p.name);
                if (exist) {
                    const existingHexes = new Set(exist.colors.map(c => {
                        const n = this.normalizeColorItem(c);
                        return n ? n.hex : '';
                    }));
                    p.colors.forEach(c => {
                        const item = this.normalizeColorItem(c);
                        if (item && !existingHexes.has(item.hex)) {
                            exist.colors.push(item);
                            existingHexes.add(item.hex);
                        }
                    });
                } else {
                    this.data.palettes.push({
                        id,
                        name: p.name || '导入色板',
                        colors: p.colors.map(c => this.normalizeColorItem(c)).filter(Boolean)
                    });
                }
            });
        }

        if (Array.isArray(data.fonts)) {
            for (const f of data.fonts) {
                if (!f || !f.name) continue;
                const exist = this.data.fonts.find(x => x.name === f.name);
                if (exist) continue;
                if (f.data && window.AssetRegistry && AssetRegistry.register) {
                    try {
                        const assetId = await AssetRegistry.register({
                            name: f.name,
                            data: f.data,
                            type: 'font',
                            tags: ['font', 'brand'],
                            source: 'user'
                        });
                        try {
                            const res = await fetch(f.data);
                            const buffer = await res.arrayBuffer();
                            const ff = new FontFace(f.name, buffer);
                            await ff.load();
                            document.fonts.add(ff);
                            window.__loadedCustomFonts = window.__loadedCustomFonts || {};
                            window.__loadedCustomFonts[f.name] = true;
                        } catch (e) {}
                        this.data.fonts.push({ name: f.name, assetId });
                    } catch (err) {}
                } else {
                    this.data.fonts.push({ name: f.name, assetId: f.assetId || '' });
                }
            }
        }

        if (Array.isArray(data.logos)) {
            for (const l of data.logos) {
                if (!l || !l.dataUrl) continue;
                const exist = this.data.logos.find(x => x.name === l.name);
                if (exist) continue;
                let assetId = l.id || 'brand-logo-' + Date.now();
                if (window.AssetRegistry && AssetRegistry.register) {
                    try {
                        assetId = await AssetRegistry.register({
                            name: l.name || 'brand-logo',
                            data: l.dataUrl,
                            type: 'image',
                            tags: ['brand', 'logo'],
                            source: 'user'
                        });
                    } catch (err) {}
                }
                this.data.logos.push({ id: assetId, name: l.name || 'brand-logo', dataUrl: l.dataUrl });
            }
        }

        if (typeof data.strictMode === 'boolean') {
            this.data.strictMode = data.strictMode;
            const cb = document.getElementById('brand-strict-mode');
            if (cb) cb.checked = data.strictMode;
        }

        this.save();
        this.render();
        this.injectBrandColorsToControls();
        this.injectBrandFontsToSelect();
        this.applyStrictModeToUI();
        if (typeof showBgToast === 'function') showBgToast('品牌包已导入');
    },

    // ===== 模板 =====
    saveCurrentPageAsTemplate() {
        if (!window.state || !state.pages || !state.currentPageId) {
            if (typeof showBgToast === 'function') showBgToast('无法获取当前页面');
            return;
        }
        const page = state.pages.find(p => p.id === state.currentPageId);
        if (!page) return;
        const name = prompt('模板名称：', '模板 ' + (this.templates.length + 1));
        if (!name || !name.trim()) return;

        const pageData = JSON.parse(JSON.stringify(page));
        delete pageData.id;
        delete pageData.title;
        pageData.layers.forEach(l => { delete l.id; });

        const tpl = {
            id: 'tpl-' + Date.now(),
            name: name.trim(),
            createdAt: Date.now(),
            background: JSON.parse(JSON.stringify(state.background || {})),
            page: pageData
        };
        this.templates.push(tpl);
        this.saveTemplates();
        this.render();
        if (typeof showBgToast === 'function') showBgToast('已保存模板：' + tpl.name);
    },

    applyTemplate(tplId) {
        const tpl = this.templates.find(t => t.id === tplId);
        if (!tpl) return;
        if (!window.state || !state.addPage) return;

        state.addPage();
        const newPage = state.pages[state.pages.length - 1];
        const newPageId = newPage.id;

        if (tpl.background) {
            try {
                state.background = JSON.parse(JSON.stringify(tpl.background));
                if (typeof applyBackgroundToCanvases === 'function') applyBackgroundToCanvases(state.background);
            } catch (e) {}
        }

        const newLayers = (tpl.page.layers || []).map(src => {
            const layer = JSON.parse(JSON.stringify(src));
            const newId = (src.type || 'layer') + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
            layer.id = newId;
            return layer;
        });
        newLayers.forEach(l => {
            if (l.groupId) {
                l.groupId = 'group-tpl-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
            }
        });

        newPage.layers = newLayers;
        newPage.title = tpl.name;

        state.currentPageId = newPageId;
        state.selectedLayerId = newLayers[0] ? newLayers[0].id : null;
        if (state.selectedLayerIds) {
            state.selectedLayerIds = state.selectedLayerId ? [state.selectedLayerId] : [];
        }
        state.editingLayerId = null;
        if (typeof state.saveState === 'function') state.saveState();
        if (typeof renderAll === 'function') renderAll();
        else {
            if (typeof renderCanvas === 'function') renderCanvas();
            if (typeof renderLayerList === 'function') renderLayerList();
            if (typeof renderPageList === 'function') renderPageList();
        }
        if (typeof showBgToast === 'function') showBgToast('已应用模板：' + tpl.name);
    },

    deleteTemplate(tplId) {
        const tpl = this.templates.find(t => t.id === tplId);
        if (!tpl) return;
        if (!confirm('删除模板「' + tpl.name + '」？')) return;
        this.templates = this.templates.filter(t => t.id !== tplId);
        this.saveTemplates();
        this.render();
        if (typeof showBgToast === 'function') showBgToast('已删除模板');
    },

    // ===== 渲染 =====
    render() {
        this.renderPalettes();
        this.renderColors();
        this.renderFonts();
        this.renderLogos();
        this.renderTemplates();
    },

    renderPalettes() {
        const sel = document.getElementById('brand-palette-select');
        if (!sel) return;
        sel.innerHTML = '';
        this.data.palettes.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name + ' (' + p.colors.length + ')';
            sel.appendChild(opt);
        });
        try { sel.value = this.data.activePaletteId; } catch (e) {}
    },

    renderColors() {
        const colorList = document.getElementById('brand-color-list');
        if (!colorList) return;
        colorList.innerHTML = '';
        const palette = this.getActivePalette();
        const colors = palette ? (palette.colors || []) : [];

        if (!colors.length) {
            colorList.innerHTML = '<div style="font-size:11px;color:#6e7681;">当前色板为空</div>';
            return;
        }

        colors.forEach(raw => {
            const item = this.normalizeColorItem(raw);
            if (!item) return;
            const hex = item.hex;
            const label = item.label || '';

            const sw = document.createElement('div');
            sw.className = 'brand-color-swatch';
            sw.style.background = hex;
            sw.dataset.hex = hex;
            sw.title = (label ? label + ' ' : '') + hex + '  ·  点击应用文字色 / Shift+点击应用背景色 / 右键更多';

            sw.addEventListener('click', (e) => {
                e.preventDefault();
                const target = e.shiftKey ? 'bg' : 'text';
                this.applyColorToSelected(hex, target);
            });
            sw.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openColorSwatchMenu(e, palette, hex);
            });
            colorList.appendChild(sw);
        });
    },

    // 色块右键菜单：重命名 / 删除
    openColorSwatchMenu(e, palette, hex) {
        if (!palette) return;
        const oldMenu = document.getElementById('brand-color-swatch-menu');
        if (oldMenu) oldMenu.remove();

        const menu = document.createElement('div');
        menu.id = 'brand-color-swatch-menu';
        menu.className = 'context-menu';
        menu.style.cssText = 'position:fixed; display:block; z-index:99999; width:180px;';
        menu.innerHTML = '<ul>' +
            '<li id="bcs-rename"><i class="fa-solid fa-pen"></i> 重命名颜色</li>' +
            '<li id="bcs-apply-bg"><i class="fa-solid fa-fill-drip"></i> 应用到背景色</li>' +
            '<li class="divider"></li>' +
            '<li id="bcs-delete" class="danger"><i class="fa-solid fa-trash"></i> 从色板移除</li>' +
            '</ul>';
        document.body.appendChild(menu);

        const rect = menu.getBoundingClientRect();
        let x = e.clientX;
        let y = e.clientY;
        if (x + rect.width > window.innerWidth - 8) x = window.innerWidth - rect.width - 8;
        if (y + rect.height > window.innerHeight - 8) y = window.innerHeight - rect.height - 8;
        if (x < 8) x = 8;
        if (y < 8) y = 8;
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        const close = () => menu.remove();
        setTimeout(() => {
            document.addEventListener('mousedown', function onDoc(ev) {
                if (!menu.contains(ev.target)) {
                    close();
                    document.removeEventListener('mousedown', onDoc, true);
                }
            }, true);
        }, 0);

        const item = this.normalizeColorItem(palette.colors.find(c => {
            const n = this.normalizeColorItem(c);
            return n && n.hex === hex;
        }));

        menu.querySelector('#bcs-rename').addEventListener('click', () => {
            close();
            const cur = item ? (item.label || '') : '';
            const name = prompt('颜色名称（留空则只显示 HEX）：', cur);
            if (name === null) return;
            const idx = this.findColorIndex(palette, hex);
            if (idx < 0) return;
            const obj = this.normalizeColorItem(palette.colors[idx]);
            obj.label = name.trim();
            palette.colors[idx] = obj;
            this.save();
            this.render();
            this.injectBrandColorsToControls();
            if (typeof showBgToast === 'function') showBgToast(name.trim() ? '已重命名为「' + name.trim() + '」' : '已清除颜色名称');
        });

        menu.querySelector('#bcs-apply-bg').addEventListener('click', () => {
            close();
            this.applyColorToSelected(hex, 'bg');
        });

        menu.querySelector('#bcs-delete').addEventListener('click', () => {
            close();
            if (!confirm('从当前色板移除 ' + hex + ' ？')) return;
            palette.colors = palette.colors.filter(c => {
                const n = this.normalizeColorItem(c);
                return !n || n.hex !== hex;
            });
            this.save();
            this.render();
            this.injectBrandColorsToControls();
        });
    },

    renderFonts() {
        const fontList = document.getElementById('brand-font-list');
        if (!fontList) return;
        fontList.innerHTML = '';
        if (!this.data.fonts.length) {
            fontList.textContent = '暂无品牌字体';
            return;
        }
        this.data.fonts.forEach(f => {
            const row = document.createElement('div');
            row.className = 'brand-font-row';
            const name = document.createElement('span');
            name.textContent = '🏷️ ' + f.name;
            name.style.cssText = 'flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
            const del = document.createElement('button');
            del.className = 'btn';
            del.style.cssText = 'padding:1px 6px; font-size:10px;';
            del.innerHTML = '&times;';
            del.title = '移除品牌字体';
            del.addEventListener('click', async () => {
                if (!confirm('从品牌字体移除「' + f.name + '」？')) return;
                await this.removeBrandFont(f);
            });
            row.appendChild(name);
            row.appendChild(del);
            fontList.appendChild(row);
        });
    },

    renderLogos() {
        const logoGrid = document.getElementById('brand-logo-grid');
        if (!logoGrid) return;
        logoGrid.innerHTML = '';
        if (!this.data.logos.length) {
            logoGrid.innerHTML = '<div style="font-size:11px;color:#6e7681;grid-column:span 3;">暂无品牌 Logo</div>';
            return;
        }
        this.data.logos.forEach(logo => {
            const item = document.createElement('div');
            item.className = 'brand-logo-item';
            item.title = logo.name + '（点击加图层 / 右键菜单）';

            const img = document.createElement('img');
            img.src = logo.dataUrl;
            img.draggable = false;
            item.appendChild(img);

            const actions = document.createElement('div');
            actions.className = 'brand-logo-actions';
            const btnLayer = document.createElement('button');
            btnLayer.className = 'brand-logo-act-btn';
            btnLayer.title = '加为图层';
            btnLayer.innerHTML = '<i class="fa-solid fa-plus"></i>';
            const btnWatermark = document.createElement('button');
            btnWatermark.className = 'brand-logo-act-btn brand-logo-wm-btn';
            btnWatermark.title = '加为水印';
            btnWatermark.innerHTML = '<i class="fa-solid fa-stamp"></i>';
            actions.appendChild(btnLayer);
            actions.appendChild(btnWatermark);
            item.appendChild(actions);

            btnLayer.addEventListener('click', (e) => {
                e.stopPropagation();
                this.addLogoToCanvas(logo.id);
            });
            btnWatermark.addEventListener('click', (e) => {
                e.stopPropagation();
                this.addLogoAsWatermark(logo.id);
            });

            item.addEventListener('click', () => this.addLogoToCanvas(logo.id));
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (!confirm('从品牌 Logo 移除「' + logo.name + '」？')) return;
                this.removeBrandLogo(logo);
            });
            logoGrid.appendChild(item);
        });
    },

    renderTemplates() {
        const list = document.getElementById('brand-template-list');
        if (!list) return;
        list.innerHTML = '';
        if (!this.templates.length) {
            list.innerHTML = '<div style="font-size:11px;color:#6e7681;grid-column:span 2;">暂无品牌模板</div>';
            return;
        }
        this.templates.forEach(tpl => {
            const card = document.createElement('div');
            card.className = 'brand-template-card';
            card.title = tpl.name + '（点击应用 / 右键删除）';

            const nameEl = document.createElement('div');
            nameEl.className = 'brand-template-name';
            nameEl.textContent = tpl.name;
            card.appendChild(nameEl);

            const meta = document.createElement('div');
            meta.className = 'brand-template-meta';
            meta.textContent = (tpl.page.layers || []).length + ' 图层';
            card.appendChild(meta);

            card.addEventListener('click', () => this.applyTemplate(tpl.id));
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.deleteTemplate(tpl.id);
            });
            list.appendChild(card);
        });
    },

    // ===== 手动添加颜色弹窗 =====
    openAddColorModal() {
        const palette = this.getActivePalette();
        if (!palette) {
            if (typeof showBgToast === 'function') showBgToast('当前没有可用色板');
            return;
        }
        const existing = document.getElementById('brand-add-color-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'brand-add-color-modal';
        modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.65); z-index:9700; display:flex; align-items:center; justify-content:center;';

        const box = document.createElement('div');
        box.style.cssText = 'background:#161b22; border:1px solid #30363d; border-radius:8px; width:340px; max-width:92vw; padding:16px; color:#c9d1d9; box-shadow:0 12px 32px rgba(0,0,0,0.8); font-size:12px;';
        box.innerHTML =
            '<h3 style="margin:0 0 10px 0; color:#f1e05a; font-size:14px;"><i class="fa-solid fa-plus"></i> 添加品牌色</h3>' +
            '<div style="font-size:11px; color:#8b949e; margin-bottom:8px; line-height:1.5;">输入或粘贴 HEX 值（如 <code style="color:#58a6ff;">#FF2442</code> 或 <code style="color:#58a6ff;">FF2442</code>），也可以点右侧色块用取色器选色。</div>' +
            '<div style="display:flex; gap:8px; align-items:center; margin-bottom:10px;">' +
                '<input id="brand-add-color-input" type="text" placeholder="#FF2442" maxlength="9" ' +
                    'style="flex:1; background:#0d1117; border:1px solid #30363d; color:#c9d1d9; padding:6px 8px; border-radius:4px; font-size:12px; font-family:monospace; outline:none;">' +
                '<input id="brand-add-color-picker" type="color" value="#FF2442" ' +
                    'style="width:40px; height:32px; border:1px solid #30363d; border-radius:4px; background:none; cursor:pointer; padding:0;">' +
            '</div>' +
            '<div id="brand-add-color-preview" style="display:flex; align-items:center; gap:6px; margin-bottom:10px;">' +
                '<span style="font-size:11px; color:#8b949e;">预览：</span>' +
                '<span id="brand-add-color-swatch" style="width:24px; height:24px; border-radius:4px; border:1px solid #30363d; background:#FF2442;"></span>' +
                '<span id="brand-add-color-hex" style="font-size:11px; font-family:monospace; color:#7ee787;">#FF2442</span>' +
            '</div>' +
            '<div id="brand-add-color-error" style="display:none; color:#f85149; font-size:11px; margin-bottom:8px; line-height:1.4;"></div>' +
            '<div style="display:flex; justify-content:flex-end; gap:8px;">' +
                '<button id="brand-add-color-cancel" class="btn" style="padding:4px 12px; font-size:11px;">取消</button>' +
                '<button id="brand-add-color-confirm" class="btn btn-primary" style="padding:4px 12px; font-size:11px;">添加</button>' +
            '</div>';
        modal.appendChild(box);
        document.body.appendChild(modal);

        const inputEl = box.querySelector('#brand-add-color-input');
        const pickerEl = box.querySelector('#brand-add-color-picker');
        const swatchEl = box.querySelector('#brand-add-color-swatch');
        const hexEl = box.querySelector('#brand-add-color-hex');
        const errEl = box.querySelector('#brand-add-color-error');
        const btnCancel = box.querySelector('#brand-add-color-cancel');
        const btnConfirm = box.querySelector('#brand-add-color-confirm');

        let currentHex = '#FF2442';

        const updatePreview = (hex) => {
            currentHex = hex;
            swatchEl.style.background = hex;
            hexEl.textContent = hex;
            pickerEl.value = hex.length === 7 ? hex : '#FF2442';
        };

        const parseInput = (raw) => {
            if (!raw) return null;
            let s = String(raw).trim();
            s = s.replace(/^#+/, '');
            s = s.replace(/[^0-9a-fA-F]/g, '');
            if (s.length === 3) {
                s = s.split('').map(c => c + c).join('');
            }
            if (s.length !== 6) return null;
            return '#' + s.toUpperCase();
        };

        inputEl.addEventListener('input', () => {
            const raw = inputEl.value;
            const hex = parseInput(raw);
            if (hex) {
                errEl.style.display = 'none';
                updatePreview(hex);
            } else if (raw.trim() === '') {
                errEl.style.display = 'none';
            } else {
                errEl.style.display = 'block';
                errEl.textContent = '格式不正确，请输入 3 位或 6 位 HEX（可带 #）';
            }
        });

        pickerEl.addEventListener('input', () => {
            const hex = pickerEl.value.toUpperCase();
            inputEl.value = hex;
            errEl.style.display = 'none';
            updatePreview(hex);
        });

        // 支持粘贴（自动去空格、补 #、大写）
        inputEl.addEventListener('paste', (e) => {
            const cd = e.clipboardData || window.clipboardData;
            if (!cd) return;
            const text = cd.getData('text');
            if (!text) return;
            const hex = parseInput(text);
            if (hex) {
                e.preventDefault();
                inputEl.value = hex;
                errEl.style.display = 'none';
                updatePreview(hex);
            }
        });

        const close = () => modal.remove();
        btnCancel.addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

        btnConfirm.addEventListener('click', () => {
            const hex = parseInput(inputEl.value) || currentHex;
            if (!hex) {
                errEl.style.display = 'block';
                errEl.textContent = '请输入有效 HEX 颜色';
                return;
            }
            if (this.findColorIndex(palette, hex) >= 0) {
                if (typeof showBgToast === 'function') showBgToast('该颜色已在当前色板中');
                return;
            }
            palette.colors.push({ hex, label: '' });
            this.save();
            this.render();
            this.injectBrandColorsToControls();
            if (typeof showBgToast === 'function') showBgToast('已添加品牌色 ' + hex);
            close();
        });

        inputEl.focus();
        setTimeout(() => { try { inputEl.select(); } catch (e) {} }, 30);
    },

    // ===== 应用颜色（遍历所有选中图层，target='text' 前景 / 'bg' 背景） =====
    applyColorToSelected(hex, target) {
        target = target || 'text';
        if (!window.state) return;
        const page = state.getCurrentPage ? state.getCurrentPage() : null;
        if (!page) return;
        const ids = (state.selectedLayerIds && state.selectedLayerIds.length)
            ? state.selectedLayerIds
            : (state.selectedLayerId ? [state.selectedLayerId] : []);
        if (!ids.length) {
            if (typeof showBgToast === 'function') showBgToast('请先在画布中选中图层');
            return;
        }

        if (target === 'bg') {
            const textLayers = page.layers.filter(l => ids.includes(l.id) && l.type === 'text');
            if (!textLayers.length) {
                if (typeof showBgToast === 'function') showBgToast('背景色仅支持文字图层');
                return;
            }
            textLayers.forEach(layer => {
                layer.bgColor = hex;
                if (layer.bgRadius === undefined) layer.bgRadius = 6;
                if (layer.bgPadding === undefined) layer.bgPadding = 6;
            });
            if (typeof state.saveState === 'function') state.saveState();
            if (typeof renderCanvas === 'function') renderCanvas();
            if (typeof updateTopToolbarUI === 'function') updateTopToolbarUI(state.getSelectedLayer());
            if (typeof showBgToast === 'function') showBgToast('已应用背景色 ' + hex + '（' + textLayers.length + ' 个图层）');
            return;
        }

        const targets = page.layers.filter(l => ids.includes(l.id) && (l.type === 'text' || l.type === 'draw'));
        if (!targets.length) {
            if (typeof showBgToast === 'function') showBgToast('当前选中图层不支持改色');
            return;
        }
        let drawChanged = false;
        targets.forEach(layer => {
            layer.color = hex;
            if (layer.type === 'text') {
                if (layer.content && /<span[^>]*style="[^"]*color\s*:/i.test(layer.content)) {
                    const tmp = document.createElement('div');
                    tmp.innerHTML = layer.content;
                    tmp.querySelectorAll('span').forEach(sp => {
                        if (sp.style && sp.style.color) {
                            sp.style.removeProperty('color');
                            if (sp.getAttribute('style') === '') sp.removeAttribute('style');
                        }
                    });
                    layer.content = tmp.innerHTML;
                }
            } else if (layer.type === 'draw') {
                drawChanged = true;
            }
        });
        if (typeof state.saveState === 'function') state.saveState();
        if (typeof renderCanvas === 'function') renderCanvas();
        if (drawChanged && window.Doodle && Doodle.redrawDrawLayers) Doodle.redrawDrawLayers();
        if (typeof updateTopToolbarUI === 'function') updateTopToolbarUI(state.getSelectedLayer());
        if (typeof showBgToast === 'function') showBgToast('已应用文字色 ' + hex + '（' + targets.length + ' 个图层）');
    },

    // ===== 删除字体 =====
    async removeBrandFont(f) {
        if (f.assetId && window.AssetRegistry && AssetRegistry.remove) {
            try { await AssetRegistry.remove(f.assetId); } catch (err) {}
        }
        if (document.fonts && document.fonts.forEach) {
            const toDelete = [];
            document.fonts.forEach(face => {
                const fam = (face.family || '').replace(/^["']|["']$/g, '');
                if (fam === f.name) toDelete.push(face);
            });
            toDelete.forEach(face => { try { document.fonts.delete(face); } catch (err) {} });
        }
        this.data.fonts = this.data.fonts.filter(x => x.name !== f.name);
        this.save();
        this.render();
        this.injectBrandFontsToSelect();
        if (window.state && state.pages) {
            state.pages.forEach(p => p.layers.forEach(l => {
                if (l.fontFamily === f.name) l.fontFamily = 'sans-serif';
            }));
            if (typeof state.saveState === 'function') state.saveState();
            if (typeof renderCanvas === 'function') renderCanvas();
        }
        if (typeof showBgToast === 'function') showBgToast('已移除品牌字体 ' + f.name);
    },

    async removeBrandLogo(logo) {
        if (logo.id && window.AssetRegistry && AssetRegistry.remove && String(logo.id).startsWith('image-')) {
            try { await AssetRegistry.remove(logo.id); } catch (err) {}
        }
        this.data.logos = this.data.logos.filter(l => l.id !== logo.id);
        this.save();
        this.render();
        if (typeof showBgToast === 'function') showBgToast('已移除品牌 Logo');
    },

    // ===== 快捷色条注入 =====
    injectBrandColorsToControls() {
        const controlIds = ['tb-color', 'bg-color-1', 'bg-color-2', 'backdrop-color'];
        // 全部色板的所有颜色（{hex,label}）
        const allColorItems = [];
        const seen = new Set();
        this.data.palettes.forEach(p => (p.colors || []).forEach(c => {
            const item = this.normalizeColorItem(c);
            if (item && !seen.has(item.hex)) {
                seen.add(item.hex);
                allColorItems.push(item);
            }
        }));

        controlIds.forEach(id => {
            const inputEl = document.getElementById(id);
            if (!inputEl) return;
            const wrap = inputEl.closest('.control-group') || inputEl.parentElement;
            if (!wrap) return;

            let quickBar = wrap.querySelector('.brand-quick-bar');
            if (!quickBar) {
                quickBar = document.createElement('div');
                quickBar.className = 'brand-quick-bar';
                wrap.appendChild(quickBar);
            }

            quickBar.innerHTML = '<span style="font-size:10px; color:#888;">品牌色:</span>' +
                (allColorItems.length
                    ? allColorItems.map(item => {
                        const tip = (item.label ? item.label + ' ' : '') + item.hex;
                        return '<div class="brand-quick-swatch" data-hex="' + item.hex + '" ' +
                            'style="width:12px; height:12px; background:' + item.hex + '; border-radius:2px; cursor:pointer; border:1px solid rgba(0,0,0,0.2);" ' +
                            'title="应用 ' + tip + '"></div>';
                    }).join('')
                    : '<span style="font-size:10px; color:#6e7681;">（暂无）</span>');

            quickBar.querySelectorAll('.brand-quick-swatch').forEach(sw => {
                sw.addEventListener('click', () => {
                    const hex = sw.dataset.hex;
                    const target = document.getElementById(id);
                    if (!target) return;
                    try { target.value = hex; } catch (e) { return; }
                    target.dispatchEvent(new Event('input', { bubbles: true }));
                    target.dispatchEvent(new Event('change', { bubbles: true }));
                });
            });
        });
    },

    // ===== 品牌字体 optgroup =====
    injectBrandFontsToSelect() {
        const fontSelect = document.getElementById('tb-font');
        if (!fontSelect) return;

        let brandGroup = fontSelect.querySelector('optgroup[data-brand-group="1"]');
        if (!brandGroup) {
            brandGroup = document.createElement('optgroup');
            brandGroup.label = '品牌专属字体';
            brandGroup.dataset.brandGroup = '1';
            fontSelect.insertBefore(brandGroup, fontSelect.firstChild);
        }
        brandGroup.innerHTML = '';

        if (!this.data.fonts.length) {
            brandGroup.disabled = true;
            brandGroup.label = '品牌专属字体（暂无）';
            return;
        }
        brandGroup.disabled = false;
        brandGroup.label = '品牌专属字体';

        this.data.fonts.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.name;
            opt.textContent = '🏷️ ' + f.name;
            opt.dataset.brandFont = '1';
            brandGroup.appendChild(opt);
        });

        this.applyStrictModeToUI();
    },

    // ===== 严格模式 UI =====
    applyStrictModeToUI() {
        const fontSelect = document.getElementById('tb-font');
        if (fontSelect) {
            Array.from(fontSelect.options).forEach(opt => {
                const isBrand = opt.dataset.brandFont === '1';
                opt.disabled = this.data.strictMode ? !isBrand : false;
            });
        }

        const colorIds = ['tb-color', 'bg-color-1', 'bg-color-2', 'backdrop-color'];
        colorIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (this.data.strictMode) {
                el.style.opacity = '0.5';
                el.style.pointerEvents = 'none';
                el.title = '严格模式：只能使用品牌色';
            } else {
                el.style.opacity = '';
                el.style.pointerEvents = '';
                el.title = '';
            }
        });

        document.querySelectorAll('.brand-quick-bar').forEach(bar => {
            if (this.data.strictMode) {
                bar.style.background = 'rgba(255,36,66,0.12)';
                bar.style.borderColor = 'rgba(255,36,66,0.4)';
            } else {
                bar.style.background = '';
                bar.style.borderColor = '';
            }
        });
    },

    // ===== Logo 加入画布 =====
    addLogoToCanvas(assetId) {
        if (window.DouyinCover && typeof window.DouyinCover.addStickerToCanvas === 'function') {
            window.DouyinCover.addStickerToCanvas(assetId);
            return;
        }
        if (typeof addStickerToCanvas === 'function') {
            addStickerToCanvas(assetId);
            return;
        }
        console.error('[Brand] 找不到 addStickerToCanvas');
    },

    // ===== Logo 水印模式 =====
    addLogoAsWatermark(assetId) {
        if (!window.state || !state.getCurrentPage) {
            if (typeof showBgToast === 'function') showBgToast('无法获取当前页');
            return;
        }
        const logo = this.data.logos.find(l => l.id === assetId);
        if (!logo) {
            if (typeof showBgToast === 'function') showBgToast('Logo 数据缺失');
            return;
        }
        const w = 90, h = 90;
        const page = state.getCurrentPage();
        if (!page) return;

        const layer = {
            id: 'sticker-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            type: 'sticker',
            assetId: logo.id,
            stickerType: 'image',
            stickerColor: null,
            content: logo.dataUrl,
            fontSize: Math.min(w, h) + 'px',
            flipH: false,
            flipV: false,
            rotation: 0,
            opacity: 0.18,
            x: 360 - w - 12,
            y: 640 - h - 12,
            width: w,
            height: h,
            watermark: true,
            locked: true
        };
        page.layers.push(layer);
        if (typeof state.saveState === 'function') state.saveState();
        if (typeof renderCanvas === 'function') renderCanvas();
        if (typeof renderLayerList === 'function') renderLayerList();
        if (typeof showBgToast === 'function') showBgToast('水印 Logo 已添加（右下角 / 半透明 / 已锁定）');
    },

    // ===== 工具 =====
    normalizeHex(v) {
        if (!v) return '#000000';
        let s = String(v).trim();
        if (/^#[0-9a-fA-F]{3}$/.test(s)) {
            s = '#' + s[1]+s[1]+s[2]+s[2]+s[3]+s[3];
        }
        if (!/^#[0-9a-fA-F]{6}$/.test(s)) return '#000000';
        return s.toUpperCase();
    },

    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = evt => resolve(evt.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
};

window.BrandManager = BrandManager;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        try {
            if (document.getElementById('brand-panel')) {
                BrandManager.init();
                console.log('[Brand] BrandManager 初始化完成');
            }
        } catch (e) {
            console.error('[Brand] 初始化失败', e);
        }
    }, 500);
});