'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, HelpCircle, Loader2, Lock, LockOpen, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { t, type FounderGroup, type FounderQuestion } from '@/lib/founders/questions'
import { strings, type WorkbookStrings } from '@/lib/founders/i18n'
import type { FounderParticipant } from '@/lib/founders/access'

type Filter = 'all' | 'first' | 'todo'

interface Props {
  groups: FounderGroup[]
  me: FounderParticipant
  participants: FounderParticipant[]
  /** True once everyone has submitted — the point answers become comparable. */
  revealed: boolean
  /** Question answers keyed by participant email. RLS decides what is in here. */
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

  // The EN/AF switch lives in the page header and writes to the participant
  // row, so the language arrives as a prop after its refresh. Client state here
  // survives that refresh — changing language mid-question loses nothing.
  const locale = me.language
  const [answers, setAnswers] = useState<Record<string, string>>(
    () => ({ ...(answersByPerson[me.email] ?? {}) }),
  )
  const [agreed, setAgreed] = useState(consensus)
  const [saving, setSaving] = useState<Record<string, 'saving' | 'saved' | 'error'>>({})
  const [openHelp, setOpenHelp] = useState<Record<string, boolean>>({})
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const s = strings(locale)
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
    setSaving((prev) => ({ ...prev, [questionId]: 'saving' }))
    const { error: err } = await supabase
      .from('founders_answers')
      .upsert(
        { email: me.email, question_id: questionId, answer: value },
        { onConflict: 'email,question_id' },
      )
    setSaving((prev) => ({ ...prev, [questionId]: err ? 'error' : 'saved' }))
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
    Object.entries(timers.current).forEach(([id, timer]) => {
      clearTimeout(timer)
      void saveAnswer(id, answers[id] ?? '')
    })
    const { error: err } = await supabase
      .from('founders_participants')
      .update({ submitted_at: next ? new Date().toISOString() : null })
      .eq('email', me.email)
    setBusy(false)
    if (err) { setError(s.statusFailed); return }
    router.refresh()
  }

  function visible(q: FounderQuestion) {
    if (filter === 'first') return !!q.settleFirst
    if (filter === 'todo') return !(answers[q.id] ?? '').trim()
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
        s={s}
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
          ['all', s.filterAll(questions.length)],
          ['first', s.filterSettleFirst],
          ['todo', s.filterUnanswered(questions.length - answeredCount)],
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
        const shown = group.questions.filter(visible)
        if (shown.length === 0) return null
        return (
          <section key={group.letter} className="flex flex-col gap-3">
            <div className="border-b border-border pb-2">
              <h2 className="flex items-baseline gap-3 text-sm font-bold uppercase tracking-[0.1em] text-foreground">
                <span className="font-mono text-accent">{group.letter}</span>
                {t(group.title, locale)}
              </h2>
              {group.note && (
                <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">
                  {t(group.note, locale)}
                </p>
              )}
            </div>

            {shown.map((q) => {
              const helpOpen = !!openHelp[q.id]
              return (
                <Card key={q.id}>
                  <CardContent className="flex flex-col gap-3 py-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                        {String(q.n).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-relaxed text-foreground">
                          {t(q.text, locale)}
                          {q.settleFirst && (
                            <Badge variant="destructive" className="ml-2 align-middle">
                              {s.settleFirstBadge}
                            </Badge>
                          )}
                        </p>
                        {q.note && (
                          <p className="mt-1 text-xs italic text-muted-foreground">
                            {t(q.note, locale)}
                          </p>
                        )}
                      </div>
                      <SaveState state={saving[q.id]} />
                      <button
                        type="button"
                        onClick={() => setOpenHelp((h) => ({ ...h, [q.id]: !h[q.id] }))}
                        aria-expanded={helpOpen}
                        aria-controls={`help-${q.id}`}
                        aria-label={s.helpLabel}
                        title={s.helpLabel}
                        className={cn(
                          'shrink-0 rounded-full p-1 transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                          helpOpen
                            ? 'bg-accent/10 text-accent'
                            : 'text-muted-foreground hover:bg-muted hover:text-accent',
                        )}
                      >
                        <HelpCircle className="h-4 w-4" />
                      </button>
                    </div>

                    {helpOpen && (
                      <div
                        id={`help-${q.id}`}
                        className="rounded-md border-l-2 border-accent bg-muted/50 px-3 py-2.5"
                      >
                        <p className="text-[11px] font-bold uppercase tracking-wider text-accent">
                          {s.helpHeading}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          {t(q.help, locale)}
                        </p>
                      </div>
                    )}

                    <Textarea
                      value={answers[q.id] ?? ''}
                      onChange={(e) => onAnswerChange(q.id, e.target.value)}
                      onBlur={() => {
                        clearTimeout(timers.current[q.id])
                        void saveAnswer(q.id, answers[q.id] ?? '')
                      }}
                      disabled={locked}
                      placeholder={locked ? s.lockedPlaceholder : s.answerPlaceholder}
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
                              {answersByPerson[p.email]?.[q.id]?.trim() || s.leftBlank}
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
                            {s.agreedPosition}
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
                            placeholder={s.agreedPlaceholder}
                            className="mt-2 min-h-[60px] bg-background"
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
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
 * Who is in the workbook, where each of them is up to, the language switch and
 * the submit control. Nobody's answers are visible until every row here says
 * submitted — that rule lives in RLS, this card only explains it.
 */
function Roster({
  me, participants, revealed, locked, busy, answered, total, s, onSubmit, onReopen,
}: {
  me: FounderParticipant
  participants: FounderParticipant[]
  revealed: boolean
  locked: boolean
  busy: boolean
  answered: number
  total: number
  s: WorkbookStrings
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
    if (!clean.includes('@')) { setAddError(s.badEmail); return }
    const { error } = await supabase
      .from('founders_participants')
      .insert({ email: clean, display_name: name.trim() })
    if (error) {
      setAddError(error.code === '23505' ? s.alreadyIn : s.addFailed)
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
              {s.inTheRoom}
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {participants.map((p) => (
                <li key={p.email} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-foreground">
                    {p.display_name || p.email}
                  </span>
                  <span className="text-xs text-muted-foreground">{p.email}</span>
                  {p.submitted_at
                    ? <Badge variant="success">{s.submitted}</Badge>
                    : <Badge variant="outline">{s.stillAnswering}</Badge>}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col items-end gap-2">
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {s.answeredOf(answered, total)}
            </p>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${total ? (answered / total) * 100 : 0}%` }}
              />
            </div>
            {locked ? (
              <Button variant="outline" size="sm" onClick={onReopen} disabled={busy}>
                <LockOpen className="h-4 w-4" /> {s.reopenMine}
              </Button>
            ) : (
              <Button variant="accent" size="sm" onClick={onSubmit} disabled={busy}>
                <Lock className="h-4 w-4" /> {s.submitMine}
              </Button>
            )}
          </div>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {revealed ? s.afterReveal : s.beforeReveal}
        </p>

        {me.is_owner && (
          adding ? (
            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <div className="min-w-[160px] flex-1">
                <label className="text-xs text-muted-foreground" htmlFor="founder-name">
                  {s.nameLabel}
                </label>
                <Input
                  id="founder-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={s.namePlaceholder}
                />
              </div>
              <div className="min-w-[200px] flex-1">
                <label className="text-xs text-muted-foreground" htmlFor="founder-email">
                  {s.emailLabel}
                </label>
                <Input
                  id="founder-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={s.emailPlaceholder}
                />
              </div>
              <Button size="sm" onClick={addParticipant}>{s.add}</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setAddError(null) }}>
                {s.cancel}
              </Button>
              {addError && <p className="w-full text-xs text-destructive">{addError}</p>}
            </div>
          ) : (
            <div className="border-t border-border pt-3">
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                <UserPlus className="h-4 w-4" /> {s.addParticipant}
              </Button>
              <p className="mt-1.5 text-xs text-muted-foreground">{s.addHint}</p>
            </div>
          )
        )}
      </CardContent>
    </Card>
  )
}
