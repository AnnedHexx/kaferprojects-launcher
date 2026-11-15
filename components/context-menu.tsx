'use client'

import { useEffect, useState } from 'react'
import { Copy, Edit, Eye, EyeOff, Flag, Pin, PinOff, Reply, Trash2, UserMinus, UserX } from 'lucide-react'

export type ContextMenuItem = {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  danger?: boolean
  divider?: boolean
}

type ContextMenuProps = {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  useEffect(() => {
    const handleClick = () => onClose()
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      onClose()
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('click', handleClick)
    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const adjustedX = Math.min(x, window.innerWidth - 220)
  const adjustedY = Math.min(y, window.innerHeight - items.length * 36 - 20)

  return (
    <>
      <div className="context-menu-overlay" />
      <div className="context-menu" style={{ left: adjustedX, top: adjustedY }}>
        {items.map((item, idx) => (
          <div key={idx}>
            {item.divider && <div className="context-menu-divider" />}
            <button
              className={`context-menu-item ${item.danger ? 'danger' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                item.onClick()
                onClose()
              }}
            >
              {item.icon}
              {item.label}
            </button>
          </div>
        ))}
      </div>
    </>
  )
}

export const contextMenuIcons = {
  copy: <Copy size={14} />,
  edit: <Edit size={14} />,
  delete: <Trash2 size={14} />,
  reply: <Reply size={14} />,
  pin: <Pin size={14} />,
  unpin: <PinOff size={14} />,
  hide: <EyeOff size={14} />,
  show: <Eye size={14} />,
  block: <UserX size={14} />,
  report: <Flag size={14} />,
  mute: <UserMinus size={14} />,
}

/** Elimina cualquier menú flotante abierto para que solo exista uno a la vez. */
export function removeFloatingMenus() {
  document.querySelectorAll('[data-eko-ctx]').forEach((el) => el.remove())
}
