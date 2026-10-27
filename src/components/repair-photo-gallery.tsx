"use client";

import { useEffect,useState } from "react";
import Image from "next/image";
import { Camera,UploadCloud } from "lucide-react";
import { toast } from "sonner";

type Photo={id:string;url:string;caption:string|null;createdAt:string};
export function RepairPhotoGallery({bookingId}:{bookingId:string}){
  const [photos,setPhotos]=useState<Photo[]>([]);const [file,setFile]=useState<File|null>(null);const [caption,setCaption]=useState("");const [saving,setSaving]=useState(false);
  async function load(){const r=await fetch(`/api/repair-photos?bookingId=${encodeURIComponent(bookingId)}`);if(r.ok)setPhotos((await r.json()).photos);}
  useEffect(()=>{let active=true;fetch(`/api/repair-photos?bookingId=${encodeURIComponent(bookingId)}`).then(async r=>{if(active&&r.ok)setPhotos((await r.json()).photos);});return()=>{active=false;};},[bookingId]);
  async function upload(e:React.FormEvent){e.preventDefault();if(!file)return;const form=new FormData();form.set("bookingId",bookingId);form.set("caption",caption);form.set("file",file);setSaving(true);try{const r=await fetch("/api/repair-photos",{method:"POST",body:form});const body=await r.json();if(!r.ok)throw new Error(body.error?.message??"Upload failed");setFile(null);setCaption("");toast.success("Photo shared");await load();}catch(error){toast.error(error instanceof Error?error.message:"Upload failed");}finally{setSaving(false);}}
  return <section className="photo-gallery"><div className="section-inline-head"><div><Camera size={18}/><strong>Shared photos</strong></div><span>{photos.length} photo{photos.length===1?"":"s"}</span></div><p>Photos are visible only to you and this garage.</p><div className="photo-grid">{photos.map(photo=><a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="photo-tile"><Image unoptimized width={120} height={100} src={photo.url} alt={photo.caption||"Repair photo"}/><span>{photo.caption||new Date(photo.createdAt).toLocaleDateString("en-KE")}</span></a>)}</div><form className="photo-upload" onSubmit={upload}><input aria-label="Repair photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]??null)}/><input className="input" aria-label="Photo caption" placeholder="Add a caption (optional)" value={caption} maxLength={240} onChange={e=>setCaption(e.target.value)}/><button className="btn btn-secondary" disabled={!file||saving}><UploadCloud size={16}/>{saving?"Uploading…":"Share photo"}</button></form></section>;
}
