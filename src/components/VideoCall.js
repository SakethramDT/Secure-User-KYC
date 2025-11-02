// VideoCallScreen.jsx
import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Video, VideoOff, Mic, MicOff, Phone, Shield, User, CreditCard } from "lucide-react";
import io from "socket.io-client";
import toast from 'react-hot-toast';

const BASE_URL = process.env.REACT_APP_BACKEND_URL;
const SOCKET_URL = process.env.REACT_SOCKET_URL;

const VideoCallScreen = ({ role: propRole = "caller", onStatusChange }) => {
  const { state } = useLocation();
  const { roomId: stateRoomId, userId: stateUserId } = state || {};
  // allow role via URL query ?role=agent when testing two tabs
  const urlParams = new URLSearchParams(window.location.search);
  const roleFromUrl = urlParams.get("role");
  const role = roleFromUrl || propRole || "caller";

  const roomId = stateRoomId || urlParams.get("roomId") || "kyc-room-1";
  const userId = stateUserId || urlParams.get("userId") || `u_${Math.floor(Math.random() * 10000)}`;

  const [connectionState, setConnectionState] = useState("connecting");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [incomingHint, setIncomingHint] = useState("");
  const [participants, setParticipants] = useState([{ id: userId, name: `You (${userId})` }]);
  const [stage, setStage] = useState("in-call");
  const [availableCameras, setAvailableCameras] = useState([]); // [{ deviceId, label }]
  const [currentCameraId, setCurrentCameraId] = useState(null);
  const isMobile = /Mobi|Android/i.test(navigator.userAgent || "");

  const shownToastsRef = useRef(new Set());

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const incomingHintTimer = useRef(null);

  const rtcConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  // cleanup function
  const cleanup = () => {
    if (incomingHintTimer.current) {
      clearTimeout(incomingHintTimer.current);
      incomingHintTimer.current = null;
    }

    if (socketRef.current) {
      try {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
      } catch (e) { }
      socketRef.current = null;
    }

    if (pcRef.current) {
      try {
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.close();
      } catch (e) { }
      pcRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  };

  const endCall = () => {
    // notify room optionally
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("end-call", { roomId });
      socketRef.current.emit("leave", { roomId });
    }
    cleanup();
    setConnectionState("closed");
    setStage("verification");
  };

  const toggleMute = () => {
    const track = localStreamRef.current?.getAudioTracks()?.[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsMuted(!track.enabled);
    }
  };

  const toggleVideo = () => {
    const track = localStreamRef.current?.getVideoTracks()?.[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsVideoOff(!track.enabled);
    }
  };
   
  // init media, pc and socket
  useEffect(() => {
    let mounted = true;
    const pendingCandidates = [];

    const init = async () => {
      try {
        setConnectionState("getting_media");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: true,
        });
        if (!mounted) return;
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        // Peer connection
        pcRef.current = new RTCPeerConnection(rtcConfig);
        stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream));

        // Handle remote media
        pcRef.current.ontrack = event => {
          const remoteStream = event.streams[0];
          if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
            setConnectionState("connected");
          }
        };

        // ICE candidates out
        pcRef.current.onicecandidate = e => {
          if (e.candidate && socketRef.current?.connected) {
            socketRef.current.emit("ice-candidate", { roomId, userId, candidate: e.candidate });
          }
        };

        // ICE state monitoring
        pcRef.current.oniceconnectionstatechange = () => {
          const s = pcRef.current.iceConnectionState;
          if (s === "disconnected") setConnectionState("disconnected");
          if (s === "failed") pcRef.current.restartIce?.();
        };

        // setup socket
        socketRef.current = io(SOCKET_URL, {
          path: '/videokyc/socket.io',
          transports: ['websocket', 'polling'], // for debugging you can use ['polling','websocket']
          secure: true
        });
        // expose and debugging
        console.log('[CLIENT] BASE_URL=', BASE_URL, 'socket path=', socketRef.current._opts?.path);

        socketRef.current.on("connect", () => {
          socketRef.current.emit("join-room", { roomId, userId, role });
        });
        socketRef.current?.on('agent-captured', ({ type }) => {
          if (!type) return;
          // normalize and only allow the 3 types
          const key = type === 'face' ? 'face' : type === 'front_card' ? 'front_card' : type === 'back_card' ? 'back_card' : null;
          if (!key) return;
          
          if (shownToastsRef.current.has(key)) return; // avoid immediate repeat
          shownToastsRef.current.add(key);
          setTimeout(() => shownToastsRef.current.delete(key), 1000);
          if (key === 'face') toast.success('Face captured');
          if (key === 'front_card') toast.success('Front ID captured');
          if (key === 'back_card') toast.success('Back ID captured');

           
        });
 
        socketRef.current.on("joined", () => {
          // Safe to signal ready only after join confirmation
          socketRef.current.emit("ready", { roomId, userId });
          setConnectionState("waiting_for_offer");
        });

        // Offer from agent side
        socketRef.current.on("offer", async ({ offer }) => {
          try {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(offer));

            const answer = await pcRef.current.createAnswer();
            await pcRef.current.setLocalDescription(answer);
            socketRef.current.emit("answer", { answer, roomId, userId });

            // Drain any pending ICE candidates
            while (pendingCandidates.length) {
              const c = pendingCandidates.shift();
              await pcRef.current.addIceCandidate(c);
            }

            setConnectionState("connected");
          } catch (e) {
            console.error("Failed to handle offer:", e);
            setConnectionState("failed");
          }
        });

        socketRef.current.on("answer", async ({ answer }) => {
          // user never expects answer, ignore silently 
          console.log("User received unexpected answer — ignoring");
        });

        // incoming ICE from remote (agent)
        socketRef.current.on("ice-candidate", async ({ candidate }) => {
          if (!candidate) return;
          const c = new RTCIceCandidate(candidate);
          if (pcRef.current.remoteDescription) {
            await pcRef.current.addIceCandidate(c);
          } else {
            pendingCandidates.push(c);
          }
        });


        // AFTER:
        socketRef.current.on('call-ended', (data = {}) => {
          const { roomId: endedRoom, from } = data || {};
          console.log('call-ended received', { endedRoom, from, raw: data });
          // friendly UI note
          setIncomingHint("Agent ended the call — finishing verification...");
          // cleanup local resources and move to verification/thank-you
          cleanup();
          setConnectionState("closed");
          setStage("verification");

          if (incomingHintTimer.current) clearTimeout(incomingHintTimer.current);
          incomingHintTimer.current = setTimeout(() => setIncomingHint(""), 2500);
        });



        socketRef.current.on("user-disconnected", () => {
          setConnectionState("closed");
          cleanup();
        });

      } catch (err) {
        console.error("Init error:", err);
        setConnectionState("failed");
      }
    };

    init();

    return () => {
      mounted = false;
      try { socketRef.current?.off('agent-captured'); } catch (e) {}
      shownToastsRef.current.clear();
      cleanup();
    };
  }, [roomId, userId, role]);


  // expose onStatusChange callback if provided
  useEffect(() => {
    if (!onStatusChange) return;
    const handler = (status) => {
      if (status === "claim-to-review" && stage === "in-call") {
        endCall();
      }
    };
    onStatusChange(handler);
    return () => onStatusChange(null);
  }, [onStatusChange, stage]);

  const connectionStatusText =
    {
      connecting: "Connecting...",
      getting_media: "Accessing camera...",
      waiting_for_answer: "Waiting for Call...",
      connected: "Connected",
      closed: "Call ended",
      failed: "Connection failed",
    }[connectionState] || "Connecting...";

  // UI (keeps the second file's UI)
  return (
    <div className="video-call-container">
      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .video-call-container {
          width: 100vw;
          height: 100vh;
          background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
          display: flex;
          flex-direction: column;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          overflow: hidden;
        }

        /* Top Header */
        .vc-header {
          background: white;
          border-bottom: 2px solid rgba(203, 163, 68, 0.15);
          padding: 16px 40px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        }

        .vc-brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .vc-logo {
          width: 44px;
          height: 44px;
          background: linear-gradient(135deg, #cba344, #e0bd6a);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .vc-logo svg {
          width: 22px;
          height: 22px;
          color: white;
        }

        .vc-brand-text h1 {
          font-size: 18px;
          font-weight: 700;
          color: #1a1a2e;
          margin-bottom: 2px;
        }

        .vc-brand-text p {
          font-size: 12px;
          color: #6b7280;
        }

        .vc-header-right {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .vc-status {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: rgba(203, 163, 68, 0.1);
          border-radius: 20px;
        }

        .vc-status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }

        .vc-status-connected {
          background: #22c55e;
        }

        .vc-status-connecting {
          background: #f59e0b;
        }

        .vc-status-disconnected {
          background: #ef4444;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        .vc-status-text {
          font-size: 13px;
          font-weight: 600;
          color: #374151;
        }

        .vc-room-info {
          font-size: 13px;
          color: #6b7280;
          font-weight: 500;
        }

        /* Main Content */
        .vc-content {
          flex: 1;
          display: flex;
          padding: 20px;
          gap: 20px;
          overflow: hidden;
        }

        /* Video Grid */
        .vc-video-grid {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }

        .vc-video-box {
          background: #1a1a2e;
          border-radius: 16px;
          overflow: hidden;
          position: relative;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
          border: 2px solid rgba(203, 163, 68, 0.2);
        }

        .vc-video-label {
          position: absolute;
          top: 16px;
          left: 16px;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(10px);
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          color: white;
          z-index: 10;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .vc-video-label svg {
          width: 16px;
          height: 16px;
          color: #cba344;
        }

        .vc-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .vc-video-placeholder {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          background: rgba(0, 0, 0, 0.6);
          color: rgba(255, 255, 255, 0.8);
          gap: 12px;
        }

        .vc-video-placeholder svg {
          width: 48px;
          height: 48px;
          color: #cba344;
          opacity: 0.6;
        }

        .vc-video-placeholder-text {
          font-size: 15px;
          font-weight: 500;
        }

        .vc-ocr-hint {
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(203, 163, 68, 0.95);
          color: white;
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          z-index: 15;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        /* Right Sidebar */
        .vc-sidebar {
          width: 320px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          flex-shrink: 0;
        }

        .vc-card {
          background: white;
          border-radius: 14px;
          padding: 20px;
          border: 1px solid rgba(203, 163, 68, 0.15);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }

        .vc-card-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
        }

        .vc-card-icon {
          width: 36px;
          height: 36px;
          background: linear-gradient(135deg, rgba(203, 163, 68, 0.15), rgba(203, 163, 68, 0.05));
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .vc-card-icon svg {
          width: 18px;
          height: 18px;
          color: #cba344;
        }

        .vc-card-title {
          font-size: 14px;
          font-weight: 700;
          color: #1a1a2e;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .vc-instruction-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .vc-instruction-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          background: rgba(203, 163, 68, 0.05);
          border-radius: 8px;
          font-size: 13px;
          color: #374151;
          font-weight: 500;
        }

        .vc-instruction-number {
          width: 24px;
          height: 24px;
          background: linear-gradient(135deg, #cba344, #e0bd6a);
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          flex-shrink: 0;
        }

        /* Controls Bar */
        .vc-controls {
          padding: 20px 40px;
          background: white;
          border-top: 2px solid rgba(203, 163, 68, 0.15);
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 16px;
          flex-shrink: 0;
        }

        .vc-control-btn {
          width: 56px;
          height: 56px;
          background: rgba(203, 163, 68, 0.1);
          border: 2px solid rgba(203, 163, 68, 0.2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .vc-control-btn:hover {
          background: rgba(203, 163, 68, 0.2);
          border-color: #cba344;
          transform: scale(1.05);
        }

        .vc-control-btn svg {
          width: 24px;
          height: 24px;
          color: #1a1a2e;
        }

        .vc-control-btn.active {
          background: rgba(239, 68, 68, 0.1);
          border-color: #ef4444;
        }

        .vc-control-btn.active svg {
          color: #ef4444;
        }

        .vc-end-btn {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          border-color: #ef4444;
        }

        .vc-end-btn:hover {
          background: linear-gradient(135deg, #dc2626, #b91c1c);
          transform: scale(1.05);
        }

        .vc-end-btn svg {
          color: white;
        }

        /* Thank You Screen */
        .kyc-thankyou-screen {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
        }

        .kyc-container {
          background: white;
          border: 2px solid #cba344;
          border-radius: 20px;
          padding: 50px 60px;
          text-align: center;
          max-width: 500px;
          box-shadow: 0 20px 60px rgba(203, 163, 68, 0.15);
        }

        .kyc-title {
          color: #cba344;
          font-size: 32px;
          font-weight: 700;
          margin-bottom: 20px;
        }

        .kyc-message {
          color: #374151;
          font-size: 16px;
          margin-bottom: 12px;
          line-height: 1.6;
        }

        .kyc-note {
          color: #6b7280;
          font-size: 14px;
          margin-bottom: 32px;
        }

        .kyc-button {
          background: linear-gradient(135deg, #cba344, #e0bd6a);
          color: white;
          border: none;
          padding: 16px 36px;
          border-radius: 12px;
          cursor: pointer;
          font-size: 16px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          transition: all 0.3s ease;
          box-shadow: 0 8px 24px rgba(203, 163, 68, 0.3);
        }

        .kyc-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 32px rgba(203, 163, 68, 0.4);
        }

        .kyc-button:active {
          transform: translateY(0);
        }

        /* Responsive */
        @media (max-width: 1200px) {
          .vc-video-grid {
            grid-template-columns: 1fr;
          }

          .vc-sidebar {
            display: none;
          }
        }

        @media (max-width: 768px) {
          .vc-header {
            padding: 12px 20px;
          }

          .vc-content {
            padding: 12px;
          }

          .vc-controls {
            padding: 16px 20px;
          }

          .vc-control-btn {
            width: 48px;
            height: 48px;
          }

          .vc-control-btn svg {
            width: 20px;
            height: 20px;
          }
        }
      `}</style>

      {stage === "in-call" && (
        <>
          <div className="vc-header">
            <div className="vc-brand">
              <div className="vc-logo">
                <Shield />
              </div>
              <div className="vc-brand-text">
                <h1>VideoKYC Session</h1>
                <p>Secure Verification</p>
              </div>
            </div>
            <div className="vc-header-right">
              <div className="vc-status">
                <div
                  className={`vc-status-dot ${connectionState === "connected"
                    ? "vc-status-connected"
                    : connectionState === "closed" || connectionState === "failed"
                      ? "vc-status-disconnected"
                      : "vc-status-connecting"
                    }`}
                />
                <span className="vc-status-text">{connectionStatusText}</span>
              </div>
              <div className="vc-room-info">Room: {roomId}</div>
            </div>
          </div>

          <div className="vc-content">
            <div className="vc-video-grid">
              <div className="vc-video-box">
                <div className="vc-video-label">
                  <User />
                  <span>Agent</span>
                </div>
                <video ref={remoteVideoRef} autoPlay playsInline className="vc-video" />
                {!remoteVideoRef.current?.srcObject && (
                  <div className="vc-video-placeholder">
                    <Video />
                    <span className="vc-video-placeholder-text">Waiting for agent to join...</span>
                  </div>
                )}
                {incomingHint && <div className="vc-ocr-hint">{incomingHint}</div>}
              </div>

              <div className="vc-video-box">
                <div className="vc-video-label">
                  <User />
                  <span>You</span>
                </div>
                <video ref={localVideoRef} autoPlay playsInline muted className="vc-video" style={{ transform: 'scaleX(-1)' }} />
                {isVideoOff && (
                  <div className="vc-video-placeholder">
                    <VideoOff />
                    <span className="vc-video-placeholder-text">Camera is off</span>
                  </div>
                )}
              </div>
            </div>

            <div className="vc-sidebar">
              <div className="vc-card">
                <div className="vc-card-header">
                  <div className="vc-card-icon">
                    <CreditCard />
                  </div>
                  <div className="vc-card-title">Verification Steps</div>
                </div>
                <div className="vc-instruction-list">
                  <div className="vc-instruction-item">
                    <div className="vc-instruction-number">1</div>
                    <span>Show Emirates ID - Front Side</span>
                  </div>
                  <div className="vc-instruction-item">
                    <div className="vc-instruction-number">2</div>
                    <span>Show Emirates ID - Back Side</span>
                  </div>
                  <div className="vc-instruction-item">
                    <div className="vc-instruction-number">3</div>
                    <span>Show Your Face Clearly</span>
                  </div>
                </div>
              </div>

              <div className="vc-card">
                <div className="vc-card-header">
                  <div className="vc-card-icon">
                    <Shield />
                  </div>
                  <div className="vc-card-title">Tips</div>
                </div>
                <div className="vc-instruction-list">
                  <div className="vc-instruction-item">
                    Ensure good lighting
                  </div>
                  <div className="vc-instruction-item">
                    Hold ID steady and clear
                  </div>
                  <div className="vc-instruction-item">
                    Follow agent instructions
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="vc-controls">
            <button
              onClick={toggleMute}
              className={`vc-control-btn ${isMuted ? "active" : ""}`}
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <MicOff /> : <Mic />}
            </button>

            <button
              onClick={toggleVideo}
              className={`vc-control-btn ${isVideoOff ? "active" : ""}`}
              aria-label={isVideoOff ? "Start Video" : "Stop Video"}
            >
              {isVideoOff ? <VideoOff /> : <Video />}
            </button>

            <button onClick={endCall} className="vc-control-btn vc-end-btn" aria-label="End call">
              <Phone />
            </button>
          </div>
        </>
      )}

      {stage === "verification" && (
        <div className="kyc-thankyou-screen">
          <div className="kyc-container">
            <h2 className="kyc-title">KYC Completed Successfully!</h2>
            <p className="kyc-message">
              Thank you for completing your KYC verification. Your details have been securely verified.
            </p>
            <p className="kyc-note">
              You may now close this window or return to your dashboard.
            </p>
            <button
              className="kyc-button"
              onClick={() => (window.location.href = "/")}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoCallScreen;