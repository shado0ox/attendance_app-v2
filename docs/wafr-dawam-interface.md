# Wafr Dawam interface refresh

## Design direction

The main audience is an employee checking the day's attendance and a Saturday-to-Friday work schedule on a phone. Managers use the same product to review schedules and attendance on desktop. Preserve the existing identity and workflow.

Palette: navy `#102C3A`, action teal `#087F73`, brand teal `#16B8A6`, paper `#F4F8F7`, separator `#D9E5E3`, white `#FFFFFF`. Keep the existing Tajawal family with 14–16px controls, 18–20px section headings and a larger desktop login headline. Use right alignment for Arabic and left-to-right spans for numeric date/time ranges.

The login page uses a quiet navy introduction alongside the real sign-in form on desktop; mobile goes straight to sign-in. Its decorative seven-day rhythm contains no fake employee data. Employee attendance remains on the home tab, followed by the actual published weekly schedule. The week becomes seven readable rows on mobile and seven columns on desktop. Today is marked by both text and an accent, and existing rest/double-shift/notes data remains visible.

## Plan review

Removed the proposed identical card treatment for every day in favor of a continuous weekly table with separators. Replaced decorative amber gradients in the admin navigation with the approved teal identity. Avoided adding entrance animations; preserve useful loading feedback and respect reduced-motion settings. Names wrap, navigation targets are at least 44px, and focused login inputs retain a visible outline.

## Scope

Presentation changes only: login, employee navigation/header, weekly schedule and admin chrome. Database schema, company isolation, auth handlers, attendance posting, notifications and schedule publishing behavior are unchanged.

## Validation

Run `npm run lint` and `npm run build`. Review login and employee home at 360px, 390px and 1440px with synthetic local API responses. Check seven weekday entries, week navigation, tab switching, long names, and horizontal overflow. This preview is a layout/interaction check, not an authentication or geolocation integration test.

Validation completed: TypeScript and production build passed; existing Riyadh week boundary test passed. Chromium review with synthetic API data at 360/390/1440px confirmed no horizontal page overflow, seven weekdays, functional week/tab navigation and no browser runtime exceptions. Admin preview and mobile menu navigation also passed at 390/1440px. Live authentication, GPS and production data were not exercised.
