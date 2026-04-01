const nodemailer = require("nodemailer");
const Anthropic = require("@anthropic-ai/sdk");
const config = require("./config");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
You are helping a job seeker write a cold outreach email for a role they are interested in.

─── CANDIDATE PROFILE ────────────────────────────────────────────────────────
${config.candidateProfile}

─── JOB DETAILS ──────────────────────────────────────────────────────────────
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Description:
${job.description || "No description available."}

─── INSTRUCTIONS ─────────────────────────────────────────────────────────────
Write a short, sharp cold outreach email from Asad to the hiring team at ${job.company}.

Rules:
- Subject line should be specific to the role, not generic
- Max 150 words in the body
- Do not use phrases like "I hope this email finds you well"
- Lead with one specific thing about the company or role that excited Asad
- Mention 1–2 directly relevant achievements from his profile (use real numbers)
- End with a single clear ask: a 20-minute call
- Tone: confident, direct, founder-friendly — not corporate or sycophantic

Return ONLY a JSON object. No markdown fences. Exactly these fields:
{
  "subject": "<email subject line>",
  "body": "<full email body with line breaks as \\n>"
}
`;

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 500,
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
      subject: `Interest in ${job.title} at ${job.company}`,
      body: `Hi,\n\nI came across the ${job.title} role at ${job.company} and would love to connect.\n\nBest,\nAsad`,
    };
  }
}

// ─── Send outreach email ───────────────────────────────────────────────────

async function sendOutreachEmail(job, recipientEmail) {
  const transporter = getTransporter();

  // Generate personalised email with Claude
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
// Called from the dashboard "Preview" button before committing to send.

async function previewEmail(job) {
  console.log(`Previewing email for "${job.title}" at ${job.company}...`);
  const email = await generateEmail(job);
  return {
    subject: email.subject,
    body: email.body,
  };
}

module.exports = { sendOutreachEmail, previewEmail };