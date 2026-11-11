import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, makeStaff, call, route, ORIGIN, PASSWORD } from './helpers/world.mjs';
const { blankPost, cleanDocument, validatePost } = await import('../lib/blog/content.ts');
const { publishedPost, publishedPosts } = await import('../lib/blog/store.ts');
const { meetingCalendar } = await import('../lib/meeting-calendar.ts');
const { callSlots } = await import('../lib/public-forms.ts');
const cms = await route('admin/blog');
const media = await route('blog/media/[id]');
const bannerId = '11111111-1111-4111-8111-111111111111';
function article() { return { ...blankPost(), title: 'Preparing a useful IT or non-IT hiring brief', slug: 'preparing-a-hiring-brief', summary: 'How employers can describe responsibilities, essential skills, location and salary before discussing a vacancy.', banner: { src: `/api/blog/media/${bannerId}`, kind: 'image', description: 'A team planning the requirements for a role', poster: '' }, body: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Start with the responsibilities' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'For software development and accounts roles alike, explain the responsibilities, essential skills, salary range and working location. Distinguish essential requirements from skills that can be learned on the job.' }] }] } }; }
async function setup() { const w = freshDb(); const cookie = await makeStaff(w.db, 'blog-admin', { admin: true }); await w.db.prepare('INSERT INTO blog_assets (id,r2_key,mime,size,width,height,description,created_at,created_by) VALUES (?,?,?,?,?,?,?,?,?)').bind(bannerId, 'blog-media/banner', 'image/png', 3, 1920, 1080, 'Banner', new Date().toISOString(), 'admin').run(); await w.BUCKET.put('blog-media/banner', new Uint8Array([1,2,3])); return { ...w, cookie }; }
const post = (cookie, body, options = {}) => call(cms, 'POST', '/api/admin/blog', { cookie, body, ...options });
test('CMS admin-only access, CSRF and unpublished media isolation', async () => {
  const w = await setup(); const member = await makeStaff(w.db, 'ordinary');
  assert.equal((await post(undefined, {action:'save',post:article()})).status, 401);
  assert.equal((await post(member, {action:'publish',post:article()})).status, 403);
  assert.equal((await post(w.cookie,{action:'save',post:article()},{origin:'https://outside.example'})).status,403);
  assert.equal((await call(cms,'GET','/api/admin/blog')).status,401);
  const denied = await call(media,'GET',`/api/blog/media/${bannerId}`,{params:{id:bannerId}}); assert.equal(denied.status,404);
  assert.equal((await call(media,'GET',`/api/blog/media/${bannerId}`,{cookie:w.cookie,params:{id:bannerId}})).status,200);
});
test('draft, publish, draft revision isolation, stale save, stable URL and unpublish',async()=>{
  const w=await setup(), p=article(); const saved=await post(w.cookie,{action:'save',post:p}); assert.equal(saved.status,200,saved.text);
  assert.equal(await publishedPost(p.slug),null); const id=saved.json.id;
  const pub=await post(w.cookie,{id,revision:1,action:'publish',post:p}); assert.equal(pub.status,200,pub.text);
  assert.equal((await publishedPosts()).length,1); assert.equal((await call(media,'GET',`/api/blog/media/${bannerId}`,{params:{id:bannerId}})).status,200);
  const edited={...p,title:'SECRET DRAFT TITLE'}; assert.equal((await post(w.cookie,{id,revision:2,action:'save',post:edited})).status,200);
  assert.equal(JSON.parse((await publishedPost(p.slug)).published_json).title,p.title);
  assert.equal((await post(w.cookie,{id,revision:2,action:'publish',post:edited})).status,409);
  assert.equal((await post(w.cookie,{id,revision:3,action:'publish',post:{...edited,slug:'changed-url'}})).status,400);
  const unpub=await post(w.cookie,{id,revision:3,action:'unpublish',post:edited}); assert.equal(unpub.status,200,unpub.text);
  assert.equal(await publishedPost(p.slug),null); assert.equal((await call(media,'GET',`/api/blog/media/${bannerId}`,{params:{id:bannerId}})).status,404);
  assert.equal((await w.db.prepare('SELECT count(*) n FROM blog_posts').first()).n,1);
});
test('published banner dimensions, duplicate slug and invalid content are rejected',async()=>{
  const w=await setup(); await w.db.prepare('UPDATE blog_assets SET width=100 WHERE id=?').bind(bannerId).run();
  assert.equal((await post(w.cookie,{action:'publish',post:article()})).status,400);
  await w.db.prepare('UPDATE blog_assets SET width=1920 WHERE id=?').bind(bannerId).run();
  assert.equal((await post(w.cookie,{action:'save',post:article()})).status,200);
  assert.equal((await post(w.cookie,{action:'save',post:article()})).status,409);
  assert.throws(()=>cleanDocument({type:'doc',content:[{type:'iframe',attrs:{src:'javascript:alert(1)'}}]}));
  const clean=cleanDocument({type:'doc',content:[{type:'text',text:'<script>alert(1)</script>',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}},{type:'textStyle',attrs:{color:'url(https://bad)',fontSize:'9000px'}}]}]});
  assert.ok(!JSON.stringify(clean).includes('javascript:')); assert.ok(!JSON.stringify(clean).includes('url(https'));
  assert.throws(()=>validatePost({...article(),body:{type:'doc',content:[{type:'blogMedia',attrs:{src:'https://external.example/track'}}]}}));
});
test('CMS media rejects executable uploads and respects body limits', async()=>{
  const w=await setup(), upload=await route('admin/blog/media'); const form=new FormData(); form.set('description','Unsafe image'); form.set('file',new File(['<svg onload="alert(1)"></svg>'],'image.svg',{type:'image/svg+xml'}));
  const res=await upload.POST(new Request(`${ORIGIN}/api/admin/blog/media`,{method:'POST',headers:{origin:ORIGIN,cookie:w.cookie},body:form})); assert.equal(res.status,400);
  const huge=await post(w.cookie,{action:'save',post:{...article(),summary:'x'.repeat(310000)}});assert.equal(huge.status,413);
});
test('calendar exports preserve UTC time and tentative status without personal data',()=>{
  const at='2026-12-01T04:30:00.000Z', calendar=meetingCalendar(at);
  assert.match(calendar.ics,/DTSTART:20261201T043000Z\r\n/); assert.match(calendar.ics,/DTEND:20261201T050000Z\r\n/); assert.match(calendar.ics,/STATUS:TENTATIVE/); assert.match(calendar.ics,/TRANSP:TRANSPARENT/);
  const google=new URL(calendar.google),outlook=new URL(calendar.outlook); assert.equal(google.searchParams.get('dates'),'20261201T043000Z/20261201T050000Z'); assert.equal(outlook.searchParams.get('startdt'),at); assert.match(google.searchParams.get('text'),/awaiting confirmation/);
  for(const line of calendar.ics.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
  assert.throws(()=>meetingCalendar('bad'));
});
test('employer registration stores requested slot, prevents double booking atomically and hides held slots',async()=>{
  const w=freshDb(), register=await route('portal/registration'), slots=callSlots(), slot=slots[0];
  const form=email=>{const f=new FormData();for(const [k,v] of Object.entries({kind:'company',email,contactName:'Example Owner',company:'Example Business',legalName:'Example Business Limited',phone:'+919876543211',password:PASSWORD,details:'We need software engineers and finance professionals.',consent:'yes',terms:'yes',meetingAt:slot}))f.set(k,v);return f;};
  const send=f=>register.POST(new Request(`${ORIGIN}/api/portal/registration`,{method:'POST',headers:{origin:ORIGIN},body:f}));
  const first=await send(form('owner1@business.example'));assert.equal(first.status,201,await first.clone().text());
  const held=await w.db.prepare('SELECT meeting_at,meeting_status FROM employer_enquiries').first();assert.equal(held.meeting_at,slot);assert.equal(held.meeting_status,'requested');
  const second=await send(form('owner2@business.example'));assert.equal(second.status,409);assert.equal((await w.db.prepare('SELECT count(*) n FROM portal_accounts').first()).n,1);
  const available=await (await route('employer-enquiries')).GET();assert.ok(!(await available.json()).slots.includes(slot));
});
test('sitemap and feed contain only published indexable articles and crawler policy allows media',async()=>{
  const w=await setup(), p=article(); const saved=await post(w.cookie,{action:'publish',post:p}); assert.equal(saved.status,200);
  const map=await import('../app/sitemap.xml/route.ts'), feed=await import('../app/blog/feed.xml/route.ts'), robots=await import('../app/robots.txt/route.ts');
  let xml=await (await map.GET()).text();assert.match(xml,new RegExp('/blog/'+p.slug));assert.match(xml,/<image:image>/);
  assert.match(await (await feed.GET()).text(),new RegExp(p.slug));assert.match(await (await robots.GET()).text(),/Allow: \/api\/blog\/media\//);
  assert.equal((await post(w.cookie,{id:saved.json.id,revision:1,action:'publish',post:{...p,noindex:true}})).status,200);
  xml=await (await map.GET()).text();assert.ok(!xml.includes(p.slug));assert.ok(!(await (await feed.GET()).text()).includes(p.slug));
});
test('article lists omit full documents and individual drafts remain admin-only',async()=>{
  const w=await setup(), p=article(); const saved=await post(w.cookie,{action:'publish',post:p});assert.equal(saved.status,200);
  const list=await call(cms,'GET','/api/admin/blog',{cookie:w.cookie});assert.ok(!list.text.includes('Distinguish essential requirements'));
  const detail=await call(cms,'GET',`/api/admin/blog?id=${saved.json.id}`,{cookie:w.cookie});assert.ok(detail.text.includes('Distinguish essential requirements'));
  assert.equal((await call(cms,'GET',`/api/admin/blog?id=${saved.json.id}`)).status,401);
  assert.ok(!JSON.stringify(await publishedPosts()).includes('Distinguish essential requirements'));
});
