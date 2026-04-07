import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return new Response(JSON.stringify({ error: "Nenhum arquivo enviado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Extract text from PDF by parsing the raw content
    const text = extractTextFromPDF(bytes);

    return new Response(JSON.stringify({ text, fileName: file.name }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("PDF extraction error:", error);
    return new Response(
      JSON.stringify({ error: "Erro ao processar PDF: " + (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function extractTextFromPDF(bytes: Uint8Array): string {
  const content = new TextDecoder("latin1").decode(bytes);
  const textParts: string[] = [];

  // Method 1: Extract text from stream objects
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;

  while ((match = streamRegex.exec(content)) !== null) {
    const streamContent = match[1];

    // Extract text between BT and ET (Begin Text / End Text)
    const btEtRegex = /BT\s*([\s\S]*?)\s*ET/g;
    let textMatch;

    while ((textMatch = btEtRegex.exec(streamContent)) !== null) {
      const textBlock = textMatch[1];

      // Extract text from Tj operator (show text)
      const tjRegex = /\(([^)]*)\)\s*Tj/g;
      let tjMatch;
      while ((tjMatch = tjRegex.exec(textBlock)) !== null) {
        const decoded = decodePDFText(tjMatch[1]);
        if (decoded.trim()) textParts.push(decoded);
      }

      // Extract text from TJ operator (show text with positioning)
      const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
      let tjArrMatch;
      while ((tjArrMatch = tjArrayRegex.exec(textBlock)) !== null) {
        const arrContent = tjArrMatch[1];
        const strRegex = /\(([^)]*)\)/g;
        let strMatch;
        const lineParts: string[] = [];
        while ((strMatch = strRegex.exec(arrContent)) !== null) {
          const decoded = decodePDFText(strMatch[1]);
          if (decoded) lineParts.push(decoded);
        }
        if (lineParts.length > 0) textParts.push(lineParts.join(""));
      }
    }
  }

  // Method 2: If no text found from streams, try direct text extraction
  if (textParts.length === 0) {
    const directBtEt = /BT\s*([\s\S]*?)\s*ET/g;
    while ((match = directBtEt.exec(content)) !== null) {
      const textBlock = match[1];
      const tjRegex = /\(([^)]*)\)\s*Tj/g;
      let tjMatch;
      while ((tjMatch = tjRegex.exec(textBlock)) !== null) {
        const decoded = decodePDFText(tjMatch[1]);
        if (decoded.trim()) textParts.push(decoded);
      }
    }
  }

  let result = textParts.join("\n");

  // Clean up
  result = result
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return result;
}

function decodePDFText(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}
