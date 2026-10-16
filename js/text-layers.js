// Canva Standard Rich Text Formatting on Selection & Top Toolbar Controls
function initTextLayersModule() {
    setupTopToolbarEvents();
    setupContextMenuEvents();
}

function applyFormattingToSelection(command, value = null) {
    document.execCommand(command, false, value);
}

function setupTopToolbarEvents() {
    const fontSelect = document.getElementById('tb-font');
    if (fontSelect) {
        fontSelect.addEventListener('change', (e) => {
            if (state.editingLayerId) {
                applyFormattingToSelection('fontName', e.target.value);
            } else {
                const layer = state.getSelectedLayer();
                if (layer) { 
                    layer.fontFamily = e.target.value; 
                    state.saveState(); // 记录历史
                    renderCanvas(); 
                }
            }
        });
    }

    const fontSizeSelect = document.getElementById('tb-fontsize');
    if (fontSizeSelect) {
        fontSizeSelect.addEventListener('change', (e) => {
            const layer = state.getSelectedLayer();
            if (layer) { 
                layer.fontSize = e.target.value; 
                state.saveState(); // 记录历史
                renderCanvas(); 
            }
        });
    }

    const colorPicker = document.getElementById('tb-color');
    if (colorPicker) {
        colorPicker.addEventListener('input', (e) => {
            if (state.editingLayerId) {
                applyFormattingToSelection('foreColor', e.target.value);
            } else {
                const layer = state.getSelectedLayer();
                if (layer) { 
                    layer.color = e.target.value; 
                    state.saveState(); // 记录历史
                    renderCanvas(); 
                }
            }
        });
    }

    const bgColorPicker = document.getElementById('tb-bgcolor');
    if (bgColorPicker) {
        bgColorPicker.addEventListener('input', (e) => {
            if (state.editingLayerId) {
                applyFormattingToSelection('hiliteColor', e.target.value);
            } else {
                const layer = state.getSelectedLayer();
                if (layer) { 
                    layer.bgColor = e.target.value; 
                    state.saveState(); // 记录历史
                    renderCanvas(); 
                }
            }
        });
    }

    const bindCommand = (id, cmd) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => {
                if (state.editingLayerId) {
                    applyFormattingToSelection(cmd);
                } else {
                    const layer = state.getSelectedLayer();
                    if (layer) {
                        const propMap = { bold: 'bold', italic: 'italic', underline: 'underline', strikeThrough: 'strike' };
                        const prop = propMap[cmd];
                        if (prop) layer[prop] = !layer[prop];
                        state.saveState(); // 记录历史
                        renderCanvas();
                    }
                }
            });
        }
    };

    bindCommand('tb-bold', 'bold');
    bindCommand('tb-italic', 'italic');
    bindCommand('tb-underline', 'underline');
    bindCommand('tb-strike', 'strikeThrough');
    bindCommand('tb-bullet', 'insertUnorderedList');

    ['left', 'center', 'right'].forEach(align => {
        const btn = document.getElementById(`tb-align-${align}`);
        if (btn) {
            btn.addEventListener('click', () => {
                const layer = state.getSelectedLayer();
                if (layer) {
                    layer.align = align;
                    state.saveState(); // 记录历史
                    renderCanvas();
                }
            });
        }
    });

    const verticalBtn = document.getElementById('tb-vertical');
    if (verticalBtn) {
        verticalBtn.addEventListener('click', () => {
            const layer = state.getSelectedLayer();
            if (layer) {
                layer.vertical = !layer.vertical;
                state.saveState(); // 记录历史
                renderCanvas();
            }
        });
    }

    const letterSpacing = document.getElementById('tb-letter-spacing');
    if (letterSpacing) {
        letterSpacing.addEventListener('input', (e) => {
            const layer = state.getSelectedLayer();
            if (layer) { 
                layer.letterSpacing = e.target.value + 'px'; 
                state.saveState(); // 记录历史
                renderCanvas(); 
            }
        });
    }

    const lineHeight = document.getElementById('tb-line-height');
    if (lineHeight) {
        lineHeight.addEventListener('input', (e) => {
            const layer = state.getSelectedLayer();
            if (layer) { 
                layer.lineHeight = e.target.value; 
                state.saveState(); // 记录历史
                renderCanvas(); 
            }
        });
    }

    const opacity = document.getElementById('tb-opacity');
    if (opacity) {
        opacity.addEventListener('input', (e) => {
            const layer = state.getSelectedLayer();
            if (layer) { 
                layer.opacity = parseFloat(e.target.value); 
                state.saveState(); // 记录历史
                renderCanvas(); 
            }
        });
    }
}

function updateTopToolbarUI(layer) {
    const toolbar = document.getElementById('text-toolbar');
    if (!layer || layer.type !== 'text') {
        toolbar.style.display = 'none';
        return;
    }
    toolbar.style.display = 'flex';

    document.getElementById('tb-font').value = layer.fontFamily || 'sans-serif';
    document.getElementById('tb-fontsize').value = layer.fontSize || '28px';
    document.getElementById('tb-color').value = layer.color || '#ffffff';
    document.getElementById('tb-bgcolor').value = layer.bgColor === 'transparent' ? '#000000' : layer.bgColor;
    document.getElementById('tb-bold').classList.toggle('active', !!layer.bold);
    document.getElementById('tb-italic').classList.toggle('active', !!layer.italic);
    document.getElementById('tb-underline').classList.toggle('active', !!layer.underline);
    document.getElementById('tb-strike').classList.toggle('active', !!layer.strike);
    ['left', 'center', 'right'].forEach(a => {
        document.getElementById(`tb-align-${a}`).classList.toggle('active', layer.align === a);
    });
    document.getElementById('tb-vertical').classList.toggle('active', !!layer.vertical);
    document.getElementById('tb-letter-spacing').value = parseInt(layer.letterSpacing) || 0;
    document.getElementById('tb-line-height').value = layer.lineHeight || 1.2;
    document.getElementById('tb-opacity').value = layer.opacity !== undefined ? layer.opacity : 1;
}

function setupContextMenuEvents() {
    const menu = document.getElementById('context-menu');
    
    document.addEventListener('click', () => {
        menu.style.display = 'none';
    });

    document.getElementById('ctx-copy').addEventListener('click', () => {
        const layer = state.getSelectedLayer();
        if (layer) {
            const clone = JSON.parse(JSON.stringify(layer));
            clone.id = 'layer-' + Date.now();
            clone.x += 20;
            clone.y += 20;
            state.addLayer(clone); // 内部已包含 saveState()
            renderCanvas();
            renderLayerList();
        }
    });

    document.getElementById('ctx-copy-style').addEventListener('click', () => {
        const layer = state.getSelectedLayer();
        if (layer) {
            state.copiedStyle = { ...layer };
            delete state.copiedStyle.id;
            delete state.copiedStyle.content;
            delete state.copiedStyle.x;
            delete state.copiedStyle.y;
            alert('图层样式已成功复制！');
        }
    });

    document.getElementById('ctx-paste').addEventListener('click', () => {
        const layer = state.getSelectedLayer();
        if (layer && state.copiedStyle) {
            Object.assign(layer, state.copiedStyle);
            state.saveState(); // 记录历史
            renderCanvas();
            updateTopToolbarUI(layer);
        }
    });

    document.getElementById('ctx-move-up').addEventListener('click', () => {
        if (state.selectedLayerId) {
            state.moveLayer(state.selectedLayerId, 'up'); // 内部已包含 saveState()
            renderCanvas();
            renderLayerList();
        }
    });

    document.getElementById('ctx-move-down').addEventListener('click', () => {
        if (state.selectedLayerId) {
            state.moveLayer(state.selectedLayerId, 'down'); // 内部已包含 saveState()
            renderCanvas();
            renderLayerList();
        }
    });

    document.getElementById('ctx-delete').addEventListener('click', () => {
        if (state.selectedLayerId) {
            state.removeLayer(state.selectedLayerId); // 内部已包含 saveState()
            renderCanvas();
            renderLayerList();
            updateTopToolbarUI(null);
        }
    });
}