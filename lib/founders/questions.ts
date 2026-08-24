/**
 * The founders' workbook: the 74 questions two people answer separately before
 * they form a company together, plus the South African compliance reference
 * that sits behind them.
 *
 * This is the single source of truth for both the portal page and the printed
 * document. `id` is stable and is what `founders_answers.question_id` stores —
 * reorder or reword a question freely, but never renumber an id, or the answer
 * already written against it is orphaned.
 */

export interface FounderQuestion {
  /** Stable key, e.g. 'B08'. Group letter + the printed number. */
  id: string
  /** Printed number, 1–74. */
  n: number
  text: string
  /** A clarifying aside shown in lighter type under the question. */
  note?: string
  /** The ones that most often end partnerships — answer these first. */
  settleFirst?: boolean
}

export interface FounderGroup {
  letter: string
  title: string
  /** Why this group exists, shown under its heading. */
  note?: string
  questions: FounderQuestion[]
}

export const FOUNDER_GROUPS: FounderGroup[] = [
  {
    letter: 'A',
    title: 'Why we are doing this at all',
    questions: [
      {
        id: 'A01',
        n: 1,
        text:
          'What does this business need to pay each of us, monthly, for it to have been worth doing? Give a number, not a feeling.',
      },
      {
        id: 'A02',
        n: 2,
        text:
          'In five years, is this a two-van business we both still work in, a twenty-staff contractor we manage, or something we sell?',
        note:
          'If we answer differently, everything downstream — hiring, debt, margins — is in conflict.',
        settleFirst: true,
      },
      {
        id: 'A03',
        n: 3,
        text:
          'Are we building a business, or buying ourselves jobs? Both are legitimate. Pretending it is the first when it is the second is not.',
      },
      {
        id: 'A04',
        n: 4,
        text:
          'How much of our own money is each of us prepared to lose before we stop?',
      },
      {
        id: 'A05',
        n: 5,
        text:
          'What is each of us giving up to do this — a salary, another business, time with family? Does the other person know the real number?',
      },
      {
        id: 'A06',
        n: 6,
        text:
          'Do our households agree? Have both spouses/partners actually seen the numbers and the runway?',
      },
    ],
  },
  {
    letter: 'B',
    title: 'Money in, money out',
    note:
      'Most partnership fights are not about the split. They are about drawings, and about the moment one person needs cash and the other wants to reinvest.',
    questions: [
      {
        id: 'B07',
        n: 7,
        text:
          'How much capital does each of us put in on day one, in cash? Are the amounts equal?',
      },
      {
        id: 'B08',
        n: 8,
        text:
          'Is that money share capital or a shareholder loan account?',
        note:
          'A loan can be repaid ahead of profits and changes what happens on exit — this must be decided, not defaulted.',
        settleFirst: true,
      },
      {
        id: 'B09',
        n: 9,
        text:
          'Do tools, vehicles, ladders, test instruments and the existing software count as capital contribution? At whose valuation?',
      },
      {
        id: 'B10',
        n: 10,
        text:
          'What does each of us draw monthly, from month one? Is it a salary through PAYE, or drawings against profit?',
      },
      {
        id: 'B11',
        n: 11,
        text:
          'If the company can only pay one of us this month, who gets paid?',
      },
      {
        id: 'B12',
        n: 12,
        text:
          'Are our two salaries equal even though our roles are different? If not, who decided the difference and how does it get reviewed?',
      },
      {
        id: 'B13',
        n: 13,
        text:
          'What percentage of profit gets left in the business every year before anything is distributed? Write the number into the agreement.',
      },
      {
        id: 'B14',
        n: 14,
        text:
          'If we need more capital in month eight and one of us cannot put it in — does the other lend it, or take more equity? At what valuation?',
        settleFirst: true,
      },
      {
        id: 'B15',
        n: 15,
        text:
          'Will we sign personal sureties? For the bank, the landlord, and every supplier account?',
        note:
          'A surety makes limited liability meaningless. Know exactly what each of you has signed.',
        settleFirst: true,
      },
      {
        id: 'B16',
        n: 16,
        text:
          'What is the maximum either of us can spend without the other\'s sign-off? One number, in rands, in writing.',
      },
      {
        id: 'B17',
        n: 17,
        text:
          'Who physically does the banking, and does every payment above the threshold need two approvals?',
      },
      {
        id: 'B18',
        n: 18,
        text:
          'Do we take on debt or asset finance for the first bakkie, or buy cash? What is our ceiling on total company debt?',
      },
    ],
  },
  {
    letter: 'C',
    title: 'Roles, hours and the day-to-day',
    questions: [
      {
        id: 'C19',
        n: 19,
        text:
          'Matthew runs operations, quoting and client-facing work; the partner runs installation. Write both job descriptions in one page each. What decisions belong solely to each?',
      },
      {
        id: 'C20',
        n: 20,
        text:
          'Matthew is still on site sometimes. Is that as a second pair of hands, or as the person in charge? On site, who overrules whom?',
        settleFirst: true,
      },
      {
        id: 'C21',
        n: 21,
        text:
          'How many hours a week is each of us committing? Is "full time" actually full time for both from day one?',
      },
      {
        id: 'C22',
        n: 22,
        text:
          'Can either of us take other paid work — private jobs, consulting, a foreigner on a weekend? Under what conditions, and does the money go to the company?',
      },
      {
        id: 'C23',
        n: 23,
        text:
          'How much leave does each of us take, and who approves it? What happens the week you both want off?',
      },
      {
        id: 'C24',
        n: 24,
        text:
          'When the roles shift — because they will — what triggers the review, and how often is it scheduled?',
      },
      {
        id: 'C25',
        n: 25,
        text:
          'What does each of us find genuinely unpleasant, and who ends up doing it by default? (Chasing debtors. Site cleanups. Difficult customers.)',
      },
      {
        id: 'C26',
        n: 26,
        text:
          'How do we communicate a problem with each other\'s work — same day, direct, or does it go into the weekly meeting?',
      },
      {
        id: 'C27',
        n: 27,
        text:
          'Do we have a standing weekly meeting with an agenda and minutes? Minutes matter more than you think when there is a dispute.',
      },
    ],
  },
  {
    letter: 'D',
    title: 'Ownership and equity',
    questions: [
      {
        id: 'D28',
        n: 28,
        text:
          'What is the shareholding split, and precisely what is it based on — cash, hours, existing client base, the software, the trade registration?',
        settleFirst: true,
      },
      {
        id: 'D29',
        n: 29,
        text:
          'If it is 50/50: how do we break a deadlock? A 50/50 company with no deadlock mechanism can be forced into deregistration by one angry shareholder.',
        settleFirst: true,
      },
      {
        id: 'D30',
        n: 30,
        text:
          'Does equity vest over time? If one of us walks in month four, do they keep half the company?',
        settleFirst: true,
      },
      {
        id: 'D31',
        n: 31,
        text:
          'If we vest: over how many years, with what cliff, and what counts as leaving "good" versus "bad"?',
      },
      {
        id: 'D32',
        n: 32,
        text:
          'Can either of us sell or pledge shares to an outsider? Does the other get first refusal, and at what price?',
      },
      {
        id: 'D33',
        n: 33,
        text:
          'If a third person joins later — the admin or the bookkeeper earning their way in — where does their equity come from? Both of us equally?',
      },
      {
        id: 'D34',
        n: 34,
        text:
          'How do we value the company when we need a number? Agree a formula now (a multiple of maintainable profit, plus net assets) rather than arguing about it in a crisis.',
        settleFirst: true,
      },
      {
        id: 'D35',
        n: 35,
        text:
          'Who are the directors, and are directors and shareholders the same two people? Do we want an independent third director as a tiebreaker?',
      },
      {
        id: 'D36',
        n: 36,
        text:
          'Does either of us have a spouse married in community of property? If so, that spouse has a legal interest in the shares — has that been dealt with?',
      },
    ],
  },
  {
    letter: 'E',
    title: 'Decisions and deadlock',
    questions: [
      {
        id: 'E37',
        n: 37,
        text:
          'List the decisions that need both of us: hiring, firing, borrowing, buying a vehicle, signing a contract over R X, changing pricing, taking on a job over R Y.',
      },
      {
        id: 'E38',
        n: 38,
        text:
          'Which decisions does each of us make alone, without consulting? Be generous here — a partnership where nothing moves without two signatures dies of friction.',
      },
      {
        id: 'E39',
        n: 39,
        text:
          'If we deadlock on something material, what happens? Mediation first, then arbitration? A shoot-out clause where one names a price and the other chooses to buy or sell at it?',
      },
      {
        id: 'E40',
        n: 40,
        text:
          'Who has the final word on turning down a customer or a job?',
      },
      {
        id: 'E41',
        n: 41,
        text:
          'Who has the final word on technical method and safety on site — and is that unconditional?',
      },
      {
        id: 'E42',
        n: 42,
        text:
          'Who has the final word on price, discount and payment terms?',
      },
      {
        id: 'E43',
        n: 43,
        text:
          'If one of us commits the company to something outside their lane, is the company bound? What do we do about it?',
      },
    ],
  },
  {
    letter: 'F',
    title: 'The existing business, the brand and the software',
    note:
      'This group is specific to you, and it is the one an off-the-shelf agreement will not cover. Haberl Electrical &amp; Solar already exists, with a brand, a client base, and a substantial platform you built.',
    questions: [
      {
        id: 'F44',
        n: 44,
        text:
          'Is the new company a rename of the existing business, or a genuinely new entity trading alongside it?',
        settleFirst: true,
      },
      {
        id: 'F45',
        n: 45,
        text:
          'If it is new: do the existing customers, the site traffic, the leads and the name transfer in? At what value, and does that buy Matthew equity?',
        settleFirst: true,
      },
      {
        id: 'F46',
        n: 46,
        text:
          'Who owns the platform — the quoting engine, the job pipeline, the monitoring, the finance module? Is it contributed to the company, or licensed to it by Matthew personally?',
        settleFirst: true,
      },
      {
        id: 'F47',
        n: 47,
        text:
          'If the partnership ends, who walks away with the code and the customer data in it? Write this down before a single line of shared data goes in.',
      },
      {
        id: 'F48',
        n: 48,
        text:
          'Who owns the domain, the Google Business Profile, the social accounts, the mobile numbers, and the SARS/CIPC login credentials? Not "we do" — name a person and a recovery method for each.',
      },
      {
        id: 'F49',
        n: 49,
        text:
          'Is Matthew\'s continued development of the platform part of his job, or a separate service the company pays for? What happens to it when his role changes?',
      },
      {
        id: 'F50',
        n: 50,
        text:
          'Does the partner have any pre-existing customers, work in progress, or warranty obligations coming with him? Do those liabilities become the company\'s?',
      },
      {
        id: 'F51',
        n: 51,
        text:
          'Does the trade name need a trade mark application, given you are putting a family surname on a business with a co-owner?',
      },
    ],
  },
  {
    letter: 'G',
    title: 'Registration, the CoC signature and liability',
    note:
      'This is the group that is specific to electrical. Your right to trade rests on one person\'s personal registration, and the person who signs a Certificate of Compliance carries that signature personally.',
    questions: [
      {
        id: 'G52',
        n: 52,
        text:
          'Which of us is the registered person — Installation Electrician, Master Installation Electrician, or single-phase tester — and whose registration does the company\'s electrical contractor registration depend on?',
        settleFirst: true,
      },
      {
        id: 'G53',
        n: 53,
        text:
          'If that person leaves, is suspended, or dies, the company cannot lawfully issue a CoC. What is the contingency, and how fast can we get a second registered person?',
        settleFirst: true,
      },
      {
        id: 'G54',
        n: 54,
        text:
          'Who signs CoCs, and under what conditions may they refuse? Is a refusal to sign ever overridable by the other partner?',
        note:
          'The answer must be no, and it must be in writing.',
      },
      {
        id: 'G55',
        n: 55,
        text:
          'If work has to be redone at our cost to get a signature, whose budget takes the hit — the installation side or the company?',
      },
      {
        id: 'G56',
        n: 56,
        text:
          'Do we ever issue a CoC on work we did not do or fully inspect? Agree the answer once, now, out loud.',
      },
      {
        id: 'G57',
        n: 57,
        text:
          'What is our position on a customer who wants it cheaper by leaving something non-compliant? Who is allowed to say yes? (Nobody.)',
      },
      {
        id: 'G58',
        n: 58,
        text:
          'If someone is seriously injured or killed on one of our sites, what happens to each of us personally — and are we both clear on directors\' liability under the OHS Act and the Companies Act?',
        settleFirst: true,
      },
      {
        id: 'G59',
        n: 59,
        text:
          'Who is the appointed responsible person for health and safety, who does the site risk assessments, and who keeps the H&S file?',
      },
      {
        id: 'G60',
        n: 60,
        text:
          'What insurance are we carrying from day one, and what is the excess we can actually afford to pay?',
      },
    ],
  },
  {
    letter: 'H',
    title: 'The other two people',
    questions: [
      {
        id: 'H61',
        n: 61,
        text:
          'Are the admin and bookkeeping people employees, independent contractors, or future shareholders? Each has completely different tax, UIF and COIDA consequences.',
        settleFirst: true,
      },
      {
        id: 'H62',
        n: 62,
        text:
          'Since both are competent across advertising, ordering and admin, who do they each report to — and what happens when both of us give them work in the same week?',
      },
      {
        id: 'H63',
        n: 63,
        text:
          'Who can hire, and who can fire? Does it need both signatures?',
      },
      {
        id: 'H64',
        n: 64,
        text:
          'Is anyone a family member or partner of either of us? What is the rule when their performance becomes a problem?',
      },
      {
        id: 'H65',
        n: 65,
        text:
          'Does the person doing the books have any authority to move money?',
        note:
          'Whoever captures should not be able to pay.',
      },
      {
        id: 'H66',
        n: 66,
        text:
          'What is our first apprentice/assistant plan, and do we fall inside the electrical bargaining council\'s scope for wages and levies?',
      },
    ],
  },
  {
    letter: 'I',
    title: 'Exit, death, divorce, disaster',
    questions: [
      {
        id: 'I67',
        n: 67,
        text:
          'If one of us dies, do the shares go to their spouse — who now co-owns an electrical company with the survivor? Or does a buy-and-sell agreement force a sale, funded by life cover?',
        settleFirst: true,
      },
      {
        id: 'I68',
        n: 68,
        text:
          'If one of us is permanently disabled and can no longer climb a roof, what does the company owe them, for how long?',
      },
      {
        id: 'I69',
        n: 69,
        text:
          'If one of us simply wants out in year two, what is the notice period, the valuation, and the payment terms — lump sum or instalments?',
      },
      {
        id: 'I70',
        n: 70,
        text:
          'What conduct lets the other buy you out at a discount — dishonesty, gross negligence, criminal conviction, sequestration, working for a competitor?',
      },
      {
        id: 'I71',
        n: 71,
        text:
          'What restraint applies to a departing partner — how long, what area, what work? Keep it modest; an unreasonable restraint is unenforceable.',
      },
      {
        id: 'I72',
        n: 72,
        text:
          'On the way out, who keeps which customers, and who honours the outstanding guarantees on completed jobs?',
      },
      {
        id: 'I73',
        n: 73,
        text:
          'At what point do we agree the business has failed — a number and a date, decided now while we are calm?',
      },
      {
        id: 'I74',
        n: 74,
        text:
          'If we wind it up, who pays the shortfall, in what proportion?',
      },
    ],
  },
]

export const ALL_QUESTIONS: FounderQuestion[] = FOUNDER_GROUPS.flatMap((g) => g.questions)

export const QUESTION_COUNT = ALL_QUESTIONS.length

export const SETTLE_FIRST_COUNT = ALL_QUESTIONS.filter((q) => q.settleFirst).length

/** Group letter for a question id, so an answer can be grouped without a lookup table. */
export function groupOf(questionId: string): FounderGroup | undefined {
  return FOUNDER_GROUPS.find((g) => g.letter === questionId.slice(0, 1))
}

