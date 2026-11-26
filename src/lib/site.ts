// The W-API webhook must always point at the published app, never a preview.
export const PUBLIC_APP_URL = "https://zapatendi.lovable.app";
export const webhookUrl = (secret: string) => `${PUBLIC_APP_URL}/api/public/wapi/${secret}`;
