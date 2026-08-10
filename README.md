# ☕ Java 学习 IDE

面向大学 Java 初学者的轻量级开发环境。基于 **Electron + Monaco Editor（VS Code 同款编辑器内核）+ JDK javac** 构建，界面风格参考 Visual Studio Code，力求简洁美观。

📦 GitHub：<https://github.com/jzchen2007/JavaLearnIDE>

## ✨ 功能特性

1. **一键编译 + 外部独立终端窗口**
   - `F5` 编译并运行，`F6` 只编译
   - 程序输出显示在独立的"Java 运行终端"窗口，支持 **Scanner / System.in 控制台输入**
   - 运行结束显示退出码与耗时；`Shift+F5` 或终端"停止"按钮可终止程序
   - 编译依赖本机 JDK；未检测到时可在 设置 → JDK 路径 手动指定

2. **关键字词典侧边栏（离线内置）**
   - 左侧功能栏点击 📖 图标展开词典（再点收起），输入关键字即可查看：**语法用法、中文说明、示例代码、易错点**
   - 内置 50+ 个 Java 关键字（含 var / record / sealed 等新特性）

3. **VS Code 风格编辑器**
   - 语法高亮、括号自动配对、自动缩进
   - **Tab 键自动补全**：输入 `psvm` / `sout` / `fori` 等缩写一键展开；关键字联想补全
   - 简约等宽字体（JetBrains Mono / Consolas），字号可调

4. **学习辅助（你选定的增强项）**
   - ✅ **实时错误波浪线**：停止输入约 1 秒后后台编译，错误在编辑器中标红
   - ✅ **编译错误中文化**：javac 英文报错自动翻译为中文 + 通俗解释 + 修复建议
   - ✅ **出错自动定位**：点击终端错误列表 / 编译失败后自动跳到出错行
   - ✅ **多文件与包支持**：按"项目文件夹"整体编译，支持 package 结构
   - ✅ **代码统计**：状态栏显示今日编写行数、编译次数、运行次数（跨天自动归档）
   - ✅ 多标签页、快捷键速查面板（F1）、深浅主题切换、配置持久化（窗口大小/主题/最近文件）

## 🐾 桌宠「菲比」（v1.1.0 新增）

点击活动栏 🐾 或按 `Ctrl+Alt+P` 呼出桌宠。点击菲比弹出功能菜单：

1. **📋 检查代码**：AI 分析当前编辑器代码，给出中文建议（错误/易错点/改进）
2. **🛠 编译**：一键编译，结果反馈在气泡里
3. **▶ 运行**：编译并在独立终端运行
4. **🙈 躲起来**：隐藏桌宠

**AI 检查配置**（设置 → AI 检查）：

- 方式一（在线，推荐）：填 OpenAI 兼容接口，如 `https://api.siliconflow.cn/v1` + 密钥 + 模型名（如 `Qwen/Qwen2.5-7B-Instruct`）
- 方式二（本地离线）：装 [Ollama](https://ollama.com) 并 `ollama pull qwen2.5-coder:7b`，接口地址填 `http://127.0.0.1:11434/v1`，密钥随便填（如 `ollama`）
- 未配置时自动降级为离线检查（javac 错误汇总）

> 当前为占位 Q 版形象，替换方法：改 [pet.html](renderer/pet.html) 中的 SVG 或换成同人立绘/GIF 图片（`<img>` 放到 `#pet` 内即可）。

## 🚀 运行

要求：已安装 Node.js（≥18）与 JDK（≥17，javac 需在 PATH 中，或在应用"设置"里指定 JDK 路径）。

```bash
npm install     # 安装依赖（首次需下载 Electron，可设 ELECTRON_MIRROR 加速）
npm start       # 启动 IDE
```

> 注：启动脚本 `scripts/launch.js` 会清除环境中的 `ELECTRON_RUN_AS_NODE` 变量，避免 Electron 被当作纯 Node 运行。

## 🎮 快捷键

| 按键 | 功能 |
| --- | --- |
| F5 | 编译并运行 |
| F6 | 仅编译 |
| Shift+F5 | 停止运行 |
| Ctrl+S / Ctrl+N / Ctrl+O | 保存 / 新建 / 打开文件 |
| Ctrl+Shift+O | 打开文件夹（项目） |
| Ctrl+B | 展开/收起侧边栏 |
| Ctrl+Tab / Ctrl+W | 切换 / 关闭标签页 |
| Tab | 接受补全建议（关键字 / 代码片段） |
| F1 | 快捷键速查 |

## 📁 目录结构

```text
F:\JavaIDE\
├── main.js               # 主进程：窗口、javac/java 调用、错误中文化、统计持久化
├── preload.js            # 主窗口 IPC 桥
├── preload-term.js       # 终端窗口 IPC 桥
├── data/
│   └── keywords.json     # 关键字词典（中文解释/用法/示例/易错点）
├── renderer/             # 渲染进程：index.html / app.js / editor.js / sidebar.js / terminal.*
├── vendor/               # 离线前端库（Monaco / xterm，postinstall 自动拷贝）
├── scripts/
│   ├── copy-vendor.js    # node_modules → vendor 拷贝
│   └── launch.js         # 启动器（规避 ELECTRON_RUN_AS_NODE）
└── package.json
```

## 📦 打包免安装版

```bash
npm run dist     # 产出 dist\JavaLearnIDE-<版本>-portable.exe（免安装单文件，双击即用）
```

- 产物：`dist\JavaLearnIDE-0.1.0-portable.exe`（约 87MB），自带 Electron 运行时，目标电脑**无需安装 Node/Electron**，只需 JDK 即可编译运行 Java。
- 内部依赖（Monaco/xterm）已离线打包进 `vendor/`，词典数据离线内置，联网仅用于你主动访问外部资源。
- 如需安装版（带桌面快捷方式）：`npm run dist -- --win nsis`（需调整 scripts/dist.js 参数或直接改 package.json build.win.target）。

## 🧪 无头验证（开发用）

```bash
# 截图界面
$env:SHOT_PATH="D:\shot.png"; node scripts/launch.js

# 端到端验证（编译+运行+交互输入），结果打印在控制台
$env:VERIFY="1"; $env:VERIFY_FILE="C:\path\Hello.java"; node scripts/launch.js
```

## 📦 打包分发（后续可选）

```bash
npm i -D electron-builder
npx electron-builder --win nsis   # 产出 Windows 安装包
```

## ⚠️ 已知说明

- JDK 探测失败时，可在 设置 → JDK 路径 中手动指定（如 `C:\Program Files\Java\jdk-21`）。
- 运行 java 时已显式设置 `stdout/stderr.encoding=UTF-8`，保证中文输出在终端中正常显示。
- 单文件也可直接使用：打开单个 .java 文件时，以该文件所在目录作为编译项目。
