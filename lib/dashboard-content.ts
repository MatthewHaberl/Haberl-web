export type DashboardBadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'destructive' | 'outline'

export interface DashboardGoal {
  title: string
  body: string
  badge: string
  variant: DashboardBadgeVariant
}

export interface DashboardOwnerFocus {
  owner: string
  role: string
  items: string[]
}

export interface DashboardMilestone {
  title: string
  status: string
  target: string
  detail: string
  variant: DashboardBadgeVariant
}

export interface DashboardContent {
  lastUpdated: string
  companyGoals: DashboardGoal[]
  leadershipFocus: DashboardOwnerFocus[]
  milestones: DashboardMilestone[]
}

export const dashboardContent: DashboardContent = {
  lastUpdated: '2026-06-03',
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
  leadershipFocus: [
    {
      owner: 'Matthew',
      role: 'Operator',
      items: [
        'Set the Anthropic API key for one-click quote generation inside the portal.',
        'Finish the shop product list so the store can move from scaffolding to live catalogue data.',
        'Pick one lead-generation channel and run it consistently.',
      ],
    },
    {
      owner: 'Byron',
      role: 'Growth + BMG',
      items: [
        'Complete onboarding into the shared vault and operating workflow.',
        'Keep investor conversations warm while Track 1 execution finishes.',
        'Prepare the legal route and verified 3-year financial evidence required before any acquisition offer.',
      ],
    },
  ],
  milestones: [
    {
      title: 'Quote workflow live',
      status: 'Completed',
      target: 'Done',
      detail: 'Survey intake, generated quotes, and portal visibility are already live.',
      variant: 'success',
    },
    {
      title: 'One-click quote generation',
      status: 'Blocked on API key',
      target: 'Next',
      detail: 'Enable the Anthropic key in the environment so the admin flow becomes fully automated.',
      variant: 'warning',
    },
    {
      title: 'Shop catalogue launch',
      status: 'Awaiting product list',
      target: 'Phase 2',
      detail: 'The store structure is in place, but the catalogue still needs real Haberl products.',
      variant: 'accent',
    },
    {
      title: 'BMG offer readiness',
      status: 'Do not advance early',
      target: 'After Track 1',
      detail: 'No acquisition offer without the legal route and verified 3-year financials.',
      variant: 'destructive',
    },
  ],
}
