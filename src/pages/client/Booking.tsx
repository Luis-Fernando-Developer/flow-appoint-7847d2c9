import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BookingLogo } from "@/components/BookingLogo";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  CalendarDays, 
  Clock, 
  DollarSign, 
  User, 
  Mail, 
  Phone,
  ArrowLeft,
  Check
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { getEdgeFunctionUrl } from "@/lib/supabaseHelpers";

import { BookingPaymentDialog } from "@/components/booking/BookingPaymentDialog";

interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  duration_minutes: number;
  image_url?: string;
  payment_required?: string;
}

interface Employee {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
}

interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
}

interface BookingForm {
  client_name: string;
  client_email: string;
  client_phone: string;
  notes: string;
}

export default function ClientBooking() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [company, setCompany] = useState<Company | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [combos, setCombos] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [availableDates, setAvailableDates] = useState<Date[]>([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [formData, setFormData] = useState<BookingForm>({
    client_name: "",
    client_email: "",
    client_phone: "",
    notes: ""
  });
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: Service, 2: Employee, 3: Date, 4: Time, 5: Auth, 6: Confirmation
  const [user, setUser] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [customization, setCustomization] = useState<any>(null);
  const [pendingEmployeeRestore, setPendingEmployeeRestore] = useState<string | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<{ open: boolean; bookingId?: string; amount?: number; allowLater?: boolean }>({ open: false });

  useEffect(() => {
    fetchCompanyAndServices();
    checkAuthState();
  }, [slug]);

  const checkAuthState = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      // Check if user is client in this company
      if (company) {
        const { data: clientData } = await supabase
          .from('clients')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('company_id', company.id)
          .single();
        
        if (clientData) {
          setClient(clientData);
        }
      }
    }
  };

  useEffect(() => {
    if (company) {
      checkAuthState();
    }
  }, [company]);

  useEffect(() => {
    if (selectedService) {
      fetchEmployeesForService();
    }
  }, [selectedService]);

  useEffect(() => {
    if (selectedEmployee && company && selectedService) {
      fetchAvailableDates();
    }
  }, [selectedEmployee, company, selectedService]);

  useEffect(() => {
    if (selectedDate && selectedEmployee && selectedService && company) {
      fetchAvailableTimes();
    }
  }, [selectedDate, selectedEmployee, selectedService, company]);

  useEffect(() => {
    if (customization) {
      console.log("customization:", customization);
    }
  }, [customization]);

  // Restore booking state after login redirect - Phase 1: service, date, time
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const shouldRestore = searchParams.get('restore') === 'true';
    
    if (shouldRestore && user && services.length > 0) {
      const savedState = sessionStorage.getItem('pendingBooking');
      if (savedState) {
        try {
          const state = JSON.parse(savedState);
          
          // Find service or combo
          const service = services.find(s => s.id === state.serviceId);
          const combo = combos.find(c => c.id === state.serviceId);
          if (service) {
            setSelectedService(service);
          } else if (combo) {
            const comboAsService: Service = {
              id: combo.id,
              name: combo.name,
              description: combo.description || '',
              price: combo.combo_price,
              duration_minutes: combo.total_duration_minutes,
              image_url: combo.image_url
            };
            setSelectedService(comboAsService);
          }
          
          // Save employee ID for restoration in Phase 2
          if (state.employeeId) {
            setPendingEmployeeRestore(state.employeeId);
          }
          
          // Restore date and time
          if (state.date) setSelectedDate(new Date(state.date));
          if (state.time) setSelectedTime(state.time);
          
          // Go directly to step 5 (confirmation)
          setStep(5);
          
          // Clear saved state and URL param
          sessionStorage.removeItem('pendingBooking');
          window.history.replaceState({}, '', `/${slug}/agendar`);
        } catch (e) {
          console.error('Error restoring booking state:', e);
        }
      }
    }
  }, [user, services, combos, slug]);

  // Restore booking state - Phase 2: employee (after employees are loaded)
  useEffect(() => {
    if (pendingEmployeeRestore && employees.length > 0) {
      const employee = employees.find(e => e.id === pendingEmployeeRestore);
      if (employee) {
        setSelectedEmployee(employee);
      }
      setPendingEmployeeRestore(null);
    }
  }, [pendingEmployeeRestore, employees]);

  

  const fetchCompanyAndServices = async () => {
    try {
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('id, name, slug')
        .eq('slug', slug)
        .single();

      if (companyError) throw companyError;
      if (!companyData) {
        navigate('/404');
        return;
      }

      setCompany(companyData);

      // Buscar personalização
      const { data: customizationData } = await supabase
        .from('company_customizations')
        .select('*')
        .eq('company_id', companyData.id)
        .maybeSingle();

      setCustomization(customizationData);

      const { data: servicesData, error: servicesError } = await supabase
        .from('services')
        .select('*')
        .eq('company_id', companyData.id)
        .eq('is_active', true);

      if (servicesError) throw servicesError;
      setServices(servicesData || []);

      const { data: combosData, error: combosError } = await supabase
       .from('service_combos')
       .select('*, items:service_combo_items(*)')
       .eq('company_id', companyData.id)
       .eq('is_active', true)
       .order('name');

     if (combosError) {
       console.error('Error fetching combos:', combosError);
       setCombos([]);
     } else {
       // coletar ids de serviços usados nos combos
       const serviceIds = Array.from(
         new Set(
           (combosData || [])
             .flatMap((c: any) => (c.items || []).map((it: any) => it.service_id))
             .filter(Boolean)
         )
       );

       let servicesMap: Record<string, any> = {};
       if (serviceIds.length > 0) {
         const { data: servicesList } = await supabase
           .from('services')
           .select('id, name, price, image_url, duration_minutes')
           .in('id', serviceIds);
         servicesMap = (servicesList || []).reduce((acc: any, s: any) => {
           acc[s.id] = s;
           return acc;
         }, {});
       }

       const combosWithServices = (combosData || []).map((c: any) => ({
         ...c,
         items: (c.items || []).map((it: any) => ({
           ...it,
           service: servicesMap[it.service_id] || null,
         })),
       }));

       setCombos(combosWithServices);
     }

    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados da empresa.",
        variant: "destructive"
      });
    }
  };

  const generateCustomStyles = () => {
    if (!customization) return {};

    const styles: any = {};

    // Fonte
    if (customization.font_family) {
      styles['--font-family'] = customization.font_family;
    }

    if (customization.font_color_type === "gradient" && customization.font_gradient && customization.font_gradient.colors) {
      const direction = customization.font_gradient.direction || "to right";
      const colors = customization.font_gradient.colors.join(", ");
      styles['--font-color'] = `linear-gradient(${direction}, ${colors})`;
      styles['--font-gradient'] = true;
    } else if (customization.font_color) {
      styles['--font-color'] = customization.font_color;
      styles['--font-gradient'] = false;
    }

    // Cor dos cards (gradient ou cor sólida)
    if (
      customization.cards_color_type === "gradient" &&
      customization.cards_gradient &&
      customization.cards_gradient.colors &&
      customization.cards_gradient.colors.length > 1
    ) {
      const direction = customization.cards_gradient.direction || "to right";
      const colors = customization.cards_gradient.colors.join(", ");
      styles['--cards-background'] = `linear-gradient(${direction}, ${colors})`;
    } else if (customization.cards_color) {
      styles['--cards-background'] = customization.cards_color;
    }

    // Cor dos cards (gradient ou cor sólida)
    if (
      customization.cards_color_type === "gradient" &&
      customization.cards_gradient &&
      customization.cards_gradient.colors &&
      customization.cards_gradient.colors.length > 1
    ) {
      const direction = customization.cards_gradient.direction || "to right";
      const colors = customization.cards_gradient.colors.join(", ");
      styles['--cards-background'] = `linear-gradient(${direction}, ${colors})`;
    } else if (customization.cards_color) {
      styles['--cards-background'] = customization.cards_color;
    }

    // Logo
    styles.logoUrl = customization.logo_url || null;

    return styles;
  };

  // Ao selecionar um combo no UI, criamos um "service-like" para manter o fluxo
  const handleSelectCombo = (combo: any) => {
    const synthetic: Service = {
      id: `combo:${combo.id}`,
      name: combo.name,
      description: combo.description || "",
      price: combo.combo_price ?? 0,
      duration_minutes: combo.total_duration_minutes ?? (combo.items?.reduce((s: number, it: any) => s + (it.service?.duration_minutes || 0), 0) || 0),
      image_url: combo.items?.[0]?.service?.image_url
    };
    setSelectedService(synthetic);
  };

  const fetchEmployeesForService = async () => {
    if (!selectedService || !company) return;

    try {

      if (selectedService.id?.startsWith?.('combo:')) {
        const comboId = selectedService.id.replace('combo:', '');
        const combo = combos.find(c => c.id === comboId);
        if (!combo) {
          setEmployees([]);
          return;
        }

        const serviceIds = (combo.items || []).map((it: any) => it.service_id).filter(Boolean);
        if (serviceIds.length === 0) {
          setEmployees([]);
          return;
        }

        // buscar employee_services para esses serviceIds
        const { data: esData, error: esError } = await supabase
          .from('employee_services')
          .select('employee_id, service_id')
          .in('service_id', serviceIds);

        if (esError) throw esError;

        // contar quantos services cada employee possui
        const counts: Record<string, number> = {};
        (esData || []).forEach((row: any) => {
          counts[row.employee_id] = (counts[row.employee_id] || 0) + 1;
        });

        // employees que possuem count === serviceIds.length
        const eligibleEmployeeIds = Object.keys(counts).filter(empId => counts[empId] === serviceIds.length);
        if (eligibleEmployeeIds.length === 0) {
          setEmployees([]);
          return;
        }

         // buscar dados dos employees elegíveis (apenas do mesmo company)
        const { data: employeesData } = await supabase
          .from('employees')
          .select('id, name, email')
          .in('id', eligibleEmployeeIds)
          .eq('company_id', company.id)
          .eq('is_active', true);

        setEmployees(employeesData || []);
        return;
      }

      // Buscar funcionários que oferecem o serviço selecionado
      const { data: employeesData, error } = await supabase
        .from('employees')
        .select(`
          id, 
          name, 
          email,
          employee_services!inner(
            service_id
          )
        `)
        .eq('company_id', company.id)  
        .eq('is_active', true)
        .eq('employee_services.service_id', selectedService.id);

      if (error) throw error;
      setEmployees(employeesData || []);
    } catch (error) {
      console.error("Erro ao carregar funcionários:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os funcionários.",
        variant: "destructive"
      });
    }
  };

  const fetchAvailableDates = async () => {
    if (!selectedEmployee || !company || !selectedService) return;

    setIsLoadingAvailability(true);
    try {
      // Buscar próximos 30 dias que têm disponibilidade
      const dates: Date[] = [];
      const today = new Date();
      
      // Verificar cada dia nos próximos 30 dias (incluindo hoje)
      for (let i = 0; i <= 30; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dateStr = format(date, 'yyyy-MM-dd');
        
        try {

          // Se for combo, verifica disponibilidade para cada service do combo (básico: requer pelo menos um slot por service neste dia)
          if (selectedService.id?.startsWith?.('combo:')) {
            const comboId = selectedService.id.replace('combo:', '');
            const combo = combos.find(c => c.id === comboId);
            if (!combo) continue;
            const serviceIds = (combo.items || []).map((it: any) => it.service_id).filter(Boolean);
            let allHaveSlot = true;
            for (const sId of serviceIds) {
              const response = await fetch(
                `${getEdgeFunctionUrl('get-availability')}?company_id=${company.id}&service_id=${sId}&employee_id=${selectedEmployee.id}&date=${dateStr}`,
                { method: 'GET', headers: { 'Content-Type': 'application/json' } }
              );
              if (!response.ok) { allHaveSlot = false; break; }
              const data = await response.json();
              if (!((data.slots && data.slots.length > 0) || (data.availability && data.availability.length > 0))) {
                allHaveSlot = false; break;
              }
            }
            if (allHaveSlot) dates.push(date);
            continue;
          }
          const response = await fetch(
            `${getEdgeFunctionUrl('get-availability')}?company_id=${company.id}&service_id=${selectedService.id}&employee_id=${selectedEmployee.id}&date=${dateStr}`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );
          
          if (response.ok) {
            const data = await response.json();
            // Check both slots (flat array) and availability (grouped by employee)
            if (data.slots && data.slots.length > 0) {
              dates.push(date);
            } else if (data.availability && data.availability.length > 0) {
              const employeeAvailability = data.availability.find(
                (a: any) => a.employee_id === selectedEmployee.id
              );
              if (employeeAvailability && employeeAvailability.slots.length > 0) {
                dates.push(date);
              }
            }
          }
        } catch (err) {
          console.log(`Erro ao verificar disponibilidade para ${dateStr}:`, err);
        }
      }
      
      setAvailableDates(dates);
    } catch (error) {
      console.error("Erro ao carregar datas disponíveis:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as datas disponíveis.",
        variant: "destructive"
      });
    } finally {
      setIsLoadingAvailability(false);
    }
  };

  const fetchAvailableTimes = async () => {
    if (!selectedDate || !selectedEmployee || !selectedService || !company) return;

    setIsLoadingAvailability(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');

      // Para combos, por agora exibimos os horários do primeiro serviço do combo (backend idealmente deve suportar combo availability)
      if (selectedService.id?.startsWith?.('combo:')) {
          const comboId = selectedService.id.replace('combo:', '');
          const combo = combos.find(c => c.id === comboId);
          const firstServiceId = combo?.items?.[0]?.service_id;
          if (!firstServiceId) {
              setAvailableTimes([]);
              return;
            }
          const response = await fetch(
              `${getEdgeFunctionUrl('get-availability')}?company_id=${company.id}&service_id=${firstServiceId}&employee_id=${selectedEmployee.id}&date=${dateStr}`,
              { method: 'GET', headers: { 'Content-Type': 'application/json' } }
            );
          if (!response.ok) throw new Error('Erro ao buscar disponibilidade');
          const data = await response.json();
          if (data.slots && data.slots.length > 0) {
              setAvailableTimes(data.slots.map((s: any) => s.time));
              return;
            } else if (data.availability && data.availability.length > 0) {
                const empAvail = data.availability.find((a: any) => a.employee_id === selectedEmployee.id);
                setAvailableTimes(empAvail?.slots || []);
                return;
              } else {
              setAvailableTimes([]);
              return;
            }
        }
      
      const response = await fetch(
        `${getEdgeFunctionUrl('get-availability')}?company_id=${company.id}&service_id=${selectedService.id}&employee_id=${selectedEmployee.id}&date=${dateStr}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        throw new Error('Erro ao buscar disponibilidade');
      }
      
      const data = await response.json();
      
      // Use slots array directly (each slot has time, employee_id, employee_name)
      if (data.slots && data.slots.length > 0) {
        // Extract just the time strings from the slots
        const times = data.slots.map((slot: { time: string }) => slot.time);
        setAvailableTimes(times);
      } else if (data.availability && data.availability.length > 0) {
        // Fallback to availability format
        const employeeAvailability = data.availability.find(
          (a: any) => a.employee_id === selectedEmployee.id
        );
        if (employeeAvailability && employeeAvailability.slots) {
          setAvailableTimes(employeeAvailability.slots);
        } else {
          setAvailableTimes([]);
        }
      } else {
        setAvailableTimes([]);
      }
    } catch (error) {
      console.error("Erro ao carregar horários:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os horários disponíveis.",
        variant: "destructive"
      });
      setAvailableTimes([]);
    } finally {
      setIsLoadingAvailability(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleBookingSubmit = async () => {
    if (!selectedService || !selectedEmployee || !selectedDate || !selectedTime || !company) return;

    setIsLoading(true);
    try {
      let clientId;
      
      if (user && client) {
        // Use authenticated client
        clientId = client.id;
      } else {
        // This should not happen with the new flow, but keeping as fallback
        const { data: clientData, error: clientError } = await supabase
          .from('clients')
          .upsert([
            {
              company_id: company.id,
              name: formData.client_name,
              email: formData.client_email,
              phone: formData.client_phone
            }
          ], { 
            onConflict: 'company_id,email',
            ignoreDuplicates: false
          })
          .select()
          .single();

        if (clientError) throw clientError;
        clientId = clientData.id;
      }

      // Criar agendamento via edge function para contornar RLS
      const { data: session } = await supabase.auth.getSession();

      const isCombo = selectedService.id?.startsWith?.('combo:');
      const payloadBase: any = {
        company_id: company.id,
        employee_id: selectedEmployee.id,
        booking_date: format(selectedDate, 'yyyy-MM-dd'),
        booking_time: selectedTime,
        duration_minutes: selectedService.duration_minutes,
        price: selectedService.price,
        notes: formData.notes,
        client_id: clientId
      };

      if (isCombo) {
        const comboId = selectedService.id.replace('combo:', '');
        const combo = combos.find(c => c.id === comboId);
        payloadBase.combo_id = comboId;
        payloadBase.combo_items = (combo?.items || []).map((it: any) => it.service_id);
      } else {
        payloadBase.service_id = selectedService.id;
      }

      
      const response = await fetch(getEdgeFunctionUrl('create-booking'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.session?.access_token}`,
        },
        body: JSON.stringify(payloadBase),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao criar agendamento');
      }

      const result = await response.json();
      const newBookingId = result?.booking?.id;
      const isComboFlow = isCombo;

      // Decide se abre o diálogo de pagamento
      const paymentRule = selectedService.payment_required || "optional";
      const needsPayment = !isComboFlow && newBookingId && paymentRule !== "never";

      if (needsPayment) {
        // Verifica se a empresa aceita pagamento online
        const { data: settings } = await supabase
          .from("company_payment_settings")
          .select("payment_mode")
          .eq("company_id", company.id)
          .maybeSingle();
        const enabled = settings && settings.payment_mode !== "none";
        if (enabled) {
          setPaymentDialog({
            open: true,
            bookingId: newBookingId,
            amount: selectedService.price,
            allowLater: paymentRule === "optional",
          });
          return;
        }
      }

      setStep(6);
      toast({
        title: "Agendamento realizado!",
        description: "Seu agendamento foi registrado com sucesso."
      });
    } catch (error) {
      console.error("Erro ao criar agendamento:", error);
      toast({
        title: "Erro",
        description: "Não foi possível realizar o agendamento. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20"
            >
            <CardHeader>
              <CardTitle
                style={{
                  fontFamily: customStyles["--font-family"] || "inherit",
                  color: !customStyles["--font-gradient"] ? customStyles["--font-color"] : undefined,
                  background: customStyles["--font-gradient"] ? customStyles["--font-color"] : undefined,
                  WebkitBackgroundClip: customStyles["--font-gradient"] ? "text" : undefined,
                  WebkitTextFillColor: customStyles["--font-gradient"] ? "transparent" : undefined,
                }}
              >
                Escolha o Serviço
              </CardTitle>
              <CardDescription>Selecione o serviço desejado</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4" >
                {/* Render combos primeiro, como cards iguais aos serviços */}
                {combos.map((combo) => {
                  const synthetic: Service = {
                    id: `combo:${combo.id}`,
                    name: combo.name,
                    description: combo.description || '',
                    price: combo.combo_price ?? 0,
                    duration_minutes: combo.total_duration_minutes ?? (combo.items?.reduce((s: number, it: any) => s + (it.service?.duration_minutes || 0), 0) || 0),
                    image_url: combo.items?.[0]?.service?.image_url
                  };
                  return (
                    <div
                      key={`combo-${combo.id}`}
                      className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${selectedService?.id === synthetic.id ? "border-primary bg-primary/10" : "border-primary/20 hover:border-primary/50"}`}
                      style={{ background: customStyles["--cards-background"] }}
                      onClick={() => handleSelectCombo(combo)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-lg">{combo.name}</h3>
                          <p className="text-muted-foreground text-sm mb-2">{combo.description}</p>
                          <div className="flex gap-4 text-sm">
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {synthetic.duration_minutes} min
                            </div>
                            <div className="flex items-center gap-1">
                              <DollarSign className="w-4 h-4" />
                              R$ {synthetic.price.toFixed(2)}
                            </div>
                          </div>
                        </div>
                        {selectedService?.id === synthetic.id && (
                          <Check className="w-6 h-6 text-primary" />
                        )}
                      </div>
                    </div>
                  );
                })}
                {services.map((service) => (
                  <div
                    key={service.id}
                    className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedService?.id === service.id
                        ? "border-primary bg-primary/10"
                        : "border-primary/20 hover:border-primary/50"
                    } `}
                    style={{
                      background: customStyles["--cards-background"]
                    }}
                    onClick={() => setSelectedService(service)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-lg">{service.name}</h3>
                        <p className="text-muted-foreground text-sm mb-2">{service.description}</p>
                        <div className="flex gap-4 text-sm">
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {service.duration_minutes} min
                          </div>
                          <div className="flex items-center gap-1">
                            <DollarSign className="w-4 h-4" />
                            R$ {service.price.toFixed(2)}
                          </div>
                        </div>
                      </div>
                      {selectedService?.id === service.id && (
                        <Check className="w-6 h-6 text-primary" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {selectedService && (
                <Button onClick={() => setStep(2)} className="w-full mt-4" variant="neon">
                  Continuar
                </Button>
              )}
            </CardContent>
          </Card>
        );

      case 2:
        return (
          <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20"
          
          >
            <CardHeader>
              <CardTitle className="text-gradient"   
              style={{
              fontFamily: customStyles["--font-family"],
            }} >Escolha o Profissional</CardTitle>
              <CardDescription>Selecione quem irá realizar o atendimento</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {employees.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum profissional disponível para este serviço.
                  </p>
                ) : (
                  employees.map((employee) => (
                    <div
                      key={employee.id}
                      style={{
                        background: customStyles["--cards-background"],
                        fontFamily: customStyles["--font-family"],
                      }}
                      className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        selectedEmployee?.id === employee.id
                          ? "border-primary bg-primary/10"
                          : "border-primary/20 hover:border-primary/50"
                      }`}
                      onClick={() => setSelectedEmployee(employee)}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center">
                            <User className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-lg">{employee.name}</h3>
                            <p className="text-muted-foreground text-sm">{employee.email}</p>
                          </div>
                        </div>
                        {selectedEmployee?.id === employee.id && (
                          <Check className="w-6 h-6 text-primary" />
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              <div className="flex gap-2 mt-6">
                <Button variant="outline" onClick={() => {
                  setSelectedEmployee(null);
                  setEmployees([]);
                  setAvailableDates([]);
                  setSelectedDate(undefined);
                  setAvailableTimes([]);
                  setSelectedTime("");
                  setStep(1);
                }} className="flex-1">
                  Voltar
                </Button>
                {selectedEmployee && (
                  <Button onClick={() => setStep(3)} className="flex-1" variant="neon">
                    Continuar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );

      case 3:
        return (
          <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader>
              <CardTitle 
              style={{
                fontFamily: customStyles["--font-family"],
              }} className="text-gradient">Escolha a Data</CardTitle>
              <CardDescription>Selecione uma data disponível</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="text-base font-medium">Datas disponíveis</Label>
                {isLoadingAvailability ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <span className="ml-3 text-muted-foreground">Buscando disponibilidade...</span>
                  </div>
                ) : availableDates.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhuma data disponível nos próximos 30 dias.
                  </p>
                ) : (
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    locale={ptBR}
                    disabled={(date) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      return date < today || !availableDates.some(availableDate => 
                        availableDate.toDateString() === date.toDateString()
                      );
                    }}
                    className="rounded-md border border-primary/20 bg-background/50"
                  />
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => {
                  setSelectedEmployee(null);
                  setAvailableDates([]);
                  setSelectedDate(undefined);
                  setAvailableTimes([]);
                  setSelectedTime("");
                  setStep(2);
                }} className="flex-1">
                  Voltar
                </Button>
                {selectedDate && (
                  <Button onClick={() => setStep(4)} className="flex-1" variant="neon">
                    Continuar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );

      case 4:
        return (
          <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader>
              <CardTitle 
                style={{
                  fontFamily: customStyles["--font-family"],
                }} 
                className="text-gradient">Escolha o Horário</CardTitle>
              <CardDescription>Selecione um horário disponível</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoadingAvailability ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <span className="ml-3 text-muted-foreground">Buscando horários...</span>
                </div>
              ) : availableTimes.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum horário disponível para esta data.
                </p>
              ) : (
                <div>
                  <Label className="text-base font-medium">Horários disponíveis</Label>
                  <div className="grid grid-cols-4 gap-2 mt-2" 
                    style={{
                      fontFamily: customStyles["--font-family"],
                  }}>
                    {availableTimes.map((time) => (
                      <Button
                        style={{
                          background: selectedTime !== time ? customStyles["--cards-background"] : undefined,
                          fontFamily: customStyles["--font-family"],
                        }}
                        key={time}
                        variant={selectedTime === time ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedTime(time)}
                      >
                        {time}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => {
                  setSelectedTime("");
                  setAvailableTimes([]);
                  setStep(3);
                }} className="flex-1">
                  Voltar
                </Button>
                {selectedTime && (
                  <Button onClick={() => setStep(5)} className="flex-1" variant="neon">
                    Continuar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );

      case 5:
        if (user && client) {
          // User is authenticated, proceed to booking
          return (
            <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
              <CardHeader>
                <CardTitle className="text-gradient">Confirmação dos Dados</CardTitle>
                <CardDescription>Confirme seus dados para o agendamento</CardDescription>
              </CardHeader>
              <CardContent >
                <div className="space-y-4">
                  <div className="bg-background/30 p-4 rounded-lg space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Serviço:</span>
                      <span className="font-medium" style={{
                        fontFamily: customStyles["--font-family"],
                      }}>{selectedService?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Profissional:</span>
                      <span className="font-medium" style={{
                        fontFamily: customStyles["--font-family"],
                      }}>{selectedEmployee?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Data:</span>
                      <span className="font-medium" style={{
                        fontFamily: customStyles["--font-family"],
                      }}>
                        {selectedDate && format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Horário:</span>
                      <span className="font-medium" style={{
                        fontFamily: customStyles["--font-family"],
                      }}>{selectedTime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duração:</span>
                      <span className="font-medium" style={{
                        fontFamily: customStyles["--font-family"],
                      }}>{selectedService?.duration_minutes} min</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valor:</span>
                      <span className="font-medium" style={{
                        fontFamily: customStyles["--font-family"],
                      }}>R$ {selectedService?.price.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Observações (opcional)</Label>
                    <Textarea
                      id="notes"
                      name="notes"
                      value={formData.notes}
                      onChange={handleInputChange}
                      placeholder="Alguma observação especial?"
                      rows={3}
                    />
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <Button variant="outline" onClick={() => {
                    setSelectedTime("");
                    setStep(4);
                  }} className="flex-1">
                    Voltar
                  </Button>
                  <Button
                    onClick={handleBookingSubmit}
                    disabled={isLoading}
                    className="flex-1"
                    variant="neon"
                  >
                    {isLoading ? "Agendando..." : "Confirmar Agendamento"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        } else {
          // User not authenticated, show auth options
          return (
            <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
              <CardHeader className="text-center">
                <CardTitle className="text-gradient">Acesso Necessário</CardTitle>
                <CardDescription>
                  Para continuar com o agendamento, faça login ou crie sua conta
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Com sua conta você poderá:
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1 text-left">
                    <li>• Acompanhar seus agendamentos</li>
                    <li>• Gerenciar seus dados</li>
                    <li>• Receber lembretes por email</li>
                    <li>• Histórico de serviços</li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <Button 
                    className="w-full" 
                    variant="neon"
                    onClick={() => {
                      const bookingState = {
                        serviceId: selectedService?.id,
                        employeeId: selectedEmployee?.id,
                        date: selectedDate?.toISOString(),
                        time: selectedTime,
                      };
                      sessionStorage.setItem('pendingBooking', JSON.stringify(bookingState));
                      navigate(`/${slug}/entrar?returnTo=agendar`);
                    }}
                  >
                    Já tenho conta - Entrar
                  </Button>
                  
                  <Button 
                    className="w-full" 
                    variant="outline"
                    onClick={() => {
                      const bookingState = {
                        serviceId: selectedService?.id,
                        employeeId: selectedEmployee?.id,
                        date: selectedDate?.toISOString(),
                        time: selectedTime,
                      };
                      sessionStorage.setItem('pendingBooking', JSON.stringify(bookingState));
                      navigate(`/${slug}/cadastro?returnTo=agendar`);
                    }}
                  >
                    Criar nova conta
                  </Button>
                </div>

                <div className="flex gap-2 mt-6">
                  <Button variant="ghost" onClick={() => {
                    setSelectedTime("");
                    setStep(4);
                  }} className="flex-1">
                    Voltar
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        }

      case 6:
        return (
          <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-500" />
              </div>
              <CardTitle className="text-gradient">Agendamento Confirmado!</CardTitle>
              <CardDescription>Seu agendamento foi registrado com sucesso</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-background/50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Serviço:</span>
                  <span className="font-medium">{selectedService?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Profissional:</span>
                  <span className="font-medium">{selectedEmployee?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data:</span>
                  <span className="font-medium">
                    {selectedDate && format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Horário:</span>
                  <span className="font-medium">{selectedTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duração:</span>
                  <span className="font-medium">{selectedService?.duration_minutes} min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor:</span>
                  <span className="font-medium">R$ {selectedService?.price.toFixed(2)}</span>
                </div>
              </div>

              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Você receberá um e-mail de confirmação em breve.
                </p>
                <Badge variant="secondary">Status: Aguardando Confirmação</Badge>
              </div>

              <Button
                onClick={() => navigate(`/${slug}`)}
                className="w-full"
                variant="neon"
              >
                Voltar ao Início
              </Button>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  if (!company) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  const customStyles = generateCustomStyles();

  let logoSrc = customStyles.logoUrl;
  if (!logoSrc && customization?.logo_upload_path) {
    logoSrc = supabase.storage
      .from('company-logos')
      .getPublicUrl(customization.logo_upload_path).data.publicUrl;
  }

  console.log("logoSrc:", logoSrc);

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Header */}
      <header className="border-b border-primary/20 bg-card/30 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {logoSrc && (
                <img src={logoSrc} alt={company.name} className="w-12 h-12 object-contain border-2 border-blue-600" />
              )}
              <div>
                <h1 className="text-xl font-bold">{company.name}</h1>
                <p className="text-sm text-muted-foreground">Agendamento Online</p>
              </div>
            </div>
            <Button variant="ghost" onClick={() => navigate(`/${slug}`)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderStep()}
      </div>

      {paymentDialog.open && paymentDialog.bookingId && company && (
        <BookingPaymentDialog
          open={paymentDialog.open}
          onClose={() => setPaymentDialog({ open: false })}
          bookingId={paymentDialog.bookingId}
          companyId={company.id}
          amount={paymentDialog.amount || 0}
          payerInitial={{
            name: client?.name || formData.client_name,
            email: client?.email || formData.client_email,
            phone: client?.phone || formData.client_phone,
            cpf_cnpj: client?.cpf,
          }}
          allowPayLater={paymentDialog.allowLater}
          onPayLater={() => { setPaymentDialog({ open: false }); setStep(6); }}
          onPaid={() => { setPaymentDialog({ open: false }); setStep(6); }}
        />
      )}
    </div>
  );
}