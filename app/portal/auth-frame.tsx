import Image from "next/image";

export default function AuthFrame({ title, intro, children }: { title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return <main className="wp-auth">
    <section className="wp-auth-card" aria-labelledby="auth-title">
      <header>
        <Image src="/images/job-point-light.png" width={64} height={64} alt="Job Point Consultancy" />
        <span className="wp-overline">Job Point jobs</span>
        <h1 id="auth-title">{title}</h1>
        {intro && <p className="hint">{intro}</p>}
      </header>
      {children}
    </section>
  </main>;
}
