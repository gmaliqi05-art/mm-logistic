# PLANI I VEPRIMIT - PËRMIRËSIME TË SISTEMIT

Data: 7 Shkurt 2026

> **🟢 UPDATE — 31 Maj 2026:** Pjesa me e madhe e ketij plani **eshte zbatuar**. Shih `docs/AUDIT_REPORT.md` (seksioni "STATUS UPDATE") per krahasimin e plote te plotesimit ndaj gjendjes aktuale. Permbledhje e shpejte:
>
> - ✅ Faza 1 (Siguria): Storage privatizuar, 2FA, rate limiting (`_shared/rateLimit.ts`), CORS te konfiguruar ne edge functions
> - ✅ Faza 2 (GPS): `DriverTrackingContext` + `LiveMap.tsx` (logistics + company) — me Leaflet/MapTiler, jo Google Maps
> - ✅ Faza 3 (Mobile/PWA): `manifest.json` + `sw.js` + APNs/FCM/web push i plote
> - ✅ Faza 4 (Notifications): `send-email`, `send-email-campaign`, `send-invoice-email`, push notifications
>
> Permbajtja origjinale me poshte mbahet per arkive historike. Mos e perdor si plan aktiv.

---

## FAZA 1: SIGURIA (URGJENTE - 1-2 JAVË)

### Objektivat:
- Siguroni platformën para production deployment
- Implementoni security best practices
- Mbrojeni të dhënat e klientëve

### Hapat konkretë:

#### 1. Storage Security (2-3 ditë)
```typescript
// Bëj bucket private dhe përdor signed URLs
// Në supabase/migrations/fix_storage_security.sql

-- Bëj bucket private
UPDATE storage.buckets
SET public = false
WHERE name = 'attachments';

-- Shto politika për akses
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'attachments');

CREATE POLICY "Users can access their company files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'attachments' AND
       (storage.foldername(name))[1] IN
       (SELECT company_id::text FROM profiles WHERE id = auth.uid()));
```

```typescript
// Në kod, përdor signed URLs
const { data, error } = await supabase.storage
  .from('attachments')
  .createSignedUrl(fileName, 3600); // 1 orë expiration
```

#### 2. Two-Factor Authentication (3-4 ditë)
```bash
# Instalo paketa
npm install @supabase/auth-helpers-react
```

```typescript
// Shto 2FA në LoginPage.tsx
const enable2FA = async () => {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp'
  });

  // Shfaq QR code për përdoruesin
  setQRCode(data.totp.qr_code);
};

const verify2FA = async (code: string) => {
  const { data, error } = await supabase.auth.mfa.challenge({
    factorId: factorId
  });

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: factorId,
    challengeId: data.id,
    code: code
  });
};
```

#### 3. Rate Limiting (2 ditë)
```typescript
// Krijo edge function: supabase/functions/rate-limiter/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2';

const rateLimits = new Map<string, { count: number; resetAt: number }>();

export default async (req: Request) => {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const limit = rateLimits.get(ip);
  const now = Date.now();

  if (limit && now < limit.resetAt) {
    if (limit.count >= 100) { // 100 requests per minute
      return new Response('Rate limit exceeded', { status: 429 });
    }
    limit.count++;
  } else {
    rateLimits.set(ip, { count: 1, resetAt: now + 60000 });
  }

  // Continue processing...
};
```

#### 4. Input Validation Server-Side (2-3 ditë)
```typescript
// Krijo edge function: supabase/functions/validate-delivery-note/index.ts
import { z } from 'npm:zod@3';

const DeliveryNoteSchema = z.object({
  type: z.enum(['pickup', 'delivery']),
  assigned_driver_id: z.string().uuid(),
  delivery_address: z.string().min(5).max(500),
  items: z.array(z.object({
    category_id: z.string().uuid(),
    quantity: z.number().int().positive(),
    condition: z.enum(['good', 'damaged', 'repaired'])
  }))
});

export default async (req: Request) => {
  const body = await req.json();

  try {
    const validated = DeliveryNoteSchema.parse(body);
    // Save to database...
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Invalid input' }), {
      status: 400
    });
  }
};
```

#### 5. CORS Restrictions (1 ditë)
```typescript
// Në supabase/config.toml (nëse ka) ose në edge functions
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://yourdomain.com', // Jo '*'
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true'
};
```

### Testo (1 ditë):
- Provo të aksesosh të dhëna pa autorizim
- Testo brute force login attempts
- Provo të ngarkosh file të madh/malicious
- Testo 2FA flow komplet

---

## FAZA 2: GPS TRACKING (2-3 JAVË)

### Objektivat:
- Shiko pozicionin e shoferëve në kohë reale
- Llogarit ETA për dorëzimet
- Optimizo rrugët

### Hapat konkretë:

#### 1. Setup Google Maps API (1 ditë)
```bash
npm install @googlemaps/js-api-loader
```

```env
# Në .env
VITE_GOOGLE_MAPS_API_KEY=your_api_key_here
```

#### 2. Krijo tabelën për location tracking (1 ditë)
```sql
-- supabase/migrations/add_location_tracking.sql
CREATE TABLE driver_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid REFERENCES profiles(id) NOT NULL,
  latitude decimal(10, 8) NOT NULL,
  longitude decimal(11, 8) NOT NULL,
  accuracy decimal(10, 2),
  speed decimal(10, 2),
  heading decimal(5, 2),
  recorded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_driver_locations_driver_id ON driver_locations(driver_id);
CREATE INDEX idx_driver_locations_recorded_at ON driver_locations(recorded_at DESC);

-- RLS
ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company can view their driver locations"
ON driver_locations FOR SELECT TO authenticated
USING (
  driver_id IN (
    SELECT id FROM profiles
    WHERE company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
);

CREATE POLICY "Drivers can insert their own location"
ON driver_locations FOR INSERT TO authenticated
WITH CHECK (driver_id = auth.uid());
```

#### 3. Krijo komponentin e hartës (3-4 ditë)
```typescript
// src/components/maps/LiveMap.tsx
import { useEffect, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { supabase } from '../../lib/supabase';

interface DriverMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: string;
}

export default function LiveMap() {
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [markers, setMarkers] = useState<Map<string, google.maps.Marker>>(new Map());

  useEffect(() => {
    const loader = new Loader({
      apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
      version: 'weekly'
    });

    loader.load().then(() => {
      const mapInstance = new google.maps.Map(
        document.getElementById('map') as HTMLElement,
        {
          center: { lat: 41.3275, lng: 19.8187 }, // Tiranë
          zoom: 12
        }
      );
      setMap(mapInstance);
    });
  }, []);

  useEffect(() => {
    if (!map) return;

    // Subscribe to driver location updates
    const channel = supabase
      .channel('driver-locations')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'driver_locations'
        },
        (payload) => {
          updateDriverMarker(payload.new);
        }
      )
      .subscribe();

    // Fetch initial locations
    fetchDriverLocations();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [map]);

  async function fetchDriverLocations() {
    const { data } = await supabase
      .from('driver_locations')
      .select('*, driver:profiles(full_name)')
      .order('recorded_at', { ascending: false });

    // Group by driver_id and get latest location
    const latest = new Map();
    data?.forEach(loc => {
      if (!latest.has(loc.driver_id)) {
        latest.set(loc.driver_id, loc);
      }
    });

    latest.forEach(loc => updateDriverMarker(loc));
  }

  function updateDriverMarker(location: any) {
    if (!map) return;

    const existingMarker = markers.get(location.driver_id);

    if (existingMarker) {
      existingMarker.setPosition({
        lat: parseFloat(location.latitude),
        lng: parseFloat(location.longitude)
      });
    } else {
      const marker = new google.maps.Marker({
        position: {
          lat: parseFloat(location.latitude),
          lng: parseFloat(location.longitude)
        },
        map: map,
        title: location.driver?.full_name,
        icon: {
          url: '/truck-icon.png',
          scaledSize: new google.maps.Size(40, 40)
        }
      });

      markers.set(location.driver_id, marker);
    }
  }

  return <div id="map" className="w-full h-[600px] rounded-xl" />;
}
```

#### 4. Shto location tracking në Driver app (2-3 ditë)
```typescript
// src/pages/driver/Dashboard.tsx
useEffect(() => {
  let watchId: number;

  if ('geolocation' in navigator) {
    watchId = navigator.geolocation.watchPosition(
      async (position) => {
        await supabase.from('driver_locations').insert({
          driver_id: profile.id,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading,
          recorded_at: new Date().toISOString()
        });
      },
      (error) => console.error('Location error:', error),
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );
  }

  return () => {
    if (watchId) navigator.geolocation.clearWatch(watchId);
  };
}, [profile]);
```

#### 5. ETA Calculation (2 ditë)
```typescript
// src/utils/etaCalculator.ts
export async function calculateETA(
  origin: { lat: number; lng: number },
  destination: string
): Promise<{ duration: number; distance: number }> {
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/directions/json?` +
    `origin=${origin.lat},${origin.lng}&` +
    `destination=${encodeURIComponent(destination)}&` +
    `key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`
  );

  const data = await response.json();

  if (data.routes && data.routes[0]) {
    const route = data.routes[0];
    return {
      duration: route.legs[0].duration.value, // seconds
      distance: route.legs[0].distance.value  // meters
    };
  }

  throw new Error('Could not calculate ETA');
}
```

---

## FAZA 3: MOBILE APP (3-4 JAVË)

### Opsioni 1: PWA (Progressive Web App) - 1-2 javë

#### Përmirëso PWA ekzistuese:
```typescript
// public/sw.js (Service Worker)
const CACHE_NAME = 'transport-app-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/assets/index.css',
  '/assets/index.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});
```

```typescript
// src/main.tsx - Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('SW registered'))
      .catch(err => console.log('SW registration failed'));
  });
}
```

```json
// public/manifest.json
{
  "name": "Transport & Logistics Platform",
  "short_name": "Transport",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0d9488",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

#### Shto Push Notifications:
```typescript
// src/utils/pushNotifications.ts
export async function requestNotificationPermission() {
  const permission = await Notification.requestPermission();

  if (permission === 'granted') {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: 'YOUR_VAPID_PUBLIC_KEY'
    });

    // Save subscription to database
    await supabase.from('push_subscriptions').insert({
      user_id: profile.id,
      subscription: JSON.stringify(subscription)
    });
  }
}
```

### Opsioni 2: React Native App - 3-4 javë

```bash
# Krijo projektin
npx react-native init TransportApp --template react-native-template-typescript

# Instalo dependencies
npm install @react-navigation/native @react-navigation/stack
npm install @supabase/supabase-js
npm install react-native-geolocation-service
npm install react-native-camera
npm install @react-native-async-storage/async-storage
```

---

## FAZA 4: NOTIFICATIONS (1-2 JAVË)

### Email Notifications (3-4 ditë)

```bash
npm install resend
```

```typescript
// supabase/functions/send-email/index.ts
import { Resend } from 'npm:resend@2';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

export default async (req: Request) => {
  const { to, subject, html } = await req.json();

  const { data, error } = await resend.emails.send({
    from: 'Transport App <noreply@yourdomain.com>',
    to,
    subject,
    html
  });

  return new Response(JSON.stringify({ data, error }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
```

```typescript
// Përdorimi në kod
await supabase.functions.invoke('send-email', {
  body: {
    to: driver.email,
    subject: 'Fletëdërgesë e re',
    html: `<h1>Keni një fletëdërgesë të re: ${noteNumber}</h1>`
  }
});
```

### SMS Notifications (2-3 ditë)

```bash
npm install twilio
```

```typescript
// supabase/functions/send-sms/index.ts
import { Twilio } from 'npm:twilio@4';

const client = new Twilio(
  Deno.env.get('TWILIO_ACCOUNT_SID'),
  Deno.env.get('TWILIO_AUTH_TOKEN')
);

export default async (req: Request) => {
  const { to, body } = await req.json();

  const message = await client.messages.create({
    from: '+1234567890', // Your Twilio number
    to,
    body
  });

  return new Response(JSON.stringify({ messageId: message.sid }));
};
```

---

## KOSTOT E VLERËSUARA

### Faza 1 (Siguria): 10-12 ditë pune
- Kosto: €2,000 - €3,000

### Faza 2 (GPS): 15-20 ditë pune
- Kosto: €3,000 - €5,000
- Google Maps API: ~€200/muaj (për 100K requests)

### Faza 3 (Mobile): 20-30 ditë pune
- PWA: €2,000 - €3,000
- React Native: €5,000 - €8,000

### Faza 4 (Notifications): 5-7 ditë pune
- Kosto: €1,000 - €1,500
- Resend: €20-100/muaj
- Twilio: €50-200/muaj

### TOTALI:
- **Minimum:** €8,000 + €270/muaj services
- **Maksimum:** €17,500 + €500/muaj services

---

## TIMELINE

```
Javët 1-2:  ████████░░░░░░░░░░░░░░░░░░░░ Faza 1 (Siguria)
Javët 3-5:  ░░░░░░░░████████████░░░░░░░░ Faza 2 (GPS)
Javët 6-9:  ░░░░░░░░░░░░░░░░████████████ Faza 3 (Mobile)
Javët 10-11: ░░░░░░░░░░░░░░░░░░░░░░██████ Faza 4 (Notifications)
```

**Total:** 10-11 javë (2.5-3 muaj)

---

## SI TË FILLONI

### Sot (Ditë 1):
1. Review ky dokument me ekipin
2. Prioritizoni fazat
3. Alokoni buxhetin

### Ditë 2-3:
1. Setup development environment
2. Krijo branch të ri `feature/security-improvements`
3. Fillo me storage security fix

### Java 1:
1. Implemento të gjitha fix-et e sigurisë
2. Test në staging environment
3. Code review

### Pastaj:
- Vazhdoni me GPS tracking
- Paralelo filloni mobile app development
- Implementoni notifications

---

## PYETJE TË SHPESHTA

**P: A mund t'i kapërcej fazat?**
J: Faza 1 (Siguria) është JO-negociable. Fazat 2-4 mund të prioritizohen sipas nevojave.

**P: Sa do të kushtojë maintenance?**
J: ~€500-1,000/muaj për hosting, APIs, dhe support.

**P: A mund të bëjmë vetë?**
J: Po, nëse keni 1-2 zhvillues full-time. Përndryshe rekomandojmë të angazhoni ekip.

**P: Sa kohë për production?**
J: Me Fazën 1 completed: 2 javë. Me të gjitha fazat: 3 muaj.

---

*Krijuar: 7 Shkurt 2026*
*Autor: Claude AI Development Plan*
