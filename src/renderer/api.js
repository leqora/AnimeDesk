import { createContext, useContext } from 'react'

export const ApiContext = createContext(null)
export const useApi = () => useContext(ApiContext)
