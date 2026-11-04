/* ---------- assets / slots ---------- */
document.querySelectorAll("[data-asset]").forEach(el => {
  const key = el.dataset.asset, src = CONFIG.assets[key];
  if (src) {
    const img = new Image();
    img.src = src;
    img.alt = (CONFIG.alts[key] ?? el.dataset.alt) || "";
    const d = CONFIG.dims[key]; if (d) { img.width = d[0]; img.height = d[1]; }
    img.loading = el.dataset.eager ? "eager" : "lazy";
    img.decoding = "async";
    el.appendChild(img);
  } else {
    const s = document.createElement("div");
    s.className = "slot " + (el.dataset.slotClass || "");
    s.setAttribute("role", "img");
    s.setAttribute("aria-label", "Image placeholder");
    s.innerHTML = "<span><strong>Image slot</strong>" + el.dataset.slotLabel + "</span>";
    el.appendChild(s);
  }
});
document.querySelectorAll("[data-caption]").forEach(el => { el.textContent = CONFIG.captions[el.dataset.caption] || ""; if(!el.textContent) el.remove(); });

/* ---------- approval-gated copy ---------- */
const setC = (k, html) => document.querySelectorAll(`[data-config="${k}"]`).forEach(el => el.innerHTML = html);
setC("capacityText", CONFIG.capacityText ? escapeHtml(CONFIG.capacityText) : "");
setC("phone", CONFIG.phone ? `<br><a href="tel:${CONFIG.phone.replace(/[^\d+]/g,"")}">${escapeHtml(CONFIG.phone)}</a>` : "");
setC("privacyLink", CONFIG.privacyUrl ? ` <a href="${CONFIG.privacyUrl}" target="_blank" rel="noopener">Privacy policy</a>` : "");
setC("privacyFooter", CONFIG.privacyUrl ? `<a href="${CONFIG.privacyUrl}" target="_blank" rel="noopener">Privacy policy</a>` : "");
setC("minSpendFaq", CONFIG.minSpendFaq ? `<details><summary>Is there a minimum for larger groups?</summary><p>For parties of more than 16, a $200 minimum-spend preorder on a single tab holds the reservation. Our team confirms all arrangements with you.</p></details>` : "");
if (CONFIG.menuUrl) document.querySelector('[data-config-href="menuUrl"]').href = CONFIG.menuUrl;
if (CONFIG.liveHosts.includes(location.hostname)) document.getElementById("previewStrip").hidden = true;

/* ---------- tracking hooks (no personal data, ever) ---------- */
window.dataLayer = window.dataLayer || [];
function track(event, params = {}) {
  const payload = { event, location: CONFIG.location, ...params };
  window.dataLayer.push(payload);
  if (CONFIG.debugTracking) console.log("[track]", payload);
}
function attribution() {
  if (!CONFIG.captureUtm) return {};
  const p = new URLSearchParams(location.search), out = {};
  ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","gclid","fbclid"].forEach(k => { const v = p.get(k); if (v) out[k] = v.slice(0,200); });
  return out;
}
track("lp_view");
document.querySelectorAll('[data-track="cta_click"]').forEach(a => a.addEventListener("click", () => track("cta_click", { cta: a.dataset.cta })));

/* ---------- form ---------- */
const form = document.getElementById("inquiry");
const $ = id => document.getElementById(id);
const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
$("date").min = today.toISOString().slice(0,10);

let started = false;
form.addEventListener("input", () => { if (!started) { started = true; track("form_start"); } updateTab(); });
form.addEventListener("change", updateTab);
$("flexible").addEventListener("change", e => { $("date").disabled = e.target.checked; if (e.target.checked) clearErr("date"); updateTab(); });
$("notes").addEventListener("input", e => $("notes-count").textContent = `${e.target.value.length} / 1000`);

function fmtDate(v){ if(!v) return ""; const [y,m,d] = v.split("-").map(Number); return new Date(y,m-1,d).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"}); }
function setTab(id, val, empty){ const el = $(id); el.textContent = val || empty; el.classList.toggle("empty", !val); }
function updateTab(){
  const f = new FormData(form);
  setTab("t-date", $("flexible").checked ? "Flexible" : fmtDate(f.get("date")), "Not chosen");
  const g = parseInt(f.get("guests"),10);
  setTab("t-guests", g > 0 ? `${g} ${g === 1 ? "guest" : "guests"}` : "", "Not set");
  setTab("t-time", f.get("time"), "No preference");
  setTab("t-occasion", f.get("occasion"), "Not set");
  setTab("t-seating", f.get("seating"), "Not sure yet");
  setTab("t-name", (f.get("name")||"").trim(), "Not set");
}

const LABELS = { date:"Preferred date", guests:"Estimated guests", name:"Full name", email:"Email" };
function setErr(id,msg){ $(id).setAttribute("aria-invalid","true"); $(id+"-err").textContent = msg; }
function clearErr(id){ $(id).removeAttribute("aria-invalid"); $(id+"-err").textContent = ""; }

function validate(){
  const errs = {};
  const name = $("name").value.trim(), email = $("email").value.trim();
  const date = $("date").value, flex = $("flexible").checked, guests = $("guests").value.trim();
  if (name.length < 2) errs.name = "Enter your full name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errs.email = "Enter an email address like name@example.com.";
  if (!flex) {
    if (!date) errs.date = "Choose a date, or tick “I'm flexible on the date.”";
    else if (date < $("date").min) errs.date = "Choose a date from today onward.";
  }
  if (!/^\d+$/.test(guests) || +guests < 1 || +guests > 300) errs.guests = "Enter a guest count between 1 and 300.";
  ["name","email","date","guests"].forEach(k => errs[k] ? setErr(k, errs[k]) : clearErr(k));
  const box = $("errSummary"), list = $("errList");
  list.innerHTML = "";
  const keys = Object.keys(errs);
  if (keys.length) {
    keys.forEach(k => { const li = document.createElement("li"); li.innerHTML = `<a href="#${k}">${LABELS[k]}</a>: ${escapeHtml(errs[k])}`; list.appendChild(li); });
    box.hidden = false; box.focus();
    track("form_validation_error", { fields: keys.join(",") }); // field names only
  } else box.hidden = true;
  return keys.length === 0;
}

// One ID per inquiry, included in the submission so duplicates are easy to spot.
let submissionId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
let sending = false, done = false;

form.addEventListener("submit", async e => {
  e.preventDefault();
  if (sending || done) return;
  const status = $("status"); status.hidden = true; status.className = "status";
  if (!validate()) return;
  if ($("company_site").value) return; // honeypot: silently ignore bots

  const f = new FormData(form);
  const payload = {
    submission_id: submissionId,
    location: CONFIG.location,
    name: f.get("name").trim(),
    email: f.get("email").trim(),
    phone: (f.get("phone")||"").trim(),
    date: $("flexible").checked ? null : f.get("date"),
    date_flexible: $("flexible").checked,
    guests: parseInt(f.get("guests"),10),
    time: f.get("time") || null,
    occasion: f.get("occasion") || null,
    seating: f.get("seating"),
    notes: (f.get("notes")||"").trim(),
    company_site: "",
    attribution: attribution(),
    submitted_at: new Date().toISOString()
  };

  const live = CONFIG.liveHosts.includes(location.hostname);
  if (!live) {
    status.className = "status preview-mode";
    status.innerHTML = "<strong>Preview mode: nothing was sent.</strong> Inquiries are only accepted on the live page. This is what would be submitted:<pre></pre>";
    status.querySelector("pre").textContent = JSON.stringify(payload, null, 2);
    status.hidden = false;
    return; // never fake a successful send
  }

  sending = true;
  const btn = $("submitBtn"); btn.disabled = true; btn.textContent = "Sending…";
  try {
    // Netlify Forms: urlencoded POST of the static form's fields.
    form.querySelector('[name="submission_id"]').value = submissionId;
    const fd = new FormData(form);
    const res = await fetch(CONFIG.formAction, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fd).toString()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    done = true;
    status.className = "status ok";
    status.textContent = "Thanks. Your inquiry has been received. Our team will contact you to discuss the details.";
    status.hidden = false;
    btn.textContent = "Inquiry sent";
    // Lead conversion fires once per successful submission ID.
    const key = "lead_fired_" + submissionId;
    let fired = false; try { fired = sessionStorage.getItem(key) === "1"; } catch(_) {}
    if (!fired) { track("generate_lead", { submission_id: submissionId }); try { sessionStorage.setItem(key,"1"); } catch(_) {} }
  } catch (err) {
    status.className = "status fail";
    status.textContent = "Your inquiry wasn't sent. Check your connection and select Send Inquiry again; your details are still here.";
    status.hidden = false;
    btn.disabled = false; btn.textContent = "Send Inquiry";
  } finally { sending = false; }
});

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
updateTab();
