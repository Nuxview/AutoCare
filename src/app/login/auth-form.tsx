"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound, LoaderCircle, Mail } from "lucide-react";
import { authFormSchema } from "@/lib/validation";
import { createClient } from "@/lib/supabase/browser";

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

/**
 * Main authentication form providing Sign In, Registration, Reset Password, and Forgot Password flows.
 *
 * @param props.initialMode Initial mode to display ('login' | 'register' | 'reset')
 */
export function AuthForm({ initialMode }: { initialMode: "login" | "register" | "reset" }) {
  const router = useRouter();
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  // Reset password flow states
  const [isResetPassword, setIsResetPassword] = useState(initialMode === "reset");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Forgot password flow states
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

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
    defaultValues: { mode: initialMode === "reset" ? "login" : initialMode, accountType: "customer" },
  });
  const mode = useWatch({ control, name: "mode" });
  const accountType = useWatch({ control, name: "accountType" });

  function switchMode(nextMode: "login" | "register") {
    setIsForgotPassword(false);
    setValue("mode", nextMode);
    clearErrors();
    setFormError("");
    setNotice("");
  }

  function switchAccountType(nextType: "customer" | "garage") {
    setValue("accountType", nextType);
    if (nextType === "customer") clearErrors(["businessName", "shopName", "county", "address"]);
  }

  function openForgotPassword(prefillEmail?: string) {
    if (prefillEmail) setForgotEmail(prefillEmail);
    setForgotError("");
    setForgotSubmitted(false);
    setIsForgotPassword(true);
  }

  function closeForgotPassword() {
    setIsForgotPassword(false);
    setForgotError("");
  }

  /**
   * Submits the updated password to Supabase Auth for the active recovery session.
   *
   * @param e Form submission event
   * @returns Promise resolving once password update attempt finishes
   */
  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setNewPasswordError("");

    if (!newPassword || newPassword.length < 10) {
      setNewPasswordError("Password must be at least 10 characters long.");
      return;
    }

    setIsUpdatingPassword(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsUpdatingPassword(false);

    if (error) {
      setNewPasswordError(error.message);
      return;
    }

    setIsResetPassword(false);
    setNotice("Password updated successfully. Sign in with your new password.");
    switchMode("login");
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setForgotError("");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!forgotEmail || !emailRegex.test(forgotEmail.trim())) {
      setForgotError("Please enter a valid email address (e.g. name@example.com).");
      return;
    }

    setIsSendingReset(true);
    try {
      await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
      setForgotSubmitted(true);
    } catch {
      setForgotSubmitted(true);
    } finally {
      setIsSendingReset(false);
    }
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

  if (isResetPassword) {
    return (
      <div className="auth-box" role="region" aria-labelledby="reset-heading">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
          <div className="auth-icon-badge" aria-hidden="true">
            <KeyRound size={22} />
          </div>
          <h1 id="reset-heading" style={{ margin: 0 }}>Set new password</h1>
        </div>
        <p style={{ marginTop: 10 }}>Choose a new password of at least 10 characters.</p>
        <form method="post" onSubmit={handleUpdatePassword} className="form-grid" noValidate>
          {newPasswordError && (
            <div className="field-wide form-error" role="alert">
              {newPasswordError}
            </div>
          )}
          <Field label="New password" error={newPasswordError} wide>
            <input
              id="new-password"
              required
              type="password"
              autoComplete="new-password"
              className="input"
              placeholder="10+ characters"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                if (newPasswordError) setNewPasswordError("");
              }}
              aria-required="true"
              aria-invalid={!!newPasswordError}
            />
          </Field>
          <div className="field-wide" style={{ marginTop: 6 }}>
            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={isUpdatingPassword}
              aria-busy={isUpdatingPassword}
            >
              {isUpdatingPassword ? (
                <>
                  <LoaderCircle className="animate-spin" size={17} />
                  <span>Updating password...</span>
                </>
              ) : (
                <span>Update password</span>
              )}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (isForgotPassword) {
    return (
      <div className="auth-box" role="region" aria-labelledby="forgot-heading">
        <button
          type="button"
          onClick={closeForgotPassword}
          className="btn-back"
          aria-label="Back to sign in or create account"
        >
          <ArrowLeft size={16} />
          <span>Back to {mode === "login" ? "Sign in" : "Sign up"}</span>
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
          <div className="auth-icon-badge" aria-hidden="true">
            <KeyRound size={22} />
          </div>
          <h1 id="forgot-heading" style={{ margin: 0 }}>Reset password</h1>
        </div>

        <p style={{ marginTop: 10 }}>
          {forgotSubmitted
            ? "Check your inbox for instructions to access your account."
            : "Enter your registered email address and we’ll send you a password recovery link."}
        </p>

        {forgotSubmitted ? (
          <div className="forgot-success-card" role="status" aria-live="polite">
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <CheckCircle2 size={24} className="text-green" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <p style={{ fontWeight: 700, margin: "0 0 6px" }}>Recovery link sent</p>
                <p style={{ fontSize: 13, margin: 0, color: "#374151" }}>
                  If <strong>{forgotEmail}</strong> matches an account in our system, you will receive an email shortly with a secure reset link.
                </p>
              </div>
            </div>

            <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                type="button"
                className="btn btn-primary btn-full"
                onClick={closeForgotPassword}
              >
                Return to {mode === "login" ? "Sign in" : "Create account"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-full"
                onClick={() => setForgotSubmitted(false)}
              >
                Try another email
              </button>
            </div>
          </div>
        ) : (
          <form method="post" onSubmit={handleResetPassword} className="form-grid" noValidate>
            {forgotError && (
              <div className="field-wide form-error" role="alert">
                {forgotError}
              </div>
            )}

            <Field label="Email address" error={forgotError} wide>
              <div className="input-with-icon">
                <Mail size={16} className="field-icon" aria-hidden="true" />
                <input
                  id="forgot-email"
                  required
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className="input pl-icon"
                  placeholder="name@example.com"
                  value={forgotEmail}
                  onChange={(e) => {
                    setForgotEmail(e.target.value);
                    if (forgotError) setForgotError("");
                  }}
                  aria-required="true"
                  aria-invalid={!!forgotError}
                />
              </div>
            </Field>

            <div className="field-wide" style={{ marginTop: 6 }}>
              <button
                type="submit"
                className="btn btn-primary btn-full"
                disabled={isSendingReset}
                aria-busy={isSendingReset}
              >
                {isSendingReset ? (
                  <>
                    <LoaderCircle className="animate-spin" size={17} />
                    <span>Sending instructions...</span>
                  </>
                ) : (
                  <>
                    <span>Send reset instructions</span>
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        <p className="auth-foot">
          Remembered your password?{" "}
          <button
            type="button"
            onClick={closeForgotPassword}
            className="link-btn"
          >
            Sign in
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-box">
      <h1>{mode === "login" ? "Welcome back" : "Join AutoCare"}</h1>
      <p>{mode === "login" ? "Sign in to continue to your workspace." : "Create a driver account or start a garage trial."}</p>
      <div className="tab-switch">
        <button type="button" className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>Sign in</button>
        <button type="button" className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>Create account</button>
      </div>
      {mode === "register" && (
        <div className="tab-switch" aria-label="Account type">
          <button type="button" className={accountType === "customer" ? "active" : ""} onClick={() => switchAccountType("customer")}>I’m a driver</button>
          <button type="button" className={accountType === "garage" ? "active" : ""} onClick={() => switchAccountType("garage")}>I run a garage</button>
        </div>
      )}
      {formError && <div className="form-error" role="alert">{formError}</div>}
      {notice && <div className="form-error" role="status">{notice}</div>}
      <form method="post" className="form-grid" onSubmit={handleSubmit(onSubmit)} noValidate>
        {mode === "register" && (
          <>
            <Field label="First name" error={errors.firstName?.message}>
              <input required className="input" autoComplete="given-name" {...register("firstName")} />
            </Field>
            <Field label="Last name" error={errors.lastName?.message}>
              <input required className="input" autoComplete="family-name" {...register("lastName")} />
            </Field>
            <Field label="Mobile number" error={errors.phone?.message}>
              <input required className="input" placeholder="0712 345 678" autoComplete="tel" {...register("phone")} />
            </Field>
          </>
        )}
        <Field label="Email address" error={errors.email?.message} wide={mode === "login"}>
          <input className="input" type="email" autoComplete="email" {...register("email")} />
        </Field>
        <Field label="Password" error={errors.password?.message} wide>
          <input
            className="input"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder={mode === "register" ? "10+ characters, upper/lowercase and a number" : undefined}
            {...register("password")}
          />
        </Field>
        {mode === "register" && accountType === "garage" && (
          <>
            <Field label="Business name" error={errors.businessName?.message}><input required className="input" {...register("businessName")} /></Field>
            <Field label="First shop name" error={errors.shopName?.message}><input required className="input" {...register("shopName")} /></Field>
            <Field label="County" error={errors.county?.message}><input required className="input" placeholder="Nairobi" {...register("county")} /></Field>
            <Field label="Street address" error={errors.address?.message}><input required className="input" {...register("address")} /></Field>
          </>
        )}
        {mode === "register" && (
          <div className="field-wide signup-forgot-hint">
            <span>Already have an account but lost your password? </span>
            <button
              type="button"
              className="link-btn"
              onClick={() => openForgotPassword(control._formValues?.email)}
            >
              Reset it here
            </button>
          </div>
        )}
        <div className="field-wide">
          <button className="btn btn-primary btn-full" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="animate-spin" size={17} /> : <>{mode === "login" ? "Sign in" : "Create account"}<ArrowRight size={17} /></>}
          </button>
          {mode === "login" && (
            <div className="login-forgot-action">
              <button
                type="button"
                className="link-btn"
                onClick={() => openForgotPassword(control._formValues?.email)}
              >
                Forgot password?
              </button>
            </div>
          )}
        </div>
      </form>
      <p className="auth-foot">By continuing, you agree to AutoCare’s terms and privacy policy.</p>
    </div>
  );
}

/**
 * Reusable form field wrapper supporting labels, trailing actions, error display, and inputs.
 *
 * @param props.label Field label text
 * @param props.error Optional error message string
 * @param props.wide Whether the field spans full grid width
 * @param props.trailingAction Optional JSX placed on the right side of the label (e.g. forgot password button)
 * @param props.children Nested input element
 */
function Field({
  label,
  error,
  wide,
  trailingAction,
  children,
}: {
  label: string;
  error?: string;
  wide?: boolean;
  trailingAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={`field${wide ? " field-wide" : ""}`}>
      <div className="field-header">
        <label className="field-label">{label}</label>
        {trailingAction}
      </div>
      {children}
      {error ? <span className="error-text">{error}</span> : null}
    </div>
  );
}
