import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { AuthForm } from "./auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return <main className="auth-page">
    <aside className="auth-aside"><Link href="/"><Brand light /></Link><div className="auth-quote"><h2>Keep every journey moving.</h2><p>From a driver’s first booking to the final payment, AutoCare keeps everyone informed and every workshop in control.</p></div><small style={{ color: "#8fa79e", position: "relative", zIndex: 1 }}>Secure · Multi-tenant · Built for Kenya</small></aside>
    <section className="auth-main"><AuthForm initialMode={mode === "register" ? "register" : "login"} /></section>
  </main>;
}
