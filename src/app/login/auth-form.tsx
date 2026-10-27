"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { authFormSchema } from "@/lib/validation";

type Form = z.infer<typeof authFormSchema>;

type ErrorResponse = {
  error?: {
    message?: string;
    details?: { fieldErrors?: Record<string, string[]> };
  };
};

const formFields = new Set<keyof Form>([
  "accountType", "firstName", "lastName", "email", "phone", "password",
  "businessName", "shopName", "county", "address",
]);

export function AuthForm({ initialMode }: { initialMode: "login" | "register" }) {
  const router = useRouter();
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(authFormSchema),
    defaultValues: { mode: initialMode, accountType: "customer" },
  });
  const mode = useWatch({ control, name: "mode" });
  const accountType = useWatch({ control, name: "accountType" });

  function switchMode(nextMode: "login" | "register") {
    setValue("mode", nextMode);
    clearErrors();
    setFormError("");
    setNotice("");
  }

  function switchAccountType(nextType: "customer" | "garage") {
    setValue("accountType", nextType);
    if (nextType === "customer") clearErrors(["businessName", "shopName", "county", "address"]);
  }

  async function onSubmit(data: Form) {
    setFormError("");
    setNotice("");
    const { mode: submittedMode, ...registration } = data;
    const payload = submittedMode === "login" ? { email: data.email, password: data.password } : registration;
    const response = await fetch(`/api/auth/${submittedMode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json() as ErrorResponse & { requiresEmailConfirmation?: boolean };
    if (!response.ok) {
      for (const [field, messages] of Object.entries(result.error?.details?.fieldErrors ?? {})) {
        if (formFields.has(field as keyof Form) && messages[0]) {
          setError(field as keyof Form, { type: "server", message: messages[0] });
        }
      }
      setFormError(result.error?.message ?? "Unable to continue");
      return;
    }
    if (result.requiresEmailConfirmation) {
      switchMode("login");
      setNotice("Check your email to confirm your account, then sign in.");
      return;
    }
    router.push("/dashboard"); router.refresh();
  }

  return <div className="auth-box">
    <h1>{mode === "login" ? "Welcome back" : "Join AutoCare"}</h1>
    <p>{mode === "login" ? "Sign in to continue to your workspace." : "Create a driver account or start a garage trial."}</p>
    <div className="tab-switch"><button type="button" className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>Sign in</button><button type="button" className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>Create account</button></div>
    {mode === "register" && <div className="tab-switch" aria-label="Account type"><button type="button" className={accountType === "customer" ? "active" : ""} onClick={() => switchAccountType("customer")}>I’m a driver</button><button type="button" className={accountType === "garage" ? "active" : ""} onClick={() => switchAccountType("garage")}>I run a garage</button></div>}
    {formError && <div className="form-error" role="alert">{formError}</div>}
    {notice && <div className="form-error" role="status">{notice}</div>}
    <form className="form-grid" onSubmit={handleSubmit(onSubmit)} noValidate>
      {mode === "register" && <><Field label="First name" error={errors.firstName?.message}><input required className="input" autoComplete="given-name" {...register("firstName")} /></Field><Field label="Last name" error={errors.lastName?.message}><input required className="input" autoComplete="family-name" {...register("lastName")} /></Field><Field label="Mobile number" error={errors.phone?.message}><input required className="input" placeholder="0712 345 678" autoComplete="tel" {...register("phone")} /></Field></>}
      <Field label="Email address" error={errors.email?.message} wide={mode === "login"}><input className="input" type="email" autoComplete="email" {...register("email")} /></Field>
      <Field label="Password" error={errors.password?.message} wide><input className="input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "register" ? "10+ characters, upper/lowercase and a number" : undefined} {...register("password")} /></Field>
      {mode === "register" && accountType === "garage" && <><Field label="Business name" error={errors.businessName?.message}><input required className="input" {...register("businessName")} /></Field><Field label="First shop name" error={errors.shopName?.message}><input required className="input" {...register("shopName")} /></Field><Field label="County" error={errors.county?.message}><input required className="input" placeholder="Nairobi" {...register("county")} /></Field><Field label="Street address" error={errors.address?.message}><input required className="input" {...register("address")} /></Field></>}
      <div className="field-wide"><button className="btn btn-primary btn-full" disabled={isSubmitting}>{isSubmitting ? <LoaderCircle className="animate-spin" size={17} /> : <>{mode === "login" ? "Sign in" : "Create account"}<ArrowRight size={17} /></>}</button></div>
    </form>
    <p className="auth-foot">By continuing, you agree to AutoCare’s terms and privacy policy.</p>
  </div>;
}

function Field({ label, error, wide, children }: { label: string; error?: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`field${wide ? " field-wide" : ""}`}><span>{label}</span>{children}{error ? <span className="error-text">{error}</span> : null}</label>;
}
