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
    <header className="sticky top-0 z-40 backdrop-blur bg-[#0f0d2e]/80 border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
        <Link href="/" className="flex items-center gap-2 font-black text-xl">
          <HeartIcon className="w-6 h-6 text-rose-400" />
          <span className="hidden sm:inline">ElderLove</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          {LINKS.map(({ href, label, Icon }) => {
            const active = path === href;
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-sm sm:text-base font-semibold transition ${
                  active ? "bg-indigo-600 text-white" : "text-slate-300 hover:text-white hover:bg-white/10"
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
