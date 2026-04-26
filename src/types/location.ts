export interface Country {
  id: string;
  name: string;
  code: string;
  flag_emoji: string;
  region: string;
}

export interface City {
  id: string;
  country_id: string;
  name: string;
  admin_area: string;
}

export interface PostalCode {
  id: string;
  city_id: string;
  code: string;
  area_name: string;
}

export interface LocationSelection {
  country: Country | null;
  city: City | null;
  postalCode: PostalCode | null;
}

export type LocationFetchState = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncResource<T> {
  data: T;
  status: LocationFetchState;
  error: string | null;
}
