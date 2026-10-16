import { describe, it, expect, vi } from 'vitest'
import { createTray } from '../../src/main/tray.js'

function fakes() {
  const tray = { setToolTip: vi.fn(), setContextMenu: vi.fn(), on: vi.fn(), destroy: vi.fn() }
  const Tray = vi.fn(function () { return tray })
  const Menu = { buildFromTemplate: vi.fn((t) => ({ template: t })) }
  return { tray, Tray, Menu }
}

describe('createTray', () => {
  it('builds open and quit items and wires callbacks', () => {
    const { tray, Tray, Menu } = fakes()
    const onOpen = vi.fn(), onQuit = vi.fn()
    createTray({ Tray, Menu, iconPath: 'i.ico', labels: { open: 'Otvori AnimeDesk', quit: 'Izađi' }, onOpen, onQuit })
    expect(Tray).toHaveBeenCalledWith('i.ico')
    const tpl = Menu.buildFromTemplate.mock.calls[0][0]
    expect(tpl.map((i) => i.label)).toEqual(['Otvori AnimeDesk', 'Izađi'])
    tpl[0].click(); tpl[1].click()
    expect(onOpen).toHaveBeenCalled(); expect(onQuit).toHaveBeenCalled()
    expect(tray.setContextMenu).toHaveBeenCalled()
    const [evt, cb] = tray.on.mock.calls[0]
    expect(evt).toBe('click'); cb()
    expect(onOpen).toHaveBeenCalledTimes(2)
  })
  it('updates labels and destroys', () => {
    const { tray, Tray, Menu } = fakes()
    const t = createTray({ Tray, Menu, iconPath: 'i', labels: { open: 'A', quit: 'B' }, onOpen() {}, onQuit() {} })
    t.setLabels({ open: 'Open AnimeDesk', quit: 'Quit' })
    expect(Menu.buildFromTemplate.mock.calls[1][0].map((i) => i.label)).toEqual(['Open AnimeDesk', 'Quit'])
    t.destroy(); t.destroy()
    expect(tray.destroy).toHaveBeenCalledTimes(1)
  })
})
