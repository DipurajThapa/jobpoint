"use client";

import { useState } from "react";
import type { FormEvent } from "react";

export default function ApplicationForm({jobId}:{jobId:string}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setMessage("");const form=e.currentTarget;try{const response=await fetch("/api/applications",{method:"POST",body:new FormData(form)});const data=await response.json();if(!response.ok)throw new Error(data.error);setMessage(data.message);form.reset()}catch(err){setMessage(err instanceof Error?err.message:"Please try again.")}finally{setBusy(false)}}
  return <form className="apply-form" onSubmit={submit}><input type="hidden" name="jobId" value={jobId}/><input className="honeypot" name="website" tabIndex={-1} autoComplete="off"/><label>Full name<input name="fullName" required maxLength={120}/></label><label>Email<input type="email" name="email" required maxLength={254}/></label><label>Phone<input name="phone" type="tel" required maxLength={30}/></label><label>Preferred location<input name="location" required maxLength={100}/></label><label>Experience summary<textarea name="experience" required rows={3} maxLength={1200}/></label><label>Resume <small>PDF or DOCX · up to 5 MB</small><input type="file" name="resume" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"/></label><label className="consent"><input type="checkbox" name="consent" value="yes" required/> I agree that Job Point Consultancy may use my details for this role and contact me about my application.</label><button className="button" disabled={busy}>{busy?"Sending…":"Apply for this role"}</button>{message&&<p className="form-message" role="status">{message}</p>}</form>;
}
