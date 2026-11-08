# Known recordings

Folder: `$ABI_RECORDINGS` or `/mnt/c/Users/<usuário>/abi-ear-spike/2026-11-02-1433/` (found by `scripts/env.sh`).

| Recording | Map / game language | Reference | Notes |
|---|---|---|---|
| 2026-11-02-145712 | en | desktop app log | prototype recorder (no events.jsonl); audio clock ~550 ms off |
| 2026-11-02-155614 | en | desktop app log | prototype; few pickups |
| 2026-11-02-160053 | en | desktop app log | normal visit; one "errada" is the app's mistake (merged 3x2 under a tooltip at 19:01:46) |
| 2026-11-02-185459 | en | desktop app log | fast pick-and-return: 6 wrong boxes left (backlog) |
| 2026-11-03-220143 | en | desktop app log + events.jsonl | new recorder; reliable clock; purchase among same-size boxes |
| 2026-11-03-200938 | en | events.jsonl | held out from the label models (check reads here) |
| 2026-11-07-114326 | Valley, pt | labels-truth.json (3 frames) | first Portuguese visit; price in the tooltip |
| 2026-11-07-160851 | Valley, pt | labels-truth.json (1 frame) | Tools and Energy Items 1-wide; phantom box from the character behind the panel; buy and sell; revealed boxes (3 Portable Jack, Space Boy Comic) at 19:11:00 and 19:12:30 |
| 2026-11-07-192442 | Airport, pt | labels-truth.json (1 frame) | Northridge-group categories; purchase (TV Capsule) and stock repack; "R Girar" drag hint |
| 2026-11-07-214528 | Armory, pt | events.jsonl | all categories read live; 6 no-box pickups at the start (bottom 3x2 boxes) |
| 2026-11-08-155416 | Forbidden Airport, pt | labels-truth.json (2 frames) | Electronics 1-wide and Rare Mystery Cargo 2x2; bought the 2x2 Mystery Cargo at (2,4) and the chat says the item: Metal Heart ("Coração Metálico"); the purchase revealed the quality (rarity background only, no item picture) of 2 boxes: (1,0) gold, (6,2) purple 1x2 read as 1x1 (a faint cell line shows through the tint) |

Still without a Portuguese model: Uncommon Collectibles, Military Items 2-wide, Rare Medical Supplies (see
docs/superpowers/next-steps.md).
