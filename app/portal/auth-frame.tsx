import Image from "next/image";
import Link from "next/link";

export default function AuthFrame({ title, intro, children }: { title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return <main className="wp-auth">
    <section className="wp-auth-card" aria-labelledby="auth-title">
      <header>
        <Link href="/" aria-label="Jobboard300 home"><Image src="/images/jobboard300-logo.png" width={499} height={81} alt="Jobboard300" /></Link>
        <span className="wp-overline">Job portal</span>
        <h1 id="auth-title">{title}</h1>
        {intro && <p className="hint">{intro}</p>}
      </header>
      {children}
    </section>
  </main>;
}
