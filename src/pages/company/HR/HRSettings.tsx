import { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, Calendar, Palette } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useTranslation } from '../../../i18n';

interface LeaveType {
  id: string;
  code: string;
  name_sq: string;
  name_en: string;
  name_de: string;
  name_fr: string;
  is_paid: boolean;
  requires_approval: boolean;
  requires_medical_certificate: boolean;
  max_days_per_year: number | null;
  color: string;
  is_active: boolean;
}

interface PublicHoliday {
  id: string;
  date: string;
  name: string;
  is_paid: boolean;
}

export default function HRSettings() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'types' | 'holidays'>('types');
  const [showAddType, setShowAddType] = useState(false);
  const [showAddHoliday, setShowAddHoliday] = useState(false);
  const [newType, setNewType] = useState({ code: '', name_sq: '', name_en: '', name_de: '', name_fr: '', is_paid: true, requires_approval: true, max_days_per_year: '', color: '#3B82F6' });
  const [newHoliday, setNewHoliday] = useState({ date: '', name: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.company_id) fetchData();
  }, [profile?.company_id]);

  async function fetchData() {
    setLoading(true);
    const [typesRes, holRes] = await Promise.all([
      supabase.from('leave_types').select('*').eq('company_id', profile!.company_id).order('code'),
      supabase.from('public_holidays').select('*').eq('company_id', profile!.company_id).order('date'),
    ]);
    if (typesRes.data) setLeaveTypes(typesRes.data);
    if (holRes.data) setHolidays(holRes.data);
    setLoading(false);
  }

  async function addLeaveType(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase.from('leave_types').insert({
      company_id: profile!.company_id,
      code: newType.code.trim().toLowerCase().replace(/\s+/g, '_'),
      name_sq: newType.name_sq.trim(),
      name_en: newType.name_en.trim(),
      name_de: newType.name_de.trim() || newType.name_en.trim(),
      name_fr: newType.name_fr.trim() || newType.name_en.trim(),
      is_paid: newType.is_paid,
      requires_approval: newType.requires_approval,
      max_days_per_year: newType.max_days_per_year ? Number(newType.max_days_per_year) : null,
      color: newType.color,
    });
    setShowAddType(false);
    setNewType({ code: '', name_sq: '', name_en: '', name_de: '', name_fr: '', is_paid: true, requires_approval: true, max_days_per_year: '', color: '#3B82F6' });
    setSaving(false);
    fetchData();
  }

  async function addHoliday(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase.from('public_holidays').insert({
      company_id: profile!.company_id,
      date: newHoliday.date,
      name: newHoliday.name.trim(),
    });
    setShowAddHoliday(false);
    setNewHoliday({ date: '', name: '' });
    setSaving(false);
    fetchData();
  }

  async function deleteHoliday(id: string) {
    await supabase.from('public_holidays').delete().eq('id', id);
    fetchData();
  }

  async function toggleLeaveType(lt: LeaveType) {
    await supabase.from('leave_types').update({ is_active: !lt.is_active }).eq('id', lt.id);
    fetchData();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('hr.settings.title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('hr.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => setTab('types')}
          className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            tab === 'types' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {t('hr.settings.leaveTypes')}
        </button>
        <button
          type="button"
          onClick={() => setTab('holidays')}
          className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            tab === 'holidays' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {t('hr.settings.holidays')}
        </button>
      </div>

      {/* Leave Types */}
      {tab === 'types' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">{t('hr.settings.leaveTypes')}</h2>
            <button
              type="button"
              onClick={() => setShowAddType(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700"
            >
              <Plus className="w-4 h-4" /> {t('hr.settings.addLeaveType')}
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {leaveTypes.map((lt) => (
              <div key={lt.id} className="px-5 py-3 flex items-center gap-4">
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: lt.color }} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{lt.name_en}</p>
                  <p className="text-xs text-gray-500">{lt.code} &middot; {lt.is_paid ? 'Paid' : 'Unpaid'} &middot; Max: {lt.max_days_per_year ?? 'Unlimited'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleLeaveType(lt)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    lt.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {lt.is_active ? t('common.active') : t('common.inactive')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Holidays */}
      {tab === 'holidays' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">{t('hr.settings.holidays')}</h2>
            <button
              type="button"
              onClick={() => setShowAddHoliday(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700"
            >
              <Plus className="w-4 h-4" /> {t('hr.settings.addHoliday')}
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {holidays.map((h) => (
              <div key={h.id} className="px-5 py-3 flex items-center gap-4">
                <Calendar className="w-4 h-4 text-teal-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-gray-900 text-sm">{h.name}</p>
                  <p className="text-xs text-gray-500">{h.date}</p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteHoliday(h.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {holidays.length === 0 && (
              <p className="px-5 py-4 text-sm text-gray-500">{t('common.noData')}</p>
            )}
          </div>
        </div>
      )}

      {/* Add Leave Type Modal */}
      {showAddType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <form onSubmit={addLeaveType} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">{t('hr.settings.addLeaveType')}</h3>
            <input type="text" placeholder={t('common.codeEgEducation')} value={newType.code} onChange={(e) => setNewType(p => ({ ...p, code: e.target.value }))} required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
            <input type="text" placeholder={t('common.nameAlbanian')} value={newType.name_sq} onChange={(e) => setNewType(p => ({ ...p, name_sq: e.target.value }))} required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
            <input type="text" placeholder={t('common.nameEnglish')} value={newType.name_en} onChange={(e) => setNewType(p => ({ ...p, name_en: e.target.value }))} required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
            <input type="text" placeholder={t('common.nameGerman')} value={newType.name_de} onChange={(e) => setNewType(p => ({ ...p, name_de: e.target.value }))} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
            <input type="text" placeholder={t('common.nameFrench')} value={newType.name_fr} onChange={(e) => setNewType(p => ({ ...p, name_fr: e.target.value }))} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
            <div className="flex gap-4">
              <input type="number" placeholder={t('common.maxDaysPerYear')} value={newType.max_days_per_year} onChange={(e) => setNewType(p => ({ ...p, max_days_per_year: e.target.value }))} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-gray-400" />
                <input type="color" value={newType.color} onChange={(e) => setNewType(p => ({ ...p, color: e.target.value }))} className="w-10 h-10 rounded border-0 cursor-pointer" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowAddType(false)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 font-medium">{t('common.cancel')}</button>
              <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-xl font-medium disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Holiday Modal */}
      {showAddHoliday && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <form onSubmit={addHoliday} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">{t('hr.settings.addHoliday')}</h3>
            <input type="date" value={newHoliday.date} onChange={(e) => setNewHoliday(p => ({ ...p, date: e.target.value }))} required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
            <input type="text" placeholder={t('common.holidayName')} value={newHoliday.name} onChange={(e) => setNewHoliday(p => ({ ...p, name: e.target.value }))} required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowAddHoliday(false)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 font-medium">{t('common.cancel')}</button>
              <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-xl font-medium disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
