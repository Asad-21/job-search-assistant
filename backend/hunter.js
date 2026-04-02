const axios = require("axios");

// ─── Hunter.io — Find decision maker email ─────────────────────────────────
// Called when user clicks "Draft Email" on a job card.
// Finds the most senior non-HR contact at the company.
// Free tier: 25 searches/month — one call per company lookup.

const SKIP_TITLES = [
  "recruiter",
  "talent acquisition",
  "human resources",
  "hr ",
  " hr",
  "people ops",
  "people operations",
  "sourcer",
  "staffing",
];

// ─── Score a contact by seniority ─────────────────────────────────────────

function scoreContact(email) {
  const title = (email.position || "").toLowerCase();

  // Skip HR/recruiters entirely
  const isSkip = SKIP_TITLES.some((t) => title.includes(t));
  if (isSkip) return -1;

  let score = 0;
  if (title.includes("founder") || title.includes("ceo")) score = 100;
  else if (title.includes("cto") || title.includes("coo")) score = 90;
  else if (title.includes("president") || title.includes("partner")) score = 80;
  else if (title.includes("vp") || title.includes("vice president")) score = 70;
  else if (title.includes("head of")) score = 60;
  else if (title.includes("director")) score = 50;
  else if (title.includes("general manager")) score = 40;
  else score = 10;

  // Boost verified emails
  if (email.confidence >= 90) score += 10;
  else if (email.confidence >= 70) score += 5;

  return score;
}

// ─── Process emails into ranked result ────────────────────────────────────

function processEmails(emails, domain) {
  const scored = emails
    .map((e) => ({ ...e, _score: scoreContact(e) }))
    .filter((e) => e._score >= 0)
    .sort((a, b) => b._score - a._score);

  if (!scored.length) {
    return {
      found: false,
      domain,
      reason: "Only HR or recruiter contacts found",
    };
  }

  const best = scored[0];
  console.log(`Hunter: best contact — ${best.first_name} ${best.last_name} (${best.position}) <${best.value}> [${best.confidence}% confidence]`);

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

// ─── Fallback: search by domain directly ──────────────────────────────────

async function searchByDomain(domain) {
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
    console.error(`Hunter domain search error for "${domain}":`, err.message);
    return [];
  }
}

// ─── Guess domain from company name ────────────────────────────────────────

function guessDomain(companyName) {
  return (
    companyName
      .toLowerCase()
      .replace(/\s+(inc|ltd|llc|pvt|private|limited|technologies|tech|solutions|ai|labs)\.?$/i, "")
      .replace(/[^a-z0-9]/g, "")
      .trim() + ".com"
  );
}

// ─── Main function ─────────────────────────────────────────────────────────

async function findDecisionMaker(companyName, jobTitle) {
  const { HUNTER_API_KEY } = process.env;

  // Debug: confirm key is loaded
  console.log(`Hunter: key loaded? ${HUNTER_API_KEY ? "YES (" + HUNTER_API_KEY.slice(0, 6) + "...)" : "NOT FOUND"}`);

  // Sanitise company name
  const cleanName = companyName
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\(.*?\)/g, "")
    .trim();

  console.log(`Hunter: searching for "${cleanName}"`);

  try {
    // Single API call — gets domain AND emails together
    const response = await axios.get(
      "https://api.hunter.io/v2/domain-search",
      {
        params: {
          company: cleanName,
          api_key: HUNTER_API_KEY,
          limit: 10,
        },
      }
    );

    const data = response.data?.data;

    if (!data?.domain) {
      console.log(`Hunter: no domain found for "${cleanName}", trying domain guess`);
      const guessed = guessDomain(cleanName);
      console.log(`Hunter: guessing domain as "${guessed}"`);
      const emails = await searchByDomain(guessed);
      if (emails.length) return processEmails(emails, guessed);
      return { found: false, reason: "Company not found in Hunter database" };
    }

    const emails = data.emails || [];
    console.log(`Hunter: found domain ${data.domain} with ${emails.length} contacts`);

    if (!emails.length) {
      return {
        found: false,
        domain: data.domain,
        reason: "No email contacts found at this domain",
      };
    }

    return processEmails(emails, data.domain);

  } catch (err) {
    console.error(`Hunter error:`, err.message);
    if (err.response) {
      console.error(`Hunter response status:`, err.response.status);
      console.error(`Hunter response data:`, JSON.stringify(err.response.data));
    }
    return { found: false, reason: "Hunter API error: " + err.message };
  }
}

module.exports = { findDecisionMaker };