export const NOTIFICATION_SOUND_PRESETS = [
  "chime",
  "bell",
  "pulse",
  "bright",
  "harvest",
] as const;
export type NotificationSoundPreset =
  (typeof NOTIFICATION_SOUND_PRESETS)[number];

export const NOTIFICATION_SOUND_MODES = ["preset", "custom"] as const;
export type NotificationSoundMode = (typeof NOTIFICATION_SOUND_MODES)[number];

export const DEFAULT_NOTIFICATION_SOUND_MODE: NotificationSoundMode = "preset";
export const DEFAULT_NOTIFICATION_SOUND_PRESET: NotificationSoundPreset =
  "chime";
export const DEFAULT_NOTIFICATION_SOUND_VOLUME = 0.5;
export const NOTIFICATION_SOUND_COOLDOWN_MS = 500;

/** Maximum custom audio file size in bytes (500 KB). */
export const CUSTOM_AUDIO_MAX_SIZE_BYTES = 500 * 1024;
/** Accepted MIME types for custom audio uploads. */
export const CUSTOM_AUDIO_ACCEPTED_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
  "audio/webm",
] as const;

interface NotificationAudioParamLike {
  setValueAtTime(value: number, startTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
  exponentialRampToValueAtTime(value: number, endTime: number): unknown;
}

interface NotificationGainNodeLike {
  gain: NotificationAudioParamLike;
  connect(destination: unknown): unknown;
}

interface NotificationOscillatorNodeLike {
  type: OscillatorType;
  frequency: NotificationAudioParamLike;
  detune?: NotificationAudioParamLike;
  connect(destination: unknown): unknown;
  start(when?: number): unknown;
  stop(when?: number): unknown;
}

interface NotificationAudioContextLike {
  currentTime: number;
  state?: string;
  destination: unknown;
  createGain(): NotificationGainNodeLike;
  createOscillator(): NotificationOscillatorNodeLike;
  resume?(): PromiseLike<void> | void;
}

interface NotificationSoundNote {
  frequency: number;
  waveform: OscillatorType;
  startOffsetMs: number;
  durationMs: number;
  gain: number;
  attackMs?: number;
  detuneCents?: number;
}

const PRESET_NOTES: Record<NotificationSoundPreset, NotificationSoundNote[]> = {
  chime: [
    {
      frequency: 523.25,
      waveform: "sine",
      startOffsetMs: 0,
      durationMs: 320,
      gain: 0.28,
      attackMs: 12,
    },
    {
      frequency: 659.25,
      waveform: "sine",
      startOffsetMs: 80,
      durationMs: 260,
      gain: 0.22,
      attackMs: 10,
    },
  ],
  bell: [
    {
      frequency: 880,
      waveform: "sine",
      startOffsetMs: 0,
      durationMs: 380,
      gain: 0.28,
      attackMs: 8,
      detuneCents: 4,
    },
  ],
  pulse: [
    {
      frequency: 220,
      waveform: "triangle",
      startOffsetMs: 0,
      durationMs: 240,
      gain: 0.2,
      attackMs: 8,
    },
  ],
  bright: [
    {
      frequency: 1046.5,
      waveform: "square",
      startOffsetMs: 0,
      durationMs: 180,
      gain: 0.16,
      attackMs: 4,
    },
    {
      frequency: 1318.51,
      waveform: "square",
      startOffsetMs: 20,
      durationMs: 160,
      gain: 0.12,
      attackMs: 4,
    },
  ],
  harvest: [
    {
      frequency: 659.25,
      waveform: "sine",
      startOffsetMs: 0,
      durationMs: 130,
      gain: 0.22,
      attackMs: 6,
    },
    {
      frequency: 830.61,
      waveform: "sine",
      startOffsetMs: 90,
      durationMs: 130,
      gain: 0.22,
      attackMs: 6,
    },
    {
      frequency: 987.77,
      waveform: "sine",
      startOffsetMs: 180,
      durationMs: 130,
      gain: 0.22,
      attackMs: 6,
    },
    {
      frequency: 1318.51,
      waveform: "sine",
      startOffsetMs: 270,
      durationMs: 340,
      gain: 0.26,
      attackMs: 8,
    },
  ],
};

let sharedAudioContext: NotificationAudioContextLike | null = null;

function getAudioContextConstructor():
  | (new () => NotificationAudioContextLike)
  | null {
  const globalAudio = globalThis as typeof globalThis & {
    webkitAudioContext?: new () => NotificationAudioContextLike;
  };

  if (typeof globalAudio.AudioContext === "function") {
    return globalAudio.AudioContext as new () => NotificationAudioContextLike;
  }
  if (typeof globalAudio.webkitAudioContext === "function") {
    return globalAudio.webkitAudioContext;
  }
  return null;
}

function getSharedAudioContext() {
  if (sharedAudioContext) {
    return sharedAudioContext;
  }

  const AudioContextCtor = getAudioContextConstructor();
  if (!AudioContextCtor) {
    return null;
  }

  try {
    sharedAudioContext = new AudioContextCtor();
  } catch {
    sharedAudioContext = null;
  }

  return sharedAudioContext;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function isNotificationSoundMode(
  value: unknown
): value is NotificationSoundMode {
  return (
    typeof value === "string" &&
    NOTIFICATION_SOUND_MODES.includes(value as NotificationSoundMode)
  );
}

export function normalizeNotificationSoundMode(
  value: unknown
): NotificationSoundMode {
  return isNotificationSoundMode(value) ? value : DEFAULT_NOTIFICATION_SOUND_MODE;
}

export function isNotificationSoundPreset(
  value: unknown
): value is NotificationSoundPreset {
  return (
    typeof value === "string" &&
    NOTIFICATION_SOUND_PRESETS.includes(value as NotificationSoundPreset)
  );
}

export function normalizeNotificationSoundPreset(
  value: unknown
): NotificationSoundPreset {
  return isNotificationSoundPreset(value)
    ? value
    : DEFAULT_NOTIFICATION_SOUND_PRESET;
}

export function normalizeNotificationSoundVolume(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_NOTIFICATION_SOUND_VOLUME;
  }
  return clamp(value, 0, 1);
}

function scheduleNote(args: {
  audioContext: NotificationAudioContextLike;
  destination: NotificationGainNodeLike;
  startTime: number;
  note: NotificationSoundNote;
}) {
  const oscillator = args.audioContext.createOscillator();
  const gainNode = args.audioContext.createGain();
  const noteStartTime = args.startTime + args.note.startOffsetMs / 1000;
  const noteAttackTime = noteStartTime + (args.note.attackMs ?? 12) / 1000;
  const noteReleaseTime = noteStartTime + args.note.durationMs / 1000;

  oscillator.type = args.note.waveform;
  oscillator.frequency.setValueAtTime(args.note.frequency, noteStartTime);
  oscillator.detune?.setValueAtTime(args.note.detuneCents ?? 0, noteStartTime);

  gainNode.gain.setValueAtTime(0.0001, noteStartTime);
  gainNode.gain.linearRampToValueAtTime(args.note.gain, noteAttackTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, noteReleaseTime);

  oscillator.connect(gainNode);
  gainNode.connect(args.destination);
  oscillator.start(noteStartTime);
  oscillator.stop(noteReleaseTime + 0.05);
}

function schedulePreset(args: {
  audioContext: NotificationAudioContextLike;
  preset: NotificationSoundPreset;
  volume: number;
}) {
  const startTime = args.audioContext.currentTime + 0.01;
  const masterGain = args.audioContext.createGain();
  masterGain.gain.setValueAtTime(args.volume, startTime);
  masterGain.connect(args.audioContext.destination);

  for (const note of PRESET_NOTES[args.preset]) {
    scheduleNote({
      audioContext: args.audioContext,
      destination: masterGain,
      startTime,
      note,
    });
  }
}

export function createNotificationSoundPlayer(args?: {
  getNow?: () => number;
  getAudioContext?: () => NotificationAudioContextLike | null;
}) {
  let lastPlayedAt = -Infinity;
  const getNow = args?.getNow ?? (() => Date.now());
  const getAudioContext = args?.getAudioContext ?? getSharedAudioContext;

  return (options: { preset: NotificationSoundPreset; volume: number }) => {
    const preset = normalizeNotificationSoundPreset(options.preset);
    const volume = normalizeNotificationSoundVolume(options.volume);
    if (volume <= 0) {
      return false;
    }

    const now = getNow();
    if (now - lastPlayedAt < NOTIFICATION_SOUND_COOLDOWN_MS) {
      return false;
    }

    const audioContext = getAudioContext();
    if (!audioContext) {
      return false;
    }

    lastPlayedAt = now;

    if (audioContext.state === "suspended") {
      try {
        void audioContext.resume?.();
      } catch {
        // Ignore resume failures and still attempt to schedule the sound.
      }
    }

    schedulePreset({
      audioContext,
      preset,
      volume,
    });
    return true;
  };
}

export const playNotificationSound = createNotificationSoundPlayer();

// ---------------------------------------------------------------------------
// Custom audio file playback
// ---------------------------------------------------------------------------

/**
 * How far ahead (in seconds) to schedule the BufferSource start.
 * The gain ramps from near-zero to full volume *within* this gap so that
 * the audio buffer plays at full volume from its very first sample —
 * eliminating both click/pop artifacts and the "clipped intro" problem
 * caused by fading in during actual playback.
 */
const CUSTOM_AUDIO_SCHEDULE_AHEAD_SEC = 0.02;

let cachedCustomBuffer: { dataUrl: string; buffer: AudioBuffer } | null = null;

async function decodeCustomAudioBuffer(
  ctx: AudioContext,
  dataUrl: string,
): Promise<AudioBuffer> {
  if (cachedCustomBuffer && cachedCustomBuffer.dataUrl === dataUrl) {
    return cachedCustomBuffer.buffer;
  }
  const res = await fetch(dataUrl);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = await ctx.decodeAudioData(arrayBuffer);
  cachedCustomBuffer = { dataUrl, buffer };
  return buffer;
}

export function createCustomNotificationSoundPlayer(args?: {
  getNow?: () => number;
}) {
  let lastPlayedAt = -Infinity;
  const getNow = args?.getNow ?? (() => Date.now());

  return (options: { dataUrl: string; volume: number }) => {
    const volume = normalizeNotificationSoundVolume(options.volume);
    if (volume <= 0 || !options.dataUrl) {
      return false;
    }

    const now = getNow();
    if (now - lastPlayedAt < NOTIFICATION_SOUND_COOLDOWN_MS) {
      return false;
    }

    // The shared context is a real AudioContext under the hood; cast to access
    // decodeAudioData / createBufferSource which NotificationAudioContextLike omits.
    const audioContext = getSharedAudioContext() as unknown as AudioContext | null;
    if (!audioContext || typeof audioContext.decodeAudioData !== "function") {
      return false;
    }

    lastPlayedAt = now;

    void (async () => {
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const buffer = await decodeCustomAudioBuffer(audioContext, options.dataUrl);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;

      const gainNode = audioContext.createGain();
      // Zero the gain immediately so the default value (1.0) never leaks
      // through before the script takes effect.
      gainNode.gain.value = 0;

      const scheduleTime = audioContext.currentTime;
      const startTime = scheduleTime + CUSTOM_AUDIO_SCHEDULE_AHEAD_SEC;

      // Ramp up to full volume *before* the buffer starts playing so the
      // audio file is heard at full volume from its very first sample.
      // Previously the ramp happened after source.start(), which silenced
      // the beginning of the file.
      gainNode.gain.setValueAtTime(0.0001, scheduleTime);
      gainNode.gain.linearRampToValueAtTime(volume, startTime);

      source.connect(gainNode);
      gainNode.connect(audioContext.destination);
      source.start(startTime);
    })().catch(() => {
      // Silently ignore resume/decode/playback failures.
    });

    return true;
  };
}

export const playCustomNotificationSound = createCustomNotificationSoundPlayer();

/**
 * Validate a File for custom notification sound upload.
 * Returns an error message string if invalid, or `null` if valid.
 */
export function validateCustomAudioFile(file: File): string | null {
  if (!CUSTOM_AUDIO_ACCEPTED_TYPES.includes(file.type as (typeof CUSTOM_AUDIO_ACCEPTED_TYPES)[number])) {
    return `Unsupported file type: ${file.type || "unknown"}. Accepted: MP3, WAV, OGG, M4A, WebM.`;
  }
  if (file.size > CUSTOM_AUDIO_MAX_SIZE_BYTES) {
    const sizeKB = Math.round(file.size / 1024);
    return `File is too large (${sizeKB} KB). Maximum allowed size is ${CUSTOM_AUDIO_MAX_SIZE_BYTES / 1024} KB.`;
  }
  return null;
}

/**
 * Read a File as a data URL string (base64).
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read file as data URL."));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
