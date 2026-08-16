# 轻量编程 IDE — UI 设计规范（自绘图标风格，禁止 Emoji）

## 图标风格（必须遵守）
- 自绘线性 SVG 图标库：`renderer/icons.js`（`window.ICON.svg(name, cls)`），主界面图标内联在 HTML 中
- 规范：24x24 viewBox、线性轮廓（fill:none + stroke:currentColor）、描边 1.8px、圆头圆角（stroke-linecap/linejoin: round）、颜色跟随主题
- 小图标（sm）：14px/描边 2；中（md）：16px；大（lg）：22px
- **禁止使用 Emoji 作为界面图标**（📁📖🐾⚙️☕等一律用自绘 SVG 替代）
- 动态生成内容（tab 关闭、文件树、toast、JDK 状态）用 `ICON.svg()` 拼接

## 图标清单（icons.js）
explorer(文件夹) / dict(书本) / pet(猫爪) / settings(齿轮:圆+8辐条) / newfile(文档+加号) / folderopen(文件夹+箭头) / filejava(文档+咖啡杯) / file(文档) / close(×) / warn(三角!) / check(对勾) / error(圆×) / run(三角) / compile(锤子) / checkcode(文档+放大镜) / hide(月亮) / kbd(键盘) / bulb(灯泡) / search(放大镜) / terminal / stop / treefolder / code(括号) / project(方块+文件夹)

## 动效 token
- --dur: .18s，--ease: cubic-bezier(.25,.8,.35,1)（styles.css :root）
- 统一过渡：按钮 hover 背景/颜色、active 缩放(.86-.97)、活动栏指示条高度动画、侧边栏 0.2s 展开、视图/面板/气泡/菜单 pop-in、模态框 fade+scale、菲比点击 pressed(.92)+pop 弹跳

## 菲比桌宠
- 窗口尺寸 = GIF 原生分辨率 192x208（PET_W/PET_H），不放大保证清晰；img 加 drop-shadow 分离背景
- 气泡贴菲比头顶（bottom:220px），菜单贴顶（top:8px）
- 状态映射：idle/waiting.gif、working/running.gif、thinking/waiting.gif、happy/review.gif、sad/failed.gif

## 欢迎页
- 自绘 logo（圆角方块渐变 + 咖啡杯 + 蒸汽 + 星星），三个功能卡片（一键运行/关键字词典/智能补全），主按钮 primary(accent) + ghost 按钮
