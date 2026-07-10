# CodexMonitor 中文增强版

[![GitHub](https://img.shields.io/badge/GitHub-wzxmer%2FCodexMonitor-24292f?logo=github)](https://github.com/wzxmer/CodexMonitor)

![CodexMonitor](screenshot.png)

CodexMonitor 是一个基于 Tauri 的 Codex 桌面客户端，用来管理本地项目、Codex Agent 会话、Git 变更、提示词和远程后端。这个分支面向中文桌面用户做了界面汉化、视觉优化、会话管理和打包发布增强，支持 Windows、macOS 和 Linux。

关键词：CodexMonitor 中文版、CodexMonitor 汉化增强版、Codex 桌面客户端、Codex 多会话管理、Codex Agent 工作区管理。

## 下载

从 [Releases](https://github.com/wzxmer/CodexMonitor/releases/latest) 下载对应平台安装包：

- Windows: `.exe` / `.msi`
- macOS: `.dmg`
- Linux: `.AppImage` / `.rpm`

## 主要增强

- 中文界面：侧边栏、设置、消息、提示、按钮和常用状态文案中文化。
- 视觉统一：设置页、侧栏、消息区和弹层控件改为更一致的桌面软件风格。
- 对话主题：原生亮色、纯白、原生暗色、CLI 暗黑等会话风格；跟随系统暗色时自动使用黑橙外观。
- 字体体验：默认使用 `PingFang SC` / 内置 `Noto Sans SC Variable` / `Microsoft YaHei UI` 字体链，中文显示更圆润饱满；支持 UI、会话、过程状态、代码四类字号独立调整。
- 配置管理：Codex 配置以卡片按钮切换，支持多配置、启用状态、URL 展示和第三方 Key 组倍率。
- 用量显示：左下角 Codex 用量可开关，支持已用/剩余额度切换；第三方 Key 用量可按倍率估算。
- 本机会话管理：独立查看本机 Codex 历史会话，支持来源、状态、子代理筛选、归档和安全永久删除；永久删除会同步清理会话附件。
- 消息体验：编辑失败消息后重发会覆盖原消息，避免重复堆积；图片粘贴、拖放、预览和附件类型处理更完整；大量文本粘贴可自动转为可预览、可恢复的 TXT 附件。
- Git 工作流：查看改动、Diff、日志、分支、提交、推送/拉取，并支持 GitHub Issues/PR 列表与 PR 上下文提问。
- 远程后端：支持桌面 daemon、TCP/Tailscale 连接和 iOS 远程模式。

## 功能概览

### 项目、会话与 Agent

- 添加、分组、排序和连接多个工作区。
- 启动或恢复 Codex `app-server` 会话，显示运行中、未读、审批和用户输入状态。
- 长会话按设置数量分批显示；滚动到顶部或底部可继续加载，当前会话搜索会自动展开并定位隐藏历史，避免一次性渲染全部内容。
- 新建普通 Agent、worktree Agent 和副本 Agent，隔离实验性改动。
- Pin、重命名、归档、复制、停止和中断会话。
- 本地 Codex 历史会话按项目和来源聚合，缺失项目和子代理会话可单独识别。

### 输入框与模型控制

- 图片附件支持选择、拖放和粘贴。
- 支持 `$` 技能、`/prompts:` 提示词、`/review`、`@` 文件路径补全。
- 可配置默认跟进行为：排队发送或在运行中 steer。
- 模型、推理强度、访问模式、协作模式和上下文用量在输入区集中控制。
- 支持语音输入和按住说话快捷键。

### Git、GitHub 与文件

- 文件树搜索、图标、快速打开和 Reveal in Finder/Explorer。
- Git 状态、分文件 Diff、暂存/撤销、提交日志、分支切换和同步。
- GitHub Issues/PR 读取、PR Diff/评论查看，以及将 PR 上下文发送给 Agent。
- 全局和工作区提示词库支持创建、编辑、删除、移动和直接运行。

### 设置与体验

- 设置分区覆盖显示、输入、会话、项目、Codex、Git、功能、快捷键、更新和环境。
- 会话设置可按 30/60/90/180 天管理归档会话永久清理；功能默认关闭，开启和立即清理都需明确二次确认，自动检查最多每 24 小时一次，并保护当前、运行中和置顶会话。
- UI 缩放、字体、字号、字重、透明效果、消息文件路径、工具折叠、Diff 预加载等可配置。
- 侧栏、右侧面板、计划面板、终端和调试面板尺寸持久化。
- 通知声音、系统通知、更新提示、调试日志复制和清空。
- 桌面/平板/手机响应式布局，iOS 走远程后端模式。

## 环境要求

- Node.js + npm
- Rust stable toolchain
- CMake
- Windows 构建需要 LLVM/Clang（`bindgen` / `libclang`）
- Codex CLI 可在 `PATH` 中作为 `codex` 运行，或在设置中指定自定义路径
- Git CLI
- GitHub CLI `gh`（可选，用于 Issues/PR 功能）

遇到原生依赖或环境问题时运行：

```bash
npm run doctor
```

## 本地开发

安装依赖：

```bash
npm install
```

启动桌面开发模式：

```bash
npm run tauri:dev
```

常用验证：

```bash
npm run typecheck
npm run test
npm run lint
cd src-tauri && cargo check
```

生产构建：

```bash
npm run tauri:build
```

Windows 专用构建：

```bash
npm run tauri:build:win
```

产物位于 `src-tauri/target/release/bundle/`。

## 远程后端与 iOS

iOS 当前以远程后端为主：手机端连接桌面或服务器上的 CodexMonitor daemon。桌面端默认仍是本地优先。

### Tailscale TCP 连接

1. 桌面和 iPhone 登录同一个 Tailscale tailnet。
2. 桌面 CodexMonitor 打开 `设置 > 服务器`。
3. 设置 Remote backend token。
4. 启动 Mobile access daemon。
5. 使用 Tailscale helper 检测主机地址，例如 `your-mac.your-tailnet.ts.net:4732`。
6. iOS 端填写同一个主机地址和 token。
7. 点击连接测试。

桌面 daemon 必须保持运行；连接失败时先检查 Tailscale 在线状态、地址和 token。

### 无桌面 UI 的 daemon 管理

```bash
cd src-tauri
cargo build --bin codex_monitor_daemon --bin codex_monitor_daemonctl
./target/debug/codex_monitor_daemonctl status
./target/debug/codex_monitor_daemonctl start
./target/debug/codex_monitor_daemonctl stop
```

常用参数：

- `--data-dir <path>`: 指定包含 `settings.json` / `workspaces.json` 的数据目录
- `--listen <addr>`: 覆盖监听地址
- `--token <token>`: 覆盖 token
- `--daemon-path <path>`: 指定 daemon 二进制路径
- `--json`: 输出机器可读 JSON

### iOS 构建

安装目标：

```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
```

模拟器：

```bash
./scripts/build_run_ios.sh
```

真机：

```bash
./scripts/build_run_ios_device.sh --list-devices
./scripts/build_run_ios_device.sh --device "<device name or identifier>" --team <TEAM_ID>
```

TestFlight 发布脚本：

```bash
./scripts/release_testflight_ios.sh
```

本地签名配置优先放在 `src-tauri/tauri.ios.local.conf.json`。

## 项目结构

```text
src/
  features/                         前端功能模块
  features/app/bootstrap/           启动和恢复编排
  features/app/orchestration/       布局、线程、工作区编排
  features/threads/hooks/           会话状态和消息 reducer
  services/                         Tauri IPC 封装
  styles/                           按区域拆分的 CSS
  types.ts                          前端共享类型
src-tauri/
  src/lib.rs                        Tauri 命令注册
  src/bin/codex_monitor_daemon.rs   远程 daemon 入口
  src/bin/codex_monitor_daemon/rpc/ daemon RPC 处理
  src/shared/                       App 与 daemon 共用核心逻辑
  src/codex/                        Codex app-server 适配
  src/workspaces/                   工作区和 worktree 适配
```

更详细的任务导向文件地图见 `docs/codebase-map.md`。

## 数据与配置

- 工作区保存到应用数据目录的 `workspaces.json`。
- 设置保存到应用数据目录的 `settings.json`。
- Codex 配置读取 `$CODEX_HOME/config.toml` 或 `~/.codex/config.toml`。
- 自定义提示词读取 `$CODEX_HOME/prompts` 或 `~/.codex/prompts`。
- worktree Agent 默认位于应用数据目录 `worktrees/<workspace-id>`，旧 `.codex-worktrees/` 路径仍兼容。
- UI 状态如面板尺寸、透明度和最近活动保存在 `localStorage`。

## 维护入口

- 前端 IPC：`src/services/tauri.ts`
- Tauri 命令：`src-tauri/src/lib.rs`
- Daemon RPC：`src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- 共享后端核心：`src-tauri/src/shared/`
- 代码导航：`docs/codebase-map.md`
