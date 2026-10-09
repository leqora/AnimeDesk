// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderUi } from './helpers.jsx'
import { ErrorBoundary } from '../../../src/renderer/components/ErrorBoundary.jsx'

function Boom() { throw new Error('kaboom') }

describe('ErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders its children when nothing throws', () => {
    renderUi(<ErrorBoundary><p>ok</p></ErrorBoundary>)
    expect(screen.getByText('ok')).toBeInTheDocument()
  })

  it('shows a translated fallback instead of a blank screen when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderUi(<ErrorBoundary><Boom /></ErrorBoundary>)
    expect(screen.getByRole('alert')).toHaveTextContent('Nešto je pošlo naopako')
    expect(screen.getByRole('alert')).toHaveTextContent('kaboom')
  })

  it('offers an action button when one is given', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onAction = vi.fn()
    renderUi(<ErrorBoundary actionLabelKey="error.close" onAction={onAction}><Boom /></ErrorBoundary>, { lang: 'en' })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onAction).toHaveBeenCalled()
  })
})
