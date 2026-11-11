import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { freshDb, route, call, ORIGIN, PASSWORD } from './helpers/world.mjs';
const { readLimitedBody, readLimitedForm, validateContact, validateHiringNeed } = await import('../lib/intake-security.ts');
const { extractText, docxXmlToText } = await import('../lib/ats/extract.ts');
const { analyseCvWithText } = await import('../lib/ats/pipeline.ts');
const { cvReviewReasons } = await import('../lib/cv-quality.ts');
const { limitSubmission } = await import('../lib/http.ts');
const registration = await route('portal/registration');
const auth = await route('portal/auth/[action]');
const form = (email = 'owner@example.test', phone = '+919876543210') => {
  const f = new FormData();
  for (const [key, value] of Object.entries({ kind:'company', contactName:"D O'Connor", company:'Example Business', legalName:'Example Business Ltd', email, phone, details:'Hiring software developers and accounts executives', password:PASSWORD, consent:'yes', terms:'yes' })) f.set(key,value);
  return f;
};
const submit = (f,ip='192.0.2.1') => registration.POST(new Request(`${ORIGIN}/api/portal/registration`,{method:'POST',headers:{origin:ORIGIN,'cf-connecting-ip':ip},body:f}));
// Small uncompressed ZIP fixture. No executables or oversized bodies are used.
function zip(entries) {
  const files=[], central=[]; let offset=0;
  for (const [name,text] of entries) {
    const n=Buffer.from(name), data=Buffer.from(text), h=Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(n.length,26);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
    files.push(h,n,data);central.push(c,n);offset+=h.length+n.length+data.length;
  }
  const cd=Buffer.concat(central), end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
  return new Uint8Array(Buffer.concat([...files,cd,end]));
}
const parts=[['[Content_Types].xml','<Types/>'],['word/document.xml','<w:document><w:p><w:t>Education and experience</w:t></w:p></w:document>']];
test('streaming size limits stop bodies with no length header and forged small length',async()=>{
  for(const headers of [{},{'content-length':'1'}]) {
    const request=new Request(ORIGIN,{method:'POST',headers,body:'x'.repeat(200)});
    await assert.rejects(readLimitedBody(request,100),e=>e.status===413);
  }
  const f=form(); f.append('email','other@example.test');
  await assert.rejects(readLimitedForm(new Request(ORIGIN,{method:'POST',body:f}),20000),e=>e.code==='FIELDS');
});
test('SQL payloads remain literal data; signup cannot assign admin role or active status',async()=>{
  const {db}=freshDb();const f=form();f.set('company',"Acme'); DROP TABLE companies; --");f.set('role','admin');f.set('status','active');f.set('accountId','another-account');
  assert.equal((await submit(f)).status,201);
  assert.equal((await db.prepare('SELECT display_name FROM companies').first()).display_name,"Acme'); DROP TABLE companies; --");
  assert.equal((await db.prepare('SELECT role FROM company_users').first()).role,'owner');
  assert.equal((await db.prepare('SELECT status FROM portal_accounts').first()).status,'pending');
  const injection=await call(auth,'POST','/api/portal/auth/sign-in',{action:'sign-in',body:{email:"' OR 1=1 --",password:PASSWORD}});
  assert.equal(injection.status,401);
});
test('honeypot discards registrations without saving accounts',async()=>{
  const {db}=freshDb();const f=form();f.set('website','automated entry');assert.equal((await submit(f)).status,201);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM portal_accounts').first()).n,0);
});
test('contact throttling survives changes of IP and endpoint',async()=>{
  const {db}=freshDb();
  for(let i=0;i<4;i++)assert.equal((await submit(form(),`192.0.2.${i+1}`)).status,201);
  const fifth=await submit(form(),'192.0.2.22');assert.equal(fifth.status,429);
  const enquiry=await route('employer-enquiries');
  const response=await call(enquiry,'POST','/api/employer-enquiries',{headers:{'cf-connecting-ip':'192.0.2.25'},body:{contactName:'Owner Example',company:'Example Business',email:'owner@example.test',phone:'+919876543210',details:'Hiring a software developer with SQL experience',consent:'yes',terms:'yes'}});
  assert.equal(response.status,429);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM portal_accounts').first()).n,1);
});
test('IP budget is shared by intake categories and ignores client-supplied forwarded IP',async()=>{
  const {db}=freshDb();
  await db.prepare("INSERT INTO rate_limits (key,window_start,hits) VALUES ('portal:cv_upload:2592000:user',?,1)").bind(Math.floor(Date.now()/1000)-10000).run();
  for(let i=0;i<8;i++)assert.equal(await limitSubmission(new Request(ORIGIN,{headers:{'cf-connecting-ip':'192.0.2.2','x-forwarded-for':String(i)}}),i%2?'employer':'application'),true);
  assert.equal(await limitSubmission(new Request(ORIGIN,{headers:{'cf-connecting-ip':'192.0.2.2','x-forwarded-for':'changed'}}),'registration'),false);
  assert.ok(await db.prepare("SELECT key FROM rate_limits WHERE key='portal:cv_upload:2592000:user'").first());
});
test('email-link requests are bounded per address across different IPs',async()=>{
  freshDb();
  for(let i=0;i<3;i++)assert.equal((await call(auth,'POST','/api/portal/auth/reset-request',{action:'reset-request',headers:{'cf-connecting-ip':`192.0.2.${i}`},body:{email:'person@example.test'}})).status,200);
  assert.equal((await call(auth,'POST','/api/portal/auth/reset-request',{action:'reset-request',headers:{'cf-connecting-ip':'192.0.2.40'},body:{email:'person@example.test'}})).status,429);
});
test('contact validation accepts international names and real providers; rejects unusable details',()=>{
  assert.doesNotThrow(()=>validateContact('दीपु थापा','person@gmail.com','+971 56 356 5659'));
  assert.doesNotThrow(()=>validateContact("Anne O'Connor",'anne@example.com','020 7946 0123'));
  assert.throws(()=>validateContact('Name','name@mailinator.com','+919876543210'));
  assert.throws(()=>validateContact('Name','name@example.com','0000000000'));
  assert.throws(()=>validateHiringNeed('Company','https://spam.example'));
  assert.doesNotThrow(()=>validateHiringNeed('Company','Hiring an accounts executive for reconciliation work.'));
});
test('document validation rejects macro packages, path traversal, entities and forged expansion sizes',async()=>{
  assert.match((await extractText(zip(parts),'docx')).text,/Education/);
  await assert.rejects(extractText(zip([...parts,['word/vbaProject.bin','placeholder']]),'docx'),/macros/);
  await assert.rejects(extractText(zip([...parts,['../other','placeholder']]),'docx'),/paths/);
  await assert.rejects(extractText(zip([...parts,parts[1]]),'docx'),/paths/);
  assert.throws(()=>docxXmlToText('<!DOCTYPE a [<!ENTITY e SYSTEM "file:///x">]><w:t>&e;</w:t>'),/entities/);
  const bomb=zip(parts),v=new DataView(bomb.buffer);const cd=v.getUint32(bomb.length-6,true);v.setUint32(cd+24,9*1024*1024,true);
  await assert.rejects(extractText(bomb,'docx'),/limits/);
});
test('PDF JavaScript is refused before storage while a normal PDF remains readable',async()=>{
  const pdf=await PDFDocument.create();pdf.addPage().drawText('Education and work experience');
  assert.ok(await analyseCvWithText({bytes:await pdf.save(),fileName:'cv.pdf'}));
  pdf.addJavaScript('test','void 0;');
  await assert.rejects(analyseCvWithText({bytes:await pdf.save(),fileName:'cv.pdf'}),/scripts/);
});
test('CV review flags are explanatory and do not assert dishonesty',()=>{
  const p={work:[],education:[],contact:{email:'old@example.com'}};
  const reasons=cvReviewReasons(p,'short CV','new@example.com');
  assert.equal(reasons.length,3);assert.ok(reasons.every(r=>!/fraud|fake|dishonest/i.test(r)));
});
