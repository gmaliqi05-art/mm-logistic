import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, MapPin, Search, X } from 'lucide-react';
import { useCities, useCountries, usePostalCodes } from '../../hooks/useLocationData';
import type { City, Country, LocationSelection, PostalCode } from '../../types/location';

interface BaseSelectProps<T> {
  value: T | null;
  onChange: (value: T | null) => void;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  className?: string;
  required?: boolean;
}

function useOutsideClick(ref: React.RefObject<HTMLElement>, onOutside: () => void) {
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [ref, onOutside]);
}

function Field({
  label,
  required,
  children,
}: {
  label?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium text-gray-600">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-3 py-6 text-center text-xs text-gray-400">{text}</div>;
}

function ErrorState({ text }: { text: string }) {
  return (
    <div className="px-3 py-4 text-xs text-red-600 bg-red-50 rounded-md m-2">{text}</div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-gray-500">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span>Loading...</span>
    </div>
  );
}

export function CountrySelect({
  value,
  onChange,
  disabled,
  placeholder = 'Select country',
  label,
  className,
  required,
}: BaseSelectProps<Country>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  useOutsideClick(wrapRef, () => setOpen(false));
  const { data, status, error } = useCountries(query);

  return (
    <Field label={label} required={required}>
      <div ref={wrapRef} className={`relative ${className ?? ''}`}>
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
        >
          <span className="flex items-center gap-2 min-w-0">
            {value ? (
              <>
                <span className="text-lg leading-none">{value.flag_emoji}</span>
                <span className="truncate">{value.name}</span>
                <span className="text-xs text-gray-400 font-mono">{value.code}</span>
              </>
            ) : (
              <span className="text-gray-400 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {placeholder}
              </span>
            )}
          </span>
          <span className="flex items-center gap-1 flex-shrink-0">
            {value && !disabled && (
              <span
                role="button"
                aria-label="Clear"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
                className="p-0.5 text-gray-400 hover:text-gray-700 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </span>
            )}
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </span>
        </button>
        {open && (
          <div
            role="listbox"
            className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-hidden"
          >
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search country..."
                  aria-label="Search country"
                  className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {status === 'loading' && <LoadingState />}
              {status === 'error' && <ErrorState text={error ?? 'Failed to load'} />}
              {status === 'success' && data.length === 0 && <EmptyState text="No countries" />}
              {data.map((c) => {
                const selected = value?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(c);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-teal-50 ${
                      selected ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    <span className="text-lg leading-none">{c.flag_emoji}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-gray-400 font-mono">{c.code}</span>
                    {selected && <Check className="w-4 h-4 text-teal-600" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Field>
  );
}

export function CitySelect({
  countryId,
  value,
  onChange,
  disabled,
  placeholder = 'Select city',
  label,
  className,
  required,
}: BaseSelectProps<City> & { countryId: string | null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  useOutsideClick(wrapRef, () => setOpen(false));
  const { data, status, error } = useCities(countryId, query);
  const isDisabled = disabled || !countryId;

  return (
    <Field label={label} required={required}>
      <div ref={wrapRef} className={`relative ${className ?? ''}`}>
        <button
          type="button"
          disabled={isDisabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
        >
          <span className="truncate">
            {value ? value.name : <span className="text-gray-400">{placeholder}</span>}
          </span>
          <span className="flex items-center gap-1 flex-shrink-0">
            {value && !isDisabled && (
              <span
                role="button"
                aria-label="Clear"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
                className="p-0.5 text-gray-400 hover:text-gray-700 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </span>
            )}
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </span>
        </button>
        {open && !isDisabled && (
          <div
            role="listbox"
            className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-hidden"
          >
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search city..."
                  aria-label="Search city"
                  className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {status === 'loading' && <LoadingState />}
              {status === 'error' && <ErrorState text={error ?? 'Failed to load'} />}
              {status === 'success' && data.length === 0 && <EmptyState text="No cities" />}
              {data.map((c) => {
                const selected = value?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(c);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-teal-50 ${
                      selected ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    <span className="flex-1 truncate">{c.name}</span>
                    {selected && <Check className="w-4 h-4 text-teal-600" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Field>
  );
}

export function PostalCodeSelect({
  cityId,
  value,
  onChange,
  disabled,
  placeholder = 'Select postal code',
  label,
  className,
  required,
}: BaseSelectProps<PostalCode> & { cityId: string | null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  useOutsideClick(wrapRef, () => setOpen(false));
  const { data, status, error } = usePostalCodes(cityId, query);
  const isDisabled = disabled || !cityId;

  return (
    <Field label={label} required={required}>
      <div ref={wrapRef} className={`relative ${className ?? ''}`}>
        <button
          type="button"
          disabled={isDisabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
        >
          <span className="truncate flex items-center gap-2">
            {value ? (
              <>
                <span className="font-mono">{value.code}</span>
                {value.area_name && (
                  <span className="text-gray-500 truncate">{value.area_name}</span>
                )}
              </>
            ) : (
              <span className="text-gray-400">{placeholder}</span>
            )}
          </span>
          <span className="flex items-center gap-1 flex-shrink-0">
            {value && !isDisabled && (
              <span
                role="button"
                aria-label="Clear"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
                className="p-0.5 text-gray-400 hover:text-gray-700 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </span>
            )}
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </span>
        </button>
        {open && !isDisabled && (
          <div
            role="listbox"
            className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-hidden"
          >
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search postal code..."
                  aria-label="Search postal code"
                  className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {status === 'loading' && <LoadingState />}
              {status === 'error' && <ErrorState text={error ?? 'Failed to load'} />}
              {status === 'success' && data.length === 0 && <EmptyState text="No postal codes" />}
              {data.map((p) => {
                const selected = value?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(p);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-teal-50 ${
                      selected ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    <span className="font-mono w-16">{p.code}</span>
                    {p.area_name && (
                      <span className="flex-1 truncate text-gray-500">{p.area_name}</span>
                    )}
                    {selected && <Check className="w-4 h-4 text-teal-600" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Field>
  );
}

interface LocationSelectorProps {
  value: LocationSelection;
  onChange: (next: LocationSelection) => void;
  disabled?: boolean;
  required?: boolean;
  labels?: { country?: string; city?: string; postalCode?: string };
  layout?: 'horizontal' | 'vertical';
}

export function LocationSelector({
  value,
  onChange,
  disabled,
  required,
  labels,
  layout = 'horizontal',
}: LocationSelectorProps) {
  const gridCls =
    layout === 'horizontal'
      ? 'grid grid-cols-1 sm:grid-cols-3 gap-3'
      : 'flex flex-col gap-3';

  return (
    <div className={gridCls}>
      <CountrySelect
        value={value.country}
        onChange={(country) => onChange({ country, city: null, postalCode: null })}
        disabled={disabled}
        required={required}
        label={labels?.country ?? 'Country'}
      />
      <CitySelect
        countryId={value.country?.id ?? null}
        value={value.city}
        onChange={(city) => onChange({ ...value, city, postalCode: null })}
        disabled={disabled}
        required={required}
        label={labels?.city ?? 'City'}
      />
      <PostalCodeSelect
        cityId={value.city?.id ?? null}
        value={value.postalCode}
        onChange={(postalCode) => onChange({ ...value, postalCode })}
        disabled={disabled}
        required={required}
        label={labels?.postalCode ?? 'Postal code'}
      />
    </div>
  );
}

export const emptyLocationSelection: LocationSelection = {
  country: null,
  city: null,
  postalCode: null,
};

export function formatLocation(sel: LocationSelection): string {
  const parts = [
    sel.postalCode?.code,
    sel.city?.name,
    sel.country?.name,
  ].filter(Boolean);
  return parts.join(', ');
}
