import { createClient, getUser } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { AuditRulesManager, type AuditRule } from './AuditRulesManager'

export default async function AuditRulesPage() {
  const user = await getUser()
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user!.id).single()

  if (profile?.role !== 'admin') {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          Audit rules can only be edited by admins.
        </CardContent>
      </Card>
    )
  }

  const { data } = await supabase
    .from('audit_rules')
    .select('id, code, category, severity, title, detail, active')
    .order('category')
    .order('code')

  return <AuditRulesManager initialRules={(data ?? []) as AuditRule[]} />
}
