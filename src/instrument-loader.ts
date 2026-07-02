import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://abhvjibuydzdgqewydgc.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiaHZqaWJ1eWR6ZGdxZXd5ZGdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MjU0MjAsImV4cCI6MjA5ODAwMTQyMH0.mjWFJ6aeWC3NIwhnzqyDDCgy3nnCRLfH9etg0iAb_mc";

/** Where instrument manifests are served in dev/production (maps to panflow-data on disk). */
export const LOCAL_DATA_BASE = "/panflow-data";

export type InstrumentSource = "supabase" | "local";

export interface StoreCatalog {
  store_id: string;
  name?: string;
  instrument_ids: string[];
}

/** On-disk catalog at panflow-data/stores/<id>/catalog.json */
export interface LocalStoreCatalog {
  id: string;
  name?: string;
  instruments: string[];
}

export interface CustomInstrument {
  id: string;
  name: string;
  model_url: string;
  audio_urls: (string | null)[];
  zone_count: number;
  zone_notes?: (string | null)[];
  material?: string;
  scale_name?: string;
}

/** On-disk manifest at panflow-data/instruments/<id>/manifest.json */
export interface LocalInstrumentManifest {
  id: string;
  name: string;
  /** Relative to the instrument folder, or absolute URL. */
  model_url: string;
  audio_urls: (string | null)[];
  zone_count: number;
  zone_notes?: (string | null)[];
  material?: string;
  scale_name?: string;
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

/** Guaranteed columns on the instruments table today. */
const SUPABASE_BASE_SELECT =
  "id, name, model_url, audio_urls, zone_count";

/** Optional columns — used when present (material/scale may not be migrated yet). */
const SUPABASE_EXTENDED_SELECT = `${SUPABASE_BASE_SELECT}, material, scale`;

type SupabaseInstrumentRow = {
  id: string;
  name: string;
  model_url: string;
  audio_urls: (string | null)[];
  zone_count: number;
  material?: string;
  scale?: string;
};

function mapSupabaseInstrument(row: SupabaseInstrumentRow): CustomInstrument {
  return {
    id: row.id,
    name: row.name,
    model_url: row.model_url,
    audio_urls: row.audio_urls,
    zone_count: row.zone_count,
    material: row.material,
    scale_name: row.scale,
  };
}

function isMissingColumnError(message?: string): boolean {
  return !!message?.includes("does not exist");
}

async function fetchSupabaseInstrument(
  runQuery: (select: string) => PromiseLike<{
    data: SupabaseInstrumentRow | null;
    error: { message?: string } | null;
  }>,
): Promise<CustomInstrument | null> {
  const selects = [SUPABASE_EXTENDED_SELECT, SUPABASE_BASE_SELECT];

  for (let i = 0; i < selects.length; i++) {
    const { data, error } = await runQuery(selects[i]);
    if (!error && data?.model_url) {
      return mapSupabaseInstrument(data);
    }
    if (error) {
      if (isMissingColumnError(error.message) && i < selects.length - 1) {
        continue;
      }
      if (!isMissingColumnError(error.message)) {
        console.warn("[instrument-loader] supabase fetch failed:", error.message);
      }
      return null;
    }
  }

  return null;
}

function resolveLocalAssetUrl(
  instrumentId: string,
  assetPath: string,
): string {
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  const normalized = assetPath.replace(/^\.\//, "");
  return `${LOCAL_DATA_BASE}/instruments/${instrumentId}/${normalized}`;
}

function normalizeLocalManifest(
  manifest: LocalInstrumentManifest,
): CustomInstrument | null {
  if (!manifest.id || !manifest.name || !manifest.model_url) {
    console.warn("[instrument-loader] local manifest missing required fields");
    return null;
  }

  const zoneCount = manifest.zone_count ?? manifest.audio_urls?.length ?? 0;
  if (zoneCount <= 0) {
    console.warn("[instrument-loader] local manifest has invalid zone_count");
    return null;
  }

  const audioUrls = manifest.audio_urls ?? [];
  const zoneNotes = manifest.zone_notes;

  return {
    id: manifest.id,
    name: manifest.name,
    model_url: resolveLocalAssetUrl(manifest.id, manifest.model_url),
    audio_urls: audioUrls.map((url) =>
      url ? resolveLocalAssetUrl(manifest.id, url) : null,
    ),
    zone_count: zoneCount,
    zone_notes: zoneNotes?.map((note) => note ?? null),
    material: manifest.material,
    scale_name: manifest.scale_name,
  };
}

async function fetchLocalManifest(
  instrumentId: string,
): Promise<LocalInstrumentManifest | null> {
  const manifestUrl = `${LOCAL_DATA_BASE}/instruments/${instrumentId}/manifest.json`;

  try {
    const response = await fetch(manifestUrl);
    if (response.status === 404) {
      console.warn(
        `[instrument-loader] no local manifest for instrument ${instrumentId}`,
      );
      return null;
    }
    if (!response.ok) {
      console.warn(
        `[instrument-loader] local manifest fetch failed (${response.status}) for ${instrumentId}`,
      );
      return null;
    }

    const manifest = (await response.json()) as LocalInstrumentManifest;
    if (manifest.id && manifest.id !== instrumentId) {
      console.warn(
        `[instrument-loader] local manifest id mismatch: expected ${instrumentId}, got ${manifest.id}`,
      );
      return null;
    }

    return { ...manifest, id: instrumentId };
  } catch (error) {
    console.warn(
      `[instrument-loader] local manifest fetch error for ${instrumentId}:`,
      error,
    );
    return null;
  }
}

/** Returns a specific instrument from panflow-data, or null if missing/invalid. */
export async function fetchLocalInstrumentById(
  id: string,
): Promise<CustomInstrument | null> {
  const manifest = await fetchLocalManifest(id);
  if (!manifest) return null;
  return normalizeLocalManifest(manifest);
}

/** Returns the first instrument id listed in panflow-data/instruments/index.json. */
export async function fetchLocalLatestInstrument(): Promise<CustomInstrument | null> {
  const indexUrl = `${LOCAL_DATA_BASE}/instruments/index.json`;

  try {
    const response = await fetch(indexUrl);
    if (!response.ok) {
      console.warn(
        `[instrument-loader] no local instrument index (${response.status})`,
      );
      return null;
    }

    const index = (await response.json()) as { instruments?: string[] };
    const firstId = index.instruments?.[0];
    if (!firstId) {
      console.warn("[instrument-loader] local instrument index is empty");
      return null;
    }

    return fetchLocalInstrumentById(firstId);
  } catch (error) {
    console.warn("[instrument-loader] local instrument index fetch error:", error);
    return null;
  }
}

/** Returns the most recently uploaded instrument, or null if none exists. */
export async function fetchLatestInstrument(): Promise<CustomInstrument | null> {
  try {
    return await fetchSupabaseInstrument((select) =>
      sb
        .from("instruments")
        .select(select)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
  } catch (error) {
    console.warn("[instrument-loader] supabase latest fetch error:", error);
    return null;
  }
}

/** Returns a specific instrument by UUID, or null if not found. */
export async function fetchInstrumentById(id: string): Promise<CustomInstrument | null> {
  try {
    return await fetchSupabaseInstrument((select) =>
      sb.from("instruments").select(select).eq("id", id).maybeSingle(),
    );
  } catch (error) {
    console.warn(`[instrument-loader] supabase fetch error for ${id}:`, error);
    return null;
  }
}

function normalizeLocalStoreCatalog(
  storeId: string,
  catalog: LocalStoreCatalog,
): StoreCatalog | null {
  if (!catalog.id || catalog.id !== storeId) {
    console.warn(
      `[instrument-loader] local store catalog id mismatch: expected ${storeId}, got ${catalog.id ?? "(missing)"}`,
    );
    return null;
  }

  const instrumentIds = catalog.instruments ?? [];
  return {
    store_id: storeId,
    name: catalog.name,
    instrument_ids: instrumentIds,
  };
}

async function fetchLocalStoreCatalogRaw(
  storeId: string,
): Promise<LocalStoreCatalog | null> {
  const catalogUrl = `${LOCAL_DATA_BASE}/stores/${storeId}/catalog.json`;

  try {
    const response = await fetch(catalogUrl);
    if (response.status === 404) {
      console.warn(`[instrument-loader] no local store catalog for ${storeId}`);
      return null;
    }
    if (!response.ok) {
      console.warn(
        `[instrument-loader] local store catalog fetch failed (${response.status}) for ${storeId}`,
      );
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      console.warn(
        `[instrument-loader] local store catalog for ${storeId} is not JSON (${contentType})`,
      );
      return null;
    }

    return (await response.json()) as LocalStoreCatalog;
  } catch (error) {
    console.warn(
      `[instrument-loader] local store catalog fetch error for ${storeId}:`,
      error,
    );
    return null;
  }
}

/** Returns a store catalog from panflow-data, or null if missing/invalid. */
export async function fetchLocalStoreCatalog(
  storeId: string,
): Promise<StoreCatalog | null> {
  const catalog = await fetchLocalStoreCatalogRaw(storeId);
  if (!catalog) return null;
  return normalizeLocalStoreCatalog(storeId, catalog);
}

type SupabaseStoreRow = {
  id: string;
  name?: string;
  instrument_ids?: string[];
};

/** Returns a store catalog from Supabase, or null if missing/invalid. */
export async function fetchSupabaseStoreCatalog(
  storeId: string,
): Promise<StoreCatalog | null> {
  try {
    const { data, error } = await sb
      .from("stores")
      .select("id, name, instrument_ids")
      .eq("id", storeId)
      .maybeSingle();

    if (error) {
      if (isMissingColumnError(error.message) || error.message?.includes("stores")) {
        console.warn(
          `[instrument-loader] supabase stores table unavailable for ${storeId}`,
        );
        return null;
      }
      console.warn(
        `[instrument-loader] supabase store catalog fetch failed for ${storeId}:`,
        error.message,
      );
      return null;
    }

    if (!data) return null;

    const row = data as SupabaseStoreRow;
    return {
      store_id: row.id,
      name: row.name,
      instrument_ids: row.instrument_ids ?? [],
    };
  } catch (error) {
    console.warn(
      `[instrument-loader] supabase store catalog fetch error for ${storeId}:`,
      error,
    );
    return null;
  }
}

/** Returns instrument IDs for a store from the selected data source. */
export async function fetchStoreCatalog(
  storeId: string,
  source: InstrumentSource,
): Promise<StoreCatalog | null> {
  if (source === "local") return fetchLocalStoreCatalog(storeId);
  return fetchSupabaseStoreCatalog(storeId);
}
