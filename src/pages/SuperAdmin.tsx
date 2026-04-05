import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Shield, Users, CheckCircle, XCircle, LogOut, Loader2, UserCheck, UserX, BarChart3, KeyRound,
} from "lucide-react";

interface ConsultantRow {
  id: string;
  name: string;
  license: string;
  phone: string;
  created_at: string | null;
  approved: boolean;
}

const SuperAdmin = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [consultants, setConsultants] = useState<ConsultantRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const accessDeniedToastShownRef = useRef(false);
  const { isAdmin, loading: roleLoading } = useUserRole(userId);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session) {
        setUserId(null);
        setAuthLoading(false);
        navigate("/auth", { replace: true });
        return;
      }

      setUserId(session.user.id);
      setAuthLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setUserId(null);
        setAuthLoading(false);
        navigate("/auth", { replace: true });
        return;
      }

      setUserId(session.user.id);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (authLoading || roleLoading || !userId) return;

    if (!isAdmin) {
      if (!accessDeniedToastShownRef.current) {
        accessDeniedToastShownRef.current = true;
        toast({ title: "Acesso negado", description: "Você não tem permissão de administrador.", variant: "destructive" });
      }
      navigate("/admin", { replace: true });
      return;
    }

    accessDeniedToastShownRef.current = false;
    loadConsultants();
  }, [authLoading, isAdmin, roleLoading, userId, navigate, toast]);

  const loadConsultants = async () => {
    setLoadingData(true);
    const { data, error } = await supabase
      .from("consultants")
      .select("id, name, license, phone, created_at, approved")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erro ao carregar consultores", description: error.message, variant: "destructive" });
    } else {
      setConsultants((data as any[])?.map(c => ({ ...c, approved: c.approved ?? false })) || []);
    }
    setLoadingData(false);
  };

  const toggleApproval = async (consultantId: string, currentApproved: boolean) => {
    setTogglingId(consultantId);
    const { error } = await supabase
      .from("consultants")
      .update({ approved: !currentApproved } as any)
      .eq("id", consultantId);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setConsultants(prev =>
        prev.map(c => c.id === consultantId ? { ...c, approved: !currentApproved } : c)
      );
      toast({ title: !currentApproved ? "✅ Consultor aprovado!" : "❌ Acesso revogado" });
    }
    setTogglingId(null);
  };

  const handleResetPassword = async (consultantId: string, consultantName: string) => {
    setResettingId(consultantId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("admin-reset-password", {
        body: {
          consultant_id: consultantId,
          redirect_url: `${window.location.origin}/auth`,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "✅ Email de redefinição enviado!",
        description: `Link enviado para ${data?.email || consultantName}`,
      });
    } catch (err: any) {
      toast({
        title: "Erro ao resetar senha",
        description: err.message || "Erro desconhecido",
        variant: "destructive",
      });
    }
    setResettingId(null);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (authLoading || roleLoading || (!isAdmin && userId)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Verificando permissões...</p>
      </div>
    );
  }

  const approvedCount = consultants.filter(c => c.approved).length;
  const pendingCount = consultants.filter(c => !c.approved).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-base font-bold font-heading text-foreground leading-tight">Super Admin</h1>
              <p className="text-xs text-muted-foreground">Gerenciamento de acessos</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground gap-2">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            <div>
              <p className="text-2xl font-bold text-foreground">{consultants.length}</p>
              <p className="text-xs text-muted-foreground">Total Consultores</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold text-foreground">{approvedCount}</p>
              <p className="text-xs text-muted-foreground">Aprovados</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
            <XCircle className="w-8 h-8 text-orange-500" />
            <div>
              <p className="text-2xl font-bold text-foreground">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">Pendentes</p>
            </div>
          </div>
        </div>

        {/* Consultants Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-heading font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Consultores Cadastrados
            </h2>
          </div>

          {loadingData ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Licença</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Cadastro</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consultants.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.license}</TableCell>
                    <TableCell className="text-muted-foreground">{c.phone}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.approved ? "default" : "secondary"} className={c.approved ? "bg-green-500/20 text-green-700 border-green-500/30" : "bg-orange-500/20 text-orange-700 border-orange-500/30"}>
                        {c.approved ? "Aprovado" : "Pendente"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResetPassword(c.id, c.name)}
                          disabled={resettingId === c.id}
                          className="gap-1.5"
                          title="Enviar email de redefinição de senha"
                        >
                          {resettingId === c.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <KeyRound className="w-3.5 h-3.5" />
                          )}
                          Resetar Senha
                        </Button>
                        <Button
                          variant={c.approved ? "outline" : "default"}
                          size="sm"
                          onClick={() => toggleApproval(c.id, c.approved)}
                          disabled={togglingId === c.id}
                          className="gap-1.5"
                        >
                          {togglingId === c.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : c.approved ? (
                            <UserX className="w-3.5 h-3.5" />
                          ) : (
                            <UserCheck className="w-3.5 h-3.5" />
                          )}
                          {c.approved ? "Revogar" : "Aprovar"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {consultants.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum consultor cadastrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </main>
    </div>
  );
};

export default SuperAdmin;
