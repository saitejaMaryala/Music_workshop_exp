import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, hash, json } from "../_shared/http.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Lets someone who registered but never finished listening carry on from another device.
//
// The roll number alone identifies them (this is a small study, and all it unlocks is the
// unfinished listening session). Only sessions still in "listening" can be resumed; anyone
// further along keeps the email route. A new device token replaces the old one, so the
// first device stops working. Replies never contain an email address.
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await request.json().catch(() => ({}));
  const rollNumber = String(body.rollNumber ?? "").trim();
  if (!/^[A-Za-z0-9/_-]{3,40}$/.test(rollNumber)) return json({ error: "Enter a valid roll number." }, 400);

  // Plain equality lookups only. Unknown roll numbers look the same as "nothing to resume".
  const { data: participant } = await admin.from("participants").select("id").eq("roll_number", rollNumber).maybeSingle();
  if (!participant) return json({ status: "not_resumable" });

  const { data: session } = await admin
    .from("study_sessions")
    .select("id, status, condition_id, duration_seconds")
    .eq("participant_id", participant.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session || session.status !== "listening") return json({ status: "not_resumable" });

  const deviceToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const { data: updated, error } = await admin
    .from("study_sessions")
    .update({ device_token_hash: await hash(deviceToken) })
    .eq("id", session.id)
    .eq("status", "listening") // do not swap the token if they qualified a moment ago
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("resume-session: could not save the new device token:", error.message);
    return json({ error: "Could not resume your session. Please try again." }, 500);
  }
  if (!updated) return json({ status: "not_resumable" });

  return json({
    status: "resumed",
    deviceToken,
    conditionId: session.condition_id,
    durationSeconds: session.duration_seconds,
  });
});
