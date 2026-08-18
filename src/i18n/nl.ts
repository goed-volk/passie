export const nl = {
  // App Header
  appName: "Passie",
  appTagline: "Seizoenkaarten delen met vrienden",

  // Fixture Header & Deadlines
  vs: "–",
  home: "Thuis",
  away: "Uit",
  deadlineLabel: "Aangeven vóór",
  deadlinePassed: "Aangeefdeadline verstreken",
  deadlinePassedBanner: "De deadline om je pas aan te geven is verstreken. Geef je pas zo snel mogelijk aan.",
  deadlineReminderTitle: "Laat weten of je gaat",
  deadlineReminderDesc: "Geef vóór {deadline} aan of je je seizoenkaart zelf gebruikt of vrijgeeft aan de groep.",
  deadlineRemaining: "nog",
  poolCancelled: "Wedstrijd afgelast of verplaatst",
  noFixturesFound: "Geen wedstrijden gevonden",
  noUpcomingHomeFixtures: "Er zijn momenteel geen geplande thuiswedstrijden.",
  poolLoadError: "Wedstrijd kon niet worden geladen",

  // Steps
  step1Title: "Stap 1 — Passen aangeven",
  step1Subtitle: "Ga je zelf of geef je je pas vrij aan de groep?",
  step2Title: "Stap 2 — Wachtrij",
  step2Subtitle: "Wie het eerst komt, wie het eerst maalt.",
  step3Title: "Stap 3 — Overdrachten",
  step3Subtitle: "Wie moet zijn fysieke pas aan wie geven?",
  stepTimelineTitle: "Tijdlijn",

  // Pass Card
  passLabel: "Pas",
  seat: "Plaats",
  holder: "Momenteel in bezit van",
  expectedHolder: "Moet naar",
  indicatedBy: "Aangegeven door",
  coOwners: "Pas van",
  guestOf: "'s gast",
  currentAllocation: "de huidige toewijzing",
  changeHolderTitle: "Pashouder wijzigen",
  changeHolderDesc: "Selecteer wie de fysieke seizoenkaart momenteel in bezit heeft.",
  holderUpdated: "Pashouder bijgewerkt",
  unknownHolder: "Onbekend",

  // Pass Statuses
  statusUnindicated: "Nog niet aangegeven",
  statusKept: "Wordt gebruikt",
  statusReleased: "Vrijgegeven",
  statusAssigned: "Toegewezen",
  claimedBy: "Geclaimd door",

  // Pass Actions
  actionKeep: "Ik ga",
  actionRelease: "Pas vrijgeven",
  actionReclaim: "Pas terugclaimen",
  actionGiveBack: "Plek afstaan",
  choosePassToIndicate: "Kies een pas om aan te geven ({count})",
  passIndicateFor: "Aangeven voor pas van {label}",
  giveBackConfirmTitle: "Plek afstaan voor {fixture}?",
  giveBackConfirmDesc: "Weet je zeker dat je je toegewezen plek wilt afstaan? De pas wordt direct doorgeschoven naar de eerstvolgende in de wachtrij.",
  giveBackConfirmButton: "Ja, plek afstaan",
  reclaimConfirmTitle: "Pas terugclaimen van {name}?",
  reclaimConfirmDesc: "Weet je zeker dat je je seizoenkaart wilt terugclaimen van {name}? Diegene raakt de toegewezen plek kwijt en wordt teruggeplaatst in de wachtrij.",
  reclaimConfirmSubmit: "Ja, pas terugclaimen",

  // Queue Actions
  joinForSelf: "Ik wil een pas",
  joinForGuest: "Ik neem iemand mee",
  leaveQueue: "Uit de wachtrij",
  position: "Positie",
  guestLabel: "Gast",
  guestNamePrompt: "Naam van je gast (optioneel)",
  joinSubmit: "Aansluiten",
  cancel: "Annuleren",

  // Transfers
  transferFrom: "Van",
  transferTo: "Naar",
  markTransferred: "Overgedragen",
  noTransfersNeeded: "Alle passen zijn bij de juiste persoon!",
  involvesYou: "Jouw overdracht",

  // Wie ben jij picker
  whoAreYouTitle: "Wie ben jij?",
  whoAreYouSubtitle: "Passie heeft nog geen wachtwoorden — kies wie je bent.",
  selectMember: "Selecteer",
  switchMember: "Wissel van persoon",

  // Settings & Navigation
  navHome: "Volgende wedstrijd",
  navFixtures: "Wedstrijden",
  navPasses: "Passen",
  navSettings: "Instellingen",
  version: "Versie",
  privacyTitle: "Privacy & Gegevens",
  privacyText: "Passie slaat groeps- en pasactiviteiten op binnen Cloudflare D1. Geen wachtwoorden vereist. Geanonimiseerde product- en prestatie-statistieken lopen via een eigen proxy zonder trackingcookies van derden.",
  themeTitle: "Clubkleuren thema",
  themeRedBlack: "Rood-Zwart",
  themeRedBlackDesc: "Klassiek rood op lichte achtergrond",
  themeBlackRed: "Zwart-Rood",
  themeBlackRedDesc: "Klassiek zwart op donkere achtergrond",

  // Fixtures page
  upcomingFixtures: "Aankomende wedstrijden",
  pastFixtures: "Eerdere wedstrijden",
  noUpcomingFixtures: "Geen aankomende wedstrijden gepland.",
  refreshFixtures: "Wedstrijden ophalen",
  refreshingFixtures: "Ophalen...",
  refreshSuccess: "Wedstrijdkalender bijgewerkt!",
  refreshCooldown: "Wacht nog {seconds}s",
  refreshError: "Kon wedstrijdkalender niet ophalen",
  cancelledBadge: "Afgelast",

  // Error Messages
  error_POOL_NOT_OPEN: "Aanmelding is niet geopend voor deze wedstrijd.",
  error_NOT_PASS_OWNER: "Je bent geen eigenaar van deze pas.",
  error_PASS_ALREADY_ASSIGNED: "Deze pas is al toegewezen aan iemand anders.",
  error_PASS_NOT_ASSIGNED: "Deze pas is niet toegewezen.",
  error_NOT_CLAIMANT: "Je bent niet de begunstigde van deze pas.",
  error_QUEUE_ENTRY_NOT_FOUND: "Wachtrijverzoek niet gevonden.",
  error_QUEUE_ENTRY_NOT_WAITING: "Je verzoek staat niet meer op de wachtlijst.",
  error_NOT_QUEUE_ENTRY_OWNER: "Dit wachtrijverzoek is niet van jou.",
  error_PASS_NOT_FOUND: "Seizoenkaart niet gevonden.",
  error_INVALID_ACTION: "Ongeldige actie.",
  error_CONFLICT_RETRY_EXHAUSTED: "Iemand was je net voor! Probeer het opnieuw.",
  error_INTERNAL_ERROR: "Er is een interne fout opgetreden.",
  error_UNAUTHORIZED: "Authenticatie vereist.",
  error_GENERIC: "Er is iets misgegaan. Probeer het opnieuw.",

  // Activity Event Descriptions
  events: {
    poolOpened: "Aanmelding geopend voor deze wedstrijd",
    passKept: "{actor} gebruikt {pass}",
    passReleased: "{actor} geeft {pass} vrij",
    passAssigned: "{pass} toegewezen aan {claimant}",
    passUnassigned: "{actor} geeft {pass} terug",
    passReclaimed: "{actor} claimt {pass} terug van {claimant}",
    queueJoined: "{actor} sluit aan in de wachtrij ({kind})",
    queueCancelled: "{actor} stapt uit de wachtrij",
    possessionHandover: "{pass} overgedragen van {from} naar {to}",
    possessionCorrected: "Locatie van {pass} gecorrigeerd: nu bij {to}",
    fixtureRescheduled: "Aftrap gewijzigd naar {kickoff}",
    fixtureCancelled: "Wedstrijd afgelast",
  },
} as const;

export type TranslationKey = keyof typeof nl;
