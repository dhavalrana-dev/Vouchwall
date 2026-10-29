// Live skill check: runs real prompts through Claude Code (headless) with this plugin loaded, each
// against a fresh seeded Vouchwall instance, and grades which skill fired, which tools ran, and what
// changed. Uses your Claude account, so it is not part of `npm test`.
//   node test/live/scenarios.mjs [--claude <path to claude>] [scenarioName...]
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const ci = argv.indexOf("--claude");
const claude = ci >= 0 ? argv.splice(ci, 2)[1] : "claude";
const only = argv;
const repo = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const outFile = join(tmpdir(), "vouchwall-live-report.json");
const { createApp } = await import(pathToFileURL(join(repo, "server", "index.mjs")).href);
const TOKEN = "scenario-token";
const MCP = "mcp__plugin_vouchwall_vouchwall__";

async function seed(base) {
  const admin = (m, p, b) =>
    fetch(`${base}/api/admin/${p}`, { method: m, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: b && JSON.stringify(b) }).then((r) => r.json());
  await admin("POST", "forms", { name: "Shopify Migration", questions: ["What were you using before?", "What result can you point to?"] });
  const sub = (b) => fetch(`${base}/api/public/forms/shopify-migration/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consent: true, ...b }) });
  await sub({ name: "Ann Lee", email: "ann@lumen.io", title: "Head of Ops", company: "Lumen", rating: 5, text: "Checkout errors dropped from 40 a day to almost zero. The migration took one weekend and nobody on our team had to touch the code.", answers: { 0: "WooCommerce with six plugins", 1: "Conversion went from 1.9% to 2.6%" } });
  await sub({ name: "Marco Rossi", title: "Founder", company: "Pasta Club", rating: 5, text: "Two weeks after the switch we found the checkout step that was losing 18% of carts. Paid for itself in a month." });
  await sub({ name: "Priya N", title: "PM", company: "Fieldwork", rating: 4, text: "Solid work and honest about timelines. Support answered every question within the hour, though the kickoff call ran long." });
  await sub({ name: "zz", rating: 1, text: "buy cheap followers at spam dot com" });
  const { items } = await admin("GET", "testimonials?status=pending");
  // Two older approved ones, tagged, for repurposing.
  await admin("POST", "testimonials", { name: "Dana K", title: "CEO", company: "Brightside", text: "We were quoted 3 months elsewhere. They shipped in 3 weeks and our revenue per visitor is up 22%.", rating: 5, tags: ["roi"], consent: true, status: "approved", source: "email" });
  await admin("POST", "testimonials", { name: "Leo W", title: "Ops lead", company: "Kettle & Co", text: "The cheapest part of our replatform, and the part that saved us the most money.", rating: 5, tags: ["roi"], consent: true, status: "approved", source: "g2" });
  return items;
}

const SCENARIOS = [
  {
    name: "inbox-review",
    prompt: "What testimonials are waiting for me to review? Recommend what to do with each.",
    expectSkill: /testimonial-curation|vouchwall/,
    expect: (r) => [
      ["called list_testimonials", r.tools.includes("list_testimonials")],
      ["did not approve or reject anything (only recommends)", r.after.filter((t) => t.status !== "pending" && /form/.test(t.source)).length === 0],
      ["flags the spam one", /zz|spam/i.test(r.result)],
    ],
  },
  {
    name: "approve-explicit",
    prompt: "Approve Ann Lee's and Marco Rossi's testimonials, tag them 'checkout', and give each a short highlight. Reject the spam one. Go ahead without asking me.",
    expectSkill: /testimonial-curation|vouchwall/,
    expect: (r) => {
      const by = (n) => r.after.find((t) => t.name === n);
      const verbatim = (t) => t?.highlight && (t.text + " " + Object.values(t.answers || {}).join(" ")).toLowerCase().replace(/\s+/g, " ").includes(t.highlight.toLowerCase().replace(/[…"]/g, "").split(/\.\.\.|…/)[0].trim().replace(/\s+/g, " "));
      return [
        ["Ann approved + tagged", by("Ann Lee")?.status === "approved" && by("Ann Lee")?.tags.includes("checkout")],
        ["Marco approved + tagged", by("Marco Rossi")?.status === "approved" && by("Marco Rossi")?.tags.includes("checkout")],
        ["spam rejected", by("zz")?.status === "rejected"],
        ["Priya untouched", by("Priya N")?.status === "pending"],
        ["Ann highlight verbatim", verbatim(by("Ann Lee"))],
        ["Marco highlight verbatim", verbatim(by("Marco Rossi"))],
      ];
    },
  },
  {
    name: "import-no-permission",
    prompt: "A client emailed me this: \"Thanks again, the new store is flying! - Tom Baker, Baker Bikes\". Add it to Vouchwall and put it on my wall.",
    expectSkill: /testimonial-curation|vouchwall/,
    expect: (r) => {
      const tom = r.after.find((t) => /tom/i.test(t.name));
      return [
        ["did not publish without permission", !tom || tom.status === "pending"],
        ["text kept verbatim if imported", !tom || tom.text.includes("Thanks again, the new store is flying!")],
        ["asks about permission/consent", /permission|consent|(can|ok to|okay to) (share|publish|quote|use)|agree/i.test(r.result)],
      ];
    },
  },
  {
    name: "repurpose-pricing",
    prompt: "Write a social proof section for my pricing page using my testimonials tagged roi. Just give me the copy.",
    expectSkill: /testimonial-repurpose|vouchwall/,
    expect: (r) => [
      ["exported or listed testimonials", r.tools.some((t) => /export_testimonials|list_testimonials/.test(t))],
      ["quotes Dana verbatim (or trimmed)", r.result.includes("They shipped in 3 weeks") || r.result.includes("revenue per visitor is up 22%")],
      ["quotes Leo verbatim", r.result.includes("the part that saved us the most money")],
      ["no invented numbers beyond source", !/\b(50|99|10x|300)%/.test(r.result)],
      ["no data changed", r.changed === false],
    ],
  },
  {
    name: "request-setup",
    prompt: "I want more video testimonials for my new SEO audit service. Set up the collection form and write the email I'll send to clients.",
    expectSkill: /testimonial-request|vouchwall/,
    expect: (r) => {
      const forms = r.forms.map((f) => f.slug);
      return [
        ["created a new form", forms.length === 2],
        ["form collects video", r.forms.some((f) => f.slug !== "shopify-migration" && f.collect_video)],
        ["email includes the form link", /\/c\/[a-z0-9-]+/.test(r.result)],
        ["no incentive offered by default", !/(discount|gift card|% off|free month)/i.test(r.result) || /disclos|honest/i.test(r.result)],
      ];
    },
  },
  {
    name: "bad-token",
    token: "wrong-token",
    skillOptional: true,
    prompt: "Show me my testimonial stats.",
    expectSkill: /vouchwall/,
    expect: (r) => [["explains the token problem", /token/i.test(r.result) && /admin-token|VOUCHWALL_TOKEN/.test(r.result)]],
  },
];

function runClaude(prompt, env, cwd) {
  return new Promise((resolve) => {
    const args = [
      "-p", prompt,
      "--plugin-dir", repo,
      "--output-format", "stream-json", "--verbose",
      "--no-session-persistence",
      "--max-turns", "25",
      "--allowedTools", "mcp__plugin_vouchwall_vouchwall", `${MCP}*`, "Skill",
    ];
    const proc = spawn(claude, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => proc.kill(), 6 * 60 * 1000);
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
  });
}

const report = [];
for (const s of SCENARIOS.filter((s) => !only.length || only.includes(s.name))) {
  const dir = mkdtempSync(join(tmpdir(), "vw-scn-"));
  const work = mkdtempSync(join(tmpdir(), "vw-cwd-"));
  const app = createApp({ dataDir: dir, adminToken: TOKEN });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  await seed(base);
  const before = JSON.stringify(app.store.db.testimonials.map(({ updated_at, ...t }) => t));
  const t0 = Date.now();
  const { code, out, err } = await runClaude(s.prompt, { VOUCHWALL_URL: base, VOUCHWALL_TOKEN: s.token || TOKEN }, work);

  const skills = [], tools = [], denied = [];
  let result = "", cost = null;
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    if (m.type === "assistant") {
      for (const c of m.message?.content || []) {
        if (c.type !== "tool_use") continue;
        if (c.name === "Skill") skills.push(c.input?.skill || c.input?.command || JSON.stringify(c.input));
        else tools.push(c.name.replace(MCP, ""));
      }
    }
    if (m.type === "result") {
      result = m.result || "";
      cost = m.total_cost_usd ?? null;
      for (const d of m.permission_denials || []) denied.push(d.tool_name);
    }
  }
  const db = JSON.parse(readFileSync(join(dir, "vouchwall.json"), "utf8"));
  const after = db.testimonials;
  const r = { tools, result, after, forms: db.forms, changed: JSON.stringify(after.map(({ updated_at, ...t }) => t)) !== before };
  const checks = [[s.skillOptional ? "skill fired (optional)" : "skill fired", s.skillOptional || skills.some((k) => s.expectSkill.test(k))], ...s.expect(r)];
  report.push({ name: s.name, prompt: s.prompt, exit: code, seconds: Math.round((Date.now() - t0) / 1000), cost, skills, tools, denied, checks, result, stderr: err.slice(-800) });
  console.log(`\n### ${s.name}  (${Math.round((Date.now() - t0) / 1000)}s, exit ${code})`);
  console.log(`skills: ${skills.join(", ") || "none"}`);
  console.log(`tools:  ${tools.join(", ") || "none"}${denied.length ? `   DENIED: ${denied.join(", ")}` : ""}`);
  for (const [label, ok] of checks) console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  app.server.close();
  rmSync(dir, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
  writeFileSync(outFile, JSON.stringify(report, null, 2));
}
const failed = report.flatMap((s) => s.checks.filter(([, ok]) => !ok).map(([l]) => `${s.name}: ${l}`));
console.log(`
Full transcripts: ${outFile}
${failed.length ? `${failed.length} check(s) failed` : "All checks passed"}`);
process.exitCode = failed.length ? 1 : 0;
