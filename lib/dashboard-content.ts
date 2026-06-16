export type DashboardBadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'destructive' | 'outline'

export interface DashboardGoal {
  title: string
  body: string
  badge: string
  variant: DashboardBadgeVariant
}

export interface DashboardContent {
  companyGoals: DashboardGoal[]
}

// Company goals are stable and rarely change, so they stay here as static content.
// The live "What's next" list (priorities, owners, milestones) now comes from the
// second brain via the plan_items table — see scripts/sync-plan.mjs.
export const dashboardContent: DashboardContent = {
  companyGoals: [
    {
      title: 'Track 1: Haberl solar automation',
      body: 'Tighten quoting, job flow, and operational admin so the active business runs cleanly and faster.',
      badge: 'Highest priority',
      variant: 'warning',
    },
    {
      title: 'Track 3: Haberl website + portal',
      body: 'Turn the portal into a useful operating console with live sales, quote, customer, and site visibility.',
      badge: 'In progress',
      variant: 'accent',
    },
    {
      title: 'Track 2: BMG investor readiness',
      body: 'Keep the acquisition path warm, but only move once Haberl is stable and diligence requirements are in hand.',
      badge: 'After Track 1',
      variant: 'default',
    },
  ],
}
