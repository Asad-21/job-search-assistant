const Airtable = require("airtable");

// ─── Initialise Airtable ───────────────────────────────────────────────────

function getTable() {
  const base = new Airtable({
    apiKey: process.env.AIRTABLE_API_KEY,
  }).base(process.env.AIRTABLE_BASE_ID);

  return base("Jobs");
}

// ─── Save a single scored job ──────────────────────────────────────────────

async function saveJob(job) {
  const table = getTable();

  try {
    const record = await table.create({
     "Job Title": job.source === "LinkedIn Post" && job.extractedRole
      ? `${job.extractedRole} (via ${job.title})`
      : job.title || "",
      "Company": job.source === "LinkedIn Post" && job.extractedCompany
      ? job.extractedCompany
      : job.company || "",
      "Location": job.location || "",
      "Score": job.score || 0,
      "Label": job.label || "Unscored",
      "Score Reason": job.reason || "",
      "Red Flags": job.redFlags || "",
      "Action": job.actionRecommendation || "Save for Later",
      "Source": job.source || "",
      "Job URL": job.url || "",
      "Status": "Saved",
      "Date Added": new Date().toISOString().split("T")[0],
      "Role Fit": job.breakdown?.roleFit || 0,
      "Company Profile": job.breakdown?.companyProfile || 0,
      "Impact & Ownership": job.breakdown?.impactAndOwnership || 0,
      "Location Fit": job.breakdown?.locationFit || 0,
      "Tools Match": job.breakdown?.toolsAndSkillMatch || 0,
    });

    console.log(`Airtable: saved "${job.title}" at ${job.company} (${job.score}/100)`);
    return record.id;
  } catch (err) {
    console.error(`Airtable save error for "${job.title}":`, err.message);
    return null;
  }
}

// ─── Save all scored jobs ──────────────────────────────────────────────────
// Skips jobs that already exist in Airtable (matched by URL)
// so re-running every alternate day doesn't create duplicates.

async function saveAllJobs(jobs) {
  console.log(`─── Saving ${jobs.length} jobs to Airtable ───`);

  // Fetch existing URLs from Airtable to avoid duplicates
  const existing = await getExistingURLs();
  console.log(`Airtable: ${existing.size} jobs already in database`);
  
 // DEBUG — trace Leena AI through save logic
  const leenaJobs = jobs.filter(j => 
    j.title?.toLowerCase().includes("entrepreneur in residence (eir)")
  );
  console.log(`DEBUG SAVE: Found ${leenaJobs.length} EIR jobs to check`);
  leenaJobs.forEach(j => {
    console.log(`DEBUG SAVE: "${j.title}" | company: "${j.company}" | score: ${j.score} | url: ${j.url}`);
    console.log(`DEBUG SAVE: url in existing? ${existing.has(j.url)}`);
    console.log(`DEBUG SAVE: score >= 0? ${j.score >= 0}`);
    console.log(`DEBUG SAVE: has url? ${!!j.url}`);
  });   

  

  const newJobs = jobs.filter((job) =>
  job.url && !existing.has(job.url) && job.score >= 20
);
  console.log(`Airtable: ${newJobs.length} new jobs to save`);

  // Save in sequence to avoid Airtable rate limits (5 writes/sec)
  let saved = 0;
  for (const job of newJobs) {
    const id = await saveJob(job);
    if (id) saved++;
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`─── Airtable: saved ${saved} new jobs ───`);
  return saved;
}

// ─── Get all existing job URLs from Airtable ──────────────────────────────

async function getExistingURLs() {
  const table = getTable();
  const urls = new Set();

  try {
    await table
      .select({ fields: ["Job URL"] })
      .eachPage((records, fetchNextPage) => {
        records.forEach((r) => {
          const url = r.get("Job URL");
          if (url) urls.add(url);
        });
        fetchNextPage();
      });
  } catch (err) {
    console.error("Airtable fetch URLs error:", err.message);
  }

  return urls;
}

// ─── Get all jobs from Airtable (for dashboard) ────────────────────────────

async function getAllJobs() {
  const table = getTable();
  const jobs = [];

  try {
    await table
      .select({
        sort: [{ field: "Score", direction: "desc" }],
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((r) => {
          jobs.push({
            id: r.id,
            title: r.get("Job Title"),
            company: r.get("Company"),
            location: r.get("Location"),
            score: r.get("Score"),
            label: r.get("Label"),
            reason: r.get("Score Reason"),
            redFlags: r.get("Red Flags"),
            actionRecommendation: r.get("Action"),
            source: r.get("Source"),
            url: r.get("Job URL"),
            status: r.get("Status"),
            dateAdded: r.get("Date Added"),
            breakdown: {
              roleFit: r.get("Role Fit"),
              companyProfile: r.get("Company Profile"),
              impactAndOwnership: r.get("Impact & Ownership"),
              locationFit: r.get("Location Fit"),
              toolsAndSkillMatch: r.get("Tools Match"),
            },
          });
        });
        fetchNextPage();
      });
  } catch (err) {
    console.error("Airtable getAllJobs error:", err.message);
  }

  return jobs;
}

// ─── Update job status ─────────────────────────────────────────────────────
// Called from the dashboard when you click Apply, Save, or Skip.

async function updateJobStatus(recordId, status) {
  const table = getTable();

  try {
    await table.update(recordId, { Status: status });
    console.log(`Airtable: updated record ${recordId} → ${status}`);
    return true;
  } catch (err) {
    console.error(`Airtable update error for ${recordId}:`, err.message);
    return false;
  }
}

// ─── Cleanup — delete records older than 14 days ───────────────────────────

async function cleanupOldJobs() {
  const table = getTable();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  console.log(`Airtable cleanup: removing jobs added before ${cutoffStr}`);

  const toDelete = [];

  try {
    await table
      .select({ fields: ["Date Added"] })
      .eachPage((records, fetchNextPage) => {
        records.forEach((r) => {
          const dateAdded = r.get("Date Added");
          if (dateAdded && dateAdded < cutoffStr) {
            toDelete.push(r.id);
          }
        });
        fetchNextPage();
      });

    // Airtable delete accepts max 10 records per call
    for (let i = 0; i < toDelete.length; i += 10) {
      const batch = toDelete.slice(i, i + 10);
      await table.destroy(batch);
      await new Promise((r) => setTimeout(r, 250));
    }

    console.log(`Airtable cleanup: deleted ${toDelete.length} old records`);
    return toDelete.length;
  } catch (err) {
    console.error("Airtable cleanup error:", err.message);
    return 0;
  }
}

module.exports = { saveAllJobs, getAllJobs, updateJobStatus, cleanupOldJobs };