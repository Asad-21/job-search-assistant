const nodemailer = require("nodemailer");
const Anthropic = require("@anthropic-ai/sdk");
const config = require("./config");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Candidate meta ────────────────────────────────────────────────────────
const CANDIDATE = {
  name: "Asad Mansuri",
  linkedin: "https://www.linkedin.com/in/asad-mansuri/",
  cv: "https://drive.google.com/file/d/1twilFZvsSgpUb9nz4Gy8M30w4JQUubUS/view?usp=sharing",
};

// ─── Initialise Gmail transporter ─────────────────────────────────────────

function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

// ─── Generate email using Claude ──────────────────────────────────────────

async function generateEmail(job) {
  const prompt = `
You are writing a cold outreach email for Asad Mansuri, a job seeker.

CANDIDATE PROFILE
${config.candidateProfile}

JOB DETAILS
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Score reason: ${job.reason || "Strong role and company fit"}
Description:
${job.description || "No description available."}

INSTRUCTIONS
Write a cold outreach email from Asad to the hiring team at ${job.company}.

Hard rules:
- Subject line: specific and direct, reference the role and company, no buzzwords
- Body: 80-100 words maximum, no exceptions
- Opening line: Lead with what Asad brings that is directly relevant to THIS specific role. Reference his most relevant experience. Do NOT comment on the company, their product, or their market. Start with Asad, not them.
- Never use em dashes (—) anywhere
- Never use bullet points or dashes of any kind — write in short prose paragraphs only
- Never use: "hope this finds you well", "passionate", "excited to", "I came across", "agentic", "autonomous", "copilot", or any phrase that sounds like it was written by AI
- Tone: direct, first-person, like a founder talking to another founder
- Mention exactly 1 achievement with a real number from his profile
- End with a single clear ask for a 20-minute call
- Sign off with exactly these details on separate lines, no changes:

Best,
Asad Mansuri
LinkedIn: https://www.linkedin.com/in/asad-mansuri/
Email: asadmansuri219@gmail.com
Phone: +91 9265153793
CV: https://drive.google.com/file/d/1twilFZvsSgpUb9nz4Gy8M30w4JQUubUS/view?usp=sharing
//LinkedIn: ${CANDIDATE.linkedin}
//Email: ${process.env.GMAIL_USER}
//Phone: +91 9265153793
//CV: ${CANDIDATE.cv}

Return ONLY a JSON object. No markdown fences. No explanation. Exactly these fields:
{
  "subject": "<email subject line>",
  "body": "<full email body with line breaks as \\n>"
}
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
      subject: `${job.title} at ${job.company} — Asad Mansuri`,
      body: `Hi,\n\nI wanted to reach out about the ${job.title} role at ${job.company}.\n\nI'm currently in the Founder's Office at Loop Health, where I've led GTM strategy and built AI-enabled operational systems. Before that, 3 years in strategy consulting at YCP India.\n\nWould love 20 minutes to explore if there's a fit.\n\nAsad Mansuri\nLinkedIn: ${CANDIDATE.linkedin}\nCV: ${CANDIDATE.cv}`,
    };
  }
}

// ─── Send outreach email ───────────────────────────────────────────────────

async function sendOutreachEmail(job, recipientEmail) {
  const transporter = getTransporter();

  console.log(`Generating email for "${job.title}" at ${job.company}...`);
  const email = await generateEmail(job);

  const mailOptions = {
    from: `Asad Mansuri <${process.env.GMAIL_USER}>`,
    to: recipientEmail,
    subject: email.subject,
    text: email.body,
    html: email.body.replace(/\n/g, "<br/>"),
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${recipientEmail}: ${info.messageId}`);

    return {
      success: true,
      messageId: info.messageId,
      subject: email.subject,
      body: email.body,
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
  return {
    subject: email.subject,
    body: email.body,
  };
}

module.exports = { sendOutreachEmail, previewEmail };