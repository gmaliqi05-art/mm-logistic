import { useState } from 'react';
import { Clock, Power, CheckCircle2, AlertTriangle, Infinity } from 'lucide-react';
import { useDriverTracking } from '../contexts/DriverTrackingContext';

const PRESETS = [1, 2, 3, 4];
const UNLIMITED_HOURS = 24;

export default function DriverShiftEndModal() {
  const { shiftDialog, dismissShiftDialog, startOvertime, stopOvertime, shiftEndHour } = useDriverTracking();
  const [customHours, setCustomHours] = useState<string>('');
  const [busy, setBusy] = useState(false);

  if (!shiftDialog) return null;

  async function chooseDuration(hours: number) {
    if (busy || hours <= 0) return;
    setBusy(true);
    try {
      await startOvertime(hours);
    } finally {
      setBusy(false);
    }
  }

  async function confirmStop() {
    if (busy) return;
    setBusy(true);
    try {
      await stopOvertime();
    } finally {
      setBusy(false);
    }
  }

  const title = shiftDialog.kind === 'ended' ? 'Orari i punes perfundoi' : 'Koha e vazhdimit perfundoi';
  const message = shiftDialog.kind === 'ended'
    ? `Ora ${shiftEndHour}:00 kaloi dhe gjurmimi u ndalua. Nese je ende ne pune, zgjedh sa kohe deshiron te vazhdoje gjurmimi.`
    : 'Koha shtese qe zgjodhe perfundoi dhe gjurmimi u ndalua. Nese je ende ne pune, zgjedh nje kohezgjatje te re.';

  const customHoursNum = Number(customHours);
  const customValid = Number.isFinite(customHoursNum) && customHoursNum > 0 && customHoursNum <= 12;

  return (
    <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5">
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${shiftDialog.kind === 'ended' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
            {shiftDialog.kind === 'ended' ? <Clock className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-600 mt-1">{message}</p>
          </div>
        </div>

        <div className="mt-5">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Vazhdo gjurmimin per</div>
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((h) => (
              <button
                key={h}
                onClick={() => chooseDuration(h)}
                disabled={busy}
                className="flex flex-col items-center justify-center gap-0.5 px-2 py-3 rounded-xl bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-800 font-semibold disabled:opacity-50"
              >
                <span className="text-lg">{h}</span>
                <span className="text-[10px] font-medium">{h === 1 ? 'ore' : 'ore'}</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => chooseDuration(UNLIMITED_HOURS)}
            disabled={busy}
            className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold disabled:opacity-50"
          >
            <Infinity className="w-5 h-5" />
            Pa limit (deri sa ta ndalesh manualisht)
          </button>

          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              min={0.5}
              max={12}
              step={0.5}
              value={customHours}
              onChange={(e) => setCustomHours(e.target.value)}
              placeholder="Ore te tjera (p.sh. 2.5)"
              className="flex-1 px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
            <button
              onClick={() => customValid && chooseDuration(customHoursNum)}
              disabled={busy || !customValid}
              className="px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50"
            >
              Vazhdo
            </button>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-1 gap-2">
          <button
            onClick={confirmStop}
            disabled={busy}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 disabled:opacity-50"
          >
            <Power className="w-4 h-4" /> Jo, mbaron — ndalo gjurmimin
          </button>
          <button
            onClick={dismissShiftDialog}
            disabled={busy}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-slate-500 text-sm hover:text-slate-700 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" /> Shiko me vone
          </button>
        </div>
      </div>
    </div>
  );
}
