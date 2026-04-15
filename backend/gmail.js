const nodemailer = require("nodemailer");
const Anthropic = require("@anthropic-ai/sdk");
const config = require("./config");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Candidate meta ────────────────────────────────────────────────────────
const CANDIDATE = {
  name: "Asad Mansuri",
  linkedin: "https://www.linkedin.com/in/asad-mansuri/",
  cv: "https://drive.google.com/file/d/1twilFZvsSgpUb9nz4Gy8M30w4JQUubUS/view?usp=sharing",
  phone: "+91 9265153793",
};

// ─── Signature ─────────────────────────────────────────────────────────────

const signaturePlain = `Best,\nAsad Mansuri\nLinkedIn: ${CANDIDATE.linkedin}\nM: ${CANDIDATE.phone}\nResume: ${CANDIDATE.cv}`;

const signatureHtml = `
<br>
Best,<br>
<strong>Asad Mansuri</strong><br>
<a href="${CANDIDATE.linkedin}" style="color:#0a66c2;text-decoration:none;">LinkedIn</a>
&nbsp;|&nbsp; M: ${CANDIDATE.phone}<br>
<a href="${CANDIDATE.cv}" style="color:#0a66c2;text-decoration:none;">Resume</a>
`;

// ─── Initialise Gmail transporter (module-level, reused across calls) ──────

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

// Verify credentials on startup
transporter.verify((error) => {
  if (error) {
    console.error("Gmail error code:", error.code);
    console.error("Gmail error command:", error.command);
    console.error("Gmail error message:", error.message);
  } else {
    console.log("Gmail ready to send");
  }
});

// ─── Generate email using Claude ──────────────────────────────────────────

async function generateEmail(job) {
  const prompt = `
You are writing a cold outreach email for Asad Mansuri.

CANDIDATE PROFILE
${config.candidateProfile}

JOB DETAILS
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Description:
${job.description || "No description available."}

INSTRUCTIONS
Use this exact template. Only fill in the blanks marked with [].

---
Subject: ${job.title} Role at ${job.company} - Asad Mansuri

Hi [first name of decision maker if known from context, else "there"],

Quick one - I ran GTM and growth in a Founder's Office for the last year, and before that spent 3 years in strategy consulting at YCP. The work I am most proud of is [pick the single most relevant achievement from his profile for THIS specific role, written in one sentence with a real number from his background].

Looking for an EIR or Founder's Office role where I can own a problem end to end with direct founder access. ${job.company} came up at the top of my list.

20 minutes?
---

Hard rules:
- Never use em dashes (--)
- Never use bullet points or numbered lists
- Never change the structure or add extra paragraphs
- Only fill in the [blanks], everything else stays exactly as written
- The achievement must include a real number from his profile
- Do not add a sign off or signature - it will be added separately
- Return ONLY a JSON object with fields "subject" and "body"
- Line breaks as \\n in the body
`;

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.content[0].text.trim();
    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    return JSON.parse(cleaned);
  } catch (err) {
    console.error(`Email generation error for "${job.title}":`, err.message);
    return {
      subject: `${job.title} Role at ${job.company} - Asad Mansuri`,
      body: `Hi there,\n\nQuick one - I ran GTM and growth in a Founder's Office for the last year, and before that spent 3 years in strategy consulting at YCP. I built the RevOps foundation at Loop Health from scratch, replacing Google Sheets with Salesforce and cutting reporting TAT by 75%.\n\nLooking for an EIR or Founder's Office role where I can own a problem end to end with direct founder access. ${job.company} came up at the top of my list.\n\n20 minutes?`,
    };
  }
}

// ─── Strip any sign off Claude may have added ──────────────────────────────

function stripSignoff(body) {
  return body
    .replace(/\n*(Best|Regards|Thanks|Cheers|Warm regards|Sincerely)[,.]?[\s\S]*$/i, "")
    .trim();
}

// ─── Send outreach email ───────────────────────────────────────────────────

async function sendOutreachEmail(job, recipientEmail) {
  console.log(`Generating email for "${job.title}" at ${job.company}...`);
  const email = await generateEmail(job);

  const cleanBody = stripSignoff(email.body);

  const mailOptions = {
    from: `Asad Mansuri <${process.env.GMAIL_USER}>`,
    to: recipientEmail,
    subject: email.subject,
    text: cleanBody + "\n\n" + signaturePlain,
    html: cleanBody.replace(/\n/g, "<br/>") + signatureHtml,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${recipientEmail}: ${info.messageId}`);

    return {
      success: true,
      messageId: info.messageId,
      subject: email.subject,
      body: cleanBody + "\n\n" + signaturePlain,
      sentTo: recipientEmail,
      sentAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`Email send error:`, err.message);
    return {
      success: false,
      error: err.message,
    };
  }
}

// ─── Preview email without sending ────────────────────────────────────────

async function previewEmail(job) {
  console.log(`Previewing email for "${job.title}" at ${job.company}...`);
  const email = await generateEmail(job);

  const cleanBody = stripSignoff(email.body);

  const previewSignature = `Best,\nAsad Mansuri\nLinkedIn | M: ${CANDIDATE.phone}\nResume: ${CANDIDATE.cv}`;

  return {
    subject: email.subject,
    body: cleanBody + "\n\n" + previewSignature,
  };
}

module.exports = { sendOutreachEmail, previewEmail };