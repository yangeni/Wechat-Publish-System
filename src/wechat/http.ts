export interface HttpClient {
  getJson(url: string): Promise<unknown>;
  postJson(url: string, body: unknown): Promise<unknown>;
  postForm(url: string, form: FormData): Promise<unknown>;
}

export class FetchHttpClient implements HttpClient {
  async getJson(url: string): Promise<unknown> {
    const response = await fetch(url);
    return response.json();
  }

  async postJson(url: string, body: unknown): Promise<unknown> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return response.json();
  }

  async postForm(url: string, form: FormData): Promise<unknown> {
    const response = await fetch(url, {
      method: "POST",
      body: form
    });
    return response.json();
  }
}
