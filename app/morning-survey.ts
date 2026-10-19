// Morning sleep survey (v2), opened from the emailed link.
// Keep the option lists in sync with supabase/functions/survey-access/morning-survey.ts.

export const YES_NO_UNSURE = ["Yes", "No", "Not sure"];
export const YES_NO = ["Yes", "No"];
export const VOLUME = ["Too quiet", "Just right", "Too loud"];

export const NONE_OF_THESE = "None of these";
export const NIGHT_FACTORS = [
  "Coffee, tea or energy drink after 4 pm",
  "A daytime nap longer than 20 minutes",
  "Alcohol",
  "Felt unwell",
  "Felt unusually stressed",
  "Worked or studied late",
  "Used my phone or a screen in bed after the audio / after lights off",
  "Noise or disturbance (roommate, traffic, etc.)",
  NONE_OF_THESE,
];

export type MorningSurvey = {
  // Part 1 — numbers. Kept as text while typing; times are "HH:MM" (24-hour).
  bedTime: string;
  wakeTime: string;
  sleepLatencyMinutes: string;
  awakenings: string;
  totalSleepHours: string;
  totalSleepMinutes: string;
  // Part 2 — 1 to 5.
  sleepQuality: number | null;
  easeFallingAsleep: number | null;
  restedNow: number | null;
  alertNow: number | null;
  // Part 3 — the audio.
  audioPlayedFully: string;
  asleepBeforeAudioEnded: string;
  heardBefore: string;
  likedMusic: number | null;
  volume: string;
  // Part 4 — tick all that apply.
  factors: string[];
  // Part 5 — optional.
  audioFeeling: string;
  otherNotes: string;
};

export const initialMorningSurvey: MorningSurvey = {
  bedTime: "",
  wakeTime: "",
  sleepLatencyMinutes: "",
  awakenings: "",
  totalSleepHours: "",
  totalSleepMinutes: "",
  sleepQuality: null,
  easeFallingAsleep: null,
  restedNow: null,
  alertNow: null,
  audioPlayedFully: "",
  asleepBeforeAudioEnded: "",
  heardBefore: "",
  likedMusic: null,
  volume: "",
  factors: [],
  audioFeeling: "",
  otherNotes: "",
};

export const MAX_TEXT_CHARACTERS = 2000;

const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export const isWholeNumber = (v: string, max: number) => /^\d{1,3}$/.test(v.trim()) && Number(v) <= max;

export function isMorningSurveyComplete(s: MorningSurvey) {
  return (
    isTime(s.bedTime) &&
    isTime(s.wakeTime) &&
    isWholeNumber(s.sleepLatencyMinutes, 300) &&
    isWholeNumber(s.awakenings, 50) &&
    isWholeNumber(s.totalSleepHours, 24) &&
    (s.totalSleepMinutes === "" || isWholeNumber(s.totalSleepMinutes, 59)) &&
    s.sleepQuality !== null &&
    s.easeFallingAsleep !== null &&
    s.restedNow !== null &&
    s.alertNow !== null &&
    s.audioPlayedFully !== "" &&
    s.asleepBeforeAudioEnded !== "" &&
    s.heardBefore !== "" &&
    s.likedMusic !== null &&
    s.volume !== "" &&
    s.factors.length > 0 &&
    Array.from(s.audioFeeling).length <= MAX_TEXT_CHARACTERS &&
    Array.from(s.otherNotes).length <= MAX_TEXT_CHARACTERS
  );
}

// "None of these" cannot be ticked together with anything else.
export function toggleFactor(current: string[], factor: string) {
  if (current.includes(factor)) return current.filter((f) => f !== factor);
  if (factor === NONE_OF_THESE) return [NONE_OF_THESE];
  return [...current.filter((f) => f !== NONE_OF_THESE), factor];
}
