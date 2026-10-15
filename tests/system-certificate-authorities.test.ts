import { describe, expect, test } from "bun:test";
import { trustSystemCertificateAuthorities } from "../electron/main/system-certificate-authorities";

function fakeTls(certs: { default: string[]; system: string[] }, options: { throwOn?: "get" | "set" } = {}) {
  const calls: string[][] = [];
  return {
    calls,
    api: {
      getCACertificates: ((type?: string) => {
        if (options.throwOn === "get") throw new Error("store unavailable");
        return type === "system" ? certs.system : certs.default;
      }) as never,
      setDefaultCACertificates: ((list: readonly string[]) => {
        if (options.throwOn === "set") throw new Error("rejected");
        calls.push([...list]);
      }) as never,
    },
  };
}

describe("trustSystemCertificateAuthorities", () => {
  test("adds the OS roots on top of the bundled defaults", () => {
    const tls = fakeTls({ default: ["mozilla-a", "mozilla-b"], system: ["mozilla-a", "corp-mitm-root"] });
    expect(trustSystemCertificateAuthorities(tls.api)).toBe(true);
    expect(tls.calls).toEqual([["mozilla-a", "mozilla-b", "corp-mitm-root"]]);
  });

  test("leaves the trust list alone when the OS adds nothing new", () => {
    const empty = fakeTls({ default: ["mozilla-a"], system: [] });
    const same = fakeTls({ default: ["mozilla-a"], system: ["mozilla-a"] });
    expect(trustSystemCertificateAuthorities(empty.api)).toBe(false);
    expect(trustSystemCertificateAuthorities(same.api)).toBe(false);
    expect(empty.calls).toEqual([]);
    expect(same.calls).toEqual([]);
  });

  test("never throws when the OS store cannot be read or applied", () => {
    expect(trustSystemCertificateAuthorities(fakeTls({ default: [], system: [] }, { throwOn: "get" }).api)).toBe(false);
    expect(trustSystemCertificateAuthorities(fakeTls({ default: ["a"], system: ["b"] }, { throwOn: "set" }).api)).toBe(false);
  });
});
