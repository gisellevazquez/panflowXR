export interface RecordedNote {
  zone: number;
  /** Seconds elapsed since recording started. */
  time: number;
}

export class HandpanRecorder {
  private recordStartMs = 0;
  private notes: RecordedNote[] = [];
  private active = false;

  private playing = false;
  private elapsed = 0;
  private nextNoteIndex = 0;

  get isRecording(): boolean {
    return this.active;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get recording(): RecordedNote[] {
    return this.notes;
  }

  get hasRecording(): boolean {
    return this.notes.length > 0;
  }

  startRecording(nowMs: number): void {
    this.recordStartMs = nowMs;
    this.notes = [];
    this.active = true;
  }

  recordNote(zone: number, nowMs: number): void {
    if (!this.active) {
      return;
    }
    this.notes.push({
      zone,
      time: (nowMs - this.recordStartMs) / 1000,
    });
  }

  stopRecording(): RecordedNote[] {
    this.active = false;
    return this.notes;
  }

  startPlayback(): void {
    this.playing = true;
    this.elapsed = 0;
    this.nextNoteIndex = 0;
  }

  stopPlayback(): void {
    this.playing = false;
  }

  tick(deltaSeconds: number): number[] {
    if (!this.playing) {
      return [];
    }
    this.elapsed += deltaSeconds;
    const fired: number[] = [];
    while (
      this.nextNoteIndex < this.notes.length &&
      this.notes[this.nextNoteIndex].time <= this.elapsed
    ) {
      fired.push(this.notes[this.nextNoteIndex].zone);
      this.nextNoteIndex++;
    }
    if (this.nextNoteIndex >= this.notes.length) {
      this.playing = false;
    }
    return fired;
  }
}
