import { Link } from 'react-router-dom';
import { Package, Mail, Phone, MapPin, Linkedin, Twitter, Facebook, Globe } from 'lucide-react';
import { LEGAL_INFO } from '../lib/legalInfo';
import { LEGAL_DOCUMENTS, LEGAL_NAV_ORDER } from '../lib/legalContent';
import { usePlatformSettings } from '../hooks/usePlatformSettings';
import LanguageSwitcher from './LanguageSwitcher';

export default function PublicFooter() {
  const { settings } = usePlatformSettings();
  const platformName = settings.name || LEGAL_INFO.platformName;
  const logo = settings.logo;
  const c = LEGAL_INFO.company;

  return (
    <footer className="bg-slate-950 text-slate-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid sm:grid-cols-2 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-4">
          <div className="flex items-center gap-2.5">
            {logo ? (
              <img src={logo} alt={platformName} className="w-10 h-10 rounded-lg object-contain bg-white/5 p-1" />
            ) : (
              <div className="p-2 rounded-lg bg-teal-600 text-white">
                <Package className="h-5 w-5" />
              </div>
            )}
            <div className="flex flex-col leading-tight">
              <span className="text-base font-bold text-white">{platformName}</span>
              <span className="text-[11px] tracking-wider uppercase text-slate-500">{LEGAL_INFO.productSuffix}</span>
            </div>
          </div>
          <p className="mt-5 text-sm leading-relaxed max-w-sm">
            Platforma e integruar per logjistike, depo, inventar, fatura dhe kontabilitet — projektuar per kompani moderne ne BE dhe Ballkan.
          </p>
          <div className="mt-6 space-y-2 text-sm">
            <div className="flex items-start gap-2.5">
              <MapPin className="h-4 w-4 mt-0.5 text-teal-400 flex-shrink-0" />
              <span>{c.address.street}, {c.address.postal} {c.address.city}, {c.address.country}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Mail className="h-4 w-4 text-teal-400 flex-shrink-0" />
              <a href={`mailto:${c.contact.email}`} className="hover:text-white">{c.contact.email}</a>
            </div>
            <div className="flex items-center gap-2.5">
              <Phone className="h-4 w-4 text-teal-400 flex-shrink-0" />
              <a href={`tel:${c.contact.phone.replace(/\s+/g, '')}`} className="hover:text-white">{c.contact.phone}</a>
            </div>
          </div>
          <div className="mt-6 flex items-center gap-3">
            <a href="#" aria-label="LinkedIn" className="p-2 rounded-lg bg-white/5 hover:bg-teal-600 hover:text-white transition-colors">
              <Linkedin className="h-4 w-4" />
            </a>
            <a href="#" aria-label="Twitter" className="p-2 rounded-lg bg-white/5 hover:bg-teal-600 hover:text-white transition-colors">
              <Twitter className="h-4 w-4" />
            </a>
            <a href="#" aria-label="Facebook" className="p-2 rounded-lg bg-white/5 hover:bg-teal-600 hover:text-white transition-colors">
              <Facebook className="h-4 w-4" />
            </a>
            <a href="#" aria-label="Website" className="p-2 rounded-lg bg-white/5 hover:bg-teal-600 hover:text-white transition-colors">
              <Globe className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="lg:col-span-2">
          <h4 className="text-white font-semibold mb-4 text-sm">Platforma</h4>
          <ul className="space-y-2.5 text-sm">
            <li><Link to="/#modules" className="hover:text-white transition-colors">Modulet</Link></li>
            <li><Link to="/#solutions" className="hover:text-white transition-colors">Zgjidhjet</Link></li>
            <li><Link to="/#plans" className="hover:text-white transition-colors">Planet</Link></li>
            <li><Link to="/login" className="hover:text-white transition-colors">Hyr</Link></li>
            <li><Link to="/register" className="hover:text-white transition-colors">Fillo Falas</Link></li>
          </ul>
        </div>

        <div className="lg:col-span-2">
          <h4 className="text-white font-semibold mb-4 text-sm">Kompania</h4>
          <ul className="space-y-2.5 text-sm">
            <li><Link to="/#why" className="hover:text-white transition-colors">Pse ne</Link></li>
            <li><Link to="/#resources" className="hover:text-white transition-colors">Burime</Link></li>
            <li><Link to="/legal/imprint" className="hover:text-white transition-colors">Impressum</Link></li>
            <li><a href={`mailto:${c.contact.email}`} className="hover:text-white transition-colors">Kontakt</a></li>
          </ul>
        </div>

        <div className="lg:col-span-4">
          <h4 className="text-white font-semibold mb-4 text-sm">Ligjore</h4>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            {LEGAL_NAV_ORDER.map((s) => (
              <li key={s}>
                <Link to={`/legal/${s}`} className="hover:text-white transition-colors">{LEGAL_DOCUMENTS[s].title}</Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col gap-3 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <span><span className="text-slate-300 font-semibold">Pronar:</span> {c.owner}</span>
            <span className="hidden sm:inline text-slate-700">•</span>
            <span><span className="text-slate-300 font-semibold">Kompania:</span> {c.legalName}, {c.countryShort}</span>
            <span className="hidden sm:inline text-slate-700">•</span>
            <span>{c.registry.court}</span>
            <span className="hidden sm:inline text-slate-700">•</span>
            <span>{c.registry.number}</span>
            <span className="hidden sm:inline text-slate-700">•</span>
            <span>{c.registry.vatId}</span>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <span className="text-slate-500 text-center sm:text-left">
            &copy; {LEGAL_INFO.copyrightYear} {platformName}. Te gjitha te drejtat e rezervuara. Krijuar nga {c.legalName}.
          </span>
          <LanguageSwitcher variant="minimal" />
        </div>
      </div>
    </footer>
  );
}
