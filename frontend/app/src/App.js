import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

const API = "https://job-search-assistant-backend-h03h.onrender.com";

const LABEL_COLORS = {
  "Strong Match": { bg: "#0a2a1a", border: "#00ff87", text: "#00ff87" },
  "Good Match":   { bg: "#0a1f2a", border: "#00c2ff", text: "#00c2ff" },
  "Weak Match":   { bg: "#1f1a0a", border: "#ffaa00", text: "#ffaa00" },
  "Poor Match":   { bg: "#1f0a0a", border: "#ff4444", text: "#ff4444" },
  "Unscored":     { bg: "#1a1a1a", border: "#555",    text: "#555"    },
};

const ACTION_COLORS = {
  "Apply Now":        "#00ff87",
  "Apply This Week":  "#00c2ff",
  "Save for Later":   "#ffaa00",
  "Skip":             "#ff4444",
};

const STATUS_OPTIONS = ["Saved", "Applied", "Skipped"];

export default function App() {
  const [jobs, setJobs]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [running, setRunning]         = useState(false);
  const [runResult, setRunResult]     = useState(null);
  const [filter, setFilter]           = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [expanded, setExpanded]       = useState(null);
  const [emailModal, setEmailModal]   = useState(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [recipient, setRecipient]     = useState("");
  const [sending, setSending]         = useState(false);
  const [toast, setToast]             = useState(null);

  useEffect(() => { loadJobs(); }, []);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function loadJobs() {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/jobs`);
      setJobs(res.data.jobs || []);
    } catch (e) {
      showToast("Failed to load jobs", "error");
    }
    setLoading(false);
  }

  async function runPipeline() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await axios.post(`${API}/run`);
      setRunResult(res.data);
      showToast(`Done — ${res.data.saved} new jobs saved`);
      await loadJobs();
    } catch (e) {
      showToast("Pipeline run failed", "error");
    }
    setRunning(false);
  }

  async function updateStatus(job, status) {
    try {
      await axios.post(`${API}/jobs/${job.id}/status`, { status });
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, status } : j))
      );
      showToast(`Marked as ${status}`);
    } catch (e) {
      showToast("Status update failed", "error");
    }
  }

  async function openEmailModal(job) {
  setEmailModal({ job, subject: "", body: "", ready: false, hunterInfo: null });
  setEmailLoading(true);
  setRecipient("");

  // Run Hunter and email generation in parallel
  const [hunterRes, emailRes] = await Promise.allSettled([
    axios.post(`${API}/jobs/${job.id}/find-contact`, {
      company: job.company,
      title: job.title,
    }),
    axios.post(`${API}/jobs/${job.id}/preview-email`, { job }),
  ]);

  // Pre-populate recipient if Hunter found someone
  if (hunterRes.status === "fulfilled" && hunterRes.value.data.found) {
    setRecipient(hunterRes.value.data.email);
  }

  // Set email content
  if (emailRes.status === "fulfilled") {
    setEmailModal({
      job,
      subject: emailRes.value.data.subject,
      body: emailRes.value.data.body,
      ready: true,
      hunterInfo: hunterRes.status === "fulfilled" ? hunterRes.value.data : null,
    });
  } else {
    showToast("Email preview failed", "error");
    setEmailModal(null);
  }

  setEmailLoading(false);
}

  async function sendEmail() {
    if (!recipient) { showToast("Enter recipient email", "error"); return; }
    setSending(true);
    try {
      const res = await axios.post(`${API}/jobs/${emailModal.job.id}/send-email`, {
        job: emailModal.job,
        recipientEmail: recipient,
      });
      if (res.data.success) {
        showToast("Email sent!");
        setJobs((prev) =>
          prev.map((j) => (j.id === emailModal.job.id ? { ...j, status: "Applied" } : j))
        );
        setEmailModal(null);
      } else {
        showToast("Send failed: " + res.data.error, "error");
      }
    } catch (e) {
      showToast("Send failed", "error");
    }
    setSending(false);
  }

  const labels  = ["All", "Strong Match", "Good Match", "Weak Match", "Poor Match"];
  const sources = ["All", ...new Set(jobs.map((j) => j.source).filter(Boolean))];

  const filtered = jobs.filter((j) => {
    const byLabel  = filter === "All"       || j.label  === filter;
    const bySource = sourceFilter === "All" || j.source === sourceFilter;
    return byLabel && bySource;
  });

  return (
    <div className="app">
      {/* ── Toast ── */}
      {toast && <div className={`toast toast--${toast.type}`}>{toast.msg}</div>}

      {/* ── Header ── */}
      <header className="header">
        <div className="header__left">
          <span className="header__eyebrow">ASAD MANSURI</span>
          <h1 className="header__title">Job<br />Search<br />Assistant</h1>
        </div>
        <div className="header__right">
          <div className="header__stats">
            <Stat label="Total" value={jobs.length} />
            <Stat label="Strong" value={jobs.filter((j) => j.label === "Strong Match").length} accent="#00ff87" />
            <Stat label="Applied" value={jobs.filter((j) => j.status === "Applied").length} accent="#00c2ff" />
          </div>
          <button className="btn btn--run" onClick={runPipeline} disabled={running}>
            {running ? <><Spinner /> Scanning...</> : "↻ Refresh Jobs"}
          </button>
        </div>
      </header>

      {/* ── Run result banner ── */}
      {runResult && (
        <div className="run-banner">
          <span>Last run: fetched <b>{runResult.fetched}</b> · scored <b>{runResult.scored}</b> · saved <b>{runResult.saved}</b> new jobs</span>
          {runResult.topJob && (
            <span className="run-banner__top">
              Top: <b>{runResult.topJob.title}</b> @ {runResult.topJob.company} — {runResult.topJob.score}/100
            </span>
          )}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="filters">
        <div className="filters__group">
          {labels.map((l) => (
            <button
              key={l}
              className={`filter-btn ${filter === l ? "filter-btn--active" : ""}`}
              onClick={() => setFilter(l)}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="filters__group">
          {sources.map((s) => (
            <button
              key={s}
              className={`filter-btn filter-btn--source ${sourceFilter === s ? "filter-btn--active" : ""}`}
              onClick={() => setSourceFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Jobs grid ── */}
      {loading ? (
        <div className="loading"><Spinner large /> Loading jobs...</div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          No jobs found. Hit <b>Refresh Jobs</b> to run the pipeline.
        </div>
      ) : (
        <div className="grid">
          {filtered.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              expanded={expanded === job.id}
              onToggle={() => setExpanded(expanded === job.id ? null : job.id)}
              onStatus={updateStatus}
              onEmail={openEmailModal}
            />
          ))}
        </div>
      )}

      {/* ── Email modal ── */}
      {emailModal && (
        <div className="modal-overlay" onClick={() => setEmailModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <div>
                <div className="modal__eyebrow">OUTREACH EMAIL</div>
                <div className="modal__title">{emailModal.job.title} @ {emailModal.job.company}</div>
              </div>
              <button className="modal__close" onClick={() => setEmailModal(null)}>✕</button>
            </div>

            {emailLoading ? (
              <div className="modal__loading"><Spinner large /> Generating with Claude...</div>
            ) : (
              <>
                <div className="modal__field">
                  <label>Subject</label>
                  <input
                    className="modal__input"
                    value={emailModal.subject}
                    onChange={(e) => setEmailModal({ ...emailModal, subject: e.target.value })}
                  />
                </div>
                <div className="modal__field">
                  <label>Body</label>
                  <textarea
                    className="modal__textarea"
                    value={emailModal.body}
                    onChange={(e) => setEmailModal({ ...emailModal, body: e.target.value })}
                    rows={10}
                  />
                </div>
                <div className="modal__field">
  <label>Send To</label>
  {emailModal?.hunterInfo?.found && (
    <div style={{
      fontFamily: "var(--mono)",
      fontSize: "11px",
      color: "var(--green)",
      marginBottom: "6px",
    }}>
      Hunter found: {emailModal.hunterInfo.position} — {emailModal.hunterInfo.confidence}% confidence
      {emailModal.hunterInfo.allContacts?.length > 1 && (
        <span style={{ color: "var(--muted)", marginLeft: "8px" }}>
          ({emailModal.hunterInfo.allContacts.length} contacts found)
        </span>
      )}
    </div>
  )}
  {emailModal?.hunterInfo?.found === false && (
    <div style={{
      fontFamily: "var(--mono)",
      fontSize: "11px",
      color: "var(--yellow)",
      marginBottom: "6px",
    }}>
      Hunter: {emailModal.hunterInfo.reason} — enter email manually
    </div>
  )}
  <input
    className="modal__input"
    placeholder="hiring@company.com"
    value={recipient}
    onChange={(e) => setRecipient(e.target.value)}
  />
</div>
                <div className="modal__actions">
                  <button className="btn btn--ghost" onClick={() => setEmailModal(null)}>Cancel</button>
                  <button className="btn btn--send" onClick={sendEmail} disabled={sending}>
                    {sending ? <><Spinner /> Sending...</> : "Send Email →"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Job Card ──────────────────────────────────────────────────────────────

function JobCard({ job, expanded, onToggle, onStatus, onEmail }) {
  const colors = LABEL_COLORS[job.label] || LABEL_COLORS["Unscored"];
  const actionColor = ACTION_COLORS[job.actionRecommendation] || "#888";

  return (
    <div
      className={`card ${expanded ? "card--expanded" : ""}`}
      style={{ "--border-color": colors.border }}
    >
      <div className="card__top" onClick={onToggle}>
        {/* Score ring */}
        <div className="card__score" style={{ "--score-color": colors.border }}>
          <svg viewBox="0 0 44 44" className="card__ring">
            <circle cx="22" cy="22" r="18" className="card__ring-bg" />
            <circle
              cx="22" cy="22" r="18"
              className="card__ring-fill"
              style={{
                stroke: colors.border,
                strokeDasharray: `${(job.score / 100) * 113} 113`,
              }}
            />
          </svg>
          <span className="card__score-num">{job.score}</span>
        </div>

        {/* Info */}
        <div className="card__info">
          <div className="card__title">{job.title}</div>
          <div className="card__company">{job.company}</div>
          <div className="card__meta">
            <span>{job.location}</span>
            <span className="card__dot">·</span>
            <span className="card__source">{job.source}</span>
          </div>
        </div>

        {/* Badges */}
        <div className="card__badges">
          <span className="badge" style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}>
            {job.label}
          </span>
          <span className="badge badge--action" style={{ color: actionColor }}>
            {job.actionRecommendation}
          </span>
          {job.status && job.status !== "Saved" && (
            <span className="badge badge--status">{job.status}</span>
          )}
        </div>

        <div className="card__chevron">{expanded ? "▲" : "▼"}</div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="card__body">
          {/* Score breakdown */}
          <div className="breakdown">
            <div className="breakdown__title">Score Breakdown</div>
            <div className="breakdown__bars">
              {job.breakdown && Object.entries(job.breakdown).map(([key, val]) => (
                <BreakdownBar key={key} label={key} value={val} max={
                  key === "roleFit" ? 35 :
                  key === "companyProfile" ? 25 :
                  key === "impactAndOwnership" ? 20 : 10
                } />
              ))}
            </div>
          </div>

          {/* Reason + red flags */}
          <div className="card__reason">
            <p>{job.reason}</p>
            {job.redFlags && job.redFlags !== "None" && (
              <p className="card__redflag">⚠ {job.redFlags}</p>
            )}
          </div>

          {/* Actions */}
          <div className="card__actions">
            <a href={job.url} target="_blank" rel="noreferrer" className="btn btn--ghost btn--sm">
              View Job ↗
            </a>
            <button className="btn btn--email btn--sm" onClick={() => onEmail(job)}>
              ✉ Draft Email
            </button>
            <div className="card__status-btns">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  className={`btn btn--status btn--sm ${job.status === s ? "btn--status-active" : ""}`}
                  onClick={() => onStatus(job, s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownBar({ label, value, max }) {
  const pct = Math.round((value / max) * 100);
  const labels = {
    roleFit: "Role Fit",
    companyProfile: "Company",
    impactAndOwnership: "Impact",
    locationFit: "Location",
    toolsAndSkillMatch: "Tools",
  };
  return (
    <div className="bar">
      <span className="bar__label">{labels[label] || label}</span>
      <div className="bar__track">
        <div className="bar__fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="bar__val">{value}/{max}</span>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="stat">
      <span className="stat__val" style={{ color: accent || "#fff" }}>{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

function Spinner({ large }) {
  return <span className={`spinner ${large ? "spinner--large" : ""}`} />;
}