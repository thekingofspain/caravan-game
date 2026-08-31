import { describe, it, expect } from "vitest";
import { makeCard } from "../src/model/cards";
import { Caravan as CaravanType, SelectionState } from "../src/model/types";

function createCaravan(cards: Array<{ rank: string; suit: string }>): CaravanType {
  return {
    rows: cards.map((c) => [makeCard(1, c.rank as any, c.suit as any)]),
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
    expect(caravan.rows).toHaveLength(0);
    expect(caravan.direction).toBeNull();
    expect(caravan.suit).toBeNull();
  });

  it("creates caravan with cards", () => {
    const caravan = createCaravan([{ rank: "10", suit: "spades" }]);
    expect(caravan.rows).toHaveLength(1);
    expect(caravan.rows[0][0].rank).toBe("10");
    expect(caravan.rows[0][0].suit).toBe("spades");
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
