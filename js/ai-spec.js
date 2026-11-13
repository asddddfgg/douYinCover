// ============================================================
// ai-spec.js — AI 方案校验 / 分块 / 版面决策 / 应用 / 溢出检测
// 职责边界：
//   ✅ 负责：validateSpec / chunkBySeparator / analyzeChunk / decideLayout /
//            applyCoverSpec / normalizeSpecLayer / detectOverflows// 加载顺序：必须晚于 cover-templates.js / effects.js / brand-manager.js
// ============================================================

window.__AI_SPEC_READY__ = true;

/* ============================================================
   P0 护栏：品牌约束单一真源 = BrandManager
   本文件不声明任何品牌常量数组，所有品牌色 / 品牌背景 / 品牌字体
   一律从 BrandManager 的运行时 API 派生：
     BrandManager.getActiveColors()
     BrandManager.getActiveBgPresetIds()
     BrandManager.getActiveBgPresets()
     BrandManager.isStrictColors() / isStrictFonts()
   换品牌色 = 改数据不改代码，校验 / 契约 / 画布全链路自动跟随。
   特效 / 底衬 / 贴纸 / 上传素材永远不受品牌约束。
   ============================================================ */

/* ============================================================
   1. 校验器
   ============================================================ */
function collectBrandPalette(spec) {
    const out = [];
    const add = c => {
        if (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) out.push(c.toUpperCase());
    };
    try {
        if (window.BrandManager) {
            const active = (BrandManager.getActiveColors && BrandManager.getActiveColors()) || [];
            const all = (BrandManager.getAllColors && BrandManager.getAllColors()) || [];
            (active.length ? active : all).forEach(add);
        }
    } catch (e) {}
    if (!out.length && spec && Array.isArray(spec.pages)) {
        // BrandManager 没配时，退化为“从页面自身颜色推导”，保证仍有可用基准
        spec.pages.forEach(page => {
            if (!page) return;
            if (page.bg) {
                add(page.bg.color1);
                add(page.bg.color2);
                if (page.bg.presetId && Array.isArray(window.BG_PRESETS)) {
                    const preset = window.BG_PRESETS.find(p => p && p.id === page.bg.presetId);
                    if (preset) { add(preset.color1); add(preset.color2); }
                }
            }
            (page.layers || []).forEach(l => {
                if (!l) return;
                // 只收文字色作为“用户确实在用的颜色”参考；
                // bgColor/backdrop 可能是 AI 自己发明的金色块，不能拿它当品牌基准。
                add(l.color);
            });
        });
    }
    return Array.from(new Set(out));
}

/**
 * 统一品牌色守卫：特效参数默认色 / 渲染 CSS 硬编码色 / 行内 span 颜色
 * - strict=true：硬编码强色 / 行内非品牌色 → errors
 * - strict=false：特效参数品牌化；硬编码特效禁用；行内颜色替换为最近品牌色
 * 预览、质量分、应用前都应调用它，避免“预览金色、应用才变”的错觉。
 */
function sanitizeSpecBrand(spec, options) {
    options = options || {};
    const out = { palette: [], warnings: [], errors: [] };
    if (!spec || !Array.isArray(spec.pages) || !window.EffectBrandGuard) return out;
    const pal = (options.palette && options.palette.length ? options.palette : collectBrandPalette(spec))
        .map(c => String(c || '').toUpperCase())
        .filter(c => /^#[0-9A-F]{6}$/.test(c));
    out.palette = Array.from(new Set(pal));
    if (!out.palette.length) return out;
    const strict = options.strict === true;

    spec.pages.forEach((page, pi) => {
        const where = '第 ' + (pi + 1) + ' 页';
        (page && page.layers || []).forEach((layer, li) => {
            if (!layer || layer.type !== 'text') return;
            const lw = where + ' 图层 ' + (li + 1);
            try {
                // 图层文字色 / 色块底色 / 底衬色：大面积颜色必须精确品牌色或中性色
                ['color', 'bgColor', 'backdrop.color'].forEach(key => {
                    let val;
                    if (key === 'backdrop.color') val = layer.backdrop && layer.backdrop.color;
                    else val = layer[key];
                    if (!val || String(val).toLowerCase() === 'transparent') return;
                    const parsed = EffectBrandGuard.parseColor(val);
                    if (!parsed) return;
                    if (EffectBrandGuard.acceptable(parsed.hex, out.palette, 0)) return;
                    const near = EffectBrandGuard.nearest(parsed.hex, out.palette);
                    if (!near) return;
                    const msg = lw + '：' + key + ' ' + val + ' 不在品牌色板（最近 ' + near.hex + '）';
                    // 文字色保留严格模式语义（自测里有反例）；色块/底衬属于大面积装饰，直接规整
                    if (key === 'color' && strict) {
                        out.errors.push(msg);
                        return;
                    }
                    if (key === 'backdrop.color') layer.backdrop.color = near.hex;
                    else layer[key] = near.hex;
                    out.warnings.push(msg + '；已替换为品牌色');
                });

                if (layer.effectClass) {
                    const current = (layer.effectParams && layer.effectParams[layer.effectClass]) || {};
                    const audit = EffectBrandGuard.auditEffect(layer.effectClass, current, out.palette);
                    layer.effectParams = layer.effectParams || {};
                    layer.effectParams[layer.effectClass] = audit.resolved;
                    if (audit.changes.length) {
                        out.warnings.push(lw + '：特效 ' + layer.effectClass + ' 的颜色参数已改用品牌色（' +
                            audit.changes.map(c => c.key + ' ' + (c.from || '默认') + '→' + c.to).join('；') + '）');
                    }
                    if (audit.offenders.length) {
                        const msg = lw + '：特效 ' + layer.effectClass + ' 内含硬编码非品牌色 ' +
                            audit.offenders.map(o => o.raw + '（最近品牌色 ' + o.nearest + '）').join('、');
                        if (strict) {
                            out.errors.push(msg);
                        } else {
                            out.warnings.push(msg + '；已禁用该特效');
                            layer.effectClass = null;
                            delete layer.effectParams[layer.effectClass];
                        }
                    }
                }
                if (layer.content) {
                    const ca = EffectBrandGuard.auditContent(layer.content, out.palette);
                    if (ca.offenders.length) {
                        const msg = lw + '：文字内容含非品牌色 ' +
                            ca.offenders.map(o => o.raw + '（最近品牌色 ' + o.nearest + '）').join('、');
                        const fixed = EffectBrandGuard.replaceContentColors(layer.content, out.palette);
                        layer.content = fixed.text;
                        out.warnings.push(msg + '；已替换为最近品牌色');
                    }
                }
                // 底衬颜色（含 mark 的 markColor）统一按品牌语义解析：
                // 缺省 / 非品牌 HEX → 精确品牌色（大面积装饰直接规整，不报错）
                if (window.BackdropBrand && layer.backdrop && layer.backdrop.type && layer.backdrop.type !== 'none') {
                    const bd = BackdropBrand.resolve(layer, out.palette);
                    if (bd.changes.length) {
                        layer.backdrop = bd.backdrop;
                        out.warnings.push(lw + '：底衬颜色已按品牌色解析（' +
                            bd.changes.map(c => (c.key === 'color' ? '颜色' : '标记色') + ' ' + (c.from || '缺省') + '→' + c.to).join('；') + '）');
                    }
                }
                // 用户偏好：不要描边 → 把 stroke family 的特效替换成品牌色渐变
                if (window.EffectPrefs && EffectPrefs.getNoStroke && EffectPrefs.getNoStroke()) {
                    const ids = (Array.isArray(layer.effectClasses) && layer.effectClasses.length)
                        ? layer.effectClasses.slice()
                        : (layer.effectClass ? [layer.effectClass] : []);
                    if (ids.length) {
                        const replaced = [];
                        const nextIds = [];
                        ids.forEach(id => {
                            let fam = '';
                            try {
                                const p = (window.VisualRegistry && VisualRegistry.getPreset) ? VisualRegistry.getPreset(id) : null;
                                fam = p && p.family;
                            } catch (e) { }
                            if (fam === 'stroke') {
                                replaced.push(id);
                                if (nextIds.indexOf('effect-gold') < 0) nextIds.push('effect-gold');
                            } else if (nextIds.indexOf(id) < 0) {
                                nextIds.push(id);
                            }
                        });
                        if (replaced.length) {
                            layer.effectClasses = nextIds;
                            layer.effectClass = nextIds[0] || null;
                            layer.effectParams = layer.effectParams || {};
                            replaced.forEach(id => { delete layer.effectParams[id]; });
                            try {
                                const a = EffectBrandGuard.auditEffect('effect-gold', {}, out.palette);
                                layer.effectParams['effect-gold'] = a.resolved || {};
                            } catch (e) {
                                layer.effectParams['effect-gold'] = {};
                            }
                            out.warnings.push(lw + '：按「不要描边」偏好，已把 ' + replaced.join('、') + ' 替换为 effect-gold');
                        }
                    }
                }
            } catch (e) {
                out.warnings.push(lw + '：品牌色守卫失败 ' + (e && e.message ? e.message : e));
            }
        });
    });
    return out;
}

function validateSpec(spec) {
    const errors = [];
    const warnings = [];

    if (!spec || typeof spec !== 'object') {
        errors.push('spec 不是合法对象');
        return { ok: false, errors, warnings };
    }
    if (spec.format !== 'douyin-cover-spec') {
        errors.push('format 必须是 "douyin-cover-spec"');
        return { ok: false, errors, warnings };
    }
    if (spec.version !== 1) {
        warnings.push('spec.version 不是 1，可能不兼容');
    }
    if (!Array.isArray(spec.pages) || spec.pages.length === 0) {
        errors.push('pages 必须是非空数组');
        return { ok: false, errors, warnings };
    }
    if (spec.pages.length > 20) {
        errors.push('页数 ' + spec.pages.length + ' 超过上限 20，请精简或拆分');
    }

    const validEffects = new Set(
        (typeof getAllEffectsMaster === 'function')
            ? getAllEffectsMaster().map(e => e.id)
            : []
    );
    const validBackdrops = new Set(
        (typeof BACKDROP_PRESETS !== 'undefined' && Array.isArray(BACKDROP_PRESETS))
            ? BACKDROP_PRESETS.map(p => p.type)
            : []
    );
    let brandColors = new Set();
    let brandFonts = new Set();
    let brandBgPresetIds = new Set();
    let strictColors = false;
    let strictFonts = false;
    try {
        if (window.BrandManager) {
            const activeColors = (BrandManager.getActiveColors && BrandManager.getActiveColors()) || [];
            const allColors = (BrandManager.getAllColors && BrandManager.getAllColors()) || [];
            brandColors = new Set((activeColors.length ? activeColors : allColors).map(c => String(c).toUpperCase()));
            brandFonts = new Set(((BrandManager.data && BrandManager.data.fonts) || []).map(f => f.name));
            brandBgPresetIds = new Set((BrandManager.getActiveBgPresetIds && BrandManager.getActiveBgPresetIds()) || []);
            strictColors = !!(BrandManager.isStrictColors && BrandManager.isStrictColors());
            strictFonts = !!(BrandManager.isStrictFonts && BrandManager.isStrictFonts());
        }
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 读取品牌约束失败', e);
    }

    const HEX_RE = /^#[0-9a-fA-F]{6}$/;

    // 统一品牌色守卫：必须在校验/预览/应用之前执行
    try {
        const brandSanitize = sanitizeSpecBrand(spec, {
            palette: Array.from(brandColors),
            strict: strictColors
        });
        brandSanitize.palette.forEach(c => brandColors.add(c));
        brandSanitize.warnings.forEach(w => warnings.push(w));
        brandSanitize.errors.forEach(e => errors.push(e));
    } catch (e) {
        warnings.push('品牌色守卫失败：' + (e && e.message ? e.message : e));
    }

    spec.pages.forEach((page, pi) => {
        const where = '第 ' + (pi + 1) + ' 页';
        if (!page || typeof page !== 'object') {
            errors.push(where + '：不是对象');
            return;
        }
        if (!Array.isArray(page.layers)) {
            errors.push(where + '：layers 必须是数组');
            return;
        }
        if (page.layers.length === 0) {
            warnings.push(where + '：没有图层，将显示为空白页');
        }

        page.layers.forEach((layer, li) => {
            const lw = where + ' 图层 ' + (li + 1);
            if (!layer || typeof layer !== 'object') {
                errors.push(lw + '：不是对象');
                return;
            }
            if (layer.type && layer.type !== 'text') {
                warnings.push(lw + '：类型 "' + layer.type + '" 当前契约仅支持 text，已跳过');
                page.layers[li] = null;
                return;
            }

            // 2a. 特效 id 校验（特效永远自由，不受品牌约束；这里只校验 id 是否存在）
            if (layer.effectClass) {
                if (!validEffects.has(layer.effectClass)) {
                    errors.push(lw + '：特效 "' + layer.effectClass + '" 不存在');
                } else {
                    // 2b. 特效参数
                    const def = (typeof getEffectParamsDef === 'function')
                        ? getEffectParamsDef(layer.effectClass)
                        : null;
                    if (layer.effectParams && typeof layer.effectParams === 'object') {
                        Object.keys(layer.effectParams).forEach(eid => {
                            if (eid !== layer.effectClass) {
                                if (!validEffects.has(eid)) {
                                    warnings.push(lw + '：effectParams 引用了不存在的特效 "' + eid + '"，已忽略');
                                    delete layer.effectParams[eid];
                                    return;
                                }
                            }
                            const pdef = (typeof getEffectParamsDef === 'function')
                                ? getEffectParamsDef(eid)
                                : null;
                            if (!pdef) return;
                            const params = layer.effectParams[eid];
                            if (!params || typeof params !== 'object') {
                                layer.effectParams[eid] = {};
                                return;
                            }
                            Object.entries(params).forEach(([k, v]) => {
                                const meta = pdef[k];
                                if (!meta) {
                                    warnings.push(lw + '：' + eid + '.' + k + ' 不是该特效声明的参数，已删除');
                                    delete params[k];
                                    return;
                                }
                                if (meta.type === 'range') {
                                    const num = Number(v);
                                    if (!isFinite(num)) {
                                        warnings.push(lw + '：' + eid + '.' + k + ' 不是数字，已用默认值');
                                        params[k] = meta.default;
                                    } else if (num < meta.min || num > meta.max) {
                                        const clamped = Math.max(meta.min, Math.min(meta.max, num));
                                        warnings.push(lw + '：' + eid + '.' + k + '=' + num + ' 超范围，已钳制到 ' + clamped);
                                        params[k] = clamped;
                                    }
                                } else if (meta.type === 'color') {
                                    if (!HEX_RE.test(String(v))) {
                                        warnings.push(lw + '：' + eid + '.' + k + ' 不是合法 HEX，已用默认值');
                                        params[k] = meta.default;
                                    }
                                }
                            });
                        });
                    } else if (def && Object.keys(def).length > 0) {
                        // 无 effectParams，自动补默认值（仅 warning 级）
                        warnings.push(lw + '：特效 ' + layer.effectClass + ' 未提供参数，将使用默认值');
                        layer.effectParams = layer.effectParams || {};
                        layer.effectParams[layer.effectClass] = {};
                    }
                }
            }

            // 2c. 几何约束（仅坐标钳制，属于结构修复；风格类纠偏一律走 error，不在此处改写）
            const clampNum = (val, min, max, name) => {
                const n = Number(val);
                if (!isFinite(n)) {
                    warnings.push(lw + '：' + name + ' 不是数字，已改为 ' + min);
                    return min;
                }
                if (n < min || n > max) {
                    const c = Math.max(min, Math.min(max, n));
                    warnings.push(lw + '：' + name + '=' + n + ' 越界，已钳制到 ' + c);
                    return c;
                }
                return n;
            };
            layer.x = clampNum(layer.x, -20, 380, 'x');
            layer.y = clampNum(layer.y, -20, 660, 'y');
            layer.width = clampNum(layer.width, 10, 400, 'width');
            layer.height = clampNum(layer.height, 10, 700, 'height');

            // 2d. 颜色格式
            if (layer.color && !HEX_RE.test(String(layer.color))) {
                warnings.push(lw + '：color 不是 #rrggbb，已改为 #ffffff');
                layer.color = '#ffffff';
            }
            if (layer.bgColor && layer.bgColor !== 'transparent' && !HEX_RE.test(String(layer.bgColor))) {
                warnings.push(lw + '：bgColor 不是 #rrggbb 或 transparent，已改为 transparent');
                layer.bgColor = 'transparent';
            }

            // 2e. 字号
            if (layer.fontSize) {
                const fs = parseFloat(layer.fontSize);
                if (!isFinite(fs) || fs < 12 || fs > 120) {
                    warnings.push(lw + '：fontSize=' + layer.fontSize + ' 越界，已改为 28px');
                    layer.fontSize = '28px';
                } else if (!/px$/.test(String(layer.fontSize))) {
                    layer.fontSize = fs + 'px';
                }
            }

            // 2f. 底衬
            if (layer.backdrop && typeof layer.backdrop === 'object') {
                const bd = layer.backdrop;
                if (bd.type && bd.type !== 'none' && bd.type !== 'custom' && !validBackdrops.has(bd.type)) {
                    errors.push(lw + '：底衬 "' + bd.type + '" 不存在');
                }
                if (bd.color && !HEX_RE.test(String(bd.color))) {
                    warnings.push(lw + '：backdrop.color 不是合法 HEX，已删除');
                    delete bd.color;
                }
            }

            // 2g. 严格模式：色彩 / 字体分开关，独立生效（特效不在其中）
            if (strictColors) {
                if (layer.color) {
                    const up = String(layer.color).toUpperCase();
                    if (!brandColors.has(up)) {
                        errors.push(lw + '：严格色彩模式下颜色 ' + layer.color + ' 不在当前品牌色板中');
                    }
                }
            }
            if (strictFonts) {
                if (layer.fontFamily && !brandFonts.has(layer.fontFamily)) {
                    errors.push(lw + '：严格字体模式下字体 ' + layer.fontFamily + ' 不是品牌字体');
                }
            }

            // 2h. 抖音安全区检查（下越界 = error，其它 = warning）
            // ✅ 关键升级：heightMode='auto' 时用估算渲染高度，而非 height 字段
            try {
                const SAFE_L = 20, SAFE_R = 20, SAFE_T = 30, SAFE_B = 40;
                const sx = Number(layer.x) || 0;
                const sy = Number(layer.y) || 0;
                const sw = Number(layer.width) || 100;
                const declaredH = Number(layer.height) || 40;
                const estH = (typeof _estimateTextRenderHeight === 'function')
                    ? _estimateTextRenderHeight(layer) : 0;
                const sh = Math.max(declaredH, estH);
                if (sx < SAFE_L) {
                    warnings.push(lw + '：左越安全区（x=' + sx + '，建议 ≥' + SAFE_L + '）');
                }
                if (sx + sw > 360 - SAFE_R) {
                    warnings.push(lw + '：右越安全区（x+width=' + (sx + sw) + '，建议 ≤' + (360 - SAFE_R) + '）');
                }
                if (sy < SAFE_T) {
                    warnings.push(lw + '：上越安全区（y=' + sy + '，建议 ≥' + SAFE_T + '）');
                }
                // ✅ 底部安全线：600 是抖音 UI 栏起点，再留 4px 视觉余量 → 596
                if (sy + sh > 596) {
                    const hint = (estH > declaredH)
                        ? '（自动高度实测 ' + estH + 'px，字段声明 ' + declaredH + 'px）'
                        : '';
                    errors.push(lw + '：下越安全区（y+实际高度=' + Math.round(sy + sh) + hint + '，抖音底部 UI 栏会遮挡，建议 ≤596）');
                }
            } catch (e) {
                if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 安全区检查失败', e);
            }

            // 2i. 品牌背景白名单（严格色彩模式下硬拦截；非严格模式只要求有 bg）
            try {
                if (page.bg) {
                    if (strictColors && brandBgPresetIds.size) {
                        const allowedBgIds = Array.from(brandBgPresetIds);
                        if (page.bg.presetId && !brandBgPresetIds.has(page.bg.presetId)) {
                            errors.push(where + '：背景 presetId "' + page.bg.presetId + '" 不在当前品牌色板 [' + allowedBgIds.join(', ') + ']');
                        } else if (!page.bg.presetId && (page.bg.color1 || page.bg.color2)) {
                            errors.push(where + '：背景禁止自定义 color1/color2，必须使用品牌预设');
                        }
                    }
                } else {
                    errors.push(where + '：缺少 bg.presetId');
                }
            } catch (e) {
                if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 背景白名单检查失败', e);
            }

            // 2j. 品牌色白名单（严格色彩模式下硬拦截；非严格模式颜色自由）
            try {
                if (strictColors && brandColors.size) {
                    const allowed = Array.from(brandColors);
                    if (layer.color) {
                        const up = String(layer.color).toUpperCase();
                        if (!brandColors.has(up)) {
                            errors.push(lw + '：文字色 ' + layer.color + ' 不在当前品牌色板 [' + allowed.join(', ') + ']');
                        }
                    }
                    if (layer.bgColor && layer.bgColor !== 'transparent') {
                        const upBg = String(layer.bgColor).toUpperCase();
                        if (!brandColors.has(upBg)) {
                            errors.push(lw + '：背景色 ' + layer.bgColor + ' 不在当前品牌色板，请改用 transparent 或品牌色');
                        }
                    }
                }
            } catch (e) {
                if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 品牌色检查失败', e);
            }
        });
    });

    // 过滤掉被标记为 null 的图层（非 text 类型已被跳过）
    spec.pages.forEach(page => {
        if (Array.isArray(page.layers)) {
            page.layers = page.layers.filter(Boolean);
        }
    });



    // titleCandidates 硬校验
    if (Array.isArray(spec.titleCandidates)) {
        spec.titleCandidates.forEach((t, i) => {
            const s = String(t || '').trim();
            if (!s) {
                errors.push('titleCandidates[' + i + ']：标题为空');
            } else if (s.length > 14) {
                errors.push('titleCandidates[' + i + ']：标题 "' + s.slice(0, 20) + '…" 超过 14 字');
            }
        });
    }

    // 自动补齐 titleCandidates（AI 常漏，导致 quality 扣分）
    if (!Array.isArray(spec.titleCandidates) || spec.titleCandidates.length < 3) {
        const list = Array.isArray(spec.titleCandidates) ? spec.titleCandidates.slice() : [];
        const firstPage = spec.pages[0];
        const firstText = firstPage && (firstPage.layers || []).find(l => l && l.type === 'text');
        const seedRaw = firstText ? String(firstText.content || '').replace(/<[^>]*>/g, '').split(/\r?\n/)[0].slice(0, 20) : '';
        const seed = (typeof enhanceTitleOffline === 'function') ? enhanceTitleOffline(seedRaw) : seedRaw;
        const fallback = ['点击编辑封面标题', '建议收藏', '原标题'];
        let fi = 0;
        while (list.length < 3) {
            list.push((seed && list.length === 0) ? seed : fallback[fi++ % fallback.length]);
            if (fi > 10) break;
        }
        spec.titleCandidates = list.slice(0, Math.max(3, list.length));
        warnings.push('titleCandidates 不足 3 个，已自动补齐');
    }

    // 最后一遍：补全 AI 常漏的字段
    spec.pages.forEach(page => {
        (page.layers || []).forEach(layer => {
            if (!layer || layer.type !== 'text') return;
            if (layer.heightMode === undefined) layer.heightMode = 'auto';
            if (layer.rotation === undefined) layer.rotation = 0;
            if (layer.flipH === undefined) layer.flipH = false;
            if (layer.flipV === undefined) layer.flipV = false;
            if (layer.locked === undefined) layer.locked = false;
            if (layer.groupId === undefined) layer.groupId = null;
            if (layer.opacity === undefined) layer.opacity = 1;
            if (layer.lineHeight === undefined) layer.lineHeight = 1.2;
            if (layer.letterSpacing === undefined) layer.letterSpacing = 0;
            if (layer.color && typeof layer.color === 'string') {
                layer.color = layer.color.toUpperCase();
            }
        });
    });

    return { ok: errors.length === 0, errors, warnings };
}
window.validateSpec = validateSpec;

/* ============================================================
   AI 硬编码特效强制替换
   DeepSeek 训练数据里『教育类=black-stroke/gold』权重太重，
   契约改什么都没用，只能在应用前强制洗一遍
   ============================================================ */
const FORCE_POOL_COVER = ['effect-viral', 'effect-neon', 'effect-fire', 'effect-cyber', 'effect-3d', 'effect-glitch'];
const FORCE_POOL_BODY = ['effect-neon', 'effect-cyber', 'effect-3d', 'effect-glitch', 'effect-hk', 'effect-lightning'];

function forceReplaceHardcodedEffects(spec) {
    if (!spec || !Array.isArray(spec.pages) || !spec.pages.length) return { ok: false, changed: 0, details: [] };
    let fxValid = new Set();
    let fxFamily = new Map();
    try {
        if (typeof getAllEffectsMaster === 'function' && typeof inferSemantics === 'function') {
            getAllEffectsMaster().forEach(function(e) {
                if (!e || !e.id) return;
                fxValid.add(e.id);
                try { var s = inferSemantics(e); fxFamily.set(e.id, s && s.family); } catch (err) {}
            });
        }
    } catch (e) {}

    var pickPool = function(pool, used) {
        var avail = pool.filter(function(id) { return fxValid.has(id); });
        if (!avail.length) return null;
        var fresh = avail.filter(function(id) { return !used.has(id); });
        var arr = fresh.length ? fresh : avail;
        return arr[Math.floor(Math.random() * arr.length)];
    };

    var changed = 0;
    var details = [];
    var usedFamilies = new Set();

    // 封面主标题：禁止 text-stroke / metal-fill / soft-glow / highlight / drop-shadow
    var cover = spec.pages[0];
    if (cover && Array.isArray(cover.layers)) {
        var t = cover.layers.find(function(l) { return l && l.type === 'text' && l.bold; });
        if (t) {
            var curFx = t.effectClass;
            var curFam = curFx ? fxFamily.get(curFx) : null;
            var isWeak = !curFx || curFam === 'text-stroke' || curFam === 'metal-fill' || curFam === 'soft-glow' || curFam === 'highlight' || curFam === 'drop-shadow';
            if (isWeak) {
                var pick = pickPool(FORCE_POOL_COVER, usedFamilies);
                if (pick) {
                    t.effectClass = pick;
                    t.effectParams = t.effectParams || {};
                    if (!t.effectParams[pick]) t.effectParams[pick] = {};
                    var nf = fxFamily.get(pick);
                    if (nf) usedFamilies.add(nf);
                    changed++;
                    details.push('封面主标题 ' + (curFx || '(无)') + ' → ' + pick);
                }
            } else if (curFam) {
                usedFamilies.add(curFam);
            }
        }
    }

    // 其他标题：同 family 超过 50% 就换
    var allBold = [];
    spec.pages.forEach(function(p, pi) {
        (p.layers || []).forEach(function(l) { if (l && l.type === 'text' && l.bold) allBold.push({ page: pi, layer: l }); });
    });
    var famCnt = {};
    allBold.forEach(function(x) {
        var f = x.layer.effectClass ? fxFamily.get(x.layer.effectClass) : null;
        if (f) famCnt[f] = (famCnt[f] || 0) + 1;
    });
    var total = allBold.length || 1;
    for (var i = 1; i < allBold.length; i++) {
        var x = allBold[i];
        var f = x.layer.effectClass ? fxFamily.get(x.layer.effectClass) : null;
        if (!f) continue;
        if ((famCnt[f] || 0) / total > 0.5) {
            var pick2 = pickPool(FORCE_POOL_BODY, usedFamilies);
            if (pick2) {
                var old = x.layer.effectClass;
                x.layer.effectClass = pick2;
                x.layer.effectParams = x.layer.effectParams || {};
                if (!x.layer.effectParams[pick2]) x.layer.effectParams[pick2] = {};
                var nf2 = fxFamily.get(pick2);
                if (nf2) usedFamilies.add(nf2);
                famCnt[f] = Math.max(0, (famCnt[f] || 1) - 1);
                if (nf2) famCnt[nf2] = (famCnt[nf2] || 0) + 1;
                changed++;
                details.push('P' + (x.page + 1) + ' 标题 ' + old + ' → ' + pick2);
            }
        }
    }

    return { ok: true, changed: changed, details: details };
}
window.forceReplaceHardcodedEffects = forceReplaceHardcodedEffects;

/* ============================================================
   语义校验器：与 validateSpec 分开，专门检查「设计质量」，不阻断应用
   输出 { ok, warnings, metrics }
   ============================================================ */
function validateSpecSemantics(spec) {
    const warnings = [];
    const metrics = {
        totalTextLayers: 0,
        layersWithEffect: 0,
        families: {},
        dominantFamily: null,
        dominantRatio: 0,
        coverFamily: null,
        coverIntensity: null
    };
    if (!spec || !Array.isArray(spec.pages) || !spec.pages.length) {
        return { ok: false, warnings: ['spec 无页面'], metrics };
    }
    let fxMap = new Map();
    try {
        if (typeof getAllEffectsMaster === 'function' && typeof inferSemantics === 'function') {
            getAllEffectsMaster().forEach(e => {
                try { fxMap.set(e.id, inferSemantics(e) || {}); } catch (err) {}
            });
        }
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] validateSpecSemantics 读取语义失败', e);
    }

    spec.pages.forEach((p, pi) => {
        (p.layers || []).forEach(l => {
            if (!l || l.type !== 'text') return;
            metrics.totalTextLayers++;
            if (!l.effectClass) return;
            const sem = fxMap.get(l.effectClass);
            if (!sem) return;
            metrics.layersWithEffect++;
            const fam = sem.family || 'misc';
            metrics.families[fam] = (metrics.families[fam] || 0) + 1;
            if (sem.applyMode === 'layer-only' && pi === 0 && l.bold && !Array.isArray(l.effectClass)) {
                // 只是提示层，不阻断
            }
        });
    });

    if (metrics.layersWithEffect === 0) {
        warnings.push('没有任何文字图层使用特效，视觉可能过于平淡');
        return { ok: true, warnings, metrics };
    }

    const fams = Object.keys(metrics.families);
    if (fams.length < 2) {
        warnings.push('特效视觉机制仅 1 种（' + fams[0] + '），建议混用不同 family');
    }
    fams.forEach(f => {
        const ratio = metrics.families[f] / metrics.layersWithEffect;
        if (ratio > 0.6 && metrics.layersWithEffect >= 4) {
            if (!metrics.dominantFamily || ratio > metrics.dominantRatio) {
                metrics.dominantFamily = f;
                metrics.dominantRatio = ratio;
            }
            warnings.push('视觉机制「' + f + '」占比 ' + Math.round(ratio * 100) + '%（>60%），建议混入其它机制');
        }
    });

    const coverPage = spec.pages[0];
    const coverTitle = (coverPage && coverPage.layers || []).find(l => l && l.type === 'text' && l.bold);
    if (coverTitle && coverTitle.effectClass) {
        const s = fxMap.get(coverTitle.effectClass);
        if (s) {
            metrics.coverFamily = s.family || null;
            metrics.coverIntensity = s.intensity || null;
            if (s.family === 'text-stroke' || s.family === 'metal-fill' || s.family === 'highlight') {
                warnings.push('封面主标题使用了 family=' + s.family + '（' + coverTitle.effectClass + '），冲击力可能不足，建议换 neon-glow / 3d-extrude / gradient-fill');
            }
            if (s.intensity === 'low') {
                warnings.push('封面主标题特效强度为 low，建议改 high 或 medium');
            }
        }
    } else if (coverTitle) {
        warnings.push('封面主标题没有特效，建议加一个高冲击特效');
    }

    return { ok: warnings.length === 0, warnings, metrics };
}
window.validateSpecSemantics = validateSpecSemantics;

/* ============================================================
   2. 分块器
   ============================================================ */
const DEFAULT_SEPARATORS = ['---', '***', '==='];

function analyzeChunk(text) {
    const trimmed = String(text || '').trim();
    const charCount = trimmed.replace(/\s/g, '').length;
    const lineCount = trimmed ? trimmed.split(/\r?\n/).length : 0;
    const hasEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(trimmed);
    const hasNumber = /\d/.test(trimmed);
    return { text: trimmed, charCount, lineCount, hasEmoji, hasNumber };
}
window.analyzeChunk = analyzeChunk;

function chunkBySeparator(rawText, separators) {
    const seps = Array.isArray(separators) && separators.length ? separators : DEFAULT_SEPARATORS;
    const sepSet = new Set(seps.map(s => s.trim()));
    const lines = String(rawText || '').split(/\r?\n/);
    const chunks = [];
    let current = [];

    const flush = () => {
        if (current.length === 0) return;
        const text = current.join('\n');
        if (text.trim()) chunks.push(analyzeChunk(text));
        current = [];
    };

    lines.forEach(line => {
        const t = line.trim();
        // 精确匹配
        if (sepSet.has(t)) {
            flush();
            return;
        }
        // 宽松匹配：'--- xxx' / '***xxx***' 这类（用户笔记常见）
        if (/^[-=*]{3,}(\s|$)/.test(t) || /^[-=*]{3,}\s*\w+\s*[-=*]{0,}/.test(t)) {
            flush();
            return;
        }
        current.push(line);
    });
    flush();
    return chunks;
}
window.chunkBySeparator = chunkBySeparator;

/* ============================================================
   3. 版面决策器（确定性规则，不依赖 AI）
   ============================================================ */
function decideLayout(chunk) {
    const { charCount = 0, lineCount = 0 } = chunk || {};

    if (charCount <= 12 && lineCount <= 2) {
        return { layout: 'hero', pagesNeeded: 1, fontSize: '52px', align: 'center' };
    }
    if (charCount <= 30 && lineCount <= 4) {
        return { layout: 'title-sub', pagesNeeded: 1, fontSize: '40px', align: 'center' };
    }
    if (charCount <= 80 && lineCount <= 8) {
        return { layout: 'title-body', pagesNeeded: 1, fontSize: '28px', align: 'left' };
    }
    const pages = Math.min(6, Math.max(2, Math.ceil(charCount / 80)));
    return { layout: 'long-text', pagesNeeded: pages, fontSize: '24px', align: 'left' };
}
window.decideLayout = decideLayout;

/**
 * 把分块结果 + 版面建议打包成给 DeepSeek 的输入 JSON
 */
function buildChunkPayload(rawText, separators) {
    const cleanText = (typeof sanitizeRawInput === 'function') ? sanitizeRawInput(rawText) : rawText;
    const chunks = chunkBySeparator(cleanText, separators);
    return {
        format: 'douyin-cover-chunks',
        version: 1,
        chunks: chunks.map((c, i) => ({
            index: i + 1,
            text: c.text,
            charCount: c.charCount,
            lineCount: c.lineCount,
            hasEmoji: c.hasEmoji,
            hasNumber: c.hasNumber,
            layout: decideLayout(c)
        }))
    };
}
window.buildChunkPayload = buildChunkPayload;

/* ============================================================
   3b. 一键提示词拼装（system = 契约，user = 分块）
   ============================================================ */
function buildDeepSeekPrompt(rawText, separators, options) {
    options = options || {};
    const compact = !!options.compact;
    const ultraCompact = !!options.ultraCompact;
    if (ultraCompact && typeof buildMinimalPrompt === 'function') {
        return {
            system: '',
            user: buildMinimalPrompt(rawText),
            payload: buildChunkPayload(rawText, separators)
        };
    }
    const contract = compact
        ? ((typeof buildCompactSystemPrompt === 'function') ? buildCompactSystemPrompt() : '# 简洁契约缺失')
        : ((typeof generateAiSpecMarkdown === 'function') ? generateAiSpecMarkdown() : '# 契约缺失，请先生成');
    const payload = buildChunkPayload(rawText, separators);

    const systemPart = contract;
    const lastStyle = (typeof getLastStyle === 'function') ? getLastStyle() : null;
    const styleReminder = lastStyle
        ? ('\n## 上次已用风格（保持一致）\n- ' + (lastStyle.name || lastStyle.id) + '（' + lastStyle.id + '）：关键词 [' + ((lastStyle.keywords || []).join(', ')) + ']，背景 ' + (lastStyle.bgPresetId || '-') + '\n- 除非新内容与上次风格明显不匹配，否则请优先沿用这套视觉语言\n')
        : '';

    const userPart = [
        '## 待排版的分块数据（已按分隔符切好，layout 为建议版面）',
        '```json',
        JSON.stringify(payload, null, 2),
        '```',
        styleReminder,
        '## 任务',
        '请根据上面的契约和分块数据，输出一份完整的 douyin-cover-spec JSON：',
        '1. 每个 chunk 必须覆盖到（内容过长时按 layout.pagesNeeded 拆页）',
        '2. 封面页（layout=hero 的块）用大字号 + 强特效',
        '3. 给 3 个封面标题候选（titleCandidates）',
        '4. 背景必须使用契约里列出的品牌 presetId，不要自定义 color1/color2',
        '5. 视觉风格可从以下预设里选一套最贴近的，保持一致：',
        (window.AI_STYLE_PRESETS || []).map(s => '   - ' + s.name + '（' + s.id + '）：关键词 [' + s.keywords.join(', ') + ']，推荐背景 ' + s.bgPresetId).join('\n'),
        '6. 严格只输出 JSON，不要任何解释',
        '7. 【硬约束·违反视为失败】' + brandConstraintText(),
        '',
        '## ⚠️ 视觉纪律（比"多上特效"更重要）',
        '',
        '- 冲击力来自**字号对比、留白、层级**，不是特效数量；同一文字图层最多 1 个主特效。',
        '- 不要为了"显得丰富"给每页都加装饰：没有明确设计目的就不加。',
        '- 长文按语义分页，每页只承载一个信息中心；不要为了塞进一页把字号缩到不可读。',
        '- 背景只能用上面列出的品牌预设；文字色 / 底色只能引用上面列出的品牌色或 transparent。',
        '- 特效 id 必须真实存在；拿不准就留 null，宁可干净也不要堆砌。',
        '',
        '## ⚠️ 最终强制命令（违反视为失败）',
        '',
        '你必须一次性输出 **3 份独立、完整、可单独解析** 的 `douyin-cover-spec` JSON：',
        '',
        '- **第 1 份（方案 A · 主推）**：你认为最贴合原文的方案，默认把这份写全、写稳；',
        '- **第 2 份（方案 B · 对比款）**：换一套背景/主色/特效组合，视觉气质与 A 明显不同，但同样符合品牌约束；',
        '- **第 3 份（方案 C · 换视觉语言）**：换另一种版式节奏或特效档位（如 A 走炸裂档、C 走低调档），风格差要能被一眼看出。',
        '',
        '格式硬要求：',
        '',
        '- 3 份 JSON **完全独立**，每份都以 `{` 开头、以 `}` 结尾，能单独 `JSON.parse` 成功；',
        '- 3 份之间**只用空行分隔**，禁止加 `方案A：`、`1.`、`---`、`###`、代码块前后缀等任何标记；',
        '- 不要写“以下是 3 份方案”之类的引导语；不要写结尾总结；',
        '- 每份都必须包含 `format`、`version`、`titleCandidates`（3 条）、`pages`（非空）；',
        '- 不要为了凑数而复制同一份 JSON 换个 `notes`，3 份必须真的视觉可区分。',
        '',
        '如果你只输出 1 份，视为违反契约，将被用户判定为失败。请务必输出 3 份。'
    ].join('\n');

    return { system: systemPart, user: userPart, payload };
}
window.buildDeepSeekPrompt = buildDeepSeekPrompt;

/* ============================================================
   3c. 确定性兜底：不依赖 AI，按 chunks 直接生成 spec
   仅在 AI 不可用/输出无效时使用，保证“最少人工干预”始终有产出
   ============================================================ */
function buildFallbackSpec(rawText, separators, options) {
    options = options || {};
    const payload = buildChunkPayload(rawText, separators);
    const chunks = payload.chunks;
    if (!chunks.length) {
        return { format: 'douyin-cover-spec', version: 1, titleCandidates: [], pages: [] };
    }

    const heroChunk = chunks.find(c => c.layout.layout === 'hero') || chunks[0];
    // ✅ titleCandidates 必须全部 ≤14 字，否则会被 validateSpec 拦下
    const rawFirstLine = String(heroChunk.text || '').split(/\r?\n/)[0].trim() || '标题';
    const firstTitle = rawFirstLine.length > 14 ? rawFirstLine.slice(0, 14) : rawFirstLine;
    const titleCandidates = [firstTitle, '建议收藏', '原标题'];

    let autoBgPreset = null;
    if (options.autoBg !== false && typeof pickBackgroundForText === 'function') {
        try { autoBgPreset = pickBackgroundForText(heroChunk.text || ''); } catch (e) { }
    }

    // ✅ 兜底方案也必须用「当前品牌」的颜色，不能写死某个品牌的色值，
    //    否则严格模式下连自带的自测都会判自己违规。
    const brandStyle = (typeof getBrandTextAndBg === 'function')
        ? getBrandTextAndBg()
        : { text: '#111111', bgPresetId: null, bgColor1: '#F5F1E8', colors: [], bgIds: [] };
    const makeBrandBg = () => brandStyle.bgPresetId
        ? { presetId: brandStyle.bgPresetId }
        : {
            presetId: null,
            type: 'solid',
            color1: brandStyle.bgColor1 || '#F5F1E8',
            color2: brandStyle.bgColor1 || '#F5F1E8'
        };
    const brandTextColor = brandStyle.text || '#111111';

    const pages = [];
    chunks.forEach((c, ci) => {
        const L = c.layout;
        const lines = c.text.split(/\r?\n/).filter(s => s.trim());
        const isHero = L.layout === 'hero';
        const isLong = L.layout === 'long-text';

        if (!isLong) {
            const fx = 'effect-black-stroke';
            pages.push({
                title: '第 ' + (pages.length + 1) + ' 页',
                bg: makeBrandBg(),
                layers: [
                    buildTextLayer({
                        content: c.text,
                        fontSize: L.fontSize,
                        align: L.align,
                        bold: true,
                        effectClass: fx,
                        color: brandTextColor,
                        y: isHero ? 140 : 120,
                        height: isHero ? 180 : 140
                    })
                ]
            });
            return;
        }

        // long-text：按句切页，每页最多 6 行
        const maxLines = 6;
        let buffer = [];
        const flushPage = () => {
            if (!buffer.length) return;
            pages.push({
                title: '第 ' + (pages.length + 1) + ' 页',
                bg: makeBrandBg(),
                layers: [
                    buildTextLayer({
                        content: buffer.join('\n'),
                        fontSize: '24px',
                        align: 'left',
                        bold: false,
                        effectClass: null,
                        color: brandTextColor,
                        y: 100,
                        height: 60 + buffer.length * 34,
                        width: 320
                    })
                ]
            });
            buffer = [];
        };
        lines.forEach(line => {
            if (buffer.length >= maxLines) flushPage();
            buffer.push(line);
        });
        flushPage();
    });

    // ✅ 兜底 spec 本身必须合规：缺背景的页统一补当前品牌背景
    pages.forEach(p => {
        if (!p.bg) p.bg = makeBrandBg();
    });

    return { format: 'douyin-cover-spec', version: 1, titleCandidates, pages };
}
window.buildFallbackSpec = buildFallbackSpec;

function buildTextLayer(opts) {
    const w = opts.width || 300;
    const x = opts.x != null ? opts.x : Math.max(10, Math.round((360 - w) / 2));
    return {
        type: 'text',
        content: opts.content || '',
        fontSize: opts.fontSize || '28px',
        fontFamily: opts.fontFamily || 'sans-serif',
        color: opts.color || '#ffffff',
        bgColor: 'transparent',
        bold: !!opts.bold,
        italic: false, underline: false, strike: false,
        align: opts.align || 'center',
        vertical: false,
        letterSpacing: 0,
        lineHeight: 1.2,
        opacity: 1,
        effectClass: opts.effectClass || null,
        x: x,
        y: opts.y != null ? opts.y : 120,
        width: w,
        height: opts.height != null ? opts.height : 120,
        heightMode: 'auto',
        rotation: 0, flipH: false, flipV: false,
        locked: false, groupId: null,
        backdrop: null
    };
}
window.buildTextLayer = buildTextLayer;

/* ============================================================
   4. 应用器
   ============================================================ */
function normalizeSpecLayer(src, idx) {
    if (typeof _normalizeTemplateLayer === 'function') {
        return _normalizeTemplateLayer(src, idx);
    }
    // 兜底（cover-templates.js 未加载时）
    const layer = Object.assign({
        id: 'ai-layer-' + Date.now() + '-' + idx + '-' + Math.floor(Math.random() * 1000),
        type: 'text',
        content: '',
        fontSize: '20px',
        fontFamily: 'sans-serif',
        color: '#ffffff',
        bgColor: 'transparent',
        bold: false, italic: false, underline: false, strike: false,
        align: 'left', vertical: false,
        letterSpacing: 0, lineHeight: 1.2, opacity: 1,
        effectClass: null,
        rotation: 0, flipH: false, flipV: false,
        x: 35, y: 250, width: 290, height: 48,
        heightMode: 'auto',
        locked: false,
        groupId: null
    }, JSON.parse(JSON.stringify(src || {})));
    return layer;
}
// 保留页级 notes 到页对象上
function normalizeSpecPage(page, idx) {
    const p = page || {};
    const out = {
        id: 'page-ai-' + Date.now() + '-' + idx,
        title: p.title || ('第 ' + (idx + 1) + ' 页'),
        layers: (p.layers || []).map((src, li) => normalizeSpecLayer(src, li))
    };
    if (p.bg && typeof p.bg === 'object') {
        out.bg = JSON.parse(JSON.stringify(p.bg));
    }
    if (p._planLabel) out._planLabel = p._planLabel;
    if (p._planPageNo != null) out._planPageNo = p._planPageNo;
    if (p.notes && String(p.notes).trim()) out._notes = String(p.notes).trim();
    return out;
}
window.normalizeSpecPage = normalizeSpecPage;
window.normalizeSpecLayer = normalizeSpecLayer;

async function applyCoverSpec(spec, options) {
    // ===== DEBUG START（不干扰点击，只记录）=====
    try {
        window.__applyLogs = window.__applyLogs || [];
        window.__applyLogs.push({
            t: Date.now(),
            stage: 'enter',
            specBg: (spec && spec.pages && spec.pages[0] && spec.pages[0].bg) ? JSON.parse(JSON.stringify(spec.pages[0].bg)) : null,
            pages: (spec && spec.pages) ? spec.pages.length : 0,
            firstContent: (spec && spec.pages && spec.pages[0] && spec.pages[0].layers && spec.pages[0].layers[0]) ? String(spec.pages[0].layers[0].content || '').replace(/<[^>]*>/g, '').slice(0, 20) : '',
            options: options
        });
        console.log('[DEBUG applyCoverSpec] specBg=', JSON.stringify(window.__applyLogs[window.__applyLogs.length - 1].specBg),
            'firstContent=', window.__applyLogs[window.__applyLogs.length - 1].firstContent);
    } catch (e) { console.warn('[DEBUG] log failed', e); }
    // ===== DEBUG END =====

    options = options || {};
    const dryRun = !!options.dryRun;
    const append = !!options.append;

    // ✅ 硬约束断言：无论走哪条路径，越界一律拒绝
    if (typeof checkSafeAreaViolations === 'function') {
        const violations = checkSafeAreaViolations(spec);
        if (violations.length > 0) {
            const lines = violations.map(v => '第 ' + v.page + ' 页图层 ' + v.layer + ' 底部 ' + v.bottom + 'px（超 ' + v.overflow + 'px）');
            if (!dryRun) {
                return { ok: false, errors: ['安全区越界：' + lines.join('；')], warnings, applied: false, pages: null };
            }
            // dryRun 也拦截，防止预览越界方案
            return { ok: false, errors: ['安全区越界：' + lines.join('；')], warnings, applied: false, pages: null };
        }
    }

    const { ok, errors, warnings } = validateSpec(spec);
    if (!ok && !dryRun) {
        return { ok: false, errors, warnings, applied: false, pages: null };
    }

    // ✅ 语义多样性软校验：不阻断，但把问题转成 warnings 反馈给用户
    try {
        if (typeof inferSemantics === 'function' && typeof getAllEffectsMaster === 'function') {
            const fxMap = new Map();
            getAllEffectsMaster().forEach(e => {
                try { fxMap.set(e.id, inferSemantics(e) || {}); } catch (err) {}
            });
            const familyCount = {};
            let totalWithFx = 0;
            (spec.pages || []).forEach(p => (p.layers || []).forEach(l => {
                if (!l || l.type !== 'text' || !l.effectClass) return;
                const sem = fxMap.get(l.effectClass);
                if (!sem || !sem.family) return;
                familyCount[sem.family] = (familyCount[sem.family] || 0) + 1;
                totalWithFx++;
            }));
            if (totalWithFx >= 3) {
                const families = Object.keys(familyCount);
                if (families.length < 2) {
                    warnings.push('特效视觉机制仅 1 种（' + families[0] + '），整套方案视觉可能单调，建议混用不同 family');
                } else {
                    families.forEach(f => {
                        const pct = familyCount[f] / totalWithFx;
                        if (pct > 0.6 && totalWithFx >= 4) {
                            warnings.push('特效机制「' + f + '」占比 ' + Math.round(pct * 100) + '%，建议混入其它机制');
                        }
                    });
                }
            }
            const cover = (spec.pages[0] && spec.pages[0].layers || []).find(l => l && l.type === 'text' && l.bold);
            if (cover && cover.effectClass) {
                const s = fxMap.get(cover.effectClass);
                if (s && (s.family === 'text-stroke' || s.family === 'metal-fill')) {
                    warnings.push('封面主标题使用了 ' + cover.effectClass + '（family=' + s.family + '），冲击力可能不足，建议换 neon-glow / 3d-extrude / gradient-fill');
                }
            }
        }
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 语义多样性校验失败', e);
    }

    const newPages = (spec.pages || []).map((p, i) => normalizeSpecPage(p, i));

    // ✅ 页码规则：单页不加；多页每页加 "01 / 07"
    try {
        if (window.PageNumbers && typeof window.PageNumbers.ensurePageNumbers === 'function') {
            const pn = window.PageNumbers.ensurePageNumbers(newPages);
            if (pn.added > 0) warnings.push('多页方案已自动加页码（01 / ' + String(pn.total).padStart(2, '0') + '）');
            if (pn.removed > 0 && pn.total <= 1) warnings.push('单页方案已移除多余页码');
        }
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 页码处理失败', e);
    }

    if (dryRun) {
        return { ok: true, errors, warnings, pages: newPages, applied: false };
    }

    if (!window.state) {
        return { ok: false, errors: errors.concat(['state 未就绪']), warnings, applied: false, pages: null };
    }

    const beforePages = JSON.parse(JSON.stringify(state.pages || []));
    const beforePageId = state.currentPageId;
    const beforeBg = state.background ? JSON.parse(JSON.stringify(state.background)) : null;

    // 自动快照（应用前的画布）
    try {
        if (typeof takeCanvasSnapshot === 'function') {
            takeCanvasSnapshot('应用前 · ' + new Date().toLocaleTimeString());
        }
    } catch (e) {}

    // 差异感知：若与当前画布几乎无变化，附警告
    try {
        if (typeof exportCanvasAsSpec === 'function' && typeof diffStatusForApply === 'function' && !append) {
            const beforeSpec = exportCanvasAsSpec();
            const afterSpec = { format: 'douyin-cover-spec', version: 1, pages: newPages };
            const d = diffStatusForApply(beforeSpec, afterSpec);
            if (d.message) {
                warnings.push(d.message);
            }
        }
    } catch (e) {}

    // ✅ 背景继承兜底已移除：缺 bg 的页在 validateSpec 阶段即被判 error，不再静默补齐
    // ✅ AI 硬编码特效强制替换（DeepSeek 训练数据死模板的兜底）
    try {
        if (typeof forceReplaceHardcodedEffects === 'function') {
            var fr = forceReplaceHardcodedEffects({ format: 'douyin-cover-spec', version: 1, pages: newPages });
            if (fr.ok && fr.changed > 0) {
                warnings.push('已强制替换 ' + fr.changed + ' 处 AI 硬编码特效：' + (fr.details || []).slice(0, 3).join('；'));
                if (window.Utils && Utils.log) Utils.log.log('[AiSpec] 强制替换详情', fr.details);
            }
        }
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 强制替换失败', e);
    }

    // 自动配图（默认开启，可用 options.autoDecorate=false 关闭）
    try {
        const decorateOn = (options.autoDecorate !== false);
        if (decorateOn && typeof autoDecorateSpec === 'function') {
            const dr = autoDecorateSpec({ format: 'douyin-cover-spec', version: 1, pages: newPages });
            if (dr.ok && dr.added > 0) {
                warnings.push('已自动为 ' + dr.added + ' 页补充装饰 emoji（可在设置里关闭）');
            }
        }
    } catch (e) {}

    // ✅ 丰富度自动补强已移除：AI 输出是否丰富由 6i checklist + 质量分体现，应用阶段不做静默修补

    // ✅ 品牌色兜底已移除：不合规方案在 validateSpec 阶段即被拦截，不再静默改写

    if (append) {
        // 追加模式：保留现有 pages，把 AI 页追加到末尾
        state.pages = (state.pages || []).concat(newPages);
        state.currentPageId = newPages[0] ? newPages[0].id : state.currentPageId;
    } else {
        state.pages = newPages;
        state.currentPageId = newPages[0] ? newPages[0].id : null;
    }
    // ✅ 页码按最终画布页数统一处理（append 时也要把旧页算进总数）
    try {
        if (window.PageNumbers && window.PageNumbers.ensurePageNumbers) {
            window.PageNumbers.ensurePageNumbers(state.pages);
        }
    } catch (e) { }

    state.selectedLayerId = null;
    state.selectedLayerIds = [];
    state.editingLayerId = null;

    // 背景：优先第一页 bg；否则保留当前
    if (spec.pages[0] && spec.pages[0].bg && typeof normalizeBackground === 'function') {
        try {
            const _oldBgPreset = state.background ? state.background.presetId : null;
            state.background = normalizeBackground(spec.pages[0].bg);
            console.log('[DEBUG state.background] ' + _oldBgPreset + ' → ' + state.background.presetId + ' color1=' + state.background.color1);
            window.__applyLogs = window.__applyLogs || [];
            window.__applyLogs.push({
                t: Date.now(),
                stage: 'setBackground',
                before: _oldBgPreset,
                after: state.background.presetId,
                afterColor1: state.background.color1,
                specBg: JSON.parse(JSON.stringify(spec.pages[0].bg))
            });
        } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 应用背景失败', e);
        }
    }

    // 封面标题：把 titleCandidates[0] 写入第 1 页首个文字图层（不影响已有内容结构）
    try {
        if (Array.isArray(spec.titleCandidates) && spec.titleCandidates[0]) {
            const fp = newPages[0];
            const firstText = fp && (fp.layers || []).find(l => l && l.type === 'text');
            if (firstText && !firstText.content) {
                firstText.content = spec.titleCandidates[0];
            }
        }
    } catch (e) {}

    if (state.history && typeof state.history.record === 'function') {
        state.history.record();
    }

    if (typeof applyBackgroundToCanvases === 'function') {
        applyBackgroundToCanvases(state.background);
    }
    // ===== DEBUG：记录 renderAll 前后的状态 =====
    try {
        console.log('[DEBUG before renderAll] bgPreset=', state.background ? state.background.presetId : null,
            'pages=', state.pages.length,
            'pages[0].bg=', state.pages[0] ? JSON.stringify(state.pages[0].bg) : 'N/A',
            'pages[0].firstText=', state.pages[0] && state.pages[0].layers && state.pages[0].layers[0] ? String(state.pages[0].layers[0].content || '').replace(/<[^>]*>/g, '').slice(0, 20) : '');
        window.__applyLogs = window.__applyLogs || [];
        window.__applyLogs.push({
            t: Date.now(),
            stage: 'beforeRenderAll',
            bgPreset: state.background ? state.background.presetId : null,
            pages: state.pages.length,
            pageBg: state.pages[0] ? JSON.parse(JSON.stringify(state.pages[0].bg || null)) : null,
            firstContent: state.pages[0] && state.pages[0].layers && state.pages[0].layers[0] ? String(state.pages[0].layers[0].content || '').replace(/<[^>]*>/g, '').slice(0, 20) : ''
        });
    } catch (e) {}
    if (typeof renderAll === 'function') {
        renderAll();
    } else {
        if (typeof renderCanvas === 'function') renderCanvas();
        if (typeof renderLayerList === 'function') renderLayerList();
        if (typeof renderPageList === 'function') renderPageList();
    }
    // ===== DEBUG：renderAll 之后 =====
    try {
        console.log('[DEBUG after renderAll] bgPreset=', state.background ? state.background.presetId : null,
            'pages=', state.pages.length);
        window.__applyLogs = window.__applyLogs || [];
        window.__applyLogs.push({
            t: Date.now(),
            stage: 'afterRenderAll',
            bgPreset: state.background ? state.background.presetId : null,
            pages: state.pages.length
        });
    } catch (e) {}

    // 备份应用前的状态，便于一键撤销
    try {
        window.__aiSpecBackup = {
            appliedAt: Date.now(),
            pages: JSON.parse(JSON.stringify(beforePages)),
            currentPageId: beforePageId,
            background: beforeBg ? JSON.parse(JSON.stringify(beforeBg)) : null
        };
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 备份应用前状态失败', e);
    }

    if (typeof pushAiHistory === 'function') {
        try { pushAiHistory({ spec: spec, label: '多页方案 · ' + newPages.length + ' 页' }); } catch (e) {}
    }
    if (typeof logSpecApply === 'function') {
        try {
            const quality = (typeof scoreSpecQuality === 'function') ? scoreSpecQuality(spec).total : 0;
            let mainStyle = null;
            try {
                if (typeof pickStyleForText === 'function' && spec.pages && spec.pages[0]) {
                    const ft = (spec.pages[0].layers || []).find(l => l && l.type === 'text');
                    if (ft) mainStyle = (pickStyleForText(ft.content || '') || {}).id || null;
                }
            } catch (e) {}
            logSpecApply({ label: 'AI 应用 · ' + newPages.length + ' 页', pages: newPages.length, quality, style: mainStyle, append });

            // 会话归档
            if (typeof archiveAiSession === 'function') {
                try {
                    const chunkTa = document.getElementById('ai-chunk-input');
                    const specTa = document.getElementById('ai-spec-input');
                    archiveAiSession({
                        label: 'AI 应用 · ' + newPages.length + ' 页',
                        rawText: chunkTa ? chunkTa.value : '',
                        rawOutput: specTa ? specTa.value : '',
                        spec,
                        quality
                    });
                } catch (e) {}
            }
        } catch (e) {}
    }

    return { ok: true, errors, warnings, applied: true, pages: newPages };
}
window.applyCoverSpec = applyCoverSpec;

function undoAiSpecApply() {
    const b = window.__aiSpecBackup;
    if (!b || !window.state) return { ok: false, reason: '没有可撤销的 AI 应用' };
    state.pages = JSON.parse(JSON.stringify(b.pages));
    state.currentPageId = b.currentPageId;
    state.selectedLayerId = null;
    state.selectedLayerIds = [];
    state.editingLayerId = null;
    if (b.background && typeof normalizeBackground === 'function') {
        state.background = normalizeBackground(b.background);
    }
    if (state.history && typeof state.history.record === 'function') state.history.record();
    if (typeof applyBackgroundToCanvases === 'function') applyBackgroundToCanvases(state.background);
    if (typeof renderAll === 'function') renderAll();
    window.__aiSpecBackup = null;
    return { ok: true };
}
window.undoAiSpecApply = undoAiSpecApply;

/* ============================================================
   5. 溢出检测（预览用）
   ============================================================ */
/* ============================================================
   安全区自动修复：估算实际渲染高度，越界自动上移/缩字/拆页
   ============================================================ */
/* ============================================================
   真实 DOM 离屏测量（根因修复）：优先测量真实渲染高度，
   measureTextHeight 估算仅作兜底（DOM 不可用时）。
   为什么需要：字体 fallback / emoji 行高 / 行内 span / bgPadding
   都会让纯字符估算偏差，导致底部文字下沉无法被拦截。
   ============================================================ */
const _DOM_MEASURE_PROBE_ID = '__ai_spec_measure_probe__';
let _domMeasureProbe = null;

function _getMeasureProbe() {
    if (_domMeasureProbe && document.body.contains(_domMeasureProbe)) return _domMeasureProbe;
    let el = document.getElementById(_DOM_MEASURE_PROBE_ID);
    if (!el) {
        el = document.createElement('div');
        el.id = _DOM_MEASURE_PROBE_ID;
        el.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;z-index:-1;';
        document.body.appendChild(el);
    }
    _domMeasureProbe = el;
    return el;
}

/**
 * 用离屏 DOM 真实渲染一次文本，拿到 getBoundingClientRect().height。
 * 与画布 .text-content-editable 的 CSS 保持完全一致：
 *   width / font-size / font-family / font-weight / font-style /
 *   text-align / line-height / letter-spacing / white-space:pre-wrap /
 *   word-break:break-word / padding 2px 6px（.canvas-layer 的 padding）
 * 失败时返回 null，让调用方走估算兜底。
 */
function _measureTextHeightByDom(layer) {
    if (!layer || layer.type !== 'text') return null;
    if (typeof document === 'undefined' || !document.body) return null;
    try {
        const probe = _getMeasureProbe();
        // 清空重建，避免上次样式残留
        probe.innerHTML = '';
        const inner = document.createElement('div');
        inner.className = 'text-content-editable';
        inner.style.cssText = [
            'width:100%',
            'white-space:pre-wrap',
            'word-break:break-word',
            'overflow-wrap:break-word',
            'box-sizing:border-box',
            'position:relative'
        ].join(';');
        inner.style.fontSize = layer.fontSize || '28px';
        const safeFamily = (typeof window._safeFontFamily === 'function')
            ? window._safeFontFamily(layer.fontFamily || 'sans-serif')
            : (layer.fontFamily || 'sans-serif');
        if (safeFamily) inner.style.fontFamily = safeFamily;
        inner.style.fontWeight = layer.bold ? 'bold' : 'normal';
        inner.style.fontStyle = layer.italic ? 'italic' : 'normal';
        inner.style.textAlign = layer.align || 'left';
        inner.style.lineHeight = layer.lineHeight || 1.2;
        inner.style.letterSpacing = (layer.letterSpacing && parseFloat(layer.letterSpacing) !== 0)
            ? layer.letterSpacing : 'normal';
        if (layer.color) inner.style.color = layer.color;
        inner.innerHTML = layer.content || '';

        // 外层包一个与 .canvas-layer 一致的内边距 + 宽度
        const wrap = document.createElement('div');
        wrap.style.cssText = 'box-sizing:border-box;padding:2px 6px;';
        wrap.style.width = (Number(layer.width) || 300) + 'px';
        wrap.appendChild(inner);
        probe.appendChild(wrap);

        // 让浏览器立即 layout
        const h = wrap.getBoundingClientRect().height;
        // 清理
        probe.innerHTML = '';
        if (!isFinite(h) || h <= 0) return null;
        return Math.ceil(h);
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] DOM 测量失败，回退估算', e);
        return null;
    }
}
window._measureTextHeightByDom = _measureTextHeightByDom;

function _estimateTextRenderHeight(layer) {
    if (!layer || layer.type !== 'text') return 0;
    // ✅ 根因修复：优先真实 DOM 测量
    const domH = _measureTextHeightByDom(layer);
    if (domH != null) return domH;
    // —— 以下为 DOM 不可用时的兜底估算 ——
    const plain = String(layer.content || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '');
    if (!plain) return 0;
    const fontSize = parseFloat(layer.fontSize) || 28;
    const lineHeight = parseFloat(layer.lineHeight) || 1.2;
    const width = Number(layer.width) || 300;
    const charsPerLine = Math.max(1, Math.floor(width / (fontSize * 0.9)));
    const lines = plain.split('\n').reduce((sum, line) => {
        if (!line) return sum + 1;
        return sum + Math.ceil(line.length / charsPerLine);
    }, 0);
    const textH = lines * fontSize * lineHeight;
    const bgPad = Number(layer.bgPadding) || 0;
    const bgColorActive = layer.bgColor && layer.bgColor !== 'transparent' && layer.bgColor !== 'rgba(0, 0, 0, 0)';
    const boxPad = bgColorActive ? bgPad * 2 + 2 : 0;
    const safetyMargin = Math.ceil(textH * 0.06) + 4;
    return Math.ceil(textH + boxPad + safetyMargin);
}
window._estimateTextRenderHeight = _estimateTextRenderHeight;


/**
 * 按字符宽度累计的文本高度测量（硬约束专用）
 * ✅ 根因修复：优先真实 DOM 测量；DOM 不可用才回退字符宽度估算
 */
function _measureTextHeight(layer) {
    if (!layer || layer.type !== 'text') return 0;
    // ✅ 优先真实 DOM 测量
    const domH = _measureTextHeightByDom(layer);
    if (domH != null) return domH;
    // —— 以下为 DOM 不可用时的字符宽度估算兜底 ——
    const plain = String(layer.content || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '');
    if (!plain) return Number(layer.height) || 0;

    const fontSize = parseFloat(layer.fontSize) || 28;
    const lineHeight = parseFloat(layer.lineHeight) || 1.2;
    const width = Math.max(10, Number(layer.width) || 300);

    const lines = plain.split('\n');
    let totalLines = 0;
    lines.forEach(line => {
        if (!line) {
            totalLines += 1;
            return;
        }
        let lineWidth = 0;
        let wrapped = 1;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            const code = ch.charCodeAt(0);
            let w;
            if (ch === ' ' || ch === '\t') w = 0.3;
            else if (code >= 0x4E00 && code <= 0x9FFF) w = 1.0;
            else if (code >= 0xFF00 && code <= 0xFFEF) w = 1.0;
            else if (code > 0x7F) w = 0.9;
            else w = 0.55;
            lineWidth += w * fontSize;
            if (lineWidth > width) {
                wrapped++;
                lineWidth = w * fontSize;
            }
        }
        totalLines += wrapped;
    });

    const textH = totalLines * fontSize * lineHeight;
    const bgPad = Number(layer.bgPadding) || 0;
    const bgColorActive = layer.bgColor && layer.bgColor !== 'transparent' && layer.bgColor !== 'rgba(0, 0, 0, 0)';
    const boxPad = bgColorActive ? bgPad * 2 + 2 : 0;
    const safetyMargin = Math.ceil(textH * 0.06) + 4;
    return Math.ceil(textH + boxPad + safetyMargin);
}
window._measureTextHeight = _measureTextHeight;

/**
 * 把 spec 里所有文字图层的 height 同步为「实测渲染高度」。
 * 为什么必须是唯一实现：validateSpec / enforce* 都用 Math.max(实测, 声明) 判定，
 * 如果只改了 y 不改 height，会被旧的声明高度顶回去，出现 596/597 反复差 1px。
 * 历史重复：autoFitToSafeArea 尾部、ai-import-ui.doPreview、ai-import-ui 候选预览各写了一份。
 * @param {object} spec
 * @returns {number} 被同步的图层数
 */
function syncSpecTextHeights(spec) {
    let changed = 0;
    if (!spec || !Array.isArray(spec.pages)) return changed;
    if (typeof _measureTextHeight !== 'function') return changed;
    try {
        spec.pages.forEach(page => {
            (page.layers || []).forEach(layer => {
                if (!layer || layer.type !== 'text') return;
                const measured = _measureTextHeight(layer);
                if (measured > 0 && measured !== layer.height) {
                    layer.height = measured;
                    changed++;
                }
            });
        });
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] syncSpecTextHeights 失败', e);
    }
    return changed;
}
window.syncSpecTextHeights = syncSpecTextHeights;

/**
 * 把 spec 的一页渲染成 DOM 节点（背景 + 文字图层 + 特效 + 色块标签）。
 * 用途：候选对比 / 预览浮层 / 历史缩略图 / A-B 对比，全都复用这一份。
 * 历史重复：ai-import-ui.js 3 份 + ai-spec.js 2 份，共 5 份几乎相同的实现。
 *
 * @param {object} page   spec.pages[i]
 * @param {object} [options]
 * @param {number} [options.scale=1]      视觉缩放（内部坐标一律乘 scale）
 * @param {object} [options.background]   该页没有 bg 时的兜底背景
 * @param {boolean} [options.fixedHeight] 是否按 layer.height 固定高度（缩略图用）
 * @param {number} [options.zIndex]       图层容器 z-index
 * @returns {HTMLElement}
 */
function buildSpecPageNode(page, options) {
    options = options || {};
    const scale = Number(options.scale) > 0 ? Number(options.scale) : 1;
    const fallbackBg = ('background' in options)
        ? options.background
        : ((window.state && state.background) || null);
    const px = v => (Number(v) || 0) * scale;

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;inset:0;overflow:hidden;';

    // ---- 背景 ----
    const bg = document.createElement('div');
    bg.style.cssText = 'position:absolute;inset:0;z-index:1;';
    let bgCss = '';
    try {
        const bgSrc = (page && page.bg) ? page.bg : fallbackBg;
        if (bgSrc && typeof backgroundToCss === 'function') bgCss = backgroundToCss(bgSrc) || '';
    } catch (e) {
        bgCss = '';
    }
    bg.style.background = bgCss || 'linear-gradient(135deg, #ff2442, #2575fc)';
    wrap.appendChild(bg);

    // ---- 图层 ----
    const layersWrap = document.createElement('div');
    layersWrap.style.cssText = 'position:absolute;inset:0;' +
        (options.zIndex != null ? ('z-index:' + options.zIndex + ';') : '');
    (page && page.layers || []).forEach(layer => {
        if (!layer || layer.type !== 'text') return;

        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;box-sizing:border-box;padding:2px 6px;';
        el.style.left = px(layer.x) + 'px';
        el.style.top = px(layer.y) + 'px';
        el.style.width = (px(layer.width) || 100 * scale) + 'px';
        if (options.fixedHeight) el.style.height = (px(layer.height) || 60 * scale) + 'px';
        if (layer.rotation) el.style.transform = 'rotate(' + layer.rotation + 'deg)';
        if (layer.opacity !== undefined) el.style.opacity = String(layer.opacity);

        const inner = document.createElement('div');
        inner.innerHTML = layer.content || '';
        inner.style.cssText = 'width:100%;white-space:pre-wrap;word-break:break-word;';
        const fsMatch = String(layer.fontSize || '20px').match(/^([\d.]+)/);
        const fsPx = fsMatch ? parseFloat(fsMatch[1]) : 20;
        inner.style.fontSize = (fsPx * scale) + 'px';
        inner.style.fontFamily = (typeof window._safeFontFamily === 'function')
            ? window._safeFontFamily(layer.fontFamily || 'sans-serif')
            : (layer.fontFamily || 'sans-serif');
        inner.style.fontWeight = layer.bold ? 'bold' : 'normal';
        inner.style.fontStyle = layer.italic ? 'italic' : 'normal';
        inner.style.textAlign = layer.align || 'left';
        inner.style.lineHeight = layer.lineHeight || 1.2;
        inner.style.color = layer.color || '#ffffff';

        // 色块标签（bgColor）
        if (layer.bgColor && layer.bgColor !== 'transparent') {
            inner.style.background = layer.bgColor;
            inner.style.borderRadius = px(layer.bgRadius) + 'px';
            inner.style.padding = px(layer.bgPadding) + 'px';
        }
        // 特效 CSS
        if (layer.effectClass && typeof renderEffectCss === 'function') {
            const cssText = renderEffectCss(layer.effectClass, (layer.effectParams && layer.effectParams[layer.effectClass]) || {});
            Utils.dom.applyCssText(inner, cssText);
        }

        el.appendChild(inner);
        layersWrap.appendChild(el);
    });
    wrap.appendChild(layersWrap);

    // ---- 页码（仅预览用；应用时由 PageNumbers.ensurePageNumbers 写入真实图层） ----
    try {
        const PN = window.PageNumbers;
        const pageNo = Number(options.pageNumber);
        const totalPages = Number(options.totalPages);
        const hasOwn = !!(PN && (page && page.layers || []).some(l => PN.isPageNumberLayer(l)));
        if (PN && pageNo > 0 && totalPages > 1 && !hasOwn) {
            const style = PN.pickStyle([page], {});
            const num = document.createElement('div');
            num.className = 'spec-page-number';
            num.textContent = String(pageNo).padStart(2, '0') + ' / ' + String(totalPages).padStart(2, '0');
            num.style.cssText = 'position:absolute;box-sizing:border-box;pointer-events:none;z-index:3;' +
                'text-align:right;white-space:nowrap;';
            num.style.left = px(28) + 'px';
            num.style.top = px(562) + 'px';
            num.style.width = px(304) + 'px';
            num.style.height = px(16) + 'px';
            num.style.fontSize = px(12) + 'px';
            num.style.lineHeight = '1.1';
            num.style.letterSpacing = px(1) + 'px';
            num.style.opacity = '0.5';
            num.style.color = style.color;
            num.style.fontFamily = (typeof window._safeFontFamily === 'function')
                ? window._safeFontFamily(style.fontFamily)
                : style.fontFamily;
            wrap.appendChild(num);
        }
    } catch (e) { }

    return wrap;
}
window.buildSpecPageNode = buildSpecPageNode;

function autoFitToSafeArea(spec, options) {
    options = options || {};
    const SAFE_TOP = 30;
    // 底部：平台安全区 62 + 一行正文 32 → 内容底 546
    const SAFE_BOTTOM = (window.DesignConstants && DesignConstants.SAFE && DesignConstants.SAFE.contentBottom) || 546;
    const MIN_FONT = options.minFont || 14;
    if (!spec || !Array.isArray(spec.pages)) return { ok: false, fixed: 0, reason: 'spec 无效' };

    let fixed = 0;
    let skipped = 0;
    const details = [];

    spec.pages.forEach((page, pi) => {
        // 先收集本页所有文字图层的包围盒，用于冲突检测
        const boxes = (page.layers || []).map((l, li) => {
            if (!l || l.type !== 'text') return null;
            const h = Math.max(_estimateTextRenderHeight(l), Number(l.height) || 0);
            return { li, layer: l, top: Number(l.y) || 0, h, bottom: (Number(l.y) || 0) + h };
        }).filter(Boolean);

        (page.layers || []).forEach((layer, li) => {
            if (!layer || layer.type !== 'text') return;
            const estH = _estimateTextRenderHeight(layer);
            const declaredH = Number(layer.height) || 0;
            const realH = Math.max(estH, declaredH);
            const bottom = (Number(layer.y) || 0) + realH;
            if (bottom <= SAFE_BOTTOM) return;

            const overflow = bottom - SAFE_BOTTOM;
            const curTop = Number(layer.y) || 0;

            // 尝试 1：上移，但必须不撞上方图层、不撞顶部安全线
            const newY = curTop - overflow;
            if (newY >= SAFE_TOP) {
                // 检查是否与其它图层重叠（当前图层的 top 改成 newY 后，其底 = newY + realH）
                const overlap = boxes.some(other => {
                    if (other.layer === layer) return false;
                    const otherTop = Number(other.layer.y) || 0;
                    const otherBottom = otherTop + (Number(other.layer.height) || 0);
                    // 两个区间 [newY, newY+realH] 与 [otherTop, otherBottom] 是否相交
                    return !(newY + realH <= otherTop + 1 || newY >= otherBottom - 1);
                });
                if (!overlap) {
                    layer.y = newY;
                    fixed++;
                    details.push('P' + (pi + 1) + ' L' + (li + 1) + '：上移 ' + Math.round(overflow) + 'px');
                    return;
                }
                // 上移会撞图层 → 落到尝试 2
            }

            // 尝试 2：上移到顶 + 缩小字号
            const availableH = SAFE_BOTTOM - SAFE_TOP;
            const curFont = parseFloat(layer.fontSize) || 28;
            const curPad = Number(layer.bgPadding) || 0;
            const textOnlyH = realH - (curPad * 2 + 2);
            const scale = Math.min(1, availableH / realH);
            const newFont = Math.max(MIN_FONT, Math.floor(curFont * scale));
            if (newFont < curFont) {
                layer.fontSize = newFont + 'px';
                layer.y = SAFE_TOP;
                if (curPad > 0) {
                    layer.bgPadding = Math.max(2, Math.floor(curPad * scale));
                }
                const newTextH = textOnlyH * scale;
                const newPad = (layer.bgPadding || 0) * 2 + 2;
                layer.height = Math.max(10, Math.ceil(newTextH + newPad));
                fixed++;
                details.push('P' + (pi + 1) + ' L' + (li + 1) + '：字号 ' + curFont + '→' + newFont + 'px + 上移到顶部');
                return;
            }

            // 两种修复都不行 → 跳过并记录，不强行上移（否则会叠字）
            skipped++;
            details.push('P' + (pi + 1) + ' L' + (li + 1) + '：上移会与上方图层重叠且缩字已到下限，跳过（请让 AI 拆页）');
        });
    });

    // ✅ 文字层之间保持最小可视间距：重叠自动推开，装不下整体上移/压缩
    let spacing = null;
    if (window.LayoutSpacing && typeof window.LayoutSpacing.resolveSpec === 'function') {
        try {
            spacing = window.LayoutSpacing.resolveSpec(spec, {
                gap: options.gap != null ? options.gap : 20,
                minGap: options.minGap != null ? options.minGap : 6,
                safeTop: SAFE_TOP,
                safeBottom: SAFE_BOTTOM,
                measure: function (layer) { return _estimateTextRenderHeight(layer); }
            });
            if (spacing.fixed > 0) {
                fixed += spacing.fixed;
                Array.prototype.push.apply(details, spacing.details);
            }
        } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 图层间距修复失败', e);
        }
    }

    // ✅ 修完后把每层 height 同步成实测高度（唯一实现：syncSpecTextHeights）
    const synced = syncSpecTextHeights(spec);
    if (synced > 0) console.log('[AiSpec] autoFit 后同步 ' + synced + ' 个图层高度');

    return { ok: true, fixed, skipped, details, spacing };
}
window.autoFitToSafeArea = autoFitToSafeArea;

/** 供外部单独调用：修复文字图层重叠 / 保证最小间距 */
function enforceTextLayerSpacing(spec, options) {
    if (!window.LayoutSpacing || typeof window.LayoutSpacing.resolveSpec !== 'function') {
        return { ok: false, fixed: 0, pages: [], details: [], reason: 'LayoutSpacing 未加载' };
    }
    const opts = Object.assign({
        measure: function (layer) { return _estimateTextRenderHeight(layer); },
        gap: 20,
        minGap: 6,
        safeTop: SAFE_TOP_HARD,
        safeBottom: SAFE_BOTTOM_HARD
    }, options || {});
    return window.LayoutSpacing.resolveSpec(spec, opts);
}
window.enforceTextLayerSpacing = enforceTextLayerSpacing;

/* ============================================================
   硬约束：物理钳制 / 预算拒绝（不是建议，是强制执行）
   ============================================================ */
const SAFE_TOP_HARD = 30;
// 底部：平台安全区 62 + 一行正文 32 → 546；预算 = 546 - 30
const SAFE_BOTTOM_HARD = (window.DesignConstants && DesignConstants.SAFE && DesignConstants.SAFE.contentBottom) || 546;
const PAGE_HEIGHT_BUDGET = SAFE_BOTTOM_HARD - SAFE_TOP_HARD;

// 硬约束 A：所有图层 y + 真实渲染高度 必须 ≤ 596。超了物理上移；上移撞顶/撞图层 → 返回失败
// ✅ 根因修复：_measureTextHeight 内部已优先用离屏 DOM 真实测量，只有 DOM 不可用时才回退字符估算
function enforceSafeAreaHardConstraint(spec) {
    if (!spec || !Array.isArray(spec.pages)) return { ok: false, spec, reason: 'spec 无效' };
    const failures = [];
    spec.pages.forEach((page, pi) => {
        const boxes = (page.layers || []).map((l, li) => {
            if (!l || l.type !== 'text') return null;
            const measured = _measureTextHeight(l);
            const declared = Number(l.height) || 0;
            const h = Math.max(measured, declared);
            return { li, layer: l, top: Number(l.y) || 0, h, bottom: (Number(l.y) || 0) + h, measured, declared };
        }).filter(Boolean);
        // 按 top 排序，从上到下修
        boxes.sort((a, b) => a.top - b.top);
        boxes.forEach(b => {
            if (b.bottom <= SAFE_BOTTOM_HARD) return;
            const overflow = b.bottom - SAFE_BOTTOM_HARD;
            const newY = b.top - overflow;
            const measureHint = (b.measured > b.declared)
                ? '（真实渲染高 ' + Math.round(b.measured) + 'px，字段声明 ' + Math.round(b.declared) + 'px）'
                : '';
            if (newY < SAFE_TOP_HARD) {
                failures.push({ page: pi + 1, layer: b.li + 1, reason: '需上移 ' + Math.round(overflow) + 'px 但会撞顶部安全线' + measureHint });
                return;
            }
            const overlap = boxes.some(other => {
                if (other === b) return false;
                return !(newY + b.h <= other.top + 1 || newY >= other.bottom - 1);
            });
            if (overlap) {
                failures.push({ page: pi + 1, layer: b.li + 1, reason: '上移 ' + Math.round(overflow) + 'px 会与上方图层重叠' + measureHint });
                return;
            }
            b.layer.y = newY;
        });
    });
    return { ok: failures.length === 0, spec, failures };
}
window.enforceSafeAreaHardConstraint = enforceSafeAreaHardConstraint;

// 硬约束 B：每页所有文字图层高度之和 ≤ 566。超了返回失败，逼 AI 重写
function enforceHeightBudget(spec) {
    if (!spec || !Array.isArray(spec.pages)) return { ok: false, pages: [] };
    const overBudget = [];
    spec.pages.forEach((page, pi) => {
        let total = 0;
        const perLayer = [];
        (page.layers || []).forEach((l, li) => {
            if (!l || l.type !== 'text') return;
            const measured = _measureTextHeight(l);
            const declared = Number(l.height) || 0;
            const h = Math.max(measured, declared);
            total += h;
            perLayer.push({ layer: li + 1, h: Math.round(h), measuredH: Math.round(measured), declaredH: Math.round(declared) });
        });
        if (total > PAGE_HEIGHT_BUDGET) {
            overBudget.push({
                page: pi + 1,
                total: Math.round(total),
                budget: PAGE_HEIGHT_BUDGET,
                overflow: Math.round(total - PAGE_HEIGHT_BUDGET),
                layers: perLayer
            });
        }
    });
    return { ok: overBudget.length === 0, pages: overBudget };
}
window.enforceHeightBudget = enforceHeightBudget;

// 硬约束 C：只读检查（供 applyCoverSpec 断言用）
function checkSafeAreaViolations(spec) {
    if (!spec || !Array.isArray(spec.pages)) return [{ reason: 'spec 无效' }];
    const violations = [];
    spec.pages.forEach((page, pi) => {
        (page.layers || []).forEach((l, li) => {
            if (!l || l.type !== 'text') return;
            const measured = _measureTextHeight(l);
            const declared = Number(l.height) || 0;
            const h = Math.max(measured, declared);
            const bottom = (Number(l.y) || 0) + h;
            if (bottom > SAFE_BOTTOM_HARD) {
                violations.push({
                    page: pi + 1,
                    layer: li + 1,
                    bottom: Math.round(bottom),
                    overflow: Math.round(bottom - SAFE_BOTTOM_HARD),
                    measuredH: Math.round(measured),
                    declaredH: Math.round(declared)
                });
            }
        });
    });
    return violations;
}
window.checkSafeAreaViolations = checkSafeAreaViolations;

if (window.AppSelfTest && typeof AppSelfTest.register === 'function') {
  AppSelfTest.register('ai-safe-area', function () {
    var rows = [];
    function check(name, pass, detail) {
      rows.push({ name: name, pass: !!pass, detail: detail || '' });
    }
    check('_measureTextHeight', typeof _measureTextHeight === 'function');
    check('enforceSafeAreaHardConstraint', typeof enforceSafeAreaHardConstraint === 'function');
    check('enforceHeightBudget', typeof enforceHeightBudget === 'function');
    check('checkSafeAreaViolations', typeof checkSafeAreaViolations === 'function');
    if (typeof _measureTextHeight !== 'function') return rows;

    var good = {
      format: 'douyin-cover-spec', version: 1, titleCandidates: ['A', 'B', 'C'],
      pages: [{ title: 't', bg: { presetId: 'brand-warm-cream' }, layers: [{
        type: 'text', content: '短', fontSize: '36px', lineHeight: 1.2, color: '#263B32',
        x: 30, y: 120, width: 300, height: 80, heightMode: 'auto', bgColor: 'transparent'
      }] }]
    };
    var bad = {
      format: 'douyin-cover-spec', version: 1, titleCandidates: ['A', 'B', 'C'],
      pages: [{ title: 't', bg: { presetId: 'brand-soft-white' }, layers: [{
        type: 'text', content: '1\n2\n3\n4\n5\n6\n7\n8\n9\n10', fontSize: '48px', lineHeight: 1.3, color: '#263B32',
        x: 20, y: 500, width: 320, height: 40, heightMode: 'auto', bgColor: 'transparent'
      }] }]
    };
    var tall = {
      format: 'douyin-cover-spec', version: 1, titleCandidates: ['A', 'B', 'C'],
      pages: [{ title: 't', bg: { presetId: 'brand-light-sage' }, layers: [1,2,3,4,5,6,7,8].map(function (n, i) {
        return {
          type: 'text', content: '段' + n + '\n二\n三', fontSize: '36px', lineHeight: 1.3, color: '#263B32',
          x: 20, y: 30 + i * 70, width: 320, height: 100, heightMode: 'auto', bgColor: 'transparent'
        };
      }) }]
    };

    try {
      var a1 = enforceSafeAreaHardConstraint(JSON.parse(JSON.stringify(good)));
      check('合规不越界', a1 && a1.ok === true);
    } catch (e) { check('合规不越界', false, e.message); }

    try {
      var v2 = checkSafeAreaViolations(JSON.parse(JSON.stringify(bad)));
      check('越界可检出', Array.isArray(v2) && v2.length > 0, JSON.stringify(v2));
    } catch (e) { check('越界可检出', false, e.message); }

    try {
      var a2 = enforceSafeAreaHardConstraint(JSON.parse(JSON.stringify(bad)));
      check('越界拒绝或修好', !!(a2 && (a2.ok === false || a2.ok === true)));
      if (a2 && a2.ok === false) check('越界有 failures', (a2.failures || []).length > 0);
    } catch (e) { check('越界 enforce', false, e.message); }

    try {
      var b3 = enforceHeightBudget(JSON.parse(JSON.stringify(tall)));
      check('预算超标拒绝', b3 && b3.ok === false, JSON.stringify(b3 && b3.pages));
    } catch (e) { check('预算超标拒绝', false, e.message); }

    return rows;
  });
}


function detectOverflows(root) {
    if (!root) return [];
    const issues = [];
    root.querySelectorAll('.canvas-layer.layer-type-text').forEach(el => {
        const inner = el.querySelector('.text-content-editable');
        if (!inner) return;
        const layerId = el.dataset.id || '';
        if (inner.scrollHeight > inner.clientHeight + 2) {
            issues.push({ layerId, type: 'vertical-overflow', overflow: inner.scrollHeight - inner.clientHeight });
        }
        if (inner.scrollWidth > inner.clientWidth + 2) {
            issues.push({ layerId, type: 'horizontal-overflow', overflow: inner.scrollWidth - inner.clientWidth });
        }
        const canvasEl = el.closest('.cover-canvas');
        if (canvasEl) {
            const rect = el.getBoundingClientRect();
            const cRect = canvasEl.getBoundingClientRect();
            if (rect.bottom > cRect.bottom - 6) {
                issues.push({ layerId, type: 'out-of-canvas-bottom' });
            }
        }
    });
    return issues;
}
window.detectOverflows = detectOverflows;

/* ============================================================
   6. 草稿持久化（localStorage）+ 版本迁移
   ============================================================ */
const AI_SPEC_DRAFT_KEY = 'douyin_ai_spec_draft_v1';
const AI_CHUNK_DRAFT_KEY = 'douyin_ai_chunk_draft_v1';

function saveSpecDraft(spec, rawText) {
    try {
        localStorage.setItem(AI_SPEC_DRAFT_KEY, JSON.stringify({
            savedAt: Date.now(),
            spec: spec || null,
            rawText: rawText || ''
        }));
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 保存草稿失败', e);
    }
}
window.saveSpecDraft = saveSpecDraft;

function loadSpecDraft() {
    try {
        const raw = localStorage.getItem(AI_SPEC_DRAFT_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}
window.loadSpecDraft = loadSpecDraft;

function clearSpecDraft() {
    try { localStorage.removeItem(AI_SPEC_DRAFT_KEY); } catch (e) {}
}
window.clearSpecDraft = clearSpecDraft;

function saveChunkDraft(rawText) {
    try {
        localStorage.setItem(AI_CHUNK_DRAFT_KEY, String(rawText || ''));
    } catch (e) {}
}
window.saveChunkDraft = saveChunkDraft;

function loadChunkDraft() {
    try { return localStorage.getItem(AI_CHUNK_DRAFT_KEY) || ''; } catch (e) { return ''; }
}
window.loadChunkDraft = loadChunkDraft;

function migrateSpec(spec) {
    if (!spec || typeof spec !== 'object') return spec;
    // v1 目前是唯一版本；未来 v2 加字段时在此扩展
    if (spec.version === 1) return spec;
    // 未知版本，补 version 字段后再校验
    if (!spec.version) spec.version = 1;
    return spec;
}
window.migrateSpec = migrateSpec;

/* ============================================================
   7. 增量应用：只把某个 chunk 生成的内容写入当前页/新页
   ============================================================ */
function applySingleChunk(chunk, options) {
    options = options || {};
    if (!chunk || typeof chunk !== 'object') return { ok: false, reason: 'chunk 无效' };
    if (!window.state) return { ok: false, reason: 'state 未就绪' };

    const L = chunk.layout || decideLayout(chunk);
    const lines = String(chunk.text || '').split(/\r?\n/).filter(s => s.trim());
    const isHero = L.layout === 'hero';
    const useNewPage = !!options.newPage;

    const newLayers = [];
    if (L.layout === 'long-text') {
        // 长文只生成一页（前 6 行），剩余提示用户逐块应用
        const head = lines.slice(0, 6).join('\n');
        newLayers.push(buildTextLayer({
            content: head,
            fontSize: '24px',
            align: 'left',
            bold: false,
            effectClass: null,
            y: 100,
            height: 60 + Math.min(lines.length, 6) * 34,
            width: 320
        }));
    } else {
        newLayers.push(buildTextLayer({
            content: chunk.text,
            fontSize: L.fontSize || '28px',
            align: L.align || 'center',
            bold: true,
            effectClass: isHero ? 'effect-viral' : 'effect-black-stroke',
            y: isHero ? 140 : 120,
            height: isHero ? 180 : 140
        }));
    }

    const normalized = newLayers.map((l, i) => normalizeSpecLayer(l, i));

    if (useNewPage || options.mode === 'new-page') {
        const newPage = {
            id: 'page-ai-' + Date.now(),
            title: options.title || ('AI 页 ' + (state.pages.length + 1)),
            layers: normalized
        };
        state.pages.push(newPage);
        state.currentPageId = newPage.id;
        state.selectedLayerId = normalized[0] ? normalized[0].id : null;
        state.selectedLayerIds = state.selectedLayerId ? [state.selectedLayerId] : [];
    } else {
        // 覆盖当前页
        const page = state.getCurrentPage && state.getCurrentPage();
        if (!page) return { ok: false, reason: '当前页不存在' };
        page.layers = normalized;
        state.selectedLayerId = normalized[0] ? normalized[0].id : null;
        state.selectedLayerIds = state.selectedLayerId ? [state.selectedLayerId] : [];
    }
    state.editingLayerId = null;

    if (state.history && typeof state.history.record === 'function') state.history.record();
    if (typeof renderAll === 'function') renderAll();
    else {
        if (typeof renderCanvas === 'function') renderCanvas();
        if (typeof renderLayerList === 'function') renderLayerList();
        if (typeof renderPageList === 'function') renderPageList();
    }
    return { ok: true, layers: normalized };
}
window.applySingleChunk = applySingleChunk;

/* ============================================================
   8. 差异对比（应用前告知用户会覆盖多少内容）
   ============================================================ */
function diffSpecAgainstCanvas(spec) {
    const result = {
        pagesBefore: 0,
        pagesAfter: 0,
        layersBefore: 0,
        layersAfter: 0,
        pagesOverwritten: 0,
        pagesAdded: 0,
        textLayersAfter: 0,
        effectLayersAfter: 0
    };
    if (!window.state) return result;

    const beforePages = state.pages || [];
    result.pagesBefore = beforePages.length;
    result.layersBefore = beforePages.reduce((s, p) => s + ((p.layers && p.layers.length) || 0), 0);

    const specPages = (spec && spec.pages) || [];
    result.pagesAfter = specPages.length;
    result.layersAfter = specPages.reduce((s, p) => s + ((p && p.layers && p.layers.length) || 0), 0);

    result.pagesAdded = Math.max(0, result.pagesAfter - result.pagesBefore);
    result.pagesOverwritten = Math.min(result.pagesAfter, result.pagesBefore);

    specPages.forEach(p => {
        (p && p.layers || []).forEach(l => {
            if (!l) return;
            if (l.type === 'text') result.textLayersAfter++;
            if (l.effectClass || (Array.isArray(l.effectClasses) && l.effectClasses.length)) result.effectLayersAfter++;
        });
    });

    return result;
}
window.diffSpecAgainstCanvas = diffSpecAgainstCanvas;

/* ============================================================
   9. spec → chunks 反解析（便于把现有页面重新拆成分块）
   ============================================================ */
function specToChunks(spec) {
    if (!spec || !Array.isArray(spec.pages)) return [];
    const chunks = [];
    spec.pages.forEach((p, pi) => {
        const layers = (p && p.layers) || [];
        if (!layers.length) return;
        // 把一页所有 text 图层按顺序拼起来当作一个 chunk
        const texts = layers
            .filter(l => l && l.type === 'text')
            .map(l => String(l.content || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''));
        if (!texts.length) return;
        const text = texts.join('\n');
        const analyzed = analyzeChunk(text);
        chunks.push({
            index: chunks.length + 1,
            pageIndex: pi,
            pageTitle: p.title || ('第 ' + (pi + 1) + ' 页'),
            text: analyzed.text,
            charCount: analyzed.charCount,
            lineCount: analyzed.lineCount,
            hasEmoji: analyzed.hasEmoji,
            hasNumber: analyzed.hasNumber,
            layout: decideLayout(analyzed)
        });
    });
    return chunks;
}
window.specToChunks = specToChunks;

/* ============================================================
   10. 一键把当前画布导出为 spec（便于复用为模板/分享）
   ============================================================ */
function exportCanvasAsSpec() {
    if (!window.state) return null;
    const pages = (state.pages || []).map(p => ({
        title: p.title || '',
        layers: (p.layers || []).map(layer => {
            const copy = JSON.parse(JSON.stringify(layer));
            delete copy.id;
            delete copy.locked;
            delete copy.groupId;
            if (copy.groupId === null) delete copy.groupId;
            return copy;
        })
    }));
    // 保留 titleCandidates 为空（当前画布没有候选）
    const bg = state.background ? JSON.parse(JSON.stringify(state.background)) : null;
    if (pages[0]) {
        if (bg && bg.presetId) pages[0].bg = { presetId: bg.presetId };
        else if (bg) pages[0].bg = {
            type: bg.type, color1: bg.color1, color2: bg.color2,
            angle: bg.angle, texture: bg.texture
        };
    }
    return {
        format: 'douyin-cover-spec',
        version: 1,
        titleCandidates: [],
        pages
    };
}
window.exportCanvasAsSpec = exportCanvasAsSpec;

/* ============================================================
   11. 严格校验：warning 也视为 error，供高品质模式
   ============================================================ */
function validateSpecStrict(spec) {
    const base = validateSpec(spec);
    if (!base.warnings || base.warnings.length === 0) return base;
    return {
        ok: false,
        errors: base.errors.concat(base.warnings.map(w => '[严格] ' + w)),
        warnings: []
    };
}
window.validateSpecStrict = validateSpecStrict;

/* ============================================================
   12. 自动修复：对 spec 应用所有可自动修复项，不直接修改原对象
   ============================================================ */
function autoFixSpec(spec) {
    if (!spec || typeof spec !== 'object') return { spec, fixed: 0 };
    const cloned = JSON.parse(JSON.stringify(spec));
    const before = validateSpec(cloned);
    // validateSpec 只做「几何钳制 + 结构补齐」这类机械修复；
    // 品牌色 / 背景 / 特效 / titleCandidates 等合规项只报 error，不做静默改写。
    const after = validateSpec(cloned);
    return {
        spec: cloned,
        fixed: (before.warnings || []).length,
        remaining: (after.errors || []).length
    };
}
window.autoFixSpec = autoFixSpec;

/* ============================================================
   13. 导出为 few-shot 模板（去掉具体坐标，保留视觉语言）
   ============================================================ */
function exportSpecAsFewShot(spec) {
    if (!spec || !Array.isArray(spec.pages)) return null;
    const pick = ['type', 'content', 'fontSize', 'fontFamily', 'color', 'bgColor',
        'bold', 'italic', 'underline', 'strike', 'align', 'vertical',
        'letterSpacing', 'lineHeight', 'opacity', 'effectClass', 'effectParams',
        'heightMode', 'backdrop'];
    return {
        format: 'douyin-cover-fewshot',
        version: 1,
        note: '这是一份 few-shot 风格样本：x/y 被移除，只保留视觉语言，供 AI 参考风格',
        pages: spec.pages.map(p => ({
            title: p.title || '',
            bg: p.bg || null,
            layers: ((p && p.layers) || []).map(l => {
                const out = {};
                pick.forEach(k => { if (l[k] !== undefined) out[k] = l[k]; });
                return out;
            })
        }))
    };
}
window.exportSpecAsFewShot = exportSpecAsFewShot;

/* ============================================================
   14. 智能建议：应用前给用户看“这套方案有什么问题”
   ============================================================ */
function suggestSpecImprovements(spec) {
    const suggestions = [];
    if (!spec || !Array.isArray(spec.pages) || spec.pages.length === 0) {
        return suggestions;
    }

    const pageCount = spec.pages.length;
    if (pageCount > 15) {
        suggestions.push({ level: 'warn', text: '页数 ' + pageCount + ' 偏多，建议合并相似页或拆成多个项目' });
    }
    if (pageCount === 1) {
        suggestions.push({ level: 'info', text: '只有 1 页，如需发多图可考虑拆分或增加正文页' });
    }

    let totalText = 0;
    let totalEffect = 0;
    let totalChars = 0;
    const fontSizeSet = new Set();
    const colorSet = new Set();

    spec.pages.forEach((p, pi) => {
        const layers = (p && p.layers) || [];
        layers.forEach(l => {
            if (!l) return;
            if (l.type === 'text') {
                totalText++;
                totalChars += String(l.content || '').replace(/<[^>]*>/g, '').length;
                if (l.effectClass) totalEffect++;
                if (l.fontSize) fontSizeSet.add(l.fontSize);
                if (l.color) colorSet.add(l.color);
            }
        });
        if (layers.length > 4) {
            suggestions.push({ level: 'warn', text: '第 ' + (pi + 1) + ' 页有 ' + layers.length + ' 个图层，可能过于拥挤（建议 ≤4）' });
        }
        if (layers.length === 0) {
            suggestions.push({ level: 'warn', text: '第 ' + (pi + 1) + ' 页没有图层' });
        }
    });

    if (totalText > 0) {
        const effectRatio = totalEffect / totalText;
        if (effectRatio > 0.9) suggestions.push({ level: 'warn', text: '特效覆盖率 ' + Math.round(effectRatio * 100) + '%，几乎全是特效，可能视觉疲劳，建议保留 1-2 个纯色文字' });
        if (effectRatio < 0.15 && totalText >= 3) suggestions.push({ level: 'info', text: '特效覆盖率仅 ' + Math.round(effectRatio * 100) + '%，封面冲击力可能不足' });
        const avg = totalChars / totalText;
        if (avg > 60) suggestions.push({ level: 'warn', text: '平均每图层 ' + Math.round(avg) + ' 字偏多，建议拆成更短的标题' });
    }

    if (fontSizeSet.size > 4) suggestions.push({ level: 'info', text: '使用了 ' + fontSizeSet.size + ' 种字号，建议统一到 3 种以内（大标题 / 副标题 / 正文）' });
    if (colorSet.size > 6) suggestions.push({ level: 'info', text: '使用了 ' + colorSet.size + ' 种颜色，建议收敛到 3 种主色以内' });

    return suggestions;
}
window.suggestSpecImprovements = suggestSpecImprovements;

/* ============================================================
   15. 单页替换：把 spec 里第 n 页替换到当前页
   ============================================================ */
function replaceCurrentPageWithSpecPage(spec, pageIndex) {
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    if (!spec || !Array.isArray(spec.pages)) return { ok: false, reason: 'spec.pages 无效' };
    const idx = Math.max(0, Math.min(spec.pages.length - 1, pageIndex | 0));
    const sp = spec.pages[idx];
    if (!sp) return { ok: false, reason: '该页不存在' };
    const page = state.getCurrentPage && state.getCurrentPage();
    if (!page) return { ok: false, reason: '当前页不存在' };

    const beforePages = JSON.parse(JSON.stringify(state.pages || []));
    const beforePageId = state.currentPageId;
    const beforeBg = state.background ? JSON.parse(JSON.stringify(state.background)) : null;

    const normalized = ((sp.layers || [])).map((src, li) => normalizeSpecLayer(src, li));
    page.layers = normalized;
    if (sp.title) page.title = sp.title;

    if (sp.bg && typeof normalizeBackground === 'function') {
        try { state.background = normalizeBackground(sp.bg); } catch (e) {}
    }

    state.selectedLayerId = normalized[0] ? normalized[0].id : null;
    state.selectedLayerIds = state.selectedLayerId ? [state.selectedLayerId] : [];
    state.editingLayerId = null;

    try {
        window.__aiSpecBackup = {
            appliedAt: Date.now(),
            pages: beforePages,
            currentPageId: beforePageId,
            background: beforeBg
        };
    } catch (e) {}

    if (state.history && typeof state.history.record === 'function') state.history.record();
    if (typeof applyBackgroundToCanvases === 'function') applyBackgroundToCanvases(state.background);
    if (typeof renderAll === 'function') renderAll();
    return { ok: true, pageIndex: idx };
}
window.replaceCurrentPageWithSpecPage = replaceCurrentPageWithSpecPage;

/* ============================================================
   16. 单页复制到新页：把 spec 第 n 页追加为新页
   ============================================================ */
function appendSpecPageAsNewPage(spec, pageIndex) {
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    if (!spec || !Array.isArray(spec.pages)) return { ok: false, reason: 'spec.pages 无效' };
    const idx = Math.max(0, Math.min(spec.pages.length - 1, pageIndex | 0));
    const sp = spec.pages[idx];
    if (!sp) return { ok: false, reason: '该页不存在' };

    const normalized = ((sp.layers || [])).map((src, li) => normalizeSpecLayer(src, li));
    const newPage = {
        id: 'page-ai-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        title: sp.title || ('AI 页 ' + (state.pages.length + 1)),
        layers: normalized
    };
    state.pages.push(newPage);
    state.currentPageId = newPage.id;
    state.selectedLayerId = normalized[0] ? normalized[0].id : null;
    state.selectedLayerIds = state.selectedLayerId ? [state.selectedLayerId] : [];
    state.editingLayerId = null;

    if (state.history && typeof state.history.record === 'function') state.history.record();
    if (typeof renderAll === 'function') renderAll();
    else {
        if (typeof renderCanvas === 'function') renderCanvas();
        if (typeof renderLayerList === 'function') renderLayerList();
        if (typeof renderPageList === 'function') renderPageList();
    }
    return { ok: true, pageId: newPage.id };
}
window.appendSpecPageAsNewPage = appendSpecPageAsNewPage;

/* ============================================================
   17. 自动拆分长文本图层（作用于当前页，按行数拆多个图层）
   ============================================================ */
function autoSplitLongTextLayers(options) {
    options = options || {};
    const maxLinesPerLayer = options.maxLines || 6;
    const gapY = options.gapY || 12;
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const page = state.getCurrentPage && state.getCurrentPage();
    if (!page) return { ok: false, reason: '当前页不存在' };

    const newLayers = [];
    let splitCount = 0;
    (page.layers || []).forEach(layer => {
        if (!layer || layer.type !== 'text') { newLayers.push(layer); return; }
        const raw = String(layer.content || '');
        const lines = raw.split(/<br\s*\/?>/i).length > 1
            ? raw.split(/<br\s*\/?>/i)
            : raw.split(/\r?\n/);
        if (lines.length <= maxLinesPerLayer) { newLayers.push(layer); return; }

        splitCount++;
        const chunkSize = Math.ceil(lines.length / Math.ceil(lines.length / maxLinesPerLayer));
        let cursorY = layer.y;
        for (let i = 0; i < lines.length; i += chunkSize) {
            const chunk = lines.slice(i, i + chunkSize).join('\n');
            const copy = JSON.parse(JSON.stringify(layer));
            copy.id = (layer.type || 'layer') + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
            copy.content = chunk;
            copy.y = cursorY;
            copy.height = Math.max(30, (layer.height || 100) / Math.ceil(lines.length / chunkSize));
            newLayers.push(copy);
            cursorY += (copy.height || 40) + gapY;
        }
    });

    if (splitCount === 0) return { ok: false, reason: '没有需要拆分的图层' };
    page.layers = newLayers;
    if (state.history && typeof state.history.record === 'function') state.history.record();
    if (typeof renderAll === 'function') renderAll();
    return { ok: true, splitCount };
}
window.autoSplitLongTextLayers = autoSplitLongTextLayers;

/* ============================================================
   18. 全局自动缩字：对当前页所有溢出文字图层等比缩字号
   ============================================================ */
function autoShrinkOverflowText(options) {
    options = options || {};
    const minFont = options.minFont || 14;
    const factor = options.factor || 0.9;
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const page = state.getCurrentPage && state.getCurrentPage();
    if (!page) return { ok: false, reason: '当前页不存在' };

    // 需要 DOM 才能测溢出；如果正在拖动中则跳过
    if (window.__layerDragging) return { ok: false, reason: '拖动中，稍后再试' };

    let changed = 0;
    const activeSelector = '.canvas-page-wrapper[data-page-id="' + state.currentPageId + '"]';
    (page.layers || []).forEach(layer => {
        if (!layer || layer.type !== 'text') return;
        const el = document.querySelector(activeSelector + ' .canvas-layer[data-id="' + layer.id + '"] .text-content-editable');
        if (!el) return;
        if (el.scrollHeight <= el.clientHeight + 2 && el.scrollWidth <= el.clientWidth + 2) return;
        let fs = parseFloat(layer.fontSize) || 28;
        let guard = 0;
        while (fs > minFont && guard < 30) {
            fs = Math.max(minFont, Math.round(fs * factor));
            el.style.fontSize = fs + 'px';
            guard++;
            if (el.scrollHeight <= el.clientHeight + 2 && el.scrollWidth <= el.clientWidth + 2) break;
        }
        layer.fontSize = fs + 'px';
        changed++;
    });

    if (changed > 0) {
        if (state.history && typeof state.history.record === 'function') state.history.record();
        if (typeof renderCanvas === 'function') renderCanvas();
    }
    return { ok: true, changed };
}
window.autoShrinkOverflowText = autoShrinkOverflowText;

/* ============================================================
   19. 批量应用所有 chunk（一键生成多页兜底）
   ============================================================ */
function applyAllChunks(rawText, options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const payload = buildChunkPayload(rawText);
    if (!payload.chunks.length) return { ok: false, reason: '没有可应用的分块' };

    const mode = options.mode || 'replace'; // 'replace' | 'append'
    const autoBg = options.autoBg !== false && typeof pickBackgroundForText === 'function';
    const forceStyle = (options.forceStyleId && typeof getStyleById === 'function')
        ? getStyleById(options.forceStyleId)
        : null;
    const beforePages = JSON.parse(JSON.stringify(state.pages || []));
    const beforePageId = state.currentPageId;
    const beforeBg = state.background ? JSON.parse(JSON.stringify(state.background)) : null;

    const newPages = [];
    payload.chunks.forEach((chunk, ci) => {
        const L = chunk.layout;
        const lines = String(chunk.text || '').split(/\r?\n/).filter(s => s.trim());
        const isHero = L.layout === 'hero';
        const isLong = L.layout === 'long-text';
        const style = forceStyle || ((typeof pickStyleForText === 'function') ? pickStyleForText(chunk.text || '') : null);
        const titleFx = (style && isHero) ? style.titleEffect : (isHero ? 'effect-viral' : 'effect-black-stroke');
        const titleColor = (style && style.titleColor) ? style.titleColor : '#ffffff';

        if (!isLong) {
            newPages.push({
                id: 'page-ai-' + Date.now() + '-' + ci,
                title: '第 ' + (ci + 1) + ' 页',
                layers: [
                    normalizeSpecLayer(buildTextLayer({
                        content: chunk.text,
                        fontSize: L.fontSize,
                        align: L.align,
                        bold: true,
                        effectClass: titleFx,
                        y: isHero ? 140 : 120,
                        height: isHero ? 180 : 140,
                        color: titleColor
                    }), 0)
                ]
            });
            return;
        }
        // long-text 拆页
        const maxLines = 6;
        let buffer = [];
        const flush = () => {
            if (!buffer.length) return;
            newPages.push({
                id: 'page-ai-' + Date.now() + '-' + ci + '-' + newPages.length,
                title: '第 ' + (newPages.length + 1) + ' 页',
                layers: [
                    normalizeSpecLayer(buildTextLayer({
                        content: buffer.join('\n'),
                        fontSize: '24px',
                        align: 'left',
                        bold: false,
                        effectClass: null,
                        y: 100,
                        height: 60 + buffer.length * 34,
                        width: 320
                    }), 0)
                ]
            });
            buffer = [];
        };
        lines.forEach(line => {
            if (buffer.length >= maxLines) flush();
            buffer.push(line);
        });
        flush();
    });

    if (autoBg) {
        try {
            const heroChunk = payload.chunks.find(c => c.layout.layout === 'hero') || payload.chunks[0];
            // 优先用风格预设指定的 bgPresetId，其次用关键词匹配
            const style = (typeof pickStyleForText === 'function') ? pickStyleForText(heroChunk.text || '') : null;
            let preset = null;
            if (style && style.bgPresetId) {
                preset = (window.BG_PRESETS || []).find(p => p.id === style.bgPresetId) || null;
            }
            if (!preset && typeof pickBackgroundForText === 'function') {
                preset = pickBackgroundForText(heroChunk.text || '');
            }
            if (preset && typeof normalizeBackground === 'function') {
                state.background = normalizeBackground({
                    type: preset.type || 'gradient',
                    color1: preset.color1 || '#ff2442',
                    color2: preset.color2 || preset.color1 || '#2575fc',
                    angle: preset.angle != null ? preset.angle : 135,
                    texture: preset.texture || 'none',
                    presetId: preset.id
                });
            }
        } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 自动配背景失败', e);
        }
    }

    if (mode === 'append') {
        state.pages = (state.pages || []).concat(newPages);
        state.currentPageId = newPages[0] ? newPages[0].id : state.currentPageId;
    } else {
        state.pages = newPages;
        state.currentPageId = newPages[0] ? newPages[0].id : null;
    }
    state.selectedLayerId = null;
    state.selectedLayerIds = [];
    state.editingLayerId = null;

    try {
        window.__aiSpecBackup = {
            appliedAt: Date.now(),
            pages: beforePages,
            currentPageId: beforePageId,
            background: beforeBg
        };
    } catch (e) {}

    if (state.history && typeof state.history.record === 'function') state.history.record();
    if (typeof applyBackgroundToCanvases === 'function') applyBackgroundToCanvases(state.background);
    if (typeof renderAll === 'function') renderAll();

    if (typeof pushAiHistory === 'function') {
        try {
            pushAiHistory({
                spec: { format: 'douyin-cover-spec', version: 1, pages: newPages, titleCandidates: [] },
                label: '批量应用 · ' + newPages.length + ' 页',
                rawText: rawText || ''
            });
        } catch (e) {}
    }
    return { ok: true, pagesCount: newPages.length };
}
window.applyAllChunks = applyAllChunks;

/* ============================================================
   20. 按文本自动匹配背景预设
   ============================================================ */
function pickBackgroundForText(text) {
    const t = String(text || '').toLowerCase();
    const allPresets = (typeof getAllBgPresets === 'function')
        ? getAllBgPresets()
        : (window.BG_PRESETS || []);
    const map = (window.SMART_KEYWORD_MAP && Array.isArray(window.SMART_KEYWORD_MAP))
        ? window.SMART_KEYWORD_MAP
        : [];
    for (const rule of map) {
        if (!rule || !Array.isArray(rule.keys)) continue;
        if (rule.keys.some(k => t.includes(String(k).toLowerCase()))) {
            const ids = rule.presets || [];
            for (const id of ids) {
                const p = allPresets.find(x => x.id === id);
                if (p) return p;
            }
        }
    }
    // 兜底：热门第一款
    const hot = allPresets.filter(x => x.cat === 'hot');
    return hot[0] || null;
}
window.pickBackgroundForText = pickBackgroundForText;

/* ============================================================
   21. AI 历史记录（最近 N 次有效 spec 环形缓冲）
   ============================================================ */
const AI_HISTORY_KEY = 'douyin_ai_spec_history_v1';
const AI_HISTORY_MAX = 10;

function pushAiHistory(entry) {
    if (!entry || !entry.spec) return;
    try {
        let list = [];
        try { list = JSON.parse(localStorage.getItem(AI_HISTORY_KEY) || '[]'); } catch (e) { list = []; }
        if (!Array.isArray(list)) list = [];
        const quality = (typeof scoreSpecQuality === 'function')
            ? (scoreSpecQuality(entry.spec).total || 0)
            : 0;
        let label = entry.label || ('方案 ' + new Date().toLocaleString());
        if (typeof dedupeHistoryLabel === 'function') {
            label = dedupeHistoryLabel(label);
        }
        const item = {
            savedAt: Date.now(),
            label: label,
            spec: entry.spec,
            rawText: entry.rawText || '',
            thumb: '',
            quality
        };
        list.unshift(item);
        if (list.length > AI_HISTORY_MAX) list = list.slice(0, AI_HISTORY_MAX);
        localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(list));

        // 异步生成缩略图后再写回（不阻塞主流程）
        if (typeof renderSpecThumbnail === 'function') {
            renderSpecThumbnail(entry.spec).then(url => {
                if (!url) return;
                try {
                    let fresh = JSON.parse(localStorage.getItem(AI_HISTORY_KEY) || '[]');
                    if (!Array.isArray(fresh)) return;
                    const idx = fresh.findIndex(x => x && x.savedAt === item.savedAt && x.label === item.label);
                    if (idx >= 0) {
                        fresh[idx].thumb = url;
                        localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(fresh));
                        if (window.AiImportUI && AiImportUI.refreshHistory) {
                            try { AiImportUI.refreshHistory(); } catch (e) {}
                        }
                    }
                } catch (e) {}
            }).catch(() => {});
        }
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 写入 AI 历史失败', e);
    }
}
window.pushAiHistory = pushAiHistory;

function getAiHistory() {
    try {
        const list = JSON.parse(localStorage.getItem(AI_HISTORY_KEY) || '[]');
        return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
}
window.getAiHistory = getAiHistory;

function clearAiHistory() {
    try { localStorage.removeItem(AI_HISTORY_KEY); } catch (e) {}
}
window.clearAiHistory = clearAiHistory;

/* ============================================================
   22. 风格预设（确定性视觉语言，供无 AI / AI 提示词参考）
   ============================================================ */
const AI_STYLE_PRESETS = [
    {
        id: 'viral-red',
        name: '爆款红黑',
        keywords: ['逆袭', '赚钱', '副业', '月入', '搞钱', '暴富', '创业', '投资', '财富'],
        bgPresetId: 'hot-01',
        titleEffect: 'effect-viral',
        subEffect: 'effect-black-stroke',
        titleColor: '#ffffff',
        subColor: '#ffeb3b',
        titleFont: 'sans-serif',
        backlineBackdrop: { type: 'highlight', color: '#ffffff', opacity: 0.55, padding: 10, rotate: -1 }
    },
    {
        id: 'knowledge-blue',
        name: '知识蓝',
        keywords: ['知识', '干货', '学习', '教程', '方法', '技巧', '攻略', '笔记', '认知', '思维'],
        bgPresetId: 'know-01',
        titleEffect: null,
        subEffect: null,
        titleColor: '#ffffff',
        subColor: '#00e5ff',
        titleFont: 'sans-serif',
        backlineBackdrop: { type: 'paper', color: '#fff8dc', opacity: 0.92, padding: 14, rotate: -1 }
    },
    {
        id: 'fresh-cream',
        name: '清新奶油',
        keywords: ['治愈', '温柔', '生活', '日常', '幸福', '慢生活', '春天', '夏天', '恋爱', '心动'],
        bgPresetId: 'fresh-01',
        titleEffect: null,
        subEffect: null,
        titleColor: '#ff6b9d',
        subColor: '#5a4a42',
        titleFont: 'sans-serif',
        backlineBackdrop: { type: 'washi', color: '#fdf2f8', opacity: 0.95, padding: 16, rotate: -2 }
    },
    {
        id: 'cyber-neon',
        name: '赛博霓虹',
        keywords: ['ai', '科技', '未来', '人工智能', '元宇宙', '数码', '编程', '代码', '芯片', '赛博'],
        bgPresetId: 'neon-01',
        titleEffect: 'effect-cyber',
        subEffect: 'effect-glitch',
        titleColor: '#ffffff',
        subColor: '#ffffff',
        titleFont: 'sans-serif',
        backlineBackdrop: null
    }
];
window.AI_STYLE_PRESETS = AI_STYLE_PRESETS;

function pickStyleForText(text) {
    const t = String(text || '').toLowerCase();
    let best = null;
    let bestScore = 0;
    AI_STYLE_PRESETS.forEach(style => {
        let score = 0;
        style.keywords.forEach(k => { if (t.includes(k)) score++; });
        if (score > bestScore) { bestScore = score; best = style; }
    });
    return best || AI_STYLE_PRESETS[0];
}
window.pickStyleForText = pickStyleForText;

function getStyleById(id) {
    return AI_STYLE_PRESETS.find(s => s.id === id) || null;
}
window.getStyleById = getStyleById;

/* ============================================================
   23. AI 输出修正器：容错解析常见非标 JSON 输出
   ============================================================ */
function repairAiJsonText(raw) {
    if (!raw) return '';
    let text = String(raw).trim();

    // 1. 去掉外层代码块包裹
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();

    // 2. 去掉 AI 常见的引导性前言（“好的，以下是...”）
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        text = text.slice(firstBrace, lastBrace + 1);
    }

    // 3. 中文引号 → 英文引号（只针对结构里会出现的字段名/字符串值）
    text = text.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'");

    // 4. 全角标点修正
    text = text.replace(/\uFF0C/g, ',').replace(/\uFF1A/g, ':').replace(/\uFF1B/g, ';');

    // 5. 去掉尾逗号（对象/数组最后一个元素后的逗号）
    text = text.replace(/,(\s*[}\]])/g, '$1');

    // 6. 单引号键 → 双引号（粗略，仅在键位附近）
    //    注意：只处理紧跟冒号的 key，避免误伤普通字符串
    text = text.replace(/([{,]\s*)'([^'\\\n]+)'(\s*:)/g, '$1"$2"$3');

    // 7. 去掉 // 单行注释
    text = text.replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    // 8. 去掉 /* */ 块注释
    text = text.replace(/\/\*[\s\S]*?\*\//g, '');

    return text.trim();
}
window.repairAiJsonText = repairAiJsonText;

/* ============================================================
   24. 生成 spec 首页缩略图（dataURL），仅用于历史列表展示
   ============================================================ */
async function renderSpecThumbnail(spec, maxWidth) {
    maxWidth = maxWidth || 180;
    if (!spec || !Array.isArray(spec.pages) || !spec.pages.length) return '';
    if (typeof html2canvas === 'undefined') return '';

    const page = spec.pages[0];
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;left:-99999px;top:0;width:360px;height:640px;background:#000;overflow:hidden;';

    // ✅ 页面渲染统一走 buildSpecPageNode（背景 / 图层 / 特效 / 色块标签一份实现）
    wrap.appendChild(buildSpecPageNode(page, {
        scale: 1,
        fixedHeight: true,
        background: (window.state && state.background) || null
    }));
    document.body.appendChild(wrap);

    try {
        const canvas = await html2canvas(wrap, {
            scale: 0.5,
            backgroundColor: null,
            logging: false,
            useCORS: true,
            allowTaint: true,
            width: 360,
            height: 640
        });
        const small = document.createElement('canvas');
        small.width = maxWidth;
        small.height = Math.round(maxWidth * 640 / 360);
        const ctx = small.getContext('2d');
        ctx.drawImage(canvas, 0, 0, small.width, small.height);
        return small.toDataURL('image/jpeg', 0.6);
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 缩略图渲染失败', e);
        return '';
    } finally {
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }
}
window.renderSpecThumbnail = renderSpecThumbnail;

/* ============================================================
   25. AI 简洁提示词（system 短版）：输出稳定、token 少
   ============================================================ */
function buildCompactSystemPrompt() {
    const lines = [];
    lines.push('你是抖音封面设计助手。只输出 JSON，不输出任何解释、代码块包裹除外。');
    lines.push('');
    lines.push('输出结构：');
    lines.push('{ format: "douyin-cover-spec", version: 1, titleCandidates: ["a","b","c"], pages: [{ title, bg: { presetId }, layers: [layer...] }] }');
    lines.push('');
    lines.push('layer 字段：type("text") content fontSize fontFamily color bgColor bold italic underline strike align vertical letterSpacing lineHeight opacity effectClass effectParams x y width height heightMode("auto") rotation flipH flipV locked groupId backdrop');
    lines.push('');
    lines.push('画布：360×640，字号 12~120px，x/y 在画布范围内');
    lines.push('');
    lines.push('可选特效 effectClass：');
    (window.AI_STYLE_PRESETS || []).forEach(s => {});
    try {
        const all = (typeof getAllEffectsMaster === 'function') ? getAllEffectsMaster() : [];
        all.forEach(e => {
            const keys = Object.keys(e.params || {});
            lines.push('- ' + e.id + (keys.length ? ' (params: ' + keys.join(', ') + ')' : ''));
        });
    } catch (e) {}
    lines.push('');
    lines.push('可选背景 presetId：');
    const bg = (window.BG_PRESETS || []).slice(0, 30);
    bg.forEach(p => lines.push('- ' + p.id + ' (' + p.name + ')'));
    lines.push('');
    lines.push('风格关键词对应：');
    (window.AI_STYLE_PRESETS || []).forEach(s => {
        lines.push('- ' + s.name + '：关键词 [' + s.keywords.slice(0, 5).join(', ') + ']，背景 ' + s.bgPresetId + '，主特效 ' + (s.titleEffect || '无'));
    });
    lines.push('');
    lines.push('硬要求：严格 JSON，双引号，无尾逗号，无注释，无前后解释。');
    return lines.join('\n');
}
window.buildCompactSystemPrompt = buildCompactSystemPrompt;

/* ============================================================
   26. AI 输出质量评分（0-100）：用于在应用前给用户一个“好不好”的直观判断
   ============================================================ */
function scoreSpecQuality(spec) {
    const dim = {
        structure: { score: 0, max: 20, note: '' },
        typography: { score: 0, max: 20, note: '' },
        color: { score: 0, max: 15, note: '' },
        effect: { score: 0, max: 20, note: '' },
        layout: { score: 0, max: 15, note: '' },
        density: { score: 0, max: 10, note: '' }
    };

    if (!spec || !Array.isArray(spec.pages) || !spec.pages.length) {
        return { total: 0, dim };
    }

    const pages = spec.pages;
    const pageCount = pages.length;
    let textCount = 0;
    let effectCount = 0;
    let totalChars = 0;
    const fontSizes = new Set();
    const colors = new Set();
    let overflowRisk = 0;
    let hasBackdrop = 0;
    let hasTitleCandidate = Array.isArray(spec.titleCandidates) && spec.titleCandidates.length >= 3;

    pages.forEach(p => {
        const layers = (p && p.layers) || [];
        const pageTexts = layers.filter(l => l && l.type === 'text');
        if (pageTexts.length === 0) return;

        pageTexts.forEach(l => {
            textCount++;
            totalChars += String(l.content || '').replace(/<[^>]*>/g, '').length;
            if (l.effectClass) effectCount++;
            if (l.fontSize) fontSizes.add(String(l.fontSize));
            if (l.color) colors.add(String(l.color).toUpperCase());
            if (l.backdrop && l.backdrop.type && l.backdrop.type !== 'none') hasBackdrop++;

            // 溢出风险：粗估字数 × 字号 × 行数 → 与宽高比较
            const fs = parseFloat(l.fontSize) || 28;
            const w = Number(l.width) || 300;
            const h = Number(l.height) || 60;
            const chars = String(l.content || '').replace(/<[^>]*>/g, '').length;
            const lineH = fs * 1.2;
            const charsPerLine = Math.max(1, Math.floor(w / (fs * 0.85)));
            const linesNeeded = Math.ceil(chars / charsPerLine);
            const heightNeeded = linesNeeded * lineH;
            if (heightNeeded > h * 1.4) overflowRisk++;
        });
    });

    // ---- 结构 20 ----
    let sStruct = 0;
    if (pageCount >= 1) sStruct += 6;
    if (pageCount >= 2 && pageCount <= 15) sStruct += 6;
    if (hasTitleCandidate) sStruct += 4;
    if (pages.every(p => Array.isArray(p.layers) && p.layers.length > 0)) sStruct += 4;
    dim.structure.score = Math.min(20, sStruct);
    dim.structure.note = pageCount + ' 页 · ' + (hasTitleCandidate ? '有标题候选' : '缺标题候选');

    // ---- 排版 20 ----
    let sTypo = 0;
    if (fontSizes.size >= 2 && fontSizes.size <= 4) sTypo += 10;
    else if (fontSizes.size === 1) sTypo += 5;
    else if (fontSizes.size > 4) sTypo += 4;
    const avgChars = textCount ? totalChars / textCount : 0;
    if (avgChars >= 4 && avgChars <= 30) sTypo += 10;
    else if (avgChars > 30 && avgChars <= 60) sTypo += 6;
    else if (avgChars > 60) sTypo += 2;
    dim.typography.score = Math.min(20, sTypo);
    dim.typography.note = fontSizes.size + ' 种字号 · 平均 ' + Math.round(avgChars) + ' 字/层';

    // ---- 配色 15 ----
    let sColor = 0;
    if (colors.size >= 2 && colors.size <= 4) sColor += 12;
    else if (colors.size === 1) sColor += 6;
    else if (colors.size > 4 && colors.size <= 6) sColor += 8;
    else if (colors.size > 6) sColor += 3;
    if (hasBackdrop > 0) sColor += 3;
    dim.color.score = Math.min(15, sColor);
    dim.color.note = colors.size + ' 种颜色 · ' + hasBackdrop + ' 处底衬';

    // ---- 特效 20 ----
    let sEffect = 0;
    if (textCount === 0) sEffect = 0;
    else {
        const ratio = effectCount / textCount;
        if (ratio >= 0.2 && ratio <= 0.7) sEffect += 15;
        else if (ratio > 0.7 && ratio <= 0.9) sEffect += 10;
        else if (ratio > 0.9) sEffect += 5;
        else sEffect += 6;
        // 封面有无特效
        const firstPage = pages[0] || {};
        const firstText = ((firstPage.layers || []).find(l => l && l.type === 'text')) || null;
        if (firstText && firstText.effectClass) sEffect += 5;
    }
    dim.effect.score = Math.min(20, sEffect);
    dim.effect.note = textCount ? Math.round((effectCount / textCount) * 100) + '% 图层带特效' : '无文字图层';

    // ---- 版面 15 ----
    let sLayout = 0;
    const heroPages = pages.filter(p => {
        const t = ((p && p.layers) || []).find(l => l && l.type === 'text');
        if (!t) return false;
        const c = String(t.content || '').replace(/<[^>]*>/g, '').length;
        return c <= 14;
    }).length;
    if (heroPages >= 1 && pageCount >= 2) sLayout += 10;
    else if (heroPages >= 1) sLayout += 6;
    else sLayout += 3;
    if (pageCount >= 2 && pages.some(p => ((p.layers || []).find(l => l && l.type === 'text' && String(l.content || '').length > 40)))) sLayout += 5;
    dim.layout.score = Math.min(15, sLayout);
    dim.layout.note = heroPages + ' 个短标题页';

    // ---- 密度 10 ----
    let sDensity = 10;
    if (overflowRisk > 0) sDensity -= Math.min(8, overflowRisk * 3);
    if (pageCount > 15) sDensity -= 3;
    dim.density.score = Math.max(0, sDensity);
    dim.density.note = overflowRisk > 0 ? (overflowRisk + ' 个图层可能溢出') : '无明显溢出';

    const total = Math.round(
        dim.structure.score + dim.typography.score + dim.color.score +
        dim.effect.score + dim.layout.score + dim.density.score
    );

    return { total, dim };
}
window.scoreSpecQuality = scoreSpecQuality;

/* ============================================================
   27. 多方案自动选优：解析多份候选 spec，挑质量最高的一份
   ============================================================ */
function pickBestSpec(candidates) {
    if (!Array.isArray(candidates) || !candidates.length) return null;
    if (typeof scoreSpecQuality !== 'function') return candidates[0];
    let best = null;
    let bestScore = -1;
    candidates.forEach(c => {
        if (!c || !Array.isArray(c.pages) || !c.pages.length) return;
        const s = scoreSpecQuality(c);
        if (s.total > bestScore) {
            bestScore = s.total;
            best = c;
        }
    });
    return best;
}
window.pickBestSpec = pickBestSpec;

/* ============================================================
   28. 从一段文本里提取可能的多份 spec（应对 AI 一次输出 2~3 个候选）
   ============================================================ */
function extractMultipleSpecs(rawText) {
    const text = (typeof repairAiJsonText === 'function')
        ? repairAiJsonText(rawText)
        : String(rawText || '');
    const specs = [];
    // 用括号配对扫描所有顶层 {...}
    let depth = 0, start = -1, inStr = false, esc = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inStr) {
            if (esc) { esc = false; continue; }
            if (ch === '\\') { esc = true; continue; }
            if (ch === '"') { inStr = false; }
            continue;
        }
        if (ch === '"') { inStr = true; continue; }
        if (ch === '{') {
            if (depth === 0) start = i;
            depth++;
        } else if (ch === '}') {
            depth--;
            if (depth === 0 && start >= 0) {
                const slice = text.slice(start, i + 1);
                try {
                    const obj = JSON.parse(slice);
                    if (obj && obj.format === 'douyin-cover-spec' && Array.isArray(obj.pages)) {
                        specs.push(obj);
                    }
                } catch (e) { /* 忽略非完整片段 */ }
                start = -1;
            }
        }
    }
    return specs;
}
window.extractMultipleSpecs = extractMultipleSpecs;

/* ============================================================
   29. 结构容错：AI 常见的“单页当对象/单层当对象”修复
   ============================================================ */
function fixSpecStructure(spec) {
    if (!spec || typeof spec !== 'object') return spec;
    const out = JSON.parse(JSON.stringify(spec));

    // 1. pages 不是数组 → 尝试包成数组
    if (!Array.isArray(out.pages)) {
        if (out.pages && typeof out.pages === 'object') out.pages = [out.pages];
        else out.pages = [];
    }

    // 2. 每页的 layers 不是数组 → 尝试包成数组
    out.pages.forEach(p => {
        if (!p || typeof p !== 'object') return;
        if (!Array.isArray(p.layers)) {
            if (p.layers && typeof p.layers === 'object') p.layers = [p.layers];
            else p.layers = [];
        }
        // 3. 每个 layer 补 type
        p.layers.forEach(l => {
            if (l && typeof l === 'object' && !l.type) {
                l.type = (l.content !== undefined && l.fontSize !== undefined) ? 'text' : 'text';
            }
        });
    });

    // 4. titleCandidates 修正
    if (!Array.isArray(out.titleCandidates)) {
        if (typeof out.titleCandidates === 'string' && out.titleCandidates.trim()) {
            out.titleCandidates = [out.titleCandidates];
        } else {
            out.titleCandidates = [];
        }
    }

    return out;
}
window.fixSpecStructure = fixSpecStructure;

/* ============================================================
   30. 应用后自动导出（可选）
   用户可在导入面板勾选「应用后自动导出」，闭合成
   粘贴 → 校验 → 应用 → 得到 PNG 的最短链路
   ============================================================ */
async function autoExportAfterApply(scope) {
    scope = scope || 'all';
    if (typeof exportElementToPNG !== 'function') {
        return { ok: false, reason: '导出模块未就绪' };
    }
    if (!window.state) return { ok: false, reason: 'state 未就绪' };

    const pages = (state.pages || []).slice();
    const target = scope === 'current'
        ? pages.filter(p => p.id === state.currentPageId)
        : pages;
    if (!target.length) return { ok: false, reason: '没有可导出的页面' };

    let success = 0;
    let fail = 0;
    for (const p of target) {
        const wrapper = document.querySelector('.canvas-page-wrapper[data-page-id="' + p.id + '"]');
        if (!wrapper) { fail++; continue; }
        const canvasNode = wrapper.querySelector('.cover-canvas');
        if (!canvasNode) { fail++; continue; }
        const idx = pages.findIndex(x => x.id === p.id);
        const name = '龙蛇变_第' + (idx + 1) + '页_' + Date.now() + '.png';
        try {
            const ok = await exportElementToPNG(canvasNode, name, 3);
            if (ok) success++; else fail++;
        } catch (e) {
            fail++;
            if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 自动导出单页失败', e);
        }
        if (target.length > 1) {
            await new Promise(r => setTimeout(r, 400));
        }
    }
    return { ok: fail === 0, success, fail, total: target.length };
}
window.autoExportAfterApply = autoExportAfterApply;

/* ============================================================
   31. 导出合并长图（所有页竖向拼成一张 PNG）
   ============================================================ */
async function exportAllPagesAsLongImage(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    if (typeof html2canvas === 'undefined') return { ok: false, reason: 'html2canvas 未就绪' };

    const gap = options.gap != null ? options.gap : 20;
    const scale = options.scale || 2;
    const pages = (state.pages || []).slice();
    if (!pages.length) return { ok: false, reason: '没有可导出的页面' };

    // 用离屏容器渲染每一页，逐页截图再拼
    const tiles = [];
    for (let i = 0; i < pages.length; i++) {
        const wrapper = document.querySelector('.canvas-page-wrapper[data-page-id="' + pages[i].id + '"]');
        if (!wrapper) continue;
        const canvasNode = wrapper.querySelector('.cover-canvas');
        if (!canvasNode) continue;
        try {
            const c = await html2canvas(canvasNode, {
                scale: scale,
                backgroundColor: '#000',
                useCORS: true,
                allowTaint: true,
                logging: false,
                onclone: (clonedDoc) => {
                    clonedDoc.querySelectorAll('.custom-guides-layer, .snap-lines-layer, .selection-box, .resize-handle, .edge-handle, .rotate-handle').forEach(el => el.style.display = 'none');
                    clonedDoc.querySelectorAll('input[type="color"]').forEach(el => {
                        const span = clonedDoc.createElement('span');
                        span.style.cssText = el.style.cssText;
                        if (el.parentNode) el.parentNode.replaceChild(span, el);
                    });
                }
            });
            tiles.push(c);
        } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 长图单页截图失败', i, e);
        }
    }
    if (!tiles.length) return { ok: false, reason: '所有页均截图失败' };

    const pageW = tiles[0].width;
    const pageH = tiles[0].height;
    const totalW = pageW;
    const totalH = tiles.length * pageH + (tiles.length - 1) * gap;

    const out = document.createElement('canvas');
    out.width = totalW;
    out.height = totalH;
    const ctx = out.getContext('2d');
    ctx.fillStyle = options.bg || '#0d1117';
    ctx.fillRect(0, 0, totalW, totalH);
    tiles.forEach((t, i) => {
        ctx.drawImage(t, 0, i * (pageH + gap));
    });

    return new Promise((resolve) => {
        out.toBlob(blob => {
            if (!blob) return resolve({ ok: false, reason: 'toBlob 失败' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = (options.name || ('龙蛇变_长图_' + Date.now())) + '.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            resolve({ ok: true, pages: tiles.length, width: totalW, height: totalH });
        }, 'image/png');
    });
}
window.exportAllPagesAsLongImage = exportAllPagesAsLongImage;

/* ============================================================
   32. 一键分享包：spec.json + 每页缩略图（多文件下载）
   为减少复杂度，不做 zip，逐个下载（浏览器会合并提示）
   ============================================================ */
async function exportSharePackage(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    if (typeof exportCanvasAsSpec !== 'function') return { ok: false, reason: '缺少导出画布能力' };

    const spec = exportCanvasAsSpec();
    const packName = options.name || ('龙蛇变_分享包_' + Date.now());
    const files = [];

    // 1. spec.json
    try {
        const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
        files.push({ name: packName + '_spec.json', blob });
    } catch (e) {}

    // 2. 每页缩略图（scale 1）
    if (typeof html2canvas !== 'undefined') {
        const pages = state.pages || [];
        for (let i = 0; i < pages.length; i++) {
            const wrapper = document.querySelector('.canvas-page-wrapper[data-page-id="' + pages[i].id + '"]');
            if (!wrapper) continue;
            const canvasNode = wrapper.querySelector('.cover-canvas');
            if (!canvasNode) continue;
            try {
                const c = await html2canvas(canvasNode, { scale: 1, backgroundColor: '#000', useCORS: true, allowTaint: true, logging: false });
                const blob = await new Promise(res => c.toBlob(b => res(b), 'image/png'));
                if (blob) files.push({ name: packName + '_第' + (i + 1) + '页.png', blob });
            } catch (e) {
                if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 分享包单页截图失败', i, e);
            }
        }
    }

    // 3. 逐个下载
    for (const f of files) {
        const url = URL.createObjectURL(f.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        await new Promise(r => setTimeout(r, 200));
    }

    return { ok: true, count: files.length, packName };
}
window.exportSharePackage = exportSharePackage;

/* ============================================================
   33. 导入分享包：从本地 spec.json 文件读入并校验
   ============================================================ */
async function importSharePackage(file) {
    if (!file) return { ok: false, reason: '无文件' };
    if (!/\.json$/i.test(file.name || '')) return { ok: false, reason: '只接受 .json 分享包' };
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const raw = evt.target.result || '';
                let text = raw;
                if (typeof repairAiJsonText === 'function') text = repairAiJsonText(text) || text;
                let spec = JSON.parse(text);
                if (typeof fixSpecStructure === 'function') spec = fixSpecStructure(spec);
                if (typeof migrateSpec === 'function') spec = migrateSpec(spec);
                if (!spec || spec.format !== 'douyin-cover-spec') {
                    resolve({ ok: false, reason: '不是合法的 douyin-cover-spec' });
                    return;
                }
                resolve({ ok: true, spec });
            } catch (e) {
                resolve({ ok: false, reason: '解析失败：' + e.message });
            }
        };
        reader.onerror = () => resolve({ ok: false, reason: '读取失败' });
        reader.readAsText(file, 'utf-8');
    });
}
window.importSharePackage = importSharePackage;

/* ============================================================
   34. 批注系统：AI 或用户可给页加 notes，应用后保留在页 meta 里
   ============================================================ */
function attachSpecNotes(spec) {
    if (!spec || !Array.isArray(spec.pages)) return spec;
    spec.pages.forEach((p, i) => {
        if (p && p.notes && String(p.notes).trim()) {
            // 保留到 _notes（不参与渲染，可在图层列表/预览里显示）
            p._notes = String(p.notes).trim();
        } else if (p && p._notes) {
            delete p._notes;
        }
    });
    return spec;
}
window.attachSpecNotes = attachSpecNotes;

function getSpecNotesSummary(spec) {
    if (!spec || !Array.isArray(spec.pages)) return [];
    const out = [];
    spec.pages.forEach((p, i) => {
        if (p && p._notes) out.push({ pageIndex: i, notes: p._notes });
    });
    return out;
}
window.getSpecNotesSummary = getSpecNotesSummary;

/* ============================================================
   35. 导出项目资产引用清单（用于迁移/分享前了解依赖）
   ============================================================ */
function collectSpecAssetRefs(spec) {
    const refs = { fonts: new Set(), backdrops: new Set(), bgImages: new Set(), stickers: new Set() };
    if (!spec || !Array.isArray(spec.pages)) return { fonts: [], backdrops: [], bgImages: [], stickers: [] };

    spec.pages.forEach(p => {
        const bg = p && p.bg;
        if (bg && bg.customImageId) {
            const key = String(bg.customImageId);
            if (key.startsWith('bgImage-')) refs.bgImages.add(key);
            else {
                try {
                    const map = JSON.parse(localStorage.getItem('douyin_bgimage_asset_map') || '{}');
                    if (map[key]) refs.bgImages.add(map[key]);
                } catch (e) {}
            }
        }
        (p && p.layers || []).forEach(l => {
            if (!l) return;
            if (l.type === 'text') {
                if (l.fontFamily && /[\u4e00-\u9fa5]/.test(l.fontFamily) === false && l.fontFamily.startsWith('CustomFont_')) {
                    refs.fonts.add(l.fontFamily);
                }
                if (l.backdrop && l.backdrop.type === 'custom' && l.backdrop.customId != null) {
                    const k = String(l.backdrop.customId);
                    try {
                        const map = JSON.parse(localStorage.getItem('douyin_backdrop_asset_map') || '{}');
                        if (map[k]) refs.backdrops.add(map[k]);
                    } catch (e) {}
                }
            }
            if (l.type === 'sticker' && l.assetId) {
                refs.stickers.add(l.assetId);
            }
        });
    });

    return {
        fonts: Array.from(refs.fonts),
        backdrops: Array.from(refs.backdrops),
        bgImages: Array.from(refs.bgImages),
        stickers: Array.from(refs.stickers)
    };
}
window.collectSpecAssetRefs = collectSpecAssetRefs;

/* ============================================================
   36. 全自动模式：从 AI 输出文本里自动挑最优 → 修复 → 应用 → 导出
   ============================================================ */
async function autoApplyFromAiOutput(rawText, options) {
    options = options || {};
    if (!rawText) return { ok: false, reason: '无 AI 输出' };

    // 1. 修复文本 + 提取候选
    let candidates = [];
    if (typeof extractMultipleSpecs === 'function') {
        candidates = extractMultipleSpecs(rawText);
    }
    if (!candidates.length) {
        // 回退：单份解析
        try {
            let text = (typeof repairAiJsonText === 'function') ? repairAiJsonText(rawText) : rawText;
            let single = JSON.parse(text);
            if (typeof fixSpecStructure === 'function') single = fixSpecStructure(single);
            if (typeof migrateSpec === 'function') single = migrateSpec(single);
            candidates = [single];
        } catch (e) {
            return { ok: false, reason: '解析失败：' + e.message };
        }
    }

    // 2. 修复结构 + 自动修复
    const fixed = candidates.map(c => {
        let s = c;
        if (typeof fixSpecStructure === 'function') s = fixSpecStructure(s);
        if (typeof autoFixSpec === 'function') {
            const r = autoFixSpec(s);
            s = r.spec;
        }
        return s;
    });

    // 3. 挑最优
    const best = (typeof pickBestSpec === 'function') ? pickBestSpec(fixed) : fixed[0];
    if (!best) return { ok: false, reason: '没有合法 spec' };

    // 4. 校验
    const check = validateSpec(best);
    if (!check.ok && !options.forceApply) {
        return { ok: false, reason: '校验失败 ' + check.errors.length + ' 项', errors: check.errors, spec: best };
    }

    // 5. 应用
    const applied = await applyCoverSpec(best, {
        dryRun: false,
        append: !!options.append,
        autoDecorate: options.autoDecorate !== false
    });
    if (!applied.applied) {
        return { ok: false, reason: '应用失败', spec: best };
    }

    // 6. 导出（可选）
    let exportResult = null;
    if (options.autoExport && options.autoExport !== 'none') {
        try {
            if (typeof autoExportAfterApply === 'function') {
                exportResult = await autoExportAfterApply(options.autoExport);
                // 兼容：autoExportAfterApply 返回 {ok, success, fail, total}
                if (exportResult && exportResult.total == null && exportResult.success != null) {
                    exportResult.total = exportResult.success + (exportResult.fail || 0);
                }
            }
        } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 全自动模式导出失败', e);
        }
    }

    const quality = (typeof scoreSpecQuality === 'function') ? scoreSpecQuality(best).total : 0;
    // 统计：识别主风格
    let mainStyle = null;
    try {
        if (typeof pickStyleForText === 'function' && best.pages && best.pages[0]) {
            const firstText = (best.pages[0].layers || []).find(l => l && l.type === 'text');
            if (firstText) mainStyle = (pickStyleForText(firstText.content || '') || {}).id || null;
        }
    } catch (e) {}
    if (mainStyle && typeof rememberLastStyle === 'function') {
        try { rememberLastStyle(mainStyle); } catch (e) {}
    }
    if (typeof pushIterationRound === 'function') {
        try { pushIterationRound({ spec: best }); } catch (e) {}
    }
    if (typeof pushAiStats === 'function') {
        pushAiStats({ quality, style: mainStyle, pages: (best.pages || []).length });
    }

    return {
        ok: true,
        spec: best,
        applied: applied,
        exportResult,
        candidateCount: fixed.length,
        quality,
        mainStyle
    };
}
window.autoApplyFromAiOutput = autoApplyFromAiOutput;

/* ============================================================
   37. 使用统计：记录每次成功应用的数据，用于长期观察质量趋势
   ============================================================ */
const AI_STATS_KEY = 'douyin_ai_spec_stats_v1';

function pushAiStats(entry) {
    if (!entry) return;
    try {
        let s = JSON.parse(localStorage.getItem(AI_STATS_KEY) || '{}');
        if (!s || typeof s !== 'object') s = {};
        s.count = (s.count || 0) + 1;
        s.lastAt = Date.now();
        if (entry.quality != null) {
            s.totalQuality = (s.totalQuality || 0) + Number(entry.quality);
            s.avgQuality = Math.round(s.totalQuality / s.count);
        }
        if (entry.style) {
            s.styles = s.styles || {};
            s.styles[entry.style] = (s.styles[entry.style] || 0) + 1;
        }
        if (entry.pages) {
            s.totalPages = (s.totalPages || 0) + entry.pages;
        }
        localStorage.setItem(AI_STATS_KEY, JSON.stringify(s));
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 写入统计失败', e);
    }
}
window.pushAiStats = pushAiStats;

function getAiStats() {
    try {
        const s = JSON.parse(localStorage.getItem(AI_STATS_KEY) || '{}');
        return s && typeof s === 'object' ? s : {};
    } catch (e) { return {}; }
}
window.getAiStats = getAiStats;

function clearAiStats() {
    try { localStorage.removeItem(AI_STATS_KEY); } catch (e) {}
}
window.clearAiStats = clearAiStats;

/* ============================================================
   38. 一键自检：把应用前的所有检查汇总成结构化报告
   ============================================================ */
function selfCheckSpec(spec) {
    const report = {
        ok: true,
        checks: [],
        blockers: [],
        warnings: [],
        infos: []
    };
    if (!spec || typeof spec !== 'object') {
        report.ok = false;
        report.blockers.push('spec 不是对象');
        return report;
    }

    // 1. 结构
    const structureFixed = (typeof fixSpecStructure === 'function') ? fixSpecStructure(spec) : spec;
    report.checks.push({ name: '结构完整', ok: !!structureFixed && Array.isArray(structureFixed.pages) });

    // 2. 校验
    const v = (typeof validateSpecStrict === 'function')
        ? validateSpec(spec)
        : validateSpec(spec);
    if (!v.ok) {
        report.ok = false;
        v.errors.forEach(e => report.blockers.push(e));
    }
    if (v.warnings && v.warnings.length) v.warnings.forEach(w => report.warnings.push(w));
    report.checks.push({ name: '规范校验', ok: v.ok, count: { errors: (v.errors || []).length, warnings: (v.warnings || []).length } });

    // 3. 质量分
    if (typeof scoreSpecQuality === 'function') {
        const q = scoreSpecQuality(spec);
        report.checks.push({ name: '质量评分', ok: q.total >= 60, score: q.total, dims: q.dim });
        if (q.total < 60) report.warnings.push('质量分偏低（' + q.total + '），建议调整或选用其它候选');
    }

    // 4. 资产依赖
    if (typeof collectSpecAssetRefs === 'function') {
        const refs = collectSpecAssetRefs(spec);
        const total = refs.fonts.length + refs.backdrops.length + refs.bgImages.length + refs.stickers.length;
        report.checks.push({ name: '资产依赖', ok: true, refs, total });
        if (total > 0) report.infos.push('本方案引用 ' + total + ' 个自定义资产（字体/底衬/背景图/贴纸），跨设备会缺失');
    }

    // 5. 批注
    if (typeof getSpecNotesSummary === 'function') {
        const notes = getSpecNotesSummary(spec);
        report.checks.push({ name: 'AI 批注', ok: true, count: notes.length, items: notes });
    }

    // 6. 智能建议
    if (typeof suggestSpecImprovements === 'function') {
        const sug = suggestSpecImprovements(spec);
        report.checks.push({ name: '智能建议', ok: true, count: sug.length });
        sug.forEach(s => {
            if (s.level === 'warn') report.warnings.push(s.text);
            else report.infos.push(s.text);
        });
    }

    return report;
}
window.selfCheckSpec = selfCheckSpec;

/* ============================================================
   39. AI 历史质量排行
   ============================================================ */
function rankAiHistoryByQuality() {
    if (typeof getAiHistory !== 'function' || typeof scoreSpecQuality !== 'function') return [];
    const list = getAiHistory();
    const ranked = list.map((h, i) => {
        const q = scoreSpecQuality(h.spec);
        return {
            index: i,
            label: h.label || '方案',
            savedAt: h.savedAt,
            quality: q.total,
            pages: (h.spec && h.spec.pages || []).length,
            thumb: h.thumb || '',
            spec: h.spec
        };
    });
    ranked.sort((a, b) => b.quality - a.quality);
    return ranked;
}
window.rankAiHistoryByQuality = rankAiHistoryByQuality;

/* ============================================================
   40. 离线文字增强：常见标题改写规则（无 API）
   目标：给用户提供一个“AI 不可用但我也想要更强标题”的最低保障
   ============================================================ */
const AI_TITLE_RULES = [
    { match: /^(.*)$/i, rewriter: (t) => t },
    { match: /如何/i, rewriter: (t) => t.replace(/如何/, '怎么') },
    { match: /赚钱|搞钱|月入|副业/i, rewriter: (t) => t },
    { match: /^([^\n]{1,10})$/, rewriter: (t) => t + '\n建议收藏' },
    { match: /做错|失败|错了/i, rewriter: (t) => t + '\n90% 的人都不知道' },
    { match: /方法|技巧|干货|教程/i, rewriter: (t) => t + '\n干货满满' }
];

function enhanceTitleOffline(title) {
    if (!title || typeof title !== 'string') return title;
    let t = title.trim();
    if (!t) return t;
    // 若已多行，先取第一行作为主标题
    const lines = t.split(/\r?\n/);
    const first = lines[0].trim();
    const rest = lines.slice(1).join('\n');
    let enhanced = first;
    for (const rule of AI_TITLE_RULES) {
        if (rule.match.test(first)) {
            try {
                const next = rule.rewriter(first);
                if (next && next !== first) { enhanced = next; break; }
            } catch (e) {}
        }
    }
    return rest ? enhanced + '\n' + rest : enhanced;
}
window.enhanceTitleOffline = enhanceTitleOffline;

function suggestTitleVariants(title) {
    if (!title) return [];
    const base = String(title).trim();
    const lines = base.split(/\r?\n/);
    const first = lines[0].trim();
    const rest = lines.slice(1).join('\n');
    const variants = new Set();
    variants.add(base);

    // 数字冲击
    if (/\d+/.test(first)) {
        variants.add(first.replace(/\d+/, (m) => m) + (rest ? '\n' + rest : ''));
    } else {
        variants.add('3 个' + first + (rest ? '\n' + rest : ''));
        variants.add(first + '，99% 的人都不知道' + (rest ? '\n' + rest : ''));
    }
    // 情绪词
    if (!/震惊|千万|必看|爆|秘籍/.test(first)) {
        variants.add(first + '\n🔥 建议收藏' + (rest ? '\n' + rest : ''));
    }
    // 疑问句式
    if (!/[?？]$/.test(first)) {
        variants.add(first + '？' + (rest ? '\n' + rest : ''));
    }

    return Array.from(variants).slice(0, 6);
}
window.suggestTitleVariants = suggestTitleVariants;

/* ============================================================
   41. 离线配色改写：按当前画布文字内容重新套一遍风格配色
   ============================================================ */
function reapplyStyleOffline(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const page = state.getCurrentPage && state.getCurrentPage();
    if (!page) return { ok: false, reason: '当前页不存在' };

    const texts = (page.layers || []).filter(l => l && l.type === 'text');
    if (!texts.length) return { ok: false, reason: '当前页没有文字图层' };

    // 用第一个文字图层判断整体风格（更有代表性）
    const primary = texts[0];
    const style = (options.styleId && typeof getStyleById === 'function')
        ? getStyleById(options.styleId)
        : ((typeof pickStyleForText === 'function') ? pickStyleForText(primary.content || '') : null);
    if (!style) return { ok: false, reason: '无可用风格' };

    let changed = 0;
    texts.forEach((l, i) => {
        const isPrimary = i === 0;
        // 第一个文字用主色/主特效；其它用辅色
        if (isPrimary) {
            if (style.titleColor) l.color = style.titleColor;
            if (style.titleEffect) l.effectClass = style.titleEffect;
        } else {
            if (style.subColor) l.color = style.subColor;
            if (style.subEffect) l.effectClass = style.subEffect;
        }
        changed++;
    });

    if (options.reapplyBackdrop !== false) {
        // 副标题/正文加底衬（如果风格里有定义且当前图层没有底衬）
        texts.forEach((l, i) => {
            if (i === 0) return;
            if (!l.backdrop && style.backlineBackdrop) {
                l.backdrop = Object.assign({}, style.backlineBackdrop);
            }
        });
    }

    if (state.history && typeof state.history.record === 'function') state.history.record();
    if (typeof renderAll === 'function') renderAll();
    return { ok: true, changed, style: style.id };
}
window.reapplyStyleOffline = reapplyStyleOffline;

/* ============================================================
   42. 离线一键美化：不依赖 AI，把当前页从头到尾优化一次
   ============================================================ */
function offlineBeautify(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const page = state.getCurrentPage && state.getCurrentPage();
    if (!page) return { ok: false, reason: '当前页不存在' };

    const beforePages = JSON.parse(JSON.stringify(state.pages || []));
    const beforePageId = state.currentPageId;
    const beforeBg = state.background ? JSON.parse(JSON.stringify(state.background)) : null;

    const results = {
        titleEnhanced: 0,
        styleReapplied: false,
        split: 0,
        shrink: 0
    };

    // 1. 标题增强
    try {
        const texts = (page.layers || []).filter(l => l && l.type === 'text');
        if (texts.length > 0 && typeof enhanceTitleOffline === 'function') {
            const primary = texts[0];
            const cur = String(primary.content || '');
            const enhanced = enhanceTitleOffline(cur);
            if (enhanced && enhanced !== cur) {
                primary.content = enhanced;
                results.titleEnhanced = 1;
            }
        }
    } catch (e) {}

    // 2. 重配色
    try {
        if (typeof reapplyStyleOffline === 'function') {
            const r = reapplyStyleOffline({ styleId: options.styleId || null, reapplyBackdrop: options.reapplyBackdrop !== false });
            if (r.ok) results.styleReapplied = true;
        }
    } catch (e) {}

    // 3. 自动拆分长文
    try {
        if (typeof autoSplitLongTextLayers === 'function') {
            const r = autoSplitLongTextLayers({ maxLines: options.maxLines || 6 });
            if (r.ok) results.split = r.splitCount || 0;
        }
    } catch (e) {}

    // 4. 自动缩字（依赖 DOM，延迟到渲染后）
    if (typeof renderAll === 'function') renderAll();
    else if (typeof renderCanvas === 'function') renderCanvas();

    // 需要在下一帧才能测溢出
    return new Promise((resolve) => {
        requestAnimationFrame(() => {
            try {
                if (typeof autoShrinkOverflowText === 'function') {
                    const r = autoShrinkOverflowText({ minFont: options.minFont || 14 });
                    if (r.ok) results.shrink = r.changed || 0;
                }
            } catch (e) {}

            // 备份可撤销
            try {
                window.__aiSpecBackup = {
                    appliedAt: Date.now(),
                    pages: beforePages,
                    currentPageId: beforePageId,
                    background: beforeBg
                };
            } catch (e) {}

            if (state.history && typeof state.history.record === 'function') state.history.record();

            resolve({
                ok: true,
                titleEnhanced: results.titleEnhanced,
                styleReapplied: results.styleReapplied,
                split: results.split,
                shrink: results.shrink
            });
        });
    });
}
window.offlineBeautify = offlineBeautify;

/* ============================================================
   43. 批量美化整个项目（所有页）
   ============================================================ */
async function offlineBeautifyAllPages(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const pages = state.pages || [];
    if (!pages.length) return { ok: false, reason: '项目没有页面' };

    const beforePages = JSON.parse(JSON.stringify(state.pages));
    const beforePageId = state.currentPageId;
    const beforeBg = state.background ? JSON.parse(JSON.stringify(state.background)) : null;

    const origPageId = state.currentPageId;
    const results = { pagesProcessed: 0, titleEnhanced: 0, styleReapplied: 0, split: 0, shrink: 0 };

    for (const page of pages) {
        state.currentPageId = page.id;
        try {
            const r = await offlineBeautify(options);
            if (r && r.ok) {
                results.pagesProcessed++;
                results.titleEnhanced += r.titleEnhanced || 0;
                if (r.styleReapplied) results.styleReapplied++;
                results.split += r.split || 0;
                results.shrink += r.shrink || 0;
            }
        } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 批量美化单页失败', page.id, e);
        }
    }

    state.currentPageId = origPageId;
    try {
        window.__aiSpecBackup = {
            appliedAt: Date.now(),
            pages: beforePages,
            currentPageId: beforePageId,
            background: beforeBg
        };
    } catch (e) {}

    if (typeof renderAll === 'function') renderAll();
    return { ok: true, ...results };
}
window.offlineBeautifyAllPages = offlineBeautifyAllPages;

/* ============================================================
   44. 封面可读性估计：估算第一页文字与背景的对比度（无需真实像素）
   ============================================================ */
function estimateCoverReadability(spec) {
    const result = { ok: true, contrast: null, risk: 'unknown', details: [] };
    if (!spec || !Array.isArray(spec.pages) || !spec.pages.length) {
        result.ok = false; return result;
    }
    const page = spec.pages[0];
    const layers = (page.layers || []).filter(l => l && l.type === 'text');
    if (!layers.length) { result.ok = false; return result; }

    const primary = layers[0];
    const textColor = primary.color || '#ffffff';

    // 背景色估算：优先 page.bg 的 color1/color2，其次 state.background
    // ✅ 预设查询走唯一入口 getAllBgPresets()（含品牌 brand-* 预设），
    //    直接读 window.BG_PRESETS 会漏掉品牌背景，导致 AI 方案的可读性恒为 unknown
    let bgColor = null;
    try {
        const bg = (page && page.bg) || (window.state && state.background) || null;
        if (bg) {
            if (bg.presetId) {
                const allPresets = (typeof getAllBgPresets === 'function')
                    ? getAllBgPresets()
                    : (window.BG_PRESETS || []);
                const p = allPresets.find(x => x.id === bg.presetId);
                if (p) bgColor = p.color1 || p.color2 || null;
            }
            if (!bgColor && bg.color1) bgColor = bg.color1;
        }
    } catch (e) {}

    if (!bgColor) { result.risk = 'unknown'; return result; }

    try {
        // ✅ 对比度算法唯一实现在 utils.js → Utils.color（ai-spec 内曾复制 3 份 toRgb/lum）
        if (!Utils.hex.isValid(textColor) || !Utils.hex.isValid(bgColor)) return result;
        const ratio = Utils.color.contrastRatio(textColor, bgColor);
        if (isFinite(ratio) && ratio > 0) {
            result.contrast = Math.round(ratio * 100) / 100;
            result.textColor = textColor;
            result.bgColor = bgColor;
            if (ratio < 3) result.risk = 'high';
            else if (ratio < 4.5) result.risk = 'medium';
            else result.risk = 'low';

            if (result.risk === 'high') result.details.push('封面文字与背景对比度仅 ' + result.contrast + ':1，可能看不清');
            else if (result.risk === 'medium') result.details.push('对比度 ' + result.contrast + ':1，小字号可能吃力');
            else result.details.push('对比度 ' + result.contrast + ':1，可读性良好');
        }
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 对比度估算失败', e);
    }
    return result;
}
window.estimateCoverReadability = estimateCoverReadability;

/* ============================================================
   45. 对比度自动修正：对指定页（默认第 1 页）文字换成 WCAG 推荐的黑/白
   ============================================================ */
function fixCoverContrast(spec, options) {
    options = options || {};
    if (!spec || !Array.isArray(spec.pages) || !spec.pages.length) return { ok: false, reason: 'spec 无效' };
    const pi = options.pageIndex != null ? options.pageIndex : 0;
    const page = spec.pages[pi];
    if (!page) return { ok: false, reason: '该页不存在' };

    const cr = estimateCoverReadability(spec);
    if (!cr || cr.contrast == null) return { ok: false, reason: '无法估算对比度' };
    if (cr.risk === 'low') return { ok: true, changed: 0, reason: '对比度已良好' };

    // 用 WCAG 选黑或白：亮度更高的背景用黑色文字，更暗的用白色
    // ✅ 亮度算法唯一实现在 utils.js → Utils.color.relativeLuminance
    const bgLum = Utils.color.relativeLuminance(cr.bgColor);
    const text = bgLum > 0.5 ? '#000000' : '#FFFFFF';

    let changed = 0;
    (page.layers || []).forEach(l => {
        if (l && l.type === 'text') {
            l.color = text;
            changed++;
        }
    });
    return { ok: true, changed, text };
}
window.fixCoverContrast = fixCoverContrast;

/* ============================================================
   46. AI 上下文记忆：记录最近一次成功风格，下次提示词自动提示保持一致性
   ============================================================ */
const AI_LAST_STYLE_KEY = 'douyin_ai_last_style_v1';

function rememberLastStyle(styleId) {
    if (!styleId) return;
    try { localStorage.setItem(AI_LAST_STYLE_KEY, String(styleId)); } catch (e) {}
}
window.rememberLastStyle = rememberLastStyle;

function getLastStyle() {
    try {
        const id = localStorage.getItem(AI_LAST_STYLE_KEY);
        if (!id) return null;
        return (typeof getStyleById === 'function') ? getStyleById(id) : { id, name: id };
    } catch (e) { return null; }
}
window.getLastStyle = getLastStyle;

function clearLastStyle() {
    try { localStorage.removeItem(AI_LAST_STYLE_KEY); } catch (e) {}
}
window.clearLastStyle = clearLastStyle;

/* ============================================================
   47. 内置回归自测：
       - 验证分块、兜底 spec 生成、校验、质量分、对比度估算 全链
       - 不依赖 AI，不依赖网络，可作为发版前 sanity check
   ============================================================ */
const AI_SPEC_SELFTEST_CASES = [
    { name: '短标题', text: '🔥 三招逆袭' },
    { name: '多块分隔', text: '普通人如何逆袭\n---\n3 个月做到月入 5 万\n---\n关注我，下期讲副业' },
    { name: '长文段落', text: '这是第一段内容，讲讲为什么要做副业。\n这是第二段，说明方法。\n---\n这是第三段，开始拆解具体步骤。\n一二三四五六七八九十。\n\n关键结论一\n关键结论二\n关键结论三\n关键结论四\n关键结论五\n关键结论六\n关键结论七\n关键结论八\n' }
];

function selfTestAiSpecPipeline() {
    const results = [];
    AI_SPEC_SELFTEST_CASES.forEach((tc, i) => {
        const row = { name: tc.name, steps: {} };
        try {
            const payload = buildChunkPayload(tc.text);
            row.steps.chunks = payload.chunks.length;

            const spec = buildFallbackSpec(tc.text);
            row.steps.pages = (spec.pages || []).length;

            const v = validateSpec(spec);
            row.steps.valid = v.ok;
            row.steps.warnings = (v.warnings || []).length;

            const q = (typeof scoreSpecQuality === 'function') ? scoreSpecQuality(spec) : { total: -1 };
            row.steps.quality = q.total;

            const cr = (typeof estimateCoverReadability === 'function') ? estimateCoverReadability(spec) : null;
            row.steps.readability = cr ? cr.risk : 'n/a';

            row.ok = !!v.ok && (payload.chunks.length > 0) && ((spec.pages || []).length > 0);
        } catch (e) {
            row.ok = false;
            row.error = e.message;
        }
        results.push(row);
    });

    // ===== 品牌护栏反例：不合规 spec 必须被 validateSpec 拦成 error =====
    // 注意：品牌色/背景检查只在「严格色彩模式」下生效，而该开关存在用户品牌包里。
    // 为了让自测结果与用户设置无关，这里临时打开严格模式，跑完还原。
    const guardCases = [
        { name: '反例·非品牌背景（hot-01）', mutate: (s) => { s.pages[0].bg = { presetId: 'hot-01' }; } },
        { name: '反例·非品牌文字色（#ffff00）', mutate: (s) => { s.pages[0].layers[0].color = '#ffff00'; } },
        { name: '反例·不存在的特效（effect-not-exist）', mutate: (s) => { s.pages[0].layers[0].effectClass = 'effect-not-exist'; } }
    ];
    const _bm = window.BrandManager;
    const _prevStrict = (_bm && _bm.data) ? _bm.data.strictColors : undefined;
    if (_bm && _bm.data) _bm.data.strictColors = true;
    try {
        guardCases.forEach(gc => {
            const row = { name: gc.name, steps: {} };
            try {
                const base = buildFallbackSpec('普通人如何逆袭');
                gc.mutate(base);
                const v = validateSpec(base);
                row.steps.valid = v.ok;
                row.steps.errors = (v.errors || []).length;
                row.ok = (v.ok === false) && ((v.errors || []).length > 0);
            } catch (e) {
                row.ok = false;
                row.error = e.message;
            }
            results.push(row);
        });
    } finally {
        if (_bm && _bm.data && _prevStrict !== undefined) _bm.data.strictColors = _prevStrict;
    }

    const allOk = results.every(r => r.ok);
    return { ok: allOk, results };
}
window.selfTestAiSpecPipeline = selfTestAiSpecPipeline;

/* ============================================================
   48. 断裂 JSON 修复：AI 输出常被截断，尝试自动闭合括号/引号
   ============================================================ */
function repairTruncatedJson(raw) {
    if (!raw) return '';
    let text = String(raw).trim();

    // 找最后一个完整结束字符位置
    const last = text.lastIndexOf('}');
    if (last === -1) return text;
    text = text.slice(0, last + 1);

    // 用栈配平括号
    let depth = 0;
    let arrDepth = 0;
    let inStr = false;
    let esc = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inStr) {
            if (esc) { esc = false; continue; }
            if (ch === '\\') { esc = true; continue; }
            if (ch === '"') { inStr = false; }
            continue;
        }
        if (ch === '"') { inStr = true; continue; }
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        else if (ch === '[') arrDepth++;
        else if (ch === ']') arrDepth--;
    }
    // 若未闭合，补全
    while (arrDepth > 0) { text += ']'; arrDepth--; }
    while (depth > 0) { text += '}'; depth--; }

    // 最后再跑一次已有的修复（去尾逗号等）
    if (typeof repairAiJsonText === 'function') {
        text = repairAiJsonText(text) || text;
    }
    return text;
}
window.repairTruncatedJson = repairTruncatedJson;

/* ============================================================
   49. AI 输出规范检查报告（纯文本，可复制给 AI 让它自己修）
   ============================================================ */
function buildFixFeedbackText(spec, rawForAi) {
    const v = validateSpec(spec);
    const q = (typeof scoreSpecQuality === 'function') ? scoreSpecQuality(spec) : { total: 0, dim: {} };
    const cr = (typeof estimateCoverReadability === 'function') ? estimateCoverReadability(spec) : null;

    const lines = [];
    lines.push('你上一次的输出存在问题，请按下面清单修复后只返回完整 JSON（不要解释）：');
    lines.push('');
    lines.push('## 主要问题（必须修复）');
    if (v.errors && v.errors.length) {
        v.errors.slice(0, 20).forEach((e, i) => lines.push((i + 1) + '. ' + e));
    } else {
        lines.push('（无阻塞项）');
    }
    lines.push('');
    if (v.warnings && v.warnings.length) {
        lines.push('## 建议优化（可选）');
        v.warnings.slice(0, 15).forEach((w, i) => lines.push((i + 1) + '. ' + w));
        lines.push('');
    }
    lines.push('## 当前质量分');
    lines.push('- 总分：' + q.total + ' / 100');
    Object.keys(q.dim || {}).forEach(k => {
        const d = q.dim[k];
        lines.push('- ' + k + '：' + d.score + '/' + d.max + '（' + (d.note || '') + '）');
    });
    lines.push('');
    if (cr && cr.contrast != null) {
        lines.push('## 封面可读性');
        lines.push('- 对比度：' + cr.contrast + ':1（' + (cr.risk === 'low' ? '良好' : (cr.risk === 'medium' ? '一般' : '偏弱')) + '）');
        lines.push('- 文字 ' + (cr.textColor || '') + ' 在背景 ' + (cr.bgColor || '') + ' 上');
        if (cr.risk !== 'low') lines.push('- 建议换高对比配色（黑/白 或反差更大的主色）');
        lines.push('');
    }

    // 附带上一版原文（若用户允许），让 AI 直接基于它改
    if (rawForAi) {
        lines.push('## 上一次输出（节选）');
        const trimmed = String(rawForAi).slice(0, 3000);
        lines.push('```json');
        lines.push(trimmed + (String(rawForAi).length > 3000 ? '\n…(已截断)' : ''));
        lines.push('```');
        lines.push('');
    }

    lines.push('## 硬规则重述');
    lines.push('- 只输出完整 JSON，无前后解释');
    lines.push('- 只用英文双引号，无尾逗号，无注释');
    lines.push('- effectClass 必须在契约列表里，参数在范围内');
    lines.push('- 颜色必须 #rrggbb');
    lines.push('- x/y/width/height 在画布 0~360 / 0~640 内');
    return lines.join('\n');
}
window.buildFixFeedbackText = buildFixFeedbackText;

/* ============================================================
   50. 迭代闭环：把修稿反馈 + 上一版 JSON 拼成“下一轮完整提示词”
   ============================================================ */
function buildIterationPrompt(rawPreviousOutput, systemPrompt, options) {
    options = options || {};
    if (!rawPreviousOutput) return systemPrompt || '';

    let spec = null;
    try {
        let t = (typeof repairTruncatedJson === 'function') ? repairTruncatedJson(rawPreviousOutput) : rawPreviousOutput;
        if (typeof repairAiJsonText === 'function') t = repairAiJsonText(t) || t;
        spec = JSON.parse(t);
        if (typeof fixSpecStructure === 'function') spec = fixSpecStructure(spec);
        if (typeof migrateSpec === 'function') spec = migrateSpec(spec);
    } catch (e) {
        return systemPrompt || '';
    }

    if (!spec) return systemPrompt || '';

    const system = systemPrompt || ((typeof buildCompactSystemPrompt === 'function')
        ? buildCompactSystemPrompt()
        : '# 契约缺失');

    const fb = (typeof buildFixFeedbackText === 'function')
        ? buildFixFeedbackText(spec, rawPreviousOutput)
        : '（无反馈）';

    return [
        system,
        '',
        '---',
        '',
        '## 迭代任务',
        '你上一版的输出在下面「问题清单」里存在问题。请只输出一版修复后的完整 JSON，不输出任何解释。',
        '',
        fb
    ].join('\n');
}
window.buildIterationPrompt = buildIterationPrompt;

/* ============================================================
   51. AI 修稿会话记录（时间线）
   用途：一次 AI 迭代过程往往有 3-5 轮往返，把每轮存下来
   方便回看“哪一版最好”，或在质量下滑时快速回到上一版
   ============================================================ */
const AI_ITERATION_SESSION_KEY = 'douyin_ai_iteration_session_v1';
const AI_ITERATION_MAX = 20;

function startIterationSession(label) {
    try {
        const session = {
            id: 'session-' + Date.now(),
            label: label || ('会话 ' + new Date().toLocaleString()),
            startedAt: Date.now(),
            rounds: []
        };
        localStorage.setItem(AI_ITERATION_SESSION_KEY, JSON.stringify(session));
        return session;
    } catch (e) { return null; }
}
window.startIterationSession = startIterationSession;

function pushIterationRound(round) {
    try {
        let session = null;
        try { session = JSON.parse(localStorage.getItem(AI_ITERATION_SESSION_KEY) || 'null'); } catch (e) {}
        if (!session) session = startIterationSession();
        if (!session) return;
        if (!Array.isArray(session.rounds)) session.rounds = [];
        const quality = (round.spec && typeof scoreSpecQuality === 'function')
            ? scoreSpecQuality(round.spec).total
            : null;
        session.rounds.push({
            at: Date.now(),
            roundIndex: session.rounds.length + 1,
            spec: round.spec || null,
            rawOutput: round.rawOutput || '',
            feedback: round.feedback || '',
            quality
        });
        if (session.rounds.length > AI_ITERATION_MAX) session.rounds.shift();
        localStorage.setItem(AI_ITERATION_SESSION_KEY, JSON.stringify(session));
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 写入迭代会话失败', e);
    }
}
window.pushIterationRound = pushIterationRound;

function getIterationSession() {
    try {
        return JSON.parse(localStorage.getItem(AI_ITERATION_SESSION_KEY) || 'null');
    } catch (e) { return null; }
}
window.getIterationSession = getIterationSession;

function clearIterationSession() {
    try { localStorage.removeItem(AI_ITERATION_SESSION_KEY); } catch (e) {}
}
window.clearIterationSession = clearIterationSession;

// 从当前会话里挑出质量最高的一轮
function pickBestRoundFromSession() {
    const s = getIterationSession();
    if (!s || !Array.isArray(s.rounds) || !s.rounds.length) return null;
    let best = null;
    let bestQ = -1;
    s.rounds.forEach(r => {
        const q = (r.quality != null) ? r.quality : ((r.spec && typeof scoreSpecQuality === 'function') ? scoreSpecQuality(r.spec).total : 0);
        if (q > bestQ) { bestQ = q; best = r; }
    });
    return best;
}
window.pickBestRoundFromSession = pickBestRoundFromSession;

/* ============================================================
   52. 画布快照（spec 级）
   每次应用 AI 方案前，把当前画布保存为一份轻量 spec，
   支持回退、对比、或把旧画布导出分享
   ============================================================ */
const AI_SNAPSHOT_KEY = 'douyin_ai_snapshots_v1';
const AI_SNAPSHOT_MAX = 10;

function takeCanvasSnapshot(label) {
    if (!window.state) return null;
    try {
        const spec = (typeof exportCanvasAsSpec === 'function')
            ? exportCanvasAsSpec()
            : null;
        if (!spec) return null;
        let list = [];
        try { list = JSON.parse(localStorage.getItem(AI_SNAPSHOT_KEY) || '[]'); } catch (e) { list = []; }
        if (!Array.isArray(list)) list = [];
        const snap = {
            id: 'snap-' + Date.now(),
            label: label || ('快照 ' + new Date().toLocaleString()),
            takenAt: Date.now(),
            spec
        };
        list.unshift(snap);
        if (list.length > AI_SNAPSHOT_MAX) list = list.slice(0, AI_SNAPSHOT_MAX);
        localStorage.setItem(AI_SNAPSHOT_KEY, JSON.stringify(list));
        return snap;
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 创建快照失败', e);
        return null;
    }
}
window.takeCanvasSnapshot = takeCanvasSnapshot;

function getSnapshots() {
    try {
        const list = JSON.parse(localStorage.getItem(AI_SNAPSHOT_KEY) || '[]');
        return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
}
window.getSnapshots = getSnapshots;

function restoreSnapshot(snapId) {
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const list = getSnapshots();
    const snap = list.find(x => x.id === snapId);
    if (!snap || !snap.spec) return { ok: false, reason: '快照不存在' };
    return applyCoverSpec(snap.spec, { dryRun: false, append: false });
}
window.restoreSnapshot = restoreSnapshot;

function clearSnapshots() {
    try { localStorage.removeItem(AI_SNAPSHOT_KEY); } catch (e) {}
}
window.clearSnapshots = clearSnapshots;

/* ============================================================
   53. 批量导入 spec 文件（一次多个）
   ============================================================ */
async function importMultipleSpecFiles(files) {
    if (!files || !files.length) return { ok: false, reason: '无文件' };
    const results = { ok: 0, fail: 0, specs: [] };
    for (const f of files) {
        try {
            const r = await (function () {
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                        try {
                            let text = evt.target.result || '';
                            if (typeof repairTruncatedJson === 'function') text = repairTruncatedJson(text) || text;
                            if (typeof repairAiJsonText === 'function') text = repairAiJsonText(text) || text;
                            let spec = JSON.parse(text);
                            if (typeof fixSpecStructure === 'function') spec = fixSpecStructure(spec);
                            if (typeof migrateSpec === 'function') spec = migrateSpec(spec);
                            if (!spec || spec.format !== 'douyin-cover-spec') {
                                resolve({ ok: false, reason: '非封面 spec' });
                                return;
                            }
                            resolve({ ok: true, spec, name: f.name });
                        } catch (e) {
                            resolve({ ok: false, reason: e.message });
                        }
                    };
                    reader.onerror = () => resolve({ ok: false, reason: '读取失败' });
                    reader.readAsText(f, 'utf-8');
                });
            })();
            if (r.ok) {
                results.ok++;
                results.specs.push(r.spec);
                if (typeof pushAiHistory === 'function') {
                    pushAiHistory({ spec: r.spec, label: '导入 · ' + (r.name || '') });
                }
            } else {
                results.fail++;
            }
        } catch (e) {
            results.fail++;
        }
    }
    if (results.ok > 0 && typeof AiImportUI !== 'undefined' && AiImportUI.refreshHistory) {
        try { AiImportUI.refreshHistory(); } catch (e) {}
    }
    return { ok: results.fail === 0, imported: results.ok, failed: results.fail, specs: results.specs };
}
window.importMultipleSpecFiles = importMultipleSpecFiles;

/* ============================================================
   54. spec 差异对比：AI 多轮输出、或历史版本之间快速看出差别
   ============================================================ */
function diffTwoSpecs(specA, specB) {
    const report = {
        pagesA: (specA && specA.pages || []).length,
        pagesB: (specB && specB.pages || []).length,
        pageDiff: 0,
        layersA: 0,
        layersB: 0,
        layerDiff: 0,
        effectChanges: [],
        colorChanges: [],
        titleChanges: []
    };
    report.pageDiff = report.pagesB - report.pagesA;

    const countLayers = (s) => (s && s.pages || []).reduce((acc, p) => acc + ((p.layers || []).length), 0);
    report.layersA = countLayers(specA);
    report.layersB = countLayers(specB);
    report.layerDiff = report.layersB - report.layersA;

    // 按索引逐页对比
    const pagesA = (specA && specA.pages || []);
    const pagesB = (specB && specB.pages || []);
    const maxPages = Math.max(pagesA.length, pagesB.length);
    for (let i = 0; i < maxPages; i++) {
        const a = pagesA[i] || { layers: [] };
        const b = pagesB[i] || { layers: [] };
        const la = (a.layers || []).filter(l => l && l.type === 'text');
        const lb = (b.layers || []).filter(l => l && l.type === 'text');
        for (let j = 0; j < Math.max(la.length, lb.length); j++) {
            const ta = la[j], tb = lb[j];
            if (!ta || !tb) continue;
            if (ta.effectClass !== tb.effectClass) {
                report.effectChanges.push({ page: i + 1, layer: j + 1, from: ta.effectClass, to: tb.effectClass });
            }
            if ((ta.color || '').toUpperCase() !== (tb.color || '').toUpperCase()) {
                report.colorChanges.push({ page: i + 1, layer: j + 1, from: ta.color, to: tb.color });
            }
            if (String(ta.content || '') !== String(tb.content || '')) {
                const a1 = String(ta.content || '').slice(0, 20);
                const b1 = String(tb.content || '').slice(0, 20);
                report.titleChanges.push({ page: i + 1, from: a1, to: b1 });
            }
        }
    }
    return report;
}
window.diffTwoSpecs = diffTwoSpecs;

/* ============================================================
   55. 冲突处理：AI 历史同名项自动加时间戳后缀
   ============================================================ */
function dedupeHistoryLabel(label) {
    try {
        const list = (typeof getAiHistory === 'function') ? getAiHistory() : [];
        const exists = list.some(h => h.label === label);
        if (!exists) return label;
        const ts = new Date().toLocaleTimeString();
        let candidate = label + ' · ' + ts;
        let i = 2;
        while (list.some(h => h.label === candidate)) {
            candidate = label + ' · ' + ts + ' (' + i + ')';
            i++;
            if (i > 20) break;
        }
        return candidate;
    } catch (e) { return label; }
}
window.dedupeHistoryLabel = dedupeHistoryLabel;

/* ============================================================
   56. 历史筛选：按页数/质量过滤，找到最合适的旧版本
   ============================================================ */
function filterAiHistory(opts) {
    opts = opts || {};
    const list = (typeof getAiHistory === 'function') ? getAiHistory() : [];
    return list.filter(h => {
        if (!h || !h.spec) return false;
        const pages = (h.spec.pages || []).length;
        if (opts.minPages != null && pages < opts.minPages) return false;
        if (opts.maxPages != null && pages > opts.maxPages) return false;
        const q = (typeof scoreSpecQuality === 'function') ? scoreSpecQuality(h.spec).total : 0;
        if (opts.minQuality != null && q < opts.minQuality) return false;
        if (opts.since != null && h.savedAt < opts.since) return false;
        return true;
    });
}
window.filterAiHistory = filterAiHistory;

/* ============================================================
   57. 自动配图：为 layout=hero / title-sub 的页补充装饰性 emoji 贴纸
   目的：AI 未给 sticker 时，让封面不显得空旷
   规则非常保守：只在第 1 页 hero 页、且没有任何 sticker 时补 1 个
   ============================================================ */
const AUTO_DECOR_EMOJI_MAP = {
    'hot-01': '🔥', 'hot-02': '💥', 'hot-03': '✨', 'hot-04': '⚡',
    'hot-05': '🌌', 'hot-06': '👑', 'hot-07': '🔥', 'hot-08': '⚡',
    'hot-09': '👑', 'hot-10': '💗', 'hot-11': '💰', 'hot-12': '🌃',
    'fresh-01': '🌸', 'fresh-02': '🍃', 'fresh-03': '🌸', 'fresh-04': '🌿',
    'fresh-05': '☁️', 'fresh-06': '🥛', 'fresh-07': '🌸', 'fresh-08': '🍋',
    'dark-01': '🌙', 'dark-02': '🌌', 'dark-03': '✨', 'dark-04': '🌃',
    'dark-05': '🌿', 'dark-06': '🩸', 'dark-07': '🌑', 'dark-08': '✨',
    'dark-09': '⚙️', 'dark-10': '🌌', 'dark-11': '💠', 'dark-12': '☕',
    'neon-01': '⚡', 'neon-02': '🌈', 'neon-03': '💠', 'neon-04': '✨',
    'know-01': '💡', 'know-02': '📘', 'know-03': '🧠', 'know-04': '📖'
};

function autoDecorateSpec(spec, options) {
    options = options || {};
    if (!spec || !Array.isArray(spec.pages) || !spec.pages.length) return { ok: false, reason: 'spec 无效' };

    const onlyFirstPage = options.onlyFirstPage !== false;
    const maxDecorate = options.maxDecorate != null ? options.maxDecorate : 3;
    let added = 0;
    const usedPresetId = (spec.pages[0].bg && spec.pages[0].bg.presetId) || null;

    spec.pages.forEach((page, pi) => {
        if (onlyFirstPage && pi !== 0) return;
        if (added >= maxDecorate) return;

        const hasSticker = (page.layers || []).some(l => l && l.type === 'sticker');
        if (hasSticker) return;

        const bgId = (page.bg && page.bg.presetId) || usedPresetId;
        const emoji = AUTO_DECOR_EMOJI_MAP[bgId] || '✨';

        const stickerLayer = {
            type: 'sticker',
            stickerType: 'emoji',
            content: emoji,
            fontSize: '60px',
            color: '#ffffff',
            bgColor: 'transparent',
            bold: false, italic: false, underline: false, strike: false,
            align: 'center', vertical: false,
            letterSpacing: 0, lineHeight: 1, opacity: 0.92,
            effectClass: null,
            x: 280, y: 80, width: 70, height: 70,
            heightMode: 'fixed',
            rotation: (Math.random() * 20 - 10).toFixed(1),
            flipH: false, flipV: false,
            locked: false, groupId: null,
            backdrop: null
        };

        page.layers = page.layers || [];
        page.layers.push(stickerLayer);
        added++;
    });

    return { ok: true, added };
}
window.autoDecorateSpec = autoDecorateSpec;

/* ============================================================
   58. 跨页风格连贯性检查
   AI 有时第 1 页黑金，第 3 页突然粉紫，用户自己不易察觉。
   这里在应用前给一次明确提示。
   ============================================================ */
function checkStyleConsistency(spec) {
    const issues = [];
    if (!spec || !Array.isArray(spec.pages) || spec.pages.length < 2) {
        return { ok: true, issues };
    }

    const colorHistogram = {};
    const effectHistogram = {};
    const fontHistogram = {};
    let totalTextLayers = 0;

    spec.pages.forEach((p, pi) => {
        (p.layers || []).forEach(l => {
            if (!l || l.type !== 'text') return;
            totalTextLayers++;
            if (l.color) {
                const c = String(l.color).toUpperCase();
                colorHistogram[c] = (colorHistogram[c] || 0) + 1;
            }
            if (l.effectClass) {
                effectHistogram[l.effectClass] = (effectHistogram[l.effectClass] || 0) + 1;
            }
            if (l.fontFamily) {
                fontHistogram[l.fontFamily] = (fontHistogram[l.fontFamily] || 0) + 1;
            }
        });
    });

    if (totalTextLayers === 0) return { ok: true, issues };

    // 1. 主色占比：如果最高频颜色占比 < 40%，说明配色散乱
    const colorKeys = Object.keys(colorHistogram);
    if (colorKeys.length > 4) {
        const sortedColors = colorKeys.sort((a, b) => colorHistogram[b] - colorHistogram[a]);
        const topPct = colorHistogram[sortedColors[0]] / totalTextLayers;
        if (topPct < 0.4) {
            issues.push({ level: 'warn', text: '配色较分散：' + colorKeys.length + ' 种主色，最高占比 ' + Math.round(topPct * 100) + '%。建议收敛到 2-3 种主色' });
        }
    }

    // 2. 主字体占比：如果字体 > 2 种，且主字体占比 < 70%
    const fontKeys = Object.keys(fontHistogram);
    if (fontKeys.length > 2) {
        const sortedFonts = fontKeys.sort((a, b) => fontHistogram[b] - fontHistogram[a]);
        const topPct = fontHistogram[sortedFonts[0]] / totalTextLayers;
        if (topPct < 0.7) {
            issues.push({ level: 'warn', text: '字体较分散：' + fontKeys.length + ' 种字体，主字体占比 ' + Math.round(topPct * 100) + '%' });
        }
    }

    // 3. 主特效占比：如果特效 > 3 种，且主特效占比 < 50%
    const effectKeys = Object.keys(effectHistogram);
    if (effectKeys.length > 3) {
        const sortedEffects = effectKeys.sort((a, b) => effectHistogram[b] - effectHistogram[a]);
        const topPct = effectHistogram[sortedEffects[0]] / totalTextLayers;
        if (topPct < 0.5) {
            issues.push({ level: 'info', text: '特效使用了 ' + effectKeys.length + ' 种，主特效占比 ' + Math.round(topPct * 100) + '%，建议主特效占比 >50% 以保证视觉统一' });
        }
    }

    return { ok: issues.length === 0, issues };
}
window.checkStyleConsistency = checkStyleConsistency;

/* ============================================================
   59. 跨页背景统一：所有页共用第 1 页背景（最常见需求）
   ============================================================ */
function unifySpecBackgrounds(spec, options) {
    options = options || {};
    if (!spec || !Array.isArray(spec.pages) || spec.pages.length < 2) {
        return { ok: false, reason: '需要至少 2 页' };
    }
    const sourcePage = options.sourcePageIndex != null ? spec.pages[options.sourcePageIndex] : spec.pages[0];
    const sourceBg = sourcePage && sourcePage.bg;
    if (!sourceBg) return { ok: false, reason: '第 1 页没有背景' };

    let changed = 0;
    spec.pages.forEach((p, i) => {
        if (i === (options.sourcePageIndex || 0)) return;
        p.bg = JSON.parse(JSON.stringify(sourceBg));
        changed++;
    });
    return { ok: true, changed };
}
window.unifySpecBackgrounds = unifySpecBackgrounds;

/* ============================================================
   60. AI 方案操作建议：根据校验结果与质量分给出“下一步应该干嘛”
   ============================================================ */
function recommendNextAction(spec) {
    const rec = { action: 'preview', reason: '', severity: 'info' };
    if (!spec) return Object.assign(rec, { action: 'none', reason: '无 spec' });

    const v = validateSpec(spec);
    if (!v.ok) {
        if ((v.errors || []).length <= 2 && (v.warnings || []).length > (v.errors || []).length) {
            return Object.assign(rec, {
                action: 'autofix',
                reason: '只有 ' + v.errors.length + ' 处硬错误，且大部分问题可自动修复。先点「自动修复」再应用最省心。',
                severity: 'warn'
            });
        }
        return Object.assign(rec, {
            action: 'reject',
            reason: '有 ' + v.errors.length + ' 处硬错误（如特效 id 不存在 / 严格模式违规），直接应用会出问题。',
            severity: 'error'
        });
    }

    const q = (typeof scoreSpecQuality === 'function') ? scoreSpecQuality(spec) : { total: 0 };
    if (q.total >= 80) {
        return Object.assign(rec, {
            action: 'apply',
            reason: '质量 ' + q.total + '，可以直接应用。',
            severity: 'ok'
        });
    }
    if (q.total >= 60) {
        return Object.assign(rec, {
            action: 'preview',
            reason: '质量 ' + q.total + '，建议先「预览」看看效果，确认后再应用。',
            severity: 'info'
        });
    }
    return Object.assign(rec, {
        action: 'preview',
        reason: '质量 ' + q.total + '，偏低。建议：1) 先「生成修稿提示」让 AI 重写一版；2) 或先「预览」看看是否可接受。',
        severity: 'warn'
    });
}
window.recommendNextAction = recommendNextAction;

/* ============================================================
   61. 应用历史时间轴：每次真实应用都留一条，用于观察项目演进
   ============================================================ */
const AI_APPLIED_LOG_KEY = 'douyin_ai_applied_log_v1';
const AI_APPLIED_LOG_MAX = 30;

function logSpecApply(entry) {
    if (!entry) return;
    try {
        let list = [];
        try { list = JSON.parse(localStorage.getItem(AI_APPLIED_LOG_KEY) || '[]'); } catch (e) { list = []; }
        if (!Array.isArray(list)) list = [];
        list.unshift({
            at: Date.now(),
            label: entry.label || '应用',
            pages: entry.pages || 0,
            quality: entry.quality || 0,
            style: entry.style || null,
            append: !!entry.append
        });
        if (list.length > AI_APPLIED_LOG_MAX) list = list.slice(0, AI_APPLIED_LOG_MAX);
        localStorage.setItem(AI_APPLIED_LOG_KEY, JSON.stringify(list));
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 写入应用日志失败', e);
    }
}
window.logSpecApply = logSpecApply;

function getAppliedLog() {
    try {
        const list = JSON.parse(localStorage.getItem(AI_APPLIED_LOG_KEY) || '[]');
        return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
}
window.getAppliedLog = getAppliedLog;

function clearAppliedLog() {
    try { localStorage.removeItem(AI_APPLIED_LOG_KEY); } catch (e) {}
}
window.clearAppliedLog = clearAppliedLog;

/* ============================================================
   62. 项目健康度概览：快速给出当前项目整体状态
   ============================================================ */
function getProjectHealthReport() {
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const pages = state.pages || [];
    const report = {
        ok: true,
        pagesCount: pages.length,
        totalLayers: 0,
        textLayers: 0,
        stickerLayers: 0,
        drawLayers: 0,
        shapeLayers: 0,
        effectLayers: 0,
        avgCharsPerTextLayer: 0,
        assetRefs: { fonts: [], backdrops: [], bgImages: [], stickers: [] },
        consistency: { ok: true, issues: [] },
        quality: 0,
        emptyPages: 0,
        lockedLayers: 0,
        groups: 0
    };

    let totalChars = 0;
    const groupsSet = new Set();

    pages.forEach((p, pi) => {
        const layers = (p.layers || []);
        if (layers.length === 0) report.emptyPages++;
        layers.forEach(l => {
            if (!l) return;
            report.totalLayers++;
            if (l.locked) report.lockedLayers++;
            if (l.groupId) groupsSet.add(l.groupId);
            if (l.type === 'text') {
                report.textLayers++;
                totalChars += String(l.content || '').replace(/<[^>]*>/g, '').length;
                if (l.effectClass) report.effectLayers++;
            } else if (l.type === 'sticker') report.stickerLayers++;
            else if (l.type === 'draw') report.drawLayers++;
            else if (l.type === 'shape') report.shapeLayers++;
        });
    });
    report.groups = groupsSet.size;
    if (report.textLayers > 0) report.avgCharsPerTextLayer = Math.round(totalChars / report.textLayers);

    // 资产依赖
    try {
        if (typeof exportCanvasAsSpec === 'function' && typeof collectSpecAssetRefs === 'function') {
            const spec = exportCanvasAsSpec();
            report.assetRefs = collectSpecAssetRefs(spec);
        }
    } catch (e) {}

    // 质量分（用画布现状当作一个 spec）
    try {
        if (typeof exportCanvasAsSpec === 'function' && typeof scoreSpecQuality === 'function') {
            const spec = exportCanvasAsSpec();
            report.quality = scoreSpecQuality(spec).total;
        }
    } catch (e) {}

    // 跨页一致性
    try {
        if (typeof exportCanvasAsSpec === 'function' && typeof checkStyleConsistency === 'function') {
            const spec = exportCanvasAsSpec();
            report.consistency = checkStyleConsistency(spec);
        }
    } catch (e) {}

    return report;
}
window.getProjectHealthReport = getProjectHealthReport;

/* ============================================================
   63. spec → 封面模板
   把当前 spec 转成 cover-templates.js 的模板格式（bg + layers）
   存入 localStorage，主界面可读并套用
   ============================================================ */
const USER_TEMPLATES_KEY = 'douyin_user_templates_v1';
const USER_TEMPLATES_MAX = 20;

function specToCoverTemplate(spec, name) {
    if (!spec || !Array.isArray(spec.pages) || !spec.pages.length) return null;
    // 只取第 1 页作为模板（最常见场景）
    const page = spec.pages[0];
    const bg = page.bg || null;
    const layers = (page.layers || []).map((l, i) => {
        const copy = JSON.parse(JSON.stringify(l));
        delete copy.id;
        delete copy.locked;
        delete copy.groupId;
        return copy;
    });
    return {
        id: 'user-tpl-' + Date.now(),
        name: name || ('AI 模板 ' + new Date().toLocaleTimeString()),
        bg: bg,
        layers: layers,
        source: 'ai',
        createdAt: Date.now()
    };
}
window.specToCoverTemplate = specToCoverTemplate;

function saveSpecAsUserTemplate(spec, name) {
    const tpl = specToCoverTemplate(spec, name);
    if (!tpl) return { ok: false, reason: 'spec 无效' };
    try {
        let list = [];
        try { list = JSON.parse(localStorage.getItem(USER_TEMPLATES_KEY) || '[]'); } catch (e) { list = []; }
        if (!Array.isArray(list)) list = [];
        list.unshift(tpl);
        if (list.length > USER_TEMPLATES_MAX) list = list.slice(0, USER_TEMPLATES_MAX);
        localStorage.setItem(USER_TEMPLATES_KEY, JSON.stringify(list));
        return { ok: true, template: tpl };
    } catch (e) {
        return { ok: false, reason: '写入失败：' + e.message };
    }
}
window.saveSpecAsUserTemplate = saveSpecAsUserTemplate;

function getUserTemplates() {
    try {
        const list = JSON.parse(localStorage.getItem(USER_TEMPLATES_KEY) || '[]');
        return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
}
window.getUserTemplates = getUserTemplates;

function deleteUserTemplate(id) {
    try {
        let list = getUserTemplates();
        list = list.filter(t => t.id !== id);
        localStorage.setItem(USER_TEMPLATES_KEY, JSON.stringify(list));
        return { ok: true };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
}
window.deleteUserTemplate = deleteUserTemplate;

/* ============================================================
   64. 输入清洗：处理用户从 Obsidian / 微信 / Notion 粘贴时常见的脏字符
   ============================================================ */
function sanitizeRawInput(raw) {
    if (!raw) return '';
    let text = String(raw);

    // 1. 零宽字符
    text = text.replace(/[\u200b\u200c\u200d\ufeff]/g, '');

    // 2. 全角空格 → 半角（保留行首缩进两格）
    text = text.replace(/\u3000/g, ' ');

    // 3. Windows/Mac 换行统一
    text = text.replace(/\r\n?/g, '\n');

    // 4. 删除连续 3 行以上的空行，压缩为 2 行
    text = text.replace(/\n{3,}/g, '\n\n');

    // 5. 首尾空行
    text = text.replace(/^\n+/, '').replace(/\n+$/, '');

    // 6. 中文引号统一（对分块无影响，但可能影响 AI 处理）
    //    不在这里改，因为原文引用中文引号时不动

    return text;
}
window.sanitizeRawInput = sanitizeRawInput;

/* ============================================================
   65. 原文粘贴清洗入口（供 text-layers.js 的 handleExternalPaste 使用）
   ============================================================ */
function cleanTextForCanvasPaste(raw) {
    if (!raw) return '';
    let t = (typeof sanitizeRawInput === 'function') ? sanitizeRawInput(raw) : String(raw);
    // 对文字图层：去掉行首全角缩进（避免视觉上错位）
    t = t.split('\n').map(line => line.replace(/^[ \t]+/, '')).join('\n');
    return t;
}
window.cleanTextForCanvasPaste = cleanTextForCanvasPaste;

/* ============================================================
   66. AI 应用失败降级：从当前输入框的原文自动兜底生成可用 spec
   ============================================================ */
async function fallbackOnAiFailure(rawInput, options) {
    options = options || {};
    if (!rawInput) return { ok: false, reason: '无原文' };

    let spec = null;
    try {
        // 优先从原文直接兜底生成
        if (typeof buildFallbackSpec === 'function') {
            spec = buildFallbackSpec(rawInput);
        }
    } catch (e) {
        return { ok: false, reason: '兜底生成失败：' + e.message };
    }

    if (!spec) return { ok: false, reason: '兜底 spec 为空' };

    // 自动修复一次
    try {
        if (typeof autoFixSpec === 'function') {
            const r = autoFixSpec(spec);
            spec = r.spec || spec;
        }
    } catch (e) {}

    const applied = await applyCoverSpec(spec, {
        dryRun: false,
        append: !!options.append,
        autoDecorate: options.autoDecorate !== false
    });

    return {
        ok: !!applied.applied,
        spec,
        applied,
        reason: applied.applied ? '' : '应用失败'
    };
}
window.fallbackOnAiFailure = fallbackOnAiFailure;

/* ============================================================
   67. 输入诊断：粘了一大段后先看看是什么
   ============================================================ */
function diagnoseRawInput(raw) {
    const result = {
        length: (raw || '').length,
        hasCodeBlock: false,
        candidatesCount: 0,
        jsonLike: false,
        likelyError: ''
    };
    if (!raw) { result.likelyError = '输入为空'; return result; }

    result.hasCodeBlock = /```(?:json)?/i.test(raw);
    result.jsonLike = /\{/.test(raw) && /\}/.test(raw);

    // 尝试提取多份 spec
    try {
        if (typeof extractMultipleSpecs === 'function') {
            const list = extractMultipleSpecs(raw);
            result.candidatesCount = list.length;
        }
    } catch (e) {}

    // 如果一份都没提取到，给出更明确的诊断
    if (result.candidatesCount === 0) {
        if (!result.jsonLike) {
            result.likelyError = '看起来不是 JSON（没有 { ... }），可能 AI 只输出了说明文字，或你复制到了别的段落';
        } else if (!result.hasCodeBlock) {
            result.likelyError = '看起来有 JSON 但不完整（可能被截断），或结构有误';
        } else {
            result.likelyError = '有代码块但没有合法 spec，可能 JSON 语法错误（中文引号/尾逗号/注释）';
        }
    }

    return result;
}
window.diagnoseRawInput = diagnoseRawInput;

/* ============================================================
   68. 提示词预设库：把常用任务封装成一句话模板
   ============================================================ */
const AI_PROMPT_PRESETS = [
    {
        id: 'cover-title',
        name: '封面标题生成',
        description: '给定一段内容，产出 5 条抖音爆款封面标题',
        build: (raw) => ('你是抖音封面标题专家。请根据下面内容，产出 5 条爆款封面标题候选，每条不超过 14 字，要求有冲击力。' +
            '\n只输出一个 JSON 数组，格式：["标题1","标题2","标题3","标题4","标题5"]，不要任何解释。\n\n' +
            '内容：\n' + raw)
    },
    {
        id: 'chunk-beautify',
        name: '整块美化',
        description: '按契约把原文分成多页并输出完整 spec',
        build: (raw) => {
            const sys = (typeof generateAiSpecMarkdown === 'function') ? generateAiSpecMarkdown() : '';
            return sys + '\n\n请按上面契约对下面内容做分块美化，输出一份完整的 douyin-cover-spec JSON：\n\n' + raw;
        }
    },
    {
        id: 'redesign',
        name: '整本重设计',
        description: '给现有画布重新配风格（不改变内容）',
        build: (raw) => {
            const spec = (typeof exportCanvasAsSpec === 'function') ? exportCanvasAsSpec() : null;
            const sys = (typeof generateAiSpecMarkdown === 'function') ? generateAiSpecMarkdown() : '';
            return sys + '\n\n下面是当前画布的 spec。请保持所有文字内容不变，只重设计背景 / 特效 / 配色 / 版式，让整体更具抖音爆款风格。' +
                '\n输出与输入结构完全一致的 JSON。\n\n当前画布：\n```json\n' + JSON.stringify(spec, null, 2) + '\n```';
        }
    },
    {
        id: 'cold-start',
        name: '冷启动模板',
        description: '不知道写什么时，让 AI 帮你产 3 套候选',
        build: (raw) => {
            const sys = (typeof generateAiSpecMarkdown === 'function') ? generateAiSpecMarkdown() : '';
            return sys + '\n\n请对下面内容产出 3 套完全不同风格的 douyin-cover-spec 候选方案，每套用 {} 包起来，中间不加任何解释：\n\n' + raw;
        }
    }
];
window.AI_PROMPT_PRESETS = AI_PROMPT_PRESETS;

function getPromptPresetById(id) {
    return AI_PROMPT_PRESETS.find(p => p.id === id) || null;
}
window.getPromptPresetById = getPromptPresetById;

/* ============================================================
   69. 快速标题提取：从原文找出“最像标题”的一行
   ============================================================ */
function extractTitleFromRaw(raw) {
    if (!raw) return '';
    const lines = String(raw).split(/\r?\n/).map(s => s.trim()).filter(s => s);
    if (!lines.length) return '';

    // 打分规则（越高越像标题）
    const scores = lines.map((line, i) => {
        let score = 0;
        const len = line.length;
        if (len >= 4 && len <= 20) score += 20;
        else if (len >= 2 && len <= 30) score += 10;
        else if (len > 40) score -= 15;

        // 位置加权
        if (i === 0) score += 15;
        else if (i === 1) score += 5;

        // 有 emoji 加分
        if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(line)) score += 8;

        // 有标点结尾（。！？）减分（更像正文）
        if (/[。！？]$/.test(line)) score -= 8;

        // 有数字加分
        if (/\d/.test(line)) score += 3;

        // 含爆款关键词加分
        if (/(逆袭|赚钱|副业|月入|暴富|干货|揭秘|必看|攻略|方法|教程|技巧)/.test(line)) score += 6;

        return { line, score, i };
    });

    scores.sort((a, b) => b.score - a.score);
    return scores[0] ? scores[0].line : '';
}
window.extractTitleFromRaw = extractTitleFromRaw;

/* ============================================================
   70. 批量生成所有预设提示词（供用户在几种方法之间挑选）
   ============================================================ */
function buildAllPresetPrompts(rawText) {
    const out = [];
    if (!window.AI_PROMPT_PRESETS) return out;
    window.AI_PROMPT_PRESETS.forEach(p => {
        try {
            const text = p.build(rawText);
            if (text) {
                out.push({
                    id: p.id,
                    name: p.name,
                    description: p.description,
                    text,
                    length: text.length
                });
            }
        } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 生成预设失败', p.id, e);
        }
    });
    return out;
}
window.buildAllPresetPrompts = buildAllPresetPrompts;

/* ============================================================
   71. 本地标题生成：不依赖 AI 直接给 5 个候选
   ============================================================ */
function generateLocalTitleCandidates(rawText) {
    const seed = extractTitleFromRaw(rawText);
    if (!seed) return [];
    const candidates = new Set();
    candidates.add(seed);

    // 1. 疑问句
    if (!/[?？]$/.test(seed)) candidates.add(seed + '？');

    // 2. 加数字
    if (!/\d/.test(seed)) candidates.add('3 个 ' + seed);

    // 3. 加情绪
    candidates.add(seed + '！');

    // 4. 加前置“揭秘/禁止”类引导
    if (!/^(揭秘|禁止|警告|干货|劝你)/.test(seed)) {
        candidates.add('揭秘 ' + seed);
    }

    // 5. 加后置承诺
    if (!/建议收藏|建议码住|一定要看/.test(seed)) {
        candidates.add(seed + ' 建议收藏');
    }

    // 6. 金句扩展（若可用）
    try {
        if (typeof expandTitleWithPatterns === 'function') {
            expandTitleWithPatterns(seed).forEach(t => { if (t && t !== seed) candidates.add(t); });
        }
    } catch (e) {}

    return Array.from(candidates).slice(0, 10);
}
window.generateLocalTitleCandidates = generateLocalTitleCandidates;

/* ============================================================
   72. 智能排版建议：不依赖 AI 的版式体检
   ============================================================ */
function suggestLayoutImprovements(spec) {
    const suggestions = [];
    if (!spec || !Array.isArray(spec.pages) || !spec.pages.length) return suggestions;

    spec.pages.forEach((p, pi) => {
        const texts = (p.layers || []).filter(l => l && l.type === 'text');
        if (texts.length === 0) return;

        texts.forEach((l, li) => {
            const label = '第 ' + (pi + 1) + ' 页 图层 ' + (li + 1);
            const fs = parseFloat(l.fontSize) || 28;
            const w = Number(l.width) || 300;
            const h = Number(l.height) || 100;
            const lh = Number(l.lineHeight) || 1.2;

            // 1. 行距过密
            if (lh < 1.15) {
                suggestions.push({ level: 'warn', text: label + '：行距 ' + lh + ' 过密，建议 ≥1.2' });
            }
            if (lh > 2.4) {
                suggestions.push({ level: 'info', text: label + '：行距 ' + lh + ' 过松，建议 ≤2' });
            }

            // 2. 字号过小（正文层）
            if (fs < 14 && String(l.content || '').length > 10) {
                suggestions.push({ level: 'warn', text: label + '：正文 ' + fs + 'px 偏小，建议 ≥16px 保证手机可读' });
            }

            // 3. 位置越界 / 触边
            const x = Number(l.x) || 0;
            const y = Number(l.y) || 0;
            if (x < 16 || x + w > 344) {
                suggestions.push({ level: 'warn', text: label + '：左右留白不足（x=' + x + ', w=' + w + '），建议左右各留 20px' });
            }
            if (y < 30) {
                suggestions.push({ level: 'info', text: label + '：顶部距画布 ' + y + 'px，注意安全区' });
            }
            if (y + h > 610) {
                suggestions.push({ level: 'warn', text: label + '：底部距画布 ' + Math.round(y + h) + 'px，可能被裁或落在安全区外' });
            }

            // 4. 字距过宽/过窄
            const ls = parseFloat(l.letterSpacing) || 0;
            if (ls > 8) suggestions.push({ level: 'info', text: label + '：字距 ' + ls + 'px 过宽，手机可读性下降' });
            if (ls < -3) suggestions.push({ level: 'info', text: label + '：字距 ' + ls + 'px 过窄，文字可能粘在一起' });
        });
    });

    return suggestions;
}
window.suggestLayoutImprovements = suggestLayoutImprovements;

/* ============================================================
   73. 一键从原文到封面（离线全自动最终兜底）
   流程：清洗 → 分块 → 兜底 spec → 本地标题 → 自动装饰 → 应用
   ============================================================ */
async function autoFromRawToCover(rawText, options) {
    options = options || {};
    if (!rawText) return { ok: false, reason: '无原文' };
    if (!window.state) return { ok: false, reason: 'state 未就绪' };

    const clean = (typeof sanitizeRawInput === 'function') ? sanitizeRawInput(rawText) : rawText;

    // 1. 生成 spec
    let spec = null;
    try {
        spec = (typeof buildFallbackSpec === 'function')
            ? buildFallbackSpec(clean)
            : null;
    } catch (e) { return { ok: false, reason: '生成失败：' + e.message }; }
    if (!spec) return { ok: false, reason: '生成 spec 为空' };

    // 1b. 强制风格：如果指定则直接覆盖背景 preset 与特效
    try {
        if (options.forceStyleId && typeof getStyleById === 'function') {
            const st = getStyleById(options.forceStyleId);
            if (st) {
                if (st.bgPresetId && typeof pickBackgroundForText === 'function') {
                    const bgPreset = (window.BG_PRESETS || []).find(p => p.id === st.bgPresetId);
                    if (bgPreset && typeof normalizeBackground === 'function') {
                        state.background = normalizeBackground({
                            type: bgPreset.type || 'gradient',
                            color1: bgPreset.color1 || '#ff2442',
                            color2: bgPreset.color2 || bgPreset.color1 || '#2575fc',
                            angle: bgPreset.angle != null ? bgPreset.angle : 135,
                            texture: bgPreset.texture || 'none',
                            presetId: bgPreset.id
                        });
                    }
                }
                if (spec.pages && spec.pages[0]) {
                    const firstText = (spec.pages[0].layers || []).find(l => l && l.type === 'text');
                    if (firstText) {
                        if (st.titleEffect) firstText.effectClass = st.titleEffect;
                        if (st.titleColor) firstText.color = st.titleColor;
                    }
                }
            }
        }
    } catch (e) {}

    // 2. 本地标题
    try {
        const cand = (typeof generateLocalTitleCandidates === 'function')
            ? generateLocalTitleCandidates(clean)
            : [];
        if (cand.length) {
            spec.titleCandidates = cand;
            const firstPage = spec.pages && spec.pages[0];
            const firstText = firstPage && (firstPage.layers || []).find(l => l && l.type === 'text');
            if (firstText) firstText.content = cand[0];
        }
    } catch (e) {}

    // 3. 自动装饰
    try {
        if (options.autoDecorate !== false && typeof autoDecorateSpec === 'function') {
            autoDecorateSpec(spec);
        }
    } catch (e) {}

    // 4. 自动修复
    try {
        if (typeof autoFixSpec === 'function') {
            const r = autoFixSpec(spec);
            spec = r.spec || spec;
        }
    } catch (e) {}

    // 5. 应用
    const applied = await applyCoverSpec(spec, {
        dryRun: false,
        append: !!options.append,
        autoDecorate: false  // 已经手动配过
    });

    // 6. 导出
    let exportResult = null;
    if (options.autoExport && options.autoExport !== 'none') {
        try {
            if (typeof autoExportAfterApply === 'function') {
                exportResult = await autoExportAfterApply(options.autoExport);
            }
        } catch (e) {}
    }

    return {
        ok: !!applied.applied,
        spec,
        applied,
        exportResult,
        pages: (spec.pages || []).length,
        quality: (typeof scoreSpecQuality === 'function') ? scoreSpecQuality(spec).total : 0
    };
}
window.autoFromRawToCover = autoFromRawToCover;

/* ============================================================
   74. spec 完整备份：把 spec + 逐页缩略图 + 元数据打包成单 JSON 文件
   与分享包不同：分享包是多文件；这个备份是单 JSON，适合长期归档 / 迁移
   ============================================================ */
async function exportSpecBackupFile(spec, options) {
    options = options || {};
    if (!spec || !Array.isArray(spec.pages)) return { ok: false, reason: 'spec 无效' };

    const thumbnails = [];
    if (options.includeThumbs !== false && typeof html2canvas !== 'undefined') {
        try {
            for (let i = 0; i < spec.pages.length; i++) {
                const p = spec.pages[i];
                const pageId = (state.pages[i] && state.pages[i].id) || null;
                if (!pageId) { thumbnails.push(''); continue; }
                const wrapper = document.querySelector('.canvas-page-wrapper[data-page-id="' + pageId + '"]');
                if (!wrapper) { thumbnails.push(''); continue; }
                const canvasNode = wrapper.querySelector('.cover-canvas');
                if (!canvasNode) { thumbnails.push(''); continue; }
                const c = await html2canvas(canvasNode, {
                    scale: 0.25,
                    backgroundColor: '#000',
                    useCORS: true,
                    allowTaint: true,
                    logging: false
                });
                thumbnails.push(c.toDataURL('image/jpeg', 0.6));
            }
        } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 备份缩略图失败', e);
        }
    }

    const backup = {
        format: 'douyin-cover-backup',
        version: 1,
        createdAt: new Date().toISOString(),
        meta: {
            name: options.name || ('龙蛇变备份_' + Date.now()),
            pages: spec.pages.length,
            quality: (typeof scoreSpecQuality === 'function') ? scoreSpecQuality(spec).total : 0,
            appVersion: '1.0'
        },
        spec,
        thumbnails,
        stats: (typeof getAiStats === 'function') ? getAiStats() : null
    };

    try {
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = backup.meta.name + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return { ok: true, filename: backup.meta.name + '.json', pages: spec.pages.length };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
}
window.exportSpecBackupFile = exportSpecBackupFile;

/* ============================================================
   75. spec 完整备份导入
   ============================================================ */
async function importSpecBackupFile(file) {
    if (!file) return { ok: false, reason: '无文件' };
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const raw = evt.target.result || '';
                let obj = JSON.parse(raw);
                // 兼容：可能是裸 spec、也可能是带 format:douyin-cover-backup 的备份
                let spec = null;
                if (obj && obj.format === 'douyin-cover-backup') {
                    spec = obj.spec;
                } else if (obj && obj.format === 'douyin-cover-spec') {
                    spec = obj;
                } else {
                    resolve({ ok: false, reason: '不是 spec 也不是备份文件' });
                    return;
                }
                if (typeof fixSpecStructure === 'function') spec = fixSpecStructure(spec);
                if (typeof migrateSpec === 'function') spec = migrateSpec(spec);
                resolve({ ok: true, spec, meta: obj.meta || null, thumbnails: obj.thumbnails || [] });
            } catch (e) {
                resolve({ ok: false, reason: '解析失败：' + e.message });
            }
        };
        reader.onerror = () => resolve({ ok: false, reason: '读取失败' });
        reader.readAsText(file, 'utf-8');
    });
}
window.importSpecBackupFile = importSpecBackupFile;

/* ============================================================
   76. 组合推荐：给同一份文本 3 套不同的视觉组合建议
   用途：用户拿不定主意时，点一下批量对比
   ============================================================ */
function buildVisualCombos(text) {
    const clean = String(text || '');
    const presets = window.AI_STYLE_PRESETS || [];
    const allBg = window.BG_PRESETS || [];
    if (!presets.length) return [];

    const combos = [];
    const seen = new Set();

    // 主推荐：匹配度最高的风格
    const primary = (typeof pickStyleForText === 'function') ? pickStyleForText(clean) : null;
    if (primary && !seen.has(primary.id)) {
        seen.add(primary.id);
        combos.push({
            kind: 'primary',
            styleId: primary.id,
            styleName: primary.name,
            bgPresetId: primary.bgPresetId,
            titleEffect: primary.titleEffect,
            titleColor: primary.titleColor,
            backlineBackdrop: primary.backlineBackdrop
        });
    }

    // 备选 1：同类别中换背景
    if (primary) {
        const presetsSameCat = allBg.filter(b => b.cat === (allBg.find(p => p.id === primary.bgPresetId) || {}).cat && b.id !== primary.bgPresetId).slice(0, 1);
        if (presetsSameCat[0]) {
            combos.push({
                kind: 'alt-bg',
                styleId: primary.id,
                styleName: primary.name + '（换背景）',
                bgPresetId: presetsSameCat[0].id,
                titleEffect: primary.titleEffect,
                titleColor: primary.titleColor,
                backlineBackdrop: primary.backlineBackdrop
            });
        }
    }

    // 备选 2：不同风格的对比
    const otherStyle = presets.find(p => !seen.has(p.id));
    if (otherStyle) {
        seen.add(otherStyle.id);
        combos.push({
            kind: 'alt-style',
            styleId: otherStyle.id,
            styleName: otherStyle.name + '（对比款）',
            bgPresetId: otherStyle.bgPresetId,
            titleEffect: otherStyle.titleEffect,
            titleColor: otherStyle.titleColor,
            backlineBackdrop: otherStyle.backlineBackdrop
        });
    }

    return combos;
}
window.buildVisualCombos = buildVisualCombos;

/* ============================================================
   77. 项目级批量重制：把整个项目的每一页用离线兜底重排一遍
   用途：老项目用新的视觉语言统一重制，不依赖 AI
   ============================================================ */
async function rebuildProjectWithOfflineRule(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const pages = (state.pages || []).slice();
    if (!pages.length) return { ok: false, reason: '项目没有页面' };

    const beforePages = JSON.parse(JSON.stringify(pages));
    const beforePageId = state.currentPageId;
    const beforeBg = state.background ? JSON.parse(JSON.stringify(state.background)) : null;

    let processed = 0;
    let totalLayers = 0;

    for (const page of pages) {
        try {
            // 抽取该页所有 text 图层的文本作为原文
            const texts = (page.layers || []).filter(l => l && l.type === 'text');
            if (!texts.length) continue;
            const raw = texts.map(t => String(t.content || '').replace(/<[^>]*>/g, '')).join('\n\n');
            if (!raw.trim()) continue;

            // 用兜底 spec 生成新页
            const fallback = (typeof buildFallbackSpec === 'function') ? buildFallbackSpec(raw) : null;
            if (!fallback || !fallback.pages || !fallback.pages.length) continue;

            // 只取第 1 页作为该页的新图层（多段内容用 long-text 逻辑会拆页，但这里我们一页对一页）
            const newPage = fallback.pages[0];
            if (!newPage || !newPage.layers) continue;

            // 强制风格（可选）
            if (options.forceStyleId && typeof getStyleById === 'function') {
                const st = getStyleById(options.forceStyleId);
                if (st) {
                    const firstText = (newPage.layers || []).find(l => l && l.type === 'text');
                    if (firstText) {
                        if (st.titleEffect) firstText.effectClass = st.titleEffect;
                        if (st.titleColor) firstText.color = st.titleColor;
                    }
                }
            }

            // 替换 page 的 layers（保持 page.id 与 title 不变）
            const normalizedLayers = newPage.layers.map((src, i) => normalizeSpecLayer(src, i));
            page.layers = normalizedLayers;
            processed++;
            totalLayers += normalizedLayers.length;
        } catch (e) {
            if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 批量重制单页失败', e);
        }
    }

    if (processed === 0) return { ok: false, reason: '没有任何页可重制' };

    try {
        window.__aiSpecBackup = {
            appliedAt: Date.now(),
            pages: beforePages,
            currentPageId: beforePageId,
            background: beforeBg
        };
    } catch (e) {}

    if (state.history && typeof state.history.record === 'function') state.history.record();
    if (typeof renderAll === 'function') renderAll();
    return { ok: true, processed, totalLayers, pagesCount: pages.length };
}
window.rebuildProjectWithOfflineRule = rebuildProjectWithOfflineRule;

/* ============================================================
   78. 页级补丁：支持“AI 只输出一页，替换当前画布指定页”
   用途：AI 一轮返回整本太长时，让 AI 只返回某一页，用这个补齐
   ============================================================ */
async function patchSpecPage(currentSpec, pageSpec, pageIndex) {
    if (!currentSpec || !Array.isArray(currentSpec.pages)) return { ok: false, reason: 'currentSpec 无效' };
    if (!pageSpec) return { ok: false, reason: 'pageSpec 无效' };

    // 支持三种输入：
    //   - 完整 spec（含 pages）→ 取第 1 页
    //   - 单页对象（含 layers）
    //   - 单页对象（含 title/layers）
    let patch = null;
    if (Array.isArray(pageSpec.pages) && pageSpec.pages.length > 0) {
        patch = pageSpec.pages[0];
    } else if (Array.isArray(pageSpec.layers)) {
        patch = pageSpec;
    } else {
        return { ok: false, reason: '无法识别的页片段' };
    }

    const idx = Math.max(0, Math.min(currentSpec.pages.length - 1, pageIndex | 0));
    // 归一化图层
    const normalized = (patch.layers || []).map((src, i) => normalizeSpecLayer(src, i));
    currentSpec.pages[idx] = {
        title: patch.title || currentSpec.pages[idx].title || ('第 ' + (idx + 1) + ' 页'),
        bg: patch.bg || currentSpec.pages[idx].bg || null,
        layers: normalized
    };
    return { ok: true, pageIndex: idx, pageCount: currentSpec.pages.length };
}
window.patchSpecPage = patchSpecPage;

/* ============================================================
   79. 应用差异感知：应用 AI 前后如果差异过小（AI 无新意），提示用户
   ============================================================ */
function diffStatusForApply(beforeSpec, afterSpec) {
    if (!beforeSpec || !afterSpec) return { ok: true, changed: 0, message: '' };
    let changedLayers = 0;
    let totalLayers = 0;
    const maxPages = Math.max((beforeSpec.pages || []).length, (afterSpec.pages || []).length);
    for (let i = 0; i < maxPages; i++) {
        const a = beforeSpec.pages[i] || { layers: [] };
        const b = afterSpec.pages[i] || { layers: [] };
        const la = a.layers || [];
        const lb = b.layers || [];
        const maxLayers = Math.max(la.length, lb.length);
        for (let j = 0; j < maxLayers; j++) {
            totalLayers++;
            const ta = la[j] || {};
            const tb = lb[j] || {};
            if (String(ta.content || '') !== String(tb.content || '')
                || String(ta.effectClass || '') !== String(tb.effectClass || '')
                || String(ta.color || '').toUpperCase() !== String(tb.color || '').toUpperCase()
                || ta.fontSize !== tb.fontSize
                || Number(ta.x) !== Number(tb.x)
                || Number(ta.y) !== Number(tb.y)) {
                changedLayers++;
            }
        }
    }
    const changedPct = totalLayers > 0 ? (changedLayers / totalLayers) : 0;
    let message = '';
    if (changedPct < 0.05 && totalLayers > 0) {
        message = 'AI 方案与当前画布差异极小（仅 ' + changedLayers + '/' + totalLayers + ' 图层不同），可能是 AI 重复了现状';
    }
    return { ok: true, changed: changedLayers, total: totalLayers, changedPct, message };
}
window.diffStatusForApply = diffStatusForApply;

/* ============================================================
   80. 清理空页
   AI 输出偶尔会有空页（layers 为空），影响观感也占位置
   ============================================================ */
function removeEmptyPages(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const pages = state.pages || [];
    if (pages.length <= 1) return { ok: false, reason: '只有 1 页，删除会空' };

    const beforeLen = pages.length;
    const kept = pages.filter(p => (p.layers || []).length > 0);
    if (!kept.length) {
        return { ok: false, reason: '所有页都是空的，需至少保留 1 页' };
    }
    if (kept.length === pages.length) {
        return { ok: true, removed: 0, message: '没有空白页' };
    }

    if (options.dryRun) {
        return { ok: true, removed: pages.length - kept.length, message: '将删除 ' + (pages.length - kept.length) + ' 个空白页' };
    }

    const beforePages = JSON.parse(JSON.stringify(state.pages));
    state.pages = kept;
    if (!state.pages.some(p => p.id === state.currentPageId)) {
        state.currentPageId = state.pages[0].id;
    }

    try {
        window.__aiSpecBackup = {
            appliedAt: Date.now(),
            pages: beforePages,
            currentPageId: state.currentPageId,
            background: state.background ? JSON.parse(JSON.stringify(state.background)) : null
        };
    } catch (e) {}

    if (state.history && typeof state.history.record === 'function') state.history.record();
    if (typeof renderAll === 'function') renderAll();
    return { ok: true, removed: beforeLen - kept.length };
}
window.removeEmptyPages = removeEmptyPages;

/* ============================================================
   81. 快速统计摘要（纯文本）
   用途：把当前画布状态转成一段可粘贴的描述，发给合作者或贴到笔记里
   ============================================================ */
function buildQuickSummaryText() {
    if (!window.state) return '';
    const lines = [];
    const pages = state.pages || [];
    lines.push('【项目摘要】');
    lines.push('页数：' + pages.length);
    let totalLayers = 0;
    let textLayers = 0;
    let stickerLayers = 0;
    let effectLayers = 0;
    let totalChars = 0;
    const styles = {};
    const fonts = {};
    pages.forEach(p => {
        (p.layers || []).forEach(l => {
            if (!l) return;
            totalLayers++;
            if (l.type === 'text') {
                textLayers++;
                totalChars += String(l.content || '').replace(/<[^>]*>/g, '').length;
                if (l.effectClass) {
                    effectLayers++;
                    styles[l.effectClass] = (styles[l.effectClass] || 0) + 1;
                }
                if (l.fontFamily) fonts[l.fontFamily] = (fonts[l.fontFamily] || 0) + 1;
            } else if (l.type === 'sticker') stickerLayers++;
        });
    });
    lines.push('总图层：' + totalLayers + '（文字 ' + textLayers + ' · 贴纸 ' + stickerLayers + '）');
    lines.push('带特效文字：' + effectLayers);
    if (textLayers > 0) lines.push('平均每图层：' + Math.round(totalChars / textLayers) + ' 字');

    // 主特效
    const topEffects = Object.entries(styles).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (topEffects.length) {
        lines.push('主特效：' + topEffects.map(e => e[0] + '(' + e[1] + ')').join(', '));
    }

    // 主字体
    const topFonts = Object.entries(fonts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (topFonts.length) {
        lines.push('主字体：' + topFonts.map(e => e[0] + '(' + e[1] + ')').join(', '));
    }

    // 质量分
    try {
        if (typeof exportCanvasAsSpec === 'function' && typeof scoreSpecQuality === 'function') {
            const spec = exportCanvasAsSpec();
            const q = scoreSpecQuality(spec);
            lines.push('质量分：' + q.total + ' / 100');
        }
    } catch (e) {}

    // 资产依赖
    try {
        if (typeof exportCanvasAsSpec === 'function' && typeof collectSpecAssetRefs === 'function') {
            const refs = collectSpecAssetRefs(exportCanvasAsSpec());
            const total = refs.fonts.length + refs.backdrops.length + refs.bgImages.length + refs.stickers.length;
            if (total > 0) {
                lines.push('自定义资产：字体 ' + refs.fonts.length + ' · 底衬 ' + refs.backdrops.length + ' · 背景图 ' + refs.bgImages.length + ' · 贴纸 ' + refs.stickers.length);
            }
        }
    } catch (e) {}

    return lines.join('\n');
}
window.buildQuickSummaryText = buildQuickSummaryText;

/* ============================================================
   82. AI 输出可视化检查：把一大段 AI 输出按类型拆解成高亮片段
   用途：当用户粘贴一段乱七八糟的输出，一眼看清哪里是 JSON 哪里是解释
   ============================================================ */
function highlightRawSegments(raw) {
    const segments = [];
    if (!raw) return segments;
    const text = String(raw);
    const len = text.length;
    let i = 0;

    // 扫描代码块 ```...```
    while (i < len) {
        // 找下一个 ```
        const codeStart = text.indexOf('```', i);
        if (codeStart === -1) {
            if (i < len) {
                segments.push({ type: 'text', start: i, end: len, content: text.slice(i) });
            }
            break;
        }
        if (codeStart > i) {
            segments.push({ type: 'text', start: i, end: codeStart, content: text.slice(i, codeStart) });
        }
        const codeEnd = text.indexOf('```', codeStart + 3);
        const end = codeEnd === -1 ? len : codeEnd + 3;
        const block = text.slice(codeStart, end);
        // 判断是不是 JSON
        const inner = block.replace(/^```\w*\s*/, '').replace(/```\s*$/, '');
        segments.push({
            type: /^\s*[\[{]/.test(inner) ? 'json-code' : 'code',
            start: codeStart,
            end: end,
            content: block
        });
        i = end;
    }
    return segments;
}
window.highlightRawSegments = highlightRawSegments;

/* ============================================================
   83. 通用 JSON 片段提取：从任意文本里找所有 JSON 对象/数组
   用于：当用户从 AI 会话里复制一大段，混着说明和 JSON
   ============================================================ */
function extractAllJsonSnippets(raw) {
    const out = [];
    if (!raw) return out;
    const text = String(raw);
    let depth = 0;
    let startChar = -1;
    let startType = null;
    let inStr = false;
    let esc = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inStr) {
            if (esc) { esc = false; continue; }
            if (ch === '\\') { esc = true; continue; }
            if (ch === '"') { inStr = false; }
            continue;
        }
        if (ch === '"') { inStr = true; continue; }

        if (ch === '{' || ch === '[') {
            if (depth === 0) {
                startChar = i;
                startType = ch;
            }
            depth++;
        } else if (ch === '}' || ch === ']') {
            depth--;
            if (depth === 0 && startChar >= 0) {
                const slice = text.slice(startChar, i + 1);
                try {
                    const obj = JSON.parse(slice);
                    out.push({ raw: slice, parsed: obj, start: startChar, end: i + 1, kind: startType });
                } catch (e) { /* 忽略非法片段 */ }
                startChar = -1;
                startType = null;
            }
        }
    }
    return out;
}
window.extractAllJsonSnippets = extractAllJsonSnippets;

/* ============================================================
   84. 极简提示词：不塞整套契约，给 AI 一段紧凑说明 + few-shot
   适用于 DeepSeek 长对话/上下文紧张场景
   ============================================================ */
function buildMinimalPrompt(rawText) {
    if (!rawText) return '';
    const compact = (typeof buildCompactSystemPrompt === 'function') ? buildCompactSystemPrompt() : '';
    const trimmed = String(rawText).length > 4000 ? (String(rawText).slice(0, 4000) + '\n…') : rawText;
    return [
        compact,
        '',
        '---',
        '',
        '请对下面内容产出封面设计 spec：',
        '',
        trimmed,
        '',
        '只输出完整 JSON，不要解释。'
    ].join('\n');
}
window.buildMinimalPrompt = buildMinimalPrompt;

/* ============================================================
   85. 页深拷贝：从当前页生成一个新页（内容结构完全相同）
   用途：用户想保留 A 版本做变体对比，不用手动全选复制
   ============================================================ */
function duplicateCurrentPage(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const cur = state.getCurrentPage && state.getCurrentPage();
    if (!cur) return { ok: false, reason: '当前页不存在' };

    const newId = 'page-copy-' + Date.now();
    const copy = JSON.parse(JSON.stringify(cur));
    copy.id = newId;
    copy.title = (copy.title || '页') + ' 副本';
    // 图层 id 全部重新生成，groupId 全部清空（避免组关系跨页错乱）
    copy.layers = (copy.layers || []).map(l => {
        const clone = Object.assign({}, l);
        clone.id = (l.type || 'layer') + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        clone.groupId = null;
        clone.locked = false;
        return clone;
    });

    const insertAt = (options.insertAfterCurrent !== false)
        ? (state.pages.indexOf(cur) + 1)
        : state.pages.length;
    state.pages.splice(insertAt, 0, copy);
    state.currentPageId = newId;
    state.selectedLayerId = null;
    state.selectedLayerIds = [];
    state.editingLayerId = null;

    if (state.history && typeof state.history.record === 'function') state.history.record();
    if (typeof renderAll === 'function') renderAll();
    return { ok: true, newPageId: newId, pagesCount: state.pages.length };
}
window.duplicateCurrentPage = duplicateCurrentPage;

/* ============================================================
   86. A/B 就地比较：把两个 spec 同时预览，点一下选一个应用
   来源：当前画布 vs 某份历史/快照
   ============================================================ */
async function compareTwoSpecsAb(specA, specB, labelA, labelB) {
    if (!specA || !specB) return { ok: false, reason: 'spec 不完整' };
    const old = document.getElementById('ai-ab-modal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'ai-ab-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:99999;overflow-y:auto;padding:24px;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;color:#e1e4e8;';
    header.innerHTML = '<div style="font-size:16px;font-weight:600;">A/B 对比</div>';
    const btnClose = document.createElement('button');
    btnClose.className = 'btn';
    btnClose.textContent = '关闭';
    btnClose.addEventListener('click', () => modal.remove());
    header.appendChild(btnClose);
    modal.appendChild(header);

    const stage = document.createElement('div');
    stage.style.cssText = 'display:flex;gap:16px;justify-content:center;align-items:flex-start;flex-wrap:wrap;';

    const makeSide = (spec, label, side) => {
        const col = document.createElement('div');
        col.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:380px;';
        const lbl = document.createElement('div');
        lbl.style.cssText = 'color:#e1e4e8;font-weight:600;font-size:14px;text-align:center;';
        lbl.textContent = label;
        col.appendChild(lbl);

        const firstPage = (spec.pages || [])[0];
        if (!firstPage) { col.textContent = '（无页）'; return col; }

        const card = document.createElement('div');
        card.style.cssText = 'position:relative;width:360px;height:640px;background:#000;border-radius:8px;overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,0.6);';

        // ✅ 页面渲染统一走 buildSpecPageNode（背景 / 图层 / 特效 / 色块标签一份实现）
        card.appendChild(buildSpecPageNode(firstPage, {
            scale: 1,
            zIndex: 2,
            background: (window.state && state.background) || null
        }));
        col.appendChild(card);

        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        btn.style.cssText = 'justify-content:center;';
        btn.textContent = '应用 ' + label;
        btn.addEventListener('click', async () => {
            if (!confirm('确定应用「' + label + '」？（当前画布会被替换）')) return;
            modal.remove();
            const chosen = side === 'A' ? specA : specB;
            const r = await applyCoverSpec(chosen, { dryRun: false, append: false });
            if (r.applied) {
                if (typeof showBgToast === 'function') showBgToast('已应用：' + label);
            }
        });
        col.appendChild(btn);
        return col;
    };

    stage.appendChild(makeSide(specA, labelA || 'A', 'A'));
    stage.appendChild(makeSide(specB, labelB || 'B', 'B'));
    modal.appendChild(stage);
    document.body.appendChild(modal);
    return { ok: true };
}
window.compareTwoSpecsAb = compareTwoSpecsAb;

/* ============================================================
   87. 依赖自检：缺失关键依赖时给出可读提示
   ============================================================ */
/* ============================================================
   86b. 品牌约束文本（单一真源）
   ------------------------------------------------------------
   提示词里的品牌色 / 背景 / 特效清单必须从 BrandManager 实时派生，
   不能再写死某个品牌的色值：换品牌时提示词要跟着变，否则 AI 永远
   在按旧品牌输出，然后被校验器判违规。
   ============================================================ */
function getBrandTextAndBg() {
    const out = { text: '#111111', bgPresetId: null, bgColor1: null, colors: [], bgIds: [] };
    try {
        const bm = window.BrandManager;
        if (!bm) return out;
        out.colors = (bm.getActiveColors && bm.getActiveColors()) || [];
        out.bgIds = (bm.getActiveBgPresetIds && bm.getActiveBgPresetIds()) || [];
        const bgs = (bm.getActiveBgPresets && bm.getActiveBgPresets()) || [];
        out.bgPresetId = out.bgIds[0] || null;
        out.bgColor1 = (bgs[0] && bgs[0].color1) || null;
        if (out.colors.length) {
            // 选与背景对比度最高的品牌色做正文色（浅底深字 / 深底浅字都成立）
            let best = out.colors[0], bestRatio = -1;
            out.colors.forEach(c => {
                let r = 1;
                try {
                    if (out.bgColor1 && window.Utils && Utils.color) {
                        r = Utils.color.contrastRatio(c, out.bgColor1);
                    }
                } catch (e) {}
                if (r > bestRatio) { bestRatio = r; best = c; }
            });
            out.text = best;
        }
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 读取品牌约束失败', e);
    }
    return out;
}
window.getBrandTextAndBg = getBrandTextAndBg;

/** 生成"硬约束"那一段提示词文本（动态，不写死品牌值） */
function brandConstraintText() {
    const b = getBrandTextAndBg();
    const parts = [];
    if (b.bgIds.length) {
        parts.push('bg.presetId 只能是 ' + b.bgIds.join(' / '));
    } else {
        parts.push('bg 必须给出可渲染的 presetId 或 color1');
    }
    if (b.colors.length) {
        parts.push('layer.color 与 layer.bgColor 只能是 [' + b.colors.join(', ') + '] 或 transparent');
    }
    parts.push('effectClass 必须是当前特效库里真实存在的 id（拿不准就留 null，不要发明）');
    return parts.join('；');
}
window.brandConstraintText = brandConstraintText;

function checkAiSpecDependencies() {
    const missing = [];
    // 必需依赖：缺了会直接影响 AI 方案应用
    const required = [
        ['state', !!window.state],
        ['normalizeBackground', typeof normalizeBackground === 'function'],
        ['applyBackgroundToCanvases', typeof applyBackgroundToCanvases === 'function'],
        ['renderAll', typeof renderAll === 'function'],
        ['getAllEffectsMaster', typeof getAllEffectsMaster === 'function'],
        ['renderEffectCss', typeof renderEffectCss === 'function'],
        ['BG_PRESETS', Array.isArray(window.BG_PRESETS)],
        ['BACKDROP_PRESETS', typeof BACKDROP_PRESETS !== 'undefined'],
        ['backgroundToCss', typeof backgroundToCss === 'function']
    ];
    // 可选依赖：缺了走 ai-spec.js 内置兜底，不算故障
    //   _normalizeTemplateLayer：cover-templates.js 已移除，normalizeSpecLayer 内部有等价实现
    const optional = [
        ['_normalizeTemplateLayer', typeof _normalizeTemplateLayer === 'function']
    ];
    const optionalMissing = [];
    required.forEach(([name, ok]) => { if (!ok) missing.push(name); });
    optional.forEach(([name, ok]) => { if (!ok) optionalMissing.push(name); });
    return { ok: missing.length === 0, missing, optionalMissing };
}
window.checkAiSpecDependencies = checkAiSpecDependencies;

/* ============================================================
   88. AI 输出调试快照
   当某次 AI 输出解析失败/结果诡异时，用户可保存这份原始数据，
   供事后检查或反馈
   ============================================================ */
const AI_DEBUG_KEY = 'douyin_ai_debug_last_v1';

function saveDebugSnapshot(rawInput, extra) {
    if (!rawInput) return;
    // 同步进失败归档
    try {
        if (typeof pushFailedAiOutput === 'function') {
            pushFailedAiOutput({
                raw: rawInput,
                error: extra && extra.error ? extra.error : '',
                shape: extra && extra.shape ? extra.shape : null
            });
        }
    } catch (e) {}
    try {
        let clean = '';
        try { if (typeof sanitizeRawInput === 'function') clean = sanitizeRawInput(rawInput); } catch (e) {}
        let candidates = 0;
        try { if (typeof extractAllJsonSnippets === 'function') candidates = extractAllJsonSnippets(rawInput).length; } catch (e) {}
        let diag = {};
        try { if (typeof diagnoseRawInput === 'function') diag = diagnoseRawInput(rawInput); } catch (e) {}
        const snap = {
            at: Date.now(),
            rawLength: String(rawInput).length,
            raw: String(rawInput).slice(0, 20000),
            cleanLength: clean.length,
            candidates,
            diag,
            extra: extra || null
        };
        localStorage.setItem(AI_DEBUG_KEY, JSON.stringify(snap));
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 保存调试快照失败', e);
    }
}
window.saveDebugSnapshot = saveDebugSnapshot;

function getDebugSnapshot() {
    try { return JSON.parse(localStorage.getItem(AI_DEBUG_KEY) || 'null'); } catch (e) { return null; }
}
window.getDebugSnapshot = getDebugSnapshot;

/* ============================================================
   89. 统一模板市场：把内置 COVER_TEMPLATES 与用户自建模板统一成一套可套用列表
   ============================================================ */
function listAllTemplates() {
    const list = [];
    try {
        if (window.CoverTemplates && Array.isArray(window.CoverTemplates.list)) {
            window.CoverTemplates.list.forEach(t => {
                list.push({ id: t.id, name: t.name, source: 'builtin', tpl: t });
            });
        }
    } catch (e) {}
    try {
        if (typeof getUserTemplates === 'function') {
            getUserTemplates().forEach(t => {
                list.push({ id: t.id, name: t.name, source: 'user', tpl: t });
            });
        }
    } catch (e) {}
    return list;
}
window.listAllTemplates = listAllTemplates;

function applyAnyTemplate(tplId) {
    const all = listAllTemplates();
    const t = all.find(x => x.id === tplId);
    if (!t) return { ok: false, reason: '模板不存在' };
    try {
        if (typeof applyCoverTemplate === 'function') {
            applyCoverTemplate(t.tpl);
            return { ok: true, name: t.name };
        }
    } catch (e) {
        return { ok: false, reason: e.message };
    }
    return { ok: false, reason: 'applyCoverTemplate 不可用' };
}
window.applyAnyTemplate = applyAnyTemplate;

/* ============================================================
   90. 标题规范化：把 AI 生成的标题统一到干净格式
   ============================================================ */
function normalizeTitleText(title) {
    if (!title) return '';
    let t = String(title).trim();
    // 中文全角标点
    t = t.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'");
    // 去首尾多余空格/换行
    t = t.replace(/^\s+|\s+$/g, '');
    // 内部多空行压缩
    t = t.replace(/\n{3,}/g, '\n\n');
    // 首行不加标点
    const lines = t.split('\n');
    if (lines[0]) {
        lines[0] = lines[0].replace(/[。，,；;]+$/, '');
    }
    // 句尾问号/感叹号统一为中文
    t = lines.join('\n').replace(/\?$/g, '？').replace(/!$/g, '！');
    return t;
}
window.normalizeTitleText = normalizeTitleText;

function normalizeAllTitlesInSpec(spec) {
    if (!spec || !Array.isArray(spec.pages)) return { ok: false, reason: 'spec 无效' };
    if (Array.isArray(spec.titleCandidates)) {
        spec.titleCandidates = spec.titleCandidates.map(normalizeTitleText);
    }
    let count = 0;
    spec.pages.forEach(p => {
        (p.layers || []).forEach(l => {
            if (l && l.type === 'text' && l.content) {
                const norm = normalizeTitleText(l.content);
                if (norm !== l.content) {
                    l.content = norm;
                    count++;
                }
            }
        });
    });
    return { ok: true, changed: count };
}
window.normalizeAllTitlesInSpec = normalizeAllTitlesInSpec;

/* ============================================================
   91. 首次使用引导：只弹一次
   ============================================================ */
const AI_ONBOARDING_KEY = 'douyin_ai_onboarding_seen_v1';

function hasSeenAiOnboarding() {
    try { return localStorage.getItem(AI_ONBOARDING_KEY) === '1'; } catch (e) { return false; }
}
window.hasSeenAiOnboarding = hasSeenAiOnboarding;

function markAiOnboardingSeen() {
    try { localStorage.setItem(AI_ONBOARDING_KEY, '1'); } catch (e) {}
}
window.markAiOnboardingSeen = markAiOnboardingSeen;

/* ============================================================
   92. AI 会话完整状态保存/恢复
   用于：用户刷新、切页、换标签时，回到 AI 面板可无缝继续
   ============================================================ */
const AI_SESSION_FULL_KEY = 'douyin_ai_session_full_v1';

function saveAiSessionState(stateObj) {
    if (!stateObj) return;
    try {
        const data = {
            at: Date.now(),
            specInput: stateObj.specInput || '',
            chunkInput: stateObj.chunkInput || '',
            appendMode: !!stateObj.appendMode,
            autoExport: stateObj.autoExport || 'none',
            strictMode: !!stateObj.strictMode,
            autoDecorate: stateObj.autoDecorate !== false,
            styleId: stateObj.styleId || '',
            promptPreset: stateObj.promptPreset || ''
        };
        localStorage.setItem(AI_SESSION_FULL_KEY, JSON.stringify(data));
    } catch (e) {
        if (window.Utils && Utils.log) Utils.log.warn('[AiSpec] 保存完整会话状态失败', e);
    }
}
window.saveAiSessionState = saveAiSessionState;

function loadAiSessionState() {
    try { return JSON.parse(localStorage.getItem(AI_SESSION_FULL_KEY) || 'null'); } catch (e) { return null; }
}
window.loadAiSessionState = loadAiSessionState;

/* ============================================================
   93. 快捷指令表：所有可用的 AI 面板动作清单
   ============================================================ */
function listAiQuickActions() {
    return [
        { group: 'AI 入口', items: [
            { label: '一键生成提示词', hint: '原文 + 契约拼好复制到剪贴板，并打开 DeepSeek' },
            { label: '复制契约 / 简洁契约', hint: '只复制契约（不含原文），手动拼提示词' },
            { label: '打开 DeepSeek', hint: '独立窗口弹出 DeepSeek 网页，免费账号可登录' }
        ]},
        { group: '离线兜底（不依赖 AI）', items: [
            { label: '离线全自动', hint: '原文 → 生成多页封面 → 应用（可选导出）' },
            { label: '离线一键美化', hint: '当前页：标题增强 + 重配色 + 拆长文 + 缩字' },
            { label: '批量美化全部页', hint: '项目所有页跑一遍离线美化' },
            { label: '兜底生成 / 一键生成并应用', hint: '按分块规则生成一份 spec 到输入框或直接应用' },
            { label: '组合对比', hint: '生成 3 套视觉组合，预览后选一个应用' }
        ]},
        { group: '校验与修复', items: [
            { label: '校验 / 自动修复', hint: '检查 spec 合法性，修复可自动修复的问题' },
            { label: '严格校验', hint: 'warning 也视为错误（品牌一致性强约束）' },
            { label: '自检 / 自测', hint: '应用前跑一遍体检 / 内置 3 用例回归测试' },
            { label: '生成修稿提示', hint: '把当前问题整理成 AI 可读的修稿指令，粘回 DeepSeek 继续迭代' }
        ]},
        { group: '应用到画布', items: [
            { label: '预览 / 应用 / 追加模式', hint: '预览、覆盖、追加' },
            { label: '页级补丁', hint: '把 AI 单页输出替换到画布指定页' },
            { label: '撤销应用', hint: '回到应用前状态' },
            { label: '自动缩字 / 拆分长文', hint: '应用后微调' }
        ]},
        { group: '历史与回看', items: [
            { label: '迭代会话', hint: '查看每次 AI 往返的质量分，可回退到任意轮' },
            { label: 'AI 历史 / 历史排行', hint: '带缩略图的历史方案，按质量排序' },
            { label: '画布快照', hint: '每次应用前自动创建，可恢复 / A-B 对比' },
            { label: '应用日志', hint: '每次应用的时间线' },
            { label: '调试快照', hint: '最近一次解析失败的原始数据' }
        ]},
        { group: '导出', items: [
            { label: '导出长图', hint: '所有页拼成一张长图' },
            { label: '分享包', hint: 'spec.json + 每页 PNG，多文件下载' },
            { label: '导出备份 / 导入备份', hint: '完整备份：spec + 缩略图 + 元数据（单 JSON）' },
            { label: '导出当前画布为 spec / few-shot', hint: '把画布导出为 spec，或去掉坐标的 few-shot 模板' }
        ]},
        { group: '模板与复用', items: [
            { label: '存为模板 / 我的模板', hint: '把当前第 1 页存为可复用模板' },
            { label: '模板市场', hint: '内置 + 自建模板统一列表' },
            { label: '复制当前页', hint: '快速生成变体对比' }
        ]},
        { group: '项目体检与清理', items: [
            { label: '项目体检', hint: '页数 / 图层 / 特效 / 资产 / 连贯性 / 质量分' },
            { label: '排版体检', hint: '行距 / 字号 / 留白 / 安全区' },
            { label: '清空空页', hint: '删除没有图层的空白页' },
            { label: '项目摘要', hint: '生成可复制的文字摘要' },
            { label: '项目重制', hint: '把整个项目离线重排一遍' }
        ]}
    ];
}
window.listAiQuickActions = listAiQuickActions;

/* ============================================================
   94. 意图对齐校验：AI 是否照着用户要求做了
   用途：用户提出过“要 5 页 / 封面标题要短 / 要包含关键词”等，这里核对
   ============================================================ */
function checkIntentAlignment(spec, intents) {
    const results = [];
    if (!spec || !Array.isArray(spec.pages)) return { ok: false, results };
    intents = intents || {};

    // 1. 页数
    if (intents.pageCountMin != null || intents.pageCountMax != null) {
        const pc = spec.pages.length;
        const ok = (intents.pageCountMin == null || pc >= intents.pageCountMin)
            && (intents.pageCountMax == null || pc <= intents.pageCountMax);
        results.push({
            name: '页数范围',
            ok,
            actual: pc + ' 页',
            expected: (intents.pageCountMin || 0) + '~' + (intents.pageCountMax || '∞')
        });
    }

    // 2. 封面标题必须较短
    if (intents.coverTitleMaxLength != null) {
        const firstPage = spec.pages[0];
        const firstText = firstPage && (firstPage.layers || []).find(l => l && l.type === 'text');
        const title = firstText ? String(firstText.content || '').replace(/<[^>]*>/g, '') : '';
        const ok = title.length <= intents.coverTitleMaxLength && title.length > 0;
        results.push({
            name: '封面标题长度',
            ok,
            actual: title.length + ' 字',
            expected: '≤' + intents.coverTitleMaxLength
        });
    }

    // 3. 关键词覆盖
    if (Array.isArray(intents.requireKeywords) && intents.requireKeywords.length) {
        const allText = spec.pages.map(p => (p.layers || []).filter(l => l && l.type === 'text').map(l => String(l.content || '')).join(' ')).join(' ');
        intents.requireKeywords.forEach(kw => {
            results.push({
                name: '关键词「' + kw + '」',
                ok: allText.includes(kw),
                actual: allText.includes(kw) ? '包含' : '缺失',
                expected: '必须包含'
            });
        });
    }

    // 4. 指定特效
    if (Array.isArray(intents.requireEffects) && intents.requireEffects.length) {
        const usedEffects = new Set();
        spec.pages.forEach(p => (p.layers || []).forEach(l => { if (l && l.effectClass) usedEffects.add(l.effectClass); }));
        intents.requireEffects.forEach(fx => {
            results.push({
                name: '特效「' + fx + '」',
                ok: usedEffects.has(fx),
                actual: usedEffects.has(fx) ? '使用' : '未使用',
                expected: '必须使用'
            });
        });
    }

    return { ok: results.every(r => r.ok), results };
}
window.checkIntentAlignment = checkIntentAlignment;

/* ============================================================
   95. 意图预设：从用户原文/画布上下文自动提取期望
   ============================================================ */
function getDefaultIntents() {
    return {
        pageCountMin: 1,
        pageCountMax: 15,
        coverTitleMaxLength: 20,
        requireKeywords: [],
        requireEffects: []
    };
}
window.getDefaultIntents = getDefaultIntents;

function buildIntentFromText(rawText) {
    const intents = getDefaultIntents();
    const t = String(rawText || '');

    // 从文本里找“X页 / X张”
    const pageMatch = t.match(/(\d+)\s*[页张]/);
    if (pageMatch) {
        const n = parseInt(pageMatch[1], 10);
        if (n > 0 && n <= 20) {
            intents.pageCountMin = Math.max(1, Math.floor(n * 0.7));
            intents.pageCountMax = Math.ceil(n * 1.5);
        }
    }

    // 从文本里找“标题不超过 X 字”
    const titleMatch = t.match(/标题.{0,4}(\d+)\s*字/);
    if (titleMatch) {
        const n = parseInt(titleMatch[1], 10);
        if (n > 4 && n <= 40) intents.coverTitleMaxLength = n;
    }

    return intents;
}
window.buildIntentFromText = buildIntentFromText;

/* ============================================================
   96. 会话归档：把一次 AI 往返的原文 + 输出 + 结果打包存档
   与迭代会话区别：迭代会话记“轮次”，会话归档记“项目/任务”
   ============================================================ */
const AI_ARCHIVE_KEY = 'douyin_ai_archives_v1';
const AI_ARCHIVE_MAX = 20;

function archiveAiSession(entry) {
    if (!entry) return { ok: false, reason: '无数据' };
    try {
        let list = [];
        try { list = JSON.parse(localStorage.getItem(AI_ARCHIVE_KEY) || '[]'); } catch (e) { list = []; }
        if (!Array.isArray(list)) list = [];
        const item = {
            id: 'archive-' + Date.now(),
            at: Date.now(),
            label: entry.label || ('会话 ' + new Date().toLocaleString()),
            rawText: entry.rawText || '',
            rawOutput: entry.rawOutput || '',
            spec: entry.spec || null,
            quality: entry.quality || 0,
            meta: entry.meta || null
        };
        list.unshift(item);
        if (list.length > AI_ARCHIVE_MAX) list = list.slice(0, AI_ARCHIVE_MAX);
        localStorage.setItem(AI_ARCHIVE_KEY, JSON.stringify(list));
        return { ok: true, item };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
}
window.archiveAiSession = archiveAiSession;

function getArchivedSessions() {
    try {
        const list = JSON.parse(localStorage.getItem(AI_ARCHIVE_KEY) || '[]');
        return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
}
window.getArchivedSessions = getArchivedSessions;

function removeArchivedSession(id) {
    try {
        let list = getArchivedSessions().filter(x => x.id !== id);
        localStorage.setItem(AI_ARCHIVE_KEY, JSON.stringify(list));
        return { ok: true };
    } catch (e) { return { ok: false, reason: e.message }; }
}
window.removeArchivedSession = removeArchivedSession;

function clearArchivedSessions() {
    try { localStorage.removeItem(AI_ARCHIVE_KEY); } catch (e) {}
}
window.clearArchivedSessions = clearArchivedSessions;

/* ============================================================
   97. 项目完整打包（全项目级）：pages + background + AI 历史 + 模板 + 品牌
   ============================================================ */
async function exportFullProjectPack(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const pack = {
        format: 'douyin-full-pack',
        version: 1,
        createdAt: new Date().toISOString(),
        meta: {
            name: options.name || ('项目全备份_' + Date.now()),
            pages: (state.pages || []).length,
            source: 'douyin-cover-designer'
        },
        project: {
            background: JSON.parse(JSON.stringify(state.background || {})),
            pages: JSON.parse(JSON.stringify(state.pages || [])),
            currentPageId: state.currentPageId,
            guides: JSON.parse(JSON.stringify(state.guides || [])),
            snapEnabled: state.snapEnabled !== false
        },
        ai: {
            history: (typeof getAiHistory === 'function') ? getAiHistory() : [],
            snapshots: (typeof getSnapshots === 'function') ? getSnapshots() : [],
            userTemplates: (typeof getUserTemplates === 'function') ? getUserTemplates() : [],
            archives: (typeof getArchivedSessions === 'function') ? getArchivedSessions() : []
        },
        brand: (window.BrandManager && BrandManager.data) ? JSON.parse(JSON.stringify(BrandManager.data)) : null
    };

    try {
        const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = pack.meta.name + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return { ok: true, filename: pack.meta.name + '.json', size: pack.meta.pages };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
}
window.exportFullProjectPack = exportFullProjectPack;

/* 导入项目全包：会询问“合并 / 覆盖” */
async function importFullProjectPack(file, options) {
    if (!file) return { ok: false, reason: '无文件' };
    options = options || {};
    const text = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = (e) => res(e.target.result || '');
        reader.onerror = () => rej(new Error('读取失败'));
        reader.readAsText(file, 'utf-8');
    });
    let pack;
    try { pack = JSON.parse(text); } catch (e) { return { ok: false, reason: '解析失败：' + e.message }; }
    if (!pack || pack.format !== 'douyin-full-pack') return { ok: false, reason: '不是 douyin-full-pack' };

    const mode = options.mode || 'replace';

    // 项目覆盖/合并
    try {
        if (pack.project) {
            const before = {
                pages: JSON.parse(JSON.stringify(state.pages || [])),
                currentPageId: state.currentPageId,
                background: state.background ? JSON.parse(JSON.stringify(state.background)) : null
            };
            try { window.__aiSpecBackup = { appliedAt: Date.now(), ...before, pages: before.pages, currentPageId: before.currentPageId, background: before.background }; } catch (e) {}

            if (mode === 'replace') {
                state.pages = JSON.parse(JSON.stringify(pack.project.pages || []));
                state.currentPageId = pack.project.currentPageId || (state.pages[0] && state.pages[0].id);
            } else {
                // merge：追加页到末尾
                const incoming = JSON.parse(JSON.stringify(pack.project.pages || []));
                state.pages = (state.pages || []).concat(incoming);
            }
            if (pack.project.background && typeof normalizeBackground === 'function') {
                state.background = normalizeBackground(pack.project.background);
            }
            state.guides = JSON.parse(JSON.stringify(pack.project.guides || []));
            state.snapEnabled = pack.project.snapEnabled !== false;
            state.selectedLayerId = null;
            state.selectedLayerIds = [];
            state.editingLayerId = null;
        }
    } catch (e) {
        return { ok: false, reason: '项目恢复失败：' + e.message };
    }

    // AI 数据（合并模式则去重后 push）
    try {
        if (pack.ai) {
            if (Array.isArray(pack.ai.history) && typeof getAiHistory === 'function') {
                let list = getAiHistory();
                pack.ai.history.forEach(h => {
                    if (!list.some(x => x.savedAt === h.savedAt && x.label === h.label)) list.push(h);
                });
                try { localStorage.setItem('douyin_ai_spec_history_v1', JSON.stringify(list.slice(0, 10))); } catch (e) {}
            }
            if (Array.isArray(pack.ai.snapshots) && typeof getSnapshots === 'function') {
                let list = getSnapshots();
                pack.ai.snapshots.forEach(s => { if (!list.some(x => x.id === s.id)) list.push(s); });
                try { localStorage.setItem('douyin_ai_snapshots_v1', JSON.stringify(list.slice(0, 10))); } catch (e) {}
            }
            if (Array.isArray(pack.ai.userTemplates) && typeof getUserTemplates === 'function') {
                let list = getUserTemplates();
                pack.ai.userTemplates.forEach(t => { if (!list.some(x => x.id === t.id)) list.push(t); });
                try { localStorage.setItem('douyin_user_templates_v1', JSON.stringify(list.slice(0, 20))); } catch (e) {}
            }
            if (Array.isArray(pack.ai.archives)) {
                let list = (typeof getArchivedSessions === 'function') ? getArchivedSessions() : [];
                pack.ai.archives.forEach(a => { if (!list.some(x => x.id === a.id)) list.push(a); });
                try { localStorage.setItem('douyin_ai_archives_v1', JSON.stringify(list.slice(0, 20))); } catch (e) {}
            }
        }
    } catch (e) {}

    // 品牌数据
    try {
        if (pack.brand && window.BrandManager && typeof BrandManager.save === 'function') {
            BrandManager.data = Object.assign({}, BrandManager.data, pack.brand);
            BrandManager.save();
            if (typeof BrandManager.render === 'function') BrandManager.render();
        }
    } catch (e) {}

    if (state.history && typeof state.history.record === 'function') state.history.record();
    if (typeof applyBackgroundToCanvases === 'function') applyBackgroundToCanvases(state.background);
    if (typeof renderAll === 'function') renderAll();
    return { ok: true, pages: (state.pages || []).length, mode };
}
window.importFullProjectPack = importFullProjectPack;

/* ============================================================
   98. AI 面板 UI 状态记忆：展开/滚动位置
   ============================================================ */
const AI_PANEL_UI_KEY = 'douyin_ai_panel_ui_v1';

function saveAiPanelUIState(uiState) {
    if (!uiState) return;
    try { localStorage.setItem(AI_PANEL_UI_KEY, JSON.stringify(uiState)); } catch (e) {}
}
window.saveAiPanelUIState = saveAiPanelUIState;

function loadAiPanelUIState() {
    try { return JSON.parse(localStorage.getItem(AI_PANEL_UI_KEY) || 'null'); } catch (e) { return null; }
}
window.loadAiPanelUIState = loadAiPanelUIState;

/* ============================================================
   99. AI 承诺追踪：把用户从原文里提到的期望和最终页数对齐
   简单用法：从原文提取“X 页/张” 之类，记录一个 expected，应用后检查
   ============================================================ */
function extractPromisesFromText(rawText) {
    const promises = {};
    const t = String(rawText || '');
    const pageMatch = t.match(/(\d+)\s*[页张图]/);
    if (pageMatch) promises.expectedPages = parseInt(pageMatch[1], 10);
    const wordMatch = t.match(/(\d+)\s*字以内/);
    if (wordMatch) promises.expectedTitleMax = parseInt(wordMatch[1], 10);
    return promises;
}
window.extractPromisesFromText = extractPromisesFromText;

function comparePromiseToResult(promises, resultSpec) {
    const out = [];
    if (!promises) return out;
    if (promises.expectedPages != null) {
        const actual = (resultSpec && resultSpec.pages || []).length;
        out.push({
            name: '承诺页数',
            expected: promises.expectedPages,
            actual,
            ok: Math.abs(actual - promises.expectedPages) <= Math.max(1, Math.round(promises.expectedPages * 0.2))
        });
    }
    if (promises.expectedTitleMax != null) {
        const firstText = resultSpec && resultSpec.pages && resultSpec.pages[0]
            ? ((resultSpec.pages[0].layers || []).find(l => l && l.type === 'text') || {}).content
            : '';
        const len = String(firstText || '').replace(/<[^>]*>/g, '').length;
        out.push({
            name: '承诺标题长度',
            expected: promises.expectedTitleMax,
            actual: len,
            ok: len <= promises.expectedTitleMax
        });
    }
    return out;
}
window.comparePromiseToResult = comparePromiseToResult;

/* ============================================================
   100. 跨设备同步码
   把关键 AI 状态（上次风格、历史 spec 摘要、模板 ID 等）
   编码成一段较短文本，用户可贴到笔记/密码管理器里，换设备恢复
   ============================================================ */
function encodeSyncCode() {
    try {
        const payload = {
            v: 1,
            at: Date.now(),
            lastStyle: (function () {
                try {
                    const raw = localStorage.getItem('douyin_ai_last_style_v1');
                    return raw || null;
                } catch (e) { return null; }
            })(),
            // 只摘取必要字段，避免过长
            history: (typeof getAiHistory === 'function' ? getAiHistory().slice(0, 3).map(h => ({
                savedAt: h.savedAt,
                label: h.label,
                quality: h.quality,
                spec: h.spec
            })) : []),
            templates: (typeof getUserTemplates === 'function' ? getUserTemplates().slice(0, 3).map(t => ({
                id: t.id,
                name: t.name,
                bg: t.bg,
                layers: t.layers,
                createdAt: t.createdAt
            })) : [])
        };
        const json = JSON.stringify(payload);
        // 简单 base64（utf-8 兼容）
        const b64 = btoa(unescape(encodeURIComponent(json)));
        // 分段，便于贴到手机上
        return b64.match(/.{1,120}/g).join('\n');
    } catch (e) {
        return '';
    }
}
window.encodeSyncCode = encodeSyncCode;

function decodeSyncCode(text) {
    if (!text) return { ok: false, reason: '空' };
    try {
        const cleaned = String(text).replace(/\s+/g, '');
        const json = decodeURIComponent(escape(atob(cleaned)));
        const obj = JSON.parse(json);
        if (!obj || obj.v !== 1) return { ok: false, reason: '版本不匹配' };
        return { ok: true, payload: obj };
    } catch (e) {
        return { ok: false, reason: '解析失败：' + e.message };
    }
}
window.decodeSyncCode = decodeSyncCode;

function applySyncCode(code) {
    const dec = decodeSyncCode(code);
    if (!dec.ok) return dec;
    const p = dec.payload;
    try {
        if (p.lastStyle) {
            try { localStorage.setItem('douyin_ai_last_style_v1', p.lastStyle); } catch (e) {}
        }
        if (Array.isArray(p.history) && p.history.length) {
            let list = (typeof getAiHistory === 'function' ? getAiHistory() : []);
            p.history.forEach(h => {
                if (!list.some(x => x.savedAt === h.savedAt && x.label === h.label)) list.unshift(h);
            });
            try { localStorage.setItem('douyin_ai_spec_history_v1', JSON.stringify(list.slice(0, 10))); } catch (e) {}
        }
        if (Array.isArray(p.templates) && p.templates.length) {
            let list = (typeof getUserTemplates === 'function' ? getUserTemplates() : []);
            p.templates.forEach(t => {
                if (!list.some(x => x.id === t.id)) list.unshift(t);
            });
            try { localStorage.setItem('douyin_user_templates_v1', JSON.stringify(list.slice(0, 20))); } catch (e) {}
        }
        return { ok: true, history: (p.history || []).length, templates: (p.templates || []).length };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
}
window.applySyncCode = applySyncCode;

/* ============================================================
   101. 极速粘贴一体化
   一次函数调用完成：剪贴板 → 诊断 → 修复 → 应用 → （可选）导出
   供 UI 的“从剪贴板全自动”使用；也供高级用户从 console 调
   ============================================================ */
async function ultraQuickPaste(options) {
    options = options || {};
    if (!navigator.clipboard || !navigator.clipboard.readText) {
        return { ok: false, reason: '浏览器不支持剪贴板读取' };
    }
    let raw = '';
    try { raw = await navigator.clipboard.readText(); } catch (e) {
        return { ok: false, reason: '剪贴板读取被拒绝' };
    }
    if (!raw || !raw.trim()) return { ok: false, reason: '剪贴板为空' };

    const steps = [];
    steps.push('读入 ' + raw.length + ' 字符');

    // 诊断
    let diag = null;
    try { if (typeof diagnoseRawInput === 'function') { diag = diagnoseRawInput(raw); steps.push('候选 ' + (diag.candidatesCount || 0) + ' 份'); } } catch (e) {}

    // 应用
    const appendCb = document.getElementById('ai-append-mode');
    const append = !!(appendCb && appendCb.checked);
    const decCb = document.getElementById('ai-auto-decorate');
    const autoDecorate = !(decCb && !decCb.checked);
    const expSel = document.getElementById('ai-auto-export');
    const autoExport = expSel ? expSel.value : 'none';

    const r = await autoApplyFromAiOutput(raw, { append, autoExport, autoDecorate });
    if (r.ok) steps.push('应用成功（' + (r.candidateCount || 1) + ' 候选 → 应用质量 ' + r.quality + '）');
    else steps.push('应用失败：' + (r.reason || ''));

    return {
        ok: r.ok,
        steps,
        rawLength: raw.length,
        result: r,
        diag
    };
}
window.ultraQuickPaste = ultraQuickPaste;

/* ============================================================
   102. AI 面板自检：综合当前面板数据给出一个分数和问题清单
   ============================================================ */
function aiPanelHealthCheck() {
    const items = [];
    const checks = [];
    const add = (name, ok, hint) => {
        checks.push({ name, ok, hint: hint || '' });
        items.push(ok ? 1 : 0);
    };

    // 依赖
    try {
        if (typeof checkAiSpecDependencies === 'function') {
            const d = checkAiSpecDependencies();
            add('依赖齐备', d.ok, d.ok ? '' : ('缺失：' + d.missing.join(', ')));
        }
    } catch (e) { add('依赖齐备', false); }

    // 历史
    let histLen = 0;
    try { histLen = (getAiHistory() || []).length; } catch (e) {}
    add('历史方案', histLen > 0, histLen ? (histLen + ' 条历史') : '暂无历史（应用后自动保存）');

    // 模板
    let tplLen = 0;
    try { tplLen = (getUserTemplates() || []).length; } catch (e) {}
    add('自建模板', tplLen > 0, tplLen ? (tplLen + ' 个') : '尚未保存模板');

    // 快照
    let snapLen = 0;
    try { snapLen = (getSnapshots() || []).length; } catch (e) {}
    add('画布快照', snapLen > 0, snapLen ? (snapLen + ' 份') : '尚未生成快照');

    // 上次风格
    let hasStyle = false;
    try { hasStyle = !!getLastStyle(); } catch (e) {}
    add('风格记忆', hasStyle, hasStyle ? '下次生成会保持风格' : '首次应用后自动记忆');

    // 草稿
    let hasDraft = false;
    try { const d = loadSpecDraft(); hasDraft = !!(d && d.spec); } catch (e) {}
    add('草稿保存', hasDraft, hasDraft ? '上次未应用的内容已保存' : '无未应用草稿');

    const total = checks.length;
    const passed = checks.filter(c => c.ok).length;
    const score = total > 0 ? Math.round((passed / total) * 100) : 0;
    return { ok: score >= 60, score, checks };
}
window.aiPanelHealthCheck = aiPanelHealthCheck;

/* ============================================================
   103. 无网络极速通道：完全不依赖 AI / 网络，直接出可用封面
   ============================================================ */
async function quickNoAiToCover(options) {
    options = options || {};
    const chunkTa = document.getElementById('ai-chunk-input');
    const raw = chunkTa ? (chunkTa.value || '').trim() : '';
    if (!raw) return { ok: false, reason: '请先在「原文分块」里粘贴原文' };
    const appendCb = document.getElementById('ai-append-mode');
    const append = !!(appendCb && appendCb.checked);
    const expSel = document.getElementById('ai-auto-export');
    const autoExport = expSel ? expSel.value : 'none';
    const styleSel = document.getElementById('ai-style-select');
    const forceStyleId = styleSel ? (styleSel.value || null) : null;

    if (typeof autoFromRawToCover !== 'function') return { ok: false, reason: 'autoFromRawToCover 未就绪' };
    const r = await autoFromRawToCover(raw, { append, autoExport, forceStyleId });
    return r;
}
window.quickNoAiToCover = quickNoAiToCover;

/* ============================================================
   104. 全自动单命令（给高级用户用）
   用法：在浏览器 console 里直接
     await AiSpec.fullAuto('原文内容', { export: 'all' })
   不依赖 UI，也便于做批量脚本
   ============================================================ */
if (!window.AiSpec) window.AiSpec = {};
AiSpec.fullAuto = async function (rawText, options) {
    options = options || {};
    if (!rawText) return { ok: false, reason: '无原文' };

    const steps = [];
    steps.push('原文 ' + String(rawText).length + ' 字符');

    // 先试离线兜底生成（最稳）
    let useAiOutput = !!options.preferAi;
    let result = null;

    if (useAiOutput && typeof autoApplyFromAiOutput === 'function') {
        result = await autoApplyFromAiOutput(rawText, options);
        steps.push('AI 通道：' + (result.ok ? '成功' : ('失败 ' + result.reason)));
    }

    if (!result || !result.ok) {
        // 离线
        if (typeof autoFromRawToCover === 'function') {
            result = await autoFromRawToCover(rawText, {
                append: !!options.append,
                autoExport: options.export || 'none',
                forceStyleId: options.styleId || null
            });
            steps.push('离线通道：' + (result.ok ? '成功' : ('失败 ' + result.reason)));
        }
    }

    if (!result || !result.ok) return { ok: false, reason: result ? result.reason : '所有通道失败', steps };

    return { ok: true, steps, result };
};

AiSpec.diagnose = function (rawText) {
    if (typeof diagnoseRawInput === 'function') return diagnoseRawInput(rawText);
    return { likelyError: 'diagnoseRawInput 不可用' };
};

AiSpec.quality = function (spec) {
    if (typeof scoreSpecQuality === 'function') return scoreSpecQuality(spec);
    return { total: 0 };
};

/* ============================================================
   105. AI 深度调试报告：完整展示处理链路的每一步中间产物
   ============================================================ */
function buildDeepDebugReport(rawText) {
    const r = { rawLength: (rawText || '').length, steps: [] };
    if (!rawText) { r.steps.push({ name: '空输入' }); return r; }

    // 1. 原文片段
    r.steps.push({ name: '原文片段', value: String(rawText).slice(0, 2000) });

    // 2. 清洗后
    try {
        const clean = (typeof sanitizeRawInput === 'function') ? sanitizeRawInput(rawText) : rawText;
        r.cleanLength = clean.length;
        r.steps.push({ name: '清洗后', value: clean.slice(0, 2000), length: clean.length });
    } catch (e) {}

    // 3. 截断修复
    try {
        const repaired = (typeof repairTruncatedJson === 'function') ? repairTruncatedJson(rawText) : rawText;
        r.steps.push({ name: '截断修复', length: repaired.length });
    } catch (e) {}

    // 4. 标准修复
    try {
        const final = (typeof repairAiJsonText === 'function') ? repairAiJsonText(rawText) : rawText;
        r.steps.push({ name: '标准修复', length: final.length });
    } catch (e) {}

    // 5. 候选
    try {
        if (typeof extractMultipleSpecs === 'function') {
            const list = extractMultipleSpecs(rawText);
            r.steps.push({ name: 'spec 候选', count: list.length, candidates: list.map(s => ({
                pages: (s.pages || []).length,
                quality: (typeof scoreSpecQuality === 'function') ? scoreSpecQuality(s).total : 0
            })) });
        }
    } catch (e) {}

    // 6. JSON 片段
    try {
        if (typeof extractAllJsonSnippets === 'function') {
            const snips = extractAllJsonSnippets(rawText);
            r.steps.push({ name: 'JSON 片段', count: snips.length, kinds: snips.map(s => s.kind + '(' + (s.raw.length) + '字符)') });
        }
    } catch (e) {}

    // 7. 诊断
    try {
        if (typeof diagnoseRawInput === 'function') {
            const diag = diagnoseRawInput(rawText);
            r.steps.push({ name: '诊断', diag });
        }
    } catch (e) {}

    return r;
}
window.buildDeepDebugReport = buildDeepDebugReport;

/* ============================================================
   106. 自动补差：把 AI 输出里当前画布缺失的部分补充进去
   思路：按页对齐，多出来的页追加；同页多出来的图层追加
   ============================================================ */
async function autoFillFromAiResult(spec) {
    if (!window.state || !spec || !Array.isArray(spec.pages)) return { ok: false, reason: '参数无效' };
    const currentSpec = (typeof exportCanvasAsSpec === 'function') ? exportCanvasAsSpec() : null;
    if (!currentSpec) return { ok: false, reason: '当前画布读取失败' };

    const beforePages = JSON.parse(JSON.stringify(state.pages || []));
    let addedPages = 0;
    let addedLayers = 0;

    spec.pages.forEach((sp, i) => {
        if (!sp || !Array.isArray(sp.layers)) return;
        if (i >= currentSpec.pages.length) {
            // 新增页
            const newPage = {
                id: 'page-fill-' + Date.now() + '-' + i,
                title: sp.title || ('第 ' + (state.pages.length + 1) + ' 页'),
                layers: sp.layers.map((src, li) => normalizeSpecLayer(src, li))
            };
            state.pages.push(newPage);
            addedPages++;
            addedLayers += newPage.layers.length;
            return;
        }
        // 同页：当前只有 0 图层时整页填充；否则只追加没重复的图层（按内容 diff）
        const curPage = state.pages[i];
        const curLayers = curPage.layers || [];
        if (curLayers.length === 0) {
            curPage.layers = sp.layers.map((src, li) => normalizeSpecLayer(src, li));
            addedLayers += curPage.layers.length;
            return;
        }
        const existingTexts = new Set(curLayers.filter(l => l && l.type === 'text').map(l => String(l.content || '').trim()));
        sp.layers.forEach((src, li) => {
            if (!src || src.type !== 'text') return;
            const t = String(src.content || '').trim();
            if (!t || existingTexts.has(t)) return;
            const clone = normalizeSpecLayer(src, li);
            curPage.layers.push(clone);
            addedLayers++;
            existingTexts.add(t);
        });
    });

    if (addedPages === 0 && addedLayers === 0) return { ok: true, addedPages: 0, addedLayers: 0, message: '没有可补充的内容' };

    try {
        window.__aiSpecBackup = { appliedAt: Date.now(), pages: beforePages, currentPageId: state.currentPageId, background: state.background ? JSON.parse(JSON.stringify(state.background)) : null };
    } catch (e) {}

    if (state.history && typeof state.history.record === 'function') state.history.record();
    if (typeof renderAll === 'function') renderAll();
    return { ok: true, addedPages, addedLayers };
}
window.autoFillFromAiResult = autoFillFromAiResult;

/* ============================================================
   107. 分层导出：spec 拆成“版式/特效/配色”三层
   用途：用户可以只把「这套配色」或「这套特效组合」分享出去
   ============================================================ */
function exportLayeredSpec(spec) {
    if (!spec || !Array.isArray(spec.pages)) return null;
    const pages = spec.pages;
    // 版式层：每页每个图层的几何与字号
    const layout = pages.map((p, pi) => ({
        title: p.title || ('第 ' + (pi + 1) + ' 页'),
        bgPresetId: (p.bg && p.bg.presetId) || null,
        layers: (p.layers || []).map(l => ({
            type: l.type,
            x: l.x, y: l.y, width: l.width, height: l.height,
            fontSize: l.fontSize,
            align: l.align,
            lineHeight: l.lineHeight,
            heightMode: l.heightMode
        }))
    }));

    // 特效层：出现过的特效 id 集合
    const effectsUsed = new Set();
    const effectFreq = {};
    pages.forEach(p => (p.layers || []).forEach(l => {
        if (l && l.effectClass) {
            effectsUsed.add(l.effectClass);
            effectFreq[l.effectClass] = (effectFreq[l.effectClass] || 0) + 1;
        }
    }));

    // 配色层：出现过的颜色（去重）及出现次数
    const colorsUsed = {};
    pages.forEach(p => (p.layers || []).forEach(l => {
        if (l && l.color) {
            const c = String(l.color).toUpperCase();
            colorsUsed[c] = (colorsUsed[c] || 0) + 1;
        }
    }));

    return {
        format: 'douyin-cover-layered',
        version: 1,
        generatedAt: new Date().toISOString(),
        layout,
        effects: {
            list: Array.from(effectsUsed),
            freq: effectFreq
        },
        colors: colorsUsed
    };
}
window.exportLayeredSpec = exportLayeredSpec;

/* ============================================================
   108. 分层应用：把“配色层”或“特效层”套用到画布
   ============================================================ */
async function applyLayeredColorsToCurrent(colorsObj) {
    if (!window.state || !colorsObj) return { ok: false, reason: '参数无效' };
    const page = state.getCurrentPage && state.getCurrentPage();
    if (!page) return { ok: false, reason: '当前页不存在' };

    // 取出现次数最高的一个颜色，套到当前页所有文字图层
    const sorted = Object.entries(colorsObj).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return { ok: false, reason: '无颜色' };
    const primary = sorted[0][0];
    const secondary = sorted[1] ? sorted[1][0] : primary;

    const texts = (page.layers || []).filter(l => l && l.type === 'text');
    let changed = 0;
    texts.forEach((l, i) => {
        l.color = i === 0 ? primary : secondary;
        changed++;
    });
    if (state.history && typeof state.history.record === 'function') state.history.record();
    if (typeof renderAll === 'function') renderAll();
    return { ok: true, changed, primary, secondary };
}
window.applyLayeredColorsToCurrent = applyLayeredColorsToCurrent;

async function applyLayeredEffectsToCurrent(effectsObj) {
    if (!window.state || !effectsObj || !Array.isArray(effectsObj.list)) return { ok: false, reason: '参数无效' };
    const page = state.getCurrentPage && state.getCurrentPage();
    if (!page) return { ok: false, reason: '当前页不存在' };
    const primary = effectsObj.list[0];
    const secondary = effectsObj.list[1] || primary;
    if (!primary) return { ok: false, reason: '无特效' };

    const texts = (page.layers || []).filter(l => l && l.type === 'text');
    let changed = 0;
    texts.forEach((l, i) => {
        l.effectClass = i === 0 ? primary : secondary;
        changed++;
    });
    if (state.history && typeof state.history.record === 'function') state.history.record();
    if (typeof renderAll === 'function') renderAll();
    return { ok: true, changed, primary, secondary };
}
window.applyLayeredEffectsToCurrent = applyLayeredEffectsToCurrent;

/* ============================================================
   109. 金句库：常见抖音封面句式，配合本地标题生成
   ============================================================ */
const AI_TITLE_GOLDEN_PATTERNS = [
    '普通人如何{n}',
    '{n} 个方法让你{n}',
    '90% 的人都不知道的{n}',
    '我用{n} 天做到了{n}',
    '别再{n}了，试试这个',
    '强烈建议：{n}',
    '你不知道的 {n} 真相',
    '第一次见 {n}，太震撼了',
    '3 步搞定{n}',
    '月入 {n} 的秘密',
    '0 基础也能学会的{n}',
    '从{n} 到{n}，我只用了 {n} 天',
    '这些{n}，越早知道越好',
    '为什么你总是{n}？',
    '{n} 的真相，劝你早点知道'
];
window.AI_TITLE_GOLDEN_PATTERNS = AI_TITLE_GOLDEN_PATTERNS;

function expandTitleWithPatterns(seed) {
    if (!seed) return [];
    const seedClean = String(seed).replace(/<[^>]*>/g, '').split(/\r?\n/)[0].slice(0, 20);
    if (!seedClean) return [];
    const results = new Set();
    AI_TITLE_GOLDEN_PATTERNS.forEach(p => {
        // 用 seed 或简单数字替换{n}
        let t = p;
        while (t.includes('{n}')) {
            t = t.replace('{n}', seedClean.length > 8 ? seedClean.slice(0, 8) : seedClean);
        }
        results.add(t);
    });
    return Array.from(results).slice(0, 8);
}
window.expandTitleWithPatterns = expandTitleWithPatterns;

/* ============================================================
   110. 关键词提炼：从原文提炼关键词（纯规则，无 AI）
   ============================================================ */
const AI_STOP_WORDS = new Set(['的', '了', '是', '在', '和', '与', '及', '啊', '呀', '呢', '吧', '这', '那', '你', '我', '他', '她', '它', '们', '就', '都', '也', '还', '又', '很', '太', '更', '最', '有', '没', '不', '要', '会', '能', '可以', '应该', '如果', '因为', '所以', '但是', '然后', '还有', '这个', '那个', '什么', '怎么', '为什么', '一个', '一种', '一些', '非常', '比较', '特别', '其实', '真的', '已经', '现在', '一下']);

function extractKeywordsFromText(raw) {
    if (!raw) return [];
    const text = String(raw).replace(/<[^>]*>/g, '');
    // 提取中文 2~6 字连续片段 + 英文单词
    const candidateRe = /[\u4e00-\u9fa5]{2,6}|[A-Za-z]{3,}/g;
    const freq = {};
    let m;
    while ((m = candidateRe.exec(text)) !== null) {
        const w = m[0];
        if (AI_STOP_WORDS.has(w)) continue;
        freq[w] = (freq[w] || 0) + 1;
    }
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    return sorted.slice(0, 8).map(x => x[0]);
}
window.extractKeywordsFromText = extractKeywordsFromText;

/* ============================================================
   111. AI 输出错误修正建议：把技术诊断转成可执行的自然语言
   ============================================================ */
function buildErrorFixSuggestions(rawText) {
    if (!rawText) return [];
    const suggestions = [];
    const diag = (typeof diagnoseRawInput === 'function') ? diagnoseRawInput(rawText) : null;
    if (!diag) return suggestions;

    if (!diag.jsonLike) {
        suggestions.push({
            title: 'AI 没输出 JSON',
            fix: '可能 AI 理解错了任务，或你复制到了错误段落。\n请在 DeepSeek 里回复：「请只输出完整 JSON，不要解释」，然后重新复制。'
        });
        return suggestions;
    }

    const text = String(rawText);

    if (/[\u201c\u201d‘’]/.test(text)) {
        suggestions.push({
            title: '存在中文引号',
            fix: '尝试用英文双引号 "..." 替换中文引号 “...” 和 ‘...’。\n如果重跑一次 AI 更简单，直接要求它「用英文双引号」。'
        });
    }

    if (/,\s*[}\]][^\}]*$/.test(text.trim().slice(-200))) {
        suggestions.push({
            title: '疑似尾逗号',
            fix: '对象/数组最后一项后不要加逗号。本面板「自动修复」可处理。'
        });
    }

    if (/\/\/|\/\*/.test(text)) {
        suggestions.push({
            title: '存在注释',
            fix: 'JSON 不允许 // 或 /* */ 注释。删除注释后再试。'
        });
    }

    // 检查是否被截断
    if (diag.hasCodeBlock) {
        const open = (text.match(/{/g) || []).length;
        const close = (text.match(/}/g) || []).length;
        if (open > close) {
            suggestions.push({
                title: 'JSON 可能被截断',
                fix: '发现 ' + (open - close) + ' 个未闭合的 {。可能复制时被截断。\n本面板「自动修复」会尝试自动补全，或让 AI 重新输出一次。'
            });
        }
        const openB = (text.match(/\[/g) || []).length;
        const closeB = (text.match(/\]/g) || []).length;
        if (openB > closeB) {
            suggestions.push({
                title: 'JSON 数组可能被截断',
                fix: '发现 ' + (openB - closeB) + ' 个未闭合的 [。'
            });
        }
    }

    if (!diag.hasCodeBlock && diag.jsonLike && diag.candidatesCount === 0) {
        suggestions.push({
            title: '有 JSON 但结构不合法',
            fix: '可能是：① 字段名不是双引号 ② 缺少必填字段（format/version/pages）③ 结构不符合契约。\n建议让 AI 按契约重新输出一次。'
        });
    }

    if (diag.candidatesCount > 0 && suggestions.length === 0) {
        suggestions.push({
            title: '内容合法',
            fix: '检测到 ' + diag.candidatesCount + ' 份合法 spec，可直接点「校验」或「应用」。'
        });
    }

    return suggestions;
}
window.buildErrorFixSuggestions = buildErrorFixSuggestions;

/* ============================================================
   112. 全局颜色替换：项目内所有图层里的某颜色替换为另一颜色
   ============================================================ */
function replaceColorAcrossCanvas(fromColor, toColor, options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    if (!fromColor || !toColor) return { ok: false, reason: '缺少颜色参数' };
    const from = String(fromColor).toUpperCase();
    const to = String(toColor).toUpperCase();
    let changed = 0;

    (state.pages || []).forEach(p => {
        (p.layers || []).forEach(l => {
            if (!l) return;
            // 主色
            if (l.color && String(l.color).toUpperCase() === from) {
                l.color = to;
                changed++;
            }
            // 背景色
            if (l.bgColor && String(l.bgColor).toUpperCase() === from) {
                l.bgColor = to;
                changed++;
            }
            // 底衬色
            if (l.backdrop && l.backdrop.color && String(l.backdrop.color).toUpperCase() === from) {
                l.backdrop.color = to;
                changed++;
            }
            // 特效参数里的颜色
            if (l.effectParams && typeof l.effectParams === 'object') {
                Object.keys(l.effectParams).forEach(eid => {
                    const params = l.effectParams[eid];
                    if (!params || typeof params !== 'object') return;
                    Object.keys(params).forEach(k => {
                        if (typeof params[k] === 'string' && params[k].toUpperCase() === from) {
                            params[k] = to;
                            changed++;
                        }
                    });
                });
            }
            // 行内 span 里的颜色（在文字内容里）
            if (l.type === 'text' && l.content) {
                const pattern = new RegExp(from.replace('#', '#?'), 'gi');
                const newContent = String(l.content).replace(pattern, to);
                if (newContent !== l.content) {
                    l.content = newContent;
                    changed++;
                }
            }
        });
    });

    // 背景
    try {
        if (state.background && state.background.color1 && String(state.background.color1).toUpperCase() === from) {
            state.background.color1 = to;
            changed++;
        }
        if (state.background && state.background.color2 && String(state.background.color2).toUpperCase() === from) {
            state.background.color2 = to;
            changed++;
        }
    } catch (e) {}

    if (changed > 0) {
        if (state.history && typeof state.history.record === 'function') state.history.record();
        if (typeof applyBackgroundToCanvases === 'function') applyBackgroundToCanvases(state.background);
        if (typeof renderAll === 'function') renderAll();
    }
    return { ok: true, changed };
}
window.replaceColorAcrossCanvas = replaceColorAcrossCanvas;

/* ============================================================
   113. 全局字号统一：把项目所有文字字号收敛到 3 级
   ============================================================ */
function unifyFontSizes(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const levels = options.levels || [48, 28, 20];
    let changed = 0;
    (state.pages || []).forEach(p => {
        (p.layers || []).forEach(l => {
            if (!l || l.type !== 'text') return;
            const cur = parseFloat(l.fontSize) || 28;
            // 找最接近的一级
            let target = levels[0];
            let bestDist = Infinity;
            levels.forEach(lev => {
                const d = Math.abs(lev - cur);
                if (d < bestDist) { bestDist = d; target = lev; }
            });
            if (Math.round(target) !== Math.round(cur)) {
                l.fontSize = target + 'px';
                changed++;
            }
        });
    });
    if (changed > 0) {
        if (state.history && typeof state.history.record === 'function') state.history.record();
        if (typeof renderAll === 'function') renderAll();
    }
    return { ok: true, changed, levels };
}
window.unifyFontSizes = unifyFontSizes;

/* ============================================================
   114. 全局字距统一
   ============================================================ */
function unifyLetterSpacings(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const levels = options.levels || [0, 2, 4];
    let changed = 0;
    (state.pages || []).forEach(p => {
        (p.layers || []).forEach(l => {
            if (!l || l.type !== 'text') return;
            const cur = parseFloat(l.letterSpacing) || 0;
            let target = levels[0];
            let bestDist = Infinity;
            levels.forEach(lev => {
                const d = Math.abs(lev - cur);
                if (d < bestDist) { bestDist = d; target = lev; }
            });
            if (Math.abs(target - cur) > 0.01) {
                l.letterSpacing = target;
                changed++;
            }
        });
    });
    if (changed > 0) {
        if (state.history && typeof state.history.record === 'function') state.history.record();
        if (typeof renderAll === 'function') renderAll();
    }
    return { ok: true, changed, levels };
}
window.unifyLetterSpacings = unifyLetterSpacings;

/* ============================================================
   115. 全局特效统一：把项目中过于丰富的特效收敛到 2~3 种
   ============================================================ */
function unifyEffects(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const keep = options.keep || 2;

    const effectCounts = {};
    const recordEffect = (l) => {
        if (!l || l.type !== 'text' || !l.effectClass) return;
        effectCounts[l.effectClass] = (effectCounts[l.effectClass] || 0) + 1;
    };
    (state.pages || []).forEach(p => (p.layers || []).forEach(recordEffect));

    const sorted = Object.entries(effectCounts).sort((a, b) => b[1] - a[1]);
    if (sorted.length <= keep) return { ok: true, changed: 0, message: '特效种类已 ≤' + keep + '，无需收敛' };

    const keepSet = new Set(sorted.slice(0, keep).map(x => x[0]));
    let changed = 0;
    (state.pages || []).forEach(p => {
        (p.layers || []).forEach(l => {
            if (!l || l.type !== 'text') return;
            if (l.effectClass && !keepSet.has(l.effectClass)) {
                l.effectClass = null;
                if (l.effectParams) delete l.effectParams;
                changed++;
            }
        });
    });
    if (changed > 0) {
        if (state.history && typeof state.history.record === 'function') state.history.record();
        if (typeof renderAll === 'function') renderAll();
    }
    return { ok: true, changed, keptEffects: Array.from(keepSet) };
}
window.unifyEffects = unifyEffects;

/* ============================================================
   116. 全局对齐方式统一
   ============================================================ */
function unifyTextAlignment(align) {
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const valid = ['left', 'center', 'right'];
    if (!valid.includes(align)) return { ok: false, reason: '对齐值无效' };
    let changed = 0;
    (state.pages || []).forEach(p => {
        (p.layers || []).forEach(l => {
            if (!l || l.type !== 'text') return;
            if (l.align !== align) {
                l.align = align;
                changed++;
            }
        });
    });
    if (changed > 0) {
        if (state.history && typeof state.history.record === 'function') state.history.record();
        if (typeof renderAll === 'function') renderAll();
    }
    return { ok: true, changed };
}
window.unifyTextAlignment = unifyTextAlignment;

/* ============================================================
   117. 自动软换行：把长行按标点/长度软拆，防止横向溢出
   ============================================================ */
function autoSoftWrap(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const maxCharsPerLine = options.maxCharsPerLine || 10;
    const preferPunctuation = options.preferPunctuation !== false;
    let changed = 0;

    (state.pages || []).forEach(p => {
        (p.layers || []).forEach(l => {
            if (!l || l.type !== 'text') return;
            const raw = String(l.content || '');
            if (raw.includes('<br>') || raw.includes('\n')) return; // 已换行，跳过
            const plain = raw.replace(/<[^>]*>/g, '');
            if (plain.length <= maxCharsPerLine) return;

            // 尝试按标点优先断
            const parts = [];
            let buf = '';
            const punctuation = /[，。！？；：、,.!?;:]/;
            for (let i = 0; i < plain.length; i++) {
                const ch = plain[i];
                buf += ch;
                if (buf.length >= maxCharsPerLine) {
                    // 找上一个标点
                    let cut = buf.length;
                    if (preferPunctuation) {
                        for (let j = buf.length - 1; j >= Math.max(0, buf.length - 5); j--) {
                            if (punctuation.test(buf[j])) { cut = j + 1; break; }
                        }
                    }
                    parts.push(buf.slice(0, cut));
                    buf = buf.slice(cut);
                }
            }
            if (buf) parts.push(buf);
            if (parts.length <= 1) return;

            l.content = parts.join('<br>');
            changed++;
        });
    });
    if (changed > 0) {
        if (state.history && typeof state.history.record === 'function') state.history.record();
        if (typeof renderAll === 'function') renderAll();
    }
    return { ok: true, changed, maxCharsPerLine };
}
window.autoSoftWrap = autoSoftWrap;

/* ============================================================
   118. 安全区自动避让：把所有越界图层挪回安全区
   ============================================================ */
function snapToSafeArea(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const M = options.margin || { left: 20, right: 20, top: 30, bottom: 40 };
    const W = 360, H = 640;
    let changed = 0;

    (state.pages || []).forEach(p => {
        (p.layers || []).forEach(l => {
            if (!l) return;
            const w = Number(l.width) || 100;
            const h = Number(l.height) || 40;
            let nx = Number(l.x) || 0;
            let ny = Number(l.y) || 0;
            const ox = nx, oy = ny;

            // 上
            if (ny < M.top) ny = M.top;
            // 下
            if (ny + h > H - M.bottom) ny = Math.max(M.top, H - M.bottom - h);
            // 左
            if (nx < M.left) nx = M.left;
            // 右
            if (nx + w > W - M.right) nx = Math.max(M.left, W - M.right - w);

            if (Math.abs(nx - ox) > 1 || Math.abs(ny - oy) > 1) {
                l.x = nx;
                l.y = ny;
                changed++;
            }
        });
    });
    if (changed > 0) {
        if (state.history && typeof state.history.record === 'function') state.history.record();
        if (typeof renderAll === 'function') renderAll();
    }
    return { ok: true, changed };
}
window.snapToSafeArea = snapToSafeArea;

/* ============================================================
   119. 契约自检表：把 spec 按契约项逐条勾选
   ============================================================ */
function buildSpecChecklist(spec) {
    const list = [];
    if (!spec) return list;
    const add = (name, ok, hint) => list.push({ name, ok: !!ok, hint: hint || '' });

    add('format = douyin-cover-spec', spec.format === 'douyin-cover-spec');
    add('version = 1', spec.version === 1);
    add('titleCandidates ≥ 3', Array.isArray(spec.titleCandidates) && spec.titleCandidates.length >= 3);
    add('pages 非空', Array.isArray(spec.pages) && spec.pages.length > 0);

    if (Array.isArray(spec.pages)) {
        let pageWithBg = 0;
        let pagesOk = 0;
        let allTextHaveBasic = true;
        let allColorsHex = true;
        let allWithinCanvas = true;
        spec.pages.forEach(p => {
            if (p.bg) pageWithBg++;
            if (Array.isArray(p.layers) && p.layers.length > 0) pagesOk++;
            (p.layers || []).forEach(l => {
                if (!l || l.type !== 'text') return;
                if (!l.content || !l.fontSize || !l.color) allTextHaveBasic = false;
                if (l.color && !/^#[0-9a-fA-F]{6}$/.test(String(l.color))) allColorsHex = false;
                if ((Number(l.x) || 0) < -10 || (Number(l.y) || 0) < -10
                    || (Number(l.x) || 0) > 370 || (Number(l.y) || 0) > 650) allWithinCanvas = false;
            });
        });
        add('每页至少有 1 个图层', pagesOk === spec.pages.length, pagesOk + '/' + spec.pages.length);
        add('至少第 1 页有背景', pageWithBg > 0, pageWithBg + '/' + spec.pages.length);
        add('文字图层基础字段齐备', allTextHaveBasic);
        add('所有颜色为 #rrggbb', allColorsHex);
        add('所有图层在画布范围内', allWithinCanvas);
    }

    const q = (typeof scoreSpecQuality === 'function') ? scoreSpecQuality(spec) : null;
    if (q) add('质量分 ≥ 60', q.total >= 60, q.total);

    return list;
}
window.buildSpecChecklist = buildSpecChecklist;

/* ============================================================
   120. 契约导出为可下载的 Markdown
   ============================================================ */
function downloadSpecContractMarkdown() {
    if (typeof generateAiSpecMarkdown !== 'function') return { ok: false, reason: '契约生成器未就绪' };
    try {
        const md = generateAiSpecMarkdown();
        const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'AI-SPEC-' + new Date().toISOString().slice(0, 10) + '.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return { ok: true, length: md.length };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
}
window.downloadSpecContractMarkdown = downloadSpecContractMarkdown;

/* ============================================================
   121. 首次配置检查：把「画布依赖的准备工作」列出来
   ============================================================ */
function checkSetupReadiness() {
    const items = [];
    const push = (name, ok, hint, action) => items.push({ name, ok, hint, action });

    // 1. 品牌资产
    let hasBrand = false;
    try {
        if (window.BrandManager) {
            const colors = BrandManager.getAllColors();
            hasBrand = colors && colors.length > 0;
        }
    } catch (e) {}
    push('品牌色板', hasBrand, hasBrand ? '' : '未配置品牌色，严格模式下所有颜色会被判非法', 'brand');

    // 2. 字体
    let hasFont = false;
    try {
        hasFont = !!(window.__loadedCustomFonts && Object.keys(window.__loadedCustomFonts).length);
    } catch (e) {}
    push('自定义字体', hasFont, hasFont ? '' : '未上传自定义字体，只能用系统字体', 'font');

    // 3. 底衬 / 背景预设
    push('内置预设', (window.BG_PRESETS || []).length > 0, '背景预设已就绪', null);

    // 4. 依赖模块
    let dep = { ok: true };
    try { dep = checkAiSpecDependencies(); } catch (e) {}
    push('依赖齐备', dep.ok, dep.ok ? '' : ('缺失：' + (dep.missing || []).join(', ')), null);

    // 5. 首次使用引导
    let seenOnboarding = false;
    try { seenOnboarding = hasSeenAiOnboarding(); } catch (e) {}
    push('使用引导', seenOnboarding, seenOnboarding ? '' : '首次使用，建议点「引导」了解流程', 'onboarding');

    return { ok: items.every(i => i.ok), items };
}
window.checkSetupReadiness = checkSetupReadiness;

/* ============================================================
   122. 协议版本兼容：为 v2 提前铺路
   目前只做 v1 -> v1 的透传；将来 v2 加字段时在此实现迁移
   ============================================================ */
function migrateSpecToLatest(spec) {
    if (!spec || typeof spec !== 'object') return spec;
    let cur = spec;
    // 反复迭代直到达到最新版（目前最新 = 1）
    let guard = 0;
    while (guard < 10) {
        guard++;
        if (!cur.version || cur.version >= 1) break;
        // 未来：if (cur.version === 1) cur = migrateV1ToV2(cur);
        // 现在无低版本，直接 break
        break;
    }
    if (!cur.version) cur.version = 1;
    return cur;
}
window.migrateSpecToLatest = migrateSpecToLatest;

/* ============================================================
   123. 协议兼容性检查：检测 spec 是否可能来自更高版本
   ============================================================ */
function checkSpecCompatibility(spec) {
    if (!spec || typeof spec !== 'object') return { ok: false, reason: '无效 spec' };
    const v = Number(spec.version) || 1;
    if (v > 1) {
        return {
            ok: false,
            version: v,
            reason: 'spec 版本 ' + v + ' 高于当前支持的 v1，部分字段可能被忽略'
        };
    }
    return { ok: true, version: v };
}
window.checkSpecCompatibility = checkSpecCompatibility;

/* ============================================================
   124. 导出 spec 为 JS 代码片段：可直接 <script src="spec.js">
   供其他网页动态渲染（未来开放 API 或内嵌预览）
   ============================================================ */
function exportSpecAsJsSnippet(spec) {
    if (!spec || !Array.isArray(spec.pages)) return '';
    const json = JSON.stringify(spec);
    const lines = [];
    lines.push('// 抖音封面设计器导出的 spec（v1）');
    lines.push('// 生成于 ' + new Date().toISOString());
    lines.push('// 用法：<script src="this-file.js"><\\/script> 然后访问 window.DOUYIN_COVER_SPEC');
    lines.push('window.DOUYIN_COVER_SPEC = ' + json + ';');
    return lines.join('\n');
}
window.exportSpecAsJsSnippet = exportSpecAsJsSnippet;

/* ============================================================
   125. spec 转人类可读摘要
   ============================================================ */
function describeSpecHuman(spec) {
    if (!spec || !Array.isArray(spec.pages)) return '';
    const lines = [];
    lines.push('=== ' + (spec.titleCandidates && spec.titleCandidates[0] || '封面方案') + ' ===');
    lines.push('总页数：' + spec.pages.length);
    if (spec.titleCandidates && spec.titleCandidates.length) {
        lines.push('标题候选：');
        spec.titleCandidates.forEach((t, i) => lines.push('  ' + (i + 1) + '. ' + t));
    }
    lines.push('');
    spec.pages.forEach((p, i) => {
        lines.push('第 ' + (i + 1) + ' 页 · ' + (p.title || ''));
        if (p.bg && p.bg.presetId) {
            const preset = (window.BG_PRESETS || []).find(x => x.id === p.bg.presetId);
            lines.push('  背景：' + (preset ? preset.name : p.bg.presetId));
        }
        (p.layers || []).filter(l => l && l.type === 'text').forEach((l, j) => {
            const content = String(l.content || '').replace(/<[^>]*>/g, '').replace(/\n/g, ' / ');
            const truncated = content.length > 30 ? content.slice(0, 30) + '…' : content;
            lines.push('  文字 ' + (j + 1) + '：' + truncated + '（' + (l.fontSize || '?') + ' ' + (l.color || '') + (l.effectClass ? ' ' + l.effectClass : '') + '）');
        });
        lines.push('');
    });
    return lines.join('\n');
}
window.describeSpecHuman = describeSpecHuman;

/* ============================================================
   126. 一键生成 4 套风格 spec（不应用）
   ============================================================ */
function generateMultiStyleSpecs(rawText) {
    if (!rawText) return [];
    if (typeof buildFallbackSpec !== 'function') return [];
    const out = [];
    (window.AI_STYLE_PRESETS || []).forEach(st => {
        try {
            const spec = buildFallbackSpec(rawText);
            if (!spec) return;
            // 套用风格
            if (spec.pages && spec.pages[0]) {
                if (st.bgPresetId) {
                    const p = (window.BG_PRESETS || []).find(x => x.id === st.bgPresetId);
                    if (p) spec.pages[0].bg = { presetId: p.id };
                }
                const firstText = (spec.pages[0].layers || []).find(l => l && l.type === 'text');
                if (firstText) {
                    if (st.titleEffect) firstText.effectClass = st.titleEffect;
                    if (st.titleColor) firstText.color = st.titleColor;
                }
            }
            // 标题候选
            if (typeof generateLocalTitleCandidates === 'function') {
                spec.titleCandidates = generateLocalTitleCandidates(rawText);
                if (spec.titleCandidates[0] && spec.pages[0]) {
                    const firstText = (spec.pages[0].layers || []).find(l => l && l.type === 'text');
                    if (firstText) firstText.content = spec.titleCandidates[0];
                }
            }
            out.push({ style: st, spec });
        } catch (e) {}
    });
    return out;
}
window.generateMultiStyleSpecs = generateMultiStyleSpecs;

/* ============================================================
   127. 快捷键清单（统一数据源）
   ============================================================ */
function listAiShortcuts() {
    return [
        { group: 'AI 相关', items: [
            { keys: 'Ctrl/Cmd + Shift + A', desc: '唤起 AI 方案导入面板' },
            { keys: 'Ctrl/Cmd + V', desc: '把剪贴板内容变成文字图层（编辑文字时走原生粘贴）' },
            { keys: 'Ctrl/Cmd + C', desc: '复制选中图层' }
        ]},
        { group: '编辑与选区', items: [
            { keys: 'Ctrl/Cmd + Z', desc: '撤销上一步' },
            { keys: 'Delete / Backspace', desc: '删除选中图层' },
            { keys: '方向键（↑↓←→）', desc: '微调选中图层位置（Shift 加速）' },
            { keys: 'Ctrl/Cmd + G', desc: '把选中的多个图层合并成组' },
            { keys: 'Ctrl/Cmd + Shift + G', desc: '拆散选中的组' },
            { keys: 'Ctrl/Cmd + L', desc: '锁定 / 解锁选中图层' },
            { keys: 'Alt + 拖拽', desc: '临时关闭吸附对齐' }
        ]},
        { group: '对齐与布局', items: [
            { keys: 'Alt + A', desc: '图层左对齐' },
            { keys: 'Alt + H', desc: '图层水平居中' },
            { keys: 'Alt + D', desc: '图层右对齐' },
            { keys: 'Alt + W', desc: '图层顶对齐' },
            { keys: 'Alt + V', desc: '图层垂直居中' },
            { keys: 'Alt + S', desc: '图层底对齐' }
        ]},
        { group: '工具切换（左栏）', items: [
            { keys: 'V', desc: '选择工具' },
            { keys: 'T', desc: '添加文本' },
            { keys: 'S', desc: '贴纸库' },
            { keys: 'P', desc: '涂鸦画笔' },
            { keys: 'B', desc: '打开背景面板' },
            { keys: 'R', desc: '形状工具' },
            { keys: 'Esc', desc: '退出绘制模式 / 关闭弹窗' }
        ]},
        { group: '预览与导出', items: [
            { keys: 'F5', desc: '进入预览模式' },
            { keys: 'Esc（预览中）', desc: '退出预览' },
            { keys: '←→（预览中）', desc: '切换页' }
        ]}
    ];
}
window.listAiShortcuts = listAiShortcuts;

/* ============================================================
   128. 通用 apply pipeline
   把「应用 + 自动装饰 + 自动导出」封装成一个公共入口
   ============================================================ */
async function runApplyPipeline(spec, options) {
    options = options || {};
    if (!spec) return { ok: false, reason: '无 spec' };

    // 可选：自动修复
    if (options.autoFix && typeof autoFixSpec === 'function') {
        try { spec = autoFixSpec(spec).spec || spec; } catch (e) {}
    }
    // 可选：背景继承
    if (options.inheritBg !== false) {
        try {
            const firstBg = (spec.pages[0] && spec.pages[0].bg) || null;
            if (firstBg) {
                spec.pages.forEach((p, i) => { if (i > 0 && !p.bg) p.bg = JSON.parse(JSON.stringify(firstBg)); });
            }
        } catch (e) {}
    }
    // 可选：自动装饰
    if (options.autoDecorate !== false && typeof autoDecorateSpec === 'function') {
        try { autoDecorateSpec(spec); } catch (e) {}
    }

    // 应用
    const r = await applyCoverSpec(spec, {
        dryRun: false,
        append: !!options.append,
        autoDecorate: false
    });

    // 导出
    let exportResult = null;
    if (r.applied && options.autoExport && options.autoExport !== 'none') {
        try {
            if (typeof autoExportAfterApply === 'function') {
                exportResult = await autoExportAfterApply(options.autoExport);
            }
        } catch (e) {}
    }

    return { ok: !!r.applied, applied: r, exportResult, spec };
}
window.runApplyPipeline = runApplyPipeline;

/* ============================================================
   129. 一键修复：把常见可自动处理的问题一次性跑一遍
   ============================================================ */
async function autoHealSpec(spec) {
    if (!spec) return { ok: false, reason: '无 spec' };
    const steps = [];
    let s = spec;
    try {
        // 1. 结构
        if (typeof fixSpecStructure === 'function') { s = fixSpecStructure(s); steps.push('结构修复'); }
        // 2. 自动修复
        if (typeof autoFixSpec === 'function') { const r = autoFixSpec(s); s = r.spec || s; steps.push('字段修复'); }
        // 3. 标题规范化
        if (typeof normalizeAllTitlesInSpec === 'function') { const r = normalizeAllTitlesInSpec(s); steps.push('标题规范化(' + r.changed + ')'); }
        // 4. 背景继承
        try {
            const firstBg = (s.pages[0] && s.pages[0].bg) || null;
            if (firstBg) {
                s.pages.forEach((p, i) => { if (i > 0 && !p.bg) p.bg = JSON.parse(JSON.stringify(firstBg)); });
            }
        } catch (e) {}
        // 5. 自动装饰
        if (typeof autoDecorateSpec === 'function') { const r = autoDecorateSpec(s); if (r.added > 0) steps.push('自动装饰(' + r.added + ')'); }
        // 6. 一致性
        try {
            if (typeof unifySpecBackgrounds === 'function') {
                const r = unifySpecBackgrounds(s, {});
                if (r.ok && r.changed > 0) steps.push('统一背景(' + r.changed + ')');
            }
        } catch (e) {}
    } catch (e) {
        return { ok: false, reason: '自愈失败：' + e.message, steps };
    }
    const v = validateSpec(s);
    return { ok: v.ok, spec: s, steps, errors: v.errors, warnings: v.warnings };
}
window.autoHealSpec = autoHealSpec;

/* ============================================================
   130. Layout 模式快速切换
   给用户一种“AI 输出的结构看着不对，一键换成另一种版式”的兜底能力
   ============================================================ */
function switchSpecLayoutMode(spec, mode, options) {
    options = options || {};
    if (!spec || !Array.isArray(spec.pages) || !spec.pages.length) {
        return { ok: false, reason: 'spec 无效' };
    }
    const valid = ['hero', 'title-sub', 'title-body', 'long-text'];
    if (!valid.includes(mode)) return { ok: false, reason: '无效模式：' + mode };

    const targetPageIndex = options.pageIndex != null ? options.pageIndex : 0;
    const page = spec.pages[targetPageIndex];
    if (!page) return { ok: false, reason: '该页不存在' };

    const texts = (page.layers || []).filter(l => l && l.type === 'text');
    if (!texts.length) return { ok: false, reason: '该页没有文字图层' };

    // 合并为一段纯文本
    const raw = texts.map(t => String(t.content || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')).join('\n');
    const analyzed = (typeof analyzeChunk === 'function') ? analyzeChunk(raw) : { text: raw, charCount: raw.length, lineCount: raw.split('\n').length };

    // 各模式的统一配置
    const configs = {
        'hero': { fontSize: '52px', align: 'center', bold: true, effectClass: 'effect-viral', y: 140, height: 180 },
        'title-sub': { fontSize: '40px', align: 'center', bold: true, effectClass: 'effect-black-stroke', y: 120, height: 160 },
        'title-body': { fontSize: '28px', align: 'left', bold: true, effectClass: 'effect-black-stroke', y: 100, height: 220 },
        'long-text': { fontSize: '24px', align: 'left', bold: false, effectClass: null, y: 100, height: 360 }
    };
    const cfg = configs[mode];

    // 生成单个文字图层
    const newLayer = buildTextLayer({
        content: analyzed.text,
        fontSize: cfg.fontSize,
        align: cfg.align,
        bold: cfg.bold,
        effectClass: cfg.effectClass,
        y: cfg.y,
        height: cfg.height,
        color: (texts[0] && texts[0].color) || '#ffffff'
    });

    // 保留第一页原背景
    page.layers = [newLayer];
    return { ok: true, mode, pageIndex: targetPageIndex, layerCount: 1 };
}
window.switchSpecLayoutMode = switchSpecLayoutMode;

/* ============================================================
   131. 全局渲染健康度：把当前画布的所有潜在渲染异常整理成一份报告
   用途：应用 AI 方案前后各跑一次，能看出「哪里变丑了」
   ============================================================ */
function scanRenderHealth(options) {
    options = options || {};
    const result = { ok: true, stats: { layers: 0, textLayers: 0, effects: 0, backdrops: 0, emptyContent: 0, tinyFont: 0, hugeFont: 0, spacingOff: 0, outOfCanvas: 0, noBg: 0 }, issues: [] };
    if (!window.state) { result.ok = false; return result; }
    const pages = state.pages || [];
    pages.forEach((p, pi) => {
        const pageHasBg = !!(p.bg && (p.bg.presetId || p.bg.color1));
        if (!pageHasBg) result.stats.noBg++;
        (p.layers || []).forEach((l, li) => {
            if (!l) return;
            result.stats.layers++;
            if (l.type !== 'text') return;
            result.stats.textLayers++;
            if (l.effectClass) result.stats.effects++;
            if (l.backdrop && l.backdrop.type && l.backdrop.type !== 'none') result.stats.backdrops++;

            const label = 'P' + (pi + 1) + '/L' + (li + 1);
            const content = String(l.content || '').replace(/<[^>]*>/g, '');
            if (!content.trim()) { result.stats.emptyContent++; result.issues.push({ level: 'warn', label, text: '内容为空' }); }
            const fs = parseFloat(l.fontSize) || 0;
            if (fs > 0 && fs < 12) { result.stats.tinyFont++; result.issues.push({ level: 'info', label, text: '字号偏小 ' + fs + 'px' }); }
            if (fs > 120) { result.stats.hugeFont++; result.issues.push({ level: 'warn', label, text: '字号超大 ' + fs + 'px' }); }
            const ls = parseFloat(l.letterSpacing) || 0;
            if (Math.abs(ls) > 20) { result.stats.spacingOff++; result.issues.push({ level: 'info', label, text: '字距异常 ' + ls }); }
            const x = Number(l.x) || 0, y = Number(l.y) || 0;
            const w = Number(l.width) || 0, h = Number(l.height) || 0;
            if (x < -50 || y < -50 || x > 400 || y > 700 || w < 5 || h < 5) {
                result.stats.outOfCanvas++;
                result.issues.push({ level: 'warn', label, text: '位置/尺寸异常' });
            }
        });
    });
    return result;
}
window.scanRenderHealth = scanRenderHealth;

/* ============================================================
   132. 智能配色补全：把缺失背景的页补上
   规则：
   1) 优先复制第 1 页的 bg（同风格延续）
   2) 第 1 页也无 bg 时，用 pickBackgroundForText 从页面文字里找
   ============================================================ */
function fillMissingBackgrounds(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const pages = state.pages || [];
    if (!pages.length) return { ok: false, reason: '项目没有页面' };

    const firstBg = (pages[0] && pages[0].bg) || null;
    let filled = 0;

    pages.forEach((p, i) => {
        if (i === 0 && !p.bg && !firstBg) {
            // 第 1 页也缺，从文字内容里推一个
            const texts = (p.layers || []).filter(l => l && l.type === 'text');
            const raw = texts.map(t => String(t.content || '')).join(' ');
            if (raw && typeof pickBackgroundForText === 'function') {
                const preset = pickBackgroundForText(raw);
                if (preset) {
                    p.bg = { presetId: preset.id };
                    filled++;
                }
            }
            return;
        }
        if (p.bg) return;
        if (firstBg) {
            p.bg = JSON.parse(JSON.stringify(firstBg));
            filled++;
            return;
        }
        // firstBg 也不存在时按当前页文字内容推
        const texts = (p.layers || []).filter(l => l && l.type === 'text');
        const raw = texts.map(t => String(t.content || '')).join(' ');
        if (raw && typeof pickBackgroundForText === 'function') {
            const preset = pickBackgroundForText(raw);
            if (preset) {
                p.bg = { presetId: preset.id };
                filled++;
            }
        }
    });

    if (filled > 0) {
        try {
            window.__aiSpecBackup = window.__aiSpecBackup || {};
            window.__aiSpecBackup.pages = window.__aiSpecBackup.pages || JSON.parse(JSON.stringify(pages));
        } catch (e) {}
        if (state.history && typeof state.history.record === 'function') state.history.record();
        if (typeof renderAll === 'function') renderAll();
    }
    return { ok: true, filled, pagesCount: pages.length };
}
window.fillMissingBackgrounds = fillMissingBackgrounds;

/* ============================================================
   133. 画布快照对比器：给用户一个“前后变化多大”的直观数字
   ============================================================ */
function compareSnapshotToCurrent(snapshotId) {
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const list = (typeof getSnapshots === 'function') ? getSnapshots() : [];
    const snap = list.find(x => x.id === snapshotId);
    if (!snap || !snap.spec) return { ok: false, reason: '快照不存在' };
    const current = (typeof exportCanvasAsSpec === 'function') ? exportCanvasAsSpec() : null;
    if (!current) return { ok: false, reason: '当前画布为空' };
    const d = (typeof diffTwoSpecs === 'function') ? diffTwoSpecs(snap.spec, current) : null;
    if (!d) return { ok: false, reason: 'diffTwoSpecs 不可用' };

    // 变化百分比（按图层数）
    const totalChanged = d.effectChanges.length + d.colorChanges.length + d.titleChanges.length;
    const baseLayers = Math.max(1, d.layersA);
    const pct = Math.min(1, totalChanged / baseLayers);
    let level = 'minor';
    if (pct > 0.5) level = 'major';
    else if (pct > 0.15) level = 'medium';

    return {
        ok: true,
        snapLabel: snap.label || '',
        snapTime: snap.takenAt,
        pagesBefore: d.pagesA,
        pagesAfter: d.pagesB,
        layersBefore: d.layersA,
        layersAfter: d.layersB,
        effectChanges: d.effectChanges.length,
        colorChanges: d.colorChanges.length,
        titleChanges: d.titleChanges.length,
        totalChanged,
        changedPct: pct,
        level,
        details: d
    };
}
window.compareSnapshotToCurrent = compareSnapshotToCurrent;

/* ============================================================
   134. 智能补字距：把字距明显异常的图层自动修正到合理范围
   规则：
   - 单行字符 >= 6 且 字距 > 6px → 收敛到 4px
   - 字距 < -4px → 收敛到 -2px（避免粘连）
   ============================================================ */
function healLetterSpacing(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    let changed = 0;
    (state.pages || []).forEach(p => {
        (p.layers || []).forEach(l => {
            if (!l || l.type !== 'text') return;
            const content = String(l.content || '').replace(/<[^>]*>/g, '');
            if (!content) return;
            const chars = content.length;
            const ls = parseFloat(l.letterSpacing) || 0;
            let target = null;
            if (chars >= 6 && ls > 6) target = 4;
            else if (ls < -4) target = -2;
            if (target != null && Math.abs(target - ls) > 0.5) {
                l.letterSpacing = target;
                changed++;
            }
        });
    });
    if (changed > 0) {
        if (state.history && typeof state.history.record === 'function') state.history.record();
        if (typeof renderAll === 'function') renderAll();
    }
    return { ok: true, changed };
}
window.healLetterSpacing = healLetterSpacing;

/* ============================================================
   135. 智能补行高：把行高收敛到 1.2~2.0
   ============================================================ */
function healLineHeight(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    let changed = 0;
    (state.pages || []).forEach(p => {
        (p.layers || []).forEach(l => {
            if (!l || l.type !== 'text') return;
            const lh = parseFloat(l.lineHeight);
            if (!isFinite(lh)) return;
            if (lh < 1.15) {
                l.lineHeight = 1.2;
                changed++;
            } else if (lh > 2.4) {
                l.lineHeight = 2.0;
                changed++;
            }
        });
    });
    if (changed > 0) {
        if (state.history && typeof state.history.record === 'function') state.history.record();
        if (typeof renderAll === 'function') renderAll();
    }
    return { ok: true, changed };
}
window.healLineHeight = healLineHeight;

/* ============================================================
   136. 全局一键体检修复：把常见渲染异常一次修完
   ============================================================ */
async function fullRenderHeal(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const before = (typeof scanRenderHealth === 'function') ? scanRenderHealth() : { ok: false, stats: {} };
    const steps = [];
    let removedEmpty = 0;

    // 1. 清理空文字图层
    try {
        (state.pages || []).forEach(p => {
            if (!Array.isArray(p.layers)) return;
            const beforeLen = p.layers.length;
            p.layers = p.layers.filter(l => {
                if (!l || l.type !== 'text') return true;
                const t = String(l.content || '').replace(/<[^>]*>/g, '').trim();
                return !!t;
            });
            removedEmpty += (beforeLen - p.layers.length);
        });
        if (removedEmpty > 0) steps.push('清理空图层 ' + removedEmpty);
    } catch (e) {}

    // 2. 字距
    try {
        if (typeof healLetterSpacing === 'function') {
            const r = healLetterSpacing({});
            if (r.ok && r.changed > 0) steps.push('字距 ' + r.changed);
        }
    } catch (e) {}

    // 3. 行高
    try {
        if (typeof healLineHeight === 'function') {
            const r = healLineHeight({});
            if (r.ok && r.changed > 0) steps.push('行高 ' + r.changed);
        }
    } catch (e) {}

    // 4. 缺失背景
    try {
        if (typeof fillMissingBackgrounds === 'function') {
            const r = fillMissingBackgrounds({});
            if (r.ok && r.filled > 0) steps.push('补全背景 ' + r.filled);
        }
    } catch (e) {}

    // 5. 保存 & 重绘
    try {
        if (state.history && typeof state.history.record === 'function') state.history.record();
        if (typeof renderAll === 'function') renderAll();
    } catch (e) {}

    const after = (typeof scanRenderHealth === 'function') ? scanRenderHealth() : { ok: false, stats: {} };
    return {
        ok: true,
        steps,
        removedEmpty,
        beforeIssues: (before.issues || []).length,
        afterIssues: (after.issues || []).length,
        stats: after.stats
    };
}
window.fullRenderHeal = fullRenderHeal;

/* ============================================================
   137. 对比度快速调优：比 fixCoverContrast 更智能，优先用品牌色
   ============================================================ */
function smartFixContrast(spec, options) {
    options = options || {};
    if (!spec || !Array.isArray(spec.pages) || !spec.pages.length) return { ok: false, reason: 'spec 无效' };
    const pageIdx = options.pageIndex != null ? options.pageIndex : 0;
    const page = spec.pages[pageIdx];
    if (!page) return { ok: false, reason: '该页不存在' };

    const cr = (typeof estimateCoverReadability === 'function') ? estimateCoverReadability(spec) : null;
    if (!cr || cr.contrast == null) return { ok: false, reason: '无法估算对比度' };
    if (cr.risk === 'low') return { ok: true, changed: 0, reason: '对比度已良好' };

    // 候选色：黑白 + 品牌色 + 当前文字色
    const candidates = ['#FFFFFF', '#000000'];
    try {
        if (window.BrandManager && BrandManager.getAllColors) {
            (BrandManager.getAllColors() || []).forEach(c => {
                if (/^#[0-9a-fA-F]{6}$/.test(c) && !candidates.includes(c.toUpperCase())) {
                    candidates.push(c.toUpperCase());
                }
            });
        }
    } catch (e) {}

    // 计算每个候选色与背景的对比度，取最高（算法唯一实现：Utils.color）
    const bgHex = cr.bgColor || '#000000';
    if (!Utils.hex.isValid(bgHex)) return { ok: false, reason: '背景色无法解析' };

    let bestColor = '#FFFFFF';
    let bestRatio = 0;
    candidates.forEach(c => {
        if (!Utils.hex.isValid(c)) return;
        const ratio = Utils.color.contrastRatio(c, bgHex);
        if (ratio > bestRatio) { bestRatio = ratio; bestColor = c; }
    });

    let changed = 0;
    (page.layers || []).forEach(l => {
        if (l && l.type === 'text') {
            l.color = bestColor;
            changed++;
        }
    });
    return { ok: true, changed, color: bestColor, ratio: Math.round(bestRatio * 100) / 100 };
}
window.smartFixContrast = smartFixContrast;

/* ============================================================
   138. 智能优化建议：把多种检查结果整合成一份可执行的清单
   ============================================================ */
function gatherOptimizationAdvice(spec, options) {
    options = options || {};
    const items = [];
    if (!window.state) return { ok: false, reason: 'state 未就绪', items };

    // 1. 渲染体检
    try {
        if (typeof scanRenderHealth === 'function') {
            const rh = scanRenderHealth();
            if (rh.ok && rh.issues.length) {
                rh.issues.slice(0, 5).forEach(it => {
                    items.push({ level: it.level, text: '[' + it.label + '] ' + it.text, action: 'renderHeal' });
                });
            }
        }
    } catch (e) {}

    // 2. 对比度
    try {
        if (spec && typeof estimateCoverReadability === 'function') {
            const cr = estimateCoverReadability(spec);
            if (cr.ok && cr.risk && cr.risk !== 'low') {
                items.push({ level: 'warn', text: '封面文字对比度偏弱（' + cr.contrast + ':1）', action: 'smartContrast' });
            }
        }
    } catch (e) {}

    // 3. 版式
    try {
        if (typeof suggestLayoutImprovements === 'function') {
            const li = suggestLayoutImprovements(spec);
            li.slice(0, 5).forEach(it => items.push({ level: it.level, text: it.text, action: 'layoutCheck' }));
        }
    } catch (e) {}

    // 4. 风格连贯性
    try {
        if (spec && typeof checkStyleConsistency === 'function') {
            const sc = checkStyleConsistency(spec);
            if (!sc.ok) {
                sc.issues.slice(0, 3).forEach(it => items.push({ level: it.level, text: it.text, action: 'unifyEffects' }));
            }
        }
    } catch (e) {}

    return { ok: true, items };
}
window.gatherOptimizationAdvice = gatherOptimizationAdvice;

/* ============================================================
   142. 全画布智能调优（聚合多步修复，输出进度）
   ============================================================ */
async function runFullAutoOptimize(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const steps = [];
    const before = (typeof scanRenderHealth === 'function') ? scanRenderHealth() : null;

    // 1. 清理空图层
    try {
        let removed = 0;
        (state.pages || []).forEach(p => {
            if (!Array.isArray(p.layers)) return;
            const n0 = p.layers.length;
            p.layers = p.layers.filter(l => {
                if (!l || l.type !== 'text') return true;
                return !!String(l.content || '').replace(/<[^>]*>/g, '').trim();
            });
            removed += (n0 - p.layers.length);
        });
        if (removed > 0) steps.push('清理空图层 ' + removed);
    } catch (e) {}

    // 2. 字距
    try {
        if (typeof healLetterSpacing === 'function') {
            const r = healLetterSpacing({});
            if (r.ok && r.changed > 0) steps.push('字距 ' + r.changed);
        }
    } catch (e) {}

    // 3. 行高
    try {
        if (typeof healLineHeight === 'function') {
            const r = healLineHeight({});
            if (r.ok && r.changed > 0) steps.push('行高 ' + r.changed);
        }
    } catch (e) {}

    // 4. 缺失背景
    try {
        if (typeof fillMissingBackgrounds === 'function') {
            const r = fillMissingBackgrounds({});
            if (r.ok && r.filled > 0) steps.push('补全背景 ' + r.filled);
        }
    } catch (e) {}

    // 5. 特效收敛
    try {
        if (typeof unifyEffects === 'function') {
            const r = unifyEffects({ keep: options.keepEffects || 2 });
            if (r.ok && r.changed > 0) steps.push('特效收敛 ' + r.changed);
        }
    } catch (e) {}

    // 6. 智能对比度（基于画布现状）
    try {
        if (typeof smartFixContrast === 'function' && typeof exportCanvasAsSpec === 'function') {
            const spec = exportCanvasAsSpec();
            if (spec) {
                const r = smartFixContrast(spec, { pageIndex: 0 });
                if (r.ok && r.changed > 0) {
                    // 应用对比度到画布
                    const cur = state.getCurrentPage && state.getCurrentPage();
                    if (cur && cur.layers) {
                        cur.layers.forEach(l => {
                            if (l && l.type === 'text') l.color = r.color;
                        });
                    }
                    steps.push('对比度 ' + r.color);
                }
            }
        }
    } catch (e) {}

    // 7. 保存 & 渲染
    try {
        if (state.history && typeof state.history.record === 'function') state.history.record();
        if (typeof renderAll === 'function') renderAll();
    } catch (e) {}

    const after = (typeof scanRenderHealth === 'function') ? scanRenderHealth() : null;
    return {
        ok: true,
        steps,
        beforeIssues: before ? before.issues.length : null,
        afterIssues: after ? after.issues.length : null
    };
}
window.runFullAutoOptimize = runFullAutoOptimize;

/* ============================================================
   143. AI 输出统计摘要：给用户看一眼最近趋势
   ============================================================ */
function getAiTrendSummary(options) {
    options = options || {};
    const n = options.n || 10;
    const log = (typeof getAppliedLog === 'function') ? getAppliedLog().slice(0, n) : [];
    if (!log.length) return { ok: true, count: 0, items: [], avgPages: 0, avgQuality: 0, topStyle: null };

    const items = log.map(it => ({
        at: it.at,
        label: it.label || '',
        pages: it.pages || 0,
        quality: it.quality || 0,
        style: it.style || null
    }));

    const avgPages = Math.round(items.reduce((s, x) => s + x.pages, 0) / items.length);
    const avgQuality = Math.round(items.reduce((s, x) => s + x.quality, 0) / items.length);

    const styleCount = {};
    items.forEach(x => { if (x.style) styleCount[x.style] = (styleCount[x.style] || 0) + 1; });
    const topStyleId = Object.entries(styleCount).sort((a, b) => b[1] - a[1])[0];
    const topStyle = topStyleId ? { id: topStyleId[0], count: topStyleId[1] } : null;

    return { ok: true, count: items.length, items, avgPages, avgQuality, topStyle };
}
window.getAiTrendSummary = getAiTrendSummary;

/* ============================================================
   144. 项目 base64 快照：给用户一段可粘贴的字符串直接带走整个项目
   格式：dsp1:<base64>  （dsp = douyin snapshot pack）
   ============================================================ */
function encodeProjectSnapshot() {
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    try {
        const payload = {
            v: 1,
            at: Date.now(),
            background: JSON.parse(JSON.stringify(state.background || {})),
            pages: JSON.parse(JSON.stringify(state.pages || [])),
            currentPageId: state.currentPageId,
            guides: JSON.parse(JSON.stringify(state.guides || [])),
            snapEnabled: state.snapEnabled !== false
        };
        const json = JSON.stringify(payload);
        const b64 = btoa(unescape(encodeURIComponent(json)));
        return { ok: true, code: 'dsp1:' + b64, length: json.length, pages: (state.pages || []).length };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
}
window.encodeProjectSnapshot = encodeProjectSnapshot;

async function decodeProjectSnapshot(code, options) {
    options = options || {};
    if (!code) return { ok: false, reason: '空' };
    const text = String(code).trim();
    if (!text.startsWith('dsp1:')) return { ok: false, reason: '不是项目快照格式（需要 dsp1: 开头）' };
    let payload;
    try {
        const b64 = text.slice(5);
        const json = decodeURIComponent(escape(atob(b64)));
        payload = JSON.parse(json);
    } catch (e) {
        return { ok: false, reason: '解码失败：' + e.message };
    }
    if (!payload || !Array.isArray(payload.pages)) return { ok: false, reason: '内容不完整' };
    if (!window.state) return { ok: false, reason: 'state 未就绪' };

    const beforePages = JSON.parse(JSON.stringify(state.pages || []));
    const beforePageId = state.currentPageId;
    const beforeBg = state.background ? JSON.parse(JSON.stringify(state.background)) : null;

    if (options.mode === 'append') {
        state.pages = (state.pages || []).concat(payload.pages);
    } else {
        state.pages = payload.pages;
        state.currentPageId = payload.currentPageId || (payload.pages[0] && payload.pages[0].id);
    }
    if (payload.background && typeof normalizeBackground === 'function') {
        state.background = normalizeBackground(payload.background);
    }
    state.guides = JSON.parse(JSON.stringify(payload.guides || []));
    state.snapEnabled = payload.snapEnabled !== false;

    try {
        window.__aiSpecBackup = {
            appliedAt: Date.now(),
            pages: beforePages,
            currentPageId: beforePageId,
            background: beforeBg
        };
    } catch (e) {}

    if (state.history && typeof state.history.record === 'function') state.history.record();
    if (typeof applyBackgroundToCanvases === 'function') applyBackgroundToCanvases(state.background);
    if (typeof renderAll === 'function') renderAll();
    return { ok: true, pages: state.pages.length, mode: options.mode || 'replace' };
}
window.decodeProjectSnapshot = decodeProjectSnapshot;

/* ============================================================
   145. AI 输出趋势分位数：给可视化面板用
   ============================================================ */
function getAiTrendBuckets(options) {
    options = options || {};
    const n = options.n || 10;
    const log = (typeof getAppliedLog === 'function') ? getAppliedLog().slice(0, n) : [];
    if (!log.length) return { ok: true, count: 0, buckets: [] };

    const buckets = log.map(it => ({
        at: it.at,
        label: it.label || '',
        pages: it.pages || 0,
        quality: it.quality || 0
    }));

    // 质量分位
    const sortedQ = buckets.map(b => b.quality).sort((a, b) => a - b);
    const pick = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;
    const q = {
        min: sortedQ[0] || 0,
        p25: pick(sortedQ, 0.25),
        median: pick(sortedQ, 0.5),
        p75: pick(sortedQ, 0.75),
        max: sortedQ[sortedQ.length - 1] || 0
    };

    return { ok: true, count: buckets.length, buckets, qualityQuartiles: q };
}
window.getAiTrendBuckets = getAiTrendBuckets;

/* ============================================================
   146. AI 输出趋势导出为 CSV
   ============================================================ */
function exportTrendCsv(options) {
    options = options || {};
    const n = options.n || 30;
    const log = (typeof getAppliedLog === 'function') ? getAppliedLog().slice(0, n) : [];
    if (!log.length) return { ok: false, reason: '还没有应用记录' };

    const lines = [];
    lines.push('time,label,pages,quality,style,append');
    log.forEach(it => {
        const time = new Date(it.at).toISOString();
        const label = '"' + String(it.label || '').replace(/"/g, '""') + '"';
        const style = it.style || '';
        lines.push([time, label, it.pages || 0, it.quality || 0, style, it.append ? 'true' : 'false'].join(','));
    });

    return { ok: true, count: log.length, csv: lines.join('\n') };
}
window.exportTrendCsv = exportTrendCsv;

/* ============================================================
   147. 快照清理策略：只保留最近 N 份
   ============================================================ */
function pruneSnapshots(keep) {
    keep = (keep == null) ? 10 : Math.max(1, keep | 0);
    if (typeof getSnapshots !== 'function') return { ok: false, reason: 'getSnapshots 不可用' };
    const KEY = 'douyin_ai_snapshots_v1';
    let list = [];
    try { list = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    if (list.length <= keep) return { ok: true, removed: 0, kept: list.length };
    const removed = list.length - keep;
    list = list.slice(0, keep);
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
    return { ok: true, removed, kept: list.length };
}
window.pruneSnapshots = pruneSnapshots;

/* ============================================================
   148. AI 历史自动清理：保留最近 N 条
   ============================================================ */
function pruneAiHistory(keep) {
    keep = (keep == null) ? 10 : Math.max(1, keep | 0);
    if (typeof getAiHistory !== 'function') return { ok: false, reason: 'getAiHistory 不可用' };
    const KEY = 'douyin_ai_spec_history_v1';
    let list = [];
    try { list = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    if (list.length <= keep) return { ok: true, removed: 0, kept: list.length };
    const removed = list.length - keep;
    list = list.slice(0, keep);
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
    return { ok: true, removed, kept: list.length };
}
window.pruneAiHistory = pruneAiHistory;

/* ============================================================
   149. 全量存储清理：把历史/快照/归档按策略一起裁剪
   ============================================================ */
function pruneAllAiStorage(options) {
    options = options || {};
    const results = {};
    try { results.history = pruneAiHistory(options.historyKeep || 10); } catch (e) { results.history = { ok: false, reason: e.message }; }
    try { results.snapshots = pruneSnapshots(options.snapshotsKeep || 10); } catch (e) { results.snapshots = { ok: false, reason: e.message }; }
    try {
        if (typeof getArchivedSessions === 'function') {
            const list = getArchivedSessions();
            const keep = options.archivesKeep || 20;
            if (list.length > keep) {
                const kept = list.slice(0, keep);
                try { localStorage.setItem('douyin_ai_archives_v1', JSON.stringify(kept)); } catch (e) {}
                results.archives = { ok: true, removed: list.length - keep, kept: keep };
            } else {
                results.archives = { ok: true, removed: 0, kept: list.length };
            }
        } else {
            results.archives = { ok: false, reason: 'getArchivedSessions 不可用' };
        }
    } catch (e) { results.archives = { ok: false, reason: e.message }; }
    return { ok: true, results };
}
window.pruneAllAiStorage = pruneAllAiStorage;

/* ============================================================
   150. 输出趋势内联 SVG（可粘贴到 Markdown / 笔记）
   ============================================================ */
function buildTrendInlineSvg(options) {
    options = options || {};
    const n = options.n || 10;
    const W = 320, H = 80, PAD = 4;
    const log = (typeof getAppliedLog === 'function') ? getAppliedLog().slice(0, n).reverse() : [];
    if (!log.length) return { ok: false, reason: '没有应用记录' };

    const barW = Math.max(4, Math.floor((W - PAD * 2) / Math.max(1, log.length)));
    const maxQ = Math.max(60, ...log.map(it => it.quality || 0));
    const bars = [];
    log.forEach((it, i) => {
        const q = it.quality || 0;
        const h = Math.max(2, Math.round((q / maxQ) * (H - PAD * 2)));
        const x = PAD + i * barW;
        const y = H - PAD - h;
        const color = q >= 80 ? '#7ee787' : (q >= 60 ? '#f1e05a' : '#f85149');
        bars.push('<rect x="' + x + '" y="' + y + '" width="' + (barW - 2) + '" height="' + h + '" fill="' + color + '" rx="1"/>');
    });
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
        '<rect width="' + W + '" height="' + H + '" fill="#0d1117"/>' +
        bars.join('') +
        '<line x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '" stroke="#30363d" stroke-width="1"/>' +
        '</svg>';
    const dataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    return { ok: true, svg, dataUrl, count: log.length, barW };
}
window.buildTrendInlineSvg = buildTrendInlineSvg;

/* ============================================================
   151. 页面级 diff：当前页 vs 某份 spec 对应页
   ============================================================ */
function diffPageAgainstSpec(spec, options) {
    options = options || {};
    if (!window.state || !spec || !Array.isArray(spec.pages)) {
        return { ok: false, reason: '参数无效' };
    }
    const pageIndex = options.pageIndex != null ? options.pageIndex : 0;
    const sp = spec.pages[pageIndex];
    if (!sp) return { ok: false, reason: '该页不存在' };

    const curPage = state.getCurrentPage && state.getCurrentPage();
    if (!curPage) return { ok: false, reason: '当前页为空' };

    const curLayers = (curPage.layers || []).filter(l => l && l.type === 'text');
    const srcLayers = (sp.layers || []).filter(l => l && l.type === 'text');
    const maxLayers = Math.max(curLayers.length, srcLayers.length);
    const changes = [];

    for (let i = 0; i < maxLayers; i++) {
        const a = curLayers[i];
        const b = srcLayers[i];
        const label = '第 ' + (i + 1) + ' 文字层';
        if (!a && b) {
            changes.push({ type: 'add', label, note: '新增' });
            continue;
        }
        if (a && !b) {
            changes.push({ type: 'remove', label, note: '删除' });
            continue;
        }
        if (!a || !b) continue;
        const fields = ['content', 'fontSize', 'color', 'effectClass', 'align', 'bold', 'italic'];
        fields.forEach(f => {
            const va = a[f];
            const vb = b[f];
            const sa = va == null ? '' : String(va);
            const sb = vb == null ? '' : String(vb);
            if (sa !== sb) {
                changes.push({ type: 'change', label, field: f, from: sa, to: sb });
            }
        });
    }

    return {
        ok: true,
        pageIndex,
        pagesDiff: (spec.pages || []).length - (state.pages || []).length,
        currentLayers: curLayers.length,
        srcLayers: srcLayers.length,
        changes
    };
}
window.diffPageAgainstSpec = diffPageAgainstSpec;

/* ============================================================
   152. AI 输出异常归档：把解析失败的原文存档，便于事后排查
   ============================================================ */
const AI_FAIL_ARCHIVE_KEY = 'douyin_ai_fail_archive_v1';
const AI_FAIL_ARCHIVE_MAX = 20;

function pushFailedAiOutput(entry) {
    if (!entry) return;
    try {
        let list = [];
        try { list = JSON.parse(localStorage.getItem(AI_FAIL_ARCHIVE_KEY) || '[]'); } catch (e) { list = []; }
        if (!Array.isArray(list)) list = [];
        list.unshift({
            at: Date.now(),
            length: (entry.raw || '').length,
            raw: String(entry.raw || '').slice(0, 8000),
            error: entry.error || '',
            shape: entry.shape || null
        });
        if (list.length > AI_FAIL_ARCHIVE_MAX) list = list.slice(0, AI_FAIL_ARCHIVE_MAX);
        localStorage.setItem(AI_FAIL_ARCHIVE_KEY, JSON.stringify(list));
    } catch (e) {}
}
window.pushFailedAiOutput = pushFailedAiOutput;

function getFailedAiOutputs() {
    try {
        const list = JSON.parse(localStorage.getItem(AI_FAIL_ARCHIVE_KEY) || '[]');
        return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
}
window.getFailedAiOutputs = getFailedAiOutputs;

function clearFailedAiOutputs() {
    try { localStorage.removeItem(AI_FAIL_ARCHIVE_KEY); } catch (e) {}
}
window.clearFailedAiOutputs = clearFailedAiOutputs;

/* ============================================================
   153. 提示词质量打分：让用户在发给 DeepSeek 前检查提示词
   ============================================================ */
function scorePromptQuality(promptText) {
    if (!promptText || typeof promptText !== 'string') {
        return { ok: false, reason: '空提示词', score: 0, dims: {} };
    }
    const t = promptText;
    const dims = {
        contract: { score: 0, max: 30, note: '' },
        chunkData: { score: 0, max: 25, note: '' },
        styleGuide: { score: 0, max: 20, note: '' },
        rules: { score: 0, max: 15, note: '' },
        length: { score: 0, max: 10, note: '' }
    };

    // 契约
    if (t.includes('douyin-cover-spec')) dims.contract.score += 8;
    if (t.includes('titleCandidates')) dims.contract.score += 6;
    if (t.includes('effectClass')) dims.contract.score += 6;
    if (t.includes('presetId')) dims.contract.score += 5;
    if (t.includes('heightMode')) dims.contract.score += 5;
    dims.contract.note = dims.contract.score >= 25 ? '契约完整' : '契约不完整';

    // 分块
    if (t.includes('douyin-cover-chunks')) dims.chunkData.score += 8;
    if (t.includes('charCount')) dims.chunkData.score += 5;
    if (t.includes('layout')) dims.chunkData.score += 5;
    if (/```json/.test(t)) dims.chunkData.score += 7;
    dims.chunkData.note = dims.chunkData.score >= 20 ? '分块数据齐全' : '缺少分块数据';

    // 风格指南
    if (t.includes('爆款') || t.includes('逆袭')) dims.styleGuide.score += 6;
    if (t.includes('风格') || t.includes('预设')) dims.styleGuide.score += 6;
    if (t.includes('bgPresetId') || t.includes('bgPreset')) dims.styleGuide.score += 4;
    if (t.includes('上次已用风格')) dims.styleGuide.score += 4;
    dims.styleGuide.note = dims.styleGuide.score >= 15 ? '风格指引到位' : '风格指引较少';

    // 规则
    if (t.includes('只输出 JSON')) dims.rules.score += 8;
    if (t.includes('不要解释') || t.includes('不要任何解释')) dims.rules.score += 7;
    dims.rules.note = dims.rules.score >= 12 ? '约束明确' : '输出约束弱';

    // 长度
    const len = t.length;
    if (len > 500) dims.length.score += 5;
    if (len > 2000) dims.length.score += 3;
    if (len > 6000) dims.length.score += 2;
    dims.length.note = len + ' 字符';

    const score = Object.values(dims).reduce((s, d) => s + d.score, 0);
    return {
        ok: score >= 60,
        score,
        dims,
        tips: score < 60 ? ['建议加「复制契约」按钮获取完整契约', '建议先切分块再拼提示词'] : []
    };
}
window.scorePromptQuality = scorePromptQuality;

/* ============================================================
   154. 提示词偏好推荐：根据上下文推荐合适的提示词模式
   ============================================================ */
function recommendPromptMode(options) {
    options = options || {};
    const rawText = options.rawText || '';
    const len = rawText.length;
    const hasLastStyle = !!((typeof getLastStyle === 'function') ? getLastStyle() : null);
    let chunkCount = 0;
    try {
        if (typeof buildChunkPayload === 'function' && rawText) {
            const payload = buildChunkPayload(rawText);
            chunkCount = payload.chunks.length;
        }
    } catch (e) {}

    let recommended = 'full';
    let reason = '';

    if (len > 6000) {
        recommended = 'ultraCompact';
        reason = '输入 ' + len + ' 字符偏长，用极简模式减少 token 更稳';
    } else if (len > 3000) {
        recommended = 'compact';
        reason = '输入 ' + len + ' 字符中等，简洁契约 + 分块即可';
    } else if (chunkCount <= 3 && !hasLastStyle) {
        recommended = 'full';
        reason = '输入短、分块少，完整契约也不会过长，能拿到最好效果';
    } else if (hasLastStyle) {
        recommended = 'compact';
        reason = '已有上次风格记忆，简洁契约足够保持风格';
    } else {
        recommended = 'full';
        reason = '默认推荐完整契约（最稳）';
    }

    return { ok: true, recommended, reason, len, chunkCount, hasLastStyle };
}
window.recommendPromptMode = recommendPromptMode;

/* ============================================================
   155. 批量生成提示词：同一份原文 × 多种提示词模式
   ============================================================ */
function buildAllPromptModes(rawText) {
    if (!rawText) return { ok: false, reason: '无原文', items: [] };
    if (typeof buildDeepSeekPrompt !== 'function') return { ok: false, reason: 'buildDeepSeekPrompt 不可用', items: [] };
    const items = [];
    const modes = [
        { key: 'full', label: '完整契约', opts: { compact: false, ultraCompact: false } },
        { key: 'compact', label: '简洁契约', opts: { compact: true, ultraCompact: false } },
        { key: 'ultraCompact', label: '极简模式', opts: { compact: false, ultraCompact: true } }
    ];
    modes.forEach(m => {
        try {
            const p = buildDeepSeekPrompt(rawText, undefined, m.opts);
            const full = '【系统提示 · 请牢记以下契约】\n\n' + p.system + '\n\n【用户输入 · 请按契约输出 JSON】\n\n' + p.user;
            const q = (typeof scorePromptQuality === 'function') ? scorePromptQuality(full) : { score: 0, dims: {} };
            items.push({
                key: m.key,
                label: m.label,
                prompt: full,
                length: full.length,
                score: q.score,
                dims: q.dims
            });
        } catch (e) {}
    });
    return { ok: true, items };
}
window.buildAllPromptModes = buildAllPromptModes;

/* ============================================================
   156. 批量候选打分：解析多份候选，按质量分排序，附维度明细
   ============================================================ */
function rankSpecCandidates(rawText) {
    if (!rawText) return { ok: false, reason: '空', items: [] };
    let candidates = [];
    try {
        if (typeof extractMultipleSpecs === 'function') {
            candidates = extractMultipleSpecs(rawText);
        }
    } catch (e) {}
    if (!candidates.length) return { ok: false, reason: '没有可解析的候选', items: [] };

    const items = candidates.map((spec, i) => {
        let fixed = spec;
        try { if (typeof fixSpecStructure === 'function') fixed = fixSpecStructure(fixed); } catch (e) {}
        const q = (typeof scoreSpecQuality === 'function') ? scoreSpecQuality(fixed) : { total: 0, dim: {} };
        const cr = (typeof estimateCoverReadability === 'function') ? estimateCoverReadability(fixed) : null;
        const pages = (fixed.pages || []).length;
        const firstText = fixed.pages && fixed.pages[0] && (fixed.pages[0].layers || []).find(l => l && l.type === 'text');
        const title = firstText ? String(firstText.content || '').replace(/<[^>]*>/g, '').slice(0, 24) : '';
        return { index: i, spec: fixed, quality: q.total, dims: q.dim, pages, title, contrast: cr ? cr.contrast : null, risk: cr ? cr.risk : null };
    });

    items.sort((a, b) => b.quality - a.quality);
    return { ok: true, items, count: items.length };
}
window.rankSpecCandidates = rankSpecCandidates;

/* ============================================================
   157. 覆盖率报告：当前画布 vs 所有快照的差异规模
   ============================================================ */
function buildCoverageReport(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const n = options.n || 5;
    const snaps = (typeof getSnapshots === 'function') ? getSnapshots().slice(0, n) : [];
    if (!snaps.length) return { ok: true, items: [], count: 0, message: '还没有快照' };

    const current = (typeof exportCanvasAsSpec === 'function') ? exportCanvasAsSpec() : null;
    if (!current) return { ok: false, reason: '当前画布为空' };

    const items = snaps.map(s => {
        const cmp = (typeof compareSnapshotToCurrent === 'function') ? compareSnapshotToCurrent(s.id) : null;
        return {
            id: s.id,
            label: s.label || '',
            takenAt: s.takenAt,
            changedPct: cmp && cmp.ok ? cmp.changedPct : null,
            totalChanged: cmp && cmp.ok ? cmp.totalChanged : null,
            level: cmp && cmp.ok ? cmp.level : null
        };
    });

    // 覆盖率：平均值
    const known = items.filter(it => it.changedPct != null);
    const avg = known.length ? known.reduce((s, x) => s + x.changedPct, 0) / known.length : null;

    return { ok: true, items, count: items.length, avgChangedPct: avg };
}
window.buildCoverageReport = buildCoverageReport;

/* ============================================================
   158. 智能上下文推荐：给出用户当前最该做的 3 件事
   ============================================================ */
function suggestNextActions(options) {
    options = options || {};
    if (!window.state) return { ok: false, items: [] };
    const items = [];
    const page = state.getCurrentPage && state.getCurrentPage();
    const pages = state.pages || [];
    const pageLayers = page ? (page.layers || []) : [];
    const textLayers = pageLayers.filter(l => l && l.type === 'text');

    // 1. 完全空白
    if (!textLayers.length && pages.length <= 1) {
        items.push({ action: 'paste-and-run', label: '从空白开始', hint: '粘贴原文，点「一键生成提示词」', buttonId: 'ai-one-click' });
        items.push({ action: 'nonai', label: '无 AI 极速通道', hint: '不用 AI 也能生成封面', buttonId: 'ai-quick-nonai' });
        items.push({ action: 'onboarding', label: '查看使用引导', hint: '4 步教你从 0 到 1', buttonId: 'ai-onboarding' });
        return { ok: true, items };
    }

    // 2. 有文字但无背景
    if (textLayers.length > 0 && !(page.bg && (page.bg.presetId || page.bg.color1))) {
        items.push({ action: 'fill-bg', label: '补全背景', hint: '当前页缺少背景', buttonId: 'ai-fill-bg' });
    }

    // 3. 渲染异常
    try {
        if (typeof scanRenderHealth === 'function') {
            const rh = scanRenderHealth();
            if (rh.ok && rh.issues.length > 0) {
                items.push({ action: 'render-heal', label: '修复渲染异常', hint: rh.issues.length + ' 处可自动修复', buttonId: 'ai-full-auto-optimize' });
            }
        }
    } catch (e) {}

    // 4. 对比度
    try {
        if (typeof exportCanvasAsSpec === 'function' && typeof estimateCoverReadability === 'function') {
            const spec = exportCanvasAsSpec();
            const cr = estimateCoverReadability(spec);
            if (cr.ok && cr.risk && cr.risk !== 'low') {
                items.push({ action: 'contrast', label: '智能对比度', hint: '当前对比度 ' + cr.contrast + ':1', buttonId: 'ai-smart-contrast' });
            }
        }
    } catch (e) {}

    // 5. 历史
    try {
        if (typeof getAiHistory === 'function') {
            const h = getAiHistory();
            if (h.length > 0 && items.length < 3) {
                items.push({ action: 'history', label: '查看历史', hint: h.length + ' 条历史方案', buttonId: 'ai-history-select' });
            }
        }
    } catch (e) {}

    // 6. 备份
    if (items.length < 3 && pages.length >= 2) {
        items.push({ action: 'snapshot', label: '导出项目快照', hint: '多页项目建议立即备份', buttonId: 'ai-project-snapshot' });
    }

    // 7. 兜底：提示继续添加
    if (items.length === 0) {
        items.push({ action: 'add-text', label: '添加文字', hint: '选中文字层后可用 AI 特效', buttonId: null });
        items.push({ action: 'ai-more', label: 'AI 生成更多', hint: '重新贴原文生成新版', buttonId: 'ai-one-click' });
        items.push({ action: 'help', label: '查看全部功能', hint: '所有 AI 动作清单', buttonId: 'ai-quick-actions' });
    }

    return { ok: true, items: items.slice(0, 3) };
}
window.suggestNextActions = suggestNextActions;

/* ============================================================
   159. AI 输出前雷达：一次性跑所有预检，给用户一份全景报告
   ============================================================ */
function runPreflightRadar(spec) {
    const report = { ok: true, checks: [] };
    if (!spec || typeof spec !== 'object') {
        return { ok: false, reason: '无 spec', checks: [] };
    }

    // 1. 校验
    let v = { ok: false, errors: [], warnings: [] };
    try { v = validateSpec(spec); } catch (e) {}
    report.checks.push({
        name: '规范校验',
        level: v.ok ? 'ok' : 'error',
        summary: v.ok ? '通过' : v.errors.length + ' 个错误',
        details: v.ok ? [] : v.errors.slice(0, 5)
    });

    // 2. 质量
    let q = { total: 0 };
    try { q = (typeof scoreSpecQuality === 'function') ? scoreSpecQuality(spec) : { total: 0 }; } catch (e) {}
    report.checks.push({
        name: '质量分',
        level: q.total >= 80 ? 'ok' : (q.total >= 60 ? 'warn' : 'error'),
        summary: q.total + ' 分',
        details: []
    });

    // 3. 对比度
    let cr = null;
    try { cr = (typeof estimateCoverReadability === 'function') ? estimateCoverReadability(spec) : null; } catch (e) {}
    if (cr && cr.contrast != null) {
        report.checks.push({
            name: '封面可读性',
            level: cr.risk === 'low' ? 'ok' : (cr.risk === 'medium' ? 'warn' : 'error'),
            summary: cr.contrast + ':1（' + (cr.risk === 'low' ? '良好' : (cr.risk === 'medium' ? '一般' : '偏弱')) + '）',
            details: []
        });
    }

    // 4. 渲染健康（仅当前画布）
    let rh = null;
    try { rh = (typeof scanRenderHealth === 'function') ? scanRenderHealth() : null; } catch (e) {}
    if (rh) {
        report.checks.push({
            name: '当前画布渲染',
            level: rh.issues.length === 0 ? 'ok' : (rh.issues.length <= 3 ? 'warn' : 'error'),
            summary: rh.issues.length === 0 ? '正常' : rh.issues.length + ' 条异常',
            details: rh.issues.slice(0, 5).map(it => '[' + it.label + '] ' + it.text)
        });
    }

    // 5. 意图对齐
    try {
        if (typeof checkIntentAlignment === 'function') {
            const intents = (typeof getDefaultIntents === 'function') ? getDefaultIntents() : {};
            const ia = checkIntentAlignment(spec, intents);
            if (ia && ia.results && ia.results.length) {
                report.checks.push({
                    name: '意图对齐',
                    level: ia.ok ? 'ok' : 'warn',
                    summary: ia.ok ? '通过' : (ia.results.filter(r => !r.ok).length + ' 项未对齐'),
                    details: ia.results.filter(r => !r.ok).map(r => r.name + '：' + r.actual + '（期望 ' + r.expected + '）').slice(0, 5)
                });
            }
        }
    } catch (e) {}

    // 6. 承诺
    try {
        if (typeof extractPromisesFromText === 'function' && typeof comparePromiseToResult === 'function') {
            const chunkTa = document.getElementById('ai-chunk-input');
            const raw = chunkTa ? (chunkTa.value || '') : '';
            if (raw) {
                const promises = extractPromisesFromText(raw);
                const cmp = comparePromiseToResult(promises, spec);
                if (cmp.length) {
                    const allOk = cmp.every(c => c.ok);
                    report.checks.push({
                        name: '原文承诺',
                        level: allOk ? 'ok' : 'warn',
                        summary: allOk ? '达成' : (cmp.filter(c => !c.ok).length + ' 项未达成'),
                        details: cmp.filter(c => !c.ok).map(c => c.name + '：实际 ' + c.actual + ' / 期望 ' + c.expected).slice(0, 5)
                    });
                }
            }
        }
    } catch (e) {}

    report.ok = report.checks.every(c => c.level !== 'error');
    return report;
}
window.runPreflightRadar = runPreflightRadar;

/* ============================================================
   160. 一键修复预检：基于 preflight 结果自动修
   ============================================================ */
async function runPreflightAutoFix(spec, options) {
    options = options || {};
    if (!spec) return { ok: false, reason: '无 spec' };
    const before = (typeof runPreflightRadar === 'function') ? runPreflightRadar(spec) : null;
    const steps = [];

    // 1. 结构 + 字段
    try {
        if (typeof fixSpecStructure === 'function') { spec = fixSpecStructure(spec); steps.push('结构修复'); }
        if (typeof autoFixSpec === 'function') { const r = autoFixSpec(spec); spec = r.spec || spec; steps.push('字段修复'); }
    } catch (e) {}

    // 2. 对比度
    try {
        if (typeof smartFixContrast === 'function') {
            const r = smartFixContrast(spec, { pageIndex: 0 });
            if (r.ok && r.changed > 0) steps.push('对比度 ' + r.color);
        }
    } catch (e) {}

    // 3. 标题规范化
    try {
        if (typeof normalizeAllTitlesInSpec === 'function') {
            const r = normalizeAllTitlesInSpec(spec);
            if (r.changed > 0) steps.push('标题规范化 ' + r.changed);
        }
    } catch (e) {}

    // 4. 背景继承
    try {
        const firstBg = (spec.pages[0] && spec.pages[0].bg) || null;
        if (firstBg) {
            let added = 0;
            spec.pages.forEach((p, i) => { if (i > 0 && !p.bg) { p.bg = JSON.parse(JSON.stringify(firstBg)); added++; } });
            if (added > 0) steps.push('背景继承 ' + added);
        }
    } catch (e) {}

    // 5. 自动装饰
    try {
        if (typeof autoDecorateSpec === 'function') {
            const r = autoDecorateSpec(spec);
            if (r.added > 0) steps.push('自动装饰 ' + r.added);
        }
    } catch (e) {}

    // 6. 校验
    const v = validateSpec(spec);
    const after = (typeof runPreflightRadar === 'function') ? runPreflightRadar(spec) : null;
    return {
        ok: v.ok,
        spec,
        steps,
        beforeOk: before ? before.checks.filter(c => c.level === 'error').length : null,
        afterOk: after ? after.checks.filter(c => c.level === 'error').length : null,
        errors: v.errors,
        warnings: v.warnings
    };
}
window.runPreflightAutoFix = runPreflightAutoFix;

/* ============================================================
   161. AI 趋势指标：多维度聚合，一条命令拿到完整面板数据
   ============================================================ */
function getAiTrendMetrics(options) {
    options = options || {};
    const n = options.n || 20;
    const log = (typeof getAppliedLog === 'function') ? getAppliedLog().slice(0, n) : [];
    if (!log.length) {
        return { ok: true, count: 0, avgQuality: 0, avgPages: 0, styleDiversity: 0, last7Days: 0 };
    }

    let totalQ = 0, totalP = 0;
    const styles = new Set();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let last7 = 0;

    log.forEach(it => {
        totalQ += it.quality || 0;
        totalP += it.pages || 0;
        if (it.style) styles.add(it.style);
        if (it.at >= sevenDaysAgo) last7++;
    });

    return {
        ok: true,
        count: log.length,
        avgQuality: Math.round(totalQ / log.length),
        avgPages: Math.round(totalP / log.length),
        styleDiversity: styles.size,
        styles: Array.from(styles),
        last7Days: last7
    };
}
window.getAiTrendMetrics = getAiTrendMetrics;

/* ============================================================
   162. 全画布质量快照：把一次体检的完整结果归档
   ============================================================ */
const AI_QUALITY_SNAPSHOT_KEY = 'douyin_ai_quality_snapshots_v1';
const AI_QUALITY_SNAPSHOT_MAX = 10;

function takeQualitySnapshot() {
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const spec = (typeof exportCanvasAsSpec === 'function') ? exportCanvasAsSpec() : null;
    if (!spec) return { ok: false, reason: '画布为空' };

    const q = (typeof scoreSpecQuality === 'function') ? scoreSpecQuality(spec) : { total: 0, dim: {} };
    const cr = (typeof estimateCoverReadability === 'function') ? estimateCoverReadability(spec) : null;
    const rh = (typeof scanRenderHealth === 'function') ? scanRenderHealth() : null;
    const refs = (typeof collectSpecAssetRefs === 'function') ? collectSpecAssetRefs(spec) : null;

    const item = {
        at: Date.now(),
        quality: q.total,
        qualityDims: q.dim,
        contrast: cr ? cr.contrast : null,
        readabilityRisk: cr ? cr.risk : null,
        renderIssues: rh ? rh.issues.length : null,
        renderStats: rh ? rh.stats : null,
        assetRefs: refs ? {
            fonts: refs.fonts.length,
            backdrops: refs.backdrops.length,
            bgImages: refs.bgImages.length,
            stickers: refs.stickers.length
        } : null,
        pages: (spec.pages || []).length
    };

    try {
        let list = [];
        try { list = JSON.parse(localStorage.getItem(AI_QUALITY_SNAPSHOT_KEY) || '[]'); } catch (e) { list = []; }
        if (!Array.isArray(list)) list = [];
        list.unshift(item);
        if (list.length > AI_QUALITY_SNAPSHOT_MAX) list = list.slice(0, AI_QUALITY_SNAPSHOT_MAX);
        localStorage.setItem(AI_QUALITY_SNAPSHOT_KEY, JSON.stringify(list));
    } catch (e) {}

    return { ok: true, item };
}
window.takeQualitySnapshot = takeQualitySnapshot;

function getQualitySnapshots() {
    try {
        const list = JSON.parse(localStorage.getItem(AI_QUALITY_SNAPSHOT_KEY) || '[]');
        return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
}
window.getQualitySnapshots = getQualitySnapshots;

function compareQualitySnapshots(a, b) {
    if (!a || !b) return null;
    return {
        qualityDelta: (b.quality || 0) - (a.quality || 0),
        contrastDelta: (b.contrast || 0) - (a.contrast || 0),
        issuesDelta: (b.renderIssues || 0) - (a.renderIssues || 0),
        pagesDelta: (b.pages || 0) - (a.pages || 0)
    };
}
window.compareQualitySnapshots = compareQualitySnapshots;

/* ============================================================
   163. 纯文本趋势摘要（粘到笔记/聊天）
   ============================================================ */
function buildTrendSummaryText() {
    const metrics = (typeof getAiTrendMetrics === 'function') ? getAiTrendMetrics({ n: 20 }) : null;
    const log = (typeof getAppliedLog === 'function') ? getAppliedLog().slice(0, 10) : [];
    if (!metrics || !metrics.ok || metrics.count === 0) return '（无趋势数据）';
    const lines = [];
    lines.push('【AI 应用趋势 · 最近 ' + metrics.count + ' 次】');
    lines.push('平均质量：' + metrics.avgQuality + ' / 100');
    lines.push('平均页数：' + metrics.avgPages + ' 页');
    lines.push('风格多样度：' + metrics.styleDiversity + ' 种');
    lines.push('近 7 天活跃：' + metrics.last7Days + ' 次');
    lines.push('');
    lines.push('历史轨迹：');
    log.slice().reverse().forEach((it, i) => {
        const t = new Date(it.at).toLocaleTimeString();
        lines.push('  #' + (i + 1) + ' [' + t + '] ' + it.pages + ' 页 · 质量 ' + it.quality + (it.style ? (' · ' + it.style) : ''));
    });
    return lines.join('\n');
}
window.buildTrendSummaryText = buildTrendSummaryText;

/* ============================================================
   164. 画布 → 纯文本上下文导出
   ============================================================ */
function exportCanvasAsContextText(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const pages = state.pages || [];
    if (!pages.length) return { ok: false, reason: '项目没有页面' };
    const includeEffects = options.includeEffects !== false;

    const lines = [];
    pages.forEach((p, pi) => {
        lines.push('==== 第 ' + (pi + 1) + ' 页 · ' + (p.title || '') + ' ====');
        const bg = p.bg || (window.state && state.background);
        if (bg) {
            if (bg.presetId) lines.push('背景：预设 ' + bg.presetId);
            else if (bg.color1) lines.push('背景：' + bg.color1 + ' → ' + (bg.color2 || bg.color1));
        }
        (p.layers || []).forEach((l, li) => {
            if (!l || l.type !== 'text') return;
            const content = String(l.content || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '');
            if (!content.trim()) return;
            lines.push('  文字 ' + (li + 1) + '（' + (l.fontSize || '?') + ' · ' + (l.color || '') + (includeEffects && l.effectClass ? ' · 特效 ' + l.effectClass : '') + '）：');
            content.split('\n').forEach(line => lines.push('    ' + line));
        });
        lines.push('');
    });

    return { ok: true, text: lines.join('\n'), pages: pages.length };
}
window.exportCanvasAsContextText = exportCanvasAsContextText;

/* ============================================================
   165. 智能场景推荐：按当前画布文字匹配 Top3 风格
   ============================================================ */
function suggestStylesForCanvas(options) {
    options = options || {};
    if (!window.state) return { ok: false, items: [] };
    const page = state.getCurrentPage && state.getCurrentPage();
    if (!page) return { ok: false, items: [] };

    const texts = (page.layers || []).filter(l => l && l.type === 'text');
    if (!texts.length) return { ok: true, items: [] };
    const content = texts.map(t => String(t.content || '').replace(/<[^>]*>/g, '')).join(' ');

    const presets = window.AI_STYLE_PRESETS || [];
    if (!presets.length) return { ok: false, items: [], reason: '未加载风格预设' };

    const scores = presets.map(st => {
        let score = 0;
        const hits = [];
        (st.keywords || []).forEach(k => {
            if (content.includes(k)) {
                score += 3;
                hits.push(k);
            }
        });
        return { style: st, score, hits };
    });

    scores.sort((a, b) => b.score - a.score);
    const items = scores.slice(0, 3).map((s, i) => ({
        rank: i + 1,
        styleId: s.style.id,
        name: s.style.name,
        score: s.score,
        hits: s.hits,
        reason: s.score === 0 ? '通用兜底（无可匹配关键词）' : '命中关键词：' + s.hits.join('、')
    }));
    return { ok: true, items, content };
}
window.suggestStylesForCanvas = suggestStylesForCanvas;

/* ============================================================
   166. 结构提示语：把当前 spec 转成一句话，供 AI 二次打磨
   ============================================================ */
function buildStructureHintPrompt(spec) {
    if (!spec || !Array.isArray(spec.pages) || !spec.pages.length) {
        return { ok: false, reason: 'spec 无效' };
    }

    const pages = spec.pages;
    const totalText = pages.reduce((s, p) => s + ((p.layers || []).filter(l => l && l.type === 'text').length), 0);
    const effects = new Set();
    const colors = new Set();
    const fonts = new Set();
    pages.forEach(p => (p.layers || []).forEach(l => {
        if (!l || l.type !== 'text') return;
        if (l.effectClass) effects.add(l.effectClass);
        if (l.color) colors.add(String(l.color).toUpperCase());
        if (l.fontFamily) fonts.add(l.fontFamily);
    }));

    const q = (typeof scoreSpecQuality === 'function') ? scoreSpecQuality(spec) : { total: 0 };
    const cr = (typeof estimateCoverReadability === 'function') ? estimateCoverReadability(spec) : null;

    const lines = [];
    lines.push('## 当前画布结构快照');
    lines.push('- 页数：' + pages.length);
    lines.push('- 文字图层：' + totalText);
    lines.push('- 特效：' + (effects.size ? Array.from(effects).join(', ') : '无'));
    lines.push('- 主色：' + (colors.size ? Array.from(colors).slice(0, 5).join(', ') : '无'));
    lines.push('- 主字体：' + (fonts.size ? Array.from(fonts).slice(0, 3).join(', ') : '无'));
    lines.push('- 质量分：' + q.total + ' / 100');
    if (cr && cr.contrast != null) {
        lines.push('- 封面可读性：' + cr.contrast + ':1（' + cr.risk + '）');
    }
    lines.push('');
    lines.push('## 请帮我');
    lines.push('在保持当前结构（页数、文字内容、主流风格）不变的前提下，进行如下改进：');
    if (q.total < 60) lines.push('- 提升视觉冲击力（更强特效或更鲜明的主色）');
    if (cr && cr.risk !== 'low') lines.push('- 提升封面文字对比度（暗底亮字或亮底暗字）');
    if (colors.size > 5) lines.push('- 收敛配色到 2-3 种主色');
    if (effects.size > 3) lines.push('- 特效种类收敛到 2 种以内');
    lines.push('- 严格按契约只输出完整 JSON，不要任何解释');
    lines.push('');

    return { ok: true, text: lines.join('\n'), context: { pages: pages.length, totalText, q: q.total } };
}
window.buildStructureHintPrompt = buildStructureHintPrompt;

console.log('[AiSpec] ✅ …/场景推荐/结构提示语 就位');

/* ============================================================
   139. 最终资产清单：一页汇总所有依赖 + 质量 + 品牌约束
   ============================================================ */
function buildFinalAssetsReport(spec) {
    if (!window.state) return { ok: false, reason: 'state 未就绪' };
    const currentSpec = spec || ((typeof exportCanvasAsSpec === 'function') ? exportCanvasAsSpec() : null);
    if (!currentSpec) return { ok: false, reason: '无法读取画布' };

    const refs = (typeof collectSpecAssetRefs === 'function') ? collectSpecAssetRefs(currentSpec) : { fonts: [], backdrops: [], bgImages: [], stickers: [] };
    const quality = (typeof scoreSpecQuality === 'function') ? scoreSpecQuality(currentSpec) : { total: 0, dim: {} };
    const readability = (typeof estimateCoverReadability === 'function') ? estimateCoverReadability(currentSpec) : null;
    const health = (typeof scanRenderHealth === 'function') ? scanRenderHealth() : null;

    const pages = currentSpec.pages || [];
    const backgrounds = pages.map((p, i) => ({
        page: i + 1,
        presetId: (p && p.bg && p.bg.presetId) || null,
        color1: (p && p.bg && p.bg.color1) || null,
        type: (p && p.bg && p.bg.type) || null
    }));

    // 品牌约束
    let brand = { colors: [], fonts: [], strictMode: false };
    try {
        if (window.BrandManager) {
            brand = {
                colors: (BrandManager.getAllColors && BrandManager.getAllColors()) || [],
                fonts: ((BrandManager.data && BrandManager.data.fonts) || []).map(f => f.name),
                strictMode: !!(BrandManager.data && BrandManager.data.strictMode)
            };
        }
    } catch (e) {}

    return {
        ok: true,
        generatedAt: new Date().toISOString(),
        pagesCount: pages.length,
        quality: quality.total,
        qualityDims: quality.dim,
        readability,
        renderHealth: health ? { issues: health.issues.length, stats: health.stats } : null,
        assetRefs: refs,
        backgrounds,
        brand
    };
}
window.buildFinalAssetsReport = buildFinalAssetsReport;

/* ============================================================
   140. 输出形状探测：先看形状，再看内容，便于快速判断
   ============================================================ */
function probeRawShape(rawText) {
    const result = { ok: true, shape: 'unknown', topKeys: [], candidatesCount: 0, hasCodeBlock: false };
    if (!rawText) { result.shape = 'empty'; return result; }
    const text = String(rawText);
    result.hasCodeBlock = /```(?:json)?/i.test(text);

    try {
        if (typeof extractMultipleSpecs === 'function') {
            const list = extractMultipleSpecs(rawText);
            result.candidatesCount = list.length;
        }
    } catch (e) {}

    if (result.candidatesCount > 0) {
        result.shape = 'spec';
        return result;
    }

    // 不是 spec 时看看有没有单个 JSON
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        const inner = text.slice(firstBrace, lastBrace + 1);
        try {
            const obj = JSON.parse(inner);
            result.shape = Array.isArray(obj) ? 'array' : 'object';
            if (result.shape === 'object') {
                result.topKeys = Object.keys(obj).slice(0, 8);
            }
        } catch (e) { result.shape = 'json-like-broken'; }
    } else if (text.indexOf('[') >= 0 && text.lastIndexOf(']') > text.indexOf('[')) {
        result.shape = 'array-like';
    } else {
        result.shape = 'text';
    }
    return result;
}
window.probeRawShape = probeRawShape;

/* ============================================================
   141. 离线增强标题预览：批量变体一次性返回，不弹窗
   ============================================================ */
function previewTitleVariants(options) {
    options = options || {};
    if (!window.state) return { ok: false, reason: 'state 未就绪', variants: [] };
    const page = state.getCurrentPage && state.getCurrentPage();
    if (!page) return { ok: false, reason: '当前页不存在', variants: [] };
    const firstText = (page.layers || []).find(l => l && l.type === 'text');
    if (!firstText) return { ok: false, reason: '当前页没有文字图层', variants: [] };
    const seed = String(firstText.content || '').replace(/<[^>]*>/g, '').split('\n')[0].trim();
    if (!seed) return { ok: false, reason: '标题为空', variants: [] };

    const variants = new Set();
    variants.add(seed);

    // 数字冲击
    if (!/\d/.test(seed)) {
        variants.add('3 个 ' + seed);
        variants.add('5 分钟看懂 ' + seed);
    }
    // 疑问
    if (!/[?？]$/.test(seed)) variants.add(seed + '？');
    // 情绪
    variants.add(seed + '！');
    // 承诺
    if (!/建议收藏|一定要看/.test(seed)) variants.add(seed + '，建议收藏');
    // 揭秘
    if (!/^(揭秘|劝你)/.test(seed)) variants.add('揭秘 ' + seed);
    // 对比
    variants.add('别再傻傻地' + seed + '了');

    // 金句扩展
    try {
        if (typeof expandTitleWithPatterns === 'function') {
            expandTitleWithPatterns(seed).forEach(t => { if (t && t !== seed) variants.add(t); });
        }
    } catch (e) {}

    return { ok: true, variants: Array.from(variants).slice(0, 10), seed };
}
window.previewTitleVariants = previewTitleVariants;

// 幂等追加：确保 title 变体预览已注册
(function ensureTitlePreviewReady() {
    if (typeof window.previewTitleVariants === 'function') {
        console.log('[AiSpec] ✅ …/标题变体预览 已注册');
    } else {
        console.warn('[AiSpec] ⚠️ previewTitleVariants 未注册');
    }
})();

console.log('[AiSpec] ✅ …/输出形状探测/标题变体预览 就位');

// 加载完成自检：检查 UI 会依赖的关键函数是否都存在
(function ensureAiSpecApiComplete() {
    const required = [
        'validateSpec', 'validateSpecStrict', 'autoFixSpec', 'autoHealSpec',
        'chunkBySeparator', 'buildChunkPayload', 'decideLayout', 'buildFallbackSpec',
        'buildDeepSeekPrompt', 'buildCompactSystemPrompt', 'buildMinimalPrompt',
        'applyCoverSpec', 'applySingleChunk', 'applyAllChunks', 'undoAiSpecApply',
        'exportCanvasAsSpec', 'exportSpecAsFewShot', 'exportLayeredSpec',
        'detectOverflows', 'diffSpecAgainstCanvas',
        'scoreSpecQuality', 'estimateCoverReadability', 'recommendNextAction',
        'selfCheckSpec', 'selfTestAiSpecPipeline', 'aiPanelHealthCheck',
        'getAiHistory', 'pushAiHistory', 'clearAiHistory',
        'getUserTemplates', 'saveSpecAsUserTemplate', 'deleteUserTemplate',
        'getSnapshots', 'takeCanvasSnapshot', 'restoreSnapshot', 'clearSnapshots',
        'getArchivedSessions', 'archiveAiSession', 'removeArchivedSession', 'clearArchivedSessions',
        'getAppliedLog', 'logSpecApply', 'clearAppliedLog',
        'getAiStats', 'pushAiStats', 'clearAiStats',
        'getIterationSession', 'pushIterationRound', 'clearIterationSession',
        'encodeSyncCode', 'applySyncCode',
        'exportFullProjectPack', 'importFullProjectPack',
        'saveAiSessionState', 'loadAiSessionState',
        'getDefaultIntents', 'buildIntentFromText', 'checkIntentAlignment',
        'listAiQuickActions', 'listAiShortcuts', 'listAllTemplates', 'applyAnyTemplate',
        'buildVisualCombos', 'generateMultiStyleSpecs',
        'buildQuickSummaryText', 'extractTitleFromRaw', 'generateLocalTitleCandidates',
        'extractKeywordsFromText', 'highlightRawSegments', 'extractAllJsonSnippets',
        'repairAiJsonText', 'repairTruncatedJson',
        'diagnoseRawInput', 'buildErrorFixSuggestions',
        'saveDebugSnapshot', 'getDebugSnapshot',
        'checkAiSpecDependencies', 'checkSetupReadiness',
        'downloadSpecContractMarkdown', 'describeSpecHuman', 'exportSpecAsJsSnippet',
        'normalizeTitleText', 'normalizeAllTitlesInSpec',
        'unifyFontSizes', 'unifyLetterSpacings', 'unifyEffects', 'unifyTextAlignment',
        'autoSoftWrap', 'snapToSafeArea', 'replaceColorAcrossCanvas',
        'removeEmptyPages', 'duplicateCurrentPage',
        'pickBackgroundForText', 'pickStyleForText', 'getStyleById',
        'renderSpecThumbnail', 'checkSpecCompatibility', 'migrateSpecToLatest',
        'previewTitleVariants', 'scanRenderHealth', 'fullRenderHeal',
        'smartFixContrast', 'gatherOptimizationAdvice', 'buildFinalAssetsReport',
        'probeRawShape', 'healLetterSpacing', 'healLineHeight',
        'fillMissingBackgrounds', 'compareSnapshotToCurrent',
        'switchSpecLayoutMode', 'runApplyPipeline'
    ];
    const missing = required.filter(n => typeof window[n] !== 'function');
    if (missing.length) {
        console.warn('[AiSpec] ⚠️ 以下函数未导出到 window：', missing.join(', '));
    } else {
        console.log('[AiSpec] ✅ 全部 ' + required.length + ' 个公共函数已就位');
    }
    window.__AI_SPEC_API_MISSING__ = missing;
    // 供外部快速核对：window.AI_SPEC_STATUS.ready / missing
    window.AI_SPEC_STATUS = { ready: missing.length === 0, missing: missing.slice() };
})();