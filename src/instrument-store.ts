import type { CustomInstrument, InstrumentSource } from "./instrument-loader.js";

export interface InstrumentStoreState {
  instrument: CustomInstrument | null;
  source: InstrumentSource;
}

/**
 * Reactive store for the currently loaded instrument.
 * Populated by the instrument pipeline after fetch resolves.
 * Read by ProductInfoSystem to bind metadata into the UI panel.
 */
export const instrumentStore = {
  _instrument: null as CustomInstrument | null,
  _source: "supabase" as InstrumentSource,
  _listeners: new Set<(inst: CustomInstrument | null) => void>(),

  get instrument(): CustomInstrument | null {
    return this._instrument;
  },

  get source(): InstrumentSource {
    return this._source;
  },

  get state(): InstrumentStoreState {
    return { instrument: this._instrument, source: this._source };
  },

  set instrument(val: CustomInstrument | null) {
    this._instrument = val;
    for (const fn of this._listeners) fn(val);
  },

  setSource(source: InstrumentSource): void {
    this._source = source;
  },

  subscribe(fn: (inst: CustomInstrument | null) => void): () => void {
    this._listeners.add(fn);
    return () => { this._listeners.delete(fn); };
  },
};
