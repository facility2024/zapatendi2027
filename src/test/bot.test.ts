import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseReply,
  licenseOk,
  isRefusal,
  aiChat,
  transformPartsForMode,
  shouldAllowAudio,
  processMessageQueue,
  enqueueReply,
  isHttpUrl,
  generateImage,
  normalizeMediaParts,
  mediaKindForUrl,
  wapiSend,
  type Cfg,
} from "@/lib/bot.server";

describe("bot rules", () => {
  it("splits media tags from text", () => {
    const p = parseReply("Oi!\n[IMAGEM: https://a.com/x.jpg]\n[VIDEO: https://a.com/v.mp4]");
    expect(p.map((x) => x.kind)).toEqual(["text", "image", "video"]);
  });
  it("license only valid when active and in date range", () => {
    const d = (n: number) => new Date(Date.now() + n * 864e5).toISOString();
    expect(licenseOk({ active: true, starts_at: d(-1), ends_at: d(1) })).toBe(true);
    expect(licenseOk({ active: false, starts_at: d(-1), ends_at: d(1) })).toBe(false);
    expect(licenseOk({ active: true, starts_at: d(-5), ends_at: d(-1) })).toBe(false);
  });
});

import { pickDelay } from "@/lib/bot.server";
describe("delay", () => {
  it("stays between min and max", () => {
    for (let i = 0; i < 50; i++) {
      const d = pickDelay(3, 8);
      expect(d).toBeGreaterThanOrEqual(3);
      expect(d).toBeLessThanOrEqual(8);
    }
    expect(pickDelay(9, 4)).toBeGreaterThanOrEqual(4);
  });
});

import { parseReply as pr2 } from "@/lib/bot.server";
import { describe as d2, it as i2, expect as e2 } from "vitest";
d2("bare audio marker", () => {
  i2("turns text before [AUDIO] into audio", () => {
    e2(pr2("Olá, tudo bem?\nQualquer coisa estamos aqui! [AUDIO]")).toEqual([
      { kind: "audio", value: "Olá, tudo bem?\nQualquer coisa estamos aqui!" },
    ]);
  });
  i2("keeps [AUDIO: x] working", () => {
    e2(pr2("oi\n[ÁUDIO: fala]")).toEqual([
      { kind: "text", value: "oi" },
      { kind: "audio", value: "fala" },
    ]);
  });
});

import { deliver, type Part } from "@/lib/bot.server";
const cfg = (over: Partial<Cfg> = {}): Cfg => ({
  user_id: "u",
  wapi_instance_id: "i",
  wapi_token: "t",
  wapi_base_url: "https://api.w-api.app/v1",
  openai_key: "",
  grok_key: "",
  gemini_key: "",
  ai_provider: "openai",
  ai_model: "m",
  prompt: "",
  fish_api_key: "fk",
  fish_voice_id: "v",
  audio_replies: false,
  bot_active: true,
  delay_min: 0,
  delay_max: 0,
  ...over,
});

describe("audio fallback", () => {
  it("sends audio when fish audio works", async () => {
    const sent: { kind: string; value: string }[] = [];
    await deliver(cfg(), "5511", [{ kind: "audio", value: "olá" }] as Part[], Date.now(), {
      tts: async () => "data:audio/mpeg;base64,AAA",
      send: async (_c, kind, _p, payload) => {
        sent.push({ kind, value: payload });
        return "";
      },
    });
    expect(sent).toEqual([{ kind: "audio", value: "data:audio/mpeg;base64,AAA" }]);
  });
  it("sends the text instead of losing the reply when fish audio fails", async () => {
    const sent: { kind: string; value: string }[] = [];
    await deliver(cfg(), "5511", [{ kind: "audio", value: "olá" }] as Part[], Date.now(), {
      tts: async () => {
        throw new Error("Fish Audio 402");
      },
      send: async (_c, kind, _p, payload) => {
        sent.push({ kind, value: payload });
        return "";
      },
    });
    expect(sent).toEqual([{ kind: "text", value: "olá" }]);
  });
  it("keeps plain text as text", async () => {
    const sent: { kind: string; value: string }[] = [];
    await deliver(cfg(), "5511", [{ kind: "text", value: "preço 50" }] as Part[], Date.now(), {
      tts: async () => "data:audio/mpeg;base64,AAA",
      send: async (_c, kind, _p, payload) => {
        sent.push({ kind, value: payload });
        return "";
      },
    });
    expect(sent).toEqual([{ kind: "text", value: "preço 50" }]);
  });
});

describe("anti-refusal filter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("detects typical provider refusals in PT and EN", () => {
    expect(isRefusal("Desculpe, mas não posso ajudar com isso.")).toBe(true);
    expect(isRefusal("Infelizmente, não posso responder isso.")).toBe(true);
    expect(isRefusal("I'm sorry, but I can't help with that.")).toBe(true);
    expect(isRefusal("Isso vai contra as minhas diretrizes.")).toBe(true);
  });

  it("detects corporate deflection (the screenshot case)", () => {
    expect(
      isRefusal(
        "Entendo que não esteja satisfeita. Estou aqui para ajudar da melhor forma possível. Se houver algo mais que eu possa fazer por você, por favor, me avise.",
      ),
    ).toBe(true);
    expect(isRefusal("Vamos manter a conversa respeitosa.")).toBe(true);
    expect(isRefusal("Esse conteúdo é inapropriado para este canal.")).toBe(true);
  });

  it("does not flag normal replies or long messages", () => {
    expect(isRefusal("Olá! O preço é R$ 50, posso enviar o link?")).toBe(false);
    expect(isRefusal("não posso ajudar " + "x".repeat(400))).toBe(false);
    expect(isRefusal("Oi! Bora trocar uma ideia sobre o que você gosta?")).toBe(false);
  });

  const okJson = (content: string) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content } }] }),
    } as Response);

  it("returns the first reply when the provider does not refuse", async () => {
    const fetchMock = vi.fn(() => okJson("Oi! Tudo bem?"));
    vi.stubGlobal("fetch", fetchMock);
    const out = await aiChat(cfg(), [{ role: "user", content: "oi" }]);
    expect(out).toBe("Oi! Tudo bem?");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once with the anti-refusal rule and returns the retry", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => okJson("Desculpe, não posso ajudar."))
      .mockImplementationOnce(() => okJson("Claro! Vou te ajudar agora."));
    vi.stubGlobal("fetch", fetchMock);
    const out = await aiChat(cfg(), [{ role: "user", content: "oi" }]);
    expect(out).toBe("Claro! Vou te ajudar agora.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string) as {
      messages: { role: string; content: string }[];
    };
    expect(secondBody.messages[0]!.content).toContain("REGRA ABSOLUTA");
  });

  it("throws when the provider refuses twice so nothing is sent or saved", async () => {
    const refusal = () => okJson("Desculpe, não posso ajudar.");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(refusal));
    await expect(aiChat(cfg(), [{ role: "user", content: "oi" }])).rejects.toThrow(
      "A IA recusou responder duas vezes",
    );
  });
});

describe("fish audio tags", () => {
  it("preserves nested emotion marks inside [AUDIO: …]", () => {
    const p = parseReply(
      "[AUDIO: [soft] Olá! Tudo bem? [pause] Eu sou a Margarida, da equipe de suporte da Coconudi.]",
    );
    expect(p).toEqual([
      {
        kind: "audio",
        value:
          "[soft] Olá! Tudo bem? [pause] Eu sou a Margarida, da equipe de suporte da Coconudi.",
      },
    ]);
  });

  it("keeps text and audio tags on the same line separated", () => {
    const p = parseReply("Veja: [AUDIO: [emphasis] olha isso] e mais texto");
    expect(p.map((x) => x.kind)).toEqual(["text", "audio", "text"]);
    expect(p[0]!.value).toBe("Veja:");
    expect(p[1]!.value).toBe("[emphasis] olha isso");
    expect(p[2]!.value).toBe("e mais texto");
  });

  it("parses [GIF: url] as image (WhatsApp screenshot case)", () => {
    const gif = "https://COCONUDIMUDIAL.b-cdn.net/TELEGRAMWEB/sex-standing-23.gif";
    expect(parseReply(`[GIF: ${gif}]`)).toEqual([{ kind: "image", value: gif }]);
  });

  it("merges tags broken across lines instead of leaking [GIF: as text", () => {
    const gif = "https://a.com/x.gif";
    expect(parseReply(`[GIF:\n${gif}\n]`)).toEqual([{ kind: "image", value: gif }]);
  });

  it("converts markdown image/link to native media (the ![GIF]( case)", () => {
    const gif = "https://COCONUDIMUDIAL.b-cdn.net/TELEGRAMWEB/sex-standing-23.gif";
    expect(parseReply(`![GIF](${gif})`)).toEqual([{ kind: "image", value: gif }]);
    expect(parseReply(`![foto](https://a.com/p.jpg)`)).toEqual([
      { kind: "image", value: "https://a.com/p.jpg" },
    ]);
    expect(parseReply(`[clique aqui](https://site.com/x)`)).toEqual([
      { kind: "link", value: "https://site.com/x" },
    ]);
    expect(parseReply(`[vídeo](https://a.com/v.mp4)`)).toEqual([
      { kind: "video", value: "https://a.com/v.mp4" },
    ]);
  });

  it("keeps markdown without url as plain text", () => {
    expect(parseReply("**negrito** normal")).toEqual([
      { kind: "text", value: "**negrito** normal" },
    ]);
  });
});

describe("audio mode", () => {
  const base = (over: Partial<Cfg> = {}): Cfg => ({ ...cfg(), ...over });

  it("text mode never emits audio", () => {
    const parts = transformPartsForMode(
      [
        { kind: "audio", value: "oi" },
        { kind: "text", value: "ok" },
      ],
      base({ audio_mode: "text", fish_api_key: "k" }),
      false,
    );
    expect(parts.every((p) => p.kind === "text")).toBe(true);
  });

  it("auto mode converts text to audio when Fish key exists", () => {
    const parts = transformPartsForMode(
      [{ kind: "text", value: "oi" }],
      base({ audio_mode: "auto", fish_api_key: "k" }),
      true,
    );
    expect(parts[0]!.kind).toBe("audio");
  });

  it("frequency-denied converts audio to text", () => {
    const parts = transformPartsForMode(
      [{ kind: "audio", value: "oi" }],
      base({ audio_mode: "frequency", fish_api_key: "k" }),
      false,
    );
    expect(parts[0]!.kind).toBe("text");
    expect(parts[0]!.value).toBe("oi");
  });

  it("frequency allows audio after N received messages", () => {
    expect(shouldAllowAudio(base({ audio_mode: "frequency", audio_frequency: 3 }), 2, "oi")).toBe(
      false,
    );
    expect(shouldAllowAudio(base({ audio_mode: "frequency", audio_frequency: 3 }), 3, "oi")).toBe(
      true,
    );
  });

  it("direct audio request bypasses the counter when enabled", () => {
    expect(
      shouldAllowAudio(
        base({ audio_mode: "frequency", audio_frequency: 5, allow_audio_request: true }),
        1,
        "pode mandar um áudio?",
      ),
    ).toBe(true);
    expect(
      shouldAllowAudio(
        base({ audio_mode: "frequency", audio_frequency: 5, allow_audio_request: false }),
        1,
        "pode mandar um áudio?",
      ),
    ).toBe(false);
  });
});

type Row = Record<string, unknown> & { id: number; status: string; seq: number };

function mockDb(rows: Row[]) {
  return {
    from: (t: string) => {
      if (t !== "message_queue") throw new Error(`unexpected table ${t}`);
      const state = { rows };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        insert: (newRows: unknown[]) => {
          for (const r of newRows as { seq: number }[]) {
            state.rows.push({
              id: state.rows.length + 1,
              status: "pending",
              attempts: 0,
              created_at: new Date().toISOString(),
              ...r,
            } as Row);
          }
          return { error: null };
        },
        update: (patch: Record<string, unknown>) => {
          chain._patch = patch;
          return chain;
        },
        eq: (col: string, val: unknown) => {
          chain._filters = [...(chain._filters ?? []), [col, val]];
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          const row = state.rows.find((r) =>
            (chain._filters ?? []).every(([c, v]: [string, unknown]) => r[c] === v),
          );
          if (!row) return { data: null };
          Object.assign(row, chain._patch);
          return { data: { ...row } };
        },
        then: (resolve: (v: { data: Row[] }) => void) => {
          let data = state.rows.filter((r) =>
            (chain._filters ?? []).every(([c, v]: [string, unknown]) => r[c] === v),
          );
          if (chain._limit !== undefined) data = data.slice(0, chain._limit);
          if (chain._patch) {
            for (const r of data) Object.assign(r, chain._patch);
            resolve({ data: data.map((r) => ({ ...r })) });
            chain._patch = undefined;
            chain._filters = [];
            return;
          }
          resolve({ data: data.map((r) => ({ ...r })) });
          chain._filters = [];
          chain._limit = undefined;
        },
      };
      const limit = (n: number) => {
        chain._limit = n;
        return chain;
      };
      chain.limit = limit;
      return chain;
    },
    _rows: rows,
  };
}

const qcfg = (over: Partial<Cfg> = {}): Cfg => ({
  ...cfg(),
  delay_enabled: true,
  delay_seconds: 0,
  ...over,
});

describe("message queue", () => {
  it("sends parts strictly in order and marks them sent", async () => {
    const rows: Row[] = [];
    const db = mockDb(rows);
    await enqueueReply(db as never, "u", "5511", [
      { kind: "audio", value: "a" },
      { kind: "text", value: "b" },
      { kind: "text", value: "c" },
    ]);
    const sent: string[] = [];
    await processMessageQueue(db as never, qcfg(), "5511", {
      tts: async (_c, t) => `audio:${t}`,
      send: async (_c, kind, _p, payload) => {
        sent.push(`${kind}:${payload}`);
        return "";
      },
      sleep: async () => {},
    });
    expect(sent).toEqual(["audio:audio:a", "text:b", "text:c"]);
    expect(rows.every((r) => r.status === "sent")).toBe(true);
  });

  it("cancels the rest of the batch when audio send fails", async () => {
    const rows: Row[] = [];
    const db = mockDb(rows);
    await enqueueReply(db as never, "u1", "5511", [
      { kind: "audio", value: "a" },
      { kind: "text", value: "b" },
      { kind: "text", value: "c" },
    ]);
    const sent: string[] = [];
    await processMessageQueue(db as never, qcfg(), "5511", {
      tts: async () => {
        throw new Error("Fish 402");
      },
      send: async (_c, kind, _p, payload) => {
        // TTS failure falls back to text for the audio item itself — force a send failure instead:
        if (payload === "a" && kind === "audio") throw new Error("W-API 500");
        sent.push(`${kind}:${payload}`);
        return "";
      },
      sleep: async () => {},
    });
    // audio item: TTS fails → fallback sends as text "a"; simulate send failure on that path:
    // here tts throws so kind becomes text and send succeeds — for cancel test we need send to fail.
    // Re-run with send failing on first item:
    const rows2: Row[] = [];
    const db2 = mockDb(rows2);
    await enqueueReply(db2 as never, "u", "5512", [
      { kind: "audio", value: "a" },
      { kind: "text", value: "b" },
    ]);
    let calls = 0;
    const sent2: string[] = [];
    await processMessageQueue(db2 as never, qcfg(), "5512", {
      tts: async (_c, t) => `audio:${t}`,
      send: async () => {
        calls++;
        if (calls === 1) throw new Error("W-API 500");
        sent2.push("should-not-happen");
        return "";
      },
      sleep: async () => {},
    });
    expect(calls).toBe(1);
    expect(sent2).toEqual([]);
    const statuses = rows2.map((r) => r.status);
    expect(statuses[0]).toBe("error");
    expect(statuses[1]).toBe("error");
    expect(String(rows2[1]!["error"])).toContain("cancelado");
  });

  it("does not process the same row twice when claimed by another worker", async () => {
    const rows: Row[] = [
      {
        id: 1,
        status: "pending",
        seq: 0,
        attempts: 0,
        batch_id: "b",
        kind: "text",
        payload: "x",
        user_id: "u1",
        phone: "5511",
        created_at: new Date().toISOString(),
      },
    ];
    const db = mockDb(rows);
    // Simulate a race: first update claim wins by flipping status before drain reads it.
    rows[0]!.status = "processing";
    const sent: string[] = [];
    await processMessageQueue(db as never, qcfg(), "5511", {
      send: async (_c, _k, _p, payload) => {
        sent.push(payload);
        return "";
      },
      sleep: async () => {},
    });
    expect(sent).toEqual([]);
  });
});

describe("image generation", () => {
  it("detects http urls vs generation prompts", () => {
    expect(isHttpUrl("https://a.com/x.jpg")).toBe(true);
    expect(isHttpUrl("http://a.com/x.png")).toBe(true);
    expect(isHttpUrl("a cute corgi wearing sunglasses")).toBe(false);
    expect(isHttpUrl("/relative/path.png")).toBe(false);
  });

  it("generateImage returns a data URI from OpenAI b64", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [{ b64_json: "QUFBQQ==" }] }),
      } as Response),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await generateImage(cfg({ openai_key: "sk-test" }), "a red balloon");
    expect(out).toBe("data:image/png;base64,QUFBQQ==");
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(call[1].body as string) as {
      prompt: string;
      response_format: string;
    };
    expect(body.prompt).toBe("a red balloon");
    expect(body.response_format).toBe("b64_json");
  });

  it("queue generates image when payload is a prompt (image_gen on)", async () => {
    const rows: Row[] = [];
    const db = mockDb(rows);
    await enqueueReply(db as never, "u", "5513", [
      { kind: "image", value: "a cute corgi wearing sunglasses" },
      { kind: "text", value: "olha só!" },
    ]);
    const sent: { kind: string; payload: string }[] = [];
    await processMessageQueue(db as never, cfg({ image_gen: true }), "5513", {
      genImage: async () => "data:image/png;base64,QUFBQQ==",
      send: async (_c, kind, _p, payload) => {
        sent.push({ kind, payload });
        return "";
      },
      sleep: async () => {},
    });
    expect(sent).toEqual([
      { kind: "image", payload: "data:image/png;base64,QUFBQQ==" },
      { kind: "text", payload: "olha só!" },
    ]);
  });

  it("queue keeps url images untouched", async () => {
    const rows: Row[] = [];
    const db = mockDb(rows);
    await enqueueReply(db as never, "u", "5514", [{ kind: "image", value: "https://a.com/x.jpg" }]);
    const sent: string[] = [];
    let genCalls = 0;
    await processMessageQueue(db as never, cfg({ image_gen: true }), "5514", {
      genImage: async () => {
        genCalls++;
        return "data:image/png;base64,XXX";
      },
      send: async (_c, _k, _p, payload) => {
        sent.push(payload);
        return "";
      },
      sleep: async () => {},
    });
    expect(genCalls).toBe(0);
    expect(sent).toEqual(["https://a.com/x.jpg"]);
  });

  it("queue does not generate when image_gen is off (sends prompt as-is for manual URL flow)", async () => {
    const rows: Row[] = [];
    const db = mockDb(rows);
    await enqueueReply(db as never, "u", "5515", [{ kind: "image", value: "https://a.com/y.jpg" }]);
    const sent: string[] = [];
    let genCalls = 0;
    await processMessageQueue(db as never, cfg({ image_gen: false }), "5515", {
      genImage: async () => {
        genCalls++;
        return "data:image/png;base64,XXX";
      },
      send: async (_c, _k, _p, payload) => {
        sent.push(payload);
        return "";
      },
      sleep: async () => {},
    });
    expect(genCalls).toBe(0);
    expect(sent).toEqual(["https://a.com/y.jpg"]);
  });
});

describe("normalizeMediaParts (media plays in WhatsApp, not as tab link)", () => {
  const gif = "https://COCONUDIMUDIAL.b-cdn.net/TELEGRAMWEB/sex-standing-23.gif";

  it("classifies urls by extension", () => {
    expect(mediaKindForUrl(gif)).toBe("image");
    expect(mediaKindForUrl("https://a.com/v.mp4")).toBe("video");
    expect(mediaKindForUrl("https://a.com/v.mp4?x=1")).toBe("video");
    expect(mediaKindForUrl("https://a.com/page.html")).toBeNull();
    expect(mediaKindForUrl("https://a.com/")).toBeNull();
  });

  it("converts [LINK: gif/mp4] to native image/video", () => {
    const out = normalizeMediaParts([
      { kind: "link", value: gif },
      { kind: "link", value: "https://a.com/v.mp4" },
      { kind: "link", value: "https://site.com/promo" },
    ]);
    expect(out).toEqual([
      { kind: "image", value: gif },
      { kind: "video", value: "https://a.com/v.mp4" },
      { kind: "link", value: "https://site.com/promo" },
    ]);
  });

  it("converts text that is only a media url", () => {
    const out = normalizeMediaParts([{ kind: "text", value: `olha: ${gif}` }]);
    expect(out).toEqual([
      { kind: "text", value: "olha:" },
      { kind: "image", value: gif },
    ]);
  });

  it("splits embedded media urls out of text", () => {
    const out = normalizeMediaParts([
      { kind: "text", value: `veja isso https://a.com/x.gif e depois https://a.com/y.mp4 ok` },
    ]);
    expect(out).toEqual([
      { kind: "text", value: "veja isso" },
      { kind: "image", value: "https://a.com/x.gif" },
      { kind: "text", value: "e depois" },
      { kind: "video", value: "https://a.com/y.mp4" },
      { kind: "text", value: "ok" },
    ]);
  });

  it("leaves plain text, audio and generated images untouched", () => {
    const parts = [
      { kind: "text" as const, value: "só texto normal" },
      { kind: "audio" as const, value: "data:audio/mpeg;base64,AAA" },
      { kind: "image" as const, value: "data:image/png;base64,XXX" },
      { kind: "video" as const, value: "https://a.com/already.mp4" },
    ];
    expect(normalizeMediaParts(parts)).toEqual(parts);
  });

  it("queue sends gif as native image, not as link text", async () => {
    const rows: Row[] = [];
    const db = mockDb(rows);
    await enqueueReply(db as never, "u", "5516", [{ kind: "link", value: gif }]);
    const sent: { kind: string; payload: string }[] = [];
    await processMessageQueue(db as never, qcfg(), "5516", {
      send: async (_c, kind, _p, payload) => {
        sent.push({ kind, payload });
        return "";
      },
      sleep: async () => {},
    });
    expect(sent).toEqual([{ kind: "image", payload: gif }]);
    expect(rows[0]!["kind"]).toBe("image");
  });

  it("wapiSend routes .gif images to send-gif endpoint (WhatsApp rejects gif in send-image)", async () => {
    const fetchMock = vi.fn((..._args: unknown[]) =>
      Promise.resolve({ ok: true, text: () => Promise.resolve("{}") } as Response),
    );
    vi.stubGlobal("fetch", fetchMock);
    await wapiSend(
      cfg({ wapi_instance_id: "inst1", wapi_token: "tok" }),
      "image",
      "5511999999999",
      gif,
    );
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(firstCall[0]).toContain("/message/send-gif");
    const body = JSON.parse(firstCall[1].body as string) as { gif: string; phone: string };
    expect(body.gif).toBe(gif);

    // Non-gif images still use send-image.
    fetchMock.mockClear();
    await wapiSend(
      cfg({ wapi_instance_id: "inst1", wapi_token: "tok" }),
      "image",
      "5511999999999",
      "https://a.com/photo.jpg",
    );
    const secondCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(secondCall[0]).toContain("/message/send-image");
  });
});
