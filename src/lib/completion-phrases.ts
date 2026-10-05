import { i18n } from "@/i18n/runtime";

/** Localized status phrases; selection is stable across language changes. */

const COMPLETION_PHRASES = [
  "app:completionPhrases.jobSDone",
  "app:completionPhrases.gg",
  "app:completionPhrases.ggWP",
  "app:completionPhrases.victoryRoyale",
  "app:completionPhrases.flawlessVictory",
  "app:completionPhrases.kO",
  "app:completionPhrases.questComplete",
  "app:completionPhrases.achievementUnlocked",
  "app:completionPhrases.levelUp",
  "app:completionPhrases.allYourBaseAreBelongToUs",
  "app:completionPhrases.itSSuperEffective",
  "app:completionPhrases.praiseTheSun",
  "app:completionPhrases.nowYouReThinkingWithPortals",
  "app:completionPhrases.stillAlive",
  "app:completionPhrases.ezClap",
  "app:completionPhrases.ggNoRe",
  "app:completionPhrases.anotherHappyLanding",
  "app:completionPhrases.itIsDone",
  "app:completionPhrases.thatSAllFolks",
  "app:completionPhrases.iHaveSpoken",
  "app:completionPhrases.thisIsTheWay",
  "app:completionPhrases.hastaLaVistaBaby",
  "app:completionPhrases.itSOverItSDone",
  "app:completionPhrases.perfectlyBalanced",
  "app:completionPhrases.youReWelcome",
  "app:completionPhrases.thereAndBackAgain",
  "app:completionPhrases.cleverGirl",
  "app:completionPhrases.greatScott",
  "app:completionPhrases.soLongAndThanksForAllTheFish",
  "app:completionPhrases.donTPanic",
  "app:completionPhrases.answer42",
  "app:completionPhrases.makeItSo",
  "app:completionPhrases.engage",
  "app:completionPhrases.liveLongAndProsper",
  "app:completionPhrases.mayTheForceBeWithYou",
  "app:completionPhrases.theEagleHasLanded",
  "app:completionPhrases.toInfinityAndBeyond",
  "app:completionPhrases.excelsior",
  "app:completionPhrases.groovy",
  "app:completionPhrases.thatLlDoPig",
  "app:completionPhrases.hakunaMatata",
  "app:completionPhrases.ohYeahItSAllComingTogether",
  "app:completionPhrases.iAmSpeed",
  "app:completionPhrases.hailToTheKingBaby",
  "app:completionPhrases.houstonWeHaveNoProblem",
  "app:completionPhrases.httpOk",
  "app:completionPhrases.shippedIt",
  "app:completionPhrases.worksOnMyMachine",
  "app:completionPhrases.gitPushForce",
  "app:completionPhrases.rmRfDoubts",
  "app:completionPhrases.sudoDone",
  "app:completionPhrases.compiledOnFirstTry",
  "app:completionPhrases.noSemicolonsWereHarmed",
  "app:completionPhrases.zeroWarningsZeroRegrets",
  "app:completionPhrases.allTestsPassing",
  "app:completionPhrases.deployedAndForgotten",
  "app:completionPhrases.noBugs",
  "app:completionPhrases.taskFailedSuccessfully",
  "app:completionPhrases.todoCelebrate",
  "app:completionPhrases.nailedIt",
  "app:completionPhrases.chefSKiss",
  "app:completionPhrases.micDrop",
  "app:completionPhrases.bigBrainTime",
  "app:completionPhrases.stonks",
  "app:completionPhrases.outstandingMove",
  "app:completionPhrases.itAinTMuchButItSHonestWork",
  "app:completionPhrases.modernProblemsRequireModernSolutions",
  "app:completionPhrases.thisSparksJoy",
  "app:completionPhrases.weDidIt",
  "app:completionPhrases.easyPeasyLemonSqueezy",
  "app:completionPhrases.yeet",
  "app:completionPhrases.veniVidiVici",
  "app:completionPhrases.eureka",
  "app:completionPhrases.aleaIactaEst",
  "app:completionPhrases.qed",
  "app:completionPhrases.cogitoErgoSum",
  "app:completionPhrases.runAccomplished",
  "app:completionPhrases.theDeedIsDone",
  "app:completionPhrases.soItIsWrittenSoItIsDone",
  "app:completionPhrases.anotherOneBitesTheDust",
  "app:completionPhrases.weAreTheChampions",
  "app:completionPhrases.donTStopMeNow",
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
export function getRandomCompletionPhraseKey(): CompletionPhrase {
  return COMPLETION_PHRASES[Math.floor(Math.random() * COMPLETION_PHRASES.length)]!;
}

export function getRandomCompletionPhrase(): string {
  return i18n.t(getRandomCompletionPhraseKey());
}

/**
 * Return a deterministic completion phrase for the given seed.
 * Identical seeds always produce the same phrase, so the text stays
 * stable across Virtuoso unmount/remount cycles.
 */
export function getSeededCompletionPhraseKey(seed: string): CompletionPhrase {
  const index = hashString(seed) % COMPLETION_PHRASES.length;
  return COMPLETION_PHRASES[index]!;
}

export function getSeededCompletionPhrase(seed: string): string {
  return i18n.t(getSeededCompletionPhraseKey(seed));
}
