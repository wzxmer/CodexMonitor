# CodexMonitor 中文增强版

[![GitHub](https://img.shields.io/badge/GitHub-wzxmer%2FCodexMonitor-24292f?logo=github)](https://github.com/wzxmer/CodexMonitor)

![CodexMonitor](screenshot.png)

CodexMonitor 是一个基于 Tauri 的 Codex 桌面客户端，用来管理本地项目、Codex Agent 会话、Git 变更、提示词和远程后端。这个分支面向中文桌面用户做了界面汉化、视觉优化、会话管理和打包发布增强，支持 Windows、macOS 和 Linux。

关键词：CodexMonitor 中文版、CodexMonitor 汉化增强版、Codex 桌面客户端、Codex 多会话管理、Codex Agent 工作区管理。

## 下载

从 [Releases](https://github.com/wzxmer/CodexMonitor/releases/latest) 下载对应平台安装包。每个版本页面顶部提供 Windows、macOS Apple Silicon / Intel、Linux x64 / ARM64 推荐直链，其他格式仍保留在 Assets 列表：

- Windows: `.exe` / `.msi`
- macOS: `.dmg`
- Linux: `.AppImage` / `.rpm`

Windows 已使用 `.exe` 安装的用户请继续用 `.exe` 更新；MSI 不会在安装事务中自动卸载现有 NSIS 版本，切换到 MSI 前需先手动卸载旧版。

macOS 版本当前采用完整 ad-hoc 签名，但尚未使用 Apple Developer ID 公证。首次启动若被 Gatekeeper 阻止，请在“应用程序”中右键 Codex Monitor 并选择“打开”，或前往“系统设置 > 隐私与安全性 > 仍要打开”；正常情况下无需执行 `xattr` 命令。

## 主要增强

- 中文界面：侧边栏、设置、消息、提示、按钮和常用状态文案中文化。
- 视觉统一：设置页、侧栏、消息区和弹层控件改为更一致的桌面软件风格。
- 对话主题：原生亮色、纯白、原生暗色、CLI 暗黑等会话风格；跟随系统暗色时自动使用黑橙外观。
- 字体体验：默认使用 `PingFang SC` / 内置 `Noto Sans SC Variable` / `Microsoft YaHei UI` 字体链，中文显示更圆润饱满；支持 UI、会话、过程状态、代码四类字号独立调整，UI 字号同步覆盖侧栏、设置、工具栏、弹层和输入区。
- 模型服务商管理：以卡片按钮切换多组配置，展示启用状态与 URL，并支持独立模型和上下文参数。
- 模型无关工作流：CodexMonitor 统一匹配公共 skills、agents、项目规则和知识候选；默认使用不注入模型上下文的影子模式，可在“设置 > 工作流”切换关闭、影子或启用模式，并刷新 Registry、查看脱敏诊断。
- 用量显示：左下角 Codex 用量可开关，支持已用/剩余额度切换；首页区分缓存读取和未缓存输入，不把缓存读取直接等同于已节省 token。
- 本机会话管理：显示本机会话总数，历史统一从会话管理进入；默认选中当前列表首项，右侧展示最初需求和最近有效对话；跨项目可返回原项目或引用上下文到当前项目创建新会话。
- 消息体验：编辑失败消息后重发会覆盖原消息，避免重复堆积；“自动重连”默认关闭，手动开启后仅对当前会话有效，在任务非主动中止时持续尝试恢复连接并继续，且不占用 Codex 当前任务的尝试次数；图片粘贴、拖放和预览支持悬浮复制、应用内大图查看，内部生成图片使用紧凑显示名；达到 4,000 字符或 80 行的大量文本粘贴会自动转为可预览、可恢复的 TXT 附件。
- Git 工作流：查看改动、Diff、日志、分支、提交、推送/拉取，并支持 GitHub Issues/PR 列表与 PR 上下文提问。
- 远程后端：支持桌面 daemon、TCP/Tailscale 连接和 iOS 远程模式。

## 功能概览

### 项目、会话与 Agent

- 添加、分组、排序和连接多个工作区。
- 启动或恢复 Codex `app-server` 会话，显示运行中、未读、审批和用户输入状态。
- 长会话按设置数量分批显示；滚动到顶部或底部可继续加载，当前会话搜索会自动展开并定位隐藏历史，避免一次性渲染全部内容。
- 消息支持引用选中内容或整条消息到当前/新会话；长内容可用智能引用保存为后端只读快照，按需读取，避免把全文重复塞入上下文。
- 大型文本附件、日志和 diff 会优先保存为内容寻址快照并发送轻量引用；小文件或旧版远程端继续按原方式内联。
- 新建普通 Agent、worktree Agent 和副本 Agent，隔离实验性改动。
- 子会话可按“仅最终结果 / 关键检查点 / 持续同步”向父会话反馈进展；父会话运行中使用 steer 实时注入，空闲时等待下一轮，不会自动启动新 turn。
- Pin、重命名、归档、复制、停止和中断会话。
- 本地 Codex 历史会话按项目和来源聚合，缺失项目和子代理会话可单独识别。

### 输入框与模型控制

- 图片附件支持选择、拖放和粘贴。
- 支持 `$` 技能、`/prompts:` 提示词、`/review`、`@` 文件路径补全。
- 可配置默认跟进行为：排队发送或在运行中 steer。
- 模型、推理强度、访问模式、协作模式和上下文用量在输入区集中控制。
- `设置 > Codex > 默认参数` 提供质量、均衡、节省三档 Token 效率策略；仅影响新会话，可随时回到质量模式。
- 支持语音输入和按住说话快捷键。

### Git、GitHub 与文件

- 文件树搜索、图标、快速打开和 Reveal in Finder/Explorer。
- Git 状态、分文件 Diff、暂存/撤销、提交日志、分支切换和同步。
- GitHub Issues/PR 读取、PR Diff/评论查看，以及将 PR 上下文发送给 Agent。
- 全局和工作区提示词库支持创建、编辑、删除、移动和直接运行。

### 设置与体验

- 设置分区覆盖显示、输入、会话、项目、Codex、工作流、Git、功能、快捷键、更新和环境。
- 会话设置可按 30/60/90/180 天管理归档会话永久清理；功能默认关闭，开启和立即清理都需明确二次确认，自动检查最多每 24 小时一次，并保护当前、运行中和置顶会话。
- UI 缩放、字体、字号、字重、透明效果、消息文件路径、工具折叠、Diff 预加载等可配置。
- 侧栏、右侧面板、计划面板、终端和调试面板尺寸持久化。
- 通知声音、系统通知、更新提示、调试日志复制和清空。
- 应用更新默认使用 GitHub；发布者配置腾讯 COS / 阿里 OSS 后，检查或下载失败会按 COS、OSS 顺序自动切换，并校验安装包大小与 SHA-256。
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

### 国内更新镜像（可选）

镜像未配置时保持 GitHub-only，不影响构建。启用镜像时，在 GitHub `release` Environment 配置：

- Variables：`TENCENT_UPDATE_BASE_URL`、`TENCENT_UPDATE_MANIFEST_URL`、`TENCENT_COS_BUCKET`、`TENCENT_COS_REGION`
- Secrets：`TENCENT_COS_SECRET_ID`、`TENCENT_COS_SECRET_KEY`
- Variables：`ALIYUN_UPDATE_BASE_URL`、`ALIYUN_UPDATE_MANIFEST_URL`、`ALIYUN_OSS_BUCKET`、`ALIYUN_OSS_ENDPOINT`
- Secrets：`ALIYUN_OSS_ACCESS_KEY_ID`、`ALIYUN_OSS_ACCESS_KEY_SECRET`
- Variables：`TENCENT_CODEX_CLI_BASE_URL`、`TENCENT_CODEX_CLI_MANIFEST_URL`
- Variables：`ALIYUN_CODEX_CLI_BASE_URL`、`ALIYUN_CODEX_CLI_MANIFEST_URL`

`*_UPDATE_BASE_URL` 是公开下载根地址，`*_UPDATE_MANIFEST_URL` 通常为该根地址下的 `latest.json`。发布流程会生成版本目录、校验值和清单，并仅在对应配置完整时上传。

发布流程还会从 OpenAI 官方 Codex Release 获取各平台完整 CLI package（包含相关辅助组件），重新打包为统一 ZIP，生成 `codex-cli-latest.json` 并同步到 GitHub、COS 和 OSS。客户端未检测到可运行的 `codex app-server` 时，会提示用户确认后自动下载到应用数据目录，不修改系统 PATH。

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
- Codex 配置读取 `$CODEX_HOME/config.toml` 或 `~/.codex/config.toml`；Provider 配置支持 OpenAI、DeepSeek、OpenRouter、OpenCode Zen 和自定义 OpenAI 兼容服务。激活 Provider 配置时会覆盖全局 `model_provider`；OpenCode Zen 会自动使用兼容网关转换 Codex Responses API 请求，并要求选择明确模型。
- 自定义提示词读取 `$CODEX_HOME/prompts` 或 `~/.codex/prompts`。
- worktree Agent 默认位于应用数据目录 `worktrees/<workspace-id>`，旧 `.codex-worktrees/` 路径仍兼容。
- UI 状态如面板尺寸、透明度和最近活动保存在 `localStorage`。

## 维护入口

- 前端 IPC：`src/services/tauri.ts`
- Tauri 命令：`src-tauri/src/lib.rs`
- Daemon RPC：`src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- 共享后端核心：`src-tauri/src/shared/`
- 代码导航：`docs/codebase-map.md`
