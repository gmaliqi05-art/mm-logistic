import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Globe } from 'lucide-react';
import { useTranslation } from '../i18n';
import { languageNames, languageFlags } from '../i18n';
import type { Language } from '../i18n';

const languages: Language[] = ['sq', 'en', 'de', 'fr'];

type Variant = 'default' | 'header' | 'minimal';

interface Placement {
  vertical: 'up' | 'down';
  horizontal: 'left' | 'right';
}

export default function LanguageSwitcher({ variant = 'default' }: { variant?: Variant }) {
  const { language, setLanguage } = useTranslation();
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement>({ vertical: 'down', horizontal: 'right' });
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointer(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer, { passive: true });
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const menuHeight = 160;
    const menuWidth = 130;
    const spaceBelow = vh - rect.bottom;
    const spaceRight = vw - rect.right;
    setPlacement({
      vertical: spaceBelow < menuHeight && rect.top > menuHeight ? 'up' : 'down',
      horizontal: spaceRight < menuWidth ? 'left' : 'right',
    });
  }, [open]);

  const menuVerticalClass = placement.vertical === 'up' ? 'bottom-full mb-1' : 'top-full mt-1';
  const menuHorizontalClass = placement.horizontal === 'left' ? 'right-0' : 'left-0';

  const buttonBase =
    'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors select-none touch-manipulation';

  const renderMenu = (itemClass: (active: boolean) => string, menuClass: string) => (
    <div
      role="menu"
      aria-label="Select language"
      className={`absolute ${menuVerticalClass} ${menuHorizontalClass} w-[7.5rem] max-w-[calc(100vw-1rem)] rounded-lg shadow-xl py-0.5 z-[60] ${menuClass}`}
    >
      {languages.map((lang) => (
        <button
          key={lang}
          type="button"
          role="menuitemradio"
          aria-checked={lang === language}
          onClick={() => {
            setLanguage(lang);
            setOpen(false);
          }}
          className={itemClass(lang === language)}
        >
          <span className="text-[10px] font-bold w-6 tracking-wide">{languageFlags[lang]}</span>
          <span className="truncate text-xs">{languageNames[lang]}</span>
        </button>
      ))}
    </div>
  );

  if (variant === 'minimal') {
    return (
      <div className="relative inline-block" ref={ref}>
        <button
          ref={btnRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Change language"
          onClick={() => setOpen((v) => !v)}
          className={`${buttonBase} min-h-[40px] min-w-[40px] px-2.5 py-1.5 text-sm text-teal-200 hover:bg-teal-800 hover:text-white active:bg-teal-700`}
        >
          <Globe className="w-4 h-4 flex-shrink-0" />
          <span className="text-[11px] font-bold">{languageFlags[language]}</span>
        </button>
        {open &&
          renderMenu(
            (active) =>
              `w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors text-left ${
                active ? 'bg-teal-700 text-white' : 'text-teal-200 hover:bg-teal-700 hover:text-white'
              }`,
            'bg-teal-800 border border-teal-700'
          )}
      </div>
    );
  }

  if (variant === 'header') {
    return (
      <div className="relative inline-block flex-shrink-0" ref={ref}>
        <button
          ref={btnRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Change language"
          onClick={() => setOpen((v) => !v)}
          className={`${buttonBase} min-h-[40px] min-w-[40px] px-2.5 py-2 text-gray-600 hover:bg-gray-100 active:bg-gray-200`}
        >
          <Globe className="w-4 h-4 flex-shrink-0" />
          <span className="text-[11px] font-bold leading-none">{languageFlags[language]}</span>
        </button>
        {open &&
          renderMenu(
            (active) =>
              `w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors text-left ${
                active ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
              }`,
            'bg-white border border-gray-200'
          )}
      </div>
    );
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Change language"
        onClick={() => setOpen((v) => !v)}
        className={`${buttonBase} min-h-[40px] gap-2 px-3 py-2 border border-gray-300 bg-white hover:bg-gray-50 text-sm text-gray-700`}
      >
        <Globe className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <span className="text-[11px] font-bold">{languageFlags[language]}</span>
        <span className="hidden sm:inline">{languageNames[language]}</span>
      </button>
      {open &&
        renderMenu(
          (active) =>
            `w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors text-left ${
              active ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
            }`,
          'bg-white border border-gray-200'
        )}
    </div>
  );
}
