// ReviewConfirm.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./ReviewConfirm.css";

/**
 * ReviewConfirm
 *
 * Props:
 *  - formData: object (wizard form state)
 *  - setFormData: function to update parent form state
 *  - onBack: callback to navigate to previous step
 *
 * This component will:
 *  - prefer server-authoritative values if set in formData (e.g. after booking),
 *  - fall back to localStorage draft 'kyc_formdata' if images are missing,
 *  - display images stored as data URIs (base64),
 *  - build payload including user fields and individual document fields and call POST /api/book,
 *  - merge server response into formData.
 */

/* Helpers */

// safe check for data url
const isDataUrl = (s) => typeof s === "string" && s.startsWith("data:");

// try to repair raw base64 by prefixing a reasonable mime if missing
const safeImgSrc = (s) => {
  if (!s || typeof s !== "string") return null;
  if (isDataUrl(s)) return s;
  // if looks like plain base64 (no commas, no whitespace), assume jpeg
  const plainBase64 = s.replace(/\s/g, "");
  if (/^[A-Za-z0-9+/=]+$/.test(plainBase64) && plainBase64.length > 100) {
    return `data:image/jpeg;base64,${plainBase64}`;
  }
  return null;
};

// Parse a time part like "09:30", "9:30 AM", "09:30 PM" into an ISO datetime using day_date.
const parseStartIso = (dayDate, timePart) => {
  if (!dayDate || !timePart) return null;
  try {
    const cleaned = timePart.trim();
    if (cleaned.includes("T")) {
      const d = new Date(cleaned);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  } catch (e) { /* ignore */ }

  try {
    const maybe = new Date(`${dayDate} ${timePart}`);
    if (!Number.isNaN(maybe.getTime())) return maybe.toISOString();
  } catch (e) { /* ignore */ }

  const hhmm = timePart.match(/(\d{1,2}):(\d{2})/);
  if (hhmm) {
    const hh = hhmm[1].padStart(2, "0");
    const mm = hhmm[2];
    const isoLocal = `${dayDate}T${hh}:${mm}:00`;
    try {
      const d = new Date(isoLocal);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    } catch (e) { /* ignore */ }
  }

  return null;
};

export default function ReviewConfirm({ formData = {}, onBack = () => {}, setFormData }) {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successModal, setSuccessModal] = useState(false);

  // Merge draft from localStorage on mount if images or documents are missing
  useEffect(() => {
    try {
      const hasFront = !!formData.document_front_base64 || (Array.isArray(formData.documents) && formData.documents.find(d => d.type === "front"));
      const hasBack = !!formData.document_back_base64 || (Array.isArray(formData.documents) && formData.documents.find(d => d.type === "back"));

      if (!hasFront || !hasBack) {
        const raw = localStorage.getItem("kyc_formdata");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof setFormData === "function") {
            const needsMerge =
              (!hasFront && parsed.document_front_base64) ||
              (!hasBack && parsed.document_back_base64) ||
              (!Array.isArray(formData.documents) || formData.documents.length === 0) && Array.isArray(parsed.documents) && parsed.documents.length > 0;

            if (needsMerge) {
              setFormData(prev => ({ ...(prev || {}), ...(parsed || {}) }));
            }
          }
        }
      }
    } catch (e) {
      // ignore localStorage parsing errors
      // eslint-disable-next-line no-console
      console.warn("Failed to load draft from localStorage", e);
    }
    // run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Extract display values (prefer server-side authoritative values if merged in)
  const {
    name,
    username,
    email,
    day_date,
    time_label,
    officer_name,
    officer_id,
    assigned_agent_username,
    assigned_agent_id,
    user_id,
    date_of_birth,
    gender,
    nationality,
    id_number,
    document_front_base64,
    document_back_base64,
    documents = [],
    slot_index
  } = formData || {};

  const displayOfficerName = officer_name || assigned_agent_username || "To be assigned";
  const displayOfficerId = officer_id || assigned_agent_id || "—";

  // compute image sources (prefer top-level convenience fields, then documents array)
  const frontCandidate =
    document_front_base64 ||
    (Array.isArray(documents) && documents.find(d => d.type === "front")?.base64) ||
    (Array.isArray(documents) && documents.find(d => d.type === "front")?.url) ||
    null;
  const backCandidate =
    document_back_base64 ||
    (Array.isArray(documents) && documents.find(d => d.type === "back")?.base64) ||
    (Array.isArray(documents) && documents.find(d => d.type === "back")?.url) ||
    null;

  const frontSrc = safeImgSrc(frontCandidate);
  const backSrc = safeImgSrc(backCandidate);

  const formatDate = (isoDate) => {
    if (!isoDate) return "—";
    try {
      const d = new Date(isoDate.length === 10 ? `${isoDate}T00:00:00` : isoDate);
      return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    } catch {
      return isoDate;
    }
  };

  const formatDateTime = (isoDate, timeLabel) => {
    if (!isoDate) return "Not selected";
    try {
      const d = new Date(isoDate.length === 10 ? `${isoDate}T00:00:00` : isoDate);
      const dateStr = d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
      return timeLabel ? `${dateStr} ${timeLabel}` : dateStr;
    } catch {
      return isoDate;
    }
  };

  const handleSchedule = async () => {
    setErrorMsg(null);
    setLoading(true);

    try {
      if (!user_id || !day_date || !time_label) {
        setErrorMsg("Missing required details (user_id, date, or time).");
        setLoading(false);
        return;
      }

      // parse time label like "09:30 AM - 10:00 AM" or "09:30 - 10:00"
      const parts = time_label.split("-").map(p => p.trim());
      const startPart = parts[0];
      const endPart = parts[1];

      const startIso = parseStartIso(day_date, startPart);
      if (!startIso) {
        setErrorMsg("Unable to parse selected time. Please reselect the slot.");
        setLoading(false);
        return;
      }

      let duration_minutes = 30;
      if (endPart) {
        const endIsoCandidate = parseStartIso(day_date, endPart);
        if (endIsoCandidate) {
          const durationMs = new Date(endIsoCandidate).getTime() - new Date(startIso).getTime();
          if (durationMs > 0) duration_minutes = Math.round(durationMs / 60000);
        }
      }

      // Build individual document fields (prefer top-level convenience fields, then fallback to documents array)
      let user_document_front_base64 = document_front_base64 || null;
      let user_document_back_base64 = document_back_base64 || null;

      if ((!user_document_front_base64 || !user_document_back_base64) && Array.isArray(documents) && documents.length) {
        for (const d of documents) {
          if (!d || !d.type) continue;
          const t = (d.type || '').toString().toLowerCase();
          const b64 = d.base64 || d.url || null;
          if (!b64) continue;

          if (!user_document_front_base64 && (t === 'front' || t === 'document_front' || t === 'user_document_front')) {
            user_document_front_base64 = b64;
          } else if (!user_document_back_base64 && (t === 'back' || t === 'document_back' || t === 'user_document_back')) {
            user_document_back_base64 = b64;
          }
        }
      }

      const payload = {
        user_id,
        username,
        name,
        email,
        date_of_birth,
        gender,
        nationality,
        id_number,
        start_time: startIso,
        duration_minutes,
        slot_index: slot_index || null,
        day_date,
        // individual document fields (may be null if missing)
        user_document_front_base64,
        user_document_back_base64
      };

      const base = process.env.REACT_APP_BACKEND_URL || "";
      const res = await fetch(`${base}/api/book`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Idempotency-Key": `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
        },
        body: JSON.stringify(payload)
      });

      if (res.status === 201 || res.status === 200) {
        const data = await res.json();

        // Merge server authoritative values into formData
        if (typeof setFormData === "function") {
          setFormData(prev => {
            const merged = { ...(prev || {}) };

            // appointment + agent
            if (data.appointment) merged.appointment = data.appointment;
            if (data.assigned_agent_id) merged.assigned_agent_id = data.assigned_agent_id;
            if (data.assigned_agent_username) merged.assigned_agent_username = data.assigned_agent_username;
            merged.status = "scheduled";

            // server may return user_documents object with individual fields
            if (data.user_documents && typeof data.user_documents === 'object') {
              merged.user_documents = {
                ...(merged.user_documents || {}),
                ...data.user_documents
              };

              // update top-level convenience fields if present
              if (data.user_documents.user_document_front_base64) merged.document_front_base64 = data.user_documents.user_document_front_base64;
              if (data.user_documents.user_document_back_base64) merged.document_back_base64 = data.user_documents.user_document_back_base64;
            }

            // update localStorage authoritative draft
            try {
              localStorage.setItem("kyc_formdata", JSON.stringify(merged));
            } catch (e) { /* ignore */ }

            return merged;
          });
        }

        setSuccessModal(true);
      } else {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body.error || `Failed to schedule (code ${res.status}).`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Schedule error:", err);
      setErrorMsg("Network/server error while scheduling appointment.");
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setSuccessModal(false);
    // go to a summary or login page as needed
    navigate("/login");
  };

  return (
    <div className="rc-wrapper">
      <div className="rc-header">
        <h2>Review & Confirm</h2>
      </div>

      <div className="rc-cards">
        <div className="rc-card rc-card--left">
          <div className="rc-card-title"><span>Customer Details</span></div>
          <div className="rc-card-body">
            <dl>
              <dt>Name</dt><dd>{name || "—"}</dd>
              <dt>Email</dt><dd>{email || "—"}</dd>
              <dt>ID</dt><dd>{user_id || "—"}</dd>
              <dt>Date of Birth</dt><dd>{formatDate(date_of_birth)}</dd>
              <dt>Gender</dt><dd>{gender || "—"}</dd>
              <dt>Nationality</dt><dd>{nationality || "—"}</dd>
            </dl>
          </div>
        </div>

        <div className="rc-card rc-card--right">
          <div className="rc-card-title"><span>Session Details</span></div>
          <div className="rc-card-body">
            <dl>
              <dt>Scheduled Date & Time</dt>
              <dd>{formatDateTime(day_date, time_label)}</dd>

              <dt>Documents</dt>
              <dd>
                <div className="rc-docs">
                  <div className="rc-doc-item">
                    <div className="rc-doc-label">Front</div>
                    {frontSrc ? (
                      <img src={frontSrc} alt="Front Document" className="rc-doc-img" />
                    ) : (
                      <div className="rc-doc-placeholder">No image</div>
                    )}
                  </div>
                  <div className="rc-doc-item">
                    <div className="rc-doc-label">Back</div>
                    {backSrc ? (
                      <img src={backSrc} alt="Back Document" className="rc-doc-img" />
                    ) : (
                      <div className="rc-doc-placeholder">No image</div>
                    )}
                  </div>
                </div>
              </dd>
            </dl>
          </div>
        </div>
      </div>

      {errorMsg && <div style={{ color: "red", marginTop: 8 }}>{errorMsg}</div>}

      <div className="rc-actions">
        <button className="rc-btn rc-btn--secondary" onClick={onBack} disabled={loading}>
          Previous
        </button>
        <button className="rc-btn rc-btn--primary" onClick={handleSchedule} disabled={loading}>
          {loading ? "Scheduling..." : "Schedule Session"}
        </button>
      </div>

      {/* Success Modal */}
      {successModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3> Appointment Scheduled Successfully!</h3>
            <p>Your video KYC session has been booked for:</p>
            <p><strong>{formatDateTime(day_date, time_label)}</strong></p>
            <button onClick={closeModal} className="rc-btn rc-btn--primary">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
