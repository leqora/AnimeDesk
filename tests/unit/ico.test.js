import { describe, it, expect } from 'vitest'
import { packIco } from '../../scripts/ico.mjs'

describe('packIco', () => {
  it('writes an ICO header, one directory entry per PNG and the PNG bytes', () => {
    const a = Buffer.from([1, 2, 3])
    const b = Buffer.from([4, 5, 6, 7])
    const ico = packIco([{ size: 16, data: a }, { size: 256, data: b }])
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(2)
    // entry 1
    expect(ico.readUInt8(6)).toBe(16)
    expect(ico.readUInt8(7)).toBe(16)
    expect(ico.readUInt16LE(6 + 4)).toBe(1)
    expect(ico.readUInt16LE(6 + 6)).toBe(32)
    expect(ico.readUInt32LE(6 + 8)).toBe(3)
    expect(ico.readUInt32LE(6 + 12)).toBe(6 + 2 * 16)
    // entry 2: 256 is stored as 0
    expect(ico.readUInt8(22)).toBe(0)
    expect(ico.readUInt8(23)).toBe(0)
    expect(ico.readUInt32LE(22 + 8)).toBe(4)
    expect(ico.readUInt32LE(22 + 12)).toBe(6 + 2 * 16 + 3)
    expect([...ico.subarray(38)]).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
})
