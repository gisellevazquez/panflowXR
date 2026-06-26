import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://abhvjibuydzdgqewydgc.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiaHZqaWJ1eWR6ZGdxZXd5ZGdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MjU0MjAsImV4cCI6MjA5ODAwMTQyMH0.mjWFJ6aeWC3NIwhnzqyDDCgy3nnCRLfH9etg0iAb_mc";

export interface CustomInstrument {
  id: string;
  name: string;
  model_url: string;
  audio_urls: (string | null)[];
  zone_count: number;
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

/** Returns the most recently uploaded instrument, or null if none exists. */
export async function fetchLatestInstrument(): Promise<CustomInstrument | null> {
  try {
    const { data, error } = await sb
      .from("instruments")
      .select("id, name, model_url, audio_urls, zone_count")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data?.model_url) return null;
    return data as CustomInstrument;
  } catch {
    return null;
  }
}
