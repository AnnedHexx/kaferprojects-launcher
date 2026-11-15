import { emojiSrc, getEmoji } from '@/lib/emoji-catalog'

const TOKEN = /:eko-(\d{3}):/g

export function EmojiGlyph({ id, size = 18, className }: { id: string; size?: number; className?: string }) {
  const emoji = getEmoji(id)
  if (!emoji) return null
  return (
    <img
      className={`emoji-glyph ${className || ''}`}
      src={emojiSrc(id)}
      alt={emoji.label}
      title={emoji.label}
      width={size}
      height={size}
      loading="lazy"
      draggable={false}
      style={{ width: size, height: size }}
    />
  )
}

export function EmojiText({ text }: { text: string }) {
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  const regex = new RegExp(TOKEN.source, 'g')

  while ((match = regex.exec(text)) !== null) {
    const id = `eko-${match[1]}`
    if (!getEmoji(id)) continue
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
    nodes.push(<EmojiGlyph key={`${id}-${match.index}`} id={id} size={20} />)
    lastIndex = match.index + match[0].length
  }

  if (lastIndex === 0) return <>{text}</>
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return <>{nodes}</>
}
