"use client";

import Image from "next/image";
import { useState } from "react";
import Icon from "./icon";

const navigation = [["about", "About us"], ["services", "Services"], ["jobs", "Find jobs"], ["candidates", "Candidates"], ["employers", "Employers"], ["faq", "FAQs"]];

export default function PublicHeader({ onHire }: { onHire?: () => void }) {
  const [open, setOpen] = useState(false);
  return <header className="header"><div className="container nav"><a className="brand" href="/#top" aria-label="Job Point Consultancy home"><Image src="/images/job-point-light.png" alt="Job Point Consultancy" width={160} height={160} priority /></a><button className="menu-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="public-navigation" aria-label="Toggle navigation"><Icon name={open ? "close" : "menu"} /></button><nav id="public-navigation" aria-label="Main navigation" className={open ? "nav-links open" : "nav-links"}>{navigation.map(([id, name]) => <a key={id} href={`/#${id}`} onClick={() => setOpen(false)}>{name}</a>)}{onHire ? <button className="button button-small" onClick={() => { onHire(); setOpen(false); }}>Hire with us <Icon name="north_east" /></button> : <a className="button button-small" href="/#employers">Hire with us <Icon name="north_east" /></a>}</nav></div></header>;
}
