import React, { useState, useEffect } from "react";
import { CheckCircle, Calendar, Clock, User, Mail, CreditCard, Globe, Users, FileText, AlertCircle } from "lucide-react";

/* Helpers (unchanged) */
const isDataUrl = (s) => typeof s === "string" && s.startsWith("data:");

const safeImgSrc = (s) => {
  if (!s || typeof s !== "string") return null;
  if (isDataUrl(s)) return s;
  const plainBase64 = s.replace(/\s/g, "");
  if (/^[A-Za-z0-9+/=]+$/.test(plainBase64) && plainBase64.length > 100) {
    return `data:image/jpeg;base64,${plainBase64}`;
  }
  return null;
};

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

async function scheduleAppointment(baseUrl, payload, { timeoutMs = 20000 } = {}) {
  const base = (baseUrl || "").replace(/\/+$/, "");
  const url = `${base}/api/book`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const idempotencyKey = payload.idempotencyKey || `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": idempotencyKey
      },
      credentials: "include",
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);
    const raw = await res.text().catch(() => "");
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = null; }

    if (!res.ok) {
      const errMsg = parsed?.error || parsed?.message || raw || `HTTP ${res.status}`;
      const err = new Error(errMsg);
      err.status = res.status;
      err.response = parsed || raw;
      throw err;
    }
    return parsed;
  } catch (err) {
    if (err.name === "AbortError") {
      const e = new Error("Request timed out");
      e.isTimeout = true;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export default function ReviewConfirm({ formData = {}, onBack = () => {}, setFormData }) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successModal, setSuccessModal] = useState(false);

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
              ((!Array.isArray(formData.documents) || formData.documents.length === 0) && Array.isArray(parsed.documents) && parsed.documents.length > 0);

            if (needsMerge) {
              setFormData(prev => ({ ...(prev || {}), ...(parsed || {}) }));
            }
          }
        }
      }
    } catch (e) {
      console.warn("Failed to load draft from localStorage", e);
    }
  }, []);

  const {
    name, username, email, day_date, time_label, officer_name, officer_id,
    assigned_agent_username, assigned_agent_id, user_id, date_of_birth,
    gender, nationality, id_number, document_front_base64, document_back_base64,
    documents = [], slot_index
  } = formData || {};

  const frontCandidate = document_front_base64 || (Array.isArray(documents) && documents.find(d => d.type === "front")?.base64) || null;
  const backCandidate = document_back_base64 || (Array.isArray(documents) && documents.find(d => d.type === "back")?.base64) || null;
  const frontSrc = safeImgSrc(frontCandidate);
  const backSrc = safeImgSrc(backCandidate);

  const formatDate = (isoDate) => {
    if (!isoDate) return "Not provided";
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
      const dateStr = d.toLocaleDateString(undefined, { weekday: 'long', year: "numeric", month: "long", day: "numeric" });
      return { date: dateStr, time: timeLabel || "Time not specified" };
    } catch {
      return { date: isoDate, time: timeLabel || "" };
    }
  };

  const handleSchedule = async () => {
    setErrorMsg(null);
    setLoading(true);

    try {
      if (!user_id) {
        setErrorMsg("Missing user ID. Please login or provide user information.");
        setLoading(false);
        return;
      }
      if (!day_date || !time_label) {
        setErrorMsg("Please select date and time for the session.");
        setLoading(false);
        return;
      }

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
        user_id, username, name, email, date_of_birth, gender, nationality, id_number,
        start_time: startIso, duration_minutes, slot_index: slot_index || null, day_date,
        user_document_front_base64, user_document_back_base64,
        idempotencyKey: `rc_${user_id}_${(new Date(startIso)).getTime()}`
      };

      const envBase = process.env.REACT_APP_BACKEND_URL || "";
      const result = await scheduleAppointment(envBase, payload, { timeoutMs: 20000 });

      if (typeof setFormData === "function") {
        setFormData(prev => {
          const merged = { ...(prev || {}) };
          if (result.appointment) merged.appointment = result.appointment;
          if (result.assigned_agent_id) merged.assigned_agent_id = result.assigned_agent_id;
          if (result.assigned_agent_username) merged.assigned_agent_username = result.assigned_agent_username;
          merged.status = "scheduled";

          if (result.user_documents && typeof result.user_documents === 'object') {
            merged.user_documents = { ...(merged.user_documents || {}), ...result.user_documents };
            if (result.user_documents.user_document_front_base64) merged.document_front_base64 = result.user_documents.user_document_front_base64;
            if (result.user_documents.user_document_back_base64) merged.document_back_base64 = result.user_documents.user_document_back_base64;
          }

          try { localStorage.setItem("kyc_formdata", JSON.stringify(merged)); } catch (e) { }
          return merged;
        });
      }

      setSuccessModal(true);
    } catch (err) {
      console.error("Schedule error:", err);
      if (err?.isTimeout) {
        setErrorMsg("Request timed out. Please try again.");
      } else if (err?.status === 400 && err?.response) {
        setErrorMsg(err.response.error || err.response.message || `Failed to schedule (400)`);
      } else {
        setErrorMsg(err.message || "Network/server error while scheduling appointment.");
      }
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    // hide the modal immediately
    setSuccessModal(false);

    // Try to close the window/tab. Many browsers only allow window.close()
    // for windows opened by script. If that fails, try to go back, then fall back to homepage.
    // Small timeout to allow modal to visually close first.
    setTimeout(() => {
      try {
        window.close();
        // If window didn't close (most likely), attempt to navigate back or to root
        setTimeout(() => {
          // `window.closed` can be unreliable, so try history or location fallback
          if (window.history && window.history.length > 1) {
            window.history.back();
          } else {
            // change this to a safe route in your app if you don't want to send people home
            window.location.href = '/';
          }
        }, 200);
      } catch (e) {
        // fallback navigation
        if (window.history && window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = '/';
        }
      }
    }, 50);
  };

  const scheduleInfo = formatDateTime(day_date, time_label);

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.headerTitle}>Review & Confirm</h2>
        <p style={styles.headerSubtitle}>Please review your details before scheduling your KYC session</p>
      </div>

      {/* Appointment Highlight Card */}
      <div style={styles.highlightCard}>
        <div style={styles.highlightContent}>
          <div style={styles.highlightItem}>
            <div style={styles.iconBox}>
              <Calendar size={20} color="#f7b500" />
            </div>
            <div>
              <div style={styles.highlightLabel}>Scheduled Date</div>
              <div style={styles.highlightValue}>{scheduleInfo.date}</div>
            </div>
          </div>
          <div style={styles.highlightItem}>
            <div style={styles.iconBox}>
              <Clock size={20} color="#f7b500" />
            </div>
            <div>
              <div style={styles.highlightLabel}>Time Slot</div>
              <div style={styles.highlightValue}>{scheduleInfo.time}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Cards Grid */}
      <div style={styles.cardsGrid} className="rc-cards-grid">
        {/* Personal Information Card */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>
            <User size={20} color="#f7b500" />
            <span>Personal Information</span>
          </div>
          <div style={styles.cardBody} className="rc-card-body">
            <InfoRow icon={<User size={16} />} label="Full Name" value={name} />
            <InfoRow icon={<Mail size={16} />} label="Email Address" value={email} />
            <InfoRow icon={<CreditCard size={16} />} label="User ID" value={user_id} />
            <InfoRow icon={<Calendar size={16} />} label="Date of Birth" value={formatDate(date_of_birth)} />
            <InfoRow icon={<Users size={16} />} label="Gender" value={gender} />
            <InfoRow icon={<Globe size={16} />} label="Nationality" value={nationality} />
            {id_number && <InfoRow icon={<FileText size={16} />} label="ID Number" value={id_number} />}
          </div>
        </div>

        {/* Document Verification Card */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>
            <FileText size={20} color="#f7b500" />
            <span>Document Verification</span>
          </div>
          <div style={styles.cardBody} className="rc-card-body">
            <div style={styles.docItem}>
              <div style={styles.docLabel}>ID Front Side</div>
              <div style={styles.docPreview}>
                {frontSrc ? (
                  <img src={frontSrc} alt="ID Front Side" style={styles.docImg} />
                ) : (
                  <div style={styles.docPlaceholder}>
                    <FileText size={32} color="#a8b1b7" style={{ opacity: 0.3 }} />
                    <div style={styles.docPlaceholderText}>No document</div>
                  </div>
                )}
              </div>
            </div>
            <div style={styles.docItem}>
              <div style={styles.docLabel}>ID Back Side</div>
              <div style={styles.docPreview}>
                {backSrc ? (
                  <img src={backSrc} alt="ID Back Side" style={styles.docImg} />
                ) : (
                  <div style={styles.docPlaceholder}>
                    <FileText size={32} color="#a8b1b7" style={{ opacity: 0.3 }} />
                    <div style={styles.docPlaceholderText}>No document</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div style={styles.errorBox}>
          <AlertCircle size={20} color="#dc2626" />
          <div>
            <div style={styles.errorTitle}>Error</div>
            <div style={styles.errorMessage}>{errorMsg}</div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={styles.actions}>
        <button style={styles.btnSecondary} onClick={onBack} disabled={loading}>
          Previous
        </button>
        <button style={styles.btnPrimary} onClick={handleSchedule} disabled={loading}>
          {loading ? "Scheduling..." : <>
            <CheckCircle size={18} />
            Confirm & Schedule
          </>}
        </button>
      </div>

      {/* Loading Modal — appears while scheduling (spinner in the modal place) */}
      {loading && !successModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.loadingModal}>
            <div style={styles.loadingSpinner} />
            <div style={styles.loadingText}>Scheduling your session…</div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {successModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalIcon}>
              <CheckCircle size={48} color="#afb504" />
            </div>
            <h3 style={styles.modalTitle}>Appointment Confirmed!</h3>
            <p style={styles.modalText}>Your video KYC session has been successfully scheduled for:</p>
            <div style={styles.modalSchedule}>
              <div style={styles.modalDate}>{scheduleInfo.date}</div>
              <div style={styles.modalTime}>{scheduleInfo.time}</div>
            </div>
            <button style={styles.modalBtn} onClick={closeModal}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <div style={styles.infoRow}>
      <div style={styles.infoIcon}>{icon}</div>
      <div style={styles.infoContent}>
        <div style={styles.infoLabel}>{label}</div>
        <div style={styles.infoValue}>{value || "Not provided"}</div>
      </div>
    </div>
  );
}

function DocumentPreview({ label, src }) {
  return (
    <div style={styles.docItem}>
      <div style={styles.docLabel}>{label}</div>
      <div style={styles.docPreview}>
        {src ? (
          <img src={src} alt={label} style={styles.docImg} />
        ) : (
          <div style={styles.docPlaceholder}>
            <FileText size={32} color="#a8b1b7" style={{ opacity: 0.3 }} />
            <div style={styles.docPlaceholderText}>No document</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* Styles (added loading modal styles) */
const styles = {
  wrapper: {
    padding: '20px',
    marginLeft: '50px',
    marginRight: '50px',
    background: 'transparent',
    fontFamily: 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  header: {
    marginBottom: '24px',
     alignItems: 'center',
  justifyContent: 'center',
  },
  headerTitle: {
    margin: '0 0 8px 0',
    fontSize: '28px',
    color: '#0f1724',
    fontWeight: '700',
  },
  headerSubtitle: {
    margin: 0,
    fontSize: '15px',
    color: '#9aa6b2',
  },
  highlightCard: {
    background: 'linear-gradient(135deg, #fbfdff 0%, #f8fafc 100%)',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
    border: '2px solid rgba(247, 181, 0, 0.15)',
    boxShadow: '0 8px 20px rgba(19, 40, 57, 0.06)',
  },
  highlightContent: {
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '24px',
  },
  highlightItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  iconBox: {
    width: '48px',
    height: '48px',
    borderRadius: '10px',
    background: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  highlightLabel: {
    fontSize: '13px',
    color: '#9aa6b2',
    marginBottom: '4px',
  },
  highlightValue: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#0f1724',
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '18px',
    marginBottom: '24px',
  },
  card: {
    background: '#fbfdff',
    borderRadius: '10px',
    padding: '20px',
    border: '1px solid rgba(15,23,36,0.04)',
    boxShadow: '0 6px 18px rgba(19, 40, 57, 0.03)',
  },
  cardTitle: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    marginBottom: '18px',
    fontWeight: '600',
    fontSize: '16px',
    color: '#0f1724',
  },

  cardBody: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px 20px',
    alignItems: 'start',
    padding: '0',
  },

  infoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 0',
    borderBottom: 'none',
    minHeight: '44px',
  },
  infoIcon: {
    color: '#9aa6b2',
    marginTop: '2px',
    flexShrink: 0,
  },
  infoContent: {
    flex: 1,
    minWidth: 0,
  },
  infoLabel: {
    fontSize: '13px',
    color: '#9aa6b2',
    marginBottom: '4px',
  },
  infoValue: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#0f1724',
    wordBreak: 'break-word',
  },
  docsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  docItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  docLabel: {
    fontSize: '13px',
    color: '#9aa6b2',
    fontWeight: '500',
  },
  docPreview: {
    borderRadius: '8px',
    border: '1px solid rgba(14, 30, 37, 0.06)',
    overflow: 'hidden',
    background: '#f5f7f9',
  },
  docImg: {
    width: '100%',
    height: '180px',
    objectFit: 'cover',
    display: 'block',
    transition: 'transform 0.15s ease',
    cursor: 'pointer',
  },
  docPlaceholder: {
    width: '100%',
    height: '180px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  docPlaceholderText: {
    fontSize: '13px',
    color: '#a8b1b7',
  },
  errorBox: {
    display: 'flex',
    gap: '12px',
    padding: '16px',
    background: '#fee2e2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    marginBottom: '20px',
    alignItems: 'flex-start',
  },
  errorTitle: {
    fontWeight: '600',
    fontSize: '14px',
    color: '#991b1b',
    marginBottom: '2px',
  },
  errorMessage: {
    fontSize: '14px',
    color: '#dc2626',
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    alignItems: 'center',
  },
  btnSecondary: {
    minWidth: '120px',
    padding: '12px 18px',
    borderRadius: '8px',
    border: '1px solid rgba(15,23,36,0.1)',
    background: '#fff',
    color: '#0f1724',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px',
    transition: 'all 0.2s',
  },
  btnPrimary: {
    minWidth: '180px',
    padding: '12px 20px',
    borderRadius: '8px',
    border: 'none',
    background: '#bf8d03',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: '700',
    fontSize: '14px',
    boxShadow: '0 8px 18px rgba(191, 141, 3, 0.2)',
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTop: '2px solid #fff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },

  /* modal overlay */
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 36, 0.55)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  modal: {
    background: 'white',
    borderRadius: '12px',
    padding: '32px 40px',
    maxWidth: '440px',
    width: '90%',
    textAlign: 'center',
    boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
  },
  modalIcon: {
    width: '80px',
    height: '80px',
    background: '#f7f8e8',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
  },
  modalTitle: {
    margin: '0 0 12px 0',
    fontSize: '24px',
    color: '#afb504',
    fontWeight: '700',
  },
  modalText: {
    margin: '0 0 20px 0',
    fontSize: '15px',
    color: '#9aa6b2',
  },
  modalSchedule: {
    background: '#f8fafc',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '24px',
  },
  modalDate: {
    fontSize: '17px',
    fontWeight: '700',
    color: '#0f1724',
    marginBottom: '4px',
  },
  modalTime: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#bf8d03',
  },
  modalBtn: {
    width: '100%',
    padding: '12px 24px',
    background: '#afb504',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '700',
    fontSize: '15px',
    transition: 'all 0.2s',
  },

  /* new: loading modal content */
  loadingModal: {
    background: 'white',
    borderRadius: '12px',
    padding: '28px 32px',
    maxWidth: '360px',
    width: '90%',
    textAlign: 'center',
    boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    alignItems: 'center',
  },
  loadingSpinner: {
    width: '56px',
    height: '56px',
    border: '6px solid rgba(191,141,3,0.18)',
    borderTop: '6px solid #bf8d03',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    fontSize: '16px',
    color: '#0f1724',
    fontWeight: 700,
  },
};

/* Inject responsive styles only once */
(function injectResponsiveStyles() {
  try {
    if (!document.getElementById('rc-responsive-styles')) {
      const styleSheet = document.createElement("style");
      styleSheet.id = 'rc-responsive-styles';
      styleSheet.textContent = `
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Cards grid: use two columns by default */
        .rc-cards-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
        }

        /* Card body (info rows) two-column layout */
        .rc-card-body {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px 20px;
        }

        /* Collapse to single column on smaller screens */
        @media (max-width: 920px) {
          .rc-cards-grid { grid-template-columns: 1fr !important; }
          .rc-card-body { grid-template-columns: 1fr !important; }
        }

        @media (max-width: 480px) {
          .rc-card-body img { height: 140px !important; }
        }
      `;
      document.head.appendChild(styleSheet);
    }
  } catch (e) {
    // ignore injection failures (e.g. SSR contexts)
  }
})();
