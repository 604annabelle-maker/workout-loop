# Exercise drawings: credits and licence

Two line drawings per exercise, made from the Everkinetic open data set by
`npm run vendor:drawings` (src/scripts/vendor-drawings.mts).

- **Source:** [github.com/everkinetic/data](https://github.com/everkinetic/data),
  `main` branch, files `src/exercises/<id>/<id>-relaxation.svg` and
  `<id>-tension.svg`, with names from `dist/exercises.json`. Vendored
  2026-11-03, when `main` was commit `446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6`.
- **Authors:** Everkinetic ([everkinetic.com](http://everkinetic.com)), created
  by Greg Priday. The data repository's `package.json` lists its authors as
  Greg Priday (https://github.com/gregpriday) and Frank Paczynski
  (https://github.com/solygen).
- **Licence:** Creative Commons Attribution-ShareAlike 4.0 International
  (CC BY-SA 4.0), https://creativecommons.org/licenses/by-sa/4.0/. Stated in the
  repository's `LICENSE.md` and in its `package.json` (`"license": "CC-BY-SA-4.0"`).

## What was changed

Nothing but the format. Each PNG is the original SVG drawn at 400px wide, on
the white background the drawing already has, and stored as a 16 colour PNG.
Nothing was cropped, recoloured, redrawn or combined.

CC BY-SA 4.0 section 2(a)(4) allows the "technical modifications necessary" to
use the work in another format, and says they "never produce Adapted Material".
So these PNGs are copies of the original drawings under the same licence, not
adaptations of them. Anything that goes further, such as cropping or putting
the two frames into one image, would be an adaptation: say so in the credit,
and share the result under CC BY-SA 4.0 too.

The files are `<id>-0.png` (the set's "relaxation" frame) and `<id>-1.png`
(its "tension" frame). The set does not use these consistently for the start
and end of the movement, so neither number means "start".

## Attribution line

Wherever the drawings are shown, for example in the email footer:

> Exercise drawings: Everkinetic (everkinetic.com, Greg Priday), CC BY-SA 4.0
> (https://creativecommons.org/licenses/by-sa/4.0/), via
> github.com/everkinetic/data. Converted from SVG to PNG.
