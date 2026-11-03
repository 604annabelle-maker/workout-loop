/**
 * Preferences to try things out with before any are saved: the person this
 * app is for, roughly, so a dry run looks like a real one.
 */

import type { Preferences } from "../lib/profile.ts";

export const SAMPLE: Preferences = {
  goals: "Build lean muscle, get strong, stay healthy and athletic for life.",
  experience: "About a year of lifting, comfortable with dumbbells and machines, newer to barbells.",
  level: "intermediate",
  trainingDaysPerWeek: 4,
  priorities: ["biceps", "triceps"],
  avoid: "",
  equipment: "Commercial gym: barbells, rack, dumbbells to 30kg, cables, machines, kettlebells, bike, rower, plyo boxes, med balls.",
  enjoys: "Arms, heavy lifting, variety in the extras.",
  cycleTracking: false,
  jumpDays: 1,
  brief: "Two muscle groups a day, clear and not wordy.",
};
