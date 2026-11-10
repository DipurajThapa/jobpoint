"use client";
import Link from "next/link";

import Image from "next/image";
import { useState } from "react";
import Icon from "./icon";

const navigation = [["about", "About us"], ["services", "Services"], ["jobs", "Find jobs"], ["candidates", "Candidates"], ["employers", "Employers"], ["faq", "FAQs"]];

export default function PublicHeader({ onHire }: { onHire?: () => void }) {
  const [open, setOpen] = useState(false);
  return <header className="header"><div className="container nav"><Link className="brand" href="/#top" aria-label="Jobboard300 home"><Image src="/images/jobboard300-logo.png" alt="Jobboard300" width={499} height={81} priority /></Link><button className="menu-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="public-navigation" aria-label="Toggle navigation"><Icon name={open ? "close" : "menu"} /></button><nav id="public-navigation" aria-label="Main navigation" className={open ? "nav-links open" : "nav-links"}>{navigation.map(([id, name]) => <a key={id} href={`/#${id}`} onClick={() => setOpen(false)}>{name}</a>)}{onHire ? <button className="button button-small" onClick={() => { onHire(); setOpen(false); }}>Hire talent <Icon name="north_east" /></button> : <Link className="button button-small" href="/#employers">Hire talent <Icon name="north_east" /></Link>}</nav></div></header>;
}
