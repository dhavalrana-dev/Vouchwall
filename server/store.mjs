// JSON-file store. One process owns the file, so writes are serialized in memory
// and flushed atomically (write temp file, then rename).

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export function newId(prefix) {
  return `${prefix}_${randomBytes(6).toString("base64url")}`;
}

export function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 48) || newId("x").slice(2).toLowerCase();
}

const EMPTY = () => ({ version: 1, forms: [], testimonials: [], walls: [] });

export class Store {
  constructor(dataDir) {
    this.dir = dataDir;
    this.file = join(dataDir, "vouchwall.json");
    this.uploads = join(dataDir, "uploads");
    mkdirSync(this.uploads, { recursive: true });
    this.db = existsSync(this.file) ? { ...EMPTY(), ...JSON.parse(readFileSync(this.file, "utf8")) } : EMPTY();
  }

  save() {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    renameSync(tmp, this.file);
  }

  // ---- forms ----

  formBySlug(slug) {
    return this.db.forms.find((f) => f.slug === slug);
  }

  form(id) {
    return this.db.forms.find((f) => f.id === id || f.slug === id);
  }

  uniqueSlug(list, base) {
    let slug = slugify(base);
    for (let i = 2; list.some((x) => x.slug === slug); i++) slug = `${slugify(base)}-${i}`;
    return slug;
  }

  createForm(input) {
    const form = {
      id: newId("frm"),
      slug: this.uniqueSlug(this.db.forms, input.slug || input.name),
      name: input.name,
      heading: input.heading || `Share your experience with ${input.name}`,
      prompt: input.prompt || "What was it like working with us? What changed for you?",
      questions: Array.isArray(input.questions) ? input.questions.slice(0, 8).map(String) : [],
      collect_video: input.collect_video !== false,
      collect_rating: input.collect_rating !== false,
      thank_you: input.thank_you || "Thank you! Your testimonial means a lot.",
      brand_color: validColor(input.brand_color) || "#5b5bd6",
      created_at: new Date().toISOString(),
    };
    this.db.forms.push(form);
    this.save();
    return form;
  }

  updateForm(id, patch) {
    const form = this.form(id);
    if (!form) return null;
    for (const k of ["name", "heading", "prompt", "thank_you"]) if (typeof patch[k] === "string") form[k] = patch[k];
    for (const k of ["collect_video", "collect_rating"]) if (typeof patch[k] === "boolean") form[k] = patch[k];
    if (Array.isArray(patch.questions)) form.questions = patch.questions.slice(0, 8).map(String);
    if (patch.brand_color && validColor(patch.brand_color)) form.brand_color = patch.brand_color;
    this.save();
    return form;
  }

  // ---- testimonials ----

  testimonial(id) {
    return this.db.testimonials.find((t) => t.id === id);
  }

  addTestimonial(input) {
    const now = new Date().toISOString();
    const t = {
      id: newId("t"),
      form_id: input.form_id || null,
      status: input.status || "pending",
      type: input.video ? "video" : "text",
      name: input.name,
      email: input.email || null,
      title: input.title || null,
      company: input.company || null,
      avatar: input.avatar || null,
      rating: input.rating ? Math.max(1, Math.min(5, Math.round(Number(input.rating)))) : null,
      text: input.text || "",
      answers: input.answers || {},
      video: input.video || null,
      transcript: input.transcript || null,
      highlight: input.highlight || null,
      tags: normTags(input.tags),
      featured: Boolean(input.featured),
      consent: Boolean(input.consent),
      source: input.source || "form",
      source_url: input.source_url || null,
      created_at: input.created_at || now,
      updated_at: now,
    };
    this.db.testimonials.push(t);
    this.save();
    return t;
  }

  updateTestimonial(id, patch) {
    const t = this.testimonial(id);
    if (!t) return null;
    if (patch.status && ["pending", "approved", "rejected"].includes(patch.status)) t.status = patch.status;
    for (const k of ["highlight", "transcript", "text", "name", "title", "company"]) {
      if (typeof patch[k] === "string" || patch[k] === null) t[k] = patch[k];
    }
    if (patch.tags) t.tags = normTags(patch.tags);
    if (patch.add_tags) t.tags = normTags([...t.tags, ...[].concat(patch.add_tags)]);
    if (typeof patch.featured === "boolean") t.featured = patch.featured;
    if (patch.rating !== undefined) t.rating = patch.rating ? Math.max(1, Math.min(5, Math.round(Number(patch.rating)))) : null;
    t.updated_at = new Date().toISOString();
    this.save();
    return t;
  }

  deleteTestimonial(id) {
    const i = this.db.testimonials.findIndex((t) => t.id === id);
    if (i < 0) return null;
    const [t] = this.db.testimonials.splice(i, 1);
    this.save();
    return t;
  }

  query({ status, form, tag, q, featured, min_rating, limit } = {}) {
    const formId = form ? this.form(form)?.id ?? "__none__" : null;
    const needle = q ? String(q).toLowerCase() : null;
    return this.db.testimonials
      .filter((t) => !status || status === "all" || t.status === status)
      .filter((t) => !formId || t.form_id === formId)
      .filter((t) => !tag || t.tags.includes(String(tag).toLowerCase()))
      .filter((t) => featured === undefined || t.featured === featured)
      .filter((t) => !min_rating || (t.rating || 0) >= Number(min_rating))
      .filter((t) => !needle || [t.name, t.text, t.transcript, t.company, t.title, ...Object.values(t.answers)].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => Number(b.featured) - Number(a.featured) || b.created_at.localeCompare(a.created_at))
      .slice(0, limit ? Number(limit) : undefined);
  }

  // ---- walls ----

  wall(id) {
    return this.db.walls.find((w) => w.id === id || w.slug === id);
  }

  createWall(input) {
    const wall = {
      id: newId("wall"),
      slug: this.uniqueSlug(this.db.walls, input.slug || input.title),
      title: input.title,
      subtitle: input.subtitle || "",
      layout: ["grid", "carousel", "list"].includes(input.layout) ? input.layout : "grid",
      theme: ["light", "dark", "auto"].includes(input.theme) ? input.theme : "auto",
      filter: this.resolveForms(normFilter(input.filter)),
      created_at: new Date().toISOString(),
    };
    this.db.walls.push(wall);
    this.save();
    return wall;
  }

  updateWall(id, patch) {
    const wall = this.wall(id);
    if (!wall) return null;
    for (const k of ["title", "subtitle"]) if (typeof patch[k] === "string") wall[k] = patch[k];
    if (["grid", "carousel", "list"].includes(patch.layout)) wall.layout = patch.layout;
    if (["light", "dark", "auto"].includes(patch.theme)) wall.theme = patch.theme;
    // Merge, so changing one filter field doesn't reset the others.
    if (patch.filter) wall.filter = this.resolveForms(normFilter({ ...wall.filter, ...patch.filter }));
    this.save();
    return wall;
  }

  // Walls filter on form ids; accept slugs too, since that's what people see.
  resolveForms(filter) {
    filter.form_ids = filter.form_ids.map((ref) => this.form(ref)?.id || ref);
    return filter;
  }

  // Only approved testimonials ever reach a wall.
  wallItems(wall) {
    const f = wall.filter;
    return this.db.testimonials
      .filter((t) => t.status === "approved")
      .filter((t) => !f.form_ids.length || f.form_ids.includes(t.form_id))
      .filter((t) => !f.tags.length || f.tags.some((tag) => t.tags.includes(tag)))
      .filter((t) => !f.min_rating || (t.rating || 0) >= f.min_rating)
      .filter((t) => !f.featured_only || t.featured)
      .filter((t) => !f.type || t.type === f.type)
      .sort((a, b) => Number(b.featured) - Number(a.featured) || b.created_at.localeCompare(a.created_at))
      .slice(0, f.limit || 60);
  }

  stats() {
    const ts = this.db.testimonials;
    const rated = ts.filter((t) => t.rating);
    const byStatus = { pending: 0, approved: 0, rejected: 0 };
    for (const t of ts) byStatus[t.status]++;
    const tags = {};
    for (const t of ts) for (const tag of t.tags) tags[tag] = (tags[tag] || 0) + 1;
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    return {
      total: ts.length,
      ...byStatus,
      video: ts.filter((t) => t.type === "video").length,
      last_30_days: ts.filter((t) => t.created_at >= since).length,
      average_rating: rated.length ? Math.round((rated.reduce((s, t) => s + t.rating, 0) / rated.length) * 10) / 10 : null,
      top_tags: Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag, count]) => ({ tag, count })),
      forms: this.db.forms.length,
      walls: this.db.walls.length,
    };
  }
}

function normTags(tags) {
  const list = Array.isArray(tags) ? tags : typeof tags === "string" ? tags.split(",") : [];
  return [...new Set(list.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}

function normFilter(f = {}) {
  return {
    form_ids: Array.isArray(f.form_ids) ? f.form_ids.map(String) : [],
    tags: normTags(f.tags),
    min_rating: f.min_rating ? Number(f.min_rating) : 0,
    featured_only: Boolean(f.featured_only),
    type: ["text", "video"].includes(f.type) ? f.type : null,
    limit: f.limit ? Math.min(200, Number(f.limit)) : 60,
  };
}

function validColor(c) {
  return typeof c === "string" && /^#[0-9a-f]{3,8}$/i.test(c) ? c : null;
}
