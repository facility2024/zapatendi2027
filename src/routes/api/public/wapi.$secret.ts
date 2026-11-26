import { createFileRoute } from "@tanstack/react-router";
import {
  aiChat,
  enqueueReply,
  isRefusal,
  licenseOk,
  parseReply,
  processMessageQueue,
  shouldAllowAudio,
  transformPartsForMode,
  type Cfg,
} from "@/lib/bot.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
function extract(b: Any) {
  if (b?.fromMe || b?.data?.fromMe || b?.key?.fromMe) return null;
  const isGroup = b?.isGroup || String(b?.chat?.id ?? "").includes("@g.us");
  if (isGroup) return null;
  const text =
    b?.msgContent?.conversation ??
    b?.msgContent?.extendedTextMessage?.text ??
    b?.message?.conversation ??
    b?.message?.extendedTextMessage?.text ??
    b?.text?.message ??
    b?.body ??
    b?.data?.message?.conversation;
  const phone = String(
    b?.sender?.id ?? b?.chat?.id ?? b?.phone ?? b?.from ?? b?.data?.key?.remoteJid ?? "",
  )
    .replace(/@.*/, "")
    .replace(/\D/g, "");
  if (!text || !phone) return null;
  return { text: String(text).slice(0, 4000), phone };
}

export const Route = createFileRoute("/api/public/wapi/$secret")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const startedAt = Date.now();
        if (!/^[0-9a-f-]{36}$/i.test(params.secret))
          return new Response("not found", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: cfg } = await supabaseAdmin
          .from("bot_configs")
          .select("*")
          .eq("webhook_secret", params.secret)
          .maybeSingle();
        if (!cfg) return new Response("not found", { status: 404 });
        const body = (await request.json().catch(() => null)) as Any;
        const msg = extract(body);
        if (!msg) {
          console.log("wapi skip: not a customer text", body?.event ?? body?.type ?? "");
          return Response.json({ ok: true, skipped: true });
        }
        if (!cfg.bot_active) {
          console.log("wapi skip: bot off");
          return Response.json({ ok: true, skipped: "off" });
        }
        const { data: lic } = await supabaseAdmin
          .from("licenses")
          .select("*")
          .eq("user_id", cfg.user_id)
          .maybeSingle();
        if (!licenseOk(lic)) {
          console.log("wapi skip: license");
          return Response.json({ ok: true, skipped: "license" });
        }
        const work = (async () => {
          try {
            // "#iniciar" wipes this contact's memory so the agent starts the conversation from zero.
            if (msg.text.trim().toLowerCase() === "#iniciar") {
              const { error } = await supabaseAdmin
                .from("ai_memory")
                .delete()
                .eq("user_id", cfg.user_id)
                .eq("phone", msg.phone);
              if (error) throw error;
              await supabaseAdmin
                .from("chat_state")
                .delete()
                .eq("user_id", cfg.user_id)
                .eq("phone", msg.phone);
              msg.text = "Olá";
            }
            // Frequency counter: +1 received message; audio resets it after send.
            const { data: cs } = await supabaseAdmin
              .from("chat_state")
              .select("msg_count")
              .eq("user_id", cfg.user_id)
              .eq("phone", msg.phone)
              .maybeSingle();
            const msgCount = (cs?.msg_count ?? 0) + 1;
            await supabaseAdmin.from("chat_state").upsert(
              {
                user_id: cfg.user_id,
                phone: msg.phone,
                msg_count: msgCount,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id,phone" },
            );

            const { data: hist } = await supabaseAdmin
              .from("ai_memory")
              .select("role,content")
              .eq("user_id", cfg.user_id)
              .eq("phone", msg.phone)
              .order("created_at", { ascending: false })
              .limit(20);
            // Recusas antigas saem do contexto: uma recusa no histórico vira loop
            // (o modelo passa a imitar ela nas próximas rodadas).
            const history = (hist ?? [])
              .filter((m) => m.role !== "assistant" || !isRefusal(m.content))
              .reverse();
            const reply = await aiChat(cfg as Cfg, [
              ...history,
              { role: "user", content: msg.text },
            ]);
            await supabaseAdmin.from("ai_memory").insert([
              { user_id: cfg.user_id, phone: msg.phone, role: "user", content: msg.text },
              { user_id: cfg.user_id, phone: msg.phone, role: "assistant", content: reply },
            ]);

            const allowAudio = shouldAllowAudio(cfg as Cfg, msgCount, msg.text);
            const parts = transformPartsForMode(parseReply(reply), cfg as Cfg, allowAudio);
            await enqueueReply(supabaseAdmin, cfg.user_id, msg.phone, parts);
            await processMessageQueue(supabaseAdmin, cfg as Cfg, msg.phone);
            if (allowAudio && parts.some((p) => p.kind === "audio")) {
              await supabaseAdmin
                .from("chat_state")
                .update({ msg_count: 0, updated_at: new Date().toISOString() })
                .eq("user_id", cfg.user_id)
                .eq("phone", msg.phone);
            }
            console.log("wapi replied in ms", Date.now() - startedAt);
          } catch (e) {
            console.error("webhook error", e);
          }
        })();
        // W-API waits for our answer before sending the next webhook, so a slow reply
        // (AI + audio + delay) held back every later message. Answer now, finish in background.
        const wu = (request as unknown as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil;
        if (typeof wu === "function") {
          wu.call(request, work);
          return Response.json({ ok: true, queued: true });
        }
        await work;
        return Response.json({ ok: true });
      },
    },
  },
});
