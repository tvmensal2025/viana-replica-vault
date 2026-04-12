import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

const CRMLandingPage = lazy(() => import("./pages/CRMLandingPage"));
const ConsultantPage = lazy(() => import("./pages/ConsultantPage"));
const CadastroPage = lazy(() => import("./pages/CadastroPage"));
const WhatsAppClientsPage = lazy(() => import("./pages/WhatsAppClientsPage"));
const LicenciadaPage = lazy(() => import("./pages/LicenciadaPage"));
const LicenciadaPreview = lazy(() => import("./pages/LicenciadaPreview"));
const AssistentePage = lazy(() => import("./pages/AssistentePage"));
const Auth = lazy(() => import("./pages/Auth"));
const Admin = lazy(() => import("./pages/Admin"));
const SuperAdmin = lazy(() => import("./pages/SuperAdmin"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-green-500 border-t-transparent rounded-full" /></div>}>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/whatsapp-clients" element={<WhatsAppClientsPage />} />
            <Route path="/super-admin" element={<SuperAdmin />} />
            <Route path="/assistente" element={<AssistentePage />} />
            <Route path="/crm" element={<CRMLandingPage />} />
            <Route path="/licenciado/preview" element={<LicenciadaPreview />} />
            <Route path="/licenciado/:licenca" element={<LicenciadaPage />} />
            <Route path="/cadastro/:licenca" element={<CadastroPage />} />
            <Route path="/:licenca" element={<ConsultantPage />} />
            <Route path="/" element={<Navigate to="/auth" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
