import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, getBearer, json } from "../_shared/http.ts";
import { logError } from "../_shared/log.ts";
import { parseMorningSurvey } from "./morning-survey.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = getBearer(request);
  if (!token) {
    return json({ error: "No authorization bearer token provided." }, 401);
  }

  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) {
    return json({ error: "Authentication failed." }, 401);
  }

  const userEmail = auth.user.email?.toLowerCase();

  // Look up participant by auth_user_id OR email.
  let { data: participant } = await admin
    .from("participants")
    .select("id, auth_user_id")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();

  if (!participant && userEmail) {
    const { data: byEmail } = await admin
      .from("participants")
      .select("id, auth_user_id")
      .eq("email", userEmail)
      .maybeSingle();

    if (byEmail) {
      // Matching by email is only safe when the address was confirmed by the magic link.
      if (!auth.user.email_confirmed_at) {
        return json({ error: "Please confirm your email address with the link we sent." }, 403);
      }
      participant = byEmail;
      // Link auth_user_id for future fast lookups.
      const { error: linkError } = await admin
        .from("participants")
        .update({ auth_user_id: auth.user.id })
        .eq("id", byEmail.id);
      if (linkError) logError("survey-access: could not link auth user:", linkError.message);
    }
  }

  if (!participant) {
    return json({ error: "No participant record found for this sign-in." }, 403);
  }

  // Only a released, email-sent session can be answered.
  const { data: session, error: sessionError } = await admin
    .from("study_sessions")
    .select("id, status, release_at")
    .eq("participant_id", participant.id)
    .eq("status", "email_sent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError) {
    logError("survey-access: could not load session:", sessionError.message);
    return json({ error: "Could not check your reflection. Please try again later." }, 500);
  }

  if (!session) {
    // Check if session was already submitted
    const { data: submittedSession } = await admin
      .from("study_sessions")
      .select("id")
      .eq("participant_id", participant.id)
      .eq("status", "survey_submitted")
      .limit(1)
      .maybeSingle();

    if (submittedSession) {
      return json({ available: false, submitted: true });
    }

    return json({ error: "Your reflection is not available yet. Please complete the listening session first." }, 403);
  }

  // The release time must have passed (qualified_at + SURVEY_DELAY_SECONDS).
  const releaseMs = session.release_at ? new Date(session.release_at).getTime() : NaN;
  if (!Number.isFinite(releaseMs) || releaseMs > Date.now()) {
    return json({ error: "Your reflection is not available yet." }, 403);
  }

  const { data: existing } = await admin
    .from("survey_responses")
    .select("id")
    .eq("session_id", session.id)
    .maybeSingle();

  if (existing) {
    return json({ available: false, submitted: true });
  }

  const body = (await request.json().catch(() => ({ action: "check" }))) as Record<string, unknown>;
  if (body.action !== "submit") {
    return json({ available: true, submitted: false, participantId: participant.id });
  }

  const parsed = parseMorningSurvey(body.answers);
  if ("error" in parsed) return json({ error: parsed.error }, 400);

  const { error: insertError } = await admin
    .from("survey_responses")
    .insert({
      session_id: session.id,
      participant_id: participant.id,
      answers: parsed.survey,
    });

  if (insertError) {
    logError("survey-access: could not save survey response:", insertError.message);
    return json({ error: "Could not save your reflection. Please try again later." }, 409);
  }

  const { error: statusError } = await admin
    .from("study_sessions")
    .update({ status: "survey_submitted" })
    .eq("id", session.id);
  if (statusError) {
    logError(`survey-access: could not set survey_submitted for session ${session.id}:`, statusError.message);
  }

  return json({ available: false, submitted: true });
});
