import { z } from "zod";
import { ApiError,jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { camelize } from "@/lib/supabase/format";
import { garageScope } from "@/server/garage/scope";

const itemSchema=z.object({shopId:z.uuid(),sku:z.string().trim().min(1).max(40),name:z.string().trim().min(2).max(120),quantityOnHand:z.number().finite().nonnegative(),reorderLevel:z.number().finite().nonnegative(),unitCost:z.number().finite().nonnegative(),sellingPrice:z.number().finite().nonnegative()});
const patchSchema=itemSchema.partial().extend({id:z.uuid()});
const roles=["FRANCHISE_OWNER","FRANCHISE_ADMIN","SHOP_MANAGER","INVENTORY_CLERK"] as const;
export async function GET() {
  try {
    const scope=await garageScope();
    let query=createAdminClient().from("inventory_items").select("*,shop:shops(name)").eq("franchise_id",scope.franchiseId).eq("is_active",true).order("name");
    if(scope.shopId) query=query.eq("shop_id",scope.shopId);
    const {data,error}=await query;
    if(error) throw error;
    return Response.json({items:camelize(data)});
  } catch(error){return jsonError(error);}
}
export async function POST(request:Request) {
  try {
    const scope=await garageScope([...roles]);
    const input=itemSchema.parse(await request.json());
    if(scope.shopId && scope.shopId!==input.shopId) throw new ApiError(403,"This shop is outside your scope","FORBIDDEN");
    const admin=createAdminClient();
    const {data:shop,error:shopError}=await admin.from("shops").select("id").eq("id",input.shopId).eq("franchise_id",scope.franchiseId).maybeSingle();
    if(shopError) throw shopError;
    if(!shop) throw new ApiError(404,"Shop not found","NOT_FOUND");
    const {data,error}=await admin.from("inventory_items").insert({franchise_id:scope.franchiseId,shop_id:input.shopId,sku:input.sku,name:input.name,quantity_on_hand:input.quantityOnHand,reorder_level:input.reorderLevel,unit_cost:input.unitCost,selling_price:input.sellingPrice}).select().single();
    if(error) throw error;
    return Response.json({item:camelize(data)},{status:201});
  } catch(error){return jsonError(error);}
}
export async function PATCH(request:Request) {
  try {
    const scope=await garageScope([...roles]);
    const input=patchSchema.parse(await request.json());
    const admin=createAdminClient();
    const {data:existing,error:lookupError}=await admin.from("inventory_items").select("id,shop_id").eq("id",input.id).eq("franchise_id",scope.franchiseId).maybeSingle();
    if(lookupError) throw lookupError;
    if(!existing || (scope.shopId && existing.shop_id!==scope.shopId)) throw new ApiError(404,"Stock item not found","NOT_FOUND");
    if(input.shopId && input.shopId!==existing.shop_id) throw new ApiError(400,"Moving stock between shops is not supported","INVALID_SHOP");
    const {error}=await admin.from("inventory_items").update({...(input.sku!==undefined?{sku:input.sku}:{}),...(input.name!==undefined?{name:input.name}:{}),...(input.quantityOnHand!==undefined?{quantity_on_hand:input.quantityOnHand}:{}),...(input.reorderLevel!==undefined?{reorder_level:input.reorderLevel}:{}),...(input.unitCost!==undefined?{unit_cost:input.unitCost}:{}),...(input.sellingPrice!==undefined?{selling_price:input.sellingPrice}:{})}).eq("id",input.id);
    if(error) throw error;
    return Response.json({ok:true});
  } catch(error){return jsonError(error);}
}
