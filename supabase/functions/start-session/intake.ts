// Server-side check of the intake questionnaire.
// Keep the option lists in sync with app/intake.ts.

const AGE_GROUPS = ["Under 18", "18 – 22", "23 – 28", "29 – 40", "Above 40"];
const CURRENT_YEARS = ["UG1", "UG2", "UG3", "UG4", "UG5+", "PG", "PhD", "Other"];
const MUSIC_TRAINING = ["No formal training", "Beginner (1–3 years)", "Intermediate (3–7 years)", "Advanced (7+ years)"];
const SLEEP_QUALITY = ["1", "2", "3", "4", "5"];
const SLEEP_LISTENING = [
  "Never",
  "Rarely (once a week or less)",
  "Sometimes (a few nights a week)",
  "Often (most nights)",
  "Always (every night)",
];
const GENRES = [
  "Indian Classical Music (Hindustani / Carnatic)",
  "Indian Film Music (Bollywood / Tollywood etc.)",
  "Western Classical Music",
  "Western Pop / Rock / EDM",
  "Lo-fi / Ambient / Instrumental",
  "Jazz / Blues",
  "I prefer silence",
  "Other",
];
const CLASSICAL_FAMILIARITY = [
  "Not familiar at all",
  "I've heard it, but don't know much",
  "Somewhat familiar",
  "Quite familiar",
  "Very familiar (I study or practice it)",
];
const MUSIC_HELPS_SLEEP = ["Yes, definitely helps", "Somewhat helps", "No difference", "Somewhat disturbs", "Definitely disturbs sleep"];
const RANK_STYLES = [
  "Indian Classical Music",
  "Indian Film Music",
  "Western Music (Pop / Rock / Classical)",
  "Lo-fi / Ambient / Instrumental",
  "Silence",
];
const RAAGA_EFFECT = ["Yes, strongly", "Somewhat", "Not sure", "No, not really"];

export type Intake = {
  ageGroup: string;
  branch: string;
  currentYear: string;
  musicTraining: string;
  usualBedTime: string;
  sleepLatencyMinutes: number;
  sleepQuality: number;
  sleepListening: string;
  sleepGenres: string[];
  classicalFamiliarity: string;
  musicHelpsSleep: string;
  sleepRanking: Record<string, number>;
  raagaEffect: string;
  lyricsDisturbSleep: number;
};

// Returns a clean copy of the answers, or null if anything is missing or invalid.
export function parseIntake(raw: unknown): Intake | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const oneOf = (v: unknown, options: string[]) => typeof v === "string" && options.includes(v);

  const branch = typeof r.branch === "string" ? r.branch.trim() : "";
  if (!branch || branch.length > 100) return null;

  if (
    !oneOf(r.ageGroup, AGE_GROUPS) ||
    !oneOf(r.currentYear, CURRENT_YEARS) ||
    !oneOf(r.musicTraining, MUSIC_TRAINING) ||
    !oneOf(r.sleepQuality, SLEEP_QUALITY) ||
    !oneOf(r.sleepListening, SLEEP_LISTENING) ||
    !oneOf(r.classicalFamiliarity, CLASSICAL_FAMILIARITY) ||
    !oneOf(r.musicHelpsSleep, MUSIC_HELPS_SLEEP) ||
    !oneOf(r.raagaEffect, RAAGA_EFFECT)
  ) return null;

  // Usual time of going to sleep: "HH:MM", 24-hour.
  if (typeof r.usualBedTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.usualBedTime)) return null;

  // Minutes to fall asleep: whole number 0–300.
  const latencyText = typeof r.sleepLatencyMinutes === "string" ? r.sleepLatencyMinutes.trim() : "";
  if (!/^\d{1,3}$/.test(latencyText) || Number(latencyText) > 300) return null;

  const genres = r.sleepGenres;
  if (!Array.isArray(genres) || genres.length === 0 || !genres.every((g) => oneOf(g, GENRES))) return null;

  // Every style needs a distinct rank from 1 to RANK_STYLES.length.
  const ranking = r.sleepRanking as Record<string, unknown> | null;
  if (!ranking || typeof ranking !== "object") return null;
  const ranks = RANK_STYLES.map((s) => ranking[s]);
  const expected = RANK_STYLES.map((_, i) => i + 1);
  if (!ranks.every((n) => Number.isInteger(n)) || [...ranks as number[]].sort().join() !== expected.join()) return null;

  const lyrics = r.lyricsDisturbSleep;
  if (!Number.isInteger(lyrics) || (lyrics as number) < 1 || (lyrics as number) > 7) return null;

  return {
    ageGroup: r.ageGroup as string,
    branch,
    currentYear: r.currentYear as string,
    musicTraining: r.musicTraining as string,
    usualBedTime: r.usualBedTime,
    sleepLatencyMinutes: Number(latencyText),
    sleepQuality: Number(r.sleepQuality),
    sleepListening: r.sleepListening as string,
    sleepGenres: [...new Set(genres as string[])],
    classicalFamiliarity: r.classicalFamiliarity as string,
    musicHelpsSleep: r.musicHelpsSleep as string,
    sleepRanking: Object.fromEntries(RANK_STYLES.map((s) => [s, ranking[s] as number])),
    raagaEffect: r.raagaEffect as string,
    lyricsDisturbSleep: lyrics as number,
  };
}
