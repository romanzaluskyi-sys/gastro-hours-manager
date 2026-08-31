// ==========================================
// 🔴 КЛЮЧІ API 🔴
// ==========================================
export const SUPABASE_URL = "https://gdzossvaauznqsrfqovw.supabase.co";
export const SUPABASE_KEY = "sb_publishable_4SuEM6I6VujiuBtqGze1Nw_vFoeoM3S";
export const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxGwCErowHgmyBwb5VBvdzIa7QRUCCXucYclLAJVS_2tYgIz88zrxUFs62oU9AIGAV5SA/exec";

export const isConfigured =
  SUPABASE_URL.includes("supabase.co") && SUPABASE_KEY.includes("sb_");

// Podbijana przy każdej zmianie widocznej dla użytkownika — historia w
// CHANGELOG.md. Wyświetlana na ekranie logowania (LoginScreen.tsx).
export const APP_VERSION = "0.6.0";
