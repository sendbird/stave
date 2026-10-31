import { describe, expect, test } from "bun:test";

import { atelierApiBaseUrl } from "../src/lib/atelier-connector/hosts";

describe("atelierApiBaseUrl", () => {
  test("sends the production UI host to its API host", () => {
    expect(atelierApiBaseUrl("https://atelier.sdix.io")).toBe(
      "https://api.atelier.sdix.io",
    );
    expect(atelierApiBaseUrl(" https://atelier.sdix.io/ ")).toBe(
      "https://api.atelier.sdix.io",
    );
  });

  test("leaves localhost, custom hosts and the API host itself unchanged", () => {
    expect(atelierApiBaseUrl("http://localhost:8181")).toBe(
      "http://localhost:8181",
    );
    expect(atelierApiBaseUrl("https://atelier.example.test/")).toBe(
      "https://atelier.example.test",
    );
    expect(atelierApiBaseUrl("https://staging.atelier.sdix.io")).toBe(
      "https://staging.atelier.sdix.io",
    );
    expect(atelierApiBaseUrl("https://api.atelier.sdix.io")).toBe(
      "https://api.atelier.sdix.io",
    );
  });
});
