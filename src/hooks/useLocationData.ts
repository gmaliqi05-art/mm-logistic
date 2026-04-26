import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { AsyncResource, City, Country, PostalCode } from '../types/location';

const MIN_SEARCH = 2;
const DEBOUNCE_MS = 250;

const countryCache: { all: Country[] | null } = { all: null };
const cityCache = new Map<string, City[]>();
const postalCache = new Map<string, PostalCode[]>();

function useDebounced<T>(value: T, delay: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

export function useCountries(search: string) {
  const q = useDebounced(search.trim(), DEBOUNCE_MS);
  const [state, setState] = useState<AsyncResource<Country[]>>({
    data: countryCache.all ?? [],
    status: countryCache.all ? 'success' : 'idle',
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (countryCache.all) {
        setState({ data: countryCache.all, status: 'success', error: null });
        return;
      }
      setState((s) => ({ ...s, status: 'loading', error: null }));
      const { data, error } = await supabase
        .from('countries')
        .select('id, name, code, flag_emoji, region')
        .order('name');
      if (cancelled) return;
      if (error) {
        setState({ data: [], status: 'error', error: error.message });
        return;
      }
      countryCache.all = (data ?? []) as Country[];
      setState({ data: countryCache.all, status: 'success', error: null });
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!q) return state.data;
    if (q.length < MIN_SEARCH) return state.data;
    const n = q.toLowerCase();
    return state.data.filter(
      (c) => c.name.toLowerCase().includes(n) || c.code.toLowerCase().includes(n),
    );
  }, [state.data, q]);

  return { ...state, data: filtered };
}

export function useCities(countryId: string | null, search: string) {
  const q = useDebounced(search.trim(), DEBOUNCE_MS);
  const [state, setState] = useState<AsyncResource<City[]>>({
    data: [],
    status: 'idle',
    error: null,
  });
  const reqId = useRef(0);

  useEffect(() => {
    if (!countryId) {
      setState({ data: [], status: 'idle', error: null });
      return;
    }
    const cached = cityCache.get(countryId);
    if (cached) {
      setState({ data: cached, status: 'success', error: null });
      return;
    }
    const my = ++reqId.current;
    setState({ data: [], status: 'loading', error: null });
    supabase
      .from('cities')
      .select('id, country_id, name, admin_area')
      .eq('country_id', countryId)
      .order('name')
      .then(({ data, error }) => {
        if (my !== reqId.current) return;
        if (error) {
          setState({ data: [], status: 'error', error: error.message });
          return;
        }
        const rows = (data ?? []) as City[];
        cityCache.set(countryId, rows);
        setState({ data: rows, status: 'success', error: null });
      });
  }, [countryId]);

  const filtered = useMemo(() => {
    if (!q || q.length < MIN_SEARCH) return state.data;
    const n = q.toLowerCase();
    return state.data.filter((c) => c.name.toLowerCase().includes(n));
  }, [state.data, q]);

  return { ...state, data: filtered };
}

export function usePostalCodes(cityId: string | null, search: string) {
  const q = useDebounced(search.trim(), DEBOUNCE_MS);
  const [state, setState] = useState<AsyncResource<PostalCode[]>>({
    data: [],
    status: 'idle',
    error: null,
  });
  const reqId = useRef(0);

  useEffect(() => {
    if (!cityId) {
      setState({ data: [], status: 'idle', error: null });
      return;
    }
    const cached = postalCache.get(cityId);
    if (cached) {
      setState({ data: cached, status: 'success', error: null });
      return;
    }
    const my = ++reqId.current;
    setState({ data: [], status: 'loading', error: null });
    supabase
      .from('postal_codes')
      .select('id, city_id, code, area_name')
      .eq('city_id', cityId)
      .order('code')
      .then(({ data, error }) => {
        if (my !== reqId.current) return;
        if (error) {
          setState({ data: [], status: 'error', error: error.message });
          return;
        }
        const rows = (data ?? []) as PostalCode[];
        postalCache.set(cityId, rows);
        setState({ data: rows, status: 'success', error: null });
      });
  }, [cityId]);

  const filtered = useMemo(() => {
    if (!q || q.length < MIN_SEARCH) return state.data;
    const n = q.toLowerCase();
    return state.data.filter(
      (p) => p.code.toLowerCase().includes(n) || p.area_name.toLowerCase().includes(n),
    );
  }, [state.data, q]);

  return { ...state, data: filtered };
}

export function useLocationData() {
  const clearCache = useCallback(() => {
    countryCache.all = null;
    cityCache.clear();
    postalCache.clear();
  }, []);
  return { useCountries, useCities, usePostalCodes, clearCache };
}
