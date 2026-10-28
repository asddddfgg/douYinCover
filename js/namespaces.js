// ============================================================
// namespaces.js — 全局命名空间声明（P1-2 步骤 2.1）
// 职责：只声明空命名空间，不实现任何逻辑
// 目的：把"裸函数覆盖"改成"显式挂载"，加载顺序不再致命
// 加载顺序：必须早于所有业务模块（紧跟 utils.js 之后）
// ============================================================

window.BG = window.BG || {};         // 背景系统（background-core / background-engine / background-image）
window.TXT = window.TXT || {};       // 文字系统（text-layers / selection-core / font-manager）
window.EXPORT = window.EXPORT || {}; // 导出系统（exporter）
window.ASSET = window.ASSET || {};   // 资产系统（stickers / backdrop-panel）
window.STATE = window.STATE || {};   // 状态系统（state / history）

console.log('[Namespaces] ✅ 命名空间已声明：BG / TXT / EXPORT / ASSET / STATE');