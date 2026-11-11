import test from "node:test";
import assert from "node:assert/strict";
import { freshDb, makeStaff, call, route } from "./helpers/world.mjs";

const intelligence = await route("platform/intelligence");
const engagement = await route("blog/engagement");
const source = { action:"source.create",name:"National Careers Example",url:"https://careers.example.gov.in/",category:"Government",coverage:"India",reliability:"unreviewed",reviewNotes:"" };
const opportunity = { action:"opportunity.create",title:"An official hiring notification needs review",summary:"A candidate-facing update",audience:"Candidates",category:"Government jobs",status:"idea",priority:"high",primaryUrl:"https://careers.example.gov.in/notice",corroborationUrl:"",evidenceNotes:"" };

test("intelligence register is private, protected against CSRF and never publishes", async () => {
  const { db } = freshDb();
  const member = await makeStaff(db,"intel-member",{admin:false});
  const admin = await makeStaff(db,"intel-admin",{admin:true});
  assert.equal((await call(intelligence,"GET","/api/platform/intelligence")).status,401);
  assert.equal((await call(intelligence,"GET","/api/platform/intelligence",{cookie:member})).status,403);
  assert.equal((await call(intelligence,"POST","/api/platform/intelligence",{cookie:admin,body:source,origin:"https://outside.example"})).status,403);
  assert.equal((await call(intelligence,"POST","/api/platform/intelligence",{cookie:member,body:source})).status,403);
  const created = await call(intelligence,"POST","/api/platform/intelligence",{cookie:admin,body:source});
  assert.equal(created.status,200,created.text);
  assert.equal((await call(intelligence,"POST","/api/platform/intelligence",{cookie:admin,body:source})).status,409);
  const list = await call(intelligence,"GET","/api/platform/intelligence",{cookie:admin});
  assert.equal(list.json.sources.length,5);
  assert.ok(list.json.sources.every(s=>s.reliability==="unreviewed"));
  assert.equal(list.json.articles.length,0);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM blog_posts").first()).n,0);
});

test("evidence gate prevents unsupported verification and unreviewed trusted sources",async()=>{
  const {db}=freshDb(), admin=await makeStaff(db,"intel-admin-two",{admin:true});
  const post=body=>call(intelligence,"POST","/api/platform/intelligence",{cookie:admin,body});
  assert.equal((await post({...source,reliability:"trusted"})).status,400);
  assert.equal((await post({...source,url:"http://not-secure.example/"})).status,400);
  assert.equal((await post(source)).status,200);
  const sourceId=(await call(intelligence,"GET","/api/platform/intelligence",{cookie:admin})).json.sources.find(s=>s.url===source.url).id;
  assert.equal((await post({...source,action:"source.update",id:sourceId,reliability:"trusted",reviewNotes:"Ownership and publication history independently checked by editor."})).status,200);
  assert.equal((await post({...opportunity,status:"verified"})).status,400);
  assert.equal((await post({...opportunity,status:"verified",corroborationUrl:"https://careers.example.gov.in/again",evidenceNotes:"Only the same website reports this yet; verification is incomplete."})).status,400);
  assert.equal((await post({...opportunity,status:"verified",corroborationUrl:"https://news.example.org/story",evidenceNotes:"A human editor checked both distinct sources and the original notice."})).status,200);
  const list=(await call(intelligence,"GET","/api/platform/intelligence",{cookie:admin})).json;
  assert.equal(list.opportunities[0].status,"verified");
  assert.equal(list.opportunities[0].reviewedBy,`platform:intel-admin-two`);
  assert.equal((await db.prepare("SELECT count(*) n FROM blog_posts").first()).n,0);
});

test("blog engagement counts only live articles, with no person data",async()=>{
  const {db}=freshDb();
  const save=async(slug,published)=>db.prepare("INSERT INTO blog_posts (id,slug,draft_json,published_json,revision,updated_at,updated_by) VALUES (?,?,?,?,1,?,?)").bind(crypto.randomUUID(),slug,JSON.stringify({title:"An article"}),published?"{}":null,new Date().toISOString(),"test").run();
  await save("public-hiring-guide",true);await save("private-draft",false);
  const post=(slug,event,origin)=>call(engagement,"POST","/api/blog/engagement",{body:{slug,event},...(origin?{origin}:{})});
  assert.equal((await post("private-draft","view")).status,404);
  assert.equal((await post("public-hiring-guide","unknown")).status,400);
  assert.equal((await post("public-hiring-guide","view","https://outside.example")).status,403);
  assert.equal((await post("public-hiring-guide","view")).status,204);
  assert.equal((await post("public-hiring-guide","view")).status,204);
  assert.equal((await post("public-hiring-guide","candidate_click")).status,204);
  const rows=(await db.prepare("SELECT event,count FROM blog_engagement_daily ORDER BY event").all()).results;
  assert.deepEqual(rows,[{event:"candidate_click",count:1},{event:"view",count:1}]);
});
