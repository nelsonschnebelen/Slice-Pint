// Prints the Slack message for a sample inquiry. Does not call Slack.
// Usage: DRY_RUN=1 node scripts/dry-run-submission.mjs

import handler, { buildSlackMessage } from "../netlify/functions/submission-created.mjs";

const sample = {
  number: 12,
  form_name: "redondo-event-inquiry",
  created_at: "2026-11-05T17:17:00.000Z",
  site_url: "https://sliceandpint.netlify.app",
  data: {
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "310-555-0100",
    date: "2026-12-12",
    flexible: "yes",
    guests: "24",
    time: "Evening",
    occasion: "Birthday",
    seating: "Seated",
    notes: "One long table, please.",
    location: "Redondo Beach",
    company_site: "",
  },
};

function statusOf(res) {
  return res && (res.statusCode ?? res.status);
}

async function capture(fn) {
  const lines = [];
  const log = console.log;
  const warn = console.warn;
  const error = console.error;
  console.log = console.warn = console.error = (...args) => lines.push(args.join(" "));
  try {
    return { result: await fn(), lines };
  } finally {
    console.log = log;
    console.warn = warn;
    console.error = error;
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const redondo = buildSlackMessage(sample);
assert(redondo.text.includes("<@U8S0R95AS>"), "missing Eli mention");
assert(redondo.text.includes("<@UQP3TMB1S>"), "missing Brittney mention");
assert(redondo.text.startsWith("<@U8S0R95AS> <@UQP3TMB1S>"), "text fallback should lead with mentions");
assert(redondo.text.includes("New private event inquiry, Redondo Beach"), "redondo headline");
assert(redondo.blocks[0].text.text.includes("<@U8S0R95AS>"), "block mention");
assert(!redondo.text.includes("company_site"), "honeypot must not be listed");
assert(redondo.text.includes("Preferred date: December 12, 2026"), "date format");
assert(redondo.text.includes("Flexible date: Yes"), "flexible yes");
const sparse = buildSlackMessage({
  ...sample,
  data: { name: "Ada Lovelace", email: "ada@example.com", phone: "  ", notes: "" },
});
assert(!sparse.text.includes("Phone:"), "empty phone skipped");
assert(!sparse.text.includes("Notes:"), "empty notes skipped");
assert(sparse.text.includes("Name: Ada Lovelace"), "name kept");
assert(redondo.text.includes("https://app.netlify.com/sites/sliceandpint/forms"), "submissions link");
const withFormId = buildSlackMessage({ ...sample, form_id: "abc123", site_url: "https://sliceandpint.netlify.app" });
assert(withFormId.text.includes("https://app.netlify.com/sites/sliceandpint/forms/abc123"), "form id link");
const customDomain = buildSlackMessage({ ...sample, site_url: "https://www.thesliceandpint.com" });
assert(!customDomain.text.includes("http"), "custom domain is not the submissions page");

const injected = buildSlackMessage({
  ...sample,
  data: { ...sample.data, name: "Pat <@U123> & <https://evil.test|click>", seating: ["Seated", "Standing"] },
});
assert(injected.text.includes("Pat &lt;@U123&gt; &amp; &lt;https://evil.test|click&gt;"), "values must be escaped");
assert(injected.text.includes("Seating: Seated, Standing"), "multiple seating values");
assert(!injected.text.includes("<@U123>"), "injected mention leaked");

const segundo = buildSlackMessage({ ...sample, form_name: "el-segundo-event-inquiry", site_url: "" });
assert(segundo.text.includes("New private event inquiry, El Segundo"), "el segundo headline");
assert(!segundo.text.includes("View in Netlify") && !segundo.text.includes("http"), "no link without site info");

const originalFetch = globalThis.fetch;
const originalDry = process.env.DRY_RUN;
const originalWebhook = process.env.SLACK_WEBHOOK_URL_SLICEANDPINT;
let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  throw new Error("dry run must not post");
};

process.env.DRY_RUN = "1";
process.env.SLACK_WEBHOOK_URL_SLICEANDPINT = "https://hooks.example.invalid/services/CANARY-DO-NOT-LOG";
const dry = await capture(() => handler({ body: JSON.stringify({ payload: sample }) }));
assert(statusOf(dry.result) === 200, "dry run status");
assert(fetchCalls === 0, "dry run called fetch");
assert(dry.lines.some((line) => line.includes("New private event inquiry, Redondo Beach")), "dry run did not print JSON");

delete process.env.DRY_RUN;
const canary = "https://hooks.example.invalid/services/CANARY-DO-NOT-LOG";
process.env.SLACK_WEBHOOK_URL_SLICEANDPINT = canary;
globalThis.fetch = async () => ({ ok: false, status: 503 });
const slackErr = await capture(() => handler({ body: JSON.stringify({ payload: sample }) }));
assert(statusOf(slackErr.result) === 200, "slack error still 200");
assert(slackErr.lines.some((line) => line.includes("503")), "logs slack status");
assert(slackErr.lines.every((line) => !line.includes(canary)), "logged the webhook URL");

globalThis.fetch = async () => {
  throw new Error("network " + canary);
};
const slackDown = await capture(() => handler({ body: JSON.stringify({ payload: sample }) }));
assert(statusOf(slackDown.result) === 200, "slack throw still 200");
assert(slackDown.lines.every((line) => !line.includes(canary)), "error log included the webhook URL");

delete process.env.SLACK_WEBHOOK_URL_SLICEANDPINT;
globalThis.fetch = async () => {
  fetchCalls += 1;
  return { ok: true, status: 200 };
};
fetchCalls = 0;
const missing = await capture(() => handler({ body: JSON.stringify({ payload: sample }) }));
assert(statusOf(missing.result) === 200, "missing env status");
assert(fetchCalls === 0, "posted without webhook");
assert(missing.lines.some((line) => line === "SLACK_WEBHOOK_URL_SLICEANDPINT is not set"), "missing env warning");

const honeypot = await capture(() => handler({
  body: JSON.stringify({ payload: { ...sample, data: { ...sample.data, company_site: "http://spam.test" } } }),
}));
assert(statusOf(honeypot.result) === 200 && fetchCalls === 0, "honeypot should not post");

for (const form_name of ["{{FORM_NAME}}", "contact", ""]) {
  const ignored = await capture(() => handler({
    body: JSON.stringify({ payload: { ...sample, form_name } }),
  }));
  assert(statusOf(ignored.result) === 200 && fetchCalls === 0, "ignored " + form_name);
}

process.env.DRY_RUN = "1";
const asRequest = new Request("https://sliceandpint.netlify.app/.netlify/functions/submission-created", {
  method: "POST",
  body: JSON.stringify({ payload: sample }),
});
const requestEvent = await capture(() => handler(asRequest));
assert(requestEvent.result && requestEvent.result.status === 200, "request-style status");
assert(fetchCalls === 0, "request-style dry run posted");
assert(requestEvent.lines.some((line) => line.includes("New private event inquiry, Redondo Beach")), "request-style body was not read");

delete process.env.DRY_RUN;
delete process.env.SLACK_WEBHOOK_URL_SLICEANDPINT;
globalThis.Netlify = { env: { get: (name) => (name === "DRY_RUN" ? "1" : "") } };
const viaNetlifyEnv = await capture(() => handler({ body: JSON.stringify({ payload: sample }) }));
assert(viaNetlifyEnv.lines.some((line) => line.includes("New private event inquiry, Redondo Beach")), "Netlify.env DRY_RUN");
assert(fetchCalls === 0, "Netlify.env dry run posted");
delete globalThis.Netlify;

delete process.env.SLACK_WEBHOOK_URL_SLICEANDPINT;
process.env.DRY_RUN = "1";
await handler({ body: JSON.stringify({ payload: sample }) });
globalThis.fetch = originalFetch;
if (originalWebhook == null) delete process.env.SLACK_WEBHOOK_URL_SLICEANDPINT;
else process.env.SLACK_WEBHOOK_URL_SLICEANDPINT = originalWebhook;
if (originalDry == null) delete process.env.DRY_RUN;
else process.env.DRY_RUN = originalDry;
