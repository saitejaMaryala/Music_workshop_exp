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

// Question text exactly as shown on the details page (app/study-app.tsx). Used as JSON keys.
export const INTAKE_QUESTIONS = {
  ageGroup: "Age group",
  branch: "Branch",
  currentYear: "Current year",
  musicTraining: "Do you have formal training in music?",
  usualBedTime: "What time do you usually go to sleep?",
  sleepLatencyMinutes: "On a usual night, how many minutes does it take you to fall asleep?",
  sleepQuality: "How would you rate your sleep over the last month? (1 = very bad, 5 = very good)",
  sleepListening: "How often do you listen to music before sleep or while falling asleep?",
  sleepGenres: "Which genre(s) do you typically listen to before or while sleeping?",
  classicalFamiliarity: "How familiar are you with Indian classical music (Raagas / Taalas)?",
  musicHelpsSleep: "Overall, do you believe music helps you fall asleep or sleep better?",
  sleepRanking: "Rank these music styles from MOST to LEAST helpful for YOUR sleep (1 = most helpful)",
  raagaEffect:
    "Do you think Indian classical Raagas and Taalas have a distinct effect on relaxation or sleep compared to other music?",
  lyricsDisturbSleep: "In general, how much do you believe lyrics (words in a song) disturb sleep? (1 = not at all, 7 = extremely)",
} as const satisfies Record<keyof Intake, string>;

// participants column -> the questions stored in it, in page order.
const INTAKE_SECTIONS = {
  about_you: ["ageGroup", "branch", "currentYear", "musicTraining"],
  your_sleep: ["usualBedTime", "sleepLatencyMinutes", "sleepQuality"],
  listening_habits: ["sleepListening", "sleepGenres", "classicalFamiliarity"],
  beliefs_about_music_and_sleep: ["musicHelpsSleep", "sleepRanking", "raagaEffect", "lyricsDisturbSleep"],
} as const satisfies Record<string, readonly (keyof Intake)[]>;

export type IntakeSections = Record<keyof typeof INTAKE_SECTIONS, Record<string, unknown>>;

// One JSON object per section: { "<question text>": <answer>, ... }.
export function intakeSections(intake: Intake): IntakeSections {
  return Object.fromEntries(
    Object.entries(INTAKE_SECTIONS).map(([column, keys]) => [
      column,
      Object.fromEntries(keys.map((k) => [INTAKE_QUESTIONS[k], intake[k]])),
    ]),
  ) as IntakeSections;
}
