const axios = require("axios");
const config = require("./config");
 
// ─── Adzuna ────────────────────────────────────────────────────────────────
// 8 queries × 50 results × 1 page = up to 400 raw jobs per run
// ~8 API calls per run, well within free tier limits
 
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
 
// ─── LinkedIn Jobs (Public Guest API — no login, no API key) ──────────────
// Uses LinkedIn's public guest endpoint, same data Google indexes.
// Searches by each keyword in config.searchQueries.
 
async function fetchLinkedInJobs() {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };
 
  let allJobs = [];
 
  for (const query of config.searchQueries) {
    try {
      const searchUrl =
        `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search` +
        `?keywords=${encodeURIComponent(query)}&location=India&start=0`;
 
      const searchRes = await axios.get(searchUrl, { headers });
 
      // Extract job IDs from HTML response
      const jobIdMatches =
        searchRes.data.match(/data-entity-urn="[^"]*:(\d+)"/g) || [];
      const jobIds = jobIdMatches
        .map((m) => m.match(/(\d+)"/)?.[1])
        .filter(Boolean)
        .slice(0, 10); // Top 10 per query
 
      for (const jobId of jobIds) {
        try {
          const detailUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
          const detailRes = await axios.get(detailUrl, { headers });
          const html = detailRes.data;
 
          const title =
            html
              .match(
                /<h2[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>([^<]+)<\/h2>/
              )?.[1]
              ?.trim() || "Unknown Title";
 
          const company =
            html
              .match(
                /<a[^>]*class="[^"]*topcard__org-name-link[^"]*"[^>]*>([^<]+)<\/a>/
              )?.[1]
              ?.trim() || "Unknown Company";
 
          const location =
            html
              .match(
                /<span[^>]*class="[^"]*topcard__flavor--bullet[^"]*"[^>]*>([^<]+)<\/span>/
              )?.[1]
              ?.trim() || "Unknown Location";
 
          const description =
            html
              .match(
                /<div[^>]*class="[^"]*description__text[^"]*"[^>]*>([\s\S]*?)<\/div>/
              )?.[1]
              ?.replace(/<[^>]+>/g, " ")
              .trim() || "";
 
          allJobs.push({
            title,
            company,
            location,
            description: description.slice(0, 1500),
            url: `https://www.linkedin.com/jobs/view/${jobId}`,
            source: "LinkedIn",
          });
 
          // Respectful delay between detail calls
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
// Searches for hiring posts by keyword. Results are treated as job leads.
 
async function fetchLinkedInPosts() {
  const { APIFY_API_TOKEN } = process.env;
  let allPosts = [];
 
  for (const keyword of config.postKeywords) {
    try {
      // Start Apify actor run
      const runRes = await axios.post(
        `https://api.apify.com/v2/acts/curious_coder~linkedin-post-search-scraper/runs?token=${APIFY_API_TOKEN}`,
        {
          searchUrl:
            `https://www.linkedin.com/search/results/content/` +
            `?keywords=${encodeURIComponent(keyword)}&sortBy=date_posted`,
          maxResults: 10,
        }
      );
 
      const runId = runRes.data.data.id;
      console.log(`Apify: started run ${runId} for "${keyword}"`);
 
      // Poll until complete
      let status = "RUNNING";
      while (status === "RUNNING" || status === "READY") {
        await new Promise((r) => setTimeout(r, 3000));
        const statusRes = await axios.get(
          `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_TOKEN}`
        );
        status = statusRes.data.data.status;
      }
 
      // Fetch results
      const resultsRes = await axios.get(
        `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_API_TOKEN}`
      );
 
      const posts = resultsRes.data.map((post) => ({
        title: `Post by ${post.author?.name || "Unknown"}: ${post.text?.slice(0, 60) || ""}...`,
        company: post.author?.headline || "LinkedIn Post",
        location: "LinkedIn",
        description: post.text?.slice(0, 1500) || "",
        url: post.postUrl || "",
        source: "LinkedIn Post",
      }));
 
      allPosts = [...allPosts, ...posts];
      console.log(`Apify: "${keyword}" → ${posts.length} posts`);
    } catch (err) {
      console.error(`Apify error for "${keyword}":`, err.message);
    }
  }
 
  return allPosts;
}
 
// ─── Main export ───────────────────────────────────────────────────────────
 
async function fetchAllJobs() {
  console.log("─── Fetching jobs from all sources ───");
 
  const [adzunaJobs, linkedInJobs, linkedInPosts] = await Promise.all([
    fetchAdzunaJobs(),
    fetchLinkedInJobs(),
    fetchLinkedInPosts(),
  ]);
 
  const allJobs = [...adzunaJobs, ...linkedInJobs, ...linkedInPosts];
 
  // Deduplicate by URL
  const seen = new Set();
  const unique = allJobs.filter((job) => {
    if (!job.url || seen.has(job.url)) return false;
    seen.add(job.url);
    return true;
  });
 
  console.log(`─── Total: ${unique.length} unique jobs fetched ───`);
  return unique;
}
 
module.exports = { fetchAllJobs };