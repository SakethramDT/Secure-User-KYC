import React, { useState } from "react";
import KYCFlow from "./KYCFlow";

const Home = () => {
  const [activeView, setActiveView] = useState("kyc"); // 'kyc' or 'dashboard'

  return (
    <div className="home-container">
      {/* Header */}
      <header className="header">
        <div className="logo">🔒 DT-KYC</div>
        <div className="status">● System Online</div>
      </header>

      {/* Landing Cards */}
      <div className="main-content">
        <h1>Secure Video KYC Platform</h1>
        <p>Complete digital identity verification solution</p>

        <div className="cards">
          {[ 
            { icon: "📹", title: "Video Verification" },
            { icon: "✅", title: "Document Verification" },
            { icon: "🧑‍💼", title: "Agent Management" },
          ].map((card) => (
            <div className="card" key={card.title}>
              <div className="card-icon">{card.icon}</div>
              <h2>{card.title}</h2>
              <p>Feature enabled</p>
            </div>
          ))}
        </div>

        {/* Buttons act like tabs now */}
        <div className="buttons">
          <button onClick={() => setActiveView("kyc")}>
            📷 Customer KYC
          </button>
        </div>
      </div>

      {/* Dynamic Component Section */}
      <div className="kyc-container">
        {activeView === "kyc" && <KYCFlow />}
      </div>
    </div>
  );
};

export default Home;

