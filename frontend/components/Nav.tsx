"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeartIcon, PhoneIcon, CalendarIcon, PulseIcon, ChatIcon } from "./icons";

const LINKS = [
  { href: "/elder", label: "Eleanor", Icon: PhoneIcon },
  { href: "/calendar", label: "Calendar", Icon: CalendarIcon },
  { href: "/health", label: "Health", Icon: PulseIcon },
  { href: "/family", label: "Family", Icon: ChatIcon },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#080b18]/80 border-b border-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.2)]">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
        <Link href="/" className="flex items-center gap-2 font-black text-xl">
          <HeartIcon className="w-6 h-6 text-rose-400" />
          <span className="hidden sm:inline tracking-tight">ElderLove</span><span className="hidden xl:inline text-xs font-semibold text-teal-200/80 border-l border-white/15 pl-2">KINSHIP GUARDIAN</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
          {LINKS.map(({ href, label, Icon }) => {
            const active = path === href;
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-sm sm:text-base font-semibold transition ${
                  active ? "bg-white/10 text-white ring-1 ring-teal-300/30 shadow-[0_0_20px_rgba(20,184,166,0.16)]" : "text-slate-300 hover:text-white hover:bg-white/10"
                }`}>
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
