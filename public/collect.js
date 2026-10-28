// Collection form: text or video testimonial, optional photo, then submit.
(() => {
  const cfg = JSON.parse(document.getElementById("vw-config").textContent);
  const form = document.getElementById("vw-form");
  const errorEl = document.getElementById("vw-error");
  const submitBtn = document.getElementById("vw-submit");
  const MAX_SECONDS = 120;

  let mode = "text";
  let videoBlob = null;
  let recorder = null;
  let stream = null;
  let timer = null;

  const $ = (id) => document.getElementById(id);
  const showError = (msg) => {
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
  };

  // ---- mode switch ----
  document.querySelectorAll(".mode-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      mode = btn.dataset.mode;
      document.querySelectorAll(".mode-btn").forEach((b) => {
        b.classList.toggle("active", b === btn);
        b.setAttribute("aria-selected", String(b === btn));
      });
      $("video-box").hidden = mode !== "video";
      $("text-field").firstChild.textContent = mode === "video" ? "Anything to add? (optional)" : "Your testimonial";
      if (mode !== "video") stopStream();
    }),
  );

  // ---- recording ----
  function stopStream() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  function pickMime() {
    for (const m of ["video/webm;codecs=vp9,opus", "video/webm", "video/mp4"]) if (window.MediaRecorder?.isTypeSupported?.(m)) return m;
    return "";
  }

  $("rec-start")?.addEventListener("click", async () => {
    showError("");
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
    } catch {
      return showError("Couldn't access your camera. You can upload a video file instead.");
    }
    const preview = $("vw-preview");
    preview.srcObject = stream;
    preview.muted = true;
    preview.controls = false;
    await preview.play().catch(() => {});
    const chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: pickMime() || undefined });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      videoBlob = new Blob(chunks, { type: (recorder.mimeType || "video/webm").split(";")[0] });
      stopStream();
      preview.srcObject = null;
      preview.src = URL.createObjectURL(videoBlob);
      preview.muted = false;
      preview.controls = true;
      clearInterval(timer);
      $("rec-stop").hidden = true;
      $("rec-redo").hidden = false;
    };
    recorder.start(1000);
    const started = Date.now();
    $("rec-start").hidden = true;
    $("rec-stop").hidden = false;
    $("rec-redo").hidden = true;
    timer = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      $("rec-timer").textContent = `● ${s}s / ${MAX_SECONDS}s`;
      if (s >= MAX_SECONDS) recorder.stop();
    }, 250);
  });

  $("rec-stop")?.addEventListener("click", () => recorder?.state === "recording" && recorder.stop());
  $("rec-redo")?.addEventListener("click", () => {
    videoBlob = null;
    $("rec-timer").textContent = "";
    $("rec-start").hidden = false;
    $("rec-redo").hidden = true;
    $("rec-start").click();
  });
  $("vw-video-file")?.addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    videoBlob = f;
    const preview = $("vw-preview");
    preview.srcObject = null;
    preview.src = URL.createObjectURL(f);
    preview.controls = true;
    preview.muted = false;
  });

  // ---- submit ----
  async function upload(blob) {
    const res = await fetch("/api/public/upload", { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Upload failed");
    return body.file;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const fd = new FormData(form);
    const payload = {
      name: fd.get("name"),
      email: fd.get("email") || undefined,
      title: fd.get("title") || undefined,
      company: fd.get("company") || undefined,
      text: fd.get("text") || "",
      rating: fd.get("rating") ? Number(fd.get("rating")) : undefined,
      consent: fd.get("consent") === "on",
      website: fd.get("website") || undefined,
      answers: Object.fromEntries(cfg.questions.map((_, i) => [i, fd.get(`answer_${i}`) || ""])),
    };
    if (!payload.name?.trim()) return showError("Please add your name.");
    if (mode === "video" && !videoBlob) return showError("Record or upload a video first, or switch to writing.");
    if (mode === "text" && payload.text.trim().length < 3 && !Object.values(payload.answers).some((a) => a.trim())) {
      return showError("Please write a few words.");
    }
    if (!payload.consent) return showError("Please confirm we can share your testimonial.");

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
    try {
      if (mode === "video" && videoBlob) {
        submitBtn.textContent = "Uploading video…";
        payload.video = await upload(videoBlob);
      }
      const avatar = fd.get("avatar");
      if (avatar && avatar.size) payload.avatar = await upload(avatar);
      const res = await fetch(`/api/public/forms/${encodeURIComponent(cfg.slug)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Something went wrong");
      form.hidden = true;
      $("vw-done-msg").textContent = body.message || cfg.thank_you;
      $("vw-done").hidden = false;
      stopStream();
    } catch (err) {
      showError(err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = "Send testimonial";
    }
  });
})();
