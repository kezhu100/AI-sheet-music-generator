from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

try:
    import numpy as np
except Exception:  # pragma: no cover - numpy is expected transitively, but keep serialization guard resilient
    np = None  # type: ignore[assignment]


def main() -> int:
    args = _parse_args()

    try:
        from basic_pitch.inference import predict
    except Exception as exc:  # pragma: no cover - exercised indirectly through subprocess failure paths
        print(f"Basic Pitch import failed: {exc}", file=sys.stderr)
        return 1

    try:
        _, _, note_events = predict(str(args.input))
    except Exception as exc:  # pragma: no cover - exercised indirectly through subprocess failure paths
        print(f"Basic Pitch inference failed: {exc}", file=sys.stderr)
        return 1

    payload = {
        "noteEvents": _normalize_events(note_events),
    }
    args.output.write_text(json.dumps(payload, default=_json_default), encoding="utf-8")
    return 0


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Basic Pitch inference and emit normalized note events as JSON.")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def _normalize_events(events: Iterable[Any]) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []

    for event in events:
        coerced = _coerce_event(event)
        if coerced is not None:
            normalized.append(coerced)

    return normalized


def _coerce_event(event: Any) -> Optional[Dict[str, Any]]:
    if isinstance(event, dict):
        return {
            "startSec": event.get("startSec", event.get("start_time", event.get("start"))),
            "endSec": event.get("endSec", event.get("end_time", event.get("end"))),
            "pitch": event.get("pitch"),
            "confidence": event.get("confidence", event.get("amplitude", event.get("velocity"))),
        }

    if isinstance(event, Sequence) and not isinstance(event, (str, bytes, bytearray)) and len(event) >= 3:
        confidence = event[3] if len(event) >= 4 else None
        return {
            "startSec": event[0],
            "endSec": event[1],
            "pitch": event[2],
            "confidence": confidence,
        }

    return None


def _json_default(value: Any) -> Any:
    if np is not None:
        if isinstance(value, np.integer):
            return int(value)
        if isinstance(value, np.floating):
            return float(value)
        if isinstance(value, np.ndarray):
            return value.tolist()

    if hasattr(value, "item") and callable(value.item):
        try:
            return value.item()
        except Exception:
            pass

    if hasattr(value, "tolist") and callable(value.tolist):
        try:
            return value.tolist()
        except Exception:
            pass

    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


if __name__ == "__main__":
    raise SystemExit(main())
