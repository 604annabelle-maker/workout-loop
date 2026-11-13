import { catalogue } from "@/training/catalogue";
import { kg, type Equipment } from "@/training/equipment";
import { loadEquipment } from "@/training/history";
import { updateEquipment } from "./actions";

/**
 * Her gym's equipment, entered once (spec §Weights that exist). Every weight
 * the app suggests is one these can make, and − / + move only between them.
 * Blank fields keep a typical gym's values.
 */

const machineNames: Record<string, string> = {
  leg_press: "Leg press",
  hack_squat: "Hack squat",
  leg_extension: "Leg extension",
  leg_curl_seated: "Seated leg curl",
  leg_curl_lying: "Lying leg curl",
  leg_curl_standing: "Standing leg curl",
  abductor: "Hip abduction",
  adductor: "Hip adduction",
  glute_kickback: "Glute kickback machine",
  chest_press: "Chest press",
  incline_chest_press: "Incline chest press",
  pec_deck: "Pec deck",
  shoulder_press: "Shoulder press",
  lat_pulldown: "Lat pulldown",
  preacher_curl: "Preacher curl machine",
  triceps_extension: "Triceps extension machine",
  dip: "Dip machine",
  calf_raise: "Standing calf raise",
  seated_calf: "Seated calf raise",
  ab_crunch: "Ab crunch machine",
};

const list = (xs: number[]) => xs.map(kg).join(", ");

const field: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.7rem",
  border: "1px solid #d6d3d1",
  borderRadius: "0.25rem",
  fontSize: "0.95rem",
  fontFamily: "inherit",
};
const label: React.CSSProperties = { display: "block", fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.35rem" };
const hint: React.CSSProperties = { display: "block", fontSize: "0.85rem", color: "#57534e", fontWeight: 400, textTransform: "none", letterSpacing: 0 };
const group: React.CSSProperties = { marginBottom: "1.5rem" };

export default async function EquipmentForm() {
  let eq: Equipment;
  try {
    eq = await loadEquipment();
  } catch {
    return null;
  }
  const machines = [...new Set(catalogue().map((e) => e.load).filter((l) => l.startsWith("machine:")).map((l) => l.slice(8)))].sort();
  const row = (name: string, title: string, value: string, help: string) => (
    <div style={group} key={name}>
      <label style={label} htmlFor={name}>
        {title}
        <span style={hint}>{help}</span>
      </label>
      <input id={name} name={name} style={field} defaultValue={value} />
    </div>
  );
  return (
    <form action={updateEquipment} style={{ marginTop: "3rem" }}>
      <h2 style={{ fontSize: "1.25rem", marginBottom: "0.25rem" }}>Your gym</h2>
      <p style={{ color: "#57534e", marginTop: 0, marginBottom: "1.5rem" }}>
        The weights that exist, in kg. The app only ever suggests these. Leave a machine blank and it uses the general
        machine steps.
      </p>
      {row("dumbbells", "Dumbbells", list(eq.dumbbells), "Every size, comma separated.")}
      {row("barbell", "Barbell", kg(eq.barbell), "The bar on its own.")}
      {row("ezbar", "EZ bar", kg(eq.ezbar), "The curl bar on its own.")}
      {row("plates", "Plates", list(eq.plates), "Each size you have a pair of.")}
      {row("cable", "Cable stack", list(eq.cable), "Every step on the cable machines.")}
      {row("machine", "Machines, in general", list(eq.machine), "Steps for any machine below left blank.")}
      <fieldset style={{ border: 0, padding: 0, margin: "0 0 1.5rem" }}>
        <legend style={label}>Each machine<span style={hint}>Its steps, or tick “not in my gym”.</span></legend>
        {machines.map((m) => (
          <div key={m} style={{ display: "grid", gridTemplateColumns: "10rem 1fr auto", gap: "0.5rem", alignItems: "center", marginBottom: "0.4rem" }}>
            <span>{machineNames[m] ?? m}</span>
            <input name={`machine_${m}`} style={field} defaultValue={eq.machines[m] ? list(eq.machines[m]) : ""} placeholder="general steps" />
            <label style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>
              <input type="checkbox" name="missing" value={`machine:${m}`} defaultChecked={eq.missing.includes(`machine:${m}`)} /> not in my gym
            </label>
          </div>
        ))}
      </fieldset>
      <button type="submit" style={{ background: "#1c1917", color: "#fff", border: 0, borderRadius: "999px", padding: "0.7rem 1.6rem", fontSize: "0.8rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
        Save gym
      </button>
    </form>
  );
}
