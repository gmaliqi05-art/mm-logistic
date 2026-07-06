/**
 * Voice command detection for the conversational assistant.
 *
 * The assistant runs hands-free: after each spoken reply it re-opens the mic so
 * the user can simply keep talking. To let the user halt it by voice (instead of
 * pressing the Stop button) we scan the recognised transcript for a short list
 * of "stop" words in every supported UI language.
 */

type Language = 'sq' | 'en' | 'de' | 'fr';

// Stop words per language. Kept short and unambiguous so a normal question that
// merely *mentions* one of these words is unlikely to trip it — we only match
// when the whole utterance is (essentially) just the stop command.
const STOP_WORDS: Record<Language, string[]> = {
  sq: ['ndalu', 'ndal', 'ndalo', 'ndalu tani', 'mjaft', 'hesht', 'pusho', 'ndërpre', 'nderpre', 'stop'],
  en: ['stop', 'stop it', 'be quiet', 'quiet', 'enough', 'that is enough', "that's enough", 'silence'],
  de: ['stopp', 'stop', 'halt', 'sei still', 'ruhe', 'genug', 'schluss', 'aufhören', 'aufhoren'],
  fr: ['arrête', 'arrete', 'stop', 'arrêtez', 'arretez', 'silence', 'tais-toi', 'ça suffit', 'ca suffit', 'assez'],
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns true when the utterance should stop the assistant. We accept the
 * command when the transcript is just the stop phrase (optionally with a
 * leading politeness/wake word like "hey" / "mm"), so a longer question that
 * happens to contain the word is not swallowed.
 */
export function isStopCommand(transcript: string, language: Language): boolean {
  const said = normalize(transcript);
  if (!said) return false;
  const words = (STOP_WORDS[language] ?? STOP_WORDS.en).concat(STOP_WORDS.en);
  for (const phrase of words) {
    const p = normalize(phrase);
    if (said === p) return true;
    // Allow a short lead-in: "mm ndalu", "hey stop", "ok stop".
    if (said.endsWith(' ' + p) && said.length - p.length <= 6) return true;
  }
  return false;
}
