import { createClient } from '@/lib/supabase/server'
import { requireFounder } from '@/lib/founders/access'
import { FOUNDER_GROUPS } from '@/lib/founders/questions'
import { Workbook } from './Workbook'

export const dynamic = 'force-dynamic'

interface AnswerRow { email: string; question_id: string; answer: string }
interface ConsensusRow { question_id: string; note: string; decided: boolean }

export default async function FoundersPage() {
  const ctx = await requireFounder()
  const supabase = await createClient()

  // RLS decides what comes back: always your own rows, everybody else's only
  // once every participant has submitted. The page never has to filter.
  const [{ data: answers }, { data: consensus }] = await Promise.all([
    supabase.from('founders_answers').select('email, question_id, answer'),
    supabase.from('founders_consensus').select('question_id, note, decided'),
  ])

  const byPerson: Record<string, Record<string, string>> = {}
  for (const row of (answers ?? []) as AnswerRow[]) {
    ;(byPerson[row.email] ??= {})[row.question_id] = row.answer
  }

  const agreed: Record<string, { note: string; decided: boolean }> = {}
  for (const row of (consensus ?? []) as ConsensusRow[]) {
    agreed[row.question_id] = { note: row.note, decided: row.decided }
  }

  return (
    <Workbook
      groups={FOUNDER_GROUPS}
      me={ctx.me}
      participants={ctx.participants}
      revealed={ctx.revealed}
      answersByPerson={byPerson}
      consensus={agreed}
    />
  )
}
