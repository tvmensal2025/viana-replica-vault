import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Download, Copy, FileText, Loader2 } from "lucide-react";

interface PanfletoModalProps {
  open: boolean;
  onClose: () => void;
  licenca: string;
  nomeConsultor: string;
}

const SUPABASE_URL = "https://zlzasfhcxcznaprrragl.supabase.co";

// A5 @ 300dpi = 1240 x 1748
const W = 1240;
const H = 1748;

// Cores (em hex porque canvas não usa tokens semânticos)
const GREEN = "#16a34a";
const GREEN_DARK = "#15803d";
const TEXT = "#0F172A";
const MUTED = "#64748b";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function renderPanfleto(
  canvas: HTMLCanvasElement,
  redirectUrl: string,
  nomeConsultor: string,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = W;
  canvas.height = H;

  // Fundo branco
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Faixa verde topo
  ctx.fillStyle = GREEN;
  ctx.fillRect(0, 0, W, 220);

  // Logo G verde no topo (à esquerda)
  try {
    const logo = await loadImage("/images/g-verde.png");
    // Círculo branco atrás do G pra contraste
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(150, 110, 75, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(logo, 90, 50, 120, 120);
  } catch {
    // Se falhar, ignora — texto continua
  }

  // Texto "iGreen Energy" no topo
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px Montserrat, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("iGreen Energy", 250, 110);

  // Headline
  ctx.fillStyle = TEXT;
  ctx.font = "bold 92px Montserrat, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Economize de 8% a 20%", W / 2, 360);
  ctx.fillText("na sua conta de luz", W / 2, 460);

  // Subtítulo
  ctx.fillStyle = MUTED;
  ctx.font = "400 38px Inter, system-ui, sans-serif";
  ctx.fillText("Sem obra · Sem instalação · Sem trocar de distribuidora", W / 2, 530);

  // Bullets
  ctx.textAlign = "left";
  ctx.fillStyle = TEXT;
  ctx.font = "500 36px Inter, system-ui, sans-serif";
  const bullets = [
    "Energia 100% limpa e renovável",
    "Desconto direto na sua fatura",
    "Cadastro rápido pelo WhatsApp",
  ];
  bullets.forEach((b, i) => {
    const y = 620 + i * 60;
    // check verde
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.arc(180, y - 12, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px Inter, system-ui, sans-serif";
    ctx.fillText("✓", 172, y - 4);
    ctx.fillStyle = TEXT;
    ctx.font = "500 36px Inter, system-ui, sans-serif";
    ctx.fillText(b, 220, y);
  });

  // QR Code
  const qrSize = 600;
  const qrX = (W - qrSize) / 2;
  const qrY = 850;

  // Frame verde atrás do QR
  ctx.fillStyle = GREEN;
  ctx.fillRect(qrX - 30, qrY - 30, qrSize + 60, qrSize + 60);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(qrX - 15, qrY - 15, qrSize + 30, qrSize + 30);

  const qrDataUrl = await QRCode.toDataURL(redirectUrl, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: qrSize,
    color: { dark: "#000000", light: "#ffffff" },
  });
  const qrImg = await loadImage(qrDataUrl);
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // G verde no centro do QR (com círculo branco de contraste)
  const centerX = W / 2;
  const centerY = qrY + qrSize / 2;
  const logoSize = 130;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(centerX, centerY, logoSize / 2 + 10, 0, Math.PI * 2);
  ctx.fill();
  try {
    const logo = await loadImage("/images/g-verde.png");
    ctx.drawImage(logo, centerX - logoSize / 2, centerY - logoSize / 2, logoSize, logoSize);
  } catch {
    // se logo falhar, deixa só o círculo branco
  }

  // CTA abaixo do QR
  ctx.fillStyle = TEXT;
  ctx.font = "bold 48px Montserrat, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Aponte a câmera e fale agora", W / 2, qrY + qrSize + 90);

  if (nomeConsultor) {
    ctx.fillStyle = GREEN_DARK;
    ctx.font = "600 42px Inter, system-ui, sans-serif";
    ctx.fillText(`com ${nomeConsultor}`, W / 2, qrY + qrSize + 145);
  }

  // Rodapé
  ctx.fillStyle = GREEN;
  ctx.fillRect(0, H - 90, W, 90);
  ctx.fillStyle = "#ffffff";
  ctx.font = "500 28px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("igreen.institutodossonhos.com.br", W / 2, H - 45);
}

export function PanfletoModal({ open, onClose, licenca, nomeConsultor }: PanfletoModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendering, setRendering] = useState(false);
  const { toast } = useToast();

  const redirectUrl = `${SUPABASE_URL}/functions/v1/qr-redirect?l=${encodeURIComponent(licenca)}`;

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    setRendering(true);
    renderPanfleto(canvasRef.current, redirectUrl, nomeConsultor)
      .catch((e) => {
        console.error("[panfleto] render error", e);
        toast({ title: "Erro ao gerar panfleto", variant: "destructive" });
      })
      .finally(() => setRendering(false));
  }, [open, redirectUrl, nomeConsultor, toast]);

  const downloadPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `panfleto-igreen-${licenca}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast({ title: "✅ PNG baixado!" });
  };

  const downloadPDF = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // A5: 148 x 210 mm
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    pdf.addImage(imgData, "JPEG", 0, 0, 148, 210);
    pdf.save(`panfleto-igreen-${licenca}.pdf`);
    toast({ title: "✅ PDF baixado!" });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(redirectUrl);
    toast({ title: "✅ Link do redirect copiado!" });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileText className="w-5 h-5 text-primary" /> Panfleto pra Gráfica — A5
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted/30 rounded-xl p-4 border border-border">
            <p className="text-sm text-muted-foreground">
              QR único da licença <strong className="text-foreground">{licenca}</strong>. Sempre vai pro
              WhatsApp conectado da sua instância — se trocar de número, o mesmo panfleto continua funcionando.
              Imprima quantos quiser.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-border overflow-hidden flex items-center justify-center p-4 min-h-[400px]">
            {rendering && (
              <div className="absolute flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" /> Gerando panfleto…
              </div>
            )}
            <canvas
              ref={canvasRef}
              className="max-w-full h-auto shadow-lg"
              style={{ maxHeight: "70vh" }}
            />
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" onClick={copyLink} className="gap-2">
              <Copy className="w-4 h-4" /> Copiar link
            </Button>
            <Button variant="outline" onClick={downloadPNG} disabled={rendering} className="gap-2">
              <Download className="w-4 h-4" /> Baixar PNG
            </Button>
            <Button onClick={downloadPDF} disabled={rendering} className="gap-2">
              <FileText className="w-4 h-4" /> Baixar PDF (A5)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}