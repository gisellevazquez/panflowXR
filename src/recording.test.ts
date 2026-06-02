import { describe, it, expect } from "vitest";
import { HandpanRecorder } from "./recording.js";

describe("HandpanRecorder", () => {
  it("recording one note then stopping returns a take containing that one note", () => {
    const recorder = new HandpanRecorder();
    recorder.startRecording(1000);
    recorder.recordNote(3, 1000);
    const take = recorder.stopRecording();

    expect(take).toHaveLength(1);
    expect(take[0].zone).toBe(3);
    expect(take[0].time).toBe(0);
  });

  it("recording multiple notes captures each zone with its time relative to the recording start, preserving order", () => {
    const recorder = new HandpanRecorder();
    recorder.startRecording(2000);
    recorder.recordNote(0, 2000);
    recorder.recordNote(5, 2500);
    recorder.recordNote(2, 3000);
    const take = recorder.stopRecording();

    expect(take).toHaveLength(3);

    expect(take.map((note) => note.zone)).toEqual([0, 5, 2]);

    expect(take[0].time).toBe(0);
    expect(take[1].time).toBeCloseTo(0.5);
    expect(take[2].time).toBeCloseTo(1.0);
  });

  it("tracks whether a session is active, and notes touched outside an active session are ignored", () => {
    const recorder = new HandpanRecorder();
    expect(recorder.isRecording).toBe(false);

    recorder.recordNote(7, 500);
    recorder.startRecording(1000);
    expect(recorder.isRecording).toBe(true);

    recorder.recordNote(1, 1000);
    const take = recorder.stopRecording();
    expect(recorder.isRecording).toBe(false);

    expect(take).toHaveLength(1);
    expect(take[0].zone).toBe(1);
  });

  it("after a recording session, the captured take is retrievable via recording, and hasRecording reflects whether a non-empty take exists", () => {
    const recorder = new HandpanRecorder();
    expect(recorder.hasRecording).toBe(false);
    expect(recorder.recording).toHaveLength(0);

    recorder.startRecording(0);
    recorder.recordNote(4, 0);
    recorder.recordNote(6, 1000);
    recorder.stopRecording();

    expect(recorder.hasRecording).toBe(true);

    expect(recorder.recording).toHaveLength(2);
    expect(recorder.recording.map((note) => note.zone)).toEqual([4, 6]);
    expect(recorder.recording[0].time).toBeCloseTo(0);
    expect(recorder.recording[1].time).toBeCloseTo(1);
  });

  it("Playback replays the recorded notes in order, firing each note's zone once when its time is reached", () => {
    const recorder = new HandpanRecorder();
    recorder.startRecording(0);
    recorder.recordNote(0, 0);
    recorder.recordNote(5, 500);
    recorder.recordNote(2, 1000);
    recorder.stopRecording();

    recorder.startPlayback();
    expect(recorder.isPlaying).toBe(true);

    const t1 = recorder.tick(0.1); // elapsed 0.1 — t=0 note (zone 0) due
    expect(t1).toEqual([0]);

    const t2 = recorder.tick(0.1); // elapsed 0.2 — nothing new
    expect(t2).toEqual([]);

    const t3 = recorder.tick(0.4); // elapsed 0.6 — t=0.5 note (zone 5) due
    expect(t3).toEqual([5]);

    const t4 = recorder.tick(0.5); // elapsed 1.1 — t=1.0 note (zone 2) due
    expect(t4).toEqual([2]);
  });

  it("Playback ends automatically after the last note fires.", () => {
    const recorder = new HandpanRecorder();
    recorder.startRecording(0);
    recorder.recordNote(0, 0);
    recorder.recordNote(5, 500);
    recorder.recordNote(2, 1000);
    recorder.stopRecording();

    recorder.startPlayback();
    expect(recorder.isPlaying).toBe(true);

    const fired = recorder.tick(1.2); // elapsed 1.2 — all three notes fire this tick
    expect(fired).toEqual([0, 5, 2]);
    expect(recorder.isPlaying).toBe(false); // last note fired → playback complete

    const after = recorder.tick(0.5);
    expect(after).toEqual([]);
    expect(recorder.isPlaying).toBe(false);
  });
});
