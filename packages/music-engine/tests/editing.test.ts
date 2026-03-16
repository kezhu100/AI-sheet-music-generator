import assert from "node:assert/strict";
import type { JobResult } from "@ai-sheet-music-generator/shared-types";
import {
  addNote,
  buildDraftNoteId,
  deleteNote,
  normalizeEditedResult,
  resetDraftFromOriginal,
  resolveDrumMidiNote,
  selectNote,
  updateNotePitch,
  updateNoteTiming
} from "../src/index.js";
import { getTrackKey } from "../src/preview.js";

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
