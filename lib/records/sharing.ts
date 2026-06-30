import type { SupabaseClient } from '@supabase/supabase-js'

export interface StaffMember { id: string; full_name: string }

export interface SharingContext {
  staff: StaffMember[]
  nameById: Map<string, string>
  sharedWith: StaffMember[]
}

/** The staff directory used by every owner picker + name label. */
export async function getStaffDirectory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
): Promise<{ staff: StaffMember[]; nameById: Map<string, string> }> {
  const { data: staffRows } = await supabase
    .from('user_profiles')
    .select('id, full_name')
    .in('role', ['field_worker', 'manager', 'admin'])
    .order('full_name')
  const staff: StaffMember[] = (staffRows ?? []).map((s: { id: string; full_name: string | null }) => ({
    id: s.id,
    full_name: s.full_name || 'Unnamed',
  }))
  return { staff, nameById: new Map(staff.map((s) => [s.id, s.full_name])) }
}

/**
 * Server-side data for ONE record's ownership/sharing control (migrations
 * 071/072): the staff directory plus that record's existing share grants.
 */
export async function getSharingContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  section: string,
  recordId: string,
): Promise<SharingContext> {
  const { staff, nameById } = await getStaffDirectory(supabase)

  const { data: grantRows } = await supabase
    .from('record_grants')
    .select('user_id')
    .eq('section', section)
    .eq('record_id', recordId)
  const sharedWith: StaffMember[] = (grantRows ?? []).map((g: { user_id: string }) => ({
    id: g.user_id,
    full_name: nameById.get(g.user_id) ?? 'Someone',
  }))

  return { staff, nameById, sharedWith }
}
