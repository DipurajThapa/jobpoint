"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AUDIENCES, OPPORTUNITY_STATES, PRIORITIES, RELIABILITY, SOURCE_CATEGORIES } from "@/lib/intelligence";

type Source = { id:string;name:string;url:string;category:string;coverage:string;feedUrl:string|null;reliability:string;reviewNotes:string;lastCheckedAt:string|null;updatedAt:string };
type Opportunity = { id:string;title:string;summary:string;audience:string;category:string;priority:string;status:string;primaryUrl:string;corroborationUrl:string;evidenceNotes:string;sourceId:string|null;blogSlug:string|null;updatedAt:string;reviewedBy:string|null };
type Article = { slug:string;title:string;publishedAt:string|null;updatedAt:string;published:number };
type Engagement = { slug:string;event:string;count:number };
type Data = { sources:Source[];opportunities:Opportunity[];articles:Article[];engagement:Engagement[];metricWindow:string };

const empty:Data = { sources:[],opportunities:[],articles:[],engagement:[],metricWindow:"Last 30 calendar days" };
const sourceBlank = { id:"",name:"",url:"",category:"Government",coverage:"India",feedUrl:"",reliability:"unreviewed",reviewNotes:"" };
const opportunityBlank = { id:"",title:"",summary:"",audience:"Both",category:"Employment news",priority:"medium",status:"idea",primaryUrl:"",corroborationUrl:"",evidenceNotes:"",sourceId:"",blogSlug:"" };
const stateLabel:Record<string,string> = { idea:"Idea",researching:"Researching",verified:"Evidence checked",drafting:"Drafting",review:"Editorial review",approved:"Approved for CMS",rejected:"Rejected" };
const displayDate = (value:string|null) => value ? new Date(value).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}) : "Not recorded";

export default function IntelligenceDashboard() {
  const [data,setData] = useState<Data>(empty);
  const [source,setSource] = useState(sourceBlank);
  const [opportunity,setOpportunity] = useState(opportunityBlank);
  const [packet,setPacket] = useState("");
  const [filter,setFilter] = useState("active");
  const [tab,setTab] = useState<"opportunities"|"sources"|"engagement">("opportunities");
  const [busy,setBusy] = useState(false),[loading,setLoading] = useState(true),[message,setMessage] = useState(""),[error,setError] = useState(false);
  const refresh = useCallback(async () => {
    const res = await fetch("/api/platform/intelligence",{credentials:"same-origin",cache:"no-store"});
    const json = await res.json() as Data & { error?:string };
    if (!res.ok) throw new Error(json.error || "Could not load the intelligence dashboard.");
    setData(json);
  },[]);
  useEffect(()=>{let active=true;fetch("/api/platform/intelligence",{credentials:"same-origin",cache:"no-store"}).then(async r=>{const json=await r.json() as Data & {error?:string};if(!r.ok)throw new Error(json.error||"Could not load intelligence.");if(active)setData(json);}).catch(e=>{if(active){setError(true);setMessage(e.message);}}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);

  async function save(kind:"source"|"opportunity",event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setMessage("");
    try {
      const form = kind === "source" ? source : opportunity;
      const res = await fetch("/api/platform/intelligence",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({...form,action:`${kind}.${form.id?"update":"create"}`})});
      const json = await res.json() as {error?:string};
      if(!res.ok)throw new Error(json.error||"Save failed.");
      await refresh();setError(false);setMessage(kind === "source" ? "Source recorded. Reliability remains a manual editorial judgement." : "Opportunity saved. No article was published.");
      if(kind === "source")setSource(sourceBlank);else setOpportunity(opportunityBlank);
    } catch(e){setError(true);setMessage(e instanceof Error?e.message:"Save failed.");}
    finally{setBusy(false);}
  }
  async function importPacket(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setMessage("");
    let imported=0, skipped=0;
    try {
      if(packet.length>25000)throw new Error("The packet is too large (25 KB maximum).");
      const parsed=JSON.parse(packet) as {sources?:unknown;opportunities?:unknown};
      if(!parsed || typeof parsed!=="object" || !Array.isArray(parsed.sources)&&!Array.isArray(parsed.opportunities))throw new Error("Use a JSON object with sources and/or opportunities arrays.");
      const sources=(Array.isArray(parsed.sources)?parsed.sources:[]).slice(0,10) as Record<string,unknown>[];
      const opportunities=(Array.isArray(parsed.opportunities)?parsed.opportunities:[]).slice(0,10) as Record<string,unknown>[];
      if(!sources.length&&!opportunities.length)throw new Error("The packet contains no records.");
      const knownUrls=new Set(data.sources.map(s=>s.url));
      const knownTitles=new Set(data.opportunities.map(o=>o.title.toLowerCase()));
      for(const candidate of sources){
        if(!candidate || typeof candidate!=="object" || typeof candidate.url!=="string" || knownUrls.has(new URL(candidate.url).href)){skipped++;continue;}
        const payload={action:"source.create",name:candidate.name,url:candidate.url,category:candidate.category,coverage:candidate.coverage,feedUrl:candidate.feedUrl,reliability:"unreviewed",reviewNotes:"Research packet import; staff review is still required."};
        const response=await fetch("/api/platform/intelligence",{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify(payload)});
        if(response.status===409){skipped++;continue;}
        if(!response.ok)throw new Error(`Source import stopped after ${imported} records: ${((await response.json()) as {error?:string}).error||"invalid source"}`);
        knownUrls.add(new URL(candidate.url).href);imported++;
      }
      for(const candidate of opportunities){
        if(!candidate || typeof candidate!=="object" || typeof candidate.title!=="string" || knownTitles.has(candidate.title.toLowerCase())){skipped++;continue;}
        const payload={...candidate,action:"opportunity.create",id:"",status:"researching",blogSlug:"",sourceId:""};
        const response=await fetch("/api/platform/intelligence",{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify(payload)});
        if(!response.ok)throw new Error(`Opportunity import stopped after ${imported} records: ${((await response.json()) as {error?:string}).error||"invalid opportunity"}`);
        knownTitles.add(candidate.title.toLowerCase());imported++;
      }
      await refresh();setPacket("");setError(false);setMessage(`${imported} records imported for research; ${skipped} duplicates skipped. No source was marked trusted and no article was approved or published.`);
    }catch(e){if(imported)await refresh();setError(true);setMessage(e instanceof Error?e.message:"Could not import this packet.");}
    finally{setBusy(false);}
  }
  const metrics = useMemo(()=>data.engagement.reduce((sum,row)=>{sum[row.event]=(sum[row.event]||0)+Number(row.count);return sum;},{} as Record<string,number>),[data.engagement]);
  const openItems = data.opportunities.filter(o=>!(["approved","rejected"].includes(o.status)));
  const reviewItems = data.opportunities.filter(o=>o.status==="review");
  const vettedSources = data.sources.filter(s=>s.reliability==="trusted");
  const linked = data.opportunities.filter(o=>o.blogSlug && data.articles.some(a=>a.slug===o.blogSlug && a.published));
  const visibleItems = data.opportunities.filter(o=>filter==="all" || (filter==="active" && o.status!=="rejected" && o.status!=="approved") || o.status===filter);
  const perArticle = data.articles.filter(a=>a.published).map(a=>({ ...a,view:data.engagement.find(e=>e.slug===a.slug&&e.event==="view")?.count||0,candidate:data.engagement.find(e=>e.slug===a.slug&&e.event==="candidate_click")?.count||0,employer:data.engagement.find(e=>e.slug===a.slug&&e.event==="employer_click")?.count||0 })).sort((a,b)=>b.view-a.view);
  const header = <header className="wp-head intel-head"><div><span className="wp-overline">JOBBOARD300 / RESEARCH OPERATIONS</span><h1>Employment Intelligence</h1><p>One place for verified leads, editorial decisions, source trust and real reader actions.</p></div><span className="intel-mode">Supervised · no auto-publishing</span></header>;
  return <div className="intel-root">{header}
    {message&&<p role="status" className={`wp-notice ${error?"bad":"good"}`}>{message}</p>}
    <section className="intel-summary" aria-label="Intelligence overview">
      <div><span>Research opportunities</span><strong>{loading?"—":openItems.length}</strong><small>Active queue</small></div>
      <div><span>Awaiting review</span><strong>{loading?"—":reviewItems.length}</strong><small>Human approval required</small></div>
      <div><span>Reviewed sources</span><strong>{loading?"—":vettedSources.length}<em> / {data.sources.length}</em></strong><small>Trusted after staff review</small></div>
      <div><span>Published from queue</span><strong>{loading?"—":linked.length}</strong><small>Confirmed in the CMS</small></div>
    </section>
    <section className="intel-feature"><div><h2>Editorial control is on</h2><p>Research and article ideas can be recorded here. A staff member must check the original evidence and approve each item. Publishing remains a separate, manual action in the existing Blog CMS.</p></div><a className="wp-btn" href="/admin/blog">Open Blog CMS ↗</a></section>
    <nav className="intel-tabs" aria-label="Intelligence sections">
      <button className={tab==="opportunities"?"active":""} onClick={()=>setTab("opportunities")}>Content opportunities <span>{data.opportunities.length}</span></button>
      <button className={tab==="sources"?"active":""} onClick={()=>setTab("sources")}>Source register <span>{data.sources.length}</span></button>
      <button className={tab==="engagement"?"active":""} onClick={()=>setTab("engagement")}>Engagement <span>{metrics.view||0}</span></button>
    </nav>
    {tab==="opportunities"&&<details className="intel-import"><summary>Import supervised research packet</summary><p>Paste the JSON packet from the daily research brief. Imported sources remain unreviewed and opportunities return to research status, even if the packet labels them verified.</p><form onSubmit={e=>void importPacket(e)}><textarea aria-label="Research packet JSON" rows={6} value={packet} onChange={e=>setPacket(e.target.value)} placeholder={'{"sources":[],"opportunities":[{"title":"Research topic","primaryUrl":"https://...","corroborationUrl":"https://...","evidenceNotes":"Evidence to check"}]}'} required maxLength={25000} /><div><button className="wp-btn" disabled={busy}>Import for staff review</button></div></form></details>}
    {tab==="opportunities"&&<div className="intel-two-col">
      <section className="intel-panel"><div className="intel-panel-head"><div><h2>Research and editorial queue</h2><p>Ideas move through evidence checks, drafting and review.</p></div><select aria-label="Filter editorial items" value={filter} onChange={e=>setFilter(e.target.value)}><option value="active">Active</option><option value="all">All</option>{OPPORTUNITY_STATES.map(s=><option key={s} value={s}>{stateLabel[s]}</option>)}</select></div>
        {visibleItems.length? <div className="intel-list">{visibleItems.map(item=>{const article=data.articles.find(a=>a.slug===item.blogSlug);return <article key={item.id} className="intel-record"><div className="intel-record-top"><span className={`intel-status is-${item.status}`}>{stateLabel[item.status]||item.status}</span><span className="intel-priority">{item.priority} priority</span></div><h3>{item.title}</h3><p>{item.summary||"No research summary yet."}</p><div className="intel-meta">{item.audience} · {item.category} · Updated {displayDate(item.updatedAt)}</div><div className="intel-link-row">{item.primaryUrl&&<a href={item.primaryUrl} target="_blank" rel="noopener noreferrer">Primary source ↗</a>}{item.corroborationUrl&&<a href={item.corroborationUrl} target="_blank" rel="noopener noreferrer">Corroboration ↗</a>}{article&&<a href={article.published?`/blog/${article.slug}`:"/admin/blog"}>{article.published?"Live article ↗":"CMS draft ↗"}</a>}<button onClick={()=>{setOpportunity({...item,sourceId:item.sourceId||"",blogSlug:item.blogSlug||""});document.getElementById("intel-opportunity-form")?.scrollIntoView({behavior:"smooth",block:"center"});}}>Edit record</button></div></article>;})}</div>:<p className="intel-empty">No opportunities in this view. Add a verified research lead to begin.</p>}
      </section>
      <section id="intel-opportunity-form" className="intel-panel intel-editor"><h2>{opportunity.id?"Edit opportunity":"Add research opportunity"}</h2><p className="intel-help">These are editorial records, not claims that a vacancy exists. No action on this form publishes content.</p>
        <form onSubmit={e=>void save("opportunity",e)}>
          <label>Working headline<input required maxLength={200} value={opportunity.title} onChange={e=>setOpportunity(p=>({...p,title:e.target.value}))} placeholder="What should readers know?" /></label>
          <label>Why this matters<textarea rows={3} maxLength={1800} value={opportunity.summary} onChange={e=>setOpportunity(p=>({...p,summary:e.target.value}))} placeholder="Audience, impact and useful next step" /></label>
          <div className="intel-field-row"><label>Audience<select value={opportunity.audience} onChange={e=>setOpportunity(p=>({...p,audience:e.target.value}))}>{AUDIENCES.map(x=><option key={x}>{x}</option>)}</select></label><label>Priority<select value={opportunity.priority} onChange={e=>setOpportunity(p=>({...p,priority:e.target.value}))}>{PRIORITIES.map(x=><option key={x}>{x}</option>)}</select></label></div>
          <div className="intel-field-row"><label>Category<input maxLength={100} value={opportunity.category} onChange={e=>setOpportunity(p=>({...p,category:e.target.value}))} /></label><label>Editorial stage<select value={opportunity.status} onChange={e=>setOpportunity(p=>({...p,status:e.target.value}))}>{OPPORTUNITY_STATES.map(x=><option key={x} value={x}>{stateLabel[x]}</option>)}</select></label></div>
          <label>Primary official source<input type="url" placeholder="https://..." value={opportunity.primaryUrl} onChange={e=>setOpportunity(p=>({...p,primaryUrl:e.target.value}))} /></label>
          <label>Independent corroborating source<input type="url" placeholder="https://..." value={opportunity.corroborationUrl} onChange={e=>setOpportunity(p=>({...p,corroborationUrl:e.target.value}))} /></label>
          <label>Evidence and editorial judgement<textarea rows={4} maxLength={2400} value={opportunity.evidenceNotes} onChange={e=>setOpportunity(p=>({...p,evidenceNotes:e.target.value}))} placeholder="Dates checked, discrepancies, why sources are independent, factual limits" /></label>
          <label>Registered source<select value={opportunity.sourceId} onChange={e=>setOpportunity(p=>({...p,sourceId:e.target.value}))}><option value="">Not linked</option>{data.sources.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Existing Blog CMS slug (optional)<input value={opportunity.blogSlug} onChange={e=>setOpportunity(p=>({...p,blogSlug:e.target.value}))} placeholder="e.g. interview-preparation-guide" list="intel-article-slugs" /><datalist id="intel-article-slugs">{data.articles.map(a=><option key={a.slug} value={a.slug}>{a.title}</option>)}</datalist></label>
          <p className="intel-help">Moving past research requires two different source domains and written verification notes. This is an input gate, not an automatic fact-check.</p>
          <div className="intel-form-actions"><button className="wp-btn" disabled={busy}>{busy?"Saving…":opportunity.id?"Save changes":"Add to queue"}</button>{opportunity.id&&<button className="wp-btn quiet" type="button" onClick={()=>setOpportunity(opportunityBlank)}>Cancel edit</button>}</div>
        </form>
      </section>
    </div>}
    {tab==="sources"&&<div className="intel-two-col">
      <section className="intel-panel"><div className="intel-panel-head"><div><h2>Source reliability register</h2><p>Trust labels reflect manual reviews, never an AI-generated certainty score.</p></div></div>{data.sources.length?<div className="intel-list">{data.sources.map(s=><article className="intel-record" key={s.id}><div className="intel-record-top"><span className={`intel-status is-${s.reliability}`}>{s.reliability}</span><span>{s.category} · {s.coverage}</span></div><h3>{s.name}</h3><div className="intel-link-row"><a target="_blank" rel="noopener noreferrer" href={s.url}>Website ↗</a>{s.feedUrl&&<a target="_blank" rel="noopener noreferrer" href={s.feedUrl}>Feed ↗</a>}<button onClick={()=>{setSource({...s,feedUrl:s.feedUrl||""});document.getElementById("intel-source-form")?.scrollIntoView({behavior:"smooth",block:"center"});}}>Review / edit</button></div><p className="intel-meta">Last review: {displayDate(s.lastCheckedAt)}</p><p>{s.reviewNotes||"No reliability review recorded."}</p></article>)}</div>:<p className="intel-empty">No sources have been registered. Add the official primary sources first.</p>}</section>
      <section id="intel-source-form" className="intel-panel intel-editor"><h2>{source.id?"Review source":"Register source"}</h2><p className="intel-help">Add only real URLs. Mark a source trusted after you have checked its ownership, accuracy and suitability.</p><form onSubmit={e=>void save("source",e)}><label>Source name<input required maxLength={160} value={source.name} onChange={e=>setSource(s=>({...s,name:e.target.value}))} /></label><label>Official website<input required type="url" placeholder="https://..." value={source.url} onChange={e=>setSource(s=>({...s,url:e.target.value}))} /></label><div className="intel-field-row"><label>Source type<select value={source.category} onChange={e=>setSource(s=>({...s,category:e.target.value}))}>{SOURCE_CATEGORIES.map(x=><option key={x}>{x}</option>)}</select></label><label>Coverage<input maxLength={100} value={source.coverage} onChange={e=>setSource(s=>({...s,coverage:e.target.value}))} /></label></div><label>Verified RSS / API feed URL (optional)<input type="url" placeholder="Leave blank if not confirmed" value={source.feedUrl} onChange={e=>setSource(s=>({...s,feedUrl:e.target.value}))} /></label><label>Reliability status<select value={source.reliability} onChange={e=>setSource(s=>({...s,reliability:e.target.value}))}>{RELIABILITY.map(x=><option key={x} value={x}>{x}</option>)}</select></label><label>Review notes<textarea rows={4} maxLength={1200} value={source.reviewNotes} onChange={e=>setSource(s=>({...s,reviewNotes:e.target.value}))} placeholder="Ownership, authoritative scope, limitations and date verified" /></label><div className="intel-form-actions"><button className="wp-btn" disabled={busy}>{busy?"Saving…":source.id?"Save review":"Add source"}</button>{source.id&&<button type="button" className="wp-btn quiet" onClick={()=>setSource(sourceBlank)}>Cancel edit</button>}</div></form></section>
    </div>}
    {tab==="engagement"&&<><section className="intel-summary intel-metrics"><div><span>Article view events</span><strong>{metrics.view||0}</strong><small>Tracked, not unique readers</small></div><div><span>Candidate CTA clicks</span><strong>{metrics.candidate_click||0}</strong><small>From blog articles</small></div><div><span>Employer CTA clicks</span><strong>{metrics.employer_click||0}</strong><small>From blog articles</small></div><div><span>Published CMS articles</span><strong>{data.articles.filter(a=>a.published).length}</strong><small>Actual live status</small></div></section><section className="intel-panel"><div className="intel-panel-head"><div><h2>Blog engagement by article</h2><p>{data.metricWindow}. Events are limited to same-origin browser requests. They do not establish hiring outcomes, unique people or search rankings.</p></div></div>{perArticle.length?<div className="intel-table-wrap"><table className="intel-table"><thead><tr><th>Article</th><th>Views</th><th>Candidate clicks</th><th>Employer clicks</th><th>Published</th></tr></thead><tbody>{perArticle.map(a=><tr key={a.slug}><td><a href={`/blog/${a.slug}`} target="_blank" rel="noopener noreferrer">{a.title} ↗</a></td><td>{a.view}</td><td>{a.candidate}</td><td>{a.employer}</td><td>{displayDate(a.publishedAt)}</td></tr>)}</tbody></table></div>:<p className="intel-empty">No published articles yet. Once articles are live, first-party event counts will appear here.</p>}</section><section className="intel-panel"><h2>What these numbers mean</h2><p>We count observed article-view events and clicks on the two next-step links. We do not collect names, CVs or email addresses. The counts can be affected by browser restrictions and automated traffic, so they should guide editorial decisions rather than be presented as verified conversions or readership.</p></section></>}
  </div>;
}
