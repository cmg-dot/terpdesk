/**
 * The choices our request forms offer, for screens that filter by them (client-safe: no imports). The settings are the New request and
 * Edit request forms' list (which also holds every setting the public website form offers); the formats are In person, Virtual and the
 * forms' Hybrid choice, which the Website requests board shows as "Hybrid". A test keeps this list level with the forms.
 */
export const REQUEST_SETTINGS = ["Education", "Medical", "Mental Health", "Workplace", "Legal", "Community", "Other"] as const;
export const REQUEST_FORMATS = ["In person", "Virtual", "Hybrid"] as const;
