import {
  fetchLatestInstrument,
  fetchInstrumentById,
  fetchLocalInstrumentById,
  fetchLocalLatestInstrument,
  type CustomInstrument,
  type InstrumentSource,
} from "../instrument-loader.js";
import { setCustomAudioUrls } from "../handpan.js";
import { instrumentStore } from "../instrument-store.js";

/** Parse ?source= from URL; defaults to supabase when absent or unknown. */
export function parseInstrumentSource(raw: string | null): InstrumentSource {
  return raw === "local" ? "local" : "supabase";
}

async function loadInstrument(
  instrumentId: string | null,
  source: InstrumentSource,
): Promise<CustomInstrument | null> {
  if (source === "local") {
    if (instrumentId) return fetchLocalInstrumentById(instrumentId);
    return fetchLocalLatestInstrument();
  }

  if (instrumentId) return fetchInstrumentById(instrumentId);
  return fetchLatestInstrument();
}

/**
 * Per-instrument pipeline: parses ?instrument= and ?source= from URL,
 * fetches from Supabase or panflow-data, applies custom audio,
 * and populates the reactive store for product panel binding.
 *
 * Fallback: no param or fetch fail → bundled default handpan.
 *
 * Called from src/index.ts before World.create resolves.
 */
export async function setupInstrumentPipeline(): Promise<void> {
  const urlParams = new URLSearchParams(window.location.search);
  const instrumentId = urlParams.get("instrument");
  const source = parseInstrumentSource(urlParams.get("source"));

  instrumentStore.setSource(source);
  console.log(
    `[pipeline] source=${source}${instrumentId ? `, instrument=${instrumentId}` : ", latest"}`,
  );

  const instrument = await loadInstrument(instrumentId, source);

  if (instrument) {
    console.log(
      `[pipeline] instrument loaded (${source}): ${instrument.name} (${instrument.id})`,
    );

    if (instrument.audio_urls?.length) {
      setCustomAudioUrls(instrument.audio_urls);
    }

    instrumentStore.instrument = instrument;
  } else {
    instrumentStore.instrument = null;
    console.log(`[pipeline] no instrument found (${source}) — using bundled default`);
  }
}
