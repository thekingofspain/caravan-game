# Reddit Rules → Atomic Rules (exact src + exact test matches)

Source: `CARAVAN_RULES_REDDIT.md`. File = exact src implementation; Test case name = exact test title; blank = no exact match. `no` = out of scope, `n/a` = notation.
Format: `| Reddit | Seq | Atomic rule | Implement | File | Test case name |`

| Reddit | Seq | Atomic rule | Implement | File | Test case name |
|---|---|---|---|---|---|
| 1.1 | R1 | two-player game | yes | src/model/engine.ts | has exactly two players |
| 1.2 | R1 | two decks in total | yes | src/model/engine.ts | deals two decks, one per player |
| 1.2 | R2 | each deck is 52 cards | yes | src/model/cards.ts | holds 52 suited cards |
| 1.2 | R3 | Jokers included (plus Jokers) | yes | src/model/cards.ts | has both Jokers |
| 1.2 | R4 | one deck allocated to each player | yes | src/model/engine.ts | deals two decks, one per player |
| 1.2 | R5 | four complete suits per deck | yes | src/model/cards.ts | has four complete suits |
| 1.2 | R6 | both Jokers present per deck | yes | src/model/cards.ts | has both Jokers |
| 1.2 | R7 | card ids namespaced per deck | yes | src/model/cards.ts | namespaces card ids by deckId |
| 1.2 | R8 | no duplicate ids within a deck | yes | src/model/cards.ts | has no duplicate card ids |
| 1.2 | R9 | each deck totals 54 cards | yes | src/model/cards.ts | has 54 cards |
| 1.21 | R1 | optionally play with one Joker each or no Jokers | no | | |
| 1.22 | R1 | custom decks hold at least 30 cards | no | | |
| 1.22 | R2 | no two of the precise card from the same playing deck | no | | |
| 1.22 | R3 | maximum deck size agreed beforehand | no | | |
| 1.22 | R4 | no more than four decks (216 cards) recommended | no | | |
| 2.1 | R1 | X marks represent card placements over three caravans per side | n/a | | |
| 2.2 | R1 | Player 1 caravan N competes directly against Player 2 caravan N | yes | src/model/scoring.ts | pairs each caravan against the same-index opponent |
| 3.1 | R1 | sell two or three caravans at a higher bid than the opposing caravan | yes | src/model/scoring.ts | wins with two higher-bid caravans |
| 3.1 | R2 | bid is the total sum of each number card plus King value | yes | src/model/rules/caravanCardRules.ts | adds number cards plus King value to the bid |
| 3.1 | R3 | one King doubles its row | yes | src/model/rules/caravanCardRules.ts | one king doubles the target |
| 3.1 | R4 | two Kings quadruple its row | yes | src/model/rules/caravanCardRules.ts | two kings quadruple the target |
| 3.1 | R5 | engine applies King doubling on play | yes | src/model/engine.ts | King doubles the targeted row value |
| 3.1 | R6 | engine applies double-King on play | yes | src/model/engine.ts | doubles twice for a double King on play |
| 3.1 | R7 | mixed multi-row caravan totals | yes | src/model/rules/caravanCardRules.ts | sums base values |
| 3.2 | R1 | caravan is sold when bid is 21–26 | yes | src/model/rules/caravanCardRules.ts | sells at 21 and 26 |
| 3.2 | R2 | any bid higher or lower than 21–26 is not sold | yes | src/model/rules/caravanCardRules.ts | rejects bids below 21 and above 26 |
| 3.2 | R3 | exactly 21 sells | yes | src/model/rules/caravanCardRules.ts | sells at 21 and 26 |
| 3.2 | R4 | exactly 26 sells | yes | src/model/rules/caravanCardRules.ts | sells at 21 and 26 |
| 3.3 | R1 | you may add onto an already sold caravan to increase its bid | yes | src/model/engine.ts | adds onto a sold caravan and updates the bid |
| 4.1 | R1 | each player draws eight cards from their shuffled deck to start | yes | src/model/engine.ts | deals 8-card opening hands |
| 4.2 | R1 | opening round plays number cards (2–10) or aces only | yes | src/model/engine.ts | plays only value cards while caravans are empty |
| 4.2 | R2 | opening round is three alternating turns per player, one card to start each caravan | | | completes the opening in three turns with one card per caravan |
| 4.2 | R3 | opening offers no discards | yes | src/model/engine.ts | disallows discard while a caravan is empty |
| 4.2 | R4 | opening discard throws | yes | src/model/engine.ts | throws when discarding while a value card could fill an empty |
| 4.2 | R5 | turn passes after each opening play | yes | src/model/engine.ts | passes the turn after a value card is played |
| 4.3 | R1 | without three number cards or aces, show hand and reshuffle for eight new cards | yes | src/model/engine.ts | mulligans opening hands below three value cards |
| 4.3 | R2 | discarding is not allowed during the opening round | yes | src/model/engine.ts | forbids discarding during the opening round |
| 4.4 | R1 | no re-draw during the opening round | yes | src/model/engine.ts | does not redraw during the opening round |
| 4.4 | R2 | after the opening round both players continue with five cards | | | continues with five cards after the opening round |
| 4.4 | R3 | opening round ends once each player has placed three cards, one per caravan | | | completes the opening in three turns with one card per caravan |
| 5.1 | R1 | after opening, play any card on alternating turns | yes | src/model/engine.ts | alternates turns after each move |
| 5.1 | R2 | turn option: play a card from hand, then draw a new card | yes | src/model/engine.ts | refills the hand after a value play |
| 5.1 | R3 | turn option: discard a card from hand, then draw a new card | yes | src/model/engine.ts | refills the hand after a discard |
| 5.1 | R4 | turn option: disband one caravan track, removing all its cards to the discard pile | no — no discard pile | | disbanded cards vanish with the caravan (no discard pile) |
| 5.2 | R1 | number cards rank A=1, 2–10 at face value | yes | src/model/types.ts | ranks number cards A=1, 2-10 at face value |
| 5.21 | R1 | number card must follow the suit or numerical sequence of the last card played | yes | src/model/rules/caravanCardRules.ts | follows the suit or sequence of the last card |
| 5.21 | R2 | with one card in the caravan, the next number card sets direction and suit | yes | src/model/engine.ts | sets direction and suit on the second card |
| 5.22 | R1 | numerical sequences need not be directly connected (e.g. 3→7, 7→3) | yes | src/model/rules/caravanCardRules.ts | allows gaps in numerical sequence |
| 5.22 | R2 | descending example: after 7→3 only a deuce or ace can follow as a number card | yes | src/model/rules/caravanCardRules.ts | accepts only deuce or ace below a descending 3 |
| 5.22 | R3 | skips allowed (3→7) | yes | src/model/rules/caravanCardRules.ts | ascending direction requires increasing value |
| 5.23 | R1 | suit-matching card contrary to the sequence establishes a new numerical sequence | yes | src/model/engine.ts | establishes a new sequence and suit on a suit-break |
| 5.23 | R2 | suit-break flips desc→asc | yes | src/model/engine.ts | flips desc to asc on a suit-break |
| 5.23 | R3 | suit-break updates caravan suit | yes | src/model/engine.ts | establishes a new sequence and suit on a suit-break |
| 5.24 | R1 | never play a number card on the same number card (e.g. 10 on 10) | yes | src/model/rules/caravanCardRules.ts | never plays a number card on the same number card |
| 5.24 | R2 | equal rank throws in engine | yes | src/model/engine.ts | throws on equal rank in the engine |
| 5.25 | R1 | number cards can only be played within your own caravans | yes | src/model/engine.ts | plays value cards only in your own caravans |
| 5.31 | R1 | Jacks, Queens, Kings, Jokers have special effects and attach overlapping the side of the played-on card | yes | src/model/types.ts | attaches a face onto the row |
| 5.31 | R2 | number cards are played overlapping each other downwards (vs face/Joker side-attach) | yes | src/model/engine.ts | opens a new row per value card |
| 5.32 | R1 | face cards and Jokers can be played on both your and your opponent's caravans | yes | src/model/engine.ts | plays faces on both your and opponent caravans |
| 5.32 | R2 | Queen targets the opponent | yes | src/model/engine.ts | Queen reverses the direction |
| 5.32 | R3 | King targets the opponent | yes | src/model/engine.ts | King doubles the targeted row value |
| 5.32 | R4 | Joker targets the opponent | yes | src/model/engine.ts | Joker on Ace removes all cards of that suit |
| 5.33 | R1 | face cards and Jokers ignore suit and sequence and can target any number card position | yes | src/model/engine.ts | ignores suit and sequence for faces |
| 5.33 | R2 | Queen excluded: placed only at the bottom of a caravan like an extending number card | yes | src/model/engine.ts | Queen must target the last row |
| 5.34 | R1 | Jack removes the targeted number card plus attached faces/Jokers to the discard pile | yes | src/model/engine.ts | removes the jacked row and its attached faces |
| 5.34 | R2 | Jack clears attached faces too | yes | src/model/engine.ts | removes the jacked row and its attached faces |
| 5.34 | R3 | Jack passes the turn | yes | src/model/engine.ts | passes the turn after a Jack |
| 5.35 | R1 | Queen reverses the caravan's numerical direction | yes | src/model/engine.ts | reverses the caravan's numerical direction |
| 5.35 | R2 | Queen changes the caravan suit to the Queen's suit | yes | src/model/engine.ts | changes the caravan suit to the Queen's suit |
| 5.35 | R3 | multiple Queens on the same card reverse the effects again | yes | src/model/engine.ts | reverses again on a second Queen |
| 5.35 | R4 | removal falls back to attached Queen suit | yes | src/model/engine.ts | removal falls back to the attached queen suit |
| 5.35 | R5 | removal keeps prior direction | yes | src/model/engine.ts | removal keeps the ascending direction |
| 5.36 | R1 | King doubles the value of the card it is played on | yes | src/model/rules/caravanCardRules.ts | one king doubles the target |
| 5.36 | R2 | multiple Kings stack on the same card (e.g. 5-10,K = 25; 5-10,K,K = 45) | yes | src/model/rules/caravanCardRules.ts | two kings quadruple the target |
| 5.37 | R1 | Joker on an ace removes all other same-suit number cards from both players' caravans | yes | src/model/engine.ts | removes same-suit rows on Joker-on-Ace |
| 5.37 | R2 | Queen-altered caravan suit does not save cards; printed suit counts | yes | src/model/engine.ts | removes printed-suit rows despite attached Queens |
| 5.37 | R3 | Joker on a non-ace removes all other same value/instance number cards from both players | yes | src/model/engine.ts | removes same-rank rows on Joker-on-value |
| 5.37 | R4 | Joker affects only cards played before it | yes | src/model/engine.ts | affects only cards played before the Joker |
| 5.37 | R5 | Joker's own number card is spared | yes | src/model/engine.ts | spares the Jokered card |
| 5.37 | R6 | all removed cards and attached faces go to the discard pile | no — no discard pile | | Joker-removed cards vanish (no discard pile) |
| 5.38 | R1 | faces/Jokers keep full effect on cards that already carry faces/Jokers | yes | src/model/engine.ts | keeps full effect on loaded rows |
| 5.38 | R2 | at most three faces/Jokers attached to a single number card | yes | src/model/engine.ts | allows at most three faces on one number card |
| 5.38 | R3 | a maxed (three-picture) card is removable only by Joker on another card or by disbanding | yes | src/model/engine.ts | disbands a maxed row |
| 5.38 | R4 | Jack cannot remove a card already carrying three faces/Jokers | yes | src/model/engine.ts | refuses a Jack on a maxed row |
| 5.38 | R5 | Joker removes a maxed-row card | yes | src/model/engine.ts | removes a maxed-row card with a Joker elsewhere |
| 5.4 | R1 | Jack/Joker removal leaving identical adjacent numbers keeps the pre-removal sequence (e.g. 6-7,Q-6 → 6-6 stays descending) | yes | src/model/engine.ts | keeps direction on identical heads after removal |
| 5.4 | R2 | otherwise recompute the sequence after removal (e.g. 2-6hearts-4hearts minus 6 → 2-4 ascending) | yes | src/model/engine.ts | recomputes direction after removal otherwise |
| 5.5 | R1 | empty caravan tracks need not be bid on immediately | yes | src/model/engine.ts | leaves empty caravans unfilled while playing elsewhere |
| 5.5 | R2 | you can win with only two caravans | yes | src/model/scoring.ts | a player with 2+ sold caravans wins |
| 5.6 | R1 | discarded or removed cards go to separated per-player discard piles | no — no discard pile | | removed cards leave the face-up discard untouched |
| 5.6 | R2 | discard-pile cards cannot be recovered | | | keeps discard-pile cards unrecoverable |
| 6.1 | R1 | score a caravan by summing number cards plus King value to get the bid | yes | src/model/rules/caravanCardRules.ts | adds number cards plus King value to the bid |
| 6.2 | R1 | win text truncated in paste — no rule extracted | | | |
| 6.3 | R1 | running out of cards before meeting the win criteria loses the game | yes | src/model/engine.ts | declares the opponent winner when cards run out |
| D3 | R1 | tied sold track continues the game; all three sold with a 2–1 lead plus a tie does not end it | yes | src/model/scoring.ts | not all pairs resolved until every pair has winner |
| D3 | R2 | tied track can be disbanded on your turn to win; opponent may tie or sabotage first | yes | src/model/scoring.ts | wins by disbanding the tied track |
| D3 | R3 | 1–2 split awards the winner | yes | test/scoring.test.ts | opponent wins a 1-2 split |
