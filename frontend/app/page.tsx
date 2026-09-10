"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { NovaFace, type NovaFaceName } from "@/components/NovaFace";
import { BellIcon, CalendarIcon, HeartIcon, PhoneIcon, PillIcon, PulseIcon } from "@/components/icons";

type SectionId = "hero" | "care" | "expressions" | "steps";

const DEFAULT_ORDER: SectionId[] = ["hero", "care", "expressions", "steps"];
const SECTION_LABELS: Record<SectionId, string> = { hero: "Welcome", care: "Everyday care", expressions: "Meet ElderLove", steps: "How it works" };
const EXPRESSIONS: { name: NovaFaceName; label: string }[] = [
  { name: "reassured", label: "Reassured" }, { name: "empathetic", label: "Empathetic" },
  { name: "surprised", label: "Surprised" }, { name: "proud", label: "Proud" },
  { name: "sleepy", label: "Sleepy" }, { name: "playful", label: "Playful" },
  { name: "focused", label: "Focused" }, { name: "grateful", label: "Grateful" },
  { name: "encouraging", label: "Encouraging" }, { name: "calm", label: "Calm" },
];

function Hero() {
  return (
    <section className="home-hero" aria-labelledby="home-title">
      <div className="home-hero-copy">
        <div className="eyebrow"><span className="status-dot" /> Thoughtful care, every day</div>
        <h1 id="home-title">A warm voice for them.<br /><span>Peace of mind for you.</span></h1>
        <p className="home-lede">ElderLove calls, listens, remembers medications, and keeps family in the loop—while elders stay independent.</p>
        <div className="home-actions">
          <Link href="/elder" className="home-button home-button-primary"><PhoneIcon className="w-6 h-6" /> Try Eleanor&apos;s view</Link>
          <Link href="/family" className="home-button home-button-secondary"><HeartIcon className="w-6 h-6" /> Open family view</Link>
        </div>
        <div className="home-proof" aria-label="Product highlights"><span>Voice-first</span><span>Family connected</span><span>Always respectful</span></div>
      </div>
      <div className="home-portrait-wrap" aria-label="ElderLove caregiver">
        <div className="home-portrait-glow" />
        <div className="home-portrait-card">
          <span className="home-live-pill"><span className="status-dot" /> Ready to check in</span>
          <NovaFace phase="idle" expression="encouraging" size={320} />
          <div className="home-message"><span aria-hidden="true">“</span>Good morning, Eleanor. How are you feeling today?</div>
        </div>
      </div>
    </section>
  );
}

function Care() {
  const cards = [
    { title: "A call that feels human", text: "Natural voice check-ins with no new app or password for an elder to learn.", Icon: PhoneIcon, tone: "mint" },
    { title: "Gentle medication support", text: "Confirms each dose and nudges kindly, escalating only when something needs attention.", Icon: PillIcon, tone: "sun" },
    { title: "The right context for family", text: "See meaningful updates, not a flood of notifications. Stay close without hovering.", Icon: BellIcon, tone: "rose" },
  ];
  return (
    <section className="home-section" aria-labelledby="care-title">
      <div className="section-heading"><div><p className="eyebrow">Care that fits real life</p><h2 id="care-title">Quiet help in the moments that matter</h2></div><p>Designed around dignity, not dashboards.</p></div>
      <div className="care-grid">
        {cards.map(({ title, text, Icon, tone }) => <article key={title} className="care-card"><span className={`care-icon care-icon-${tone}`}><Icon className="w-7 h-7" /></span><h3>{title}</h3><p>{text}</p></article>)}
      </div>
    </section>
  );
}

function Expressions() {
  return (
    <section className="home-section expression-section" aria-labelledby="expressions-title">
      <div className="section-heading"><div><p className="eyebrow">Emotionally aware</p><h2 id="expressions-title">A companion who responds with feeling</h2></div><p>Ten new expressions help ElderLove feel attentive, encouraging, and present.</p></div>
      <div className="expression-grid">
        {EXPRESSIONS.map(({ name, label }) => <figure key={name} className="expression-card"><img src={`/nova/${name}.png`} alt={`${label} ElderLove expression`} width="384" height="384" loading="lazy" /><figcaption>{label}</figcaption></figure>)}
      </div>
    </section>
  );
}

function Steps() {
  const steps = [
    { n: "01", title: "ElderLove checks in", text: "A familiar voice calls at the right time.", Icon: PhoneIcon },
    { n: "02", title: "The day stays on track", text: "Meds, wellbeing, and appointments are handled naturally.", Icon: CalendarIcon },
    { n: "03", title: "Family gets clarity", text: "Useful context appears when attention is actually needed.", Icon: PulseIcon },
  ];
  return (
    <section className="home-section steps-section" aria-labelledby="steps-title">
      <div className="section-heading"><div><p className="eyebrow">Simple by design</p><h2 id="steps-title">Support without the surveillance</h2></div></div>
      <div className="steps-grid">{steps.map(({ n, title, text, Icon }) => <article key={n} className="step-card"><span className="step-number">{n}</span><Icon className="w-7 h-7" /><h3>{title}</h3><p>{text}</p></article>)}</div>
      <div className="home-final-cta"><div><p className="eyebrow">Built for both sides of care</p><h2>Start with the view that feels like you.</h2></div><div className="home-actions"><Link href="/elder" className="home-button home-button-primary">I&apos;m Eleanor</Link><Link href="/family" className="home-button home-button-secondary">I&apos;m family</Link></div></div>
    </section>
  );
}

export default function Home() {
  const [order, setOrder] = useState<SectionId[]>(DEFAULT_ORDER);
  const [organizing, setOrganizing] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("elderlove-home-order") || "null");
      if (Array.isArray(saved) && saved.length === DEFAULT_ORDER.length && DEFAULT_ORDER.every((id) => saved.includes(id))) setOrder(saved);
    } catch { /* Keep the thoughtful default order. */ }
  }, []);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    window.localStorage.setItem("elderlove-home-order", JSON.stringify(next));
  }

  function reset() {
    setOrder(DEFAULT_ORDER);
    window.localStorage.removeItem("elderlove-home-order");
  }

  const sections: Record<SectionId, React.ReactNode> = { hero: <Hero />, care: <Care />, expressions: <Expressions />, steps: <Steps /> };
  return (
    <main className="home-page min-h-screen">
      <Nav />
      <div className="home-shell">
        <div className="organizer-bar"><span>Your homepage, your way.</span><button type="button" onClick={() => setOrganizing((value) => !value)} aria-expanded={organizing}>{organizing ? "Done" : "Reorganize"}</button></div>
        {organizing && (
          <section className="organizer-panel" aria-label="Reorganize homepage sections">
            <div><strong>Reorganize homepage</strong><p>Move sections into the order that is most useful to you. Changes are saved on this device.</p></div>
            <ol>{order.map((id, index) => <li key={id}><span>{SECTION_LABELS[id]}</span><span className="organizer-controls"><button onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${SECTION_LABELS[id]} up`}>↑</button><button onClick={() => move(index, 1)} disabled={index === order.length - 1} aria-label={`Move ${SECTION_LABELS[id]} down`}>↓</button></span></li>)}</ol>
            <button className="organizer-reset" onClick={reset}>Restore default</button>
          </section>
        )}
        {order.map((id) => <div key={id}>{sections[id]}</div>)}
        <footer className="home-footer"><HeartIcon className="w-5 h-5" /> ElderLove · Care with dignity, connection, and context.</footer>
      </div>
    </main>
  );
}
