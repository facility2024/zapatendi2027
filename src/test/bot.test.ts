import { describe, it, expect, vi, afterEach } from "vitest";
import { parseReply, licenseOk, isRefusal, aiChat, type Cfg } from "@/lib/bot.server";

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

  it("does not flag normal replies or long messages", () => {
    expect(isRefusal("Olá! O preço é R$ 50, posso enviar o link?")).toBe(false);
    expect(isRefusal("não posso ajudar " + "x".repeat(400))).toBe(false);
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
