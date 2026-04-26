/**
 * Completion phrases – playful "done" messages shown on the CoT trigger
 * when thinking finishes. Inspired by Claude Code's SPINNER_VERBS but
 * in reverse: these announce that the work is *complete*.
 *
 * Mix of gaming references, movie/TV quotes, dev humour, memes, and
 * classic phrases – all short enough to fit a single-line trigger.
 */

const COMPLETION_PHRASES = [
  // ── Gaming ────────────────────────────────────────────────────────
  "Job's Done",                       // Warcraft peon
  "GG",                               // universal gaming
  "GG WP",                            // good game well played
  "Victory Royale",                   // Fortnite
  "Flawless Victory",                 // Mortal Kombat
  "K.O.!",                            // Street Fighter
  "Quest Complete",                   // RPGs
  "Achievement Unlocked",             // Xbox
  "Level Up!",                        // RPGs
  "All Your Base Are Belong To Us",   // Zero Wing
  "It's Super Effective!",            // Pokémon
  "Praise The Sun!",                  // Dark Souls
  "Now You're Thinking With Portals", // Portal
  "Still Alive",                      // Portal end credits
  "EZ Clap",                          // Twitch
  "gg no re",                         // gaming
  "Another Happy Landing",            // Star Wars Battlefront / Obi-Wan

  // ── Movies & TV ───────────────────────────────────────────────────
  "It Is Done",                       // epic villain energy
  "That's All Folks!",                // Looney Tunes
  "I Have Spoken",                    // The Mandalorian
  "This Is The Way",                  // The Mandalorian
  "Hasta La Vista, Baby",             // Terminator 2
  "It's Over. It's Done.",            // LOTR – Sam
  "Perfectly Balanced",               // Thanos
  "You're Welcome",                   // Moana – Maui
  "There And Back Again",             // The Hobbit
  "Clever Girl",                      // Jurassic Park
  "Great Scott!",                     // Back to the Future
  "So Long, And Thanks For All The Fish", // Hitchhiker's Guide
  "Don't Panic",                      // Hitchhiker's Guide
  "42",                               // The Answer
  "Make It So",                       // Star Trek – Picard
  "Engage!",                          // Star Trek – Picard
  "Live Long And Prosper",            // Star Trek – Spock
  "May The Force Be With You",        // Star Wars
  "The Eagle Has Landed",             // Apollo 11
  "To Infinity And Beyond!",          // Buzz Lightyear
  "Excelsior!",                       // Stan Lee
  "Groovy",                           // Evil Dead
  "That'll Do, Pig",                  // Babe
  "Hakuna Matata",                    // The Lion King
  "Oh Yeah, It's All Coming Together", // Emperor's New Groove
  "I Am Speed",                       // Cars
  "Hail To The King, Baby",           // Evil Dead
  "Houston, We Have No Problem",      // Apollo 13 inverted

  // ── Dev humour ────────────────────────────────────────────────────
  "200 OK",                           // HTTP
  "Shipped It!",                      // deploy culture
  "Works On My Machine™",             // classic
  "git push --force",                 // YOLO
  "rm -rf doubts",                    // shell humour
  "sudo done",                        // elevated completion
  "Compiled On First Try",            // unicorn event
  "No Semicolons Were Harmed",        // JS dev
  "Zero Warnings, Zero Regrets",      // compiler nirvana
  "All Tests Passing ✓",              // CI green
  "Deployed And Forgotten™",          // fire and forget
  "No Bugs™",                         // warranty void
  "Task Failed Successfully",         // Windows meme
  "// TODO: celebrate",               // code comment

  // ── Memes & Internet ─────────────────────────────────────────────
  "Nailed It",                        // universal
  "Chef's Kiss",                      // perfection
  "Mic Drop",                         // done with flair
  "Big Brain Time",                   // meme
  "Stonks",                           // meme man
  "Outstanding Move",                 // chess meme
  "It Ain't Much, But It's Honest Work", // farmer meme
  "Modern Problems Require Modern Solutions", // meme
  "This Sparks Joy",                  // Marie Kondo
  "We Did It",                        // meme
  "Easy Peasy Lemon Squeezy",         // classic
  "Yeet!",                            // meme

  // ── Classic / Latin ───────────────────────────────────────────────
  "Veni, Vidi, Vici",                 // Caesar
  "Eureka!",                          // Archimedes
  "Alea Iacta Est",                   // Caesar – The Die Is Cast
  "QED",                              // Quod Erat Demonstrandum
  "Cogito, Ergo Sum",                 // Descartes
  "Mission Accomplished",             // classic
  "The Deed Is Done",                 // dramatic
  "So It Is Written, So It Is Done",  // The Ten Commandments

  // ── Music ─────────────────────────────────────────────────────────
  "Another One Bites The Dust",       // Queen
  "We Are The Champions",             // Queen
  "Don't Stop Me Now",                // Queen
] as const;

export type CompletionPhrase = (typeof COMPLETION_PHRASES)[number];

/**
 * Simple string → 32-bit integer hash (djb2).
 * Deterministic and fast — no crypto needed.
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + (str.charCodeAt(i) ?? 0)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Return a random completion phrase.
 * Stateless – each call picks independently.
 */
export function getRandomCompletionPhrase(): string {
  const phrase = COMPLETION_PHRASES[Math.floor(Math.random() * COMPLETION_PHRASES.length)];
  return phrase ?? "Done";
}

/**
 * Return a deterministic completion phrase for the given seed.
 * Identical seeds always produce the same phrase, so the text stays
 * stable across Virtuoso unmount/remount cycles.
 */
export function getSeededCompletionPhrase(seed: string): string {
  const index = hashString(seed) % COMPLETION_PHRASES.length;
  return COMPLETION_PHRASES[index] ?? "Done";
}
