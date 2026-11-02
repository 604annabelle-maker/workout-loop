/**
 * Preferences to try things out with before any are saved: the person this
 * app is for, roughly, so a dry run looks like a real one.
 */

import type { Preferences } from "../lib/profile.ts";

export const SAMPLE: Preferences = {
  goals: "Build lean muscle, get strong, stay healthy and athletic for life.",
  experience: "About a year of lifting, comfortable with dumbbells and machines, newer to barbells.",
  level: "intermediate",
  trainingDaysPerWeek: 3,
  priorities: ["glutes", "back"],
  avoid: "",
  equipment: "Commercial gym: barbells, rack, dumbbells to 30kg, cables, machines, kettlebells, bike, rower, plyo boxes, med balls.",
  enjoys: "Kettlebells, med ball throws, anything that feels athletic.",
  cycleTracking: false,
  weeklyReview: true,
  brief: "I want it to feel fun and athletic, not like a chore.",
};
