const Anthropic = require("@anthropic-ai/sdk");
const config = require("./config");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Sanitise strings before sending to Claude ─────────────────────────────

function sanitise(str) {
  return (str || "").replace(/[\uD800-\uDFFF]/g, "").trim();
}

// ─── Build the scoring prompt ──────────────────────────────────────────────

function buildScoringPrompt(job) {
  const criteria = Object.entries(config.scoringCriteria)
    .map(([key, val]) => `- ${key} (${val.weight} points): ${val.description}`)
    .join("\n");

  const boostKeywords = config.boostKeywords.join(", ");

  return `
You are a job relevance scorer. Score the following job for this candidate.

CANDIDATE PROFILE
${config.candidateProfile}

SCORING CRITERIA (total 100 points)
${criteria}

BOOST SIGNALS
If the job description contains any of these keywords, treat them as strong
positive signals: ${boostKeywords}

HARD FILTERS
Apply a MANDATORY 30-point penalty (non-negotiable) if ANY of these are true:
- Title contains "Intern", "Internship", "Fresher", "Trainee"
- JD requires 10+ years, 12+ years, or 15+ years of experience
- Role is purely sales (cold calling, field sales, SDR)
- Role is in a completely unrelated domain (manufacturing, healthcare ops, teaching)

Apply a 15-point penalty if:
- Role is VP, Director, or C-suite level (unless it is EIR or Founder's Office)
- Company is a staffing/recruitment agency posting on behalf of a client (unless it is Michael Page)
- Role requires immediate joining outside India

JOB TO SCORE
Title: ${sanitise(job.title)}
Company: ${sanitise(job.company)}
Location: ${sanitise(job.location)}
Source: ${sanitise(job.source)}
Description:
${sanitise(job.description) || "No description available."}

INSTRUCTIONS
Return ONLY a JSON object. No explanation outside the JSON. No markdown fences.
The JSON must have exactly these fields:

{
  "score": <integer 0-100>,
  "label": <one of: "Strong Match" | "Good Match" | "Weak Match" | "Poor Match">,
  "breakdown": {
    "roleFit": <integer 0-35>,
    "companyProfile": <integer 0-25>,
    "impactAndOwnership": <integer 0-20>,
    "locationFit": <integer 0-10>,
    "toolsAndSkillMatch": <integer 0-10>
  },
  "reason": "<2-3 sentence plain English explanation of why this scored the way it did>",
  "redFlags": "<one sentence on any concerns, or None if no concerns>",
  "actionRecommendation": <one of: "Apply Now" | "Apply This Week" | "Save for Later" | "Skip">,
  "extractedRole": "<if this is a LinkedIn Post, extract the role being hired for in max 8 words, otherwise null>",
  "extractedCompany": "<if this is a LinkedIn Post, extract the actual company name being hired for, otherwise null>"
}
`;
}

// ─── Score a single job ────────────────────────────────────────────────────

async function scoreJob(job, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        messages: [{ role: "user", content: buildScoringPrompt(job) }],
      });

      const raw = response.content[0].text.trim();
      const cleaned = raw
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      const parsed = JSON.parse(cleaned);

      return {
        ...job,
        score: parsed.score,
        label: parsed.label,
        breakdown: parsed.breakdown,
        reason: parsed.reason,
        redFlags: parsed.redFlags,
        actionRecommendation: parsed.actionRecommendation,
        extractedRole: parsed.extractedRole || null,
        extractedCompany: parsed.extractedCompany || null,
        scoredAt: new Date().toISOString(),
      };
    } catch (err) {
      const is429 = err.message?.includes("429");
      if (is429 && attempt < retries) {
        const wait = attempt * 10000;
        console.log(`Rate limited on "${job.title}" — retrying in ${wait / 1000}s (attempt ${attempt}/${retries})`);
        await new Promise((r) => setTimeout(r, wait));
      } else {
        console.error(`Scoring error for "${job.title}" at ${job.company}:`, err.message);
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
  }
}

// ─── Score all jobs ────────────────────────────────────────────────────────

async function scoreAllJobs(jobs) {
  console.log(`─── Scoring ${jobs.length} jobs with Claude ───`);

  const BATCH_SIZE = 5;
  const scored = [];

  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((job) => scoreJob(job)));
    scored.push(...results);

    console.log(`Scored ${Math.min(i + BATCH_SIZE, jobs.length)}/${jobs.length}`);

    if (i + BATCH_SIZE < jobs.length) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  scored.sort((a, b) => {
  // Primary: total score
  if (b.score !== a.score) return b.score - a.score;
  
  // Tiebreaker 1: role fit
  const roleA = a.breakdown?.roleFit || 0;
  const roleB = b.breakdown?.roleFit || 0;
  if (roleB !== roleA) return roleB - roleA;

  // Tiebreaker 2: company profile
  const compA = a.breakdown?.companyProfile || 0;
  const compB = b.breakdown?.companyProfile || 0;
  if (compB !== compA) return compB - compA;

  // Tiebreaker 3: impact and ownership
  const impactA = a.breakdown?.impactAndOwnership || 0;
  const impactB = b.breakdown?.impactAndOwnership || 0;
  if (impactB !== impactA) return impactB - impactA;

  // Tiebreaker 4: location
  const locA = a.breakdown?.locationFit || 0;
  const locB = b.breakdown?.locationFit || 0;
  return locB - locA;
});

  console.log(`─── Scoring complete. Top job: "${scored[0]?.title}" at ${scored[0]?.company} (${scored[0]?.score}/100) ───`);

  return scored;
}

module.exports = { scoreAllJobs };