import assert from "node:assert/strict";
import { hash } from "../_shared/http.ts";
import { callFunction, loadFunction, seedParticipant, seedSession, sessionById, setupTest } from "./helpers.ts";

const OLD_DEVICE = "device-old";

Deno.test("resume-session: a listening session gets a new device token", async () => {
  setupTest();
  const handler = await loadFunction("resume-session");
  const participant = seedParticipant({ roll_number: "2024102034" });
  const session = await seedSession(participant.id, OLD_DEVICE, { status: "listening" });

  const response = await callFunction(handler, { rollNumber: "2024102034" });

  assert.equal(response.body.status, "resumed");
  assert.equal(response.body.conditionId, session.condition_id);
  assert.equal(response.body.durationSeconds, session.duration_seconds);
  const token = response.body.deviceToken as string;
  assert.ok(token && token !== OLD_DEVICE);
  assert.equal(sessionById(session.id as string)?.device_token_hash, await hash(token));
  assert.notEqual(sessionById(session.id as string)?.device_token_hash, await hash(OLD_DEVICE), "old device stops working");
  assert.equal(JSON.stringify(response.body).includes("@"), false, "no email in the reply");
});

Deno.test("resume-session: refuses sessions that are past listening", async () => {
  setupTest();
  const handler = await loadFunction("resume-session");
  const participant = seedParticipant({ roll_number: "2024102035" });
  const session = await seedSession(participant.id, OLD_DEVICE, { status: "queued" });

  const response = await callFunction(handler, { rollNumber: "2024102035" });

  assert.equal(response.body.status, "not_resumable");
  assert.equal(sessionById(session.id as string)?.device_token_hash, await hash(OLD_DEVICE), "token unchanged");
});

Deno.test("resume-session: unknown roll number looks like nothing to resume", async () => {
  setupTest();
  const handler = await loadFunction("resume-session");

  const response = await callFunction(handler, { rollNumber: "9999999999" });

  assert.equal(response.body.status, "not_resumable");
});

Deno.test("resume-session: rejects a malformed roll number", async () => {
  setupTest();
  const handler = await loadFunction("resume-session");

  const response = await callFunction(handler, { rollNumber: "x" });

  assert.equal(response.status, 400);
});
