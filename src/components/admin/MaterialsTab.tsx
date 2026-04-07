import { useState, useEffect, useCallback } from "react";
import { FolderOpen, FileDown, ArrowLeft, Loader2, Download, FileText, FileImage, FileVideo, FileAudio, File } from "lucide-react";
import { Button } from "@/components/ui/button";

const MINIO_BASE = "https://igreen-minio.b099mi.easypanel.host/igreen";
const DOWNLOADS_PREFIX = "Downloads/";

interface S3Object {
  key: string;
  name: string;
  size: number;
  isFolder: boolean;
  lastModified?: string;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext)) return <FileImage className="w-5 h-5 text-blue-400" />;
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return <FileVideo className="w-5 h-5 text-purple-400" />;
  if (["mp3", "wav", "ogg", "aac", "m4a"].includes(ext)) return <FileAudio className="w-5 h-5 text-pink-400" />;
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"].includes(ext)) return <FileText className="w-5 h-5 text-orange-400" />;
  return <File className="w-5 h-5 text-muted-foreground" />;
}

async function listObjects(prefix: string): Promise<S3Object[]> {
  const url = `${MINIO_BASE}?list-type=2&prefix=${encodeURIComponent(prefix)}&delimiter=/`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Erro ao listar arquivos");
  const text = await res.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "text/xml");

  const objects: S3Object[] = [];

  // Folders (CommonPrefixes)
  const prefixes = xml.querySelectorAll("CommonPrefixes > Prefix");
  prefixes.forEach((node) => {
    const key = node.textContent || "";
    if (!key || key === prefix) return;
    const name = key.replace(prefix, "").replace(/\/$/, "");
    if (name && !name.startsWith(".")) {
      objects.push({ key, name, size: 0, isFolder: true });
    }
  });

  // Files (Contents)
  const contents = xml.querySelectorAll("Contents");
  contents.forEach((node) => {
    const key = node.querySelector("Key")?.textContent || "";
    if (!key || key === prefix) return;
    const name = key.replace(prefix, "");
    if (!name || name.startsWith(".") || name.endsWith("/")) return;
    const size = parseInt(node.querySelector("Size")?.textContent || "0", 10);
    const lastModified = node.querySelector("LastModified")?.textContent || undefined;
    objects.push({ key, name, size, isFolder: false, lastModified });
  });

  // Sort: folders first, then files alphabetically
  objects.sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    return a.name.localeCompare(b.name, "pt-BR");
  });

  return objects;
}

export function MaterialsTab() {
  const [currentPath, setCurrentPath] = useState(DOWNLOADS_PREFIX);
  const [objects, setObjects] = useState<S3Object[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const breadcrumbs = currentPath
    .replace(DOWNLOADS_PREFIX, "")
    .split("/")
    .filter(Boolean);

  const fetchObjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listObjects(currentPath);
      setObjects(items);
    } catch (err) {
      setError("Não foi possível carregar os materiais. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

  useEffect(() => {
    fetchObjects();
  }, [fetchObjects]);

  const navigateToFolder = (folderKey: string) => {
    setCurrentPath(folderKey);
  };

  const goBack = () => {
    const parts = currentPath.replace(/\/$/, "").split("/");
    parts.pop();
    const newPath = parts.join("/") + "/";
    if (newPath.length >= DOWNLOADS_PREFIX.length) {
      setCurrentPath(newPath);
    }
  };

  const downloadFile = (key: string, name: string) => {
    const url = `${MINIO_BASE}/${encodeURIComponent(key).replace(/%2F/g, "/")}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isRoot = currentPath === DOWNLOADS_PREFIX;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-primary" />
          <h2 className="font-heading font-bold text-foreground text-lg">Materiais para Download</h2>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm flex-wrap">
        {!isRoot && (
          <Button variant="ghost" size="sm" onClick={goBack} className="h-7 px-2 text-xs gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar
          </Button>
        )}
        <button
          onClick={() => setCurrentPath(DOWNLOADS_PREFIX)}
          className="text-primary hover:underline font-medium text-xs"
        >
          Materiais
        </button>
        {breadcrumbs.map((crumb, i) => {
          const path = DOWNLOADS_PREFIX + breadcrumbs.slice(0, i + 1).join("/") + "/";
          return (
            <span key={path} className="flex items-center gap-1.5">
              <span className="text-muted-foreground">/</span>
              <button
                onClick={() => setCurrentPath(path)}
                className={`text-xs ${i === breadcrumbs.length - 1 ? "text-foreground font-semibold" : "text-primary hover:underline"}`}
              >
                {decodeURIComponent(crumb)}
              </button>
            </span>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Carregando materiais...</span>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchObjects} className="mt-3">
            Tentar novamente
          </Button>
        </div>
      ) : objects.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">Nenhum material encontrado nesta pasta.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {objects.map((obj) => (
            <button
              key={obj.key}
              onClick={() => obj.isFolder ? navigateToFolder(obj.key) : downloadFile(obj.key, obj.name)}
              className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-accent/50 transition-colors text-left group w-full"
            >
              {obj.isFolder ? (
                <FolderOpen className="w-5 h-5 text-yellow-500 shrink-0" />
              ) : (
                getFileIcon(obj.name)
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {decodeURIComponent(obj.name)}
                </p>
                {!obj.isFolder && obj.size > 0 && (
                  <p className="text-xs text-muted-foreground">{formatSize(obj.size)}</p>
                )}
              </div>
              {!obj.isFolder && (
                <Download className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
