import { useState, useEffect } from 'react'

/**
 * Hook to safely use localStorage with SSR
 * Prevents hydration mismatches by always rendering with initial value on server
 * and only loading from localStorage after mount on client
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T) => void, boolean] {
  // Always use initialValue for SSR and first client render
  const [storedValue, setStoredValue] = useState<T>(initialValue)
  const [isHydrated, setIsHydrated] = useState(false)

  // Load from localStorage after mount (client-side only)
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key)
      if (item) {
        setStoredValue(JSON.parse(item))
      }
    } catch (error) {
      console.error(`Error loading ${key} from localStorage:`, error)
    }
    setIsHydrated(true)
  }, [key])

  // Save to localStorage whenever value changes
  const setValue = (value: T) => {
    try {
      setStoredValue(value)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(value))
      }
    } catch (error) {
      console.error(`Error saving ${key} to localStorage:`, error)
    }
  }

  return [storedValue, setValue, isHydrated]
}
