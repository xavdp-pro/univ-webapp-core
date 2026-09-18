/**
 * Sidebar navigation, the single source of truth for menu groups and items.
 * `icon` is a key of src/components/iconMap.js: a new icon must be imported
 * from lucide-react AND mapped there, otherwise the sidebar shows the fallback.
 * `label` is an i18n key. `end` marks an exact-match route (the home page).
 */
export const nav = [
  {
    id: 'general',
    label: 'nav.group.general',
    items: [
      { to: '/', icon: 'home', label: 'nav.home', end: true },
      { to: '/components', icon: 'blocks', label: 'nav.components' },
    ],
  },
]
