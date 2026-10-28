// Server-rendered page shells. Interactive parts live in /public.

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// JSON embedded in <script type="application/json"> must not contain "</script".
function data(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

function shell({ title, body, scripts = [], color }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/static/app.css">
${color ? `<style>:root{--brand:${esc(color)}}</style>` : ""}
</head>
<body>
${body}
${scripts.map((s) => `<script src="${s}" defer></script>`).join("\n")}
</body>
</html>`;
}

export function collectPage(form) {
  const cfg = {
    slug: form.slug,
    questions: form.questions,
    collect_video: form.collect_video,
    collect_rating: form.collect_rating,
    thank_you: form.thank_you,
  };
  return shell({
    title: form.heading,
    color: form.brand_color,
    scripts: ["/static/collect.js"],
    body: `<main class="collect">
  <form id="vw-form" class="card" novalidate>
    <h1>${esc(form.heading)}</h1>
    <p class="muted">${esc(form.prompt)}</p>

    ${form.collect_video ? `<div class="mode" role="tablist">
      <button type="button" class="mode-btn active" data-mode="text" role="tab" aria-selected="true">Write it</button>
      <button type="button" class="mode-btn" data-mode="video" role="tab" aria-selected="false">Record a video</button>
    </div>
    <section id="video-box" class="video-box" hidden>
      <video id="vw-preview" playsinline muted></video>
      <div class="row">
        <button type="button" id="rec-start" class="btn">Start recording</button>
        <button type="button" id="rec-stop" class="btn" hidden>Stop</button>
        <button type="button" id="rec-redo" class="btn ghost" hidden>Record again</button>
        <span id="rec-timer" class="muted"></span>
      </div>
      <p class="muted small">Or upload a video: <input type="file" id="vw-video-file" accept="video/mp4,video/webm,video/quicktime"></p>
    </section>` : ""}

    ${form.collect_rating ? `<fieldset class="stars" aria-label="Rating">
      ${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="rating" id="star${n}" value="${n}"><label for="star${n}" title="${n} star${n > 1 ? "s" : ""}">★</label>`).join("")}
    </fieldset>` : ""}

    <label id="text-field">Your testimonial
      <textarea name="text" rows="5" maxlength="5000" placeholder="What problem did you have, what did you try, and what changed?"></textarea>
    </label>

    ${form.questions.map((q, i) => `<label>${esc(q)}<textarea name="answer_${i}" rows="2" maxlength="2000"></textarea></label>`).join("")}

    <div class="grid2">
      <label>Your name *<input name="name" required maxlength="120" autocomplete="name"></label>
      <label>Email <span class="muted">(not shown)</span><input name="email" type="email" maxlength="200" autocomplete="email"></label>
      <label>Role / title<input name="title" maxlength="120" autocomplete="organization-title"></label>
      <label>Company<input name="company" maxlength="120" autocomplete="organization"></label>
    </div>
    <label>Photo <span class="muted">(optional)</span><input type="file" name="avatar" accept="image/png,image/jpeg,image/webp"></label>
    <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    <label class="check"><input type="checkbox" name="consent" required> I agree that this testimonial, my name and photo may be shared publicly.</label>

    <p id="vw-error" class="error" role="alert" hidden></p>
    <button type="submit" class="btn primary" id="vw-submit">Send testimonial</button>
  </form>
  <div id="vw-done" class="card done" hidden><h1>✓</h1><p id="vw-done-msg"></p></div>
  <p class="powered">Collected with Vouchwall, open source</p>
</main>
<script type="application/json" id="vw-config">${data(cfg)}</script>`,
  });
}

export function wallPage(wall) {
  return shell({
    title: wall.title,
    scripts: ["/embed.js"],
    body: `<main class="wall-page">
  <header><h1>${esc(wall.title)}</h1>${wall.subtitle ? `<p class="muted">${esc(wall.subtitle)}</p>` : ""}</header>
  <div data-vouchwall="${esc(wall.slug)}" data-hide-header="true"></div>
</main>`,
  });
}

export function adminPage() {
  return shell({
    title: "Vouchwall admin",
    scripts: ["/static/admin.js"],
    body: `<div id="app" class="admin"><p class="muted" style="padding:2rem">Loading…</p></div>`,
  });
}

export function notFoundPage(msg) {
  return shell({ title: "Not found", body: `<main class="collect"><div class="card"><h1>Not found</h1><p class="muted">${esc(msg)}</p></div></main>` });
}
