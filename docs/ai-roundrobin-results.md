# AI level round robin — 30 seeds × 6 level pairs × 2 seat orders = 360 games

Seeds: `57596 1818 49536 88352 6351 51789 83216 96247 30148 46615 30616 24186 33118 63693 60307 18192 12195 51950 64140 20764 42250 57518 71889 87052 28946 71062 53294 50254 71105 45339`

## Overall head-to-head (60 games per pairing, both seat orders combined)

Wins for the row level against the column level:

|         | normal | hard | expert | master |
|---------|-------:|-----:|-------:|-------:|
| normal  |   —    | 13   |  9     | 10     |
| hard    |  47    |  —   | 20     | 14     |
| expert  |  51    | 40   |  —     | 25     |
| master  |  50    | 46   | 35     |  —     |

Win rate as bar chart (row ≥ 50% = stronger):

```
normal vs hard       21.7% ██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
normal vs expert     15.0% ███████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
normal vs master     16.7% ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
hard   vs normal     78.3% █████████████████████████████████████░░░
hard   vs expert     33.3% ████████████████░░░░░░░░░░░░░░░░░░░░░░░░
hard   vs master     23.3% ███████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
expert vs normal     85.0% █████████████████████████████████████████
expert vs hard       66.7% ████████████████████████████████░░░░░░░░
expert vs master     41.7% ████████████████████░░░░░░░░░░░░░░░░░░░░
master vs normal     83.3% █████████████████████████████████████████
master vs hard       76.7% ██████████████████████████████████████░░
master vs expert     58.3% █████████████████████████████░░░░░░░░░░░
```

## Seat-order splits (30 games each; "firsts" = row level moved first)

| Matchup                  | Row level won | Opponent won |
|--------------------------|--------------:|-------------:|
| expert firsts vs hard    | 21            | 9            |
| hard firsts vs expert    | 11            | 19           |
| expert firsts vs master  | 11            | 19           |
| master firsts vs expert  | 16            | 14           |
| hard firsts vs master    | 7             | 23           |
| master firsts vs hard    | 23            | 7            |
| expert firsts vs normal  | 27            | 3            |
| normal firsts vs expert  | 6             | 24           |
| hard firsts vs normal    | 27            | 3            |
| normal firsts vs hard    | 10            | 20           |
| master firsts vs normal  | 26            | 4            |
| normal firsts vs master  | 6             | 24           |

Level ranking survives seat order in every matchup (higher level wins even when
moving second). First-move swing is largest in hard/master: going first flips
that matchup from 7–23 to 23–7.

## Strength ranking implied

master > expert > hard > normal
(master/expert closest: 35–25; hard/master most seat-sensitive: 23–7 each direction)
