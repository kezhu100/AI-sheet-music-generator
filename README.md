🎼 AI Sheet Music Generator

🎧 Turn audio into sheet music — fully local, one command, no cloud required.

A local-first AI tool that converts audio into structured sheet music with a clean browser UI.

✨ Runs entirely on your machine
⚡ One-command startup
🔒 No uploads, no cloud, no privacy concerns

🔥 Demo (Local)
npm run app

Then open:

http://localhost:3000
 (or auto-selected port)

✨ Features

🎵 Audio → Sheet Music

Piano & drum transcription

Timing-aware post-processing

Quantization and structure alignment

🧠 AI + Heuristic Hybrid Pipeline

Works out of the box (no heavy ML required)

Optional advanced providers (Demucs / Basic Pitch)

💻 Local-First Architecture

No server upload

No accounts

Files stored locally

⚡ One-Command Startup

npm run app

Automatic environment checks

Friendly error guidance

📊 Runtime Diagnostics

Built-in /api/v1/runtime

Clear system readiness and provider status

📝 Draft Editing System

Original result

Saved draft

In-session edits

Fully separated and safe

🚀 Getting Started
1. Install dependencies
npm install
2. Setup Python environment
cd apps/api
python -m venv venv
venv\Scripts\activate   # Windows
pip install -r requirements.txt
3. Run the app
npm run app

👉 That’s it.

🧪 Development Mode
npm run dev

For developers only

Faster iteration

No strict checks

No browser auto-open

⚙️ Runtime Modes
Mode	Command	Description
App Mode	npm run app	✅ User-friendly, one-command startup
Dev Mode	npm run dev	🔧 Developer workflow
🧠 Architecture

Frontend: Next.js (browser UI)

Backend: FastAPI (local API)

Storage: Local filesystem

Orchestration: Node.js (scripts/dev.mjs)

Contracts: Stable JobResult model

Key Principles

local-first

no cloud dependency

draft-based editing

provider-based AI pipeline

📊 Runtime Diagnostics

Check system status:

http://127.0.0.1:8000/api/v1/runtime

Includes:

storage readiness

provider status

fallback behavior

local constraints

⚠️ Limitations

No cloud sync

No multi-device support

No background job recovery

Runs on a single local machine

🛣️ Roadmap
✅ Phase 14L (Completed)

One-command local startup

Runtime diagnostics

Improved startup UX

🔜 Phase 15L (Optional)

Desktop packaging (Electron / Tauri)

🧑‍💻 Why this project?

Most AI music tools:

require uploads ❌

rely on cloud ❌

are hard to run locally ❌

This project is built to be:

Simple, private, and actually runnable.

⭐ If you like this project

Give it a star ⭐ — it really helps!

📄 License

MIT
