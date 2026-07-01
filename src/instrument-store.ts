import type { CustomInstrument } from "./instrument-loader.js";

/**
 * Reactive store for the currently loaded instrument.
 * Populated by the instrument pipeline after fetch resolves.
 * Read by ProductInfoSystem to bind metadata into the UI panel.
 */
export const instrumentStore = {
  _instrument: null as CustomInstrument | null,
  _listeners: new Set<(inst: CustomInstrument | null) => void>(),

  get instrument(): CustomInstrument | null {
    return this._instrument;
  },

  set instrument(val: CustomInstrument | null) {
    this._instrument = val;
    for (const fn of this._listeners) fn(val);
  },

  subscribe(fn: (inst: CustomInstrument | null) => void): () => void {
    this._listeners.add(fn);
    return () => { this._listeners.delete(fn); };
  },
};
