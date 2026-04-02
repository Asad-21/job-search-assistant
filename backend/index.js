
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { fetchAllJobs } = require("./jobs");
const { scoreAllJobs } = require("./scorer");
const { saveAllJobs, getAllJobs, updateJobStatus } = require("./airtable");
const { findDecisionMaker } = require("./hunter");
const { sendOutreachEmail, previewEmail } = require("./gmail");

const app = express();
app.use(cors());
app.use(express.json());

// ─── Health check ──────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── GET /jobs ─────────────────────────────────────────────────────────────
// Returns all scored jobs from Airtable, sorted by score descending.
// This is what the dashboard loads on startup.

app.get("/jobs", async (req, res) => {
  try {
    const jobs = await getAllJobs();
    res.json({ success: true, count: jobs.length, jobs });
  } catch (err) {
    console.error("/jobs error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /run ─────────────────────────────────────────────────────────────
// Triggers a full pipeline run:
//   1. Fetch jobs from all sources
//   2. Score each job with Claude
//   3. Save new jobs to Airtable
// This is what the "Refresh Jobs" button on the dashboard triggers.

app.post("/run", async (req, res) => {
  try {
    console.log("=== Pipeline run started ===");

    // Step 1: Fetch
    const rawJobs = await fetchAllJobs();
    console.log(`Fetched ${rawJobs.length} raw jobs`);

    //Step 2: Score
   // const scoredJobs = await scoreAllJobs(rawJobs);
    //console.log(`Scored ${scoredJobs.length} jobs`);

    // Step 3: Save
    //const saved = await saveAllJobs(scoredJobs);
    //console.log(`Saved ${saved} new jobs to Airtable`);

    console.log("=== Pipeline run complete ===");

    res.json({
      success: true,
      fetched: rawJobs.length,
      scored: scoredJobs.length,
      saved,
      topJob: scoredJobs[0]
        ? {
            title: scoredJobs[0].title,
            company: scoredJobs[0].company,
            score: scoredJobs[0].score,
            label: scoredJobs[0].label,
          }
        : null,
    });
  } catch (err) {
    console.error("/run error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /jobs/:id/status ─────────────────────────────────────────────────
// Updates the status of a job in Airtable.
// Called when user clicks Apply, Save, or Skip on the dashboard.
// Body: { "status": "Applied" | "Saved" | "Skipped" }

app.post("/jobs/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ["Saved", "Applied", "Skipped"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
    });
  }

  try {
    const updated = await updateJobStatus(id, status);
    res.json({ success: updated });
  } catch (err) {
    console.error("/jobs/:id/status error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /jobs/:id/preview-email ─────────────────────────────────────────
// Generates a personalised email for a job without sending it.
// Called when user clicks "Preview Email" on the dashboard.
// Body: { job: { title, company, description, ... } }

app.post("/jobs/:id/preview-email", async (req, res) => {
  const { job } = req.body;

  if (!job) {
    return res.status(400).json({ success: false, error: "Job data required" });
  }

  try {
    const email = await previewEmail(job);
    res.json({ success: true, ...email });
  } catch (err) {
    console.error("/preview-email error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /jobs/:id/find-contact ──────────────────────────────────────────
app.post("/jobs/:id/find-contact", async (req, res) => {
  const { company, title } = req.body;

  if (!company) {
    return res.status(400).json({ success: false, error: "Company name required" });
  }

  try {
    const result = await findDecisionMaker(company, title);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("/find-contact error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /jobs/:id/send-email ─────────────────────────────────────────────
// Generates and sends a personalised outreach email via Gmail.
// Also updates the job status to "Applied" in Airtable.
// Body: { job: { ... }, recipientEmail: "hiring@company.com" }

app.post("/jobs/:id/send-email", async (req, res) => {
  const { id } = req.params;
  const { job, recipientEmail } = req.body;

  if (!job || !recipientEmail) {
    return res.status(400).json({
      success: false,
      error: "Both job and recipientEmail are required",
    });
  }

  try {
    const result = await sendOutreachEmail(job, recipientEmail);

    // If email sent successfully, mark as Applied in Airtable
    if (result.success) {
      await updateJobStatus(id, "Applied");
    }

    res.json(result);
  } catch (err) {
    console.error("/send-email error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Start server ──────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   Job Search Assistant — Backend       ║
║   Running on http://localhost:${PORT}     ║
╚════════════════════════════════════════╝

Available endpoints:
  GET  /health                    → Health check
  GET  /jobs                      → Load all jobs from Airtable
  POST /run                       → Fetch + score + save all jobs
  POST /jobs/:id/status           → Update job status
  POST /jobs/:id/preview-email    → Preview outreach email
  POST /jobs/:id/send-email       → Send outreach email via Gmail
  `);
});