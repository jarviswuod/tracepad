import { useCallback } from 'react'
import type { Uuid } from '../../domain/types'

/**
 * Note ids stay here, not in the HTML.
 * A card ref fills the map. Muuri, the open card's slot, and focus return read it.
 */
const noteIds = new Map<HTMLElement, Uuid>()

/** The card root for this note, still on the page. That element is the open card's slot. */
export function noteCardElement(noteId: Uuid): HTMLElement | null {
  for (const [element, id] of noteIds) {
    if (id === noteId && element.isConnected) return element
  }
  return null
}

/** The button focus returns to after the modal closes or the card is remounted. */
export function noteCardButton(noteId: Uuid): HTMLElement | null {
  const slot = noteCardElement(noteId)
  if (!slot) return null
  if (slot.classList.contains('note-card')) return slot
  return slot.querySelector<HTMLElement>('.note-card')
}

/** The note for this card element, or for a press inside it. */
export function noteIdFromCard(target: EventTarget | null): Uuid | null {
  if (!(target instanceof Element)) return null
  let node: Element | null = target
  while (node) {
    if (node instanceof HTMLElement) {
      const noteId = noteIds.get(node)
      if (noteId) return noteId
    }
    node = node.parentElement
  }
  return null
}

/** Register the card root while it is on the page. The id is not written into the DOM. */
export function useNoteCardRef(noteId: Uuid) {
  return useCallback((element: HTMLElement | null) => {
    if (!element) return
    noteIds.set(element, noteId)
    return () => {
      if (noteIds.get(element) === noteId) noteIds.delete(element)
    }
  }, [noteId])
}
