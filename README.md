# The Slice & Pint · Redondo Beach private-event landing page

Mobile-first inquiry page for private events at The Slice & Pint, 601 N Pacific Coast Hwy, Redondo Beach. Static HTML/CSS/JS, no build step. Status: **preview, not launched** (`noindex` is set and the form is not connected).

## Files
- `index.html` – the whole page. All approval-gated content is in the `CONFIG` block at the top of the script.
- `assets/` – optimized WebP images (see manifest below).

## CONFIG switches
| Key | Current | What it does |
|---|---|---|
| `endpoint` | `""` | Server route that sends the inquiry email. Empty = preview mode: the form shows the payload and sends nothing. |
| `capacityText` | `""` | Room capacity line. Pending client sign-off (30 seated / 40 standing per client email vs. 20/35 on the football page). |
| `minSpendFaq` | `false` | Shows the "more than 16 guests, $200 minimum-spend preorder on a single tab" FAQ. Pending approval. |
| `menuUrl`, `phone`, `privacyUrl` | `""` | Shown only once verified. |
| `captureUtm` | `false` | Adds UTM/click IDs to the inquiry payload. Only under an approved consent setup. |
| `captions` | empty | Room photo captions. Add only once the photos are confirmed as the Redondo room. |

## Form backend contract (to build)
`POST {endpoint}` with JSON, header `Idempotency-Key: <submission_id>`. Respond `{ "ok": true }` only after the mail provider accepts the message.

- Recipient comes from server env `INQUIRY_TO`. Never from the request, never committed to this repo.
- Provider key in server env only. Authenticated sending domain; `Reply-To` = validated visitor email.
- Subject: `Redondo event inquiry | <date or Flexible> | <guests> guests`.
- Server-side validation and length limits matching the page, escaped email body, request-size limit, honeypot (`company_site` must be empty), rate limiting, idempotency on `submission_id`.
- No visitor autoresponder until its copy is approved.

## Tracking
Pushes to `window.dataLayer`: `lp_view`, `cta_click`, `form_start`, `form_validation_error` (field names only), `generate_lead` (once per successful submission ID). No names, emails, phones or notes in any event. No GA4/GTM/Ads/Meta IDs are installed yet.

## Asset manifest
| File | Source | Use |
|---|---|---|
| `slice-pint-logo.webp` (800×367) | Official badge from thesliceandpint.com | Header and footer. Not redrawn or recolored. |
| `food-spread.webp` (640×1136) | Supplied by Nelson | Hero (food, not presented as the venue). |
| `pepperoni.webp` (720×820) | Supplied by Nelson | Food section. |
| `room-1.webp` (418×400) | Supplied by Nelson, cropped to remove a TV broadcast | Space gallery. Location to be confirmed. |
| `room-2.webp` (348×348) | Supplied by Nelson | Space gallery. Location to be confirmed. Low resolution. |

## Launch gates
Confirm room photos are Redondo · resolve capacity and the Friday–Sunday group policy on the existing site · approve min-spend FAQ · build backend and set `INQUIRY_TO` · choose hosting/domain · verify privacy policy and tracking destinations · approved live test email · remove `noindex`.
