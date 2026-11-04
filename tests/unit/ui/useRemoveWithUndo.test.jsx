// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import { renderHookUi, makeFakeApi } from './helpers.jsx'
import { useRemoveWithUndo } from '../../../src/renderer/library/useRemoveWithUndo.js'

const setup = (api = makeFakeApi()) => renderHookUi(() => useRemoveWithUndo(), { api })

describe('useRemoveWithUndo', () => {
  it('removes, runs after, and offers a focused undo toast', async () => {
    const after = vi.fn()
    const { result, api } = setup()
    let ok
    await act(async () => { ok = await result.current({ id: 'a', title: 'Naruto' }, { after }) })
    expect(ok).toBe(true)
    expect(api.library.remove).toHaveBeenCalledWith('a')
    expect(after).toHaveBeenCalled()
    expect(await screen.findByText('Uklonjeno iz watchlist-e: Naruto')).toBeInTheDocument()
    const undo = screen.getByRole('button', { name: 'Poništi' })
    await waitFor(() => expect(undo).toHaveFocus())
  })
  it('undo restores and calls onRestored', async () => {
    const onRestored = vi.fn()
    const { result, api } = setup()
    await act(async () => { await result.current({ id: 'a', title: 'Naruto' }, { onRestored }) })
    fireEvent.click(await screen.findByRole('button', { name: 'Poništi' }))
    await waitFor(() => expect(api.library.restore).toHaveBeenCalledWith('a'))
    await waitFor(() => expect(onRestored).toHaveBeenCalled())
  })
  it('failed restore shows a message', async () => {
    const api = makeFakeApi({ library: { restore: vi.fn(async () => ({ ok: false })) } })
    const onRestored = vi.fn()
    const { result } = setup(api)
    await act(async () => { await result.current({ id: 'a', title: 'Naruto' }, { onRestored }) })
    fireEvent.click(await screen.findByRole('button', { name: 'Poništi' }))
    expect(await screen.findByText('Seriju nije moguće vratiti.')).toBeInTheDocument()
    expect(onRestored).not.toHaveBeenCalled()
  })
  it('remove throwing returns false and skips after', async () => {
    const api = makeFakeApi({ library: { remove: vi.fn(async () => { throw new Error('x') }) } })
    const after = vi.fn()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = setup(api)
    let ok
    await act(async () => { ok = await result.current({ id: 'a', title: 'N' }, { after }) })
    expect(ok).toBe(false)
    expect(after).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
