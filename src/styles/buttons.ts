/*
  Button design system for MM Logistic.

  Usage rules:
    - Primary: one per view, for the main action (Save, Confirm, Send).
    - Secondary: neutral actions (Cancel, Back, Close).
    - Danger: destructive actions (Delete, Remove).
    - Ghost/Icon: inline table actions (View, Edit, Delete icons).

  Modal footer pattern:
    <div className="flex justify-end gap-3">
      <button className={BTN_SECONDARY}>Cancel</button>
      <button className={BTN_PRIMARY}>Save</button>
    </div>

  Touch target: md size (py-2.5) meets 44x44px minimum on mobile.
*/

export const BTN_BASE =
  'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed';

export const BTN_PRIMARY =
  'px-4 py-2.5 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2';

export const BTN_SECONDARY =
  'px-4 py-2.5 text-sm font-medium bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2';

export const BTN_DANGER =
  'px-4 py-2.5 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2';

export const BTN_GHOST =
  'px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2';

export const BTN_ICON =
  'p-2 hover:bg-gray-100 text-gray-600 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center';

export const BTN_ICON_DANGER =
  'p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center';

export const BTN_SM = 'px-3 py-1.5 text-xs font-medium rounded-md';
export const BTN_LG = 'px-6 py-3 text-base font-semibold rounded-xl';

export const FAB =
  'fixed bottom-6 right-6 w-14 h-14 bg-teal-600 hover:bg-teal-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all focus:outline-none focus:ring-2 focus:ring-teal-500 flex items-center justify-center z-40';
