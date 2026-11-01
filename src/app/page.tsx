import { MUSCLES } from "@/lib/plan";
import { readPreferences } from "@/lib/preferences";
import { LEVELS, MAX_PRIORITIES } from "@/lib/profile";
import { updatePreferences } from "./actions";

// Reads the database on every request. There is one user and no cache to win.
export const dynamic = "force-dynamic";

const page: React.CSSProperties = {
  maxWidth: "42rem",
  margin: "0 auto",
  padding: "2.5rem 1.5rem 4rem",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
  color: "#1c1917",
  lineHeight: 1.6,
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: "0.35rem",
};

const hint: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "#57534e",
  fontWeight: 400,
  textTransform: "none",
  letterSpacing: 0,
  display: "block",
  marginTop: "0.1rem",
};

const field: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.7rem",
  border: "1px solid #d6d3d1",
  borderRadius: "0.25rem",
  fontSize: "0.95rem",
  fontFamily: "inherit",
  lineHeight: 1.5,
};

const group: React.CSSProperties = { marginBottom: "1.75rem" };

const choice: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  marginRight: "1rem",
  marginBottom: "0.4rem",
  fontSize: "0.95rem",
};

export default async function PreferencesPage() {
  const prefs = await readPreferences();

  return (
    <main style={page}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Preferences</h1>
      <p style={{ color: "#57534e", marginTop: 0, marginBottom: "2.5rem" }}>
        What every generated workout is built from. Saved changes apply to the
        next workout, not to any already sent.
      </p>

      <form action={updatePreferences}>
        <div style={group}>
          <label style={label} htmlFor="goals">
            Goals
            <span style={hint}>What you are training for.</span>
          </label>
          <textarea id="goals" name="goals" rows={2} style={field} defaultValue={prefs.goals} />
        </div>

        <div style={group}>
          <label style={label} htmlFor="experience">
            Experience
            <span style={hint}>How long you have trained and what you are comfortable with.</span>
          </label>
          <textarea id="experience" name="experience" rows={2} style={field} defaultValue={prefs.experience} />
        </div>

        <div style={group}>
          <label style={label} htmlFor="level">
            Level
            <span style={hint}>Scales the weekly set targets. Beginner is roughly the first six months.</span>
          </label>
          <select id="level" name="level" style={{ ...field, width: "12rem" }} defaultValue={prefs.level}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <div style={group}>
          <label style={label} htmlFor="trainingDaysPerWeek">
            Training days per week
            <span style={hint}>
              Three or fewer gets full body sessions; four or more gets an upper and lower split.
              Once there are three weeks of history, what you actually do takes over.
            </span>
          </label>
          <input
            id="trainingDaysPerWeek"
            name="trainingDaysPerWeek"
            type="number"
            min={1}
            max={7}
            style={{ ...field, width: "6rem" }}
            defaultValue={prefs.trainingDaysPerWeek}
          />
        </div>

        <fieldset style={{ ...group, border: 0, padding: 0, margin: "0 0 1.75rem" }}>
          <legend style={label}>
            Priority muscles
            <span style={hint}>
              Up to {MAX_PRIORITIES}. These get the top of their weekly range; everything else still
              gets enough to grow.
            </span>
          </legend>
          {MUSCLES.map((m) => (
            <label key={m} style={choice}>
              <input type="checkbox" name="priorities" value={m} defaultChecked={prefs.priorities.includes(m)} />
              {m}
            </label>
          ))}
        </fieldset>

        <div style={group}>
          <label style={label} htmlFor="avoid">
            Avoid
            <span style={hint}>Injuries and movements to stay away from. Honoured without exception.</span>
          </label>
          <textarea id="avoid" name="avoid" rows={3} style={field} defaultValue={prefs.avoid} />
        </div>

        <div style={group}>
          <label style={label} htmlFor="equipment">
            Equipment
            <span style={hint}>
              What is actually in the gym. Anything missing here will get prescribed anyway.
            </span>
          </label>
          <textarea id="equipment" name="equipment" rows={3} style={field} defaultValue={prefs.equipment} />
        </div>

        <div style={group}>
          <label style={label} htmlFor="enjoys">
            What you love
            <span style={hint}>Movements and formats you want more of. The finishers lean this way.</span>
          </label>
          <textarea id="enjoys" name="enjoys" rows={2} style={field} defaultValue={prefs.enjoys} />
        </div>

        <fieldset style={{ ...group, border: 0, padding: 0, margin: "0 0 1.75rem" }}>
          <legend style={label}>Tracking</legend>
          <label style={{ ...choice, display: "flex" }}>
            <input type="checkbox" name="weeklyReview" defaultChecked={prefs.weeklyReview} />
            Weekly review email on Sunday morning
          </label>
          <label style={{ ...choice, display: "flex", alignItems: "flex-start" }}>
            <input type="checkbox" name="cycleTracking" defaultChecked={prefs.cycleTracking} />
            <span>
              Cycle tracking
              <span style={hint}>
                Reads &ldquo;period started&rdquo; from replies, shows the cycle day on each workout, and
                mentions an unusually long gap. Sessions are never programmed by phase; how you say
                you feel is what adjusts them.
              </span>
            </span>
          </label>
        </fieldset>

        <div style={group}>
          <label style={label} htmlFor="brief">
            Anything else
            <span style={hint}>In your own words. Nothing here is parsed, so write it however you like.</span>
          </label>
          <textarea id="brief" name="brief" rows={6} style={field} defaultValue={prefs.brief} />
        </div>

        <button
          type="submit"
          style={{
            background: "#1c1917",
            color: "#fff",
            border: 0,
            borderRadius: "999px",
            padding: "0.7rem 1.6rem",
            fontSize: "0.8rem",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Save
        </button>
      </form>
    </main>
  );
}
