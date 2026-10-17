// ============================================================
// backdrop-textures.js
// Canvas 预渲染高质量纹理（生成一次并缓存为 dataURL）
// ============================================================
const BackdropTextures = (function () {
    const cache = new Map();   // key -> dataURL
    const TEX_SIZE = 256;      // 生成纹理的像素尺寸

    function makeCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        return c;
    }

    // 随机数（用于可控噪声，带种子保证同款纹理一致）
    function seededRandom(seed) {
        let s = seed % 2147483647;
        if (s <= 0) s += 2147483646;
        return function () {
            s = (s * 16807) % 2147483647;
            return (s - 1) / 2147483646;
        };
    }

    // ---------- 各纹理生成器 ----------
    function genKraft(color) {
        const c = makeCanvas(TEX_SIZE, TEX_SIZE);
        const ctx = c.getContext('2d');
        const rand = seededRandom(12345);
        ctx.fillStyle = color || '#d2b48c';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (let i = 0; i < 5000; i++) {
            const x = rand() * TEX_SIZE;
            const y = rand() * TEX_SIZE;
            const r = rand() * 0.8 + 0.2;
            const a = rand() * 0.15;
            ctx.fillStyle = `rgba(80,50,20,${a})`;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        for (let i = 0; i < 1500; i++) {
            const x = rand() * TEX_SIZE;
            const y = rand() * TEX_SIZE;
            ctx.fillStyle = `rgba(255,235,200,${rand() * 0.12})`;
            ctx.fillRect(x, y, rand() * 2 + 1, rand() * 2 + 1);
        }
        return c.toDataURL('image/png');
    }

    function genFiber(color) {
        const c = makeCanvas(TEX_SIZE, TEX_SIZE);
        const ctx = c.getContext('2d');
        const rand = seededRandom(23456);
        ctx.fillStyle = color || '#f5efe0';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (let i = 0; i < 800; i++) {
            const x = rand() * TEX_SIZE;
            const y = rand() * TEX_SIZE;
            const len = rand() * 20 + 5;
            const angle = rand() * Math.PI;
            ctx.strokeStyle = `rgba(120,100,80,${rand() * 0.15})`;
            ctx.lineWidth = rand() * 0.8 + 0.2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
            ctx.stroke();
        }
        for (let i = 0; i < 2000; i++) {
            ctx.fillStyle = `rgba(255,255,255,${rand() * 0.3})`;
            ctx.fillRect(rand() * TEX_SIZE, rand() * TEX_SIZE, 1, 1);
        }
        return c.toDataURL('image/png');
    }

    function genWatercolor(color) {
        const c = makeCanvas(TEX_SIZE, TEX_SIZE);
        const ctx = c.getContext('2d');
        const rand = seededRandom(34567);
        ctx.fillStyle = color || '#f0f4f8';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (let i = 0; i < 60; i++) {
            const x = rand() * TEX_SIZE;
            const y = rand() * TEX_SIZE;
            const r = rand() * 40 + 20;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            const alpha = rand() * 0.06 + 0.02;
            g.addColorStop(0, `rgba(100,140,200,${alpha})`);
            g.addColorStop(1, 'rgba(100,140,200,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        for (let i = 0; i < 8000; i++) {
            ctx.fillStyle = `rgba(0,0,0,${rand() * 0.04})`;
            ctx.fillRect(rand() * TEX_SIZE, rand() * TEX_SIZE, 1, 1);
        }
        return c.toDataURL('image/png');
    }

    function genXuan(color) {
        const c = makeCanvas(TEX_SIZE, TEX_SIZE);
        const ctx = c.getContext('2d');
        const rand = seededRandom(45678);
        ctx.fillStyle = color || '#faf6ec';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (let i = 0; i < 120; i++) {
            const x = rand() * TEX_SIZE;
            ctx.strokeStyle = `rgba(180,160,120,${rand() * 0.15})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + rand() * 4 - 2, TEX_SIZE);
            ctx.stroke();
        }
        for (let i = 0; i < 1500; i++) {
            ctx.fillStyle = `rgba(200,180,140,${rand() * 0.12})`;
            ctx.fillRect(rand() * TEX_SIZE, rand() * TEX_SIZE, rand() * 3 + 1, 1);
        }
        return c.toDataURL('image/png');
    }

    function genParchment(color) {
        const c = makeCanvas(TEX_SIZE, TEX_SIZE);
        const ctx = c.getContext('2d');
        const rand = seededRandom(56789);
        ctx.fillStyle = color || '#f4e4c1';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (let i = 0; i < 40; i++) {
            const x = rand() * TEX_SIZE;
            const y = rand() * TEX_SIZE;
            const r = rand() * 60 + 20;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `rgba(140,100,50,${rand() * 0.12})`);
            g.addColorStop(1, 'rgba(140,100,50,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        const edgeGrad = ctx.createRadialGradient(TEX_SIZE/2, TEX_SIZE/2, TEX_SIZE*0.3, TEX_SIZE/2, TEX_SIZE/2, TEX_SIZE*0.7);
        edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');
        edgeGrad.addColorStop(1, 'rgba(80,50,20,0.25)');
        ctx.fillStyle = edgeGrad;
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        return c.toDataURL('image/png');
    }

    function genNewspaper(color) {
        const c = makeCanvas(TEX_SIZE, TEX_SIZE);
        const ctx = c.getContext('2d');
        const rand = seededRandom(67890);
        ctx.fillStyle = color || '#e8e4d8';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (let i = 0; i < 80; i++) {
            const y = rand() * TEX_SIZE;
            const w = rand() * 0.5 + 0.3;
            const x = rand() * TEX_SIZE * (1 - w);
            ctx.fillStyle = `rgba(60,60,60,${rand() * 0.3 + 0.1})`;
            ctx.fillRect(x, y, TEX_SIZE * w, rand() * 0.8 + 0.4);
        }
        for (let i = 0; i < 500; i++) {
            ctx.fillStyle = `rgba(120,90,40,${rand() * 0.08})`;
            ctx.fillRect(rand() * TEX_SIZE, rand() * TEX_SIZE, rand() * 2 + 1, rand() * 2 + 1);
        }
        return c.toDataURL('image/png');
    }

    function genChalkboard(color) {
        const c = makeCanvas(TEX_SIZE, TEX_SIZE);
        const ctx = c.getContext('2d');
        const rand = seededRandom(78901);
        ctx.fillStyle = color || '#2b3a32';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (let i = 0; i < 3000; i++) {
            ctx.fillStyle = `rgba(255,255,255,${rand() * 0.08})`;
            ctx.fillRect(rand() * TEX_SIZE, rand() * TEX_SIZE, rand() * 1.5 + 0.5, rand() * 1.5 + 0.5);
        }
        for (let i = 0; i < 30; i++) {
            const x = rand() * TEX_SIZE;
            const y = rand() * TEX_SIZE;
            const w = rand() * 80 + 20;
            ctx.fillStyle = `rgba(255,255,255,${rand() * 0.04})`;
            ctx.fillRect(x, y, w, rand() * 10 + 5);
        }
        return c.toDataURL('image/png');
    }

    function genCork(color) {
        const c = makeCanvas(TEX_SIZE, TEX_SIZE);
        const ctx = c.getContext('2d');
        const rand = seededRandom(89012);
        ctx.fillStyle = color || '#b88a4e';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (let i = 0; i < 4000; i++) {
            const x = rand() * TEX_SIZE;
            const y = rand() * TEX_SIZE;
            const r = rand() * 3 + 0.5;
            const brightness = rand();
            if (brightness > 0.5) {
                ctx.fillStyle = `rgba(160,110,50,${rand() * 0.5})`;
            } else {
                ctx.fillStyle = `rgba(220,180,120,${rand() * 0.4})`;
            }
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        return c.toDataURL('image/png');
    }

    function genCanvasTexture(color) {
        const c = makeCanvas(TEX_SIZE, TEX_SIZE);
        const ctx = c.getContext('2d');
        const rand = seededRandom(90123);
        ctx.fillStyle = color || '#e6dcc8';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (let y = 0; y < TEX_SIZE; y += 2) {
            ctx.strokeStyle = `rgba(180,160,120,${rand() * 0.15 + 0.05})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, y + rand() * 0.5);
            ctx.lineTo(TEX_SIZE, y + rand() * 0.5);
            ctx.stroke();
        }
        for (let x = 0; x < TEX_SIZE; x += 2) {
            ctx.strokeStyle = `rgba(180,160,120,${rand() * 0.15 + 0.05})`;
            ctx.beginPath();
            ctx.moveTo(x + rand() * 0.5, 0);
            ctx.lineTo(x + rand() * 0.5, TEX_SIZE);
            ctx.stroke();
        }
        return c.toDataURL('image/png');
    }

    function genLinen(color) {
        const c = makeCanvas(TEX_SIZE, TEX_SIZE);
        const ctx = c.getContext('2d');
        const rand = seededRandom(01234);
        ctx.fillStyle = color || '#f0ead8';
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (let i = 0; i < 600; i++) {
            const x = rand() * TEX_SIZE;
            const y = rand() * TEX_SIZE;
            const len = rand() * 15 + 5;
            const angle = (rand() > 0.5 ? 0 : Math.PI / 2) + (rand() - 0.5) * 0.3;
            ctx.strokeStyle = `rgba(160,140,100,${rand() * 0.25})`;
            ctx.lineWidth = rand() * 1.2 + 0.3;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
            ctx.stroke();
        }
        return c.toDataURL('image/png');
    }

    // ---------- 分发器 ----------
    const generators = {
        'kraft': genKraft,
        'fiber': genFiber,
        'watercolor': genWatercolor,
        'xuan': genXuan,
        'parchment': genParchment,
        'newspaper': genNewspaper,
        'chalkboard': genChalkboard,
        'cork': genCork,
        'canvas-texture': genCanvasTexture,
        'linen': genLinen
    };

    function get(type, color) {
        const key = type + '::' + (color || '_default');
        if (cache.has(key)) return cache.get(key);
        const fn = generators[type];
        if (!fn) return null;
        const dataUrl = fn(color);
        cache.set(key, dataUrl);
        return dataUrl;
    }

    function isCanvasTexture(type) {
        return !!generators[type];
    }

    return { get, isCanvasTexture };
})();

// 关键修复：顶层 const 不会自动挂到 window，必须显式挂载
window.BackdropTextures = BackdropTextures;