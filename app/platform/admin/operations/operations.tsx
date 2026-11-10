"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Data = { counts:Row; teams:Row[]; memberships:Row[]; integrations:Row[]; checks:Row[]; settings:Row; features:Row[]; activity:Row[]; usage:Row[]; availableTools:Row[] };
const initial:Data = { counts:{},teams:[],memberships:[],integrations:[],checks:[],settings:{},features:[],activity:[],usage:[],availableTools:[] };

async function call(url:string, method:string, body?:Row) {
  const response = await fetch(url,{method,credentials:"same-origin",headers:body?{"content-type":"application/json"}:{},body:body?JSON.stringify(body):undefined});
  const data = await response.json().catch(()=>({})) as Row;
  if (!response.ok) throw new Error(data.error || "The operation failed.");
  return data;
}
export default function Operations() {
  const [data,setData] = useState<Data>(initial), [users,setUsers] = useState<Row[]>([]);
  const [busy,setBusy] = useState(false), [message,setMessage] = useState(""), [error,setError] = useState(false);
  const [editing,setEditing] = useState("");
  const [inventory,setInventory] = useState<{inventory:{takenAt:string;groups:{merge:string;title:string;lines:{label:string;rows:number|null}[]}[]};text:string}|null>(null);
  async function countData() {
    setBusy(true);setMessage("");
    try {setInventory(await call("/api/platform/admin/operations?view=inventory","GET") as never);setError(false);}
    catch(e){setError(true);setMessage(e instanceof Error?e.message:"The count failed.");}
    finally{setBusy(false);}
  }
  async function copyInventory() {
    if(!inventory)return;
    try {await navigator.clipboard.writeText(inventory.text);setError(false);setMessage("Copied. Paste it into your message.");}
    catch {setError(true);setMessage("Could not copy automatically. Select the text in the box and copy it.");}
  }
  const connectionForm = useRef<HTMLFormElement>(null);
  // State is set in promise callbacks, never synchronously in the effect body.
  const fetchAll = useCallback(()=>Promise.all([call("/api/platform/admin/operations","GET"),call("/api/platform/admin/users","GET")]),[]);
  const load = useCallback(async()=>{const [ops,team]=await fetchAll();setData(ops as Data);setUsers(team.users);},[fetchAll]);
  useEffect(()=>{fetchAll().then(([ops,team])=>{setData(ops as Data);setUsers(team.users);}).catch(e=>{setError(true);setMessage(e.message);});},[fetchAll]);
  async function run(body:Row, success:string) {
    setBusy(true);setMessage("");
    try {const result=await call("/api/platform/admin/operations","POST",body);await load();setError(false);setMessage(body.action==="integration.test" ? result.message : success);return true;}
    catch(e){setError(true);setMessage(e instanceof Error?e.message:"The operation failed.");return false;}
    finally{setBusy(false);}
  }
  function createTeam(e:FormEvent<HTMLFormElement>) {e.preventDefault();const form=e.currentTarget;const values=new FormData(form);void run({action:"team.create",name:values.get("name"),description:values.get("description")},"Team created.").then(ok=>{if(ok)form.reset();});}
  function saveIntegration(e:FormEvent<HTMLFormElement>) {e.preventDefault();const form=e.currentTarget;const values=new FormData(form);void run({action:"integration.save",id:editing,name:values.get("name"),kind:values.get("kind"),endpoint:values.get("endpoint"),token:values.get("token")},"Connection saved, disabled until it passes a test.").then(ok=>{if(ok){form.reset();setEditing("");}});}
  function editIntegration(item:Row) {
    const form=connectionForm.current;
    if(!form)return;
    for(const name of ["name","kind","endpoint"]){const input=form.elements.namedItem(name) as HTMLInputElement|HTMLSelectElement|null;if(input)input.value=String(item[name]);}
    const token=form.elements.namedItem("token") as HTMLInputElement|null;if(token)token.value="";
    setEditing(item.id);form.scrollIntoView({behavior:"smooth",block:"center"});
  }
  const askDelete=(label:string,work:()=>void)=>{if(window.confirm(`Delete ${label}?`))work();};
  const time=(value:string)=>value?new Date(value).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"}):"Never";
  return <>
    <nav className="wp-ops-nav" aria-label="Administration sections"><a href="#overview">Overview</a><a href="#teams">Teams</a><a href="#connections">Connections</a><a href="#settings">Settings</a><a href="#inventory">Data inventory</a><a href="#audit">Audit</a></nav>
    {message&&<p className={`wp-notice ${error?"bad":"good"}`} role="status">{message}</p>}
    <section id="overview" className="wp-card"><h2>Operational overview</h2><div className="wp-stats">
      {[["Active users",data.counts?.activeUsers],["Active sessions",data.counts?.sessions],["Conversations",data.counts?.conversations],["Events, 7 days",data.counts?.events],["Enabled connections",data.counts?.integrations]].map(([label,value])=><div key={String(label)}><strong>{value??"—"}</strong><span>{label}</span></div>)}
    </div><h3>Tool activity, 30 days</h3>{data.usage.length?<ul className="wp-activity">{data.usage.map((item,i)=><li key={i}><span>{item.action}</span><b>{item.total}</b></li>)}</ul>:<p className="hint">No tool events in this period.</p>}</section>
    <section id="teams" className="wp-card"><h2>Teams and assignments</h2><p className="hint">Teams organise users. Individual tool permissions are managed in <a href="/platform/admin">Team access</a>.</p>
      <form className="wp-form-grid" onSubmit={createTeam}><label>Team name<input name="name" required maxLength={100}/></label><label>Description<input name="description" maxLength={300}/></label><button className="wp-btn" disabled={busy}>Create team</button></form>
      {data.teams.map(team=><article className="wp-ops-row" key={team.id}><div><h3>{team.name}</h3><p className="hint">{team.description||"No description"}</p><p className="hint">Members: {data.memberships.filter(m=>m.teamId===team.id).map(m=>m.email).join(", ")||"None"}</p></div>
        <div className="wp-ops-actions"><select aria-label={`Assign user to ${team.name}`} defaultValue="" onChange={e=>{if(e.target.value){void run({action:"team.assign",id:team.id,userId:e.target.value},"Member assigned.");e.target.value="";}}} disabled={busy}><option value="">Assign a user</option>{users.filter(u=>!data.memberships.some(m=>m.teamId===team.id&&m.userId===u.id)).map(u=><option key={u.id} value={u.id}>{u.email}</option>)}</select>
          {data.memberships.filter(m=>m.teamId===team.id).map(m=><button type="button" className="wp-btn quiet small" disabled={busy} key={m.userId} onClick={()=>void run({action:"team.unassign",id:team.id,userId:m.userId},"Member removed from team.")}>Remove {m.email}</button>)}
          <button type="button" className="wp-btn danger small" disabled={busy} onClick={()=>askDelete(team.name,()=>void run({action:"team.delete",id:team.id},"Team deleted."))}>Delete team</button></div></article>)}
    </section>
    <section id="connections" className="wp-card"><h2>API and MCP connections</h2><p className="hint">Connections are configured here and remain disabled until a live check succeeds. Tokens are encrypted on the server and never returned to this page. A successful check confirms reachability, not authorisation for every operation.</p>
      <form ref={connectionForm} className="wp-form-grid" onSubmit={saveIntegration}><label>Name<input name="name" required maxLength={100}/></label><label>Type<select name="kind"><option value="api">HTTP API</option><option value="mcp">MCP HTTP endpoint</option></select></label><label>HTTPS endpoint<input name="endpoint" type="url" required placeholder="https://api.example.org/health"/></label><label>Bearer token (optional)<input name="token" type="password" autoComplete="new-password" maxLength={4000}/></label><button className="wp-btn" disabled={busy}>{editing?"Save changes":"Save connection"}</button>{editing&&<button type="button" className="wp-btn quiet" onClick={()=>{connectionForm.current?.reset();setEditing("");}}>Cancel editing</button>}</form>
      {data.integrations.map(item=>{const check=data.checks.find(c=>c.integrationId===item.id);return <article className="wp-ops-row" key={item.id}><div><h3>{item.name} <span className={`wp-badge ${item.enabled?"active":"disabled"}`}>{item.enabled?"Enabled":"Disabled"}</span></h3><p className="hint">{item.kind.toUpperCase()} · {item.endpoint} · Credential {item.hasCredential?"stored":"not set"}</p><p className="hint">Last check: {check?`${check.status} (${time(check.checkedAt)}), ${check.message}`:"Never tested"}</p></div><div className="wp-ops-actions"><button type="button" className="wp-btn quiet small" disabled={busy} onClick={()=>editIntegration(item)}>Edit</button><button type="button" className="wp-btn quiet small" disabled={busy} onClick={()=>void run({action:"integration.test",id:item.id},"Check complete.")}>Test</button><button type="button" className="wp-btn quiet small" disabled={busy} onClick={()=>void run({action:"integration.toggle",id:item.id,enabled:!item.enabled},item.enabled?"Connection disabled.":"Connection enabled.")}>{item.enabled?"Disable":"Enable"}</button><button type="button" className="wp-btn danger small" disabled={busy} onClick={()=>askDelete(item.name,()=>void run({action:"integration.delete",id:item.id},"Connection deleted."))}>Delete</button></div></article>;})}
    </section>
    <section id="settings" className="wp-card"><h2>System and tool settings</h2><div className="wp-ops-row"><div><h3>Stored credentials</h3><p className="hint">After a dedicated encryption key (INTEGRATION_SECRET_KEY) is set in hosting, move stored integration tokens and two-step sign-in secrets to it. Safe to run more than once.</p></div><button className="wp-btn quiet" disabled={busy} onClick={()=>void run({action:"secrets.rewrap"},"Stored credentials re-encrypted with the dedicated key.")}>Re-encrypt stored credentials</button></div><div className="wp-ops-row"><div><h3>Invitation links</h3><p className="hint">Pause new team invitations. Existing sessions and reset links continue.</p></div><button className="wp-btn quiet" disabled={busy} onClick={()=>void run({action:"setting.invites",value:data.settings.invites_enabled==="false"},"Invitation policy updated.")}>{data.settings.invites_enabled==="false"?"Resume invitations":"Pause invitations"}</button></div>
      {data.availableTools.map(tool=><div className="wp-ops-row" key={tool.key}><div><h3>{tool.name}</h3><p className="hint">Assigned users retain their permissions; disabling the tool blocks its page and APIs.</p></div><button className="wp-btn quiet" disabled={busy} onClick={()=>{const enabled=data.features.find(f=>f.toolKey===tool.key)?.enabled!==0;void run({action:"feature.toggle",id:tool.key,enabled:!enabled},"Tool availability updated.");}}>{data.features.find(f=>f.toolKey===tool.key)?.enabled===0?"Enable":"Disable"}</button></div>)}
    </section>
    <section id="inventory" className="wp-card"><h2>Data inventory</h2><p className="hint">Counts the rows in the main tables: people, vacancies, pipeline, orders, employers, messages and logs. Numbers only: no names, emails or CVs are shown or copied. Nothing is changed.</p>
      <div className="wp-ops-actions"><button type="button" className="wp-btn quiet" disabled={busy} onClick={()=>void countData()}>{inventory?"Count again":"Count now"}</button>{inventory&&<button type="button" className="wp-btn quiet" onClick={()=>void copyInventory()}>Copy as text</button>}</div>
      {inventory&&<>{inventory.inventory.groups.map(g=><div key={g.merge}><h3>{g.merge}. {g.title}</h3><ul className="wp-activity">{g.lines.map((l,i)=><li key={i}><span>{l.label}</span><b>{l.rows??"removed"}</b></li>)}</ul></div>)}<label>Text to paste<textarea readOnly rows={8} value={inventory.text} onFocus={e=>e.currentTarget.select()}/></label></>}
    </section>
    <section id="audit" className="wp-card"><h2>Recent activity</h2><p className="hint">The log records actor, action, target and time. Credentials and message bodies are excluded here.</p>{data.activity.length?<ul className="wp-activity">{data.activity.map((a,i)=><li key={i}><time>{time(a.createdAt)}</time><span>{a.actorId} · {a.action} · {a.targetType}: {a.targetId}</span></li>)}</ul>:<p className="hint">No activity recorded.</p>}</section>
  </>;
}
