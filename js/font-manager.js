// ============================================================
// font-manager.js — 自定义字体管理（P3：从 app.js 迁出）
// 职责边界：
//   ✅ 负责：自定义字体上传（initCustomFontUpload）、字体名安全化（_safeFontFamily）、
//            字体管理弹窗（openFontManagerModal）、删除字体（deleteCustomFont）、
//            注册并应用字体（registerAndApplyFont）、加载缓存字体（loadCachedCustomFonts）
//   ❌ 不负责：品牌字体（在 brand-manager.js，走 BrandManager.data.fonts）
//   ❌ 不负责：画布渲染（在 app.js 的 renderCanvas）、工具栏状态同步（updateTopToolbarUI）
//   ❌ 不负责：字体二进制存储（在 stickers.js 的 AssetRegistry，type:'font'）
// 依赖：state / AssetRegistry（stickers.js）/ renderCanvas / renderLayerList / showBgToast
// 被依赖：app.js（DOMContentLoaded 里调用 initCustomFontUpload）
//         text-layers.js（调 window._safeFontFamily）
//         brand-manager.js（可选，读 window.__loadedCustomFonts）
// 加载顺序：必须晚于 app.js（本文件函数声明覆盖 app.js 同名旧声明）
//          必须晚于 stickers.js（AssetRegistry 已就位）
// ============================================================

window.__FONT_MANAGER_READY__ = true;
console.log('[FontManager] P3 骨架就位，等待函数体迁移');

// ⚠️ 本文件后续批次将覆盖 app.js 里的以下同名函数声明（后者覆盖前者）：
//   - initCustomFontUpload()
//   - _safeFontFamily(name)
//   - openFontManagerModal()
//   - deleteCustomFont(family, fontName, assetId)
//   - registerAndApplyFont(fontName, displayName, fontDataUrl, autoSelect)
//   - loadCachedCustomFonts(fontSelect)
//
// 迁移期间 app.js 里的原函数保留并加 [DEPRECATED — moved to font-manager.js] 标记，
// 不物理删除，确保可回滚。
//
// ⚠️ 注意：本文件不声明任何新的全局 const/let（避免与 app.js 冲突），
//    只声明同名 function（函数声明可重复，后加载覆盖）。

// ============================================================
// 第 1 批：initCustomFontUpload + _safeFontFamily
// 从 app.js 逐字迁入，函数名不变，覆盖 app.js 里的同名声明
// ============================================================

function initCustomFontUpload() {
    const btnUpload = document.getElementById('btn-upload-font');
    const fileInput = document.getElementById('local-font-file');
    const fontSelect = document.getElementById('tb-font');
    if (!fileInput || !fontSelect) return;

    loadCachedCustomFonts(fontSelect);

    // ✅ 上传按钮已迁入「文件▾」菜单，事件由 app.js 的 rebindToolbarMenuActions 绑定
    //    这里只在 btnUpload 仍存在且未被 rebind 时兜底绑定
    if (btnUpload && !btnUpload.dataset.rebound) {
        btnUpload.addEventListener('click', () => fileInput.click());
    }

    // ✅ 管理字体：按钮已迁入菜单，事件由 app.js 的 rebind 绑定
    const btnManage = document.getElementById('btn-manage-font');
    if (btnManage && !btnManage.dataset.rebound) {
        btnManage.addEventListener('click', () => openFontManagerModal());
    }

    // ✅ 一次性自愈：把 localStorage 里 displayName 是 CustomFont_xxx 的脏数据，回填成 AssetRegistry 里的真实文件名
    (async function healLegacyFonts() {
        try {
            let savedFonts = [];
            try { savedFonts = JSON.parse(localStorage.getItem('douyin_cover_custom_fonts') || '[]'); }
            catch (e) { return; }
            if (!Array.isArray(savedFonts) || savedFonts.length === 0) return;
            if (!window.AssetRegistry) return;
            let changed = false;
            for (const f of savedFonts) {
                if (!f.assetId) continue;
                // 已经是正常的名字（不是 CustomFont_ 开头），跳过
                if (f.displayName && !/^CustomFont_\d+$/.test(f.displayName)) continue;
                try {
                    const asset = await AssetRegistry.get(f.assetId);
                    if (asset && asset.name && !/^CustomFont_\d+$/.test(asset.name)) {
                        f.displayName = asset.name;
                        changed = true;
                    }
                } catch (e) {
                    if (window.Utils && Utils.log) Utils.log.warn('[Font] 读取字体资产失败', f.assetId, e);
                }
            }
            if (changed) {
                localStorage.setItem('douyin_cover_custom_fonts', JSON.stringify(savedFonts));
                console.log('[Font] 已修复历史字体脏数据');
            }
        } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[Font] 修复历史字体脏数据失败', e);
        }
    })();

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const lowerName = file.name.toLowerCase();
        if (!lowerName.endsWith('.ttf') && !lowerName.endsWith('.otf')) {
            alert('请上传 .ttf 或 .otf 格式的字体文件');
            fileInput.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = async function(evt) {
            const fontDataUrl = evt.target.result;
            const fontName = 'CustomFont_' + Date.now();
            const displayName = file.name.replace(/\.[^/.]+$/, "");

            // ✅ 字体二进制存 IndexedDB（AssetRegistry），localStorage 只存元数据
            let assetId = null;
            try {
                if (window.AssetRegistry && AssetRegistry.registerFont) {
                    assetId = await AssetRegistry.registerFont({
                        name: displayName,
                        data: fontDataUrl,
                        tags: ['font', 'custom', displayName],
                        source: 'user'
                    });
                }
            } catch (err) {
                console.error('字体写入 IndexedDB 失败:', err);
            }
            if (!assetId) {
                alert('字体保存失败：IndexedDB 写入错误，请重试。');
                return;
            }

            // 应用字体（当前页面立即可用）
            registerAndApplyFont(fontName, displayName, fontDataUrl, true);

            // localStorage 只存元数据（几百字节），绝不存 fontDataUrl
            try {
                let savedFonts = JSON.parse(localStorage.getItem('douyin_cover_custom_fonts') || '[]');
                savedFonts = savedFonts.filter(f => f.displayName !== displayName);
                savedFonts.push({ fontName, displayName, assetId });
                localStorage.setItem('douyin_cover_custom_fonts', JSON.stringify(savedFonts));
                setTimeout(() => {
                    alert(`字体 "${file.name}" 上传成功！已永久保存到 IndexedDB（不受 5MB 限制）。`);
                }, 50);
            } catch (err) {
                console.warn('localStorage 元数据写入失败:', err);
                alert(`字体已存入 IndexedDB，但 localStorage 元数据写入失败。
刷新后字体可能不会自动出现，但 IndexedDB 里有，可手动恢复。`);
            }
        };
        reader.onerror = () => alert('读取字体文件失败，请重试');
        reader.readAsDataURL(file);
    });
}

// ✅ 把字体名安全化：含空格/中文/特殊字符时包一层引号，避免被当成多个 fallback 名
function _safeFontFamily(name) {
    if (!name) return '';
    const n = String(name).trim();
    if (!n) return '';
    // 已经是通用族名或已经带引号，原样返回
    if (/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|inherit|initial|unset)$/i.test(n)) return n;
    if (/^['"].*['"]$/.test(n)) return n;
    // 含空格、中文、非 ASCII、或特殊符号 → 加双引号
    if (/[\s\u4e00-\u9fa5]/.test(n) || !/^[A-Za-z0-9_-]+$/.test(n)) {
        return '"' + n.replace(/"/g, '\"') + '"';
    }
    return n;
}
window._safeFontFamily = _safeFontFamily;

console.log('[FontManager] 第1批已接管：initCustomFontUpload / _safeFontFamily');

// ============================================================
// 第 2 批：openFontManagerModal + deleteCustomFont
// 从 app.js 逐字迁入，函数名不变，覆盖 app.js 里的同名声明
// ============================================================

// ✅ 字体管理弹窗：列出 localStorage 里的所有自定义字体，可删除
function openFontManagerModal() {
    const existing = document.getElementById('font-manager-modal');
    if (existing) { existing.remove(); return; }

    let savedFonts = [];
    try { savedFonts = JSON.parse(localStorage.getItem('douyin_cover_custom_fonts') || '[]'); }
    catch (e) { savedFonts = []; }

    const modal = document.createElement('div');
    modal.id = 'font-manager-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#161b22;border:1px solid #30363d;border-radius:8px;width:460px;max-width:92vw;max-height:80vh;overflow-y:auto;padding:16px;color:#c9d1d9;box-shadow:0 8px 24px rgba(0,0,0,0.8);font-size:12px;';

    let listHtml = '';
    if (!savedFonts.length) {
        listHtml = '<div style="color:#8b949e;text-align:center;padding:20px;">还没有上传过自定义字体</div>';
    } else {
        listHtml = savedFonts.map((f, i) => {
            const family = (f.displayName && String(f.displayName).trim()) || f.fontName || ('字体 ' + (i + 1));
            return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:#0d1117;border:1px solid #30363d;border-radius:6px;margin-bottom:6px;">
                <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:' + family.replace(/'/g, "\\'") + ';">✍️ ${family}</span>
                <small style="color:#8b949e;font-family:monospace;">${f.fontName || ''}</small>
                <button class="btn font-del-btn" data-family="${family.replace(/"/g,'&quot;')}" data-fontname="${(f.fontName||'').replace(/"/g,'&quot;')}" data-assetid="${f.assetId || ''}" style="padding:3px 8px;font-size:11px;background:#f85149;border-color:#f85149;color:#fff;">删除</button>
            </div>`;
        }).join('');
    }

    box.innerHTML = `
        <h3 style="margin-bottom:10px;color:#f1e05a;font-size:14px;"><i class="fa-solid fa-list"></i> 管理自定义字体</h3>
        <div style="font-size:11px;color:#8b949e;margin-bottom:10px;line-height:1.5;">删除后会从下拉框、localStorage、IndexedDB、以及 document.fonts 中一起移除。已使用该字体的文字图层会回退到默认字体。</div>
        <div id="font-manager-list">${listHtml}</div>
        <div style="margin-top:12px;text-align:right;">
            <button id="font-manager-close" class="btn btn-primary" style="padding:4px 14px;font-size:11px;">关闭</button>
        </div>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);

    box.querySelectorAll('.font-del-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const family = btn.dataset.family || '';
            const fontName = btn.dataset.fontname || '';
            const assetId = btn.dataset.assetid || '';
            if (!confirm(`确定删除字体「${family}」吗？`)) return;
            await deleteCustomFont(family, fontName, assetId);
            // 重建弹窗内容
            openFontManagerModal();
            openFontManagerModal(); // 再开一次（第一次是关闭，第二次是重建）
        });
    });

    document.getElementById('font-manager-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

// ✅ 删除一个自定义字体：下拉 option / localStorage / IndexedDB / document.fonts 全清
async function deleteCustomFont(family, fontName, assetId) {
    // 1) 从下拉框移除
    const fontSelect = document.getElementById('tb-font');
    if (fontSelect) {
        Array.from(fontSelect.options).forEach(opt => {
            if (opt.value === family || opt.value === fontName) {
                opt.remove();
            }
        });
    }

    // 2) 从 localStorage 移除（按 displayName / fontName 匹配）
    let savedFonts = [];
    try { savedFonts = JSON.parse(localStorage.getItem('douyin_cover_custom_fonts') || '[]'); }
    catch (e) { savedFonts = []; }
    savedFonts = savedFonts.filter(f => {
        const fam = (f.displayName && String(f.displayName).trim()) || f.fontName;
        return fam !== family && f.fontName !== fontName && f.fontName !== family;
    });
    try { localStorage.setItem('douyin_cover_custom_fonts', JSON.stringify(savedFonts)); } catch (e) {}

    // 3) 从 IndexedDB（AssetRegistry）移除
    if (assetId && window.AssetRegistry) {
        try { await AssetRegistry.remove(assetId); } catch (e) {}
    }

    // 4) 尝试从 document.fonts 里移除对应 FontFace（FontFaceSet.delete 支持）
    try {
        if (document.fonts && document.fonts.forEach) {
            const toDelete = [];
            document.fonts.forEach(ff => {
                const ffFam = (ff.family || '').replace(/^["']|["']$/g, '');
                if (ffFam === family || ffFam === fontName) toDelete.push(ff);
            });
            toDelete.forEach(ff => { try { document.fonts.delete(ff); } catch (e) { if (window.Utils && Utils.log) Utils.log.warn('[Font] document.fonts.delete 失败', e); } });
        }
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[Font] 清理 document.fonts 失败', e);
    }

    // 5) 清理 window.__loadedCustomFonts
    if (window.__loadedCustomFonts) {
        delete window.__loadedCustomFonts[family];
        delete window.__loadedCustomFonts[fontName];
    }

    // 6) 凡是图层里还引用了这个字体的，回退到 sans-serif
    if (window.state && state.pages) {
        state.pages.forEach(p => p.layers.forEach(l => {
            if (l.fontFamily === family || l.fontFamily === fontName) {
                l.fontFamily = 'sans-serif';
            }
        }));
    }

    // 7) 刷新画布
    if (typeof renderCanvas === 'function') renderCanvas();
    if (typeof renderLayerList === 'function') renderLayerList();
    if (typeof showBgToast === 'function') showBgToast(`已删除字体「${family}」`);
}
window.openFontManagerModal = openFontManagerModal;
window.deleteCustomFont = deleteCustomFont;

console.log('[FontManager] 第2批已接管：openFontManagerModal / deleteCustomFont');


// ============================================================
// 第 3 批：registerAndApplyFont + loadCachedCustomFonts
// 从 app.js 逐字迁入，函数名不变，覆盖 app.js 里的同名声明
// 至此字体管理全部收口到本文件
// ============================================================

function registerAndApplyFont(fontName, displayName, fontDataUrl, autoSelect = false) {
    const fontSelect = document.getElementById('tb-font');
    if (!fontSelect) return;

    // ✅ 家族名统一 = displayName（即用户上传时看到的 "Xiaolai-Regular"）
    const realFamilyName = displayName && String(displayName).trim() ? String(displayName).trim() : fontName;

    const doRegister = async () => {
        try {
            const res = await fetch(fontDataUrl);
            const buffer = await res.arrayBuffer();

            // ✅ 家族名、weight、style 全部显式指定，防伪加粗/伪斜体
            const fontFace = new FontFace(realFamilyName, buffer, { weight: 'normal', style: 'normal' });
            const loadedFace = await fontFace.load();
            document.fonts.add(loadedFace);
            try { await document.fonts.load(`normal normal 16px "${realFamilyName}"`); } catch (e) {
                if (window.Utils && Utils.log) Utils.log.warn('[Font] 新字体预热失败', realFamilyName, e);
            }

            // 下拉 option：value = 家族名，显示加 ✍️
            let exists = Array.from(fontSelect.options).some(opt => opt.value === realFamilyName);
            if (!exists) {
                const option = document.createElement('option');
                option.value = realFamilyName;
                option.innerText = '✍️ ' + realFamilyName;
                fontSelect.appendChild(option);
            }

            window.__loadedCustomFonts = window.__loadedCustomFonts || {};
            window.__loadedCustomFonts[realFamilyName] = true;
            window.__loadedCustomFonts[fontName] = true;
            if (displayName) window.__loadedCustomFonts[displayName] = true;

            if (typeof renderCanvas === 'function') renderCanvas();

            if (autoSelect) {
                fontSelect.value = realFamilyName;
                const layer = state.getSelectedLayer();
                if (layer && layer.type === 'text') {
                    // ✅ 强制切过去，同时清掉可能残留的旧字体名
                    layer.fontFamily = realFamilyName;
                    if (typeof state.saveState === 'function') state.saveState();
                    renderCanvas();
                }
            }
        } catch (err) {
            console.error('注册字体失败:', err);
            alert('字体加载失败：' + (err && err.message ? err.message : '未知错误'));
        }
    };
    doRegister();
}

window.registerAndApplyFont = registerAndApplyFont;

async function loadCachedCustomFonts(fontSelect) {
    if (!fontSelect) return;

    try {
        // ✅ 第一步：不管 localStorage 里有什么，先从 IndexedDB 拉真实数据做权威源
        let fontAssets = [];
        try {
            if (window.AssetRegistry && AssetRegistry.init) {
                await AssetRegistry.init();
                fontAssets = await AssetRegistry.list({ type: 'font' });
            }
        } catch (e) { console.warn('读取字体资产失败', e); }

        // ✅ 第二步：合并 localStorage 老数据 + IndexedDB 数据，去重
        //    每个字体最终只保留一个 family 名（优先用文件原始名，即 asset.name）
        const savedFonts = (() => {
            try { return JSON.parse(localStorage.getItem('douyin_cover_custom_fonts') || '[]'); }
            catch (e) { return []; }
        })();

        const seenAssets = new Set();
        const allFonts = [];

        // 2a. 索引库里的每个字体资产都加一份（family 用 asset.name）
        fontAssets.forEach(a => {
            if (!a || !a.id || seenAssets.has(a.id)) return;
            seenAssets.add(a.id);
            const family = (a.name && String(a.name).trim()) || a.id;
            allFonts.push({
                family,
                assetId: a.id,
                data: a.data,
                source: 'asset'
            });
        });

        // 2b. localStorage 老数据：只补 asset 里没有的（用 assetId 匹配，没 assetId 的用 family 匹配）
        for (const f of savedFonts) {
            const family = (f.displayName && String(f.displayName).trim()) || f.fontName;
            if (!family) continue;
            // 已经通过 asset 加载过这个 family，就跳过
            if (allFonts.some(x => x.family === family)) continue;
            // 有 assetId 且之前没加载成功，跳过（说明资产已经失效，不要再重复注册）
            if (f.assetId && seenAssets.has(f.assetId)) continue;
            allFonts.push({
                family,
                assetId: f.assetId || null,
                data: f.fontDataUrl || null,
                source: 'legacy'
            });
        }

        // ✅ 第三步：先把所有 option 建出来（UI 立即可见）
        for (const f of allFonts) {
            const exists = Array.from(fontSelect.options).some(o => o.value === f.family);
            if (!exists) {
                const option = document.createElement('option');
                option.value = f.family;
                option.innerText = '✍️ ' + f.family;
                fontSelect.appendChild(option);
            }
        }

        // ✅ 第四步：逐个注册 FontFace（family = 上面确定的最终名）
        for (const f of allFonts) {
            let dataUrl = f.data;
            if (!dataUrl && f.assetId && window.AssetRegistry) {
                try {
                    const asset = await AssetRegistry.get(f.assetId);
                    if (asset && asset.data) dataUrl = asset.data;
                } catch (e) {
                    if (window.Utils && Utils.log) Utils.log.warn('[Font] 读取缓存字体资产失败', f.assetId, e);
                }
            }
            if (!dataUrl) continue;

            try {
                const res = await fetch(dataUrl);
                const buffer = await res.arrayBuffer();
                // ✅ 关键：家族名 = f.family；明确 weight/style=normal，防止伪加粗
                const fontFace = new FontFace(f.family, buffer, { weight: 'normal', style: 'normal' });
                const loadedFace = await fontFace.load();
                document.fonts.add(loadedFace);
                try { await document.fonts.load(`normal normal 16px "${f.family}"`); } catch (e) {
                    if (window.Utils && Utils.log) Utils.log.warn('[Font] 字体预热失败', f.family, e);
                }
                window.__loadedCustomFonts = window.__loadedCustomFonts || {};
                window.__loadedCustomFonts[f.family] = true;
                if (f.assetId) window.__loadedCustomFonts[f.assetId] = true;
                console.log('[Font] 已注册:', f.family, '（来源:', f.source, '）');
            } catch (err) {
                console.warn('[Font] 注册失败:', f.family, err);
            }
        }

        // ✅ 第五步：加载完后重绘一次画布，把 fallback 文字刷新成真实字体
        if (typeof renderCanvas === 'function') renderCanvas();

        console.log('[Font] loadCachedCustomFonts 完成，已注册家族:',
            allFonts.map(f => f.family));
    } catch (err) {
        console.error('读取字体缓存出错:', err);
    }
}

console.log('[FontManager] 第3批已接管：registerAndApplyFont / loadCachedCustomFonts');
console.log('[FontManager] ✅ 字体管理全部收口完成');

// ============================================================
// P1-2 步骤 2.4b：font-manager.js 收口到 window.TXT
// ============================================================
(function exposeFontManagerNamespace() {
    if (!window.TXT) {
        console.warn('[TXT] namespaces.js 未加载，跳过收口');
        return;
    }
    TXT.initCustomFontUpload = initCustomFontUpload;
    TXT.safeFontFamily = _safeFontFamily;
    TXT.openFontManagerModal = openFontManagerModal;
    TXT.deleteCustomFont = deleteCustomFont;
    TXT.registerAndApplyFont = registerAndApplyFont;
    TXT.loadCachedCustomFonts = loadCachedCustomFonts;
    console.log('[TXT] ✅ font-manager.js 已收口到 window.TXT（' +
        Object.keys(TXT).length + ' 个函数）');
})();