/** Build-time settings (EXPO_PUBLIC_* are inlined by Metro). See .env.example. */
export const API_MOCK = process.env.EXPO_PUBLIC_API_MOCK === "1";
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000").replace(/\/$/, "");
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || API_URL).replace(/\/$/, "");
export const EAS_PROJECT_ID = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || null;
