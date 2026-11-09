import Image from "next/image";

// Frame for signed-out pages (sign-in, invitation, reset, recovery).
export default function AuthCard({ title, intro, children }: { title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return <main className="wp-auth">
    <section className="wp-auth-card" aria-labelledby="auth-title">
      <header>
        <Image src="/images/jobboard300-logo.png" width={499} height={81} alt="Jobboard300" />
        <span className="wp-overline">Working Platform</span>
        <h1 id="auth-title">{title}</h1>
        {intro && <p className="hint">{intro}</p>}
      </header>
      {children}
    </section>
  </main>;
}
