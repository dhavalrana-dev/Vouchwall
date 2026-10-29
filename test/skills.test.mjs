// Walks each skill's workflow through the MCP tools in the order the SKILL.md tells Claude to,
// so a change to the server or tools that breaks a skill's instructions fails here.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createApp } from "../server/index.mjs";

const MCP = join(dirname(fileURLToPath(import.meta.url)), "..", "mcp", "server.mjs");
const TOKEN = "skills-test-token";
let dir, app, base, mcp;

function startMcp(env) {
  const proc = spawn(process.execPath, [MCP], { env: { ...process.env, ...env } });
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
  return {
    proc,
    rpc,
    async call(name, args = {}) {
      const { result } = await rpc("tools/call", { name, arguments: args });
      if (result.isError) throw new Error(result.content[0].text);
      return result.structuredContent;
    },
  };
}

const submit = (slug, body) =>
  fetch(`${base}/api/public/forms/${slug}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consent: true, ...body }) }).then((r) => r.json());

before(async () => {
  dir = mkdtempSync(join(tmpdir(), "vouchwall-skills-"));
  app = createApp({ dataDir: dir, adminToken: TOKEN });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${app.server.address().port}`;
  mcp = startMcp({ VOUCHWALL_URL: base, VOUCHWALL_TOKEN: TOKEN });
});

after(() => {
  mcp.proc.kill();
  app.server.close();
  rmSync(dir, { recursive: true, force: true });
});

let form;

test("testimonial-request: find or create the form, get a share link", async () => {
  assert.equal((await mcp.call("list_forms")).items.length, 0);
  form = (
    await mcp.call("create_form", {
      name: "Shopify Migration",
      prompt: "What was going on before you found us, and what changed?",
      questions: ["What were you using or doing before?", "What result can you point to? A number helps.", "Who would you recommend this to?"],
      collect_video: true,
    })
  ).form;
  assert.equal(form.url, `${base}/c/shopify-migration`);
  assert.equal(form.questions.length, 3);
  assert.equal((await fetch(form.url)).status, 200);
  assert.equal((await mcp.call("list_forms")).items[0].url, form.url);
});

test("customers submit through the shared link", async () => {
  const a = await submit(form.slug, {
    name: "Ann Lee",
    email: "ann@lumen.io",
    title: "Head of Ops",
    company: "Lumen",
    rating: 5,
    text: "Checkout errors dropped from 40 a day to almost zero. The migration took one weekend and nobody on our team had to touch the code.",
    answers: { 0: "WooCommerce with six plugins", 1: "Conversion went from 1.9% to 2.6%", 2: "Any store over 1,000 orders a month" },
  });
  assert.ok(a.ok);
  const up = await fetch(`${base}/api/public/upload`, { method: "POST", headers: { "Content-Type": "video/mp4" }, body: new Uint8Array(4096) }).then((r) => r.json());
  const b = await submit(form.slug, { name: "Marco Rossi", company: "Pasta Club", rating: 5, video: up.file });
  assert.ok(b.ok);
  const c = await submit(form.slug, { name: "x", text: "asdf asdf" });
  assert.ok(c.ok);
  assert.equal((await mcp.call("vouchwall_stats")).pending, 3);
});

test("testimonial-curation: review inbox, verbatim highlights, tags, feature", async () => {
  const { items } = await mcp.call("list_testimonials", { status: "pending" });
  assert.equal(items.length, 3);
  assert.ok(items.every((t) => t.email === undefined), "emails hidden from Claude by default");
  const ann = items.find((t) => t.name === "Ann Lee");
  const marco = items.find((t) => t.name === "Marco Rossi");
  const junk = items.find((t) => t.name === "x");

  // A paraphrased highlight is flagged...
  const para = await mcp.call("update_testimonial", { id: ann.id, highlight: "Checkout errors basically disappeared" });
  assert.match(para.warnings[0], /not verbatim/);
  // ...an exact one (any case, curly quotes, ellipsis trims) is accepted.
  const exact = await mcp.call("update_testimonial", {
    id: ann.id,
    status: "approved",
    highlight: "Checkout errors dropped from 40 a day to almost zero… nobody on our team had to touch the code",
    tags: ["checkout", "roi"],
    featured: true,
  });
  assert.equal(exact.warnings, undefined);
  assert.equal(exact.status, "approved");
  // Highlights may come from question answers too.
  assert.equal((await mcp.call("update_testimonial", { id: ann.id, highlight: "Conversion went from 1.9% to 2.6%" })).warnings, undefined);

  // Video: Claude can't watch it; the user pastes a transcript, then a highlight comes from it.
  const withTranscript = await mcp.call("update_testimonial", {
    id: marco.id,
    transcript: "Honestly we were scared of losing orders. Two weeks after the switch we found the checkout step that was losing 18% of carts.",
  });
  assert.equal(withTranscript.type, "video");
  const marcoDone = await mcp.call("update_testimonial", { id: marco.id, status: "approved", add_tags: ["checkout"], highlight: "we found the checkout step that was losing 18% of carts" });
  assert.equal(marcoDone.warnings, undefined);
  assert.deepEqual(marcoDone.tags, ["checkout"]);

  await mcp.call("update_testimonial", { id: junk.id, status: "rejected" });
  const stats = await mcp.call("vouchwall_stats");
  assert.deepEqual([stats.pending, stats.approved, stats.rejected], [0, 2, 1]);
  assert.deepEqual(stats.top_tags[0], { tag: "checkout", count: 2 });
});

test("testimonial-curation: imports respect permission", async () => {
  const res = await mcp.call("import_testimonials", {
    items: [
      { name: "Priya N", title: "Founder", company: "Fieldwork", text: "Best agency we've hired. Clear, fast, honest.", rating: 5, source: "g2", source_url: "https://g2.example/r/1", consent: true, status: "approved", tags: ["agency"] },
      { name: "Tom B", text: "Thanks again, the new store is flying!", source: "email", status: "approved" },
      { name: "Lena K", text: "Support answered every question within the hour.", source: "linkedin", form: "shopify-migration" },
    ],
  });
  assert.equal(res.imported, 2);
  assert.equal(res.errors.length, 1);
  assert.equal(res.errors[0].name, "Tom B");
  assert.match(res.errors[0].error, /consent/);

  const lena = (await mcp.call("list_testimonials", { q: "within the hour" })).items[0];
  assert.equal(lena.status, "pending");
  assert.equal(lena.form, "shopify-migration");
  // Approving needs the user's explicit OK.
  await assert.rejects(mcp.call("update_testimonial", { id: lena.id, status: "approved" }), /consent/);
  assert.equal((await mcp.call("update_testimonial", { id: lena.id, status: "approved", confirm_permission: true })).status, "approved");
});

test("testimonial-repurpose: export proof by topic, never leak emails", async () => {
  const md = await mcp.call("export_testimonials", { tag: "checkout" });
  assert.equal(md.count, 2);
  assert.match(md.markdown, /Ann Lee, Head of Ops, Lumen · ★★★★★ · featured/);
  assert.match(md.markdown, /> Checkout errors dropped from 40 a day/);
  assert.match(md.markdown, /What result can you point to\? A number helps\.\* Conversion went from 1\.9% to 2\.6%/);
  assert.match(md.markdown, /Video: http/);
  assert.ok(!md.markdown.includes("ann@lumen.io"));
  assert.equal((await mcp.call("export_testimonials", { featured: true })).count, 1);
  assert.equal((await mcp.call("export_testimonials", { min_rating: 5 })).count, 3);
  const json = await mcp.call("export_testimonials", { format: "json", q: "agency" });
  assert.equal(json.items[0].source_url, "https://g2.example/r/1");
  const csv = await mcp.call("export_testimonials", { format: "csv" });
  assert.equal(csv.csv.split("\n").length, 5, "header + 4 approved");
  assert.ok(!csv.csv.includes("@lumen.io"));
});

test("testimonial-repurpose: wall by tag and form slug; updates merge the filter", async () => {
  const { wall } = await mcp.call("create_wall", { title: "Checkout wins", layout: "carousel", filter: { tags: ["checkout"], form_ids: ["shopify-migration"] } });
  assert.equal(wall.count, 2, "form slug resolves to the form");
  assert.match(wall.embed, /<script src="http:\/\/127\.0\.0\.1:\d+\/embed\.js" async><\/script>/);

  const updated = (await mcp.call("update_wall", { id: wall.slug, filter: { featured_only: true } })).wall;
  assert.deepEqual(updated.filter.tags, ["checkout"], "tags kept when only featured_only changes");
  assert.equal(updated.count, 1);

  const pub = await fetch(`${base}/api/public/walls/${wall.slug}`).then((r) => r.json());
  assert.equal(pub.wall.layout, "carousel");
  assert.deepEqual(pub.items.map((t) => t.name), ["Ann Lee"]);
  assert.equal(pub.items[0].email, undefined);
  assert.equal((await mcp.call("list_walls")).items[0].count, 1);
});

test("vouchwall: setup errors tell the user what to fix", async () => {
  const wrong = startMcp({ VOUCHWALL_URL: base, VOUCHWALL_TOKEN: "wrong" });
  const down = startMcp({ VOUCHWALL_URL: "http://127.0.0.1:9", VOUCHWALL_TOKEN: TOKEN });
  try {
    await assert.rejects(wrong.call("vouchwall_stats"), /rejected VOUCHWALL_TOKEN.*admin-token/);
    await assert.rejects(down.call("vouchwall_stats"), /Can't reach Vouchwall.*Is the server running/);
  } finally {
    wrong.proc.kill();
    down.proc.kill();
  }
});
