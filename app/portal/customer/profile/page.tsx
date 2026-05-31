import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { User, Mail, Phone } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'My Profile' }

export default async function CustomerProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">My Profile</h1>
        <p className="text-muted-foreground mt-1">Your account details</p>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-accent" />
            Account Information
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Full name</p>
            <p className="font-medium">{profile?.full_name ?? '—'}</p>
          </div>

          <div className="flex items-start gap-3">
            <Mail className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Email</p>
              <p className="text-sm">{user?.email}</p>
            </div>
          </div>

          {profile?.phone && (
            <div className="flex items-start gap-3">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Phone</p>
                <p className="text-sm">{profile.phone}</p>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground pt-3 border-t border-border">
            To update your details, contact Haberl directly at{' '}
            <a href="mailto:info@haberl.co.za" className="text-accent hover:underline">
              info@haberl.co.za
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
