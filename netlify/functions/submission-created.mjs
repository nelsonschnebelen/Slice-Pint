// Netlify form event (filename trigger: submission-created).
// Posts verified Slice & Pint inquiries to Slack. Never logs the webhook URL.

const FORMS = {
  "redondo-event-inquiry": "Redondo Beach",
  "el-segundo-event-inquiry": "El Segundo",
};

const MENTIONS = "<@U8S0R95AS> <@UQP3TMB1S>";

const FIELDS = [
  ["name", "Name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["date", "Preferred date"],
  ["flexible", "Flexible date"],
  ["guests", "Estimated guests"],
  ["time", "Preferred time"],
  ["occasion", "Occasion"],
  ["seating", "Seating"],
  ["notes", "Notes"],
];

function envGet(name) {
  const netlify = typeof globalThis.Netlify !== "undefined" ? globalThis.Netlify : undefined;
  if (netlify && netlify.env && typeof netlify.env.get === "function") {
    const value = netlify.env.get(name);
    if (value != null && value !== "") return value;
  }
  const value = process.env[name];
  return value == null ? "" : value;
}

function escapeSlack(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalize(value) {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item)).filter(Boolean).join(", ");
  }
  return String(value).trim();
}

function filled(value) {
  return normalize(value) !== "";
}

function displayValue(key, raw) {
  if (key === "flexible" && /^yes$/i.test(raw)) return "Yes";
  if (key === "date" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date);
  }
  return raw;
}

function formatSubmittedAt(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function submissionsUrl(payload) {
  const siteUrl = typeof payload.site_url === "string" ? payload.site_url : "";
  let host = "";
  try {
    host = new URL(siteUrl).hostname;
  } catch {
    return "";
  }
  const match = /^([a-z0-9-]+)\.netlify\.app$/i.exec(host);
  if (!match) return "";
  const site = match[1].toLowerCase();
  const formId = typeof payload.form_id === "string" && /^[A-Za-z0-9_-]+$/.test(payload.form_id)
    ? payload.form_id
    : "";
  const base = `https://app.netlify.com/sites/${site}/forms`;
  return formId ? `${base}/${formId}` : base;
}

function locationName(payload, data) {
  const fromForm = FORMS[payload.form_name];
  if (fromForm) return fromForm;
  return normalize(data.location);
}

export function buildSlackMessage(payload) {
  const data = payload && payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? payload.data
    : {};
  const knownLocation = Object.hasOwn(FORMS, payload.form_name);
  const location = knownLocation ? FORMS[payload.form_name] : escapeSlack(locationName(payload, data) || "Unknown location");
  const headline = `New private event inquiry, ${location}`;

  const rows = [];
  for (const [key, label] of FIELDS) {
    const raw = normalize(data[key]);
    if (!raw) continue;
    rows.push({ label, value: escapeSlack(displayValue(key, raw)) });
  }

  const submitted = formatSubmittedAt(payload.created_at);
  const link = submissionsUrl(payload);

  const textLines = [MENTIONS, headline];
  for (const row of rows) textLines.push(`${row.label}: ${row.value}`);
  if (submitted) textLines.push(`Submitted: ${submitted}`);
  if (link) textLines.push(link);

  const detail = [];
  for (const row of rows) detail.push(`*${row.label}:* ${row.value}`);
  if (submitted) detail.push(`*Submitted:* ${submitted}`);
  if (link) detail.push(`<${link}|View in Netlify>`);

  const blocks = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `${MENTIONS}\n*${headline}*` },
    },
  ];
  if (detail.length) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: detail.join("\n") },
    });
  }

  return { text: textLines.join("\n"), blocks };
}

function ack(event) {
  if (event && typeof event.json === "function") {
    return new Response(null, { status: 200 });
  }
  return { statusCode: 200 };
}

async function payloadFrom(event) {
  // Filename event sends a string body. Current Netlify builds may pass a Request instead.
  if (event && typeof event.body === "string") {
    return JSON.parse(event.body).payload;
  }
  if (event && typeof event.text === "function") {
    return JSON.parse(await event.text()).payload;
  }
  return JSON.parse(event.body).payload;
}

export default async (event) => {
  try {
    const payload = await payloadFrom(event);
    if (!payload || typeof payload !== "object" || !Object.hasOwn(FORMS, payload.form_name)) {
      return ack(event);
    }
    const data = payload.data && typeof payload.data === "object" ? payload.data : {};
    if (filled(data.company_site)) {
      console.log("submission-created: skipped honeypot");
      return ack(event);
    }

    const message = buildSlackMessage(payload);
    if (envGet("DRY_RUN") === "1") {
      console.log(JSON.stringify(message, null, 2));
      return ack(event);
    }

    const webhook = envGet("SLACK_WEBHOOK_URL_SLICEANDPINT");
    if (!webhook) {
      console.warn("SLACK_WEBHOOK_URL_SLICEANDPINT is not set");
      return ack(event);
    }

    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(message),
      });
      if (!res.ok) console.error("Slack responded with status " + res.status);
    } catch {
      console.error("Slack request failed");
    }
  } catch {
    console.error("submission-created: invalid event");
  }
  return ack(event);
};
