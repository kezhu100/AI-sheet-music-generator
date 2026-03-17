import assert from "node:assert/strict";
import type { JobResult } from "@ai-sheet-music-generator/shared-types";
import {
  addNote,
  applyCorrectionSuggestion,
  buildDraftNoteId,
  deleteNote,
  deleteNotes,
  moveNotesByDelta,
  normalizeEditedResult,
  quantizeDraftNotes,
  replaceInstrumentRegionNotes,
  reassignDrumLane,
  resetDraftFromOriginal,
  resolveDrumMidiNote,
  selectNote,
  selectNotes,
  sanitizeDraftNoteIds,
  transposeNotes,
  updateNotePitch,
  updateNoteVelocity,
  updateNoteTiming
} from "../src/index";
import { getTrackKey } from "../src/preview";

function createOriginalResult(): JobResult {
  return {
    projectName: "demo",
    bpm: 120,
    stems: [],
    warnings: [],
    tracks: [
      {
        instrument: "piano",
        sourceStem: "piano_stem",
        provider: "heuristic",
        eventCount: 2,
        notes: [
          {
            id: "piano-a",
            instrument: "piano",
            pitch: 60,
            onsetSec: 0.5,
            offsetSec: 1.0,
            sourceStem: "piano_stem"
          },
          {
            id: "piano-b",
            instrument: "piano",
            pitch: 64,
            onsetSec: 1.5,
            offsetSec: 2.0,
            sourceStem: "piano_stem"
          }
        ]
      },
      {
        instrument: "drums",
        sourceStem: "drum_stem",
        provider: "heuristic",
        eventCount: 1,
        notes: [
          {
            id: "drum-a",
            instrument: "drums",
            drumLabel: "snare",
            midiNote: 38,
            onsetSec: 0.75,
            offsetSec: 0.9,
            sourceStem: "drum_stem"
          }
        ]
      }
    ]
  };
}

function runTest(name: string, callback: () => void): void {
  callback();
  console.log(`ok - ${name}`);
}

runTest("resetDraftFromOriginal assigns stable draft note ids", () => {
  const original = createOriginalResult();
  const draft = resetDraftFromOriginal(original);
  const pianoTrack = draft.tracks[0];
  const expectedDraftNoteId = buildDraftNoteId(getTrackKey(pianoTrack), "piano-a");

  assert.equal(pianoTrack.notes[0].draftNoteId, expectedDraftNoteId);
  assert.equal(resetDraftFromOriginal(original).tracks[0].notes[0].draftNoteId, expectedDraftNoteId);
});

runTest("resetDraftFromOriginal can namespace draft note ids for duplicated projects", () => {
  const original = createOriginalResult();
  const draft = resetDraftFromOriginal(original, { draftIdNamespace: "duplicate-project" });

  assert.equal(
    draft.tracks[0].notes[0].draftNoteId,
    buildDraftNoteId(getTrackKey(draft.tracks[0]), "piano-a", "duplicate-project")
  );
});

runTest("selectNote finds notes by draftNoteId", () => {
  const draft = resetDraftFromOriginal(createOriginalResult());
  const draftNoteId = draft.tracks[0].notes[0].draftNoteId!;
  const selected = selectNote(draft, draftNoteId);

  assert.ok(selected);
  assert.equal(selected.note.id, "piano-a");
  assert.equal(selected.selection.draftNoteId, draftNoteId);
});

runTest("addNote creates a new note with a generated draft id", () => {
  const draft = resetDraftFromOriginal(createOriginalResult());
  const pianoTrack = draft.tracks[0];
  const { draftResult, draftNoteId } = addNote(draft, {
    trackKey: getTrackKey(pianoTrack),
    instrument: "piano",
    sourceStem: pianoTrack.sourceStem,
    onsetSec: 2.0,
    durationSec: 0.5,
    pitch: 67
  });

  const selected = selectNote(draftResult, draftNoteId);
  assert.ok(selected);
  assert.match(draftNoteId, /^draft:user:/);
  assert.equal(selected.note.pitch, 67);
  assert.equal(draftResult.tracks[0].eventCount, 3);
});

runTest("deleteNote removes the targeted draft note only", () => {
  const draft = resetDraftFromOriginal(createOriginalResult());
  const draftNoteId = draft.tracks[0].notes[0].draftNoteId!;
  const nextDraft = deleteNote(draft, draftNoteId);

  assert.equal(nextDraft.tracks[0].eventCount, 1);
  assert.equal(selectNote(nextDraft, draftNoteId), null);
  assert.equal(nextDraft.tracks[0].notes[0].id, "piano-b");
});

runTest("deleteNotes removes multiple selected notes across tracks", () => {
  const draft = resetDraftFromOriginal(createOriginalResult());
  const selectedIds = [draft.tracks[0].notes[0].draftNoteId!, draft.tracks[1].notes[0].draftNoteId!];
  const nextDraft = deleteNotes(draft, selectedIds);

  assert.equal(nextDraft.tracks[0].eventCount, 1);
  assert.equal(nextDraft.tracks[1].eventCount, 0);
});

runTest("updateNoteTiming preserves duration and re-sorts by onset", () => {
  const draft = resetDraftFromOriginal(createOriginalResult());
  const draftNoteId = draft.tracks[0].notes[1].draftNoteId!;
  const moved = updateNoteTiming(draft, draftNoteId, 0.125);

  assert.equal(moved.tracks[0].notes[0].draftNoteId, draftNoteId);
  assert.equal(moved.tracks[0].notes[0].onsetSec, 0.125);
  assert.equal(moved.tracks[0].notes[0].offsetSec, 0.625);
});

runTest("updateNotePitch changes only the selected piano note", () => {
  const draft = resetDraftFromOriginal(createOriginalResult());
  const draftNoteId = draft.tracks[0].notes[0].draftNoteId!;
  const updated = updateNotePitch(draft, draftNoteId, 72);

  assert.equal(updated.tracks[0].notes[0].pitch, 72);
  assert.equal(updated.tracks[0].notes[1].pitch, 64);
});

runTest("updateNoteVelocity changes only the selected note", () => {
  const draft = resetDraftFromOriginal(createOriginalResult());
  const draftNoteId = draft.tracks[0].notes[0].draftNoteId!;
  const updated = updateNoteVelocity(draft, draftNoteId, 110);

  assert.equal(updated.tracks[0].notes[0].velocity, 110);
  assert.equal(updated.tracks[0].notes[1].velocity, undefined);
});

runTest("selectNotes returns multiple notes in stable time order", () => {
  const draft = resetDraftFromOriginal(createOriginalResult());
  const selected = selectNotes(draft, [draft.tracks[0].notes[1].draftNoteId!, draft.tracks[0].notes[0].draftNoteId!]);

  assert.equal(selected.length, 2);
  assert.equal(selected[0].note.id, "piano-a");
  assert.equal(selected[1].note.id, "piano-b");
});

runTest("sanitizeDraftNoteIds drops duplicates and unknown ids", () => {
  const draft = resetDraftFromOriginal(createOriginalResult());
  const validId = draft.tracks[0].notes[0].draftNoteId!;

  assert.deepEqual(sanitizeDraftNoteIds(draft, [validId, "missing", validId]), [validId]);
});

runTest("moveNotesByDelta preserves relative spacing for multi-note selection", () => {
  const draft = resetDraftFromOriginal(createOriginalResult());
  const moved = moveNotesByDelta(draft, [draft.tracks[0].notes[0].draftNoteId!, draft.tracks[0].notes[1].draftNoteId!], 0.5);

  assert.equal(moved.tracks[0].notes[0].onsetSec, 1);
  assert.equal(moved.tracks[0].notes[1].onsetSec, 2);
});

runTest("quantizeDraftNotes can snap selected notes to beats", () => {
  const draft = resetDraftFromOriginal(createOriginalResult());
  const edited = updateNoteTiming(draft, draft.tracks[0].notes[0].draftNoteId!, 0.38);
  const quantized = quantizeDraftNotes(edited, { draftNoteIds: [edited.tracks[0].notes[0].draftNoteId!], subdivision: 1 });

  assert.equal(quantized.tracks[0].notes[0].onsetSec, 0.5);
});

runTest("replaceInstrumentRegionNotes swaps only overlapping notes for one instrument and assigns fresh draft ids", () => {
  const draft = resetDraftFromOriginal(createOriginalResult());
  const replaced = replaceInstrumentRegionNotes(draft, {
    instrument: "piano",
    startSec: 0.4,
    endSec: 1.2,
    notes: [
      {
        id: "region-piano-a",
        instrument: "piano",
        pitch: 67,
        onsetSec: 0.5,
        offsetSec: 1.0,
        sourceStem: "piano_stem"
      }
    ]
  });

  assert.equal(replaced.draftResult.tracks[0].notes.length, 2);
  assert.equal(replaced.draftResult.tracks[0].notes[0].pitch, 67);
  assert.equal(replaced.draftResult.tracks[0].notes[1].pitch, 64);
  assert.equal(replaced.draftResult.tracks[1].notes[0].drumLabel, "snare");
  assert.equal(replaced.insertedDraftNoteIds.length, 1);
  assert.match(replaced.insertedDraftNoteIds[0], /^draft:user:/);
});

runTest("applyCorrectionSuggestion updates piano pitch and timing together", () => {
  const draft = resetDraftFromOriginal(createOriginalResult());
  const draftNoteId = draft.tracks[0].notes[0].draftNoteId!;
  const updated = applyCorrectionSuggestion(draft, {
    draftNoteId,
    suggestedChange: {
      pitch: 67,
      onsetSec: 0.75
    }
  });

  assert.equal(updated.tracks[0].notes[0].pitch, 67);
  assert.equal(updated.tracks[0].notes[0].onsetSec, 0.75);
  assert.equal(updated.tracks[0].notes[0].offsetSec, 1.25);
});

runTest("applyCorrectionSuggestion updates velocity only when requested", () => {
  const draft = resetDraftFromOriginal(createOriginalResult());
  const updated = applyCorrectionSuggestion(draft, {
    draftNoteId: draft.tracks[0].notes[0].draftNoteId!,
    suggestedChange: {
      velocity: 101
    }
  });

  assert.equal(updated.tracks[0].notes[0].velocity, 101);
  assert.equal(updated.tracks[0].notes[0].draftNoteId, draft.tracks[0].notes[0].draftNoteId);
});

runTest("replaceInstrumentRegionNotes uses strict overlap boundaries", () => {
  const draft = resetDraftFromOriginal({
    ...createOriginalResult(),
    tracks: [
      {
        ...createOriginalResult().tracks[0],
        notes: [
          {
            id: "ends-at-start",
            instrument: "piano",
            pitch: 60,
            onsetSec: 0.0,
            offsetSec: 0.5,
            sourceStem: "piano_stem"
          },
          {
            id: "starts-at-end",
            instrument: "piano",
            pitch: 64,
            onsetSec: 1.0,
            offsetSec: 1.5,
            sourceStem: "piano_stem"
          }
        ]
      },
      createOriginalResult().tracks[1]
    ]
  });

  const replaced = replaceInstrumentRegionNotes(draft, {
    instrument: "piano",
    startSec: 0.5,
    endSec: 1.0,
    notes: []
  });

  assert.equal(replaced.draftResult.tracks[0].notes.length, 2);
  assert.equal(replaced.draftResult.tracks[0].notes[0].id, "ends-at-start");
  assert.equal(replaced.draftResult.tracks[0].notes[1].id, "starts-at-end");
});

runTest("reassignDrumLane updates drum label and midi note together", () => {
  const draft = resetDraftFromOriginal(createOriginalResult());
  const reassigned = reassignDrumLane(draft, [draft.tracks[1].notes[0].draftNoteId!], "kick", 36);

  assert.equal(reassigned.tracks[1].notes[0].drumLabel, "kick");
  assert.equal(reassigned.tracks[1].notes[0].midiNote, 36);
});

runTest("transposeNotes applies pitch shifts only to selected piano notes", () => {
  const draft = resetDraftFromOriginal(createOriginalResult());
  const transposed = transposeNotes(draft, [draft.tracks[0].notes[0].draftNoteId!], 2);

  assert.equal(transposed.tracks[0].notes[0].pitch, 62);
  assert.equal(transposed.tracks[0].notes[1].pitch, 64);
});

runTest("normalizeEditedResult corrects invalid note values", () => {
  const draft = resetDraftFromOriginal(createOriginalResult());
  const normalized = normalizeEditedResult({
    ...draft,
    tracks: [
      {
        ...draft.tracks[0],
        notes: [
          {
            ...draft.tracks[0].notes[0],
            pitch: 200,
            onsetSec: -1,
            offsetSec: -0.2
          }
        ]
      },
      {
        ...draft.tracks[1],
        notes: [
          {
            ...draft.tracks[1].notes[0],
            midiNote: 10,
            onsetSec: -2,
            offsetSec: -1
          }
        ]
      }
    ]
  });

  assert.equal(normalized.tracks[0].notes[0].pitch, 127);
  assert.equal(normalized.tracks[0].notes[0].onsetSec, 0);
  assert.ok((normalized.tracks[0].notes[0].offsetSec ?? 0) > normalized.tracks[0].notes[0].onsetSec);
  assert.equal(normalized.tracks[1].notes[0].midiNote, 35);
});

runTest("resetDraftFromOriginal discards draft edits and restores original data", () => {
  const original = createOriginalResult();
  const draft = resetDraftFromOriginal(original);
  const edited = updateNotePitch(draft, draft.tracks[0].notes[0].draftNoteId!, 77);
  const reset = resetDraftFromOriginal(original);

  assert.equal(edited.tracks[0].notes[0].pitch, 77);
  assert.equal(reset.tracks[0].notes[0].pitch, 60);
  assert.equal(reset.tracks[0].notes[0].draftNoteId, draft.tracks[0].notes[0].draftNoteId);
});

runTest("resolveDrumMidiNote uses safe deterministic defaults", () => {
  assert.equal(resolveDrumMidiNote("kick"), 36);
  assert.equal(resolveDrumMidiNote("unknown-lane"), 38);
  assert.equal(resolveDrumMidiNote(undefined, 99), 81);
});
