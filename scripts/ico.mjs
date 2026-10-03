// ICO = 6-byte header + 16-byte entry per image + PNG payloads (PNG-in-ICO is valid since Windows Vista).
export function packIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const entries = Buffer.alloc(16 * images.length)
  let offset = 6 + 16 * images.length
  images.forEach(({ size, data }, i) => {
    const o = i * 16
    entries.writeUInt8(size >= 256 ? 0 : size, o)
    entries.writeUInt8(size >= 256 ? 0 : size, o + 1)
    entries.writeUInt8(0, o + 2)
    entries.writeUInt8(0, o + 3)
    entries.writeUInt16LE(1, o + 4)
    entries.writeUInt16LE(32, o + 6)
    entries.writeUInt32LE(data.length, o + 8)
    entries.writeUInt32LE(offset, o + 12)
    offset += data.length
  })
  return Buffer.concat([header, entries, ...images.map((i) => i.data)])
}
