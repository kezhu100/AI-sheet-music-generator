#!/usr/bin/env sh

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install Node.js 18+ and rerun ./start-local.sh." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install npm with Node.js and rerun ./start-local.sh." >&2
  exit 1
fi

if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  echo "Root npm dependencies are missing. Run \`npm install\` from the repository root, then rerun ./start-local.sh." >&2
  exit 1
fi

if [ ! -d "$SCRIPT_DIR/apps/api/venv" ]; then
  echo "API virtual environment is missing at apps/api/venv. Create it and install apps/api/requirements.txt before rerunning ./start-local.sh." >&2
  exit 1
fi

cd "$SCRIPT_DIR" || exit 1
npm run app
