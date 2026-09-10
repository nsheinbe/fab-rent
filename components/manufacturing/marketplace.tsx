"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { DialogRoot, DialogContent } from "@/components/ui/dialog";
import { QuoteWorkspace, SupplierProfile, ManufacturerOnboarding, emptyQuote, type QuoteDraft } from "./workspace";
import { Icon, type IconName } from "@/components/ui/icons";
import { categories, suppliers, filterSuppliers, type Category, type Supplier } from "@/lib/manufacturing/catalog";
import "./marketplace.css";

const categoryIcons: IconName[] = ["grid", "gear", "construction", "laptop", "tag", "box", "inventory"];

export default function ManufacturingMarketplace() {
  const [category, setCategory] = useState<Category>("All manufacturing");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("All regions");
  const [smallBatch, setSmallBatch] = useState(false);
  const [fastLead, setFastLead] = useState(false);
  const [mode, setMode] = useState("manufacturers");
  const [saved, setSaved] = useState<string[]>([]);
  const [compare, setCompare] = useState<string[]>([]);
  const [shortlistOnly, setShortlistOnly] = useState(false);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [dialog, setDialog] = useState<"quote" | "compare" | "manufacturer" | null>(null);
  const [quote, setQuote] = useState<QuoteDraft>(emptyQuote);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    try { const v: unknown = JSON.parse(localStorage.getItem("fab-manufacturing-shortlist") || "[]"); if (Array.isArray(v)) queueMicrotask(() => setSaved(v.filter((id): id is string => typeof id === "string" && suppliers.some(s => s.id === id)))); } catch { /* storage is optional */ }
  }, []);
  const toggleSave = (id: string) => {
    const next = saved.includes(id) ? saved.filter(x => x !== id) : [...saved, id];
    setSaved(next);
    try { localStorage.setItem("fab-manufacturing-shortlist", JSON.stringify(next)); } catch { setNotice("Saved for this tab. Browser storage is unavailable."); }
  };
  const toggleCompare = (id: string) => {
    if (compare.includes(id)) setCompare(compare.filter(x => x !== id));
    else if (compare.length < 3) setCompare([...compare, id]);
    else setNotice("Compare up to 3 manufacturers. Remove one to add another.");
  };
  const startQuote = (targets?: Supplier[]) => {
    const names = (targets ?? suppliers.filter(s => saved.includes(s.id))).map(s => s.name);
    setQuote(d => ({ ...d, suppliers: names, process: targets?.length === 1 ? targets[0]!.category : d.process }));
    setSelected(null); setDialog("quote");
  };
  useEffect(() => {
    type Context = { registerTool: (tool: { name: string; description: string; inputSchema: object; annotations: object; execute: (input: unknown) => unknown }, options: { signal: AbortSignal }) => unknown };
    const context = (document as Document & { modelContext?: Context }).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    try { void Promise.resolve(context.registerTool({ name: "search_example_manufacturers", description: "Search the fictional Fab.Rent manufacturing catalog and update visible search results. Does not contact suppliers.", inputSchema: { type: "object", properties: { query: { type: "string", maxLength: 200 } }, required: ["query"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input: unknown) {
      if (!input || typeof input !== "object" || !("query" in input) || typeof input.query !== "string" || input.query.length > 200 || Object.keys(input).some(k => k !== "query")) throw new Error("Provide a query string of at most 200 characters.");
      const q = input.query;
      flushSync(() => { setQuery(q); setSearch(q); setCategory("All manufacturing"); setRegion("All regions"); setSmallBatch(false); setFastLead(false); setShortlistOnly(false); });
      return { exampleSuppliers: filterSuppliers({ query: q }).map(s => ({ id: s.id, name: s.name, category: s.category, location: s.location })), liveConnections: false };
    } }, { signal: controller.signal })).catch(() => {}); } catch { /* optional browser capability */ }
    return () => controller.abort();
  }, []);
  const results = filterSuppliers({ query: search, category, region, smallBatch, fastLead }).filter(s => !shortlistOnly || saved.includes(s.id));
  return <div className="fab-app">
    <div className="fab-announcement"><span><span className="fab-dot" /> A new home for American manufacturing.</span><span>Design preview · Example suppliers</span></div>
    <header className="fab-header">
      <button className="fab-logo" onClick={() => { setCategory("All manufacturing"); setSearch(""); setQuery(""); setShortlistOnly(false); setRegion("All regions"); setSmallBatch(false); setFastLead(false); }}>fab<span>.</span>rent<span className="fab-logo-mark">↗</span></button>
      <div className="fab-wordmark-note">THE AMERICAN<br />MANUFACTURING MARKETPLACE</div>
      <nav aria-label="Main navigation"><a href="#manufacturers">Find manufacturers</a><a href="#how-it-works">How it works</a></nav>
      <button className="fab-header-supplier" onClick={() => setDialog("manufacturer")}>For manufacturers <Icon name="external" size={14} /></button>
      <button className="fab-button fab-dark" onClick={() => startQuote()}>Request a quote <span>↗</span></button>
    </header>
    <div className="fab-layout">
      <aside className="fab-sidebar">
        <p className="fab-label">EXPLORE CAPABILITIES</p>
        <nav aria-label="Manufacturing categories">{categories.map((c, i) => <button key={c} aria-pressed={category === c} className={category === c ? "active" : ""} onClick={() => { setCategory(c); setShortlistOnly(false); setSearch(""); setQuery(""); }}><Icon name={categoryIcons[i] ?? "box"} size={18} /><span>{c}</span>{category === c && <span className="fab-nav-arrow">↗</span>}</button>)}</nav>
        <div className="fab-sidebar-divider" />
        <p className="fab-label">YOUR SOURCING DESK</p>
        <button className="fab-side-action" onClick={() => { setShortlistOnly(!shortlistOnly); setSearch(""); setQuery(""); setCategory("All manufacturing"); setRegion("All regions"); setSmallBatch(false); setFastLead(false); }} aria-pressed={shortlistOnly}><Icon name="heart" />Shortlist <span>{saved.length}</span></button>
        <button className="fab-side-action" onClick={() => setDialog("quote")}><Icon name="file" />Quote workspace</button>
        <div className="fab-sidebar-note"><span className="fab-asterisk">✳</span><h3>Big ideas.<br />Built closer.</h3><p>Find the people and capabilities to bring your next product to life.</p><a href="#how-it-works">Start sourcing <span>↗</span></a></div>
        <div className="fab-sidebar-bottom">DESIGNED FOR WHAT’S NEXT.<br /><span>Built around American makers.</span></div>
      </aside>
      <main id="main" className="fab-main">
        <div className="fab-breadcrumb">Marketplace <span>/</span> American manufacturing</div>
        <section className="fab-intro" aria-labelledby="fab-title">
          <div className="fab-intro-content"><div className="fab-eyebrow"><span />FROM FIRST PART TO FULL PRODUCTION</div><h1 id="fab-title">Find the factory<br />that can <em>make it.</em></h1><p>Custom parts. Finished products. Your next big idea.<br className="fab-desktop-break" /> Connect with manufacturers across the United States.</p><div className="fab-intro-foot"><span><Icon name="pin" size={15} /> U.S. production locations</span><span><Icon name="users" size={15} /> Discover supplier capabilities</span></div></div>
          <div className="fab-rfq-card"><div className="fab-rfq-top"><span>HAVE A PROJECT IN MIND?</span><Icon name="file" size={25} /></div><h2>Your specs.<br />The right partner.</h2><p>Start with what you need made. Put your requirements in one clear quote request.</p><button onClick={() => startQuote()}>Start a quote request <span>↗</span></button><small>From prototypes to production runs</small></div>
        </section>
        <section className="fab-search-section" aria-label="Search manufacturing">
          <div className="fab-search-tabs"><button aria-pressed={mode === "manufacturers"} className={mode === "manufacturers" ? "active" : ""} onClick={() => setMode("manufacturers")}>Manufacturers</button><button aria-pressed={mode === "products"} className={mode === "products" ? "active" : ""} onClick={() => setMode("products")}>Products & parts</button><span>One search. More possibilities.</span></div>
          <form className="fab-search" onSubmit={e => { e.preventDefault(); setSearch(query); }}><Icon name="search" size={22} /><input aria-label="What do you need made?" placeholder="What do you need made? Try “aluminum parts”" value={query} onChange={e => setQuery(e.target.value)} /><label className="fab-location"><Icon name="pin" size={17} /><select aria-label="Manufacturing region" value={region} onChange={e => setRegion(e.target.value)}>{["All regions", "Midwest", "West", "South", "Northeast"].map(r => <option key={r}>{r}</option>)}</select></label><button type="submit" className="fab-button fab-dark">{mode === "products" ? "Find products & parts" : "Find a manufacturer"} <Icon name="search" size={17} /></button></form>
          <div className="fab-popular"><span>Popular searches</span>{["CNC machining", "PCB assembly", "Cotton", "Custom boxes"].map(t => <button key={t} onClick={() => { setQuery(t); setSearch(t); setCategory("All manufacturing"); setRegion("All regions"); setSmallBatch(false); setFastLead(false); setShortlistOnly(false); }}>{t}<span>↗</span></button>)}</div>
        </section>
        <section id="manufacturers" className="fab-results" aria-labelledby="results-heading">
          <div className="fab-section-heading"><div><div className="fab-eyebrow">MADE POSSIBLE, CLOSER TO HOME</div><h2 id="results-heading">{shortlistOnly ? "Your supplier shortlist." : search ? `Results for “${search}”` : category === "All manufacturing" ? (mode === "products" ? "Explore what American factories can make." : "Meet your next manufacturing partner.") : category}</h2></div><span>{results.length} example {results.length === 1 ? "supplier" : "suppliers"}</span></div>
          <div className="fab-filterbar"><div className="fab-filter-chips"><button className="selected" onClick={() => { setSmallBatch(false); setFastLead(false); }}><Icon name="compass" size={16} /> U.S. manufacturers</button><button className={smallBatch ? "selected" : ""} aria-pressed={smallBatch} onClick={() => setSmallBatch(!smallBatch)}>Orders of 100 or fewer</button><button className={fastLead ? "selected" : ""} aria-pressed={fastLead} onClick={() => setFastLead(!fastLead)}>Lead times starting within 2 weeks</button></div><button className="fab-sample-note fab-shortlist-toggle" onClick={() => { setShortlistOnly(!shortlistOnly); setSearch(""); setQuery(""); setCategory("All manufacturing"); setRegion("All regions"); setSmallBatch(false); setFastLead(false); }}><Icon name="heart" size={13} />{shortlistOnly ? "Show all suppliers" : `Shortlist (${saved.length})`}</button></div>
          <div className="fab-grid">{results.map(s => <article key={s.id} className="fab-supplier-card"><div className={`fab-card-media fab-media-${s.image || "plain"}`}><span className="fab-category-tag">{s.category}</span><button aria-label={`Save ${s.name}`} className="fab-save" onClick={() => toggleSave(s.id)} aria-pressed={saved.includes(s.id)}><Icon name={saved.includes(s.id) ? "heart-filled" : "heart"} size={18} /></button>{s.image ? <img src={`/manufacturing/${s.image}.png`} alt={`Illustrative ${s.category.toLowerCase()} components; AI-generated sample image`} loading="lazy" /> : <div className="fab-media-type"><Icon name={categoryIcons[categories.indexOf(s.category)] ?? "box"} size={46} /><span>{s.category}</span></div>}<span className="fab-example-tag">EXAMPLE MANUFACTURER</span></div><div className="fab-card-body">{mode === "products" && <h3 className="fab-product-name">{s.capabilities[0]}</h3>}<div className="fab-company"><span className="fab-company-logo">{s.initials}</span><div><h3>{s.name}</h3><span><Icon name="pin" size={12} />{s.location}</span></div></div><h4>{mode === "products" ? `${s.capabilities.slice(1, 3).join(" · ")}. Made to your specifications.` : s.title}</h4><div className="fab-materials">{s.materials.map(m => <span key={m}>{m}</span>)}</div><dl className="fab-card-specs"><div><dt>Min. order</dt><dd>{s.minOrder} {s.minOrder === 1 ? "unit" : "units"}</dd></div><div><dt>Typical lead time</dt><dd>{s.lead}</dd></div></dl><div className="fab-card-footer"><button onClick={() => setSelected(s)}>View capabilities <span>↗</span></button><button className="fab-compare-button" onClick={() => toggleCompare(s.id)} aria-pressed={compare.includes(s.id)}><Icon name={compare.includes(s.id) ? "check" : "plus"} size={14} />{compare.includes(s.id) ? "Selected" : "Compare"}</button></div></div></article>)}</div>
          {!results.length && <div className="fab-empty"><Icon name="search" size={32} /><h3>{shortlistOnly ? "Your shortlist is ready for a first supplier" : "No matches in the example catalog"}</h3><p>{shortlistOnly ? "Save manufacturers with the heart button. Your shortlist stays in this browser." : "Try a different material, process, or region."}</p><button className="fab-button fab-dark" onClick={() => { setSearch(""); setQuery(""); setCategory("All manufacturing"); setRegion("All regions"); setSmallBatch(false); setFastLead(false); setShortlistOnly(false); }}>{shortlistOnly ? "Explore suppliers" : "Clear filters"}</button></div>}
        </section>
        <section id="how-it-works" className="fab-how"><div><p className="fab-eyebrow">A SHORTER PATH TO PRODUCTION</p><h2>From “what if”<br />to made here.</h2></div>{[["01", "Find your fit", "Search by what you need made, how it’s made, or where you want to make it."], ["02", "Get into the details", "Compare materials, order sizes, capabilities, and production locations."], ["03", "Make the connection", "Build a quote request with your specifications and target timeline."]].map(([n, h, p]) => <div key={n}><span className="fab-step">{n}</span><h3>{h}</h3><p>{p}</p></div>)}</section>
        <footer className="fab-footer"><span className="fab-footer-logo">fab.rent</span><p>America’s manufacturing marketplace.</p><span>Example suppliers · Illustrative images · No live connections</span></footer>
      </main>
    </div>
    {compare.length > 0 && <div className="fab-compare-tray"><span><strong>{compare.length}/3</strong> selected to compare</span><div>{suppliers.filter(s => compare.includes(s.id)).map(s => <button key={s.id} onClick={() => toggleCompare(s.id)} aria-label={`Remove ${s.name} from comparison`}>{s.initials}<Icon name="close" size={12} /></button>)}</div><button className="fab-button fab-dark" disabled={compare.length < 2} onClick={() => setDialog("compare")}>Compare manufacturers ↗</button><button aria-label="Clear comparison" onClick={() => setCompare([])}><Icon name="close" size={17} /></button></div>}
    {notice && <div className="fab-toast" role="status">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice("")}><Icon name="close" size={16} /></button></div>}
    <DialogRoot open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent title={selected?.name ?? "Manufacturer"} description="Explore manufacturing capabilities and project fit." size="lg" className="fab-dialog">{selected && <SupplierProfile supplier={selected} onQuote={() => startQuote([selected])} onSave={() => toggleSave(selected.id)} saved={saved.includes(selected.id)} />}</DialogContent></DialogRoot>
    <DialogRoot open={dialog === "quote"} onOpenChange={open => { if (!open) setDialog(null); }}><DialogContent title="What would you like to make?" description="Bring your next production project into focus." size="lg" className="fab-dialog"><QuoteWorkspace initial={quote} onSave={setQuote} /></DialogContent></DialogRoot>
    <DialogRoot open={dialog === "manufacturer"} onOpenChange={open => { if (!open) setDialog(null); }}><DialogContent title="Put your factory on the map." description="Help buyers understand what you make and where you make it." size="lg" className="fab-dialog"><ManufacturerOnboarding /></DialogContent></DialogRoot>
    <DialogRoot open={dialog === "compare"} onOpenChange={open => { if (!open) setDialog(null); }}><DialogContent title="Find the right production fit." description="Compare example manufacturers side by side. All specifications are illustrative." size="lg" className="fab-dialog"><div className="fab-workspace"><div className="fab-compare-scroll"><table className="fab-comparison"><thead><tr><th scope="col">Project fit</th>{suppliers.filter(s => compare.includes(s.id)).map(s => <th scope="col" key={s.id}>{s.name}</th>)}</tr></thead><tbody>{[["Location", (s: Supplier) => s.location], ["Process", (s: Supplier) => s.category], ["Materials", (s: Supplier) => s.materials.join(", ")], ["Minimum order", (s: Supplier) => `${s.minOrder} units`], ["Typical lead time", (s: Supplier) => s.lead], ["Production scale", (s: Supplier) => s.scale], ["Verification", () => "Example only · Unverified"]].map(([label, fn]) => <tr key={label as string}><th scope="row">{label as string}</th>{suppliers.filter(s => compare.includes(s.id)).map(s => <td key={s.id}>{(fn as (s: Supplier) => string)(s)}</td>)}</tr>)}</tbody></table></div><div className="fab-form-actions"><button className="fab-button fab-outline" onClick={() => setDialog(null)}>Keep browsing</button><button className="fab-button fab-dark" onClick={() => startQuote(suppliers.filter(s => compare.includes(s.id)))}>Prepare one quote request ↗</button></div></div></DialogContent></DialogRoot>
  </div>;
}
