import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

type Mode = "vehicle" | "driver";

interface Payload {
  scanId: string;
  mode: Mode;
  docCategory?: string;
}

interface Extracted {
  doc_category: string;
  vehicle: {
    license_plate: string;
    vin: string;
    zb1_number: string;
    zb2_number: string;
    brand: string;
    model: string;
    first_registration: string;
    max_weight_kg: number;
    payload_kg: number;
    axles: number;
    euro_emission: string;
    fuel_type: string;
    engine_power_kw: number;
    color: string;
  };
  inspection: {
    inspection_type: string;
    issued_date: string;
    expiry_date: string;
    provider: string;
    certificate_number: string;
  };
  insurance: {
    insurance_type: string;
    provider: string;
    policy_number: string;
    start_date: string;
    end_date: string;
    premium_amount: number;
  };
  tax: {
    tax_year: number;
    amount: number;
    due_date: string;
    paid_at: string;
  };
  driver: {
    full_name: string;
    birth_date: string;
  };
  license: {
    license_number: string;
    license_categories: string[];
    issued_date: string;
    issued_country: string;
    issuing_authority: string;
    expiry_date: string;
  };
  qualification: {
    qualification_type: string;
    number: string;
    issued_date: string;
    expiry_date: string;
    module_hours: number;
    issuing_authority: string;
  };
  medical: {
    exam_type: string;
    exam_date: string;
    expiry_date: string;
    doctor: string;
  };
  confidence: number;
  notes: string;
}

function emptyExtracted(): Extracted {
  return {
    doc_category: "other",
    vehicle: {
      license_plate: "", vin: "", zb1_number: "", zb2_number: "",
      brand: "", model: "", first_registration: "",
      max_weight_kg: 0, payload_kg: 0, axles: 0,
      euro_emission: "", fuel_type: "", engine_power_kw: 0, color: "",
    },
    inspection: { inspection_type: "", issued_date: "", expiry_date: "", provider: "", certificate_number: "" },
    insurance: { insurance_type: "", provider: "", policy_number: "", start_date: "", end_date: "", premium_amount: 0 },
    tax: { tax_year: 0, amount: 0, due_date: "", paid_at: "" },
    driver: { full_name: "", birth_date: "" },
    license: { license_number: "", license_categories: [], issued_date: "", issued_country: "DE", issuing_authority: "", expiry_date: "" },
    qualification: { qualification_type: "", number: "", issued_date: "", expiry_date: "", module_hours: 0, issuing_authority: "" },
    medical: { exam_type: "g25", exam_date: "", expiry_date: "", doctor: "" },
    confidence: 0,
    notes: "",
  };
}

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function buildVehiclePrompt(hintedCategory: string): string {
  return `You extract structured data from German vehicle/fleet documents. Identify the document type and extract all relevant fields. Reply with ONLY valid JSON matching this TypeScript schema (no prose, no markdown fences):

{
  "doc_category": "zulassung" | "hu_tuv" | "au" | "sp" | "uvv" | "tacho" | "haftpflicht" | "vollkasko" | "teilkasko" | "ladung" | "kfz_steuer" | "other",
  "vehicle": {
    "license_plate": string,
    "vin": string,
    "zb1_number": string,
    "zb2_number": string,
    "brand": string,
    "model": string,
    "first_registration": "YYYY-MM-DD" | "",
    "max_weight_kg": number,
    "payload_kg": number,
    "axles": number,
    "euro_emission": string,
    "fuel_type": string,
    "engine_power_kw": number,
    "color": string
  },
  "inspection": {
    "inspection_type": "hu_tuv" | "au" | "uvv" | "sp" | "tacho" | "other" | "",
    "issued_date": "YYYY-MM-DD" | "",
    "expiry_date": "YYYY-MM-DD" | "",
    "provider": string,
    "certificate_number": string
  },
  "insurance": {
    "insurance_type": "haftpflicht" | "vollkasko" | "teilkasko" | "ladung" | "other" | "",
    "provider": string,
    "policy_number": string,
    "start_date": "YYYY-MM-DD" | "",
    "end_date": "YYYY-MM-DD" | "",
    "premium_amount": number
  },
  "tax": {
    "tax_year": number,
    "amount": number,
    "due_date": "YYYY-MM-DD" | "",
    "paid_at": "YYYY-MM-DD" | ""
  },
  "confidence": number,
  "notes": string
}

Category guidance:
- "zulassung": Zulassungsbescheinigung Teil I (Fahrzeugschein) or Teil II (Fahrzeugbrief). Extract VIN (Fahrzeug-Ident.-Nr.), license plate (Kennzeichen), ZB I/II number, brand (Marke), type (Handelsbezeichnung), first registration (Erstzulassung), max weight (zul. Gesamtmasse), axles (Achsen), emission class (Schadstoffklasse/Euro), fuel (Kraftstoff), power in kW.
- "hu_tuv": Hauptuntersuchung certificate. Extract expiry (next HU date), issuer (TUV/DEKRA/GTU).
- "au": Abgasuntersuchung
- "sp": Sicherheitsprufung (6-monthly for trailers over 10t)
- "uvv": UVV-Prufung (annual BG inspection)
- "tacho": Tachograph calibration
- "haftpflicht"/"vollkasko"/"teilkasko": Insurance policy. Extract policy number, provider, period, premium.
- "ladung": Ladungsversicherung (cargo insurance)
- "kfz_steuer": Kraftfahrzeugsteuer-Bescheid from Zollamt. Extract amount, due date, year.

${hintedCategory ? `User hint: the document is expected to be "${hintedCategory}". Use this hint but override if document clearly says otherwise.` : ""}

Dates MUST be ISO (YYYY-MM-DD). Numbers are plain (no thousands separator). License plate in German format (e.g. "B-AB 1234"). Only fill fields relevant to the detected category; leave others empty/zero.`;
}

function buildDriverPrompt(hintedCategory: string): string {
  return `You extract structured data from German driver compliance documents. Reply with ONLY valid JSON (no prose, no markdown):

{
  "doc_category": "fuehrerschein" | "kod95" | "adr" | "fahrerkarte" | "gabelstapler" | "ladungssicherung" | "erste_hilfe" | "g25_medical" | "other",
  "driver": {
    "full_name": string,
    "birth_date": "YYYY-MM-DD" | ""
  },
  "license": {
    "license_number": string,
    "license_categories": string[],
    "issued_date": "YYYY-MM-DD" | "",
    "issued_country": string,
    "issuing_authority": string,
    "expiry_date": "YYYY-MM-DD" | ""
  },
  "qualification": {
    "qualification_type": "kod95" | "adr" | "fahrerkarte" | "gabelstapler" | "ladungssicherung" | "erste_hilfe" | "other" | "",
    "number": string,
    "issued_date": "YYYY-MM-DD" | "",
    "expiry_date": "YYYY-MM-DD" | "",
    "module_hours": number,
    "issuing_authority": string
  },
  "medical": {
    "exam_type": "g25" | "other",
    "exam_date": "YYYY-MM-DD" | "",
    "expiry_date": "YYYY-MM-DD" | "",
    "doctor": string
  },
  "confidence": number,
  "notes": string
}

Category guidance:
- "fuehrerschein": EU driving licence (plastic card or paper). Extract name (field 1/2), birth date (field 3), categories from field 9 (B, BE, C, C1, C1E, CE, D, DE, T, L etc.), issue date per-category in field 10, expiry per-category in field 11, licence number (field 5), issuing authority (field 4c), country.
- "kod95": BKrFQG qualification entry (Schlusselzahl 95) - either on the back of the Fuhrerschein next to each C/D category or on a separate Fahrerqualifizierungsnachweis card. Extract expiry date. Module hours default 35 over 5 years.
- "adr": ADR Bescheinigung (dangerous goods). Extract number, classes covered, expiry.
- "fahrerkarte": Driver tachograph card. Extract card number, expiry (5 years validity).
- "gabelstapler": Forklift licence.
- "g25_medical": Arbeitsmedizinische Vorsorge G25 (Fahr-, Steuer- und Uberwachungstatigkeiten). Extract exam date, next exam / expiry, doctor name.

${hintedCategory ? `User hint: the document is expected to be "${hintedCategory}". Use the hint but override if document disagrees.` : ""}

Dates MUST be ISO. Categories are uppercase letters. Only fill fields relevant to the detected category; leave others empty.`;
}

async function aiExtract(base64: string, mime: string, mode: Mode, hintedCategory: string): Promise<Extracted> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("NO_AI_KEY");
  const prompt = mode === "driver" ? buildDriverPrompt(hintedCategory) : buildVehiclePrompt(hintedCategory);
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: mime === "application/pdf" ? "document" : "image",
              source: { type: "base64", media_type: mime, data: base64 },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Anthropic API error: ${resp.status} ${errText.slice(0, 200)}`);
  }
  const json = await resp.json();
  const content = json.content?.[0]?.text ?? "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI response not JSON");
  const parsed = JSON.parse(match[0]);
  return { ...emptyExtracted(), ...parsed };
}

function regexFallback(_mode: Mode): Extracted {
  const r = emptyExtracted();
  r.notes = "AI indisponibel - ekstraktim i kufizuar. Ju lutem plotesoni manualisht.";
  r.confidence = 0.1;
  return r;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { scanId, mode, docCategory }: Payload = await req.json();
    if (!scanId) throw new Error("scanId required");
    if (!mode) throw new Error("mode required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: scan, error: scanErr } = await supabase
      .from("fleet_scanned_documents")
      .select("*")
      .eq("id", scanId)
      .maybeSingle();

    if (scanErr || !scan) throw new Error("Scan not found");

    await supabase.from("fleet_scanned_documents").update({ status: "processing" }).eq("id", scanId);

    const { data: fileData, error: fileErr } = await supabase.storage
      .from("fleet-scans")
      .download(scan.storage_path);
    if (fileErr || !fileData) throw new Error("File download failed");

    const buf = new Uint8Array(await fileData.arrayBuffer());
    const mime = scan.file_mime || "application/octet-stream";
    let extracted: Extracted;

    try {
      if (IMAGE_MIMES.includes(mime) || mime === "application/pdf") {
        let b64 = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < buf.length; i += chunkSize) {
          b64 += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunkSize)));
        }
        const base64 = btoa(b64);
        extracted = await aiExtract(base64, mime, mode, docCategory || "");
      } else {
        throw new Error("Formati i skedarit nuk mbeshtetet. Perdorni PDF ose foto.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("NO_AI_KEY")) {
        extracted = regexFallback(mode);
      } else {
        throw err;
      }
    }

    await supabase
      .from("fleet_scanned_documents")
      .update({
        status: "parsed",
        detected_category: extracted.doc_category || "other",
        extracted_json: extracted,
        updated_at: new Date().toISOString(),
      })
      .eq("id", scanId);

    return new Response(
      JSON.stringify({ success: true, extracted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    try {
      const { scanId } = (await req.clone().json().catch(() => ({}))) as Payload;
      if (scanId) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await supabase
          .from("fleet_scanned_documents")
          .update({ status: "failed", error_message: message })
          .eq("id", scanId);
      }
    } catch {
      // ignore
    }
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
