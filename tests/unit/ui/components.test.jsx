// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderUi, makeFakeApi, hasNoContent } from './helpers.jsx'
import { Semaphore } from '../../../src/renderer/components/Semaphore.jsx'
import { ReadyNotice } from '../../../src/renderer/components/ReadyNotice.jsx'
import { ConfirmButton } from '../../../src/renderer/components/ConfirmButton.jsx'
import { AskDialog } from '../../../src/renderer/components/AskDialog.jsx'
import { Rail } from '../../../src/renderer/components/Rail.jsx'
import { Poster } from '../../../src/renderer/components/Poster.jsx'

describe('Semaphore', () => {
  it('shows red with the source-down message', () => {
    renderUi(<Semaphore health={{ light: 'red', reason: 'source-down' }} onClick={() => {}} />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('data-light', 'red')
    expect(btn).toHaveTextContent('Izvor trenutno ne radi — čeka se popravka od ani-cli tima')
  })
  it('shows green in English', () => {
    renderUi(<Semaphore health={{ light: 'green', reason: 'ok' }} onClick={() => {}} />, { lang: 'en' })
    expect(screen.getByRole('button')).toHaveAttribute('data-light', 'green')
    expect(screen.getByRole('button')).toHaveTextContent('All systems go')
  })
  it('is clickable', () => {
    const onClick = vi.fn()
    renderUi(<Semaphore health={{ light: 'yellow', reason: 'checking' }} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalled()
  })
})

describe('ReadyNotice', () => {
  it('renders nothing when ready', () => {
    const { container } = renderUi(<ReadyNotice ready onOpenWizard={() => {}} />)
    expect(hasNoContent(container)).toBe(true)
  })
  it('explains the block and opens the wizard', () => {
    const onOpen = vi.fn()
    renderUi(<ReadyNotice ready={false} onOpenWizard={onOpen} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Potrebno je instalirati komponente da bi se nastavilo')
    fireEvent.click(screen.getByRole('button', { name: 'Otvori instalaciju' }))
    expect(onOpen).toHaveBeenCalled()
  })
})

describe('ConfirmButton', () => {
  it('needs two clicks', () => {
    const onConfirm = vi.fn()
    renderUi(<ConfirmButton label="Obriši" confirmLabel="Sigurno?" onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: 'Obriši' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByText('Sigurno?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Da' }))
    expect(onConfirm).toHaveBeenCalled()
  })
})

describe('AskDialog', () => {
  it('records the episode on Yes', async () => {
    const onDone = vi.fn()
    const { api } = renderUi(<AskDialog ask={{ aniCliTitle: 'Frieren', episode: '3' }} onDone={onDone} />)
    expect(screen.getByText('Označi epizodu 3 (Frieren) kao odgledanu?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Da' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(api.library.recordWatched).toHaveBeenCalledWith({ aniCliTitle: 'Frieren', episode: '3' })
  })
})

describe('Poster', () => {
  it('shows the poster from AniList when available', async () => {
    const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => ({ poster: 'data:image/png;base64,AA' })) } })
    const { container } = renderUi(<Poster title="Frieren" />, { api })
    await waitFor(() => expect(container.querySelector('img.poster')).toHaveAttribute('src', 'data:image/png;base64,AA'))
    expect(api.anilist.forTitle).toHaveBeenCalledWith('Frieren', null)
  })
  it('with an overlay shows a skeleton, then fades the image in', async () => {
    const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => ({ poster: 'data:image/png;base64,AA' })) } })
    const { container } = renderUi(<Poster title="Frieren"><span className="ov">x</span></Poster>, { api })
    expect(container.querySelector('.poster-frame .poster--skeleton')).not.toBeNull()
    const img = await waitFor(() => { const el = container.querySelector('img.poster'); expect(el).not.toBeNull(); return el })
    expect(img).toHaveClass('poster--loading')
    fireEvent.load(img)
    expect(img).toHaveClass('poster--in')
    expect(container.querySelector('.poster--skeleton')).toBeNull()
    expect(container.querySelector('.poster-frame > .ov')).not.toBeNull()
  })
  it('with an overlay ends in the placeholder when there is no poster or it fails to load', async () => {
    const none = makeFakeApi({ anilist: { forTitle: vi.fn(async () => null) } })
    const a = renderUi(<Poster title="Nope"><span /></Poster>, { api: none })
    await waitFor(() => expect(a.container.querySelector('.poster--empty')).not.toBeNull())
    expect(a.container.querySelector('.poster--skeleton')).toBeNull()
    const broken = makeFakeApi({ anilist: { forTitle: vi.fn(async () => ({ poster: 'data:image/png;base64,AA' })) } })
    const b = renderUi(<Poster title="Broken"><span /></Poster>, { api: broken })
    const img = await waitFor(() => { const el = b.container.querySelector('img.poster'); expect(el).not.toBeNull(); return el })
    fireEvent.error(img)
    expect(b.container.querySelector('.poster--empty')).not.toBeNull()
    expect(b.container.querySelector('img.poster')).toBeNull()
  })
  it('without an overlay keeps the plain output', async () => {
    const api = makeFakeApi({ anilist: { forTitle: vi.fn(async () => null) } })
    const { container } = renderUi(<Poster title="Nope" />, { api })
    await waitFor(() => expect(api.anilist.forTitle).toHaveBeenCalled())
    expect(container.querySelector('.poster-frame')).toBeNull()
    expect(container.firstChild).toHaveClass('poster', 'poster--empty')
  })
})

describe('Rail', () => {
  it('keeps a focused card fully in view', () => {
    const { container } = renderUi(<Rail title="R" count={1}><button type="button">card</button></Rail>, { api: makeFakeApi() })
    const btn = screen.getByRole('button', { name: 'card' })
    btn.scrollIntoView = vi.fn()
    fireEvent.focus(btn)
    expect(btn.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
    expect(container.querySelector('.rail')).not.toHaveClass('rail--wide')
  })
  it('variant wide adds the rail--wide class', () => {
    const { container } = renderUi(<Rail title="R" count={0} variant="wide" />, { api: makeFakeApi() })
    expect(container.querySelector('.rail')).toHaveClass('rail--wide')
  })
})
