import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight, Lightbulb, ShieldCheck, GitCompareArrows, Lock, Columns2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { inForceDocId } from '@/lib/sans/documents'
import { ancestorsOf, FRONT_MATTER_TITLES, TAG_LABELS } from '@/lib/sans/refs'
import { amdt3ChangesFor } from '@/lib/sans/amdt3-changes'
import { BookPanel } from '@/components/sans/BookPanel'
import { ClauseSplit } from '@/components/sans/ClauseSplit'
import type { SansClause, SansRule } from '@/types/database'

interface ClauseWithDoc extends SansClause {
  doc_page: number | null
  doc_y0: number | null
  doc_y1: number | null
}

/** One clause: breadcrumb, verbatim text (admin), plain language, children, rules, Amdt 3 flags. */
export default async function SansClausePage({
  params,
}: {
  params: Promise<{ ref: string }>
}) {
  const { ref: rawRef } = await params
  const ref = decodeURIComponent(rawRef)
  const { role } = await requireSection('sans')
  const supabase = await createClient()
  const docId = await inForceDocId(supabase)
  if (!docId) notFound()

  const { data: clauseRow } = await supabase
    .from('sans_clauses')
    .select('*')
    .eq('document_id', docId)
    .eq('clause_ref', ref)
    .maybeSingle()
  if (!clauseRow) notFound()
  const clause = clauseRow as ClauseWithDoc

  const ancestors = ancestorsOf(ref)
  const [{ data: bodyRow }, { data: childRows }, { data: ancestorRows }, { data: ruleRows }] =
    await Promise.all([
      supabase.from('sans_clause_bodies').select('body').eq('clause_id', clause.id).maybeSingle(),
      supabase
        .from('sans_clauses')
        .select('id, clause_ref, title, kind, plain_summary, sort_key, page_number')
        .eq('document_id', docId)
        .eq('parent_ref', ref)
        .order('sort_key'),
      ancestors.length
        ? supabase.from('sans_clauses').select('clause_ref, title').eq('document_id', docId).in('clause_ref', ancestors)
        : Promise.resolve({ data: [] }),
      supabase.from('sans_rules').select('*').overlaps('clause_refs', [ref, ...ancestors]),
    ])

  const body = (bodyRow as { body: string } | null)?.body ?? null
  const children = (childRows as SansClause[] | null) ?? []
  const crumbTitles = new Map(
    ((ancestorRows as { clause_ref: string; title: string | null }[] | null) ?? []).map((a) => [a.clause_ref, a.title]),
  )
  const rules = ((ruleRows as SansRule[] | null) ?? []).filter(
    (r) => r.clause_refs.includes(ref) || r.clause_refs.some((cr) => cr.startsWith(ref + '.')),
  )
  const amdtChanges = amdt3ChangesFor(ref)
  const displayTitle = clause.title ?? FRONT_MATTER_TITLES[ref.toLowerCase()] ?? ref
  const showBook = role === 'admin' && clause.doc_page != null

  return (
    <div className="flex flex-col gap-5">
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link href="/portal/employee/sans/browse" className="hover:text-foreground">Standard</Link>
        {ancestors.map((a) => (
          <span key={a} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href={`/portal/employee/sans/clause/${encodeURIComponent(a)}`} className="hover:text-foreground">
              <span className="font-mono">{a}</span>
              {crumbTitles.get(a) ? ` ${crumbTitles.get(a)}` : ''}
            </Link>
          </span>
        ))}
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-mono font-semibold text-foreground">{ref}</span>
      </nav>

      {/* Header */}
      <div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-2xl font-bold text-primary">
            {clause.title ? (
              <>
                <span className="mr-2 font-mono text-accent">{ref}</span>
                {clause.title}
              </>
            ) : (
              <span className="font-mono">{displayTitle}</span>
            )}
          </h1>
          <Link
            href={`/portal/employee/sans/read/${encodeURIComponent(ref)}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent"
          >
            <Columns2 className="h-4 w-4" /> Read side-by-side
          </Link>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {clause.page_number && (
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
              Ed 3.2 · p. {clause.page_number}
            </span>
          )}
          {clause.tags.map((t) => (
            <span key={t} className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
              {TAG_LABELS[t] ?? t}
            </span>
          ))}
        </div>
      </div>

      <ClauseSplit
        left={
      <div className="flex min-w-0 flex-col gap-5">
      {/* Amdt 3 heads-up */}
      {amdtChanges.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-700">
            <GitCompareArrows className="h-4 w-4" /> Changing in Amendment 3 (Ed 3.03)
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {amdtChanges.map((c, i) => (
              <li key={i} className="text-sm text-muted-foreground">
                <span className="font-mono text-xs font-semibold text-amber-700">{c.ref}</span> — {c.change}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Plain language */}
      {clause.plain_summary && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-accent">
            <Lightbulb className="h-4 w-4" /> In plain language
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-foreground">{clause.plain_summary}</p>
        </div>
      )}

      {/* Verbatim text — admin only (RLS simply returns nothing for other roles) */}
      {body ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Verbatim — SANS 10142-1:2024 Ed 3.2 © SABS
          </p>
          <div className="whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-foreground">{body}</div>
        </div>
      ) : (
        clause.kind !== 'section' && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Verbatim standard text is admin-only (SABS copyright).
          </p>
        )
      )}

      {/* Children */}
      {children.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">In this {clause.kind === 'section' ? 'chapter' : 'clause'}</h2>
          <div className="flex flex-col gap-1.5">
            {children.map((c) => (
              <Link
                key={c.id}
                href={`/portal/employee/sans/clause/${encodeURIComponent(c.clause_ref)}`}
                className="group rounded-lg border border-border bg-card px-4 py-2.5 transition-colors hover:border-accent"
              >
                <p className="text-sm">
                  <span className="font-mono font-semibold text-accent">{c.clause_ref}</span>{' '}
                  <span className="font-medium text-foreground group-hover:text-primary">{c.title}</span>
                </p>
                {c.plain_summary && !c.title && (
                  <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{c.plain_summary}</p>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Linked design rules */}
      {rules.length > 0 && (
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-accent" /> Design rules enforcing this clause
          </h2>
          <div className="flex flex-col gap-1.5">
            {rules.map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-card px-4 py-2.5">
                <p className="text-sm">
                  <span className="font-mono text-xs font-semibold text-accent">{r.rule_key}</span>{' '}
                  <span className="font-medium text-foreground">{r.title}</span>
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      r.severity === 'blocker'
                        ? 'bg-destructive/10 text-destructive'
                        : r.severity === 'warning'
                          ? 'bg-amber-500/10 text-amber-600'
                          : 'bg-sky-500/10 text-sky-600'
                    }`}
                  >
                    {r.severity}
                  </span>
                  {r.machine_checkable && (
                    <span className="ml-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                      auto-checked
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{r.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
        }
        right={
          showBook ? (
            <BookPanel
              docPage={clause.doc_page as number}
              y0={clause.doc_y0}
              y1={clause.doc_y1}
              printedPage={clause.page_number}
              clauseRef={ref}
            />
          ) : null
        }
      />
    </div>
  )
}
