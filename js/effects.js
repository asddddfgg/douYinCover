// Art Effects Library (Supports pin, hide, delete, batch upload with auto-rename duplicate protection, hidden bin, reordering & selectable copy modal)

/* ============================================================
   特效栏位分类 v1：文字 / 整层 × 置顶 / 普通
   ============================================================ */
const EFFECT_STATE_KEY = 'douyin_effects_states_v3';
const EFFECT_PINNED_TEXT_KEY = 'douyin_effects_pinned_order_text';
const EFFECT_PINNED_WHOLE_KEY = 'douyin_effects_pinned_order_whole';
const EFFECT_NORMAL_TEXT_KEY = 'douyin_effects_normal_order_text';
const EFFECT_NORMAL_WHOLE_KEY = 'douyin_effects_normal_order_whole';
const EFFECT_CATEGORY_OVERRIDES_KEY = 'douyin_effects_category_overrides';

function getEffectCategory(eff) {
    if (!eff) return 'text';
    let overrides = {};
    try { overrides = JSON.parse(localStorage.getItem(EFFECT_CATEGORY_OVERRIDES_KEY) || '{}'); } catch (e) {}
    if (overrides[eff.id]) return overrides[eff.id];

    if (typeof canEffectApplyToSelection === 'function') {
        return canEffectApplyToSelection(eff.css) ? 'text' : 'whole';
    }

    const c = (eff.css || '').toLowerCase();
    if (/(^|;|\s)border\s*:/.test(c)) return 'whole';
    if (c.includes('border-radius')) return 'whole';
    if (/(^|;|\s)padding\s*:/.test(c)) return 'whole';
    if (/(^|;|\s)animation\s*:/.test(c)) return 'whole';
    if (c.includes('backdrop-filter')) return 'whole';
    if (c.includes('clip-path')) return 'whole';
    if (c.includes('mix-blend-mode')) return 'whole';
    return 'text';
}

function getEffectOrder(cat, area) {
    const key = area === 'pinned'
        ? (cat === 'text' ? EFFECT_PINNED_TEXT_KEY : EFFECT_PINNED_WHOLE_KEY)
        : (cat === 'text' ? EFFECT_NORMAL_TEXT_KEY : EFFECT_NORMAL_WHOLE_KEY);
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
}

function saveEffectOrder(cat, area, ids) {
    const key = area === 'pinned'
        ? (cat === 'text' ? EFFECT_PINNED_TEXT_KEY : EFFECT_PINNED_WHOLE_KEY)
        : (cat === 'text' ? EFFECT_NORMAL_TEXT_KEY : EFFECT_NORMAL_WHOLE_KEY);
    try { localStorage.setItem(key, JSON.stringify(ids)); } catch (e) {}
}

function moveEffectToCategory(id, targetCat) {
    let overrides = {};
    try { overrides = JSON.parse(localStorage.getItem(EFFECT_CATEGORY_OVERRIDES_KEY) || '{}'); } catch (e) {}
    overrides[id] = targetCat;
    try { localStorage.setItem(EFFECT_CATEGORY_OVERRIDES_KEY, JSON.stringify(overrides)); } catch (e) {}

    let states = {};
    try { states = JSON.parse(localStorage.getItem(EFFECT_STATE_KEY) || '{}'); } catch (e) {}
    const isPinned = !!(states[id] && states[id].pinned);

    ['text', 'whole'].forEach(cat => {
        ['pinned', 'normal'].forEach(area => {
            const ids = getEffectOrder(cat, area).filter(x => x !== id);
            saveEffectOrder(cat, area, ids);
        });
    });

    if (isPinned) {
        const arr = getEffectOrder(targetCat, 'pinned');
        arr.unshift(id);
        saveEffectOrder(targetCat, 'pinned', arr);
    } else {
        const arr = getEffectOrder(targetCat, 'normal');
        arr.unshift(id);
        saveEffectOrder(targetCat, 'normal', arr);
    }

    if (typeof renderEffectsGrid === 'function') renderEffectsGrid();
    if (typeof showBgToast === 'function') {
        showBgToast(`已移到${targetCat === 'text' ? '文字特效' : '整层特效'}栏`);
    }
}

function restoreEffectCategory(id) {
    let overrides = {};
    try { overrides = JSON.parse(localStorage.getItem(EFFECT_CATEGORY_OVERRIDES_KEY) || '{}'); } catch (e) {}
    if (!overrides[id]) return;
    delete overrides[id];
    try { localStorage.setItem(EFFECT_CATEGORY_OVERRIDES_KEY, JSON.stringify(overrides)); } catch (e) {}

    ['text', 'whole'].forEach(cat => {
        ['pinned', 'normal'].forEach(area => {
            const ids = getEffectOrder(cat, area).filter(x => x !== id);
            saveEffectOrder(cat, area, ids);
        });
    });

    if (typeof renderEffectsGrid === 'function') renderEffectsGrid();
}

function migrateEffectOrdersIfNeeded() {
    const hasText = localStorage.getItem(EFFECT_PINNED_TEXT_KEY) !== null;
    const hasWhole = localStorage.getItem(EFFECT_PINNED_WHOLE_KEY) !== null;
    if (hasText || hasWhole) return;

    let oldPinned = [];
    try { oldPinned = JSON.parse(localStorage.getItem('douyin_effects_pinned_order') || '[]'); } catch (e) { return; }
    if (!Array.isArray(oldPinned) || oldPinned.length === 0) {
        saveEffectOrder('text', 'pinned', []);
        saveEffectOrder('whole', 'pinned', []);
        try { localStorage.removeItem('douyin_effects_pinned_order'); } catch (e) {}
        return;
    }

    const all = (typeof getAllEffectsMaster === 'function') ? getAllEffectsMaster() : [];
    const map = new Map(all.map(e => [e.id, e]));

    const textPinned = [];
    const wholePinned = [];
    oldPinned.forEach(id => {
        const eff = map.get(id);
        if (!eff) return;
        const cat = getEffectCategory(eff);
        if (cat === 'whole') wholePinned.push(id);
        else textPinned.push(id);
    });

    saveEffectOrder('text', 'pinned', textPinned);
    saveEffectOrder('whole', 'pinned', wholePinned);
    try { localStorage.removeItem('douyin_effects_pinned_order'); } catch (e) {}
}

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
    migrateEffectOrdersIfNeeded();
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
    migrateEffectOrdersIfNeeded();
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
    let cssRules = '';

    allEffects.forEach(eff => {
        if (eff.css) cssRules += `.${eff.id} { ${eff.css} }\n`;
    });
    styleTag.innerHTML = cssRules;

    const visible = allEffects.filter(eff => !eff.hidden);
    const textEffects = visible.filter(eff => getEffectCategory(eff) === 'text');
    const wholeEffects = visible.filter(eff => getEffectCategory(eff) === 'whole');

    function sortByOrder(list, cat, area) {
        const orderIds = getEffectOrder(cat, area);
        const map = new Map(list.map(e => [e.id, e]));
        const sorted = [];
        orderIds.forEach(id => {
            if (map.has(id)) {
                sorted.push(map.get(id));
                map.delete(id);
            }
        });
        list.forEach(eff => {
            if (map.has(eff.id)) {
                sorted.push(eff);
                map.delete(eff.id);
            }
        });
        return sorted;
    }

    function renderSection(cat, catTitle, catEffects) {
        if (catEffects.length === 0) return;

        const pinned = catEffects.filter(eff => eff.pinned);
        const normal = catEffects.filter(eff => !eff.pinned);
        const pinnedSorted = sortByOrder(pinned, cat, 'pinned');
        const normalSorted = sortByOrder(normal, cat, 'normal');

        const section = document.createElement('div');
        section.className = 'effects-section effects-section-' + cat;
        section.style.gridColumn = 'span 2';

        const catHeader = document.createElement('div');
        catHeader.className = 'effects-section-header';
        catHeader.innerHTML = cat === 'text'
            ? '<i class="fa-solid fa-font"></i> 文字特效'
            : '<i class="fa-solid fa-square-full"></i> 整层特效';
        section.appendChild(catHeader);

        const body = document.createElement('div');
        body.className = 'effects-section-body';

        pinnedSorted.forEach((eff, idx) => {
            body.appendChild(createEffectCardDOM(eff, idx, pinnedSorted.length, true));
        });

        if (pinnedSorted.length > 0 && normalSorted.length > 0) {
            const divider = document.createElement('div');
            divider.className = 'effects-section-divider';
            divider.style.gridColumn = 'span 2';
            body.appendChild(divider);
        }

        normalSorted.forEach((eff, idx) => {
            body.appendChild(createEffectCardDOM(eff, idx, normalSorted.length, false));
        });

        section.appendChild(body);
        grid.appendChild(section);
    }

    renderSection('text', '文字特效', textEffects);
    renderSection('whole', '整层特效', wholeEffects);
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
        handleEffectClick(eff);
        document.querySelectorAll('.effect-card').forEach(c => c.classList.remove('active'));
        const layer = state.getSelectedLayer();
        if (layer && layer.effectClass === eff.id) {
            card.classList.add('active');
        }
    });

    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showEffectContextMenu(e, eff);
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
    pinBtn.title = eff.pinned ? '取消置顶' : '置顶到本栏顶部';
    pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleEffectPinned(eff.id);
    });
    card.appendChild(pinBtn);

    const moveUp = document.createElement('div');
    moveUp.className = 'effect-action-btn btn-move-left';
    moveUp.innerHTML = '◀';
    moveUp.title = '向前移动（同区内）';
    if (pinIndex <= 0) {
        moveUp.style.opacity = '0.3';
        moveUp.style.pointerEvents = 'none';
    } else {
        moveUp.addEventListener('click', (e) => {
            e.stopPropagation();
            movePinnedOrder(eff.id, -1);
        });
    }
    card.appendChild(moveUp);

    const moveDown = document.createElement('div');
    moveDown.className = 'effect-action-btn btn-move-right';
    moveDown.innerHTML = '▶';
    moveDown.title = '向后移动（同区内）';
    if (pinIndex >= pinTotal - 1) {
        moveDown.style.opacity = '0.3';
        moveDown.style.pointerEvents = 'none';
    } else {
        moveDown.addEventListener('click', (e) => {
            e.stopPropagation();
            movePinnedOrder(eff.id, 1);
        });
    }
    card.appendChild(moveDown);

    return card;
}

function showEffectContextMenu(e, eff) {
    document.querySelectorAll('.effect-context-menu').forEach(m => m.remove());

    const cat = getEffectCategory(eff);
    const targetCat = cat === 'text' ? 'whole' : 'text';
    const targetLabel = targetCat === 'text' ? '文字特效' : '整层特效';

    let overrides = {};
    try { overrides = JSON.parse(localStorage.getItem(EFFECT_CATEGORY_OVERRIDES_KEY) || '{}'); } catch (err) {}
    const hasOverride = !!overrides[eff.id];

    const menu = document.createElement('div');
    menu.className = 'effect-context-menu';
    menu.style.cssText = 'position:fixed;z-index:99999;background:#161b22;border:1px solid #30363d;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,0.8);padding:4px 0;min-width:160px;font-size:12px;';

    function addItem(label, onClick, danger) {
        const item = document.createElement('div');
        item.style.cssText = 'padding:6px 14px;cursor:pointer;color:' + (danger ? '#f85149' : '#c9d1d9') + ';';
        item.textContent = label;
        item.addEventListener('mouseenter', () => { item.style.background = '#30363d'; });
        item.addEventListener('mouseleave', () => { item.style.background = ''; });
        item.addEventListener('click', (ev) => {
            ev.stopPropagation();
            menu.remove();
            onClick();
        });
        menu.appendChild(item);
    }

    addItem('移到' + targetLabel, () => {
        moveEffectToCategory(eff.id, targetCat);
    });

    if (hasOverride) {
        addItem('恢复默认分类', () => {
            restoreEffectCategory(eff.id);
            if (typeof showBgToast === 'function') {
                showBgToast('已恢复默认分类');
            }
        }, true);
    }

    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    let x = e.clientX;
    let y = e.clientY;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (x + rect.width > vw - 8) x = vw - rect.width - 8;
    if (y + rect.height > vh - 8) y = vh - rect.height - 8;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    const closeHandler = (ev) => {
        if (menu.contains(ev.target)) return;
        menu.remove();
        document.removeEventListener('mousedown', closeHandler, true);
    };
    setTimeout(() => {
        document.addEventListener('mousedown', closeHandler, true);
    }, 0);
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
                        if (existing.css.trim() === item.css.trim()) {
                            return;
                        }
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
        let userOverrides = JSON.parse(localStorage.getItem(EFFECT_STATE_KEY) || '{}');
        if (!userOverrides[id]) userOverrides[id] = {};
        const willPin = !userOverrides[id].pinned;
        userOverrides[id].pinned = willPin;
        localStorage.setItem(EFFECT_STATE_KEY, JSON.stringify(userOverrides));

        const all = getAllEffectsMaster();
        const eff = all.find(e => e.id === id);
        if (!eff) { renderEffectsGrid(); return; }
        const cat = getEffectCategory(eff);

        ['text', 'whole'].forEach(c => {
            ['pinned', 'normal'].forEach(area => {
                const ids = getEffectOrder(c, area).filter(x => x !== id);
                saveEffectOrder(c, area, ids);
            });
        });

        if (willPin) {
            const arr = getEffectOrder(cat, 'pinned');
            arr.unshift(id);
            saveEffectOrder(cat, 'pinned', arr);
        } else {
            const arr = getEffectOrder(cat, 'normal');
            arr.unshift(id);
            saveEffectOrder(cat, 'normal', arr);
        }

        renderEffectsGrid();
    } catch (e) { console.error(e); }
}

function movePinnedOrder(id, direction) {
    try {
        const all = getAllEffectsMaster();
        const eff = all.find(e => e.id === id);
        if (!eff) return;
        const cat = getEffectCategory(eff);

        const states = JSON.parse(localStorage.getItem(EFFECT_STATE_KEY) || '{}');
        const isPinned = !!(states[id] && states[id].pinned);
        const area = isPinned ? 'pinned' : 'normal';

        const ids = getEffectOrder(cat, area);
        const idx = ids.indexOf(id);
        if (idx === -1) return;

        const targetIdx = idx + direction;
        if (targetIdx < 0 || targetIdx >= ids.length) return;

        const temp = ids[idx];
        ids[idx] = ids[targetIdx];
        ids[targetIdx] = temp;
        saveEffectOrder(cat, area, ids);

        renderEffectsGrid();
    } catch (e) { console.error(e); }
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

        ['text', 'whole'].forEach(c => {
            ['pinned', 'normal'].forEach(area => {
                const ids = getEffectOrder(c, area).filter(x => x !== id);
                saveEffectOrder(c, area, ids);
            });
        });

        renderEffectsGrid();
        const binBox = document.getElementById('hidden-bin-container');
        if (binBox && binBox.style.display === 'block') renderHiddenBinList();
    } catch(e) { console.error(e); }
}