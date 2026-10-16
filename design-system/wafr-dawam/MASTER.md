# Wafr Dawam native employee interface

Approved reference: the user's eight-page attendance PDF, adapted to the existing employee portal. Guidance: UI UX Pro Max native pro-rules, touch/accessibility and React Native animation searches. Its general product search did not match attendance; marketing/landing recommendations are excluded.

## Visual direction
- Retain Wafr teal #087D71, light neutral canvas, dark ink and white outlined cards.
- Use semantic color tokens; amber denotes break/late return, red errors. Pair every state color with text.
- Native Arabic system font, Gregorian/Riyadh dates, Latin digits and tabular time. Names can wrap; never shrink essential text to fit.
- Spacing in multiples of 4/8; cards 20–24 radius; icon targets at least 48 units. Small-phone portrait, landscape and large text must remain scrollable.
- One consistent outline vector icon vocabulary. Employee photos and company logos are content images, with text/initial fallbacks.

## Navigation
- Four native tabs: home, attendance history, schedule, requests. Header offers settings gear and separate profile icon.
- Company logo/name then employee avatar/name. Settings and profile are separate root-stack screens with native back navigation.
- Profile contains personal fields/photo/email verification. Settings owns device security, location, notifications, privacy and account logout.

## Attendance and breaks
- Large server-aligned clock and active shift range. Dominant fingerprint circle indicates the next valid deliberate punch, with period progress.
- Neutral GPS text before a check; inside/outside only after a current accurate fix. Geofence events never prove attendance.
- Show checking and saving phases, disable duplicate interactions, require checkout confirmation and preserve server GPS/Passkey policies.
- Success receipt uses the saved server record; period times/duration and completed break duration shown separately. Day total comes from the existing employee attendance report, never a speculative client sum.
- Flexible/clock/offset break entitlement stays server driven. Active break gets remaining time, planned return, late return and an explicit return action. Checkout stays unavailable while the break is open.
- Gentle work pulse only while focused/foreground/working. Reduced motion has a static equivalent; stop loops on blur/background/unmount. No decorative continuous movement elsewhere.

## Release and review
- Android versionCode 5; iOS buildNumber 4. Same application IDs and operator-provided Firebase/Expo/signing configuration.
- Verify state transitions, overnight/double-period metrics, image scoping, API failures, large text, small screens, safe areas and native compilation.
