# AI Sheet Music Generator (Local-First, No Cloud, One Command)

Turn audio into structured sheet music with a browser UI and a local backend.

将音频转换为结构化乐谱，使用浏览器界面与本地后端完成整个流程。

- Local-first: runs entirely on your machine with local filesystem storage
- One-command startup: `npm run app`
- No cloud, no uploads, privacy-first by default

- 本地优先：完全运行在你的机器上，数据保存在本地文件系统
- 一键启动：`npm run app`
- 无云端、无上传，默认以隐私优先为前提

## Demo (Local) / 本地运行

```bash
npm run app
```

Then open the selected local web URL shown at startup.

然后打开启动时显示的本地网页地址。

## 📸 Screenshot / 截图

![App Screenshot](docs/screenshot.png)

## ✨ Features / 功能特点

### 🎵 Core Capabilities
- Audio to structured sheet music for piano and drums
- Draft-based editing workflow in the browser
- MIDI and MusicXML export
- Original result, saved draft, and in-session draft stay separate

### 🎵 核心能力
- 将音频转换为适用于钢琴与鼓的结构化乐谱数据
- 在浏览器中完成基于草稿的编辑流程
- 支持导出 MIDI 与 MusicXML
- 原始结果、已保存草稿与会话内草稿彼此独立

### 🧠 AI Pipeline
- Provider-based source separation, piano transcription, and drum transcription
- Works out of the box with heuristic providers
- Optional stronger providers: Demucs, Basic Pitch, and madmom
- Timing-aware post-processing, quantization, and structure alignment

### 🧠 AI 流水线
- 基于 provider 的源分离、钢琴转写与鼓转写架构
- 默认启发式 provider 可直接运行
- 可选更强 provider：Demucs、Basic Pitch 与 madmom
- 包含时序后处理、量化与结构对齐

### 💻 Local-First Design
- Browser UI plus a local FastAPI backend
- No server upload, no accounts, no cloud dependency
- Files, stems, drafts, and projects stay on the local filesystem
- Built-in runtime diagnostics at `/api/v1/runtime`

### 💻 本地优先设计
- 浏览器界面配合本地 FastAPI 后端
- 无服务端上传、无账号、无云依赖
- 文件、stem、草稿与项目都保存在本地文件系统
- 内置 `/api/v1/runtime` 运行时诊断接口

### ⚡ Developer Experience
- `npm run app` for user-facing local startup
- `npm run dev` for the developer workflow
- App mode adds startup checks and runtime guidance
- Root Node orchestrator starts frontend and backend together

### ⚡ 开发体验
- 使用 `npm run app` 进行面向用户的本地启动
- 使用 `npm run dev` 进行开发工作流
- app 模式提供启动检查与运行时提示
- 根目录 Node 编排脚本统一启动前后端

## 🚀 Getting Started / 快速开始

1. Install dependencies

   安装依赖

   ```bash
   npm install
   ```

2. Setup Python environment

   配置 Python 环境

   ```bash
   cd apps/api
   python -m venv venv
   venv\Scripts\activate   # Windows
   pip install -r requirements.txt
   cd ../..
   ```

3. Run the app

   启动应用

   ```bash
   npm run app
   ```

👉 That’s it.

这样就可以开始使用了。

## 🧪 Development Mode / 开发模式

```bash
npm run dev
```

For developers only.
Faster iteration.
No strict checks.
No browser auto-open.

仅供开发使用。
迭代更快。
无严格启动检查。
不会自动打开浏览器。

## ⚙️ Runtime Modes / 运行模式

| Mode | Command | Description |
| --- | --- | --- |
| App Mode | `npm run app` | ✅ User-friendly, one-command startup |
| Dev Mode | `npm run dev` | 🔧 Developer workflow |

| 模式 | 命令 | 说明 |
| --- | --- | --- |
| 应用模式 | `npm run app` | ✅ 面向用户的一键本地启动 |
| 开发模式 | `npm run dev` | 🔧 面向开发者的工作流 |

## 🧠 Architecture / 架构

Frontend: Next.js (browser UI)
Backend: FastAPI (local API)
Storage: Local filesystem
Orchestration: Node.js (`scripts/dev.mjs`)
Contracts: Stable `JobResult` model

前端：Next.js（浏览器界面）
后端：FastAPI（本地 API）
存储：本地文件系统
编排：Node.js（`scripts/dev.mjs`）
契约：稳定的 `JobResult` 模型

### Key Principles
- local-first
- no cloud dependency
- draft-based editing
- provider-based AI pipeline

### 核心原则
- 本地优先
- 无云依赖
- 基于草稿的编辑流程
- 基于 provider 的 AI 流水线

## 📊 Runtime Diagnostics / 运行时诊断

Check system status:

```text
http://127.0.0.1:8000/api/v1/runtime
```

Includes:
- storage readiness
- provider status
- fallback behavior
- local constraints

用于检查系统状态，包含：
- 存储目录就绪情况
- provider 状态
- fallback 行为
- 本地运行约束

## ⚠️ Limitations / 限制

- No cloud sync
- No multi-device support
- No background job recovery
- Runs on a single local machine

- 不支持云同步
- 不支持多设备协作
- 不支持后台任务重启恢复
- 面向单机本地运行

## 🛣️ Roadmap / 路线图

### ✅ Phase 14L (Completed)
- One-command local startup
- Runtime diagnostics
- Improved startup UX

### ✅ Phase 14L（已完成）
- 本地一键启动
- 运行时诊断
- 启动体验改进

### 🔜 Phase 15L (Optional)
- Desktop packaging (Electron / Tauri)

### 🔜 Phase 15L（可选）
- 桌面封装（Electron / Tauri）

## 🧑‍💻 Why this project? / 为什么做这个项目？

Most AI music tools:
- require uploads ❌
- rely on cloud ❌
- are hard to run locally ❌

This project is built to be:
- simple ✅
- private ✅
- actually runnable ✅

很多 AI 音乐工具往往：
- 需要上传文件 ❌
- 依赖云端服务 ❌
- 本地运行门槛高 ❌

这个项目则强调：
- 简单可用 ✅
- 隐私友好 ✅
- 真正可在本机运行 ✅

## ⭐ If you like this project / 如果这个项目对你有帮助

Give it a star — it really helps.

欢迎点个 Star，这会带来很大帮助。

## 📄 License / 许可证

MIT
