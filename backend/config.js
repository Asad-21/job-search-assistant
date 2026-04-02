// ─── Job Search Configuration ──────────────────────────────────────────────
// Edit this file to control what gets fetched and how jobs are scored.
// No companies are hardcoded — roles surface based on criteria alone.

const config = {

  // ── Search queries sent to Adzuna and LinkedIn ────────────────────────────
  searchQueries: [
    "Entrepreneur in Residence",
    "EIR",
    "Founder's Office",
    "Chief of Staff",
    "Growth Strategy",
    "RevOps",
    "GTM Strategy",
    "Strategy and Operations",
    "Growth Manager",
  ],

  // ── LinkedIn Posts keywords ───────────────────────────────────────────────
  postKeywords: [
    "hiring founder office India",
    "hiring EIR startup India",
    "hiring chief of staff startup India",
    "hiring Strategy & Operations India",
  ],

  // ── Location config ───────────────────────────────────────────────────────
  locationConfig: {
    preferred: [
      "bangalore", "bengaluru", "delhi", "ncr",
      "gurgaon", "gurugram", "mumbai", "remote",
      "pan india", "pan-india", "anywhere", "hybrid",
    ],
    rejectIfMentioned: [
      "dubai", "singapore", "london", "new york",
      "us only", "uae", "germany", "australia",
    ],
  },

  // ── Adzuna settings ───────────────────────────────────────────────────────
  adzuna: {
    resultsPerPage: 50,
    pages: 1,
    country: "in",
  },

  // ── Scoring criteria (passed to Claude) ──────────────────────────────────
  scoringCriteria: {
    roleFit: {
      weight: 35,
      description:
        "How well does the role match Founder's Office, EIR, GTM, RevOps, or Growth strategy? Roles with titles like EIR or Entrepreneur in Residence score highest.",
    },
    companyProfile: {
      weight: 25,
      description:
        "Prefer AI-first or SaaS companies at Series B or Series C stage. Penalise large MNCs and services firms, and very early pre-seed startups with no product.",
    },
    impactAndOwnership: {
      weight: 20,
      description:
        "Does the JD mention 0-to-1 building, founding team access, ownership of a business function, or direct reporting to founders or CXOs?",
    },
    locationFit: {
      weight: 10,
      description:
        "Prefer Bangalore, remote, or pan-India roles. Penalise roles requiring international relocation.",
    },
    toolsAndSkillMatch: {
      weight: 10,
      description:
        "Does the JD mention AI-native, CRM, Salesforce, n8n, SQL, GTM tooling, or growth experimentation? Bonus for any mention of AI-powered operations.",
    },
  },

  // ── Keywords that signal deprioritisation ─────────────────────────────────
  deprioritiseSignals: [
    "intern", "internship", "fresher",
    "0-1 years", "10+ years", "12+ years", "15+ years",
    "VP of", "Director of",
  ],

  // ── Keywords that boost a job's relevance during scoring ──────────────────
  boostKeywords: [
    "0 to 1",
    "zero to one",
    "founding team",
    "founder access",
    "AI-first",
    "AI-powered",
    "enterprise SaaS",
    "GTM",
    "growth strategy",
    "RevOps",
    "CRM",
    "product-led",
    "ownership",
    "high ownership",
    "strategic",
    "cross-functional",
  ],

  // ── Candidate profile (passed to Claude for personalised scoring) ──────────
  candidateProfile: `
    Asad Mansuri — IIT Bombay Chemical Engineering graduate (2021).
    Currently at Loop Health in the Founder's Office, working on Growth and GTM strategy.
    Previous: Associate at YCP India (strategy consulting) for 3 years.
    Key experience: GTM strategy, RevOps, CRM marketing, Salesforce, n8n automation,
    account management, product-led growth, financial modelling, and operations.
    Seeking: EIR, Chief of Staff, Founder's Office, GTM Lead, RevOps, or Growth roles at
    Series B/C AI-first or SaaS startups in India. Strong preference for roles
    with direct founder access, business ownership, and high strategic impact.
  `,
};

module.exports = config;