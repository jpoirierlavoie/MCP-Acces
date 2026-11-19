import { describe, expect, it } from "vitest";

describe("harnais workerd", () => {
  it("s'exécute bien dans workerd avec crypto.subtle.timingSafeEqual", () => {
    expect(typeof crypto.subtle.timingSafeEqual).toBe("function");
  });

  it('rejette redirect: "error" et accepte redirect: "manual" dans workerd', () => {
    expect(
      () => new Request("https://api.canlii.org/v1/caseBrowse/fr/", { redirect: "error" }),
    ).toThrow(TypeError);
    expect(
      new Request("https://api.canlii.org/v1/caseBrowse/fr/", { redirect: "manual" }).redirect,
    ).toBe("manual");
  });
});
