'use client'

// Print, mark paid, and reverse. The printable HTML is rendered on the server
// and handed over as a string, so the popup shows exactly the document the
// preview shows — one renderer, no second implementation to drift.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { BanknoteArrowUp, Printer, Undo2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'

export function PayslipActions({
  payslipId,
  status,
  printHtml,
}: {
  payslipId: string
  status: string
  printHtml: string
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function print() {
    const win = window.open('', '_blank', 'width=900,height=1000')
    if (!win) return
    win.document.write(printHtml)
    win.document.close()
  }

  async function togglePaid() {
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const paid = status === 'paid'
    const { error: dbError } = await supabase
      .from('payslips')
      .update({
        status: paid ? 'finalised' : 'paid',
        paid_at: paid ? null : new Date().toISOString(),
      })
      .eq('id', payslipId)
    setBusy(false)
    if (dbError) {
      setError(dbError.message)
      return
    }
    router.refresh()
  }

  async function reverse() {
    const ok = await confirm({
      title: 'Reverse this payslip?',
      body:
        'The slip is deleted and its hours and payments go back to unpaid, ready for a corrected run. ' +
        'Anything already handed to the employee will no longer match your records.',
      confirmText: 'Reverse payslip',
      destructive: true,
    })
    if (!ok) return

    setBusy(true)
    setError(null)
    const supabase = createClient()
    // RPC, not a delete: the hours and payments on this slip have to be
    // released back to unpaid in the same transaction (migration 113).
    const { error: rpcError } = await supabase.rpc('delete_payslip', { p_payslip_id: payslipId })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    router.push('/portal/employee/staff/payroll')
  }

  return (
    <>
      {error && <span className="text-xs text-destructive">{error}</span>}
      {status !== 'paid' && (
        <Button type="button" variant="ghost" onClick={reverse} disabled={busy}>
          <Undo2 className="mr-2 h-4 w-4" />
          Reverse
        </Button>
      )}
      <Button type="button" variant="outline" onClick={togglePaid} disabled={busy}>
        <BanknoteArrowUp className="mr-2 h-4 w-4" />
        {status === 'paid' ? 'Mark unpaid' : 'Mark paid'}
      </Button>
      <Button type="button" onClick={print}>
        <Printer className="mr-2 h-4 w-4" />
        Print / save PDF
      </Button>
    </>
  )
}
