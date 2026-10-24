// ============================================================
// doodle.js —— 涂鸦画笔工具（draw 图层）
// 矢量对象模型：每一笔 = 一个 draw 图层，存 segments 点数组
// 渲染：一个专用 <canvas> 覆盖层统一绘制所有 draw 图层
// ============================================================


// 兜底：如果 drag.js 还没加载，本文件自己定义一个（逻辑完全一致）
if (typeof window.pointToSegmentDistance !== 'function') {
    window.pointToSegmentDistance = function (px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) {
            const ex = px - x1, ey = py - y1;
            return Math.sqrt(ex * ex + ey * ey);
        }
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const cx = x1 + t * dx, cy = y1 + t * dy;
        const ex = px - cx, ey = py - cy;
        return Math.sqrt(ex * ex + ey * ey);
    };
}



const Doodle = (function () {
    let active = false;            // 是否处于绘制模式
    let canvasEl = null;           // 每页的涂鸦画布
    let ctx = null;
    let currentStroke = null;      // 正在画的一笔
    let lastPoint = null;
    let lastTime = 0;
    let lastSpeed = 0;

    let shiftLineMode = false;     // 按住 Shift 时画直线
    let eraserMarks = new Set();   // 被橡皮擦标记的图层 id（松手才真删）
    let shiftStartPoint = null;    // 直线起点
    let brushColor = '#ff2442';
    let brushSize = 6;
    let brushMode = 'pen';         // pen | highlighter | eraser
    let autoClose = true;          // 端点靠近起点自动闭合

    // ---------- 工具函数 ----------
    function now() { return performance.now(); }

    function dist(a, b) {
        const dx = a.x - b.x, dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // 速度 → 压感（鼠标没有 pressure，用速度模拟：越快越细）
    function speedToPressure(speed) {
        // speed 单位 px/ms，典型 0~2
        const p = 1 - Math.min(speed, 2) / 2 * 0.7;  // 0.3 ~ 1
        return Math.max(0.3, p);
    }

    // ---------- 画布管理 ----------
        function ensureCanvasForPage(wrapper) {
        // canvas 要放进 .cover-canvas 里（.layers-wrapper 的兄弟节点）
        const canvasHost = wrapper.querySelector('.cover-canvas') || wrapper;
        let c = canvasHost.querySelector('.doodle-canvas');
        if (!c) {
            c = document.createElement('canvas');
            c.className = 'doodle-canvas';
            c.width = 360;
            c.height = 640;
            c.style.position = 'absolute';
            c.style.left = '0';
            c.style.top = '0';
            c.style.width = '360px';
            c.style.height = '640px';
            c.style.zIndex = '5';
            c.style.pointerEvents = 'none';
            const layersWrapper = canvasHost.querySelector('.layers-wrapper');
            if (layersWrapper && layersWrapper.parentNode === canvasHost) {
                canvasHost.insertBefore(c, layersWrapper);
            } else {
                canvasHost.appendChild(c);
            }
        }
        // 高清屏适配
        const dpr = window.devicePixelRatio || 1;
        if (c.width !== 360 * dpr) {
            c.width = 360 * dpr;
            c.height = 640 * dpr;
            c.style.width = '360px';
            c.style.height = '640px';
        }
        const cc = c.getContext('2d');
        cc.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { canvas: c, ctx: cc };
    }

    // ---------- 渲染所有 draw 图层 ----------
            let _redrawPending = false;
    function redrawDrawLayers() {
        if (_redrawPending) return;
        _redrawPending = true;
        requestAnimationFrame(() => {
            _redrawPending = false;
            _redrawDrawLayersNow();
        });
    }

        function _redrawDrawLayersNow() {
        document.querySelectorAll('.canvas-page-wrapper').forEach(wrapper => {
            // 拖动中只重绘当前页，其它页跳过（省掉每帧 90% 的绘制）
            if (window.__layerDragging && wrapper.dataset.pageId !== state.currentPageId) return;
            const pageId = wrapper.dataset.pageId;
            const page = state.pages.find(p => p.id === pageId);
            if (!page) return;
            const { canvas, ctx: c } = ensureCanvasForPage(wrapper);
            const dpr = window.devicePixelRatio || 1;
            c.setTransform(dpr, 0, 0, dpr, 0, 0);
            c.clearRect(0, 0, 360, 640);

                        page.layers.forEach(layer => {
                if (layer.type !== 'draw') return;
                if (layer.opacity === 0) return;
                c.save();
                // 被橡皮擦标记的图层：32% 透明度显示
                const baseAlpha = layer.opacity !== undefined ? layer.opacity : 1;
                c.globalAlpha = eraserMarks.has(layer.id) ? baseAlpha * 0.32 : baseAlpha;
                // 绕图层中心旋转，然后平移到图层在画布上的位置
                const cx = layer.x + layer.width / 2;
                const cy = layer.y + layer.height / 2;
                c.translate(cx, cy);
                if (layer.rotation) c.rotate(layer.rotation * Math.PI / 180);
                c.translate(-layer.width / 2, -layer.height / 2);
                drawStroke(c, layer);
                c.restore();
            });

                        // 正在画的一笔（实时预览）：currentStroke 的坐标是页面绝对坐标，
            // 不需要任何 translate，直接画在 (0,0) 起点即可
            if (currentStroke && currentStroke.pageId === pageId) {
                c.save();
                c.globalAlpha = currentStroke.opacity !== undefined ? currentStroke.opacity : 1;
                drawStroke(c, currentStroke);
                c.restore();
            }
        });
    }

    // ---------- 绘制一笔 ----------
    function drawStroke(c, stroke) {
        if (!stroke.segments || stroke.segments.length === 0) return;

        if (stroke.mode === 'eraser') {
            c.globalCompositeOperation = 'destination-out';
            c.strokeStyle = 'rgba(0,0,0,1)';
        } else {
            c.globalCompositeOperation = 'source-over';
            c.strokeStyle = stroke.color;
        }
        c.lineCap = 'round';
        c.lineJoin = 'round';

                stroke.segments.forEach(seg => {
            if (seg.points.length < 2) return;

            // 直线段：Shift 画出来的
            if (seg.type === 'straight') {
                const p0 = seg.points[0];
                const p1 = seg.points[seg.points.length - 1];
                c.lineWidth = stroke.strokeWidth;
                c.beginPath();
                c.moveTo(p0.x, p0.y);
                c.lineTo(p1.x, p1.y);
                c.stroke();
                return;
            }

            if (stroke.mode === 'pen' || stroke.mode === 'eraser') {
                // 分节绘制，每节按压力设 lineWidth（速度压感）
                for (let i = 1; i < seg.points.length; i++) {
                    const p0 = seg.points[i - 1];
                    const p1 = seg.points[i];
                    const pressure = p1.pressure !== undefined ? p1.pressure : 0.7;
                    c.lineWidth = Math.max(0.5, stroke.strokeWidth * pressure);
                    c.beginPath();
                    c.moveTo(p0.x, p0.y);
                    // 二次贝塞尔让曲线更顺
                    if (i < seg.points.length - 1) {
                        const p2 = seg.points[i + 1];
                        const mx = (p1.x + p2.x) / 2;
                        const my = (p1.y + p2.y) / 2;
                        c.quadraticCurveTo(p1.x, p1.y, mx, my);
                    } else {
                        c.lineTo(p1.x, p1.y);
                    }
                    c.stroke();
                }
            } else if (stroke.mode === 'highlighter') {
                c.lineWidth = stroke.strokeWidth;
                c.globalAlpha = (stroke.opacity !== undefined ? stroke.opacity : 1) * 0.35;
                c.beginPath();
                c.moveTo(seg.points[0].x, seg.points[0].y);
                for (let i = 1; i < seg.points.length; i++) {
                    c.lineTo(seg.points[i].x, seg.points[i].y);
                }
                c.stroke();
            }
        });
    }

    // ---------- 事件：开始画 ----------
    function onPointerDown(e) {
        if (!active) return;
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        // 只在本页画布上画
        const canvas = e.target.closest('.cover-canvas');
        if (!canvas) return;
        const wrapper = canvas.closest('.canvas-page-wrapper');
        if (!wrapper || wrapper.dataset.pageId !== state.currentPageId) return;

        e.preventDefault();
        e.stopPropagation();

        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / 360;
        const scaleY = rect.height / 640;
        const x = (e.clientX - rect.left) / scaleX;
        const y = (e.clientY - rect.top) / scaleY;

                shiftLineMode = !!e.shiftKey && brushMode === 'pen';
        shiftStartPoint = { x, y };
        if (brushMode === 'eraser') {
            eraserMarks = new Set();
        }
        currentStroke = {
            id: 'draw-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            pageId: wrapper.dataset.pageId,
            mode: brushMode,
            color: brushColor,
            strokeWidth: brushMode === 'highlighter' ? brushSize * 3 : brushSize,
            opacity: brushMode === 'highlighter' ? 1 : 1,
            segments: [{ type: shiftLineMode ? 'straight' : 'free', points: [{ x, y, pressure: 1 }] }],
            closed: false
        };
        lastPoint = { x, y };
        lastTime = now();
        lastSpeed = 0;

        canvas.setPointerCapture(e.pointerId);
        redrawDrawLayers();
    }

    // ---------- 事件：画的过程中 ----------
    function onPointerMove(e) {
        if (!active || !currentStroke) return;
        const canvas = e.target.closest('.cover-canvas');
        if (!canvas) return;
        const wrapper = canvas.closest('.canvas-page-wrapper');
        if (!wrapper || wrapper.dataset.pageId !== currentStroke.pageId) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / 360;
        const scaleY = rect.height / 640;
        const x = (e.clientX - rect.left) / scaleX;
        const y = (e.clientY - rect.top) / scaleY;


                // 橡皮擦模式：检测鼠标经过的笔迹路径，标记但暂不删除
        if (brushMode === 'eraser') {
            const page = state.pages.find(p => p.id === currentStroke.pageId);
            if (page && typeof isPointNearDrawLayer === 'function') {
                // 橡皮擦本身的容差也参与判断：鼠标到笔迹距离 <= 橡皮半径 + 笔迹半宽
                const eraserRadius = currentStroke.strokeWidth / 2;
                page.layers.forEach(layer => {
                    if (layer.type !== 'draw') return;
                    if (eraserMarks.has(layer.id)) return;
                    // 用路径命中测试，容差 = 笔迹半宽 + 橡皮半径 + 4px
                    const tol = Math.max(layer.strokeWidth || 4, 10) + eraserRadius + 4;
                    // 临时把 isPointNearDrawLayer 的容差拉大，直接复用它的路径距离算法
                    const hit = (function () {
                        if (!layer.segments) return false;
                        let lx = x - layer.x, ly = y - layer.y;
                        const rot = (layer.rotation || 0) * Math.PI / 180;
                        if (rot) {
                            const cx = layer.width / 2, cy = layer.height / 2;
                            const dx = lx - cx, dy = ly - cy;
                            const cos = Math.cos(-rot), sin = Math.sin(-rot);
                            lx = cx + dx * cos - dy * sin;
                            ly = cy + dx * sin + dy * cos;
                        }
                        for (const seg of layer.segments) {
                            const pts = seg.points || [];
                            for (let i = 1; i < pts.length; i++) {
                                const d = pointToSegmentDistance(lx, ly, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
                                if (d <= tol) return true;
                            }
                        }
                        return false;
                    })();
                    if (hit) eraserMarks.add(layer.id);
                });
            }
            redrawDrawLayers();
            return;
        }


                const seg = currentStroke.segments[0];

        // Shift 直线模式：只保留起点和当前点，按 15° 吸附
        if (shiftLineMode && shiftStartPoint) {
            let dx = x - shiftStartPoint.x;
            let dy = y - shiftStartPoint.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0) {
                const angle = Math.atan2(dy, dx);
                const snapped = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
                const nx = shiftStartPoint.x + Math.cos(snapped) * len;
                const ny = shiftStartPoint.y + Math.sin(snapped) * len;
                seg.points = [
                    { x: shiftStartPoint.x, y: shiftStartPoint.y, pressure: 1 },
                    { x: nx, y: ny, pressure: 1 }
                ];
            }
            redrawDrawLayers();
            return;
        }

        const t = now();
        const dt = Math.max(1, t - lastTime);
        const d = dist(lastPoint, { x, y });
        const speed = d / dt;  // px/ms
        lastSpeed = lastSpeed * 0.7 + speed * 0.3;  // 平滑

        // 距离阈值过滤：点太密就丢弃，线条更顺
        if (d < Math.max(1, currentStroke.strokeWidth * 0.3)) return;

        const pressure = speedToPressure(lastSpeed);
        seg.points.push({ x, y, pressure });
        lastPoint = { x, y };
        lastTime = t;

        redrawDrawLayers();
    }

    // ---------- 事件：抬笔，把这一笔变成图层 ----------
        function onPointerUp(e) {
        if (!active || !currentStroke) return;
        const stroke = currentStroke;

        // 橡皮擦松手：真正删除被标记的图层
        if (brushMode === 'eraser') {
            const pageId = stroke.pageId;
            const page = state.pages.find(p => p.id === pageId);
            if (page && eraserMarks.size > 0) {
                const before = page.layers.length;
                page.layers = page.layers.filter(l => !eraserMarks.has(l.id));
                // 同步选中状态
                if (eraserMarks.has(state.selectedLayerId)) state.selectedLayerId = null;
                if (state.selectedLayerIds) {
                    state.selectedLayerIds = state.selectedLayerIds.filter(id => !eraserMarks.has(id));
                }
                state.saveState();
                console.log(`橡皮擦删除了 ${before - page.layers.length} 个图层`);
            }
            eraserMarks.clear();
            currentStroke = null;
            renderAll();
            if (active) setDrawMode(true);
            return;
        }

        // 少于 2 个点，当作点击忽略（避免误点产生小圆点）
        if (stroke.segments[0].points.length < 2 && brushMode !== 'eraser') {
            currentStroke = null;
            redrawDrawLayers();
            return;
        }

        // 自动闭合：端点靠近起点
        if (autoClose && stroke.mode === 'pen') {
            const pts = stroke.segments[0].points;
            if (pts.length > 6) {
                const first = pts[0];
                const last = pts[pts.length - 1];
                if (dist(first, last) < 12) {
                    stroke.closed = true;
                    pts.push({ x: first.x, y: first.y, pressure: first.pressure });
                }
            }
        }

        // 计算包围盒
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        stroke.segments.forEach(seg => {
            seg.points.forEach(p => {
                if (p.x < minX) minX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxY) maxY = p.y;
            });
        });
        const pad = stroke.strokeWidth;
        const layerW = Math.max(10, maxX - minX + pad * 2);
        const layerH = Math.max(10, maxY - minY + pad * 2);

        // 把点坐标转成相对图层左上角（图层内部坐标系）
        const offsetX = minX - pad;
        const offsetY = minY - pad;
        stroke.segments.forEach(seg => {
            seg.points.forEach(p => {
                p.x -= offsetX;
                p.y -= offsetY;
            });
        });

        const newLayer = {
            id: stroke.id,
            type: 'draw',
            segments: stroke.segments,
            mode: stroke.mode,
            color: stroke.color,
            strokeWidth: stroke.strokeWidth,
            closed: stroke.closed,
            opacity: 1,
            rotation: 0,
            flipH: false,
            flipV: false,
            x: offsetX,
            y: offsetY,
            width: layerW,
            height: layerH
        };

        currentStroke = null;
        state.addLayer(newLayer);
        renderAll();
        // 绘制模式下保持画笔激活
        if (active) setDrawMode(true);
    }

    // ---------- 进入/退出绘制模式 ----------
    function setDrawMode(on) {
        active = on;
        if (!on) eraserMarks.clear();
        const container = document.querySelector('.canvas-container');
        if (container) {
            container.classList.toggle('doodle-active', on);
        }
        document.querySelectorAll('.cover-canvas').forEach(c => {
            c.style.cursor = on ? 'crosshair' : '';
        });
        // 刷新按钮状态
        const btn = document.getElementById('btn-doodle');
        if (btn) btn.classList.toggle('active', on);
        if (on) redrawDrawLayers();
    }

    // ---------- 初始化 ----------
        function init() {
        // 创建笔刷圆圈预览
        let brushCursor = document.getElementById('doodle-brush-cursor');
        if (!brushCursor) {
            brushCursor = document.createElement('div');
            brushCursor.id = 'doodle-brush-cursor';
            brushCursor.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;border:1.5px solid rgba(255,255,255,0.9);border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,0.6);display:none;transform:translate(-50%,-50%);';
            document.body.appendChild(brushCursor);
        }

        // Esc 退出绘制模式
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && active) {
                setDrawMode(false);
            }
        }, true);

        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('pointermove', onPointerMove, true);
        document.addEventListener('pointerup', onPointerUp, true);
        document.addEventListener('pointercancel', onPointerUp, true);

        // 工具栏按钮
        const btn = document.getElementById('btn-doodle');
        if (btn) {
            btn.addEventListener('click', () => {
                setDrawMode(!active);
            });
        }

        // 画笔颜色
                const colorInput = document.getElementById('doodle-color');
        if (colorInput) {
            colorInput.addEventListener('input', (e) => {
                brushColor = e.target.value;
                // 颜色切换后立即刷新圆圈边框色
                const cursor = document.getElementById('doodle-brush-cursor');
                if (cursor && cursor.style.display !== 'none') {
                    cursor.style.borderColor = brushMode === 'eraser'
                        ? 'rgba(255,80,80,0.9)'
                        : brushColor;
                }
            });
        }
        // 粗细
        const sizeInput = document.getElementById('doodle-size');
        const sizeVal = document.getElementById('doodle-size-val');
        if (sizeInput) {
                        sizeInput.addEventListener('input', (e) => {
                brushSize = parseInt(e.target.value, 10) || 6;
                if (sizeVal) sizeVal.textContent = brushSize;
                // 实时更新圆圈大小（下一次 mousemove 会自动刷新，这里主动刷一次）
                const cursor = document.getElementById('doodle-brush-cursor');
                if (cursor && cursor.style.display !== 'none') {
                    const canvas = document.querySelector('.canvas-page-wrapper.active-page .cover-canvas');
                    if (canvas) {
                        const scale = canvas.getBoundingClientRect().width / 360;
                        const size = (brushMode === 'highlighter' ? brushSize * 3 : brushSize) * scale;
                        cursor.style.width = size + 'px';
                        cursor.style.height = size + 'px';
                    }
                }
            });
        }
        // 模式切换
                document.querySelectorAll('.doodle-mode-btn').forEach(b => {
            b.addEventListener('click', () => {
                document.querySelectorAll('.doodle-mode-btn').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                brushMode = b.dataset.mode;
                // 切换模式后立即刷新圆圈颜色和大小
                const cursor = document.getElementById('doodle-brush-cursor');
                if (cursor && cursor.style.display !== 'none') {
                    const canvas = document.querySelector('.canvas-page-wrapper.active-page .cover-canvas');
                    if (canvas) {
                        const scale = canvas.getBoundingClientRect().width / 360;
                        const size = (brushMode === 'highlighter' ? brushSize * 3 : brushSize) * scale;
                        cursor.style.width = size + 'px';
                        cursor.style.height = size + 'px';
                    }
                    cursor.style.borderColor = brushMode === 'eraser'
                        ? 'rgba(255,80,80,0.9)'
                        : brushColor;
                }
            });
        });

        // 笔刷圆圈跟随鼠标
        document.addEventListener('mousemove', (e) => {
            const cursor = document.getElementById('doodle-brush-cursor');
            if (!cursor) return;
            if (!active) { cursor.style.display = 'none'; return; }
            const canvas = e.target.closest('.cover-canvas');
            if (!canvas) { cursor.style.display = 'none'; return; }
            const rect = canvas.getBoundingClientRect();
            const scale = rect.width / 360;
            const size = (brushMode === 'highlighter' ? brushSize * 3 : brushSize) * scale;
            cursor.style.display = 'block';
            cursor.style.width = size + 'px';
            cursor.style.height = size + 'px';
            cursor.style.left = e.clientX + 'px';
            cursor.style.top = e.clientY + 'px';
            cursor.style.borderColor = brushMode === 'eraser' ? 'rgba(255,80,80,0.9)' : 'rgba(255,255,255,0.9)';
        }, true);

        // 鼠标离开画布时隐藏圆圈
        document.addEventListener('mouseleave', () => {
            const cursor = document.getElementById('doodle-brush-cursor');
            if (cursor) cursor.style.display = 'none';
        }, true);


        // 自动闭合开关
        const closeInput = document.getElementById('doodle-autoclose');
        if (closeInput) {
            autoClose = closeInput.checked;
            closeInput.addEventListener('change', (e) => {
                autoClose = e.target.checked;
            });
        }
    }

    return {
        init,
        redrawDrawLayers,
        setDrawMode,
        isActive: () => active
    };
})();

window.Doodle = Doodle;