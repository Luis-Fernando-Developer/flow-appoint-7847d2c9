import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { RequireBusinessAuth } from "@/components/business/RequireBusinessAuth";
import LandingPage from "./pages/LandingPage";
import AdminLogin from "./pages/admin/Login";
import SuperAdminDashboard from "./pages/admin/SuperAdminDashboard";
import CreateCompany from "./pages/admin/CreateCompany";
import SignUp from "./pages/SignUp";
import BusinessLogin from "./pages/business/Login";
import CompanyLandingPage from "./pages/company/[slug]";
import BusinessDashboard from "./pages/business/Dashboard";
import BusinessBookings from "./pages/business/Bookings";
import BusinessServices from "./pages/business/Services";
import BusinessEmployees from "./pages/business/Employees";
import BusinessSettings from "./pages/business/Settings";
import BillingManagement from "./pages/business/BillingManagement";
import BusinessProfile from "./pages/business/Profile";
import ChatbotIntegracao from "./pages/business/chatbot/Integracao";
import ChatbotTalkMap from "./pages/business/chatbot/TalkMap";
import BusinessSchedule from "./pages/business/Schedule";
import ClientBooking from "./pages/client/Booking";
import ClientLogin from "./pages/client/Login";
import ClientSignup from "./pages/client/Signup";
import ClientBookings from "./pages/client/Bookings";
import ClientProfile from "./pages/client/Profile";
import ClientDashboard from "./pages/client/Dashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* rota landipage para empresarios */}
            <Route path="/" element={<LandingPage />} />
            {/* rota cadastro para empresarios via landipage */}
            <Route path="/signup" element={<SignUp />} />

            {/* rotas login para empresarios via landingpage ou diretamente via slog */}
            <Route path="/login" element={<BusinessLogin />} />
            <Route path="/:slug/admin/login" element={<BusinessLogin />} />

            {/* rota admin do sistema */}
            <Route path="/super-admin/login" element={<AdminLogin />} />
            {/* rota painel admin super admin */}
            <Route path="/super-admin/painel" element={<SuperAdminDashboard />} />
            {/* rota para criar/adicionar empresa via painel super admin */}
            <Route path="/super-admin/add-company" element={<CreateCompany />} />

            {/* rotas protegidas do painel admin empresa */}
            <Route path="/:slug/admin/dashboard" element={<RequireBusinessAuth><BusinessDashboard /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/agendamentos" element={<RequireBusinessAuth><BusinessBookings /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/servicos" element={<RequireBusinessAuth><BusinessServices /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/colaboradores" element={<RequireBusinessAuth><BusinessEmployees /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/configuracoes" element={<RequireBusinessAuth><BusinessSettings /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/billing" element={<RequireBusinessAuth><BillingManagement /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/perfil" element={<RequireBusinessAuth><BusinessProfile /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/chatbot" element={<RequireBusinessAuth><ChatbotIntegracao /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/chatbot/integracao" element={<RequireBusinessAuth><ChatbotIntegracao /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/chatbot/talkmap" element={<RequireBusinessAuth><ChatbotTalkMap /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/chatbot/talkmap/*" element={<RequireBusinessAuth><ChatbotTalkMap /></RequireBusinessAuth>} />
            <Route path="/:slug/admin/horarios" element={<RequireBusinessAuth><BusinessSchedule /></RequireBusinessAuth>} />

            {/* rota landingpage empresa por parametro [slug] */}
            <Route path="/:slug" element={<CompanyLandingPage />} />
            
            {/* rota para cliente final agendar procedimentos na empresa via slug */}
            <Route path="/:slug/agendar" element={<ClientBooking />} />
            {/* rota para cliente realizar login na empresa via slug */}
            <Route path="/:slug/entrar" element={<ClientLogin />} />
            {/* rota para cliente realizar cadastro na empresa via slug */}
            <Route path="/:slug/cadastro" element={<ClientSignup />} />
            {/* rota para cliente ver seus agendamentos na empresa via slug */}
            <Route path="/:slug/agendamentos" element={<ClientBookings />} />
            {/* rota dashboard do cliente */}
            <Route path="/:slug/client/dashboard" element={<ClientDashboard />} />
            {/* rota perfil do cliente */}
            <Route path="/:slug/client/perfil" element={<ClientProfile />} />
            {/* rota agendamentos do cliente (alias) */}
            <Route path="/:slug/client/agendamentos" element={<ClientBookings />} />

            {/* rota não existente '404' */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
