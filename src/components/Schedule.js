import React, { useEffect, useState, useRef } from "react";
import { Calendar, Clock, Users, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";

/**
 * Schedule Component - Redesigned with corrected styling
 * - Uses classNames instead of attribute style matching
 * - Selected date text becomes white only when active
 * - Loading spinner overlays slots grid with blurred translucent background
 * - Cleaner hover/active/border behavior
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
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState(null);
  const abortRef = useRef(null);

  const setField = (patch) => {
    if (typeof setFormData === "function") {
      setFormData((prev) => ({ ...(prev || {}), ...patch }));
    }
  };

  useEffect(() => {
    const todayIso = getLocalISODate();
    const arr = [];
    for (let i = 1; i <= 7; i++) {
      const iso = addDaysISO(todayIso, i);
      const dateObj = new Date(`${iso}T00:00:00`);
      const weekday = dateObj.toLocaleDateString(undefined, { weekday: "short" });
      const monthDay = dateObj.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      arr.push({ iso, weekday, monthDay });
    }
    setDates(arr);

    if (!formData?.day_date) {
      const tomorrow = arr[0]?.iso || "";
      setSelectedDate(tomorrow);
      setField({ day_date: tomorrow, slot_index: null, time_label: "" });
    } else {
      setSelectedDate(formData.day_date);
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    const day = selectedDate || formData.day_date;
    if (day) {
      setField({ day_date: day });
      fetchSlots(day);
    } else {
      setSlots([]);
      setFetchError(null);
    }
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [selectedDate]); // eslint-disable-line

  const transformSlotsForLocalNow = (arr, day_date) => {
    if (!Array.isArray(arr)) return [];
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

      const bookingPayload = {
        user_id: formData.user_id,
        start_time: start_time_iso,
        duration_minutes,
        document_id: formData.document_id || null,
        slot_index: formData.slot_index,
        day_date: formData.day_date,
      };

      setField({
        booking_prepared: true,
        booking_payload: bookingPayload,
        appointment: null,
        assigned_agent_id: null,
        assigned_agent_username: null,
        status: "pending",
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

  const handleReset = () => {
    const defaultDate = dates[0]?.iso || "";
    setSlots([]);
    setFetchError(null);
    setBookingError(null);
    setSelectedDate(defaultDate);
    setField({
      day_date: defaultDate,
      slot_index: null,
      time_label: "",
    });
    if (defaultDate) {
      fetchSlots(defaultDate);
    }
  };

  const selectedSlot = findSelectedSlot();

  return (
    <div className="schedule-wrapper" style={styles.wrapper}>
      {/* Inline CSS classes for predictable styling */}
      <style>{`
        /* core interactive selectors - use class names (more reliable than attribute style matching) */
        .date-pill {
          transition: all 0.18s ease;
        }
        .date-pill:hover:not(.active) {
          transform: translateY(-2px);
          box-shadow: 0 6px 14px rgba(15, 23, 36, 0.06);
        }
        .date-pill.active {
          background: linear-gradient(135deg, #d4af37, #b8860b);
          border-color: transparent;
          transform: translateY(-4px);
          box-shadow: 0 8px 20px rgba(212, 175, 55, 0.25);
        }
        .date-pill .date-weekday { color: #0f1724; }
        .date-pill .date-day { color: #9aa6b2; }

        .date-pill.active .date-weekday,
        .date-pill.active .date-day {
          color: #ffffff; /* selected date text = white only when active */
        }

        .slot-item {
          transition: all 0.18s ease;
          position: relative;
        }
        .slot-item:hover:not(.disabled):not(.active) {
          transform: translateY(-2px);
          box-shadow: 0 6px 14px rgba(15, 23, 36, 0.08);
          border-color: rgba(212, 175, 55, 0.16);
        }
        .slot-item.active {
          background: #0f1724;
          // color: #fff;
          border-color: transparent;
          transform: translateY(-4px);
          box-shadow: 0 8px 20px rgba(15, 23, 36, 0.2);
        }
        .slot-item.disabled {
          background: #f5f7f9;
          color: #a8b1b7;
          cursor: not-allowed;
          opacity: 0.7;
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 12px 24px rgba(212, 175, 55, 0.3);
        }
        .btn-secondary:hover:not(:disabled),
        .btn-reset:hover:not(:disabled) {
          background: #f8fafc;
          border-color: rgba(212, 175, 55, 0.12);
        }

        /* Spinner & overlay on slots area */
        .slots-container { position: relative; }
        .slots-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.6);
          backdrop-filter: blur(4px);
          z-index: 50;
          border-radius: 10px;
        }
        .spinner {
          width: 38px;
          height: 38px;
          border: 4px solid rgba(154, 166, 178, 0.25);
          border-top: 4px solid rgba(15,23,36,0.8);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Responsive tweaks */
        @media (max-width: 1200px) {
          .schedule-wrapper { margin-left: 40px !important; margin-right: 40px !important; }
        }
        @media (max-width: 768px) {
          .schedule-wrapper { margin-left: 20px !important; margin-right: 20px !important; padding: 12px !important; }
        }
      `}</style>

      {/* Header Section */}
      <div style={styles.header}>
        <h1 style={styles.title}>Schedule Your Video KYC Session</h1>
        <p style={styles.subtitle}>Select a convenient date and time slot for your verification call</p>
      </div>

      {/* Main Card */}
      <div style={styles.card}>
        {/* Date Selection Section */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <Calendar size={20} color="#d4af37" />
            <h3 style={styles.sectionTitle}>Select Date</h3>
          </div>
          <p style={styles.sectionDesc}>Choose from the next 7 available days</p>

          <div style={styles.dateGrid}>
            {dates.map((d) => {
              const isActive = d.iso === selectedDate;
              return (
                <button
                  key={d.iso}
                  type="button"
                  onClick={() => selectDate(d.iso)}
                  className={`date-pill ${isActive ? "active" : ""}`}
                  style={{
                    ...styles.datePill,
                  }}
                  aria-pressed={isActive}
                >
                  <div className="date-weekday" style={styles.dateWeekday}>{d.weekday}</div>
                  <div className="date-day" style={styles.dateDay}>{d.monthDay}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div style={styles.divider} />

        {/* Time Slot Section */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <Clock size={20} color="#d4af37" />
            <h3 style={styles.sectionTitle}>Select Time Slot</h3>
          </div>
          <p style={styles.sectionDesc}>
            {loadingSlots ? "Loading available slots..." : `Available slots for ${selectedDate || "selected date"}`}
          </p>

          {/* Selected Info Display */}
          {formData.time_label && (
            <div style={styles.selectedInfo}>
              <CheckCircle size={18} color="#16a34a" />
              <div>
                <div style={styles.selectedLabel}>Selected Time</div>
                <div style={styles.selectedValue}>{formData.time_label}</div>
              </div>
            </div>
          )}

          {/* Slots Grid */}
          <div className="slots-container" style={{ ...styles.slotsGrid, position: "relative" }}>
            {/* Overlay spinner sits above slots when loading */}
            {loadingSlots && (
              <div className="slots-overlay" aria-hidden="true">
                <div className="spinner" />
              </div>
            )}

            {!loadingSlots && slots.length === 0 && !fetchError && (
              <div style={styles.emptyState}>
                <Clock size={40} color="#9aa6b2" style={{ opacity: 0.3 }} />
                <div style={styles.emptyText}>No slots available for this date</div>
              </div>
            )}

            {slots.map((s) => {
              const seatsTotal = s.seats_total != null ? s.seats_total : Infinity;
              const seatsTaken = s.seats_taken != null ? s.seats_taken : 0;
              const seatsRemaining = seatsTotal === Infinity ? 1 : Math.max(0, seatsTotal - seatsTaken);
              const isDisabled = booking || !s.available || seatsRemaining <= 0;
              const isActive = formData.slot_index === s.slot_index;
              const availabilityLabel = seatsTotal === 0 ? 'No agents' : (seatsRemaining > 1 ? `${seatsRemaining} slots left` : (seatsRemaining === 1 ? '1 slot left' : 'No slots left'));

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
                  className={`slot-item ${isDisabled ? "disabled" : ""} ${isActive ? "active" : ""}`}
                  style={{
                    ...styles.slot,
                  }}
                  onClick={() => selectSlot(s)}
                >
                  <Clock size={16} style={{ opacity: isActive ? 1 : 0.6 }} />
                  <div style={styles.slotTime}>{s.time_label}</div>
                   
                </button>
              );
            })}
          </div>

        </div>

        {/* Error Messages */}
        {fetchError && (
          <div style={styles.errorBox}>
            <AlertCircle size={20} color="#dc2626" />
            <div>
              <div style={styles.errorTitle}>Connection Error</div>
              <div style={styles.errorMessage}>{fetchError}</div>
            </div>
          </div>
        )}

        {bookingError && (
          <div style={styles.errorBox}>
            <AlertCircle size={20} color="#dc2626" />
            <div>
              <div style={styles.errorTitle}>Booking Error</div>
              <div style={styles.errorMessage}>{bookingError}</div>
            </div>
          </div>
        )}

        {/* Pending Status */}
        {formData.status === 'pending' && formData.appointment && (
          <div style={styles.infoBox}>
            <CheckCircle size={20} color="#16a34a" />
            <div>
              <div style={styles.infoTitle}>Reservation Confirmed</div>
              <div style={styles.infoMessage}>
                Booking ID: {formData.appointment.id}. Waiting for agent assignment.
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={styles.actions}>
          <div style={styles.leftActions}>
            <button
              type="button"
              style={styles.btnSecondary}
              onClick={onBack}
              disabled={booking}
              className="btn-secondary"
            >
              Back
            </button>
            <button
              type="button"
              style={styles.btnReset}
              onClick={handleReset}
              disabled={booking || loadingSlots}
              className="btn-reset"
            >
              <RefreshCw size={16} />
              Reset
            </button>
          </div>

          <button
            type="button"
            style={{
              ...styles.btnPrimary,
              ...(booking || loadingSlots || !formData.day_date || formData.slot_index == null || !!fetchError ? styles.btnDisabled : {}),
            }}
            onClick={handleNextClick}
            disabled={booking || loadingSlots || !formData.day_date || formData.slot_index == null || !!fetchError}
            className="btn-primary"
          >
            {booking ? (
              <>
                <div style={styles.buttonSpinner} />
                Processing...
              </>
            ) : (
              <>
                Continue
                <CheckCircle size={18} />
              </>
            )}
          </button>
        </div>

        {/* Helper Tip */}
        <div style={styles.tip}>
          <Users size={14} color="#9aa6b2" />
          <span>Time slots show real-time availability. Fully booked slots are automatically disabled.</span>
        </div>
      </div>
    </div>
  );
}

/* inline style object (keeps same visual design but used in JSX for simplicity) */
const styles = {
  wrapper: {
    padding: '20px',
    marginLeft: '90px',
    marginRight: '90px',
    fontFamily: 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    minHeight: '100vh',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '32px',
    fontWeight: '700',
    color: '#0f1724',
    background: 'linear-gradient(135deg, #d4af37, #b8860b)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  subtitle: {
    margin: 0,
    fontSize: '15px',
    color: '#9aa6b2',
  },
  card: {
    background: 'linear-gradient(180deg, #fbfdff, #fff)',
    borderRadius: '16px',
    padding: '40px',
    boxShadow: '0 6px 18px rgba(19, 40, 57, 0.04)',
    border: '1px solid rgba(15,23,36,0.04)',
  },
  section: {
    marginBottom: '32px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '8px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '700',
    color: '#0f1724',
  },
  sectionDesc: {
    margin: '0 0 20px 0',
    fontSize: '14px',
    color: '#9aa6b2',
  },
  dateGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
    gap: '12px',
  },
  datePill: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px 12px',
    borderRadius: '12px',
    background: '#fff',
    border: '2px solid rgba(15,23,36,0.06)',
    cursor: 'pointer',
    outline: 'none',
  },
  dateWeekday: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#0f1724',
    marginBottom: '4px',
  },
  dateDay: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#9aa6b2',
  },
  divider: {
    height: '1px',
    background: 'linear-gradient(90deg, rgba(14,23,30,0.02), rgba(14,23,30,0.06), rgba(14,23,30,0.02))',
    margin: '32px 0',
  },
  selectedInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    background: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: '8px',
    marginBottom: '20px',
  },
  selectedLabel: {
    fontSize: '12px',
    color: '#166534',
    fontWeight: '500',
  },
  selectedValue: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#15803d',
  },
  slotsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '12px',
    minHeight: '120px',
  },
  slot: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '16px 12px',
    borderRadius: '10px',
    background: '#fff',
    border: '2px solid rgba(15,23,36,0.06)',
    cursor: 'pointer',
    outline: 'none',
  },
  slotTime: {
    fontSize: '15px',
    fontWeight: '700',
    textAlign: 'center',
  },
  slotBadge: {
    position: 'absolute',
    top: '6px',
    right: '6px',
    fontSize: '10px',
    fontWeight: '600',
    padding: '2px 6px',
    borderRadius: '999px',
    background: '#fef3c7',
    color: '#92400e',
  },
  emptyState: {
    gridColumn: '1 / -1',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '40px',
  },
  emptyText: {
    fontSize: '14px',
    color: '#9aa6b2',
  },
  errorBox: {
    display: 'flex',
    gap: '12px',
    padding: '16px',
    background: '#fee2e2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    marginTop: '20px',
    alignItems: 'flex-start',
  },
  errorTitle: {
    fontWeight: '600',
    fontSize: '14px',
    color: '#991b1b',
    marginBottom: '2px',
  },
  errorMessage: {
    fontSize: '13px',
    color: '#dc2626',
  },
  infoBox: {
    display: 'flex',
    gap: '12px',
    padding: '16px',
    background: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: '8px',
    marginTop: '20px',
    alignItems: 'flex-start',
  },
  infoTitle: {
    fontWeight: '600',
    fontSize: '14px',
    color: '#166534',
    marginBottom: '2px',
  },
  infoMessage: {
    fontSize: '13px',
    color: '#16a34a',
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '32px',
    gap: '12px',
    flexWrap: 'wrap',
  },
  leftActions: {
    display: 'flex',
    gap: '12px',
  },
  btnSecondary: {
    padding: '12px 24px',
    borderRadius: '8px',
    border: '1px solid rgba(15,23,36,0.1)',
    background: '#fff',
    color: '#0f1724',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px',
    transition: 'all 0.2s',
    outline: 'none',
  },
  btnReset: {
    padding: '12px 20px',
    borderRadius: '8px',
    border: '1px solid rgba(15,23,36,0.1)',
    background: '#fff',
    color: '#0f1724',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    outline: 'none',
  },
  btnPrimary: {
    padding: '12px 32px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(135deg, #d4af37, #b8860b)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: '700',
    fontSize: '14px',
    boxShadow: '0 8px 18px rgba(212, 175, 55, 0.2)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'all 0.2s',
    outline: 'none',
  },
  btnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  buttonSpinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTop: '2px solid #fff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  tip: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginTop: '24px',
    padding: '12px',
    background: '#f8fafc',
    borderRadius: '8px',
    fontSize: '13px',
    color: '#9aa6b2',
  },
};
