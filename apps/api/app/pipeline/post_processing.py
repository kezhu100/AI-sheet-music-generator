from __future__ import annotations

from dataclasses import dataclass

from app.models.schemas import TrackResult
from app.pipeline.post_processing_helpers import (
    choose_quantization_plan,
    clean_track_notes,
    combine_cleanup_stats,
    estimate_tempo,
    merge_tracks,
    quantize_track_notes,
    sort_tracks,
    summarize_cleanup_warnings,
)


@dataclass(frozen=True)
class PostProcessingResult:
    bpm: int
    tracks: list[TrackResult]
    warnings: list[str]


class LightweightPostProcessor:
    def process(self, tracks: list[TrackResult], warnings: list[str]) -> PostProcessingResult:
        merged_tracks = merge_tracks(tracks)
        cleaned_tracks: list[TrackResult] = []
        cleanup_stats = []

        for track in merged_tracks:
            cleaned_notes, track_stats = clean_track_notes(track)
            cleanup_stats.append(track_stats)
            cleaned_tracks.append(
                TrackResult(
                    instrument=track.instrument,
                    sourceStem=track.source_stem,
                    provider=track.provider,
                    eventCount=len(cleaned_notes),
                    notes=cleaned_notes,
                )
            )

        tempo_estimate = estimate_tempo(cleaned_tracks)
        quantization_plan = choose_quantization_plan(cleaned_tracks, tempo_estimate.bpm)
        processed_tracks: list[TrackResult] = []

        for track in cleaned_tracks:
            quantized_notes, track_stats = quantize_track_notes(track, quantization_plan)
            cleanup_stats.append(track_stats)
            processed_tracks.append(
                TrackResult(
                    instrument=track.instrument,
                    sourceStem=track.source_stem,
                    provider=track.provider,
                    eventCount=len(quantized_notes),
                    notes=quantized_notes,
                )
            )

        output_warnings = list(warnings)
        if tempo_estimate.warning is not None and tempo_estimate.warning not in output_warnings:
            output_warnings.append(tempo_estimate.warning)

        combined_cleanup = combine_cleanup_stats(*cleanup_stats)
        for warning in summarize_cleanup_warnings(combined_cleanup):
            if warning not in output_warnings:
                output_warnings.append(warning)

        return PostProcessingResult(
            bpm=tempo_estimate.bpm,
            tracks=sort_tracks(processed_tracks),
            warnings=output_warnings,
        )
