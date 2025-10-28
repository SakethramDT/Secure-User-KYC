// Schedule.js
import React, { useEffect, useState, useRef } from "react";
import "./Schedule.css";

/**
 * Props:
 *  - formData, setFormData, onNext, onBack same as before
 *
 * Behavior:
 *  - Shows next 7 days starting tomorrow (default selected is tomorrow)
 *  - Fetches /api/timeslots?day_date=YYYY-MM-DD to get slots with seats_total/seats_taken
 *  - Books by POST /api/book; server will return appointment with status 'pending' (agent_id may be null)
 */

const SLOT_MINUTES = 30;

 
const getLocalISODate = (d = new Date()) => {
  const tzOffset = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - tzOffset);
  return local.toISOString().slice(0, 10);
};

const addDaysISO = (baseIso, n) => {
  const d = new Date(`${baseIso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return getLocalISODate(d);
};

export default function Schedule({
  formData = {},
  setFormData = () => {},
  onNext = () => {},
  onBack = () => {},
}) {
  const [dates, setDates] = useState([]); // array of { iso, label }
  const [selectedDate, setSelectedDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState(null);
  const abortRef = useRef(null);

  // set parent's setFormData helper
  const setField = (patch) => {
    if (typeof setFormData === "function") {
      setFormData((prev) => ({ ...(prev || {}), ...patch }));
    }
  };

  // compute next 7 days starting tomorrow
  useEffect(() => {
    const todayIso = getLocalISODate();
    const arr = [];
    for (let i = 1; i <= 7; i++) {
      const iso = addDaysISO(todayIso, i);
      const dateObj = new Date(`${iso}T00:00:00`);
      const label = dateObj.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      arr.push({ iso, label });
    }
    setDates(arr);

    // default select tomorrow
    if (!formData?.day_date) {
      const tomorrow = arr[0]?.iso || "";
      setSelectedDate(tomorrow);
      setField({ day_date: tomorrow, slot_index: null, time_label: "" });
    } else {
      setSelectedDate(formData.day_date);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // when selectedDate changes (or formData.day_date changed externally), fetch slots
  useEffect(() => {
    const day = selectedDate || formData.day_date;
    if (day) {
      setField({ day_date: day }); // keep parent in sync
      fetchSlots(day);
    } else {
      setSlots([]);
      setFetchError(null);
    }
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const transformSlotsForLocalNow = (arr, day_date) => {
    if (!Array.isArray(arr)) return [];
    // If somehow today is selected (shouldn't be), mark past slots unavailable
    const isToday = day_date === getLocalISODate();
    if (!isToday) return arr;
    const now = new Date();
    return arr.map((s) => {
      try {
        const slotStart = s.start_iso ? new Date(s.start_iso) : null;
        if (slotStart && slotStart <= now) {
          return { ...s, available: false };
        }
      } catch (e) {}
      return s;
    });
  };

  const fetchSlots = async (day_date) => {
    setLoadingSlots(true);
    setFetchError(null);

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const base = process.env.REACT_APP_BACKEND_URL || "";
      const url = `${base}/api/timeslots?day_date=${encodeURIComponent(day_date)}`;
      const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" }, signal: ac.signal });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Failed to fetch slots: ${res.status} ${txt}`);
      }
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];
      const transformed = transformSlotsForLocalNow(arr, day_date);
      setSlots(transformed);

      // ensure selected slot still valid
      if (formData.slot_index != null) {
        const still = transformed.find((s) => s.slot_index === formData.slot_index && s.available && ((s.seats_total == null) || (s.seats_taken < s.seats_total)));
        if (!still) {
          setField({ slot_index: null, time_label: "" });
        }
      }

      return transformed;
    } catch (err) {
      if (err.name === "AbortError") return null;
      console.error("fetchSlots error:", err);
      setSlots([]);
      setFetchError("Unable to fetch timeslots. Please try another date or contact support.");
      return null;
    } finally {
      setLoadingSlots(false);
      abortRef.current = null;
    }
  };

  const selectDate = (iso) => {
    setSelectedDate(iso);
    setBookingError(null);
    setFetchError(null);
    setField({ day_date: iso, slot_index: null, time_label: "" });
  };

  const selectSlot = (s) => {
    const seatsTotal = s.seats_total != null ? s.seats_total : Infinity;
    const seatsTaken = s.seats_taken != null ? s.seats_taken : 0;
    const seatsRemaining = seatsTotal === Infinity ? 1 : Math.max(0, seatsTotal - seatsTaken);
    if (!s.available || seatsRemaining <= 0 || booking) return;
    setField({ slot_index: s.slot_index, time_label: s.time_label });
    setBookingError(null);
  };

  const findSelectedSlot = () => {
    if (formData.slot_index == null) return null;
    return slots.find((s) => s.slot_index === formData.slot_index) || null;
  };

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

    setBooking(true);

    try {
      // Ensure selected slot still exists in the currently-loaded slots (client-side check)
      const selected = slots.find((s) => s.slot_index === formData.slot_index);

      if (!selected) {
        setBooking(false);
        setBookingError("Selected slot is not available in the current view. Please re-select a slot.");
        return;
      }

      if (!selected.available) {
        setBooking(false);
        setBookingError("Selected slot is no longer available. Please pick another slot.");
        return;
      }

      const seatsTotal = selected.seats_total != null ? selected.seats_total : Infinity;
      const seatsTaken = selected.seats_taken != null ? selected.seats_taken : 0;
      if (seatsTotal !== Infinity && seatsTaken >= seatsTotal) {
        setBooking(false);
        setBookingError("Selected slot is fully booked. Please pick another slot.");
        return;
      }

      // derive start_time and duration (same logic as before)
      let start_time_iso = selected.start_iso || null;
      let duration_minutes = selected.duration_minutes || SLOT_MINUTES;
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
            duration_minutes = SLOT_MINUTES;
          }
        } catch (e) {
          if (!start_time_iso) start_time_iso = new Date().toISOString();
          if (!duration_minutes) duration_minutes = SLOT_MINUTES;
        }
      }

      // Prepare booking payload to pass to next step (the next step should call /api/book)
      const bookingPayload = {
        user_id: formData.user_id,
        start_time: start_time_iso,
        duration_minutes,
        document_id: formData.document_id || null,
        slot_index: formData.slot_index,
        day_date: formData.day_date,
      };

      // Save prepared booking info into parent form state so next step can use it
      setField({
        booking_prepared: true,
        booking_payload: bookingPayload,
        appointment: null,
        assigned_agent_id: null,
        assigned_agent_username: null,
        status: "pending", // local status; actual booking will set real status
      });

      setBooking(false);
      if (typeof onNext === "function") onNext();
      return;
    } catch (err) {
      console.error("Booking preparation error:", err);
      setBookingError("Error preparing booking. Please try again.");
      setBooking(false);
    }
  };


  // UI pieces
  const selectedSlot = findSelectedSlot();

  return (
    <div className="card schedule-officer" aria-live="polite">
      <h1 style={{ textAlign: "center", fontWeight: 600 }}>Slot Booking for Video KYC</h1>
      <h3>Select Date & Time</h3>
      <div className="subtitle">Choose one of the next 7 days (starting tomorrow) and pick an available timeslot.</div>

      {/* Dates row */}
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {dates.map((d) => {
          const isActive = d.iso === selectedDate;
          return (
            <button
              key={d.iso}
              type="button"
              onClick={() => selectDate(d.iso)}
              className={"date-pill " + (isActive ? "active" : "")}
              aria-pressed={isActive}
            >
              <div style={{ fontSize: 13 }}>{d.label.split(",")[0]}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{d.iso}</div>
            </button>
          );
        })}
      </div>

      {/* Selected time display + actions */}
      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginTop: 14 }}>
        <div className="form-row">
          <label className="label">Selected date</label>
          <input readOnly className="input" value={formData.day_date || ""} />
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
    // determine the default date (first available in dates array)
    const defaultDate = dates[0]?.iso || "";

    // clear slot + error states
    setSlots([]);
    setFetchError(null);
    setBookingError(null);

    // update both state and parent form
    setSelectedDate(defaultDate);
    setField({
      day_date: defaultDate,
      slot_index: null,
      time_label: "",
    });

    // re-fetch slots for the default date (optional, ensures UI updates instantly)
    if (defaultDate) {
      fetchSlots(defaultDate);
    }
  }}
>
  Reset
</button>


            <button
              type="button"
              className="btn primary"
              onClick={handleNextClick}
              disabled={booking || loadingSlots || !formData.day_date || formData.slot_index == null || !!fetchError}
            >
              {booking ? "Booking..." : "Next"}
            </button>
          </div>
        </div>
      </div>

      {loadingSlots && <div style={{ marginTop: 12, color: "var(--muted)" }}>Loading slots...</div>}
      {fetchError && <div className="error-message" role="alert">{fetchError}</div>}
      {bookingError && <div className="error-message" role="alert" style={{ marginTop: 8 }}>{bookingError}</div>}

      {/* Slots */}
      <div className="slots" style={{ marginTop: 12 }}>
        {!loadingSlots && slots.length === 0 && !fetchError && (
          <div style={{ color: "var(--muted)", padding: 8 }}>No slots available for this date.</div>
        )}

        {slots.map((s) => {
  const seatsTotal = s.seats_total != null ? s.seats_total : Infinity;
  const seatsTaken = s.seats_taken != null ? s.seats_taken : 0;
  const seatsRemaining = seatsTotal === Infinity ? 1 : Math.max(0, seatsTotal - seatsTaken);

  const isDisabled = booking || !s.available || seatsRemaining <= 0;
  const isActive = formData.slot_index === s.slot_index;
  const availabilityLabel =
    seatsTotal === 0 ? 'No agents' : (seatsRemaining > 1 ? `${seatsRemaining} seats left` : (seatsRemaining === 1 ? '1 seat left' : 'No seats left'));

  return (
    <button
      key={s.slot_index}
      type="button"
      disabled={isDisabled}
      tabIndex={isDisabled ? -1 : 0}
      aria-disabled={isDisabled}
      aria-pressed={isActive}
      aria-label={s.available ? `Select ${s.time_label} — ${availabilityLabel}` : `${s.time_label} — no agents available`}
      title={s.available ? `${s.time_label} — ${availabilityLabel}` : `${s.time_label} — no agents available`}
      className={
        "slot card-slot " +
        (isDisabled ? "disabled " : "") +
        (isActive ? "active" : "")
      }
      onClick={() => selectSlot(s)}
    >
      <div className="slot-content">
        <div className="slot-time" aria-hidden="true">{s.time_label}</div>
        {/* <div className="slot-seats" aria-hidden="true">{availabilityLabel}</div> */}
      </div>
    </button>
  );
})}

      </div>

      {/* Pending status message */}
      {formData.status === 'pending' && formData.appointment && (
        <div style={{ marginTop: 12, color: "var(--muted)" }}>
          Reservation confirmed (id: {formData.appointment.id}). Waiting for agent assignment. We'll notify you when an agent is assigned.
        </div>
      )}

      <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between" }}>
        <button type="button" className="btn secondary" onClick={() => onBack && onBack()} disabled={booking}>
          Previous
        </button>

        <div style={{ color: "var(--muted)", alignSelf: "center", fontSize: 13 }}>
          Tip: slots reflect current capacity. If a slot is full it will be disabled.
        </div>
      </div>
    </div>
  );
}
