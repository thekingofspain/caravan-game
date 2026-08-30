import { describe, it, expect } from "vitest";
import { makeCard } from "../src/game/cards";
import { Caravan as CaravanType, SelectionState } from "../src/game/types";

function createCaravan(cards: Array<{ rank: string; suit: string }>): CaravanType {
  return {
    cards: cards.map((c) => ({
      card: makeCard(c.suit as any, c.rank as any),
      kingCount: 0,
      attachments: [],
    })),
    direction: null,
    suit: null,
  };
}

function createSelection(overrides: Partial<SelectionState> = {}): SelectionState {
  return {
    selectedHandIndex: null,
    selectedCard: null,
    legalCaravans: [],
    targetSet: new Set(),
    pendingRemovalSet: new Set(),
    greyedSet: new Set(),
    removingSet: new Set(),
    canDiscard: false,
    ...overrides,
  };
}

describe("Caravan data logic", () => {
  it("creates empty caravan", () => {
    const caravan = createCaravan([]);
    expect(caravan.cards).toHaveLength(0);
    expect(caravan.direction).toBeNull();
    expect(caravan.suit).toBeNull();
  });

  it("creates caravan with cards", () => {
    const caravan = createCaravan([{ rank: "10", suit: "spades" }]);
    expect(caravan.cards).toHaveLength(1);
    expect(caravan.cards[0].card.rank).toBe("10");
    expect(caravan.cards[0].card.suit).toBe("spades");
  });

  it("selection tracks target set", () => {
    const selection = createSelection({
      targetSet: new Set(["0-0-0"]),
    });
    expect(selection.targetSet.has("0-0-0")).toBe(true);
    expect(selection.targetSet.has("0-0-1")).toBe(false);
  });

  it("selection tracks legal caravans", () => {
    const selection = createSelection({
      legalCaravans: [0, 2],
    });
    expect(selection.legalCaravans).toContain(0);
    expect(selection.legalCaravans).toContain(2);
    expect(selection.legalCaravans).not.toContain(1);
  });
});
