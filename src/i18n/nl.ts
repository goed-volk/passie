export const nl = {
  // App Header
  appName: "Passie",
  appTagline: "Seizoenkaarten delen met vrienden",

  // Fixture Header
  vs: "–",
  home: "Thuis",
  away: "Uit",
  deadlineLabel: "Aangeven vóór",
  deadlinePassed: "Aangeefdeadline verstreken",
  deadlineRemaining: "nog",
  poolCancelled: "Wedstrijd afgelast of verplaatst",

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
  holder: "Huidige pashouder",
  expectedHolder: "Moet naar",
  indicatedBy: "Aangegeven door",
  coOwners: "Mede-eigenaren",

  // Pass Statuses
  statusUnindicated: "Nog niet aangegeven",
  statusKept: "Wordt gebruikt",
  statusReleased: "Vrijgegeven",
  statusAssigned: "Toegewezen",
  claimedBy: "Geclaimd door",

  // Pass Actions
  actionKeep: "Ik ga",
  actionRelease: "Pas vrijgeven",
  actionGiveBack: "Pas teruggeven",

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
  privacyText: "Passie slaat alleen groeps- en pasactiviteiten op binnen Cloudflare D1. Geen wachtwoorden, geen trackingcookies.",
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

  // Activity Event Descriptions
  events: {
    poolOpened: "Aanmelding geopend voor deze wedstrijd",
    passKept: "{actor} gebruikt {pass}",
    passReleased: "{actor} geeft {pass} vrij",
    passAssigned: "{pass} toegewezen aan {claimant}",
    passUnassigned: "{actor} geeft {pass} terug",
    queueJoined: "{actor} sluit aan in de wachtrij ({kind})",
    queueCancelled: "{actor} stapt uit de wachtrij",
    possessionHandover: "{pass} overgedragen van {from} naar {to}",
    possessionCorrected: "Locatie van {pass} gecorrigeerd: nu bij {to}",
    fixtureRescheduled: "Aftrap gewijzigd naar {kickoff}",
    fixtureCancelled: "Wedstrijd afgelast",
  },
} as const;

export type TranslationKey = keyof typeof nl;
