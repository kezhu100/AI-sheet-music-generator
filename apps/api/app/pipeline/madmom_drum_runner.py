from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence


def main() -> int:
    args = _parse_args()

    try:
        from madmom.features.onsets import CNNOnsetProcessor, OnsetPeakPickingProcessor
    except Exception as exc:  # pragma: no cover - exercised indirectly through subprocess failure paths
        print(f"madmom import failed: {exc}", file=sys.stderr)
        return 1

    try:
        activations = CNNOnsetProcessor()(str(args.input))
        onsets = OnsetPeakPickingProcessor(fps=100)(activations)
    except Exception as exc:  # pragma: no cover - exercised indirectly through subprocess failure paths
        print(f"madmom drum onset inference failed: {exc}", file=sys.stderr)
        return 1

    payload = {
        "onsets": _normalize_onsets(onsets),
    }
    args.output.write_text(json.dumps(payload), encoding="utf-8")
    return 0


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run madmom drum onset inference and emit normalized onsets as JSON.")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def _normalize_onsets(onsets: Iterable[Any]) -> List[Dict[str, float]]:
    normalized: List[Dict[str, float]] = []
    for onset in onsets:
        coerced = _coerce_onset(onset)
        if coerced is not None:
            normalized.append(coerced)
    return normalized


def _coerce_onset(onset: Any) -> Optional[Dict[str, float]]:
    if isinstance(onset, dict):
        onset_sec = _as_float(onset.get("onsetSec", onset.get("time", onset.get("onset"))))
        confidence = _as_float(onset.get("confidence", onset.get("strength")))
        if onset_sec is None:
            return None
        return {
            "onsetSec": onset_sec,
            "confidence": confidence if confidence is not None else 0.8,
        }

    if isinstance(onset, Sequence) and not isinstance(onset, (str, bytes, bytearray)):
        onset_sec = _as_float(onset[0]) if len(onset) >= 1 else None
        confidence = _as_float(onset[1]) if len(onset) >= 2 else None
        if onset_sec is None:
            return None
        return {
            "onsetSec": onset_sec,
            "confidence": confidence if confidence is not None else 0.8,
        }

    onset_sec = _as_float(onset)
    if onset_sec is None:
        return None
    return {
        "onsetSec": onset_sec,
        "confidence": 0.8,
    }


def _as_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


if __name__ == "__main__":
    raise SystemExit(main())
