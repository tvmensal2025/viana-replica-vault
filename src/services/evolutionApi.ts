function getBaseUrl(): string {
  return import.meta.env.VITE_EVOLUTION_API_URL;
}

function getApiKey(): string {
  return import.meta.env.VITE_EVOLUTION_API_KEY;
}

function getHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    apikey: getApiKey(),
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    throw new Error("Erro de autenticação com a API do WhatsApp");
  }
  if (!response.ok) {
    throw new Error(response.statusText || "Erro desconhecido na API");
  }
  return response.json();
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: { ...getHeaders(), ...options?.headers },
    });
    return handleResponse<T>(response);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Erro de conexão. Verifique sua internet.");
    }
    throw error;
  }
}

export async function createInstance(instanceName: string) {
  return request<{
    instance: { instanceName: string; status: string };
    qrcode: { base64: string };
  }>(`${getBaseUrl()}/instance/create`, {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });
}

export async function connectInstance(instanceName: string) {
  return request<{ base64: string }>(
    `${getBaseUrl()}/instance/connect/${instanceName}`
  );
}

export async function getConnectionState(instanceName: string) {
  return request<{ state: "open" | "close" | "connecting" }>(
    `${getBaseUrl()}/instance/connectionState/${instanceName}`
  );
}

export async function deleteInstance(instanceName: string) {
  return request<void>(
    `${getBaseUrl()}/instance/delete/${instanceName}`,
    { method: "DELETE" }
  );
}

export async function sendTextMessage(
  instanceName: string,
  phone: string,
  text: string
) {
  return request<{ key: { id: string } }>(
    `${getBaseUrl()}/message/sendText/${instanceName}`,
    {
      method: "POST",
      body: JSON.stringify({ number: phone, text }),
    }
  );
}
