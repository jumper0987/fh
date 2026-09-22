import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Building2,
  Trophy,
  CheckCircle2,
  Lock,
  MapPin,
  Clock,
  ListFilter,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Medal,
  LogOut,
  Camera,
  X,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { supabase, TABLE, PROFILES_TABLE, AVATAR_BUCKET } from "./supabaseClient";
import {
  EVENTS,
  lectureEvents,
  examEvents,
  TYPE_LABEL,
  PHASES,
  courseColor,
  shortCourse,
  fmtDate,
} from "./data/events";

const NAME_KEY = "fh-baufortschritt-name";
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function hashColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

function safeSlug(name) {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function Avatar({ name, url, size = 22 }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="fh-avatar-img"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="fh-avatar"
      style={{ background: hashColor(name), width: size, height: size, fontSize: size * 0.42 }}
    >
      {initials(name)}
    </span>
  );
}

/* Kalender-Monatsraster */
function monthCells(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Montag = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function App() {
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || "");
  const [nameInput, setNameInput] = useState("");
  const [statusMap, setStatusMap] = useState(() => new Map());
  const completed = useMemo(() => {
    const s = new Set();
    for (const [id, status] of statusMap) if (status === "done") s.add(id);
    return s;
  }, [statusMap]);
  const resolvedIds = useMemo(() => new Set(statusMap.keys()), [statusMap]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("upcoming");
  const [showAllCourses, setShowAllCourses] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [avatars, setAvatars] = useState({});
  const [uploading, setUploading] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(null);
  const fileInputRef = useRef(null);
  const now = useMemo(() => new Date(), []);

  const totalCount = lectureEvents.length;

  const loadOwnProgress = useCallback(async (who) => {
    setLoaded(false);
    const { data, error } = await supabase
      .from(TABLE)
      .select("event_id, done, status")
      .eq("student_name", who);
    if (!error && data) {
      const map = new Map();
      for (const r of data) {
        const status = r.status || (r.done ? "done" : null);
        if (status) map.set(r.event_id, status);
      }
      setStatusMap(map);
    }
    setLoaded(true);
  }, []);

  const loadLeaderboard = useCallback(async () => {
    const { data, error } = await supabase.from(TABLE).select("student_name, event_id, done, status");
    if (error || !data) return;
    const lectureIds = new Set(lectureEvents.map((e) => e.id));
    const counts = {};
    for (const row of data) {
      if (!lectureIds.has(row.event_id)) continue;
      const status = row.status || (row.done ? "done" : null);
      if (!status) continue;
      if (!counts[row.student_name]) counts[row.student_name] = { done: 0, excused: 0, unexcused: 0 };
      if (status === "done") counts[row.student_name].done++;
      else if (status === "absent_excused") counts[row.student_name].excused++;
      else if (status === "absent_unexcused") counts[row.student_name].unexcused++;
    }
    const list = Object.entries(counts)
      .map(([n, c]) => ({
        name: n,
        percent: Math.round(((c.done + c.excused + c.unexcused) / totalCount) * 100),
        excusedPercent: Math.round((c.excused / totalCount) * 100),
        unexcusedPercent: Math.round((c.unexcused / totalCount) * 100),
      }))
      .sort((a, b) => b.percent - a.percent);
    setLeaderboard(list);
  }, [totalCount]);

  const loadAvatars = useCallback(async () => {
    const { data, error } = await supabase.from(PROFILES_TABLE).select("student_name, avatar_url");
    if (error || !data) return;
    const map = {};
    for (const row of data) if (row.avatar_url) map[row.student_name] = row.avatar_url;
    setAvatars(map);
  }, []);

  useEffect(() => {
    if (!name) return;
    loadOwnProgress(name);
    loadLeaderboard();
    loadAvatars();

    const channel = supabase
      .channel("fh_baufortschritt_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, () => {
        loadLeaderboard();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: PROFILES_TABLE }, () => {
        loadAvatars();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [name, loadOwnProgress, loadLeaderboard, loadAvatars]);

  const chooseName = (e) => {
    e.preventDefault();
    const clean = nameInput.trim();
    if (!clean) return;
    localStorage.setItem(NAME_KEY, clean);
    setName(clean);
  };

  const switchUser = () => {
    localStorage.removeItem(NAME_KEY);
    setName("");
    setNameInput("");
    setStatusMap(new Map());
  };

  const setEventStatus = useCallback(
    async (id, newStatus) => {
      setStatusMap((prev) => {
        const next = new Map(prev);
        if (newStatus) next.set(id, newStatus);
        else next.delete(id);
        return next;
      });
      const { error } = await supabase
        .from(TABLE)
        .upsert(
          {
            student_name: name,
            event_id: id,
            done: newStatus === "done",
            status: newStatus,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "student_name,event_id" }
        );
      if (error) console.error("Speichern fehlgeschlagen", error);
    },
    [name]
  );

  const bulkSetStatus = useCallback(
    async (date, newStatus) => {
      const dayEvents = EVENTS.filter((e) => e.date === date);
      if (dayEvents.length === 0) return;
      setStatusMap((prev) => {
        const next = new Map(prev);
        for (const e of dayEvents) {
          if (newStatus) next.set(e.id, newStatus);
          else next.delete(e.id);
        }
        return next;
      });
      const rows = dayEvents.map((e) => ({
        student_name: name,
        event_id: e.id,
        done: newStatus === "done",
        status: newStatus,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: "student_name,event_id" });
      if (error) console.error("Speichern fehlgeschlagen", error);
    },
    [name]
  );

  const openFilePicker = () => fileInputRef.current?.click();

  const onAvatarFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Bitte ein Bild auswählen.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      alert("Bild ist zu groß (max. 3 MB).");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${safeSlug(name)}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
      upsert: true,
      cacheControl: "3600",
    });
    if (upErr) {
      console.error("Avatar-Upload fehlgeschlagen", upErr);
      alert("Hochladen hat nicht geklappt: " + upErr.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const url = data.publicUrl;
    const { error: saveErr } = await supabase
      .from(PROFILES_TABLE)
      .upsert(
        { student_name: name, avatar_url: url, updated_at: new Date().toISOString() },
        { onConflict: "student_name" }
      );
    if (saveErr) console.error("Profil speichern fehlgeschlagen", saveErr);
    setAvatars((prev) => ({ ...prev, [name]: url }));
    setUploading(false);
  };

  const completedCount = lectureEvents.filter((e) => completed.has(e.id)).length;
  const excusedCount = lectureEvents.filter((e) => statusMap.get(e.id) === "absent_excused").length;
  const unexcusedCount = lectureEvents.filter((e) => statusMap.get(e.id) === "absent_unexcused").length;
  const resolvedCount = completedCount + excusedCount + unexcusedCount;
  const remaining = totalCount - resolvedCount;
  const percent = totalCount ? Math.round((resolvedCount / totalCount) * 1000) / 10 : 0;
  const excusedPercent = totalCount ? Math.round((excusedCount / totalCount) * 1000) / 10 : 0;
  const unexcusedPercent = totalCount ? Math.round((unexcusedCount / totalCount) * 1000) / 10 : 0;

  const phaseIndex = (() => {
    let idx = 0;
    for (let i = 0; i < PHASES.length; i++) if (percent >= PHASES[i].min) idx = i;
    return idx;
  })();
  const phase = PHASES[phaseIndex];
  const nextPhase = PHASES[phaseIndex + 1];

  const streak = (() => {
    const past = lectureEvents.filter((e) => e.endAt < now).sort((a, b) => b.startAt - a.startAt);
    let s = 0;
    for (const e of past) {
      if (completed.has(e.id)) s++;
      else break;
    }
    return s;
  })();

  const calendarDayStatus = useMemo(() => {
    const buckets = {};
    for (const e of EVENTS) {
      if (!buckets[e.date]) buckets[e.date] = { lecture: [], exam: [] };
      buckets[e.date][e.type === "exam" ? "exam" : "lecture"].push(statusMap.get(e.id) || null);
    }
    const stateFor = (statuses) => {
      if (statuses.length === 0) return null;
      if (statuses.every((s) => s === "done")) return "done";
      if (statuses.some((s) => s === "absent_unexcused")) return "unexcused";
      if (statuses.some((s) => s === "absent_excused")) return "excused";
      return "open";
    };
    const map = {};
    for (const [date, b] of Object.entries(buckets)) {
      map[date] = {
        lecture: b.lecture.length > 0,
        lectureState: stateFor(b.lecture),
        exam: b.exam.length > 0,
        examState: stateFor(b.exam),
      };
    }
    return map;
  }, [statusMap]);

  const courseStats = useMemo(() => {
    const map = {};
    for (const e of lectureEvents) {
      if (!map[e.course]) map[e.course] = { total: 0, done: 0 };
      map[e.course].total++;
      if (completed.has(e.id)) map[e.course].done++;
    }
    return Object.entries(map)
      .map(([course, v]) => ({ course, ...v, color: courseColor[course] }))
      .sort((a, b) => b.done / b.total - a.done / a.total || a.course.localeCompare(b.course));
  }, [completed]);

  const badges = useMemo(() => {
    const milestones = [1, 10, 25, 50, 75, 100].filter((m) => m <= totalCount || m === 1);
    const list = milestones.map((m) => ({
      key: `count-${m}`,
      label: `${m} Termine geschafft`,
      unlocked: completedCount >= m,
    }));
    [5, 10, 20].forEach((m) =>
      list.push({ key: `streak-${m}`, label: `Serie von ${m} ohne Fehltermin`, unlocked: streak >= m })
    );
    list.push({ key: "gleichenfeier", label: "Gleichenfeier erreicht (50 %)", unlocked: percent >= 55 });
    list.push({ key: "uebergabe", label: "Schlüsselübergabe (100 %)", unlocked: percent >= 100 });
    return list;
  }, [completedCount, streak, percent, totalCount]);

  const cells = useMemo(() => monthCells(calendarMonth), [calendarMonth]);

  const filtered = useMemo(() => {
    if (selectedDate) {
      return EVENTS.filter((e) => e.date === selectedDate).sort((a, b) => a.startAt - b.startAt);
    }
    const weekFromNow = new Date(now);
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    if (tab === "exams") return examEvents.slice().sort((a, b) => a.startAt - b.startAt);
    if (tab === "past") {
      return lectureEvents.filter((e) => e.endAt < now).sort((a, b) => b.startAt - a.startAt);
    }
    let list = lectureEvents.slice();
    if (tab === "upcoming") list = list.filter((e) => e.endAt >= now || !resolvedIds.has(e.id));
    if (tab === "week") list = list.filter((e) => e.startAt >= now && e.startAt <= weekFromNow);
    return list.sort((a, b) => a.startAt - b.startAt);
  }, [tab, resolvedIds, now, selectedDate]);

  const grouped = useMemo(() => {
    const g = [];
    let lastDate = null;
    for (const e of filtered) {
      if (e.date !== lastDate) {
        g.push({ date: e.date, items: [] });
        lastDate = e.date;
      }
      g[g.length - 1].items.push(e);
    }
    return g;
  }, [filtered]);

  const fillHeight = 176 * (percent / 100);
  const monthLabel = calendarMonth.toLocaleDateString("de-AT", { month: "long", year: "numeric" });
  const todayISO = toISODate(now);

  if (!name) {
    return (
      <>
        <GlobalStyle />
        <div className="fh-root fh-gate">
          <div className="fh-head-label">FH Campus Wien</div>
          <h1 className="fh-title">Baufortschritt Semester</h1>
          <p className="fh-hero-sub" style={{ marginBottom: 18 }}>
            Trag deinen Namen ein, um deinen eigenen Vorlesungs-Fortschritt zu tracken.
            Andere aus deinem Jahrgang sehen dich in der Bestenliste.
          </p>
          <form onSubmit={chooseName} className="fh-gate-form">
            <input
              className="fh-input"
              placeholder="Dein Name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              autoFocus
            />
            <button className="fh-btn" type="submit">Los geht's</button>
          </form>
        </div>
      </>
    );
  }

  return (
    <>
      <GlobalStyle />
      <div className="fh-root">
        <div className="fh-topbar">
          <div>
            <div className="fh-head-label">FH Campus Wien</div>
            <h1 className="fh-title">Baufortschritt Semester</h1>
          </div>
          <div className="fh-user-block">
            <button className="fh-avatar-btn" onClick={openFilePicker} title="Profilbild ändern" disabled={uploading}>
              <Avatar name={name} url={avatars[name]} size={34} />
              <span className="fh-avatar-edit"><Camera size={11} /></span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={onAvatarFileChange}
            />
            <div className="fh-user-text">
              <span>{name}</span>
              <button className="fh-user-logout" onClick={switchUser} title="Namen ändern">
                <LogOut size={12} /> wechseln
              </button>
            </div>
          </div>
        </div>

        <div className="fh-hero">
          <svg width="120" height="200" viewBox="0 0 120 220" style={{ flexShrink: 0 }}>
            <rect x="8" y="204" width="104" height="10" rx="2" fill="#232a38" />
            <rect x="20" y="24" width="80" height="180" rx="2" fill="#1a202b" stroke="#2b3446" />
            <clipPath id="fillClip">
              <rect x="20" y={204 - fillHeight} width="80" height={fillHeight} />
            </clipPath>
            <rect x="20" y="24" width="80" height="180" fill="#ff8a3d" clipPath="url(#fillClip)" />
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <line key={i} x1="20" x2="100" y1={24 + i * 22.5} y2={24 + i * 22.5} stroke="#0e1117" strokeWidth="2" opacity="0.5" />
            ))}
            <line x1="94" y1="4" x2="94" y2="24" stroke="#5b6577" strokeWidth="2" />
            <line x1="94" y1="6" x2="60" y2="14" stroke="#5b6577" strokeWidth="2" />
            <line x1="60" y1="14" x2="60" y2="30" stroke="#5b6577" strokeWidth="1.5" />
          </svg>

          <div className="fh-hero-main">
            <div className="fh-hero-num">{remaining}</div>
            <div className="fh-hero-sub">
              von {totalCount} Vorlesungsterminen noch offen · {completedCount} erledigt
            </div>
            <div className="fh-phase"><b>{phase.tag}: {phase.name}</b></div>
            <div className="fh-progress-track">
              <div className="fh-progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <div className="fh-hero-sub">
              {percent}% Baufortschritt
              {excusedPercent > 0 && <span className="fh-inline-tag excused"> · {excusedPercent}% entschuldigt</span>}
              {unexcusedPercent > 0 && <span className="fh-inline-tag unexcused"> · {unexcusedPercent}% unentschuldigt</span>}
              {nextPhase ? ` · noch ${(nextPhase.min - percent).toFixed(1)}% bis „${nextPhase.name}“` : ""}
            </div>
          </div>

          <div className="fh-hero-stats">
            <div className="fh-hero-stat">
              <Trophy size={14} />
              <div>
                <b>{completedCount}</b>
                <small>Erledigt</small>
              </div>
            </div>
            <div className="fh-hero-stat">
              <Building2 size={14} />
              <div>
                <b>{examEvents.filter((e) => completed.has(e.id)).length}/{examEvents.length}</b>
                <small>Prüfungen</small>
              </div>
            </div>
          </div>
        </div>

        <div className="fh-section-title"><Medal size={15} /> Bestenliste</div>
        <div className="fh-leaderboard">
          {leaderboard.length === 0 && <div className="fh-empty">Noch niemand hat Termine abgehakt.</div>}
          {leaderboard.map((row, i) => (
            <div className={`fh-lb-row ${row.name === name ? "me" : ""}`} key={row.name}>
              <span className="fh-lb-rank">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
              <Avatar name={row.name} url={avatars[row.name]} size={20} />
              <span className="fh-lb-name">{row.name}</span>
              <span className="fh-lb-breakdown">
                {row.excusedPercent > 0 && <span className="excused">{row.excusedPercent}% E</span>}
                {row.unexcusedPercent > 0 && <span className="unexcused">{row.unexcusedPercent}% U</span>}
              </span>
              <span className="fh-lb-percent">{row.percent}%</span>
            </div>
          ))}
        </div>

        <div className="fh-section-title"><Building2 size={15} /> Gewerke im Bau</div>
        <div className="fh-course-grid">
          {(showAllCourses ? courseStats : courseStats.slice(0, 6)).map((c) => (
            <div className="fh-course-card" key={c.course}>
              <div className="fh-course-name" title={c.course}>{shortCourse(c.course)}</div>
              <div className="fh-course-bar-track">
                <div className="fh-course-bar-fill" style={{ width: `${(c.done / c.total) * 100}%`, background: c.color }} />
              </div>
              <div className="fh-course-count">{c.done}/{c.total}</div>
            </div>
          ))}
        </div>
        {courseStats.length > 6 && (
          <button className="fh-toggle-more" onClick={() => setShowAllCourses((v) => !v)}>
            {showAllCourses ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showAllCourses ? "Weniger anzeigen" : `Alle ${courseStats.length} Gewerke anzeigen`}
          </button>
        )}

        <div className="fh-section-title"><ListFilter size={15} /> Termine</div>
        <div className="fh-tabs">
          {[
            ["upcoming", "Offen"],
            ["week", "Diese Woche"],
            ["past", "Vergangen"],
            ["all", "Alle"],
            ["exams", "Prüfungen"],
          ].map(([k, label]) => (
            <button
              key={k}
              className={`fh-tab ${tab === k && !selectedDate ? "active" : ""}`}
              onClick={() => {
                setTab(k);
                setSelectedDate(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="fh-calendar">
          <div className="fh-cal-header">
            <button className="fh-cal-nav" onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
              <ChevronLeft size={16} />
            </button>
            <span className="fh-cal-month">{monthLabel}</span>
            <button className="fh-cal-nav" onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="fh-cal-weekdays">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="fh-cal-grid">
            {cells.map((d, i) => {
              if (!d) return <span className="fh-cal-cell empty" key={`e${i}`} />;
              const iso = toISODate(d);
              const info = calendarDayStatus[iso];
              const isToday = iso === todayISO;
              const isSelected = iso === selectedDate;
              const clickable = !!info;
              return (
                <button
                  key={iso}
                  className={`fh-cal-cell ${isToday ? "today" : ""} ${isSelected ? "selected" : ""} ${clickable ? "has-events" : ""}`}
                  disabled={!clickable}
                  onClick={() => setSelectedDate(isSelected ? null : iso)}
                >
                  <span>{d.getDate()}</span>
                  {info && (
                    <span className="fh-cal-dots">
                      {info.lecture && <i className={`dot lecture ${info.lectureState}`} />}
                      {info.exam && <i className={`dot exam ${info.examState}`} />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="fh-cal-legend">
            <span><i className="dot lecture open" /> Vorlesung</span>
            <span><i className="dot exam open" /> Prüfung</span>
            <span><i className="dot done" /> Erledigt</span>
            <span><i className="dot excused" /> Entschuldigt</span>
            <span><i className="dot unexcused" /> Unentschuldigt</span>
          </div>
        </div>

        {selectedDate && (
          <div className="fh-selected-date-bar">
            <div className="fh-selected-date-row">
              <span>Zeige nur {fmtDate(selectedDate)}</span>
              <button className="fh-selected-date-reset" onClick={() => setSelectedDate(null)}>
                <X size={13} /> zurücksetzen
              </button>
            </div>
            <div className="fh-selected-date-actions">
              <span className="fh-quick-label">Ganzer Tag:</span>
              <button className="fh-quick-btn done" onClick={() => bulkSetStatus(selectedDate, "done")}>
                <CheckCircle2 size={13} /> Erledigt
              </button>
              <button className="fh-quick-btn excused" onClick={() => bulkSetStatus(selectedDate, "absent_excused")}>
                <ShieldCheck size={13} /> Entschuldigt
              </button>
              <button className="fh-quick-btn unexcused" onClick={() => bulkSetStatus(selectedDate, "absent_unexcused")}>
                <XCircle size={13} /> Unentschuldigt
              </button>
            </div>
          </div>
        )}

        <div className="fh-icon-legend">
          <span><CheckCircle2 size={13} className="ic done" /> Erledigt</span>
          <span><ShieldCheck size={13} className="ic excused" /> Entschuldigt</span>
          <span><XCircle size={13} className="ic unexcused" /> Unentschuldigt</span>
        </div>

        {loaded && grouped.length === 0 && <div className="fh-empty">Keine Termine in dieser Ansicht — gut gemacht!</div>}

        {grouped.map((g) => (
          <div className="fh-date-group" key={g.date}>
            <div className="fh-date-header">{fmtDate(g.date)}</div>
            {g.items.map((e) => {
              const isExam = e.type === "exam";
              const status = statusMap.get(e.id) || null;
              return (
                <div
                  className={`fh-item ${status === "done" ? "done" : ""} ${
                    status === "absent_excused" ? "absent-excused" : ""
                  } ${status === "absent_unexcused" ? "absent-unexcused" : ""}`}
                  key={e.id}
                >
                  <div className="fh-status-group">
                    <button
                      className={`fh-status-btn done ${status === "done" ? "active" : ""}`}
                      onClick={() => setEventStatus(e.id, status === "done" ? null : "done")}
                      title="Erledigt"
                    >
                      <CheckCircle2 size={16} />
                    </button>
                    <button
                      className={`fh-status-btn excused ${status === "absent_excused" ? "active" : ""}`}
                      onClick={() => setEventStatus(e.id, status === "absent_excused" ? null : "absent_excused")}
                      title="Entschuldigt abwesend"
                    >
                      <ShieldCheck size={14} />
                    </button>
                    <button
                      className={`fh-status-btn unexcused ${status === "absent_unexcused" ? "active" : ""}`}
                      onClick={() => setEventStatus(e.id, status === "absent_unexcused" ? null : "absent_unexcused")}
                      title="Unentschuldigt abwesend"
                    >
                      <XCircle size={14} />
                    </button>
                  </div>
                  <div className="fh-item-main">
                    <div className="fh-item-course">{shortCourse(e.course)}</div>
                    <div className="fh-item-meta">
                      <span><Clock size={11} /> {e.start}–{e.end}</span>
                      {e.room && <span><MapPin size={11} /> {e.room}</span>}
                      {e.lecturer && <span>{e.lecturer}</span>}
                      {status === "absent_excused" && <span className="fh-status-tag excused">entschuldigt</span>}
                      {status === "absent_unexcused" && <span className="fh-status-tag unexcused">unentschuldigt</span>}
                    </div>
                  </div>
                  <span className="fh-badge-type" style={isExam ? { borderColor: "#ff8a3d", color: "#ff8a3d" } : undefined}>
                    {TYPE_LABEL[e.type]}
                  </span>
                </div>
              );
            })}
          </div>
        ))}

        <div className="fh-section-title"><Trophy size={15} /> Meilensteine</div>
        <div className="fh-badges-grid">
          {badges.map((b) => (
            <div className={`fh-badge ${b.unlocked ? "unlocked" : "locked"}`} key={b.key}>
              {b.unlocked ? <Trophy size={15} color="#5fd1a0" /> : <Lock size={14} />}
              {b.label}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function GlobalStyle() {
  return (
    <style>{`
      body { background: #0e1117; }
      .fh-root {
        --bg: #0e1117; --panel: #171c26; --panel-2: #1e2531; --line: #2b3446;
        --accent: #ff8a3d; --accent-soft: rgba(255,138,61,0.16);
        --good: #5fd1a0; --text: #eef1f6; --muted: #8b93a6;
        font-family: 'IBM Plex Sans', 'Segoe UI', sans-serif;
        background: var(--bg); color: var(--text);
        border-radius: 16px; padding: 28px; max-width: 780px; margin: 0 auto;
      }
      .fh-gate { max-width: 460px; margin-top: 10vh; text-align: center; }
      .fh-gate-form { display: flex; gap: 8px; justify-content: center; }
      .fh-input {
        background: var(--panel-2); border: 1px solid var(--line); color: var(--text);
        border-radius: 8px; padding: 10px 12px; font-size: 14px; flex: 1;
      }
      .fh-btn {
        background: var(--accent); border: none; color: #1a0f05; font-weight: 600;
        border-radius: 8px; padding: 10px 18px; cursor: pointer; font-size: 14px;
      }
      .fh-topbar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
      .fh-user-block { display: flex; align-items: center; gap: 10px; }
      .fh-avatar-btn {
        position: relative; background: none; border: none; padding: 0; cursor: pointer; line-height: 0;
      }
      .fh-avatar-btn:disabled { opacity: 0.6; cursor: wait; }
      .fh-avatar-edit {
        position: absolute; bottom: -2px; right: -2px; background: var(--accent); color: #1a0f05;
        border-radius: 50%; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;
        border: 2px solid var(--bg);
      }
      .fh-user-text { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; font-size: 12.5px; }
      .fh-user-logout {
        background: none; border: none; color: var(--muted); font-size: 11px; cursor: pointer;
        display: flex; align-items: center; gap: 3px; padding: 0;
      }
      .fh-avatar {
        border-radius: 50%; display: flex; align-items: center;
        justify-content: center; font-weight: 700; color: #10131a;
      }
      .fh-avatar-img { border-radius: 50%; object-fit: cover; display: block; }
      .fh-head-label { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
      .fh-title { font-family: 'Barlow Condensed', 'IBM Plex Sans', sans-serif; font-size: 30px; font-weight: 600; margin: 0 0 20px 0; }
      .fh-hero { display: flex; gap: 20px; align-items: center; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 20px; margin-bottom: 18px; }
      .fh-hero-main { flex: 1; min-width: 0; }
      .fh-hero-num { font-family: 'Barlow Condensed', sans-serif; font-size: 64px; line-height: 1; font-weight: 600; color: var(--accent); }
      .fh-hero-sub { color: var(--muted); font-size: 14px; margin-top: 6px; }
      .fh-inline-tag.excused { color: #6ea8fe; }
      .fh-inline-tag.unexcused { color: #e5789a; }
      .fh-phase { font-size: 15px; margin-top: 12px; }
      .fh-phase b { color: var(--text); }
      .fh-progress-track { height: 6px; border-radius: 3px; background: var(--panel-2); margin-top: 8px; overflow: hidden; }
      .fh-progress-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.4s ease; }
      .fh-hero-stats { display: flex; flex-direction: column; gap: 14px; flex-shrink: 0; padding-left: 18px; border-left: 1px solid var(--line); }
      .fh-hero-stat { display: flex; align-items: center; gap: 8px; color: var(--muted); }
      .fh-hero-stat b { display: block; font-family: 'Barlow Condensed', sans-serif; font-size: 20px; font-weight: 600; color: var(--text); line-height: 1.1; white-space: nowrap; }
      .fh-hero-stat small { font-size: 10.5px; color: var(--muted); white-space: nowrap; }
      .fh-section-title { font-size: 14px; font-weight: 600; margin: 24px 0 10px 0; display: flex; align-items: center; gap: 8px; }
      .fh-leaderboard { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 6px; }
      .fh-lb-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; font-size: 13px; border-radius: 8px; }
      .fh-lb-row.me { background: var(--accent-soft); }
      .fh-lb-rank { width: 22px; text-align: center; font-size: 13px; }
      .fh-lb-name { flex: 1; }
      .fh-lb-breakdown { display: flex; gap: 6px; }
      .fh-lb-breakdown span { font-size: 10.5px; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--line); }
      .fh-lb-breakdown .excused { color: #6ea8fe; border-color: #6ea8fe; }
      .fh-lb-breakdown .unexcused { color: #e5789a; border-color: #e5789a; }
      .fh-lb-percent { color: var(--muted); font-size: 12.5px; width: 34px; text-align: right; flex-shrink: 0; }
      .fh-course-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
      .fh-course-card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
      .fh-course-name { font-size: 12.5px; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .fh-course-bar-track { height: 5px; border-radius: 3px; background: var(--panel-2); overflow: hidden; }
      .fh-course-bar-fill { height: 100%; border-radius: 3px; }
      .fh-course-count { font-size: 11px; color: var(--muted); margin-top: 5px; }
      .fh-toggle-more { background: none; border: none; color: var(--muted); font-size: 12px; cursor: pointer; margin-top: 8px; display: flex; align-items: center; gap: 4px; }
      .fh-tabs { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
      .fh-tab { background: var(--panel); border: 1px solid var(--line); color: var(--muted); border-radius: 999px; padding: 6px 14px; font-size: 12.5px; cursor: pointer; }
      .fh-tab.active { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
      .fh-calendar { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 10px; margin: 0 auto 12px auto; max-width: 380px; }
      .fh-cal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
      .fh-cal-month { font-size: 12.5px; font-weight: 600; text-transform: capitalize; }
      .fh-cal-nav { background: var(--panel-2); border: 1px solid var(--line); color: var(--text); border-radius: 6px; padding: 2px; cursor: pointer; display: flex; }
      .fh-cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; margin-bottom: 3px; }
      .fh-cal-weekdays span { text-align: center; font-size: 9.5px; color: var(--muted); }
      .fh-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; }
      .fh-cal-cell {
        aspect-ratio: 1; background: transparent; border: none; color: var(--text);
        border-radius: 7px; font-size: 10.5px; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 2px; cursor: default;
      }
      .fh-cal-cell.empty { visibility: hidden; }
      .fh-cal-cell.has-events { cursor: pointer; background: var(--panel-2); }
      .fh-cal-cell.has-events:hover { background: var(--accent-soft); }
      .fh-cal-cell.today span:first-child { color: var(--accent); font-weight: 700; }
      .fh-cal-cell.selected { background: var(--accent-soft); border: 1px solid var(--accent); }
      .fh-cal-dots { display: flex; gap: 3px; height: 8px; align-items: center; }
      .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; background: var(--muted); }
      .dot.lecture.open { background: var(--accent); }
      .dot.exam.open { background: #c792ea; }
      .dot.done { background: var(--good); }
      .dot.excused { background: #6ea8fe; }
      .dot.unexcused { background: #e5789a; }
      .dot.done { background: var(--good); }
      .fh-cal-legend { display: flex; flex-wrap: wrap; gap: 8px 12px; margin-top: 8px; font-size: 10px; color: var(--muted); }
      .fh-cal-legend span { display: flex; align-items: center; gap: 5px; }
      .fh-icon-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 11px; color: var(--muted); margin-bottom: 10px; }
      .fh-icon-legend span { display: flex; align-items: center; gap: 5px; }
      .fh-icon-legend .ic.done { color: var(--good); }
      .fh-icon-legend .ic.excused { color: #6ea8fe; }
      .fh-icon-legend .ic.unexcused { color: #e5789a; }
      .fh-selected-date-bar {
        background: var(--panel); border: 1px solid var(--accent); border-radius: 10px;
        padding: 10px 12px; font-size: 12.5px; margin-bottom: 10px;
      }
      .fh-selected-date-row { display: flex; align-items: center; justify-content: space-between; color: var(--accent); margin-bottom: 8px; }
      .fh-selected-date-reset { background: none; border: none; color: var(--accent); font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 4px; }
      .fh-selected-date-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .fh-quick-label { font-size: 11.5px; color: var(--muted); }
      .fh-quick-btn {
        display: flex; align-items: center; gap: 5px; background: var(--panel-2); border: 1px solid var(--line);
        color: var(--text); border-radius: 999px; padding: 5px 10px; font-size: 11.5px; cursor: pointer;
      }
      .fh-quick-btn.done { color: var(--good); }
      .fh-quick-btn.done:hover { background: rgba(95,209,160,0.15); border-color: var(--good); }
      .fh-quick-btn.excused { color: #6ea8fe; }
      .fh-quick-btn.excused:hover { background: rgba(110,168,254,0.15); border-color: #6ea8fe; }
      .fh-quick-btn.unexcused { color: #e5789a; }
      .fh-quick-btn.unexcused:hover { background: rgba(229,120,154,0.15); border-color: #e5789a; }
      .fh-date-group { margin-bottom: 14px; }
      .fh-date-header { font-size: 11.5px; color: var(--muted); margin-bottom: 6px; text-transform: capitalize; }
      .fh-item { display: flex; align-items: center; gap: 10px; background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--line); border-radius: 10px; padding: 10px 12px; margin-bottom: 6px; }
      .fh-item.done { opacity: 0.55; }
      .fh-item.absent-excused { border-left-color: #6ea8fe; }
      .fh-item.absent-unexcused { border-left-color: #e5789a; }
      .fh-status-group { display: flex; gap: 4px; flex-shrink: 0; }
      .fh-status-btn {
        background: var(--panel-2); border: 1px solid var(--line); color: var(--muted);
        border-radius: 8px; width: 26px; height: 26px; display: flex; align-items: center;
        justify-content: center; cursor: pointer; padding: 0;
      }
      .fh-status-btn.done.active { background: rgba(95,209,160,0.18); border-color: var(--good); color: var(--good); }
      .fh-status-btn.excused.active { background: rgba(110,168,254,0.18); border-color: #6ea8fe; color: #6ea8fe; }
      .fh-status-btn.unexcused.active { background: rgba(229,120,154,0.18); border-color: #e5789a; color: #e5789a; }
      .fh-status-tag { font-weight: 600; }
      .fh-status-tag.excused { color: #6ea8fe; }
      .fh-status-tag.unexcused { color: #e5789a; }
      .fh-item-main { flex: 1; min-width: 0; }
      .fh-item-course { font-size: 13.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .fh-item-meta { font-size: 11.5px; color: var(--muted); display: flex; gap: 10px; margin-top: 2px; flex-wrap: wrap; }
      .fh-item-meta span { display: flex; align-items: center; gap: 3px; }
      .fh-badge-type { font-size: 10px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); flex-shrink: 0; }
      .fh-badges-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
      .fh-badge { display: flex; align-items: center; gap: 8px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; font-size: 12px; }
      .fh-badge.unlocked { border-color: var(--good); color: var(--text); }
      .fh-badge.locked { color: var(--muted); }
      .fh-empty { color: var(--muted); font-size: 13px; padding: 16px 0; text-align: center; }
      @media (max-width: 520px) {
        .fh-hero { flex-direction: column; align-items: stretch; }
        .fh-hero-stats { flex-direction: row; border-left: none; border-top: 1px solid var(--line); padding-left: 0; padding-top: 14px; justify-content: space-around; }
        .fh-course-grid, .fh-badges-grid { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
