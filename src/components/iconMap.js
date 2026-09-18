/**
 * Explicit icon registry for the navigation. lucide-react is tree-shaken, so an
 * icon used by name in src/data/nav.js must be imported here AND added to the
 * map; a missing key falls back to `Circle` and stays visible instead of crashing.
 */
import { Blocks, Circle, Home, Table } from 'lucide-react'

export const iconMap = {
  home: Home,
  blocks: Blocks,
  table: Table,
}

export const FallbackIcon = Circle

export function resolveIcon(name) {
  return iconMap[name] || FallbackIcon
}
