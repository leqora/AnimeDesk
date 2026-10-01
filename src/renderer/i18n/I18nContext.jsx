import { createContext, useContext, useMemo } from 'react'
import { createT } from './index.js'

const I18nCtx = createContext(createT('sr'))

export function I18nProvider({ lang, children }) {
  const t = useMemo(() => createT(lang), [lang])
  return <I18nCtx.Provider value={t}>{children}</I18nCtx.Provider>
}

export const useT = () => useContext(I18nCtx)
