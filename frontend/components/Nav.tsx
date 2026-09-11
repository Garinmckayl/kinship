"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeartIcon, PhoneIcon, CalendarIcon, PulseIcon, ChatIcon } from "./icons";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { href: "/elder", label: "Eleanor", Icon: PhoneIcon },
  { href: "/calendar", label: "Calendar", Icon: CalendarIcon },
  { href: "/health", label: "Health", Icon: PulseIcon },
  { href: "/family", label: "Family", Icon: ChatIcon },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="site-nav sticky top-0 z-40 backdrop-blur-xl border-b shadow-[0_12px_36px_rgba(0,0,0,0.08)]">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2">
        <Link href="/" className="flex items-center gap-2 font-black text-xl">
          <HeartIcon className="w-6 h-6 text-rose-400" />
          <span className="hidden sm:inline tracking-tight">Kinship</span><span className="hidden xl:inline text-xs font-semibold text-teal-200/80 border-l border-white/15 pl-2">CARE THAT CLOSES THE LOOP</span>
        </Link>
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
        <nav className="flex min-w-0 items-center gap-1 sm:gap-2 overflow-x-auto" aria-label="Primary navigation">
          {LINKS.map(({ href, label, Icon }) => {
            const active = path === href;
            return (
              <Link key={href} href={href}
                className={`nav-link flex shrink-0 items-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-xl text-sm sm:text-base font-semibold transition ${
                  active ? "is-active ring-1 ring-teal-300/30 shadow-[0_0_20px_rgba(20,184,166,0.16)]" : ""
                }`}>
                <Icon className="w-5 h-5" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
        <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
