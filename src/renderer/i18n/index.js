import sr from './sr.json'
import en from './en.json'

export const DICTS = { sr, en }
// Latin script for Serbian dates ("pet 17:30", not Cyrillic), 24-hour English.
export const LOCALES = { sr: 'sr-Latn', en: 'en-GB' }

export function createT(lang) {
  const code = DICTS[lang] ? lang : 'sr'
  const dict = DICTS[code]
  const t = (key, vars = {}) => {
    const s = dict[key] ?? DICTS.en[key] ?? key
    return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`))
  }
  const rules = new Intl.PluralRules(code)
  // Keys come in _one/_few/_other in both languages; English uses one/other only.
  t.n = (key, count, vars = {}) => {
    const k = `${key}_${rules.select(count)}`
    return t(k in dict ? k : `${key}_other`, { count, ...vars })
  }
  t.lang = code
  t.locale = LOCALES[code]
  return t
}
