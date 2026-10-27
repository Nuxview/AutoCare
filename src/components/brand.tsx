import { Wrench } from "lucide-react";

export function Brand({ light = false }: { light?: boolean }) {
  return <span className="brand" style={light ? { color: "white" } : undefined}><span className="brand-mark"><Wrench size={18} /></span><span>AutoCare</span></span>;
}
