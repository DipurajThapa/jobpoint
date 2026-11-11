"use client";
// Landing pages for the two audiences, built from the same blocks and styles as the
// home page so the design, theme and voice stay consistent.
import Image from "next/image";
import Link from "@/components/app-link";
import { useEffect, useState } from "react";
import { DEMO_MODE } from "@/lib/demo";
import Icon from "./icon";
import PublicHeader from "./public-header";
import PublicFooter from "./public-footer";
import PublicEnquiryDialog from "./public-enquiry-dialog";

export type Landing = {
  audience: "candidate" | "employer";
  eyebrow: string; title: [string, string]; intro: string; cta: string; secondary?: { label: string; href: string };
  image: { src: string; alt: string }; proof: [string, string, string, string];
  steps: { eyebrow: string; title: [string, string]; intro: string; items: [string, string][] };
  terms: { eyebrow: string; title: [string, string]; intro: string; rows: [string, string][]; link: { label: string; href: string } };
  extra: { eyebrow: string; title: [string, string]; intro: string; cards: { icon: string; title: string; text: string }[] };
  faqs: { question: string; answer: string }[];
  closing: { title: string; text: string };
};

export default function LandingPage({ page }: { page: Landing }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { const els = document.querySelectorAll(".reveal"); const observer = new IntersectionObserver(items => items.forEach(item => { if (item.isIntersecting) { item.target.classList.add("is-visible"); observer.unobserve(item.target); } }), { threshold: .12 }); els.forEach(el => observer.observe(el)); return () => observer.disconnect(); }, []);
  const employer = page.audience === "employer", cta = DEMO_MODE ? "Preview the form" : page.cta;
  const openEnquiry = () => { if (employer) document.getElementById("hiring-enquiry")?.scrollIntoView({ behavior: "smooth" }); else setOpen(true); };
  return <div className={`theme-wrap ${employer ? "theme-company" : "theme-candidate"}`}>
    <PublicHeader audience={employer ? "employer" : "candidate"} />
    <main id="page-top">
      <section className="hero"><div className="container hero-grid"><div className="hero-copy"><span className="eyebrow"><i /> {page.eyebrow}</span><h1>{page.title[0]}<br /><em>{page.title[1]}</em></h1><p>{page.intro}</p><div className="hero-actions"><button className="button" onClick={openEnquiry}>{cta} <Icon name="north_east" /></button>{page.secondary && <Link className="button button-quiet" href={page.secondary.href}>{page.secondary.label}</Link>}</div></div><div className="hero-visual"><div className="photo-frame"><Image src={page.image.src} alt={page.image.alt} fill priority sizes="(max-width: 760px) 90vw, 48vw" /></div></div></div></section>
      <section className="proof-strip"><div className="container proof-row"><span>{page.proof[0]}</span><b>{page.proof[1]}</b><i /><b>{page.proof[2]}</b><span>{page.proof[3]}</span></div></section>
      <section className="section steps-section" id="page-how"><div className="container"><div className="section-heading reveal"><div><span className="eyebrow">{page.steps.eyebrow}</span><h2>{page.steps.title[0]}<br />{page.steps.title[1]}</h2></div><p>{page.steps.intro}</p></div><div className="steps-grid">{page.steps.items.map(([title, text], i) => <article className="step reveal" key={title}><span>0{i + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>
      <section className="section about-section" id="page-terms"><div className="container"><div className="section-heading reveal"><div><span className="eyebrow">{page.terms.eyebrow}</span><h2>{page.terms.title[0]}<br /><em>{page.terms.title[1]}</em></h2></div><p>{page.terms.intro}</p></div>
        <div className="faq-list reveal">{page.terms.rows.map(([name, text]) => <details key={name} open><summary>{name}<Icon name="add" /></summary><p>{text}</p></details>)}</div>
        <p className="privacy-note"><Link className="text-link" href={page.terms.link.href}>{page.terms.link.label} <Icon name="north_east" /></Link></p></div></section>
      <section className="section services-section" id="page-more"><div className="container"><div className="section-heading reveal"><div><span className="eyebrow">{page.extra.eyebrow}</span><h2>{page.extra.title[0]}<br />{page.extra.title[1]}</h2></div><p>{page.extra.intro}</p></div><div className={`steps-grid ${employer ? "" : "role-cards-grid"}`}>{page.extra.cards.map((c, i) => <article className="step reveal" key={c.title}><span>0{i + 1}</span><h3>{c.title}</h3><p>{c.text}</p></article>)}</div></div></section>
      {employer && <section className="section employer-enquiry-section" id="hiring-enquiry"><div className="container employer-enquiry-grid"><div className="employer-enquiry-intro"><span className="eyebrow">HIRING ENQUIRY</span><h2>Tell us about the role you need to fill.</h2><p>Share your IT or non-IT hiring requirements. No account or full job description is needed to send an enquiry.</p><p>Already working with us? <Link className="text-link" href="/portal/sign-in?kind=company">Employer sign in <Icon name="arrow_forward" /></Link></p></div><PublicEnquiryDialog type="employer" inline onClose={() => {}} /></div></section>}
      <section className="section faq-section" id="page-faq"><div className="container faq-grid"><div className="faq-title reveal"><span className="eyebrow">FREQUENTLY ASKED QUESTIONS</span><h2>{employer ? "Questions employers" : "Questions job seekers"}<br />ask us.</h2><p>{employer ? "Not covered here? Include your question in the hiring enquiry." : "Not covered here? The terms for job seekers and the privacy notice have the detail."}</p></div><div className="faq-list reveal">{page.faqs.map(({ question, answer }) => <details key={question}><summary>{question}<Icon name="add" /></summary><p>{answer}</p></details>)}</div></div></section>
      <section className="contact-band" id="page-contact"><div className="container contact-content reveal"><span className="eyebrow">{employer ? "FOR EMPLOYERS" : "FOR JOB SEEKERS"}</span><h2>{page.closing.title}</h2><p>{page.closing.text}</p><div><button className="button" onClick={openEnquiry}>{cta} <Icon name="north_east" /></button><Link className="button button-quiet" href={employer ? "/job-seekers" : "/employers"}>{employer ? "I’m looking for work" : "I’m hiring"} <Icon name="north_east" /></Link></div></div></section>
    </main>
    <PublicFooter onCandidate={employer ? undefined : () => setOpen(true)} onEmployer={employer ? openEnquiry : undefined} />
    {open && !employer && <PublicEnquiryDialog type={page.audience} onClose={() => setOpen(false)} />}
  </div>;
}
