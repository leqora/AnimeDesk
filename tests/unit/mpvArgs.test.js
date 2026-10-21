import { describe, it, expect, vi } from 'vitest'
import { buildMpvExtraArgs } from '../../src/main/mpvArgs.js'

const boost = '--af-add=@animedesk-boost:lavfi=[volume=2,alimiter=limit=0.95:level=disabled]'

describe('buildMpvExtraArgs', () => {
  it('skips the config dir when the modern UI is off', () => {
    const configDir = vi.fn(() => 'D')
    expect(buildMpvExtraArgs({ settings: { mpvModernUi: false, volumeBoost: 2 }, configDir })).toEqual([boost])
    expect(configDir).not.toHaveBeenCalled()
  })
  it('adds the config dir before the boost', () => {
    expect(buildMpvExtraArgs({ settings: { mpvModernUi: true, volumeBoost: 2 }, configDir: () => 'D' })).toEqual(['--config-dir=D', boost])
  })
  it('omits the config arg when there is no dir', () => {
    expect(buildMpvExtraArgs({ settings: { mpvModernUi: true, volumeBoost: 2 }, configDir: () => null })).toEqual([boost])
  })
  it('is unchanged with boost 1', () => {
    expect(buildMpvExtraArgs({ settings: { mpvModernUi: true, volumeBoost: 1 }, configDir: () => 'D' })).toEqual(['--config-dir=D'])
    expect(buildMpvExtraArgs({ settings: { mpvModernUi: false, volumeBoost: 1 }, configDir: () => 'D' })).toEqual([])
  })
})
