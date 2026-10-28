// ============================================================
// app-runtime.js — 全局运行时（P0-2）
// 职责：错误环形缓冲 + 未捕获异常统一入口
// 依赖：utils.js（window.Utils.log）
// ============================================================

window.AppRuntime = window.AppRuntime || {};
window.AppRuntime.errors = [];
window.AppRuntime.errorBanner = null;

(function () {
    // 顶部红条：5 秒后自动消失，点一下可以看详情
    function showErrorBanner(message, detail) {
        let bar = document.getElementById('app-error-banner');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'app-error-banner';
            bar.style.cssText =
                'position:fixed;top:0;left:0;right:0;z-index:99999;' +
                'background:#f85149;color:#fff;padding:8px 12px;font-size:12px;' +
                'font-family:monospace;box-shadow:0 2px 8px rgba(0,0,0,0.4);' +
                'cursor:pointer;display:flex;gap:10px;align-items:center;';
            bar.title = '点击查看详情';
            bar.addEventListener('click', () => {
                console.group('❌ 最近错误');
                window.AppRuntime.errors.slice().reverse().forEach(e => {
                    console.log('[' + e.level + ']', new Date(e.time).toLocaleTimeString(), e.args);
                });
                console.groupEnd();
            });
            document.body.appendChild(bar);
        }
        bar.innerHTML = '⚠️ ' + Utils.string.escapeHtml(String(message)) +
            ' <span style="opacity:0.7;">（点击查看详情，5 秒后自动关闭）</span>';
        if (window.AppRuntime._bannerTimer) clearTimeout(window.AppRuntime._bannerTimer);
        window.AppRuntime._bannerTimer = setTimeout(() => {
            if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
        }, 5000);
    }

    window.AppRuntime.showErrorBanner = showErrorBanner;

    // 未捕获的同步错误
    window.addEventListener('error', (e) => {
        const msg = (e && e.message) || '未知错误';
        const where = (e && e.filename ? e.filename.split('/').pop() : '') +
                      (e && e.lineno ? ':' + e.lineno : '');
        Utils.log.error('[GlobalError]', msg, where, e.error);
        showErrorBanner(msg + (where ? ' @ ' + where : ''));
    });

    // 未捕获的 Promise 错误
    window.addEventListener('unhandledrejection', (e) => {
        const reason = e && e.reason;
        const msg = (reason && reason.message) || String(reason || 'Promise 未捕获错误');
        Utils.log.error('[UnhandledRejection]', reason);
        showErrorBanner(msg);
    });

    console.log('[AppRuntime] ✅ 全局错误捕获已就位');
})();