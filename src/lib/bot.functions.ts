import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { webhookUrl } from "./site";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  fishKey,
  fishBalance,
  testAiKey,
  wapiSend,
  wapiQr,
  wapiDevice,
  wapiSetWebhook,
  fishTts,
  licenseOk,
  type Cfg,
} from "./bot.server";

async function loadCfg(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("bot_configs")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error || !data) throw new Error("Configuração não encontrada");
  return data as Cfg;
}

export const getFishBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cfg = await loadCfg(context.supabase, context.userId);
    const key = fishKey(cfg);
    if (!key) return { ok: false as const, error: "Sem chave Fish Audio" };
    return fishBalance(key);
  });

export const testAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ provider: z.enum(["openai", "grok", "gemini"]) }).parse(d))
  .handler(async ({ context, data }) => {
    const cfg = await loadCfg(context.supabase, context.userId);
    const key =
      data.provider === "openai"
        ? cfg.openai_key
        : data.provider === "grok"
          ? cfg.grok_key
          : cfg.gemini_key;
    if (!key) return { ok: false, msg: "Chave vazia" };
    return testAiKey(data.provider, key);
  });

export const testWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        kind: z.enum(["status", "text", "audio", "image", "video"]),
        phone: z.string().max(20).default(""),
        value: z.string().max(2000).default(""),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const cfg = await loadCfg(context.supabase, context.userId);
    const { data: lic } = await context.supabase
      .from("licenses")
      .select("*")
      .eq("user_id", context.userId)
      .single();
    if (!licenseOk(lic)) return { ok: false, msg: "Licença inativa ou vencida" };
    if (!cfg.wapi_instance_id || !cfg.wapi_token)
      return { ok: false, msg: "Preencha ID da instância e token" };
    try {
      if (data.kind === "status") {
        const s = await wapiDevice(cfg);
        return {
          ok: s.connected,
          msg: s.connected
            ? `WhatsApp conectado${s.phone ? `: ${s.phone}` : ""}`
            : `WhatsApp não conectado${s.msg ? ` (${s.msg})` : ""}`,
        };
      }
      const phone = data.phone.replace(/\D/g, "");
      if (!phone) return { ok: false, msg: "Informe o número" };
      const payload =
        data.kind === "audio"
          ? await fishTts(cfg, data.value || "Olá, este é um teste de áudio.")
          : data.value;
      await wapiSend(cfg, data.kind, phone, payload);
      return { ok: true, msg: "Enviado!" };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : "Falha" };
    }
  });

export const getQrCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cfg = await loadCfg(context.supabase, context.userId);
    const { data: lic } = await context.supabase
      .from("licenses")
      .select("*")
      .eq("user_id", context.userId)
      .single();
    if (!licenseOk(lic)) return { ok: false, qr: "", msg: "Licença inativa ou vencida" };
    if (!cfg.wapi_instance_id || !cfg.wapi_token)
      return { ok: false, qr: "", msg: "Preencha ID da instância e token e salve" };
    try {
      return await wapiQr(cfg);
    } catch {
      return { ok: false, qr: "", msg: "Falha ao buscar QR Code" };
    }
  });

export const getConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cfg = await loadCfg(context.supabase, context.userId);
    if (!cfg.wapi_instance_id || !cfg.wapi_token)
      return { connected: false, phone: "", name: "", msg: "Sem credenciais" };
    try {
      return await wapiDevice(cfg);
    } catch {
      return { connected: false, phone: "", name: "", msg: "Falha" };
    }
  });

export const setupWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cfg = await loadCfg(context.supabase, context.userId);
    if (!cfg.wapi_instance_id || !cfg.wapi_token)
      return { ok: false, msg: "Preencha ID da instância e token" };
    if (!cfg.webhook_secret) return { ok: false, msg: "Webhook sem código" };
    try {
      return await wapiSetWebhook(cfg, webhookUrl(cfg.webhook_secret));
    } catch {
      return { ok: false, msg: "Falha ao configurar webhook" };
    }
  });
