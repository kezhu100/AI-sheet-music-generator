from __future__ import annotations

from pathlib import Path
import subprocess


def check_python_module(python_executable: str, module_name: str) -> tuple[bool, str]:
    executable_path = Path(python_executable)
    if not executable_path.exists():
        return False, f"Python executable was not found at '{python_executable}'."

    command = [python_executable, "-c", f"import {module_name}"]
    try:
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except OSError as exc:
        return False, f"Could not run '{python_executable}': {exc}"

    if completed.returncode == 0:
        return True, "ok"

    detail = completed.stderr.strip() or completed.stdout.strip() or f"exit code {completed.returncode}"
    return False, detail
