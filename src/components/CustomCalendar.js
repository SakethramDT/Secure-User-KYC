import React, { useState, useRef, useEffect } from 'react';
import { FaCalendarAlt } from 'react-icons/fa';

/**
 * CustomCalendarInput
 *
 * Props:
 * - value (string "YYYY-MM-DD")
 * - onChange (event-like: { target: { name, value } })
 * - name
 * - required
 * - minSelectableDate: "YYYY-MM-DD" | Date | "today" | null
 * - maxSelectableDate: "YYYY-MM-DD" | Date | "today" | null
 */
const CustomCalendarInput = ({
  value,
  onChange,
  name = "date_of_birth",
  required = false,
  minSelectableDate = null,
  maxSelectableDate = null,
}) => {
  const calendarRef = useRef(null);
  const yearGridRef = useRef(null);
  const wrapperRef = useRef(null);

  const today = new Date();
  today.setHours(0,0,0,0);

  // years from 1900 up to 2050
  const years = Array.from({ length: 2050 - 1900 + 1 }, (_, i) => 1900 + i);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const daysOfWeek = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const [showCalendar, setShowCalendar] = useState(false);
  const [popupPosition, setPopupPosition] = useState('bottom'); // 'bottom' | 'top'
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [activeScroll, setActiveScroll] = useState(null); // 'month' | 'year' | null

  // -------------------
  // Helpers: parse/format and selectable range handling
  // -------------------
  // parse "YYYY-MM-DD" into {year, month, day} or null
  const parseDate = (dateString) => {
    if (!dateString) return null;
    const parts = String(dateString).split('-');
    if (parts.length !== 3) return null;
    const [y, m, d] = parts;
    const year = parseInt(y, 10);
    const month = parseInt(m, 10) - 1;
    const day = parseInt(d, 10);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
    return { year, month, day };
  };

  // format date to "YYYY-MM-DD"
  const formatDate = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  // format for display dd-mm-yyyy
  const formatDisplayDate = (dateString) => {
    if (!dateString) return '';
    const [y, m, d] = dateString.split('-');
    return `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`;
  };

  // accept "YYYY-MM-DD" | Date | "today" | null -> returns Date (midnight) or null
  const normalizeSelectableInput = (input) => {
    if (!input) return null;
    if (input === 'today') {
      const d = new Date();
      d.setHours(0,0,0,0);
      return d;
    }
    if (input instanceof Date) {
      const d = new Date(input);
      d.setHours(0,0,0,0);
      return d;
    }
    // string
    const parsed = parseDate(String(input));
    if (parsed) {
      const d = new Date(parsed.year, parsed.month, parsed.day);
      d.setHours(0,0,0,0);
      return d;
    }
    return null;
  };

  const minDateObj = normalizeSelectableInput(minSelectableDate);
  const maxDateObj = normalizeSelectableInput(maxSelectableDate);

  // check y,m,d vs min/max
  const isDateDisabledByRange = (y, m, d) => {
    const dt = new Date(y, m, d);
    dt.setHours(0,0,0,0);
    if (minDateObj && dt < minDateObj) return true;
    if (maxDateObj && dt > maxDateObj) return true;
    return false;
  };

  // check whether an entire month is disabled (all days in month are outside range)
  const isMonthDisabled = (year, month) => {
    // first day of month
    const first = new Date(year, month, 1);
    first.setHours(0,0,0,0);
    // last day of month
    const last = new Date(year, month + 1, 0);
    last.setHours(0,0,0,0);
    // If max exists and the first day is after max => entire month > max
    if (maxDateObj && first > maxDateObj) return true;
    // If min exists and the last day is before min => entire month < min
    if (minDateObj && last < minDateObj) return true;
    return false;
  };

  // check whether an entire year is disabled (all days in year outside range)
  const isYearDisabled = (year) => {
    const first = new Date(year, 0, 1); first.setHours(0,0,0,0);
    const last = new Date(year, 11, 31); last.setHours(0,0,0,0);
    if (maxDateObj && first > maxDateObj) return true;
    if (minDateObj && last < minDateObj) return true;
    return false;
  };

  // clamp a Date to min/max if out of range; returns a Date
  const clampDateToRange = (date) => {
    if (!date) return date;
    let d = new Date(date);
    d.setHours(0,0,0,0);
    if (minDateObj && d < minDateObj) return new Date(minDateObj);
    if (maxDateObj && d > maxDateObj) return new Date(maxDateObj);
    return d;
  };

  // find first enabled month in a given year (returns month index 0-11 or null)
  const findFirstEnabledMonthInYear = (year) => {
    for (let m = 0; m < 12; m++) {
      if (!isMonthDisabled(year, m)) return m;
    }
    return null;
  };

  // find nearest enabled month in or after/before given year if none in year
  const findNearestEnabledMonthAroundYear = (year) => {
    // check current year first
    const inYear = findFirstEnabledMonthInYear(year);
    if (inYear !== null) return { year, month: inYear };

    // search forward and backward limited by years array bounds
    const minYear = years[0];
    const maxYear = years[years.length - 1];
    for (let offset = 1; offset <= Math.max(year - minYear, maxYear - year); offset++) {
      // forward
      const yf = year + offset;
      if (yf <= maxYear) {
        const mf = findFirstEnabledMonthInYear(yf);
        if (mf !== null) return { year: yf, month: mf };
      }
      // backward
      const yb = year - offset;
      if (yb >= minYear) {
        const mb = findFirstEnabledMonthInYear(yb);
        if (mb !== null) return { year: yb, month: mb };
      }
    }
    return null;
  };

  // -------------------
  // keep internal selected year/month synced with passed value (and clamp)
  // -------------------
  useEffect(() => {
    if (!value) return;
    const parsed = parseDate(value);
    if (parsed) {
      const valDate = new Date(parsed.year, parsed.month, parsed.day);
      const clamped = clampDateToRange(valDate);
      setSelectedYear(clamped.getFullYear());
      setSelectedMonth(clamped.getMonth());
    }
  }, [value, minSelectableDate, maxSelectableDate]);

  // -------------------
  // document click to close calendar
  // -------------------
  useEffect(() => {
    const onDocClick = (e) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target)) {
        setShowCalendar(false);
        setActiveScroll(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // -------------------
  // utility: center element in container
  // -------------------
  const instantCenterInGrid = (container, el) => {
    if (!container || !el) return;
    const containerHeight = container.clientHeight;
    const elTop = el.offsetTop;
    const elHeight = el.offsetHeight;
    const targetTop = elTop - (containerHeight / 2) + (elHeight / 2);
    container.scrollTop = Math.max(0, Math.min(targetTop, container.scrollHeight - containerHeight));
  };

  const openMonthList = () => {
    // if the currently selected month is disabled for the selected year,
    // pick the first enabled month in that year (or nearest)
    if (isMonthDisabled(selectedYear, selectedMonth)) {
      const found = findFirstEnabledMonthInYear(selectedYear) || findNearestEnabledMonthAroundYear(selectedYear);
      if (found) {
        setSelectedYear(found.year);
        setSelectedMonth(found.month);
      }
    }
    setActiveScroll('month');
  };

  const openYearList = () => {
    setActiveScroll('year');
    // center selected year in the grid after paint
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = yearGridRef.current;
        const el = container?.querySelector(`[data-year="${selectedYear}"]`);
        if (container && el) instantCenterInGrid(container, el);
      });
    });
  };

  // -------------------
  // month/day helpers
  // -------------------
  const getDaysInMonth = (year, month) => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    return { daysInMonth: lastDay.getDate(), startingDayOfWeek: firstDay.getDay() };
  };

  // -------------------
  // selecting a date
  // -------------------
  const handleDateSelect = (day) => {
    if (isDateDisabledByRange(selectedYear, selectedMonth, day)) {
      return; // blocked
    }
    const formatted = formatDate(selectedYear, selectedMonth, day);
    if (onChange) onChange({ target: { name, value: formatted } });
    setShowCalendar(false);
    setActiveScroll(null);
  };

  // -------------------
  // render days grid with disabled states
  // -------------------
  const renderCalendarDays = () => {
    const { daysInMonth, startingDayOfWeek } = getDaysInMonth(selectedYear, selectedMonth);
    const parsedValue = parseDate(value);
    const days = [];

    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="custom-calendar__day empty" />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const disabled = isDateDisabledByRange(selectedYear, selectedMonth, day);

      const isSelected = parsedValue &&
        parsedValue.year === selectedYear &&
        parsedValue.month === selectedMonth &&
        parsedValue.day === day;

      const isToday = today.getDate() === day &&
        today.getMonth() === selectedMonth &&
        today.getFullYear() === selectedYear;

      days.push(
        <div
          key={day}
          className={`custom-calendar__day ${disabled ? 'disabled' : ''} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
          onClick={() => { if (!disabled) handleDateSelect(day); }}
          aria-disabled={disabled}
        >
          {day}
        </div>
      );
    }
    return days;
  };

  // -------------------
  // toggle popup with smart positioning and clamp selected month/year to allowed range
  // -------------------
  const toggleCalendar = (e) => {
    if (!showCalendar) {
      const rect = wrapperRef.current ? wrapperRef.current.getBoundingClientRect() : e.currentTarget.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      const approxPopupHeight = 420;
      if (spaceBelow < approxPopupHeight && spaceAbove > spaceBelow) {
        setPopupPosition('top');
      } else {
        setPopupPosition('bottom');
      }

      // clamp the visible month/year into the allowed range; if month disabled, pick nearest allowed month
      let currentShownDate = new Date(selectedYear, selectedMonth, 1);
      if (value) {
        const parsed = parseDate(value);
        if (parsed) currentShownDate = new Date(parsed.year, parsed.month, 1);
      }
      const clamped = clampDateToRange(currentShownDate);
      // if clamped month is disabled for some reason, find nearest enabled
      let newYear = clamped.getFullYear();
      let newMonth = clamped.getMonth();
      if (isMonthDisabled(newYear, newMonth)) {
        const found = findNearestEnabledMonthAroundYear(newYear);
        if (found) {
          newYear = found.year;
          newMonth = found.month;
        }
      }
      setSelectedYear(newYear);
      setSelectedMonth(newMonth);

      setShowCalendar(true);
      setActiveScroll(null);
    } else {
      setShowCalendar(false);
      setActiveScroll(null);
    }
  };

  const inputDisplayValue = value ? formatDisplayDate(value) : 'dd-mm-yyyy';
  const isPlaceholder = !value;

  // Theme colors (kept inline with your styles)
  const primary = '#cba344';
  const primaryDark = '#e2a535ff';

  return (
    <div className="custom-calendar" ref={calendarRef}>
      <style>{`
        .custom-calendar { position: relative; width: 100%; max-width: 360px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }

        .custom-calendar__input-wrapper { display:flex; align-items:center; border-radius:8px; width:100%; padding:10px 12px; cursor:pointer; }
        .custom-calendar__input-container { display:flex; align-items:center; background:#f9f9f9; border:1px solid #ddd; border-radius:6px; padding:6px 10px; }
        .custom-calendar__icon { color:#777; font-size:16px; margin-right:8px; }
        .custom-calendar__input { border:none; outline:none; font-size:15px; color:#222; background:transparent; flex:1; }
        .custom-calendar__input.placeholder { color:#aaa; font-style:italic; }

        .custom-calendar__popup { position:absolute; left:0; background:white; border-radius:12px; box-shadow:0 8px 30px rgba(0,0,0,0.12); z-index:1000; width:100%; min-width:320px; overflow:hidden; transition: all 0.14s ease; pointer-events:auto; }
        .custom-calendar__popup.bottom { top:calc(100% + 8px); }
        .custom-calendar__popup.top { bottom:calc(100% + 8px); }

        .custom-calendar__header { background: linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%); padding:14px 16px; color:white; display:flex; align-items:center; justify-content:space-between; }
        .custom-calendar__title { font-size:16px; font-weight:600; margin:0; }
        .custom-calendar__subtitle { font-size:12px; opacity:0.95; }

        .custom-calendar__pill { background: rgba(255,255,255,0.18); border-radius:12px; padding:8px 14px; display:inline-flex; gap:10px; align-items:center; font-weight:700; }
        .custom-calendar__pill-part { cursor:pointer; padding:4px 6px; border-radius:8px; user-select:none; }
        .custom-calendar__pill-part:hover { background: rgba(255,255,255,0.06); }

        .custom-calendar__scroll { display:flex; border-bottom:1px solid #eee; }
        .custom-calendar__scroll-column { flex:1; height:160px; overflow-y:auto; background:#fafafa; padding-top:8px; box-sizing:border-box; }
        .custom-calendar__scroll-column::-webkit-scrollbar { width:6px; }
        .custom-calendar__scroll-column::-webkit-scrollbar-thumb { background: linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%); border-radius:10px; }
        .custom-calendar__scroll-item { padding:10px 14px; cursor:pointer; text-align:center; font-size:14px; color:#444; font-weight:500; }
        .custom-calendar__scroll-item:hover { background: linear-gradient(135deg, rgba(203,163,68,0.06) 0%, rgba(166,123,42,0.06) 100%); color:#3b3f8a; }
        .custom-calendar__scroll-item.active { background: linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%); color:white; font-weight:700; }
        .custom-calendar__column-header { position:sticky; top:0; background:#f7f7fb; color:#333; padding:10px; text-align:center; font-weight:600; font-size:12px; text-transform:uppercase; z-index:10; border-bottom:1px solid #eee; }

        /* Month grid (3 columns) */
        .custom-calendar__months-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; padding:12px; background:#fafafa; border-bottom:1px solid #eee; max-height:220px; overflow:auto; }
        .custom-calendar__month-item { padding:12px; border-radius:10px; text-align:center; font-weight:700; cursor:pointer; background:transparent; color:#444; user-select:none; transition: all .12s ease; }
        .custom-calendar__month-item:hover { background: linear-gradient(135deg, rgba(203,163,68,0.06) 0%, rgba(166,123,42,0.06) 100%); color:#3b3f8a; transform: translateY(-2px); }
        .custom-calendar__month-item.active { background: linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%); color:white; }

        /* disabled month */
        .custom-calendar__month-item.disabled {
          cursor: not-allowed;
          color: #bdbdbd;
          background: transparent !important;
          transform: none !important;
          opacity: 0.65;
        }
        .custom-calendar__month-item.disabled:hover {
          background: transparent;
          color: #bdbdbd;
        }

        /* Year grid (3 columns) - same look/behavior as months */
        .custom-calendar__years-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; padding:12px; background:#fafafa; border-bottom:1px solid #eee; max-height:300px; overflow:auto; }
        .custom-calendar__year-item { padding:10px; border-radius:8px; text-align:center; font-weight:600; cursor:pointer; background:transparent; color:#444; user-select:none; transition: all .12s ease; }
        .custom-calendar__year-item:hover { background: linear-gradient(135deg, rgba(203,163,68,0.06) 0%, rgba(166,123,42,0.06) 100%); color:#3b3f8a; transform: translateY(-2px); }
        .custom-calendar__year-item.active { background: linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%); color:white; font-weight:700; }

        /* disabled year */
        .custom-calendar__year-item.disabled {
          cursor: not-allowed;
          color: #bdbdbd;
          background: transparent !important;
          transform: none !important;
          opacity: 0.65;
        }
        .custom-calendar__year-item.disabled:hover {
          background: transparent;
          color: #bdbdbd;
        }

        .custom-calendar__body { padding:14px 16px; }
        .custom-calendar__weekdays { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; margin-bottom:10px; }
        .custom-calendar__weekday { text-align:center; font-size:12px; font-weight:700; color:${primary}; padding:6px 0; }

        .custom-calendar__days { display:grid; grid-template-columns:repeat(7,1fr); gap:8px; }
        .custom-calendar__day { aspect-ratio:1; display:flex; align-items:center; justify-content:center; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; transition: all .1s; color:#333; }
        .custom-calendar__day:not(.empty):hover { background: linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%); color:white; transform:translateY(-3px); }
        .custom-calendar__day.selected { background: linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%); color:white; }
        .custom-calendar__day.today { border:2px solid ${primary}; font-weight:700; }

        /* Disabled days */
        .custom-calendar__day.disabled {
          cursor: not-allowed;
          color: #bdbdbd;
          background: transparent !important;
          transform: none !important;
          opacity: 0.65;
        }
        .custom-calendar__day.disabled:hover {
          background: transparent;
          color: #bdbdbd;
        }
      `}</style>

      <div className="custom-calendar__input-container" ref={wrapperRef}>
        <div
          className="custom-calendar__input-wrapper"
          onClick={toggleCalendar}
        >
          <FaCalendarAlt className="custom-calendar__icon" />
          <input
            className={`custom-calendar__input ${isPlaceholder ? 'placeholder' : ''}`}
            type="text"
            name={name}
            value={inputDisplayValue}
            readOnly
            required={required}
          />
        </div>
      </div>

      {showCalendar && (
        <div className={`custom-calendar__popup ${popupPosition}`}>
          <div className="custom-calendar__header">
            <div>
              <div className="custom-calendar__title">Select Date</div>
              <div className="custom-calendar__subtitle">Tap month or year to change</div>
            </div>

            <div className="custom-calendar__pill">
              <div
                className="custom-calendar__pill-part"
                onClick={() => openMonthList()}
              >
                {months[selectedMonth]}
              </div>
              <div
                className="custom-calendar__pill-part"
                onClick={() => openYearList()}
              >
                {selectedYear}
              </div>
            </div>
          </div>

          {/* YEAR GRID */}
          {activeScroll === 'year' && (
            <div className="custom-calendar__years-grid" ref={yearGridRef} role="list">
              {years.map((y) => {
                const disabled = isYearDisabled(y);
                return (
                  <div
                    key={y}
                    data-year={y}
                    role="listitem"
                    className={`custom-calendar__year-item ${selectedYear === y ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                    onClick={() => {
                      if (disabled) return;
                      setSelectedYear(y);
                      // after selecting year, open month grid automatically; ensure we pick an enabled month
                      const firstMonth = findFirstEnabledMonthInYear(y);
                      if (firstMonth !== null) {
                        setSelectedMonth(firstMonth);
                      } else {
                        // try to find nearest allowed month across years
                        const found = findNearestEnabledMonthAroundYear(y);
                        if (found) {
                          setSelectedYear(found.year);
                          setSelectedMonth(found.month);
                        }
                      }
                      setActiveScroll('month');
                      requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                          const container = yearGridRef.current;
                          const el = container?.querySelector(`[data-year="${y}"]`);
                          if (container && el) instantCenterInGrid(container, el);
                        });
                      });
                    }}
                    aria-disabled={disabled}
                  >
                    {y}
                  </div>
                );
              })}
            </div>
          )}

          {/* MONTH GRID */}
          {activeScroll === 'month' && (
            <div className="custom-calendar__months-grid" role="list">
              {months.map((m, idx) => {
                const disabled = isMonthDisabled(selectedYear, idx);
                return (
                  <div
                    key={m}
                    data-month={idx}
                    role="listitem"
                    className={`custom-calendar__month-item ${selectedMonth === idx ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                    onClick={() => {
                      if (disabled) return;
                      setSelectedMonth(idx);
                      setActiveScroll(null);
                    }}
                    aria-disabled={disabled}
                  >
                    {m}
                  </div>
                );
              })}
            </div>
          )}

          {/* DAY GRID: only visible when not choosing month/year */}
          {activeScroll === null && (
            <div className="custom-calendar__body">
              <div className="custom-calendar__weekdays">
                {daysOfWeek.map((d) => (
                  <div key={d} className="custom-calendar__weekday">{d}</div>
                ))}
              </div>

              <div className="custom-calendar__days">{renderCalendarDays()}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomCalendarInput;
