'use strict';
// ============================================================
// 自绘线性图标库 —— 轻量编程 IDE 专属视觉风格
// 风格规范（记住，勿再使用 Emoji）：
//   - 24x24 viewBox，线性轮廓（stroke 填充 none）
//   - 描边 1.8px，圆头圆角（stroke-linecap/linejoin: round）
//   - 颜色一律 currentColor，跟随主题；活动/强调态由 CSS 控制
//   - 语言：圆润、简约、学习感；图标语义直观
// ============================================================
const ICON_DEFS = {
  // 资源管理器：文件夹
  explorer: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  // 关键字词典：书本
  dict: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  // 桌宠：猫爪（爪垫 + 四趾）
  pet: '<path d="M12 13.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/><ellipse cx="7" cy="9.5" rx="1.6" ry="2.2"/><ellipse cx="17" cy="9.5" rx="1.6" ry="2.2"/><ellipse cx="9.4" cy="5.8" rx="1.5" ry="2"/><ellipse cx="14.6" cy="5.8" rx="1.5" ry="2"/>',
  // 设置：齿轮（圆 + 八辐条）
  settings: '<circle cx="12" cy="12" r="3.4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
  // 新建文件：文档 + 加号
  newfile: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M12 9.5v6M9 12.5h6"/>',
  // 打开文件夹
  folderopen: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 18l5-7 4 5 3-3 4 5"/>',
  // Java 源文件：文档 + 咖啡杯
  filejava: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M9.5 12h5v1.6a2.5 2.5 0 0 1-5 0z"/><path d="M14.5 13.4h1.2a1.3 1.3 0 0 1 0 2.6H14.5"/>',
  // Python 源文件：文档 + 蛇形 S 曲线
  filepy: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M9.5 15.5c0 1.2 1 1.2 1.5 1.2s1.5 0 1.5-1.2-1-1.2-1.5-1.2-1.5 0-1.5-1.2 1-1.2 1.5-1.2 1.5 0 1.5 1.2"/>',
  // 普通文件
  file: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
  // 关闭
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  // 警告
  warn: '<path d="M12 4L21 20H3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="0.5"/>',
  // 成功对勾
  check: '<path d="M4 12.5l5 5L20 7"/>',
  // 错误叉（圆内）
  error: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  // 运行：播放三角
  run: '<path d="M8 5.5l11 6.5-11 6.5z"/>',
  // 编译：锤子
  compile: '<path d="M14.5 6.5a4.5 4.5 0 0 0-6.2 5.6L3 17.4a2.1 2.1 0 0 0 3 3l5.3-5.3a4.5 4.5 0 0 0 5.6-6.2l-2.9 2.9-2.4-2.4z"/><path d="M17 7l2.5-2.5"/>',
  // 检查代码：文档 + 放大镜
  checkcode: '<path d="M7 3h8l3 3v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><circle cx="12" cy="12" r="3.5"/><path d="M14.5 14.5L17 17"/>',
  // 躲起来：月亮
  hide: '<path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5z"/>',
  // 快捷键：键盘
  kbd: '<rect x="3" y="7" width="18" height="11" rx="2"/><path d="M7 10.5h.01M11 10.5h.01M15 10.5h.01M17 10.5h.01M7 14h.01M11 14h4"/>',
  // 提示：灯泡
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 4.2 10.3c-.8.7-1.2 1.4-1.2 2.2h-6c0-.8-.4-1.5-1.2-2.2A6 6 0 0 1 12 3z"/>',
  // 搜索
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20.5 20.5L16 16"/>',
  // 终端
  terminal: '<path d="M4 5l6 7-6 7"/><path d="M12 19h8"/>',
  // 停止
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>',
  // 文件树：文件夹小图标
  treefolder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  // 代码括号（词典/logo 辅助）
  code: '<path d="M9 7L4 12l5 5"/><path d="M15 7l5 5-5 5"/>',
  // 项目（方块+文件夹组合，词典视图头部）
  project: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
  // 刷题/LeetCode：奖杯
  leetcode: '<path d="M8 20h8M12 16v4"/><path d="M7 5h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H5a3 3 0 0 0 3 4M17 6h2a3 3 0 0 1-3 4"/>'
};

window.ICON = {
  // 返回完整 <svg> 字符串（供 JS 动态拼接）
  svg(name, cls) {
    const body = ICON_DEFS[name] || '';
    return `<svg class="icon${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
  },
  has(name) { return !!ICON_DEFS[name]; }
};
