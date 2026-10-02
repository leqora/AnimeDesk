// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { Semaphore } from '../../../src/renderer/components/Semaphore.jsx'
import { ReadyNotice } from '../../../src/renderer/components/ReadyNotice.jsx'
import { ConfirmButton } from '../../../src/renderer/components/ConfirmButton.jsx'
import { AskDialog } from '../../../src/renderer/components/AskDialog.jsx'
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
    expect(container).toBeEmptyDOMElement()
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
})
