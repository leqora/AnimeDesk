// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderUi, renderHookUi, makeFakeApi } from './helpers.jsx'
import { useBanner } from '../../../src/renderer/anilist/useBanner.js'
import { DataSection } from '../../../src/renderer/components/DataSection.jsx'

const preview = (over = {}) => ({
  ok: true,
  preview: { token: 'tok1', createdAt: '2026-10-19T10:00:00.000Z', appVersion: '0.12.0', series: 42, logEntries: 310, skipped: 0, current: { series: 40, logEntries: 290 }, ...over },
})

function setup(dataOver = {}, props = {}) {
  const api = makeFakeApi({ data: dataOver })
  const onImported = vi.fn()
  renderUi(<DataSection onImported={onImported} {...props} />, { api })
  return { api, onImported }
}

describe('DataSection', () => {
  it('shows cache size and last auto backup date from data.info', async () => {
    setup({ info: vi.fn(async () => ({ cacheBytes: 38.4 * 1024 * 1024, lastAutoBackup: '2026-10-19' })) })
    expect(await screen.findByText(/Keš: 38,4 MB/)).toBeInTheDocument()
    expect(screen.getByText(/Poslednja automatska kopija: 19\. 10\. 2026\./)).toBeInTheDocument()
  })
  it('uses KB below one megabyte and says when no automatic backup exists', async () => {
    setup({ info: vi.fn(async () => ({ cacheBytes: 512 * 1024, lastAutoBackup: null })) })
    expect(await screen.findByText(/Keš: 512,0 KB/)).toBeInTheDocument()
    expect(screen.getByText('Automatska kopija još nije napravljena')).toBeInTheDocument()
  })
  it('export success shows a toast; canceled shows nothing', async () => {
    const { api } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Izvezi rezervnu kopiju' }))
    expect(await screen.findByText('Rezervna kopija sačuvana')).toBeInTheDocument()
    expect(api.data.export).toHaveBeenCalledTimes(1)
  })
  it('export canceled shows no toast, failure shows an error toast', async () => {
    const { api } = setup({ export: vi.fn().mockResolvedValueOnce({ ok: false, canceled: true }).mockResolvedValueOnce({ ok: false, error: 'x' }) })
    const btn = screen.getByRole('button', { name: 'Izvezi rezervnu kopiju' })
    fireEvent.click(btn)
    await waitFor(() => expect(api.data.export).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(btn).not.toBeDisabled())
    expect(screen.queryByText('Rezervna kopija sačuvana')).not.toBeInTheDocument()
    expect(screen.queryByText('Izvoz nije uspeo')).not.toBeInTheDocument()
    fireEvent.click(btn)
    expect(await screen.findByText('Izvoz nije uspeo')).toBeInTheDocument()
  })
  it('import title is an h4 under the section h3', async () => {
    setup({ importPick: vi.fn(async () => preview()) })
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Uvezi' }))
    expect(await screen.findByRole('heading', { level: 4, name: 'Uvoz rezervne kopije' })).toBeInTheDocument()
  })
  it('import pick opens a modal with date, counts and current counts', async () => {
    setup({ importPick: vi.fn(async () => preview()) })
    fireEvent.click(screen.getByRole('button', { name: 'Uvezi' }))
    const dlg = await screen.findByRole('dialog')
    expect(within(dlg).getByText(/Rezervna kopija od 19\. 10\. 2026\./)).toBeInTheDocument()
    expect(within(dlg).getByText(/42 serije/)).toBeInTheDocument()
    expect(within(dlg).getByText(/310 zapisa u dnevniku/)).toBeInTheDocument()
    expect(within(dlg).getByText(/Zameniće trenutne podatke \(trenutno: 40 serija, 290 zapisa u dnevniku\)/)).toBeInTheDocument()
    expect(within(dlg).queryByText(/preskočen/i)).not.toBeInTheDocument()
  })
  it('omits the date line when the backup has no date and shows skipped entries when > 0', async () => {
    setup({ importPick: vi.fn(async () => preview({ createdAt: null, skipped: 3 })) })
    fireEvent.click(screen.getByRole('button', { name: 'Uvezi' }))
    const dlg = await screen.findByRole('dialog')
    expect(within(dlg).queryByText(/Rezervna kopija od/)).not.toBeInTheDocument()
    expect(within(dlg).getByText(/3 unosa preskočena/)).toBeInTheDocument()
  })
  it('cancel closes the modal without applying', async () => {
    const { api } = setup({ importPick: vi.fn(async () => preview()) })
    fireEvent.click(screen.getByRole('button', { name: 'Uvezi' }))
    const dlg = await screen.findByRole('dialog')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Otkaži' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.data.importApply).not.toHaveBeenCalled()
  })
  it('confirm calls importApply(token), toasts and calls onImported(settings)', async () => {
    const settings = { watchedThreshold: 77 }
    const { api, onImported } = setup({ importPick: vi.fn(async () => preview()), importApply: vi.fn(async () => ({ ok: true, settings })) })
    fireEvent.click(screen.getByRole('button', { name: 'Uvezi' }))
    const dlg = await screen.findByRole('dialog')
    const confirm = within(dlg).getByRole('button', { name: 'Zameni podatke' })
    expect(confirm).toHaveClass('danger')
    fireEvent.click(confirm)
    await waitFor(() => expect(onImported).toHaveBeenCalledWith(settings))
    expect(api.data.importApply).toHaveBeenCalledWith('tok1')
    expect(await screen.findByText('Podaci uvezeni')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('initial focus in the import modal is the Cancel button, and Cancel/Esc return focus to Uvezi', async () => {
    setup({ importPick: vi.fn(async () => preview()) })
    const open = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Uvezi' }))
      return screen.findByRole('dialog')
    }
    let dlg = await open()
    await waitFor(() => expect(document.activeElement).toBe(within(dlg).getByRole('button', { name: 'Otkaži' })))
    fireEvent.click(within(dlg).getByRole('button', { name: 'Otkaži' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Uvezi' })))
    dlg = await open()
    // Esc is handled by a listener the modal adds after it renders; wait for its initial focus first.
    await waitFor(() => expect(document.activeElement).toBe(within(dlg).getByRole('button', { name: 'Otkaži' })))
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Uvezi' }))
  })
  it('clear cache failure shows an error toast; open folder rejection is handled', async () => {
    const { api } = setup({ clearCache: vi.fn(async () => { throw new Error('x') }), openFolder: vi.fn(async () => { throw new Error('y') }) })
    fireEvent.click(screen.getByRole('button', { name: 'Obriši keš slika i opisa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Da' }))
    expect(await screen.findByText('Brisanje keša nije uspelo')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Otvori folder podataka' }))
    await waitFor(() => expect(api.data.openFolder).toHaveBeenCalled())
  })
  it('pick canceled shows nothing', async () => {
    const { api } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Uvezi' }))
    await waitFor(() => expect(api.data.importPick).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('pick error shows the matching message', async () => {
    setup({ importPick: vi.fn(async () => ({ ok: false, error: 'newer' })) })
    fireEvent.click(screen.getByRole('button', { name: 'Uvezi' }))
    expect(await screen.findByText('Kopija je iz novije verzije AnimeDesk-a')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('maps unknown pick errors to the invalid message', async () => {
    setup({ importPick: vi.fn(async () => ({ ok: false, error: 'weird' })) })
    fireEvent.click(screen.getByRole('button', { name: 'Uvezi' }))
    expect(await screen.findByText('Fajl nije ispravna rezervna kopija AnimeDesk-a')).toBeInTheDocument()
  })
  it('apply error expired shows the message, closes the modal and does not call onImported', async () => {
    const { onImported } = setup({ importPick: vi.fn(async () => preview()), importApply: vi.fn(async () => ({ ok: false, error: 'expired' })) })
    fireEvent.click(screen.getByRole('button', { name: 'Uvezi' }))
    const dlg = await screen.findByRole('dialog')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Zameni podatke' }))
    expect(await screen.findByText('Pregled je istekao, izaberite fajl ponovo')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onImported).not.toHaveBeenCalled()
  })
  it('apply error rollback-failed tells the user where the copy of the previous data is', async () => {
    const { onImported } = setup({ importPick: vi.fn(async () => preview()), importApply: vi.fn(async () => ({ ok: false, error: 'rollback-failed' })) })
    fireEvent.click(screen.getByRole('button', { name: 'Uvezi' }))
    const dlg = await screen.findByRole('dialog')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Zameni podatke' }))
    expect(await screen.findByText(/pre-import.*Otvori folder podataka/)).toBeInTheDocument()
    expect(onImported).not.toHaveBeenCalled()
  })
  it('focusImport focuses the Uvezi button on mount', () => {
    setup({}, { focusImport: true })
    expect(screen.getByRole('button', { name: 'Uvezi' })).toHaveFocus()
  })
  it('clear cache needs confirmation, then shows the new size', async () => {
    const { api } = setup({ info: vi.fn(async () => ({ cacheBytes: 5 * 1024 * 1024, lastAutoBackup: null })), clearCache: vi.fn(async () => ({ cacheBytes: 0 })) })
    await screen.findByText(/Keš: 5,0 MB/)
    fireEvent.click(screen.getByRole('button', { name: 'Obriši keš slika i opisa' }))
    expect(api.data.clearCache).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Da' }))
    await waitFor(() => expect(api.data.clearCache).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/Keš: 0,0 KB/)).toBeInTheDocument()
  })
  it('clearing the cache also forgets the renderer banner urls', async () => {
    const { api } = setup({ clearCache: vi.fn(async () => ({ cacheBytes: 0 })) })
    api.anilist = { ...api.anilist, banner: vi.fn(async () => 'animedesk-img://banner/q1') }
    const probe = renderHookUi(() => useBanner({ kind: 'discover', id: 3 }), { api })
    await waitFor(() => expect(probe.result.current).toBe('animedesk-img://banner/q1'))
    fireEvent.click(screen.getByRole('button', { name: 'Obriši keš slika i opisa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Da' }))
    expect(await screen.findByText(/Keš: 0,0 KB/)).toBeInTheDocument()
    expect(renderHookUi(() => useBanner({ kind: 'discover', id: 3 }), { api }).result.current).toBeUndefined()
  })
  it('open folder calls data.openFolder', () => {
    const { api } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Otvori folder podataka' }))
    expect(api.data.openFolder).toHaveBeenCalledTimes(1)
  })
  it('disables the action buttons while a request runs', async () => {
    let release
    const { api } = setup({ export: vi.fn(() => new Promise((r) => { release = r })) })
    fireEvent.click(screen.getByRole('button', { name: 'Izvezi rezervnu kopiju' }))
    expect(screen.getByRole('button', { name: 'Izvezi rezervnu kopiju' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Uvezi' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Uvezi' }))
    expect(api.data.importPick).not.toHaveBeenCalled()
    release({ ok: true })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Uvezi' })).not.toBeDisabled())
  })
  it('works in English', async () => {
    const api = makeFakeApi({ data: { info: vi.fn(async () => ({ cacheBytes: 2.5 * 1024 * 1024, lastAutoBackup: '2026-10-19' })) } })
    renderUi(<DataSection onImported={() => {}} />, { api, lang: 'en' })
    expect(await screen.findByText(/Cache: 2\.5 MB/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export backup' })).toBeInTheDocument()
  })
})
