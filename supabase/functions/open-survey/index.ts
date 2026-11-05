import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/http.ts";
import { hideEmails } from "../_shared/log.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// For participants whose survey email never arrived: opens the survey from the roll number alone
// (this is a small study, so no second factor), by making the same one-time sign-in link the email carries.
//
// { rollNumber, action: "check" }  -> { status, releaseAt }   (what the page uses to enable its buttons)
// { rollNumber, action: "open" }   -> { status: "ready", link } only when the survey email has been sent
//
// status: not_found | listening | queued | sending | email_sent | submitted
// Only "email_sent" can be opened. Replies never contain an email address.
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await request.json().catch(() => ({}));
  const rollNumber = String(body.rollNumber ?? "").trim();
  const action = body.action === "open" ? "open" : "check";
  if (!/^[A-Za-z0-9/_-]{3,40}$/.test(rollNumber)) return json({ error: "Enter a valid roll number." }, 400);

  // Plain equality lookups only. Never build filter strings from user input.
  const { data: participant } = await admin
    .from("participants")
    .select("id, email")
    .eq("roll_number", rollNumber)
    .maybeSingle();
  if (!participant) return json({ status: "not_found" });

  const { data: session } = await admin
    .from("study_sessions")
    .select("id, status, release_at")
    .eq("participant_id", participant.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session) return json({ status: "not_found" });

  const status = session.status === "survey_submitted" ? "submitted" : session.status;
  if (action === "check" || status !== "email_sent") {
    return json({ status, releaseAt: session.release_at ?? null });
  }

  // Same steps as the emailed invitation: a magic link, with the auth user saved before it is used.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: participant.email,
    options: { redirectTo: Deno.env.get("APP_URL") ?? "http://localhost:3000/" },
  });
  if (linkError || !link?.properties?.action_link) {
    console.error("open-survey: magic link failed:", hideEmails(linkError?.message ?? "no action link"));
    return json({ status: "error", error: "Could not open the survey. Please try again in a moment." }, 502);
  }

  const { error: saveError } = await admin
    .from("participants")
    .update({ auth_user_id: link.user.id })
    .eq("id", participant.id);
  if (saveError) {
    console.error("open-survey: could not save auth link:", hideEmails(saveError.message));
    return json({ status: "error", error: "Could not open the survey. Please try again in a moment." }, 502);
  }

  return json({ status: "ready", link: link.properties.action_link });
});
