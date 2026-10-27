import Link from "next/link";
import { ArrowRight, BarChart3, BellRing, CalendarCheck, CarFront, Check, ChevronRight, ClipboardCheck, CreditCard, MapPin, PackageSearch, ShieldCheck, Wrench } from "lucide-react";
import { Brand } from "@/components/brand";

const features = [
  { icon: CalendarCheck, title: "Bookings that stay organised", text: "Let customers request service online while every branch controls capacity, schedules and confirmations." },
  { icon: ClipboardCheck, title: "Transparent repair journeys", text: "Move work from check-in to diagnosis, customer approval, repair and quality control—with a clear audit trail." },
  { icon: PackageSearch, title: "Inventory without guesswork", text: "Track stock, reservations, issues and reorder levels for every shop in your garage network." },
  { icon: CreditCard, title: "Invoices and M-Pesa", text: "Issue accurate invoices, reconcile payments and give customers a familiar mobile checkout experience." },
  { icon: BarChart3, title: "Decisions backed by data", text: "See work in progress, revenue, receivables and operational bottlenecks across branches." },
  { icon: ShieldCheck, title: "Built for multi-tenant security", text: "Every operational record is franchise-scoped, with server-validated membership and role controls." },
];

export default function Home() {
  return <>
    <main>
      <section className="hero">
        <nav className="nav shell" aria-label="Main navigation">
          <Brand />
          <div className="nav-links"><a href="#platform">Platform</a><a href="#garages">For garages</a><a href="#customers">For drivers</a></div>
          <div className="nav-actions"><Link className="btn btn-secondary" href="/login">Sign in</Link><Link className="btn btn-primary" href="/login?mode=register">Start free <ArrowRight size={16} /></Link></div>
        </nav>
        <div className="hero-grid shell">
          <div>
            <span className="eyebrow"><MapPin size={13} /> Built for garages in Kenya</span>
            <h1>Car care that feels <em>effortless.</em></h1>
            <p className="hero-copy">One secure place for drivers to book and follow repairs—and for modern garages to run jobs, teams, stock and payments with confidence.</p>
            <div className="hero-actions"><Link href="/login?mode=register" className="btn btn-primary">Create your account <ArrowRight size={17} /></Link><a href="#platform" className="btn btn-secondary">Explore the platform</a></div>
            <div className="trust-row"><span><Check size={15} color="#0d7d58" /> 14-day garage trial</span><span><Check size={15} color="#0d7d58" /> No card required</span><span><ShieldCheck size={15} color="#0d7d58" /> Secure by design</span></div>
          </div>
          <div className="hero-visual" aria-label="AutoCare operations preview">
            <div className="garage-card">
              <div className="mock-top"><Brand light /><BellRing size={17} /></div>
              <div className="mock-hero"><small>Good morning, Westlands team</small><strong>12 jobs in progress</strong></div>
              <div className="job-stack">
                <div className="job-row"><span className="car-icon"><CarFront size={19} /></span><div><strong>KDA 247M · Toyota Harrier</strong><span>Brake inspection</span></div><span className="status">Diagnosing</span></div>
                <div className="job-row"><span className="car-icon"><Wrench size={19} /></span><div><strong>KCF 802R · Mazda Demio</strong><span>Full service</span></div><span className="status">In repair</span></div>
              </div>
            </div>
            <div className="float-card"><div className="float-card-head"><span>Today’s revenue</span><BarChart3 size={15} /></div><strong>KES 184,500</strong><p>↑ 12.4% from last Thursday</p></div>
          </div>
        </div>
      </section>

      <section className="section section-white" id="platform"><div className="shell">
        <div className="section-heading"><div><span className="eyebrow">One connected platform</span><h2>Every moving part,<br />working together.</h2></div><p>AutoCare replaces scattered spreadsheets, phone calls and paper job cards with a live workspace your team and customers can trust.</p></div>
        <div className="feature-grid">{features.map(({ icon: Icon, title, text }) => <article className="feature-card" key={title}><span className="feature-icon"><Icon size={21} /></span><h3>{title}</h3><p>{text}</p></article>)}</div>
      </div></section>

      <section className="section" id="garages"><div className="shell"><div className="cta"><div><h2>Give your garage room to grow.</h2><p>Start with one shop. Add branches, people and capabilities when you need them.</p></div><Link href="/login?mode=register" className="btn" style={{ background: "var(--lime)", color: "var(--ink)", position: "relative", zIndex: 1 }}>Start your 14-day trial <ChevronRight size={17} /></Link></div></div></section>
    </main>
    <footer><div className="shell footer-row"><Brand /><span>© {new Date().getFullYear()} AutoCare. Built in Kenya for the road ahead.</span></div></footer>
  </>;
}
