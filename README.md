# Java 学习 IDE

面向编程初学者的轻量级开发环境，支持 **Java 与 Python 3**。基于 **Electron + Monaco Editor（VS Code 同款编辑器内核）** 构建，Java 用 JDK javac、Python 用本机 Python3 解释器，界面风格参考 Visual Studio Code。

GitHub：<https://github.com/jzchen2007/JavaLearnIDE>

## 🐍 v2.1.0 更新：兼容 Python 3

> v2.1.0 让 IDE 同时支持 Java 与 Python 3，一套工具、两种语言。

- **自动搜索 Python 路径**：启动时自动探测（自定义路径 → `python` → `python3` → `py -3` → 常见安装目录），未检测到时可在 设置 → Python 路径 手动指定
- **Python 一键编译运行**：`.py` 文件做语法检查（`py_compile`，不残留 `__pycache__`）+ 直接运行，输出进入同一独立终端；Python 报错（SyntaxError / NameError / TypeError / IndexError…）自动翻译为中文
- **字典新增 Python 关键字**：词典侧边栏内置 Java + Python 双语言关键字（def / print / for / lambda / with 等 100+ 条），每条带语言徽标、中文解释、示例与易错点
- **编辑器自动识别语言**：打开 `.py` 文件自动切换 Python 语法高亮与补全（`main` / `def` / `print` / `fori` 等代码片段 + 关键字联想）
- 文件树同时列出 `.java` 与 `.py`，新建文件支持 Java / Python 两种模板；桌宠 AI 检查自动识别当前语言

## 🐾 v2.0.0 大版本：桌宠「菲比」

> v2.0.0 的核心更新是内置了 AI 桌宠「菲比」——开屏即出现在界面上，陪伴你写代码。

**开屏默认显示**：启动应用菲比自动出现（点击活动栏爪印图标或 `Ctrl+Alt+P` 可隐藏/唤回）。

**点击菲比**弹出功能菜单：

1. **检查代码**：AI 分析当前编辑器代码，给出中文建议（错误/易错点/改进）
2. **编译**：一键编译，结果反馈在气泡里
3. **运行**：编译并在独立终端运行
4. **躲起来**：隐藏桌宠

**表情状态**（随动作切换 GIF 动画）：待机 / 敲代码 / 思考 / 庆祝 / 失败，动作完成后 4 秒自动回待机。

**交互细节**：

- 与主界面同一图层：切到其他窗口时菲比一起被盖住，回到 IDE 又出现在前面
- 可按住拖动到屏幕任意位置（自动吸附屏幕边缘，不会拖丢）
- 气泡紧贴菲比头顶，菜单弹出带动画
- 5 个 GIF 动画状态来自开源同人资源（鸣潮菲比）

**AI 检查配置**（设置 → AI 检查）：

- 方式一（在线，推荐）：填 OpenAI 兼容接口，如 `https://api.siliconflow.cn/v1` + 密钥 + 模型名（如 `Qwen/Qwen2.5-7B-Instruct`）
- 方式二（本地离线）：装 [Ollama](https://ollama.com) 并 `ollama pull qwen2.5-coder:7b`，接口地址填 `http://127.0.0.1:11434/v1`
- 未配置时自动降级为离线检查（javac 错误汇总）

## ✨ 功能特性

1. **一键编译 + 外部独立终端窗口**
   - `F5` 编译并运行，`F6` 只编译
   - 程序输出显示在独立的"Java 运行终端"窗口，支持 Scanner / System.in 控制台输入
   - 运行结束显示退出码与耗时；`Shift+F5` 或终端"停止"按钮可终止程序
   - 编译依赖本机 JDK；未检测到时可在 设置 → JDK 路径 手动指定

2. **关键字词典侧边栏（离线内置，Java + Python 双语言）**
   - 左侧功能栏点击词典图标展开词典（再点收起），输入关键字即可查看：语法用法、中文说明、示例代码、易错点
   - 内置 100+ 个关键字：Java（含 var / record / sealed 等新特性）+ Python 3（含 def / lambda / with / f-string 等），每条带语言徽标

3. **VS Code 风格编辑器**
   - 语法高亮、括号自动配对、自动缩进
   - Tab 键自动补全：输入 `psvm` / `sout` / `fori` 等缩写一键展开；关键字联想补全
   - 简约等宽字体（JetBrains Mono / Consolas），字号可调

4. **学习辅助**
   - 实时错误波浪线：停止输入约 1 秒后后台编译，错误在编辑器中标红
   - 编译错误中文化：javac 英文报错自动翻译为中文 + 通俗解释 + 修复建议
   - 出错自动定位：编译失败后自动跳到出错行
   - 多文件与包支持：按"项目文件夹"整体编译，支持 package 结构
   - 代码统计：状态栏显示今日编写行数、编译次数、运行次数（跨天自动归档）
   - 多标签页、快捷键速查面板（F1）、深浅主题切换、配置持久化

5. **UI 设计（v2.0.0 重做）**
   - 全部界面图标改为自绘线性 SVG（24x24 / 圆角 / 跟随主题），不再使用 Emoji，风格规范见 [data/ui-style.md](data/ui-style.md)
   - 全新开屏页：自绘渐变 Logo、功能卡片、入场动画
   - 交互动画：按钮按压反馈、活动栏指示条、侧边栏/弹窗/气泡过渡动画

## 🚀 运行

要求：已安装 Node.js（≥18）；Java 开发需 JDK（≥17，javac 在 PATH 中或在"设置"里指定），Python 开发需 Python 3（自动搜索，或在"设置"里指定解释器路径）。

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
| Ctrl+Alt+P | 显示/隐藏桌宠 |
| Ctrl+Tab / Ctrl+W | 切换 / 关闭标签页 |
| Tab | 接受补全建议（关键字 / 代码片段） |
| F1 | 快捷键速查 |

## 📁 目录结构

```text
JavaLearnIDE\
├── main.js               # 主进程：窗口、javac/java/python 调用、错误中文化、统计持久化
├── preload.js            # 主窗口 IPC 桥
├── preload-term.js       # 终端窗口 IPC 桥
├── preload-pet.js        # 桌宠窗口 IPC 桥
├── data/
│   ├── keywords.json     # Java 关键字词典（中文解释/用法/示例/易错点）
│   ├── python-keywords.json  # Python 关键字词典
│   └── ui-style.md       # UI 设计规范（图标风格）
├── renderer/             # 渲染进程
│   ├── icons.js          # 自绘线性 SVG 图标库
│   ├── index.html / app.js / editor.js / sidebar.js / styles.css
│   ├── terminal.*        # 运行终端窗口
│   └── pet.* + pet/      # 桌宠窗口与 GIF 动画资源
├── vendor/               # 离线前端库（Monaco / xterm，postinstall 自动拷贝）
├── scripts/
│   ├── copy-vendor.js    # node_modules → vendor 拷贝
│   ├── dist.js           # 打包脚本（真实 node 调用 electron-builder）
│   └── launch.js         # 启动器（规避 ELECTRON_RUN_AS_NODE）
└── package.json
```

## 📦 打包免安装版

```bash
npm run dist     # 产出 dist\JavaLearnIDE-<版本>-portable.exe（免安装单文件，双击即用）
```

- 产物：`dist\JavaLearnIDE-2.1.0-portable.exe`（约 83MB），自带 Electron 运行时，目标电脑无需安装 Node/Electron，只需 JDK（编译 Java）与 Python（运行 Python）即可。
- 内部依赖（Monaco/xterm）已离线打包进 `vendor/`，词典数据离线内置，联网仅用于 AI 检查（可选）与主动访问外部资源。
- 便携版运行时会在系统临时目录解压，可直接复制整个 exe 分发，也可以放在任意目录双击运行（首次启动稍慢属正常解压过程）。

## 🧪 无头验证（开发用）

```bash
# 截图界面
$env:SHOT_PATH="D:\shot.png"; node scripts/launch.js

# 端到端验证（编译+运行+桌宠+布局，结果打印在控制台）
$env:VERIFY="1"; $env:VERIFY_FILE="C:\path\Hello.java"; node scripts/launch.js
```

## ⚠️ 已知说明

- JDK 探测失败时，可在 设置 → JDK 路径 中手动指定（如 `C:\Program Files\Java\jdk-21`）。
- Python 未自动检测到时，可在 设置 → Python 路径 中手动指定解释器（如 `C:\Python312\python.exe`）。
- 运行 java 时已显式设置 `stdout/stderr.encoding=UTF-8`，运行 Python 时已启用 UTF-8 模式（`PYTHONUTF8`），保证中文输出在终端中正常显示。
- 单文件也可直接使用：打开单个 .java / .py 文件时，以该文件所在目录作为编译项目。
- AI 密钥仅保存在本机用户配置目录，不会随应用分发。
