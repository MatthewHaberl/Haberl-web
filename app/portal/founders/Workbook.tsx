'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Loader2, Lock, LockOpen, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { FounderGroup } from '@/lib/founders/questions'
import type { FounderParticipant } from '@/lib/founders/access'

type Filter = 'all' | 'first' | 'todo'

interface Props {
  groups: FounderGroup[]
  me: FounderParticipant
  participants: FounderParticipant[]
  /** True once everyone has submitted — the point answers become comparable. */
  revealed: boolean
  /** question answers keyed by participant email. RLS decides what is in here. */
  answersByPerson: Record<string, Record<string, string>>
  consensus: Record<string, { note: string; decided: boolean }>
}

/** Debounce, in ms, between the last keystroke and the save. */
const SAVE_DELAY = 900

export function Workbook({
  groups, me, participants, revealed, answersByPerson, consensus,
}: Props) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [answers, setAnswers] = useState<Record<string, string>>(
    () => ({ ...(answersByPerson[me.email] ?? {}) }),
  )
  const [agreed, setAgreed] = useState(consensus)
  const [saving, setSaving] = useState<Record<string, 'saving' | 'saved' | 'error'>>({})
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const locked = !!me.submitted_at
  const questions = useMemo(() => groups.flatMap((g) => g.questions), [groups])
  const answeredCount = questions.filter((q) => (answers[q.id] ?? '').trim()).length
  const others = participants.filter((p) => p.email !== me.email)

  // One pending timer per question, so typing in question 12 never cancels the
  // save queued for question 11.
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  useEffect(() => {
    const pending = timers.current
    return () => { Object.values(pending).forEach(clearTimeout) }
  }, [])

  const saveAnswer = useCallback(async (questionId: string, value: string) => {
    setSaving((s) => ({ ...s, [questionId]: 'saving' }))
    const { error: err } = await supabase
      .from('founders_answers')
      .upsert(
        { email: me.email, question_id: questionId, answer: value },
        { onConflict: 'email,question_id' },
      )
    setSaving((s) => ({ ...s, [questionId]: err ? 'error' : 'saved' }))
  }, [supabase, me.email])

  function onAnswerChange(questionId: string, value: string) {
    setAnswers((a) => ({ ...a, [questionId]: value }))
    clearTimeout(timers.current[questionId])
    timers.current[questionId] = setTimeout(() => saveAnswer(questionId, value), SAVE_DELAY)
  }

  async function saveConsensus(questionId: string, note: string, decided: boolean) {
    setAgreed((c) => ({ ...c, [questionId]: { note, decided } }))
    await supabase
      .from('founders_consensus')
      .upsert(
        { question_id: questionId, note, decided, updated_by: me.email },
        { onConflict: 'question_id' },
      )
  }

  async function setSubmitted(next: boolean) {
    setBusy(true)
    setError(null)
    // Flush anything still waiting on its debounce, or submitting loses the
    // last thing you typed.
    Object.entries(timers.current).forEach(([id, t]) => {
      clearTimeout(t)
      void saveAnswer(id, answers[id] ?? '')
    })
    const { error: err } = await supabase
      .from('founders_participants')
      .update({ submitted_at: next ? new Date().toISOString() : null })
      .eq('email', me.email)
    setBusy(false)
    if (err) { setError('Could not update your status. Try again.'); return }
    router.refresh()
  }

  const visible = (id: string, settleFirst?: boolean) => {
    if (filter === 'first') return !!settleFirst
    if (filter === 'todo') return !(answers[id] ?? '').trim()
    return true
  }

  return (
    <div className="flex flex-col gap-6">
      <Roster
        me={me}
        participants={participants}
        revealed={revealed}
        locked={locked}
        busy={busy}
        answered={answeredCount}
        total={questions.length}
        onSubmit={() => setSubmitted(true)}
        onReopen={() => setSubmitted(false)}
      />

      {error && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" /> {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {([
          ['all', `All ${questions.length}`],
          ['first', 'Settle first'],
          ['todo', `Unanswered ${questions.length - answeredCount}`],
        ] as [Filter, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
              filter === key
                ? 'border-accent bg-accent text-accent-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {groups.map((group) => {
        const shown = group.questions.filter((q) => visible(q.id, q.settleFirst))
        if (shown.length === 0) return null
        return (
          <section key={group.letter} className="flex flex-col gap-3">
            <div className="border-b border-border pb-2">
              <h2 className="flex items-baseline gap-3 text-sm font-bold uppercase tracking-[0.1em] text-foreground">
                <span className="font-mono text-accent">{group.letter}</span>
                {group.title}
              </h2>
              {group.note && (
                <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">{group.note}</p>
              )}
            </div>

            {shown.map((q) => (
              <Card key={q.id}>
                <CardContent className="flex flex-col gap-3 py-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                      {String(q.n).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-relaxed text-foreground">
                        {q.text}
                        {q.settleFirst && (
                          <Badge variant="destructive" className="ml-2 align-middle">
                            Settle first
                          </Badge>
                        )}
                      </p>
                      {q.note && (
                        <p className="mt-1 text-xs italic text-muted-foreground">{q.note}</p>
                      )}
                    </div>
                    <SaveState state={saving[q.id]} />
                  </div>

                  <Textarea
                    value={answers[q.id] ?? ''}
                    onChange={(e) => onAnswerChange(q.id, e.target.value)}
                    onBlur={() => {
                      clearTimeout(timers.current[q.id])
                      void saveAnswer(q.id, answers[q.id] ?? '')
                    }}
                    disabled={locked}
                    placeholder={locked ? 'Submitted — reopen to edit' : 'Your answer…'}
                    className="min-h-[72px]"
                  />

                  {revealed && (
                    <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-3">
                      {others.map((p) => (
                        <div key={p.email}>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {p.display_name || p.email}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                            {answersByPerson[p.email]?.[q.id]?.trim() || '— left blank —'}
                          </p>
                        </div>
                      ))}
                      <div className="border-t border-border pt-3">
                        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={agreed[q.id]?.decided ?? false}
                            onChange={(e) =>
                              saveConsensus(q.id, agreed[q.id]?.note ?? '', e.target.checked)
                            }
                            className="h-4 w-4 accent-[var(--color-accent)]"
                          />
                          Agreed position
                        </label>
                        <Textarea
                          value={agreed[q.id]?.note ?? ''}
                          onChange={(e) =>
                            setAgreed((c) => ({
                              ...c,
                              [q.id]: { note: e.target.value, decided: c[q.id]?.decided ?? false },
                            }))
                          }
                          onBlur={(e) =>
                            saveConsensus(q.id, e.target.value, agreed[q.id]?.decided ?? false)
                          }
                          placeholder="What the two of you settled on — this is what goes to the attorney."
                          className="mt-2 min-h-[60px] bg-background"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </section>
        )
      })}
    </div>
  )
}

function SaveState({ state }: { state?: 'saving' | 'saved' | 'error' }) {
  if (!state) return null
  if (state === 'saving') return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
  if (state === 'error') return <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
  return <Check className="h-4 w-4 shrink-0 text-success" />
}

/**
 * Who is in the workbook, where each of them is up to, and the submit control.
 * Nobody's answers are visible until every row here says Submitted — that rule
 * lives in RLS, this card only explains it.
 */
function Roster({
  me, participants, revealed, locked, busy, answered, total, onSubmit, onReopen,
}: {
  me: FounderParticipant
  participants: FounderParticipant[]
  revealed: boolean
  locked: boolean
  busy: boolean
  answered: number
  total: number
  onSubmit: () => void
  onReopen: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  async function addParticipant() {
    setAddError(null)
    const clean = email.trim().toLowerCase()
    if (!clean.includes('@')) { setAddError('That does not look like an email address.'); return }
    const { error } = await supabase
      .from('founders_participants')
      .insert({ email: clean, display_name: name.trim() })
    if (error) {
      setAddError(
        error.code === '23505'
          ? 'That person is already in the workbook.'
          : 'Could not add them. Check the address and try again.',
      )
      return
    }
    setName(''); setEmail(''); setAdding(false)
    router.refresh()
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              In the room
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {participants.map((p) => (
                <li key={p.email} className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-foreground">
                    {p.display_name || p.email}
                  </span>
                  <span className="text-xs text-muted-foreground">{p.email}</span>
                  {p.submitted_at
                    ? <Badge variant="success">Submitted</Badge>
                    : <Badge variant="outline">Still answering</Badge>}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col items-end gap-2">
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {answered} / {total} answered
            </p>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${total ? (answered / total) * 100 : 0}%` }}
              />
            </div>
            {locked ? (
              <Button variant="outline" size="sm" onClick={onReopen} disabled={busy}>
                <LockOpen className="h-4 w-4" /> Reopen my answers
              </Button>
            ) : (
              <Button variant="accent" size="sm" onClick={onSubmit} disabled={busy}>
                <Lock className="h-4 w-4" /> Submit my answers
              </Button>
            )}
          </div>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {revealed
            ? 'Everyone has submitted, so all answers are now visible. Work through the differences and write the agreed position under each question — that is what goes to the attorney.'
            : 'Answer on your own. Nobody sees anybody else’s answers until every person listed above has submitted — the whole point is to find the questions you answer differently.'}
        </p>

        {me.is_owner && (
          adding ? (
            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <div className="min-w-[160px] flex-1">
                <label className="text-xs text-muted-foreground" htmlFor="founder-name">Name</label>
                <Input id="founder-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Zacques Botha" />
              </div>
              <div className="min-w-[200px] flex-1">
                <label className="text-xs text-muted-foreground" htmlFor="founder-email">Portal email address</label>
                <Input id="founder-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.co.za" />
              </div>
              <Button size="sm" onClick={addParticipant}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setAddError(null) }}>Cancel</Button>
              {addError && <p className="w-full text-xs text-destructive">{addError}</p>}
            </div>
          ) : (
            <div className="border-t border-border pt-3">
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                <UserPlus className="h-4 w-4" /> Add a participant
              </Button>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Use the email address they sign in to the portal with — they get access the moment
                they have an account on that address.
              </p>
            </div>
          )
        )}
      </CardContent>
    </Card>
  )
}
