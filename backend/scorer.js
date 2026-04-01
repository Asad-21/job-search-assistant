const Anthropic = require("@anthropic-ai/sdk");
const config = require("./config");
 
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
 
// ─── Build the scoring prompt ──────────────────────────────────────────────
 
function buildScoringPrompt(job) {
  const criteria = Object.entries(config.scoringCriteria)
    .map(
      ([key, val]) =>
        `- ${key} (${val.weight} points): ${val.description}`
    )
    .join("\n");
 
  const boostKeywords = config.boostKeywords.join(", ");
 
  return `
You are a job relevance scorer. Score the following job for this candidate.
 
─── CANDIDATE PROFILE ────────────────────────────────────────────────────────
${config.candidateProfile}
 
─── SCORING CRITERIA (total 100 points) ─────────────────────────────────────
${criteria}
 
─── BOOST SIGNALS ────────────────────────────────────────────────────────────
If the job description contains any of these keywords, treat them as strong
positive signals: ${boostKeywords}
 
─── JOB TO SCORE ─────────────────────────────────────────────────────────────
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Source: ${job.source}
Description:
${job.description || "No description available."}
 
─── INSTRUCTIONS ─────────────────────────────────────────────────────────────
Return ONLY a JSON object. No explanation outside the JSON. No markdown fences.
The JSON must have exactly these fields:
 
{
  "score": <integer 0–100>,
  "label": <one of: "Strong Match" | "Good Match" | "Weak Match" | "Poor Match">,
  "breakdown": {
    "roleFit": <integer 0–35>,
    "companyProfile": <integer 0–25>,
    "impactAndOwnership": <integer 0–20>,
    "locationFit": <integer 0–10>,
    "toolsAndSkillMatch": <integer 0–10>
  },
  "reason": "<2–3 sentence plain English explanation of why this scored the way it did>",
  "redFlags": "<one sentence on any concerns, or 'None' if no concerns>",
  "actionRecommendation": <one of: "Apply Now" | "Apply This Week" | "Save for Later" | "Skip">
}
`;
}
 
// ─── Score a single job ────────────────────────────────────────────────────
 
async function scoreJob(job) {
  try {
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: buildScoringPrompt(job),
        },
      ],
    });
 
    const raw = response.content[0].text.trim();
 
    // Strip markdown fences if Claude added them despite instructions
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned);
 
    return {
      ...job,
      score: parsed.score,
      label: parsed.label,
      breakdown: parsed.breakdown,
      reason: parsed.reason,
      redFlags: parsed.redFlags,
      actionRecommendation: parsed.actionRecommendation,
      scoredAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`Scoring error for "${job.title}" at ${job.company}:`, err.message);
 
    // Return job with a neutral score so it still appears in dashboard
    return {
      ...job,
      score: 0,
      label: "Unscored",
      breakdown: {},
      reason: "Could not score this job due to an error.",
      redFlags: "Scoring failed.",
      actionRecommendation: "Save for Later",
      scoredAt: new Date().toISOString(),
    };
  }
}
 
// ─── Score all jobs ────────────────────────────────────────────────────────
// Processes jobs in batches to avoid rate limits.
// Batches of 5 with a 1 second pause between batches.
 
async function scoreAllJobs(jobs) {
  console.log(`─── Scoring ${jobs.length} jobs with Claude ───`);
 
  const BATCH_SIZE = 5;
  const scored = [];
 
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
 
    const results = await Promise.all(batch.map((job) => scoreJob(job)));
    scored.push(...results);
 
    console.log(`Scored ${Math.min(i + BATCH_SIZE, jobs.length)}/${jobs.length}`);
 
    // Pause between batches to respect rate limits
    if (i + BATCH_SIZE < jobs.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
 
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
 
  console.log(`─── Scoring complete. Top job: "${scored[0]?.title}" at ${scored[0]?.company} (${scored[0]?.score}/100) ───`);
 
  return scored;
}
 
module.exports = { scoreAllJobs };