import { useEffect, useState } from 'react'

export const useStoredState = <T,>(key: string, initialValue: T) => {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key)
      return stored ? (JSON.parse(stored) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
      } catch {
        // Storage can be unavailable or full; keep the in-memory state usable.
      }
    }, 200)

    return () => window.clearTimeout(timeout)
  }, [key, value])

  return [value, setValue] as const
}

export const downloadJSON = (filename: string, value: unknown) => {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
