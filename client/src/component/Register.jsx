import {
  useEffect,
  useState,
} from "react";

import {
  Link,
  useNavigate,
} from "react-router-dom";

import "./Register.css";

import {
  FaEnvelope,
  FaGraduationCap,
  FaLock,
  FaShieldAlt,
  FaUser,
  FaUserTag,
} from "react-icons/fa";

import logo from "../assets/logo.png";

import {
  DOMAINS,
} from "../constants/domains";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  "/api";

const ADMIN_EMAIL_DOMAIN =
  "glaxit.com";

function formatCountdown(
  totalSeconds
) {
  const safeSeconds =
    Math.max(totalSeconds, 0);

  const minutes =
    Math.floor(
      safeSeconds / 60
    );

  const seconds =
    String(
      safeSeconds % 60
    ).padStart(2, "0");

  return `${minutes}:${seconds}`;
}

const Register = () => {
  const navigate =
    useNavigate();

  const [name, setName] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [role, setRole] =
    useState("student");

  const [domain, setDomain] =
    useState("");

  const [otp, setOtp] =
    useState("");

  const [step, setStep] =
    useState("details");

  const [
    expiresIn,
    setExpiresIn,
  ] = useState(0);

  const [
    resendIn,
    setResendIn,
  ] = useState(0);

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [
    registered,
    setRegistered,
  ] = useState(false);

  /*
   * Two-minute expiry countdown.
   */
  useEffect(() => {
    if (
      step !== "otp" ||
      expiresIn <= 0
    ) {
      return undefined;
    }

    const timer =
      window.setInterval(() => {
        setExpiresIn(
          (current) =>
            Math.max(
              current - 1,
              0
            )
        );
      }, 1000);

    return () =>
      window.clearInterval(
        timer
      );
  }, [step, expiresIn]);

  /*
   * Resend cooldown countdown.
   */
  useEffect(() => {
    if (
      step !== "otp" ||
      resendIn <= 0
    ) {
      return undefined;
    }

    const timer =
      window.setInterval(() => {
        setResendIn(
          (current) =>
            Math.max(
              current - 1,
              0
            )
        );
      }, 1000);

    return () =>
      window.clearInterval(
        timer
      );
  }, [step, resendIn]);

  function validateDetails() {
    const normalizedEmail =
      email
        .trim()
        .toLowerCase();

    if (
      name.trim().length < 2
    ) {
      return (
        "Please enter your full name"
      );
    }

    if (!normalizedEmail) {
      return (
        "Please enter your email address"
      );
    }

    if (
      role === "admin" &&
      !normalizedEmail.endsWith(
        `@${ADMIN_EMAIL_DOMAIN}`
      )
    ) {
      return (
        `Admin accounts must use an ` +
        `@${ADMIN_EMAIL_DOMAIN} ` +
        `email address`
      );
    }

    if (
      password !==
      confirmPassword
    ) {
      return (
        "Passwords do not match"
      );
    }

    if (
      password.length < 8 ||
      password.length > 72
    ) {
      return (
        "Password must be between " +
        "8 and 72 characters"
      );
    }

    if (
      role === "student" &&
      !domain
    ) {
      return (
        "Please select your domain"
      );
    }

    return null;
  }

  async function sendOtp({
    isResend = false,
  } = {}) {
    setError("");
    setMessage("");

    const validationError =
      validateDetails();

    if (validationError) {
      setError(
        validationError
      );

      return;
    }

    setLoading(true);

    try {
      const response =
        await fetch(
          `${API_BASE}/auth/request-registration-otp`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              email: email
                .trim()
                .toLowerCase(),

              role,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        if (
          data.retryAfterSeconds
        ) {
          setResendIn(
            data.retryAfterSeconds
          );
        }

        setError(
          data.error ||
            "Could not send verification code"
        );

        return;
      }

      setEmail(
        data.email ||
          email
            .trim()
            .toLowerCase()
      );

      setOtp("");

      setExpiresIn(
        data.expiresInSeconds ||
          120
      );

      setResendIn(
        data.resendAfterSeconds ||
          30
      );

      setStep("otp");

      setMessage(
        isResend
          ? "A new verification code has been sent."
          : "Verification code sent. Check your inbox and spam folder."
      );
    } catch {
      setError(
        "Could not reach the server"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp(
    event
  ) {
    event.preventDefault();

    await sendOtp();
  }

  async function handleRegister(
    event
  ) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (!/^\d{6}$/.test(otp)) {
      setError(
        "Enter the complete 6-digit verification code"
      );

      return;
    }

    if (expiresIn <= 0) {
      setError(
        "This code has expired. Request a new verification code."
      );

      return;
    }

    setLoading(true);

    try {
      const response =
        await fetch(
          `${API_BASE}/auth/register`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              name: name.trim(),

              email: email
                .trim()
                .toLowerCase(),

              password,
              role,
              otp,

              ...(role ===
              "student"
                ? { domain }
                : {}),
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            "Registration failed"
        );

        return;
      }

      setRegistered(true);

      setMessage(
        "Account verified and created successfully."
      );

      window.setTimeout(
        () =>
          navigate("/login"),
        1600
      );
    } catch {
      setError(
        "Could not reach the server"
      );
    } finally {
      setLoading(false);
    }
  }

  function returnToDetails() {
    if (
      loading ||
      registered
    ) {
      return;
    }

    setStep("details");
    setOtp("");
    setExpiresIn(0);
    setResendIn(0);
    setError("");
    setMessage("");
  }

  return (
    <div className="register-page">

      <div
        className="background-pattern"
        aria-hidden="true"
      >
        {Array.from({
          length: 180,
        }).map((_, index) => (
          <div
            className="watermark-cell"
            key={index}
          >
            <img
              src={logo}
              alt=""
              className="watermark-logo"
              draggable="false"
            />
          </div>
        ))}
      </div>

      <div className="register-card">
        <div className="register-content">

          {step === "details" ? (
            <>
              <h1>
                Create Account
              </h1>

              <p className="subtitle">
                Enter your details to
                receive a verification
                code
              </p>

              <form
                onSubmit={
                  handleSendOtp
                }
              >
                <div className="input-box">
                  <FaUser className="icon" />

                  <input
                    type="text"
                    placeholder="Full Name"
                    value={name}
                    onChange={(event) =>
                      setName(
                        event.target
                          .value
                      )
                    }
                    autoComplete="name"
                    maxLength={80}
                    required
                  />
                </div>

                <div className="input-box">
                  <FaEnvelope className="icon" />

                  <input
                    type="email"
                    placeholder={
                      role === "admin"
                        ? `Admin email (@${ADMIN_EMAIL_DOMAIN})`
                        : "Permanent email address"
                    }
                    value={email}
                    onChange={(event) =>
                      setEmail(
                        event.target
                          .value
                      )
                    }
                    autoComplete="email"
                    required
                  />
                </div>

                <p className="email-rule">
                  {role === "admin"
                    ? `Admin registration is restricted to @${ADMIN_EMAIL_DOMAIN}.`
                    : "Temporary and disposable email services are not accepted."}
                </p>

                <div className="input-box">
                  <FaLock className="icon" />

                  <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(event) =>
                      setPassword(
                        event.target
                          .value
                      )
                    }
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={72}
                    required
                  />
                </div>

                <div className="input-box">
                  <FaLock className="icon" />

                  <input
                    type="password"
                    placeholder="Confirm Password"
                    value={
                      confirmPassword
                    }
                    onChange={(event) =>
                      setConfirmPassword(
                        event.target
                          .value
                      )
                    }
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={72}
                    required
                  />
                </div>

                <div className="input-box select-box">
                  <FaUserTag className="icon" />

                  <select
                    value={role}
                    onChange={(event) => {
                      setRole(
                        event.target
                          .value
                      );

                      setError("");

                      if (
                        event.target
                          .value !==
                        "student"
                      ) {
                        setDomain("");
                      }
                    }}
                    aria-label="Account type"
                  >
                    <option value="student">
                      Student
                    </option>

                    <option value="admin">
                      Admin
                    </option>
                  </select>
                </div>

                {role === "student" && (
                  <div className="input-box select-box">
                    <FaGraduationCap className="icon" />

                    <select
                      value={domain}
                      onChange={(
                        event
                      ) =>
                        setDomain(
                          event.target
                            .value
                        )
                      }
                      aria-label="Student domain"
                      required
                    >
                      <option
                        value=""
                        disabled
                      >
                        Select your
                        domain
                      </option>

                      {DOMAINS.map(
                        (item) => (
                          <option
                            key={item}
                            value={item}
                          >
                            {item}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                )}

                {error && (
                  <p className="form-error">
                    {error}
                  </p>
                )}

                {message && (
                  <p className="form-success">
                    {message}
                  </p>
                )}

                <button
                  type="submit"
                  className="register-btn"
                  disabled={loading}
                >
                  {loading
                    ? "Sending code..."
                    : "Send verification code"}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="otp-icon-wrap">
                <FaShieldAlt />
              </div>

              <h1>
                Verify Email
              </h1>

              <p className="subtitle otp-subtitle">
                Enter the 6-digit code
                sent to

                <strong className="otp-email">
                  {email}
                </strong>
              </p>

              <form
                onSubmit={
                  handleRegister
                }
              >
                <div className="otp-box">
                  <input
                    className="otp-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    aria-label="Six-digit verification code"
                    placeholder="000000"
                    value={otp}
                    onChange={(event) => {
                      const digitsOnly =
                        event.target.value
                          .replace(
                            /\D/g,
                            ""
                          )
                          .slice(0, 6);

                      setOtp(
                        digitsOnly
                      );

                      setError("");
                    }}
                    maxLength={6}
                    autoFocus
                  />
                </div>

                <p
                  className={
                    expiresIn > 0
                      ? "otp-timer"
                      : "otp-timer otp-expired"
                  }
                >
                  {expiresIn > 0
                    ? `Code expires in ${formatCountdown(
                        expiresIn
                      )}`
                    : "Code expired — request a new one"}
                </p>

                {error && (
                  <p className="form-error">
                    {error}
                  </p>
                )}

                {message && (
                  <p className="form-success">
                    {message}
                  </p>
                )}

                <button
                  type="submit"
                  className="register-btn"
                  disabled={
                    loading ||
                    registered ||
                    expiresIn <= 0 ||
                    otp.length !== 6
                  }
                >
                  {loading
                    ? "Verifying..."
                    : registered
                      ? "Account created"
                      : "Verify & create account"}
                </button>

                <div className="otp-actions">

                  <button
                    type="button"
                    className="resend-btn"
                    disabled={
                      loading ||
                      registered ||
                      resendIn > 0
                    }
                    onClick={() =>
                      sendOtp({
                        isResend:
                          true,
                      })
                    }
                  >
                    {resendIn > 0
                      ? `Resend in ${resendIn}s`
                      : "Resend code"}
                  </button>

                  <button
                    type="button"
                    className="change-details-btn"
                    onClick={
                      returnToDetails
                    }
                    disabled={
                      loading ||
                      registered
                    }
                  >
                    Change details
                  </button>

                </div>
              </form>
            </>
          )}

          <div className="login-link">
            Already have an account?

            <Link to="/login">
              {" "}
              Log In
            </Link>
          </div>

        </div>
      </div>

    </div>
  );
};

export default Register;