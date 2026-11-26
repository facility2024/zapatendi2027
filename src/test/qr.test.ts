import { describe, it, expect } from "vitest";
import { keepQr } from "@/lib/qr";

describe("qr code stays visible", () => {
  const good = { ok: true, qr: "data:image/png;base64,AAA", msg: "" };
  const bad = { ok: false, qr: "", msg: "Instância não encontrada no banco" };

  it("shows the code when W-API returns one", () => {
    expect(keepQr("", good)).toBe("data:image/png;base64,AAA");
  });
  it("keeps the previous code when a refresh fails", () => {
    expect(keepQr("data:image/png;base64,AAA", bad)).toBe("data:image/png;base64,AAA");
  });
  it("keeps the previous code when the reply has no image", () => {
    expect(keepQr("data:image/png;base64,AAA", { ok: true, qr: "" })).toBe(
      "data:image/png;base64,AAA",
    );
  });
  it("stays empty until the first code arrives", () => {
    expect(keepQr("", bad)).toBe("");
    expect(keepQr("", undefined)).toBe("");
  });
});
