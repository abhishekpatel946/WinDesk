import { Suspense, useEffect, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useScope } from "../api/client";
import { shortDate } from "../lib/format";
import { DEFAULT_DATE, useControls } from "../state/controls";
import { DataSourceControl, ThemeToggle } from "./SourceTheme";
import { Loading } from "./ui";

const NAV = [
  { to: "/", label: "Decision cockpit", desc: "What to expect tomorrow" },
  { to: "/accuracy", label: "Accuracy scorecard", desc: "How good is the forecast" },
  { to: "/drift", label: "Forecast drift", desc: "How runs evolved" },
  { to: "/buffer", label: "Procurement buffer", desc: "Wind you can count on" },
  { to: "/explorer", label: "Lead-time explorer", desc: "Any horizon, any range" },
];

/** Keep the selected delivery day inside the served dataset's range; live opens on tomorrow. */
function useKeepDateInScope() {
  const scope = useScope();
  const { deliveryDate, setDeliveryDate } = useControls();
  useEffect(() => {
    if (!scope || (deliveryDate >= scope.first && deliveryDate <= scope.last)) return;
    if (scope.served === "live") setDeliveryDate(scope.last);
    else setDeliveryDate(DEFAULT_DATE >= scope.first && DEFAULT_DATE <= scope.last ? DEFAULT_DATE : scope.last);
  }, [scope, deliveryDate, setDeliveryDate]);
  return scope;
}

export function Layout() {
  const scope = useKeepDateInScope();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-slate-950 px-4 py-6 md:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-50">WindDesk</div>
            <div className="text-[11px] text-slate-500">GB day-ahead wind intelligence</div>
          </div>
          <ThemeToggle />
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 transition ${isActive ? "bg-sky-500/10 text-sky-200" : "text-slate-300 hover:bg-slate-900"}`
              }
            >
              <div className="text-sm font-medium">{n.label}</div>
              <div className="text-[11px] text-slate-500">{n.desc}</div>
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-4 px-2">
          <DataSourceControl />
          <div className="space-y-1 text-[11px] leading-relaxed text-slate-500">
            <div>Period: {scope ? `${scope.label} (deliveries ${shortDate(scope.first)} – ${shortDate(scope.last)})` : "…"}</div>
            <div>Source: Elexon BMRS FUELHH &amp; WINDFOR (national wind)</div>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3 md:hidden">
          <DataSourceControl />
          <ThemeToggle />
        </div>
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-800 px-4 py-2 md:hidden">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-md px-2.5 py-1 text-xs ${isActive ? "bg-sky-500/15 text-sky-200" : "text-slate-400"}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <Suspense fallback={<Loading />}>
          <Outlet />
        </Suspense>
        <footer className="mt-auto border-t border-slate-800 px-4 py-4 text-center text-xs text-slate-500">
          Made with <span className="text-rose-500" role="img" aria-label="love">❤</span> by Abhishek Patel
        </footer>
      </div>
    </div>
  );
}

export function Page({
  title,
  lead,
  controls,
  children,
}: {
  title: string;
  lead: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">
      <header className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">{lead}</p>
        </div>
        {controls && <div className="flex flex-wrap items-center gap-4">{controls}</div>}
      </header>
      <div className="space-y-5">{children}</div>
    </main>
  );
}
