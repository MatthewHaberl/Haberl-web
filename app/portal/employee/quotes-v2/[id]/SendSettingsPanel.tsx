'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Sending & document settings — how this quote reads, how long it stands, and
// how it actually went out.
//
// These switches used to live in the status bar and vanish the moment a quote
// was sent, which is the one time you most want to see them: "did I send them
// the itemised version?" had no answer once it was gone. They live here now,
// visible at every status, with the send record beside them.
//
// The two halves behave differently on a quote already sent, and the panel says
// which is which rather than leaving it to be discovered:
//   - the DOCUMENT options only reach the customer on the next reissue, because
//     they change the HTML their link serves;
//   - the VALIDITY date takes effect immediately, because the accept page reads
//     the column, not the document.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Eye, Mail, MessageCircle, Send, Settings2, TriangleAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { CollapsibleSection } from '@/components/ui/collapsible-section'
import type { QuoteRequestStatus } from '@/types/database'

type SentMethod = 'email' | 'whatsapp' | 'manual' | null

interface Props {
  requestId: string
  status: QuoteRequestStatus
  /** Scope engine only — a solar design has no work packages to take apart. */
  isSolar: boolean
  showPhotos: boolean
  detailed: boolean
  allowPartial: boolean
  expiryDate: string | null
  sentAt: string | null
  sentMethod: SentMethod
  /** Resolved name for quote_requests.sent_by — '' when nobody is recorded. */
  sentByName: string
  viewedAt: string | null
  reminderCount: number
  customerEmail: string | null
  customerPhone: string | null
  /** quote_versions pointer — how many times this document has gone out. */
  currentVersion: number | null
}

const METHOD_LABEL: Record<'email' | 'whatsapp' | 'manual', string> = {
  email: 'Emailed',
  whatsapp: 'Shared on WhatsApp',
  manual: 'Link shared by hand',
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function SendSettingsPanel(props: Props) {
  const {
    requestId, status, isSolar, expiryDate, sentAt, sentMethod, sentByName,
    viewedAt, reminderCount, customerEmail, customerPhone, currentVersion,
  } = props
  const router = useRouter()
  const [showPhotos, setShowPhotos] = useState(props.showPhotos)
  const [detailed, setDetailed] = useState(props.detailed)
  const [allowPartial, setAllowPartial] = useState(props.allowPartial)
  const [expiry, setExpiry] = useState(expiryDate ?? '')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  // A sent quote's document is frozen until it is reissued. Anything changed
  // here after that point is a change the CUSTOMER cannot see yet, so say so
  // once the operator has actually touched something.
  const [documentDirty, setDocumentDirty] = useState(false)
  const issued = status === 'sent' || status === 'accepted' || status === 'declined'

  /**
   * `revert` puts the control back when the write failed: a checkbox that stays
   * ticked after a failed save is a lie about what will be sent.
   */
  async function save(patch: Record<string, unknown>, revert: () => void, note: string) {
    setError('')
    setSaved('')
    const { error: dbError } = await createClient()
      .from('quote_requests').update(patch).eq('id', requestId)
    if (dbError) {
      revert()
      setError(dbError.message)
      return
    }
    setSaved(note)
    router.refresh()
  }

  function toggle(
    key: 'photos' | 'detailed' | 'allOrNothing',
    next: boolean,
  ) {
    setDocumentDirty(true)
    if (key === 'photos') {
      setShowPhotos(next)
      void save({ show_equipment_photos: next }, () => setShowPhotos(!next), 'Product photos saved')
      return
    }
    if (key === 'detailed') {
      setDetailed(next)
      void save(
        { quote_version: next ? 'detailed' : 'simplified' },
        () => setDetailed(!next),
        next ? 'Line-by-line pricing on' : 'Simplified pricing on',
      )
      return
    }
    // Ticked = all-or-nothing, so the box reads as the restriction being
    // applied. The column stores the PERMISSION, hence the inversion.
    setAllowPartial(!next)
    void save(
      { allow_partial_acceptance: !next },
      () => setAllowPartial(next),
      next ? 'Quote is now all-or-nothing' : 'Customer may take one package',
    )
  }

  function saveExpiry(value: string) {
    setExpiry(value)
    void save(
      { expiry_date: value || null },
      () => setExpiry(expiryDate ?? ''),
      value ? `Valid until ${value}` : 'Expiry cleared — the quote no longer lapses',
    )
  }

  const option = (
    checked: boolean,
    onChange: (next: boolean) => void,
    label: string,
    hint: string,
  ) => (
    <label className="flex items-start gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border accent-primary shrink-0"
      />
      <span>
        <span className="text-sm text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  )

  return (
    <Card>
      <CardContent className="p-4">
        <CollapsibleSection
          storageKey={`quote-send-settings:${requestId}`}
          title="Sending & document settings"
          icon={<Settings2 />}
          defaultOpen={false}
        >
          <div className="grid gap-6 md:grid-cols-2">
            {/* ── What the document says ─────────────────────────────────── */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                What the customer&rsquo;s document shows
              </h3>
              {option(
                showPhotos, (n) => toggle('photos', n),
                'Product photos',
                'The kit being supplied, pictured. Sells a solar system; says little on a board swap.',
              )}
              {option(
                detailed, (n) => toggle('detailed', n),
                'Line-by-line pricing',
                'Every part and task with its quantity and price. Off is section subtotals only — turn it on when they are comparing quotes.',
              )}
              {!isSolar && option(
                !allowPartial, (n) => toggle('allOrNothing', n),
                'All or nothing',
                'The customer can only accept the whole quote. Standalone prices and the options table come off, and the accept page refuses a single package.',
              )}

              {issued && (
                <p className={`text-xs flex items-start gap-1.5 ${documentDirty ? 'text-warning' : 'text-muted-foreground'}`}>
                  {documentDirty && <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                  {documentDirty
                    ? 'Changed — the customer still has the old document. Use Reissue above, then send it again.'
                    : 'This quote has been sent. Changing any of these needs a reissue before the customer sees it.'}
                </p>
              )}
            </div>

            {/* ── How it went out ────────────────────────────────────────── */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                How it went out
              </h3>

              {sentAt ? (
                <dl className="space-y-1.5 text-sm">
                  <div className="flex items-start gap-2">
                    {sentMethod === 'whatsapp'
                      ? <MessageCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      : <Send className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />}
                    <span>
                      {sentMethod ? METHOD_LABEL[sentMethod] : 'Sent'} {dateTime(sentAt)}
                      {sentByName && <span className="text-muted-foreground"> by {sentByName}</span>}
                      {!sentMethod && (
                        <span className="block text-xs text-muted-foreground">
                          Sent before we started recording how — the date is all we have.
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Mail className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <span className="break-all">
                      {customerEmail || <span className="text-warning">No email on this quote</span>}
                      {customerPhone && <span className="text-muted-foreground"> · {customerPhone}</span>}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Eye className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <span>
                      {viewedAt
                        ? `Opened by the customer ${dateTime(viewedAt)}`
                        : 'Not opened yet'}
                      {reminderCount > 0 && (
                        <span className="text-muted-foreground">
                          {' '}· {reminderCount} reminder{reminderCount === 1 ? '' : 's'} sent
                        </span>
                      )}
                    </span>
                  </div>
                  {currentVersion != null && currentVersion > 0 && (
                    <div className="text-xs text-muted-foreground pl-6">
                      Version {currentVersion} is the one they hold — see Sent history at the top.
                    </div>
                  )}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Not sent yet. However it goes out — email, WhatsApp or a link you share
                  yourself — it gets recorded here.
                </p>
              )}

              <div className="pt-1">
                <label className="text-sm text-foreground flex items-center gap-1.5">
                  <CalendarClock className="h-4 w-4 text-muted-foreground" /> Valid until
                </label>
                <Input
                  type="date"
                  value={expiry}
                  onChange={(e) => saveExpiry(e.target.value)}
                  className="mt-1 max-w-[12rem]"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Takes effect straight away, on the document they already have &mdash; the accept
                  page reads this date, not the printed page. Extend it rather than reissuing when a
                  customer just needs more time.
                </p>
              </div>
            </div>
          </div>

          {saved && <p className="mt-3 text-xs text-success">{saved} ✓</p>}
          {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        </CollapsibleSection>
      </CardContent>
    </Card>
  )
}
