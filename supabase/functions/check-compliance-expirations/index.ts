import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireCaller, isServiceRoleCall } from "../_shared/requireCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const THRESHOLDS = [
  { days: 90, flag: "reminder_90d_sent" },
  { days: 60, flag: "reminder_60d_sent" },
  { days: 30, flag: "reminder_30d_sent" },
  { days: 14, flag: "reminder_14d_sent" },
  { days: 7, flag: "reminder_7d_sent" },
  { days: 0, flag: "expired_sent" },
];

const TYPE_LABELS: Record<string, string> = {
  license: "Patenta",
  kod95: "Kod 95 (BKrFQG)",
  adr: "ADR",
  fahrerkarte: "Fahrerkarte",
  gabelstapler: "Gabelstapler",
  g25: "G25 Mjeksor",
  g37: "G37 Mjeksor",
  g41: "G41 Mjeksor",
  hu_tuv: "HU/TUV",
  au: "AU (Emisionet)",
  uvv: "UVV",
  sp: "SP (Sicherheitsprufung)",
  tacho: "Tachograph",
  haftpflicht: "Haftpflicht (Sigurimi)",
  vollkasko: "Vollkasko",
  teilkasko: "Teilkasko",
  ladung: "Ladungsversicherung",
  kfz_steuer: "Kfz-Steuer",
  national_id: "Karta e Identitetit",
  passport: "Pasaporta",
  residence_permit: "Leja e Qendrimit",
  work_visa: "Viza e Punes",
};

function daysBetween(dateStr: string): number {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Cron uses service-role bearer; UI "run now" button uses a user session.
  if (!isServiceRoleCall(req)) {
    const caller = await requireCaller(req, { corsHeaders, roles: ["super_admin", "company_admin"] });
    if (!caller.ok) return caller.response;
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    type Item = {
      entity: "vehicle" | "driver";
      entityId: string;
      companyId: string;
      type: string;
      expiryDate: string;
      label: string;
    };
    const items: Item[] = [];

    const { data: vehicles } = await supabase
      .from("vehicles")
      .select("id, company_id, license_plate, brand, model");
    const vMap = new Map<string, { companyId: string; label: string }>();
    (vehicles || []).forEach((v) => vMap.set(v.id, {
      companyId: v.company_id,
      label: `${v.license_plate || ""} ${v.brand || ""} ${v.model || ""}`.trim(),
    }));

    const { data: drivers } = await supabase
      .from("profiles")
      .select("id, company_id, full_name")
      .eq("role", "driver");
    const dMap = new Map<string, { companyId: string; label: string }>();
    (drivers || []).forEach((d) => dMap.set(d.id, {
      companyId: d.company_id,
      label: d.full_name,
    }));

    const { data: inspections } = await supabase
      .from("vehicle_inspections")
      .select("vehicle_id, inspection_type, expiry_date");
    (inspections || []).forEach((r) => {
      const v = vMap.get(r.vehicle_id);
      if (v) items.push({ entity: "vehicle", entityId: r.vehicle_id, companyId: v.companyId, type: r.inspection_type, expiryDate: r.expiry_date, label: v.label });
    });
    const { data: insur } = await supabase
      .from("vehicle_insurance")
      .select("vehicle_id, insurance_type, end_date");
    (insur || []).forEach((r) => {
      const v = vMap.get(r.vehicle_id);
      if (v) items.push({ entity: "vehicle", entityId: r.vehicle_id, companyId: v.companyId, type: r.insurance_type, expiryDate: r.end_date, label: v.label });
    });
    const { data: taxes } = await supabase
      .from("vehicle_taxes")
      .select("vehicle_id, due_date, paid_at")
      .is("paid_at", null);
    (taxes || []).forEach((r) => {
      const v = vMap.get(r.vehicle_id);
      if (v) items.push({ entity: "vehicle", entityId: r.vehicle_id, companyId: v.companyId, type: "kfz_steuer", expiryDate: r.due_date, label: v.label });
    });

    const { data: lic } = await supabase
      .from("driver_licenses")
      .select("driver_id, expiry_date");
    (lic || []).forEach((r) => {
      const d = dMap.get(r.driver_id);
      if (d) items.push({ entity: "driver", entityId: r.driver_id, companyId: d.companyId, type: "license", expiryDate: r.expiry_date, label: d.label });
    });
    const { data: quals } = await supabase
      .from("driver_qualifications")
      .select("driver_id, qualification_type, expiry_date");
    (quals || []).forEach((r) => {
      const d = dMap.get(r.driver_id);
      if (d) items.push({ entity: "driver", entityId: r.driver_id, companyId: d.companyId, type: r.qualification_type, expiryDate: r.expiry_date, label: d.label });
    });
    const { data: meds } = await supabase
      .from("driver_medical")
      .select("driver_id, exam_type, expiry_date");
    (meds || []).forEach((r) => {
      const d = dMap.get(r.driver_id);
      if (d) items.push({ entity: "driver", entityId: r.driver_id, companyId: d.companyId, type: r.exam_type, expiryDate: r.expiry_date, label: d.label });
    });
    const { data: idDocs } = await supabase
      .from("driver_identity_documents")
      .select("driver_id, document_type, expiry_date");
    (idDocs || []).forEach((r) => {
      const d = dMap.get(r.driver_id);
      if (d && r.expiry_date) items.push({ entity: "driver", entityId: r.driver_id, companyId: d.companyId, type: r.document_type, expiryDate: r.expiry_date, label: d.label });
    });

    let notificationsCreated = 0;

    const companyAdminsByCompany = new Map<string, { id: string; email: string | null; locale: string }[]>();
    const { data: admins } = await supabase
      .from("profiles")
      .select("id, company_id, email, locale")
      .in("role", ["company_admin", "logistics_admin"])
      .eq("is_active", true);
    (admins || []).forEach((a) => {
      if (!a.company_id) return;
      const list = companyAdminsByCompany.get(a.company_id) || [];
      list.push({ id: a.id, email: a.email ?? null, locale: a.locale ?? "sq" });
      companyAdminsByCompany.set(a.company_id, list);
    });

    for (const item of items) {
      const days = daysBetween(item.expiryDate);

      const { data: existing } = await supabase
        .from("compliance_reminders")
        .select("*")
        .eq("entity_type", item.entity)
        .eq("entity_id", item.entityId)
        .eq("compliance_type", item.type)
        .maybeSingle();

      let reminder = existing;
      if (!reminder) {
        const { data: created } = await supabase
          .from("compliance_reminders")
          .insert({
            company_id: item.companyId,
            entity_type: item.entity,
            entity_id: item.entityId,
            compliance_type: item.type,
            expiry_date: item.expiryDate,
          })
          .select("*")
          .maybeSingle();
        reminder = created;
      } else if (reminder.expiry_date !== item.expiryDate) {
        const { data: updated } = await supabase
          .from("compliance_reminders")
          .update({
            expiry_date: item.expiryDate,
            reminder_90d_sent: false,
            reminder_60d_sent: false,
            reminder_30d_sent: false,
            reminder_14d_sent: false,
            reminder_7d_sent: false,
            expired_sent: false,
          })
          .eq("id", reminder.id)
          .select("*")
          .maybeSingle();
        reminder = updated;
      }
      if (!reminder) continue;

      for (const th of THRESHOLDS) {
        if (days > th.days) continue;
        if (th.days === 0 && days > 0) continue;
        if (reminder[th.flag]) continue;

        const admins = companyAdminsByCompany.get(item.companyId) || [];
        const typeLabel = TYPE_LABELS[item.type] || item.type;
        const subject = item.entity === "vehicle" ? "Mjeti" : "Shoferi";
        const title = days < 0
          ? `${typeLabel} ka skaduar`
          : days === 0
            ? `${typeLabel} skadon sot`
            : `${typeLabel} skadon per ${days} dite`;
        const message = `${subject} ${item.label}: ${typeLabel} - data ${item.expiryDate}.`;

        const sendUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

        // Notify the driver directly about their own expiring documents
        if (item.entity === "driver") {
          await supabase.from("notifications").insert({
            user_id: item.entityId,
            title,
            message: `${typeLabel} - data ${item.expiryDate}.`,
            type: "compliance",
            data: {
              entity: item.entity,
              entity_id: item.entityId,
              compliance_type: item.type,
              days_remaining: days,
              expiry_date: item.expiryDate,
            },
          });
          notificationsCreated++;
        }

        for (const admin of admins) {
          await supabase.from("notifications").insert({
            user_id: admin.id,
            title,
            message,
            type: "compliance",
            data: {
              entity: item.entity,
              entity_id: item.entityId,
              compliance_type: item.type,
              days_remaining: days,
              expiry_date: item.expiryDate,
            },
          });
          notificationsCreated++;

          if (admin.email) {
            try {
              await fetch(sendUrl, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${serviceKey}`,
                  apikey: serviceKey,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  template_code: "compliance_expiring",
                  to: admin.email,
                  user_id: admin.id,
                  company_id: item.companyId,
                  locale: admin.locale,
                  data: {
                    type_label: typeLabel,
                    subject_label: `${subject} ${item.label}`,
                    days_remaining: days,
                    expiry_date: item.expiryDate,
                  },
                }),
              });
            } catch (_e) {
              // best-effort
            }
          }
        }

        await supabase
          .from("compliance_reminders")
          .update({ [th.flag]: true, last_notified_at: new Date().toISOString() })
          .eq("id", reminder.id);
        break;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, items_checked: items.length, notifications_created: notificationsCreated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
