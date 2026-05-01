import { Package } from 'lucide-react';
import { usePlatformSettings } from '../hooks/usePlatformSettings';

interface PlatformLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
  nameClassName?: string;
  containerClassName?: string;
  iconContainerClassName?: string;
  variant?: 'light' | 'dark';
}

const sizeMap = {
  sm: { img: 'w-8 h-8', icon: 'h-4 w-4', container: 'p-1.5' },
  md: { img: 'w-10 h-10', icon: 'h-5 w-5', container: 'p-2' },
  lg: { img: 'w-12 h-12', icon: 'h-7 w-7', container: 'p-2.5' },
};

export default function PlatformLogo({
  size = 'md',
  showName = true,
  nameClassName = 'text-lg font-bold text-slate-800',
  containerClassName = 'flex items-center gap-2.5',
  iconContainerClassName = 'bg-teal-600 rounded-xl',
  variant = 'light',
}: PlatformLogoProps) {
  const { settings } = usePlatformSettings();
  const s = sizeMap[size];
  const src = variant === 'dark' ? settings.logoSocial || settings.logo : settings.logo;

  return (
    <div className={containerClassName}>
      {src ? (
        <img
          src={src}
          alt={settings.name}
          className={`${s.img} rounded-xl object-contain`}
        />
      ) : (
        <div className={`${s.container} ${iconContainerClassName}`}>
          <Package className={`${s.icon} text-white`} />
        </div>
      )}
      {showName && (
        <span className={nameClassName}>{settings.name}</span>
      )}
    </div>
  );
}
