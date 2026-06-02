import { createSystem } from "@iwsdk/core";

import { Handpan, handpanAudio } from "./handpan.js";
import { HandpanRecorder } from "./recording.js";

/**
 * Shared singleton wrapping a single HandpanRecorder instance, supplying the
 * wall-clock so the pure recorder stays free of imports. Both this manager and
 * RecordingSystem reference the SAME `recorder` instance.
 *
 * Recording and playback are mutually exclusive: starting one stops the other.
 */
export const recordingManager = {
  recorder: new HandpanRecorder(),

  get isRecording(): boolean {
    return this.recorder.isRecording;
  },

  get isPlaying(): boolean {
    return this.recorder.isPlaying;
  },

  get hasRecording(): boolean {
    return this.recorder.hasRecording;
  },

  startRecording(): void {
    // Recording and playback are mutually exclusive.
    this.recorder.stopPlayback();
    this.recorder.startRecording(Date.now());
  },

  stopRecording(): void {
    this.recorder.stopRecording();
  },

  toggleRecording(): void {
    if (this.recorder.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  },

  playRecording(): void {
    // Only replay a finished recording; never during an active recording.
    if (this.recorder.isRecording || !this.recorder.hasRecording) return;
    this.recorder.startPlayback();
  },

  stopPlayback(): void {
    this.recorder.stopPlayback();
  },
};

export class RecordingSystem extends createSystem({
  handpans: { required: [Handpan] },
}) {
  private readonly onNote = (e: Event) => {
    if (!recordingManager.isRecording) return;
    const { index } = (e as CustomEvent<{ index: number }>).detail;
    recordingManager.recorder.recordNote(index, Date.now());
  };

  private wasPlaying = false;

  init() {
    document.addEventListener("handpan-note", this.onNote);
    this.cleanupFuncs.push(() => {
      document.removeEventListener("handpan-note", this.onNote);
    });
  }

  update(delta: number, _time: number) {
    const recorder = recordingManager.recorder;
    const playing = recorder.isPlaying;

    if (!playing && this.wasPlaying) {
      window.dispatchEvent(new CustomEvent("recording-playback-ended"));
    }
    this.wasPlaying = playing;

    if (!playing) return;

    const due = recorder.tick(delta);
    for (let i = 0; i < due.length; i++) {
      handpanAudio.play(due[i], 0.8);
    }
  }
}
