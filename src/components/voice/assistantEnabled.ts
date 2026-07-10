// Master ON/OFF switch for the MML-Agent assistant (the floating robot).
// Stored per device in localStorage; default ON. When OFF the VoiceAssistant
// hides itself and stops all mic/speech activity. Toggled from the layout
// header and the settings pages, which dispatch ASSISTANT_ENABLED_EVENT so a
// mounted VoiceAssistant reacts immediately.
export const ASSISTANT_ENABLED_KEY = 'mm-assistant-enabled';
export const ASSISTANT_ENABLED_EVENT = 'mm-assistant-enabled-changed';

export function isAssistantEnabled(): boolean {
  try {
    const v = localStorage.getItem(ASSISTANT_ENABLED_KEY);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}

export function setAssistantEnabled(on: boolean): void {
  try {
    localStorage.setItem(ASSISTANT_ENABLED_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event(ASSISTANT_ENABLED_EVENT));
  } catch {
    /* ignore */
  }
}
