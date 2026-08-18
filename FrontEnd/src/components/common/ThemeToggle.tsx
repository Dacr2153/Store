import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../store/ThemeContext";

export const ThemeToggle: React.FC<{ className?: string }> = ({ className = "" }) => {
  const { t } = useTranslation();
  const { mode, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className={`p-2 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors ${className}`}
      aria-label={t("theme.toggle")}
      title={t("theme.toggle")}
    >
      {mode === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
};
