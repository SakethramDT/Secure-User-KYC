import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import KYCStepper from "../components/KYCStepper";
import PersonalInfo from "../components/PersonalInfo";
import DocumentUpload from "../components/DocumentUpload";
import Schedule from "../components/Schedule";
import ReviewConfirm from "../components/ReviewConfirm";
import "../styles.css";

const KYCFlow = ({ username: initialUsername = "" }) => {
  const navigate = useNavigate();

  /* -------------------- Persistent Step Control -------------------- */
  const [step, setStep] = useState(() => {
    const savedStep = localStorage.getItem("kycStep");
    return savedStep ? parseInt(savedStep, 10) : 0;
  });

  const setAndPersistStep = (newStep) => {
    setStep(newStep);
    localStorage.setItem("kycStep", String(newStep));
  };

  /* -------------------- Form State -------------------- */
  const [formData, setFormData] = useState(() => {
    try {
      const saved = localStorage.getItem("kycFormData");
      if (saved) return JSON.parse(saved);
    } catch (err) {}
    return {
      username: initialUsername || localStorage.getItem("kycUsername") || "",
      name: "",
      email: "",
      phone: "",
      user_id: "",
      date_of_birth: "",
      id_issue_date: "",
      id_expiry_date: "",
      document_front: null,
      document_back: null,
      documentUrl: "",
      documentBackUrl: "",
      day_date: "",
      slot_index: null,
      time_label: "",
      officer_name: "",
      officer_id: "",
      priority: "",
    };
  });

  // persist safe data (excluding file objects)
  useEffect(() => {
    try {
      const clone = { ...formData };
      delete clone.document_front;
      delete clone.document_back;
      localStorage.setItem("kycFormData", JSON.stringify(clone));
      if (clone.username) localStorage.setItem("kycUsername", clone.username);
    } catch {}
  }, [formData]);

  /* -------------------- Step Handlers -------------------- */

  const handlePersonalInfoSubmit = (data) => {
    const finalUsername = data.username || formData.username || initialUsername;
    if (finalUsername) localStorage.setItem("kycUsername", finalUsername);

    setFormData((prev) => ({ ...prev, ...data, username: finalUsername }));
    setAndPersistStep(1);
  };

  const handleDocumentUploadComplete = (data) => {
    if (!data) return;
    setFormData((prev) => ({
      ...prev,
      ...data,
      document_front: data.document_front || prev.document_front,
      document_back: data.document_back || prev.document_back,
    }));
    setAndPersistStep(2);
  };

  const handleScheduleComplete = (data) => {
    setFormData((prev) => ({ ...prev, ...data }));
    setAndPersistStep(3);
  };

  const handleReviewSubmit = async () => {
    // In a real app, submit final formData to backend here
    resetFlow();
  };

  /* -------------------- Reset Flow -------------------- */
  const clearKycStorage = () => {
    const keys = [
      "kycStep",
      "kycUsername",
      "kycFormData",
      "roomId",
      "agent",
      "status",
      "videoRoomId",
      "socketId",
      "videoPeerId",
    ];
    for (const k of keys) {
      try {
        localStorage.removeItem(k);
      } catch {}
      try {
        sessionStorage.removeItem(k);
      } catch {}
    }
  };

  const resetFlow = () => {
    window.dispatchEvent(new Event("kyc:reset"));
    clearKycStorage();
    setFormData({
      username: "",
      name: "",
      email: "",
      phone: "",
      user_id: "",
      date_of_birth: "",
      id_issue_date: "",
      id_expiry_date: "",
      document_front: null,
      document_back: null,
      documentUrl: "",
      documentBackUrl: "",
      day_date: "",
      slot_index: null,
      time_label: "",
      officer_name: "",
      officer_id: "",
      priority: "",
    });
    setAndPersistStep(0);
    window.location.replace("/");
  };

  /* -------------------- UI -------------------- */
  return (
    <div className="kyc-flow-container">
      {/* ✅ KEEPING ORIGINAL HEADER EXACTLY SAME */}
      <header className="kyc-header">
        <div className="logofront">
          <img src="/UserVideoKyc/uae.png" alt="UAE Gov" />
        </div>

        <div className="stepper-header">
          <h2 className="stepper-title">KYC Verification</h2>
          <p className="stepper-subtitle">
            Complete Your KYC Verification In 4 Steps
          </p>
        </div>

        <div className="logoback">
          <img src="/UserVideoKyc/long.png" alt="Logo" />
        </div>
      </header>

      {/* ✅ MAIN CONTAINER */}
      <div className="kyc-container">
        <KYCStepper currentStep={step} />

        {step === 0 && (
          <PersonalInfo
            formData={formData}
            setFormData={setFormData}
            onNext={handlePersonalInfoSubmit}
          />
        )}

        {step === 1 && (
          <DocumentUpload
            formData={formData}
            setFormData={setFormData}
            onNext={handleDocumentUploadComplete}
            onBack={() => setAndPersistStep(0)}
          />
        )}

        {step === 2 && (
          <Schedule
            formData={formData}
            setFormData={setFormData}
            onNext={handleScheduleComplete}
            onBack={() => setAndPersistStep(1)}
          />
        )}

        {step === 3 && (
          <ReviewConfirm
            formData={formData}
            onBack={() => setAndPersistStep(2)}
            onSubmit={handleReviewSubmit}
          />
        )}
      </div>
    </div>
  );
};

export default KYCFlow;
