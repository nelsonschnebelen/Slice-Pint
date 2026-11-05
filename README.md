# The Slice & Pint private-event landing pages

Mobile-first inquiry pages for private events. Static HTML/CSS/JS, deployed on Netlify (sliceandpint.netlify.app).

| Page | Path | Netlify form name |
|---|---|---|
| Redondo Beach (private dining room) | `/redondo/` | `redondo-event-inquiry` |
| El Segundo (the Dugout) | `/el-segundo/` | `el-segundo-event-inquiry` |

## Editing
Both pages are generated from one template. Don't edit `redondo/index.html` or `el-segundo/index.html` directly. `/` and `/index.html` 301 to `/redondo/`.
- Shared markup: `src/template.html`
- Shared styles and behavior: `assets/site.css`, `assets/site.js`
- Per-location copy, address, photos and approval switches: `LOCATIONS` and `COMMON` in `build.py`

Then run `python3 build.py` and commit the output.

## Form submissions (Netlify Forms)
The form posts to Netlify Forms, but only on hosts listed in `liveHosts` (currently `sliceandpint.netlify.app`). Anywhere else, including previews, it shows the payload and sends nothing. Add any custom domain to `liveHosts` before pointing it at the site. Each page posts to its own static path (`/redondo/` and `/el-segundo/`), not `/`, because `/` is a 301.

One-time setup in the Netlify dashboard, required before submissions work:
1. **Forms → Enable form detection**, then redeploy so both forms are registered.
2. **Site configuration → Environment variables**: set `SLACK_WEBHOOK_URL_SLICEANDPINT` to the Slack incoming webhook for the events channel. Do not commit the URL. `netlify/functions/submission-created.mjs` posts each verified `redondo-event-inquiry` and `el-segundo-event-inquiry` there, and @mentions Eli and Brittney. If the variable is missing, the function logs a one-line warning and does not post.
3. Submit one test inquiry per page and confirm the Slack message arrives.

Dry-run the message locally. This prints the Slack JSON and does not post:

```
DRY_RUN=1 node scripts/dry-run-submission.mjs
```

Spam protection is the `company_site` honeypot (`netlify-honeypot`). Each submission carries a `submission_id`, and the page blocks double submits.

## Approval switches (`build.py`)
| Key | Current | Notes |
|---|---|---|
| `capacityText` | `""` | Redondo: client email says ~30 seated / 40 standing, old site says 20/35. El Segundo Dugout: not confirmed. |
| `minSpendFaq` | `False` | "More than 16 guests, $200 minimum-spend preorder on a single tab." Confirm it applies to each location. |
| `menuUrl`, `phone`, `privacyUrl` | `""` | Shown once verified. |
| `captureUtm` | `False` | Only under an approved consent setup. |

## Tracking
Pushes to `window.dataLayer`: `lp_view`, `cta_click`, `form_start`, `form_validation_error` (field names only), `generate_lead` (once per successful submission). No personal data in any event. No GA4/GTM/Ads/Meta IDs are installed yet.

## Assets
| File | Source | Use |
|---|---|---|
| `slice-pint-logo.webp` | Official badge, thesliceandpint.com | Header and footer, both pages |
| `redondo-private-dining.webp` | Brittney via Slack, Oct 15 | Redondo hero |
| `room-1.webp`, `room-2.webp` | Supplied by Nelson | Redondo gallery. Location not confirmed. |
| `pepperoni.webp` | Supplied by Nelson | Redondo food section |
| `el-segundo-dugout.webp` | Eli via Slack, Oct 29. TV screens blanked (one showed an ad with a person and phone number). | El Segundo hero |
| `margherita.webp` | Official site, filename labeled El Segundo | El Segundo food section |
| `food-spread.webp` | Supplied by Nelson | Not currently used |

Both pages are `noindex` until they live on the restaurant's own domain.
