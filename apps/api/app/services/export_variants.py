from __future__ import annotations

from typing import Literal

from app.models.schemas import JobResult, StemAsset, TrackResult


ExportScope = Literal["combined", "piano", "drums"]


class ExportVariantError(Exception):
    pass


def build_export_result(result: JobResult, scope: ExportScope) -> JobResult:
    if scope == "combined":
        return result

    filtered_tracks = [track for track in result.tracks if track.instrument == scope and track.notes]
    if not filtered_tracks:
        raise ExportVariantError(f"Cannot export {scope} because the result does not contain any {scope} notes.")

    source_stems = {track.source_stem for track in filtered_tracks}
    filtered_stems = [stem for stem in result.stems if stem.stem_name in source_stems]

    return JobResult(
        projectName=result.project_name,
        bpm=result.bpm,
        stems=[_clone_stem(stem) for stem in filtered_stems],
        tracks=[_clone_track(track) for track in filtered_tracks],
        warnings=list(result.warnings),
    )


def build_export_suffix(scope: ExportScope) -> str:
    if scope == "combined":
        return ""
    return f"_{scope}"


def _clone_stem(stem: StemAsset) -> StemAsset:
    return stem.model_copy(deep=True)


def _clone_track(track: TrackResult) -> TrackResult:
    return TrackResult(
        instrument=track.instrument,
        sourceStem=track.source_stem,
        provider=track.provider,
        eventCount=len(track.notes),
        notes=[note.model_copy(deep=True) for note in track.notes],
    )
