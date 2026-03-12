/**
 * Test helpers for Next.js API routes
 */
import { NextRequest } from "next/server";

/**
 * Create a mock NextRequest for testing API routes
 */
export function createMockRequest(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    formData?: FormData;
  } = {}
): NextRequest {
  const { method = "GET", body, headers = {}, formData } = options;

  const requestInit: RequestInit = {
    method,
    headers: {
      "Content-Type": body ? "application/json" : "text/plain",
      ...headers,
    },
  };

  if (body) {
    requestInit.body = JSON.stringify(body);
  }

  if (formData) {
    requestInit.body = formData;
    // Remove Content-Type header so fetch sets the correct boundary
    delete (requestInit.headers as Record<string, string>)["Content-Type"];
  }

  return new NextRequest(new URL(url, "http://localhost:3000"), requestInit);
}

/**
 * Create a mock NextRequest with form data
 */
export function createMockFormDataRequest(
  url: string,
  data: Record<string, string | Blob>,
  method = "POST"
): NextRequest {
  const formData = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    formData.append(key, value);
  });

  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    body: formData,
  });
}

/**
 * Parse JSON response from NextResponse
 */
export async function parseResponse<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}
