#!/usr/bin/env node
// Vouchwall: self-hosted testimonial collection + Wall of Love. Zero dependencies.

import { createServer } from "node:http";
import { createReadStream, createWriteStream, existsSync, statSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { Store, newId } from "./store.mjs";
import { collectPage, wallPage, adminPage, notFoundPage } from "./views.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = join(ROOT, "public");

const UPLOAD_TYPES = {
  "video/webm": { ext: ".webm", max: 150 * 1024 * 1024 },
  "video/mp4": { ext: ".mp4", max: 150 * 1024 * 1024 },
  "video/quicktime": { ext: ".mov", max: 150 * 1024 * 1024 },
  "image/png": { ext: ".png", max: 3 * 1024 * 1024 },
  "image/jpeg": { ext: ".jpg", max: 3 * 1024 * 1024 },
  "image/webp": { ext: ".webp", max: 3 * 1024 * 1024 },
};
const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

export function createApp({ dataDir, adminToken, publicUrl } = {}) {
  const store = new Store(dataDir);
  const token = adminToken || loadOrCreateToken(dataDir);
  const limiter = rateLimiter(30, 10 * 60 * 1000);

  const isAdmin = (req) => {
    const header = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const cookie = parseCookies(req.headers.cookie).vw_admin;
    return [header, cookie].some((v) => v && safeEqual(v, token));
  };

  const baseUrl = (req) => publicUrl || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;

  async function handle(req, res) {
    const url = new URL(req.url, "http://x");
    const path = decodeURIComponent(url.pathname).replace(/\/+$/, "") || "/";
    const method = req.method;
    const parts = path.split("/").filter(Boolean);

    // ---------- static + pages ----------
    if (method === "GET" && path === "/") return redirect(res, "/admin");
    if (method === "GET" && path === "/health") return json(res, 200, { ok: true });
    if (method === "GET" && (path === "/embed.js" || parts[0] === "static")) {
      const file = path === "/embed.js" ? "embed.js" : parts.slice(1).join("/");
      return serveFile(req, res, join(PUBLIC_DIR, file), PUBLIC_DIR, { cors: path === "/embed.js", cache: 300 });
    }
    if (method === "GET" && parts[0] === "c" && parts.length === 2) {
      const form = store.formBySlug(parts[1]);
      return form ? html(res, 200, collectPage(form)) : html(res, 404, notFoundPage("This form doesn't exist."));
    }
    if (method === "GET" && parts[0] === "w" && parts.length === 2) {
      const wall = store.wall(parts[1]);
      return wall ? html(res, 200, wallPage(wall)) : html(res, 404, notFoundPage("This wall doesn't exist."));
    }
    if (method === "GET" && path === "/admin") return html(res, 200, adminPage());
    if (method === "GET" && parts[0] === "media" && parts.length === 2) {
      const name = parts[1];
      if (!/^[\w-]+\.(webm|mp4|mov|png|jpg|webp)$/.test(name)) return json(res, 404, { error: "Not found" });
      const owner = store.db.testimonials.find((t) => t.video === name || t.avatar === name);
      if (!(owner?.status === "approved") && !isAdmin(req)) return json(res, 404, { error: "Not found" });
      return serveFile(req, res, join(store.uploads, name), store.uploads, { cors: true, cache: 3600 });
    }

    // ---------- public API ----------
    if (parts[0] === "api" && parts[1] === "public") {
      if (method === "OPTIONS") return cors(res).end();
      if (method === "GET" && parts[2] === "walls" && parts.length === 4) {
        const wall = store.wall(parts[3]);
        if (!wall) return json(cors(res), 404, { error: "Wall not found" });
        const base = baseUrl(req);
        return json(cors(res), 200, {
          wall: { title: wall.title, subtitle: wall.subtitle, layout: wall.layout, theme: wall.theme },
          items: store.wallItems(wall).map((t) => publicTestimonial(t, base)),
        });
      }
      if (method === "GET" && parts[2] === "forms" && parts.length === 4) {
        const form = store.formBySlug(parts[3]);
        return form ? json(res, 200, { form: publicForm(form) }) : json(res, 404, { error: "Form not found" });
      }
      if (method === "POST" && parts[2] === "upload") {
        if (!limiter(clientIp(req))) return json(res, 429, { error: "Too many uploads. Try again later." });
        const type = String(req.headers["content-type"] || "").split(";")[0].trim();
        const spec = UPLOAD_TYPES[type];
        if (!spec) return json(res, 415, { error: `Unsupported file type: ${type || "none"}` });
        const name = `${newId("u")}${spec.ext}`;
        const ok = await streamToFile(req, join(store.uploads, name), spec.max);
        if (!ok) return json(res, 413, { error: "File too large" });
        return json(res, 201, { file: name });
      }
      if (method === "POST" && parts[2] === "forms" && parts[4] === "submit" && parts.length === 5) {
        if (!limiter(clientIp(req))) return json(res, 429, { error: "Too many submissions. Try again later." });
        const form = store.formBySlug(parts[3]);
        if (!form) return json(res, 404, { error: "Form not found" });
        const body = await readJson(req, 64 * 1024);
        if (body.website) return json(res, 201, { ok: true, message: form.thank_you }); // honeypot
        const err = validateSubmission(body, form, store);
        if (err) return json(res, 400, { error: err });
        const answers = {};
        form.questions.forEach((q, i) => {
          const a = body.answers?.[i] ?? body.answers?.[q];
          if (a) answers[q] = String(a).slice(0, 2000);
        });
        const t = store.addTestimonial({
          form_id: form.id,
          name: clean(body.name, 120),
          email: clean(body.email, 200),
          title: clean(body.title, 120),
          company: clean(body.company, 120),
          rating: form.collect_rating ? body.rating : null,
          text: clean(body.text, 5000),
          answers,
          video: form.collect_video ? body.video || null : null,
          avatar: body.avatar || null,
          consent: true,
          source: "form",
        });
        return json(res, 201, { ok: true, id: t.id, message: form.thank_you });
      }
      return json(res, 404, { error: "Not found" });
    }

    // ---------- admin API ----------
    if (parts[0] === "api" && parts[1] === "admin") {
      if (method === "POST" && parts[2] === "login") {
        const body = await readJson(req, 4096);
        if (!body.token || !safeEqual(String(body.token), token)) return json(res, 401, { error: "Wrong token" });
        res.setHeader("Set-Cookie", `vw_admin=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);
        return json(res, 200, { ok: true });
      }
      if (method === "POST" && parts[2] === "logout") {
        res.setHeader("Set-Cookie", "vw_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
        return json(res, 200, { ok: true });
      }
      if (!isAdmin(req)) return json(res, 401, { error: "Unauthorized" });
      // Cookie-authenticated writes must be JSON, which a cross-site form can't send.
      if (method !== "GET" && method !== "DELETE" && !String(req.headers["content-type"] || "").includes("application/json")) {
        return json(res, 415, { error: "Use Content-Type: application/json" });
      }
      const base = baseUrl(req);
      const [, , resource, id] = parts;
      const withLinks = (t) => adminTestimonial(t, base, store);

      if (resource === "me" && method === "GET") return json(res, 200, { ok: true, base_url: base });
      if (resource === "stats" && method === "GET") return json(res, 200, store.stats());

      if (resource === "testimonials") {
        if (method === "GET" && !id) {
          const q = Object.fromEntries(url.searchParams);
          if (q.featured !== undefined) q.featured = q.featured === "true";
          return json(res, 200, { items: store.query(q).map(withLinks) });
        }
        if (method === "POST" && !id) {
          const body = await readJson(req, 64 * 1024);
          if (!body.name || !(body.text || body.transcript)) return json(res, 400, { error: "name and text are required" });
          const t = store.addTestimonial({
            ...pick(body, ["name", "email", "title", "company", "rating", "text", "transcript", "highlight", "tags", "featured", "source_url", "created_at"]),
            form_id: body.form ? store.form(body.form)?.id || null : null,
            status: ["pending", "approved"].includes(body.status) ? body.status : "pending",
            source: body.source || "import",
            consent: Boolean(body.consent),
          });
          return json(res, 201, { testimonial: withLinks(t) });
        }
        const t = id && store.testimonial(id);
        if (!t) return json(res, 404, { error: "Testimonial not found" });
        if (method === "GET") return json(res, 200, { testimonial: withLinks(t) });
        if (method === "PATCH") {
          const body = await readJson(req, 64 * 1024);
          if (body.status === "approved" && !t.consent && !body.confirm_permission) {
            return json(res, 409, { error: "This testimonial was imported without recorded consent. Pass confirm_permission: true once you have permission to publish it." });
          }
          if (body.confirm_permission) t.consent = true;
          return json(res, 200, { testimonial: withLinks(store.updateTestimonial(id, body)) });
        }
        if (method === "DELETE") {
          const removed = store.deleteTestimonial(id);
          for (const f of [removed.video, removed.avatar]) if (f) safeUnlink(join(store.uploads, f));
          return json(res, 200, { deleted: id });
        }
      }

      if (resource === "forms") {
        if (method === "GET" && !id) return json(res, 200, { items: store.db.forms.map((f) => ({ ...f, url: `${base}/c/${f.slug}` })) });
        if (method === "POST" && !id) {
          const body = await readJson(req, 16 * 1024);
          if (!body.name) return json(res, 400, { error: "name is required" });
          const f = store.createForm(body);
          return json(res, 201, { form: { ...f, url: `${base}/c/${f.slug}` } });
        }
        if (method === "PATCH" && id) {
          const f = store.updateForm(id, await readJson(req, 16 * 1024));
          return f ? json(res, 200, { form: { ...f, url: `${base}/c/${f.slug}` } }) : json(res, 404, { error: "Form not found" });
        }
      }

      if (resource === "walls") {
        const decorate = (w) => ({ ...w, url: `${base}/w/${w.slug}`, embed: embedSnippet(base, w.slug), count: store.wallItems(w).length });
        if (method === "GET" && !id) return json(res, 200, { items: store.db.walls.map(decorate) });
        if (method === "POST" && !id) {
          const body = await readJson(req, 16 * 1024);
          if (!body.title) return json(res, 400, { error: "title is required" });
          return json(res, 201, { wall: decorate(store.createWall(body)) });
        }
        if (method === "PATCH" && id) {
          const w = store.updateWall(id, await readJson(req, 16 * 1024));
          return w ? json(res, 200, { wall: decorate(w) }) : json(res, 404, { error: "Wall not found" });
        }
      }
      return json(res, 404, { error: "Not found" });
    }

    return html(res, 404, notFoundPage("Page not found."));
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      if (!res.headersSent) json(res, status, { error: status === 500 ? "Server error" : err.message });
      else res.end();
    });
  });
  return { server, store, token };
}

// ---------- helpers ----------

function publicForm(f) {
  return pick(f, ["slug", "name", "heading", "prompt", "questions", "collect_video", "collect_rating", "thank_you", "brand_color"]);
}

function publicTestimonial(t, base) {
  return {
    id: t.id,
    type: t.type,
    name: t.name,
    title: t.title,
    company: t.company,
    rating: t.rating,
    text: t.text,
    highlight: t.highlight,
    answers: t.answers,
    transcript: t.transcript,
    featured: t.featured,
    avatar_url: t.avatar ? `${base}/media/${t.avatar}` : null,
    video_url: t.video ? `${base}/media/${t.video}` : null,
    source_url: t.source_url,
    created_at: t.created_at,
  };
}

function adminTestimonial(t, base, store) {
  const form = t.form_id ? store.form(t.form_id) : null;
  return {
    ...t,
    form: form ? form.slug : null,
    avatar_url: t.avatar ? `${base}/media/${t.avatar}` : null,
    video_url: t.video ? `${base}/media/${t.video}` : null,
  };
}

function validateSubmission(body, form, store) {
  if (!body.name || !String(body.name).trim()) return "Please add your name.";
  if (!body.consent) return "Please confirm we can share your testimonial.";
  const hasText = body.text && String(body.text).trim().length >= 3;
  const hasAnswers = body.answers && Object.values(body.answers).some((a) => String(a).trim());
  if (!hasText && !body.video && !hasAnswers) return "Please write a few words or record a video.";
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email))) return "That email doesn't look right.";
  for (const [field, re] of [["video", /\.(webm|mp4|mov)$/], ["avatar", /\.(png|jpg|webp)$/]]) {
    const f = body[field];
    if (!f) continue;
    if (!/^u_[\w-]+\.\w+$/.test(f) || !re.test(f) || !existsSync(join(store.uploads, f))) return `Upload for ${field} not found. Please try again.`;
    if (store.db.testimonials.some((t) => t.video === f || t.avatar === f)) return `Upload for ${field} was already used.`;
  }
  return null;
}

export function embedSnippet(base, slug) {
  return `<div data-vouchwall="${slug}"></div>\n<script src="${base}/embed.js" async></script>`;
}

function clean(v, max) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().slice(0, max);
  return s || null;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
  return res;
}

function html(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
  });
  res.end(body);
}

function redirect(res, to) {
  res.writeHead(302, { Location: to });
  res.end();
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  return res;
}

function serveFile(req, res, file, root, { cors: allowCors, cache } = {}) {
  const full = resolve(file);
  if (!full.startsWith(resolve(root)) || !existsSync(full) || !statSync(full).isFile()) return json(res, 404, { error: "Not found" });
  const size = statSync(full).size;
  const headers = {
    "Content-Type": MIME[extname(full).toLowerCase()] || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": `public, max-age=${cache || 0}`,
    "X-Content-Type-Options": "nosniff",
  };
  if (allowCors) headers["Access-Control-Allow-Origin"] = "*";
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (range) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    if (!range[1] && !range[2]) [start, end] = [0, size - 1];
    if (start >= size || start < 0 || end < start) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      return res.end();
    }
    end = Math.min(end, size - 1);
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
    return createReadStream(full, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, "Content-Length": size });
  if (req.method === "HEAD") return res.end();
  createReadStream(full).pipe(res);
}

function readJson(req, max) {
  return new Promise((resolveP, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > max) {
        reject(Object.assign(new Error("Request too large"), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolveP({});
      try {
        resolveP(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("Invalid JSON"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function streamToFile(req, file, max) {
  return new Promise((resolveP, reject) => {
    if (Number(req.headers["content-length"]) > max) {
      req.resume();
      return resolveP(false);
    }
    let size = 0;
    let tooBig = false;
    const out = createWriteStream(file);
    req.on("data", (c) => {
      size += c.length;
      if (size > max && !tooBig) {
        tooBig = true;
        req.unpipe(out);
        out.destroy();
        safeUnlink(file);
        req.resume();
      }
    });
    req.pipe(out);
    out.on("finish", () => resolveP(!tooBig));
    out.on("close", () => tooBig && resolveP(false));
    out.on("error", (e) => (tooBig ? resolveP(false) : reject(e)));
  });
}

function safeUnlink(f) {
  try {
    unlinkSync(f);
  } catch {}
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((p) => p.trim().split("="))
      .filter(([k]) => k)
      .map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]),
  );
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
}

function rateLimiter(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    list.push(now);
    hits.set(key, list);
    return list.length <= max;
  };
}

function loadOrCreateToken(dataDir) {
  const file = join(dataDir, "admin-token");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const t = randomBytes(24).toString("base64url");
  writeFileSync(file, t, { mode: 0o600 });
  console.log(`\n  Vouchwall admin token (saved to ${file}):\n\n    ${t}\n`);
  return t;
}

// ---------- CLI entry ----------

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3080);
  const dataDir = resolve(process.env.VOUCHWALL_DATA || join(ROOT, "data"));
  const { server } = createApp({ dataDir, adminToken: process.env.VOUCHWALL_ADMIN_TOKEN, publicUrl: process.env.VOUCHWALL_PUBLIC_URL });
  server.listen(port, () => console.log(`  Vouchwall running at http://localhost:${port}/admin  (data: ${dataDir})`));
}
