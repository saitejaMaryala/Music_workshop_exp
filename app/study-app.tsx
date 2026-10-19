"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  AGE_GROUPS,
  CLASSICAL_FAMILIARITY,
  CURRENT_YEARS,
  GENRES,
  Intake,
  MUSIC_HELPS_SLEEP,
  MUSIC_TRAINING,
  RAAGA_EFFECT,
  RANK_STYLES,
  SLEEP_LISTENING,
  initialIntake,
  isIntakeComplete,
  isValidSleepLatency,
} from "./intake";
import {
  MAX_TEXT_CHARACTERS,
  MorningSurvey,
  NIGHT_FACTORS,
  VOLUME,
  YES_NO,
  YES_NO_UNSURE,
  initialMorningSurvey,
  isMorningSurveyComplete,
  toggleFactor,
} from "./morning-survey";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Screen =
  | "loading"       // checking localStorage for a returning device token
  | "welcome"       // study intro + consent
  | "details"       // registration form
  | "listen"        // audio player
  | "waiting"       // post-qualification, pre-email
  | "survey"        // reflection form (after magic link or device return)
  | "complete"      // survey submitted
  | "science"       // optional debrief
  | "already_registered"; // duplicate participant path

type ParticipantState = {
  deviceToken: string;
  conditionId: string;
  durationSeconds: number;
};


// ---------------------------------------------------------------------------
// Config — audio files must be uploaded to Supabase Storage.
// Set NEXT_PUBLIC_AUDIO_BASE_URL to the public or signed-URL base path.
// Expected object names: condition-a.mp3 and condition-b.mp3
// ---------------------------------------------------------------------------
const AUDIO_BASE_URL = process.env.NEXT_PUBLIC_AUDIO_BASE_URL ?? "";

// Condition metadata — filenames and loop fractions.
const CONDITION_METADATA: Record<string, { filename: string; loopStartFraction: number }> = {
  "condition-a": { filename: "wholetones.mpeg", loopStartFraction: 27 / 46 },
  "condition-b": { filename: "Nilambari.mpeg", loopStartFraction: 31 / 52 },
};

// Fraction of the track a participant must hear before the loop phase starts.
// Defaults to 0.9; set NEXT_PUBLIC_LISTEN_THRESHOLD (e.g. 0.05) only for local testing.
// Must match the LISTEN_THRESHOLD secret of the qualify-session Edge Function.
const LISTEN_THRESHOLD = Number(process.env.NEXT_PUBLIC_LISTEN_THRESHOLD) || 0.9;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function apiUrl(fn: string) {
  return `${SUPABASE_URL}/functions/v1/${fn}`;
}

function apiHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Stop and release an audio element WITHOUT triggering a fake "error" event.
// Setting `audio.src = ""` makes browsers fire an error event (code 4, "Empty src
// attribute"), which looks like a load failure. Removing the attribute and calling
// load() resets the element quietly.
function releaseAudio(audio: HTMLAudioElement | null) {
  if (!audio) return;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}

// Plain-English hint for each browser media error code.
function describeAudioError(code: number | undefined) {
  switch (code) {
    case 1: return "loading was stopped";
    case 2: return "network problem while downloading";
    case 3: return "the file could not be decoded (damaged or unsupported audio)";
    case 4: return "the file was not found, is not public, or is not a format browsers can play (use .mp3)";
    default: return "unknown problem";
  }
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const DEVICE_TOKEN_KEY = "rn_device_token";

function saveDeviceToken(token: string) {
  try { localStorage.setItem(DEVICE_TOKEN_KEY, token); } catch { /* ignore */ }
}
function loadDeviceToken(): string | null {
  try { return localStorage.getItem(DEVICE_TOKEN_KEY); } catch { return null; }
}
function clearDeviceToken() {
  try { localStorage.removeItem(DEVICE_TOKEN_KEY); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Scale question sub-component
// ---------------------------------------------------------------------------

// 1–5 scale with words under the two ends.
function ScaleQuestion({
  label,
  left,
  right,
  value,
  onChange,
}: {
  label: string;
  left: string;
  right: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <fieldset className="intake-question">
      <legend>{label}</legend>
      <div className="sleep-quality">
        <div className="rank-buttons" role="radiogroup" aria-label={label}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              aria-checked={value === n}
              className={value === n ? "rating selected" : "rating"}
              key={n}
              onClick={() => onChange(n)}
              role="radio"
              type="button"
            >
              {n}
            </button>
          ))}
        </div>
        <div className="rating-labels" aria-hidden="true">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Intake question sub-components
// ---------------------------------------------------------------------------

// Pill-button question. Pass `multiple` for select-all-that-apply.
function ChoiceQuestion({
  label,
  hint,
  options,
  selected,
  onToggle,
  multiple = false,
}: {
  label: string;
  hint?: string;
  options: string[];
  selected: string[];
  onToggle: (option: string) => void;
  multiple?: boolean;
}) {
  return (
    <fieldset className="intake-question">
      <legend>{label}</legend>
      {hint && <p className="intake-hint">{hint}</p>}
      <div className="choice-row" role={multiple ? "group" : "radiogroup"} aria-label={label}>
        {options.map((option) => {
          const isSelected = selected.includes(option);
          return (
            <button
              aria-checked={isSelected}
              className={isSelected ? "choice selected" : "choice"}
              key={option}
              onClick={() => onToggle(option)}
              role={multiple ? "checkbox" : "radio"}
              type="button"
            >
              {option}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

// Assign ranks 1–5 to each style without repeats. Picking a rank another style
// already holds takes it from that style.
function RankQuestion({
  label,
  hint,
  items,
  ranking,
  onChange,
}: {
  label: string;
  hint: string;
  items: string[];
  ranking: Record<string, number>;
  onChange: (ranking: Record<string, number>) => void;
}) {
  function pick(item: string, rank: number) {
    const next: Record<string, number> = {};
    for (const [k, v] of Object.entries(ranking)) if (v !== rank && k !== item) next[k] = v;
    next[item] = rank;
    onChange(next);
  }
  return (
    <fieldset className="intake-question">
      <legend>{label}</legend>
      <p className="intake-hint">{hint}</p>
      <div className="rank-list">
        {items.map((item) => (
          <div className="rank-row" key={item}>
            <span>{item}</span>
            <div className="rank-buttons" role="radiogroup" aria-label={`Rank for ${item}`}>
              {items.map((_, idx) => {
                const rank = idx + 1;
                const isSelected = ranking[item] === rank;
                return (
                  <button
                    aria-checked={isSelected}
                    className={isSelected ? "rating selected" : "rating"}
                    key={rank}
                    onClick={() => pick(item, rank)}
                    role="radio"
                    type="button"
                  >
                    {rank}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StudyApp() {
  const [screen, setScreen] = useState<Screen>("loading");

  // Registration fields
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [workshop, setWorkshop] = useState<"yes" | "no" | "">("");
  const [consented, setConsented] = useState(false);
  const [intake, setIntake] = useState<Intake>(initialIntake);
  const updateIntake = (patch: Partial<Intake>) => setIntake((prev) => ({ ...prev, ...patch }));

  // Session state
  const [participant, setParticipant] = useState<ParticipantState | null>(null);

  // Player state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const maxListenedSecondsRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isLooping, setIsLooping] = useState(false);
  const [loopCount, setLoopCount] = useState(0);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Survey state
  const [survey, setSurvey] = useState<MorningSurvey>(initialMorningSurvey);
  const updateSurvey = (patch: Partial<MorningSurvey>) => setSurvey((prev) => ({ ...prev, ...patch }));
  const [surveyAccessToken, setSurveyAccessToken] = useState<string | null>(null);
  const [surveyParticipantId, setSurveyParticipantId] = useState<string | null>(null);

  // UI state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Test-only skip button. Shown only in a build with NEXT_PUBLIC_ENABLE_TEST_MODE=1 and ?test=1.
  const [isTestMode, setIsTestMode] = useState(false);

  // Survey release time (qualified_at + SURVEY_DELAY_SECONDS) and the "Resend email" button
  const [releaseAt, setReleaseAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [resendBusy, setResendBusy] = useState(false);
  const [resendNotice, setResendNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (process.env.NEXT_PUBLIC_ENABLE_TEST_MODE === "1" && searchParams.get("test") === "1") {
      setIsTestMode(true);
    }
  }, []);

  const allRatingsComplete = isMorningSurveyComplete(survey);

  const conditionMeta = participant ? CONDITION_METADATA[participant.conditionId] : null;
  const duration = participant?.durationSeconds ?? 0;
  const requiredPoint = Math.ceil(duration * LISTEN_THRESHOLD);
  const loopStartSeconds = conditionMeta ? Math.floor(duration * conditionMeta.loopStartFraction) : 0;
  const listenPercent = duration > 0 ? Math.min((elapsed / duration) * 100, 100) : 0;
  // The track has played to the end at least once and started again.
  const hasRepeated = loopCount > 0;

  // -------------------------------------------------------------------------
  // On mount: check for magic-link token in URL hash, then check localStorage.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");

    if (accessToken) {
      // Remove token from URL without reloading.
      history.replaceState(null, "", window.location.pathname);
      setSurveyAccessToken(accessToken);
      checkSurveyAccess(accessToken);
      return;
    }

    // Check device token for a returning participant.
    const storedToken = loadDeviceToken();
    if (storedToken && SUPABASE_URL && SUPABASE_ANON_KEY) {
      fetch(apiUrl("study-status"), {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ deviceToken: storedToken }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.state) {
            const p: ParticipantState = {
              deviceToken: storedToken,
              conditionId: data.conditionId ?? "",
              durationSeconds: data.durationSeconds ?? 0,
            };
            setParticipant(p);
            if (typeof data.releaseAt === "string") setReleaseAt(data.releaseAt);
            if (data.state === "listening") {
              setScreen("listen");
            } else if (data.state === "waiting") {
              setScreen("waiting");
            } else if (data.state === "ready_needs_login") {
              // Show waiting with a note that the email was sent.
              setScreen("waiting");
            } else {
              // complete or unknown — clear token and show welcome.
              clearDeviceToken();
              setScreen("welcome");
            }
          } else {
            clearDeviceToken();
            setScreen("welcome");
          }
        })
        .catch(() => setScreen("welcome"));
    } else {
      setScreen("welcome");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Survey access check (magic link path)
  // -------------------------------------------------------------------------
  async function checkSurveyAccess(token: string) {
    try {
      const r = await fetch(apiUrl("survey-access"), {
        method: "POST",
        headers: apiHeaders(token),
        body: JSON.stringify({ action: "check" }),
      });
      const data = await r.json();
      if (data.submitted) { setScreen("complete"); return; }
      if (data.available) {
        setSurveyParticipantId(data.participantId ?? null);
        setScreen("survey");
      } else {
        setError(data.error ?? "Your reflection is not available yet.");
        setScreen("waiting");
      }
    } catch {
      setError("Could not check survey availability. Please try again.");
      setScreen("welcome");
    }
  }

  // -------------------------------------------------------------------------
  // Audio element setup — called when entering the listen screen.
  // -------------------------------------------------------------------------
  function setupAudio(conditionId: string, durationSec: number) {
    if (!AUDIO_BASE_URL) {
      setAudioError(
        "Audio is not configured. Set NEXT_PUBLIC_AUDIO_BASE_URL and upload condition-a.mp3 / condition-b.mp3 to Supabase Storage."
      );
      return;
    }

    releaseAudio(audioRef.current);

    maxListenedSecondsRef.current = 0;
    const filename = CONDITION_METADATA[conditionId]?.filename ?? `${conditionId}.mpeg`;
    const audio = new Audio();
    audio.src = `${AUDIO_BASE_URL}/${filename}`;
    audio.preload = "auto";
    audioRef.current = audio;

    const loopStart = Math.floor(durationSec * (CONDITION_METADATA[conditionId]?.loopStartFraction ?? 0.6));

    audio.addEventListener("timeupdate", () => {
      const current = Math.floor(audio.currentTime);
      if (current > maxListenedSecondsRef.current) {
        maxListenedSecondsRef.current = current;
      }
      setElapsed(maxListenedSecondsRef.current);

      // Transition to loop phase UI at the listening threshold (90% by default).
      if (maxListenedSecondsRef.current >= Math.ceil(durationSec * LISTEN_THRESHOLD)) {
        setIsLooping(true);
      }
    });

    audio.addEventListener("play", () => setIsPlaying(true));
    audio.addEventListener("pause", () => setIsPlaying(false));

    // On ended: jump to loopStart and continue playing (without audio.loop)
    audio.addEventListener("ended", () => {
      setLoopCount((c) => c + 1);
      audio.currentTime = loopStart;
      audio.play().catch(() => {});
    });

    audio.addEventListener("error", () => {
      // Ignore errors from an element we already released (no src attribute left).
      if (!audio.getAttribute("src")) return;
      const code = audio.error?.code;
      console.warn(`Audio load error: code ${code ?? "?"} (${describeAudioError(code)}) ${audio.error?.message ?? ""}`);
      setAudioError(
        `Could not load audio file (${filename}): ${describeAudioError(code)}. URL: ${AUDIO_BASE_URL}/${filename}`
      );
    });
  }

  // Cleanup audio on unmount.
  useEffect(() => {
    return () => {
      releaseAudio(audioRef.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Participant start
  // -------------------------------------------------------------------------
  // Welcome page: stop early if this roll number has already taken part.
  async function checkRollNumber() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setError("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    if (!/^[A-Za-z0-9/_-]{3,40}$/.test(rollNumber.trim())) {
      setError("Enter a valid roll number.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_roll_number_registered`, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ p_roll_number: rollNumber.trim() }),
      });
      if (!r.ok) {
        setError("Could not check your roll number. Please try again.");
        return;
      }
      if ((await r.json()) === true) {
        setResendNotice(null);
        setScreen("already_registered");
        return;
      }
      setScreen("details");
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setBusy(false);
    }
  }

  async function beginStudy() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setError("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(apiUrl("start-session"), {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ displayName, email, rollNumber, workshop, intake }),
      });
      const data = await r.json();
      if (!r.ok) {
        if (r.status === 409) {
          setResendNotice(null);
          setScreen("already_registered");
          return;
        }
        setError(data.error ?? "Could not start session.");
        return;
      }
      const p: ParticipantState = {
        deviceToken: data.deviceToken,
        conditionId: data.conditionId,
        durationSeconds: data.durationSeconds,
      };
      setParticipant(p);
      saveDeviceToken(data.deviceToken);
      setupAudio(data.conditionId, data.durationSeconds);
      setElapsed(0);
      setLoopCount(0);
      setIsLooping(false);
      setScreen("listen");
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setBusy(false);
    }
  }

  function startPlayback() {
    if (!audioRef.current) {
      if (participant) setupAudio(participant.conditionId, participant.durationSeconds);
      return;
    }
    audioRef.current.play().catch(() => {
      setAudioError("Could not start playback. Please tap the button again.");
    });
  }

  // -------------------------------------------------------------------------
  // Qualification ("I'm sleepy")
  // -------------------------------------------------------------------------
  async function stopListening() {
    setBusy(true);
    setError(null);

    const listenedSeconds = maxListenedSecondsRef.current;

    try {
      if (SUPABASE_URL && SUPABASE_ANON_KEY && participant) {
        const r = await fetch(apiUrl("qualify-session"), {
          method: "POST",
          headers: apiHeaders(),
          body: JSON.stringify({
            deviceToken: participant.deviceToken,
            listenedSeconds,
            loopCount, // Only real repeats. The audio never repeated if this is 0.
          }),
        });
        const data = await r.json();
        if (!r.ok) {
          setError(data.error ?? "Could not qualify session.");
          setBusy(false);
          return;
        }
        if (typeof data.releaseAt === "string") setReleaseAt(data.releaseAt);
      }

      // Only pause and clear audio AFTER qualify-session fetch succeeds
      releaseAudio(audioRef.current);
      setIsPlaying(false);
      setScreen("waiting");
    } catch {
      setError("Network error during qualification. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // Tick once a second on the waiting screen so the Resend button appears when the wait is over.
  useEffect(() => {
    if (screen !== "waiting" || !releaseAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [screen, releaseAt]);

  // -------------------------------------------------------------------------
  // Resend the survey email.
  // "device": waiting screen, identified by the device token.
  // "details": already-registered screen, identified by the email / roll number typed.
  // The server always sends to the email saved at registration, and only after the wait time.
  // -------------------------------------------------------------------------
  async function resendInvitation(mode: "device" | "details") {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setResendNotice({ kind: "error", text: "Supabase is not configured." });
      return;
    }
    setResendBusy(true);
    setResendNotice(null);
    try {
      const payload =
        mode === "device" && participant
          ? { deviceToken: participant.deviceToken }
          : { email, rollNumber };
      const r = await fetch(apiUrl("resend-invitation"), {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));
      switch (data.status) {
        case "sent":
          setResendNotice({
            kind: "info",
            text: "A fresh link is on its way. It can take a minute, and it may land in spam or junk. Please use the newest email only.",
          });
          break;
        case "submitted":
          setResendNotice({ kind: "info", text: "Your reflection is already complete. Thank you!" });
          break;
        case "too_early": {
          const when = data.availableAt
            ? new Date(data.availableAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
            : "the release time";
          setResendNotice({ kind: "info", text: `Your reflection email is not due yet. It will be sent after ${when}.` });
          break;
        }
        case "pending":
          setResendNotice({
            kind: "info",
            text: "Your reflection email is being sent right now. Please check your inbox (and spam) and try again in a minute or two if it has not arrived.",
          });
          break;
        case "not_ready":
          setResendNotice({
            kind: "info",
            text: "No reflection email is due yet. It is sent after you finish listening and the release time has passed. If you have not finished listening, return on the device you started with.",
          });
          break;
        case "too_soon": {
          const mins = Math.max(1, Math.ceil((data.retryAfterSeconds ?? 300) / 60));
          setResendNotice({
            kind: "info",
            text: `We sent one a moment ago. Please wait about ${mins} minute${mins === 1 ? "" : "s"} before asking again.`,
          });
          break;
        }
        case "limit":
          setResendNotice({ kind: "error", text: "You have reached the resend limit. Please contact the study team." });
          break;
        default:
          setResendNotice({ kind: "error", text: data.error ?? "Could not resend the email. Please try again in a moment." });
      }
    } catch {
      setResendNotice({ kind: "error", text: "Network error. Please check your connection." });
    } finally {
      setResendBusy(false);
    }
  }

  // -------------------------------------------------------------------------
  // Survey submission
  // -------------------------------------------------------------------------
  async function submitSurvey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allRatingsComplete) return;
    setBusy(true);
    setError(null);

    try {
      const token = surveyAccessToken;
      if (!token) {
        // Device-return path: no access token; show message to use email link.
        setError("Please use the survey link from your email to submit your reflection.");
        setBusy(false);
        return;
      }

      const r = await fetch(apiUrl("survey-access"), {
        method: "POST",
        headers: apiHeaders(token),
        body: JSON.stringify({
          action: "submit",
          answers: survey,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "Could not submit the survey.");
        return;
      }
      clearDeviceToken();
      setScreen("complete");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const canBegin =
    !busy &&
    consented &&
    email !== "" &&
    displayName !== "" &&
    workshop !== "" &&
    rollNumber.trim() !== "" &&
    isIntakeComplete(intake);

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="wordmark" href="#top" onClick={(e) => e.preventDefault()}>
          <span className="wordmark-mark" aria-hidden="true">∿</span>
          resting notes
        </a>
        <span className="study-label">Listening study · 01</span>
      </header>

      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      {/* Loading */}
      {screen === "loading" && (
        <section className="complete screen">
          <p className="eyebrow">One moment…</p>
        </section>
      )}

      {/* Welcome / registration */}
      {screen === "welcome" && (
        <section className="welcome screen" id="top">
          <p className="eyebrow">A quiet listening study</p>
          <h1>Take a moment to listen.</h1>
          <p className="intro">
            Begin a short listening session this evening. Your reflection will be available the following morning.
          </p>
          <div className="details-card">
            <div><span>01</span><p>Choose a calm place and use headphones if available.</p></div>
            <div><span>02</span><p>Listen until the audio begins repeating, then stop whenever you feel ready.</p></div>
            <div><span>03</span><p>When the audio repeats, tell us if you feel sleepy.</p></div>
          </div>
          <label className="consent">
            <input
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              type="checkbox"
            />
            <span>I understand that I may stop and leave the study at any time.</span>
          </label>
          <div className="details-form">
            <label className="roll-field">
              Roll number{" "}
              <input
                inputMode="numeric"
                onChange={(e) => setRollNumber(e.target.value)}
                placeholder="e.g. 2023101076"
                required
                value={rollNumber}
              />
            </label>
          </div>
          {error && <p className="error-message" role="alert">{error}</p>}
          <button
            className="button primary"
            disabled={!consented || rollNumber.trim() === "" || busy}
            onClick={checkRollNumber}
            type="button"
          >
            {busy ? "Checking…" : <>Fill details <span aria-hidden="true">→</span></>}
          </button>
          {(!SUPABASE_URL || !SUPABASE_ANON_KEY) && (
            <p className="microcopy config-warning">
              ⚠ Supabase is not configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
            </p>
          )}
        </section>
      )}

      {/* Registration details */}
      {screen === "details" && (
        <section className="welcome screen" id="top">
          <button className="back" onClick={() => setScreen("welcome")} type="button">← Back</button>
          <p className="eyebrow">Before you begin</p>
          <h1>Tell us a little about you.</h1>
          <div className="details-form">
            <label>
              Full name{" "}
              <input
                autoComplete="name"
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your full name"
                required
                value={displayName}
              />
            </label>
            <label className="roll-field">
              College email ID
              <input
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@<designation>.iiit.ac.in"
                required
                type="email"
                value={email}
              />
            </label>
            <fieldset className="workshop-choice">
              <legend>Are you from a music workshop?</legend>
              <div>
                <button
                  aria-pressed={workshop === "yes"}
                  className={workshop === "yes" ? "choice selected" : "choice"}
                  onClick={() => setWorkshop("yes")}
                  type="button"
                >
                  Yes
                </button>
                <button
                  aria-pressed={workshop === "no"}
                  className={workshop === "no" ? "choice selected" : "choice"}
                  onClick={() => setWorkshop("no")}
                  type="button"
                >
                  No
                </button>
              </div>
            </fieldset>
          </div>

          <section className="intake-section">
            <h2>A · About you</h2>
            <ChoiceQuestion
              label="Age group"
              options={AGE_GROUPS}
              selected={[intake.ageGroup]}
              onToggle={(v) => updateIntake({ ageGroup: v })}
            />
            <label className="intake-question intake-text">
              Branch
              <input
                onChange={(e) => updateIntake({ branch: e.target.value })}
                placeholder="e.g. CSE, ECE"
                value={intake.branch}
              />
            </label>
            <ChoiceQuestion
              label="Current year"
              options={CURRENT_YEARS}
              selected={[intake.currentYear]}
              onToggle={(v) => updateIntake({ currentYear: v })}
            />
            <ChoiceQuestion
              label="Do you have formal training in music?"
              options={MUSIC_TRAINING}
              selected={[intake.musicTraining]}
              onToggle={(v) => updateIntake({ musicTraining: v })}
            />
          </section>

          <section className="intake-section">
            <h2>B · Your sleep</h2>
            <label className="intake-question intake-text">
              On a usual night, how many minutes does it take you to fall asleep?
              <input
                inputMode="numeric"
                onChange={(e) => updateIntake({ sleepLatencyMinutes: e.target.value.replace(/\D/g, "") })}
                placeholder="e.g. 20"
                value={intake.sleepLatencyMinutes}
              />
              {intake.sleepLatencyMinutes !== "" && !isValidSleepLatency(intake.sleepLatencyMinutes) && (
                <span className="intake-hint">Enter a number of minutes from 0 to 300.</span>
              )}
            </label>
            <ScaleQuestion
              label="How would you rate your sleep over the last month?"
              left="Very bad"
              right="Very good"
              value={intake.sleepQuality ? Number(intake.sleepQuality) : null}
              onChange={(v) => updateIntake({ sleepQuality: String(v) })}
            />
          </section>

          <section className="intake-section">
            <h2>C · Your listening habits</h2>
            <ChoiceQuestion
              label="How often do you listen to music before sleep or while falling asleep?"
              options={SLEEP_LISTENING}
              selected={[intake.sleepListening]}
              onToggle={(v) => updateIntake({ sleepListening: v })}
            />
            <ChoiceQuestion
              label="Which genre(s) do you typically listen to before or while sleeping?"
              hint="Select all that apply"
              multiple
              options={GENRES}
              selected={intake.sleepGenres}
              onToggle={(v) =>
                updateIntake({
                  sleepGenres: intake.sleepGenres.includes(v)
                    ? intake.sleepGenres.filter((g) => g !== v)
                    : [...intake.sleepGenres, v],
                })
              }
            />
            <ChoiceQuestion
              label="How familiar are you with Indian classical music (Raagas / Taalas)?"
              options={CLASSICAL_FAMILIARITY}
              selected={[intake.classicalFamiliarity]}
              onToggle={(v) => updateIntake({ classicalFamiliarity: v })}
            />
          </section>

          <section className="intake-section">
            <h2>D · Your beliefs about music &amp; sleep</h2>
            <ChoiceQuestion
              label="Overall, do you believe music helps you fall asleep or sleep better?"
              options={MUSIC_HELPS_SLEEP}
              selected={[intake.musicHelpsSleep]}
              onToggle={(v) => updateIntake({ musicHelpsSleep: v })}
            />
            <RankQuestion
              label="Rank these music styles from MOST to LEAST helpful for YOUR sleep"
              hint="1 = most helpful, 5 = least helpful. Each number can be used once."
              items={RANK_STYLES}
              ranking={intake.sleepRanking}
              onChange={(r) => updateIntake({ sleepRanking: r })}
            />
            <ChoiceQuestion
              label="Do you think Indian classical Raagas and Taalas have a distinct effect on relaxation or sleep compared to other music?"
              options={RAAGA_EFFECT}
              selected={[intake.raagaEffect]}
              onToggle={(v) => updateIntake({ raagaEffect: v })}
            />
            <fieldset className="intake-question">
              <legend>In general, how much do you believe lyrics (words in a song) disturb sleep?</legend>
              <input
                aria-label="Lyrics disturb sleep, 1 to 7"
                className="intake-range"
                max={7}
                min={1}
                onChange={(e) => updateIntake({ lyricsDisturbSleep: Number(e.target.value) })}
                type="range"
                value={intake.lyricsDisturbSleep}
              />
              <div className="rating-labels">
                <span>Not at all</span>
                <span>Score: {intake.lyricsDisturbSleep}/7</span>
                <span>Extremely</span>
              </div>
            </fieldset>
          </section>

          {error && <p className="error-message" role="alert">{error}</p>}
          {!canBegin && !busy && (
            <p className="microcopy">Answer every question above to continue.</p>
          )}
          <button
            className="button primary"
            disabled={!canBegin}
            onClick={beginStudy}
            type="button"
          >
            {busy ? "Starting…" : <>Begin listening <span aria-hidden="true">→</span></>}
          </button>
        </section>
      )}

      {/* Already registered */}
      {screen === "already_registered" && (
        <section className="complete screen">
          <div className="completion-icon" aria-hidden="true">↩</div>
          <p className="eyebrow">Already registered</p>
          <h1>You have already taken the test.</h1>
          <p className="intro">
            This roll number is already registered, and each person can take part only once.
            If you haven&apos;t filled in the morning reflection yet, use the link sent to your email.
          </p>
          <button className="button primary" disabled={resendBusy} onClick={() => resendInvitation("details")} type="button">
            {resendBusy ? "Sending…" : "Didn't get the email? Resend it"}
          </button>
          {resendNotice && (
            <p className={resendNotice.kind === "error" ? "error-message" : "microcopy"} role="status">
              {resendNotice.text}
            </p>
          )}
          <p className="microcopy">The link goes to the email address you registered with.</p>
        </section>
      )}

      {/* Listen */}
      {screen === "listen" && (
        <section className="player-screen screen" aria-live="polite">
          <div className="session-meta">
            <span>Session in progress</span>
            <span>{hasRepeated ? "Loop phase" : "Listening phase"}</span>
          </div>
          <div className={isPlaying ? "orb playing" : "orb"} aria-hidden="true">
            <i /><i /><i /><i /><i />
          </div>
          <p className="eyebrow">Listening session</p>
          <h1>{hasRepeated ? "The audio is repeating." : "Make space for the sound."}</h1>
          <p className="player-copy">
            {hasRepeated
              ? "When you are ready, stop the session to continue to the reflection."
              : isLooping
                ? "Keep listening. Whenever you feel sleepy, stop the session to continue."
                : "This listening phase has no pause control. Keep this page open while you listen."}
          </p>
          {audioError ? (
            <p className="error-message config-warning" role="alert">{audioError}</p>
          ) : (
            <>
              <div
                className="timeline"
                aria-label={`Listening progress: ${Math.round(listenPercent)} percent`}
              >
                <div className="timeline-fill" style={{ width: `${listenPercent}%` }} />
                <span className="timeline-thumb" style={{ left: `${listenPercent}%` }} />
              </div>
              <div className="time-row">
                <span>{formatTime(elapsed)}</span>
                <span>
                  {hasRepeated
                    ? `Loop ${loopCount}`
                    : isLooping
                      ? "Minimum reached"
                      : `Listening · ${formatTime(requiredPoint)} minimum`}
                </span>
                <span>{formatTime(duration)}</span>
              </div>
            </>
          )}
          <div className="player-actions">
            {!isPlaying && !isLooping && (
              <button className="play-button" onClick={startPlayback} type="button">
                <span aria-hidden="true">▶</span>Start listening
              </button>
            )}
            {isPlaying && !isLooping && (
              <span className="listening-indicator">Listening in progress</span>
            )}
            {isLooping && (
              <button
                className="button primary sleepy-button"
                disabled={busy}
                onClick={stopListening}
                type="button"
              >
                {busy ? "Saving…" : <>I&apos;m sleepy <span aria-hidden="true">→</span></>}
              </button>
            )}
            {process.env.NEXT_PUBLIC_ENABLE_TEST_MODE === "1" && isTestMode && !isLooping && (
              <button
                className="text-button admin-skip-button"
                onClick={() => {
                  maxListenedSecondsRef.current = requiredPoint;
                  setElapsed(requiredPoint);
                  setIsLooping(true);
                  if (audioRef.current) {
                    try {
                      audioRef.current.currentTime = requiredPoint;
                    } catch { /* ignore */ }
                  }
                }}
                style={{ marginTop: "1rem", fontSize: "0.825rem", opacity: 0.75, cursor: "pointer" }}
                type="button"
              >
                ⚡ Admin: Skip mandatory listening phase
              </button>
            )}
          </div>
          {error && <p className="error-message" role="alert">{error}</p>}
        </section>
      )}

      {/* Waiting */}
      {screen === "waiting" && (
        <section className="complete screen">
          <div className="completion-icon" aria-hidden="true">☾</div>
          <p className="eyebrow">Listening complete</p>
          <h1>Rest well tonight.</h1>
          <p className="intro">
            Your reflection will unlock shortly. Return on this device after signing in, or use the
            secure link you receive by email.
          </p>
          {participant?.deviceToken && releaseAt && (
            now >= Date.parse(releaseAt) ? (
              <>
                <button className="button primary" disabled={resendBusy} onClick={() => resendInvitation("device")} type="button">
                  {resendBusy ? "Sending…" : "Didn't get the email? Resend it"}
                </button>
                {resendNotice && (
                  <p className={resendNotice.kind === "error" ? "error-message" : "microcopy"} role="status">
                    {resendNotice.text}
                  </p>
                )}
              </>
            ) : (
              <p className="microcopy">
                If your email has not arrived, you can ask for a new one after{" "}
                {new Date(releaseAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}.
              </p>
            )
          )}
          {error && <p className="error-message" role="alert">{error}</p>}
        </section>
      )}

      {/* Survey */}
      {screen === "survey" && (
        <section className="survey screen">
          <div className="survey-heading">
            <p className="eyebrow">Morning reflection</p>
            <h1>How did you sleep?</h1>
            <p>A few questions about last night. It takes about three minutes.</p>
          </div>
          <form onSubmit={submitSurvey}>
            <section className="form-card survey-part">
              <h2>1 · Your night</h2>
              <div className="survey-pair">
                <label className="intake-question intake-text">
                  What time did you get into bed and try to sleep?
                  <input onChange={(e) => updateSurvey({ bedTime: e.target.value })} type="time" value={survey.bedTime} />
                </label>
                <label className="intake-question intake-text">
                  What time did you wake up for the day?
                  <input onChange={(e) => updateSurvey({ wakeTime: e.target.value })} type="time" value={survey.wakeTime} />
                </label>
              </div>
              <label className="intake-question intake-text">
                Roughly how many minutes did it take you to fall asleep?
                <span className="unit-input">
                  <input
                    inputMode="numeric"
                    onChange={(e) => updateSurvey({ sleepLatencyMinutes: e.target.value.replace(/\D/g, "") })}
                    placeholder="e.g. 20"
                    value={survey.sleepLatencyMinutes}
                  />
                  <span>min</span>
                </span>
              </label>
              <label className="intake-question intake-text">
                How many times do you remember waking up during the night?
                <span className="unit-input">
                  <input
                    inputMode="numeric"
                    onChange={(e) => updateSurvey({ awakenings: e.target.value.replace(/\D/g, "") })}
                    placeholder="0 if none"
                    value={survey.awakenings}
                  />
                  <span>times</span>
                </span>
              </label>
              <fieldset className="intake-question">
                <legend>Roughly how long did you sleep in total?</legend>
                <div className="unit-row">
                  <span className="unit-input">
                    <input
                      aria-label="Hours slept"
                      inputMode="numeric"
                      onChange={(e) => updateSurvey({ totalSleepHours: e.target.value.replace(/\D/g, "") })}
                      placeholder="7"
                      value={survey.totalSleepHours}
                    />
                    <span>h</span>
                  </span>
                  <span className="unit-input">
                    <input
                      aria-label="Extra minutes slept"
                      inputMode="numeric"
                      onChange={(e) => updateSurvey({ totalSleepMinutes: e.target.value.replace(/\D/g, "") })}
                      placeholder="30"
                      value={survey.totalSleepMinutes}
                    />
                    <span>min</span>
                  </span>
                </div>
              </fieldset>
            </section>

            <section className="form-card survey-part">
              <h2>2 · How it felt</h2>
              <ScaleQuestion
                label="How well did you sleep last night?"
                left="Very badly"
                right="Very well"
                value={survey.sleepQuality}
                onChange={(v) => updateSurvey({ sleepQuality: v })}
              />
              <ScaleQuestion
                label="How easy was it to fall asleep?"
                left="Very hard"
                right="Very easy"
                value={survey.easeFallingAsleep}
                onChange={(v) => updateSurvey({ easeFallingAsleep: v })}
              />
              <ScaleQuestion
                label="How rested do you feel right now?"
                left="Not at all"
                right="Fully rested"
                value={survey.restedNow}
                onChange={(v) => updateSurvey({ restedNow: v })}
              />
              <ScaleQuestion
                label="How awake and alert do you feel right now?"
                left="Very sleepy"
                right="Very alert"
                value={survey.alertNow}
                onChange={(v) => updateSurvey({ alertNow: v })}
              />
            </section>

            <section className="form-card survey-part">
              <h2>3 · The audio</h2>
              <ChoiceQuestion
                label="Did the audio keep playing until you stopped the session?"
                options={YES_NO_UNSURE}
                selected={[survey.audioPlayedFully]}
                onToggle={(v) => updateSurvey({ audioPlayedFully: v })}
              />
              <ChoiceQuestion
                label="Were you asleep before the audio ended?"
                options={YES_NO_UNSURE}
                selected={[survey.asleepBeforeAudioEnded]}
                onToggle={(v) => updateSurvey({ asleepBeforeAudioEnded: v })}
              />
              <ChoiceQuestion
                label="Had you heard this music before?"
                options={YES_NO}
                selected={[survey.heardBefore]}
                onToggle={(v) => updateSurvey({ heardBefore: v })}
              />
              <ScaleQuestion
                label="How much did you like it?"
                left="Not at all"
                right="Loved it"
                value={survey.likedMusic}
                onChange={(v) => updateSurvey({ likedMusic: v })}
              />
              <ChoiceQuestion
                label="Was the volume comfortable?"
                options={VOLUME}
                selected={[survey.volume]}
                onToggle={(v) => updateSurvey({ volume: v })}
              />
            </section>

            <section className="form-card survey-part">
              <h2>4 · Anything that could have affected your night</h2>
              <ChoiceQuestion
                label="Yesterday or last night I had:"
                hint="Tick all that apply"
                multiple
                options={NIGHT_FACTORS}
                selected={survey.factors}
                onToggle={(v) => updateSurvey({ factors: toggleFactor(survey.factors, v) })}
              />
            </section>

            <section className="form-card survey-part background-card">
              <h2>5 · Optional</h2>
              <label>
                How did the audio make you feel while you were falling asleep?
                <textarea
                  maxLength={MAX_TEXT_CHARACTERS}
                  onChange={(e) => updateSurvey({ audioFeeling: e.target.value })}
                  placeholder="Optional"
                  rows={3}
                  value={survey.audioFeeling}
                />
              </label>
              <label>
                Anything else about your night?
                <textarea
                  maxLength={MAX_TEXT_CHARACTERS}
                  onChange={(e) => updateSurvey({ otherNotes: e.target.value })}
                  placeholder="Optional"
                  rows={3}
                  value={survey.otherNotes}
                />
              </label>
            </section>
            {!allRatingsComplete && !busy && (
              <p className="microcopy">Answer every question in parts 1–4 to submit.</p>
            )}
            {error && <p className="error-message" role="alert">{error}</p>}
            <button
              className="button primary"
              disabled={!allRatingsComplete || busy}
              type="submit"
            >
              {busy ? "Submitting…" : <>Complete reflection <span aria-hidden="true">→</span></>}
            </button>
          </form>
          {/* Suppress unused variable warning — participantId available if needed */}
          {surveyParticipantId && <span style={{ display: "none" }} aria-hidden="true" />}
        </section>
      )}

      {/* Complete */}
      {screen === "complete" && (
        <section className="complete screen">
          <div className="completion-icon" aria-hidden="true">✓</div>
          <p className="eyebrow">Session complete</p>
          <h1>Thank you for listening.</h1>
          <p className="intro">
            Your reflection helps us understand how different musical experiences may shape moments of rest.
          </p>
          <button
            className="text-button science-link"
            onClick={() => setScreen("science")}
            type="button"
          >
            Curious about the science? <span aria-hidden="true">→</span>
          </button>
        </section>
      )}

      {/* Science debrief */}
      {screen === "science" && (
        <section className="science screen">
          <button className="back" onClick={() => setScreen("complete")} type="button">
            ← Back
          </button>
          <p className="eyebrow">About the study</p>
          <h1>Why listen to music this way?</h1>
          <div className="science-copy">
            <p>
              Sound can shape attention, breathing, and the way we notice our internal state. This study
              compares reflections after different listening sessions.
            </p>
            <p>
              There is no expected response. Your honest experience—including stopping quickly—is useful
              information.
            </p>
            <p className="microcopy">
              Note: browser playback telemetry (time elapsed, loop count) raises confidence that the session
              occurred but cannot prove that a person was actively listening. It is treated as supportive
              evidence, not proof.
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
