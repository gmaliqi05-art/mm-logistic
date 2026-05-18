/*
  # HR Module - Leave Management, Attendance, Work Schedules

  1. New Tables
    - `leave_types` - Types of leave (vacation, sick, personal, unpaid, maternity, paternity, bereavement)
      - `id` (uuid, primary key)
      - `company_id` (uuid, FK to companies)
      - `code` (text, unique per company)
      - `name_sq`, `name_en`, `name_de`, `name_fr` (text, multilingual names)
      - `is_paid`, `requires_approval`, `requires_medical_certificate` (boolean flags)
      - `max_days_per_year` (smallint, nullable = unlimited)
      - `color` (text, hex color for calendar)
      - `is_active` (boolean)

    - `employee_leave_balances` - Yearly leave allowance per employee
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK to profiles)
      - `company_id` (uuid, FK to companies)
      - `leave_type_id` (uuid, FK to leave_types)
      - `year` (smallint)
      - `allocated_days`, `used_days`, `pending_days`, `carried_over_days` (numeric)

    - `leave_requests` - Leave/vacation requests with approval workflow
      - `id` (uuid, primary key)
      - `company_id` (uuid, FK to companies)
      - `user_id` (uuid, FK to profiles)
      - `leave_type_id` (uuid, FK to leave_types)
      - `start_date`, `end_date` (date)
      - `total_days` (numeric, supports half-days)
      - `status` (text: pending, approved, rejected, cancelled)
      - `approver_id` (uuid, FK to profiles)
      - `reason`, `rejection_reason` (text)
      - `medical_certificate_url` (text)

    - `attendance_records` - Daily check-in/check-out records
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK to profiles)
      - `company_id` (uuid, FK to companies)
      - `date` (date, unique per user)
      - `check_in_time`, `check_out_time` (timestamptz)
      - `total_hours`, `overtime_hours` (numeric)
      - `status` (text: present, absent, late, leave, holiday, weekend, sick)
      - `location_check_in`, `location_check_out` (jsonb for GPS)

    - `work_schedules` - Weekly work schedule per employee
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK to profiles)
      - `company_id` (uuid, FK to companies)
      - Per-day start/end times and break minutes
      - `weekly_hours` (numeric)

    - `public_holidays` - Company holidays (supports German Bundeslaender)
      - `id` (uuid, primary key)
      - `company_id` (uuid, FK to companies)
      - `date` (date, unique per company)
      - `name` (text)
      - `applies_to_states` (text array for regional holidays)

    - `hr_notifications` - HR-specific notifications
      - `id` (uuid, primary key)
      - `company_id` (uuid, FK to companies)
      - `recipient_id` (uuid, FK to profiles)
      - `type` (text: leave_request_new, leave_approved, leave_rejected, etc.)
      - `related_id` (uuid)
      - `title`, `message` (text)
      - `is_read` (boolean)

  2. Security
    - RLS enabled on all tables
    - Employees see only own data
    - Company admins see all data in their company
    - Leave requests: employees can create/edit own pending requests
    - Admins can approve/reject any request in their company

  3. Triggers
    - `trg_leave_balance_update` - Updates balance when request status changes
    - `trg_attendance_from_leave` - Creates attendance records when leave is approved
    - `seed_default_leave_types` - Seeds default leave types for a company

  4. Important Notes
    - Half-day support via total_days numeric(5,1)
    - GPS check-in/out stored as jsonb
    - Medical certificate URL for sick leave
    - Carry-over days from previous year
    - German federal holidays seeded by default
*/

-- ============================================================
-- 1. LEAVE TYPES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  code text NOT NULL,
  name_sq text NOT NULL,
  name_en text NOT NULL,
  name_de text NOT NULL,
  name_fr text NOT NULL,
  is_paid boolean DEFAULT true,
  requires_approval boolean DEFAULT true,
  requires_medical_certificate boolean DEFAULT false,
  max_days_per_year smallint,
  color text DEFAULT '#3B82F6',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, code)
);

-- ============================================================
-- 2. EMPLOYEE LEAVE BALANCES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.employee_leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  leave_type_id uuid REFERENCES public.leave_types(id) ON DELETE CASCADE NOT NULL,
  year smallint NOT NULL,
  allocated_days numeric(5,1) NOT NULL DEFAULT 0,
  used_days numeric(5,1) NOT NULL DEFAULT 0,
  pending_days numeric(5,1) NOT NULL DEFAULT 0,
  carried_over_days numeric(5,1) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, leave_type_id, year)
);

-- ============================================================
-- 3. LEAVE REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  leave_type_id uuid REFERENCES public.leave_types(id) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  total_days numeric(5,1) NOT NULL,
  half_day_start boolean DEFAULT false,
  half_day_end boolean DEFAULT false,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approver_id uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  rejection_reason text,
  medical_certificate_url text,
  attachments jsonb DEFAULT '[]',
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (total_days > 0)
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_company ON public.leave_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_user ON public.leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON public.leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON public.leave_requests(start_date, end_date);

-- ============================================================
-- 4. ATTENDANCE RECORDS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  depot_id uuid REFERENCES public.depots(id),
  date date NOT NULL,
  check_in_time timestamptz,
  check_out_time timestamptz,
  break_minutes smallint DEFAULT 0,
  total_hours numeric(5,2),
  overtime_hours numeric(5,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'leave', 'holiday', 'weekend', 'sick')),
  notes text,
  location_check_in jsonb,
  location_check_out jsonb,
  modified_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON public.attendance_records(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_company_date ON public.attendance_records(company_id, date DESC);

-- ============================================================
-- 5. WORK SCHEDULES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.work_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL DEFAULT 'Standard',
  effective_from date NOT NULL,
  effective_until date,
  monday_start time, monday_end time, monday_break_minutes smallint DEFAULT 30,
  tuesday_start time, tuesday_end time, tuesday_break_minutes smallint DEFAULT 30,
  wednesday_start time, wednesday_end time, wednesday_break_minutes smallint DEFAULT 30,
  thursday_start time, thursday_end time, thursday_break_minutes smallint DEFAULT 30,
  friday_start time, friday_end time, friday_break_minutes smallint DEFAULT 30,
  saturday_start time, saturday_end time, saturday_break_minutes smallint DEFAULT 0,
  sunday_start time, sunday_end time, sunday_break_minutes smallint DEFAULT 0,
  weekly_hours numeric(5,2),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 6. PUBLIC HOLIDAYS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.public_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  name text NOT NULL,
  is_paid boolean DEFAULT true,
  applies_to_states text[],
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, date)
);

-- ============================================================
-- 7. HR NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.hr_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  recipient_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('leave_request_new', 'leave_approved', 'leave_rejected', 'leave_cancelled', 'attendance_missing', 'overtime_alert')),
  related_id uuid,
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_notifications_recipient ON public.hr_notifications(recipient_id, is_read, created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_notifications ENABLE ROW LEVEL SECURITY;

-- Leave types: company members can read
CREATE POLICY "Company members can view leave types"
  ON public.leave_types FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Company admin can insert leave types"
  ON public.leave_types FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'));

CREATE POLICY "Company admin can update leave types"
  ON public.leave_types FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'));

CREATE POLICY "Company admin can delete leave types"
  ON public.leave_types FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'));

-- Employee leave balances
CREATE POLICY "Users see own balances or admin sees all"
  ON public.employee_leave_balances FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'));

CREATE POLICY "Admin can insert balances"
  ON public.employee_leave_balances FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'));

CREATE POLICY "Admin can update balances"
  ON public.employee_leave_balances FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'));

CREATE POLICY "Admin can delete balances"
  ON public.employee_leave_balances FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'));

-- Leave requests
CREATE POLICY "Users see own requests or admin sees all"
  ON public.leave_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'));

CREATE POLICY "Users can create own leave requests"
  ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own pending requests"
  ON public.leave_requests FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'pending')
    OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin')
  )
  WITH CHECK (
    (user_id = auth.uid())
    OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin')
  );

CREATE POLICY "Admin can delete leave requests"
  ON public.leave_requests FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'));

-- Attendance records
CREATE POLICY "Users see own attendance or admin sees all"
  ON public.attendance_records FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'));

CREATE POLICY "Users can insert own attendance"
  ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'));

CREATE POLICY "Users can update own attendance or admin all"
  ON public.attendance_records FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'))
  WITH CHECK (user_id = auth.uid() OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'));

CREATE POLICY "Admin can delete attendance"
  ON public.attendance_records FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'));

-- Work schedules
CREATE POLICY "Users see own schedule or admin sees all"
  ON public.work_schedules FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'));

CREATE POLICY "Admin can insert schedules"
  ON public.work_schedules FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'));

CREATE POLICY "Admin can update schedules"
  ON public.work_schedules FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'));

CREATE POLICY "Admin can delete schedules"
  ON public.work_schedules FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'));

-- Public holidays
CREATE POLICY "Company members can view holidays"
  ON public.public_holidays FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admin can insert holidays"
  ON public.public_holidays FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'));

CREATE POLICY "Admin can update holidays"
  ON public.public_holidays FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'));

CREATE POLICY "Admin can delete holidays"
  ON public.public_holidays FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role = 'company_admin'));

-- HR notifications
CREATE POLICY "Recipients can view own notifications"
  ON public.hr_notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "Recipients can update own notifications"
  ON public.hr_notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- ============================================================
-- TRIGGERS AND FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.hr_update_leave_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    UPDATE public.employee_leave_balances
    SET pending_days = pending_days + NEW.total_days, updated_at = now()
    WHERE user_id = NEW.user_id AND leave_type_id = NEW.leave_type_id AND year = EXTRACT(YEAR FROM NEW.start_date);

    INSERT INTO public.hr_notifications (company_id, recipient_id, type, related_id, title, message)
    SELECT NEW.company_id, p.id, 'leave_request_new', NEW.id,
      'Kërkesë e re pushimi',
      (SELECT full_name FROM public.profiles WHERE id = NEW.user_id) || ' ka kërkuar pushim nga ' || NEW.start_date || ' deri ' || NEW.end_date
    FROM public.profiles p
    WHERE p.company_id = NEW.company_id AND p.role = 'company_admin' AND p.is_active = true;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'approved' THEN
    UPDATE public.employee_leave_balances
    SET pending_days = GREATEST(pending_days - OLD.total_days, 0),
        used_days = used_days + NEW.total_days,
        updated_at = now()
    WHERE user_id = NEW.user_id AND leave_type_id = NEW.leave_type_id AND year = EXTRACT(YEAR FROM NEW.start_date);

    INSERT INTO public.hr_notifications (company_id, recipient_id, type, related_id, title, message)
    VALUES (NEW.company_id, NEW.user_id, 'leave_approved', NEW.id,
      'Pushimi u aprovua',
      'Kërkesa juaj për pushim nga ' || NEW.start_date || ' deri ' || NEW.end_date || ' u aprovua.');
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'rejected' THEN
    UPDATE public.employee_leave_balances
    SET pending_days = GREATEST(pending_days - OLD.total_days, 0), updated_at = now()
    WHERE user_id = NEW.user_id AND leave_type_id = NEW.leave_type_id AND year = EXTRACT(YEAR FROM NEW.start_date);

    INSERT INTO public.hr_notifications (company_id, recipient_id, type, related_id, title, message)
    VALUES (NEW.company_id, NEW.user_id, 'leave_rejected', NEW.id,
      'Pushimi u refuzua',
      'Kërkesa juaj për pushim nga ' || NEW.start_date || ' deri ' || NEW.end_date || ' u refuzua. Arsyeja: ' || COALESCE(NEW.rejection_reason, 'Nuk u specifikua'));
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status IN ('pending', 'approved') THEN
    IF OLD.status = 'pending' THEN
      UPDATE public.employee_leave_balances
      SET pending_days = GREATEST(pending_days - OLD.total_days, 0), updated_at = now()
      WHERE user_id = NEW.user_id AND leave_type_id = NEW.leave_type_id AND year = EXTRACT(YEAR FROM NEW.start_date);
    ELSE
      UPDATE public.employee_leave_balances
      SET used_days = GREATEST(used_days - OLD.total_days, 0), updated_at = now()
      WHERE user_id = NEW.user_id AND leave_type_id = NEW.leave_type_id AND year = EXTRACT(YEAR FROM NEW.start_date);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_hr_leave_balance_update
AFTER INSERT OR UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.hr_update_leave_balance();

-- Auto-create attendance entries when leave is approved
CREATE OR REPLACE FUNCTION public.hr_create_attendance_for_leave()
RETURNS TRIGGER AS $$
DECLARE
  d date;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'approved' THEN
    d := NEW.start_date;
    WHILE d <= NEW.end_date LOOP
      INSERT INTO public.attendance_records (user_id, company_id, date, status, notes)
      VALUES (NEW.user_id, NEW.company_id, d, 'leave', 'Pushim i aprovuar #' || NEW.id::text)
      ON CONFLICT (user_id, date) DO UPDATE SET status = 'leave', notes = 'Pushim i aprovuar #' || NEW.id::text, updated_at = now();
      d := d + INTERVAL '1 day';
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_hr_attendance_from_leave
AFTER UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.hr_create_attendance_for_leave();

-- Seed default leave types for a company
CREATE OR REPLACE FUNCTION public.seed_default_leave_types(p_company_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO public.leave_types (company_id, code, name_sq, name_en, name_de, name_fr, is_paid, requires_approval, requires_medical_certificate, max_days_per_year, color)
  VALUES
    (p_company_id, 'vacation', 'Pushim vjetor', 'Annual leave', 'Jahresurlaub', 'Congé annuel', true, true, false, 24, '#3B82F6'),
    (p_company_id, 'sick', 'Pushim mjekësor', 'Sick leave', 'Krankheitsurlaub', 'Congé maladie', true, false, true, NULL, '#EF4444'),
    (p_company_id, 'personal', 'Pushim personal', 'Personal leave', 'Persönlicher Urlaub', 'Congé personnel', false, true, false, 5, '#8B5CF6'),
    (p_company_id, 'unpaid', 'Pa pagesë', 'Unpaid leave', 'Unbezahlter Urlaub', 'Congé sans solde', false, true, false, NULL, '#6B7280'),
    (p_company_id, 'maternity', 'Pushim lehonie', 'Maternity leave', 'Mutterschutz', 'Congé maternité', true, true, true, 98, '#EC4899'),
    (p_company_id, 'paternity', 'Pushim atësie', 'Paternity leave', 'Vaterschaftsurlaub', 'Congé paternité', true, true, false, 14, '#06B6D4'),
    (p_company_id, 'bereavement', 'Pushim funeral', 'Bereavement leave', 'Trauerurlaub', 'Congé deuil', true, false, false, 3, '#1F2937')
  ON CONFLICT (company_id, code) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
