'use server'

/**
 * Both codes are compared on the server so they are never present in the
 * browser bundle. Each role has its own code; the super admin code is not
 * accepted by the transport admin form and vice versa.
 *
 * Override either with ADMIN_ACCESS_CODE / SUPER_ADMIN_ACCESS_CODE in .env.local.
 */

const FALLBACK_ADMIN_ACCESS_CODE = '4821'
const FALLBACK_SUPER_ADMIN_ACCESS_CODE = '9021'

const matchesCode = (code: string, expected: string): boolean => {
  const supplied = code.trim()
  if (!/^\d{4}$/.test(supplied)) return false

  let difference = supplied.length ^ expected.length
  for (let i = 0; i < expected.length; i += 1) {
    difference |= (supplied.charCodeAt(i) || 0) ^ expected.charCodeAt(i)
  }
  return difference === 0
}

export async function verifyAdminAccessCode(code: string): Promise<boolean> {
  const expected = process.env.ADMIN_ACCESS_CODE?.trim() || FALLBACK_ADMIN_ACCESS_CODE
  return matchesCode(code, expected)
}

export async function verifySuperAdminAccessCode(code: string): Promise<boolean> {
  const expected = process.env.SUPER_ADMIN_ACCESS_CODE?.trim() || FALLBACK_SUPER_ADMIN_ACCESS_CODE
  return matchesCode(code, expected)
}
