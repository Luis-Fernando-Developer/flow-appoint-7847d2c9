import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TimeSlot {
  time: string;
  employee_id: string;
  employee_name: string;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let company_id: string, service_id: string, date: string;
    let employee_id: string | undefined;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      company_id = url.searchParams.get('company_id') || '';
      service_id = url.searchParams.get('service_id') || '';
      employee_id = url.searchParams.get('employee_id') || undefined;
      date = url.searchParams.get('date') || '';
    } else {
      const body = await req.json();
      company_id = body.company_id;
      service_id = body.service_id;
      employee_id = body.employee_id;
      date = body.date;
    }

    console.log(`[get-availability] company=${company_id} service=${service_id} employee=${employee_id} date=${date}`);

    if (!company_id || !service_id || !date) {
      return new Response(JSON.stringify({ error: 'Parâmetros obrigatórios ausentes' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const [yy, mm, dd] = date.split('-').map(Number);
    const requestDate = new Date(yy, mm - 1, dd);
    const dayOfWeek = requestDate.getDay();

    // Settings
    const { data: settings } = await supabase
      .from('company_schedule_settings')
      .select('*')
      .eq('company_id', company_id)
      .maybeSingle();

    const slotDuration = settings?.slot_duration_minutes || 30;
    const minAdvanceHours = settings?.min_advance_hours ?? 1;

    // Business hours
    const { data: businessHours } = await supabase
      .from('business_hours')
      .select('*')
      .eq('company_id', company_id)
      .eq('day_of_week', dayOfWeek)
      .maybeSingle();

    if (!businessHours || !businessHours.is_open) {
      return new Response(JSON.stringify({ slots: [], availability: [], message: 'Estabelecimento fechado neste dia' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Service
    const { data: service } = await supabase
      .from('services')
      .select('duration_minutes, duration')
      .eq('id', service_id)
      .single();

    if (!service) {
      return new Response(JSON.stringify({ error: 'Serviço não encontrado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const serviceDuration = service.duration_minutes || service.duration || 30;

    // Employees linked to this service
    let employeeQuery = supabase
      .from('employees')
      .select('id, name, employee_services!inner(service_id)')
      .eq('company_id', company_id)
      .eq('is_active', true)
      .eq('employee_services.service_id', service_id);

    if (employee_id) employeeQuery = employeeQuery.eq('id', employee_id);

    const { data: employees, error: empErr } = await employeeQuery;
    if (empErr) console.error('[get-availability] emp error', empErr);

    if (!employees || employees.length === 0) {
      return new Response(JSON.stringify({ slots: [], availability: [], message: 'Nenhum profissional disponível para este serviço' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Day boundaries for blocked_slots (datetime)
    const dayStartIso = `${date}T00:00:00`;
    const dayEndIso = `${date}T23:59:59`;

    const allSlots: TimeSlot[] = [];
    const availabilityByEmployee: { employee_id: string; employee_name: string; slots: string[] }[] = [];

    for (const employee of employees) {
      console.log(`[get-availability] processing ${employee.name}`);

      // Absences (employee_absences or absences)
      const { data: absences } = await supabase
        .from('employee_absences')
        .select('id')
        .eq('employee_id', employee.id)
        .lte('start_date', date)
        .gte('end_date', date);
      if (absences && absences.length > 0) continue;

      // Try fixed schedule first
      let employeeStart: string | null = null;
      let employeeEnd: string | null = null;
      let breakStart: string | null = null;
      let breakEnd: string | null = null;

      const { data: schedule } = await supabase
        .from('employee_schedules')
        .select('*')
        .eq('employee_id', employee.id)
        .eq('day_of_week', dayOfWeek)
        .maybeSingle();

      if (schedule && schedule.is_working && schedule.start_time && schedule.end_time) {
        employeeStart = schedule.start_time;
        employeeEnd = schedule.end_time;
        breakStart = schedule.break_start;
        breakEnd = schedule.break_end;
      } else {
        // Autonomous availability fallback
        const { data: avail } = await supabase
          .from('employee_availability')
          .select('*')
          .eq('employee_id', employee.id)
          .eq('available_date', date)
          .maybeSingle();
        if (!avail) {
          console.log(`[get-availability] ${employee.name} no schedule/availability for ${date}`);
          continue;
        }
        employeeStart = avail.start_time;
        employeeEnd = avail.end_time;
        breakStart = avail.break_start;
        breakEnd = avail.break_end;
      }

      if (!employeeStart || !employeeEnd) continue;

      // Blocked slots for the day (employee or company-wide)
      const { data: blocks } = await supabase
        .from('blocked_slots')
        .select('*')
        .eq('company_id', company_id)
        .gte('start_datetime', dayStartIso)
        .lte('start_datetime', dayEndIso);

      const employeeBlocks = (blocks || []).filter(
        (b: any) => !b.employee_id || b.employee_id === employee.id
      );

      // Existing bookings
      const { data: bookings } = await supabase
        .from('bookings')
        .select('start_time, end_time, status')
        .eq('employee_id', employee.id)
        .eq('booking_date', date)
        .in('status', ['pending', 'confirmed']);

      const businessOpen = businessHours.open_time || '08:00';
      const businessClose = businessHours.close_time || '18:00';

      const effectiveStart = timeToMinutes(employeeStart) > timeToMinutes(businessOpen)
        ? employeeStart : businessOpen;
      const effectiveEnd = timeToMinutes(employeeEnd) < timeToMinutes(businessClose)
        ? employeeEnd : businessClose;

      const startMin = timeToMinutes(effectiveStart);
      const endMin = timeToMinutes(effectiveEnd);

      const employeeSlots: string[] = [];

      // Brazil now
      const nowBr = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });
      const [todayBr, timeBr] = nowBr.split(' ');

      for (let t = startMin; t + serviceDuration <= endMin; t += slotDuration) {
        const slotEnd = t + serviceDuration;

        if (date === todayBr) {
          const [hh, mn] = timeBr.split(':').map(Number);
          const nowMinutes = hh * 60 + mn;
          if (t < nowMinutes + minAdvanceHours * 60) continue;
        }

        // Break
        if (breakStart && breakEnd) {
          const bs = timeToMinutes(breakStart);
          const be = timeToMinutes(breakEnd);
          if (t < be && slotEnd > bs) continue;
        }

        // Blocked slots overlap
        let isBlocked = false;
        for (const b of employeeBlocks) {
          const bs = new Date(b.start_datetime);
          const be = new Date(b.end_datetime);
          const blockStartMin = bs.getHours() * 60 + bs.getMinutes();
          const blockEndMin = be.getHours() * 60 + be.getMinutes();
          if (t < blockEndMin && slotEnd > blockStartMin) {
            isBlocked = true;
            break;
          }
        }
        if (isBlocked) continue;

        // Booking conflict
        let conflict = false;
        for (const bk of bookings || []) {
          const bs = timeToMinutes(bk.start_time);
          const be = timeToMinutes(bk.end_time);
          if (t < be && slotEnd > bs) { conflict = true; break; }
        }
        if (conflict) continue;

        const slotTime = minutesToTime(t);
        employeeSlots.push(slotTime);
        allSlots.push({ time: slotTime, employee_id: employee.id, employee_name: employee.name });
      }

      if (employeeSlots.length > 0) {
        availabilityByEmployee.push({
          employee_id: employee.id,
          employee_name: employee.name,
          slots: employeeSlots,
        });
      }
    }

    allSlots.sort((a, b) => a.time.localeCompare(b.time));

    return new Response(
      JSON.stringify({ slots: allSlots, availability: availabilityByEmployee }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[get-availability] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
