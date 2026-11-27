import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel: string) => readFileSync(at(rel), "utf8");

describe("PWA", () => {
  const manifest = JSON.parse(read("../../public/manifest.json")) as {
    name: string;
    display: string;
    start_url: string;
    scope: string;
    theme_color: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };

  it("manifest é instalável (standalone, start_url, cores, ícones)", () => {
    expect(manifest.name).toBe("ZapcomIA");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    expect(manifest.icons.some((i) => parseInt(i.sizes, 10) >= 192)).toBe(true);
    expect(manifest.icons.some((i) => parseInt(i.sizes, 10) >= 512)).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const icon of manifest.icons) {
      expect(existsSync(at(`../../public${icon.src}`)), icon.src).toBe(true);
    }
  });

  it("service worker e página offline existem", () => {
    expect(existsSync(at("../../public/sw.js"))).toBe(true);
    expect(existsSync(at("../../public/offline.html"))).toBe(true);
  });

  it("sw.js: só GET, só mesma origem, atualização só via SKIP_WAITING", () => {
    const sw = read("../../public/sw.js");
    expect(sw).toContain('req.method !== "GET"');
    expect(sw).toContain("url.origin !== self.location.origin");
    // skipWaiting() aparece uma única vez: no handler da mensagem.
    expect((sw.match(/skipWaiting\(\)/g) ?? []).length).toBe(1);
    expect(sw).toContain('data.type === "SKIP_WAITING"');
    // API/server functions nunca entram no cache.
    expect(sw).toContain('url.pathname.startsWith("/assets/")');
  });
});
