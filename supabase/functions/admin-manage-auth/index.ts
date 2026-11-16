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
    const body = (await req.json()) as {
      action?: "create" | "update_password";
      email?: unknown;
      password?: unknown;
    };

    if (typeof body.action !== "string") return json({ error: "invalid_action" }, 400);
    if (typeof body.email !== "string" || typeof body.password !== "string") return json({ error: "invalid_params" }, 400);

    const email = body.email.trim().toLowerCase();
    const password = body.password;

    if (email.length > 254 || !EMAIL_PATTERN.test(email)) return json({ error: "invalid_email" }, 400);
    if (password.length < 8 || password.length > 128) return json({ error: "invalid_password" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (body.action === "create") {
      const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createError) {
        if (createError.status === 422 || /already|exist/i.test(createError.message)) {
          const { data: listData, error: listError } = await serviceClient.auth.admin.listUsers();
          if (listError) throw listError;
          const found = (listData?.users ?? []).find((u) => u.email?.toLowerCase() === email);
          if (!found) throw new Error("user_not_found");

          const { error: updateError } = await serviceClient.auth.admin.updateUserById(found.id, {
            password,
            email_confirm: true,
          });
          if (updateError) throw updateError;
          return json({ ok: true, user_id: found.id });
        }
        throw createError;
      }

      return json({ ok: true, user_id: created.user?.id });
    }

    if (body.action === "update_password") {
      const { data: listData, error: listError } = await serviceClient.auth.admin.listUsers();
      if (listError) throw listError;
      const found = (listData?.users ?? []).find((u) => u.email?.toLowerCase() === email);
      if (!found) return json({ error: "user_not_found" }, 404);

      const { error: updateError } = await serviceClient.auth.admin.updateUserById(found.id, {
        password,
        email_confirm: true,
      });
      if (updateError) throw updateError;
      return json({ ok: true });
    }

    return json({ error: "invalid_action" }, 400);
  } catch (err) {
    console.error("admin-manage-auth failed", err);
    return json({ error: "operation_failed", detail: err.message }, 500);
  }
});
