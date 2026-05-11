'use client'

import { useRouter } from 'next/navigation'
import { useNavTransition } from './nav-context'

export function NavLink({
  href,
  className,
  style,
  children,
}: {
  href: string
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  const router = useRouter()
  const { startNavTransition } = useNavTransition()

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    startNavTransition(() => router.push(href))
  }

  return (
    <a href={href} onClick={handleClick} className={className} style={style}>
      {children}
    </a>
  )
}
