import { useT } from '../i18n/I18nContext.jsx'
import { ContextMenu, MenuItem, MenuSeparator } from './ContextMenu.jsx'
import { Icon } from './Icon.jsx'

// Menu of a recommendation / sequel card. `adder` is the card's useAddToWatchlist() result (kept by the card so that "added" survives the menu closing).
export function DiscoveryCardMenu({ item, kind, ready, onSearch, onOpen, onHide, inWatchlist = false, upcoming = false, adder, menuProps }) {
  const t = useT()
  const showAdd = !inWatchlist && !adder?.added
  return (
    <ContextMenu {...menuProps}>
      {!upcoming && (onOpen
        ? <MenuItem icon={<Icon name="info" size={16} />} navigates disabled={!ready} onSelect={() => onOpen()}>{t('cardMenu.open')}</MenuItem>
        : <MenuItem icon={<Icon name="search" size={16} />} navigates disabled={!ready} onSelect={() => onSearch(item.romaji ?? item.title)}>{t('cardMenu.search')}</MenuItem>)}
      {showAdd && adder && <MenuItem icon={<Icon name="watchlist" size={16} />} onSelect={() => adder.add()}>{t('cardMenu.add')}</MenuItem>}
      {onHide && (
        <>
          <MenuSeparator />
          <MenuItem icon={<Icon name="close" size={16} />} releasesFocus onSelect={() => onHide(item, true)}>{t(kind === 'rec' ? 'cardMenu.notRecommend' : 'cardMenu.hide')}</MenuItem>
        </>
      )}
    </ContextMenu>
  )
}
