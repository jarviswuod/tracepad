import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NoteModal } from './NoteModal'

afterEach(() => {
  cleanup()
})

function Harness({ onClose, color = null }: { onClose?: () => void; color?: string | null }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Card
      </button>
      <button type="button">Outside</button>
      {open ? (
        <NoteModal
          label="Note"
          color={color}
          onClose={() => {
            onClose?.()
            setOpen(false)
          }}
        >
          <input aria-label="Title" />
          <button type="button">Inside</button>
        </NoteModal>
      ) : null}
    </>
  )
}

async function openModal(props: { onClose?: () => void; color?: string | null } = {}) {
  const user = userEvent.setup()
  render(<Harness {...props} />)
  await user.click(screen.getByRole('button', { name: 'Card' }))
  return { user, dialog: screen.getByRole('dialog', { name: 'Note' }) }
}

describe('NoteModal', () => {
  it('is a modal dialog in the note color, with focus moved inside', async () => {
    const { dialog } = await openModal({ color: '#fff475' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.style.backgroundColor).toBe('rgb(255, 244, 117)')
    expect(screen.getByLabelText('Title')).toHaveFocus()
  })

  it('uses white when the note has no color', async () => {
    const { dialog } = await openModal()
    expect(dialog.style.backgroundColor).toBe('rgb(255, 255, 255)')
  })

  it('closes on Esc and returns focus to the card', async () => {
    const onClose = vi.fn()
    const { user } = await openModal({ onClose })
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Card' })).toHaveFocus()
  })

  it('closes on a backdrop click but not on a click inside', async () => {
    const onClose = vi.fn()
    const { dialog } = await openModal({ onClose })
    fireEvent.click(dialog)
    fireEvent.click(screen.getByLabelText('Title'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('note-modal-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Card' })).toHaveFocus()
  })

  it('closes on the Close button', async () => {
    const onClose = vi.fn()
    const { user } = await openModal({ onClose })
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Card' })).toHaveFocus()
  })

  it('traps focus inside with Tab and Shift+Tab', async () => {
    const { user } = await openModal()
    const title = screen.getByLabelText('Title')
    const inside = screen.getByRole('button', { name: 'Inside' })
    const close = screen.getByRole('button', { name: 'Close' })

    await user.tab()
    expect(inside).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.tab()
    expect(title).toHaveFocus()
    await user.tab({ shift: true })
    expect(close).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Outside' })).not.toHaveFocus()
  })

  it('stops the page scrolling while open and restores it on close', async () => {
    const { user } = await openModal()
    expect(document.documentElement.style.overflow).toBe('hidden')
    await user.keyboard('{Escape}')
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('falls back to returnFocusTo when the opener is gone', async () => {
    const user = userEvent.setup()
    function Gone() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type="button">Fallback</button>
          {open ? (
            <NoteModal
              label="Note"
              color={null}
              onClose={() => setOpen(false)}
              returnFocusTo={() => screen.getByRole('button', { name: 'Fallback' })}
            >
              <input aria-label="Title" />
            </NoteModal>
          ) : null}
        </>
      )
    }
    render(<Gone />)
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Fallback' })).toHaveFocus()
  })
})
