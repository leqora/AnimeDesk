// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderUi } from './helpers.jsx'
import { MenuButton } from '../../../src/renderer/components/MenuButton.jsx'

describe('MenuButton onOpenChange', () => {
  it('reports opening and closing', () => {
    const onOpenChange = vi.fn()
    renderUi(<MenuButton label="Meni" onOpenChange={onOpenChange}><button type="button" role="menuitem">A</button></MenuButton>)
    expect(onOpenChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Meni' }))
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    fireEvent.keyDown(screen.getByRole('menuitem'), { key: 'Escape' })
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })
  it('reports closing when closeWhen turns true', () => {
    const onOpenChange = vi.fn()
    const ui = (closeWhen) => <MenuButton label="Meni" closeWhen={closeWhen} onOpenChange={onOpenChange}><button type="button" role="menuitem">A</button></MenuButton>
    const { rerender } = renderUi(ui(false))
    fireEvent.click(screen.getByRole('button', { name: 'Meni' }))
    rerender(ui(true))
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })
})
