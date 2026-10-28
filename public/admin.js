// Admin dashboard: review inbox, approve/tag/feature, manage forms and walls.
(() => {
  const app = document.getElementById("app");
  const state = { tab: "inbox", filters: { status: "pending", q: "", tag: "" } };

  const h = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, "");
      else if (v !== false && v !== null && v !== undefined) n.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) n.append(c);
    return n;
  };

  async function api(method, path, body) {
    const res = await fetch(`/api/admin/${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== "login") {
      renderLogin();
      throw new Error("Signed out");
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  // ---------- login ----------
  function renderLogin(msg) {
    const input = h("input", { type: "password", name: "token", autocomplete: "current-password", required: true });
    const err = h("p", { class: "error", hidden: !msg }, msg || "");
    app.replaceChildren(
      h("form", {
        class: "card login",
        onsubmit: async (e) => {
          e.preventDefault();
          try {
            await api("POST", "login", { token: input.value.trim() });
            render();
          } catch (ex) {
            err.textContent = ex.message;
            err.hidden = false;
          }
        },
      },
        h("h1", {}, "Vouchwall"),
        h("p", { class: "muted" }, "Paste the admin token printed when the server first started (also in data/admin-token)."),
        h("label", {}, "Admin token", input),
        err,
        h("button", { class: "btn primary", type: "submit" }, "Sign in"),
      ),
    );
    input.focus();
  }

  // ---------- shell ----------
  async function render() {
    let stats;
    try {
      stats = await api("GET", "stats");
    } catch {
      return;
    }
    const tabs = [
      ["inbox", `Testimonials`],
      ["forms", "Collection forms"],
      ["walls", "Walls & embeds"],
      ["import", "Import"],
    ];
    const content = h("div");
    app.replaceChildren(
      h("div", { class: "topbar" },
        h("span", { class: "logo" }, "Vouchwall"),
        h("button", { class: "btn ghost small", onclick: async () => { await api("POST", "logout"); renderLogin(); } }, "Sign out"),
      ),
      h("div", { class: "stats" },
        stat("Pending", stats.pending), stat("Approved", stats.approved), stat("Video", stats.video),
        stat("Avg rating", stats.average_rating ?? "–"), stat("Last 30 days", stats.last_30_days),
      ),
      h("nav", { class: "tabs" }, tabs.map(([id, label]) =>
        h("button", { class: `tab${state.tab === id ? " active" : ""}`, onclick: () => { state.tab = id; render(); } }, label))),
      content,
    );
    const views = { inbox: renderInbox, forms: renderForms, walls: renderWalls, import: renderImport };
    views[state.tab](content).catch((e) => content.replaceChildren(h("p", { class: "error" }, e.message)));
  }

  const stat = (label, value) => h("div", { class: "stat" }, h("b", {}, String(value)), h("span", { class: "muted small" }, label));

  // ---------- testimonials ----------
  async function renderInbox(root) {
    const f = state.filters;
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
    const { items } = await api("GET", `testimonials?${qs}`);
    const status = h("select", { onchange: (e) => { f.status = e.target.value; render(); } },
      ["pending", "approved", "rejected", "all"].map((s) => h("option", { value: s, selected: f.status === s }, s)));
    const search = h("input", { placeholder: "Search…", value: f.q, onchange: (e) => { f.q = e.target.value; render(); } });
    const tag = h("input", { placeholder: "Tag", value: f.tag, onchange: (e) => { f.tag = e.target.value; render(); } });
    root.replaceChildren(
      h("div", { class: "filters" }, status, search, tag),
      items.length ? h("div", { class: "list" }, items.map(itemView)) : h("div", { class: "empty" }, f.status === "pending" ? "Inbox zero. Share a collection form to get more testimonials." : "Nothing here."),
    );
  }

  function itemView(t) {
    const tags = h("input", { value: t.tags.join(", "), placeholder: "tags, comma separated" });
    const highlight = h("input", { value: t.highlight || "", placeholder: "Highlight (short pull quote shown in bold)" });
    const transcript = t.type === "video" ? h("textarea", { rows: 3, placeholder: "Transcript (paste or let Claude write it)" }, t.transcript || "") : null;
    const save = async (patch) => {
      try {
        await api("PATCH", `testimonials/${t.id}`, patch);
        render();
      } catch (e) {
        if (/consent/.test(e.message) && confirm(`${e.message}\n\nDo you have permission to publish it?`)) {
          await api("PATCH", `testimonials/${t.id}`, { ...patch, confirm_permission: true });
          render();
        } else alert(e.message);
      }
    };
    const meta = [t.title, t.company].filter(Boolean).join(", ");
    return h("article", { class: "item" },
      h("header", {},
        h("div", { class: "who" },
          t.avatar_url ? h("img", { src: t.avatar_url, alt: "" }) : null,
          h("div", {}, h("b", {}, t.name), meta ? h("div", { class: "muted small" }, meta) : null,
            t.email ? h("div", { class: "muted small" }, t.email) : null)),
        h("div", { class: "row" },
          t.rating ? h("span", { title: `${t.rating}/5` }, "★".repeat(t.rating)) : null,
          h("span", { class: `pill ${t.status}` }, t.status),
          t.featured ? h("span", { class: "pill" }, "★ featured") : null,
          h("span", { class: "muted small" }, `${t.source}${t.form ? ` · ${t.form}` : ""} · ${t.created_at.slice(0, 10)}`)),
      ),
      t.video_url ? h("video", { src: t.video_url, controls: true, preload: "metadata" }) : null,
      t.text ? h("blockquote", {}, t.text) : null,
      Object.keys(t.answers || {}).length ? h("dl", {}, Object.entries(t.answers).map(([q, a]) => [h("dt", { class: "muted small" }, q), h("dd", {}, a)])) : null,
      t.source_url ? h("a", { href: t.source_url, target: "_blank", rel: "noopener", class: "small" }, "Original source") : null,
      h("div", { class: "grid2" }, h("label", {}, "Highlight", highlight), h("label", {}, "Tags", tags)),
      transcript ? h("label", {}, "Transcript", transcript) : null,
      h("div", { class: "row" },
        t.status !== "approved" ? h("button", { class: "btn primary small", onclick: () => save({ status: "approved", highlight: highlight.value, tags: tags.value }) }, "Approve") : null,
        t.status !== "rejected" ? h("button", { class: "btn small", onclick: () => save({ status: "rejected" }) }, "Reject") : null,
        h("button", { class: "btn small", onclick: () => save({ highlight: highlight.value || null, tags: tags.value, ...(transcript ? { transcript: transcript.value || null } : {}) }) }, "Save"),
        h("button", { class: "btn small", onclick: () => save({ featured: !t.featured }) }, t.featured ? "Unfeature" : "Feature"),
        h("button", { class: "btn small danger", onclick: async () => { if (confirm("Delete this testimonial and its files permanently?")) { await api("DELETE", `testimonials/${t.id}`); render(); } } }, "Delete"),
      ),
    );
  }

  // ---------- forms ----------
  async function renderForms(root) {
    const { items } = await api("GET", "forms");
    const name = h("input", { placeholder: "Product, service or client name", required: true });
    const questions = h("textarea", { rows: 3, placeholder: "Optional extra questions, one per line\ne.g. What were you using before?" });
    root.replaceChildren(
      h("form", { class: "card", onsubmit: async (e) => {
        e.preventDefault();
        await api("POST", "forms", { name: name.value, questions: questions.value.split("\n").map((s) => s.trim()).filter(Boolean) });
        render();
      } },
        h("h2", {}, "New collection form"),
        h("label", {}, "Name", name),
        h("label", {}, "Extra questions", questions),
        h("button", { class: "btn primary", type: "submit" }, "Create form"),
      ),
      h("div", { class: "list", style: "margin-top:1rem" }, items.map((f) =>
        h("article", { class: "item" },
          h("header", {}, h("b", {}, f.name), h("a", { href: f.url, target: "_blank", rel: "noopener" }, "Open form ↗")),
          h("div", { class: "copy" }, f.url),
          h("div", { class: "row" }, h("button", { class: "btn small", onclick: () => navigator.clipboard.writeText(f.url) }, "Copy link"),
            h("span", { class: "muted small" }, `${f.collect_video ? "Video + text" : "Text only"} · ${f.questions.length} extra question(s)`)),
        ))),
    );
  }

  // ---------- walls ----------
  async function renderWalls(root) {
    const { items } = await api("GET", "walls");
    const title = h("input", { placeholder: "Wall of Love", required: true });
    const tags = h("input", { placeholder: "Only these tags (optional)" });
    const layout = h("select", {}, ["grid", "carousel", "list"].map((l) => h("option", { value: l }, l)));
    const featured = h("input", { type: "checkbox" });
    root.replaceChildren(
      h("form", { class: "card", onsubmit: async (e) => {
        e.preventDefault();
        await api("POST", "walls", { title: title.value, layout: layout.value, filter: { tags: tags.value, featured_only: featured.checked } });
        render();
      } },
        h("h2", {}, "New wall"),
        h("div", { class: "grid2" }, h("label", {}, "Title", title), h("label", {}, "Layout", layout)),
        h("label", {}, "Tags", tags),
        h("label", { class: "check" }, featured, "Featured testimonials only"),
        h("button", { class: "btn primary", type: "submit" }, "Create wall"),
      ),
      h("div", { class: "list", style: "margin-top:1rem" }, items.map((w) =>
        h("article", { class: "item" },
          h("header", {}, h("b", {}, `${w.title} · ${w.count} shown`), h("a", { href: w.url, target: "_blank", rel: "noopener" }, "Open wall ↗")),
          h("span", { class: "muted small" }, "Embed on any site:"),
          h("div", { class: "copy" }, w.embed),
          h("div", { class: "row" }, h("button", { class: "btn small", onclick: () => navigator.clipboard.writeText(w.embed) }, "Copy embed code")),
        ))),
    );
  }

  // ---------- import ----------
  async function renderImport(root) {
    const fields = Object.fromEntries(["name", "title", "company", "source", "source_url"].map((k) => [k, h("input", { name: k })]));
    const text = h("textarea", { rows: 4, required: true });
    const rating = h("select", {}, ["", 5, 4, 3, 2, 1].map((r) => h("option", { value: r }, r ? `${r} ★` : "No rating")));
    const consent = h("input", { type: "checkbox" });
    const msg = h("p", { class: "muted" });
    root.replaceChildren(h("form", { class: "card", onsubmit: async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(Object.entries(fields).map(([k, el]) => [k, el.value || undefined]));
      await api("POST", "testimonials", { ...body, text: text.value, rating: rating.value || undefined, consent: consent.checked, status: consent.checked ? "approved" : "pending" });
      e.target.reset();
      msg.textContent = "Imported.";
    } },
      h("h2", {}, "Import a testimonial"),
      h("p", { class: "muted small" }, "From an email, a review site, a tweet or a DM. Tip: Claude can bulk-import with the MCP server."),
      h("div", { class: "grid2" },
        h("label", {}, "Name *", fields.name), h("label", {}, "Role / title", fields.title),
        h("label", {}, "Company", fields.company), h("label", {}, "Rating", rating),
        h("label", {}, "Source (e.g. g2, email, linkedin)", fields.source), h("label", {}, "Source URL", fields.source_url)),
      h("label", {}, "Testimonial *", text),
      h("label", { class: "check" }, consent, "I have the author's permission to publish this (approves it immediately)"),
      h("button", { class: "btn primary", type: "submit" }, "Import"),
      msg,
    ));
    fields.name.required = true;
  }

  render();
})();
