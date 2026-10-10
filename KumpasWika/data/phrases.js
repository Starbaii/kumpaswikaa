// data/phrases.js
// Text-only phrasebook entries (Scope: 10-15 foundational phrases).
// Mirrors the PHRASEBOOK_ENTRY fields: english_text, tagalog_text, is_emergency (+ category).
// Have the Federation of the Deaf / a Tagalog speaker review the wording before the defense.

export const CATEGORIES = ['Emergency', 'Travel', 'Food', 'Shopping'];

export const PHRASES = [
  // Emergency
  { id: 1, category: 'Emergency', isEmergency: true, tagalog: 'Tulong po!', english: 'Help me!' },
  { id: 2, category: 'Emergency', isEmergency: true, tagalog: 'Tumawag po kayo ng ambulansya.', english: 'Please call an ambulance.' },
  { id: 3, category: 'Emergency', isEmergency: true, tagalog: 'May sunog!', english: "There's a fire!" },
  { id: 4, category: 'Emergency', isEmergency: true, tagalog: 'Kailangan ko po ng doktor.', english: 'I need a doctor.' },
  { id: 5, category: 'Emergency', isEmergency: true, tagalog: 'Nawawala po ako.', english: "I'm lost." },

  // Travel
  { id: 6, category: 'Travel', isEmergency: false, tagalog: 'Saan po ang bus stop?', english: "Where's the bus stop?" },
  { id: 7, category: 'Travel', isEmergency: false, tagalog: 'Ilang minuto pa po?', english: 'How many more minutes?' },
  { id: 8, category: 'Travel', isEmergency: false, tagalog: 'Magkano po ang pamasahe?', english: 'How much is the fare?' },
  { id: 9, category: 'Travel', isEmergency: false, tagalog: 'Para po!', english: 'Stop here, please.' },

  // Food
  { id: 10, category: 'Food', isEmergency: false, tagalog: 'Pwede po bang makita ang menu?', english: 'Can I see the menu?' },
  { id: 11, category: 'Food', isEmergency: false, tagalog: 'Isa pong order nito.', english: 'One order of this, please.' },
  { id: 12, category: 'Food', isEmergency: false, tagalog: 'Pakibalot na lang po.', english: 'Please wrap it to go.' },

  // Shopping
  { id: 13, category: 'Shopping', isEmergency: false, tagalog: 'Magkano po ito?', english: 'How much is this?' },
  { id: 14, category: 'Shopping', isEmergency: false, tagalog: 'Pwede po bang tumawad?', english: 'Can I haggle?' },
  { id: 15, category: 'Shopping', isEmergency: false, tagalog: 'Salamat po.', english: 'Thank you.' },
];
