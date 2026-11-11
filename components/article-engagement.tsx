"use client";
import { useEffect } from "react";
import Link from "@/components/app-link";

function track(slug:string,event:"view"|"candidate_click"|"employer_click") {
  void fetch("/api/blog/engagement",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({slug,event}),credentials:"same-origin",keepalive:true}).catch(()=>{});
}

export default function ArticleEngagement({slug}:{slug:string}) {
  useEffect(()=>{track(slug,"view");},[slug]);
  return <section className="blog-next"><h2>Put your next step into practice</h2><p>Explore IT and non-IT openings or tell us about the role you’re hiring for.</p><div className="calendar-actions"><Link href="/jobs" onClick={()=>track(slug,"candidate_click")}>Find jobs</Link><Link href="/employers" onClick={()=>track(slug,"employer_click")}>Discuss hiring</Link></div></section>;
}
