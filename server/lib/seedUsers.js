/**
 * AUTH_USERS at boot: a bootstrap list, not a mirror.
 *
 * Each address that has no row in auth_users is inserted with the name and
 * role of the list. An address that already has a row, active or not, is
 * left untouched: the Users page owns it from then on. So editing a role in
 * .env changes nothing for an existing user, and a user an admin removed
 * (deactivated) through the page never comes back at the next restart.
 * Reactivation is done from the page.
 */
import { parseAuthUsers } from './tokens.js'

/**
 * @param {{ insertUserIfMissing: Function }} store
 * @param {string} raw the AUTH_USERS value
 * @returns {Promise<{ inserted: string[], kept: string[] }>}
 */
export async function seedAllowedUsers(store, raw) {
  const inserted = []
  const kept = []
  for (const user of parseAuthUsers(raw)) {
    if (await store.insertUserIfMissing(user)) inserted.push(user.email)
    else kept.push(user.email)
  }
  return { inserted, kept }
}
