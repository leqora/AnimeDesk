import { mpvBoostArgs } from '../shared/volumeBoost.js'

// configDir() is only called with the modern UI on; it returns the mpv config dir or null.
export function buildMpvExtraArgs({ settings, configDir }) {
  const dir = settings.mpvModernUi ? configDir() : null
  return [...(dir ? [`--config-dir=${dir}`] : []), ...mpvBoostArgs(settings.volumeBoost)]
}
