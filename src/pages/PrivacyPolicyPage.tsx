import { Link } from 'react-router-dom';
import { ArrowLeft, Package, Shield, MapPin, Phone, Mail } from 'lucide-react';
import { useTranslation } from '../i18n';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function PrivacyPolicyPage() {
  const { t } = useTranslation();

  const sections = [
    { title: t('privacy.section1Title'), content: t('privacy.section1Text') },
    { title: t('privacy.section2Title'), content: t('privacy.section2Text') },
    { title: t('privacy.section3Title'), content: t('privacy.section3Text') },
    { title: t('privacy.section4Title'), content: t('privacy.section4Text') },
    { title: t('privacy.section5Title'), content: t('privacy.section5Text') },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="p-2 bg-teal-600 rounded-xl">
                <Package className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-slate-800">MM Logistic</span>
            </Link>
            <div className="flex items-center gap-4">
              <LanguageSwitcher />
              <Link
                to="/"
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-teal-600 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('privacy.backToHome')}
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 text-teal-700 text-sm font-medium mb-4">
            <Shield className="h-4 w-4" />
            Dokument Ligjor
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">
            {t('privacy.title')}
          </h1>
          <p className="mt-3 text-slate-500">
            {t('privacy.lastUpdated')}: {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 sm:p-8 lg:p-10 space-y-10">
            {sections.map((section) => (
              <div key={section.title}>
                <h2 className="text-xl font-bold text-slate-800 mb-4">{section.title}</h2>
                <div className="text-slate-600 leading-relaxed whitespace-pre-line text-sm">
                  {section.content}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Informacione te Kompanise</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-teal-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-slate-600">
                <p className="font-medium text-slate-800">Adresa</p>
                <p>Rr. Epopeja e Jezercit Nr. 402</p>
                <p>Ferizaj 70000, Kosove</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="h-5 w-5 text-teal-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-slate-600">
                <p className="font-medium text-slate-800">Telefon</p>
                <p>+383 49 400 006</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-teal-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-slate-600">
                <p className="font-medium text-slate-800">Email</p>
                <p>info@mm-logistic.eu</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-slate-500 text-sm">
              &copy; {new Date().getFullYear()} MM Logistic. Te gjitha te drejtat e rezervuara.
            </p>
            <Link to="/" className="text-slate-500 hover:text-teal-600 text-sm transition-colors">
              {t('privacy.backToHome')}
            </Link>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 text-center">
            <p className="text-slate-400 text-xs">
              Krijuar nga <span className="text-slate-500 font-medium">MM Logistic</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
