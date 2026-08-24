/**
 * The founders' workbook: the 74 questions two people answer separately before
 * they form a company together.
 *
 * Every string is carried in both languages — Matthew works in English and
 * Zacques in Afrikaans, and each of them reads the SAME question, so a
 * difference in their answers is a real difference and not a translation
 * artefact. `help` is the explanation behind the question-mark button: what the
 * question is actually asking, why it matters, and what a usable answer looks
 * like.
 *
 * `id` is stable and is what `founders_answers.question_id` stores — reword a
 * question freely, but never renumber an id, or the answer written against it
 * is orphaned.
 */

export type Locale = 'en' | 'af'

export const LOCALES: Locale[] = ['en', 'af']

/** One string in both languages. */
export interface Localised {
  en: string
  af: string
}

export interface FounderQuestion {
  /** Stable key, e.g. 'B08'. Group letter + the printed number. */
  id: string
  /** Printed number, 1-74. */
  n: number
  text: Localised
  /** A clarifying aside shown in lighter type under the question. */
  note?: Localised
  /** What this question is really asking — shown by the question-mark button. */
  help: Localised
  /** The ones that most often end partnerships - answer these first. */
  settleFirst?: boolean
}

export interface FounderGroup {
  letter: string
  title: Localised
  /** Why this group exists, shown under its heading. */
  note?: Localised
  questions: FounderQuestion[]
}

export const FOUNDER_GROUPS: FounderGroup[] = [
  {
    letter: 'A',
    title: {
      en: 'Why we are doing this at all',
      af: 'Hoekom ons dit hoegenaamd doen',
    },
    questions: [
      {
        id: 'A01',
        n: 1,
        text: {
          en: 'What does this business need to pay each of us, monthly, for it to have been worth doing? Give a number, not a feeling.',
          af: 'Wat moet hierdie besigheid elkeen van ons maandeliks betaal sodat dit die moeite werd was? Gee ’n bedrag, nie ’n gevoel nie.',
        },
        help: {
          en: 'This sets the bar everything else is measured against. Write down the rand amount you need to draw each month for this to beat whatever you would otherwise be doing — not the amount you would like, the amount below which you would quietly start looking for other work. If your two numbers are far apart, the person with the higher number is under pressure the other cannot see, and that pressure shows up later as arguments about pricing and drawings.',
          af: 'Dit stel die maatstaf waarteen alles anders gemeet word. Skryf die randbedrag neer wat jy elke maand moet onttrek sodat dit beter is as wat jy andersins sou doen — nie die bedrag wat jy graag wil hê nie, maar die bedrag waaronder jy stilweg na ander werk sou begin kyk. As julle twee syfers ver uitmekaar is, is die een met die hoër syfer onder druk wat die ander nie kan sien nie, en daardie druk kom later uit as rusies oor pryse en onttrekkings.',
        },
      },
      {
        id: 'A02',
        n: 2,
        text: {
          en: 'In five years, is this a two-van business we both still work in, a twenty-staff contractor we manage, or something we sell?',
          af: 'Oor vyf jaar — is dit ’n twee-bakkie-besigheid waarin ons albei nog self werk, ’n kontrakteur met twintig werknemers wat ons bestuur, of iets wat ons verkoop?',
        },
        note: {
          en: 'If we answer differently, everything downstream — hiring, debt, margins — is in conflict.',
          af: 'As ons verskillend antwoord, is alles wat daarop volg — aanstellings, skuld, winsgrense — in stryd met mekaar.',
        },
        help: {
          en: 'This is about the destination, and it silently decides a hundred smaller choices. A two-van business should stay debt-light, keep overheads tiny and pay the owners well. A twenty-staff contractor has to hire before it feels affordable, carry overheads and reinvest most of its profit. Something you sell needs recurring revenue, clean books and systems that work without you. Pick one out loud, because you will otherwise each optimise for a different answer.',
          af: 'Dit gaan oor die bestemming, en dit besluit stilweg oor honderd kleiner keuses. ’n Twee-bakkie-besigheid moet min skuld hê, oorhoofse koste klein hou en die eienaars goed betaal. ’n Kontrakteur met twintig werknemers moet aanstel voordat dit bekostigbaar voel, oorhoofse koste dra en die meeste van sy wins herbelê. Iets wat jy verkoop, het herhalende inkomste, skoon boeke en stelsels nodig wat sonder jou werk. Kies een hardop, anders werk julle elkeen na ’n ander antwoord toe.',
        },
        settleFirst: true,
      },
      {
        id: 'A03',
        n: 3,
        text: {
          en: 'Are we building a business, or buying ourselves jobs? Both are legitimate. Pretending it is the first when it is the second is not.',
          af: 'Bou ons ’n besigheid, of koop ons vir onsself werk? Albei is regverdig. Om voor te gee dis die eerste terwyl dit die tweede is, is nie.',
        },
        help: {
          en: 'Buying yourself a job means the company is a wrapper around your own hands: if you stop working, income stops, and at the end there is nothing to sell. Building a business means making an asset that keeps earning when you are not there. The honest test is what happens to revenue if either of you takes a month off — a job goes to zero, a business dips. Right now you are two jobs; the question is whether that is the destination or the starting point, because the two answers demand opposite behaviour on pricing, hiring and how much profit you leave in.',
          af: 'Om vir jouself werk te koop, beteken die maatskappy is net ’n omhulsel om jou eie hande: as jy ophou werk, hou die inkomste op, en aan die einde is daar niks om te verkoop nie. Om ’n besigheid te bou, beteken jy maak ’n bate wat aanhou verdien wanneer jy nie daar is nie. Die eerlike toets is wat met omset gebeur as een van julle ’n maand afvat — ’n werk gaan na nul, ’n besigheid dip net. Op die oomblik is julle twee werke; die vraag is of dit die bestemming of die vertrekpunt is, want die twee antwoorde vra presies teenoorgestelde gedrag oor pryse, aanstellings en hoeveel wins julle inhou.',
        },
      },
      {
        id: 'A04',
        n: 4,
        text: {
          en: 'How much of our own money is each of us prepared to lose before we stop?',
          af: 'Hoeveel van ons eie geld is elkeen van ons bereid om te verloor voordat ons ophou?',
        },
        help: {
          en: 'Every business has a point where continuing is throwing good money after bad, and partners almost never reach it at the same time. Decide your personal stop-loss now, while it is theoretical. The number matters less than the fact that you both know each other’s, because the moment one of you is out of money the other is suddenly negotiating with someone who has no choice.',
          af: 'Elke besigheid het ’n punt waar voortgaan beteken jy gooi goeie geld agter slegte aan, en vennote bereik daardie punt byna nooit op dieselfde tyd nie. Besluit nou, terwyl dit nog teoreties is, wat jou persoonlike stopverlies is. Die bedrag self maak minder saak as die feit dat julle albei mekaar s’n ken, want die oomblik as een van julle sonder geld sit, onderhandel die ander skielik met iemand wat geen keuse het nie.',
        },
      },
      {
        id: 'A05',
        n: 5,
        text: {
          en: 'What is each of us giving up to do this — a salary, another business, time with family? Does the other person know the real number?',
          af: 'Wat gee elkeen van ons prys om dit te doen — ’n salaris, ’n ander besigheid, tyd met die gesin? Weet die ander een wat die werklike bedrag is?',
        },
        help: {
          en: 'Opportunity cost is invisible and it breeds resentment. If one of you walked away from a good salary and the other from very little, the first is carrying a cost the second never sees, and after two hard years it comes out sideways. Say the actual numbers out loud once, so neither of you is silently keeping score.',
          af: 'Geleentheidskoste is onsigbaar en dit kweek wrewel. As een van julle ’n goeie salaris prysgegee het en die ander baie min, dra die eerste ’n koste wat die tweede nooit sien nie, en ná twee moeilike jare kom dit skeef uit. Sê die werklike syfers een keer hardop, sodat nie een van julle stilweg tel wie meer opgeoffer het nie.',
        },
      },
      {
        id: 'A06',
        n: 6,
        text: {
          en: 'Do our households agree? Have both spouses/partners actually seen the numbers and the runway?',
          af: 'Stem ons huishoudings saam? Het albei se lewensmaats werklik die syfers en die geldlewe gesien?',
        },
        help: {
          en: 'Businesses at this stage are funded by two households, not two people. A partner at home who has not seen how thin month four looks will apply pressure at exactly the wrong moment, and that pressure lands on your business partner. Show them the real cash-flow picture before you start, not after.',
          af: 'Besighede op hierdie stadium word deur twee huishoudings gefinansier, nie twee mense nie. ’n Lewensmaat wat nie gesien het hoe skraal maand vier lyk nie, gaan druk toepas op presies die verkeerde oomblik, en daardie druk beland op jou sakevennoot. Wys vir hulle die werklike kontantvloeiprentjie voordat julle begin, nie daarna nie.',
        },
      },
    ],
  },
  {
    letter: 'B',
    title: {
      en: 'Money in, money out',
      af: 'Geld in, geld uit',
    },
    note: {
      en: 'Most partnership fights are not about the split. They are about drawings, and about the moment one person needs cash and the other wants to reinvest.',
      af: 'Die meeste vennootskapsrusies gaan nie oor die verdeling nie. Hulle gaan oor onttrekkings, en oor die oomblik wanneer die een kontant nodig het en die ander wil herbelê.',
    },
    questions: [
      {
        id: 'B07',
        n: 7,
        text: {
          en: 'How much capital does each of us put in on day one, in cash? Are the amounts equal?',
          af: 'Hoeveel kapitaal sit elkeen van ons op dag een in, in kontant? Is die bedrae gelyk?',
        },
        help: {
          en: 'Unequal cash almost always ends up meaning unequal shares or a loan account, and it is far easier to say so now than to reconstruct it later from bank statements. Write down who put in what, on what date. If the amounts are not equal, question 8 decides how the difference is treated.',
          af: 'Ongelyke kontant beteken byna altyd ongelyke aandele of ’n leningsrekening, en dis baie makliker om dit nou te sê as om dit later uit bankstate te probeer rekonstrueer. Skryf neer wie wat ingesit het, en op watter datum. As die bedrae nie gelyk is nie, besluit vraag 8 hoe die verskil hanteer word.',
        },
      },
      {
        id: 'B08',
        n: 8,
        text: {
          en: 'Is that money share capital or a shareholder loan account?',
          af: 'Is daardie geld aandelekapitaal of ’n aandeelhouersleningsrekening?',
        },
        note: {
          en: 'A loan can be repaid ahead of profits and changes what happens on exit — this must be decided, not defaulted.',
          af: '’n Lening kan voor winste terugbetaal word en verander wat by uittrede gebeur — dit moet besluit word, nie by verstek gebeur nie.',
        },
        help: {
          en: 'Share capital buys you a permanent slice of the company and only comes back when the company is sold or wound up. A loan account is money the company owes you, repayable ahead of any dividend, and it does not change your shareholding. The same R100 000 therefore means two completely different things, and the difference shows up loudest on the day one of you leaves. Most small companies use a small share capital plus loan accounts — but decide it deliberately with your accountant.',
          af: 'Aandelekapitaal koop vir jou ’n permanente stuk van die maatskappy en kom eers terug wanneer die maatskappy verkoop of ontbind word. ’n Leningsrekening is geld wat die maatskappy aan jou skuld, terugbetaalbaar voor enige dividend, en dit verander nie jou aandeelhouding nie. Dieselfde R100 000 beteken dus twee heeltemal verskillende dinge, en die verskil wys die duidelikste op die dag wanneer een van julle uittree. Die meeste klein maatskappye gebruik ’n klein aandelekapitaal plus leningsrekeninge — maar besluit dit doelbewus saam met julle rekenmeester.',
        },
        settleFirst: true,
      },
      {
        id: 'B09',
        n: 9,
        text: {
          en: 'Do tools, vehicles, ladders, test instruments and the existing software count as capital contribution? At whose valuation?',
          af: 'Tel gereedskap, voertuie, lere, toetsinstrumente en die bestaande sagteware as kapitaalbydrae? Teen wie se waardasie?',
        },
        help: {
          en: 'Contributing a bakkie and a set of instruments is real money, and so is a working quoting platform. Decide whether these are sold to the company, lent to it, or contributed for shares, and agree the value in writing before anything is used on a job. Also agree who insures and maintains them, and what happens to them if the partnership ends.',
          af: 'Om ’n bakkie en ’n stel instrumente by te dra, is werklike geld, en so ook ’n werkende kwotasieplatform. Besluit of hierdie goed aan die maatskappy verkoop, aan die maatskappy geleen, of vir aandele bygedra word, en stem die waarde skriftelik ooreen voordat enigiets op ’n werk gebruik word. Stem ook ooreen wie dit verseker en onderhou, en wat daarmee gebeur as die vennootskap eindig.',
        },
      },
      {
        id: 'B10',
        n: 10,
        text: {
          en: 'What does each of us draw monthly, from month one? Is it a salary through PAYE, or drawings against profit?',
          af: 'Wat onttrek elkeen van ons maandeliks, van maand een af? Is dit ’n salaris deur LBS, of onttrekkings teen wins?',
        },
        help: {
          en: 'A salary is predictable, taxed monthly through PAYE, and is a cost the company must cover whether or not it had a good month. Drawings flex with profit but leave you exposed to a lean quarter and can create a tax problem if you draw more than the company earns. Pick one, put a number on it, and diarise a review date.',
          af: '’n Salaris is voorspelbaar, word maandeliks deur LBS belas, en is ’n koste wat die maatskappy moet dek of dit ’n goeie maand gehad het of nie. Onttrekkings buig saam met wins, maar laat jou blootgestel in ’n skraal kwartaal en kan ’n belastingprobleem skep as jy meer onttrek as wat die maatskappy verdien. Kies een, sit ’n bedrag daarby, en skryf ’n hersieningsdatum in die dagboek.',
        },
      },
      {
        id: 'B11',
        n: 11,
        text: {
          en: 'If the company can only pay one of us this month, who gets paid?',
          af: 'As die maatskappy hierdie maand net een van ons kan betaal, wie word betaal?',
        },
        help: {
          en: 'It will happen, probably in the first year. Deciding it in advance turns a fight into an administrative step. Common answers: whoever has the least personal buffer, or strictly alternating, or both take a proportional cut. Any of those works; no answer at all does not.',
          af: 'Dit gaan gebeur, waarskynlik in die eerste jaar. Om dit vooraf te besluit, verander ’n rusie in ’n administratiewe stappie. Algemene antwoorde: die een met die minste persoonlike buffer, of streng om die beurt, of albei vat ’n eweredige snit. Enigeen van daardie werk; géén antwoord werk nie.',
        },
      },
      {
        id: 'B12',
        n: 12,
        text: {
          en: 'Are our two salaries equal even though our roles are different? If not, who decided the difference and how does it get reviewed?',
          af: 'Is ons twee salarisse gelyk al is ons rolle verskillend? Indien nie, wie het die verskil besluit en hoe word dit hersien?',
        },
        help: {
          en: 'Equal shareholding does not have to mean equal pay, and unequal pay does not have to mean unequal ownership — keep the two ideas separate. Pay should reflect the job being done now; shares reflect ownership of the whole thing. Say which principle you are using, and set a date to revisit it as the roles change.',
          af: 'Gelyke aandeelhouding hoef nie gelyke betaling te beteken nie, en ongelyke betaling hoef nie ongelyke eienaarskap te beteken nie — hou die twee idees uitmekaar. Betaling moet die werk weerspieël wat nú gedoen word; aandele weerspieël eienaarskap van die hele ding. Sê watter beginsel julle gebruik, en stel ’n datum om dit te hersien soos die rolle verander.',
        },
      },
      {
        id: 'B13',
        n: 13,
        text: {
          en: 'What percentage of profit gets left in the business every year before anything is distributed? Write the number into the agreement.',
          af: 'Watter persentasie van die wins bly elke jaar in die besigheid voordat enigiets uitbetaal word? Skryf die syfer in die ooreenkoms.',
        },
        help: {
          en: 'This is the single clause that most often saves a partnership. Without it, every good year becomes a negotiation between the one who wants to buy a second bakkie and the one who wants to pay off his bond. A fixed percentage — say the first 30% of profit stays in — makes the answer automatic and impersonal.',
          af: 'Dit is die enkele klousule wat ’n vennootskap die meeste keer red. Sonder dit word elke goeie jaar ’n onderhandeling tussen die een wat ’n tweede bakkie wil koop en die een wat sy verband wil afbetaal. ’n Vaste persentasie — sê die eerste 30% van die wins bly in — maak die antwoord outomaties en onpersoonlik.',
        },
      },
      {
        id: 'B14',
        n: 14,
        text: {
          en: 'If we need more capital in month eight and one of us cannot put it in — does the other lend it, or take more equity? At what valuation?',
          af: 'As ons in maand agt meer kapitaal nodig het en een van ons kan dit nie insit nie — leen die ander dit, of kry hy meer aandele? Teen watter waardasie?',
        },
        help: {
          en: 'This is how 50/50 partnerships quietly become 70/30, usually at a valuation invented under pressure by the person holding the cash. Decide the mechanism now: is a shortfall funded by a loan at a stated interest rate, or by new shares at a formula-based price? Write the formula down while neither of you knows who will be short.',
          af: 'Dit is hoe 50/50-vennootskappe stilweg 70/30 word, gewoonlik teen ’n waardasie wat onder druk uitgedink is deur die een wat die kontant het. Besluit nou oor die meganisme: word ’n tekort deur ’n lening teen ’n vasgestelde rentekoers gefinansier, of deur nuwe aandele teen ’n formulegebaseerde prys? Skryf die formule neer terwyl nie een van julle weet wie kort gaan kom nie.',
        },
        settleFirst: true,
      },
      {
        id: 'B15',
        n: 15,
        text: {
          en: 'Will we sign personal sureties? For the bank, the landlord, and every supplier account?',
          af: 'Gaan ons persoonlike borgstellings teken? Vir die bank, die verhuurder, en elke verskaffersrekening?',
        },
        note: {
          en: 'A surety makes limited liability meaningless. Know exactly what each of you has signed.',
          af: '’n Borgstelling maak beperkte aanspreeklikheid betekenisloos. Weet presies wat elkeen van julle geteken het.',
        },
        help: {
          en: 'A (Pty) Ltd protects your house right up until you sign a surety, at which point that supplier can come after you personally for the company’s debt. You will almost certainly have to sign some. The discipline is: keep a written list of every surety, who signed it, and for how much; sign jointly rather than one of you carrying all of them; and ask for release once the company has its own credit record.',
          af: '’n (Edms) Bpk beskerm jou huis presies tot op die punt waar jy ’n borgstelling teken — daarna kan daardie verskaffer jou persoonlik vir die maatskappy se skuld aanvat. Julle gaan byna seker sommige moet teken. Die dissipline is: hou ’n geskrewe lys van elke borgstelling, wie dit geteken het, en vir hoeveel; teken saam eerder as dat een van julle almal dra; en vra vir vrystelling sodra die maatskappy sy eie kredietrekord het.',
        },
        settleFirst: true,
      },
      {
        id: 'B16',
        n: 16,
        text: {
          en: 'What is the maximum either of us can spend without the other’s sign-off? One number, in rands, in writing.',
          af: 'Wat is die maksimum wat enigeen van ons kan bestee sonder die ander se goedkeuring? Een bedrag, in rand, op skrif.',
        },
        help: {
          en: 'Without a number, every purchase is either an unspoken irritation or an unnecessary phone call. Set it high enough that normal work is not slowed down — consumables, a day’s materials — and low enough that nothing significant happens without both of you knowing. Review it once you have a few months of real spending data.',
          af: 'Sonder ’n bedrag is elke aankoop óf ’n onuitgesproke irritasie óf ’n onnodige oproep. Stel dit hoog genoeg dat normale werk nie vertraag word nie — verbruiksgoedere, ’n dag se materiaal — en laag genoeg dat niks beduidends gebeur sonder dat julle albei weet nie. Hersien dit sodra julle ’n paar maande se werklike bestedingsdata het.',
        },
      },
      {
        id: 'B17',
        n: 17,
        text: {
          en: 'Who physically does the banking, and does every payment above the threshold need two approvals?',
          af: 'Wie doen fisies die bankwerk, en verg elke betaling bo die drempel twee goedkeurings?',
        },
        help: {
          en: 'This is not about trusting each other; it is about never having to wonder. A two-signature mandate above an agreed amount protects the person doing the banking as much as the one who is not, and it is the control your accountant and your insurer will both expect to see.',
          af: 'Dit gaan nie oor of julle mekaar vertrou nie; dit gaan daaroor dat julle nooit hoef te wonder nie. ’n Twee-handtekening-mandaat bo ’n ooreengekome bedrag beskerm die een wat die bankwerk doen net soveel as die een wat dit nie doen nie, en dit is die beheermaatreël wat julle rekenmeester sóós julle versekeraar sal verwag om te sien.',
        },
      },
      {
        id: 'B18',
        n: 18,
        text: {
          en: 'Do we take on debt or asset finance for the first bakkie, or buy cash? What is our ceiling on total company debt?',
          af: 'Neem ons skuld of batefinansiering vir die eerste bakkie, of koop ons kontant? Wat is ons plafon op totale maatskappyskuld?',
        },
        help: {
          en: 'Debt buys capacity earlier but converts a bad quarter into a crisis, because instalments do not care how the month went. Agree a hard ceiling on total monthly debt repayments as a percentage of average monthly revenue, and stick to it. Note that asset finance usually comes with personal sureties, which loops straight back to question 15.',
          af: 'Skuld koop kapasiteit vroeër, maar verander ’n slegte kwartaal in ’n krisis, want paaiemente gee nie om hoe die maand gegaan het nie. Stem ’n harde plafon ooreen op totale maandelikse skuldpaaiemente as ’n persentasie van gemiddelde maandelikse omset, en hou daarby. Let op dat batefinansiering gewoonlik met persoonlike borgstellings kom, wat reguit terugloop na vraag 15.',
        },
      },
    ],
  },
  {
    letter: 'C',
    title: {
      en: 'Roles, hours and the day-to-day',
      af: 'Rolle, ure en die daaglikse werk',
    },
    questions: [
      {
        id: 'C19',
        n: 19,
        text: {
          en: 'Matthew runs operations, quoting and client-facing work; Zacques runs installation. Write both job descriptions in one page each. What decisions belong solely to each?',
          af: 'Matthew hanteer bedrywighede, kwotasies en kliëntewerk; Zacques hanteer installasie. Skryf albei posbeskrywings, een bladsy elk. Watter besluite behoort uitsluitlik aan elkeen?',
        },
        help: {
          en: 'Writing it down forces you to find the gaps — the tasks both of you assumed the other was doing, and the ones neither of you wants. One page each is enough. The important column is not the task list but the decision list: what does each of you settle without asking.',
          af: 'Om dit neer te skryf, dwing julle om die gapings te vind — die take wat elkeen aanvaar het die ander doen, en dié wat nie een van julle wil doen nie. Een bladsy elk is genoeg. Die belangrike kolom is nie die taaklys nie, maar die besluitelys: wat besluit elkeen van julle sonder om te vra.',
        },
      },
      {
        id: 'C20',
        n: 20,
        text: {
          en: 'Matthew is still on site sometimes. Is that as a second pair of hands, or as the person in charge? On site, who overrules whom?',
          af: 'Matthew is soms nog op die perseel. Is dit as ’n tweede paar hande, of as die een in beheer? Op die perseel, wie oorheers wie?',
        },
        help: {
          en: 'This is where co-owner partnerships get embarrassing in front of staff. If installation is Zacques’s domain, then on site he outranks the shareholding — including when Matthew disagrees, and including in front of a customer. Say that plainly now, or the first time it happens you will settle it badly and in public.',
          af: 'Dit is waar mede-eienaar-vennootskappe verleentheid voor personeel veroorsaak. As installasie Zacques se domein is, dan tel hy op die perseel swaarder as die aandeelhouding — ook wanneer Matthew verskil, en ook voor ’n kliënt. Sê dit nou reguit, anders gaan julle dit die eerste keer sleg en in die openbaar uitsorteer.',
        },
        settleFirst: true,
      },
      {
        id: 'C21',
        n: 21,
        text: {
          en: 'How many hours a week is each of us committing? Is “full time” actually full time for both from day one?',
          af: 'Hoeveel ure per week verbind elkeen van ons? Is “voltyds” werklik voltyds vir albei van dag een af?',
        },
        help: {
          en: 'Unequal effort is the most common quiet resentment in a two-person business, and it is almost never raised until it is already bitter. If one of you is phasing in, or keeping other income for the first six months, say so now and adjust pay or equity for it deliberately rather than pretending it makes no difference.',
          af: 'Ongelyke inset is die algemeenste stille wrewel in ’n twee-mens-besigheid, en dit word byna nooit opgehaal voordat dit al bitter is nie. As een van julle geleidelik infaseer, of vir die eerste ses maande ander inkomste behou, sê dit nou en pas betaling of aandele doelbewus daarvoor aan, eerder as om voor te gee dit maak nie saak nie.',
        },
      },
      {
        id: 'C22',
        n: 22,
        text: {
          en: 'Can either of us take other paid work — private jobs, consulting, a foreigner on a weekend? Under what conditions, and does the money go to the company?',
          af: 'Mag enigeen van ons ander betaalde werk doen — privaat werkies, konsultasie, ’n “foreigner” oor ’n naweek? Onder watter voorwaardes, en gaan die geld na die maatskappy?',
        },
        help: {
          en: 'A private job done over a weekend uses the company’s tools, the company’s name and, if something goes wrong, the company’s registration and insurance. Decide whether it is allowed at all, and if so whether it is invoiced through the company. The dangerous version is the one nobody mentioned.',
          af: '’n Privaat werkie oor ’n naweek gebruik die maatskappy se gereedskap, die maatskappy se naam en, as iets verkeerd loop, die maatskappy se registrasie en versekering. Besluit of dit hoegenaamd toegelaat word, en indien wel, of dit deur die maatskappy gefaktureer word. Die gevaarlike weergawe is die een wat niemand genoem het nie.',
        },
      },
      {
        id: 'C23',
        n: 23,
        text: {
          en: 'How much leave does each of us take, and who approves it? What happens the week you both want off?',
          af: 'Hoeveel verlof neem elkeen van ons, en wie keur dit goed? Wat gebeur die week wanneer julle albei af wil wees?',
        },
        help: {
          en: 'Owners tend to take either no leave or unannounced leave, and both damage the business. Put a number of days against each of you, require it to be booked in the shared calendar, and agree that December and Easter get planned in advance because that is when customers and staff both disappear.',
          af: 'Eienaars neem geneig óf geen verlof óf onaangekondigde verlof, en albei skaad die besigheid. Sit ’n aantal dae langs elkeen van julle name, vereis dat dit in die gedeelde kalender bespreek word, en stem saam dat Desember en Paasfees vooruit beplan word, want dis wanneer kliënte én personeel verdwyn.',
        },
      },
      {
        id: 'C24',
        n: 24,
        text: {
          en: 'When the roles shift — because they will — what triggers the review, and how often is it scheduled?',
          af: 'Wanneer die rolle verskuif — want dit gaan — wat sneller die hersiening, en hoe gereeld is dit geskeduleer?',
        },
        help: {
          en: 'You have already said the split of work is temporary. Give that intention a date rather than a hope: a fixed review every six or twelve months, plus named triggers such as the first employee, the first R1m of turnover, or either of you wanting to change what you do. A review that is scheduled is a conversation; one that is triggered by frustration is an argument.',
          af: 'Julle het reeds gesê die verdeling van werk is tydelik. Gee daardie voorneme ’n datum eerder as ’n hoop: ’n vaste hersiening elke ses of twaalf maande, plus benoemde snellers soos die eerste werknemer, die eerste R1m omset, of as een van julle wil verander wat hy doen. ’n Hersiening wat geskeduleer is, is ’n gesprek; een wat deur frustrasie gesneller word, is ’n rusie.',
        },
      },
      {
        id: 'C25',
        n: 25,
        text: {
          en: 'What does each of us find genuinely unpleasant, and who ends up doing it by default? (Chasing debtors. Site cleanups. Difficult customers.)',
          af: 'Wat vind elkeen van ons werklik onaangenaam, en wie doen dit uiteindelik by verstek? (Skuldenaars jaag. Perseel skoonmaak. Moeilike kliënte.)',
        },
        help: {
          en: 'The jobs nobody claims are the ones that quietly do not get done, and chasing debtors is top of that list in this trade. Name them, assign them, and be honest if the assignment is unfair — sometimes the right answer is that this is the first task you outsource to the admin person.',
          af: 'Die take wat niemand opeis nie, is dié wat stilweg nie gedoen word nie, en skuldenaars jaag staan boaan daardie lys in hierdie bedryf. Noem hulle, wys hulle toe, en wees eerlik as die toewysing onbillik is — soms is die regte antwoord dat dit die eerste taak is wat julle na die admin-persoon uitkontrakteer.',
        },
      },
      {
        id: 'C26',
        n: 26,
        text: {
          en: 'How do we communicate a problem with each other’s work — same day, direct, or does it go into the weekly meeting?',
          af: 'Hoe kommunikeer ons ’n probleem met mekaar se werk — dieselfde dag, direk, of gaan dit in die weeklikse vergadering in?',
        },
        help: {
          en: 'Friends going into business usually avoid the first hard conversation, and by the third one it is no longer about the work. Agree the channel and the timing now: same day for safety and money, weekly meeting for everything else. Agreeing the mechanism in advance makes the conversation procedural instead of personal.',
          af: 'Vriende wat saam besigheid begin, vermy gewoonlik die eerste moeilike gesprek, en teen die derde een gaan dit nie meer oor die werk nie. Stem nou die kanaal en die tydsberekening: dieselfde dag vir veiligheid en geld, weeklikse vergadering vir alles anders. Om die meganisme vooraf te ooreen te kom, maak die gesprek prosedureel in plaas van persoonlik.',
        },
      },
      {
        id: 'C27',
        n: 27,
        text: {
          en: 'Do we have a standing weekly meeting with an agenda and minutes? Minutes matter more than you think when there is a dispute.',
          af: 'Het ons ’n vaste weeklikse vergadering met ’n agenda en notules? Notules maak meer saak as wat jy dink wanneer daar ’n dispuut is.',
        },
        help: {
          en: 'Fifteen minutes with a fixed agenda — jobs stuck, quotes out, debtors over 30 days, cash for the next two weeks — beats two hours of catching up. Write short minutes. They are also the record of what was decided, which is exactly what you will want if a decision is ever disputed, and what a court or an accountant will ask for.',
          af: 'Vyftien minute met ’n vaste agenda — werke wat vashaak, kwotasies uit, skuldenaars ouer as 30 dae, kontant vir die volgende twee weke — is beter as twee uur se inhaal. Skryf kort notules. Dit is ook die rekord van wat besluit is, wat presies is wat julle wil hê as ’n besluit ooit betwis word, en wat ’n hof of ’n rekenmeester sal vra.',
        },
      },
    ],
  },
  {
    letter: 'D',
    title: {
      en: 'Ownership and equity',
      af: 'Eienaarskap en aandele',
    },
    questions: [
      {
        id: 'D28',
        n: 28,
        text: {
          en: 'What is the shareholding split, and precisely what is it based on — cash, hours, existing client base, the software, the trade registration?',
          af: 'Wat is die aandeelhoudingsverdeling, en presies waarop is dit gebaseer — kontant, ure, bestaande kliëntebasis, die sagteware, die vakregistrasie?',
        },
        help: {
          en: 'Do not start with the number; start with the list of what each of you brings and what it is worth. Then the split is a conclusion instead of a negotiation, and it survives being questioned in two years. Write the reasoning into the shareholders’ agreement, not just the percentage.',
          af: 'Moenie by die syfer begin nie; begin by die lys van wat elkeen van julle inbring en wat dit werd is. Dan is die verdeling ’n gevolgtrekking in plaas van ’n onderhandeling, en dit hou stand as dit oor twee jaar bevraagteken word. Skryf die redenasie in die aandeelhouersooreenkoms in, nie net die persentasie nie.',
        },
        settleFirst: true,
      },
      {
        id: 'D29',
        n: 29,
        text: {
          en: 'If it is 50/50: how do we break a deadlock? A 50/50 company with no deadlock mechanism can be forced into deregistration by one angry shareholder.',
          af: 'As dit 50/50 is: hoe breek ons ’n dooiepunt? ’n 50/50-maatskappy sonder ’n dooiepuntmeganisme kan deur een kwaad aandeelhouer tot deregistrasie gedwing word.',
        },
        help: {
          en: '50/50 is fair and it is also structurally unstable: with no tiebreaker, one person who stops agreeing can stop everything. The usual answers are an independent third director with a casting vote, a fixed escalation to mediation then arbitration, or a shoot-out clause. Any of them is fine. None of them is not.',
          af: '50/50 is billik en dit is ook struktureel onstabiel: sonder ’n breker kan een persoon wat ophou saamstem, alles stop. Die gewone antwoorde is ’n onafhanklike derde direkteur met ’n beslissende stem, ’n vaste eskalasie na bemiddeling en dan arbitrasie, of ’n “shoot-out”-klousule. Enigeen daarvan is reg. Geeneen is nie.',
        },
        settleFirst: true,
      },
      {
        id: 'D30',
        n: 30,
        text: {
          en: 'Does equity vest over time? If one of us walks in month four, do they keep half the company?',
          af: 'Vestig aandele oor tyd? As een van ons in maand vier loop, hou hy die helfte van die maatskappy?',
        },
        help: {
          en: 'Vesting means you earn your shares by staying, usually over three or four years. Without it, someone who leaves after a few months keeps a permanent claim on everything the other builds for the next decade. This is the clause people are most embarrassed to raise and most grateful to have.',
          af: 'Vestiging beteken jy verdien jou aandele deur te bly, gewoonlik oor drie of vier jaar. Sonder dit hou iemand wat ná ’n paar maande loop, ’n permanente aanspraak op alles wat die ander die volgende dekade bou. Dit is die klousule wat mense die meeste skaam kry om op te haal en die dankbaarste is om te hê.',
        },
        settleFirst: true,
      },
      {
        id: 'D31',
        n: 31,
        text: {
          en: 'If we vest: over how many years, with what cliff, and what counts as leaving “good” versus “bad”?',
          af: 'As ons vestig: oor hoeveel jaar, met watter “cliff”, en wat tel as “goeie” teenoor “slegte” uittrede?',
        },
        help: {
          en: 'A typical shape is four years with a one-year cliff: nothing vests in year one, then it accrues monthly. A good leaver (illness, agreed exit) keeps what has vested; a bad leaver (dishonesty, competing) can be bought out at a discount. Define those two categories precisely, because the whole clause turns on which one applies.',
          af: '’n Tipiese vorm is vier jaar met ’n een-jaar-“cliff”: niks vestig in jaar een nie, daarna loop dit maandeliks op. ’n Goeie vertrekker (siekte, ooreengekome uittrede) hou wat gevestig het; ’n slegte vertrekker (oneerlikheid, kompetisie) kan teen ’n afslag uitgekoop word. Omskryf daardie twee kategorieë presies, want die hele klousule draai om watter een geld.',
        },
      },
      {
        id: 'D32',
        n: 32,
        text: {
          en: 'Can either of us sell or pledge shares to an outsider? Does the other get first refusal, and at what price?',
          af: 'Mag enigeen van ons aandele aan ’n buitestander verkoop of verpand? Kry die ander eerste keuse, en teen watter prys?',
        },
        help: {
          en: 'Without a pre-emption clause you can wake up in business with your partner’s brother-in-law, or with a bank that took the shares as security. Standard protection is: offer them to the other shareholder first, at a price set by the agreed valuation formula, before anyone outside is approached.',
          af: 'Sonder ’n voorkoopklousule kan jy wakker word in besigheid saam met jou vennoot se swaer, of saam met ’n bank wat die aandele as sekuriteit gevat het. Standaardbeskerming is: bied dit eers aan die ander aandeelhouer aan, teen ’n prys wat deur die ooreengekome waardasieformule bepaal word, voordat enigiemand buite genader word.',
        },
      },
      {
        id: 'D33',
        n: 33,
        text: {
          en: 'If a third person joins later — the admin or the bookkeeper earning their way in — where does their equity come from? Both of us equally?',
          af: 'As ’n derde persoon later aansluit — die admin- of boekhoupersoon wat hulle pad inverdien — waarvandaan kom hulle aandele? Van ons albei gelyk?',
        },
        help: {
          en: 'New shares dilute existing shareholders, and if that dilution is not shared equally it changes the balance between the two of you. Agree the principle now — usually pro rata from both — and agree a ceiling on how much of the company can ever be given to staff.',
          af: 'Nuwe aandele verwater bestaande aandeelhouers, en as daardie verwatering nie gelyk gedeel word nie, verander dit die balans tussen julle twee. Stem nou die beginsel — gewoonlik pro rata van albei — en stem ’n plafon op hoeveel van die maatskappy ooit aan personeel gegee kan word.',
        },
      },
      {
        id: 'D34',
        n: 34,
        text: {
          en: 'How do we value the company when we need a number? Agree a formula now (a multiple of maintainable profit, plus net assets) rather than arguing about it in a crisis.',
          af: 'Hoe waardeer ons die maatskappy wanneer ons ’n syfer nodig het? Stem nou ’n formule ooreen (’n veelvoud van volhoubare wins, plus netto bates) eerder as om daaroor te stry in ’n krisis.',
        },
        help: {
          en: 'Every serious clause in the agreement — vesting, buy-outs, death, the third party joining — needs a price, and every one of those moments is a bad time to invent one. A simple written formula, applied to the last audited or reviewed figures, removes the single biggest source of partnership litigation.',
          af: 'Elke ernstige klousule in die ooreenkoms — vestiging, uitkope, dood, die derde party wat aansluit — het ’n prys nodig, en elkeen van daardie oomblikke is ’n slegte tyd om een uit te dink. ’n Eenvoudige geskrewe formule, toegepas op die laaste geouditeerde of hersiene syfers, verwyder die grootste enkele bron van vennootskapslitigasie.',
        },
        settleFirst: true,
      },
      {
        id: 'D35',
        n: 35,
        text: {
          en: 'Who are the directors, and are directors and shareholders the same two people? Do we want an independent third director as a tiebreaker?',
          af: 'Wie is die direkteure, en is direkteure en aandeelhouers dieselfde twee mense? Wil ons ’n onafhanklike derde direkteur as breker hê?',
        },
        help: {
          en: 'Shareholders own the company; directors run it and carry personal legal duties for how it is run. In a two-person company they are usually the same people, but keeping the roles distinct in your minds matters — especially for question 58, where director liability is personal.',
          af: 'Aandeelhouers besit die maatskappy; direkteure bestuur dit en dra persoonlike regspligte vir hoe dit bestuur word. In ’n twee-mens-maatskappy is dit gewoonlik dieselfde mense, maar om die rolle in julle koppe uitmekaar te hou, maak saak — veral vir vraag 58, waar direkteursaanspreeklikheid persoonlik is.',
        },
      },
      {
        id: 'D36',
        n: 36,
        text: {
          en: 'Does either of us have a spouse married in community of property? If so, that spouse has a legal interest in the shares — has that been dealt with?',
          af: 'Is enigeen van ons binne gemeenskap van goedere getroud? Indien wel, het daardie eggenoot ’n regsbelang in die aandele — is dit hanteer?',
        },
        help: {
          en: 'In community of property, your spouse effectively co-owns your shares and their written consent can be required for certain transactions — and a divorce puts half of your stake in play. Check your marital regime, tell your attorney, and get the necessary spousal consents signed at the same time as the shareholders’ agreement.',
          af: 'Binne gemeenskap van goedere besit jou eggenoot in effek jou aandele saam met jou, en hulle geskrewe toestemming kan vir sekere transaksies nodig wees — en ’n egskeiding sit die helfte van jou belang op die spel. Gaan julle huweliksbedeling na, sê dit vir julle prokureur, en kry die nodige eggenoot-toestemmings gelyktydig met die aandeelhouersooreenkoms geteken.',
        },
      },
    ],
  },
  {
    letter: 'E',
    title: {
      en: 'Decisions and deadlock',
      af: 'Besluite en dooiepunte',
    },
    questions: [
      {
        id: 'E37',
        n: 37,
        text: {
          en: 'List the decisions that need both of us: hiring, firing, borrowing, buying a vehicle, signing a contract over R X, changing pricing, taking on a job over R Y.',
          af: 'Lys die besluite wat ons albei verg: aanstel, afdank, leen, ’n voertuig koop, ’n kontrak bo R X teken, pryse verander, ’n werk bo R Y aanvaar.',
        },
        help: {
          en: 'These are the “reserved matters” your attorney will ask for. Keep the list short and specific, with rand thresholds rather than vague words like “major”. Everything not on the list is, by definition, a decision one of you can take alone — which is the point of question 38.',
          af: 'Dit is die “voorbehoude aangeleenthede” waarvoor julle prokureur gaan vra. Hou die lys kort en spesifiek, met randdrempels eerder as vae woorde soos “groot”. Alles wat nie op die lys is nie, is per definisie ’n besluit wat een van julle alleen kan neem — wat die punt van vraag 38 is.',
        },
      },
      {
        id: 'E38',
        n: 38,
        text: {
          en: 'Which decisions does each of us make alone, without consulting? Be generous here — a partnership where nothing moves without two signatures dies of friction.',
          af: 'Watter besluite neem elkeen van ons alleen, sonder om te raadpleeg? Wees hier vrygewig — ’n vennootskap waar niks sonder twee handtekeninge beweeg nie, sterf aan wrywing.',
        },
        help: {
          en: 'Autonomy is what makes a partnership faster than a solo business rather than slower. Deliberately hand each other the authority to run your own lane, and mean it — second-guessing a decision that was properly inside the other’s lane is the behaviour that erodes trust fastest.',
          af: 'Outonomie is wat ’n vennootskap vinniger as ’n eenman-besigheid maak eerder as stadiger. Gee mekaar doelbewus die gesag om julle eie baan te bestuur, en meen dit — om ’n besluit wat behoorlik binne die ander se baan was te bevraagteken, is die gedrag wat vertroue die vinnigste afbreek.',
        },
      },
      {
        id: 'E39',
        n: 39,
        text: {
          en: 'If we deadlock on something material, what happens? Mediation first, then arbitration? A shoot-out clause where one names a price and the other chooses to buy or sell at it?',
          af: 'As ons oor iets wesenliks ’n dooiepunt bereik, wat gebeur dan? Eers bemiddeling, dan arbitrasie? ’n “Shoot-out”-klousule waar die een ’n prys noem en die ander kies om te koop of te verkoop teen daardie prys?',
        },
        help: {
          en: 'A shoot-out is elegant because it keeps everyone honest: whoever names the price must be willing to be on either side of it. Mediation then arbitration is slower but cheaper and less final. Choose one and write it in — the point is that a deadlock has a route out that neither of you has to invent while angry.',
          af: '’n “Shoot-out” is elegant omdat dit almal eerlik hou: wie ook al die prys noem, moet bereid wees om aan enige kant daarvan te staan. Bemiddeling en dan arbitrasie is stadiger maar goedkoper en minder finaal. Kies een en skryf dit in — die punt is dat ’n dooiepunt ’n uitweg het wat nie een van julle kwaad hoef uit te dink nie.',
        },
      },
      {
        id: 'E40',
        n: 40,
        text: {
          en: 'Who has the final word on turning down a customer or a job?',
          af: 'Wie het die finale sê oor die weiering van ’n kliënt of ’n werk?',
        },
        help: {
          en: 'Saying no to work is harder than saying yes, and it is where a business protects its margin and its sanity. Usually this sits with whoever owns pricing and the customer relationship, but the installer needs an absolute veto on work that cannot be done safely or compliantly.',
          af: 'Om nee te sê vir werk is moeiliker as om ja te sê, en dit is waar ’n besigheid sy winsgrens en sy verstand beskerm. Gewoonlik lê dit by die een wat pryse en die kliënteverhouding besit, maar die installeerder het ’n absolute veto nodig oor werk wat nie veilig of voldoenend gedoen kan word nie.',
        },
      },
      {
        id: 'E41',
        n: 41,
        text: {
          en: 'Who has the final word on technical method and safety on site — and is that unconditional?',
          af: 'Wie het die finale sê oor tegniese metode en veiligheid op die perseel — en is dit onvoorwaardelik?',
        },
        help: {
          en: 'The answer must be unconditional, and it must belong to the person carrying the registration and signing the certificate. Commercial pressure cannot be allowed to overrule a technical or safety call, ever, and the reason is that the consequences of getting it wrong are personal and criminal, not commercial.',
          af: 'Die antwoord moet onvoorwaardelik wees, en dit moet behoort aan die persoon wat die registrasie dra en die sertifikaat teken. Kommersiële druk mag nooit ’n tegniese of veiligheidsbesluit oorheers nie, en die rede is dat die gevolge van ’n fout persoonlik en krimineel is, nie kommersieel nie.',
        },
      },
      {
        id: 'E42',
        n: 42,
        text: {
          en: 'Who has the final word on price, discount and payment terms?',
          af: 'Wie het die finale sê oor prys, afslag en betaalvoorwaardes?',
        },
        help: {
          en: 'Discount authority is where margin quietly leaks. Give it to one person, set a maximum discount they may grant alone, and require the other’s agreement beyond that. Also decide who may agree to extended payment terms, because that is a cash-flow decision disguised as a sales one.',
          af: 'Afslagbevoegdheid is waar winsgrens stilweg weglek. Gee dit aan een persoon, stel ’n maksimum afslag wat hy alleen mag toestaan, en vereis die ander se instemming daarbo. Besluit ook wie verlengde betaalvoorwaardes mag toestaan, want dit is ’n kontantvloeibesluit wat as ’n verkoopsbesluit vermom is.',
        },
      },
      {
        id: 'E43',
        n: 43,
        text: {
          en: 'If one of us commits the company to something outside their lane, is the company bound? What do we do about it?',
          af: 'As een van ons die maatskappy verbind tot iets buite sy baan, is die maatskappy gebonde? Wat doen ons daaraan?',
        },
        help: {
          en: 'Legally, a director who appears to have authority usually binds the company even if he broke an internal rule — the customer is entitled to rely on it. So the remedy is internal, not external: agree what happens between the two of you when it occurs, and make sure your customer terms state who may sign on the company’s behalf.',
          af: 'Regtens bind ’n direkteur wat lyk of hy gesag het, gewoonlik die maatskappy, selfs al het hy ’n interne reël gebreek — die kliënt is geregtig om daarop staat te maak. Die remedie is dus intern, nie ekstern nie: stem ooreen wat tussen julle twee gebeur wanneer dit plaasvind, en maak seker julle kliëntevoorwaardes sê wie namens die maatskappy mag teken.',
        },
      },
    ],
  },
  {
    letter: 'F',
    title: {
      en: 'The existing business, the brand and the software',
      af: 'Die bestaande besigheid, die handelsmerk en die sagteware',
    },
    note: {
      en: 'This group is specific to you, and it is the one an off-the-shelf agreement will not cover. Haberl Electrical & Solar already exists, with a brand, a client base, and a substantial platform you built.',
      af: 'Hierdie groep is spesifiek vir julle, en dit is die een wat ’n standaardooreenkoms nie sal dek nie. Haberl Electrical & Solar bestaan reeds, met ’n handelsmerk, ’n kliëntebasis, en ’n aansienlike platform wat julle gebou het.',
    },
    questions: [
      {
        id: 'F44',
        n: 44,
        text: {
          en: 'Is the new company a rename of the existing business, or a genuinely new entity trading alongside it?',
          af: 'Is die nuwe maatskappy ’n hernoeming van die bestaande besigheid, of ’n werklik nuwe entiteit wat langs dit handel dryf?',
        },
        help: {
          en: 'These are very different things. A rename carries the existing history, customers and liabilities across — including any warranty obligations on work already done. A new entity starts clean but has to be given anything it needs from the old one, deliberately and at a value. Decide which, because everything in this group follows from it.',
          af: 'Dit is baie verskillende dinge. ’n Hernoeming dra die bestaande geskiedenis, kliënte en laste oor — insluitend enige waarborgverpligtinge op werk wat reeds gedoen is. ’n Nuwe entiteit begin skoon, maar moet doelbewus en teen ’n waarde gegee word wat dit ook al van die ou een nodig het. Besluit watter een, want alles in hierdie groep volg daaruit.',
        },
        settleFirst: true,
      },
      {
        id: 'F45',
        n: 45,
        text: {
          en: 'If it is new: do the existing customers, the site traffic, the leads and the name transfer in? At what value, and does that buy Matthew equity?',
          af: 'As dit nuut is: gaan die bestaande kliënte, die webwerfverkeer, die leidrade en die naam oor? Teen watter waarde, en koop dit vir Matthew aandele?',
        },
        help: {
          en: 'An existing customer base and a website that already ranks are real, saleable assets, and handing them to a new jointly-owned company is a contribution exactly like cash. Put a value on it, say whether it is sold to the company, licensed, or contributed for shares, and record it. Doing this badly is the most likely source of a future argument about who really built what.',
          af: '’n Bestaande kliëntebasis en ’n webwerf wat reeds rangskik, is werklike, verkoopbare bates, en om dit aan ’n nuwe gesamentlik-besitte maatskappy te gee, is ’n bydrae presies soos kontant. Sit ’n waarde daarop, sê of dit aan die maatskappy verkoop, gelisensieer, of vir aandele bygedra word, en teken dit aan. Om dit sleg te doen, is die waarskynlikste bron van ’n toekomstige rusie oor wie werklik wat gebou het.',
        },
        settleFirst: true,
      },
      {
        id: 'F46',
        n: 46,
        text: {
          en: 'Who owns the platform — the quoting engine, the job pipeline, the monitoring, the finance module? Is it contributed to the company, or licensed to it by Matthew personally?',
          af: 'Wie besit die platform — die kwotasie-enjin, die werkstroom, die monitering, die finansiesmodule? Word dit aan die maatskappy bygedra, of persoonlik deur Matthew daaraan gelisensieer?',
        },
        help: {
          en: 'Software written by one founder is the classic unresolved asset. Contributing it means the company owns it outright and Matthew gets shares or value for it; licensing means he keeps it and the company pays for use, which protects him but leaves the company dependent on a licence it does not control. Either is fine. Silence is not, because by default the position is unclear and both of you will assume it went your way.',
          af: 'Sagteware wat deur een stigter geskryf is, is die klassieke onopgeloste bate. Om dit by te dra, beteken die maatskappy besit dit heeltemal en Matthew kry aandele of waarde daarvoor; om dit te lisensieer, beteken hy hou dit en die maatskappy betaal vir gebruik, wat hom beskerm maar die maatskappy afhanklik laat van ’n lisensie wat dit nie beheer nie. Enigeen is reg. Stilte is nie, want by verstek is die posisie onduidelik en albei van julle gaan aanneem dit het julle kant toe geval.',
        },
        settleFirst: true,
      },
      {
        id: 'F47',
        n: 47,
        text: {
          en: 'If the partnership ends, who walks away with the code and the customer data in it? Write this down before a single line of shared data goes in.',
          af: 'As die vennootskap eindig, wie loop weg met die kode en die kliëntedata daarin? Skryf dit neer voordat een enkele reël gedeelde data ingaan.',
        },
        help: {
          en: 'Code ownership and data ownership are separate questions, and the data is often the more valuable one. Decide now who keeps the customer records, who may keep using the software, and whether the departing party gets an export. POPIA also has something to say about moving customer data between entities, so involve your attorney.',
          af: 'Kode-eienaarskap en data-eienaarskap is aparte vrae, en die data is dikwels die waardevoller een. Besluit nou wie die kliënterekords hou, wie die sagteware mag aanhou gebruik, en of die vertrekkende party ’n uitvoer kry. POPIA het ook iets te sê oor die skuif van kliëntedata tussen entiteite, so betrek julle prokureur.',
        },
      },
      {
        id: 'F48',
        n: 48,
        text: {
          en: 'Who owns the domain, the Google Business Profile, the social accounts, the mobile numbers, and the SARS/CIPC login credentials? Not “we do” — name a person and a recovery method for each.',
          af: 'Wie besit die domein, die Google Business Profile, die sosiale rekeninge, die selnommers, en die SARS/CIPC-aanteken-besonderhede? Nie “ons” nie — noem ’n persoon en ’n herstelmetode vir elkeen.',
        },
        help: {
          en: 'Every one of these is registered to a person and recovers to a phone number or email, and if that person is unavailable — or unhappy — the business loses access to itself. Make a list, put them in company-controlled accounts where possible, and make sure at least two of you can recover each one.',
          af: 'Elkeen hiervan is by ’n persoon geregistreer en herstel na ’n selnommer of e-pos, en as daardie persoon onbeskikbaar — of ongelukkig — is, verloor die besigheid toegang tot homself. Maak ’n lys, sit hulle waar moontlik in maatskappy-beheerde rekeninge, en maak seker minstens twee van julle kan elkeen herstel.',
        },
      },
      {
        id: 'F49',
        n: 49,
        text: {
          en: 'Is Matthew’s continued development of the platform part of his job, or a separate service the company pays for? What happens to it when his role changes?',
          af: 'Is Matthew se voortgesette ontwikkeling van die platform deel van sy werk, of ’n aparte diens waarvoor die maatskappy betaal? Wat gebeur daarmee wanneer sy rol verander?',
        },
        help: {
          en: 'Development takes real hours that are not spent quoting or on site, and if that is invisible it becomes a grievance. Decide whether it is inside his role — in which case say roughly how much time it may take — or a paid service with its own budget. Also plan for the day he stops: who maintains it then?',
          af: 'Ontwikkeling neem werklike ure wat nie aan kwotasies of perseelwerk bestee word nie, en as dit onsigbaar is, word dit ’n grief. Besluit of dit binne sy rol val — en sê dan ruweg hoeveel tyd dit mag neem — of ’n betaalde diens met sy eie begroting is. Beplan ook vir die dag wanneer hy ophou: wie onderhou dit dan?',
        },
      },
      {
        id: 'F50',
        n: 50,
        text: {
          en: 'Does Zacques have any pre-existing customers, work in progress, or warranty obligations coming with him? Do those liabilities become the company’s?',
          af: 'Bring Zacques enige bestaande kliënte, werk in wording, of waarborgverpligtinge saam? Word daardie laste die maatskappy s’n?',
        },
        help: {
          en: 'Work done before the company existed carries a warranty tail, and if a customer calls back in eighteen months they will call the new company. Decide whether the company takes on that obligation — and if it does, whether it is compensated for it. The same applies in reverse to Haberl’s existing completed jobs.',
          af: 'Werk wat gedoen is voordat die maatskappy bestaan het, dra ’n waarborgstert, en as ’n kliënt oor agtien maande terugbel, gaan hulle die nuwe maatskappy bel. Besluit of die maatskappy daardie verpligting oorneem — en indien wel, of dit daarvoor vergoed word. Dieselfde geld andersom vir Haberl se bestaande voltooide werke.',
        },
      },
      {
        id: 'F51',
        n: 51,
        text: {
          en: 'Does the trade name need a trade mark application, given you are putting a family surname on a business with a co-owner?',
          af: 'Het die handelsnaam ’n handelsmerkaansoek nodig, gegewe dat julle ’n familievan op ’n besigheid met ’n mede-eienaar sit?',
        },
        help: {
          en: 'A surname on a jointly-owned business raises an obvious question: if the partnership ends, who keeps the name? Registering the mark in the company’s name settles ownership formally, and the shareholders’ agreement should say what happens to it on a split — including whether the family can carry on trading under it.',
          af: '’n Van op ’n gesamentlik-besitte besigheid laat ’n voor die hand liggende vraag ontstaan: as die vennootskap eindig, wie hou die naam? Om die merk in die maatskappy se naam te registreer, vestig eienaarskap formeel, en die aandeelhouersooreenkoms moet sê wat daarmee gebeur by ’n skeuring — insluitend of die familie daaronder mag aanhou handel dryf.',
        },
      },
    ],
  },
  {
    letter: 'G',
    title: {
      en: 'Registration, the CoC signature and liability',
      af: 'Registrasie, die CoC-handtekening en aanspreeklikheid',
    },
    note: {
      en: 'This is the group that is specific to electrical. Your right to trade rests on one person’s personal registration, and the person who signs a Certificate of Compliance carries that signature personally.',
      af: 'Dit is die groep wat spesifiek vir elektries is. Julle reg om handel te dryf berus op een persoon se persoonlike registrasie, en die persoon wat ’n Sertifikaat van Voldoening (CoC) teken, dra daardie handtekening persoonlik.',
    },
    questions: [
      {
        id: 'G52',
        n: 52,
        text: {
          en: 'Which of us is the registered person — Installation Electrician, Master Installation Electrician, or single-phase tester — and whose registration does the company’s electrical contractor registration depend on?',
          af: 'Wie van ons is die geregistreerde persoon — Installasie-elektrisiën, Meester-installasie-elektrisiën, of enkelfase-toetser — en op wie se registrasie berus die maatskappy se elektriese kontrakteursregistrasie?',
        },
        help: {
          en: 'The company cannot register as an electrical contractor without employing a registered person, and that registration belongs to the individual, not the business. Be explicit about whose it is, what grade it is, and when it expires — this single fact underpins your entire right to trade.',
          af: 'Die maatskappy kan nie as elektriese kontrakteur registreer sonder om ’n geregistreerde persoon in diens te hê nie, en daardie registrasie behoort aan die individu, nie die besigheid nie. Wees uitdruklik oor wie s’n dit is, watter graad dit is, en wanneer dit verval — hierdie enkele feit onderlê julle hele reg om handel te dryf.',
        },
        settleFirst: true,
      },
      {
        id: 'G53',
        n: 53,
        text: {
          en: 'If that person leaves, is suspended, or dies, the company cannot lawfully issue a CoC. What is the contingency, and how fast can we get a second registered person?',
          af: 'As daardie persoon bedank, geskors word, of sterf, kan die maatskappy nie wettig ’n CoC uitreik nie. Wat is die gebeurlikheidsplan, en hoe vinnig kan ons ’n tweede geregistreerde persoon kry?',
        },
        help: {
          en: 'This is the biggest structural risk in the business and it is almost never planned for. Work out what the company does the next morning: is there a second registered person, a standing arrangement with another contractor, or nothing? Then decide whether getting a second registration — or funding the other partner’s qualification — is a priority rather than a someday.',
          af: 'Dit is die grootste strukturele risiko in die besigheid en daar word byna nooit vir beplan nie. Werk uit wat die maatskappy die volgende oggend doen: is daar ’n tweede geregistreerde persoon, ’n staande reëling met ’n ander kontrakteur, of niks? Besluit dan of ’n tweede registrasie — of om die ander vennoot se kwalifikasie te finansier — ’n prioriteit is eerder as ’n eendag-ding.',
        },
        settleFirst: true,
      },
      {
        id: 'G54',
        n: 54,
        text: {
          en: 'Who signs CoCs, and under what conditions may they refuse? Is a refusal to sign ever overridable by the other partner?',
          af: 'Wie teken CoC’s, en onder watter omstandighede mag hulle weier? Kan ’n weiering om te teken ooit deur die ander vennoot oorheers word?',
        },
        note: {
          en: 'The answer must be no, and it must be in writing.',
          af: 'Die antwoord moet nee wees, en dit moet op skrif wees.',
        },
        help: {
          en: 'The signature is personal: the registered person carries it, not the company and not the shareholding. Put in writing that a refusal to sign is final and cannot be overruled by a co-owner, a deadline or a customer. This clause protects the person signing from the commercial pressure that will absolutely arrive one day.',
          af: 'Die handtekening is persoonlik: die geregistreerde persoon dra dit, nie die maatskappy en nie die aandeelhouding nie. Sit op skrif dat ’n weiering om te teken finaal is en nie deur ’n mede-eienaar, ’n sperdatum of ’n kliënt oorheers kan word nie. Hierdie klousule beskerm die persoon wat teken teen die kommersiële druk wat beslis eendag gaan opdaag.',
        },
      },
      {
        id: 'G55',
        n: 55,
        text: {
          en: 'If work has to be redone at our cost to get a signature, whose budget takes the hit — the installation side or the company?',
          af: 'As werk teen ons eie koste oorgedoen moet word om ’n handtekening te kry, wie se begroting dra die slag — die installasiekant of die maatskappy?',
        },
        help: {
          en: 'If rework always comes off the company, nobody feels it; if it always comes off the installer, he is punished for being honest about a defect. Most workable answer: rework is a company cost, tracked visibly per job, and reviewed in the weekly meeting so a pattern gets fixed rather than argued about.',
          af: 'As oordoen altyd van die maatskappy afkom, voel niemand dit nie; as dit altyd van die installeerder afkom, word hy gestraf omdat hy eerlik was oor ’n fout. Die werkbaarste antwoord: oordoen is ’n maatskappykoste, sigbaar per werk gevolg, en in die weeklikse vergadering hersien sodat ’n patroon reggemaak word in plaas van bespreek.',
        },
      },
      {
        id: 'G56',
        n: 56,
        text: {
          en: 'Do we ever issue a CoC on work we did not do or fully inspect? Agree the answer once, now, out loud.',
          af: 'Reik ons ooit ’n CoC uit op werk wat ons nie gedoen of volledig geïnspekteer het nie? Stem die antwoord een keer ooreen, nou, hardop.',
        },
        help: {
          en: 'There is only one safe answer, and the reason to say it out loud now is that the request will come from a friend, a builder you want more work from, or an estate agent under deadline. Deciding it in the abstract is easy; deciding it at 4pm on a Friday with a transfer pending is not.',
          af: 'Daar is net een veilige antwoord, en die rede om dit nou hardop te sê, is dat die versoek gaan kom van ’n vriend, ’n bouer by wie julle meer werk wil kry, of ’n eiendomsagent met ’n sperdatum. Om dit in die abstrakte te besluit is maklik; om dit 16:00 op ’n Vrydag met ’n oordrag hangende te besluit, is nie.',
        },
      },
      {
        id: 'G57',
        n: 57,
        text: {
          en: 'What is our position on a customer who wants it cheaper by leaving something non-compliant? Who is allowed to say yes? (Nobody.)',
          af: 'Wat is ons standpunt oor ’n kliënt wat dit goedkoper wil hê deur iets nie-voldoenend te los? Wie mag ja sê? (Niemand nie.)',
        },
        help: {
          en: 'Agreeing this once means neither of you has to be the difficult one in the moment — you can both point at a company position instead of a personal opinion. It is also worth agreeing how you say no: offering a compliant reduced scope usually saves the job where a flat refusal loses it.',
          af: 'Om dit een keer ooreen te kom, beteken nie een van julle hoef in die oomblik die moeilike ou te wees nie — julle kan albei na ’n maatskappystandpunt wys in plaas van ’n persoonlike mening. Dit is ook die moeite werd om ooreen te kom hóé julle nee sê: om ’n voldoenende, verminderde omvang aan te bied, red gewoonlik die werk waar ’n plat weiering dit verloor.',
        },
      },
      {
        id: 'G58',
        n: 58,
        text: {
          en: 'If someone is seriously injured or killed on one of our sites, what happens to each of us personally — and are we both clear on directors’ liability under the OHS Act and the Companies Act?',
          af: 'As iemand ernstig beseer of dood is op een van ons persele, wat gebeur met elkeen van ons persoonlik — en is ons albei duidelik oor direkteursaanspreeklikheid ingevolge die BGV-wet en die Maatskappywet?',
        },
        help: {
          en: 'This is the question people avoid, and it is the one where a (Pty) Ltd does not protect you: safety duties attach to directors personally and can be criminal. Understand what your appointments, risk assessments and records actually have to look like, because the file you keep beforehand is the whole of your defence afterwards.',
          af: 'Dit is die vraag wat mense vermy, en dit is die een waar ’n (Edms) Bpk jou nie beskerm nie: veiligheidspligte kleef persoonlik aan direkteure en kan krimineel wees. Verstaan hoe julle aanstellings, risiko-assesserings en rekords werklik moet lyk, want die lêer wat julle vooraf hou, is die hele verweer daarna.',
        },
        settleFirst: true,
      },
      {
        id: 'G59',
        n: 59,
        text: {
          en: 'Who is the appointed responsible person for health and safety, who does the site risk assessments, and who keeps the H&S file?',
          af: 'Wie is die aangestelde verantwoordelike persoon vir gesondheid en veiligheid, wie doen die perseel-risiko-assesserings, en wie hou die G&V-lêer?',
        },
        help: {
          en: 'These are formal appointments in writing, not an understanding. Name the person, sign the appointment letter, and decide who physically maintains the file per job — induction records, toolbox talks, PPE issue, incident register. On roof-mounted PV this includes a fall protection plan.',
          af: 'Dit is formele aanstellings op skrif, nie ’n verstandhouding nie. Noem die persoon, teken die aanstellingsbrief, en besluit wie fisies die lêer per werk onderhou — induksierekords, gereedskapkis-praatjies, PBM-uitreiking, voorvalregister. By dak-gemonteerde PV sluit dit ’n valbeskermingsplan in.',
        },
      },
      {
        id: 'G60',
        n: 60,
        text: {
          en: 'What insurance are we carrying from day one, and what is the excess we can actually afford to pay?',
          af: 'Watter versekering dra ons van dag een af, en wat is die eie risiko wat ons werklik kan bekostig om te betaal?',
        },
        help: {
          en: 'Cover you cannot claim on is not cover. Check the public liability limit against what your commercial customers demand for site access, and check the excess against your actual bank balance — a R50 000 excess on a business with R20 000 in the bank is an uninsured business.',
          af: 'Dekking waarop jy nie kan eis nie, is nie dekking nie. Kyk na die openbare aanspreeklikheidslimiet teenoor wat julle kommersiële kliënte vir perseeltoegang vereis, en kyk na die eie risiko teenoor julle werklike bankbalans — ’n eie risiko van R50 000 op ’n besigheid met R20 000 in die bank is ’n onversekerde besigheid.',
        },
      },
    ],
  },
  {
    letter: 'H',
    title: {
      en: 'The other two people',
      af: 'Die ander twee mense',
    },
    questions: [
      {
        id: 'H61',
        n: 61,
        text: {
          en: 'Are the admin and bookkeeping people employees, independent contractors, or future shareholders? Each has completely different tax, UIF and COIDA consequences.',
          af: 'Is die admin- en boekhoumense werknemers, onafhanklike kontrakteurs, of toekomstige aandeelhouers? Elkeen het heeltemal verskillende belasting-, WVF- en COIDA-gevolge.',
        },
        help: {
          en: 'Calling someone a contractor does not make them one — SARS looks at how the work is actually controlled, and getting it wrong means back-taxes and penalties on you. Decide the status honestly per person, and paper it properly: employment contract or a service agreement, never nothing.',
          af: 'Om iemand ’n kontrakteur te noem, maak hom nie een nie — SARS kyk hoe die werk werklik beheer word, en om dit verkeerd te hê, beteken agterstallige belasting en boetes op julle. Besluit die status eerlik per persoon, en dokumenteer dit behoorlik: ’n dienskontrak of ’n diensteooreenkoms, nooit niks nie.',
        },
        settleFirst: true,
      },
      {
        id: 'H62',
        n: 62,
        text: {
          en: 'Since both are competent across advertising, ordering and admin, who do they each report to — and what happens when both of us give them work in the same week?',
          af: 'Aangesien albei bekwaam is oor advertensies, bestellings en admin, aan wie rapporteer elkeen — en wat gebeur wanneer ons albei hulle in dieselfde week werk gee?',
        },
        help: {
          en: 'Flexible people with two bosses end up serving whoever asked most recently or most loudly, and then get blamed by the other. Give each of them one person who sets their priorities, even if both of you hand them tasks. Cross-cutting requests go through that person, not around them.',
          af: 'Buigsame mense met twee base bedien uiteindelik wie ook al laaste of hardste gevra het, en kry dan die skuld van die ander een. Gee elkeen van hulle een persoon wat hulle prioriteite stel, selfs al gee julle albei vir hulle take. Versoeke wat oorkruis loop, gaan deur daardie persoon, nie om hom nie.',
        },
      },
      {
        id: 'H63',
        n: 63,
        text: {
          en: 'Who can hire, and who can fire? Does it need both signatures?',
          af: 'Wie kan aanstel, en wie kan afdank? Verg dit albei se handtekeninge?',
        },
        help: {
          en: 'Dismissals in South Africa are procedurally strict and expensive to get wrong at the CCMA, so this is not only an ownership question. Require both signatures for hiring and dismissal, and agree that no dismissal happens without following the written disciplinary procedure, however obvious the case seems.',
          af: 'Ontslag in Suid-Afrika is prosedureel streng en duur om verkeerd te hê by die CCMA, so dit is nie net ’n eienaarskapsvraag nie. Vereis albei se handtekeninge vir aanstelling en ontslag, en stem saam dat geen ontslag plaasvind sonder om die geskrewe dissiplinêre prosedure te volg nie, hoe voor die hand liggend die saak ook al lyk.',
        },
      },
      {
        id: 'H64',
        n: 64,
        text: {
          en: 'Is anyone a family member or partner of either of us? What is the rule when their performance becomes a problem?',
          af: 'Is enigiemand ’n familielid of lewensmaat van een van ons? Wat is die reël wanneer hulle prestasie ’n probleem word?',
        },
        help: {
          en: 'Employing family is normal in a business this size and it works fine right up until it does not. Agree in advance that the same standards and the same disciplinary process apply, and agree who handles the conversation — it should not be the related partner.',
          af: 'Om familie in diens te neem, is normaal in ’n besigheid van hierdie grootte en dit werk goed tot op die punt waar dit nie meer werk nie. Stem vooraf saam dat dieselfde standaarde en dieselfde dissiplinêre proses geld, en stem ooreen wie die gesprek hanteer — dit moet nie die verwante vennoot wees nie.',
        },
      },
      {
        id: 'H65',
        n: 65,
        text: {
          en: 'Does the person doing the books have any authority to move money?',
          af: 'Het die persoon wat die boeke doen enige bevoegdheid om geld te skuif?',
        },
        note: {
          en: 'Whoever captures should not be able to pay.',
          af: 'Wie ook al vaslê, moet nie kan betaal nie.',
        },
        help: {
          en: 'This is the cheapest and most effective control in a small business: separate the person who captures invoices from the person who releases payments. It is not distrust — it removes the possibility of suspicion, and it is the first thing an accountant or insurer will look for.',
          af: 'Dit is die goedkoopste en doeltreffendste beheermaatreël in ’n klein besigheid: skei die persoon wat fakture vaslê van die persoon wat betalings vrystel. Dit is nie wantroue nie — dit verwyder die moontlikheid van verdenking, en dit is die eerste ding waarna ’n rekenmeester of versekeraar sal kyk.',
        },
      },
      {
        id: 'H66',
        n: 66,
        text: {
          en: 'What is our first apprentice/assistant plan, and do we fall inside the electrical bargaining council’s scope for wages and levies?',
          af: 'Wat is ons plan vir die eerste vakleerling/assistent, en val ons binne die elektriese bedingingsraad se bestek vir lone en heffings?',
        },
        help: {
          en: 'If your work falls inside the bargaining council’s registered scope, its minimum rates, levies and fund contributions are compulsory rather than optional, and back-levies are painful. Confirm your scope with the council before the first payslip, not after.',
          af: 'As julle werk binne die bedingingsraad se geregistreerde bestek val, is sy minimum tariewe, heffings en fondsbydraes verpligtend eerder as opsioneel, en agterstallige heffings is pynlik. Bevestig julle bestek by die raad vóór die eerste betaalstrokie, nie daarna nie.',
        },
      },
    ],
  },
  {
    letter: 'I',
    title: {
      en: 'Exit, death, divorce, disaster',
      af: 'Uittrede, dood, egskeiding, ramp',
    },
    questions: [
      {
        id: 'I67',
        n: 67,
        text: {
          en: 'If one of us dies, do the shares go to their spouse — who now co-owns an electrical company with the survivor? Or does a buy-and-sell agreement force a sale, funded by life cover?',
          af: 'As een van ons sterf, gaan die aandele na sy eggenoot — wat nou saam met die oorlewende ’n elektriese maatskappy besit? Of dwing ’n koop-en-verkoop-ooreenkoms ’n verkoop af, gefinansier deur lewensdekking?',
        },
        help: {
          en: 'Without a buy-and-sell agreement, shares pass under the will to someone who may know nothing about the trade and cannot be removed. The standard solution is a compulsory purchase at the agreed valuation, funded by life policies you each hold on the other, so the family gets cash and the survivor gets the company.',
          af: 'Sonder ’n koop-en-verkoop-ooreenkoms gaan aandele kragtens die testament oor aan iemand wat dalk niks van die bedryf weet nie en nie verwyder kan word nie. Die standaardoplossing is ’n verpligte koop teen die ooreengekome waardasie, gefinansier deur lewenspolisse wat julle elkeen op die ander hou, sodat die gesin kontant kry en die oorlewende die maatskappy kry.',
        },
        settleFirst: true,
      },
      {
        id: 'I68',
        n: 68,
        text: {
          en: 'If one of us is permanently disabled and can no longer climb a roof, what does the company owe them, for how long?',
          af: 'As een van ons permanent gestremd is en nie meer op ’n dak kan klim nie, wat skuld die maatskappy hom, en vir hoe lank?',
        },
        help: {
          en: 'In this trade disability is a realistic risk, and it is harder than death because the person is still there, still a shareholder, and no longer able to do their job. Decide how long the company keeps paying, whether the shares must be sold, and take disability cover to fund whatever you decide.',
          af: 'In hierdie bedryf is gestremdheid ’n realistiese risiko, en dit is moeiliker as dood omdat die persoon nog daar is, nog ’n aandeelhouer is, en nie meer sy werk kan doen nie. Besluit hoe lank die maatskappy aanhou betaal, of die aandele verkoop moet word, en neem gestremdheidsdekking om te finansier wat julle ook al besluit.',
        },
      },
      {
        id: 'I69',
        n: 69,
        text: {
          en: 'If one of us simply wants out in year two, what is the notice period, the valuation, and the payment terms — lump sum or instalments?',
          af: 'As een van ons eenvoudig in jaar twee wil uit, wat is die kennisgewingtydperk, die waardasie, en die betaalvoorwaardes — enkelbedrag of paaiemente?',
        },
        help: {
          en: 'A young business almost never has the cash to buy someone out in one payment, so instalments over two or three years are normal — but the terms must be set now, when neither of you knows who will be leaving. A long notice period also gives the remaining partner time to replace the capability.',
          af: '’n Jong besigheid het byna nooit die kontant om iemand met een betaling uit te koop nie, so paaiemente oor twee of drie jaar is normaal — maar die voorwaardes moet nou vasgestel word, terwyl nie een van julle weet wie gaan uittree nie. ’n Lang kennisgewingtydperk gee die oorblywende vennoot ook tyd om die vermoë te vervang.',
        },
      },
      {
        id: 'I70',
        n: 70,
        text: {
          en: 'What conduct lets the other buy you out at a discount — dishonesty, gross negligence, criminal conviction, sequestration, working for a competitor?',
          af: 'Watter gedrag laat die ander een jou teen ’n afslag uitkoop — oneerlikheid, growwe nalatigheid, kriminele skuldigbevinding, sekwestrasie, werk vir ’n mededinger?',
        },
        help: {
          en: 'This is the “bad leaver” list, and it is your protection against the worst-case partner behaviour. Keep it to serious, objectively provable conduct rather than vague standards like “bringing the company into disrepute”, which is impossible to apply without a fight.',
          af: 'Dit is die “slegte vertrekker”-lys, en dit is julle beskerming teen die ergste vennootgedrag. Hou dit by ernstige, objektief bewysbare gedrag eerder as vae standaarde soos “die maatskappy in oneer bring”, wat onmoontlik is om toe te pas sonder ’n bakleiery.',
        },
      },
      {
        id: 'I71',
        n: 71,
        text: {
          en: 'What restraint applies to a departing partner — how long, what area, what work? Keep it modest; an unreasonable restraint is unenforceable.',
          af: 'Watter handelsbeperking geld vir ’n vertrekkende vennoot — hoe lank, watter gebied, watter werk? Hou dit beskeie; ’n onredelike beperking is onafdwingbaar.',
        },
        help: {
          en: 'South African courts enforce restraints only so far as they protect a legitimate interest and are reasonable in time and area. A tight, modest restraint you can actually enforce beats a sweeping one a court will strike down. Think in terms of your real service area and a year or two, not the whole province forever.',
          af: 'Suid-Afrikaanse howe dwing beperkings slegs af sover dit ’n regmatige belang beskerm en redelik is in tyd en gebied. ’n Stywe, beskeie beperking wat julle werklik kan afdwing, is beter as ’n wye een wat ’n hof gaan neerslaan. Dink in terme van julle werklike diensgebied en ’n jaar of twee, nie die hele provinsie vir altyd nie.',
        },
      },
      {
        id: 'I72',
        n: 72,
        text: {
          en: 'On the way out, who keeps which customers, and who honours the outstanding guarantees on completed jobs?',
          af: 'Op pad uit, wie hou watter kliënte, en wie eer die uitstaande waarborge op voltooide werke?',
        },
        help: {
          en: 'Guarantees outlive partnerships. A customer with a five-year workmanship guarantee does not care that you split up, and if nobody is obliged to answer, your reputation pays for it. Decide who carries the tail, and whether the departing partner contributes to the cost of honouring it.',
          af: 'Waarborge oorleef vennootskappe. ’n Kliënt met ’n vyfjaar-vakmanskapwaarborg gee nie om dat julle uit mekaar is nie, en as niemand verplig is om te antwoord nie, betaal julle reputasie daarvoor. Besluit wie die stert dra, en of die vertrekkende vennoot bydra tot die koste om dit te eer.',
        },
      },
      {
        id: 'I73',
        n: 73,
        text: {
          en: 'At what point do we agree the business has failed — a number and a date, decided now while we are calm?',
          af: 'Op watter punt stem ons saam dat die besigheid misluk het — ’n bedrag en ’n datum, nou besluit terwyl ons kalm is?',
        },
        help: {
          en: 'Businesses rarely die cleanly; they get propped up past the point of sense because stopping feels like failure. A pre-agreed line — for example, if we are still below X turnover by date Y, or if we have put in more than R Z — turns that into a decision you already made rather than one you have to make while desperate.',
          af: 'Besighede sterf selde skoon; hulle word gestut verby die punt van sin omdat ophou soos mislukking voel. ’n Vooraf ooreengekome lyn — byvoorbeeld, as ons teen datum Y steeds onder X omset is, of as ons meer as R Z ingesit het — verander dit in ’n besluit wat julle reeds geneem het eerder as een wat julle desperaat moet neem.',
        },
      },
      {
        id: 'I74',
        n: 74,
        text: {
          en: 'If we wind it up, who pays the shortfall, in what proportion?',
          af: 'As ons dit ontbind, wie betaal die tekort, en in watter verhouding?',
        },
        help: {
          en: 'On a wind-up the company’s debts are settled from what is left, and anything you personally guaranteed comes back to you. Agree the proportion in which you share a shortfall — usually the shareholding ratio — and make sure it matches how the sureties were signed, because a surety does not care what your agreement says.',
          af: 'By ontbinding word die maatskappy se skulde uit die oorblyfsel vereffen, en enigiets wat julle persoonlik gewaarborg het, kom terug na julle toe. Stem die verhouding ooreen waarin julle ’n tekort deel — gewoonlik die aandeelhoudingsverhouding — en maak seker dit stem ooreen met hoe die borgstellings geteken is, want ’n borgstelling gee nie om wat julle ooreenkoms sê nie.',
        },
      },
    ],
  },
]

export const ALL_QUESTIONS: FounderQuestion[] = FOUNDER_GROUPS.flatMap((g) => g.questions)

export const QUESTION_COUNT = ALL_QUESTIONS.length

export const SETTLE_FIRST_COUNT = ALL_QUESTIONS.filter((q) => q.settleFirst).length

/** Pick a language out of a localised string, falling back to English. */
export function t(value: Localised | undefined, locale: Locale): string {
  if (!value) return ''
  return value[locale] || value.en
}

