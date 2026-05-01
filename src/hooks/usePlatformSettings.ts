import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface PlatformSettings {
  logo: string;
  name: string;
  shortName: string;
}

export function usePlatformSettings() {
  const [settings, setSettings] = useState<PlatformSettings>({
    logo: '/ChatGPT_Image_May_1,_2026,_11_16_07_AM.png',
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
        .in('key', ['platform_logo', 'platform_name', 'platform_short_name']);

      if (data) {
        const fallbackLogo = '/ChatGPT_Image_May_1,_2026,_11_16_07_AM.png';
        const newSettings: PlatformSettings = {
          logo: fallbackLogo,
          name: 'MM Logistic',
          shortName: 'MML',
        };

        data.forEach((setting) => {
          if (setting.key === 'platform_logo') newSettings.logo = setting.value || fallbackLogo;
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
    const logoUrl = settings.logo || '/ChatGPT_Image_May_1,_2026,_11_16_07_AM.png';
    const platformName = settings.name || 'MM Logistic';
    const tagline = 'Smart Logistics. Clear Numbers.';

    const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
    if (favicon) {
      favicon.href = logoUrl;
    }

    const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement;
    if (appleTouchIcon) {
      appleTouchIcon.href = logoUrl;
    }

    document.title = `${platformName} - ${tagline}`;

    updateMetaTag('property', 'og:title', `${platformName} - ${tagline}`);
    updateMetaTag('property', 'og:image', logoUrl);
    updateMetaTag('name', 'twitter:title', `${platformName} - ${tagline}`);
    updateMetaTag('name', 'twitter:image', logoUrl);
    updateMetaTag('name', 'apple-mobile-web-app-title', platformName);
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
