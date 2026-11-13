# Training engine (v2)

Pure modules that decide a session. Nothing here touches the database, the
mailbox or the network, except `choose.ts`, which asks the model to pick
among candidates.

| Module | Does |
|---|---|
| `rules.ts` | Every training number, with its reason and confidence |
| `equipment.ts` | Weights that exist at her gym |
| `catalogue.ts` | The reviewed exercises (`assets/exercises/overrides.json`) |
| `skeleton.ts` | Which session today is, its slots and their sets |
| `candidates.ts` | Whether a slot may change, and what may fill it |
| `choose.ts` | The model picks among candidates |
| `check.ts` | The plan checker: nothing wrong-muscle or off-target is ever sent |
| `progress.ts` | Double progression from what she logged |
| `warmup.ts` | The warm-up, built from the plan |
| `deload.ts` | Reactive lighter weeks, and volume growth |
| `build.ts` | History to a checked plan |
| `history.ts` | Reads plans and logs from the database (not pure) |
