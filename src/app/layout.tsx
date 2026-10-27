import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AutoCare — Better care for every car", template: "%s | AutoCare" },
  description: "Book trusted garages, track repairs and run every part of your workshop from one secure platform.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<Toaster richColors position="top-right" /></body></html>;
}
