import sr from './sr.json'
import en from './en.json'

export const DICTS = { sr, en }

export function createT(lang) {
  const dict = DICTS[lang] ?? DICTS.sr
  return (key, vars = {}) => {
    const s = dict[key] ?? DICTS.en[key] ?? key
    return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`))
  }
}
