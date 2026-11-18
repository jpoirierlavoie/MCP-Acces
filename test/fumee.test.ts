import { describe, expect, it } from "vitest";

describe("harnais workerd", () => {
  it("s'exécute bien dans workerd avec crypto.subtle.timingSafeEqual", () => {
    expect(typeof crypto.subtle.timingSafeEqual).toBe("function");
  });
});
