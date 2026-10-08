import { describe, expect, it } from 'vitest'
import { ProjectDocumentController } from '../src/renderer/document.js'
import { addGuide, moveGuide, setGuideLocked } from '../src/renderer/layout-interaction.js'
import { loadProjectSession, serializeProjectSession, sessionDirty } from '../src/renderer/project-session.js'
import { MAX_PROJECT_GUIDES, projectGuidesFromExtensions, withProjectGuides } from '../src/renderer/project-guides.js'

describe('Composition project guides', () => {
  it('saves guides in the document and restores them through Undo, Redo and Open', async () => {
    const document = new ProjectDocumentController(() => 'guides')
    await document.save(false, async () => ({ canceled: false, filePath: 'guides.ledmap' }))
    const first = addGuide([], 'vertical', 120)
    document.transactExtensions(extensions => withProjectGuides(extensions, first))
    expect(sessionDirty(document.session)).toBe(true)
    const moved = setGuideLocked(moveGuide(first, first[0]!.id, 200), first[0]!.id, true)
    document.transactExtensions(extensions => withProjectGuides(extensions, moved))
    document.undo()
    expect(projectGuidesFromExtensions(document.session.extensions)).toEqual(first)
    document.redo()
    expect(projectGuidesFromExtensions(document.session.extensions)).toEqual(moved)
    const reopened = loadProjectSession(serializeProjectSession(document.session), 'guides.ledmap', 'reopened')
    expect(projectGuidesFromExtensions(reopened.extensions)).toEqual(moved)
    expect(projectGuidesFromExtensions({})).toEqual([])
  })

  it('allocates a new identity after loading existing guides', () => {
    const existing = [{ id: 'guide-1', orientation: 'vertical' as const, position: 10, locked: false }]
    const loaded = projectGuidesFromExtensions(withProjectGuides({}, existing))
    expect(addGuide(loaded, 'horizontal', 20).map(guide => guide.id)).toEqual(['guide-1', 'guide-2'])
    expect(addGuide([], 'horizontal', 20)[0]?.id).toBe('guide-1')
  })

  it('accepts the guide limit and rejects an additional guide', () => {
    const guides = Array.from({ length: MAX_PROJECT_GUIDES }, (_, index) => ({
      id: `guide-${index + 1}`, orientation: 'vertical' as const, position: index, locked: false,
    }))
    expect(projectGuidesFromExtensions(withProjectGuides({}, guides))).toHaveLength(MAX_PROJECT_GUIDES)
    expect(() => withProjectGuides({}, [...guides, {
      id: `guide-${MAX_PROJECT_GUIDES + 1}`, orientation: 'horizontal', position: 0, locked: false,
    }])).toThrow(/at most/)
  })

  it('rejects duplicate or malformed persisted guides', () => {
    const guide = { id: 'guide-1', orientation: 'vertical' as const, position: 10, locked: false }
    expect(() => withProjectGuides({}, [guide, guide])).toThrow(/identity/)
    expect(() => withProjectGuides({}, [{ ...guide, position: Number.POSITIVE_INFINITY }])).toThrow(/position/)
  })
})
