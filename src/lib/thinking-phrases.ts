import { i18n, useTranslation } from "@/i18n";

/** Localized status phrases; selection is stable across language changes. */

import { useCallback, useEffect, useRef, useState } from "react";

const THINKING_PHRASES = [
  "app:thinkingPhrases.loadingNextLevel",
  "app:thinkingPhrases.farmingXP",
  "app:thinkingPhrases.rollingForInitiative",
  "app:thinkingPhrases.respawningBrainCells",
  "app:thinkingPhrases.enteringTheMatrix",
  "app:thinkingPhrases.bufferingMana",
  "app:thinkingPhrases.miningDiamonds",
  "app:thinkingPhrases.speedrunningThoughts",
  "app:thinkingPhrases.grindingSideQuests",
  "app:thinkingPhrases.unlockingFastTravel",
  "app:thinkingPhrases.consultingTheWiki",
  "app:thinkingPhrases.pullingAggro",
  "app:thinkingPhrases.waitingForMatchmaking",
  "app:thinkingPhrases.pressingFToPayRespects",
  "app:thinkingPhrases.choosingMyFighter",
  "app:thinkingPhrases.placingWards",
  "app:thinkingPhrases.stackingBuffs",
  "app:thinkingPhrases.equippingBrainArmor",
  "app:thinkingPhrases.openingLootBoxes",
  "app:thinkingPhrases.assemblingTheAvengers",
  "app:thinkingPhrases.consultingTheElders",
  "app:thinkingPhrases.askingTheMagic8Ball",
  "app:thinkingPhrases.usingTheForce",
  "app:thinkingPhrases.reversingThePolarity",
  "app:thinkingPhrases.goingToHogwarts",
  "app:thinkingPhrases.calculatingTheOdds",
  "app:thinkingPhrases.searchingForTheDroids",
  "app:thinkingPhrases.choosingTheRedPill",
  "app:thinkingPhrases.consultingTheProphecy",
  "app:thinkingPhrases.doingJediMindTricks",
  "app:thinkingPhrases.enteringTheUpsideDown",
  "app:thinkingPhrases.checkingMarauderSMap",
  "app:thinkingPhrases.bendingTheSpoon",
  "app:thinkingPhrases.walkingIntoMordor",
  "app:thinkingPhrases.reticulatingSplines",
  "app:thinkingPhrases.compilingThoughts",
  "app:thinkingPhrases.resolvingMergeConflicts",
  "app:thinkingPhrases.npmInstallBrain",
  "app:thinkingPhrases.refactoringReality",
  "app:thinkingPhrases.awaitingPromises",
  "app:thinkingPhrases.garbageCollecting",
  "app:thinkingPhrases.segfaultingGracefully",
  "app:thinkingPhrases.deployingToProduction",
  "app:thinkingPhrases.readingTheDocs",
  "app:thinkingPhrases.bisectingTheBug",
  "app:thinkingPhrases.parsingTheStackTrace",
  "app:thinkingPhrases.rubberDuckDebugging",
  "app:thinkingPhrases.clearingTheCache",
  "app:thinkingPhrases.spinningUpContainers",
  "app:thinkingPhrases.touchingGrassMentally",
  "app:thinkingPhrases.sendingThoughtsPrayers",
  "app:thinkingPhrases.manifesting",
  "app:thinkingPhrases.notAPhaseMom",
  "app:thinkingPhrases.summoningBrainCells",
  "app:thinkingPhrases.activatingBigBrain",
  "app:thinkingPhrases.loadingMotivationExe",
  "app:thinkingPhrases.adjustingTinFoilHat",
  "app:thinkingPhrases.channelingMainCharacterEnergy",
  "app:thinkingPhrases.doingTheMath",
  "app:thinkingPhrases.overthinkingIt",
  "app:thinkingPhrases.vibing",
  "app:thinkingPhrases.notPanicking",
  "app:thinkingPhrases.sendingPositiveVibes",
  "app:thinkingPhrases.runningOnCoffee",
  "app:thinkingPhrases.takingABrainSelfie",
  "app:thinkingPhrases.goingFullGoblinMode",
  "app:thinkingPhrases.itSGivingGenius",
  "app:thinkingPhrases.trustTheProcess",
  "app:thinkingPhrases.builtDifferent",
  "app:thinkingPhrases.noThoughtsHeadFull",
  "app:thinkingPhrases.poweredBySpite",
  "app:thinkingPhrases.splittingAtoms",
  "app:thinkingPhrases.consultingTheOracle",
  "app:thinkingPhrases.channelingTesla",
  "app:thinkingPhrases.doingRocketScience",
  "app:thinkingPhrases.photosynthesizingIdeas",
  "app:thinkingPhrases.catalyzingReactions",
  "app:thinkingPhrases.untanglingQuantumStates",
  "app:thinkingPhrases.decodingTheRosettaStone",
  "app:thinkingPhrases.philosophizing",
  "app:thinkingPhrases.consultingTheLibraryOfAlexandria",
  "app:thinkingPhrases.eurekaIngInTheBathtub",
  "app:thinkingPhrases.marinatingThoughts",
  "app:thinkingPhrases.slowCookingIdeas",
  "app:thinkingPhrases.lettingItSimmer",
  "app:thinkingPhrases.addingAPinchOfGenius",
  "app:thinkingPhrases.kneadingTheDough",
  "app:thinkingPhrases.fermentingSolutions",
  "app:thinkingPhrases.droppingTheBeat",
  "app:thinkingPhrases.tuningTheInstruments",
  "app:thinkingPhrases.freestyling",
  "app:thinkingPhrases.composingASymphony",
  "app:thinkingPhrases.mixingTheTracks",
  "app:thinkingPhrases.herdingCats",
  "app:thinkingPhrases.staringIntoTheVoid",
  "app:thinkingPhrases.askingMyOtherBrain",
  "app:thinkingPhrases.consultingTheCrystalBall",
  "app:thinkingPhrases.flippingThroughTheEncyclopedia",
  "app:thinkingPhrases.rebootingTheHamsterWheel",
  "app:thinkingPhrases.jugglingNeurons",
  "app:thinkingPhrases.polishingTheMonocle",
  "app:thinkingPhrases.warmingUpTheFluxCapacitor",
  "app:thinkingPhrases.shakingTheMagicConch",
  "app:thinkingPhrases.consultingMyInnerMonologue",
  "app:thinkingPhrases.astralProjecting",
  "app:thinkingPhrases.downloadingMoreRAM",
] as const;

export type ThinkingPhrase = (typeof THINKING_PHRASES)[number];

/**
 * Return a random thinking phrase.
 * Stateless – each call picks independently.
 */
function getRandomThinkingPhraseKey(): ThinkingPhrase {
  return THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)]!;
}

export function getRandomThinkingPhrase(): string {
  return i18n.t(getRandomThinkingPhraseKey());
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
  useTranslation("app");
  const [phrase, setPhrase] = useState(() => getRandomThinkingPhraseKey());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tick = useCallback(() => {
    setPhrase(getRandomThinkingPhraseKey());
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

  return i18n.t(phrase);
}
