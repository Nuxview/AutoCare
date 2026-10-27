import { z } from "zod";
import { ApiError, jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenantMembership } from "@/server/auth/context";
import { createSubaccount, listKenyanBanks } from "@/server/payments/paystack";

const schema = z.object({
  franchiseId: z.uuid(),
  bankCode: z.string().min(1).max(30),
  accountNumber: z.string().regex(/^\d{6,20}$/),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    await requireTenantMembership(input.franchiseId, undefined, ["FRANCHISE_OWNER"]);
    const admin = createAdminClient();
    const { data: franchise, error } = await admin.from("franchises")
      .select("id,name,email,paystack_subaccount_code").eq("id", input.franchiseId).single();
    if (error) throw error;
    if (franchise.paystack_subaccount_code) throw new ApiError(409, "Garage payouts are already connected", "ALREADY_CONNECTED");
    const banks = await listKenyanBanks();
    if (!banks.some((bank) => bank.code === input.bankCode)) throw new ApiError(400, "Select a supported Kenyan bank", "INVALID_BANK");
    const subaccount = await createSubaccount({
      business_name: franchise.name,
      bank_code: input.bankCode,
      account_number: input.accountNumber,
      primary_contact_email: franchise.email,
    });
    if (!subaccount.subaccount_code || subaccount.currency !== "KES" || !subaccount.active) {
      throw new ApiError(502, "Paystack did not activate the KES payout account", "PAYMENT_PROVIDER_ERROR");
    }
    const saved = await admin.from("franchises").update({ paystack_subaccount_code: subaccount.subaccount_code })
      .eq("id", franchise.id).is("paystack_subaccount_code", null).select("id").maybeSingle();
    if (saved.error) throw saved.error;
    if (!saved.data) throw new ApiError(409, "Garage payouts were connected elsewhere", "ALREADY_CONNECTED");
    return Response.json({ connected: true });
  } catch (error) { return jsonError(error); }
}
