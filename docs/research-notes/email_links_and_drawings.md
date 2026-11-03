# In-email jump links for swaps, and licensable exercise line drawings

Researched 2026-11-02. Grades: **strong** means primary test data or primary source files; **moderate** means primary data that is old or partial, or several secondary sources that agree; **weak** means one secondary source or a search summary I could not open; **opinion** means my own judgement.

Access limits in this session: caniemail.com, emailonacid.com, academy.insiderone.com, commons.wikimedia.org, upload.wikimedia.org and wger.de were all blocked, either by DNS or by the proxy. To get caniemail data, I read the source data files that caniemail.com renders, which live in its GitHub repo (`hteumeuleu/caniemail/_features/*.md`). I read these on raw.githubusercontent.com, so the client tables below are caniemail's own data. Each row links to the caniemail page plus the raw file.

## Q1. Do anchor ("jump") links work inside HTML email in her likely phone apps?

### Takeaway
It depends on the app. Gmail on iPhone ignores the tap, and so does Samsung Email. Gmail on Android does jump, but the target can land under the app's top bar. Apple Mail on iOS 15+ jumps, and so do the Outlook iOS and Android apps (tested May 2026). An unknown phone app therefore cannot be relied on, and the design must still work when the tap does nothing.

### Cited Findings
- caniemail's "Local anchors" entry (`html-anchor-links`) gives this per-client data. Overall last_test_date is 2019-08-08, and some rows are newer. The tests were run on Email on Acid. **Strong** for the rows tested, **moderate** for how old they are. [caniemail: html-anchor-links](https://www.caniemail.com/features/html-anchor-links/) ([raw data](https://raw.githubusercontent.com/hteumeuleu/caniemail/main/_features/html-anchor-links.md)); [Email on Acid test results linked from the entry](https://app.emailonacid.com/app/acidtest/lvP3Vdg0qtue1RAuGTjzEXl19nfCJu3TVV4lLdzwdqQk5/list)

  | Client | Result (test date) | caniemail note (verbatim) |
  |---|---|---|
  | Gmail Android app | **Yes, buggy** (2019-08) | #6 "Buggy. Targeted content is partially hidden by the application UI on top." |
  | Gmail iOS app | **No** (2019-08) | #3 "Buggy. Clicking an anchor link does nothing." |
  | Gmail desktop webmail | Partial (2019-08) | #7 "Partial. Works when targeting an empty anchor with the corresponding `name` attribute, but not with `id` attributes." |
  | Gmail mobile webmail | Partial (2020-02) | #7 (same as above) |
  | Apple Mail iOS | No on 12.4 (#3); **Yes on iOS 15.0** | — |
  | Apple Mail macOS | Yes, buggy (12.4) | #6 |
  | Outlook iOS | No (2019-08, #3); **Yes (2026-05)** | — |
  | Outlook Android | No (2019-08, #3); **Yes (2026-05)** | — |
  | Outlook.com | Yes (2019-08, 2024-01) | — |
  | Outlook Windows 2007–2019 | Partial (#7, `name` only) | — |
  | Samsung Email (Android) | **No** (v6.0) | #3 "Clicking an anchor link does nothing." |
  | Yahoo iOS / Android | No (#5 opens a new in-app browser on yahoo.com / #3) | — |

- Several email-platform help pages repeat the claim that the Gmail iOS app does not support anchor links: Club Essential, Workshop, tinyEmail and Ortto. Ortto suggests hiding anchor links on mobile. **Moderate.** These are secondary sources that agree with caniemail. [Workshop](https://docs.useworkshop.com/how-to-use-anchor-links-in-your-email); [Ortto](https://help.ortto.com/a-634-how-to-add-anchor-links-to-email-messages); [tinyEmail](https://help.tinyemail.com/en/articles/6361584-how-to-create-anchor-links); [Club Essential PDF](https://clubessential.atlassian.net/wiki/download/attachments/51970049/How+to+Add+Anchor+Links+in+Email.pdf?version=1)
- InsiderOne's docs, reported as updated January 2026, list Gmail web Yes, Gmail Android Yes, Gmail iOS No and **Apple Mail iOS No**. **Weak.** I saw this only through a search summary because the page was blocked. [InsiderOne](https://academy.insiderone.com/docs/email-anchor-links). A University of Colorado guide (data as of Oct 2022) also lists "Doesn't support: Gmail iOS, Apple Mail iOS, Outlook for Mac". [CU](https://www.cu.edu/blog/ecomm-wiki/limitations-using-anchor-links-emails). **Conflict:** caniemail records Apple Mail iOS 15.0 as "y". The vendor tables may be copying the older iOS 12 result. I treat caniemail's direct test as more reliable, but the iOS 15 row has no date and Apple Mail on iOS 26 is untested there.
- A HubSpot community answer says Gmail iOS, Apple Mail iOS and Outlook for Mac do not support anchors, and that anchors "can sometimes trigger spam filters". **Weak.** This is a single anecdotal claim. [HubSpot Community](https://community.hubspot.com/t5/Email-Marketing-Tool/Dynamic-Table-of-Contents/td-p/918833)
- A Marketo user reported that a `#jump` link worked in the platform preview but failed once the email reached Gmail, where the target's id had been rewritten. This fits caniemail note #7: Gmail honours `name`, not `id`. **Weak.** [Marketo Nation](https://nation.marketo.com/t5/product-discussions/email-anchor-tag/m-p/326842)
- Searches turned up no Litmus page on anchor-link support. The only mention of Litmus was as a testing tool. [emailblasteruk](https://www.emailblasteruk.com/blog/will-anchor-links-work-in-an-email-newsletter)

### Inferences
- If she uses the Gmail app on an **iPhone**, the jump link will do nothing (moderate). If she uses the Gmail app on **Android**, it will jump, but the swap line may sit under the top bar, so put the anchor target a line or two above the swap text (moderate). If she uses **Apple Mail on iPhone**, it will most likely work (moderate). If her Android phone is a Samsung using **Samsung Email**, it will do nothing (moderate, although the test is old, on v6.0).
- Coding pattern most likely to work across clients (opinion based on note #7). Put an empty `<a name="swap3" id="swap3"></a>` immediately above the swap row, link to it with `<a href="#swap3">`, and do the same for the "back up" target (`<a name="ex3" id="ex3"></a>` above the exercise row). Do not rely on `id` alone.
- Because her phone has no web browser, a dead anchor is harmless in Gmail iOS and Samsung, where it does nothing. Any fallback that opens a *web page* (a hosted swap list, for example) would be useless to her (strong, by her constraint).

### Gaps
- The Gmail app rows (iOS and Android) were last tested in **2019-08**. I found no 2024–2026 test of Gmail app anchor behaviour. Status in late 2026 is unconfirmed.
- I could not open Email on Acid's or Litmus's own articles (blocked or not found), so the only Email on Acid data here is the caniemail test run.
- Apple Mail on iOS 18 and 26, and current Samsung Email versions, have not been tested for anchors in caniemail.
- Not verified this session: whether Gmail's clipping of long messages ("Message clipped") could hide a bottom-of-email swap list. Keep the email small, and check this in a real send.

## Q2. Alternatives that keep the email uncluttered, and which is most reliable

### Takeaway
`<details>`/`<summary>` and CSS checkbox toggles both fail in Gmail on every platform. They are no better than plain text, and in Gmail they look worse. The reliable choices are plain text. One is a faint one-line "swap: X" under each exercise. The other is a numbered swap list at the bottom with a small visible hint. The hint can also be an anchor link as a bonus, since a dead link costs nothing.

### Cited Findings
- `<details>`/`<summary>` support comes from caniemail's "HTML5 semantics" entry, tested 2019-07. Gmail (desktop, iOS, Android and mobile web) is "a #2": "`<details>`, `<main>`, `<nav>` and `<summary>` are not supported. Opening and closing tags are replaced by `<u></u>`." Outlook iOS, Android and Outlook.com are "a #1 #4": only `<time>` is supported, and "Unsupported opening and closing tags are stripped." Apple Mail iOS (10.3, 12.4) is "y", and so is Samsung Email (6.0). Yahoo and AOL are "n #4". **Strong** data, though from 2019. [caniemail: html-semantics](https://www.caniemail.com/features/html-semantics/) ([raw](https://raw.githubusercontent.com/hteumeuleu/caniemail/main/_features/html-semantics.md))
- CSS `:checked` toggles, the hidden-checkbox show/hide trick, are "n" in Gmail on all four platforms (2020-03) with the note "`<input>` elements are transformed into `<noinput>`". They work in Apple Mail iOS 13.3 and Samsung Email 7.0. **Strong** for Gmail. [caniemail: css-pseudo-class-checked](https://www.caniemail.com/features/css-pseudo-class-checked/) ([raw](https://raw.githubusercontent.com/hteumeuleu/caniemail/main/_features/css-pseudo-class-checked.md))
- Ortto's advice for clients without anchor support is to hide anchor links on mobile. A newsletter guide suggests a web-hosted version as the fallback, which does not fit her because she has no browser. [Ortto](https://help.ortto.com/a-634-how-to-add-anchor-links-to-email-messages); [emailblasteruk](https://www.emailblasteruk.com/blog/will-anchor-links-work-in-an-email-newsletter)

### Inferences
- A `<details>` element would show the swap expanded and **underlined** in Gmail, and as plain always-visible text in Outlook mobile. It only collapses in Apple Mail and Samsung. It does not achieve "hidden until wanted" in her most likely app (strong inference from the data).
- `mailto:` links do nothing useful here (agreed with the brief; opinion).
- Ranking for an unknown phone mail app (opinion, based on the data above):
  1. **Bottom numbered swap list, plus a small visible hint that is also a jump link.** Next to each exercise, show grey text such as `swap ↓3`. The hint is wrapped in `<a href="#swap3">` with the `name`+`id` empty-anchor pattern. Each swap row at the bottom ends with `↑ back` linking to `#ex3`. This meets her wish to see the swap only at the bottom. It jumps in Apple Mail iOS 15+, Gmail Android (target slightly hidden by the bar, so place the anchor above it), Outlook iOS and Outlook Android. In Gmail iOS and Samsung Email the tap does nothing, but the hint still tells her "it's number 3 at the bottom", so nothing breaks.
  2. **A faint one-line "swap: X" under each exercise**, in small grey text without a link. This is the most bulletproof option because it is plain text in every client, and it needs no scrolling. The cost is one extra short line per exercise. Choose it if a test shows the jump does nothing on her phone and she finds scrolling a chore.
  3. **Bottom list with a plain-text hint only (no link).** This behaves the same as option 1 does in Gmail iOS. Use it only if links cause confusion, for example if she taps one and nothing happens.
  - Not recommended: `<details>`/`<summary>`, CSS checkbox toggles, anchor links with no visible fallback text, links to a hosted web page, and `mailto:`.
- A cheap way to settle it (opinion): send her one test email with two jump links (down and back). Whether they work tells you which group her app falls in, and she can say which layout she prefers.

### Gaps
- No 2024–2026 independent test of `<details>` in the Gmail apps or Apple Mail iOS 18/26. The Gmail tag-to-`<u>` replacement result is from 2019.

## Q3. Licensable simple line drawings of gym exercises (start and end frames)

### Takeaway
**Everkinetic** (github.com/everkinetic/data) is the best source I could reach. It is CC BY-SA 4.0, with paired SVG start/end line drawings for nearly every lift on her list. The exceptions are the hip thrust (none) and the standard wide-grip lat pulldown (listed but has no images; underhand and V-bar pulldowns have both frames). The files are SVG only, so they need converting to PNG for email. The figure is always a muscular, faceless man. wger has a per-image licence and a "Line" style field, but its servers were blocked, so I could not check its drawings.

### Cited Findings
**Everkinetic (github.com/everkinetic/data)**
- Licence: `LICENSE.md` is the full "Creative Commons Attribution-ShareAlike 4.0 International" text, and `package.json` declares `"license": "CC-BY-SA-4.0"` with authors Greg Priday and Frank Paczynski. The README says "Open data project based on http://everkinetic.com created by Greg Priday." **Strong.** [LICENSE.md](https://raw.githubusercontent.com/everkinetic/data/main/LICENSE.md); [package.json](https://raw.githubusercontent.com/everkinetic/data/main/package.json); [README](https://raw.githubusercontent.com/everkinetic/data/main/README.md)
- Attribution duties under CC BY-SA 4.0 §3(a) are to name the creator, indicate if you modified the material, and give the licence or a link to it. ShareAlike (§3(b)) means any *adapted* image must also be shared as CC BY-SA. §2(a)(4) allows "technical modifications necessary" to use the work in other formats, and says these "never produce Adapted Material". Converting SVG to PNG is therefore not an adaptation. **Strong** (licence text). [LICENSE.md](https://raw.githubusercontent.com/everkinetic/data/main/LICENSE.md)
- A separate npm package also describes the Everkinetic data as CC-BY-SA-4.0. **Weak/supporting**, from a search summary. [fithero-exercises](https://www.npmjs.com/package/fithero-exercises)
- Structure: `src/exercises/NNNN/NNNN.json` holds the metadata (title, steps, muscles, equipment). Each exercise has a pair, `NNNN-relaxation.svg` and `NNNN-tension.svg`. I found 289 exercise JSON files with IDs from 0001 to 0302. GitHub code search reported 579 SVG files, which includes a legacy `src/images-svg/` set. **No PNGs** exist in the repo (PNG code-search count 0). **Strong** (direct inspection). [example JSON 0122](https://raw.githubusercontent.com/everkinetic/data/main/src/exercises/0122/0122.json)
- Look: the SVGs use only fills `#333333` (lines) and `#FFFFFF`. They are traced, hand-drawn-looking contour drawings of a muscular, bare-chested man in shorts, with a featureless head and no colour or muscle highlighting (I rendered and inspected 4). The squat viewBox is 216×300. **Strong** for the files inspected. In the 4 files I looked at, the figure is male; I did not inspect all 289. A 2016 Wikipedia talk-page comment also says the Commons squat illustrations are all male, apart from one photo. [Talk:Squat (exercise)](https://www.wikipedia.org/wiki/Talk:Squat_(exercise)) (weak)
- Frame naming is **not** consistently start/end. For 0025 Seated Cable Rows, relaxation shows arms extended (the start) and tension shows the handle at the torso (the end). For 0122 Barbell Squat, relaxation is the *bottom* and tension is *standing*, so the start is the "tension" file. **Strong** (observed). Each exercise needs a one-time manual mapping.
- Coverage of her lifts. I checked both files with an HTTP 200 for each, except where marked. **Strong.** URL pattern: `https://raw.githubusercontent.com/everkinetic/data/main/src/exercises/NNNN/NNNN-{relaxation|tension}.svg`

  | Her lift | Everkinetic ID and title | Start+end SVG? |
  |---|---|---|
  | Hip thrust | **none**. The only "hip" exercise is 0287 "Bent Knee Hip Raise", an ab exercise (lying, knees to chest), not a glute bridge or thrust | No match |
  | Romanian deadlift | 0118 Romanian Dead Lift | Yes |
  | Squat | 0122 Barbell Squat (also 0138 Front Squat with Barbell) | Yes |
  | Lat pulldown | 0097 Pull Down: Wide Bar (Wide Grip) has **no SVGs (404)**. 0093/0095 "Pull Down: Underhand" and 0096 "Pull Down: V Bar" both have images | Yes for underhand and V-bar; no for wide grip |
  | Seated cable row | 0025 Seated Cable Rows | Yes |
  | Bench press | 0042 Bench Press: Barbell; 0055 Bench Press: Dumbbell | Yes |
  | Overhead press | 0004 Seated Military Press has images. 0011 Seated Barbell Shoulder Press, 0012 Dumbbell Shoulder Press and 0003 Seated Shoulder Press Machine have **no images**. There is no standing barbell OHP | Seated barbell only |
  | Lateral raise | 0018 Lateral Dumbbell Raises | Yes |
  | Biceps curl | 0211 Biceps Curl: Barbell; 0224 Biceps Curl: Dumbbell | Yes |
  | Triceps pushdown / overhead extension | 0205 Triceps Pushdown: Cable; 0206 (Rope); 0192 Triceps Extension: Dumbbell (Seated, Two Arm); 0201 Barbell (Standing, Overhead) | Yes |
  | Leg curl | 0117 Lying Leg Curl Machine; 0119 Seated Leg Curl; 0120 Standing Leg Curls | Yes |
  | (extras) | 0099 Dead Lifts: Barbell, 0127 Leg Press, 0114 Lunges: Barbell, 0142 Leg Extensions | Yes |

**wger (wger-project/wger)**
- wger's image model, `ExerciseImage`, has a `style` field with choices `LINE_ART='1'` ("Line"), `'2'` 3D, `LOW_POLY='3'`, `PHOTO='4'` and `OTHER='5'`, and the default is PHOTO. It inherits `AbstractLicenseModel`, which stores per-image TASL attribution: `license`, `license_title`, `license_object_url`, `license_author`, `license_author_url` and `license_derivative_source_url`. **Strong** (source code). [image.py](https://github.com/wger-project/wger/blob/master/wger/exercises/models/image.py); [utils/models.py](https://github.com/wger-project/wger/blob/master/wger/utils/models.py)
- wger docs say the app is AGPL 3+ and the exercise data is additionally Creative Commons (CC-BY-SA 3.0 in older docs). A third-party scraper sample shows an image licensed "CC-BY-SA 4.0" by "wger.de contributors". **Weak/moderate.** The two disagree on version, so each image's own licence field is what counts. [wger docs](https://wger.readthedocs.io/); [Apify scraper sample](https://apify.com/parseforge/wger-exercise-database-scraper.md)
- The `exercemus/exercises` repo, which was curated from wger and exercises.json, has 872 exercises and **no image URLs** in its minified data, so it is not useful for drawings. **Strong** (inspected). [exercemus/exercises](https://github.com/exercemus/exercises)

**SVG vs PNG in email**
- Linked SVG images (caniemail `image-svg`, last tested 2026-09-16): **Gmail** desktop, iOS, Android and mobile web are "a #2: The image is rendered but rasterized in PNG" (2026-09). Apple Mail iOS 15 and 26 are "y". Outlook iOS is "y" (2023-01) and Outlook Android "y". Samsung is "y". Outlook Windows 2007–2016 is "n". **Strong.** [caniemail: image-svg](https://www.caniemail.com/features/image-svg/) ([raw](https://raw.githubusercontent.com/hteumeuleu/caniemail/main/_features/image-svg.md))
- Inline `<svg>` (caniemail `html-svg`, 2020): "n" in Gmail on all platforms, Outlook mobile and Yahoo. **Strong** (old). [caniemail: html-svg](https://www.caniemail.com/features/html-svg/)

### Inferences
- Linked SVG mostly works in late 2026, but PNG is still the safe choice for an unknown app. Inline SVG is not an option in Gmail. Convert once to PNG at about 2× display width (for example 400–430 px wide, shown at about 200 px) (opinion; strong for the inline SVG point).
- For the hip thrust, she would need another source, a photo, or an adapted drawing. Adapting an Everkinetic drawing (for example editing the RDL figure) would create Adapted Material, which must stay CC BY-SA 4.0 and be credited as modified (inference from the licence text).
- Using the images in a private email to one person is easy to comply with. Add a one-line credit in the email footer, and the email itself does not become CC BY-SA, because it is not an adaptation of the drawing (opinion and licence interpretation, not legal advice).
- Style judgement for her (opinion): these are clear about body angle and bar path, but they are a heavily muscled male figure. If she wants a neutral or female figure, Everkinetic does not offer one.

### Gaps
- **wger.de was blocked**, so I could not count how many wger images have style "Line", see what they look like, or check whether any are Everkinetic-derived. Coverage of her lifts in wger is unverified.
- **Wikimedia Commons was blocked**, so I found no verifiable CC0 or CC-BY line-art exercise set there.
- I found no CC0 line-art set of gym lifts with start/end frames on GitHub. I did not search exhaustively; GitHub code search is limited to indexed repos.
- I did not check whether any Everkinetic exercise shows a female figure.

## Q4. Bottom line: recommended approach, source, and the sample files

### Takeaway
For swaps, use a bottom numbered list with a small visible "swap ↓N" hint that is also a jump link, and fall back to a faint inline "swap: X" line. For drawings, use Everkinetic, licensed CC BY-SA 4.0 with attribution, converted to PNG. Four sample drawings (squat and seated cable row, start and end) are saved with a SOURCES.md.

### Cited Findings
- Swap display, ranked (opinion, based on caniemail data above). [caniemail anchors](https://www.caniemail.com/features/html-anchor-links/); [caniemail semantics](https://www.caniemail.com/features/html-semantics/)
  1. **Bottom numbered swap list plus a tiny visible hint next to each exercise ("swap ↓3") that is also an anchor link** (`name`+`id` on an empty `<a>`, placed a line above the target), with "↑ back" links. The jump works in Apple Mail iOS 15+, Gmail Android and Outlook mobile. In Gmail iOS and Samsung Email the tap does nothing, but the hint still says where to look.
  2. **A faint one-line "swap: X" under each exercise**, with no link. This is the most bulletproof option and works identically everywhere.
  3. **Bottom list with a plain-text hint only.**
  - Avoid `<details>`/`<summary>` (Gmail shows it expanded and underlined), CSS checkbox toggles (Gmail strips `<input>`), anchor-only links with no visible text, `mailto:`, and web-page fallbacks (she has no browser).
- Drawing source: **Everkinetic**, at https://github.com/everkinetic/data. Licence: **CC BY-SA 4.0**. Attribution: "Exercise drawings: Everkinetic (everkinetic.com, Greg Priday), CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/ — converted from SVG to PNG". Format: SVG only, with paired relaxation/tension frames. Coverage: squat, RDL, underhand or V-bar pulldown, seated cable row, bench press, seated military press, lateral raise, biceps curl, triceps pushdown and overhead extension, and lying, seated or standing leg curl all have both frames. **Missing:** hip thrust, wide-grip lat pulldown and standing overhead press. Figure: muscular male, faceless, black line art. [LICENSE.md](https://raw.githubusercontent.com/everkinetic/data/main/LICENSE.md)
- Sample files (downloaded 2026-11-02; sources, licence and SHA-256 hashes are in SOURCES.md):
  - `/tmp/claude-0/-home-user-workout-loop/c9a719ed-a089-5c64-89d4-645ff1b7c658/scratchpad/drawings/everkinetic-0122-tension.png` (squat, standing/start) and `.svg`, from [0122-tension.svg](https://raw.githubusercontent.com/everkinetic/data/main/src/exercises/0122/0122-tension.svg)
  - `/tmp/claude-0/-home-user-workout-loop/c9a719ed-a089-5c64-89d4-645ff1b7c658/scratchpad/drawings/everkinetic-0122-relaxation.png` (squat, bottom) and `.svg`, from [0122-relaxation.svg](https://raw.githubusercontent.com/everkinetic/data/main/src/exercises/0122/0122-relaxation.svg)
  - `/tmp/claude-0/-home-user-workout-loop/c9a719ed-a089-5c64-89d4-645ff1b7c658/scratchpad/drawings/everkinetic-0025-relaxation.png` (seated cable row, start) and `.svg`, from [0025-relaxation.svg](https://raw.githubusercontent.com/everkinetic/data/main/src/exercises/0025/0025-relaxation.svg)
  - `/tmp/claude-0/-home-user-workout-loop/c9a719ed-a089-5c64-89d4-645ff1b7c658/scratchpad/drawings/everkinetic-0025-tension.png` (seated cable row, end) and `.svg`, from [0025-tension.svg](https://raw.githubusercontent.com/everkinetic/data/main/src/exercises/0025/0025-tension.svg)
  - `/tmp/claude-0/-home-user-workout-loop/c9a719ed-a089-5c64-89d4-645ff1b7c658/scratchpad/drawings/SOURCES.md`
  - A side-by-side preview of all four is at `/tmp/claude-0/-home-user-workout-loop/c9a719ed-a089-5c64-89d4-645ff1b7c658/scratchpad/tools/preview.png`.

### Inferences
- The PNGs are 432 px wide, about 40–60 KB each, and use a white background. For email, show each at about 200 px wide. Showing both frames side by side as two `<img>` tags in one table row avoids making a combined image, which would count as an adaptation (opinion).
- ImageMagick in this environment could not render the SVGs. The PNGs were made with a small PIL rasteriser written for these files: `/tmp/claude-0/-home-user-workout-loop/c9a719ed-a089-5c64-89d4-645ff1b7c658/scratchpad/tools/svg2png.py`. It handles only absolute M/L/C/Z paths with flat fills, which is all these files use. The app's build step could reuse it or use any standard SVG-to-PNG tool.

### Gaps
- No hip thrust drawing in any source I could verify. wger and Wikimedia Commons could not be checked from this session because their sites were blocked.
