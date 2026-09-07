"use client";

// shadcn-style primitives (new-york aesthetic, dark palette, zero extra deps).

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-gradient-to-b from-white/[0.09] to-white/[0.035] ring-1 ring-white/10 shadow-[0_20px_70px_rgba(0,0,0,0.18)] p-5 ${className ?? ""}`}>{children}</div>;
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-bold text-xl mb-3">{children}</h2>;
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 text-white shadow-[0_8px_24px_rgba(99,102,241,0.28)]",
  secondary: "bg-white/10 hover:bg-white/15 text-white ring-1 ring-white/15",
  ghost: "text-slate-300 hover:text-white hover:bg-white/5",
  danger: "bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-400 hover:to-red-400 text-white shadow-[0_8px_24px_rgba(244,63,94,0.25)]",
};

export function Btn({ children, onClick, variant, className, type }: {
  children: React.ReactNode; onClick?: () => void; variant?: BtnVariant; className?: string; type?: "button" | "submit";
}) {
  return (
    <button type={type ?? "button"} onClick={onClick}
      className={`px-4 py-2 rounded-xl font-semibold transition duration-200 hover:-translate-y-0.5 active:translate-y-0 ${BTN[variant ?? "primary"]} ${className ?? ""}`}>
      {children}
    </button>
  );
}

export function Badge({ children, tone }: { children: React.ReactNode; tone?: "green" | "amber" | "red" | "sky" | "slate" }) {
  const t = { green: "text-emerald-300 bg-emerald-500/10", amber: "text-amber-300 bg-amber-500/10", red: "text-red-300 bg-red-500/10", sky: "text-sky-300 bg-sky-500/10", slate: "text-slate-300 bg-white/5" }[tone ?? "slate"];
  return <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-lg ${t}`}>{children}</span>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm text-slate-400">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props}
      className={`w-full bg-slate-950/35 ring-1 ring-white/10 focus:ring-2 focus:ring-indigo-400/70 rounded-xl px-3 py-2 outline-none placeholder:text-slate-500 text-white transition ${props.className ?? ""}`} />
  );
}

// Month calendar (shadcn calendar aesthetic): marks days with appointments.
export function CalendarMonth({ year, month, marks, selected, onPick }: {
  year: number; month: number; // month 0-11
  marks: Record<number, number>; // day -> count
  selected?: number;
  onPick?: (day: number) => void;
}) {
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return (
    <div>
      <div className="grid grid-cols-7 text-center text-xs text-slate-400 mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <span key={d} className="py-1">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) =>
          d === null ? <span key={i} /> : (
            <button key={i} onClick={() => onPick?.(d)}
              className={`aspect-square rounded-xl text-sm grid place-items-center relative transition ${
                selected === d ? "bg-indigo-600 text-white font-bold" : "hover:bg-white/10 text-slate-200"
              }`}>
              {d}
              {(marks[d] ?? 0) > 0 && <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-emerald-400" />}
            </button>
          )
        )}
      </div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div className="flex gap-1 bg-slate-950/35 ring-1 ring-white/10 rounded-2xl p-1 shadow-inner">
      {tabs.map((t) => (
        <button key={t} onClick={() => onChange(t)}
          className={`flex-1 px-3 py-2 rounded-xl text-sm font-bold transition ${active === t ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg" : "text-slate-300 hover:text-white hover:bg-white/5"}`}>
          {t}
        </button>
      ))}
    </div>
  );
}
