/**
 * Weights that exist (spec §Weights that exist).
 *
 * Pure. She enters her gym's equipment once on the preferences page; until
 * then a typical commercial gym stands in. Every weight the app suggests is a
 * member of `loadable(load)`, and − / + move between those and nothing else.
 */

/** How an exercise is loaded: "machine:<key>" names one machine's stack. */
export type Load =
  | "barbell"
  | "ezbar"
  | "dumbbell"
  | "cable"
  | "bodyweight"
  | "band"
  | `machine:${string}`;

export interface Equipment {
  /** Every dumbbell weight, kg, one of each size per pair. */
  dumbbells: number[];
  /** The bar, kg. */
  barbell: number;
  /** The EZ bar, kg. */
  ezbar: number;
  /** Plate sizes, kg. Plates are loaded in pairs, one each side. */
  plates: number[];
  /** The cable stack's steps, kg. */
  cable: number[];
  /** A step list per machine. A machine not listed uses `machine`. */
  machines: Record<string, number[]>;
  /** The generic machine stack, for machines she has not described. */
  machine: number[];
  /** Ways of loading her gym does not have, such as "machine:hack_squat". */
  missing: string[];
}

const range = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(round(v));
  return out;
};

const round = (v: number) => Math.round(v * 100) / 100;

export const DEFAULT_EQUIPMENT: Equipment = {
  dumbbells: [...range(1, 10, 1), ...range(12, 30, 2)],
  barbell: 20,
  ezbar: 10,
  plates: [1.25, 2.5, 5, 10, 15, 20],
  cable: range(2.5, 60, 2.5),
  machines: {},
  machine: range(5, 120, 5),
  missing: [],
};

/** Her gym has this way of loading an exercise. */
export const has = (load: Load, eq: Equipment) => !eq.missing.includes(load);

/** The plates on a barbell: every total reachable with up to 4 pairs of each plate. */
function barTotals(bar: number, plates: number[], max = 200): number[] {
  const totals = new Set<number>([bar]);
  let frontier = [0];
  const sizes = [...new Set(plates)].filter((p) => p > 0);
  for (let depth = 0; depth < 8; depth++) {
    const next: number[] = [];
    for (const side of frontier) {
      for (const p of sizes) {
        const s = round(side + p);
        const total = round(bar + 2 * s);
        if (total <= max && !totals.has(total)) {
          totals.add(total);
          next.push(s);
        }
      }
    }
    frontier = next;
  }
  return [...totals].sort((a, b) => a - b);
}

/** Every weight that exists for one way of loading, ascending. Empty for bodyweight and bands. */
export function loadable(load: Load, eq: Equipment): number[] {
  const sorted = (xs: number[]) => [...new Set(xs.map(round))].filter((x) => x > 0).sort((a, b) => a - b);
  if (load === "dumbbell") return sorted(eq.dumbbells);
  if (load === "barbell") return barTotals(eq.barbell, eq.plates);
  if (load === "ezbar") return barTotals(eq.ezbar, eq.plates, 80);
  if (load === "cable") return sorted(eq.cable);
  if (load.startsWith("machine:")) {
    const key = load.slice("machine:".length);
    return sorted(eq.machines[key]?.length ? eq.machines[key] : eq.machine);
  }
  return [];
}

export const isWeighted = (load: Load) => load !== "bodyweight" && load !== "band";

/** The closest weight that exists; ties go down. */
export function nearest(weight: number, steps: number[]): number | null {
  if (!steps.length) return null;
  let best = steps[0];
  for (const s of steps) if (Math.abs(s - weight) < Math.abs(best - weight) - 1e-9) best = s;
  return best;
}

/** The heaviest weight that exists at or under this one; the lightest if none is. */
export function roundDown(weight: number, steps: number[]): number | null {
  if (!steps.length) return null;
  const under = steps.filter((s) => s <= weight + 1e-9);
  return under.length ? under[under.length - 1] : steps[0];
}

export function stepUp(weight: number, steps: number[]): number | null {
  const up = steps.find((s) => s > weight + 1e-9);
  return up ?? (steps.length ? steps[steps.length - 1] : null);
}

export function stepDown(weight: number, steps: number[]): number | null {
  const down = steps.filter((s) => s < weight - 1e-9);
  return down.length ? down[down.length - 1] : steps.length ? steps[0] : null;
}

/** Up to `n` weights either side of this one, including it, for the tap-a-weight row. */
export function neighbours(weight: number, steps: number[], n = 3): number[] {
  const at = nearest(weight, steps);
  if (at === null) return [];
  const i = steps.indexOf(at);
  return steps.slice(Math.max(0, i - n), i + n + 1);
}

/** The next step up is more than `limit` heavier: progress reps further before jumping. */
export function stepTooBig(weight: number, steps: number[], limit = 0.1): boolean {
  const up = stepUp(weight, steps);
  if (up === null || up <= weight) return false;
  return (up - weight) / weight > limit + 1e-9;
}

/** What a weight means, said on every card. */
export function label(load: Load): string {
  if (load === "dumbbell") return "each hand";
  if (load === "barbell" || load === "ezbar") return "total with bar";
  if (load === "bodyweight") return "bodyweight";
  if (load === "band") return "band";
  return "on the stack";
}

/** "40", "42.5", "1.25". */
export const kg = (w: number) => String(round(w));

/** What she typed on the preferences page into equipment, keeping the defaults for anything blank. */
export function readEquipment(raw: unknown): Equipment {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const nums = (v: unknown, fallback: number[]) => {
    const list = Array.isArray(v)
      ? v
      : typeof v === "string"
        ? v.split(/[\s,;]+/)
        : [];
    const out = list.map(Number).filter((n) => Number.isFinite(n) && n > 0 && n < 500);
    return out.length ? [...new Set(out.map(round))].sort((a, b) => a - b) : fallback;
  };
  const one = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n < 100 ? round(n) : fallback;
  };
  const machines: Record<string, number[]> = {};
  if (r.machines && typeof r.machines === "object") {
    for (const [k, v] of Object.entries(r.machines as Record<string, unknown>)) {
      const list = nums(v, []);
      if (list.length && /^[a-z_]+$/.test(k)) machines[k] = list;
    }
  }
  return {
    dumbbells: nums(r.dumbbells, DEFAULT_EQUIPMENT.dumbbells),
    barbell: one(r.barbell, DEFAULT_EQUIPMENT.barbell),
    ezbar: one(r.ezbar, DEFAULT_EQUIPMENT.ezbar),
    plates: nums(r.plates, DEFAULT_EQUIPMENT.plates),
    cable: nums(r.cable, DEFAULT_EQUIPMENT.cable),
    machines,
    machine: nums(r.machine, DEFAULT_EQUIPMENT.machine),
    missing: Array.isArray(r.missing)
      ? [...new Set(r.missing.filter((x): x is string => typeof x === "string" && /^[a-z_:]+$/.test(x)))]
      : [],
  };
}
