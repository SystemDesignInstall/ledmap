import { sameCapacityMode, type HardwareCapacityMode, type LedMapProjectV2 } from '@ledmap/core'
import { setCapacityProfileV2, setPortCapacityOverrideV2 } from './v2-capacity-commands.js'

type Run = (command: (project: LedMapProjectV2) => LedMapProjectV2) => void

function field(form: HTMLElement, label: string, value: string, type = 'text'): HTMLInputElement {
  const wrapper = document.createElement('label')
  wrapper.className = 'property-row'
  const caption = document.createElement('span')
  caption.textContent = label
  const input = document.createElement('input')
  input.type = type
  input.value = value
  input.setAttribute('aria-label', label)
  if (type === 'number') { input.min = '0'; input.step = 'any' }
  wrapper.append(caption, input)
  form.append(wrapper)
  return input
}

function note(parent: HTMLElement, text: string): void {
  const value = document.createElement('p')
  value.className = 'hint'
  value.textContent = text
  parent.append(value)
}

function button(parent: HTMLElement, text: string, run?: () => void): void {
  const value = document.createElement('button')
  value.type = run ? 'button' : 'submit'
  value.textContent = text
  if (run) value.addEventListener('click', run)
  parent.append(value)
}

function editor(title: string): { details: HTMLDetailsElement; form: HTMLFormElement } {
  const details = document.createElement('details')
  const summary = document.createElement('summary')
  summary.textContent = title
  const form = document.createElement('form')
  form.noValidate = true
  details.append(summary, form)
  return { details, form }
}

function number(input: HTMLInputElement): number { return input.value.trim() === '' ? NaN : Number(input.value) }
function optional(input: HTMLInputElement): number | undefined { return input.value.trim() === '' ? undefined : Number(input.value) }

export function capacityModeText(mode: HardwareCapacityMode): string {
  return `${mode.frameRateHz} Hz · ${mode.bitDepth} bit · ${mode.linkRateGbps} Gbit/s`
}

export function processorCapacityEditor(project: LedMapProjectV2, id: string, run: Run): HTMLElement {
  const profile = project.hardware.processors.find(value => value.id === id)!.capacityProfile
  const { details, form } = editor('Edit capacity profile')
  details.dataset['capacityProfileEditor'] = id
  const name = field(form, 'Capacity profile name', profile?.name ?? '')
  const source = document.createElement('select')
  source.setAttribute('aria-label', 'Capacity source kind')
  for (const [value, label] of [['manual', 'Operator declaration'], ['manufacturer', 'Manufacturer documentation (operator entered)']]) {
    const option = document.createElement('option')
    option.value = value!; option.textContent = label!
    source.append(option)
  }
  source.value = profile?.source.kind ?? 'manual'
  form.append(source)
  const reference = field(form, 'Capacity source reference', profile?.source.reference ?? '')
  const revision = field(form, 'Capacity source revision', profile?.source.revision ?? '')
  const hz = field(form, 'Capacity frame rate Hz', String(profile?.mode.frameRateHz ?? 60), 'number')
  const bits = field(form, 'Capacity bit depth', String(profile?.mode.bitDepth ?? 8), 'number')
  const link = field(form, 'Capacity link rate Gbps', String(profile?.mode.linkRateGbps ?? 1), 'number')
  const port = field(form, 'Profile Port pixel limit', profile?.portPixelCapacity?.toString() ?? '', 'number')
  const processor = field(form, 'Profile Processor pixel limit', profile?.processorPixelCapacity?.toString() ?? '', 'number')
  note(form, 'Limits apply only to this declared mode. Blank limits stay unknown. Documentation is not a device compatibility certificate. Apply is one Undo step; profiles require .ledmap v6, which older LedMAP versions cannot open.')
  const actions = document.createElement('div')
  actions.className = 'inspector-actions'
  button(actions, 'Apply capacity profile')
  if (profile) button(actions, 'Clear capacity profile', () => run(current => setCapacityProfileV2(current, id, null)))
  form.append(actions)
  form.addEventListener('submit', event => {
    event.preventDefault()
    const portPixelCapacity = optional(port)
    const processorPixelCapacity = optional(processor)
    run(current => setCapacityProfileV2(current, id, {
      name: name.value, source: { kind: source.value as 'manual' | 'manufacturer', reference: reference.value, revision: revision.value },
      mode: { frameRateHz: number(hz), bitDepth: number(bits) as 8 | 10 | 12, linkRateGbps: number(link) as 1 | 5 | 10 },
      ...(portPixelCapacity === undefined ? {} : { portPixelCapacity }),
      ...(processorPixelCapacity === undefined ? {} : { processorPixelCapacity }),
    }))
  })
  return details
}

export function portCapacityEditor(project: LedMapProjectV2, id: string, run: Run): HTMLElement {
  const port = project.hardware.ports.find(value => value.id === id)!
  const profile = project.hardware.processors.find(value => value.id === port.processorId)?.capacityProfile
  const override = port.pixelCapacityOverride
  const { details, form } = editor('Edit Port pixel override')
  details.dataset['capacityOverrideEditor'] = id
  if (override) note(form, `Stored override: ${override.pixelCapacity} px · ${capacityModeText(override.mode)} · ${override.reason}. ` +
    (profile && sameCapacityMode(profile.mode, override.mode) ? 'Active for the current mode.' : 'Inactive for the current mode.'))
  const pixels = field(form, 'Override Port pixel limit', override?.pixelCapacity.toString() ?? '', 'number')
  const reason = field(form, 'Override reason', override?.reason ?? '')
  note(form, profile ? `Apply explicitly binds this override to ${capacityModeText(profile.mode)}. It does not change the Processor limit.` :
    'Configure a Processor capacity profile before applying an override. Existing inactive intent is retained.')
  const actions = document.createElement('div')
  actions.className = 'inspector-actions'
  if (profile) button(actions, 'Apply Port override')
  if (override) button(actions, 'Clear Port override', () => run(current => setPortCapacityOverrideV2(current, id, null)))
  form.append(actions)
  form.addEventListener('submit', event => {
    event.preventDefault()
    if (!profile) return
    run(current => setPortCapacityOverrideV2(current, id, { pixelCapacity: number(pixels), reason: reason.value, mode: profile.mode }))
  })
  return details
}
