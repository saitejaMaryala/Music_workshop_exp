import assert from "node:assert/strict";
import { callFunction, isoFromNow, loadFunction, seedParticipant, seedSession, setupTest } from "./helpers.ts";
import { rowsOf, store } from "./fake_supabase.ts";

const EMAIL = "participant@example.com";
const TOKEN = "survey-access-token";
const AUTH_HEADERS = { Authorization: `Bearer ${TOKEN}` };

// Signs in a fake Supabase Auth user. By default the email is confirmed.
function signIn(overrides: { id?: string; email?: string; email_confirmed_at?: string | null } = {}) {
  store.usersByToken.set(TOKEN, {
    id: "auth-user-1",
    email: EMAIL,
    email_confirmed_at: "2026-10-10T00:00:00.000Z",
    ...overrides,
  });
}

// A participant whose survey has been sent and released.
async function releasedSession(sessionOverrides: Record<string, unknown> = {}) {
  const participant = seedParticipant({ email: EMAIL });
  const session = await seedSession(participant.id, "device-survey", {
    status: "email_sent",
    release_at: isoFromNow(-60),
    email_sent_at: isoFromNow(-60),
    ...sessionOverrides,
  });
  return { participant, session };
}

const validAnswers = {
  bedTime: "23:30",
  wakeTime: "07:15",
  sleepLatencyMinutes: "20",
  awakenings: "1",
  totalSleepHours: "7",
  totalSleepMinutes: "10",
  sleepQuality: 4,
  easeFallingAsleep: 3,
  restedNow: 4,
  alertNow: 3,
  audioPlayedFully: "Yes",
  asleepBeforeAudioEnded: "No",
  heardBefore: "No",
  likedMusic: 5,
  volume: "Just right",
  factors: ["None of these"],
  audioFeeling: "",
  otherNotes: "Felt calm",
};

const validSubmission = { action: "submit", answers: validAnswers };

Deno.test("survey-access: rejects a queued session even after its release time", async () => {
  setupTest();
  const handler = await loadFunction("survey-access");
  signIn();
  await releasedSession({ status: "queued" });

  const response = await callFunction(handler, { action: "check" }, AUTH_HEADERS);

  assert.equal(response.status, 403);
});

Deno.test("survey-access: rejects an email_sent session before its release time", async () => {
  setupTest();
  const handler = await loadFunction("survey-access");
  signIn();
  await releasedSession({ release_at: isoFromNow(600) });

  const response = await callFunction(handler, { action: "check" }, AUTH_HEADERS);

  assert.equal(response.status, 403);
});

Deno.test("survey-access: rejects an unconfirmed email when matching by email", async () => {
  setupTest();
  const handler = await loadFunction("survey-access");
  signIn({ email_confirmed_at: null });
  const { participant } = await releasedSession();

  const response = await callFunction(handler, { action: "check" }, AUTH_HEADERS);

  assert.equal(response.status, 403);
  assert.equal(participant.auth_user_id, null, "participant must not be linked to an unconfirmed sign-in");
});

Deno.test("survey-access: check reports the survey as available", async () => {
  setupTest();
  const handler = await loadFunction("survey-access");
  signIn();
  await releasedSession();

  const response = await callFunction(handler, { action: "check" }, AUTH_HEADERS);

  assert.equal(response.status, 200);
  assert.equal(response.body.available, true);
  assert.equal(response.body.submitted, false);
});

Deno.test("survey-access: saves one submission and marks the session submitted", async () => {
  setupTest();
  const handler = await loadFunction("survey-access");
  signIn();
  const { participant, session } = await releasedSession();

  const response = await callFunction(handler, validSubmission, AUTH_HEADERS);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { available: false, submitted: true });
  assert.equal(rowsOf("survey_responses").length, 1);
  const saved = rowsOf("survey_responses")[0].answers as Record<string, unknown>;
  assert.equal(saved.otherNotes, "Felt calm");
  assert.equal(saved.audioFeeling, null, "blank optional answers are stored as null");
  assert.equal(saved.totalSleepMinutes, 430, "hours and minutes are stored as total minutes");
  assert.equal(session.status, "survey_submitted");
  assert.equal(participant.auth_user_id, "auth-user-1", "email match links the sign-in to the participant");
});

Deno.test("survey-access: a second submission does not save again", async () => {
  setupTest();
  const handler = await loadFunction("survey-access");
  signIn();
  await releasedSession();
  await callFunction(handler, validSubmission, AUTH_HEADERS);

  const response = await callFunction(handler, validSubmission, AUTH_HEADERS);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { available: false, submitted: true });
  assert.equal(rowsOf("survey_responses").length, 1);
});

Deno.test("survey-access: rejects invalid answers and written answers over 2000 characters", async () => {
  setupTest();
  const handler = await loadFunction("survey-access");
  signIn();
  await releasedSession();

  const submit = (changes: Record<string, unknown>) =>
    callFunction(handler, { action: "submit", answers: { ...validAnswers, ...changes } }, AUTH_HEADERS);

  assert.equal((await submit({ volume: "robot" })).status, 400);
  assert.equal((await submit({ bedTime: "25:00" })).status, 400);
  assert.equal((await submit({ sleepQuality: 6 })).status, 400);
  assert.equal((await submit({ factors: [] })).status, 400);
  assert.equal((await submit({ factors: ["None of these", "Alcohol"] })).status, 400);
  assert.equal((await submit({ otherNotes: "x".repeat(2001) })).status, 400);
  assert.equal((await callFunction(handler, { action: "submit" }, AUTH_HEADERS)).status, 400);
  assert.equal(rowsOf("survey_responses").length, 0);
});
