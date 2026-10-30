import { useEffect, useId, useRef, useState } from 'react'
import { EmojiAdd, Edit, Dots, IconButton } from './common'
import './MessageActions.css'

// Hover toolbar shown above a message bubble. Contains quick emoji reactions,
// the full emoji picker trigger, a divider, then edit/more-options.
const QUICK_REACTIONS = [
  { key: 'like', emoji: '👍', label: 'Like' },
  { key: 'heart', emoji: '❤️', label: 'Heart' },
  { key: 'laugh', emoji: '😂', label: 'Laugh' },
  { key: 'surprise', emoji: '😮', label: 'Surprise' },
]

export default function MessageActions({ onReact, onDelete, restricted = false }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const actionsRef = useRef(null)
  const moreRef = useRef(null)
  const deleteRef = useRef(null)
  const menuId = useId()

  useEffect(() => {
    if (!menuOpen) return
    deleteRef.current?.focus()
    const onDown = event => {
      if (!actionsRef.current?.contains(event.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  return (
    <>
      <div className="message-actions-trigger" aria-hidden="true" />
      <div
        ref={actionsRef}
        className={`message-actions${menuOpen ? ' message-actions-open' : ''}`}
        onClick={event => event.stopPropagation()}
        onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false)
        }}
        onKeyDown={event => {
          if (event.key === 'Escape' && menuOpen) {
            event.preventDefault()
            event.stopPropagation()
            setMenuOpen(false)
            moreRef.current?.focus()
          }
        }}
      >
        {!restricted && (
          <>
            {QUICK_REACTIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                className="message-action-btn message-action-emoji"
                aria-label={r.label}
                onClick={() => onReact?.(r.emoji)}
              >
                <span aria-hidden="true">{r.emoji}</span>
              </button>
            ))}
            <IconButton label="More emojis" className="message-action-btn">
              <EmojiAdd size={18} />
            </IconButton>
            <span className="message-actions-divider" aria-hidden="true" />
            <IconButton label="Edit" className="message-action-btn">
              <Edit size={16} />
            </IconButton>
          </>
        )}
        <IconButton
          ref={moreRef}
          label="More options"
          className="message-action-btn"
          aria-haspopup={onDelete ? 'menu' : undefined}
          aria-expanded={onDelete ? menuOpen : undefined}
          aria-controls={menuOpen ? menuId : undefined}
          onClick={onDelete ? () => setMenuOpen(open => !open) : undefined}
        >
          <Dots size={18} />
        </IconButton>
        {menuOpen && (
          <div
            id={menuId}
            className="message-options-menu"
            role="menu"
            aria-label="Message options"
            onKeyDown={event => {
              if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault()
                deleteRef.current?.focus()
              }
            }}
          >
            <button
              ref={deleteRef}
              type="button"
              role="menuitem"
              className="message-options-item"
              onClick={() => {
                setMenuOpen(false)
                onDelete()
              }}
            >Delete</button>
          </div>
        )}
      </div>
    </>
  )
}
