import React, { useState, useEffect, useRef } from "react";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Users,
  MessageSquare,
  Monitor,
  MoreHorizontal,
} from "lucide-react";
import io from "socket.io-client";

const BASE_URL = process.env.REACT_APP_BACKEND_URL;

const VideoCallScreen = ({
  roomId,
  userId,
  role = "caller",
  onStatusChange,
}) => {
  const [connectionState, setConnectionState] = useState("connecting");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [remoteUserId, setRemoteUserId] = useState(null);
  const [stage, setStage] = useState("in-call");
  // state to show incoming hint
  const [incomingHint, setIncomingHint] = useState("");
  const incomingHintTimer = useRef(null);
  const [showParticipants, setShowParticipants] = useState(false);
  const [participants, setParticipants] = useState([
    { id: userId, name: `You (${userId})` },
  ]);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);

  const rtcConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ],
  };

  const cleanup = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (socketRef.current) {
      try {
        socketRef.current.removeAllListeners?.();
      } catch {}
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    // detach video elements to ensure devices fully release
    try {
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
    } catch {}
    try {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    } catch {}
  };

  const endCall = () => {
    cleanup();
    setConnectionState("closed");
    setStage("verification");
  };

  const toggleMute = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsMuted(!track.enabled);
    }
  };

  const toggleVideo = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsVideoOff(!track.enabled);
    }
  };

  useEffect(() => {
    if (onStatusChange) {
      const handleStatusUpdate = (status) => {
        if (status === "claim-to-review" && stage === "in-call") {
          endCall();
        }
      };
      onStatusChange(handleStatusUpdate);
      return () => onStatusChange(null);
    }
  }, [stage, onStatusChange, endCall]);

  useEffect(() => {
    init();

    const onGlobalReset = () => {
      cleanup();
    };
    window.addEventListener("kyc:reset", onGlobalReset);
    return () => {
      window.removeEventListener("kyc:reset", onGlobalReset);
      cleanup();
    };
  }, [roomId, userId, role]);

  // after socketRef.current is created / connected:
  useEffect(() => {
    if (!socketRef.current) return;
    const onHint = ({ from, message }) => {
      setIncomingHint(message);
      if (incomingHintTimer.current) clearTimeout(incomingHintTimer.current);
      // auto-hide after 1.5s
      incomingHintTimer.current = setTimeout(() => setIncomingHint(""), 1500);
    };
    socketRef.current.on("ocr-hint", onHint);
    return () => {
      socketRef.current?.off("ocr-hint", onHint);
      if (incomingHintTimer.current) clearTimeout(incomingHintTimer.current);
    };
  }, [socketRef.current]);
  const init = async () => {
    try {
      setConnectionState("getting_media");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      pcRef.current = new RTCPeerConnection(rtcConfig);
      stream
        .getTracks()
        .forEach((track) => pcRef.current.addTrack(track, stream));

      pcRef.current.ontrack = (event) => {
        const remoteStream = event.streams[0];
        if (remoteVideoRef.current)
          remoteVideoRef.current.srcObject = remoteStream;
        setConnectionState("connected");
        // Simulate adding a participant
        setParticipants((prev) => [
          ...prev,
          { id: "remote-user", name: "Remote Participant" },
        ]);
      };

      pcRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit("ice-candidate", {
            roomId,
            userId,
            candidate: event.candidate,
          });
        }
      };

      pcRef.current.oniceconnectionstatechange = () => {
        const state = pcRef.current.iceConnectionState;
        if (state === "failed") {
          console.warn("ICE connection failed, attempting restart...");
          pcRef.current.restartIce();
        }
      };

      socketRef.current = io(BASE_URL, { transports: ["websocket"] });

      socketRef.current.on("connect", () => {
        socketRef.current.emit("join-room", { roomId, userId, role });
      });

      socketRef.current.on("offer", async ({ offer, senderId }) => {
        if (role === "callee" && senderId !== userId && pcRef.current) {
          try {
            const state = pcRef.current.signalingState;
            if (state === "stable") {
              await pcRef.current.setRemoteDescription(
                new RTCSessionDescription(offer)
              );
              const answer = await pcRef.current.createAnswer();
              await pcRef.current.setLocalDescription(answer);
              socketRef.current.emit("answer", { answer, roomId, userId });
              console.log("📨 Answer sent");
            } else {
              console.warn(
                `⚠️ Skipping setRemoteDescription(offer); signaling state: '${state}'`
              );
            }
          } catch (err) {
            console.error("❌ Failed to handle incoming offer:", err);
          }
        }
      });

      socketRef.current.on("answer", async ({ answer, senderId }) => {
        if (senderId !== userId && pcRef.current) {
          try {
            const state = pcRef.current.signalingState;
            if (state === "have-local-offer") {
              await pcRef.current.setRemoteDescription(
                new RTCSessionDescription(answer)
              );
              console.log("✅ Remote answer set successfully");
            } else {
              console.warn(
                `⚠️ Skipping setRemoteDescription(answer); state is '${state}'`
              );
            }
          } catch (err) {
            console.error("❌ Failed to set remote answer:", err);
          }
        }
      });

      socketRef.current.on("ice-candidate", async ({ candidate, senderId }) => {
        if (
          senderId !== userId &&
          candidate &&
          pcRef.current &&
          pcRef.current.signalingState !== "closed"
        ) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error("Error adding ICE candidate:", e);
          }
        } else {
          console.warn(
            "Skipping ICE candidate: connection closed or invalid state"
          );
        }
      });

      if (role === "caller") {
        socketRef.current.on("ready", async ({ userId: remoteId }) => {
          setRemoteUserId(remoteId);
          if (pcRef.current.signalingState === "stable") {
            try {
              const offer = await pcRef.current.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
              });
              await pcRef.current.setLocalDescription(offer);
              socketRef.current.emit("offer", { offer, roomId, userId });
              setConnectionState("waiting_for_answer");
              console.log("📨 Offer sent");
            } catch (err) {
              console.error("Failed to create/send offer:", err);
            }
          } else {
            console.warn(
              "⚠️ Cannot send offer, signaling state:",
              pcRef.current.signalingState
            );
          }
        });
      }
    } catch (error) {
      console.error("Initialization error:", error);
      setConnectionState("failed");
    }
  };

  const connectionStatusText =
    {
      connecting: "Connecting...",
      getting_media: "Accessing camera...",
      waiting_for_answer: "Waiting for Call...",
      connected: "Connected",
      closed: "Call ended",
      failed: "Connection failed",
    }[connectionState] || "Connecting...";

  return (
    <div className="video-call-container">
      <style jsx>{`
        .video-call-container {
          height: 100vh;
          background-color: #1c1f2e;
          display: flex;
          flex-direction: column;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            Oxygen, Ubuntu, sans-serif;
          color: white;
          position: relative;
        }

        .top-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 24px;
          background-color: rgba(0, 0, 0, 0.3);
          z-index: 10;
        }

        .connection-status {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
        }

        .status-indicator {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }

        .status-connected {
          background-color: #22c55e;
        }

        .status-connecting {
          background-color: #f59e0b;
        }

        .status-disconnected {
          background-color: #ef4444;
        }

        .room-info {
          font-size: 14px;
          color: #d1d5db;
        }

        .video-content {
          flex: 1;
          display: flex;
          position: relative;
          overflow: hidden;
        }

        .main-video {
          flex: 1;
          display: flex;
          justify-content: center;
          align-items: center;
          background-color: #0f1117;
          position: relative;
        }

        .remote-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .local-video-container {
          position: absolute;
          bottom: 20px;
          right: 20px;
          width: 240px;
          height: 135px;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          border: 2px solid rgba(255, 255, 255, 0.1);
          background-color: #2d2f3e;
          z-index: 5;
        }

        .local-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transform: scaleX(-1);
        }

        .video-overlay {
          position: absolute;
          inset: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .controls-container {
          padding: 16px 24px;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 16px;
          background-color: rgba(0, 0, 0, 0.3);
        }

        .control-button {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          padding: 8px;
          border-radius: 8px;
          transition: background-color 0.2s;
        }

        .control-button:hover {
          background-color: rgba(255, 255, 255, 0.1);
        }

        .control-button.active {
          background-color: rgba(255, 255, 255, 0.2);
        }

        .control-icon {
          width: 20px;
          height: 20px;
        }

        .control-label {
          font-size: 12px;
          margin-top: 4px;
        }

        .end-call-button {
          background-color: #ef4444;
          border-radius: 50%;
          width: 56px;
          height: 56px;
          display: flex;
          justify-content: center;
          align-items: center;
          border: none;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .end-call-button:hover {
          background-color: #dc2626;
        }

        // .participants-panel {
        //   position: absolute;
        //   top: 0;
        //   right: 0;
        //   width: 300px;
        //   height: 100%;
        //   background-color: #252836;
        //   z-index: 20;
        //   box-shadow: -4px 0 12px rgba(0, 0, 0, 0.3);
        //   transform: translateX(${showParticipants ? "0" : "100%"});
        //   transition: transform 0.3s ease;
        //   display: flex;
        //   flex-direction: column;
        // }

        .participants-header {
          padding: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .participants-list {
          flex: 1;
          padding: 16px;
          overflow-y: auto;
        }

        .participant-item {
          display: flex;
          align-items: center;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 8px;
          background-color: rgba(255, 255, 255, 0.05);
        }

        .participant-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background-color: #4f46e5;
          display: flex;
          justify-content: center;
          align-items: center;
          margin-right: 12px;
          font-weight: bold;
        }

        .verification-screen {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          flex: 1;
          background-color: #1c1f2e;
          color: white;
        }

        .spinner {
          border: 3px solid rgba(255, 255, 255, 0.1);
          border-radius: 50%;
          border-top: 3px solid #4f46e5;
          width: 50px;
          height: 50px;
          animation: spin 1s linear infinite;
          margin-top: 24px;
        }

        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
        .vc-ocr-status {
          position: absolute;
          bottom: 60px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.7);
          color: #fff;
          padding: 8px 16px;
          border-radius: 20px;
          z-index: 20;
          font-size: 14px;
          white-space: nowrap;
        }
      `}</style>

      {stage === "in-call" && (
        <>
          <div className="top-bar">
            <div className="connection-status">
              <div
                className={`status-indicator ${
                  connectionState === "connected"
                    ? "status-connected"
                    : connectionState === "closed" ||
                      connectionState === "failed"
                    ? "status-disconnected"
                    : "status-connecting"
                }`}
              />
              <span>{connectionStatusText}</span>
            </div>
            <div className="room-info">Room: {roomId}</div>
            {/* <button
              className="control-button"
              onClick={() => setShowParticipants(!showParticipants)}
            >
              <Users className="control-icon" />
              <span className="control-label">Participants</span>
            </button> */}
          </div>

          <div className="video-content">
            <div className="main-video">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="remote-video"
              />

              {!remoteVideoRef.current?.srcObject && (
                <div className="video-overlay">
                  <div className="text-center">
                    <div className="text-xl">
                      Waiting for participant to join
                    </div>
                    <div className="text-gray-400 mt-2">
                      You're the first one here
                    </div>
                  </div>
                </div>
              )}

              {incomingHint && (
                <div className="vc-ocr-status">{incomingHint}</div>
              )}
              <div className="local-video-container">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="local-video"
                />
                {isVideoOff && (
                  <div className="video-overlay">
                    <VideoOff size={24} />
                  </div>
                )}
              </div>
            </div>

            {/* <div
              className={`participants-panel ${showParticipants ? "open" : ""}`}
            >
              <div className="participants-header">
                <h3>Participants ({participants.length})</h3>
                <button onClick={() => setShowParticipants(false)}>×</button>
              </div>
              <div className="participants-list">
                {participants.map((participant) => (
                  <div key={participant.id} className="participant-item">
                    <div className="participant-avatar">
                      {participant.name.charAt(0).toUpperCase()}
                    </div>
                    <div>{participant.name}</div>
                  </div>
                ))}
              </div>
            </div> */}
          </div>

          <div className="controls-container">
            <button
              onClick={toggleMute}
              className={`control-button ${isMuted ? "active" : ""}`}
            >
              {isMuted ? (
                <MicOff className="control-icon" />
              ) : (
                <Mic className="control-icon" />
              )}
              <span className="control-label">
                {isMuted ? "Unmute" : "Mute"}
              </span>
            </button>

            <button
              onClick={toggleVideo}
              className={`control-button ${isVideoOff ? "active" : ""}`}
            >
              {isVideoOff ? (
                <VideoOff className="control-icon" />
              ) : (
                <Video className="control-icon" />
              )}
              <span className="control-label">
                {isVideoOff ? "Start Video" : "Stop Video"}
              </span>
            </button>

            <button onClick={endCall} className="end-call-button">
              <PhoneOff size={24} />
            </button>
          </div>
        </>
      )}

      {stage === "verification" && (
        <div className="verification-screen">
          <h2 className="text-2xl font-semibold">Verification in Progress</h2>
          <p className="text-gray-400 mt-2">
            Please wait while we verify your session...
          </p>
          <div className="spinner"></div>
        </div>
      )}
    </div>
  );
};

export default VideoCallScreen;
