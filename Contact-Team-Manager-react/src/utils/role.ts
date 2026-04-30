/**
 * Normalize a role string from the DB to the canonical form expected by all
 * frontend role checks (`'Admin' | 'Manager' | 'Member' | 'Viewer'`).
 *
 * Background: production DB has mixed casing — `profiles.role` stores
 * `'admin' | 'manager' | 'user'` (all lowercase) while `team_members.role`
 * stores a mix of `'Manager' | 'Member' | 'member'`. Frontend code throughout
 * the app does case-sensitive comparisons (`profile.role === 'Admin'`,
 * `['Admin', 'Manager'].includes(role)`, ...). Without normalization, the
 * single Admin user and 2 Manager users never match and lose elevated
 * permissions (e.g. admin's full team list collapses to just their
 * memberships, hiding child channels like "Pool" under 連絡).
 *
 * This helper is the single chokepoint applied at the 2 places where role
 * fields enter React state (AuthContext.loadProfile and
 * useUserMemberships.fetchMemberships). Downstream call sites can stay
 * unchanged.
 *
 * Values not matching a known role (e.g. legacy `'user'`) are returned
 * verbatim so existing fallthrough behavior is preserved.
 */
export function normalizeRole<T extends string | null | undefined>(role: T): T {
    if (typeof role !== 'string' || !role) return role;
    const lower = role.toLowerCase();
    if (lower === 'admin') return 'Admin' as unknown as T;
    if (lower === 'manager') return 'Manager' as unknown as T;
    if (lower === 'member') return 'Member' as unknown as T;
    if (lower === 'viewer') return 'Viewer' as unknown as T;
    return role;
}
