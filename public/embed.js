// Vouchwall embed: <div data-vouchwall="wall-slug"></div><script src=".../embed.js" async></script>
// Renders approved testimonials inside a shadow root so host-page CSS can't break it.
(() => {
  const script = document.currentScript || [...document.scripts].find((s) => /\/embed\.js(\?|$)/.test(s.src));
  const base = script ? new URL(script.src).origin : location.origin;

  const CSS = `
:host { all: initial; display: block; font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.vw { --bg: transparent; --card: #fff; --text: #1b1b20; --muted: #6b6b76; --line: #e6e6ee; --star: #f5a524; color: var(--text); }
.vw.dark { --card: #1c1c22; --text: #ececf1; --muted: #9a9aa6; --line: #2e2e36; }
@media (prefers-color-scheme: dark) { .vw.auto { --card: #1c1c22; --text: #ececf1; --muted: #9a9aa6; --line: #2e2e36; } }
.head { text-align: center; margin: 0 0 1.25rem; }
.head h2 { margin: 0 0 .25rem; font-size: 1.5rem; }
.head p { margin: 0; color: var(--muted); }
.grid { columns: 3 280px; column-gap: 1rem; }
.grid .card { break-inside: avoid; margin: 0 0 1rem; }
.list { display: grid; gap: 1rem; max-width: 720px; margin: 0 auto; }
.carousel { display: grid; grid-auto-flow: column; grid-auto-columns: min(340px, 85%); gap: 1rem; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: .5rem; }
.carousel .card { scroll-snap-align: start; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 1.1rem 1.2rem; box-shadow: 0 1px 2px rgb(0 0 0 / .04); }
.card.featured { border-color: color-mix(in srgb, var(--star) 55%, var(--line)); }
.stars { color: var(--star); letter-spacing: 2px; font-size: .95rem; margin-bottom: .4rem; }
.stars .off { color: var(--line); }
.hl { font-weight: 700; margin: 0 0 .35rem; }
.text { margin: 0; white-space: pre-line; }
.qa { margin: .6rem 0 0; font-size: .92rem; }
.qa dt { color: var(--muted); font-size: .82rem; }
.qa dd { margin: 0 0 .4rem; }
video { width: 100%; border-radius: 10px; background: #000; display: block; margin-bottom: .6rem; }
.who { display: flex; align-items: center; gap: .6rem; margin-top: .9rem; }
.who img, .who .ini { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; flex: none; }
.who .ini { display: grid; place-items: center; background: var(--line); font-weight: 700; color: var(--muted); }
.who b { display: block; font-size: .95rem; }
.who span { color: var(--muted); font-size: .85rem; }
.more { display: block; margin: .3rem 0 0; padding: 0; border: 0; background: none; color: var(--muted); font: inherit; font-size: .85rem; cursor: pointer; text-decoration: underline; }
.empty { color: var(--muted); text-align: center; padding: 1.5rem; }
`;

  const el = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) n.append(c);
    return n;
  };

  function card(t) {
    const node = el("article", { class: `card${t.featured ? " featured" : ""}` });
    if (t.rating) {
      node.append(el("div", { class: "stars", "aria-label": `${t.rating} out of 5` }, "★".repeat(t.rating), el("span", { class: "off" }, "★".repeat(5 - t.rating))));
    }
    if (t.video_url) node.append(el("video", { src: t.video_url, controls: "", preload: "metadata", playsinline: "" }));
    if (t.highlight) node.append(el("p", { class: "hl" }, t.highlight));
    const body = t.text || (t.video_url ? "" : t.transcript || "");
    if (body) {
      const p = el("p", { class: "text" }, body.length > 420 ? body.slice(0, 400).trimEnd() + "…" : body);
      node.append(p);
      if (body.length > 420) {
        const btn = el("button", { class: "more", type: "button" }, "Read more");
        btn.onclick = () => {
          p.textContent = body;
          btn.remove();
        };
        node.append(btn);
      }
    }
    const qa = Object.entries(t.answers || {}).filter(([, a]) => a);
    if (qa.length) node.append(el("dl", { class: "qa" }, qa.map(([q, a]) => [el("dt", {}, q), el("dd", {}, a)])));
    const role = [t.title, t.company].filter(Boolean).join(", ");
    const initials = (t.name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    node.append(
      el("div", { class: "who" },
        t.avatar_url ? el("img", { src: t.avatar_url, alt: "", loading: "lazy" }) : el("div", { class: "ini", "aria-hidden": "true" }, initials),
        el("div", {}, el("b", {}, t.name || "Anonymous"), role ? el("span", {}, role) : null),
      ),
    );
    return node;
  }

  async function mount(host) {
    if (host.dataset.vwMounted) return;
    host.dataset.vwMounted = "1";
    const slug = host.getAttribute("data-vouchwall");
    const root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    root.append(el("style", {}, CSS));
    try {
      const res = await fetch(`${base}/api/public/walls/${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error(`Vouchwall: wall "${slug}" not found`);
      const { wall, items } = await res.json();
      const layout = host.dataset.layout || wall.layout || "grid";
      const theme = host.dataset.theme || wall.theme || "auto";
      const wrap = el("div", { class: `vw ${theme}` });
      if (host.dataset.hideHeader !== "true") {
        wrap.append(el("div", { class: "head" }, el("h2", {}, wall.title), wall.subtitle ? el("p", {}, wall.subtitle) : null));
      }
      wrap.append(items.length ? el("div", { class: layout }, items.map(card)) : el("div", { class: "empty" }, "No testimonials yet."));
      root.append(wrap);
    } catch (err) {
      console.warn(err.message);
    }
  }

  const run = () => document.querySelectorAll("[data-vouchwall]").forEach(mount);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
