import { jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { garageScope } from "@/server/garage/scope";
import { readImage } from "@/lib/image-file";

export async function POST(request:Request) {
  try {
    const scope=await garageScope(["FRANCHISE_OWNER","FRANCHISE_ADMIN"]);
    const form=await request.formData();
    const file=form.get("file");
    const {bytes,mime}=await readImage(file,2*1024*1024);
    const admin=createAdminClient();
    const extension=mime.split("/")[1].replace("jpeg","jpg");
    const path=`${scope.franchiseId}/${crypto.randomUUID()}.${extension}`;
    const {error}=await admin.storage.from("garage-logos").upload(path,bytes,{contentType:mime,upsert:false});
    if(error) throw error;
    const url=admin.storage.from("garage-logos").getPublicUrl(path).data.publicUrl;
    const {error:saveError}=await admin.from("franchises").update({logo_url:url}).eq("id",scope.franchiseId);
    if(saveError) {await admin.storage.from("garage-logos").remove([path]);throw saveError;}
    return Response.json({url});
  } catch(error){return jsonError(error);}
}
