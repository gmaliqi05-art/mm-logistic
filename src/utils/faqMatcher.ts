export interface FaqEntry {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
  priority: number;
}

const STOP_WORDS = new Set([
  'a', 'e', 'i', 'o', 'u', 'ne', 'te', 'me', 'per', 'nga', 'se', 'qe',
  'nje', 'eshte', 'jane', 'ka', 'kam', 'ke', 'do', 'duke', 'si', 'cfare',
  'kur', 'ku', 'pse', 'sa', 'cili', 'cila', 'kush', 'mund', 'nuk', 'po',
  'jo', 'edhe', 'por', 'ose', 'dhe', 'ta', 'ti', 'ai', 'ajo', 'ata',
  'kjo', 'ky', 'ate', 'keto', 'disa', 'pak', 'shume', 'te', 'una', 'im',
  'ime', 'tim', 'time', 'tone', 'juaj', 'juaja',
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ë/g, 'e')
    .replace(/ç/g, 'c')
    .replace(/[^\w\s]/g, '')
    .trim();
}

function tokenize(text: string): string[] {
  const normalized = normalize(text);
  return normalized
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

function getStemPrefix(word: string): string {
  if (word.length <= 3) return word;
  if (word.length <= 5) return word.slice(0, 3);
  return word.slice(0, Math.min(word.length - 2, 6));
}

function wordMatchScore(token: string, keyword: string): number {
  const normToken = normalize(token);
  const normKeyword = normalize(keyword);

  if (normToken === normKeyword) return 1.0;

  if (normToken.includes(normKeyword) || normKeyword.includes(normToken)) return 0.8;

  const stemA = getStemPrefix(normToken);
  const stemB = getStemPrefix(normKeyword);
  if (stemA === stemB) return 0.7;

  if (normToken.length > 3 && normKeyword.length > 3) {
    const shorter = normToken.length < normKeyword.length ? normToken : normKeyword;
    const longer = normToken.length < normKeyword.length ? normKeyword : normToken;
    if (longer.startsWith(shorter.slice(0, 3))) return 0.5;
  }

  return 0;
}

export function matchFaq(userInput: string, faqs: FaqEntry[]): FaqEntry | null {
  const tokens = tokenize(userInput);
  if (tokens.length === 0) return null;

  const scored: { faq: FaqEntry; score: number }[] = [];

  for (const faq of faqs) {
    let keywordScore = 0;
    let matchedKeywords = 0;

    for (const token of tokens) {
      let bestMatch = 0;
      for (const keyword of faq.keywords) {
        const match = wordMatchScore(token, keyword);
        if (match > bestMatch) bestMatch = match;
      }
      keywordScore += bestMatch;
      if (bestMatch > 0.4) matchedKeywords++;
    }

    const questionTokens = tokenize(faq.question);
    let questionScore = 0;
    for (const token of tokens) {
      for (const qToken of questionTokens) {
        const match = wordMatchScore(token, qToken);
        if (match > 0.6) {
          questionScore += match * 0.5;
          break;
        }
      }
    }

    const coverageRatio = matchedKeywords / tokens.length;
    const priorityBonus = faq.priority * 0.05;

    const totalScore = keywordScore + questionScore + coverageRatio * 2 + priorityBonus;

    if (matchedKeywords >= 1 && totalScore > 1.0) {
      scored.push({ faq, score: totalScore });
    }
  }

  if (scored.length === 0) return null;

  scored.sort((a, b) => b.score - a.score);
  return scored[0].faq;
}
