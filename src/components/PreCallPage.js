import React, { useState, useEffect } from 'react';
import { useParams,useNavigate } from 'react-router-dom';
import { Video, User, Shield, CheckCircle, Info, Lock, Clock, Globe } from 'lucide-react';
import VideoCallScreen from './VideoCall';
export default function VideoKYCJoinPage({ roomId: propRoomId, userId: propUserId }) {

  // read route params (support both snake_case and camelCase names)
  const params = useParams();
  const navigate = useNavigate();
  const routeRoomId = params?.room_id ?? params?.roomId ?? undefined;
  const routeUserId = params?.user_id ?? params?.userId ?? undefined;

  // component state (keeps the same names used in your UI)
  const [displayName, setDisplayName] = useState('');
  const [roomId, setRoomId] = useState(propRoomId ?? routeRoomId ?? '');
  const [userId, setUserId] = useState(propUserId ?? routeUserId ?? '');
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    // Only set mock values when no prop/route value was provided
    if (!roomId || !userId) {
      const mockRoomId = 'KYC-ROOM-2025-1013';
      const mockUserId = 'USR-AE-789456';

      setRoomId(prev => prev || mockRoomId);
      setUserId(prev => prev || mockUserId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  const handleJoinCall = () => {
    if (displayName.trim()) {
      setIsJoining(true);
      setTimeout(() => {
        setIsJoining(false);

        // ✅ Navigate to VideoCallScreen and pass the details
        navigate('/videocall', {
          state: {
            roomId,
            userId,
            displayName,
          },
        });
      }, 1500);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && displayName.trim() && !isJoining) {
      handleJoinCall();
    }
  };

  return (
    <div className="join-container">
      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        html, body {
          height: 100%;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        .join-container {
          width: 100vw;
          height: 100vh;
          background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        /* Top Header */
        .top-header {
          background: white;
          border-bottom: 2px solid rgba(203, 163, 68, 0.15);
          padding: 14px 0;
          flex-shrink: 0;
        }

        .header-content {
          max-width: 100%;
          padding: 0 40px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .brand-section {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .brand-logo {
          width: 44px;
          height: 44px;
          background: linear-gradient(135deg, #c39939ff, #e0bd6a);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .brand-logo svg {
          width: 22px;
          height: 22px;
          color: white;
        }

        .brand-info h1 {
          font-size: 18px;
          font-weight: 700;
          color: #1a1a2e;
          margin-bottom: 1px;
        }

        .brand-info p {
          font-size: 12px;
          color: #6b7280;
        }

        .security-badges {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 16px;
          font-size: 11px;
          font-weight: 600;
        }

        .badge-secure {
          background: rgba(74, 222, 128, 0.1);
          border: 1px solid rgba(74, 222, 128, 0.3);
          color: #047857;
        }

        .badge-secure svg {
          width: 13px;
          height: 13px;
          color: #10b981;
        }

        .badge-encrypted {
          background: rgba(203, 163, 68, 0.1);
          border: 1px solid rgba(203, 163, 68, 0.3);
          color: #92722d;
        }

        .badge-encrypted svg {
          width: 13px;
          height: 13px;
          color: #c39939ff;
        }

        /* Main Content Area */
        .main-content {
          flex: 1;
          display: flex;
          overflow: hidden;
        }

        .content-wrapper {
          width: 100%;
          max-width: 1300px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 50px;
          gap: 60px;
        }

        /* Left Side - Information */
        .info-side {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 32px;
          max-width: 580px;
        }

        .hero-section {
          animation: fadeInUp 0.6s ease-out;
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(15px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .hero-title {
          font-size: 44px;
          font-weight: 800;
          color: #1a1a2e;
          line-height: 1.2;
          margin-bottom: 16px;
        }

        .hero-title .highlight {
          background: linear-gradient(135deg, #b68d2eff, #e0bd6a);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .hero-description {
          font-size: 16px;
          color: #6b7280;
          line-height: 1.7;
        }

        .session-cards {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
          animation: fadeInUp 0.7s ease-out;
        }

        .session-card {
          background: white;
          border: 2px solid rgba(203, 163, 68, 0.15);
          border-radius: 16px;
          padding: 22px;
          transition: all 0.3s ease;
        }

        .session-card:hover {
          border-color: rgba(203, 163, 68, 0.4);
          box-shadow: 0 6px 20px rgba(203, 163, 68, 0.1);
          transform: translateY(-2px);
        }

        .card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .card-icon {
          width: 38px;
          height: 38px;
          background: linear-gradient(135deg, rgba(203, 163, 68, 0.15), rgba(203, 163, 68, 0.05));
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .card-icon svg {
          width: 19px;
          height: 19px;
          color: #b99133ff;
        }

        .card-label {
          font-size: 12px;
          font-weight: 700;
          color: #9ca3af;
          text-transform: uppercase;
          letter-spacing: 0.7px;
        }

        .card-value {
          font-size: 16px;
          font-weight: 700;
          color: #1a1a2e;
          font-family: 'Courier New', monospace;
          word-break: break-all;
        }

        .features-section {
          animation: fadeInUp 0.8s ease-out;
        }

        .features-title {
          font-size: 14px;
          font-weight: 700;
          color: #374151;
          margin-bottom: 16px;
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }

        .features-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .feature-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          background: white;
          border: 1px solid rgba(203, 163, 68, 0.12);
          border-radius: 10px;
          transition: all 0.3s ease;
        }

        .feature-item:hover {
          border-color: rgba(203, 163, 68, 0.3);
        }

        .feature-icon svg {
          width: 18px;
          height: 18px;
          color: #10b981;
          flex-shrink: 0;
        }

        .feature-text {
          font-size: 14px;
          color: #374151;
          font-weight: 500;
          line-height: 1.4;
        }

        /* Right Side - Join Form */
        .form-side {
          flex: 0 0 460px;
          display: flex;
          align-items: center;
          animation: fadeInRight 0.6s ease-out;
        }

        @keyframes fadeInRight {
          from {
            opacity: 0;
            transform: translateX(15px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .form-card {
          background: white;
          border-radius: 20px;
          padding: 44px 42px;
          width: 100%;
          box-shadow: 
            0 20px 60px rgba(203, 163, 68, 0.12),
            0 0 0 1px rgba(203, 163, 68, 0.08);
        }

        .form-header {
          text-align: center;
          margin-bottom: 36px;
        }

        .form-icon {
          width: 60px;
          height: 60px;
          background: linear-gradient(135deg, #c09737ff, #e0bd6a);
          border-radius: 15px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 18px;
          box-shadow: 0 6px 20px rgba(203, 163, 68, 0.25);
        }

        .form-icon svg {
          width: 30px;
          height: 30px;
          color: white;
        }

        .form-title {
          font-size: 26px;
          font-weight: 700;
          color: #1a1a2e;
          margin-bottom: 10px;
        }

        .form-subtitle {
          font-size: 15px;
          color: #6b7280;
        }

        .input-wrapper {
          margin-bottom: 24px;
        }

        .input-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 15px;
          font-weight: 600;
          color: #374151;
          margin-bottom: 10px;
        }

        .input-label svg {
          width: 17px;
          height: 17px;
          color: #ba9234ff;
        }

        .input-field {
          width: 100%;
          padding: 15px 19px;
          font-size: 16px;
          color: #1a1a2e;
          background: #f9fafb;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          transition: all 0.3s ease;
          font-weight: 500;
        }

        .input-field:focus {
          outline: none;
          background: white;
          border-color: #b58d2fff;
          box-shadow: 0 0 0 4px rgba(203, 163, 68, 0.1);
        }

        .input-field::placeholder {
          color: #9ca3af;
        }

        .info-banner {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 16px;
          background: linear-gradient(135deg, rgba(203, 163, 68, 0.05), rgba(203, 163, 68, 0.02));
          border-left: 3px solid #c39939ff;
          border-radius: 8px;
          margin-bottom: 24px;
        }

        .info-banner svg {
          width: 18px;
          height: 18px;
          color: #c39939ff;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .info-banner-text {
          font-size: 13px;
          color: #6b7280;
          line-height: 1.6;
        }

        .join-button {
          width: 100%;
          padding: 17px 30px;
          background: linear-gradient(135deg, #c39939ff, #e0bd6a);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 17px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 8px 24px rgba(203, 163, 68, 0.3);
          text-transform: uppercase;
          letter-spacing: 0.8px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 11px;
        }

        .join-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 12px 32px rgba(203, 163, 68, 0.4);
        }

        .join-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .join-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .join-button svg {
          width: 21px;
          height: 21px;
        }

       
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .form-footer {
          text-align: center;
          margin-top: 22px;
          font-size: 12px;
          color: #9ca3af;
          line-height: 1.5;
        }

        /* Mobile & Tablet Responsive */
        @media (max-width: 1024px) {
          .join-container {
            overflow-y: auto;
            height: auto;
            min-height: 100vh;
          }

          .main-content {
            overflow: visible;
          }

          .content-wrapper {
            flex-direction: column;
            padding: 40px 30px;
            gap: 40px;
          }

          .info-side {
            max-width: 100%;
          }

          .form-side {
            flex: 0 0 auto;
            width: 100%;
            max-width: 500px;
          }

          .hero-title {
            font-size: 32px;
          }

          .session-cards {
            grid-template-columns: 1fr;
          }

          .features-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .header-content {
            padding: 0 20px;
            flex-direction: column;
            gap: 10px;
            align-items: flex-start;
          }

          .security-badges {
            width: 100%;
            justify-content: flex-start;
          }

          .content-wrapper {
            padding: 30px 20px;
          }

          .hero-title {
            font-size: 28px;
          }

          .hero-description {
            font-size: 14px;
          }

          .form-card {
            padding: 30px 24px;
          }

          .form-title {
            font-size: 22px;
          }
        }

        /* Laptop Optimization (No scroll) */
        @media (min-width: 1025px) and (max-height: 900px) {
          .hero-title {
            font-size: 34px;
            margin-bottom: 12px;
          }

          .hero-description {
            font-size: 14px;
          }

          .session-cards,
          .features-grid {
            gap: 14px;
          }

          .session-card,
          .feature-item {
            padding: 14px;
          }

          .form-card {
            padding: 35px 34px;
          }

          .form-header {
            margin-bottom: 28px;
          }

          .input-wrapper {
            margin-bottom: 20px;
          }

          .info-banner {
            margin-bottom: 20px;
          }
        }

        @media (min-width: 1025px) and (max-height: 768px) {
          .hero-title {
            font-size: 30px;
          }

          .session-cards,
          .features-section {
            gap: 12px;
          }

          .features-grid {
            gap: 10px;
          }

          .form-card {
            padding: 28px 30px;
          }

          .form-icon {
            width: 50px;
            height: 50px;
            margin-bottom: 12px;
          }

          .form-title {
            font-size: 22px;
          }
        }
      `}</style>

      <div className="top-header">
        <div className="header-content">
          <div className="brand-section">
            <div className="brand-logo">
              <Shield />
            </div>
            <div className="brand-info">
              <h1>VideoKYC Portal</h1>
              <p>Secure Identity Verification</p>
            </div>
          </div>
          <div className="security-badges">
            <div className="badge badge-secure">
              <CheckCircle />
              <span>Verified Platform</span>
            </div>
            <div className="badge badge-encrypted">
              <Lock />
              <span>256-bit Encrypted</span>
            </div>
          </div>
        </div>
      </div>

      <div className="main-content">
        <div className="content-wrapper">
          <div className="info-side">
            <div className="hero-section">
              <h2 className="hero-title">
                Welcome to Your <span className="highlight">VideoKYC</span> Session
              </h2>
              <p className="hero-description">
                Complete your identity verification securely and conveniently from anywhere. 
                Our end-to-end encrypted platform ensures your data remains private and protected.
              </p>
            </div>

            <div className="session-cards">
              <div className="session-card">
                <div className="card-header">
                  <div className="card-icon">
                    <Video />
                  </div>
                  <div className="card-label">Room ID</div>
                </div>
                <div className="card-value">{roomId}</div>
              </div>

              <div className="session-card">
                <div className="card-header">
                  <div className="card-icon">
                    <User />
                  </div>
                  <div className="card-label">User ID</div>
                </div>
                <div className="card-value">{userId}</div>
              </div>
            </div>

            <div className="features-section">
              <h3 className="features-title">What to Expect</h3>
              <div className="features-grid">
                <div className="feature-item">
                  <div className="feature-icon">
                    <CheckCircle />
                  </div>
                  <span className="feature-text">End-to-end encrypted</span>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">
                    <CheckCircle />
                  </div>
                  <span className="feature-text">Recorded for audit trail</span>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">
                    <CheckCircle />
                  </div>
                  <span className="feature-text">UAE data compliant</span>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">
                    <CheckCircle />
                  </div>
                  <span className="feature-text">Professional agent</span>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">
                    <Clock />
                  </div>
                  <span className="feature-text">10-15 minutes average</span>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">
                    <Globe />
                  </div>
                  <span className="feature-text">English & Arabic</span>
                </div>
              </div>
            </div>
          </div>

          <div className="form-side">
            <div className="form-card">
              <div className="form-header">
                <div className="form-icon">
                  <Video />
                </div>
                <h3 className="form-title">Join Session</h3>
                <p className="form-subtitle">Enter your name to get started</p>
              </div>

              <div className="input-wrapper">
                <label className="input-label">
                  <User />
                  Display Name
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Enter your full name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onKeyPress={handleKeyPress}
                  maxLength={50}
                />
              </div>

              <div className="info-banner">
                <Info />
                <div className="info-banner-text">
                  Ensure you have your Emirates ID ready and are in a well-lit, quiet environment.
                </div>
              </div>

              <button 
                className="join-button"
                onClick={handleJoinCall}
                disabled={!displayName.trim() || isJoining}
              >
                {isJoining ? (
                  <>
                    <div></div>
                    Connecting...
                  </>
                ) : (
                  <>
                    <Video />
                    Join VideoKYC Call
                  </>
                )}
              </button>

              <p className="form-footer">
                By joining, you agree to our terms of service and privacy policy
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
