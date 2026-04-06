const axios = require("axios");
const config = require("./config");

// ─── Adzuna ────────────────────────────────────────────────────────────────

async function fetchAdzunaJobs() {
  const { ADZUNA_APP_ID, ADZUNA_API_KEY } = process.env;
  const { resultsPerPage, pages, country } = config.adzuna;
  let allJobs = [];

  for (const query of config.searchQueries) {
    for (let page = 1; page <= pages; page++) {
      try {
        const response = await axios.get(
          `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}`,
          {
            params: {
              app_id: ADZUNA_APP_ID,
              app_key: ADZUNA_API_KEY,
              results_per_page: resultsPerPage,
              what: query,
              where: "India",
              content_type: "application/json",
              sort_by: "date",
              max_days_old: 2,
            },
          }
        );

        const jobs = response.data.results.map((job) => ({
          title: job.title,
          company: job.company?.display_name || "Unknown",
          location: job.location?.display_name || "Unknown",
          description: job.description,
          url: job.redirect_url,
          source: "Adzuna",
        }));

        allJobs = [...allJobs, ...jobs];
        console.log(`Adzuna: "${query}" page ${page} → ${jobs.length} jobs`);
        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        console.error(`Adzuna error for "${query}" page ${page}:`, err.message);
      }
    }
  }

  return allJobs;
}

// ─── JSearch (RapidAPI) ───────────────────────────────────────────────────

async function fetchJSearchJobs() {
  const { RAPIDAPI_KEY } = process.env;
  let allJobs = [];

  for (const query of config.searchQueries) {
    try {
      const response = await axios.get(
        "https://jsearch.p.rapidapi.com/search",
        {
          params: {
            query: `${query} India`,
            page: "1",
            num_pages: "1",
            date_posted: "week",
          },
          headers: {
            "X-RapidAPI-Key": RAPIDAPI_KEY,
            "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
          },
        }
      );

      const jobs = (response.data.data || []).map((job) => ({
        title: job.job_title,
        company: job.employer_name || "Unknown",
        location: job.job_city
          ? `${job.job_city}, ${job.job_country}`
          : job.job_country || "Unknown",
        description: job.job_description?.slice(0, 1500) || "",
        url: job.job_apply_link || job.job_google_link || "",
        source: "JSearch",
        postedAt: job.job_posted_at_datetime_utc || null,
      }));

      allJobs = [...allJobs, ...jobs];
      console.log(`JSearch: "${query}" → ${jobs.length} jobs`);
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`JSearch error for "${query}":`, err.message);
    }
  }

  return allJobs;
}

// ─── LinkedIn Jobs (Public Guest API) ─────────────────────────────────────

async function fetchLinkedInJobs() {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };

  let allJobs = [];

  for (const query of config.searchQueries) {
    try {
      let jobIds = [];

      for (const start of [0, 10, 25, 50]) {
        const searchUrl =
          `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search` +
          `?keywords=${encodeURIComponent(query)}&location=India&start=${start}&sortBy=R`;

        const searchRes = await axios.get(searchUrl, { headers });
        const matches = searchRes.data.match(/data-entity-urn="[^"]*:(\d+)"/g) || [];
        const ids = matches
          .map((m) => m.match(/(\d+)"/)?.[1])
          .filter(Boolean);

        jobIds = [...jobIds, ...ids];
        if (ids.length === 0) break;
        await new Promise((r) => setTimeout(r, 500));
      }

      // Deduplicate IDs within this query
      jobIds = [...new Set(jobIds)].slice(0, 75);

      for (const jobId of jobIds) {
        try {
          const detailUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
          const detailRes = await axios.get(detailUrl, { headers });
          const html = detailRes.data;

          const title =
            html
              .match(/<h2[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>([^<]+)<\/h2>/)?.[1]
              ?.trim() || "Unknown Title";

          const company =
            html.match(/<a[^>]*class="[^"]*topcard__org-name-link[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/)?.[1]?.trim() ||
            html.match(/<a[^>]*data-tracking-control-name="public_jobs_topcard-org-name"[^>]*>\s*([^<]+?)\s*<\/a>/)?.[1]?.trim() ||
            html.match(/<span[^>]*class="[^"]*topcard__flavor[^"]*"[^>]*>\s*([^<]+?)\s*<\/span>/)?.[1]?.trim() ||
            html.match(/,"companyName":"([^"]+)"/)?.[1]?.trim() ||
            "Unknown Company";

          const location =
            html
              .match(/<span[^>]*class="[^"]*topcard__flavor--bullet[^"]*"[^>]*>([^<]+)<\/span>/)?.[1]
              ?.trim() || "Unknown Location";

          const description =
            html
              .match(/<div[^>]*class="[^"]*description__text[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1]
              ?.replace(/<[^>]+>/g, " ")
              .trim() || "";

          const postedAt =
            html.match(/<time[^>]*datetime="([^"]+)"[^>]*>/)?.[1] || null;
              
          allJobs.push({
            title,
            company,
            location,
            description: description.slice(0, 1500),
            url: `https://www.linkedin.com/jobs/view/${jobId}`,
            source: "LinkedIn",
            postedAt,
          });

          await new Promise((r) => setTimeout(r, 500));
        } catch (err) {
          console.error(`LinkedIn detail error for job ${jobId}:`, err.message);
        }
      }

      console.log(`LinkedIn: "${query}" → ${jobIds.length} jobs`);
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.error(`LinkedIn search error for "${query}":`, err.message);
    }
  }

  return allJobs;
}

// ─── LinkedIn Posts (via Apify) ────────────────────────────────────────────

async function fetchLinkedInPosts() {
  const { APIFY_API_TOKEN } = process.env;
  let allPosts = [];

  for (const keyword of config.postKeywords) {
    try {
      const runRes = await axios.post(
        `https://api.apify.com/v2/acts/harvestapi~linkedin-post-search/runs?token=${APIFY_API_TOKEN}`,
        {
          searchQueries: [keyword],
          maxPosts: 20,
          sortBy: "date",
          scrapeReactions: false,
          scrapeComments: false,
        }
      );

      const runId = runRes.data.data.id;
      console.log(`Apify: started run ${runId} for "${keyword}"`);

      let status = "RUNNING";
      while (status === "RUNNING" || status === "READY") {
        await new Promise((r) => setTimeout(r, 3000));
        const statusRes = await axios.get(
          `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_TOKEN}`
        );
        status = statusRes.data.data.status;
      }

      const resultsRes = await axios.get(
        `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_API_TOKEN}`
      );

      const posts = resultsRes.data.map((post) => ({
        title: post.author?.name
          ? `${post.author.name} — LinkedIn Post`
          : "LinkedIn Post",
        company: post.author?.info
          ? post.author.info.split("|")[0].split("@")[0].trim().slice(0, 80)
          : "LinkedIn",
        location: post.content?.toLowerCase().includes("remote") ? "Remote"
          : post.content?.toLowerCase().includes("bangalore") ||
            post.content?.toLowerCase().includes("bengaluru") ? "Bangalore"
          : post.content?.toLowerCase().includes("delhi") ||
            post.content?.toLowerCase().includes("gurugram") ||
            post.content?.toLowerCase().includes("gurgaon") ? "Delhi NCR"
          : post.content?.toLowerCase().includes("mumbai") ? "Mumbai"
          : "Location unclear",
        description: post.content?.slice(0, 1500) || "",
        url: post.linkedinUrl || "",
        source: "LinkedIn Post",
        postedAt: post.date || post.postedAt || null,
      }));

      allPosts = [...allPosts, ...posts];
      console.log(`Apify: "${keyword}" → ${posts.length} posts`);
    } catch (err) {
      console.error(`Apify error for "${keyword}":`, err.message);
      if (err.response) {
        console.error("Apify response data:", JSON.stringify(err.response.data));
      }
    }
  }

  return allPosts;
}

// ─── Main export ───────────────────────────────────────────────────────────

async function fetchAllJobs() {
  console.log("─── Fetching jobs from all sources ───");

  const [adzunaJobs, jsearchJobs, linkedInJobs, linkedInPosts] =
    await Promise.all([
      fetchAdzunaJobs(),
      fetchJSearchJobs(),
      fetchLinkedInJobs(),
      fetchLinkedInPosts(),
    ]);

  const allJobs = [
    ...adzunaJobs,
    ...jsearchJobs,
    ...linkedInJobs,
    ...linkedInPosts,
  ];

  // Filter out spam aggregator accounts
  const filtered = allJobs.filter((job) => {
    if (job.source !== "LinkedIn Post") return true;

    const spamAccounts = [
      "jobs, india", "jobs india", "uttarakhand jobs",
      "bihar jobs", "punjab jobs", "maharashtra jobs",
      "kerala jobs", "karnataka jobs", "gujarat jobs",
      "haryana jobs", "andhra pradesh jobs", "tamil nadu jobs",
      "madhya pradesh jobs", "jharkhand jobs", "chattisgarh jobs",
      "uttar pradesh jobs", "west bengal jobs",
    ];

    const titleLower = job.title.toLowerCase();
    return !spamAccounts.some((account) => titleLower.includes(account));
  });

  // Hard filter — remove internships and clearly irrelevant roles
  const preFiltered = filtered.filter((job) => {
    const title = job.title.toLowerCase();
    const skipIfContains = [
      "intern", "internship", "trainee", "fresher",
      "food experience", "chef", "professor", "bim modeller",
      "bim manager", "chief engineer", "social media manager",
      "dth", "r&d", "zonal sales", "supply chain",
      "production planning", "telecom", "voice core",
      "field crops", "cloud support engineer", "hr manager",
      "human resources manager", "marketing communications",
      "category manager", "territory manager", "area head",
      "sr. manager -supply", "business analyst general insurance",
    ];
    return !skipIfContains.some((word) => title.includes(word));
  });

  // Location filter
  // IMPORTANT: Only check location FIELD for rejection, not description.
  // JDs often mention global markets (Singapore, UAE etc) as context
  // without the role being based there — checking description caused
  // false rejections (e.g. Leena AI dropping out).
  const locationFiltered = preFiltered.filter((job) => {
    const loc = job.location.toLowerCase();
    const desc = job.description.toLowerCase();

    // Reject only if location FIELD mentions unwanted location
    const isRejected = config.locationConfig.rejectIfMentioned
      .some((l) => loc.includes(l));
    if (isRejected) return false;

    // Always keep if location is unclear or not specified
    if (!job.location ||
        job.location === "Location unclear" ||
        job.location === "Unknown Location" ||
        job.location === "LinkedIn") return true;

    // Keep if preferred location appears in location field OR description
    const isPreferred = config.locationConfig.preferred
      .some((l) => loc.includes(l) || desc.includes(l));

    return isPreferred;
  });

  // Deduplicate — primary key is URL, fallback to title+company
  const seen = new Set();
  const unique = locationFiltered.filter((job) => {
    const key = job.url
      ? job.url
      : `${job.title?.toLowerCase()}__${job.company?.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`─── Total: ${unique.length} unique jobs fetched ───`);
  return unique;
}

module.exports = { fetchAllJobs };