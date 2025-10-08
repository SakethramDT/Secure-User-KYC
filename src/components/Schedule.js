// Schedule.js
import React, { useState, useEffect, useRef } from "react";
import "./Schedule.css";

/**
 * Props:
 *  - formData: object that may contain { day_date, slot_index, time_label, user_id, document_id, idempotency_key, ... }
 *  - setFormData: function to update parent form state
 *  - onNext, onBack: navigation callbacks
 *
 * Backend endpoints used:
 *  GET  /api/timeslots?day_date=YYYY-MM-DD
 *  POST /api/book
 *  POST /api/agent/release
 */

const getLocalISODate = (d = new Date()) => {
  const tzOffset = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - tzOffset);
  return local.toISOString().slice(0, 10);
};

const makeIdempotencyKey = () => {
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export default function Schedule({
  formData = {},
  setFormData = () => {},
  onNext = () => {},
  onBack = () => {},
}) {
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState(null);

  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState(null);
  const [releaseSuccess, setReleaseSuccess] = useState(null);

  const minDate = getLocalISODate(new Date());
  const abortRef = useRef(null);

  // helper to update parent form state safely
  const setField = (patch) => {
    if (typeof setFormData === "function") {
      setFormData((prev) => ({ ...(prev || {}), ...patch }));
    }
  };

  // ensure day_date is not before today
  useEffect(() => {
    if (formData?.day_date && formData.day_date < minDate) {
      setField({ day_date: "", slot_index: null, time_label: "" });
      setSlots([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData?.day_date]);

  // fetch slots when date changes
  useEffect(() => {
    if (formData.day_date) {
      // fire-and-forget initial fetch (we don't await here)
      fetchSlots(formData.day_date);
    } else {
      setSlots([]);
      setFetchError(null);
    }
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.day_date]);

  /**
   * Fetch timeslots for a date.
   * RETURNS: array of slots on success, null on failure/cancel.
   */
  const fetchSlots = async (day_date) => {
    setLoadingSlots(true);
    setFetchError(null);

    if (abortRef.current) {
      // abort previous if still in-flight
      abortRef.current.abort();
    }
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const base = process.env.REACT_APP_BACKEND_URL || "";
      const params = new URLSearchParams({ day_date });
      const url = `${base}/api/timeslots?${params.toString()}`;

      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: ac.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to fetch slots: ${res.status} ${text}`);
      }
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];
      setSlots(arr);

      if (formData.slot_index != null) {
        const still = arr.find((s) => s.slot_index === formData.slot_index && s.available);
        if (!still) {
          setField({ slot_index: null, time_label: "" });
        }
      }

      return arr;
    } catch (err) {
      if (err.name === "AbortError") return null;
      console.error("Failed to fetch slots:", err);
      setSlots([]);
      setFetchError("Unable to fetch timeslots. Please try another date or contact support.");
      return null;
    } finally {
      setLoadingSlots(false);
      abortRef.current = null;
    }
  };

  const selectSlot = (s) => {
    if (!s.available) return;
    setField({ slot_index: s.slot_index, time_label: s.time_label });
    setBookingError(null);
    setReleaseError(null);
    setReleaseSuccess(null);
  };

  const findSelectedSlot = () => {
    if (formData.slot_index == null) return null;
    return slots.find((s) => s.slot_index === formData.slot_index) || null;
  };

  // Book: re-validate availability immediately before POST
  const handleNextClick = async () => {
    setBookingError(null);

    if (!formData.user_id) {
      setBookingError("User information missing. Please complete personal details first.");
      return;
    }
    if (!formData.day_date || formData.slot_index == null) {
      setBookingError("Please pick a date and timeslot before proceeding.");
      return;
    }

    // show booking state during verification + booking
    setBooking(true);

    try {
      // 1) Re-fetch latest slots for the day and ensure selected slot is still available
      const latest = await fetchSlots(formData.day_date);
      if (!latest) {
        setBooking(false);
        setBookingError("Unable to verify slot availability. Please try again.");
        return;
      }

      const selected = (latest || []).find((s) => s.slot_index === formData.slot_index);

      if (!selected || !selected.available) {
        setBooking(false);
        setBookingError("Selected slot is no longer available. Please pick another slot.");
        return;
      }

      // derive start_time and duration (use server-provided start_iso/duration if present)
      let start_time_iso = selected.start_iso || null;
      let duration_minutes = selected.duration_minutes || null;

      if (!start_time_iso || !duration_minutes) {
        try {
          const label = selected.time_label || formData.time_label || "";
          const parts = label.split("-");
          const startPart = parts[0] && parts[0].trim();
          const endPart = parts[1] && parts[1].trim();
          if (startPart) {
            const localIso = new Date(`${formData.day_date}T${startPart}:00`);
            start_time_iso = localIso.toISOString();
          }
          if (endPart && start_time_iso) {
            const localEnd = new Date(`${formData.day_date}T${endPart}:00`);
            duration_minutes = Math.round((localEnd.getTime() - new Date(start_time_iso).getTime()) / 60000);
          } else if (!duration_minutes) {
            duration_minutes = 30;
          }
        } catch (e) {
          if (!start_time_iso) start_time_iso = new Date().toISOString();
          if (!duration_minutes) duration_minutes = 30;
        }
      }

      // idempotency key
      let idempotencyKey = formData.idempotency_key;
      if (!idempotencyKey) {
        idempotencyKey = makeIdempotencyKey();
        setField({ idempotency_key: idempotencyKey });
      }

      // Prepare payload and call booking endpoint
      const base = process.env.REACT_APP_BACKEND_URL || "";
      const url = `${base}/api/book`;
      const payload = {
        user_id: formData.user_id,
        start_time: start_time_iso,
        duration_minutes,
        document_id: formData.document_id || null,
        slot_index: formData.slot_index,
        day_date: formData.day_date,
      };

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 201 || res.status === 200) {
        const data = await res.json().catch(() => null);
        // Save appointment & assigned agent info into formData
        setField({
          appointment: data?.appointment || null,
          assigned_agent_id: data?.assigned_agent_id || null,
          assigned_agent_username: data?.assigned_agent_username || null,
          status: "scheduled",
        });
        setBooking(false);
        if (typeof onNext === "function") onNext();
        return;
      }

      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        setBookingError(body.error || "Selected timeslot was just taken. Please choose another.");
        setBooking(false);
        // refresh slots to reflect current availability
        if (formData.day_date) fetchSlots(formData.day_date);
        return;
      }

      if (res.status >= 400 && res.status < 500) {
        const body = await res.json().catch(() => ({}));
        setBookingError(body.error || `Booking failed (${res.status}).`);
        setBooking(false);
        return;
      }

      const text = await res.text().catch(() => "");
      setBookingError(`Server error while booking appointment. ${text ? "- " + text : ""}`);
      setBooking(false);
    } catch (err) {
      console.error("Booking/availability check failed:", err);
      setBookingError("Network or server error while trying to book. Please try again.");
      setBooking(false);
    }
  };

  // Release agent endpoint - call when session ends or user cancels
  const handleReleaseAgent = async () => {
    setReleaseError(null);
    setReleaseSuccess(null);

    const agentId = formData.assigned_agent_id;
    const roomId = formData.appointment?.room_id || formData.room_id || null;

    if (!agentId) {
      setReleaseError("No assigned agent to release.");
      return;
    }

    setReleasing(true);
    try {
      const base = process.env.REACT_APP_BACKEND_URL || "";
      const url = `${base}/api/agent/release`;
      const payload = { agent_id: agentId };
      if (roomId) payload.room_id = roomId;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setReleaseError(body.error || `Failed to release agent (${res.status})`);
        setReleasing(false);
        return;
      }

      // success
      setField({
        assigned_agent_id: null,
        assigned_agent_username: null,
        appointment: null,
        status: "released",
        room_id: null,
      });
      setReleaseSuccess("Agent released successfully.");
      setReleasing(false);
    } catch (err) {
      console.error("Release failed:", err);
      setReleaseError("Network or server error while releasing agent. Try again.");
      setReleasing(false);
    }
  };

  return (
    <div className="card schedule-officer" aria-live="polite">
<h1 style={{ textAlign: "center", fontWeight: 600 }}>
  Slot Booking for Video KYC
</h1>
      <h3>Select Date & Time</h3>
      <div className="subtitle">Choose a convenient date and pick an available timeslot.</div>

      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div className="form-row">
          <label className="label" htmlFor="schedule-date">Date</label>
          <input
            id="schedule-date"
            className="date"
            type="date"
            min={minDate}
            value={formData.day_date || ""}
            onChange={(e) => {
              setField({ day_date: e.target.value, slot_index: null, time_label: "" });
              setBookingError(null);
              setReleaseError(null);
              setReleaseSuccess(null);
            }}
          />
        </div>

        <div className="form-row">
          <label className="label">Selected time</label>
          <input className="input" readOnly value={formData.time_label || ""} placeholder="Pick a timeslot" />
        </div>

        <div className="form-row" style={{ alignSelf: "end" }}>
          <label className="label" aria-hidden="true">&nbsp;</label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setField({ day_date: "", slot_index: null, time_label: "" });
                setSlots([]);
                setFetchError(null);
                setBookingError(null);
                setReleaseError(null);
                setReleaseSuccess(null);
              }}
            >
              Clear
            </button>

            <button
              type="button"
              className="btn primary"
              onClick={() => onNext && onNext()}
              disabled={
                booking ||
                loadingSlots ||
                !formData.day_date ||
                formData.slot_index == null ||
                !!fetchError
              }
            >
              {booking ? "Booking..." : "Next"}
            </button>
          </div>
        </div>
      </div>

      {loadingSlots && <div style={{ marginTop: 14, color: "var(--muted)" }}>Loading slots...</div>}
      {fetchError && <div className="error-message" role="alert">{fetchError}</div>}

      {bookingError && <div className="error-message" role="alert" style={{ marginTop: 8 }}>{bookingError}</div>}

      <div className="slots" style={{ marginTop: 12 }}>
        {!loadingSlots && slots.length === 0 && !fetchError && (
          <div style={{ color: "var(--muted)", padding: 8 }}>No slots available for this date.</div>
        )}

        {slots.map((s) => {
          const isDisabled = !s.available || booking;
          const isActive = formData.slot_index === s.slot_index;
          return (
            <button
              key={s.slot_index}
              type="button"
              disabled={isDisabled}
              tabIndex={isDisabled ? -1 : 0}
              aria-disabled={isDisabled}
              aria-pressed={isActive}
              aria-label={s.available ? `Select ${s.time_label}` : `${s.time_label} — no agents available`}
              title={s.available ? s.time_label : `${s.time_label} — no agents available`}
              className={
                "slot " +
                (isDisabled ? "disabled " : "") +
                (isActive ? "active" : "")
              }
              onClick={() => selectSlot(s)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectSlot(s);
                }
              }}
              style={{ margin: 6 }}
            >
              {s.time_label}
            </button>
          );
        })}
      </div>

      {/* Assigned agent summary + release control */}
      {formData.assigned_agent_id && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Assigned agent</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ color: "var(--muted)" }}>
              {formData.assigned_agent_username ? (
                <><strong>{formData.assigned_agent_username}</strong> (ID: {formData.assigned_agent_id})</>
              ) : (
                <>Agent ID: {formData.assigned_agent_id}</>
              )}
            </div>

            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn secondary"
                onClick={handleReleaseAgent}
                disabled={releasing}
              >
                {releasing ? "Releasing..." : "Release Agent"}
              </button>
            </div>
          </div>

          {releaseError && <div className="error-message" role="alert" style={{ marginTop: 8 }}>{releaseError}</div>}
          {releaseSuccess && <div style={{ marginTop: 8, color: "green" }}>{releaseSuccess}</div>}
        </div>
      )}

      <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between" }}>
        <button type="button" className="btn secondary" onClick={() => onBack && onBack()} disabled={booking || releasing}>
          Previous
        </button>

        <div style={{ color: "var(--muted)", alignSelf: "center", fontSize: 13 }}>
          Tip: slots update in real-time. If a slot fails to book, please pick another.
        </div>
      </div>
    </div>
  );
}
