// Supabase Edge Function: receives a Database Webhook event and mirrors current
// participant/conference state into Google Sheets. Deploy separately; secrets stay server-side.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function getAccessToken() {
  const email = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKeyRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  if (!email || !privateKeyRaw) throw new Error("Google service-account secrets are not configured.");
  const privateKeyPem = privateKeyRaw.replace(/\\n/g, "\n");
  const pemBody = privateKeyPem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", binary, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const header = enc({ alg: "RS256", typ: "JWT" });
  const claims = enc({ iss: email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const unsigned = `${header}.${claims}`;
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const signature = btoa(String.fromCharCode(...sig)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  const token = await response.json();
  if (!response.ok) throw new Error(`Google token request failed: ${JSON.stringify(token)}`);
  return token.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const webhookSecret = Deno.env.get("SHEETS_WEBHOOK_SECRET");
  if (!webhookSecret || req.headers.get("x-sheets-webhook-secret") !== webhookSecret) return json({ error: "Unauthorized" }, 401);
  try {
    const spreadsheetId = Deno.env.get("GOOGLE_SHEETS_SPREADSHEET_ID");
    if (!spreadsheetId) throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is not configured.");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    // Rebuild the two tabs from current DB state. This is simple and resilient for a
    // small registration system; for large datasets use an idempotent row-upsert queue.
    const [{ data: participants, error: pErr }, { data: conferences, error: cErr }] = await Promise.all([
      supabase.from("participants").select("id,last_name,first_name,email,phone,student_code,institution,conference_id,present,notes,created_at,updated_at").order("created_at"),
      supabase.from("conferences").select("id,name,description,registration_open,created_at,updated_at").order("created_at"),
    ]);
    if (pErr) throw pErr;
    if (cErr) throw cErr;
    const token = await getAccessToken();
    const conferenceById = new Map((conferences || []).map((c: any) => [c.id, c.name]));
    const participantsRows = [
      ["ID", "Nom", "Prénom", "Email", "Téléphone", "Code étudiant", "Établissement", "Master / conférence", "Présence", "Remarque", "Créé le", "Mis à jour le"],
      ...(participants || []).map((p: any) => [p.id,p.last_name,p.first_name,p.email,p.phone,p.student_code,p.institution,conferenceById.get(p.conference_id) || p.conference_id,p.present ? "Présent" : "Absent",p.notes,p.created_at,p.updated_at].map(v => v ?? "")),
    ];
    const conferenceRows = [
      ["ID", "Nom", "Description", "Inscriptions ouvertes", "Créé le", "Mis à jour le"],
      ...(conferences || []).map((c: any) => [c.id,c.name,c.description,c.registration_open ? "Oui" : "Non",c.created_at,c.updated_at].map(v => v ?? "")),
    ];
    const sheetsBase = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values`;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const clear = await fetch(`${sheetsBase}:batchClear`, { method:"POST", headers, body:JSON.stringify({ ranges:["Participants!A:L","Formations!A:F"] }) });
    if (!clear.ok) throw new Error(`Google Sheets clear failed: ${await clear.text()}`);
    const write = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
      method:"POST", headers, body:JSON.stringify({ valueInputOption:"RAW", data:[
        { range:"Participants!A1", majorDimension:"ROWS", values:participantsRows },
        { range:"Formations!A1", majorDimension:"ROWS", values:conferenceRows },
      ] }),
    });
    if (!write.ok) throw new Error(`Google Sheets update failed: ${await write.text()}`);
    return json({ ok:true, participantCount:(participants||[]).length, conferenceCount:(conferences||[]).length });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "Unknown sync error" }, 500);
  }
});