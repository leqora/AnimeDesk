// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { PlayerReconnecting } from '../../../src/renderer/components/PlayerReconnecting.jsx'
import { renderUi } from './helpers.jsx'

describe('player loading screens', () => {
  it('the loading and reconnect screens can hold focus', () => {
    for (const state of ['reconnecting', 'failed']) {
      const { container, unmount } = renderUi(<PlayerReconnecting state={state} title="Show" episode="3" error="unknown" onRetry={vi.fn()} onBack={vi.fn()} />)
      expect(container.querySelector('.player')).toHaveAttribute('tabindex', '-1')
      unmount()
    }
  })
})
