import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createInstance,
  connectInstance,
  getConnectionState,
  deleteInstance,
  sendTextMessage,
} from "./evolutionApi";

const MOCK_URL = "https://test-evolution.example.com";
const MOCK_KEY = "test-api-key";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubEnv("VITE_EVOLUTION_API_URL", MOCK_URL);
  vi.stubEnv("VITE_EVOLUTION_API_KEY", MOCK_KEY);
});

function mockFetchSuccess(data: unknown, status = 200) {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    status,
    json: () => Promise.resolve(data),
  });
}

function mockFetchError(status: number, statusText: string) {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve({}),
  });
}

function mockFetchNetworkError() {
  (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
    new TypeError("Failed to fetch")
  );
}

describe("evolutionApi", () => {
  describe("createInstance", () => {
    it("sends POST to /instance/create with correct body and returns data", async () => {
      const responseData = {
        instance: { instanceName: "test-inst", status: "created" },
        qrcode: { base64: "base64-qr-data" },
      };
      mockFetchSuccess(responseData);

      const result = await createInstance("test-inst");

      expect(fetch).toHaveBeenCalledWith(`${MOCK_URL}/instance/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: MOCK_KEY,
        },
        body: JSON.stringify({
          instanceName: "test-inst",
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        }),
      });
      expect(result).toEqual(responseData);
    });
  });

  describe("connectInstance", () => {
    it("sends GET to /instance/connect/{instanceName}", async () => {
      const responseData = { base64: "qr-code-base64" };
      mockFetchSuccess(responseData);

      const result = await connectInstance("my-instance");

      expect(fetch).toHaveBeenCalledWith(
        `${MOCK_URL}/instance/connect/my-instance`,
        { headers: { "Content-Type": "application/json", apikey: MOCK_KEY } }
      );
      expect(result).toEqual(responseData);
    });
  });

  describe("getConnectionState", () => {
    it("sends GET to /instance/connectionState/{instanceName}", async () => {
      const responseData = { state: "open" };
      mockFetchSuccess(responseData);

      const result = await getConnectionState("my-instance");

      expect(fetch).toHaveBeenCalledWith(
        `${MOCK_URL}/instance/connectionState/my-instance`,
        { headers: { "Content-Type": "application/json", apikey: MOCK_KEY } }
      );
      expect(result).toEqual(responseData);
    });
  });

  describe("deleteInstance", () => {
    it("sends DELETE to /instance/delete/{instanceName}", async () => {
      mockFetchSuccess(undefined);

      await deleteInstance("my-instance");

      expect(fetch).toHaveBeenCalledWith(
        `${MOCK_URL}/instance/delete/my-instance`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json", apikey: MOCK_KEY },
        }
      );
    });
  });

  describe("sendTextMessage", () => {
    it("sends POST to /message/sendText/{instanceName} with phone and text", async () => {
      const responseData = { key: { id: "msg-123" } };
      mockFetchSuccess(responseData);

      const result = await sendTextMessage(
        "my-instance",
        "5511999999999",
        "Hello!"
      );

      expect(fetch).toHaveBeenCalledWith(
        `${MOCK_URL}/message/sendText/my-instance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: MOCK_KEY },
          body: JSON.stringify({ number: "5511999999999", text: "Hello!" }),
        }
      );
      expect(result).toEqual(responseData);
    });
  });

  describe("error handling", () => {
    it("throws authentication error on 401 response", async () => {
      mockFetchError(401, "Unauthorized");

      await expect(createInstance("test")).rejects.toThrow(
        "Erro de autenticação com a API do WhatsApp"
      );
    });

    it("throws network error on TypeError (fetch failure)", async () => {
      mockFetchNetworkError();

      await expect(getConnectionState("test")).rejects.toThrow(
        "Erro de conexão. Verifique sua internet."
      );
    });

    it("throws statusText on other HTTP errors", async () => {
      mockFetchError(500, "Internal Server Error");

      await expect(sendTextMessage("inst", "123", "hi")).rejects.toThrow(
        "Internal Server Error"
      );
    });
  });
});
