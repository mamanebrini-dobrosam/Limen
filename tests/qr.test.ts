import { describe, expect, it } from "vitest";
import { cameraErrorMessage, limenQrCode } from "../src/client/lib/qr.js";

describe("QR linkovi i greške kamere", () => {
  const origin = "https://limen.example";
  const id = "AbCde-fgh_123456";
  it("prihvata samo LIMEN kod i QR putanju na istom domenu", () => {
    expect(limenQrCode(id, origin)).toBe(id);
    expect(limenQrCode(`${origin}/c/${id}`, origin)).toBe(id);
    expect(limenQrCode(`/c/${id}`, origin)).toBe(id);
    for (const value of ["", "short", "javascript:alert(1)", `https://evil.example/c/${id}`, `//evil.example/c/${id}`, `https://user:password@limen.example/c/${id}`, `${origin}/gost/${id}`, `${origin}/c/%2f${id}`]) {
      expect(limenQrCode(value, origin)).toBeNull();
    }
  });
  it("razlikuje odbijenu dozvolu, nepostojeću i zauzetu kameru", () => {
    expect(cameraErrorMessage({ name: "NotAllowedError" })).toContain("nije dozvoljen");
    expect(cameraErrorMessage({ name: "PermissionDeniedError" })).toContain("nije dozvoljen");
    expect(cameraErrorMessage({ name: "NotFoundError" })).toContain("nije pronađena");
    expect(cameraErrorMessage({ name: "NotReadableError" })).toContain("zauzeta");
    expect(cameraErrorMessage(new Error())).toContain("sliku QR");
  });
});
