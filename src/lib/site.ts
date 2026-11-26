// The W-API webhook must always point at the published app, never a preview.
// Set VITE_PUBLIC_APP_URL at build time (Docker ARG / Easypanel) to the real domain.
export const PUBLIC_APP_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.["VITE_PUBLIC_APP_URL"]) ||
  process.env?.["PUBLIC_APP_URL"] ||
  "https://zapatendi.lovable.app";
export const webhookUrl = (secret: string) => `${PUBLIC_APP_URL}/api/public/wapi/${secret}`;
