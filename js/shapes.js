// ============================================================
// shapes.js — 形状工具（矩形 / 圆 / 线 / 箭头）
// 职责边界：
//   ✅ 负责：形状图层（type:'shape'）的创建、渲染、几何、样式面板
//   ✅ 负责：左栏「形状」按钮 → 拖出绘制交互（配合 LeftRail.openShapeMenu）
//   ❌ 不负责：通用拖拽/缩放（由 drag.js 对 .canvas-layer 统一处理）
// 数据模型：
//   { id, type:'shape', shapeKind:'rect'|'ellipse'|'line'|'arrow',
//     x, y, width, height, rotation, opacity,
//     fill, stroke, strokeWidth, cornerRadius, arrowHead }
// 加载顺序：必须晚于 app.js（renderCanvas / state 就绪）
//          必须晚于 left-rail.js（LeftRail 会调 Shapes.setDrawMode）
// ============================================================

window.__SHAPES_READY__ = true;

const Shapes = (function () {
    const SHAPE_KINDS = ['rect', 'ellipse', 'line', 'arrow'];
    let activeDrawMode = null;
    let drawingState = null;

    function defaultAttrs(kind) {
        return {
            type: 'shape',
            shapeKind: kind,
            fill: kind === 'line' || kind === 'arrow' ? 'transparent' : '#ff2442',
            stroke: kind === 'line' || kind === 'arrow' ? '#ffffff' : '#000000',
            strokeWidth: kind === 'line' || kind === 'arrow' ? 4 : 0,
            cornerRadius: kind === 'rect' ? 8 : 0,
            arrowHead: kind === 'arrow' ? 'end' : 'none',
            rotation: 0,
            opacity: 1,
            flipH: false,
            flipV: false
        };
    }

    function createShape(kind, x, y, width, height, overrides) {
        if (!SHAPE_KINDS.includes(kind)) kind = 'rect';
        return Object.assign({
            id: 'shape-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            x: x != null ? x : 100,
            y: y != null ? y : 200,
            width: Math.max(10, width || 160),
            height: Math.max(10, height || 100)
        }, defaultAttrs(kind), overrides || {});
    }

    function buildShapeDom(layer) {
        const el = document.createElement('div');
        el.className = 'shape-layer-inner';
        el.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:visible;';
        const w = layer.width || 100;
        const h = layer.height || 100;
        const fill = layer.fill || 'transparent';
        const stroke = layer.stroke || 'transparent';
        const sw = layer.strokeWidth || 0;
        const kind = layer.shapeKind || 'rect';

        if (kind === 'rect') {
            const inner = document.createElement('div');
            inner.style.cssText = 'position:absolute;inset:0;background:' + fill +
                ';border:' + sw + 'px solid ' + stroke +
                ';border-radius:' + (layer.cornerRadius || 0) + 'px;box-sizing:border-box;';
            el.appendChild(inner);
        } else if (kind === 'ellipse') {
            const inner = document.createElement('div');
            inner.style.cssText = 'position:absolute;inset:0;background:' + fill +
                ';border:' + sw + 'px solid ' + stroke +
                ';border-radius:50%;box-sizing:border-box;';
            el.appendChild(inner);
        } else if (kind === 'line' || kind === 'arrow') {
            const svgNS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(svgNS, 'svg');
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
            svg.style.cssText = 'position:absolute;inset:0;overflow:visible;';
            const x1 = 0, y1 = h / 2, x2 = w, y2 = h / 2;
            const line = document.createElementNS(svgNS, 'line');
            line.setAttribute('x1', x1); line.setAttribute('y1', y1);
            line.setAttribute('x2', x2); line.setAttribute('y2', y2);
            line.setAttribute('stroke', stroke);
            line.setAttribute('stroke-width', sw);
            line.setAttribute('stroke-linecap', 'round');
            svg.appendChild(line);
            if (kind === 'arrow' && layer.arrowHead !== 'none') {
                const hl = Math.max(8, sw * 3);
                const hw = Math.max(6, sw * 2);
                const mk = (tx, ty, dir) => {
                    const poly = document.createElementNS(svgNS, 'polygon');
                    poly.setAttribute('points', [
                        [tx, ty],
                        [tx - dir * hl, ty - hw / 2],
                        [tx - dir * hl, ty + hw / 2]
                    ].map(p => p.join(',')).join(' '));
                    poly.setAttribute('fill', stroke);
                    return poly;
                };
                if (layer.arrowHead === 'end' || layer.arrowHead === 'both') svg.appendChild(mk(x2, y2, 1));
                if (layer.arrowHead === 'both') svg.appendChild(mk(x1, y1, -1));
            }
            el.appendChild(svg);
        }
        return el;
    }

    // 给 renderCanvas 打补丁：让它渲染 shape 内层 DOM（若 app.js 里已有分支则跳过）
    function installRendererPatch() {
        if (window.__shapeRenderPatched) return;
        const origRender = window.renderCanvas;
        if (typeof origRender !== 'function') {
            setTimeout(installRendererPatch, 300);
            return;
        }
        window.__shapeRenderPatched = true;
        window.renderCanvas = function () {
            const ret = origRender.apply(this, arguments);
            try {
                document.querySelectorAll('.canvas-layer.layer-type-shape').forEach(el => {
                    if (el.querySelector('.shape-layer-inner')) return;
                    const layerId = el.dataset.id;
                    let layer = null;
                    for (const p of state.pages) {
                        const found = p.layers.find(l => l.id === layerId);
                        if (found) { layer = found; break; }
                    }
                    if (!layer) return;
                    el.appendChild(buildShapeDom(layer));
                    el.style.background = 'transparent';
                    el.style.border = 'none';
                });
            } catch (e) {
                if (window.Utils && Utils.log) Utils.log.warn('[Shapes] 渲染补丁失败', e);
            }
            return ret;
        };
    }

    function setDrawMode(kind) {
        if (kind && !SHAPE_KINDS.includes(kind)) kind = null;
        activeDrawMode = kind;
        const container = document.querySelector('.canvas-container');
        if (container) container.classList.toggle('shape-drawing', !!kind);
        document.querySelectorAll('.cover-canvas').forEach(c => {
            c.style.cursor = kind ? 'crosshair' : '';
        });
        if (window.LeftRail && typeof LeftRail.setActive === 'function') {
            try { LeftRail.setActive(kind ? 'shape' : 'select'); } catch (e) {}
        }
    }

    function onPointerDown(e) {
        if (!activeDrawMode) return;
        if (e.button !== 0) return;
        if (e.target.isContentEditable) return;
        if (e.target.closest('.canvas-layer')) return;
        const canvas = e.target.closest('.cover-canvas');
        if (!canvas) return;
        const wrapper = canvas.closest('.canvas-page-wrapper');
        if (!wrapper || wrapper.dataset.pageId !== state.currentPageId) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / 360 || 1;
        const scaleY = rect.height / 640 || 1;
        const x = (e.clientX - rect.left) / scaleX;
        const y = (e.clientY - rect.top) / scaleY;
        const layer = createShape(activeDrawMode, x, y, 10, 10);
        state.addLayer(layer);
        drawingState = { startX: x, startY: y, layerId: layer.id, pageId: wrapper.dataset.pageId };
        renderAll();
        document.addEventListener('mousemove', onPointerMove, true);
        document.addEventListener('mouseup', onPointerUp, true);
    }

    function onPointerMove(e) {
        if (!drawingState) return;
        const canvas = document.querySelector(`.canvas-page-wrapper[data-page-id="${state.currentPageId}"] .cover-canvas`);
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / 360 || 1;
        const scaleY = rect.height / 640 || 1;
        const cx = (e.clientX - rect.left) / scaleX;
        const cy = (e.clientY - rect.top) / scaleY;
        const page = state.pages.find(p => p.id === drawingState.pageId);
        if (!page) return;
        const layer = page.layers.find(l => l.id === drawingState.layerId);
        if (!layer) return;
        const x = Math.min(cx, drawingState.startX);
        const y = Math.min(cy, drawingState.startY);
        const w = Math.max(10, Math.abs(cx - drawingState.startX));
        const h = Math.max(10, Math.abs(cy - drawingState.startY));
        layer.x = x; layer.y = y; layer.width = w; layer.height = h;
        const el = document.querySelector(`.canvas-layer[data-id="${layer.id}"]`);
        if (el) {
            el.style.left = x + 'px';
            el.style.top = y + 'px';
            el.style.width = w + 'px';
            el.style.height = h + 'px';
            const inner = el.querySelector('.shape-layer-inner');
            if (inner) inner.remove();
            el.appendChild(buildShapeDom(layer));
        }
    }

    function onPointerUp() {
        if (!drawingState) return;
        document.removeEventListener('mousemove', onPointerMove, true);
        document.removeEventListener('mouseup', onPointerUp, true);
        const page = state.pages.find(p => p.id === drawingState.pageId);
        if (page) {
            const layer = page.layers.find(l => l.id === drawingState.layerId);
            if (layer) {
                if (layer.width < 20 && layer.height < 20) {
                    page.layers = page.layers.filter(l => l.id !== layer.id);
                } else {
                    layer.width = Math.max(20, layer.width);
                    layer.height = Math.max(20, layer.height);
                }
            }
        }
        drawingState = null;
        state.saveState();
        renderAll();
        setDrawMode(null);
    }

    function ensureShapePanel() {
        let panel = document.getElementById('shape-panel');
        if (panel) return panel;
        const sidebarRight = document.querySelector('.sidebar-right');
        if (!sidebarRight) return null;
        panel = document.createElement('div');
        panel.id = 'shape-panel';
        panel.className = 'panel-section';
        panel.style.display = 'none';
        panel.innerHTML = `
            <h3><i class="fa-solid fa-shapes"></i> 形状样式</h3>
            <div class="control-group"><label>填充颜色</label>
                <input type="color" id="shape-fill" value="#ff2442" style="width:100%;height:32px;border:1px solid #30363d;border-radius:4px;background:none;cursor:pointer;">
                <button class="btn" id="shape-fill-clear" style="width:100%;margin-top:6px;justify-content:center;font-size:11px;">无填充</button>
            </div>
            <div class="control-group"><label>描边颜色</label>
                <input type="color" id="shape-stroke" value="#000000" style="width:100%;height:32px;border:1px solid #30363d;border-radius:4px;background:none;cursor:pointer;">
            </div>
            <div class="control-group"><label>描边粗细 <span id="shape-stroke-val">0</span>px</label>
                <input type="range" id="shape-stroke-width" min="0" max="20" value="0" style="width:100%;accent-color:#ff2442;">
            </div>
            <div class="control-group"><label>圆角 <span id="shape-radius-val">0</span>px</label>
                <input type="range" id="shape-radius" min="0" max="80" value="0" style="width:100%;accent-color:#ff2442;">
            </div>
        `;
        sidebarRight.appendChild(panel);
        const apply = (mut) => {
            const layer = state.getSelectedLayer();
            if (!layer || layer.type !== 'shape') return;
            mut(layer);
            state.saveState();
            renderAll();
        };
        panel.querySelector('#shape-fill').addEventListener('input', e => apply(l => l.fill = e.target.value));
        panel.querySelector('#shape-fill-clear').addEventListener('click', () => apply(l => l.fill = 'transparent'));
        panel.querySelector('#shape-stroke').addEventListener('input', e => apply(l => l.stroke = e.target.value));
        panel.querySelector('#shape-stroke-width').addEventListener('input', e => {
            const v = parseInt(e.target.value, 10);
            panel.querySelector('#shape-stroke-val').textContent = v;
            apply(l => l.strokeWidth = v);
        });
        panel.querySelector('#shape-radius').addEventListener('input', e => {
            const v = parseInt(e.target.value, 10);
            panel.querySelector('#shape-radius-val').textContent = v;
            apply(l => l.cornerRadius = v);
        });
        return panel;
    }

    function syncShapePanel() {
        const panel = ensureShapePanel();
        if (!panel) return;
        const layer = state.getSelectedLayer();
        if (!layer || layer.type !== 'shape') { panel.style.display = 'none'; return; }
        panel.style.display = 'block';
        const fill = panel.querySelector('#shape-fill');
        const stroke = panel.querySelector('#shape-stroke');
        const sw = panel.querySelector('#shape-stroke-width');
        const swV = panel.querySelector('#shape-stroke-val');
        const r = panel.querySelector('#shape-radius');
        const rV = panel.querySelector('#shape-radius-val');
        if (fill && /^#[0-9a-fA-F]{6}$/.test(layer.fill || '')) fill.value = layer.fill;
        if (stroke && /^#[0-9a-fA-F]{6}$/.test(layer.stroke || '')) stroke.value = layer.stroke;
        if (sw) sw.value = layer.strokeWidth || 0;
        if (swV) swV.textContent = layer.strokeWidth || 0;
        if (r) r.value = layer.cornerRadius || 0;
        if (rV) rV.textContent = layer.cornerRadius || 0;
    }

    function init() {
        installRendererPatch();
        document.addEventListener('pointerdown', onPointerDown, true);
        // 选中变化时刷新面板
        if (!window.__shapeSyncHooked) {
            window.__shapeSyncHooked = true;
            const origRender = window.renderCanvas;
            window.renderCanvas = function () {
                const ret = origRender.apply(this, arguments);
                try { syncShapePanel(); } catch (e) {}
                return ret;
            };
        }
        console.log('[Shapes] 初始化完成');
    }

    return { init, createShape, buildShapeDom, setDrawMode, SHAPE_KINDS };
})();

window.Shapes = Shapes;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { try { Shapes.init(); } catch (e) { console.warn('[Shapes] 初始化失败', e); } }, 300);
});