import { useState, useEffect } from "react";
import { api } from "../api.js";

export default function Auth({ onLogin }) {
  const [mode, setMode] = useState("signup"); // "signup", "login", or "otp"
  const [hasUsers, setHasUsers] = useState(null); // null = loading
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resendSuccess, setResendSuccess] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  // OTP Verification state
  const [otpState, setOtpState] = useState({
    challengeToken: null,
    maskedEmail: "",
  });
  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // Check backend to see if any users exist yet
  useEffect(() => {
    let mounted = true;
    api.authStatus()
      .then((status) => {
        if (!mounted) return;
        setHasUsers(status.has_users);
        if (status.has_users) {
          setMode("login");
        } else {
          setMode("signup");
        }
      })
      .catch(() => {
        if (mounted) {
          setHasUsers(false);
          setMode("signup");
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Cooldown timer countdown for resending OTP
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setResendSuccess(null);

    if (mode === "signup") {
      if (!formData.fullName.trim()) {
        setError("Please enter your full name.");
        return;
      }
      if (formData.password.length < 6) {
        setError("Password must be at least 6 characters long.");
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      setLoading(true);
      try {
        const response = await api.signup({
          email: formData.email.trim(),
          full_name: formData.fullName.trim(),
          password: formData.password,
        });
        localStorage.removeItem("empsys_auth");
        sessionStorage.setItem("empsys_auth", JSON.stringify(response));
        onLogin(response);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    } else {
      // Login flow
      setLoading(true);
      try {
        const response = await api.login({
          email: formData.email.trim(),
          password: formData.password,
        });

        // If user is SUPER_ADMIN, require 2FA OTP verification
        if (response.requires_otp) {
          setOtpState({
            challengeToken: response.challenge_token,
            maskedEmail: response.masked_email || "",
          });
          setOtpCode("");
          setResendCooldown(60);
          setMode("otp");
          return;
        }

        // Standard user login: store session and complete login
        localStorage.removeItem("empsys_auth");
        sessionStorage.setItem("empsys_auth", JSON.stringify(response));
        onLogin(response);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    setError(null);
    setResendSuccess(null);

    const cleanOtp = otpCode.trim();
    if (!cleanOtp || cleanOtp.length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    setLoading(true);
    try {
      const response = await api.verifyOtp({
        challenge_token: otpState.challengeToken,
        otp: cleanOtp,
      });

      localStorage.removeItem("empsys_auth");
      sessionStorage.setItem("empsys_auth", JSON.stringify(response));
      onLogin(response);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0 || loading) return;
    setError(null);
    setResendSuccess(null);

    setLoading(true);
    try {
      const res = await api.resendOtp({
        challenge_token: otpState.challengeToken,
      });
      setResendSuccess(res.message || "A new code has been sent to your email.");
      setResendCooldown(60);
      setOtpCode("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const isFirstTimeSetup = hasUsers === false;

  return (
    <div className="auth-wrapper">
      <div className="auth-bg-blob auth-blob-1" />
      <div className="auth-bg-blob auth-blob-2" />

      <div className="auth-card">
        {/* Brand header */}
        <div className="auth-header">
          <div className="auth-brand-badge">
            <span className="auth-brand-letter">E</span>
          </div>
          <h1 className="auth-title">
            {mode === "otp" ? "Verify Your Login" : "EMPSYS CRM"}
          </h1>
          <p className="auth-subtitle">
            {mode === "otp"
              ? "We sent a verification code to your registered email address."
              : mode === "signup"
              ? isFirstTimeSetup
                ? "First-time setup: Create your administrator account"
                : "Create a new account to access the workforce portal"
              : "Welcome back! Sign in to continue"}
          </p>

          {/* Masked Email Badge for OTP */}
          {mode === "otp" && otpState.maskedEmail && (
            <div className="otp-masked-badge">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <span>{otpState.maskedEmail}</span>
            </div>
          )}
        </div>

        {/* First-time setup badge */}
        {mode !== "otp" && isFirstTimeSetup && (
          <div className="auth-notice">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>Initial setup detected. Sign up to initialize system admin access.</span>
          </div>
        )}

        {/* Tab Switcher (only for login/signup) */}
        {mode !== "otp" && (
          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${mode === "login" ? "active" : ""}`}
              onClick={() => {
                setMode("login");
                setError(null);
              }}
            >
              Log In
            </button>
            <button
              type="button"
              className={`auth-tab ${mode === "signup" ? "active" : ""}`}
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
            >
              Sign Up {isFirstTimeSetup && <span className="tab-pill">First Time</span>}
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="auth-error-alert" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Resend Success Alert */}
        {resendSuccess && (
          <div className="auth-success-alert" role="status">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>{resendSuccess}</span>
          </div>
        )}

        {/* OTP Verification Form */}
        {mode === "otp" ? (
          <form onSubmit={handleVerifyOtp} className="auth-form" noValidate>
            <div className="auth-field">
              <label htmlFor="otp-input" className="otp-input-label">
                Enter 6-Digit Code
              </label>
              <div className="otp-input-container">
                <input
                  id="otp-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="&bull; &bull; &bull; &bull; &bull; &bull;"
                  className="otp-digit-field"
                  value={otpCode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setOtpCode(val);
                    if (error) setError(null);
                    if (resendSuccess) setResendSuccess(null);
                  }}
                  autoFocus
                  required
                />
              </div>
              <p className="otp-hint-text">
                Code expires in 5 minutes. Check your inbox and spam folder.
              </p>
            </div>

            <button
              id="otp-verify-btn"
              type="submit"
              className="btn primary auth-submit-btn"
              disabled={loading || otpCode.length !== 6}
            >
              {loading ? (
                <span className="auth-spinner-wrap">
                  <span className="auth-spinner" />
                  Verifying...
                </span>
              ) : (
                "Verify"
              )}
            </button>

            <div className="otp-footer">
              <p className="otp-resend-prompt">Didn't receive the code?</p>
              <button
                type="button"
                className="btn ghost otp-resend-btn"
                onClick={handleResendOtp}
                disabled={resendCooldown > 0 || loading}
              >
                {resendCooldown > 0
                  ? `Resend OTP (${resendCooldown}s)`
                  : "Resend OTP"}
              </button>

              <button
                type="button"
                className="link-btn otp-back-btn"
                onClick={() => {
                  setMode("login");
                  setError(null);
                  setResendSuccess(null);
                  setOtpCode("");
                }}
              >
                &larr; Back to Log In
              </button>
            </div>
          </form>
        ) : (
          /* Normal Login / Sign Up Form */
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            {mode === "signup" && (
              <div className="auth-field">
                <label htmlFor="auth-fullname">Full Name</label>
                <div className="auth-input-wrap">
                  <input
                    id="auth-fullname"
                    name="fullName"
                    type="text"
                    placeholder="Enter name"
                    value={formData.fullName}
                    onChange={handleChange}
                    required
                    autoFocus={mode === "signup"}
                  />
                </div>
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="auth-email">Email Address</label>
              <div className="auth-input-wrap">
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  placeholder={mode === "login" ? "Enter email id" : "Enter email"}
                  value={formData.email}
                  onChange={handleChange}
                  required
                  autoFocus={mode === "login"}
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="auth-password">Password</label>
              <div className="auth-input-wrap password-wrap">
                <input
                  id="auth-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={mode === "signup" ? "At least 6 characters" : "Enter your password"}
                  value={formData.password}
                  onChange={handleChange}
                  required
                />
                <button
                  type="button"
                  className="toggle-password-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? "Hide password" : "Show password"}
                  tabIndex="-1"
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {mode === "signup" && (
              <div className="auth-field">
                <label htmlFor="auth-confirm-password">Confirm Password</label>
                <div className="auth-input-wrap">
                  <input
                    id="auth-confirm-password"
                    name="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Re-enter your password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>
            )}

            <button
              id="auth-submit-btn"
              type="submit"
              className="btn primary auth-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <span className="auth-spinner-wrap">
                  <span className="auth-spinner" />
                  {mode === "signup" ? "Creating Account..." : "Signing In..."}
                </span>
              ) : mode === "signup" ? (
                "Complete Sign Up"
              ) : (
                "Sign In to Dashboard"
              )}
            </button>
          </form>
        )}

        {/* Footer switcher note (only for login/signup) */}
        {mode !== "otp" && (
          <div className="auth-footer">
            {mode === "signup" ? (
              <p>
                Already registered?{" "}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                >
                  Log In
                </button>
              </p>
            ) : (
              <p>
                Need a new account?{" "}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                  }}
                >
                  Sign Up
                </button>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
