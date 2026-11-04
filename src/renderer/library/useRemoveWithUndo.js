import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { useToast } from '../toast/ToastProvider.jsx'

// Removes a series from the watchlist and offers "Poništi" in a toast (focus goes to the button).
// Resolves to false when the removal itself failed. id/title are captured: the card or detail is gone by the time the toast is used.
export function useRemoveWithUndo() {
  const api = useApi()
  const t = useT()
  const toast = useToast()
  return async ({ id, title }, { after, onRestored } = {}) => {
    try { await api.library.remove(id) } catch (err) { console.error(err); return false }
    after?.()
    toast.show({
      focusAction: true,
      message: t('toast.removed', { title }),
      action: {
        label: t('toast.undo'),
        onAction: async () => {
          let ok = false
          try { ok = Boolean((await api.library.restore(id))?.ok) } catch (err) { console.error(err) }
          if (ok) onRestored?.()
          else toast.show({ message: t('toast.restoreFailed'), icon: 'alert' })
        },
      },
    })
    return true
  }
}
