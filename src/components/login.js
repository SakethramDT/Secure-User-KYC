import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./login.css";

const BASE_URL = process.env.REACT_APP_BACKEND_URL;

const Login = ({ setLoggedInUser }) => {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError("Please Enter Your Username");
      return;
    }

    try {
      localStorage.clear();
      localStorage.setItem("kycUsername", username);

      const res = await fetch(`${BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });

      const data = await res.json();
      if (!data.user) throw new Error(data.error || "Login failed");

      setLoggedInUser(data.user);
      navigate("/kyc", { state: { username } });
    } catch (err) {
      console.error("Login Error:", err);
      setError(err.message);
      localStorage.clear();
    }
  };

  return (
    <div className="login-container">
      <div className="overlay" />
      <div className="login-card">
        <div className="login-header">
          <img src="/image.png" alt="Portal Logo" className="login-logo" />
          <h2 className="login-title">KYC User Portal</h2>
          <p className="login-subtitle">Secure Verification Gateway</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <input
            type="text"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={`login-input ${error ? "input-error" : ""}`}
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="login-button">
            Continue →
          </button>
        </form>

        <div className="login-footer">
          <p>
            Need help? <a href="#">Contact Support</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
