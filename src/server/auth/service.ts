import type { z } from "zod";
import { ApiError } from "@/lib/api";
import { deterministicHash, encryptField, normalizeKenyanPhone } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { loginSchema, registerSchema } from "@/lib/validation";

function profile(row: Record<string, unknown>) {
  return { id: row.id as string, email: row.email as string, firstName: row.first_name as string, lastName: row.last_name as string, globalRole: row.global_role as "CUSTOMER" | "PLATFORM_ADMIN" };
}

export async function register(input: z.infer<typeof registerSchema>) {
  let phone: string;
  try { phone = normalizeKenyanPhone(input.phone); }
  catch { throw new ApiError(400, "Enter a valid Kenyan mobile number", "INVALID_PHONE"); }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email: input.email, password: input.password, options: { data: { first_name: input.firstName, last_name: input.lastName, account_type: input.accountType } } });
  if (error) throw new ApiError(error.status ?? 400, error.message, "AUTH_SIGNUP_FAILED");
  if (!data.user || data.user.identities?.length === 0) throw new ApiError(409, "An account with that email already exists", "CONFLICT");

  const admin = createAdminClient();
  const { data: garageId, error: provisionError } = await admin.rpc("provision_new_user", {
    p_user_id: data.user.id, p_email: input.email, p_first_name: input.firstName, p_last_name: input.lastName,
    p_phone_encrypted: encryptField(phone), p_phone_search_hash: deterministicHash(phone), p_account_type: input.accountType,
    p_business_name: input.businessName ?? null, p_shop_name: input.shopName ?? null, p_county: input.county ?? null, p_address: input.address ?? null,
  });
  if (provisionError) { await admin.auth.admin.deleteUser(data.user.id); throw provisionError; }
  const { data: row, error: profileError } = await admin.from("profiles").select("id,email,first_name,last_name,global_role").eq("id", data.user.id).single();
  if (profileError) throw profileError;
  return { user: profile(row), garageId: garageId as string | null, requiresEmailConfirmation: !data.session };
}

export async function login(input: z.infer<typeof loginSchema>) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(input);
  if (error || !data.user) throw new ApiError(401, "Email or password is incorrect", "INVALID_CREDENTIALS");
  const admin = createAdminClient();
  const { data: row, error: profileError } = await admin.from("profiles").select("id,email,first_name,last_name,global_role,is_active").eq("id", data.user.id).single();
  if (profileError || !row?.is_active) { await supabase.auth.signOut(); throw new ApiError(403, "This account is not active", "ACCOUNT_DISABLED"); }
  return { user: profile(row) };
}
