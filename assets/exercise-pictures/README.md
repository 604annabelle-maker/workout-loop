# Exercise pictures

Two stills per exercise, the start and the end of the movement, embedded in the
workout email beside the exercise they belong to.

Vendored rather than fetched: `npm run vendor:pictures` rewrites this directory
from [free-exercise-db](https://github.com/yuhonas/free-exercise-db), which is
public domain (Unlicense). Nothing here is fetched while a workout is going
out, so there is no API to call, no rate limit, no cost, and no third party
that has to be up at six in the morning.

The originals are 750px wide and 40 to 70kB each. These are shrunk to 400px and
about 14kB, because a workout carries ten or twelve of them and the email is
read on a phone.

`index.json` is the names, which is what the matching in
`src/lib/exercise-name.ts` searches. Everything else is a picture named
`<exercise-id>-<frame>.jpg`.
