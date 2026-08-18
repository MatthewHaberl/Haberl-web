'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  formatCents, type PublicPackageChoice, type PublicTierOption,
} from '@/lib/quotes/public'
import { Check, CloudUpload, Landmark, Loader2 } from 'lucide-react'

interface BankingDetails {
  bank?: string
  account_name?: string
  account_number?: string
  branch_code?: string
  account_type?: string
}

interface Props {
  token: string
  state: 'open' | 'accepted'
  quoteNumber: string | null
  depositCents: number | null
  tierOptions: PublicTierOption[] | null
  /**
   * Combined quote: the individual work packages, plus the bundled figures.
   * Null on an ordinary quote, where there is nothing to choose between.
   */
  packageChoice: PublicPackageChoice | null
  banking: BankingDetails | null
  proof: { uploaded: boolean; confirmed: boolean; rejected: boolean; rejectedReason: string | null } | null
  contactPhone: string | null
  /** Solar-engine quote — drives installation-flavoured copy (W97). */
  isSolar?: boolean
}

export function PublicQuoteActions({
  token, state, quoteNumber, depositCents, tierOptions, packageChoice, banking, proof, contactPhone,
  isSolar = true,
}: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Accept form
  const [name, setName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [tier, setTier] = useState(
    tierOptions?.find((o) => o.tier === 'recommended')?.tier ?? tierOptions?.[0]?.tier ?? '',
  )

  // '' = everything (the combined price, and the default). Otherwise the id of
  // the single package being taken at its standalone price.
  const [packageId, setPackageId] = useState('')
  const [surchargeOk, setSurchargeOk] = useState(false)
  const chosenPackage = packageChoice?.packages.find((p) => p.id === packageId) ?? null

  // Picking a different option re-asks the question — an acknowledgement given
  // for one package must never carry over to another, or to "everything".
  function choosePackage(id: string) {
    setPackageId(id)
    setSurchargeOk(false)
  }

  // Decline form
  const [showDecline, setShowDecline] = useState(false)
  const [declineReason, setDeclineReason] = useState('')

  // Proof upload
  const [uploading, setUploading] = useState(false)

  async function post(path: string, body: Record<string, unknown>) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/public/quote/${token}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        setError(await res.text() || 'Something went wrong — please try again.')
        return
      }
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function uploadProof(file: File) {
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/public/quote/${token}/proof`, { method: 'POST', body: form })
      if (!res.ok) {
        setError(await res.text() || 'Upload failed — please try again.')
        return
      }
      router.refresh()
    } finally {
      setUploading(false)
    }
  }

  // ── Accepted: EFT instructions + proof of payment ──────────────────────────
  if (state === 'accepted') {
    const hasBanking = banking && (banking.account_number || banking.bank)
    const bankRow = (label: string, value?: string) =>
      value ? (
        <div className="flex justify-between gap-4 py-1.5 border-b border-border last:border-0 text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-semibold text-right">{value}</span>
        </div>
      ) : null

    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-primary mb-3">
            <Landmark className="h-4 w-4 text-accent" /> Pay your deposit by EFT
          </h2>
          {hasBanking ? (
            <>
              {bankRow('Bank', banking?.bank)}
              {bankRow('Account name', banking?.account_name)}
              {bankRow('Account number', banking?.account_number)}
              {bankRow('Branch code', banking?.branch_code)}
              {bankRow('Account type', banking?.account_type)}
              {bankRow('Amount', formatCents(depositCents))}
              {bankRow('Reference', quoteNumber ?? undefined)}
              <p className="mt-3 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                Please use <strong>{quoteNumber}</strong> as your payment reference so we can match
                your deposit immediately.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Our team will send you the banking details for your deposit of{' '}
              <strong className="text-foreground">{formatCents(depositCents)}</strong> shortly
              {contactPhone ? <> — or call us on <strong className="text-foreground">{contactPhone}</strong></> : null}.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-primary mb-2">
            <CloudUpload className="h-4 w-4 text-accent" /> Proof of payment
          </h2>
          {proof?.confirmed ? (
            <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
              <Check className="h-4 w-4" />{' '}
              {isSolar
                ? <>Deposit confirmed — your installation is moving into procurement. We&apos;ll contact you to book the installation date.</>
                : <>Deposit confirmed — we&apos;ll contact you to book a date for the work.</>}
            </p>
          ) : (
            <>
              {!proof?.uploaded && proof?.rejected && (
                <div className="mb-3 rounded-md border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                  We couldn&apos;t confirm your last payment
                  {proof.rejectedReason ? <>: <strong>{proof.rejectedReason}</strong></> : null}. Please
                  double-check the details and upload your proof of payment again below.
                </div>
              )}
              {proof?.uploaded && (
                <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300 mb-2">
                  <Check className="h-4 w-4" /> Proof received — we&apos;ll confirm your deposit shortly.
                </p>
              )}
              <p className="text-sm text-muted-foreground mb-3">
                {proof?.uploaded
                  ? 'Need to replace it? Upload a new file below.'
                  : 'Once paid, upload your proof of payment here (PDF or photo) and we’ll get moving.'}
              </p>
              <label className="inline-flex">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void uploadProof(file)
                    e.target.value = ''
                  }}
                />
                <span className="inline-flex items-center gap-2 cursor-pointer rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:opacity-90">
                  {uploading
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                    : <><CloudUpload className="h-4 w-4" /> {proof?.uploaded ? 'Upload new file' : 'Upload proof of payment'}</>}
                </span>
              </label>
            </>
          )}
          {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
      </div>
    )
  }

  // ── Open: accept or decline ─────────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-border bg-card p-5 flex flex-col gap-4">
      <h2 className="font-semibold text-primary">Ready to go ahead?</h2>

      {tierOptions && tierOptions.length > 1 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Choose your option:</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {tierOptions.map((option) => (
              <button
                key={option.tier}
                type="button"
                onClick={() => setTier(option.tier)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  tier === option.tier
                    ? 'border-accent bg-accent/5 ring-1 ring-accent'
                    : 'border-border hover:border-accent/50'
                }`}
              >
                <p className="text-sm font-semibold">{option.label}</p>
                <p className="text-base font-bold text-primary mt-1">{formatCents(option.totalCents)}</p>
                {option.depositCents != null && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Deposit {formatCents(option.depositCents)}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {packageChoice && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            You can go ahead with everything, or with just one part of it:
          </p>

          <button
            type="button"
            onClick={() => choosePackage('')}
            className={`rounded-lg border p-3 text-left transition-colors ${
              packageId === ''
                ? 'border-accent bg-accent/5 ring-1 ring-accent'
                : 'border-border hover:border-accent/50'
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold">Everything on this quote</span>
              <span className="text-base font-bold text-primary">
                {formatCents(packageChoice.bundleTotalCents)}
              </span>
            </div>
            {packageChoice.bundleSavingCents > 0 && (
              <p className="mt-0.5 text-xs font-medium text-green-700 dark:text-green-300">
                Best value — saves {formatCents(packageChoice.bundleSavingCents)} against taking each
                part on its own
              </p>
            )}
            {packageChoice.bundleDepositCents != null && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Deposit {formatCents(packageChoice.bundleDepositCents)}
              </p>
            )}
          </button>

          {packageChoice.packages.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => choosePackage(option.id)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                packageId === option.id
                  ? 'border-accent bg-accent/5 ring-1 ring-accent'
                  : 'border-border hover:border-accent/50'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold">{option.label} only</span>
                <span className="text-base font-bold text-primary">
                  {formatCents(option.totalCents)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                On its own — carries its own site visit and certificate
                {option.depositCents != null && <> · deposit {formatCents(option.depositCents)}</>}
              </p>
            </button>
          ))}

          {/* The disclaimer. Shown only when a single package is actually
              selected, and it has to be ticked before Accept will submit —
              the same condition the API enforces, so it cannot be skipped by
              driving the endpoint directly. */}
          {chosenPackage && (
            <div className="rounded-md border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 p-3">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Taking only this part costs more
              </p>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                <strong>{chosenPackage.label}</strong> on its own is{' '}
                <strong>{formatCents(chosenPackage.totalCents)}</strong>, because it carries its own
                call-out, its own day on site and its own Certificate of Compliance instead of
                sharing them with the rest of the work.
                {packageChoice.bundleSavingCents > 0 && (
                  <> Everything together is {formatCents(packageChoice.bundleTotalCents)} &mdash;{' '}
                    {formatCents(packageChoice.bundleSavingCents)} less than buying each part
                    separately.</>
                )}{' '}
                The rest of this quote is not booked, and its price may change if you come back to it
                later.
              </p>
              <label className="mt-2.5 flex items-start gap-2.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={surchargeOk}
                  onChange={(e) => setSurchargeOk(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                />
                <span className="font-medium text-amber-900 dark:text-amber-200">
                  I understand I am taking {chosenPackage.label} on its own at{' '}
                  {formatCents(chosenPackage.totalCents)}, which is more than it would cost as part
                  of the full job.
                </span>
              </label>
            </div>
          )}
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">Your full name (acts as your signature)</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Jane Smith"
          autoComplete="name"
        />
      </label>

      <label className="flex items-start gap-2.5 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
        />
        <span className="text-muted-foreground">
          {chosenPackage
            ? <>I accept the <strong>{chosenPackage.label}</strong> part of this quote and authorise
              Haberl Electrical &amp; Solar to proceed with that work. The deposit secures its
              materials and the booking.</>
            : isSolar
              ? <>I accept this quote and authorise Haberl Electrical &amp; Solar to proceed with the
                installation as quoted. The deposit secures equipment and the installation date.</>
              : <>I accept this quote and authorise Haberl Electrical &amp; Solar to proceed with the
                work as quoted. The deposit secures materials and the booking.</>}
        </span>
      </label>

      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="accent"
          disabled={busy || !agreed || name.trim().length < 2 || (chosenPackage !== null && !surchargeOk)}
          onClick={() => post('accept', {
            name: name.trim(),
            tier: tier || undefined,
            packageId: packageId || undefined,
            acknowledgedSurcharge: chosenPackage ? surchargeOk : undefined,
          })}
        >
          {busy
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
            : <><Check className="h-4 w-4" /> {chosenPackage ? `Accept ${chosenPackage.label} only` : 'Accept quote'}</>}
        </Button>
        {!showDecline && (
          <button
            type="button"
            onClick={() => setShowDecline(true)}
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Not going ahead? Let us know
          </button>
        )}
      </div>

      {showDecline && (
        <div className="rounded-md border border-border bg-muted/40 p-3 flex flex-col gap-2">
          <textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            placeholder="Optional — tell us why, or what would change your mind"
            rows={2}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none"
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => post('decline', { reason: declineReason.trim() || undefined })}
            >
              Decline quote
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowDecline(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
