import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { getWordsForDate, vocabulary } from "@/lib/vocabulary";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
});

describe("Daily vocabulary selection", () => {
  it("does not select learned words while at least two unlearned words remain", () => {
    const learnedIds = vocabulary.slice(0, 400).map((word) => word.id);
    const pair = getWordsForDate("2026-11-18", learnedIds);

    expect(pair).toHaveLength(2);
    expect(pair.every((word) => !learnedIds.includes(word.id))).toBe(true);
  });

  it("returns the pair from the full library when fewer than two words remain unlearned", () => {
    const learnedIds = vocabulary.slice(0, -1).map((word) => word.id);
    const pair = getWordsForDate("2026-11-18", learnedIds);

    expect(pair.every((word) => vocabulary.some((vocabWord) => vocabWord.id === word.id))).toBe(true);
  });
});
