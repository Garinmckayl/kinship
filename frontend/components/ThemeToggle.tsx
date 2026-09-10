"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const saved = window.localStorage.getItem("elderlove-theme");
    const next = saved === "dark" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    window.localStorage.setItem("elderlove-theme", next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="theme-toggle"
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
    >
      <span aria-hidden="true">{theme === "light" ? "☀" : "☾"}</span>
      <span className="hidden lg:inline">{theme === "light" ? "Light" : "Dark"}</span>
    </button>
  );
}
