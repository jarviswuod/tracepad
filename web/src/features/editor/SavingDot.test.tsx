import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SavingDot, savingDotState } from './SavingDot'

afterEach(() => cleanup())

describe('saving dot', () => {
  it('shows a grey dot while keystrokes are unsaved', () => {
    render(<SavingDot state="unsaved" />)
    const dot = screen.getByLabelText('Unsaved')
    expect(dot).toHaveAttribute('data-saving', 'unsaved')
    expect(dot).toHaveClass('saving-dot-unsaved')
    expect(getComputedStyle(dot).backgroundColor).toBe('rgb(154, 160, 166)')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows nothing once the draft is saved and nothing is waiting to sync', () => {
    const { container } = render(<SavingDot state="saved" />)
    expect(screen.queryByLabelText('Unsaved')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Not synced yet')).not.toBeInTheDocument()
    expect(container.querySelector('.saving-dot')).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a second dot state when the note is not synced yet', () => {
    render(<SavingDot state="pending" />)
    const dot = screen.getByLabelText('Not synced yet')
    expect(dot).toHaveAttribute('data-saving', 'pending')
    expect(dot).toHaveClass('saving-dot-pending')
    expect(getComputedStyle(dot).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(getComputedStyle(dot).borderTopColor).toBe('rgb(154, 160, 166)')
    expect(screen.queryByLabelText('Unsaved')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps unsaved keystrokes ahead of a pending outbox', () => {
    expect(savingDotState(true, true)).toBe('unsaved')
    expect(savingDotState(true, false)).toBe('unsaved')
    expect(savingDotState(false, true)).toBe('pending')
    expect(savingDotState(false, false)).toBe('saved')
  })
})
