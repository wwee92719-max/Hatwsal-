import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as { email?: unknown };
    if (typeof body.email !== "string") return json({ error: "invalid_email" }, 400);

    const email = body.email.trim().toLowerCase();
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) return json({ error: "invalid_email" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: adminRow, error: lookupError } = await serviceClient
      .from("admin_users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!adminRow) return json({ error: "not_added" }, 403);

    const { error: createError } = await serviceClient.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (createError && createError.status !== 422) throw createError;

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: otpError } = await anonClient.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (otpError) {
      if (otpError.status === 429) return json({ error: "rate_limited" }, 429);
      throw otpError;
    }

    return json({ ok: true });
  } catch (err) {
    console.error("admin-send-code failed", err);
    return json({ error: "send_failed" }, 500);
  }
});
