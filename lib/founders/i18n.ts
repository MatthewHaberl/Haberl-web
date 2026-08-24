import type { Locale } from './questions'

/**
 * Every visible string on the workbook, in both languages.
 *
 * Matthew reads the page in English and Zacques in Afrikaans; each person's
 * language is stored on their participant row, so the choice follows them
 * between devices instead of living in one browser.
 */
export interface WorkbookStrings {
  kicker: string
  title: string
  tabQuestions: string
  tabReference: string
  disclaimer: string

  inTheRoom: string
  submitted: string
  stillAnswering: string
  answeredOf: (done: number, total: number) => string
  submitMine: string
  reopenMine: string
  addParticipant: string
  addHint: string
  nameLabel: string
  emailLabel: string
  namePlaceholder: string
  emailPlaceholder: string
  add: string
  cancel: string
  alreadyIn: string
  badEmail: string
  addFailed: string
  statusFailed: string

  beforeReveal: string
  afterReveal: string

  filterAll: (n: number) => string
  filterSettleFirst: string
  filterUnanswered: (n: number) => string
  settleFirstBadge: string

  answerPlaceholder: string
  lockedPlaceholder: string
  leftBlank: string
  agreedPosition: string
  agreedPlaceholder: string

  helpLabel: string
  helpHeading: string
  languageLabel: string
}

const en: WorkbookStrings = {
  kicker: 'Founders’ workbook · private',
  title: 'Before the Handshake',
  tabQuestions: 'Questions',
  tabReference: 'Registrations & documents',
  disclaimer:
    'Nothing here is legal or tax advice. Every threshold, form number and fee is a starting point to confirm with your attorney, your accountant, the ECB and the relevant bargaining council — South African requirements change.',

  inTheRoom: 'In the room',
  submitted: 'Submitted',
  stillAnswering: 'Still answering',
  answeredOf: (done, total) => `${done} / ${total} answered`,
  submitMine: 'Submit my answers',
  reopenMine: 'Reopen my answers',
  addParticipant: 'Add a participant',
  addHint:
    'Use the email address they sign in to the portal with — they get access the moment they have an account on that address.',
  nameLabel: 'Name',
  emailLabel: 'Portal email address',
  namePlaceholder: 'Full name',
  emailPlaceholder: 'name@example.co.za',
  add: 'Add',
  cancel: 'Cancel',
  alreadyIn: 'That person is already in the workbook.',
  badEmail: 'That does not look like an email address.',
  addFailed: 'Could not add them. Check the address and try again.',
  statusFailed: 'Could not update your status. Try again.',

  beforeReveal:
    'Answer on your own. Nobody sees anybody else’s answers until every person listed above has submitted — the whole point is to find the questions you answer differently.',
  afterReveal:
    'Everyone has submitted, so all answers are now visible. Work through the differences and write the agreed position under each question — that is what goes to the attorney.',

  filterAll: (n) => `All ${n}`,
  filterSettleFirst: 'Settle first',
  filterUnanswered: (n) => `Unanswered ${n}`,
  settleFirstBadge: 'Settle first',

  answerPlaceholder: 'Your answer…',
  lockedPlaceholder: 'Submitted — reopen to edit',
  leftBlank: '— left blank —',
  agreedPosition: 'Agreed position',
  agreedPlaceholder:
    'What the two of you settled on — this is what goes to the attorney.',

  helpLabel: 'What is this question asking?',
  helpHeading: 'What this question is asking',
  languageLabel: 'Language',
}

const af: WorkbookStrings = {
  kicker: 'Stigters se werkboek · privaat',
  title: 'Voor die Handdruk',
  tabQuestions: 'Vrae',
  tabReference: 'Registrasies & dokumente',
  disclaimer:
    'Niks hier is regs- of belastingadvies nie. Elke drempel, vormnommer en fooi is ’n vertrekpunt om by julle prokureur, julle rekenmeester, die ECB en die betrokke bedingingsraad te bevestig — Suid-Afrikaanse vereistes verander.',

  inTheRoom: 'In die vertrek',
  submitted: 'Ingedien',
  stillAnswering: 'Antwoord nog',
  answeredOf: (done, total) => `${done} / ${total} beantwoord`,
  submitMine: 'Dien my antwoorde in',
  reopenMine: 'Heropen my antwoorde',
  addParticipant: 'Voeg ’n deelnemer by',
  addHint:
    'Gebruik die e-posadres waarmee hulle by die portaal aanteken — hulle kry toegang sodra hulle ’n rekening op daardie adres het.',
  nameLabel: 'Naam',
  emailLabel: 'Portaal-e-posadres',
  namePlaceholder: 'Volle naam',
  emailPlaceholder: 'naam@voorbeeld.co.za',
  add: 'Voeg by',
  cancel: 'Kanselleer',
  alreadyIn: 'Daardie persoon is reeds in die werkboek.',
  badEmail: 'Dit lyk nie na ’n e-posadres nie.',
  addFailed: 'Kon hulle nie byvoeg nie. Gaan die adres na en probeer weer.',
  statusFailed: 'Kon nie jou status opdateer nie. Probeer weer.',

  beforeReveal:
    'Antwoord op jou eie. Niemand sien iemand anders se antwoorde voordat elke persoon hierbo ingedien het nie — die hele punt is om die vrae te vind wat julle verskillend antwoord.',
  afterReveal:
    'Almal het ingedien, so al die antwoorde is nou sigbaar. Werk deur die verskille en skryf die ooreengekome standpunt onder elke vraag — dít is wat na die prokureur gaan.',

  filterAll: (n) => `Almal ${n}`,
  filterSettleFirst: 'Eerste uitsorteer',
  filterUnanswered: (n) => `Onbeantwoord ${n}`,
  settleFirstBadge: 'Eerste uitsorteer',

  answerPlaceholder: 'Jou antwoord…',
  lockedPlaceholder: 'Ingedien — heropen om te wysig',
  leftBlank: '— oop gelaat —',
  agreedPosition: 'Ooreengekome standpunt',
  agreedPlaceholder:
    'Waarop julle twee besluit het — dít is wat na die prokureur gaan.',

  helpLabel: 'Wat vra hierdie vraag?',
  helpHeading: 'Wat hierdie vraag vra',
  languageLabel: 'Taal',
}

export const STRINGS: Record<Locale, WorkbookStrings> = { en, af }

export const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  af: 'Afrikaans',
}

export function strings(locale: Locale): WorkbookStrings {
  return STRINGS[locale] ?? STRINGS.en
}
