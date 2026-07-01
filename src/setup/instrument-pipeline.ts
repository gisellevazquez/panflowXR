import { fetchLatestInstrument, fetchInstrumentById } from "../instrument-loader.js";
import { setCustomAudioUrls } from "../handpan.js";
import { instrumentStore } from "../instrument-store.js";

/**
 * Per-instrument pipeline: parses ?instrument= UUID from URL,
 * fetches the matching row from Supabase, applies custom audio,
 * and populates the reactive store for product panel binding.
 *
 * Fallback: no param or fetch fail → bundled default handpan.
 *
 * Called from src/index.ts before World.create resolves.
 */
export async function setupInstrumentPipeline(): Promise<void> {
  const urlParams = new URLSearchParams(window.location.search);
  const instrumentId = urlParams.get("instrument");

  let instrument;
  if (instrumentId) {
    console.log(`[pipeline] loading instrument by id: ${instrumentId}`);
    instrument = await fetchInstrumentById(instrumentId);
  } else {
    console.log("[pipeline] loading latest instrument");
    instrument = await fetchLatestInstrument();
  }

  if (instrument) {
    console.log(`[pipeline] instrument loaded: ${instrument.name} (${instrument.id})`);

    // Apply custom per-zone audio URLs (handpan falls back to bundled defaults per zone)
    if (instrument.audio_urls?.length) {
      setCustomAudioUrls(instrument.audio_urls);
    }

    // Populate reactive store so ProductInfoSystem can bind metadata
    instrumentStore.instrument = instrument;
  } else {
    console.log("[pipeline] no instrument found — using bundled default");
  }
}
