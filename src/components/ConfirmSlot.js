import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Calendar, Clock, User, CheckCircle, X, Shield, Lock } from "lucide-react";

/**
 * ConfirmSlot
 * URL: /confirm-slot/:kyc_id
 * GET  /api/kyc/confirm-slot/:kyc_id
 * POST /api/kyc/confirm-slot/:kyc_id  (body: { status: 'confirmed' } or { status: 'cancelled' })
 */
export default function ConfirmSlot() {
  const { kyc_id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [slot, setSlot] = useState(null);
  const [canConfirm, setCanConfirm] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    if (!kyc_id) {
      setError("Invalid link");
      setLoading(false);
      return;
    }

    let mounted = true;
    const fetchData = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `http://164.52.217.141:5000/api/kyc/confirm-slot/${encodeURIComponent(kyc_id)}`,
          { credentials: "include" }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || `Server returned ${res.status}`);
        }
        const data = await res.json();
        if (!mounted) return;
        setUser(data.user || null);
        setSlot(data.slot || null);
        setCanConfirm(!!data.canConfirm);
        setConfirmed(
          !!(data.slot && data.slot.status && data.slot.status.toLowerCase() === "confirmed")
        );
      } catch (err) {
        if (!mounted) return;
        setError(err.message || "Failed to load details.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData();
    return () => {
      mounted = false;
    };
  }, [kyc_id]);

  const closePage = () => {
    try {
      window.close();
    } catch {}
    navigate("/");
  };

  const formatDateOnly = (value) => {
    if (!value) return "—";
    try {
      const dt = new Date(value);
      if (!isNaN(dt.getTime())) {
        return new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(dt);
      }
      return String(value).split("T")[0];
    } catch {
      return String(value);
    }
  };

  const formatTimeRangeNoTZ = (slotObj) => {
    if (!slotObj || !slotObj.start_time || !slotObj.end_time) return "—";
    try {
      const start = new Date(slotObj.start_time);
      const end = new Date(slotObj.end_time);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return "—";
      const fmt = (d) =>
        d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
      return `${fmt(start)} – ${fmt(end)}`;
    } catch {
      return "—";
    }
  };

  const postStatusUpdate = async (status) => {
    setError("");
    const res = await fetch(
      `http://164.52.217.141:5000/api/kyc/confirm-slot/${encodeURIComponent(kyc_id)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Server returned ${res.status}`);
    }
    return await res.json();
  };

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setConfirming(true);
    try {
      const data = await postStatusUpdate("confirmed");
      setConfirmed(
        !!(data && (data.confirmed || (data.slot && data.slot.status === "confirmed")))
      );
      setSlot(data.slot || slot);
      setUser(data.user || user);
      setCancelled(false);
    } catch (err) {
      setError(err.message || "Failed to confirm slot.");
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = async () => {
    setConfirming(true);
    try {
      const data = await postStatusUpdate("cancelled");
      setCancelled(true);
      setConfirmed(false);
      setSlot(data.slot || slot);
      setUser(data.user || user);
    } catch (err) {
      setError(err.message || "Failed to cancel slot.");
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="cs-root">
        <div className="cs-card">
          <p className="cs-loading">Loading slot details…</p>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  if (cancelled && !confirmed) {
    return (
      <div className="cs-root">
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

        <style>{styles}</style>
        <div className="cs-card">
          <div className="cs-center">
            <h2 className="cs-title">Thank you — status updated</h2>
            <p className="cs-sub">
              Your appointment has been marked as cancelled. You can reschedule if you wish.
            </p>
          </div>

          <div style={{ marginTop: 12 }}>
            <button className="cs-btn cs-btn-primary" onClick={() => navigate("/reschedule")}>
              Reschedule Appointment
            </button>
            <button className="cs-btn cs-btn-light" onClick={closePage} style={{ marginTop: 10 }}>
              Close
            </button>
            {error && <div className="cs-error">{error}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cs-root">
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

      <style>{styles}</style>

      <div className="cs-card">
        {confirmed ? (
          <>
            <div className="cs-center">
              <CheckCircle size={48} color="#157f3a" />
              <h2 className="cs-title">Slot Confirmed</h2>
              <p className="cs-sub">Your VideoKYC appointment has been confirmed.</p>
            </div>

            <div className="cs-details">
              <Row icon={<User />}>
                <Label>Name</Label>
                <Value>{user?.name || "—"}</Value>
              </Row>

              <Row icon={<Calendar />}>
                <Label>Date</Label>
                <Value>
                  {slot?.day_date
                    ? formatDateOnly(slot.day_date)
                    : formatDateOnly(slot?.start_time)}
                </Value>
              </Row>

              <Row icon={<Clock />}>
                <Label>Time</Label>
                <Value>{formatTimeRangeNoTZ(slot)}</Value>
              </Row>
            </div>

            <div style={{ marginTop: 16 }}>
              <button className="cs-btn cs-btn-light" onClick={closePage}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="cs-center">
              <Calendar size={36} color="#b8872f" />
              <h2 className="cs-title">Confirm Your Slot</h2>
              <p className="cs-sub">Please verify your details below and click Confirm.</p>
            </div>

            <div className="cs-details">
              <Row icon={<User />}>
                <Label>Name</Label>
                <Value>{user?.name || "—"}</Value>
              </Row>

              <Row icon={<Calendar />}>
                <Label>Date</Label>
                <Value>
                  {slot?.day_date
                    ? formatDateOnly(slot.day_date)
                    : formatDateOnly(slot?.start_time)}
                </Value>
              </Row>

              <Row icon={<Clock />}>
                <Label>Time</Label>
                <Value>{formatTimeRangeNoTZ(slot)}</Value>
              </Row>
            </div>

            <div style={{ marginTop: 14 }}>
              <button
                className="cs-btn cs-btn-primary"
                onClick={handleConfirm}
                disabled={!canConfirm || confirming}
              >
                {confirming ? "Processing…" : "Confirm Slot"}
              </button>

              <button
                className="cs-btn cs-btn-cancel"
                onClick={handleCancel}
                style={{ marginTop: 10 }}
                disabled={confirming}
              >
                Cancel Slot
              </button>

              {error && <div className="cs-error">{error}</div>}
              {!canConfirm && !error && (
                <div className="cs-note">
                  This appointment cannot be confirmed (maybe cancelled or already updated).
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* Small layout helpers */
function Row({ icon, children }) {
  return (
    <div className="cs-row">
      <div className="cs-icon">{icon}</div>
      <div className="cs-row-content">{children}</div>
    </div>
  );
}
function Label({ children }) {
  return <div className="cs-label">{children}</div>;
}
function Value({ children }) {
  return <div className="cs-value">{children}</div>;
}

/* --- STYLES (responsive) --- */
const styles = `
  :root { --header-height: 68px; --header-h-padding: 40px; }

  .cs-root {
    min-height: 80vh;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:20px;
    padding-top: calc(var(--header-height) + 8px); /* uses header height variable */
    background:#f7f8fa;
    font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
    box-sizing: border-box;
  }

  .cs-card {
    width:100%;
    max-width:600px;
    background:#fff;
    border-radius:12px;
    padding:28px;
    box-shadow:0 10px 30px rgba(2,6,23,0.08);
    transition: all 160ms ease;
  }

  .cs-center { text-align:center; margin-bottom:12px; }
  .cs-title { font-size:20px; margin:8px 0 4px; color:#222; }
  .cs-sub { color:#666; font-size:14px; margin:0 0 12px; }
  .cs-details { border-top:1px solid #eee; padding-top:12px; margin-top:6px; }
  .cs-row { display:flex; gap:12px; align-items:center; padding:10px 0; border-bottom:1px solid #fafafa; }
  .cs-row:last-child { border-bottom:none; }
  .cs-icon { color:#b8872f; display:flex; align-items:center; justify-content:center; width:28px; flex-shrink:0; }
  .cs-row-content { display:flex; flex-direction:column; }
  .cs-label { font-size:12px; color:#777; text-transform:uppercase; }
  .cs-value { font-size:15px; color:#222; font-weight:600; margin-top:2px; word-break:break-word; }
  .cs-btn { width:100%; padding:12px 14px; border-radius:8px; font-weight:700; font-size:14px; cursor:pointer; margin-top:10px; }
  .cs-btn:disabled { opacity:0.7; cursor:not-allowed; }
  .cs-btn-primary { background:#b8872f; border:none; color:#fff; }
  .cs-btn-light { background:#fff; border:1px solid #e6e6e6; color:#222; }
  .cs-btn-cancel { background:#fafafa; border:1px solid #eee; color:#333; display:flex; align-items:center; justify-content:center; gap:8px; }
  .cs-loading { color:#b8872f; font-weight:600; text-align:center; }
  .cs-error { margin-top:12px; color:#c0392b; font-weight:600; }
  .cs-note { margin-top:12px; color:#666; font-size:13px; }

  @media (min-width: 1200px) {
    .cs-card { max-width:600px; padding:34px;margin:40px }
    .cs-title { font-size:22px; }
    :root { --header-height: 72px; --header-h-padding: 56px; }
  }

  /* Tablet */
  @media (max-width: 1024px) {
    .cs-card { max-width:560px; padding:26px; margin:30px }
    .cs-value { font-size:15px; }
    :root { --header-height: 64px; --header-h-padding: 28px; }
  }

  /* Narrow tablet / large phone */
  @media (max-width: 720px) {
    .cs-card { max-width:520px; padding:20px; margin: 0 12px; }
    .cs-row { gap:10px; }
    .cs-icon { width:24px; }
    .cs-title { font-size:18px; }
    .cs-sub { font-size:13px; }
    :root { --header-height: 60px; --header-h-padding: 20px; }
    .security-badges { display: none; } /* hide badges on narrower screens */
  }

  /* Mobile */
  @media (max-width: 420px) {
    .cs-card { width:100%; max-width:420px; padding:16px; margin: 0 8px; border-radius:10px; }
    .cs-title { font-size:17px; }
    .cs-sub { font-size:13px; }
    .cs-value { font-size:14px; }
    .cs-icon { width:20px; }
    :root { --header-height: 56px; --header-h-padding: 12px; }
    .cs-btn { padding:10px 12px; font-size:13px; }
  }

  /* ✅ Fixed Header (responsive) */
  .top-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: var(--header-height);
    background: white;
    border-bottom: 1px solid rgba(0,0,0,0.04);
    z-index: 2000;
    display: flex;
    align-items: center;
    box-shadow: 0 6px 16px rgba(2,6,23,0.06);
    transition: height 160ms ease, padding 160ms ease, box-shadow 160ms ease;
  }

  .header-content {
    width: 100%;
    padding: 0 var(--header-h-padding);
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-sizing: border-box;
  }

  .brand-section { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .brand-logo { width: 44px; height: 44px; background: linear-gradient(135deg, #c39939ff, #e0bd6a); border-radius: 12px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .brand-logo svg { width: 22px; height: 22px; color: white; }

  .brand-info { display:flex; flex-direction:column; min-width:0; }
  .brand-info h1 { font-size: 18px; font-weight: 700; color: #1a1a2e; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .brand-info p { font-size: 12px; color: #6b7280; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

  .security-badges { display: flex; align-items: center; gap: 10px; margin-left: 12px; }
  .badge { display:flex; align-items:center; gap:6px; padding:6px 10px; border-radius:16px; font-size:11px; font-weight:600; white-space:nowrap; }
  .badge-secure { background: rgba(74, 222, 128, 0.08); border: 1px solid rgba(74, 222, 128, 0.15); color:#047857; }
  .badge-secure svg { width:13px; height:13px; color:#10b981; }
  .badge-encrypted { background: rgba(203, 163, 68, 0.06); border: 1px solid rgba(203, 163, 68, 0.12); color:#92722d; }
  .badge-encrypted svg { width:13px; height:13px; color:#c39939ff; }

  /* Header stacking for very narrow screens: logo left, small text hidden if needed */
  @media (max-width: 420px) {
    .brand-info p { display:none; }
    .brand-info h1 { font-size:16px; }
    .brand-logo { width:40px; height:40px; }
    .header-content { padding: 0 10px; }
  }

  /* Ensure content isn't overlapped when header is fixed */
  /* cs-root already uses padding-top based on --header-height */

`;

