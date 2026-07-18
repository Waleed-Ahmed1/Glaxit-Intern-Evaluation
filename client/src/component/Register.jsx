import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Register.css";
import { FaUser, FaEnvelope, FaLock, FaUserTag, FaGraduationCap } from "react-icons/fa";
import logo from "../assets/logo.png";
import { DOMAINS } from "../constants/domains";

const Register = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("student");
  const [domain, setDomain] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  async function handleRegister(e) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (role === "student" && !domain) {
      setError("Please select your domain");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          role,
          ...(role === "student" ? { domain } : {}),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }

      // No auto-login here — show a quick success message, then send them
      // to the Login page to sign in with the account they just created.
      setRegistered(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="register-page">

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

      {/* ================= REGISTER CARD ================= */}
      <div className="register-card">
        <div className="register-content">
          <h1>Create Account</h1>
          <p className="subtitle">Sign up to get started</p>

          <form onSubmit={handleRegister}>
            <div className="input-box">
              <FaUser className="icon" />
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="input-box">
              <FaEnvelope className="icon" />
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

            <div className="input-box">
              <FaLock className="icon" />
              <input
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <div className="input-box select-box">
              <FaUserTag className="icon" />
              <select
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  if (e.target.value !== "student") setDomain("");
                }}
              >
                <option value="student">Student</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {role === "student" && (
              <div className="input-box select-box">
                <FaGraduationCap className="icon" />
                <select
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  required
                >
                  <option value="" disabled>Select your domain</option>
                  {DOMAINS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            {error && <p className="form-error">{error}</p>}

            <button type="submit" className="register-btn" disabled={loading || registered}>
              {loading ? "Creating account..." : "Register"}
            </button>

            {registered && (
              <p className="form-success">
                Registered successfully! Taking you to the login page...
              </p>
            )}
          </form>

          <div className="login-link">
            Already have an account?
            <Link to="/login"> Log In</Link>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Register;