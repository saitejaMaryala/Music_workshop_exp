// Server-side check of the morning sleep survey (v2).
// Keep the option lists in sync with app/morning-survey.ts.

const YES_NO_UNSURE = ["Yes", "No", "Not sure"];
const YES_NO = ["Yes", "No"];
const VOLUME = ["Too quiet", "Just right", "Too loud"];
const NONE_OF_THESE = "None of these";
const NIGHT_FACTORS = [
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
export const MAX_TEXT_CHARACTERS = 2000;

export type MorningSurvey = {
  bedTime: string;
  wakeTime: string;
  sleepLatencyMinutes: number;
  awakenings: number;
  totalSleepMinutes: number;
  sleepQuality: number;
  easeFallingAsleep: number;
  restedNow: number;
  alertNow: number;
  audioPlayedFully: string;
  asleepBeforeAudioEnded: string;
  heardBefore: string;
  likedMusic: number;
  volume: string;
  factors: string[];
  audioFeeling: string | null;
  otherNotes: string | null;
};

// Returns a clean copy of the answers, or an error message for the participant.
export function parseMorningSurvey(raw: unknown): { survey: MorningSurvey } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Please answer every question." };
  const r = raw as Record<string, unknown>;

  const time = (v: unknown) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  const whole = (v: unknown, max: number) => {
    const text = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
    return /^\d{1,3}$/.test(text) && Number(text) <= max ? Number(text) : null;
  };
  const scale = (v: unknown) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5 ? (v as number) : null);
  const oneOf = (v: unknown, options: string[]) => typeof v === "string" && options.includes(v);
  const optionalText = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  if (!time(r.bedTime) || !time(r.wakeTime)) return { error: "Enter the time you went to bed and woke up." };

  const latency = whole(r.sleepLatencyMinutes, 300);
  const awakenings = whole(r.awakenings, 50);
  const hours = whole(r.totalSleepHours, 24);
  const minutes = r.totalSleepMinutes === "" || r.totalSleepMinutes === undefined ? 0 : whole(r.totalSleepMinutes, 59);
  if (latency === null || awakenings === null || hours === null || minutes === null) {
    return { error: "Enter whole numbers for the questions about your night." };
  }

  const ratings = ["sleepQuality", "easeFallingAsleep", "restedNow", "alertNow", "likedMusic"].map((k) => scale(r[k]));
  if (ratings.some((v) => v === null)) return { error: "Choose a number from 1 to 5 for every rating." };
  const [sleepQuality, easeFallingAsleep, restedNow, alertNow, likedMusic] = ratings as number[];

  if (
    !oneOf(r.audioPlayedFully, YES_NO_UNSURE) ||
    !oneOf(r.asleepBeforeAudioEnded, YES_NO_UNSURE) ||
    !oneOf(r.heardBefore, YES_NO) ||
    !oneOf(r.volume, VOLUME)
  ) return { error: "Answer every question about the audio." };

  const factors = r.factors;
  if (
    !Array.isArray(factors) ||
    factors.length === 0 ||
    !factors.every((f) => oneOf(f, NIGHT_FACTORS)) ||
    (factors.includes(NONE_OF_THESE) && factors.length > 1)
  ) return { error: "Tick what could have affected your night, or “None of these”." };

  const audioFeeling = optionalText(r.audioFeeling);
  const otherNotes = optionalText(r.otherNotes);
  if (Array.from(audioFeeling).length > MAX_TEXT_CHARACTERS || Array.from(otherNotes).length > MAX_TEXT_CHARACTERS) {
    return { error: `Written answers must be ${MAX_TEXT_CHARACTERS} characters or fewer.` };
  }

  return {
    survey: {
      bedTime: r.bedTime as string,
      wakeTime: r.wakeTime as string,
      sleepLatencyMinutes: latency,
      awakenings,
      totalSleepMinutes: hours * 60 + minutes,
      sleepQuality,
      easeFallingAsleep,
      restedNow,
      alertNow,
      audioPlayedFully: r.audioPlayedFully as string,
      asleepBeforeAudioEnded: r.asleepBeforeAudioEnded as string,
      heardBefore: r.heardBefore as string,
      likedMusic,
      volume: r.volume as string,
      factors: [...new Set(factors as string[])],
      audioFeeling: audioFeeling || null,
      otherNotes: otherNotes || null,
    },
  };
}
