import { NavLink, Outlet } from 'react-router-dom';
import { Mail, FileText, Palette, Settings2, Send, Clock } from 'lucide-react';

const tabs = [
  { to: '/company/email/templates', icon: FileText, label: 'Templates' },
  { to: '/company/email/branding', icon: Palette, label: 'Branding' },
  { to: '/company/email/automation', icon: Settings2, label: 'Automatizime' },
  { to: '/company/email/send', icon: Send, label: 'Dergo Email' },
  { to: '/company/email/log', icon: Clock, label: 'Historiku' },
];

export default function EmailAutomationLayout() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
            <Mail className="w-5 h-5 text-teal-700" />
          </div>
          Email & Automatizime
        </h1>
        <p className="text-gray-500 mt-1 ml-[52px]">
          Menaxhoni template-t, branding-un, automatizimin dhe dergimin e email-eve per klientet tuaj
        </p>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={false}
              className={({ isActive }) =>
                `inline-flex items-center gap-2 px-4 py-3 border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`
              }
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <Outlet />
    </div>
  );
}
