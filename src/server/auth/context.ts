import { ApiError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type MembershipRole = "FRANCHISE_OWNER" | "FRANCHISE_ADMIN" | "SHOP_MANAGER" | "SERVICE_ADVISOR" | "MECHANIC" | "INVENTORY_CLERK" | "ACCOUNTANT";

export async function requireAuthenticatedUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new ApiError(401, "Sign in to continue", "UNAUTHENTICATED");
  const admin = createAdminClient();
  const { data: row, error: profileError } = await admin.from("profiles").select("id,email,first_name,last_name,global_role,is_active").eq("id", data.user.id).single();
  if (profileError || !row?.is_active) throw new ApiError(401, "Your account is unavailable", "SESSION_EXPIRED");
  return { id: row.id, email: row.email, firstName: row.first_name, lastName: row.last_name, globalRole: row.global_role as "CUSTOMER" | "PLATFORM_ADMIN" };
}

export async function requirePlatformAdmin() {
  const user = await requireAuthenticatedUser();
  if (user.globalRole !== "PLATFORM_ADMIN") throw new ApiError(403, "Platform administrator access is required", "FORBIDDEN");
  return user;
}

export async function requireTenantMembership(franchiseId: string, shopId?: string, roles?: MembershipRole[], allowInactive = false) {
  const user = await requireAuthenticatedUser();
  const admin = createAdminClient();
  let query = admin.from("memberships").select("*,franchise:franchises(status)").eq("user_id", user.id).eq("franchise_id", franchiseId).eq("is_active", true);
  if (roles?.length) query = query.in("role", roles);
  const { data, error } = await query;
  if (error) throw error;
  const membership = data?.find((item: Record<string, unknown>) => !shopId || item.shop_id === null || item.shop_id === shopId);
  if (!membership) throw new ApiError(403, "You do not have access to this garage", "TENANT_ACCESS_DENIED");
  const franchise = membership.franchise as { status: string } | null;
  if (!allowInactive && franchise && ["SUSPENDED", "CANCELLED"].includes(franchise.status)) throw new ApiError(403, "This garage account is not active", "TENANT_SUSPENDED");
  return { user, membership };
}
