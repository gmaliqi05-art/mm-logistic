import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface PlatformSettings {
  logo: string;
  logoSocial: string;
  logoIcon: string;
  name: string;
  shortName: string;
}

const DEFAULT_LOGO = '/mm-logistic-logo.png';
const DEFAULT_LOGO_SOCIAL = '/mm-logistic-social.png';

function toAbsolute(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window === 'undefined') return url;
  return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function usePlatformSettings() {
  const [settings, setSettings] = useState<PlatformSettings>({
    logo: DEFAULT_LOGO,
    logoSocial: DEFAULT_LOGO_SOCIAL,
    logoIcon: DEFAULT_LOGO,
    name: 'MM Logistic',
    shortName: 'MML',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    updateDynamicMetaTags();
  }, [settings]);

  async function loadSettings() {
    try {
      const { data } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', [
          'platform_logo',
          'platform_logo_social',
          'platform_logo_icon',
          'platform_name',
          'platform_short_name',
        ]);

      if (data) {
        const newSettings: PlatformSettings = {
          logo: DEFAULT_LOGO,
          logoSocial: DEFAULT_LOGO_SOCIAL,
          logoIcon: DEFAULT_LOGO,
          name: 'MM Logistic',
          shortName: 'MML',
        };

        data.forEach((setting) => {
          if (setting.key === 'platform_logo') newSettings.logo = setting.value || DEFAULT_LOGO;
          if (setting.key === 'platform_logo_social') newSettings.logoSocial = setting.value || DEFAULT_LOGO_SOCIAL;
          if (setting.key === 'platform_logo_icon') newSettings.logoIcon = setting.value || newSettings.logo;
          if (setting.key === 'platform_name') newSettings.name = setting.value || 'MM Logistic';
          if (setting.key === 'platform_short_name') newSettings.shortName = setting.value || 'MML';
        });

        setSettings(newSettings);
      }
    } catch (error) {
      console.error('Error loading platform settings:', error);
    } finally {
      setLoading(false);
    }
  }

  function updateDynamicMetaTags() {
    const iconUrl = settings.logoIcon || settings.logo || DEFAULT_LOGO;
    const socialUrl = toAbsolute(settings.logoSocial || settings.logo || DEFAULT_LOGO_SOCIAL);
    const platformName = settings.name || 'MM Logistic';
    const tagline = 'Smart Logistics. Clear Numbers.';

    document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach((el) => {
      (el as HTMLLinkElement).href = iconUrl;
    });

    const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
    if (appleTouchIcon) appleTouchIcon.href = iconUrl;

    document.title = `${platformName} - ${tagline}`;

    updateMetaTag('property', 'og:title', `${platformName} - ${tagline}`);
    updateMetaTag('property', 'og:image', socialUrl);
    updateMetaTag('property', 'og:image:secure_url', socialUrl);
    updateMetaTag('name', 'twitter:title', `${platformName} - ${tagline}`);
    updateMetaTag('name', 'twitter:image', socialUrl);
    updateMetaTag('name', 'apple-mobile-web-app-title', platformName);
    updateMetaTag('name', 'application-name', platformName);
  }

  function updateMetaTag(attribute: string, key: string, value: string) {
    let meta = document.querySelector(`meta[${attribute}="${key}"]`) as HTMLMetaElement;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute(attribute, key);
      document.head.appendChild(meta);
    }
    meta.content = value;
  }

  return { settings, loading };
}
