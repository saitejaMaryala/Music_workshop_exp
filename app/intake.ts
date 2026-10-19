// Intake questionnaire shown on the "details" screen.
// Adapted from the Raaga & Taala study intake form, reworded for music and sleep.
// Keep the option lists in sync with supabase/functions/start-session/intake.ts.

export const AGE_GROUPS = ["Under 18", "18 – 22", "23 – 28", "29 – 40", "Above 40"];

export const CURRENT_YEARS = ["UG1", "UG2", "UG3", "UG4", "UG5+", "PG", "PhD", "Other"];

export const MUSIC_TRAINING = [
  "No formal training",
  "Beginner (1–3 years)",
  "Intermediate (3–7 years)",
  "Advanced (7+ years)",
];

export const SLEEP_QUALITY = ["1", "2", "3", "4", "5"]; // 1 = very bad, 5 = very good

export const SLEEP_LISTENING = [
  "Never",
  "Rarely (once a week or less)",
  "Sometimes (a few nights a week)",
  "Often (most nights)",
  "Always (every night)",
];

export const GENRES = [
  "Indian Classical Music (Hindustani / Carnatic)",
  "Indian Film Music (Bollywood / Tollywood etc.)",
  "Western Classical Music",
  "Western Pop / Rock / EDM",
  "Lo-fi / Ambient / Instrumental",
  "Jazz / Blues",
  "I prefer silence",
  "Other",
];

export const CLASSICAL_FAMILIARITY = [
  "Not familiar at all",
  "I've heard it, but don't know much",
  "Somewhat familiar",
  "Quite familiar",
  "Very familiar (I study or practice it)",
];

export const MUSIC_HELPS_SLEEP = [
  "Yes, definitely helps",
  "Somewhat helps",
  "No difference",
  "Somewhat disturbs",
  "Definitely disturbs sleep",
];

export const RANK_STYLES = [
  "Indian Classical Music",
  "Indian Film Music",
  "Western Music (Pop / Rock / Classical)",
  "Lo-fi / Ambient / Instrumental",
  "Silence",
];

export const RAAGA_EFFECT = ["Yes, strongly", "Somewhat", "Not sure", "No, not really"];

export type Intake = {
  ageGroup: string;
  branch: string;
  currentYear: string;
  musicTraining: string;
  sleepLatencyMinutes: string; // minutes to fall asleep on a usual night, whole number 0–300
  sleepQuality: string; // last month, 1 (very bad) – 5 (very good)
  sleepListening: string;
  sleepGenres: string[];
  classicalFamiliarity: string;
  musicHelpsSleep: string;
  // Style name -> rank (1 = most helpful for sleep, 5 = least).
  sleepRanking: Record<string, number>;
  raagaEffect: string;
  lyricsDisturbSleep: number; // 1 (not at all) – 7 (extremely)
};

export const initialIntake: Intake = {
  ageGroup: "",
  branch: "",
  currentYear: "",
  musicTraining: "",
  sleepLatencyMinutes: "",
  sleepQuality: "",
  sleepListening: "",
  sleepGenres: [],
  classicalFamiliarity: "",
  musicHelpsSleep: "",
  sleepRanking: {},
  raagaEffect: "",
  lyricsDisturbSleep: 4,
};

export function isValidSleepLatency(value: string | undefined) {
  const text = (value ?? "").trim();
  return /^\d{1,3}$/.test(text) && Number(text) <= 300;
}

export function isIntakeComplete(i: Intake) {
  return (
    i.ageGroup !== "" &&
    i.branch.trim() !== "" &&
    i.currentYear !== "" &&
    i.musicTraining !== "" &&
    isValidSleepLatency(i.sleepLatencyMinutes) &&
    !!i.sleepQuality &&
    i.sleepListening !== "" &&
    i.sleepGenres.length > 0 &&
    i.classicalFamiliarity !== "" &&
    i.musicHelpsSleep !== "" &&
    RANK_STYLES.every((s) => i.sleepRanking[s]) &&
    i.raagaEffect !== ""
  );
}
