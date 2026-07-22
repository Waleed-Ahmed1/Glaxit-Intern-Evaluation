import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Login.css";
import { FaUser, FaLock, FaCheckCircle, FaKey, FaArrowLeft } from "react-icons/fa";
import { saveSession, getSession } from "../utils/session";

import logo from "../assets/logo.png";
import office from "../assets/office.jpg";

// In production (Vercel) client + API share the same domain, so '/api' just
// works with no config. Locally, set VITE_API_BASE=http://localhost:3000/api
// in client/.env so the dev server (on a different port) still reaches Express.
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

// Steps of the "Forgot password" flow, shown in place of the login form.
const VIEW = {
  LOGIN: "login",
  FORGOT_EMAIL: "forgot-email",
  FORGOT_OTP: "forgot-otp",
  FORGOT_RESET: "forgot-reset",
};

const Login = () => {
  const navigate = useNavigate();

  // ---------- Login state ----------
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null); // { name, role } once login succeeds

  // ---------- Forgot password state ----------
  const [view, setView] = useState(VIEW.LOGIN);
  const [fpLoading, setFpLoading] = useState(false);
  const [fpError, setFpError] = useState("");
  const [fpInfo, setFpInfo] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resetDone, setResetDone] = useState(false);
  const cooldownTimerRef = useRef(null);

  // Already logged in with a still-valid (< 1 day old) session? Skip the
  // form entirely and go straight to the right portal — this is what makes
  // "stay logged in" actually work instead of asking for email/password
  // every single time the app is opened.
  useEffect(() => {
    const session = getSession();
    if (session) {
      navigate(session.user.role === "admin" ? "/admin" : "/student", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clean up the resend-cooldown ticker on unmount.
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
      }
    };
  }, []);

  function startResendCooldown(seconds) {
    setResendCooldown(seconds);
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
    }
    cooldownTimerRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }

      saveSession(data.token, data.user);

      // Show a brief success card, then send them to the right portal.
      setSuccess({ name: data.user.name, role: data.user.role });
      setTimeout(() => {
        navigate(data.user.role === "admin" ? "/admin" : "/student");
      }, 1200);
    } catch (err) {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  // Reset every "forgot password" field and go back to the login form.
  function resetForgotPasswordFlow(target = VIEW.LOGIN) {
    setView(target);
    setFpError("");
    setFpInfo("");
    if (target === VIEW.LOGIN) {
      setResetEmail("");
      setResetOtp("");
      setResetToken("");
      setNewPassword("");
      setConfirmPassword("");
      setResendCooldown(0);
      setResetDone(false);
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
      }
    }
  }

  // Step 1: user enters their email, we confirm it exists and send the code.
  async function handleRequestOtp(e) {
    e.preventDefault();
    setFpError("");
    setFpInfo("");
    setFpLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/request-password-reset-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail }),
      });
      const data = await res.json();

      if (!res.ok) {
        setFpError(data.error || "Could not send the verification code");
        if (data.retryAfterSeconds) {
          startResendCooldown(data.retryAfterSeconds);
        }
        return;
      }

      setFpInfo(`A verification code was sent to ${resetEmail}`);
      setView(VIEW.FORGOT_OTP);
      startResendCooldown(data.resendAfterSeconds || 30);
    } catch (err) {
      setFpError("Could not reach the server");
    } finally {
      setFpLoading(false);
    }
  }

  // Resend the code without leaving the OTP step.
  async function handleResendOtp() {
    if (resendCooldown > 0 || fpLoading) return;
    setFpError("");
    setFpLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/request-password-reset-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail }),
      });
      const data = await res.json();

      if (!res.ok) {
        setFpError(data.error || "Could not resend the verification code");
        if (data.retryAfterSeconds) {
          startResendCooldown(data.retryAfterSeconds);
        }
        return;
      }

      setFpInfo(`A new verification code was sent to ${resetEmail}`);
      startResendCooldown(data.resendAfterSeconds || 30);
    } catch (err) {
      setFpError("Could not reach the server");
    } finally {
      setFpLoading(false);
    }
  }

  // Step 2: user enters the code, we verify it and get a short-lived reset token.
  async function handleVerifyOtp(e) {
    e.preventDefault();
    setFpError("");
    setFpInfo("");
    setFpLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/verify-password-reset-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail, otp: resetOtp }),
      });
      const data = await res.json();

      if (!res.ok) {
        setFpError(data.error || "Invalid verification code");
        return;
      }

      setResetToken(data.resetToken);
      setView(VIEW.FORGOT_RESET);
    } catch (err) {
      setFpError("Could not reach the server");
    } finally {
      setFpLoading(false);
    }
  }

  // Step 3: user sets a new password, we send it up along with the reset token.
  async function handleSetNewPassword(e) {
    e.preventDefault();
    setFpError("");

    if (newPassword.length < 8) {
      setFpError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFpError("Passwords do not match");
      return;
    }

    setFpLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken, newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setFpError(data.error || "Could not update your password");
        return;
      }

      // Password updated in the database — show a brief confirmation,
      // then send them back to the regular login form.
      setResetDone(true);
      setTimeout(() => {
        resetForgotPasswordFlow(VIEW.LOGIN);
      }, 1800);
    } catch (err) {
      setFpError("Could not reach the server");
    } finally {
      setFpLoading(false);
    }
  }

  return (
    <div className="login-page">

      {success && (
        <div className="auth-success-overlay">
          <div className="auth-success-card">
            <div className="auth-success-icon"><FaCheckCircle /></div>
            <h2>Welcome back, {success.name}!</h2>
            <p>Taking you to your {success.role === "admin" ? "admin" : "student"} portal...</p>
          </div>
        </div>
      )}

      {/* ================= WATERMARK BACKGROUND ================= */}
      <div className="background-pattern">
        {Array.from({ length: 180 }).map((_, index) => (
          <div className="watermark-cell" key={index}>
            <img
              src={logo}
              alt=""
              className="watermark-logo"
              draggable="false"
            />
          </div>
        ))}
      </div>

      {/* ================= LOGIN CARD ================= */}
      <div className="login-card">

        {/* ================= LEFT SIDE ================= */}
        <div
          className="left-side"
          style={{
            backgroundImage: `linear-gradient(rgba(22,170,160,.72), rgba(22,170,160,.72)), url(${office})`,
          }}
        >
          <div className="left-content">
            <h2>Welcome</h2>
            <p>
              Sign in to access your quizzes, track your progress, and
              stay on top of your evaluation journey.
            </p>
          </div>
          <div className="curve"></div>
        </div>

        {/* ================= RIGHT SIDE ================= */}
        <div className="right-side">
          <div className="login-content">

            {/* ---------------- LOGIN FORM ---------------- */}
            {view === VIEW.LOGIN && (
              <>
                <h1>Login</h1>
                <p className="subtitle">Sign in to your account</p>

                <form onSubmit={handleLogin}>
                  <div className="input-box">
                    <FaUser className="icon" />
                    <input
                      type="email"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="input-box">
                    <FaLock className="icon" />
                    <input
                      type="password"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>

                  <div className="login-options">
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => resetForgotPasswordFlow(VIEW.FORGOT_EMAIL)}
                    >
                      Forgot Password?
                    </button>
                  </div>

                  {error && (
                    <p style={{ color: "#d33", fontSize: "13px", marginBottom: "16px", textAlign: "center" }}>
                      {error}
                    </p>
                  )}

                  <button type="submit" className="login-btn" disabled={loading}>
                    {loading ? "Logging in..." : "Login"}
                  </button>
                </form>

                <div className="signup">
                  Don't have an account?
                  <Link to="/register"> Sign Up</Link>
                </div>
              </>
            )}

            {/* ---------------- FORGOT PASSWORD: EMAIL ---------------- */}
            {view === VIEW.FORGOT_EMAIL && (
              <>
                <h1>Forgot Password</h1>
                <p className="subtitle">Enter your email to receive a verification code</p>

                <form onSubmit={handleRequestOtp}>
                  <div className="input-box">
                    <FaUser className="icon" />
                    <input
                      type="email"
                      placeholder="Email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  {fpError && (
                    <p style={{ color: "#d33", fontSize: "13px", marginBottom: "16px", textAlign: "center" }}>
                      {fpError}
                    </p>
                  )}

                  <button type="submit" className="login-btn" disabled={fpLoading}>
                    {fpLoading ? "Sending code..." : "Send Verification Code"}
                  </button>
                </form>

                <div className="signup">
                  <button
                    type="button"
                    className="link-btn back-link"
                    onClick={() => resetForgotPasswordFlow(VIEW.LOGIN)}
                  >
                    <FaArrowLeft style={{ marginRight: 6 }} /> Back to login
                  </button>
                </div>
              </>
            )}

            {/* ---------------- FORGOT PASSWORD: VERIFY OTP ---------------- */}
            {view === VIEW.FORGOT_OTP && (
              <>
                <h1>Enter Code</h1>
                <p className="subtitle">
                  We sent a 6-digit code to <strong>{resetEmail}</strong>
                </p>

                <form onSubmit={handleVerifyOtp}>
                  <div className="input-box">
                    <FaKey className="icon" />
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="6-digit code"
                      value={resetOtp}
                      maxLength={6}
                      onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, ""))}
                      required
                      autoFocus
                    />
                  </div>

                  {fpInfo && !fpError && (
                    <p style={{ color: "#18b4aa", fontSize: "13px", marginBottom: "16px", textAlign: "center" }}>
                      {fpInfo}
                    </p>
                  )}

                  {fpError && (
                    <p style={{ color: "#d33", fontSize: "13px", marginBottom: "16px", textAlign: "center" }}>
                      {fpError}
                    </p>
                  )}

                  <button type="submit" className="login-btn" disabled={fpLoading || resetOtp.length !== 6}>
                    {fpLoading ? "Verifying..." : "Verify Code"}
                  </button>
                </form>

                <div className="signup">
                  <button
                    type="button"
                    className="link-btn"
                    onClick={handleResendOtp}
                    disabled={resendCooldown > 0 || fpLoading}
                  >
                    {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
                  </button>
                </div>

                <div className="signup">
                  <button
                    type="button"
                    className="link-btn back-link"
                    onClick={() => resetForgotPasswordFlow(VIEW.LOGIN)}
                  >
                    <FaArrowLeft style={{ marginRight: 6 }} /> Back to login
                  </button>
                </div>
              </>
            )}

            {/* ---------------- FORGOT PASSWORD: SET NEW PASSWORD ---------------- */}
            {view === VIEW.FORGOT_RESET && (
              <>
                {resetDone ? (
                  <>
                    <div className="auth-success-icon" style={{ textAlign: "center", marginBottom: 12 }}>
                      <FaCheckCircle />
                    </div>
                    <h1 style={{ fontSize: 26 }}>Password Updated</h1>
                    <p className="subtitle">Taking you back to login...</p>
                  </>
                ) : (
                  <>
                    <h1>Set New Password</h1>
                    <p className="subtitle">Choose a new password for your account</p>

                    <form onSubmit={handleSetNewPassword}>
                      <div className="input-box">
                        <FaLock className="icon" />
                        <input
                          type="password"
                          placeholder="New password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          required
                          autoFocus
                        />
                      </div>

                      <div className="input-box">
                        <FaLock className="icon" />
                        <input
                          type="password"
                          placeholder="Confirm new password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required
                        />
                      </div>

                      {fpError && (
                        <p style={{ color: "#d33", fontSize: "13px", marginBottom: "16px", textAlign: "center" }}>
                          {fpError}
                        </p>
                      )}

                      <button type="submit" className="login-btn" disabled={fpLoading}>
                        {fpLoading ? "Updating..." : "Update Password"}
                      </button>
                    </form>

                    <div className="signup">
                      <button
                        type="button"
                        className="link-btn back-link"
                        onClick={() => resetForgotPasswordFlow(VIEW.LOGIN)}
                      >
                        <FaArrowLeft style={{ marginRight: 6 }} /> Back to login
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

          </div>
        </div>

      </div>

    </div>
  );
};

export default Login;