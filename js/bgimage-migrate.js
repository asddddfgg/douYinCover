// ============================================================
// bgimage-migrate.js — BGImageDB → AssetRegistry 一次性迁移
// 职责边界：
//   ✅ 负责：页面加载时把老 BGImageDB 里的图片背景搬进 AssetRegistry
//   ❌ 不负责：渲染、面板（都不动）
// 依赖：BGImageDB / AssetRegistry
// 加载顺序：必须晚于 stickers.js（AssetRegistry）和 background-image.js（BGImageDB）
// ============================================================

(function () {
        const MIGRATE_FLAG = 'douyin_bgimage_migrated_to_asset_v2';

    async function migrateOnce() {
        if (localStorage.getItem(MIGRATE_FLAG) === 'done') return;
        if (!window.BGImageDB || !window.AssetRegistry) return;

        try {
            const legacy = await BGImageDB.getAllImages();
            if (!legacy.length) {
                localStorage.setItem(MIGRATE_FLAG, 'done');
                console.log('[BGImageMigrate] 无老数据，标记完成');
                return;
            }

            const map = JSON.parse(localStorage.getItem('douyin_bgimage_asset_map') || '{}');
            let migrated = 0;
            for (const it of legacy) {
                if (map[it.id]) continue; // 已迁移过
                try {
                    const assetId = await AssetRegistry.registerBgImage({
                        name: it.name || '背景图片',
                        data: it.dataUrl,
                        tags: ['bgImage', 'migrated'],
                        source: 'user'
                    });
                    map[it.id] = assetId;
                    migrated++;
                } catch (e) {
                    if (window.Utils && Utils.log) Utils.log.warn('[BGImageMigrate] 单条迁移失败:', it.id, e);
                    else console.warn('[BGImageMigrate] 单条迁移失败:', it.id, e);
                }
            }
            localStorage.setItem('douyin_bgimage_asset_map', JSON.stringify(map));
            localStorage.setItem(MIGRATE_FLAG, 'done');
            console.log('[BGImageMigrate] 迁移完成，共搬 ' + migrated + ' 条（老库保留一版）');
        } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[BGImageMigrate] 迁移失败:', e);
            else console.warn('[BGImageMigrate] 迁移失败:', e);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => { migrateOnce(); }, 800);
    });
})();