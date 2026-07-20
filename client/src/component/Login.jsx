import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Login.css";
import { FaUser, FaLock, FaCheckCircle } from "react-icons/fa";
import { saveSession, getSession } from "../utils/session";

import logo from "../assets/logo.png";
import office from "../assets/office.jpg";

// In production (Vercel) client + API share the same domain, so '/api' just
// works with no config. Locally, set VITE_API_BASE=http://localhost:3000/api
// in client/.env so the dev server (on a different port) still reaches Express.
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null); // { name, role } once login succeeds

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
              Securely access your account and continue managing your business
              with confidence.
            </p>
          </div>
          <div className="curve"></div>
        </div>

        {/* ================= RIGHT SIDE ================= */}
        <div className="right-side">
          <div className="login-content">
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
                <label className="remember">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  <span>Remember Me</span>
                </label>
                <a href="/">Forgot Password?</a>
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
          </div>
        </div>

      </div>

    </div>
  );
};

export default Login;