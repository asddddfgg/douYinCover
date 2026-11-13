/* ============================================================
 * auto-design-core.js — 本地自动设计引擎（纯函数层）
 * ------------------------------------------------------------
 * 职责：文案分析 / 分页 / 文本测算 / 品牌色角色推导 / 三套方案 / 自校验
 * 边界：不碰 DOM、不读 window、不写 state、不依赖任何其它业务模块
 * 为什么纯函数：可 node --test、结果可复现、浏览器只负责"画出来"
 * 输出契约：与现有编辑器图层模型 1:1 对齐
 *   text 图层：x/y/width/height/fontSize('44px')/fontFamily/color/bgColor/
 *              bgRadius/bgPadding/bold/align/letterSpacing('1px')/lineHeight/opacity/effectClass
 *   shape 图层：shapeKind/fill/stroke/strokeWidth/cornerRadius
 *   page.bg   ：{ type, color1, color2, angle, texture, presetId, overlayColor, overlayOpacity }
 * 加载：随时可加载，无依赖。浏览器 → window.AutoDesignCore，node → module.exports
 * ============================================================ */
(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.AutoDesignCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // ---------- 0. 常量 ----------
    var CANVAS = { W: 360, H: 640 };
    // 抖音竖版安全区：上 46 遮标题栏，下 62 遮操作栏，左右 28 留呼吸
    // 底部再向上预留一行正文（默认 20px × 1.6 ≈ 32px），给页码/操作栏留呼吸
    var CONTENT_LINE_HEIGHT = 32;
    var SAFE = { l: 28, r: 28, t: 46, b: 62, contentBottom: CANVAS.H - 62 - CONTENT_LINE_HEIGHT };
    var CONTENT_W = CANVAS.W - SAFE.l - SAFE.r;   // 304
    var CONTENT_H = CANVAS.H - SAFE.t - SAFE.b - CONTENT_LINE_HEIGHT;   // 500
    var DEFAULT_COLORS = ['#FF0050', '#00F2FE', '#111111', '#FFFFFF'];
    var DEFAULT_BG = '#F5F1E8';
    var NO_START = /^[。，、．,.！？!?：:；;）)\]】》」』”’…·%‰]$/;
    // 特效家族的"安全优先级"：描边/阴影/渐变这类只作用于字形，最不容易翻车
    var FAMILY_RANK = { stroke: 1, shadow: 2, gradient: 3, extrude: 4, texture: 5, glow: 6 };
    // 丰富度档位：clean=极简  subtle=标准（默认）  bold=强烈
    var RICHNESS = ['clean', 'subtle', 'bold'];

    // ---------- 1. 基础工具 ----------
    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
    function round(v) { return Math.round(v * 100) / 100; }
    function num(v, d) { var n = Number(v); return Number.isFinite(n) ? n : d; }
    function chars(s) { return Array.from(String(s == null ? '' : s)); }
    function charLen(s) { return chars(s).length; }
    function uniq(list) {
        var seen = {}, out = [];
        list.forEach(function (x) { if (!x || seen[x]) return; seen[x] = 1; out.push(x); });
        return out;
    }
    function stripHtml(s) {
        return String(s == null ? '' : s)
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]*>/g, '');
    }
    function escHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
    function unescHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
    }

    // ---------- 2. 颜色（与 utils.js 同口径：WCAG 相对亮度） ----------
    function normHex(raw) {
        if (raw === undefined || raw === null) return null;
        var s = String(raw).trim();
        var m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (m) {
            var to2 = function (n) {
                return clamp(parseInt(n, 10) || 0, 0, 255).toString(16).padStart(2, '0');
            };
            return ('#' + to2(m[1]) + to2(m[2]) + to2(m[3])).toUpperCase();
        }
        s = s.replace(/^#+/, '').replace(/[^0-9a-fA-F]/g, '');
        if (s.length === 3) s = s.split('').map(function (c) { return c + c; }).join('');
        if (s.length !== 6) return null;
        return ('#' + s).toUpperCase();
    }
    function hexToRgb(h) {
        var v = normHex(h);
        if (!v) return null;
        return { r: parseInt(v.slice(1, 3), 16), g: parseInt(v.slice(3, 5), 16), b: parseInt(v.slice(5, 7), 16) };
    }
    function srgbToLin(c) {
        var v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    function luminance(h) {
        var c = hexToRgb(h);
        if (!c) return 0;
        return 0.2126 * srgbToLin(c.r) + 0.7152 * srgbToLin(c.g) + 0.0722 * srgbToLin(c.b);
    }
    function contrast(a, b) {
        var la = luminance(a), lb = luminance(b);
        var hi = Math.max(la, lb), lo = Math.min(la, lb);
        return (hi + 0.05) / (lo + 0.05);
    }
    function saturation(h) {
        var c = hexToRgb(h);
        if (!c) return 0;
        var r = c.r / 255, g = c.g / 255, b = c.b / 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        if (max === min) return 0;
        var l = (max + min) / 2;
        return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
    }
    // 混色只用于构造背景过渡/遮罩，不作为图层文字色
    function mixHex(a, b, t) {
        var A = hexToRgb(a), B = hexToRgb(b);
        if (!A || !B) return normHex(a) || DEFAULT_BG;
        var k = clamp(num(t, 0), 0, 1);
        var to2 = function (x) { return clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0'); };
        return ('#' + to2(A.r + (B.r - A.r) * k) + to2(A.g + (B.g - A.g) * k) + to2(A.b + (B.b - A.b) * k)).toUpperCase();
    }

    // ---------- 3. 文本测量与换行 ----------
    // 默认用相对字宽表估算；浏览器会注入 canvas measureText，让估算与真实渲染同口径
    var CJK_RE = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/;
    var EMOJI_RE = /[\uD800-\uDBFF][\uDC00-\uDFFF]/;

    function charRatio(ch) {
        var cp = ch.codePointAt(0);
        if (ch === ' ' || ch === '\t') return 0.30;
        if (ch === '\u3000') return 1.0;
        if (cp < 0x7F) {
            if (/[A-Z]/.test(ch)) return 0.62;
            if (/[a-z]/.test(ch)) return 0.53;
            if (/[0-9]/.test(ch)) return 0.56;
            if (/[.,:;'!|]/.test(ch)) return 0.28;
            if (/[mwMW]/.test(ch)) return 0.82;
            return 0.55;
        }
        if (CJK_RE.test(ch)) return 1.0;
        if (EMOJI_RE.test(ch)) return 1.06;
        return 0.72;
    }
    function estimateWidth(str, fontSize, letterSpacing) {
        var w = 0, ls = num(letterSpacing, 0), list = chars(str);
        for (var i = 0; i < list.length; i++) w += charRatio(list[i]) * fontSize + ls;
        return w;
    }
    function isLatinWord(ch) { return /[A-Za-z0-9'’\-]/.test(ch || ''); }

    /**
     * 贪心换行：中文避头点（标点不另起一行）、拉丁词不从中间断开
     * @param {string} text
     * @param {{width:number,fontSize:number,letterSpacing?:number,measure?:Function}} o
     * @returns {string[]}
     */
    function wrapLines(text, o) {
        o = o || {};
        var width = Math.max(24, num(o.width, CONTENT_W));
        var fs = Math.max(6, num(o.fontSize, 28));
        var ls = num(o.letterSpacing, 0);
        var measure = typeof o.measure === 'function'
            ? o.measure
            : function (s) { return estimateWidth(s, fs, ls); };
        var out = [];

        String(text == null ? '' : text).split(/\n/).forEach(function (par) {
            if (!par) { out.push(''); return; }
            var list = chars(par), line = '', i = 0, guard = 0;
            while (i < list.length && guard++ < 20000) {
                var ch = list[i];
                if (line === '' || measure(line + ch) <= width) {
                    line += ch;
                    i++;
                    while (i < list.length && NO_START.test(list[i]) && measure(line + list[i]) <= width * 1.03) {
                        line += list[i];
                        i++;
                    }
                    continue;
                }
                // 拉丁词中间不断行：回退到上一个空格
                if (isLatinWord(ch) && isLatinWord(list[i - 1])) {
                    var sp = line.lastIndexOf(' ');
                    if (sp > 0) {
                        out.push(line.slice(0, sp));
                        line = line.slice(sp + 1);
                        continue;
                    }
                }
                out.push(line);
                line = '';
            }
            if (line !== '') out.push(line);
        });
        return out;
    }

    /**
     * 标题均衡断行（text-balance 简化版）
     * 贪心换行常出现「7 字 + 4 字」长短悬殊；在保持行数不变的前提下，
     * 找一个更窄的可用宽度让各行长度更接近。
     */
    function balancedLines(text, o) {
        var measure = o.measure || (function (s) { return estimateWidth(s, o.fontSize, o.letterSpacing); });
        var scoreOf = function (lines) {
            var ws = lines.map(function (l) { return measure(l); });
            return Math.max.apply(null, ws) - Math.min.apply(null, ws);
        };
        var base = wrapLines(text, Object.assign({}, o, { measure: measure }));
        if (base.length <= 1) return base;
        var best = base, bestScore = scoreOf(base);
        for (var f = 0.96; f >= 0.55; f -= 0.04) {
            var lines = wrapLines(text, Object.assign({}, o, {
                width: Math.max(40, o.width * f), measure: measure
            }));
            if (lines.length !== base.length) continue;
            var s = scoreOf(lines);
            if (s < bestScore - 0.5) { best = lines; bestScore = s; }
        }
        return best;
    }

    function measureFor(o, size) {
        if (typeof o.measureFactory === 'function') {
            try { return o.measureFactory(size, o); } catch (e) { return null; }
        }
        return o.measure || null;
    }

    /** 在字号阶梯里挑一个能塞进 maxHeight 的字号 */
    function fitText(text, o) {
        o = o || {};
        var sizes = (o.sizes || []).filter(function (s) { return s > 0; });
        if (!sizes.length) sizes = [40, 36, 32, 28, 24, 20, 18, 16];
        var lh = num(o.lineHeight, 1.2), maxH = num(o.maxHeight, CONTENT_H);
        var minS = num(o.minSize, sizes[sizes.length - 1]);
        for (var i = 0; i < sizes.length; i++) {
            var s = sizes[i];
            if (s < minS) break;
            var measure = measureFor(o, s);
            var lines = wrapLines(text, {
                width: o.width, fontSize: s, letterSpacing: o.letterSpacing, measure: measure || undefined
            });
            var h = lines.length * s * lh;
            if (h <= maxH) {
                if (o.balance) {
                    var bal = balancedLines(text, {
                        width: o.width, fontSize: s, letterSpacing: o.letterSpacing, measure: measure
                    });
                    if (bal.length === lines.length) lines = bal;
                }
                return { fontSize: s, lines: lines, height: h, ok: true };
            }
        }
        var last = Math.max(minS, sizes[sizes.length - 1]);
        var lastLines = wrapLines(text, {
            width: o.width, fontSize: last, letterSpacing: o.letterSpacing, measure: measureFor(o, last) || undefined
        });
        return { fontSize: last, lines: lastLines, height: lastLines.length * last * lh, ok: false };
    }

    // ---------- 4. 文案分析 ----------
    function normalizeText(raw) {
        return String(raw == null ? '' : raw)
            .replace(/\r\n?/g, '\n')
            .replace(/\u00a0/g, ' ')
            .replace(/[\u200b-\u200d\ufeff]/g, '')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function splitSentences(text) {
        var out = [], buf = '';
        chars(text).forEach(function (ch) {
            if (ch === '\n') {
                if (buf.trim()) out.push(buf.trim());
                buf = '';
                return;
            }
            buf += ch;
            if (/[。！？!?；;…]/.test(ch)) {
                if (buf.trim()) out.push(buf.trim());
                buf = '';
            }
        });
        if (buf.trim()) out.push(buf.trim());
        return out;
    }

    function splitClauses(text, maxLen) {
        var out = [];
        String(text).split(/(?<=[，,、：:；;])/).forEach(function (p) {
            var s = p.trim();
            if (!s) return;
            if (charLen(s) <= maxLen) { out.push(s); return; }
            var list = chars(s);
            for (var i = 0; i < list.length; i += maxLen) out.push(list.slice(i, i + maxLen).join(''));
        });
        return out;
    }

    /**
     * 只去掉真正的"列表标记"，绝不吞正文：
     *   "1. xxx" / "① xxx" / "· xxx" / "- xxx" 会被去掉标记
     *   "99%的孩子…" 这种以数字开头的正文必须原样保留
     */
    function cleanTitle(raw) {
        var s = String(raw || '').replace(/^[\s\u3000]+/, '');
        s = s.replace(/^["'“”‘’【】\[\]（）()《》]+/, '');
        s = s.replace(/^(?:\d{1,2}[.、)）]\s*|[①-⑳]\s*|[-*#>·•]\s+)/, '');
        s = s.replace(/[。！？!?；;…，,、：:\s]+$/, '');
        return s.trim();
    }

    /** 标题/小标题用语：只抹掉句尾标点，不动任何正文内容 */
    function trimTailPunct(raw) {
        return String(raw == null ? '' : raw).replace(/[。！？!?；;…]+$/, '').trim();
    }

    function hasCjk(text) { return CJK_RE.test(String(text || '')); }

    /**
     * @param {string} raw 用户粘贴的原始文案
     * @param {{title?:string}} [opts]
     */
    function analyze(raw, opts) {
        opts = opts || {};
        var plain = normalizeText(raw);
        var paragraphs = plain.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
        var sentences = splitSentences(plain);
        var charCount = charLen(plain.replace(/\s/g, ''));
        var explicit = String(opts.title || '').trim();
        var title = '', body = plain, consumed = 0;

        if (explicit) {
            title = explicit;
        } else if (sentences.length) {
            // ✅ 能吃掉的那一句：只抹句尾标点，保证"标题 + 正文"拼起来仍是原文
            var firstTrim = trimTailPunct(sentences[0]);
            if (charLen(firstTrim) >= 4 && charLen(firstTrim) <= 22) {
                title = firstTrim;
                consumed = 1;
            } else {
                // 太长的第一句不能吃（否则会丢内容），只截一个从句当标题，正文保留全文
                var cleaned = cleanTitle(sentences[0]);
                var clause = cleanTitle(String(cleaned).split(/[，,、：:]/)[0]);
                title = charLen(clause) >= 4
                    ? chars(clause).slice(0, 18).join('')
                    : chars(cleaned || plain).slice(0, 16).join('');
            }
        } else {
            title = chars(plain).slice(0, 16).join('');
        }

        // 正文 = 原文去掉被标题吃掉的那一句（不摘要、不改写）
        if (consumed && !explicit) {
            var idx = plain.indexOf(sentences[0]);
            body = idx >= 0
                ? plain.slice(idx + sentences[0].length).replace(/^\s+/, '')
                : sentences.slice(1).join('\n');
        }
        if (!body.trim() && sentences.length > 1) body = sentences.slice(1).join('\n');

        return {
            raw: plain,
            plain: plain,
            paragraphs: paragraphs,
            sentences: sentences,
            sentenceCount: sentences.length,
            charCount: charCount,
            hasCjk: hasCjk(plain),
            title: title,
            titleExplicit: !!explicit,
            body: body,
            contentLength: charCount <= 60 ? 'short' : (charCount <= 220 ? 'medium' : 'long'),
            keywords: pickKeywords(plain, title),
            // 正文按句换行：中文长句挤成一块会像"墙"，逐句成行更像成品排版
            joiner: '\n'
        };
    }

    function pickKeywords(text, title) {
        var stop = {};
        ('的了是在我你他她它们这那就也都和与及而但或一个我们你们他们因为所以如果这样那样自己'
        ).split('').forEach(function (c) { stop[c] = 1; });
        var freq = {};
        var src = String(text || '');
        // 只在「连续中文串」内部取 n-gram，避免切出「、弄」「动，」这类噪音
        src.split(/[^\u4e00-\u9fff]+/).filter(function (s) { return charLen(s) >= 2; })
            .forEach(function (run) {
                var r = chars(run).join('');
                for (var n = 2; n <= 3; n++) {
                    for (var i = 0; i + n <= r.length; i++) {
                        var g = r.slice(i, i + n), bad = false;
                        for (var k = 0; k < g.length; k++) if (stop[g[k]]) { bad = true; break; }
                        if (bad) continue;
                        freq[g] = (freq[g] || 0) + 1;
                    }
                }
            });
        (src.match(/[A-Za-z][A-Za-z0-9\-]{2,}/g) || []).forEach(function (w) {
            freq[w] = (freq[w] || 0) + 2;
        });
        var titleStr = String(title || '');
        var list = Object.keys(freq).map(function (w) {
            var score = freq[w] * 10 + Math.min(w.length, 4) * 2;
            if (titleStr.indexOf(w) >= 0) score += 6;
            return { w: w, score: score, f: freq[w] };
        }).filter(function (x) {
            // 只留「出现过 ≥2 次」的词，避免把标题里的半截短语当关键词
            return x.f >= 2;
        }).sort(function (a, b) {
            if (b.score !== a.score) return b.score - a.score;
            return a.w < b.w ? -1 : 1;
        });
        var picked = [];
        list.forEach(function (x) {
            if (picked.length >= 4) return;
            var dup = picked.some(function (p) { return p.indexOf(x.w) >= 0 || x.w.indexOf(p) >= 0; });
            if (!dup) picked.push(x.w);
        });
        // 兜底：长文里找不到重复词时，取标题前 8 字作为主题词
        if (!picked.length && titleStr) picked.push(chars(cleanTitle(titleStr)).slice(0, 8).join(''));
        return picked;
    }

    // ---------- 5. 分页（语义优先，不按固定字数硬切） ----------
    function joinUnits(units, joiner) {
        return (units || []).join(joiner == null ? '' : joiner);
    }

    function paginate(analysis, opts) {
        opts = opts || {};
        var capacity = clamp(num(opts.charsPerPage, 118), 40, 400);
        // ✅ 除了字数，还要按"行数"限额：一堆两三个字的短行总字数不多，
        //    但会撑满整页（这是之前"文字压到页脚/越出安全区"的真正原因）。
        var maxLines = clamp(num(opts.maxLines, 9), 2, 40);
        var charsPerLine = clamp(num(opts.charsPerLine, 13), 4, 60);
        var body = String((analysis && analysis.body) || '');
        var joiner = analysis && analysis.joiner != null ? analysis.joiner : '';
        var units = [];

        body.split(/\n/).forEach(function (par) {
            var t = par.trim();
            if (!t) return;
            splitSentences(t).forEach(function (s) {
                if (charLen(s) > capacity * 1.25) {
                    splitClauses(s, Math.ceil(capacity * 0.7)).forEach(function (c) {
                        if (c.trim()) units.push(c.trim());
                    });
                } else {
                    units.push(s);
                }
            });
        });

        var groups = [], cur = [], curLen = 0, curLines = 0;
        units.forEach(function (u) {
            var l = charLen(u);
            var lines = Math.max(1, Math.ceil(l / charsPerLine));
            if (cur.length && (curLen + l > capacity || curLines + lines > maxLines)) {
                groups.push(cur);
                cur = [u];
                curLen = l;
                curLines = lines;
            } else {
                cur.push(u);
                curLen += l;
                curLines += lines;
            }
        });
        if (cur.length) groups.push(cur);
        if (!groups.length) groups = [[]];

        // 避免「孤行页」：最后一页 < 24 字就并回上一页（但合页后不能超出行数预算）
        if (groups.length > 1) {
            var linesOf = function (arr) {
                return arr.reduce(function (n, u) {
                    return n + Math.max(1, Math.ceil(charLen(u) / charsPerLine));
                }, 0);
            };
            var lastGroup = groups[groups.length - 1];
            var lastText = joinUnits(lastGroup, joiner);
            if (charLen(lastText) < 24) {
                var prevGroup = groups[groups.length - 2];
                if (linesOf(prevGroup.concat(lastGroup)) <= maxLines) {
                    groups.pop();
                    groups[groups.length - 1] = prevGroup.concat(lastGroup);
                }
            }
        }

        var total = groups.length;
        return groups.map(function (g, i) {
            var text = joinUnits(g, joiner);
            var heading = '', rest = text;
            if (i > 0 && g.length > 1 && charLen(g[0]) <= 26) {
                // 只抹句尾标点：这句会从 rest 里被移走，改成小标题，内容不能变
                heading = trimTailPunct(g[0]);
                rest = joinUnits(g.slice(1), joiner);
            }
            return {
                index: i, total: total,
                isFirst: i === 0, isLast: i === total - 1,
                sentences: g, text: text,
                heading: heading, bodyText: rest,
                charCount: charLen(text)
            };
        });
    }

    // ---------- 6. 品牌主题推导（只允许用品牌已有颜色） ----------
    function pickBestContrast(bgHex, candidates) {
        var best = null, bestRatio = 0;
        (candidates || []).forEach(function (c) {
            var r = contrast(bgHex, c);
            if (r > bestRatio) { bestRatio = r; best = c; }
        });
        return { color: best, ratio: bestRatio };
    }

    /** 用遮罩把背景推向可读（遮罩是行业通用做法，不改品牌色本身） */
    function ensureReadable(bgHex, candidates) {
        var pick = pickBestContrast(bgHex, candidates);
        if (pick.ratio >= 4.5 || !pick.color) {
            return { text: pick.color, scrim: null, ratio: round(pick.ratio) };
        }
        var toward = luminance(bgHex) > 0.45 ? '#FFFFFF' : '#000000';
        var best = null;
        for (var a = 0.05; a <= 0.61; a = round(a + 0.05)) {
            var mixed = mixHex(bgHex, toward, a);
            var p2 = pickBestContrast(mixed, candidates);
            if (!best || p2.ratio > best.ratio) best = { ratio: p2.ratio, color: p2.color, alpha: round(a) };
            if (p2.ratio >= 4.5) {
                return { text: p2.color, scrim: { color: toward, opacity: round(a) }, ratio: round(p2.ratio) };
            }
        }
        return {
            text: (best && best.color) || pick.color,
            scrim: best ? { color: toward, opacity: best.alpha } : null,
            ratio: round((best && best.ratio) || pick.ratio)
        };
    }

    /** @param {{colors?:string[],bgPresets?:Array,brandName?:string,fonts?:string[]}} input */
    function deriveTheme(input) {
        input = input || {};
        var colors = uniq((input.colors || []).map(normHex).filter(Boolean));
        if (!colors.length) colors = DEFAULT_COLORS.slice();

        var bgs = (input.bgPresets || []).map(function (b) {
            var c1 = normHex(b && b.color1);
            if (!c1) return null;
            var c2 = normHex(b.color2);
            return {
                id: b.id || null,
                name: b.name || '',
                type: (b.type === 'gradient' && c2 && c2 !== c1) ? 'gradient' : 'solid',
                color1: c1,
                color2: c2 || c1,
                angle: num(b.angle, 135),
                texture: b.texture || 'none'
            };
        }).filter(Boolean);

        if (!bgs.length) {
            var lightestC = colors.slice().sort(function (a, b) { return luminance(b) - luminance(a); })[0];
            var fallback = luminance(lightestC) > 0.5 ? lightestC : DEFAULT_BG;
            bgs = [{ id: null, name: '品牌浅色', type: 'solid', color1: fallback, color2: fallback, angle: 135, texture: 'none' }];
        }

        // 主背景：品牌预设里最亮的一档（正文可读性最好）
        var mainBg = bgs.slice().sort(function (a, b) { return luminance(b.color1) - luminance(a.color1); })[0];
        var readable = ensureReadable(mainBg.color1, colors);

        // 强调色：饱和度最高、且与文字色有区分
        var accentCandidates = colors.slice().filter(function (c) {
            return c !== readable.text && contrast(mainBg.color1, c) >= 1.6;
        }).sort(function (a, b) {
            var la = luminance(a), lb = luminance(b);
            var midA = la > 0.12 && la < 0.78 ? 1 : 0;
            var midB = lb > 0.12 && lb < 0.78 ? 1 : 0;
            if (midA !== midB) return midB - midA;
            return saturation(b) - saturation(a);
        });
        var accent = accentCandidates[0] || readable.text;
        // 次级强调色：用于「填充/装饰」而不是正文（比如色块、徽章、双色细线），
        // 所以不要求它能压在本页背景上，只要求和主强调色不同、饱和度够。
        var secondaryCandidates = colors.filter(function (c) {
            return c !== accent && c !== readable.text;
        }).sort(function (a, b) { return saturation(b) - saturation(a); });
        var secondary = secondaryCandidates[0] || accent;
        var tertiary = secondaryCandidates[1] || secondary;

        // 大字压色块优先用浅色（3:1 即可）；小字必须用 4.5:1 的那个
        var lightest = colors.slice().sort(function (a, b) { return luminance(b) - luminance(a); })[0];
        var strictInverse = pickBestContrast(accent, colors).color;
        var textInverse = contrast(accent, lightest) >= 3.0 ? lightest : strictInverse;
        var secondaryInverse = pickBestContrast(secondary, colors).color;
        // 小标（kicker）只有 11~12px，必须保证可读：强调色对比度不够就退回正文色
        var kickerContrast = contrast(accent, mainBg.color1);
        var kickerColor = kickerContrast >= 3.5 ? accent : readable.text;
        var kickerOpacity = kickerContrast >= 3.5 ? 0.92 : 0.55;

        return {
            colors: colors,
            bgs: bgs,
            bgMain: mainBg,
            text: readable.text,
            textRatio: readable.ratio,
            scrim: readable.scrim,
            accent: accent,
            secondary: secondary,
            tertiary: tertiary,
            textInverse: textInverse,
            textInverseStrict: strictInverse,
            secondaryInverse: secondaryInverse,
            accentRatio: round(contrast(accent, textInverse)),
            brandName: String(input.brandName || '').trim(),
            fonts: (input.fonts || []).slice(),
            fontFamily: (input.fonts && input.fonts[0]) || 'sans-serif'
        };
    }

    /** 逐页背景：多页时在"足够亮的品牌背景"之间交替，轮播看起来不呆板 */
    function pickPageBg(theme, pageIndex) {
        var usable = (theme.bgs || []).filter(function (b) {
            return b && contrast(theme.text, b.color1) >= 4.5;
        }).sort(function (a, b) { return luminance(b.color1) - luminance(a.color1); });
        if (!usable.length) return theme.bgMain;
        var list = usable.slice(0, 2);   // 最多两档，避免变成调色盘
        return list[pageIndex % list.length] || theme.bgMain;
    }

    // ---------- 7. 图层构建（严格对齐现有编辑器字段） ----------
    function px(v) { return Math.round(v); }

    function textLayer(o) {
        return {
            id: o.id,
            type: 'text',
            content: String(o.content || ''),
            // 语义角色：title / body 参与"内容保真"校验；kicker / badge / footer 是装饰
            _role: o.role || 'body',
            fontSize: (Math.round(o.fontSize * 10) / 10) + 'px',
            fontFamily: o.fontFamily || 'sans-serif',
            color: o.color || '#111111',
            bgColor: o.bgColor || 'transparent',
            bgRadius: o.bgRadius == null ? 6 : o.bgRadius,
            bgPadding: o.bgPadding == null ? 6 : o.bgPadding,
            bold: !!o.bold,
            italic: !!o.italic,
            underline: false,
            strike: false,
            align: o.align || 'left',
            vertical: false,
            letterSpacing: o.letterSpacing ? (o.letterSpacing + 'px') : 0,
            lineHeight: o.lineHeight == null ? 1.2 : o.lineHeight,
            opacity: o.opacity == null ? 1 : o.opacity,
            effectClass: o.effectClass || '',
            x: px(o.x), y: px(o.y),
            width: px(o.width), height: px(o.height),
            heightMode: 'auto',
            rotation: 0, flipH: false, flipV: false,
            locked: false, groupId: null
        };
    }

    function shapeLayer(o) {
        return {
            id: o.id,
            type: 'shape',
            shapeKind: o.shapeKind || 'rect',
            x: px(o.x), y: px(o.y),
            width: px(o.width), height: px(o.height),
            fill: o.fill || 'transparent',
            stroke: o.stroke || 'transparent',
            strokeWidth: num(o.strokeWidth, 0),
            cornerRadius: num(o.cornerRadius, 0),
            arrowHead: 'none',
            rotation: num(o.rotation, 0),
            opacity: o.opacity == null ? 1 : o.opacity,
            flipH: false, flipV: false,
            locked: false, groupId: null
        };
    }

    function pageBg(bgDef, scrim) {
        return {
            type: bgDef.type || 'solid',
            color1: bgDef.color1,
            color2: bgDef.color2 || bgDef.color1,
            angle: num(bgDef.angle, 135),
            texture: bgDef.texture || 'none',
            presetId: null,
            fit: 'cover', scale: 1, positionX: 50, positionY: 50, blur: 0,
            overlayColor: scrim ? scrim.color : '#000000',
            overlayOpacity: scrim ? scrim.opacity : 0,
            overlayType: 'solid',
            overlayAngle: 180,
            overlayCenter: { x: 50, y: 40 },
            colorFilter: 'none'
        };
    }

    function pad2(n) { return (n < 10 ? '0' : '') + n; }

    function fitBlock(text, o, ctx) {
        return fitText(text, {
            width: o.width,
            maxHeight: o.maxHeight,
            sizes: o.sizes,
            lineHeight: o.lineHeight,
            letterSpacing: o.letterSpacing,
            minSize: o.minSize,
            measureFactory: ctx.measureFactory,
            bold: o.bold,
            balance: !!o.balance,
            fontFamily: ctx.fontFamily
        });
    }

    function buildKicker(analysis) {
        var kws = analysis.keywords || [];
        var text = kws.length >= 2 ? (kws[0] + ' · ' + kws[1]) : (kws[0] || '');
        text = chars(text).slice(0, 18).join('');
        if (text && /^[A-Za-z0-9\s·]+$/.test(text)) text = text.toUpperCase();
        return text;
    }

    function makeCtx(analysis, theme, opts, planId) {
        opts = opts || {};
        var richness = RICHNESS.indexOf(opts.richness) >= 0 ? opts.richness : 'subtle';
        var kws = (analysis.keywords || []).filter(function (k) { return charLen(k) >= 2; });
        var plannedEffect = (opts.effectPlan && Object.prototype.hasOwnProperty.call(opts.effectPlan, planId))
            ? String(opts.effectPlan[planId] || '')
            : null;
        return {
            theme: theme,
            analysis: analysis,
            fontFamily: opts.fontFamily || theme.fontFamily || 'sans-serif',
            measureFactory: typeof opts.measureFactory === 'function' ? opts.measureFactory : null,
            kicker: buildKicker(analysis),
            title: analysis.title,
            richness: richness,
            titleEffect: richness === 'clean'
                ? ''
                : (plannedEffect !== null ? plannedEffect : pickTitleEffect(opts.effectPool, richness, planId)),
            kickerColor: theme.accent,
            decorColor: (theme.secondary && theme.secondary !== theme.accent) ? theme.secondary : theme.accent,
            keyword: kws[0] || '',
            emphasisColor: theme.accent
        };
    }

    // ---------- 8. 方案 A：语义匹配（居中 · 编辑感 · 一条细线） ----------
    function layoutPlanA(ctx, pd, planId) {
        var t = ctx.theme, first = pd.isFirst, total = pd.total;
        var kicker = ctx.kicker || '';
        var kickerH = kicker ? 15 : 0, kickerGap = kicker ? 14 : 0;
        var ruleH = first ? 2 : 0, gapTitle = first ? 16 : 0, gapRule = first ? 18 : 0;
        var footH = total > 1 ? 12 : 0, footGap = total > 1 ? 18 : 0;
        var titleText = first ? ctx.title : (pd.heading || '');
        var titleSizes = first ? [46, 42, 38, 34, 30, 26, 24] : [30, 26, 24, 22, 20];
        var chosen = null;
        for (var i = 0; i < titleSizes.length; i++) {
            var tf = titleText ? fitBlock(titleText, {
                width: CONTENT_W, maxHeight: first ? 168 : 76,
                sizes: [titleSizes[i]], lineHeight: first ? 1.18 : 1.34,
                bold: true, balance: true
            }, ctx) : null;
            var titleH = tf ? Math.ceil(tf.height) : 0;
            var fixed = kickerH + kickerGap + titleH + gapTitle + ruleH + gapRule + footH + footGap;
            var avail = CONTENT_H - fixed;
            if (avail >= 88 || i === titleSizes.length - 1) {
                chosen = { tf: tf, titleH: titleH, bodyAvail: Math.max(56, avail) };
                break;
            }
        }
        var bf = pd.bodyText ? fitBlock(pd.bodyText, {
            width: CONTENT_W, maxHeight: chosen.bodyAvail,
            sizes: [23, 21, 20, 19, 18, 17, 16], lineHeight: 1.62
        }, ctx) : null;
        var bodyH = bf ? Math.ceil(bf.height) : 0;
        var blockH = kickerH + kickerGap + chosen.titleH + gapTitle + ruleH + gapRule + bodyH + footH + footGap;
        var startY = SAFE.t + Math.round(Math.max(0, CONTENT_H - blockH) * 0.40);
        startY = clamp(startY, SAFE.t, Math.max(SAFE.t, CANVAS.H - SAFE.b - blockH));

        var layers = [], y = startY, n = 0;
        function nid() { return planId + '-p' + (pd.index + 1) + '-l' + (++n); }
        if (kicker) {
            layers.push(textLayer({
                id: nid(), content: kicker, x: SAFE.l, y: y, width: CONTENT_W, height: kickerH,
                fontSize: 12, letterSpacing: 2.2, color: ctx.kickerColor, align: 'center',
                opacity: 0.92, lineHeight: 1.2, fontFamily: ctx.fontFamily, role: 'kicker'
            }));
            y += kickerH + kickerGap;
        }
        if (chosen.tf) {
            layers.push(textLayer({
                id: nid(), content: titleText, x: SAFE.l, y: y, width: CONTENT_W, height: chosen.titleH,
                fontSize: chosen.tf.fontSize, color: t.text, bold: true, align: 'center',
                lineHeight: first ? 1.18 : 1.34, fontFamily: ctx.fontFamily,
                letterSpacing: first ? 0.5 : 0, role: 'title',
                effectClass: (first && ctx.richness !== 'clean') ? ctx.titleEffect : ''
            }));
            y += chosen.titleH + gapTitle;
        }
        if (first) {
            // 双色细线：主强调色 + 次级强调色，一根线也能用上两个品牌色
            var ruleX = Math.round((CANVAS.W - 40) / 2);
            layers.push(shapeLayer({
                id: nid(), x: ruleX, y: y,
                width: t.secondary && t.secondary !== t.accent ? 28 : 40,
                height: 2, fill: t.accent, cornerRadius: 1
            }));
            if (t.secondary && t.secondary !== t.accent) {
                layers.push(shapeLayer({
                    id: nid(), x: ruleX + 32, y: y,
                    width: 8, height: 2, fill: t.secondary, cornerRadius: 1
                }));
            }
            y += ruleH + gapRule;
        }
        if (bf) {
            layers.push(textLayer({
                id: nid(), content: pd.bodyText, x: SAFE.l, y: y, width: CONTENT_W, height: bodyH,
                fontSize: bf.fontSize, color: t.text, align: 'center',
                lineHeight: 1.62, opacity: 0.86, fontFamily: ctx.fontFamily, letterSpacing: 0.2,
                role: 'body'
            }));
        }
        if (total > 1) {
            layers.push(textLayer({
                id: nid(), content: pad2(pd.index + 1) + ' / ' + pad2(total),
                x: SAFE.l, y: CANVAS.H - SAFE.b - 13, width: CONTENT_W, height: 12,
                fontSize: 11, color: t.text, align: 'right', opacity: 0.42,
                letterSpacing: 1, fontFamily: ctx.fontFamily, role: 'footer'
            }));
        }
        return layers;
    }

    // ---------- 9. 方案 B：视觉冲击（左对齐 · 巨字 · 品牌色块承载标题） ----------
    function layoutPlanB(ctx, pd, planId) {
        var t = ctx.theme, first = pd.isFirst, total = pd.total;
        var useBlock = t.accentRatio >= 3.2;          // 色块上压字必须够对比
        var titleText = first ? ctx.title : (pd.heading || '');
        var kicker = ctx.kicker || '';
        var kickerH = kicker ? 14 : 0, kickerGap = kicker ? 18 : 0;
        var padY = useBlock ? 14 : 0;
        var titleW = useBlock ? 280 : CONTENT_W;
        var titleX = useBlock ? 40 : SAFE.l;
        var titleSizes = first ? [60, 54, 48, 42, 36, 32, 28] : [30, 27, 25, 23, 21, 19];
        // 关键词胶囊（首页），要为它预留底部空间，避免压住正文
        var badge = first
            ? chars((ctx.analysis.keywords || [])[1] || (ctx.analysis.keywords || [])[0] || '').slice(0, 10).join('')
            : '';
        var badgeReserve = badge ? 34 : 0;
        var chosen = null;
        for (var i = 0; i < titleSizes.length; i++) {
            var tf = titleText ? fitBlock(titleText, {
                width: titleW, maxHeight: first ? 240 : 78,
                sizes: [titleSizes[i]], lineHeight: first ? 1.12 : 1.3,
                bold: true, balance: true
            }, ctx) : null;
            var th = tf ? Math.ceil(tf.height) : 0;
            var fixed = kickerH + kickerGap + th + padY * 2 + 20 + (total > 1 ? 34 : 0) + badgeReserve + 20;
            var avail = CONTENT_H - fixed;
            if (avail >= 84 || i === titleSizes.length - 1) {
                chosen = { tf: tf, th: th, bodyAvail: Math.max(52, avail) };
                break;
            }
        }
        var bodyW = CONTENT_W - 12, bodyX = SAFE.l + 12;
        var bf = pd.bodyText ? fitBlock(pd.bodyText, {
            width: bodyW, maxHeight: chosen.bodyAvail,
            sizes: [22, 21, 20, 19, 18, 17, 16], lineHeight: 1.66
        }, ctx) : null;
        var bh = bf ? Math.ceil(bf.height) : 0;
        var blockH = kickerH + kickerGap + chosen.th + padY * 2 + 20 + bh +
            (total > 1 ? 34 : 0) + badgeReserve + 20;
        var startY = SAFE.t + Math.round(Math.max(0, CONTENT_H - blockH) * 0.40);
        startY = clamp(startY, SAFE.t, Math.max(SAFE.t, CANVAS.H - SAFE.b - blockH));

        var layers = [], n = 0, y = startY;
        function nid() { return planId + '-p' + (pd.index + 1) + '-l' + (++n); }
        if (kicker) {
            layers.push(textLayer({
                id: nid(), content: kicker, x: SAFE.l, y: y, width: CONTENT_W, height: kickerH,
                fontSize: 11.5, letterSpacing: 2.6, color: ctx.kickerColor, align: 'left',
                lineHeight: 1.2, opacity: 1, fontFamily: ctx.fontFamily, role: 'kicker'
            }));
            y += kickerH + kickerGap;
        }
        if (useBlock) {
            layers.push(shapeLayer({
                id: nid(), x: 22, y: y - padY, width: 316, height: chosen.th + padY * 2,
                fill: t.accent, cornerRadius: 8, opacity: 1
            }));
        }
        if (chosen.tf) {
            layers.push(textLayer({
                id: nid(), content: titleText, x: titleX, y: y, width: titleW, height: chosen.th,
                fontSize: chosen.tf.fontSize,
                color: useBlock ? t.textInverse : t.text,
                bold: true, align: 'left',
                lineHeight: first ? 1.12 : 1.3,
                effectClass: first ? ctx.titleEffect : '',
                fontFamily: ctx.fontFamily, role: 'title'
            }));
            y += chosen.th + padY + 20;
        }
        if (bf) {
            layers.push(shapeLayer({
                id: nid(), x: 26, y: y, width: 3, height: bh, fill: t.accent, cornerRadius: 1.5
            }));
            layers.push(textLayer({
                id: nid(), content: pd.bodyText, x: bodyX, y: y, width: bodyW, height: bh,
                fontSize: bf.fontSize, color: t.text, align: 'left',
                lineHeight: 1.66, opacity: 0.9, fontFamily: ctx.fontFamily, role: 'body'
            }));
        }
        if (badge) {
            var badgeW = Math.min(160, Math.ceil(charLen(badge) * 12 + 26));
            // 徽章用次级强调色，和标题色块拉开层次（同一个色板里换一个色）
            var badgeBg = (t.secondary && t.secondary !== t.accent) ? t.secondary : t.accent;
            layers.push(textLayer({
                id: nid(), content: badge,
                x: SAFE.l, y: CANVAS.H - SAFE.b - 26, width: badgeW, height: 22,
                fontSize: 12, color: badgeBg === t.accent ? t.textInverseStrict : t.secondaryInverse,
                bold: true, align: 'center',
                bgColor: badgeBg, bgRadius: 11, bgPadding: 5,
                lineHeight: 1.2, fontFamily: ctx.fontFamily, letterSpacing: 0.5, role: 'badge'
            }));
        }
        if (total > 1) {
            layers.push(textLayer({
                id: nid(), content: pad2(pd.index + 1) + ' / ' + pad2(total),
                x: SAFE.l + 184, y: CANVAS.H - SAFE.b - 13, width: 120, height: 12,
                fontSize: 11, color: t.text, align: 'right', opacity: 0.42,
                letterSpacing: 1, fontFamily: ctx.fontFamily, role: 'footer'
            }));
        }
        return layers;
    }

    // ---------- 10. 方案 C：品牌高级感（顶对齐 · 大留白 · 发丝线） ----------
    function layoutPlanC(ctx, pd, planId) {
        var t = ctx.theme, first = pd.isFirst, total = pd.total;
        var kicker = ctx.kicker || '';
        var kickerH = kicker ? 13 : 0, kickerGap = kicker ? 18 : 0;
        var hairH = 1, gapTitle = 18, gapHair = 20, footH = 12, footGap = 16;
        var titleText = first ? ctx.title : (pd.heading || '');
        var titleSizes = first ? [38, 34, 30, 28, 26, 24] : [22, 20, 19, 18];
        var chosen = null;
        for (var i = 0; i < titleSizes.length; i++) {
            var tf = titleText ? fitBlock(titleText, {
                width: CONTENT_W, maxHeight: first ? 150 : 60,
                sizes: [titleSizes[i]], lineHeight: 1.34, bold: true, balance: true
            }, ctx) : null;
            var th = tf ? Math.ceil(tf.height) : 0;
            var fixed = 44 + kickerH + kickerGap + th + gapTitle + hairH + gapHair + footH + footGap;
            var avail = CONTENT_H - fixed;
            if (avail >= 88 || i === titleSizes.length - 1) {
                chosen = { tf: tf, th: th, bodyAvail: Math.max(56, avail) };
                break;
            }
        }
        var bf = pd.bodyText ? fitBlock(pd.bodyText, {
            width: CONTENT_W, maxHeight: chosen.bodyAvail,
            sizes: [19, 18, 17, 16, 15], lineHeight: 1.86
        }, ctx) : null;
        var bh = bf ? Math.ceil(bf.height) : 0;
        // 单页时整块略微下沉到视觉中心；多页保持统一顶对齐，跨页节奏一致
        var blockH = kickerH + kickerGap + chosen.th + gapTitle + hairH + gapHair + bh;
        var free = Math.max(0, CONTENT_H - 44 - blockH);
        var y = total > 1 ? SAFE.t + 44 : SAFE.t + 44 + Math.round(free * 0.34);

        var layers = [], n = 0;
        function nid() { return planId + '-p' + (pd.index + 1) + '-l' + (++n); }
        if (kicker) {
            // 小小的品牌色方块 + 拉开字距的小标：极简版也需要一个"视觉锚点"
            layers.push(shapeLayer({
                id: nid(), x: SAFE.l, y: y + Math.round((kickerH - 8) / 2),
                width: 8, height: 8, fill: ctx.decorColor, cornerRadius: 2
            }));
            layers.push(textLayer({
                id: nid(), content: kicker, x: SAFE.l + 14, y: y, width: CONTENT_W - 14, height: kickerH,
                fontSize: 10.5, letterSpacing: 4, color: ctx.kickerColor, align: 'left',
                lineHeight: 1.2, opacity: 0.95, fontFamily: ctx.fontFamily, role: 'kicker'
            }));
            y += kickerH + kickerGap;
        }
        if (chosen.tf) {
            layers.push(textLayer({
                id: nid(), content: titleText, x: SAFE.l, y: y, width: CONTENT_W, height: chosen.th,
                fontSize: chosen.tf.fontSize, color: t.text, bold: true, align: 'left',
                lineHeight: 1.34, letterSpacing: 0.2, fontFamily: ctx.fontFamily, role: 'title'
            }));
            y += chosen.th + gapTitle;
        }
        layers.push(shapeLayer({
            id: nid(), x: SAFE.l, y: y, width: CONTENT_W, height: hairH,
            fill: t.text, opacity: 0.18
        }));
        y += hairH + gapHair;
        if (bf) {
            layers.push(textLayer({
                id: nid(), content: pd.bodyText, x: SAFE.l, y: y, width: CONTENT_W, height: bh,
                fontSize: bf.fontSize, color: t.text, align: 'left',
                lineHeight: 1.86, opacity: 0.78, fontFamily: ctx.fontFamily, letterSpacing: 0.2,
                role: 'body'
            }));
        }
        var footY = CANVAS.H - SAFE.b - 13;
        // 底部发丝线：给整版加一条"下边界"，避免单页时下方出现大片无意义空白
        var lineY = Math.max(CANVAS.H - SAFE.b - 44, y + bh + 14);
        if (lineY <= footY - 6) {
            layers.push(shapeLayer({
                id: nid(), x: SAFE.l, y: lineY, width: CONTENT_W, height: 1,
                fill: t.text, opacity: 0.12
            }));
        }
        if (total > 1) {
            layers.push(textLayer({
                id: nid(), content: pad2(pd.index + 1) + ' / ' + pad2(total),
                x: SAFE.l, y: footY, width: CONTENT_W, height: footH,
                fontSize: 10.5, color: t.text, align: 'right', opacity: 0.4,
                letterSpacing: 1.2, fontFamily: ctx.fontFamily, role: 'footer'
            }));
        }
        return layers;
    }

    // ---------- 11. 方案装配 ----------
    var PLANS = {
        A: { name: '语义匹配', desc: '居中编辑感：标题即观点，品牌色细线收口', layout: layoutPlanA, capacity: 118, maxLines: 11 },
        B: { name: '视觉冲击', desc: '巨字左对齐：品牌色块承载标题，关键词胶囊', layout: layoutPlanB, capacity: 108, maxLines: 10 },
        C: { name: '品牌高级感', desc: '顶对齐大留白：发丝线分隔，低干扰', layout: layoutPlanC, capacity: 150, maxLines: 10 }
    };

    /**
     * 单页"放不下"判定：文字越界或文字框互相压住。
     * 排版是估算出来的，遇到超长句/超长标题就可能塞不下，
     * 这时不能硬挤（会压到页脚、越出安全区），而是回退到"多分一页"。
     */
    function pageNeedsReflow(page) {
        var bottom = CANVAS.H - SAFE.b, top = SAFE.t;
        var texts = [], bad = false;
        (page.layers || []).forEach(function (l) {
            if (!l || l.type !== 'text') return;
            if (l.y < top - 0.5 || l.y + l.height > bottom + 0.5 ||
                l.x < SAFE.l - 0.5 || l.x + l.width > CANVAS.W - SAFE.r + 0.5) bad = true;
            texts.push(l);
        });
        for (var i = 0; i < texts.length && !bad; i++) {
            for (var j = i + 1; j < texts.length; j++) {
                var a = texts[i], b = texts[j];
                var ix = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
                var iy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
                if (ix > 1 && iy > 2) { bad = true; break; }
            }
        }
        return bad;
    }

    function buildPlan(planId, analysis, theme, ctxOpts, opts) {
        opts = opts || {};
        var meta = PLANS[planId];
        if (!meta) throw new Error('未知方案 ' + planId);
        var ctx = makeCtx(analysis, theme, ctxOpts, planId);

        // 逐页装配：背景按页轮换（多页不呆板）；正文里的关键词上品牌色
        var buildPages = function (pageData) {
            return pageData.map(function (pd, i) {
                var bgDef = pickPageBg(theme, i);
                if (ctx.richness === 'bold' && bgDef.type !== 'gradient') {
                    bgDef = {
                        id: bgDef.id, name: bgDef.name, type: 'gradient',
                        color1: bgDef.color1,
                        color2: mixHex(bgDef.color1, theme.accent, 0.12),
                        angle: 160, texture: bgDef.texture || 'none'
                    };
                }
                var layers = meta.layout(ctx, pd, planId);
                layers.forEach(function (l) {
                    if (!l || l.type !== 'text') return;
                    if (l._role === 'body') {
                        l.content = emphasizeKeyword(l.content, ctx.keyword, ctx.emphasisColor);
                    } else {
                        l.content = escHtml(l.content);
                    }
                });
                return {
                    id: 'ad-' + planId.toLowerCase() + '-p' + (i + 1),
                    title: '第 ' + (i + 1) + ' 页',
                    _planLabel: planId,
                    _planPageNo: i + 1,
                    bg: pageBg(bgDef, theme.scrim),
                    layers: layers
                };
            });
        };

        var capacity = Math.max(28, num(opts.charsPerPage, meta.capacity));
        var maxLines = Math.max(4, num(opts.maxLines, meta.maxLines || 9));
        var pages = [], pageData = [];

        // ✅ 自适应分页：先按目标字数排，排不下就把每页容量收窄再排（最多 6 轮）
        for (var attempt = 0; attempt < 6; attempt++) {
            pageData = paginate(analysis, { charsPerPage: capacity, maxLines: maxLines });
            pages = buildPages(pageData);
            if (!pages.some(pageNeedsReflow)) break;
            capacity = Math.max(28, Math.round(capacity * 0.7));
            maxLines = Math.max(4, maxLines - 1);
        }

        return {
            id: planId,
            name: meta.name,
            description: meta.desc,
            canvas: { width: CANVAS.W, height: CANVAS.H },
            pages: pages,
            _stats: {
                pageCount: pages.length,
                layerCount: pages.reduce(function (n, p) { return n + p.layers.length; }, 0),
                charCount: analysis.charCount,
                charsPerPage: capacity
            }
        };
    }

    // ---------- 12. 自校验（错误码 + 中文说明分离，便于将来多语言） ----------
    function normForCompare(s) {
        return unescHtml(stripHtml(s))
            .replace(/[\s\u3000]/g, '')
            .replace(/[。，、．,.！？!?：:；;…“”‘’"'（）()《》〈〉【】\[\]—–\-·~～]/g, '');
    }

    /**
     * 关键词强调：把正文里第一次出现的关键词包成品牌色 span。
     * 只改颜色、不改字号/字距，所以不影响前面算好的排版几何。
     */
    function emphasizeKeyword(text, keyword, color) {
        var raw = String(text == null ? '' : text);
        var kw = String(keyword || '');
        if (charLen(kw) < 2) return escHtml(raw);
        var idx = raw.indexOf(kw);
        if (idx < 0) return escHtml(raw);
        return escHtml(raw.slice(0, idx)) +
            '<span style="color:' + (color || 'inherit') + '">' + escHtml(kw) + '</span>' +
            escHtml(raw.slice(idx + kw.length));
    }

    /**
     * 从特效池里挑一个"只作用于字形"的特效当标题特效。
     * 池子由 UI 层从 VisualRegistry 取（已过滤掉背景框类），核心只按家族偏好排。
     * 三个方案故意用不同家族的特效，避免"三套方案长得一样"。
     */
    var PLAN_EFFECT_PREF = {
        A: ['stroke', 'shadow', 'texture', 'gradient', 'extrude', 'glow'],
        B: ['gradient', 'extrude', 'glow', 'stroke', 'shadow', 'texture']
    };

    function pickTitleEffect(pool, richness, planId) {
        if (richness === 'clean' || !Array.isArray(pool) || !pool.length) return '';
        if (planId === 'C') return '';          // 高级感款保持干净，不加特效
        var pref = PLAN_EFFECT_PREF[planId] || PLAN_EFFECT_PREF.A;
        var ranked = pool.filter(function (p) { return p && p.id; }).slice().sort(function (a, b) {
            var pa = pref.indexOf(a.family), pb = pref.indexOf(b.family);
            pa = pa < 0 ? 99 : pa;
            pb = pb < 0 ? 99 : pb;
            if (pa !== pb) return pa - pb;
            return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
        });
        var offset = planId === 'B' ? 1 : 0;    // B 取同池里第二个，保证 A/B 特效不同
        return (ranked[offset] || ranked[0]).id;
    }

    function validatePlans(plans, ref) {
        ref = ref || {};
        var errors = [], warnings = [];
        var allowed = {};
        (ref.colors || []).forEach(function (c) {
            var n = normHex(c);
            if (n) allowed[n] = 1;
        });
        var ids = {};
        var planIds = Object.keys(plans || {});
        if (planIds.length !== 3) {
            errors.push({ code: 'E_PLAN_COUNT', message: '必须提供 A / B / C 三套方案' });
        }

        planIds.forEach(function (pid) {
            var plan = plans[pid];
            if (!plan || !Array.isArray(plan.pages) || !plan.pages.length) {
                errors.push({ code: 'E_PLAN_EMPTY', plan: pid, message: '方案没有任何页面' });
                return;
            }
            var planText = '';
            plan.pages.forEach(function (pg, pi) {
                var where = pid + ' 第' + (pi + 1) + '页';
                var texts = [];
                (pg.layers || []).forEach(function (l) {
                    var at = where + ' ' + (l.id || '?');
                    if (ids[l.id]) errors.push({ code: 'E_DUP_LAYER_ID', at: at, message: '图层 ID 重复' });
                    ids[l.id] = 1;

                    if (l.x < -0.5 || l.y < -0.5 ||
                        l.x + l.width > CANVAS.W + 0.5 || l.y + l.height > CANVAS.H + 0.5) {
                        errors.push({ code: 'E_CANVAS_BOUNDS', at: at, message: '图层超出画布' });
                    }
                    if (l.type === 'text') {
                        if (!String(l.content || '').trim()) {
                            errors.push({ code: 'E_TEXT_EMPTY', at: at, message: '文字图层内容为空' });
                        }
                        if (l.x < SAFE.l - 0.5 || l.x + l.width > CANVAS.W - SAFE.r + 0.5) {
                            errors.push({ code: 'E_SAFE_X', at: at, message: '文字超出左右安全区' });
                        }
                        if (l.y < SAFE.t - 0.5) {
                            errors.push({ code: 'E_SAFE_TOP', at: at, message: '文字超出顶部安全区' });
                        }
                        if (l.y + l.height > CANVAS.H - SAFE.b + 0.5) {
                            errors.push({ code: 'E_SAFE_BOTTOM', at: at, message: '文字超出底部安全区' });
                        }
                        var fs = parseFloat(l.fontSize);
                        if (!(fs >= 9 && fs <= 96)) {
                            errors.push({ code: 'E_FONT_SIZE', at: at, message: '字号超出 9–96 范围：' + l.fontSize });
                        }
                        if (!allowed[normHex(l.color)]) {
                            errors.push({ code: 'E_COLOR_NOT_IN_PALETTE', at: at, message: '文字色不在品牌色板：' + l.color });
                        }
                        if (l.bgColor && l.bgColor !== 'transparent' && !allowed[normHex(l.bgColor)]) {
                            errors.push({ code: 'E_BG_COLOR_NOT_IN_PALETTE', at: at, message: '底色不在品牌色板：' + l.bgColor });
                        }
                        texts.push(l);
                        // 只有 title / body 参与"内容保真"比对；
                        // kicker / badge / footer 是装饰层（页码会插在正文之间，不能计入连续串）
                        var role = l._role || 'body';
                        if (role === 'title' || role === 'body') {
                            planText += ' ' + stripHtml(l.content);
                        }
                    } else if (l.type === 'shape') {
                        if (l.fill && l.fill !== 'transparent' && !allowed[normHex(l.fill)]) {
                            errors.push({ code: 'E_SHAPE_FILL_NOT_IN_PALETTE', at: at, message: '形状填充不在品牌色板：' + l.fill });
                        }
                    } else {
                        errors.push({ code: 'E_LAYER_TYPE', at: at, message: '未知图层类型：' + l.type });
                    }
                });

                for (var i = 0; i < texts.length; i++) {
                    for (var j = i + 1; j < texts.length; j++) {
                        var a = texts[i], b = texts[j];
                        var ix = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
                        var iy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
                        if (ix > 1 && iy > 2) {
                            warnings.push({
                                code: 'W_TEXT_OVERLAP', at: where,
                                message: a.id + ' 与 ' + b.id + ' 文字框重叠 ' + Math.round(iy) + 'px'
                            });
                        }
                    }
                }
            });

            // 内容保真：原文每一句都必须出现在该方案里
            var got = normForCompare(planText);
            (ref.sentences || []).forEach(function (s) {
                var key = normForCompare(s);
                if (charLen(key) >= 4 && got.indexOf(key) < 0) {
                    errors.push({
                        code: 'E_CONTENT_LOST', plan: pid,
                        message: '原文片段未出现在方案 ' + pid + '：' + chars(s).slice(0, 12).join('')
                    });
                }
            });
        });

        return {
            ok: errors.length === 0,
            errors: errors,
            warnings: warnings,
            stats: { planCount: planIds.length, errorCount: errors.length, warningCount: warnings.length }
        };
    }

    // ---------- 13. 对外入口 ----------
    function signature(plan) {
        var page = (plan && plan.pages && plan.pages[0]) || { layers: [] };
        return (page.layers || []).map(function (l) {
            return l.type + ':' + (l.align || '') + ':' +
                Math.round(parseFloat(l.fontSize) || 0) + ':' + (l.bold ? 'b' : 'n');
        }).join('|') + '#' + (plan && plan.pages ? plan.pages.length : 0);
    }

    /**
     * 主入口：一段文案 → 三套可直接落到画布的方案
     * @param {string} raw 用户粘贴的文案
     * @param {object} [opts] title / brand{colors,bgPresets,brandName,fonts} / fontFamily /
     *                        measureFactory / effects / charsPerPage
     */
    function buildAll(raw, opts) {
        opts = opts || {};
        var brand = opts.brand || {};
        var theme = deriveTheme({
            colors: brand.colors || opts.colors,
            bgPresets: brand.bgPresets || opts.bgPresets,
            brandName: brand.brandName || opts.brandName,
            fonts: brand.fonts || opts.fonts
        });
        var analysis = analyze(raw, { title: opts.title });
        var ctxOpts = {
            fontFamily: opts.fontFamily || theme.fontFamily,
            measureFactory: opts.measureFactory,
            richness: opts.richness,
            effectPool: opts.effectPool,
            effectPlan: opts.effectPlan
        };
        var plans = {};
        ['A', 'B', 'C'].forEach(function (id) {
            plans[id] = buildPlan(id, analysis, theme, ctxOpts, opts);
        });
        var validation = validatePlans(plans, {
            colors: theme.colors,
            sentences: analysis.sentences,
            original: analysis.plain
        });
        var sigs = ['A', 'B', 'C'].map(function (id) { return signature(plans[id]); });
        if (uniq(sigs).length < 3) {
            validation.warnings.push({ code: 'W_PLANS_SIMILAR', message: '三套方案结构过于接近，建议检查文案长度' });
        }
        return {
            ok: validation.ok,
            analysis: analysis,
            theme: theme,
            plans: plans,
            validation: validation
        };
    }

    return {
        VERSION: '1.0.1',
        CANVAS: CANVAS,
        SAFE: SAFE,
        CONTENT_LINE_HEIGHT: CONTENT_LINE_HEIGHT,
        CONTENT_W: CONTENT_W,
        CONTENT_H: CONTENT_H,
        PLANS: PLANS,
        DEFAULT_COLORS: DEFAULT_COLORS,

        // 颜色
        normHex: normHex, luminance: luminance, contrast: contrast,
        saturation: saturation, mixHex: mixHex,

        // 文本
        estimateWidth: estimateWidth, wrapLines: wrapLines,
        balancedLines: balancedLines, fitText: fitText,
        normalizeText: normalizeText, splitSentences: splitSentences,
        normForCompare: normForCompare,

        // 分析与装配
        analyze: analyze, paginate: paginate, deriveTheme: deriveTheme,
        buildPlan: buildPlan, buildAll: buildAll,
        validatePlans: validatePlans, signature: signature,
        pageNeedsReflow: pageNeedsReflow,
        emphasizeKeyword: emphasizeKeyword, pickTitleEffect: pickTitleEffect,
        pickPageBg: pickPageBg, RICHNESS: RICHNESS,

        // 图层构造（UI 层按需复用）
        textLayer: textLayer, shapeLayer: shapeLayer, pageBg: pageBg
    };
});