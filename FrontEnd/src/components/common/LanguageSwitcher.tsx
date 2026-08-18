import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Phase O — Language switcher. Renders a small <select> that toggles between
 * Spanish and English; choice is persisted by i18next-browser-languagedetector.
 */
export const LanguageSwitcher: React.FC<{ className?: string }> = ({
  className = '',
}) => {
  const { i18n } = useTranslation();
  const current = i18n.resolvedLanguage || i18n.language || 'en';
  return (
    <label className={`inline-flex items-center gap-1 text-xs ${className}`}>
      <span className="sr-only">Language</span>
      <select
        aria-label="Language"
        value={current.startsWith('es') ? 'es' : 'en'}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
        className="bg-transparent border border-gray-300 rounded px-1.5 py-0.5"
      >
        <option value="en">EN</option>
        <option value="es">ES</option>
      </select>
    </label>
  );
};
