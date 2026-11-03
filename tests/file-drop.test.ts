import { describe, expect, test } from "bun:test";
import { acceptAttribute, dragCarriesFiles, rejectFile, type FileAcceptRule } from "../src/lib/files/file-drop";
import { CUSTOM_AUDIO_MAX_SIZE_BYTES, validateCustomAudioFile } from "../src/lib/notifications/notification-sound";

const THEME: FileAcceptRule = { extensions: [".json"], mimeTypes: ["application/json"], maxBytes: 256 * 1024 };
const file = (name: string, type: string, size: number) => ({ name, type, size });

describe("drop file validation", () => {
  test("a file is accepted by its extension or its type", () => {
    expect(rejectFile(file("brand.theme.json", "", 1_000), THEME)).toBeNull();
    expect(rejectFile(file("BRAND.THEME.JSON", "", 1_000), THEME)).toBeNull();
    expect(rejectFile(file("theme", "application/json", 1_000), THEME)).toBeNull();
  });

  test("the wrong kind is refused before its size is read", () => {
    expect(rejectFile(file("brand-logo.png", "image/png", 10), THEME)).toBe("type");
    expect(rejectFile(file("huge.png", "image/png", 10 * 1024 * 1024), THEME)).toBe("type");
  });

  test("a file over the limit is refused as too large; the limit itself is allowed", () => {
    expect(rejectFile(file("big.theme.json", "application/json", 256 * 1024 + 1), THEME)).toBe("size");
    expect(rejectFile(file("edge.theme.json", "application/json", 256 * 1024), THEME)).toBeNull();
  });

  test("the picker's accept attribute lists the same rule", () => {
    expect(acceptAttribute(THEME)).toBe(".json,application/json");
  });

  test("custom sounds keep their audio types and size limit, as reasons the settings row words", () => {
    expect(validateCustomAudioFile(file("ding.mp3", "audio/mpeg", 1_000))).toBeNull();
    expect(validateCustomAudioFile(file("ding.txt", "text/plain", 1_000))).toBe("type");
    expect(validateCustomAudioFile(file("long.wav", "audio/wav", CUSTOM_AUDIO_MAX_SIZE_BYTES + 1))).toBe("size");
  });

  test("only a drag carrying files from the system counts as a file drop", () => {
    expect(dragCarriesFiles(["Files"])).toBe(true);
    expect(dragCarriesFiles(["text/plain", "Files"])).toBe(true);
    expect(dragCarriesFiles(["text/plain"])).toBe(false);
    expect(dragCarriesFiles(["application/x-stave-task"])).toBe(false);
    expect(dragCarriesFiles(null)).toBe(false);
  });
});
