import { EVENTS } from '../shared/channels.js'

// Side effects of changed settings; shared by the settings:update IPC handler and the data import.
// `patch` only needs the changed keys with their new values.
export function createSettingsEffects({ updater, toolManager, send, onSettingsChanged }) {
  return (patch) => {
    if (patch && 'autoDownloadUpdates' in patch) updater.applySettings()
    if (patch?.mpvModernUi === true) toolManager.installOptional((p) => send(EVENTS.toolProgress, p))
    onSettingsChanged?.(patch)
  }
}
