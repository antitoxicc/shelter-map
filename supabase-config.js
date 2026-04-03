export const SUPABASE_URL = "https://mbpjrxlwddbkoxkyqwvl.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_YdSFHQywJQIS4YjXgVdobg_4uHxSLsY";

export function hasSupabaseConfig() {
  return !SUPABASE_URL.includes("YOUR_PROJECT_ID") && !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");
}
