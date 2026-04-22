import {
  NOTIFICATION_SOUND_COOLDOWN_MS,
  NOTIFICATION_SOUND_PRESETS,
  createNotificationSoundPlayer,
  normalizeNotificationSoundVolume,
  playNotificationSound,
} from "@/lib/notifications/notification-sound";
import { describe, expect, test } from "bun:test";

function createFakeParam() {
  const calls: Array<{ method: string; value: number; time: number }> = [];

  return {
    calls,
    setValueAtTime(value: number, time: number) {
      calls.push({ method: "setValueAtTime", value, time });
    },
    linearRampToValueAtTime(value: number, time: number) {
      calls.push({ method: "linearRampToValueAtTime", value, time });
    },
    exponentialRampToValueAtTime(value: number, time: number) {
      calls.push({ method: "exponentialRampToValueAtTime", value, time });
    },
  };
}

function createFakeGainNode() {
  return {
    gain: createFakeParam(),
    connections: [] as unknown[],
    connect(destination: unknown) {
      this.connections.push(destination);
    },
  };
}

function createFakeOscillatorNode() {
  return {
    type: "sine" as const,
    frequency: createFakeParam(),
    detune: createFakeParam(),
    connections: [] as unknown[],
    startCalls: [] as Array<number | undefined>,
    stopCalls: [] as Array<number | undefined>,
    connect(destination: unknown) {
      this.connections.push(destination);
    },
    start(when?: number) {
      this.startCalls.push(when);
    },
    stop(when?: number) {
      this.stopCalls.push(when);
    },
  };
}

function createFakeAudioContext() {
  const gains: Array<ReturnType<typeof createFakeGainNode>> = [];
  const oscillators: Array<ReturnType<typeof createFakeOscillatorNode>> = [];

  return {
    gains,
    oscillators,
    context: {
      currentTime: 12,
      destination: { node: "destination" },
      createGain() {
        const gainNode = createFakeGainNode();
        gains.push(gainNode);
        return gainNode;
      },
      createOscillator() {
        const oscillator = createFakeOscillatorNode();
        oscillators.push(oscillator);
        return oscillator;
      },
    },
  };
}

describe("notification-sound", () => {
  test("exports the supported presets and player function", () => {
    expect(NOTIFICATION_SOUND_PRESETS).toEqual([
      "chime",
      "bell",
      "pulse",
      "bright",
      "harvest",
    ]);
    expect(typeof playNotificationSound).toBe("function");
  });

  test("applies the rapid-fire cooldown between plays", () => {
    const audio = createFakeAudioContext();
    let now = 1_000;
    const play = createNotificationSoundPlayer({
      getNow: () => now,
      getAudioContext: () => audio.context,
    });

    expect(play({ preset: "chime", volume: 0.5 })).toBe(true);
    const scheduledGainCount = audio.gains.length;

    expect(play({ preset: "chime", volume: 0.5 })).toBe(false);
    expect(audio.gains).toHaveLength(scheduledGainCount);

    now += NOTIFICATION_SOUND_COOLDOWN_MS;

    expect(play({ preset: "chime", volume: 0.5 })).toBe(true);
    expect(audio.gains.length).toBeGreaterThan(scheduledGainCount);
  });

  test("clamps notification sound volume into the supported 0..1 range", () => {
    expect(normalizeNotificationSoundVolume(-0.25)).toBe(0);
    expect(normalizeNotificationSoundVolume(0.4)).toBe(0.4);
    expect(normalizeNotificationSoundVolume(2)).toBe(1);
  });
});
