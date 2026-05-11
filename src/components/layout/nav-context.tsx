'use client'

import { createContext, useContext } from 'react'

type NavContextValue = {
  startNavTransition: (action: () => void) => void
}

export const NavContext = createContext<NavContextValue>({
  startNavTransition: (action) => action(),
})

export function useNavTransition() {
  return useContext(NavContext)
}
