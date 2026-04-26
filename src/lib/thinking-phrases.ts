/**
 * Thinking phrases – playful "in progress" messages shown while CoT
 * streaming is active. The spiritual sibling of `completion-phrases.ts`
 * but for the *thinking* state rather than the *done* state.
 *
 * Inspired by Claude Code's SPINNER_VERBS, remixed with gaming refs,
 * movie/TV quotes, dev humour, memes, and classic/science nods — all
 * gerund-ish so they read as ongoing activity.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export const THINKING_PHRASE_ANIMATION_STYLES = [
  "soft",
  "typewriter",
  "scramble",
  "slot",
  "bounce",
] as const;

export type ThinkingPhraseAnimationStyle = (typeof THINKING_PHRASE_ANIMATION_STYLES)[number];

export const THINKING_PHRASE_ANIMATION_OPTIONS = [
  { value: "soft", label: "Soft Fade" },
  { value: "typewriter", label: "Typewriter" },
  { value: "scramble", label: "Scramble" },
  { value: "slot", label: "Slot Machine" },
  { value: "bounce", label: "Bounce" },
] as const satisfies ReadonlyArray<{
  value: ThinkingPhraseAnimationStyle;
  label: string;
}>;

export function normalizeThinkingPhraseAnimationStyle(value: unknown): ThinkingPhraseAnimationStyle {
  return THINKING_PHRASE_ANIMATION_STYLES.includes(value as ThinkingPhraseAnimationStyle)
    ? value as ThinkingPhraseAnimationStyle
    : "soft";
}

const THINKING_PHRASES = [
  // ── Gaming ────────────────────────────────────────────────────────
  "Loading Next Level",               // classic loading screen
  "Farming XP",                       // RPG grind
  "Rolling for Initiative",           // D&D
  "Respawning Brain Cells",           // FPS
  "Entering the Matrix",              // The Matrix / gaming
  "Buffering Mana",                   // MMORPG
  "Mining Diamonds",                  // Minecraft
  "Speedrunning Thoughts",            // speedrun community
  "Grinding Side Quests",             // RPG
  "Unlocking Fast Travel",            // open world games
  "Consulting the Wiki",              // gamer meta
  "Pulling Aggro",                    // MMO tank
  "Waiting for Matchmaking",          // multiplayer lobbies
  "Pressing F to Pay Respects",       // Call of Duty meme
  "Choosing My Fighter",              // fighting games
  "Placing Wards",                    // MOBA
  "Stacking Buffs",                   // RPG
  "Equipping Brain Armor",            // RPG gear
  "Opening Loot Boxes",              // controversial but iconic

  // ── Movies & TV ───────────────────────────────────────────────────
  "Assembling the Avengers",          // MCU
  "Consulting the Elders",            // fantasy trope
  "Asking the Magic 8-Ball",          // toy / meme
  "Using the Force",                  // Star Wars
  "Reversing the Polarity",           // Star Trek / Doctor Who
  "Going to Hogwarts",                // Harry Potter
  "Calculating the Odds",             // Star Wars – C-3PO
  "Searching for the Droids",         // Star Wars – Obi-Wan
  "Choosing the Red Pill",            // The Matrix
  "Consulting the Prophecy",          // every fantasy ever
  "Doing Jedi Mind Tricks",           // Star Wars
  "Entering the Upside Down",         // Stranger Things
  "Checking Marauder's Map",          // Harry Potter
  "Bending the Spoon",               // The Matrix
  "Walking into Mordor",             // LOTR

  // ── Dev Humour ────────────────────────────────────────────────────
  "Reticulating Splines",             // SimCity / classic spinner
  "Compiling Thoughts",               // programmer
  "Resolving Merge Conflicts",        // git life
  "npm install brain",                // node dev
  "Refactoring Reality",              // senior dev energy
  "Awaiting Promises",                // JS async
  "Garbage Collecting",               // runtime
  "Segfaulting Gracefully",           // C dev
  "Deploying to Production",          // YOLO
  "Reading the Docs",                 // RTFM
  "Bisecting the Bug",               // git bisect
  "Parsing the Stack Trace",          // debugging
  "Rubber Duck Debugging",            // classic technique
  "Clearing the Cache",               // universal fix
  "Spinning Up Containers",           // DevOps

  // ── Memes & Internet ─────────────────────────────────────────────
  "Touching Grass Mentally",          // internet meme
  "Sending Thoughts & Prayers",       // meme
  "Manifesting",                      // TikTok energy
  "Not a Phase, Mom",                 // emo meme
  "Summoning Brain Cells",            // relatable meme
  "Activating Big Brain",             // expanding brain meme
  "Loading Motivation.exe",           // robot meme
  "Adjusting Tin Foil Hat",           // conspiracy meme
  "Channeling Main Character Energy", // TikTok
  "Doing the Math",                   // confused lady meme
  "Overthinking It",                  // relatable
  "Vibing",                           // universal mood
  "Not Panicking",                    // Hitchhiker's Guide / meme
  "Sending Positive Vibes",           // internet culture
  "Running on Coffee",                // universal
  "Taking a Brain Selfie",            // gen z energy
  "Going Full Goblin Mode",           // word of the year 2022
  "It's Giving Genius",               // TikTok slang
  "Trust the Process",                // 76ers / meme
  "Built Different",                  // meme
  "No Thoughts, Head Full",           // inverted meme
  "Powered by Spite",                 // relatable energy

  // ── Science & Classic ─────────────────────────────────────────────
  "Splitting Atoms",                  // physics
  "Consulting the Oracle",            // ancient Greece / Matrix
  "Channeling Tesla",                 // inventor
  "Doing Rocket Science",             // literal brain surgery equiv
  "Photosynthesizing Ideas",          // biology + creativity
  "Catalyzing Reactions",             // chemistry
  "Untangling Quantum States",        // quantum computing
  "Decoding the Rosetta Stone",       // linguistics / history
  "Philosophizing",                   // Socrates energy
  "Consulting the Library of Alexandria", // ancient knowledge
  "Eureka-ing in the Bathtub",        // Archimedes

  // ── Food & Cooking ────────────────────────────────────────────────
  "Marinating Thoughts",              // cooking
  "Slow-Cooking Ideas",               // crockpot energy
  "Letting It Simmer",                // cooking / patience
  "Adding a Pinch of Genius",         // chef kiss
  "Kneading the Dough",              // bread baking
  "Fermenting Solutions",             // sourdough era

  // ── Music & Art ───────────────────────────────────────────────────
  "Dropping the Beat",                // DJ
  "Tuning the Instruments",           // orchestra
  "Freestyling",                      // rap / improv
  "Composing a Symphony",             // classical
  "Mixing the Tracks",                // producer

  // ── Misc / Absurd ─────────────────────────────────────────────────
  "Herding Cats",                     // project management
  "Staring Into the Void",            // existential
  "Asking My Other Brain",            // split personality vibes
  "Consulting the Crystal Ball",      // fortune teller
  "Flipping Through the Encyclopedia", // boomer energy
  "Rebooting the Hamster Wheel",      // internal systems
  "Juggling Neurons",                 // circus + science
  "Polishing the Monocle",            // distinguished thinking
  "Warming Up the Flux Capacitor",    // Back to the Future
  "Shaking the Magic Conch",          // SpongeBob
  "Consulting My Inner Monologue",    // introspection
  "Astral Projecting",                // spiritual / meme
  "Downloading More RAM",             // classic scam meme
] as const;

export type ThinkingPhrase = (typeof THINKING_PHRASES)[number];

/**
 * Return a random thinking phrase.
 * Stateless – each call picks independently.
 */
export function getRandomThinkingPhrase(): string {
  return THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)] ?? "Thinking";
}

/* ─── React hook – rotates the phrase on a timer while active ─────── */

const DEFAULT_INTERVAL_MS = 3_000;

/**
 * Returns a thinking phrase that automatically rotates every `intervalMs`
 * while `active` is true. When `active` turns false the last phrase is
 * frozen (no more timer ticks).
 *
 * Uses requestAnimationFrame-gated intervals so background tabs don't
 * pile up stale updates.
 */
export function useRotatingThinkingPhrase(
  active: boolean,
  intervalMs = DEFAULT_INTERVAL_MS,
): string {
  const [phrase, setPhrase] = useState(() => getRandomThinkingPhrase());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tick = useCallback(() => {
    setPhrase(getRandomThinkingPhrase());
  }, []);

  useEffect(() => {
    if (!active) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Pick a fresh phrase immediately when streaming starts
    tick();
    intervalRef.current = setInterval(tick, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [active, intervalMs, tick]);

  return phrase;
}
