"use client";

import { DEMO_MODE, DEMO_MESSAGE } from "@/lib/demo";
import DemoFormNotice from "@/components/demo-form-notice";
import CandidateFields from "@/components/candidate-fields";
import { useState } from "react";
import type { FormEvent } from "react";

export default function ApplicationForm({jobId}:{jobId:string}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(DEMO_MODE){setMessage(DEMO_MESSAGE);return;}setBusy(true);setMessage("");const form=e.currentTarget;try{const response=await fetch("/api/applications",{method:"POST",body:new FormData(form)});const data=await response.json();if(!response.ok)throw new Error(data.error);setMessage(data.message);form.reset()}catch(err){setMessage(err instanceof Error?err.message:"Please try again.")}finally{setBusy(false)}}
  return <form className="apply-form" onSubmit={submit}><DemoFormNotice /><fieldset className="demo-fields" disabled={DEMO_MODE}><CandidateFields jobId={jobId} />{!DEMO_MODE && <button className="button" disabled={busy}>{busy?"Sending…":"Apply for this role"}</button>}</fieldset>{message&&<p className="form-message" role="status">{message}</p>}<p className="privacy-inline">{DEMO_MODE ? "This is a preview. Applications are currently disabled." : <>Your details enter the recruiter’s review queue. A CV upload does not replace an earlier file. For corrections, use the <a href="/privacy#privacy-request">privacy request form</a>. Read our <a href="/terms">terms of use</a>.</>}</p></form>;
}
