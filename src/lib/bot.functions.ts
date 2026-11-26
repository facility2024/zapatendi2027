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
  gapMs,
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

export type SeqStep = {
  step: string;
  at: string;
  detail?: string;
  waitedMs?: number;
  expectedMs?: number;
  ok?: boolean;
};

// Simulates one AI reply as a queue sequence (audio → texts) with the real
// configured gap, without sending to WhatsApp. Returns a timeline the panel shows.
export const testAiSequence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; msg: string; steps: SeqStep[] }> => {
    const cfg = await loadCfg(context.supabase, context.userId);
    const { data: lic } = await context.supabase
      .from("licenses")
      .select("*")
      .eq("user_id", context.userId)
      .single();
    if (!licenseOk(lic)) return { ok: false, msg: "Licença inativa ou vencida", steps: [] };

    const gap = gapMs(cfg);
    const steps: SeqStep[] = [];
    const seq: { label: string; audio: boolean; content: string }[] = [
      { label: "Áudio de apresentação", audio: true, content: "[soft] Olá! Tudo bem?" },
      { label: "Texto 1", audio: false, content: "Que bom ter você aqui!" },
      { label: "Texto 2", audio: false, content: "Você demonstrou interesse em fazer parte." },
      { label: "Texto 3", audio: false, content: "Vou explicar como funciona." },
    ];
    const t0 = Date.now();
    for (let i = 0; i < seq.length; i++) {
      const s = seq[i]!;
      if (i > 0) {
        const waitStart = Date.now();
        if (gap > 0) await new Promise((r) => setTimeout(r, gap));
        const waited = Date.now() - waitStart;
        steps.push({
          step: `Espera antes de "${s.label}"`,
          at: new Date().toISOString(),
          waitedMs: waited,
          expectedMs: gap,
          ok: Math.abs(waited - gap) <= 500,
        });
      }
      let detail = "";
      if (s.audio) {
        if (fishKey(cfg)) {
          try {
            await fishTts(cfg, s.content);
            detail = "Fish Audio gerado (com marcações preservadas)";
          } catch (e) {
            detail = `Fish Audio falhou → texto: ${e instanceof Error ? e.message : e}`;
          }
        } else {
          detail = "Sem chave Fish — seria enviado como texto";
        }
      }
      steps.push({
        step: `Envio: ${s.label}`,
        at: new Date().toISOString(),
        detail: detail || s.content,
        ok: true,
      });
    }
    steps.push({
      step: "Sequência concluída",
      at: new Date().toISOString(),
      waitedMs: Date.now() - t0,
      expectedMs: gap * (seq.length - 1),
      ok: true,
    });
    return {
      ok: true,
      msg: `Sequência ok — intervalo ${gap / 1000}s entre ${seq.length} mensagens`,
      steps,
    };
  });
