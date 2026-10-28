#!/usr/bin/env node
// Vouchwall MCP server: lets Claude manage a running Vouchwall instance over its admin API.
// Zero dependencies: MCP (JSON-RPC 2.0, newline-delimited) over stdio.
//   VOUCHWALL_URL    base URL of your instance (default http://localhost:3080)
//   VOUCHWALL_TOKEN  admin token (printed on first server start, stored in data/admin-token)

import { createInterface } from "node:readline";

const BASE = (process.env.VOUCHWALL_URL || "http://localhost:3080").replace(/\/+$/, "");
const TOKEN = process.env.VOUCHWALL_TOKEN || "";
const DEFAULT_PROTOCOL = "2025-06-18";

async function api(method, path, body) {
  if (!TOKEN) throw new Error("VOUCHWALL_TOKEN is not set. Add the admin token to the MCP server's environment.");
  let res;
  try {
    res = await fetch(`${BASE}/api/admin/${path}`, {
      method,
      headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(`Can't reach Vouchwall at ${BASE} (${err.cause?.code || err.message}). Is the server running? Set VOUCHWALL_URL if it lives elsewhere.`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${method} ${path} failed with ${res.status}`);
  return data;
}

const qs = (obj) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

// Emails are only for the owner; keep them out of Claude's context unless asked.
const redact = (t, includeEmail) => {
  const { email, ...rest } = t;
  return includeEmail ? t : { ...rest, has_email: Boolean(email) };
};

const FILTER_PROPS = {
  status: { type: "string", enum: ["pending", "approved", "rejected", "all"], description: "Default: all" },
  form: { type: "string", description: "Form slug or id" },
  tag: { type: "string" },
  q: { type: "string", description: "Full-text search over name, text, transcript, answers, company" },
  featured: { type: "boolean" },
  min_rating: { type: "number" },
  limit: { type: "number" },
};

const tools = {
  vouchwall_stats: {
    description: "Counts of pending/approved/rejected/video testimonials, average rating, last-30-day volume and top tags.",
    inputSchema: { type: "object", properties: {} },
    run: () => api("GET", "stats"),
  },

  list_testimonials: {
    description: "List testimonials with filters. Featured first, then newest. Emails are hidden unless include_email is true.",
    inputSchema: { type: "object", properties: { ...FILTER_PROPS, include_email: { type: "boolean" } } },
    async run({ include_email, ...filters }) {
      const { items } = await api("GET", `testimonials${qs({ status: "all", ...filters })}`);
      return { count: items.length, items: items.map((t) => redact(t, include_email)) };
    },
  },

  get_testimonial: {
    description: "Get one testimonial by id, including answers, transcript and media URLs.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, include_email: { type: "boolean" } }, required: ["id"] },
    async run({ id, include_email }) {
      const { testimonial } = await api("GET", `testimonials/${encodeURIComponent(id)}`);
      return redact(testimonial, include_email);
    },
  },

  update_testimonial: {
    description:
      "Moderate or enrich a testimonial: approve/reject, set or add tags, feature it, set the highlight (short pull quote taken verbatim from the testimonial), or save a transcript for a video. Approving an imported testimonial with no recorded consent fails unless confirm_permission is true, which only the user can confirm.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["pending", "approved", "rejected"] },
        tags: { type: "array", items: { type: "string" }, description: "Replace all tags" },
        add_tags: { type: "array", items: { type: "string" }, description: "Add to existing tags" },
        featured: { type: "boolean" },
        highlight: { type: ["string", "null"], description: "Verbatim excerpt, max ~140 chars" },
        transcript: { type: ["string", "null"] },
        confirm_permission: { type: "boolean", description: "User confirmed they have permission to publish this" },
      },
      required: ["id"],
    },
    async run({ id, ...patch }) {
      const { testimonial } = await api("PATCH", `testimonials/${encodeURIComponent(id)}`, patch);
      return redact(testimonial, false);
    },
  },

  import_testimonials: {
    description:
      "Import testimonials gathered elsewhere (emails, review sites, LinkedIn recommendations, tweets, DMs). They land as pending unless consent is true and status 'approved' is given. Keep the author's words verbatim.",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              text: { type: "string" },
              title: { type: "string" },
              company: { type: "string" },
              rating: { type: "number" },
              source: { type: "string", description: "e.g. email, g2, google, linkedin, x, slack" },
              source_url: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              created_at: { type: "string", description: "ISO date the testimonial was originally given" },
              form: { type: "string", description: "Form slug to file it under" },
              consent: { type: "boolean", description: "Author agreed to public use" },
              status: { type: "string", enum: ["pending", "approved"] },
            },
            required: ["name", "text"],
          },
        },
      },
      required: ["items"],
    },
    async run({ items }) {
      const imported = [];
      const errors = [];
      for (const [i, item] of (items || []).entries()) {
        try {
          const { testimonial } = await api("POST", "testimonials", item);
          imported.push({ id: testimonial.id, name: testimonial.name, status: testimonial.status });
        } catch (err) {
          errors.push({ index: i, name: item.name, error: err.message });
        }
      }
      return { imported: imported.length, items: imported, errors };
    },
  },

  list_forms: {
    description: "List collection forms with their public share links.",
    inputSchema: { type: "object", properties: {} },
    run: () => api("GET", "forms"),
  },

  create_form: {
    description: "Create a collection form (public page where customers write or record a testimonial). Returns the share URL.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Product, service, course or client name" },
        heading: { type: "string" },
        prompt: { type: "string", description: "Instruction shown under the heading" },
        questions: { type: "array", items: { type: "string" }, description: "Up to 8 extra prompts, e.g. 'What were you using before?'" },
        collect_video: { type: "boolean" },
        collect_rating: { type: "boolean" },
        thank_you: { type: "string" },
        brand_color: { type: "string", description: "Hex color, e.g. #ff5a1f" },
      },
      required: ["name"],
    },
    run: (args) => api("POST", "forms", args),
  },

  update_form: {
    description: "Edit a collection form's copy, questions, color or video/rating options.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Form id or slug" },
        name: { type: "string" },
        heading: { type: "string" },
        prompt: { type: "string" },
        questions: { type: "array", items: { type: "string" } },
        collect_video: { type: "boolean" },
        collect_rating: { type: "boolean" },
        thank_you: { type: "string" },
        brand_color: { type: "string" },
      },
      required: ["id"],
    },
    run: ({ id, ...patch }) => api("PATCH", `forms/${encodeURIComponent(id)}`, patch),
  },

  list_walls: {
    description: "List walls (public testimonial pages) with their URL, embed snippet and how many testimonials each shows.",
    inputSchema: { type: "object", properties: {} },
    run: () => api("GET", "walls"),
  },

  create_wall: {
    description: "Create a Wall of Love: a public page plus an embed snippet for any website. Only approved testimonials ever appear.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        subtitle: { type: "string" },
        layout: { type: "string", enum: ["grid", "carousel", "list"] },
        theme: { type: "string", enum: ["auto", "light", "dark"] },
        filter: {
          type: "object",
          properties: {
            tags: { type: "array", items: { type: "string" }, description: "Show testimonials with any of these tags" },
            form_ids: { type: "array", items: { type: "string" } },
            min_rating: { type: "number" },
            featured_only: { type: "boolean" },
            type: { type: "string", enum: ["text", "video"] },
            limit: { type: "number" },
          },
        },
      },
      required: ["title"],
    },
    run: (args) => api("POST", "walls", args),
  },

  update_wall: {
    description: "Change a wall's title, layout, theme or filter.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Wall id or slug" },
        title: { type: "string" },
        subtitle: { type: "string" },
        layout: { type: "string", enum: ["grid", "carousel", "list"] },
        theme: { type: "string", enum: ["auto", "light", "dark"] },
        filter: { type: "object" },
      },
      required: ["id"],
    },
    run: ({ id, ...patch }) => api("PATCH", `walls/${encodeURIComponent(id)}`, patch),
  },

  export_testimonials: {
    description:
      "Export approved testimonials (or any filter) as markdown, csv or json, ready for repurposing into landing pages, posts, ads and case studies. Emails are never exported.",
    inputSchema: { type: "object", properties: { ...FILTER_PROPS, format: { type: "string", enum: ["markdown", "csv", "json"], default: "markdown" } } },
    async run({ format = "markdown", ...filters }) {
      const { items } = await api("GET", `testimonials${qs({ status: "approved", ...filters })}`);
      const rows = items.map((t) => redact(t, false));
      if (format === "json") return { count: rows.length, items: rows };
      if (format === "csv") {
        const cols = ["id", "name", "title", "company", "rating", "type", "highlight", "text", "transcript", "tags", "source", "source_url", "video_url", "created_at"];
        const cell = (v) => `"${String(Array.isArray(v) ? v.join("; ") : v ?? "").replace(/"/g, '""')}"`;
        return { count: rows.length, csv: [cols.join(","), ...rows.map((t) => cols.map((c) => cell(t[c])).join(","))].join("\n") };
      }
      const md = rows.map((t) => {
        const who = [t.name, t.title, t.company].filter(Boolean).join(", ");
        const body = (t.text || t.transcript || "").trim();
        return [
          `### ${who}${t.rating ? ` · ${"★".repeat(t.rating)}` : ""}${t.featured ? " · featured" : ""}`,
          t.highlight ? `**${t.highlight}**` : null,
          body ? body.split("\n").map((l) => `> ${l}`).join("\n") : null,
          ...Object.entries(t.answers || {}).map(([q, a]) => `- *${q}* ${a}`),
          t.video_url ? `Video: ${t.video_url}` : null,
          `<sub>${t.id} · ${t.source} · ${t.created_at.slice(0, 10)}${t.tags.length ? ` · ${t.tags.join(", ")}` : ""}</sub>`,
        ].filter(Boolean).join("\n\n");
      });
      return { count: rows.length, markdown: md.join("\n\n---\n\n") };
    },
  },
};

// ---------- MCP plumbing ----------

const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");

async function handle({ id, method, params = {} }) {
  const isRequest = id !== undefined && id !== null;
  switch (method) {
    case "initialize":
      return send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params.protocolVersion || DEFAULT_PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "vouchwall", version: "0.1.0" },
          instructions: `Manages the Vouchwall testimonial instance at ${BASE}. Never invent or reword testimonials; only quote what customers wrote.`,
        },
      });
    case "ping":
      return send({ jsonrpc: "2.0", id, result: {} });
    case "tools/list":
      return send({
        jsonrpc: "2.0",
        id,
        result: { tools: Object.entries(tools).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema })) },
      });
    case "tools/call": {
      const tool = tools[params.name];
      if (!tool) return send({ jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool: ${params.name}` } });
      try {
        const result = await tool.run(params.arguments || {});
        return send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result } });
      } catch (err) {
        return send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true } });
      }
    }
    default:
      if (method?.startsWith("notifications/")) return;
      if (isRequest) send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  for (const m of Array.isArray(msg) ? msg : [msg]) handle(m);
});
