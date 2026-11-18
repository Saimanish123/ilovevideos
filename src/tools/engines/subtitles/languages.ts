/**
 * Languages offered for a subtitle track's language tag. MP4 and WebM (through mediabunny) take
 * ISO 639-2/T codes; Matroska's specification uses ISO 639-2/B, which differs for about twenty
 * languages (French is "fra" in one and "fre" in the other), so both are listed.
 */
export interface Language {
  /** ISO 639-1, as found in file names ("film.en.srt") and WebVTT headers. */
  code1: string;
  /** ISO 639-2/T (MP4, mediabunny). */
  code: string;
  /** ISO 639-2/B (Matroska). */
  bib: string;
  name: string;
}

export const languages: Language[] = [
  { code1: "en", code: "eng", bib: "eng", name: "English" },
  { code1: "es", code: "spa", bib: "spa", name: "Spanish" },
  { code1: "fr", code: "fra", bib: "fre", name: "French" },
  { code1: "de", code: "deu", bib: "ger", name: "German" },
  { code1: "it", code: "ita", bib: "ita", name: "Italian" },
  { code1: "pt", code: "por", bib: "por", name: "Portuguese" },
  { code1: "nl", code: "nld", bib: "dut", name: "Dutch" },
  { code1: "sv", code: "swe", bib: "swe", name: "Swedish" },
  { code1: "da", code: "dan", bib: "dan", name: "Danish" },
  { code1: "no", code: "nor", bib: "nor", name: "Norwegian" },
  { code1: "fi", code: "fin", bib: "fin", name: "Finnish" },
  { code1: "pl", code: "pol", bib: "pol", name: "Polish" },
  { code1: "cs", code: "ces", bib: "cze", name: "Czech" },
  { code1: "hu", code: "hun", bib: "hun", name: "Hungarian" },
  { code1: "ro", code: "ron", bib: "rum", name: "Romanian" },
  { code1: "el", code: "ell", bib: "gre", name: "Greek" },
  { code1: "tr", code: "tur", bib: "tur", name: "Turkish" },
  { code1: "ru", code: "rus", bib: "rus", name: "Russian" },
  { code1: "uk", code: "ukr", bib: "ukr", name: "Ukrainian" },
  { code1: "ar", code: "ara", bib: "ara", name: "Arabic" },
  { code1: "he", code: "heb", bib: "heb", name: "Hebrew" },
  { code1: "fa", code: "fas", bib: "per", name: "Persian" },
  { code1: "hi", code: "hin", bib: "hin", name: "Hindi" },
  { code1: "bn", code: "ben", bib: "ben", name: "Bengali" },
  { code1: "th", code: "tha", bib: "tha", name: "Thai" },
  { code1: "vi", code: "vie", bib: "vie", name: "Vietnamese" },
  { code1: "id", code: "ind", bib: "ind", name: "Indonesian" },
  { code1: "ms", code: "msa", bib: "may", name: "Malay" },
  { code1: "zh", code: "zho", bib: "chi", name: "Chinese" },
  { code1: "ja", code: "jpn", bib: "jpn", name: "Japanese" },
  { code1: "ko", code: "kor", bib: "kor", name: "Korean" },
];

export const UNDETERMINED = "und";

export const languageByCode = new Map(languages.map((l) => [l.code, l]));

/** Finds a language from a code or name as people write it: "en", "eng", "fre", "English", "pt-BR". */
export function findLanguage(token: string | undefined): Language | undefined {
  if (!token) return undefined;
  const t = token.trim().toLowerCase().split(/[-_]/)[0] ?? "";
  if (!t) return undefined;
  return languages.find(
    (l) => l.code1 === t || l.code === t || l.bib === t || l.name.toLowerCase() === t,
  );
}

/**
 * The language a subtitle file names for itself: "film.en.srt", "film.eng.forced.srt", or a WebVTT
 * "Language: en" header line. Undefined when nothing says.
 */
export function languageFromFile(fileName: string, header?: string): Language | undefined {
  const parts = fileName.toLowerCase().split(".").slice(1, -1);
  for (const p of parts.reverse()) {
    const l = findLanguage(p);
    if (l) return l;
  }
  const m = header ? /^Language:\s*(\S+)/im.exec(header) : null;
  return findLanguage(m?.[1]);
}
