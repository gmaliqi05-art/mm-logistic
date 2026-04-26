# CHECKLIST I IMPLEMENTIMIT

Përdorni këtë checklist për të ndjekur progresin e implementimit të përmirësimeve.

---

## FAZA 1: SIGURIA ⚠️ URGJENTE

### Javë 1 - Ditë 1-2: Storage Security
- [ ] Krijo migration për storage security
- [ ] Bëj bucket `attachments` private
- [ ] Shto RLS policies për storage
- [ ] Implemento signed URLs në kod
- [ ] Test upload/download me signed URLs
- [ ] Update të gjitha referencat në kod
- [ ] Test që përdorues të tjerë nuk mund të aksesojnë files

**Files për ndryshuar:**
- [ ] `supabase/migrations/xxxx_fix_storage_security.sql`
- [ ] `src/pages/company/DeliveryNotes.tsx` (line 145-155)
- [ ] `src/components/scanner/DocumentScanner.tsx`
- [ ] `src/pages/company/Documents.tsx`

---

### Javë 1 - Ditë 3-5: Two-Factor Authentication (2FA)
- [ ] Instalo `@supabase/auth-helpers-react`
- [ ] Krijo komponent `TwoFactorSetup.tsx`
- [ ] Shto 2FA enable në User Settings
- [ ] Implemento QR code display
- [ ] Shto verification code input
- [ ] Update login flow për 2FA check
- [ ] Shto "Remember this device" option
- [ ] Test 2FA enrollment flow
- [ ] Test 2FA login flow
- [ ] Test 2FA disable flow
- [ ] Shto recovery codes

**Files për krijuar/ndryshuar:**
- [ ] `src/components/auth/TwoFactorSetup.tsx` (new)
- [ ] `src/components/auth/TwoFactorVerify.tsx` (new)
- [ ] `src/pages/LoginPage.tsx`
- [ ] `src/pages/company/Settings.tsx`

---

### Javë 2 - Ditë 1-2: Rate Limiting
- [ ] Krijo edge function `rate-limiter`
- [ ] Implemento in-memory rate limit store
- [ ] Shto middleware për rate checking
- [ ] Konfiguro limits per endpoint
  - [ ] Login: 5 attempts/15min
  - [ ] API: 100 requests/min
  - [ ] File upload: 10 uploads/min
- [ ] Shto error responses me 429 status
- [ ] Shto headers për rate limit info
- [ ] Test rate limiting me multiple requests
- [ ] Shto logging për rate limit hits
- [ ] Deploy edge function

**Files për krijuar:**
- [ ] `supabase/functions/rate-limiter/index.ts` (new)
- [ ] `supabase/functions/rate-limiter/config.ts` (new)

---

### Javë 2 - Ditë 3-4: Input Validation Server-Side
- [ ] Instalo `zod` për validation
- [ ] Krijo schemas për:
  - [ ] DeliveryNote
  - [ ] Stock movements
  - [ ] User registration
  - [ ] Document upload
- [ ] Krijo edge functions për validation:
  - [ ] `validate-delivery-note`
  - [ ] `validate-stock-movement`
  - [ ] `validate-user-data`
- [ ] Update frontend për të përdorur edge functions
- [ ] Shto error handling për validation errors
- [ ] Test me invalid inputs
- [ ] Test boundary cases
- [ ] Deploy edge functions

**Files për krijuar:**
- [ ] `src/utils/schemas.ts` (new)
- [ ] `supabase/functions/validate-delivery-note/index.ts` (new)
- [ ] `supabase/functions/validate-stock-movement/index.ts` (new)

---

### Javë 2 - Ditë 5: CORS dhe Final Security Tests
- [ ] Update CORS headers në të gjitha edge functions
- [ ] Vendos allowed origins (jo '*')
- [ ] Shto credentials support
- [ ] Test CORS nga domains të ndryshme
- [ ] Krijo security test suite:
  - [ ] Test unauthorized access
  - [ ] Test SQL injection attempts
  - [ ] Test XSS attempts
  - [ ] Test file upload exploits
  - [ ] Test rate limiting
  - [ ] Test 2FA bypass attempts
- [ ] Run security audit me tools (npm audit, Snyk)
- [ ] Fix të gjitha vulnerabilities
- [ ] Document security measures
- [ ] Krijo security policy document

**Checklist final:**
- [ ] ✓ Storage është private
- [ ] ✓ 2FA funksionon
- [ ] ✓ Rate limiting aktiv
- [ ] ✓ Input validation server-side
- [ ] ✓ CORS configured correctly
- [ ] ✓ Të gjitha tests pass
- [ ] ✓ Security audit clean

---

## FAZA 2: GPS TRACKING

### Javë 3 - Ditë 1: Setup & Database
- [ ] Regjistro për Google Maps API
- [ ] Aktivizo APIs:
  - [ ] Maps JavaScript API
  - [ ] Directions API
  - [ ] Geolocation API
- [ ] Mer API key
- [ ] Shto API key në `.env`
- [ ] Instalo `@googlemaps/js-api-loader`
- [ ] Krijo migration për `driver_locations` table
- [ ] Shto indexes për performance
- [ ] Shto RLS policies
- [ ] Test table creation
- [ ] Deploy migration

**Files:**
- [ ] `supabase/migrations/xxxx_add_location_tracking.sql`
- [ ] `.env` (add VITE_GOOGLE_MAPS_API_KEY)

---

### Javë 3 - Ditë 2-5: Map Component
- [ ] Krijo `LiveMap.tsx` component
- [ ] Inicializo Google Maps
- [ ] Shto default center (Tiranë)
- [ ] Fetch driver locations nga database
- [ ] Krijo markers për çdo shofer
- [ ] Shto custom icon për truck
- [ ] Implemento marker info windows
- [ ] Shto real-time updates me Realtime
- [ ] Subscribe to location changes
- [ ] Update markers në real-time
- [ ] Shto clustering për shumë markers
- [ ] Shto filters (status, depot, etc)
- [ ] Shto legend
- [ ] Make responsive
- [ ] Test me shumë shoferë

**Files:**
- [ ] `src/components/maps/LiveMap.tsx` (new)
- [ ] `src/components/maps/DriverMarker.tsx` (new)
- [ ] `public/truck-icon.png` (new asset)

---

### Javë 4 - Ditë 1-3: Driver Location Tracking
- [ ] Shto location tracking në Driver Dashboard
- [ ] Request geolocation permission
- [ ] Implemento `watchPosition`
- [ ] Send location updates çdo 30 sekonda
- [ ] Shto accuracy, speed, heading
- [ ] Handle errors (permission denied, timeout)
- [ ] Shto toggle për enable/disable tracking
- [ ] Shto indicator në UI (tracking active)
- [ ] Optimize battery usage
- [ ] Test accuracy
- [ ] Test në mobile browser
- [ ] Test me multiple drivers

**Files:**
- [ ] `src/pages/driver/Dashboard.tsx`
- [ ] `src/hooks/useLocationTracking.ts` (new)

---

### Javë 4 - Ditë 4-5: ETA Calculation
- [ ] Krijo `etaCalculator.ts` utility
- [ ] Implemento Google Directions API call
- [ ] Parse response për duration dhe distance
- [ ] Shfaq ETA në delivery note details
- [ ] Update ETA periodically
- [ ] Shto traffic consideration
- [ ] Handle route changes
- [ ] Shto alternative routes
- [ ] Test me adresa të ndryshme
- [ ] Test me trafik
- [ ] Optimize API calls (caching)

**Files:**
- [ ] `src/utils/etaCalculator.ts` (new)
- [ ] `src/pages/company/DeliveryNotes.tsx`

---

### Javë 5: Map Integration në Company Dashboard
- [ ] Shto LiveMap në Company Dashboard
- [ ] Shto filters për status
- [ ] Shto search për shoferë
- [ ] Click marker për të parë detajet
- [ ] Shto route visualization
- [ ] Shto heatmap për deliveries
- [ ] Shto historical replay
- [ ] Test performance me shumë data
- [ ] Optimize rendering

**Final Checklist:**
- [ ] ✓ Map shfaqet correctly
- [ ] ✓ Markers update në real-time
- [ ] ✓ Driver location tracked accurately
- [ ] ✓ ETA calculated correctly
- [ ] ✓ Mobile responsive
- [ ] ✓ Performance është i mirë

---

## FAZA 3: MOBILE APP (PWA)

### Javë 6 - Ditë 1-2: Service Worker
- [ ] Krijo `public/sw.js`
- [ ] Implemento install event
- [ ] Shto cache strategy
- [ ] Cache static assets
- [ ] Cache API responses (with expiration)
- [ ] Implemento offline fallback
- [ ] Register service worker në `main.tsx`
- [ ] Test në offline mode
- [ ] Test cache updates

**Files:**
- [ ] `public/sw.js` (new)
- [ ] `src/main.tsx`

---

### Javë 6 - Ditë 3-5: PWA Manifest & Icons
- [ ] Krijo `manifest.json`
- [ ] Gjenerо icons (192x192, 512x512)
- [ ] Shto maskable icons
- [ ] Konfiguro theme color
- [ ] Konfiguro display mode (standalone)
- [ ] Shto splash screens
- [ ] Test "Add to Home Screen"
- [ ] Test në Android
- [ ] Test në iOS
- [ ] Optimize icons
- [ ] Shto screenshots për app stores

**Files:**
- [ ] `public/manifest.json`
- [ ] `public/icons/` (folder me icons)
- [ ] `index.html` (link manifest)

---

### Javë 7: Push Notifications
- [ ] Gjenerо VAPID keys
- [ ] Krijo `push_subscriptions` table
- [ ] Implemento notification permission request
- [ ] Subscribe user për push
- [ ] Save subscription në database
- [ ] Krijo edge function për send notifications
- [ ] Shto notification triggers:
  - [ ] New delivery note
  - [ ] Status change
  - [ ] New message
- [ ] Handle notification click
- [ ] Test në multiple devices
- [ ] Test background notifications
- [ ] Test notification actions

**Files:**
- [ ] `supabase/migrations/xxxx_add_push_subscriptions.sql`
- [ ] `supabase/functions/send-push-notification/index.ts` (new)
- [ ] `src/utils/pushNotifications.ts` (new)

---

### Javë 8-9: Offline Support
- [ ] Implemento offline detection
- [ ] Shto offline indicator në UI
- [ ] Cache delivery notes locally
- [ ] Queue actions për offline mode
- [ ] Sync kur online again
- [ ] Handle conflicts
- [ ] Test offline creation
- [ ] Test offline updates
- [ ] Test sync process
- [ ] Optimize local storage usage

**Final PWA Checklist:**
- [ ] ✓ Service worker funksionon
- [ ] ✓ App installs on mobile
- [ ] ✓ Icons correct sizes
- [ ] ✓ Push notifications work
- [ ] ✓ Offline mode funksionon
- [ ] ✓ Lighthouse PWA score >90

---

## FAZA 4: NOTIFICATIONS

### Javë 10 - Ditë 1-3: Email Notifications
- [ ] Regjistro për Resend account
- [ ] Mer API key
- [ ] Verify domain
- [ ] Setup DKIM/SPF records
- [ ] Krijo edge function `send-email`
- [ ] Krijo email templates:
  - [ ] New delivery note
  - [ ] Status change
  - [ ] Document received
  - [ ] Welcome email
- [ ] Shto email triggers në kod
- [ ] Test email delivery
- [ ] Test spam score
- [ ] Add unsubscribe links
- [ ] Track email opens (optional)

**Files:**
- [ ] `supabase/functions/send-email/index.ts` (new)
- [ ] `supabase/functions/send-email/templates/` (folder)

---

### Javë 10 - Ditë 4-5: SMS Notifications
- [ ] Regjistro për Twilio account
- [ ] Mer phone number
- [ ] Mer API credentials
- [ ] Krijo edge function `send-sms`
- [ ] Shto SMS triggers për:
  - [ ] Urgent deliveries
  - [ ] Late deliveries
  - [ ] Emergency alerts
- [ ] Format messages properly (160 chars)
- [ ] Add opt-out instructions
- [ ] Test SMS delivery
- [ ] Test international numbers
- [ ] Monitor costs

**Files:**
- [ ] `supabase/functions/send-sms/index.ts` (new)

---

### Javë 11: Notification Center
- [ ] Krijo Notification Center UI
- [ ] Shfaq të gjitha notifications
- [ ] Mark as read functionality
- [ ] Filter by type
- [ ] Search notifications
- [ ] Delete notifications
- [ ] Notification preferences per user
- [ ] Email/SMS opt-in/opt-out
- [ ] Test notification flow end-to-end

**Files:**
- [ ] `src/components/notifications/NotificationCenter.tsx` (new)
- [ ] `src/pages/company/NotificationSettings.tsx` (new)

---

**Final Notifications Checklist:**
- [ ] ✓ Emails delivering correctly
- [ ] ✓ SMS sending successfully
- [ ] ✓ Users can manage preferences
- [ ] ✓ Unsubscribe working
- [ ] ✓ Costs within budget
- [ ] ✓ No spam issues

---

## DEPLOYMENT CHECKLIST

### Pre-Production
- [ ] All tests passing
- [ ] Security audit completed
- [ ] Performance testing done
- [ ] Load testing completed
- [ ] Backup strategy in place
- [ ] Monitoring setup (Sentry, LogRocket)
- [ ] Analytics setup (Google Analytics)
- [ ] Error tracking configured
- [ ] Documentation updated
- [ ] User manual updated

### Production Deploy
- [ ] Environment variables set
- [ ] Database migrations run
- [ ] Edge functions deployed
- [ ] CDN configured
- [ ] SSL certificate valid
- [ ] Domain configured
- [ ] Email domain verified
- [ ] SMS number verified
- [ ] Google Maps API limits set
- [ ] Rate limits configured

### Post-Deploy
- [ ] Smoke tests passed
- [ ] All features work in production
- [ ] Notifications sending
- [ ] GPS tracking working
- [ ] Mobile app installable
- [ ] Monitor errors for 24h
- [ ] User feedback collected
- [ ] Performance metrics normal

---

## MAINTENANCE CHECKLIST (Weekly)

### Çdo javë:
- [ ] Check error logs
- [ ] Monitor API usage/costs
- [ ] Review security alerts
- [ ] Check database performance
- [ ] Review user feedback
- [ ] Update dependencies (if needed)
- [ ] Backup verification
- [ ] Test critical flows

### Çdo muaj:
- [ ] Security audit
- [ ] Performance review
- [ ] Cost optimization
- [ ] User metrics analysis
- [ ] Feature usage analysis
- [ ] Update documentation
- [ ] Plan next features

---

## PËRFUNDIM

**TOTAL TASKS:** ~250+
**ESTIMATED TIME:** 11 javë
**TEAM SIZE:** 2-3 developers

Mbani këtë checklist të përditësuar dhe share me të gjithë ekipin për transparencë dhe accountabilitet.

---

*Krijuar: 7 Shkurt 2026*
*Version: 1.0*
