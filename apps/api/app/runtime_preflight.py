from __future__ import annotations

import sys

from app.services.runtime_diagnostics import RuntimeDiagnosticsService


def main() -> int:
    result = RuntimeDiagnosticsService().collect()
    diagnostics = result.diagnostics

    print(f"Runtime preflight: {diagnostics.severity}")
    print(diagnostics.summary)

    for storage in diagnostics.storage:
        status = "ready" if storage.ready else "blocking"
        print(f"[storage:{status}] {storage.label}: {storage.message}")

    for provider in diagnostics.providers:
        print(f"[provider:{provider.status}] {provider.label}: {provider.message}")
        for guidance in provider.guidance:
            print(f"  - {guidance}")

    if diagnostics.constraints:
        print("Local-first runtime constraints:")
        for constraint in diagnostics.constraints:
            print(f"  - {constraint}")

    return 1 if result.is_blocking else 0


if __name__ == "__main__":
    raise SystemExit(main())
