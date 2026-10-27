// ============================================================
// tooltip.js — 统一悬浮提示（工具栏按钮 / 图标按钮）
// 参数：延迟 400ms 显示，120ms 淡入，移出 100ms 淡出
// 用法：元素加 data-tooltip="粗体" 或保留 title 属性（会被自动接管）
// ============================================================

const TooltipModule = (function () {
    const SHOW_DELAY = 400;
    const FADE_IN = 120;
    const FADE_OUT = 100;

    let tipEl = null;
    let showTimer = null;
    let hideTimer = null;
    let currentTarget = null;

    function ensureTip() {
        if (tipEl) return tipEl;
        tipEl = document.createElement('div');
        tipEl.id = 'custom-tooltip';
        tipEl.style.cssText =
            'position:fixed; z-index:99999; pointer-events:none; ' +
            'background:#21262d; color:#e1e4e8; border:1px solid #30363d; ' +
            'border-radius:6px; padding:4px 8px; font-size:11px; line-height:1.4; ' +
            'white-space:nowrap; box-shadow:0 4px 12px rgba(0,0,0,0.5); ' +
            'opacity:0; transform:translateY(-2px); ' +
            'transition:opacity ' + FADE_IN + 'ms ease-out, transform ' + FADE_IN + 'ms ease-out;';
        document.body.appendChild(tipEl);
        return tipEl;
    }

    function position(target) {
        const el = ensureTip();
        const rect = target.getBoundingClientRect();
        const tipRect = el.getBoundingClientRect();
        let left = rect.left + rect.width / 2 - tipRect.width / 2;
        let top = rect.bottom + 6;
        if (left < 4) left = 4;
        if (left + tipRect.width > window.innerWidth - 4) {
            left = window.innerWidth - tipRect.width - 4;
        }
        if (top + tipRect.height > window.innerHeight - 4) {
            top = rect.top - tipRect.height - 6;
        }
        el.style.left = left + 'px';
        el.style.top = top + 'px';
    }

    function show(target, text) {
        const el = ensureTip();
        el.textContent = text;
        el.style.opacity = '0';
        el.style.display = 'block';
        // 先量一次，便于定位
        el.style.left = '-9999px';
        el.style.top = '0px';
        position(target);
        // 触发 fade-in
        requestAnimationFrame(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        });
    }

    function hide(immediate) {
        if (!tipEl) return;
        if (immediate) {
            tipEl.style.transition = 'none';
            tipEl.style.opacity = '0';
            tipEl.style.display = 'none';
            return;
        }
        tipEl.style.transition =
            'opacity ' + FADE_OUT + 'ms ease-out, transform ' + FADE_OUT + 'ms ease-out';
        tipEl.style.opacity = '0';
        tipEl.style.transform = 'translateY(-2px)';
        setTimeout(() => {
            if (tipEl && tipEl.style.opacity === '0') tipEl.style.display = 'none';
        }, FADE_OUT + 20);
    }

    function scheduleShow(target, text) {
        if (showTimer) clearTimeout(showTimer);
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        showTimer = setTimeout(() => {
            showTimer = null;
            currentTarget = target;
            show(target, text);
        }, SHOW_DELAY);
    }

    function cancelShow() {
        if (showTimer) { clearTimeout(showTimer); showTimer = null; }
    }

    function attach(el) {
        if (!el || el.dataset.tooltipBound === '1') return;
        const text = el.getAttribute('data-tooltip') || el.getAttribute('title') || '';
        if (!text) return;
        el.dataset.tooltipBound = '1';
        // 去掉原生 title，避免浏览器默认提示出现
        if (el.getAttribute('title')) el.removeAttribute('title');

        el.addEventListener('mouseenter', () => scheduleShow(el, text));
        el.addEventListener('mouseleave', () => {
            cancelShow();
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = setTimeout(() => hide(false), 0);
        });
        el.addEventListener('mousedown', () => {
            cancelShow();
            hide(true);
        });
        el.addEventListener('focus', () => scheduleShow(el, text));
        el.addEventListener('blur', () => { cancelShow(); hide(true); });
    }

    function scan(root) {
        const scope = root || document;
        const els = scope.querySelectorAll('[data-tooltip], [title]');
        els.forEach(el => {
            // 只接管工具栏按钮/图标按钮，避免影响标题类元素
            const tag = el.tagName.toLowerCase();
            const isColorInput = tag === 'input' && (el.type === 'color');
            const isInteractive = tag === 'button' || tag === 'a' || isColorInput ||
                el.classList.contains('tool-btn') ||
                el.classList.contains('btn') ||
                el.classList.contains('brand-logo-act-btn') ||
                el.classList.contains('sticker-panel-close');
            if (!isInteractive) return;
            attach(el);
        });
    }

    function init() {
        scan(document);
        // 监听 DOM 变化，自动接管新元素（比如 renderCanvas 重建的按钮）
        const mo = new MutationObserver((mutations) => {
            let needScan = false;
            for (const m of mutations) {
                if (m.type === 'childList' && m.addedNodes.length) {
                    needScan = true;
                    break;
                }
            }
            if (needScan) scan(document);
        });
        mo.observe(document.body, { childList: true, subtree: true });

        // 窗口滚动/尺寸变化时重定位
        window.addEventListener('scroll', () => {
            if (tipEl && tipEl.style.display === 'block' && currentTarget) {
                position(currentTarget);
            }
        }, true);
        window.addEventListener('resize', () => {
            if (tipEl && tipEl.style.display === 'block' && currentTarget) {
                position(currentTarget);
            }
        });

        console.log('[Tooltip] 初始化完成');
    }

    return { init, scan, attach };
})();

window.TooltipModule = TooltipModule;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { try { TooltipModule.init(); } catch (e) { console.warn(e); } }, 400);
});