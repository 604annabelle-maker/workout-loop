# Low-effort logging, exercise pictures and email layout for an email-only workout app

Scope: one 22-year-old woman who gets workouts by HTML email on a phone with no browser and replies by email. She said: "I don't want to have to reply with everything I did, but I also don't want the system to assume." Right now the app asks for replies like `A 57.5 x 10 10 9`, and when she doesn't reply it progresses loads from what was prescribed. She found the email "too many words, looked messy". The pictures are two stills per exercise (start and end) of a male demonstrator, vendored from free-exercise-db. Evidence is current as of November 2026.

Evidence grades used below:
- **Strong:** meta-analyses or several consistent RCTs.
- **Moderate:** single RCTs, systematic reviews with caveats, or consistent lab findings applied outside their own domain.
- **Weak:** small, old, indirect or secondary-source findings.
- **Opinion:** practitioner or industry guidance, or my own reasoning.

Network note: pmc.ncbi.nlm.nih.gov, frontiersin.org, nngroup.com and wger.de could not be reached from this session. Findings from those sources come from abstracts and search-result summaries, not the full text, and are marked where it matters.

---

## Q1. Low-burden logging: what is the least data that still progresses loads well, without the system guessing?

### Takeaway
Progressing loads does not need full set-by-set logs. Per exercise, it needs two things: whether she did what was written, and how hard it felt. Studies that adjust load from effort ratings (RPE, or reps in reserve) do as well as or slightly better than fixed percentage plans. So the smallest honest scheme is an explicit one-word confirmation (`done`), with a short note only for the exercises that differed or felt easy or hard. With no reply, the app should hold the prescription, never progress it.

### Cited Findings

**Effort-based load adjustment (autoregulation)**
- **Moderate (single small RCT, trained men).** Helms et al. 2018 compared loads set by RPE with loads set as a percentage of 1RM in 21 resistance-trained men. The training was 8 weeks of daily undulating periodisation, with sets and reps matched; the RPE group chose its own loads to hit target RPE ranges. Both groups gained 1RM strength and muscle thickness, with no significant difference between groups. Small effect sizes favoured RPE: squat ES ≈ 0.50, bench ≈ 0.28. Squat gains were about +17.1 kg (RPE) vs +13.9 kg (percentage); bench about +10.7 vs +9.6 kg. The authors concluded both approaches work, and RPE may give "a small 1RM strength advantage in a majority of individuals". [PubMed 29628895](https://pubmed.ncbi.nlm.nih.gov/29628895/); [Frontiers full text](https://www.frontiersin.org/articles/10.3389/fphys.2018.00247/text) (not reachable from this session; figures from abstract-level summaries).
- **Moderate (single RCT, n = 31 trained men, squat only).** Graham & Cleather (J Strength Cond Res 2021; 35(9):2451–2456) ran 12 weeks of squat training. The autoregulated group set load by repetitions in reserve; the fixed-load group used a percentage of pre-test 1RM, with intensity and volume matched in theory. The RIR group gained more: front squat +11.7% vs +8.3% (p = 0.004), back squat +10.8% vs +7.1% (p = 0.006). It also trained at a slightly higher average intensity (front squat 83.2% vs 80.4% 1RM). [St Mary's repository](https://research.stmarys.ac.uk/3067/) · DOI 10.1519/JSC.0000000000003164
- **Moderate (systematic review, no pooled estimate).** Larsen, Kristiansen & van den Tillaar 2021 (PeerJ 9:e10663) reviewed 14 studies with 30 training groups and 356 participants. Every autoregulated protocol improved 1RM, with small to large effects. The authors suggest combining subjective intensity methods (RIR-based RPE, flexible daily undulating periodisation) with objective velocity methods. [PeerJ](https://www.peerj.com/articles/10663)
- **Weak (secondary listing only).** A later network meta-analysis reportedly found APRE, velocity-based training and RPE methods each beat percentage-based training for maximal strength. [LIDA record](https://lida.sport-iat.de/ta/Record/4094556)
- **Weak (secondary, 2025).** A 2025 paper notes that RIR-based programming "led to greater improvements in strength compared to the traditional percentage-based programming" but says more evidence is needed. [Springer 2025](https://link.springer.com/article/10.1007/s42978-025-00338-8)
- Caveat for all of the above: the participants were trained men. None of these studies tested a young woman in her first year or two of lifting, or a coarse three-level effort scale.

**Self-monitoring and adherence**
- **Strong for "self-monitoring matters"; moderate for any specific format.** Michie et al. 2009 meta-regression of 122 evaluations (N = 44,747) of physical activity and healthy-eating interventions found an overall effect of d = 0.31. Self-monitoring explained the most between-study heterogeneity (13%). Interventions that paired self-monitoring with at least one other control-theory technique (goal-setting, feedback, review of goals) were more effective: 0.42 vs 0.26. [University of Exeter repository](https://ore.exeter.ac.uk/repository/handle/10871/13754)
- **Moderate association, weak evidence quality (authors' own grading).** Burke, Wang & Sevick 2011 (J Am Diet Assoc 111:92–102) reviewed 22 studies from 1993–2009: 15 on diet, only **1** on exercise self-monitoring, and 6 on self-weighing. Self-monitoring was consistently associated with weight loss. The authors rated the evidence weak because the samples were mostly white women and adherence was self-reported. No included study established an optimal "dose" or frequency of self-monitoring. [PubMed 21185970](https://pubmed.ncbi.nlm.nih.gov/21185970/)
- **Moderate.** Later work on digital interventions found self-monitoring of behaviour among the techniques that moderate physical-activity effects, and warned against *inconsistent* self-monitoring. A meta-review by Spring and colleagues found no technique was consistently related to outcomes. [PMC8365685 (search summary)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8365685) (full text not reachable)

**Burden vs compliance in diaries and EMA (ecological momentary assessment)**
- **Moderate.** Williams et al. 2021 (JMIR) meta-analysed mobile EMA compliance in adults: pooled compliance was 81.9% (95% CI 79.1–84.4). The median protocol was 5 prompts a day with 8–10 items per prompt. In non-clinical samples, compliance was related to prompts per day and items per prompt. But across features meant to represent burden, the authors found "no compelling relationship" with compliance; heterogeneity was very high (I² > 90%) and reporting inconsistent. [JMIR 2021;23(3):e17023](https://jmir.org/2021/3/e17023/PDF)
- The evidence that fewer items mean better compliance is suggestive, not firm. Even demanding protocols reach about 80% compliance in research participants, who are paid or motivated differently from a single app user.

**How the app works today (local repository)**
- The current system progresses load per movement from the stored *prescribed* plans. The design spec says load "was progressing only as far as the model happened to notice it… It is now one: progression.ts reads the stored plans back per movement". With no reply, that history is the prescription, not what she did. [Local spec, docs/superpowers/specs/2026-08-26-workout-loop-design.md](file:///home/user/workout-loop/docs/superpowers/specs/2026-08-26-workout-loop-design.md) ("Progressive overload" section)

### Inferences

**Inference (moderate):** progression needs, per exercise:
1. Did she complete the prescribed sets × reps at the prescribed load (yes / no, and the actual numbers if no)?
2. How close to failure was it, coarsely?

The RPE/RIR trials show that an effort rating plus the prescription is enough to choose the next load. None of them needs a full log to beat or match fixed progression.

**Evaluation of the candidate schemes (my judgement, opinion-grade unless noted)**

| Option | Burden | Avoids assuming? | Enough to progress? | Verdict |
|---|---|---|---|---|
| Log only the main lift's top set (`A 57.5x10`) | Low | Only for the main lift; accessories are still assumed or frozen | Main lift yes, accessories no | Partial. Fine as an *optional* extra, not the core |
| Effort only per exercise (RIR numbers or RPE) | Medium; she must learn the scale | Yes, if paired with "did it as written" | Yes (moderate evidence, trained men) | Good signal, but a 0–10 or RIR number per exercise is more typing and thinking than she wants |
| Easy / right / hard per exercise | Low | Yes | Mostly. Coarser than RIR, but maps cleanly to "add load / add a rep / repeat" | Good as an *exception* marker, not as a required field for every exercise |
| "Exceptions only" plus an explicit `done` | Lowest on a normal day | **Yes**: nothing is inferred without her word | Yes, when combined with easy/hard markers | **Best fit for her quote** |
| Short code per exercise, e.g. `A✓ B+ C−` | Low, but ✓ and − (minus sign) are not on a phone keyboard; she'd type `-` or `v` | Yes | Yes | Use ASCII: `+` (easy), `-` (hard), nothing (as written) |
| No progression without a signal | Zero | **Yes** | No progression until she replies | Use as the **default when there is no reply** |

- **Inference (opinion):** an explicit `done` turns an absence of data into a positive confirmation, which is what she asked for. The remaining risk is that she sends `done` after a session that wasn't quite as written. That is acceptable: she chose to confirm, and an occasional over-credit is fixed the next session by a `hard` marker.
- **Inference (moderate, from Michie 2009):** self-monitoring works best together with feedback and goal review. So every reply should get back a one-line confirmation of what was logged and what changes next time ("Logged: all as written. A felt easy → Thursday 60 kg."). That makes the system's interpretation visible and easy to correct, rather than a hidden assumption.
- **Inference (opinion):** holding on no reply is safe for progression. A missed progression step costs about one session. A wrong increase (for example, after a session she skipped or struggled through) pushes her further past what she can do and erodes trust, which she has already said she dislikes.

### Gaps
- **RIR accuracy in novices and women:** how accurately a young woman in her first year or two of lifting can judge reps in reserve was not verified this session. The work by Zourdos and others, and a 2022 meta-regression on predicting reps to failure, could not be fetched. Accuracy is generally reported to be better close to failure, but I have no source in this session for that.
- **No trials of coarse effort scales:** I found no trial of a three-level easy/right/hard scale against numeric RPE/RIR for progressing load.
- **No adherence studies of workout-tracking apps:** I found no peer-reviewed study comparing how much detail a workout-logging app asks for with long-term adherence. Burke 2011 contains only one exercise self-monitoring study.
- **No study of the "no reply" default:** no study compares "hold vs progress" defaults when users don't log.
- **Full texts not read:** Helms 2018 and Graham & Cleather 2021 full texts were not reachable (Frontiers and PMC blocked); figures come from abstracts and summaries.

---

## Q2. Pictures: illustrations, photos or video? Which reads better on a phone? Does the demonstrator's sex or body type matter? Where can licensable images be found?

### Takeaway
The best available evidence favours **simple line drawings over photos** for comprehension, **pictures placed directly beside their text**, and **motion over still frames** for learning a movement. The drawing-vs-photo evidence comes from general health communication, not exercise trials. Format is a second-order factor: pictures help most for unfamiliar movements. For demonstrators, similarity in *ability* matters more than sex, and idealised physiques lower women's self-presentational confidence (though not their confidence in doing the exercise). A neutral line figure avoids the issue.
- **Licensable source to use:** wger's exercise images. They carry a per-image licence (mostly CC BY-SA) and a "line art" style flag, but you must check coverage of her exercises.
- **Licence risk in the current pictures:** free-exercise-db is labelled Unlicense (public domain), but nobody documents where its photos came from.

### Cited Findings

**Line drawings vs photos vs text, in health and exercise instruction**
- **Moderate (narrative review of health-communication research, not exercise-specific).**
  - Houts et al. 2006 (Patient Educ Couns) found that pictures closely linked to written or spoken text increased attention, comprehension, recall and adherence compared with text alone. Low-literacy readers benefited most.
  - The authors recommend pictures free of distracting detail, simple language, tight links between picture and caption, and testing materials with and without pictures. [PubMed 16122896](https://pubmed.ncbi.nlm.nih.gov/16122896/)
  - The review also reports that **"line drawings seem to facilitate comprehension more than do shaded drawings or photographs"**. [ResearchGate record of Houts 2006](https://www.researchgate.net/publication/7637576_The_Role_of_Pictures_in_Improving_Health_Communication_A_Review_of_Research_on_Attention_Comprehension_Recall_and_Adherence)
- **Moderate (single RCT, low-back pain, 1998).** Schneiders, Zusman & Singer (Manual Therapy) randomised 96 patients to verbal instruction alone or verbal plus written/illustrated instruction. Compliance was 77.4% vs 38.1%. The abstract does not say whether the illustrations were line drawings or photos. [PEDro record](https://search.pedro.org.au/search-results/record-detail/11882) (record mapping not opened; details from search summary)
- **Moderate (RCT, stroke, 2015), and it contradicts the above.** Adding written and pictorial instructions to verbal instruction did *not* improve adherence to a home exercise programme. [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S1569186115000388)
- **Weak to moderate (RCT, older adults with osteoarthritis).** Participants got a brochure alone, a brochure plus audiotape, or a brochure plus videotape. The authors concluded video was "the most effective modality for optimising correctness of exercise performance as well as adherence". [ResearchGate record](https://www.researchgate.net/publication/240065905_The_effects_of_mode_of_exercise_instruction_on_compliance_with_a_home_exercise_program_in_older_adults_with_osteoarthritis). A review summary conflicts with this: it says that once verbal instructions and illustrated brochures were given, adding video or audio did not further improve outcomes in a similar population. [Wits research report (search summary)](https://wiredspace.wits.ac.za/bitstream/handle/10539/18535/Sheetal%20Kara%200501718Y%20FINAL%20Research%20Report%20after%20examiners.pdf;sequence=1)
- **No head-to-head trial found.** I found no RCT that directly compares line drawings with photographs for exercise performance or adherence.

**Static vs dynamic pictures (motor learning)**
- **Moderate to strong (meta-analysis).** Höffler & Leutner 2007 (Learning and Instruction 17:722–738) analysed 26 studies with 76 comparisons. Animations beat static pictures overall, d = 0.37 (95% CI 0.25–0.49). The advantage was much larger when the content was **procedural-motor knowledge: d = 1.06** (CI 0.72–1.40), and when the animation was realistic or video-based (d = 0.76). [Leibniz-IPN](https://www.leibniz-ipn.de/en/research/publications/instructional-animation-versus-static-pictures-a-meta-analysis)
- **Moderate.** A later meta-analysis (Berney & Bétrancourt 2016) found a smaller overall advantage for animation, g = 0.226. A 2021 paper argues animations are "considerably more effective" when learners must grasp the specifics of a change, which is what a movement is. [Berney & Bétrancourt 2016](https://tecfa.unige.ch/perso/sandra/pdf/Earli2016_berney_betrancourt_FINAL.pdf); [Instructional Science 2021](https://link.springer.com/article/10.1007/s11251-021-09541-w)

**Multimedia design principles (Mayer)**
- **Strong in laboratory multimedia learning; transfer to a workout email is inference.** Mayer's handbook chapter reports:
  - Coherence (cut extraneous material): held in 23/23 tests, median d = 0.86.
  - Signalling (cue what matters): 24/28 tests, median d = 0.41.
  - Spatial contiguity (put words next to the picture they describe): 9/9 tests, median d = 1.22.

  Mayer's 2017 review gives coherence d = 0.70, signalling d = 0.46, spatial contiguity d = 0.79. The editions and methods differ, so the numbers are not directly comparable, but the direction is the same. [Cambridge Handbook chapter](https://www.cambridge.org/core/books/cambridge-handbook-of-multimedia-learning/principles-for-reducing-extraneous-processing-in-multimedia-learning-coherence-signaling-redundancy-spatial-contiguity-and-temporal-contiguity-principles/CD5B7AE1279A9AB81F8EEBB53DBEC86E); [Mayer 2017, J Comput Assist Learn](https://zendy.io/title/10.1111/jcal.12197)

**Demonstrator sex, body type and self-efficacy**
- **Weak (single 1992 study, female college students).** "Model ability is a more salient similarity cue than model sex" for non-athletic or unskilled female observers. Non-athletic models produced *higher* self-efficacy than athletic ones. [J Sport Exerc Psychol 14(3), 1992](https://journals.humankinetics.com/view/journals/jsep/14/3/article-p237.xml)
- **Weak to moderate (single experiment).** Fleming & Martin Ginis 2004 (J Appl Sport Psychol 16:92–102): women who watched "perfect-looking" exercise-video models reported lower self-presentational efficacy (confidence about how they look while exercising), whether or not they exercised regularly. Model type had **no effect on exercise-task self-efficacy**. [Journal record](https://informahealthcare.com/doi/abs/10.1080/10413200490260080)
- **Moderate (content analysis).** In 298 YouTube home-workout videos, most instructors were young, white, low-body-fat women with thin or athletic bodies. [Chung et al. 2025, J Health Psychol](https://journals.sagepub.com/doi/10.1177/13591053241242534)
- I found no study on whether a *male* demonstrator in still photos reduces a young woman's engagement or confidence for strength exercises.

**Licensable image sources**
- **free-exercise-db (current source).**
  - The GitHub badge says "License: Unlicense", and the project calls itself an "Open Public Domain Exercise Dataset". It has 800+ exercises, with stills named `0.jpg` and `1.jpg` (start and end). [github.com/yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db)
  - The project's local vendoring records it as public domain, with 873 exercises shrunk to 400 px (about 14 kB each). [Local assets/exercise-pictures/README.md](file:///home/user/workout-loop/assets/exercise-pictures/README.md)
  - The data is restructured from wrkout/exercises.json, whose README also says "public domain" but **says nothing about where the images came from or who holds copyright**. [github.com/wrkout/exercises.json](https://github.com/wrkout/exercises.json)
  - A developer write-up warns that scraped exercise datasets can be "free" while the images inside were never licensed. It does not name this dataset. [dev.to post](https://dev.to/furkanuruk/i-built-a-free-exercisedb-alternative-1300-exercises-with-gif-animations-5868)
  - **Grade: weak evidence of a problem, but an unresolved provenance risk.**
- **wger.**
  - Code is AGPL-3.0. Exercise and ingredient data is under Creative Commons licences that vary by entry; the initial data was CC BY-SA 3.0. [wger README](https://raw.githubusercontent.com/wger-project/wger/master/README.md); [wger 1.9 docs](https://wger.readthedocs.io/en/1.9/)
  - Each `ExerciseImage` inherits a licence model, so the licence and author are stored **per image**. Each image also has a `style` field: `LINE_ART='1'`, `THREE_D='2'`, `LOW_POLY='3'`, `PHOTO='4'` (the default), `OTHER='5'`, and an `is_ai_generated` flag. [wger image.py](https://raw.githubusercontent.com/wger-project/wger/master/wger/exercises/models/image.py)
  - The public API filters main images with `api/v2/exerciseimage/?is_main=True`. [wger API docs (mirror)](https://exercise.hellogym.io/es/software/api)
- **Everkinetic data.** An open-data project based on everkinetic.com by Greg Priday, licensed **CC-BY-SA-4.0** per the GitHub page. The page does not show exercise count, image style or whether data and images share the licence. [github.com/everkinetic/data](https://github.com/everkinetic/data)
- **Wikimedia Commons.** Licences are per file; exercise media is often CC BY-SA 4.0, e.g. an animated Roman-chair hyperextension GIF. [Commons file](https://c.enwp.org/wiki/File:Roman_chair_(hyperextension)_animation.gif)
- **Commercial option.** WorkoutLabs sells licences for its exercise illustrations. Terms were not opened this session. [workoutlabs.com licensing](https://workoutlabs.com/exercise-illustrations-licensing/)

### Inferences
- **Inference (moderate):** prefer simple line illustrations with a plain background to the current photos.
  - Houts' line-drawing finding and Mayer's coherence principle both point there.
  - The current stills (gym backgrounds, shading, clothing, a 750 px original shrunk to 400 px and shown at roughly half a phone width) carry exactly the "distracting detail" those sources advise removing.
  - Thin, high-contrast lines on white also survive downscaling better than a photo's mid-tones (opinion, not tested).
- **Inference (moderate):** keep **two frames, start and end, side by side**, directly under the exercise name, with a small arrow or "→" between them. This applies spatial contiguity and signalling. If file size allows, a two-frame looping GIF alternating start and end positions is a cheap step toward the "dynamic" advantage for motor content (Höffler & Leutner).
  - Unverified: support for animated GIFs on her particular phone's email client. Test it.
- **Inference (weak to moderate):** the male demonstrator probably doesn't hurt her ability to learn the movement (task self-efficacy was unaffected in Fleming & Martin Ginis). But a neutral, non-idealised line figure removes any comparison with how the model looks. **Opinion:** ask her; a female or gender-neutral figure is a reasonable default.
- **Inference (moderate):** show pictures only where they add information: new exercises, exercises she flagged, or the first two or three weeks of a block. The stroke trial's null result and the coherence principle both suggest more pictures do not mean better adherence, and twelve photos make the email long and messy.
- **Inference on licences (opinion):**
  - wger is the cleanest *verifiable* licensable source, because every image records its licence and author and can be filtered to line art.
  - CC BY-SA requires attribution, e.g. a one-line credit in the email footer. Share-alike only bites if she adapts the images.
  - Coverage of line-art images for her specific exercises is unknown and probably patchy (most wger images default to "photo"). Expect a mix: wger line art where it exists, Everkinetic (CC BY-SA 4.0) as a second source, and no picture otherwise.
  - Keeping free-exercise-db photos is legally plausible but unverified. Since the app is for one person and not distributed, the practical risk is low, but it is not zero if the project is ever published.

### Gaps
- **No direct exercise trial:** no RCT compares line drawings vs photographs for exercise technique or adherence. The line-drawing advantage comes from general health-communication research.
- **Untested image claims:** I found no study of illustration legibility at phone thumbnail sizes, and no study of animated GIF vs static start/end frames for strength exercises.
- **wger coverage unknown:** how many wger exercises have a line-art image, and their licence mix (mostly CC BY-SA 4.0 in my recollection), could not be checked because wger.de was not reachable. Query `https://wger.de/api/v2/exerciseimage/?style=1` once network access allows.
- **Everkinetic details unknown:** exercise count, style, and whether its images include start/end frames were not confirmed.
- **free-exercise-db provenance unresolved:** the original source of its photos is undocumented in both repositories checked.
- **Demonstrator sex:** no source tested the effect of demonstrator sex in still images on women's strength-training engagement.

---

## Q3. Layout: a clear, scannable workout email for use mid-session on a phone

### Takeaway
Use one column with one bold line per exercise (letter, name, load, sets × reps). Move cues and pictures below the list, or into a compact block directly under each line. Cut rationale, muscle lists and multi-step instructions down to at most one cue. Use a 16 px or larger body font and keep the HTML small. Most of this rests on industry guidance and Nielsen Norman Group's mobile-brevity advice, which is opinion to moderate evidence. Mayer's coherence and signalling principles give it some experimental support.

### Cited Findings
- **Moderate, but contested.** Nielsen Norman Group's 2011 work (based on University of Alberta research) reported comprehension on an iPhone-sized screen at 48% of desktop on a Cloze test, attributed to seeing less text at once and relying more on working memory. A 2016 NN/g follow-up (Kate Moran) found "no practical differences" in comprehension between mobile and desktop, yet still recommends brevity and cutting unnecessary content for mobile. [UX Magazine repost](https://uxmag.com/articles/why-reading-on-mobile-is-uniquely-challenging); [Wylie Communications summary](https://www.wyliecomm.com/5-obstacles-to-reading-on-smartphones/) (nngroup.com was not reachable from this session)
- **Opinion (industry guidance, broadly consistent).**
  - Body text at least 16 px on mobile. [Email Love help centre](https://help.emaillove.com/303eabcb09b781be866af7d3b0f4e14a?pvs=25)
  - Some guides allow 14 px, and headers at least 22 px. [Made Good Designs 2026 guide](https://madegooddesigns.com/email-design-guide/)
  - Tap targets at least 44×44 px (Apple Human Interface Guidelines).
  - A single column about 600 px wide that collapses cleanly at 320–375 px is "the most reliable email design layout". [Mailchimp: Mobile friendliness](https://templates.mailchimp.com/design/mobile-friendliness/); [InboxArmy](https://www.inboxarmy.com/?p=19681)
- **Moderate (vendor testing, consistent across vendors).**
  - Gmail clips messages whose HTML exceeds about 102 KB.
  - Embedded images don't count toward that limit.
  - The Gmail **Android app cuts the email off with no "view entire message" link**.
  - iPhone shows "Download entire message".

  [Email on Acid](https://www.emailonacid.com/?p=26940); [MxToolbox](https://mxtoolbox.com/dmarc/email/email-clipping)
- **Strong in the lab, inference for email:** coherence (d ≈ 0.7–0.86) and signalling (d ≈ 0.41–0.46) support cutting extraneous text and marking the important element. [Cambridge Handbook chapter](https://www.cambridge.org/core/books/cambridge-handbook-of-multimedia-learning/principles-for-reducing-extraneous-processing-in-multimedia-learning-coherence-signaling-redundancy-spatial-contiguity-and-temporal-contiguity-principles/CD5B7AE1279A9AB81F8EEBB53DBEC86E); [Mayer 2017](https://zendy.io/title/10.1111/jcal.12197)
- **Moderate.** Houts 2006 recommends simple language and pictures tightly linked to short captions. [PubMed 16122896](https://pubmed.ncbi.nlm.nih.gov/16122896/)
- **Local fact.** Pictures are already embedded inline by `cid:` under the exercise they belong to, and render on her phone; PDFs do not. [Local spec, "Image attachments"](file:///home/user/workout-loop/docs/superpowers/specs/2026-08-26-workout-loop-design.md)

### Inferences
- **Inference (opinion):** mid-session she needs to find "what's next, how heavy, how many" in under a second. The list of exercises therefore has to be the first thing on screen, one line each, without pictures interleaved, so it fits on one or two screens. Pictures and cues belong in a "How-to" section below, each block repeating the exercise letter and name. Spatial contiguity is kept *within* each block (name, frames, cue together), while the top list stays scannable.
- **Inference (opinion):** don't rely on collapsible sections (`<details>`, checkbox hacks); support in email clients is unreliable and was not verified here. "Moved down" is the dependable form of "collapsed".
- **Inference (moderate):** put the reply instruction **near the top** (one line under the list), not at the very bottom. If the HTML ever exceeds about 102 KB, Gmail on Android silently cuts off the end.
- **What to cut (opinion, grounded in coherence):**
  - "Why" paragraphs and muscle lists.
  - Multi-sentence form instructions; keep one cue of 8 words or fewer.
  - Warm-up prose; replace with one line.
  - Repeated reply-format examples.
  - Sign-offs and greetings beyond a few words.
  - Pictures for exercises she knows well.
  - The previous session's numbers for every exercise; keep "last time" for the main lift only, or drop it.

### Gaps
- I found no study of workout-plan formatting for use mid-session.
- Litmus's own guidance pages did not surface; the font-size and tap-target figures come from third-party email-design guides (opinion grade).
- The original NN/g articles were not read in full (domain blocked).

---

## Q4. Concrete recommendations: logging scheme, picture choice, layout spec

### Takeaway
1. **Logging:** she replies `done` when everything went as written. She adds short exceptions only where something differed: `A easy`, `C hard`, `B 50 8 8 6`, `skip D`. With no reply, the next session repeats the same loads, and the app never progresses on its own.
2. **Pictures:** use simple line illustrations, two frames side by side, only for new or flagged exercises. Source from wger line-art images (per-image CC licence, with attribution in the footer), then Everkinetic (CC BY-SA 4.0). Keep free-exercise-db only as a fallback, with its provenance caveat.
3. **Layout:** a one-line-per-exercise list at the top, a one-line reply instruction, then a "How-to" section below.

### Cited Findings
- **Logging rests on:** autoregulation results showing effort-based load selection matches or beats fixed progression ([Helms 2018](https://pubmed.ncbi.nlm.nih.gov/29628895/); [Graham & Cleather 2021](https://research.stmarys.ac.uk/3067/); [Larsen 2021](https://www.peerj.com/articles/10663)), and self-monitoring working best with feedback ([Michie 2009](https://ore.exeter.ac.uk/repository/handle/10871/13754)).
- **Pictures rest on:** the line-drawing comprehension advantage and tight picture–text linking ([Houts 2006](https://pubmed.ncbi.nlm.nih.gov/16122896/)); motion helping motor learning ([Höffler & Leutner 2007](https://www.leibniz-ipn.de/en/research/publications/instructional-animation-versus-static-pictures-a-meta-analysis)); idealised models lowering women's self-presentational efficacy ([Fleming & Martin Ginis 2004](https://informahealthcare.com/doi/abs/10.1080/10413200490260080)); and wger's per-image licence and line-art style field ([wger image.py](https://raw.githubusercontent.com/wger-project/wger/master/wger/exercises/models/image.py)).
- **Layout rests on:** coherence, signalling and contiguity ([Mayer handbook](https://www.cambridge.org/core/books/cambridge-handbook-of-multimedia-learning/principles-for-reducing-extraneous-processing-in-multimedia-learning-coherence-signaling-redundancy-spatial-contiguity-and-temporal-contiguity-principles/CD5B7AE1279A9AB81F8EEBB53DBEC86E)); mobile brevity ([UX Magazine / NN/g](https://uxmag.com/articles/why-reading-on-mobile-is-uniquely-challenging)); and Gmail clipping ([Email on Acid](https://www.emailonacid.com/?p=26940)).

### Inferences

#### 1. Logging scheme (opinion-grade design, built on the moderate evidence above)

**What she types.** Any one of these works. The parser is case-insensitive, the order doesn't matter, and commas, spaces or new lines all separate items.

| She types | Meaning |
|---|---|
| `done` (also `d`, `ok`, `yes`) | Every exercise as written, effort "about right" |
| `done A easy` or `done A+` | All as written; A felt easy (3+ reps left) |
| `done C hard` or `done C-` | All as written; C was a grind (0–1 reps left) |
| `B 50 8 8 6` | B was different: 50 kg, reps 8, 8, 6. Same as today's format, now optional |
| `skip D` | D not done |
| `A 60` | Did A at 60 kg, all reps as written |
| `didn't train` / `no` | Session not done; repeat it next time |

Example of a full exception reply: `done A+ C- skip D`.

**What the email asks for.** One line, directly under the exercise list:

> **Reply `done`** if it went as written. Otherwise just the differences, e.g. `A easy`, `C hard`, `B 50 8 8 6`, `skip D`.

**What the app does with each signal.** These rules are practitioner convention (double progression), not tested in the cited trials:

| Signal | Next time |
|---|---|
| As written, "right" | Add 1 rep per set within the rep range; once at the top of the range, add the smallest load step and drop to the bottom of the range |
| `easy` / `+` | Add the load step now (2.5 kg lower body / barbell; the next dumbbell or about 1–2 kg upper body) |
| `hard` / `-`, or reps short of target | Repeat the same load and reps |
| `hard` twice in a row on the same exercise | Reduce load about 5–10% |
| `skip` | Repeat the prescription next time; don't count it toward progression |
| Numbers given | Use the numbers as the new baseline, overriding the prescription |

**Every reply gets a one-line acknowledgement.** For example: "Logged Tue: all as written · A easy → Thu 60 kg · C hard → hold 12 kg". She can correct it by replying again. This provides feedback, a technique that boosts self-monitoring in Michie 2009, and makes any interpretation visible.

**No reply:**
- The session is recorded as "not logged", **not** as done.
- The next email carries the **same** loads and reps for every exercise, so the app holds rather than progresses.
- It has one small line at the top: "No log for Tuesday, so loads are unchanged. Reply `done` to that email if you did it."
- She can still reply `done` to the old email later, and the app applies it retroactively before the next one goes out.
- After two unlogged sessions in a row, keep holding. Do not deload automatically, and add no extra nagging beyond that one line.

**Don't** require a per-exercise code on normal days, RIR numbers, or full set logs. **Don't** use ✓ or the − (minus) glyph in the format; phone keyboards don't have them.

#### 2. Picture choice
- **Style:** simple line illustrations, ideally a female or neutral figure with a non-idealised build, on a white background. Two frames, start → end, side by side, each about 45% of the column width (about 130–160 px on a 360 px-wide screen; export at 2× for sharpness), with a thin arrow between them.
  - Optional upgrade: a two-frame looping GIF, if her client animates it and the file stays under about 50 kB. Test on her phone first.
- **When to show pictures:** only for exercises that are new this block, exercises she flagged ("pic B" in a reply), or the first two weeks of a new block. Otherwise no picture.
- **Source, in order:**
  1. **wger** images with `style = 1` (line art), using each image's licence and author for a footer credit, e.g. "Illustrations: wger.de contributors, CC BY-SA 4.0". Check `is_ai_generated` and decide whether that is acceptable.
  2. **Everkinetic data** (CC BY-SA 4.0) where wger lacks line art.
  3. **free-exercise-db** photos (Unlicense, provenance undocumented) as the fallback.
  4. If none fits, no picture and a one-line cue; the current spec already says "say so rather than silently omit".
- Coverage must be checked against her actual exercise list before committing (gap above).

#### 3. Layout spec

**One exercise, in the top list.** A single line, 18 px bold for name and numbers, 16 px for everything else:

```
A  Back squat        57.5 kg · 3 × 8–10 · rest 2–3 min
```

- The letter in a fixed-width left column, so lines align.
- Load and sets × reps in bold, the most important characters on the line.
- Rest time only for main lifts; drop it for accessories, or state one rest rule once in the header.
- Unilateral work: "· each leg".
- Tempo or notes only if non-standard, as a ≤6-word grey suffix on the same line or the next.

**One exercise, in the How-to section** (only when a picture or cue is warranted):

```
A  Back squat
[start drawing] → [end drawing]          (two frames side by side, alt="Back squat start/end")
Sit between your heels, chest up.        (one cue, ≤ 8 words)
```

**Whole email**, single column, max width 600 px, body text 16 px or larger, plain white background, no header images or logos:

1. **Subject:** `Tue · Lower A · 5 exercises · ~50 min` (scannable in the inbox).
2. **Line 1 (only if needed):** status, e.g. "Loads unchanged: no log for Thursday." or "Up from last time: A +2.5 kg."
3. **Warm-up, one line:** "Warm-up: 5 min easy cardio, then 2 lighter sets of A."
4. **The list**, A–E, one line each as above, 12–16 px vertical spacing between lines, no pictures in this block.
5. **Reply line:** "**Reply `done`** if it went as written. Otherwise just the differences: `A easy`, `C hard`, `B 50 8 8 6`, `skip D`."
6. **"How-to" heading**, then a block per exercise *that needs one*, as above.
7. **Footer, one line, grey, 13–14 px:** the image credit line ("Illustrations: … CC BY-SA 4.0").

**Cut from the current email:**
- Rationale or "why" paragraphs and muscle-group lists.
- Multi-step instructions; keep one cue.
- Repeated logging examples.
- Greetings and sign-offs beyond a few words.
- Pictures for familiar exercises.
- "Last time" numbers for anything except the main lift.

**Technical:**
- Every image gets `alt` text with the exercise name, so a blocked image still makes sense.
- Keep HTML well under 102 KB to avoid Gmail clipping. Inline images don't count, but keep the total download small for her phone.
- Use `cid:` inline images as now.

### Gaps
- The whole spec is design judgement anchored to general principles. It should be tested with her: send two versions, and ask which one she can read at the squat rack.
- The load-step sizes and the "hard twice → reduce 5–10%" rule are practitioner convention, not from the cited trials.
- How animated GIFs and line-art images actually render in her email client has not been tested.
