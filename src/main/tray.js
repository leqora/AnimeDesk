export function createTray({ Tray, Menu, iconPath, labels, onOpen, onQuit }) {
  let tray = new Tray(iconPath)
  tray.setToolTip('AnimeDesk')
  const apply = (l) => tray?.setContextMenu(Menu.buildFromTemplate([
    { label: l.open, click: () => onOpen() },
    { label: l.quit, click: () => onQuit() },
  ]))
  apply(labels)
  tray.on('click', () => onOpen())
  return {
    setLabels: (l) => apply(l),
    destroy() { if (!tray) return; tray.destroy(); tray = null },
  }
}
