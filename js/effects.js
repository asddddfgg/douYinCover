// Art Effects Library (Supports pin, hide, delete, batch upload with auto-rename duplicate protection, hidden bin, reordering & selectable copy modal)
const DEFAULT_ART_EFFECTS = [
    { id: 'effect-gradient', name: '双色渐变', css: 'background: linear-gradient(135deg, #ff7e5f, #feb47b); -webkit-background-clip: text; -webkit-text-fill-color: transparent;' },
    { id: 'effect-neon', name: '霓虹发光', css: 'color: #fff; text-shadow: 0 0 5px #ff00de, 0 0 10px #ff00de, 0 0 20px #ff00de, 0 0 40px #ff00de;' },
    { id: 'effect-3d', name: '3D立体', css: 'color: #f0f0f0; text-shadow: 1px 1px 0 #ccc, 2px 2px 0 #c9c9c9, 3px 3px 0 #bbb, 4px 4px 0 #b9b9b9, 5px 5px 0 #aaa, 6px 6px 7px rgba(0,0,0,0.6);' },
    { id: 'effect-cyber', name: '赛博机甲', css: 'color: #00ffff; text-shadow: 2px 0 #ff0055, -2px 0 #00ffff;' },
    { id: 'effect-glitch', name: '故障艺术', css: 'color: #fff; position: relative; text-shadow: 2px -2px 0 rgba(255,0,0,0.7), -2px 2px 0 rgba(0,255,255,0.7);' },
    { id: 'effect-hk', name: '复古港风', css: 'color: #ffeb3b; text-shadow: 0 0 8px rgba(255,235,59,0.8), 2px 2px 5px #000;' },
    { id: 'effect-gold', name: '暗金奢华', css: 'background: linear-gradient(to bottom, #d4af37 0%, #aa771c 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.8));' },
    { id: 'effect-fire', name: '烈火熔岩', css: 'background: linear-gradient(to bottom, #ff4500 0%, #ff8c00 50%, #ffff00 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-shadow: 0 0 10px rgba(255,69,0,0.6);' },
    { id: 'effect-ice', name: '寒冰霜冻', css: 'color: #e0f7fa; text-shadow: 0 0 5px #00bcd4, 0 0 10px #00bcd4, 0 0 20px #00e5ff;' },
    { id: 'effect-black-stroke', name: '黑描边粗重', css: 'color: #fff; text-shadow: -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 3px 5px rgba(0,0,0,0.8);' },
    { id: 'effect-purple-mist', name: '紫雾梦幻', css: 'color: #e1bee7; text-shadow: 0 0 10px #ab47bc, 0 0 20px #7b1fa2;' },
    { id: 'effect-sunset', name: '日落晚霞', css: 'background: linear-gradient(135deg, #ff512f 0%, #dd2476 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;' },
    { id: 'effect-deep-sea', name: '深海湛蓝', css: 'background: linear-gradient(135deg, #2b5876 0%, #4e4376 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;' },
    { id: 'effect-jade', name: '翡翠绿光', css: 'background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;' },
    { id: 'effect-candy', name: '梦幻糖果', css: 'background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;' },
    { id: 'effect-metal', name: '重金属风', css: 'color: #b0bec5; text-shadow: 0 1px 0 #cfd8dc, 0 2px 0 #b0bec5, 0 3px 0 #90a4ae, 0 4px 0 #607d8b, 0 5px 10px rgba(0,0,0,0.8);' },
    { id: 'effect-chalk', name: '粉笔手绘', css: 'color: #fff; font-family: cursive; text-shadow: 0 0 2px rgba(255,255,255,0.8), 1px 1px 2px rgba(0,0,0,0.5);' },
    { id: 'effect-lightning', name: '闪电高压', css: 'color: #fff; text-shadow: 0 0 5px #fff, 0 0 10px #ffeb3b, 0 0 20px #ff9800;' },
    { id: 'effect-red-stroke', name: '红描边爆款', css: 'color: #ffeb3b; text-shadow: -2px -2px 0 #ff2442, 2px -2px 0 #ff2442, -2px 2px 0 #ff2442, 2px 2px 0 #ff2442;' },
    { id: 'effect-viral', name: '王牌爆款', css: 'color: #ffff00; text-shadow: 0 0 10px #ff2442, 0 0 20px #ff2442, 0 0 30px #ff2442; font-weight: 900;' }
];

function initEffectsLibrary() {
    renderEffectsGrid();
    initEffectsManagerPanel();
}

function getAllEffectsMaster() {
    let userOverrides = {};
    try { userOverrides = JSON.parse(localStorage.getItem('douyin_effects_states_v3') || '{}'); } catch(e) {}

    let customList = [];
    try { customList = JSON.parse(localStorage.getItem('douyin_custom_effects_v3') || '[]'); } catch(e) {}

    let defaults = DEFAULT_ART_EFFECTS.map(eff => ({
        ...eff,
        hidden: userOverrides[eff.id] ? !!userOverrides[eff.id].hidden : false,
        deleted: userOverrides[eff.id] ? !!userOverrides[eff.id].deleted : false,
        pinned: userOverrides[eff.id] ? !!userOverrides[eff.id].pinned : false,
        isCustom: false
    })).filter(eff => !eff.deleted);

    let customs = customList.map(eff => ({
        ...eff,
        hidden: userOverrides[eff.id] ? !!userOverrides[eff.id].hidden : (eff.hidden || false),
        deleted: userOverrides[eff.id] ? !!userOverrides[eff.id].deleted : false,
        pinned: userOverrides[eff.id] ? !!userOverrides[eff.id].pinned : false,
        isCustom: true
    })).filter(eff => !eff.deleted);

    return [...defaults, ...customs];
}

function getPinnedEffectsList() {
    let all = getAllEffectsMaster();
    let pinnedIds = [];
    try { pinnedIds = JSON.parse(localStorage.getItem('douyin_effects_pinned_order') || '[]'); } catch(e) {}

    let pinnedMap = new Map(all.map(e => [e.id, e]));
    let orderedPinned = [];
    
    pinnedIds.forEach(id => {
        if (pinnedMap.has(id)) {
            orderedPinned.push(pinnedMap.get(id));
            pinnedMap.delete(id);
        }
    });
    pinnedMap.forEach(eff => {
        if (eff.pinned) orderedPinned.push(eff);
    });

    return orderedPinned;
}

function renderEffectsGrid() {
    const grid = document.getElementById('effects-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    let styleTag = document.getElementById('dynamic-custom-effects-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-custom-effects-style';
        document.head.appendChild(styleTag);
    }
    
    let allEffects = getAllEffectsMaster();
    let pinnedList = getPinnedEffectsList();
    let cssRules = '';

    // 1. 渲染【置顶特效栏】
    if (pinnedList.length > 0) {
        const pinHeader = document.createElement('div');
        pinHeader.style.cssText = 'grid-column: span 2; font-size: 11px; color: #f1e05a; font-weight: bold; margin-bottom: 2px; border-bottom: 1px solid #30363d; padding-bottom: 2px; display: flex; align-items: center; gap: 4px;';
        pinHeader.innerHTML = '<i class="fa-solid fa-thumbtack"></i> 置顶特效栏';
        grid.appendChild(pinHeader);

        pinnedList.forEach((eff, index) => {
            if (eff.css) cssRules += `.${eff.id} { ${eff.css} }\n`;
            if (eff.hidden) return;

            const card = createEffectCardDOM(eff, index, pinnedList.length, true);
            grid.appendChild(card);
        });
    }

    // 2. 渲染【全部特效库】（过滤掉已经置顶的特效，防止重复展示）
    const normalHeader = document.createElement('div');
    normalHeader.style.cssText = 'grid-column: span 2; font-size: 11px; color: #8b949e; font-weight: bold; margin-top: 6px; margin-bottom: 2px; border-bottom: 1px solid #30363d; padding-bottom: 2px; display: flex; align-items: center; gap: 4px;';
    normalHeader.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> 全部特效库';
    grid.appendChild(normalHeader);

    let unpinnedEffects = allEffects.filter(eff => !eff.pinned);

    unpinnedEffects.forEach(eff => {
        if (eff.css) cssRules += `.${eff.id} { ${eff.css} }\n`;
        if (eff.hidden) return;

        const card = createEffectCardDOM(eff, 0, 0, false);
        grid.appendChild(card);
    });

    styleTag.innerHTML = cssRules;
}

function createEffectCardDOM(eff, pinIndex, pinTotal, isPinnedSection) {
    const card = document.createElement('div');
    card.className = `effect-card ${eff.id}`;
    card.innerText = eff.name;
    card.dataset.effectId = eff.id;

    const currentLayer = state.getSelectedLayer();
    if (currentLayer && currentLayer.effectClass === eff.id) {
        card.classList.add('active');
    }

    card.addEventListener('click', () => {
        const layer = state.getSelectedLayer();
        if (!layer || layer.type !== 'text') {
            alert('请先在画布中点击选中一个【文本图层】！');
            return;
        }
        layer.effectClass = eff.id;
        document.querySelectorAll('.effect-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        renderCanvas();
        renderLayerList();
    });

    const delBtn = document.createElement('div');
    delBtn.className = 'effect-action-btn btn-del';
    delBtn.innerHTML = '&times;';
    delBtn.title = '删除此特效';
    delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteEffect(eff.id, eff.isCustom);
    });
    card.appendChild(delBtn);

    const toggleBtn = document.createElement('div');
    toggleBtn.className = 'effect-action-btn btn-toggle';
    toggleBtn.innerHTML = '👁️';
    toggleBtn.title = '隐藏此特效';
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleEffectHidden(eff.id);
    });
    card.appendChild(toggleBtn);

    const pinBtn = document.createElement('div');
    pinBtn.className = 'effect-action-btn btn-pin';
    pinBtn.innerHTML = eff.pinned ? '📍' : '📌';
    pinBtn.title = eff.pinned ? '取消置顶' : '置顶特效';
    pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleEffectPinned(eff.id);
    });
    card.appendChild(pinBtn);

    if (isPinnedSection) {
        if (pinIndex > 0) {
            const moveUp = document.createElement('div');
            moveUp.style.cssText = 'position:absolute; bottom:2px; left:2px; background:rgba(0,0,0,0.8); color:#fff; font-size:9px; width:14px; height:14px; display:flex; align-items:center; justify-content:center; border-radius:3px; cursor:pointer;';
            moveUp.innerHTML = '◀';
            moveUp.title = '向前移动';
            moveUp.addEventListener('click', (e) => { e.stopPropagation(); movePinnedOrder(eff.id, -1); });
            card.appendChild(moveUp);
        }
        if (pinIndex < pinTotal - 1) {
            const moveDown = document.createElement('div');
            moveDown.style.cssText = 'position:absolute; bottom:2px; right:2px; background:rgba(0,0,0,0.8); color:#fff; font-size:9px; width:14px; height:14px; display:flex; align-items:center; justify-content:center; border-radius:3px; cursor:pointer;';
            moveDown.innerHTML = '▶';
            moveDown.title = '向后移动';
            moveDown.addEventListener('click', (e) => { e.stopPropagation(); movePinnedOrder(eff.id, 1); });
            card.appendChild(moveDown);
        }
    }

    return card;
}

function initEffectsManagerPanel() {
    const sidebar = document.querySelector('.sidebar-left .panel-section');
    if (!sidebar || document.getElementById('effects-control-panel')) return;

    const panelDiv = document.createElement('div');
    panelDiv.id = 'effects-control-panel';
    panelDiv.className = 'effects-control-panel';
    panelDiv.innerHTML = `
        <div style="display: flex; gap: 4px;">
            <button id="btn-show-format" class="btn" style="flex:1; font-size:10px; justify-content:center;"><i class="fa-solid fa-circle-info"></i> 查看特效格式</button>
            <button id="btn-show-hidden-bin" class="btn" style="flex:1; font-size:10px; justify-content:center;"><i class="fa-solid fa-eye-slash"></i> 已隐藏特效</button>
        </div>
        <textarea id="ce-batch-json" rows="3" placeholder="在此粘贴 JSON 代码批量上传（智能防误覆盖，自动生成新版本）..."></textarea>
        <button id="btn-batch-upload" class="btn btn-primary" style="justify-content:center; font-size:11px; padding:5px;"><i class="fa-solid fa-cloud-arrow-up"></i> 批量上传特效</button>
        
        <div id="hidden-bin-container" style="display:none;" class="sub-panel-box"></div>
    `;
    sidebar.appendChild(panelDiv);

    document.getElementById('btn-show-format').addEventListener('click', () => {
        showCopyableFormatModal();
    });

    document.getElementById('btn-show-hidden-bin').addEventListener('click', () => {
        const binBox = document.getElementById('hidden-bin-container');
        if (binBox.style.display === 'none') {
            binBox.style.display = 'block';
            renderHiddenBinList();
        } else {
            binBox.style.display = 'none';
        }
    });

    // 修复误覆盖问题：批量上传增加自动智能重命名 / 版本的防覆盖机制
    document.getElementById('btn-batch-upload').addEventListener('click', () => {
        const rawText = document.getElementById('ce-batch-json').value.trim();
        if (!rawText) {
            alert('请先粘贴符合格式的 JSON 代码！');
            return;
        }

        try {
            const newItems = JSON.parse(rawText);
            if (!Array.isArray(newItems)) throw new Error('导入的数据必须是数组 [...] 格式');

            let customList = [];
            try { customList = JSON.parse(localStorage.getItem('douyin_custom_effects_v3') || '[]'); } catch(e) {}

            let countAdded = 0;
            let countRenamed = 0;

            newItems.forEach(item => {
                if (item.id && item.name && item.css) {
                    let existing = customList.find(ex => ex.id === item.id);
                    if (existing) {
                        // 如果 ID 相同且内容完全一样，直接跳过
                        if (existing.css.trim() === item.css.trim()) {
                            return;
                        }
                        // 如果内容不同，避免覆盖喜欢的旧版本：自动追加新版本编号
                        let ver = 2;
                        let newId = `${item.id}_v${ver}`;
                        let newName = `${item.name} (v${ver})`;
                        while (customList.some(ex => ex.id === newId)) {
                            ver++;
                            newId = `${item.id}_v${ver}`;
                            newName = `${item.name} (v${ver})`;
                        }
                        customList.push({
                            id: newId,
                            name: newName,
                            css: item.css,
                            hidden: false,
                            deleted: false
                        });
                        countRenamed++;
                    } else {
                        customList.push({
                            id: item.id,
                            name: item.name,
                            css: item.css,
                            hidden: false,
                            deleted: false
                        });
                        countAdded++;
                    }
                }
            });

            localStorage.setItem('douyin_custom_effects_v3', JSON.stringify(customList));
            document.getElementById('ce-batch-json').value = '';
            renderEffectsGrid();
            if (document.getElementById('hidden-bin-container').style.display === 'block') {
                renderHiddenBinList();
            }
            alert(`批量上传成功！新增 ${countAdded} 款特效` + (countRenamed > 0 ? `，为 ${countRenamed} 款存在重名但内容不同的特效自动创建了新版本（防止旧版本被覆盖）` : '') + '。');
        } catch (err) {
            alert('JSON 解析失败，请检查格式：\n' + err.message);
        }
    });
}

function showCopyableFormatModal() {
    let existingModal = document.getElementById('copyable-format-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'copyable-format-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.7); z-index: 99999; display: flex; align-items: center; justify-content: center;';

    const contentBox = document.createElement('div');
    contentBox.style.cssText = 'background: #161b22; border: 1px solid #30363d; border-radius: 8px; width: 450px; padding: 20px; color: #c9d1d9; box-shadow: 0 8px 24px rgba(0,0,0,0.8); font-size: 12px;';

    const sampleJson = `[\n  {\n    "id": "my_custom_eff_1",\n    "name": "炫彩霓虹",\n    "css": "color: #fff; text-shadow: 0 0 10px #ff00de, 0 0 20px #ff00de;"\n  }\n]`;

    contentBox.innerHTML = `
        <h3 style="margin-bottom: 10px; color: #f1e05a; font-size: 14px;"><i class="fa-solid fa-code"></i> AI 批量生成特效格式说明</h3>
        <p style="margin-bottom: 8px; line-height: 1.4; color: #8b949e;">请将下方文本框中的格式复制后发给 AI，让其按此 JSON 数组格式批量生成。框内文字可直接用鼠标任意选中并复制：</p>
        <textarea readonly style="width: 100%; height: 120px; background: #0d1117; border: 1px solid #30363d; color: #58a6ff; padding: 8px; border-radius: 4px; font-family: monospace; font-size: 11px; resize: none; outline: none; user-select: text;">${sampleJson}</textarea>
        <div style="margin-top: 10px; font-size: 11px; color: #8b949e; line-height: 1.4;">
            <b>防覆盖说明：</b><br>
            上传时系统已开启<b>防误覆盖保护</b>！若上传了重复 ID 但 CSS 不同的代码，系统会自动追加新版本后缀（例如：<code>炫彩霓虹 (v2)</code>），同时完美保留您原先喜欢的旧代码。满意的保留，不喜欢的点 ❌ 删除，两可的点 👁️ 隐藏。
        </div>
        <div style="margin-top: 15px; text-align: right;">
            <button id="btn-close-modal" class="btn btn-primary" style="padding: 4px 14px; font-size: 11px;">关闭窗口</button>
        </div>
    `;

    modal.appendChild(contentBox);
    document.body.appendChild(modal);

    contentBox.querySelector('textarea').select();

    document.getElementById('btn-close-modal').addEventListener('click', () => {
        modal.remove();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

function renderHiddenBinList() {
    const binBox = document.getElementById('hidden-bin-container');
    if (!binBox) return;
    binBox.innerHTML = '';

    let all = getAllEffectsMaster();
    let hiddenItems = all.filter(e => e.hidden);

    if (hiddenItems.length === 0) {
        binBox.innerHTML = '<div style="color: #8b949e; text-align: center; padding: 4px;">当前没有被隐藏的特效</div>';
        return;
    }

    binBox.innerHTML = '<div style="font-weight:bold; margin-bottom:4px; color:#f1e05a;">已隐藏特效列表 (点击恢复显示)：</div>';

    hiddenItems.forEach(eff => {
        const row = document.createElement('div');
        row.className = 'sub-item-row';
        row.innerHTML = `
            <span>${eff.name} <small style="color:#8b949e;">(${eff.id})</small></span>
            <button class="btn" style="padding: 1px 6px; font-size:10px;"><i class="fa-solid fa-eye"></i> 显示</button>
        `;
        row.querySelector('button').addEventListener('click', () => {
            toggleEffectHidden(eff.id);
            renderEffectsGrid();
            renderHiddenBinList();
        });
        binBox.appendChild(row);
    });
}

function toggleEffectHidden(id) {
    try {
        let userOverrides = JSON.parse(localStorage.getItem('douyin_effects_states_v3') || '{}');
        if (!userOverrides[id]) userOverrides[id] = {};
        userOverrides[id].hidden = !userOverrides[id].hidden;
        localStorage.setItem('douyin_effects_states_v3', JSON.stringify(userOverrides));
        renderEffectsGrid();
    } catch(e) { console.error(e); }
}

function toggleEffectPinned(id) {
    try {
        let userOverrides = JSON.parse(localStorage.getItem('douyin_effects_states_v3') || '{}');
        if (!userOverrides[id]) userOverrides[id] = {};
        let isNowPinned = !userOverrides[id].pinned;
        userOverrides[id].pinned = isNowPinned;
        localStorage.setItem('douyin_effects_states_v3', JSON.stringify(userOverrides));

        let pinnedIds = [];
        try { pinnedIds = JSON.parse(localStorage.getItem('douyin_effects_pinned_order') || '[]'); } catch(e) {}

        if (isNowPinned) {
            if (!pinnedIds.includes(id)) pinnedIds.push(id);
        } else {
            pinnedIds = pinnedIds.filter(pid => pid !== id);
        }
        localStorage.setItem('douyin_effects_pinned_order', JSON.stringify(pinnedIds));
        renderEffectsGrid();
    } catch(e) { console.error(e); }
}

function movePinnedOrder(id, direction) {
    try {
        let pinnedIds = [];
        try { pinnedIds = JSON.parse(localStorage.getItem('douyin_effects_pinned_order') || '[]'); } catch(e) {}
        let idx = pinnedIds.indexOf(id);
        if (idx === -1) return;

        let targetIdx = idx + direction;
        if (targetIdx >= 0 && targetIdx < pinnedIds.length) {
            let temp = pinnedIds[idx];
            pinnedIds[idx] = pinnedIds[targetIdx];
            pinnedIds[targetIdx] = temp;
            localStorage.setItem('douyin_effects_pinned_order', JSON.stringify(pinnedIds));
            renderEffectsGrid();
        }
    } catch(e) { console.error(e); }
}

function deleteEffect(id, isCustom) {
    if (!confirm('确定要删除这款特效吗？')) return;
    try {
        if (isCustom) {
            let customList = JSON.parse(localStorage.getItem('douyin_custom_effects_v3') || '[]');
            customList = customList.filter(item => item.id !== id);
            localStorage.setItem('douyin_custom_effects_v3', JSON.stringify(customList));
        } else {
            let userOverrides = JSON.parse(localStorage.getItem('douyin_effects_states_v3') || '{}');
            if (!userOverrides[id]) userOverrides[id] = {};
            userOverrides[id].deleted = true;
            userOverrides[id].pinned = false;
            localStorage.setItem('douyin_effects_states_v3', JSON.stringify(userOverrides));

            let pinnedIds = [];
            try { pinnedIds = JSON.parse(localStorage.getItem('douyin_effects_pinned_order') || '[]'); } catch(e) {}
            pinnedIds = pinnedIds.filter(pid => pid !== id);
            localStorage.setItem('douyin_effects_pinned_order', JSON.stringify(pinnedIds));
        }
        renderEffectsGrid();
        const binBox = document.getElementById('hidden-bin-container');
        if (binBox && binBox.style.display === 'block') renderHiddenBinList();
    } catch(e) { console.error(e); }
}