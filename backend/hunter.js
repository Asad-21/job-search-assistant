const axios = require("axios");

// ─── Hunter.io — Find decision maker email ─────────────────────────────────
// Only called when user clicks "Draft Email" on a job card.
// Searches for founders, CEOs, CTOs, VPs — not HR or recruiters.
// Free tier: 25 searches/month.

const DECISION_MAKER_TITLES = [
  "founder",
  "co-founder",
  "ceo",
  "chief executive",
  "cto",
  "chief technology",
  "coo",
  "chief operating",
  "president",
  "vp",
  "vice president",
  "head of",
  "director",
  "partner",
  "general manager",
];

const SKIP_TITLES = [
  "recruiter",
  "talent acquisition",
  "human resources",
  "hr ",
  "people ops",
  "people operations",
  "sourcer",
  "staffing",
];

// ─── Extract domain from company name or URL ───────────────────────────────

async function findCompanyDomain(companyName) {
  const { HUNTER_API_KEY } = process.env;

  try {
    const response = await axios.get(
      "https://api.hunter.io/v2/domain-search",
      {
        params: {
          company: companyName,
          api_key: HUNTER_API_KEY,
          limit: 1,
        },
      }
    );

    return response.data?.data?.domain || null;
  } catch (err) {
    console.error(`Hunter domain search error for "${companyName}":`, err.message);
    return null;
  }
}

// ─── Search for decision makers at a domain ────────────────────────────────

async function searchEmails(domain) {
  const { HUNTER_API_KEY } = process.env;

  try {
    const response = await axios.get(
      "https://api.hunter.io/v2/domain-search",
      {
        params: {
          domain,
          api_key: HUNTER_API_KEY,
          limit: 10,
        },
      }
    );

    return response.data?.data?.emails || [];
  } catch (err) {
    console.error(`Hunter email search error for "${domain}":`, err.message);
    return [];
  }
}

// ─── Score a contact by seniority ─────────────────────────────────────────

function scoreContact(email) {
  const title = (email.position || "").toLowerCase();

  // Skip HR/recruiters entirely
  const isSkip = SKIP_TITLES.some((t) => title.includes(t));
  if (isSkip) return -1;

  // Score by seniority
  let score = 0;
  if (title.includes("founder") || title.includes("ceo")) score = 100;
  else if (title.includes("cto") || title.includes("coo")) score = 90;
  else if (title.includes("president") || title.includes("partner")) score = 80;
  else if (title.includes("vp") || title.includes("vice president")) score = 70;
  else if (title.includes("head of")) score = 60;
  else if (title.includes("director")) score = 50;
  else if (title.includes("general manager")) score = 40;
  else score = 10; // unknown title — keep as last resort

  // Boost verified emails
  if (email.confidence >= 90) score += 10;
  else if (email.confidence >= 70) score += 5;

  return score;
}

// ─── Main function — find best contact for a company ──────────────────────

async function findDecisionMaker(companyName, jobTitle) {
  console.log(`Hunter: searching for decision maker at "${companyName}"`);

  // Step 1 — find domain
  const domain = await findCompanyDomain(companyName);
  if (!domain) {
    console.log(`Hunter: could not find domain for "${companyName}"`);
    return { found: false, reason: "Could not find company domain" };
  }

  console.log(`Hunter: found domain ${domain}`);

  // Step 2 — search emails at domain
  const emails = await searchEmails(domain);
  if (!emails.length) {
    console.log(`Hunter: no emails found at ${domain}`);
    return { found: false, domain, reason: "No emails found at this domain" };
  }

  // Step 3 — score and rank contacts
  const scored = emails
    .map((e) => ({ ...e, _score: scoreContact(e) }))
    .filter((e) => e._score >= 0) // remove HR/recruiters
    .sort((a, b) => b._score - a._score);

  if (!scored.length) {
    return {
      found: false,
      domain,
      reason: "Only HR/recruiter contacts found — not suitable for cold outreach",
    };
  }

  const best = scored[0];

  console.log(
    `Hunter: best contact — ${best.first_name} ${best.last_name} (${best.position}) at ${best.value} [confidence: ${best.confidence}%]`
  );

  return {
    found: true,
    domain,
    email: best.value,
    firstName: best.first_name || "",
    lastName: best.last_name || "",
    position: best.position || "",
    confidence: best.confidence || 0,
    allContacts: scored.slice(0, 3).map((e) => ({
      email: e.value,
      name: `${e.first_name || ""} ${e.last_name || ""}`.trim(),
      position: e.position || "Unknown",
      confidence: e.confidence || 0,
    })),
  };
}

module.exports = { findDecisionMaker };