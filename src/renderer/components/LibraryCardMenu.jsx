import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { useToast } from '../toast/ToastProvider.jsx'
import { useRemoveWithUndo } from '../library/useRemoveWithUndo.js'
import { STATUSES } from '../../shared/domain.js'
import { Icon } from './Icon.jsx'
import { ContextMenu, MenuItem, MenuSeparator, MenuGroup } from './ContextMenu.jsx'

// Context menu of a watchlist card (MediaCard, ContinueCard). Only series title and episode number — never an episode title.
export function LibraryCardMenu({ entry, next, canContinue, ready, onContinue, onOpen, menuProps }) {
  const api = useApi()
  const t = useT()
  const toast = useToast()
  const removeWithUndo = useRemoveWithUndo()
  const key = entry.aniCliTitle ?? entry.title

  const setStatus = (status) => {
    if (status !== entry.status) return api.library.update(entry.id, { status })
  }
  const togglePin = async () => {
    const r = await api.library.setPinned(entry.id, !entry.pinnedAt)
    if (!r?.ok) toast.show({ message: t('pin.limit'), icon: 'alert' })
  }

  return (
    <ContextMenu {...menuProps}>
      {canContinue && (
        <MenuItem icon={<Icon name="play" size={16} />} disabled={!ready} onSelect={() => onContinue({ query: key, anime: key, episode: String(next) })}>
          {t('home.continueEp', { episode: next })}
        </MenuItem>
      )}
      <MenuItem icon={<Icon name="info" size={16} />} navigates onSelect={() => onOpen(entry.id)}>{t('home.details')}</MenuItem>
      <MenuSeparator />
      <MenuGroup label={t('cardMenu.status')}>
        {STATUSES.map((s) => (
          <MenuItem key={s} checked={s === entry.status} onSelect={() => setStatus(s)}>{t(`status.${s}`)}</MenuItem>
        ))}
      </MenuGroup>
      <MenuItem icon={<Icon name="star" size={16} />} onSelect={togglePin}>{entry.pinnedAt ? t('pin.remove') : t('pin.add')}</MenuItem>
      <MenuSeparator />
      <MenuItem icon={<Icon name="close" size={16} />} releasesFocus onSelect={() => removeWithUndo(entry)}>{t('cardMenu.remove')}</MenuItem>
    </ContextMenu>
  )
}
