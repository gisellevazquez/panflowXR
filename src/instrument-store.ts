import type {
  CustomInstrument,
  InstrumentSource,
  StoreCatalog,
} from "./instrument-loader.js";

export interface InstrumentStoreState {
  instrument: CustomInstrument | null;
  source: InstrumentSource;
  storeId: string | null;
  catalog: StoreCatalog | null;
}

/**
 * Reactive store for the currently loaded instrument.
 * Populated by the instrument pipeline after fetch resolves.
 * Read by ProductInfoSystem to bind metadata into the UI panel.
 */
export const instrumentStore = {
  _instrument: null as CustomInstrument | null,
  _source: "supabase" as InstrumentSource,
  _storeId: null as string | null,
  _catalog: null as StoreCatalog | null,
  _listeners: new Set<(inst: CustomInstrument | null) => void>(),
  _catalogListeners: new Set<(catalog: StoreCatalog | null) => void>(),

  get instrument(): CustomInstrument | null {
    return this._instrument;
  },

  get source(): InstrumentSource {
    return this._source;
  },

  get storeId(): string | null {
    return this._storeId;
  },

  get catalog(): StoreCatalog | null {
    return this._catalog;
  },

  get state(): InstrumentStoreState {
    return {
      instrument: this._instrument,
      source: this._source,
      storeId: this._storeId,
      catalog: this._catalog,
    };
  },

  set instrument(val: CustomInstrument | null) {
    this._instrument = val;
    for (const fn of this._listeners) fn(val);
  },

  setSource(source: InstrumentSource): void {
    this._source = source;
  },

  setStoreId(storeId: string | null): void {
    this._storeId = storeId;
  },

  setCatalog(catalog: StoreCatalog | null): void {
    this._catalog = catalog;
    for (const fn of this._catalogListeners) fn(catalog);
  },

  subscribe(fn: (inst: CustomInstrument | null) => void): () => void {
    this._listeners.add(fn);
    return () => { this._listeners.delete(fn); };
  },

  subscribeCatalog(fn: (catalog: StoreCatalog | null) => void): () => void {
    this._catalogListeners.add(fn);
    return () => { this._catalogListeners.delete(fn); };
  },
};
