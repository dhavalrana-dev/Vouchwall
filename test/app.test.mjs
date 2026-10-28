// End-to-end: real HTTP server on a random port, plus the MCP server over stdio against it.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createApp } from "../server/index.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = "test-token-123";
let dir, app, base;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), "vouchwall-"));
  app = createApp({ dataDir: dir, adminToken: TOKEN });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});

after(() => {
  app.server.close();
  rmSync(dir, { recursive: true, force: true });
});

const admin = (method, path, body) =>
  fetch(`${base}/api/admin/${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
const pub = (method, path, body, headers = { "Content-Type": "application/json" }) =>
  fetch(`${base}/api/public/${path}`, { method, headers, body: typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body) });

let form, videoFile, testimonialId;

test("admin API requires the token", async () => {
  assert.equal((await fetch(`${base}/api/admin/stats`)).status, 401);
  assert.equal((await fetch(`${base}/api/admin/stats`, { headers: { Authorization: "Bearer nope" } })).status, 401);
  assert.equal((await admin("GET", "stats")).status, 200);
  const login = await fetch(`${base}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: TOKEN }) });
  assert.match(login.headers.get("set-cookie"), /vw_admin=.*HttpOnly.*SameSite=Strict/);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(`${base}/api/admin/stats`, { headers: { Cookie: cookie } })).status, 200);
  // A cross-site form post can't send JSON, so non-JSON writes are refused.
  const formPost = await fetch(`${base}/api/admin/forms`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" }, body: "name=x" });
  assert.equal(formPost.status, 415);
});

test("create a form and render its public page", async () => {
  const res = await admin("POST", "forms", { name: "Acme Analytics", questions: ["What were you using before?"], brand_color: "#ff5a1f" });
  assert.equal(res.status, 201);
  form = (await res.json()).form;
  assert.equal(form.slug, "acme-analytics");
  assert.equal(form.url, `${base}/c/acme-analytics`);
  const page = await fetch(form.url);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Share your experience with Acme Analytics/);
  assert.match(html, /--brand:#ff5a1f/);
  assert.equal((await fetch(`${base}/c/nope`)).status, 404);
});

test("public submission: validation, video upload, honeypot", async () => {
  const bad = await pub("POST", `forms/${form.slug}/submit`, { name: "Ann", text: "Great" });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /confirm/);

  assert.equal((await pub("POST", "upload", "x", { "Content-Type": "application/x-msdownload" })).status, 415);
  const up = await pub("POST", "upload", new Uint8Array(2048).fill(1), { "Content-Type": "video/webm" });
  assert.equal(up.status, 201);
  videoFile = (await up.json()).file;
  assert.match(videoFile, /^u_[\w-]+\.webm$/);

  const ok = await pub("POST", `forms/${form.slug}/submit`, {
    name: "Ann Lee <script>",
    email: "ann@example.com",
    title: "Head of Growth",
    company: "Lumen",
    rating: 5,
    text: "We cut reporting time from 6 hours to 20 minutes a week.",
    answers: { 0: "Spreadsheets" },
    video: videoFile,
    consent: true,
  });
  assert.equal(ok.status, 201);
  testimonialId = (await ok.json()).id;

  const reuse = await pub("POST", `forms/${form.slug}/submit`, { name: "Bob", text: "Nice tool", video: videoFile, consent: true });
  assert.match((await reuse.json()).error, /already used/);

  const spam = await pub("POST", `forms/${form.slug}/submit`, { name: "Bot", text: "buy now", consent: true, website: "http://spam" });
  assert.equal(spam.status, 201);
  const { items } = await (await admin("GET", "testimonials?status=all")).json();
  assert.equal(items.length, 1, "honeypot submission is not stored");
  assert.deepEqual(items[0].answers, { "What were you using before?": "Spreadsheets" });
  assert.equal(items[0].type, "video");
});

test("pending media is private; walls only show approved, without emails", async () => {
  assert.equal((await fetch(`${base}/media/${videoFile}`)).status, 404);
  assert.equal((await fetch(`${base}/media/${videoFile}`, { headers: { Authorization: `Bearer ${TOKEN}` } })).status, 200);

  const wallRes = await admin("POST", "walls", { title: "Wall of Love", filter: { tags: ["roi"] } });
  const wall = (await wallRes.json()).wall;
  assert.match(wall.embed, /data-vouchwall="wall-of-love"/);
  assert.match(wall.embed, new RegExp(`${base}/embed.js`));
  let data = await (await fetch(`${base}/api/public/walls/${wall.slug}`)).json();
  assert.equal(data.items.length, 0);

  const patch = await admin("PATCH", `testimonials/${testimonialId}`, { status: "approved", add_tags: ["ROI", "reporting"], highlight: "6 hours to 20 minutes", featured: true });
  assert.equal(patch.status, 200);
  const res = await fetch(`${base}/api/public/walls/${wall.slug}`);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  data = await res.json();
  assert.equal(data.items.length, 1);
  const item = data.items[0];
  assert.equal(item.email, undefined);
  assert.equal(item.highlight, "6 hours to 20 minutes");
  assert.equal(item.video_url, `${base}/media/${videoFile}`);

  const media = await fetch(item.video_url, { headers: { Range: "bytes=0-99" } });
  assert.equal(media.status, 206);
  assert.equal(media.headers.get("content-range"), "bytes 0-99/2048");
  assert.equal((await media.arrayBuffer()).byteLength, 100);

  const page = await (await fetch(`${base}/w/${wall.slug}`)).text();
  assert.match(page, /<h1>Wall of Love<\/h1>/);
  const embed = await fetch(`${base}/embed.js`);
  assert.equal(embed.status, 200);
  assert.match(embed.headers.get("content-type"), /javascript/);
});

test("imports need confirmed permission before they can be approved", async () => {
  const res = await admin("POST", "testimonials", { name: "Raj P", text: "Support answered in 4 minutes.", source: "email" });
  const t = (await res.json()).testimonial;
  assert.equal(t.status, "pending");
  const blocked = await admin("PATCH", `testimonials/${t.id}`, { status: "approved" });
  assert.equal(blocked.status, 409);
  const allowed = await admin("PATCH", `testimonials/${t.id}`, { status: "approved", confirm_permission: true });
  assert.equal((await allowed.json()).testimonial.status, "approved");
  const del = await admin("DELETE", `testimonials/${t.id}`);
  assert.equal(del.status, 200);
});

test("HTML output escapes user content", async () => {
  await admin("PATCH", `forms/${form.id}`, { heading: `<img src=x onerror=alert(1)>` });
  const html = await (await fetch(form.url)).text();
  assert.ok(!html.includes("<img src=x"));
  assert.match(html, /&lt;img src=x/);
});

test("path traversal and unknown routes are rejected", async () => {
  assert.equal((await fetch(`${base}/static/..%2f..%2fpackage.json`)).status, 404);
  assert.equal((await fetch(`${base}/media/..%2fvouchwall.json`)).status, 404);
  assert.equal((await fetch(`${base}/nope`)).status, 404);
});

test("data survives a restart", async () => {
  const again = createApp({ dataDir: dir, adminToken: TOKEN });
  assert.equal(again.store.db.testimonials.length, 1);
  assert.ok(existsSync(join(dir, "vouchwall.json")));
});

test("MCP server drives the instance end to end", async () => {
  const proc = spawn(process.execPath, [join(ROOT, "mcp", "server.mjs")], { env: { ...process.env, VOUCHWALL_URL: base, VOUCHWALL_TOKEN: TOKEN } });
  const pending = new Map();
  let nextId = 1;
  createInterface({ input: proc.stdout }).on("line", (l) => {
    const m = JSON.parse(l);
    pending.get(m.id)?.(m);
  });
  const rpc = (method, params) => {
    const id = nextId++;
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return new Promise((r) => pending.set(id, r));
  };
  const call = async (name, args = {}) => {
    const { result } = await rpc("tools/call", { name, arguments: args });
    if (result.isError) throw new Error(result.content[0].text);
    return result.structuredContent;
  };
  try {
    const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } });
    assert.equal(init.result.serverInfo.name, "vouchwall");
    const { result } = await rpc("tools/list", {});
    assert.equal(result.tools.length, 12);

    const list = await call("list_testimonials", {});
    assert.equal(list.count, 1);
    assert.equal(list.items[0].email, undefined, "emails hidden by default");
    assert.equal(list.items[0].has_email, true);

    const imp = await call("import_testimonials", {
      items: [
        { name: "Mia K", text: "Onboarding took one call.", source: "linkedin", tags: ["onboarding"], consent: true, status: "approved" },
        { name: "", text: "missing name" },
      ],
    });
    assert.equal(imp.imported, 1);
    assert.equal(imp.errors.length, 1);

    const md = await call("export_testimonials", { format: "markdown" });
    assert.equal(md.count, 2);
    assert.match(md.markdown, /\*\*6 hours to 20 minutes\*\*/);
    assert.ok(!md.markdown.includes("ann@example.com"));
    const csv = await call("export_testimonials", { format: "csv", tag: "onboarding" });
    assert.equal(csv.csv.split("\n").length, 2);

    const f = await call("create_form", { name: "Coaching", collect_video: false });
    assert.match(f.form.url, /\/c\/coaching$/);
    const w = await call("create_wall", { title: "Featured", layout: "carousel", filter: { featured_only: true } });
    assert.equal(w.wall.count, 1);
    assert.equal((await call("vouchwall_stats")).approved, 2);

    await assert.rejects(call("get_testimonial", { id: "t_missing" }), /not found/);
  } finally {
    proc.kill();
  }
});

test("MCP server explains a missing token", async () => {
  const proc = spawn(process.execPath, [join(ROOT, "mcp", "server.mjs")], { env: { ...process.env, VOUCHWALL_URL: base, VOUCHWALL_TOKEN: "" } });
  const line = new Promise((r) => createInterface({ input: proc.stdout }).once("line", r));
  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "vouchwall_stats", arguments: {} } }) + "\n");
  const msg = JSON.parse(await line);
  proc.kill();
  assert.equal(msg.result.isError, true);
  assert.match(msg.result.content[0].text, /VOUCHWALL_TOKEN is not set/);
});
