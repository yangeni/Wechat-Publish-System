export interface HttpClient {
  getJson(url: string): Promise<unknown>;
  postJson(url: string, body: unknown): Promise<unknown>;
  postForm(url: string, form: FormData): Promise<unknown>;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    const text = await response.text();
    const snippet = text.slice(0, 200);
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${snippet}`.trim());
  }

  try {
    return await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`HTTP response was not JSON: ${message}`);
  }
}

export class FetchHttpClient implements HttpClient {
  async getJson(url: string): Promise<unknown> {
    const response = await fetch(url);
    return readJsonResponse(response);
  }

  async postJson(url: string, body: unknown): Promise<unknown> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return readJsonResponse(response);
  }

  async postForm(url: string, form: FormData): Promise<unknown> {
    const response = await fetch(url, {
      method: "POST",
      body: form
    });
    return readJsonResponse(response);
  }
}
