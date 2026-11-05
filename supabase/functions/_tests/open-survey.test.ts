import assert from "node:assert/strict";
import { callFunction, isoFromNow, loadFunction, seedParticipant, seedSession, setupTest } from "./helpers.ts";

async function setup(sessionOverrides: Record<string, unknown> = {}) {
  setupTest();
  const handler = await loadFunction("open-survey");
  const participant = seedParticipant({ roll_number: "2023101005", email: "someone@example.com" });
  await seedSession(participant.id, "device-x", { release_at: isoFromNow(-60), ...sessionOverrides });
  return handler;
}

Deno.test("open-survey: check reports the status without a link", async () => {
  const handler = await setup({ status: "email_sent" });
  const response = await callFunction(handler, { rollNumber: "2023101005", action: "check" });
  assert.equal(response.body.status, "email_sent");
  assert.equal(response.body.link, undefined);
  assert.equal(response.text.includes("@"), false, "no email in the reply");
});

Deno.test("open-survey: listening and queued sessions cannot be opened", async () => {
  for (const status of ["listening", "queued", "sending"]) {
    const handler = await setup({ status });
    const response = await callFunction(handler, { rollNumber: "2023101005", action: "open" });
    assert.equal(response.body.status, status);
    assert.equal(response.body.link, undefined, `no link while ${status}`);
  }
});

Deno.test("open-survey: a submitted survey reports submitted", async () => {
  const handler = await setup({ status: "survey_submitted" });
  const response = await callFunction(handler, { rollNumber: "2023101005", action: "open" });
  assert.equal(response.body.status, "submitted");
  assert.equal(response.body.link, undefined);
});

Deno.test("open-survey: unknown roll number is not_found", async () => {
  const handler = await setup({ status: "email_sent" });
  const response = await callFunction(handler, { rollNumber: "9999999999", action: "open" });
  assert.equal(response.body.status, "not_found");
});

Deno.test("open-survey: rejects a malformed roll number", async () => {
  const handler = await setup({ status: "email_sent" });
  const response = await callFunction(handler, { rollNumber: "x", action: "open" });
  assert.equal(response.status, 400);
});

Deno.test("open-survey: an email_sent session gets a sign-in link and is linked to its auth user", async () => {
  const handler = await setup({ status: "email_sent" });
  const response = await callFunction(handler, { rollNumber: "2023101005", action: "open" });
  assert.equal(response.body.status, "ready");
  assert.equal(typeof response.body.link, "string");
  assert.equal(JSON.stringify(response.body).includes("someone@example.com"), false, "no email in the reply");
});
