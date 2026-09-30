import { describe } from 'vitest'
import { findSystemBash } from '../../src/main/toolManager.js'

export const BASH = findSystemBash(process.env)
export const describeBash = BASH ? describe : describe.skip
