'use client'

import { createContext, useContext } from 'react'

export type LayoutContextType = {
  topbarCollapsed: boolean
  sidebarCollapsed: boolean
  fullscreen: boolean
  setFullscreen: (v: boolean) => void
}

export const LayoutContext = createContext<LayoutContextType>({
  topbarCollapsed: false,
  sidebarCollapsed: false,
  fullscreen: false,
  setFullscreen: () => {},
})

export const useLayout = () => useContext(LayoutContext)
