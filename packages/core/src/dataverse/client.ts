import { TokenManager } from "../auth/token-manager.js";

export interface DataverseClientConfig {
  environmentUrl: string;
  tokenManager: TokenManager;
}

export interface DataverseError {
  code: string;
  message: string;
  innererror?: {
    message: string;
    type: string;
    stacktrace: string;
  };
}

/**
 * Low-level client for Dataverse Web API
 */
export class DataverseClient {
  private readonly apiUrl: string;

  constructor(private config: DataverseClientConfig) {
    const baseUrl = config.environmentUrl.replace(/\/$/, "");
    this.apiUrl = `${baseUrl}/api/data/v9.2`;
  }

  /**
   * Make a GET request to the Dataverse API
   */
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.apiUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    const response = await this.fetch(url.toString(), { method: "GET" });
    return response.json() as Promise<T>;
  }

  /**
   * Make a POST request to the Dataverse API
   */
  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetch(`${this.apiUrl}${path}`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  /**
   * Make a PATCH request to the Dataverse API
   */
  async patch<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetch(`${this.apiUrl}${path}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  /**
   * Make a DELETE request to the Dataverse API
   */
  async delete(path: string): Promise<void> {
    await this.fetch(`${this.apiUrl}${path}`, {
      method: "DELETE",
    });
  }

  /**
   * Execute a Dataverse action (unbound)
   */
  async executeAction<TRequest, TResponse>(
    actionName: string,
    parameters: TRequest
  ): Promise<TResponse> {
    return this.post<TResponse>(`/${actionName}`, parameters);
  }

  /**
   * Get the raw response for actions that return binary data (like solution export)
   */
  async executeActionRaw(
    actionName: string,
    parameters: unknown
  ): Promise<Response> {
    const token = await this.config.tokenManager.getDataverseToken(
      this.config.environmentUrl
    );

    const response = await fetch(`${this.apiUrl}/${actionName}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
      },
      body: JSON.stringify(parameters),
    });

    if (!response.ok) {
      await this.handleError(response);
    }

    return response;
  }

  /**
   * Query solutions in the environment
   */
  async querySolutions(): Promise<SolutionRecord[]> {
    const result = await this.get<{ value: SolutionRecord[] }>("/solutions", {
      $select: "solutionid,uniquename,friendlyname,version,ismanaged",
      $filter: "isvisible eq true",
      $orderby: "friendlyname asc",
    });
    return result.value;
  }

  /**
   * Get a specific solution by unique name
   */
  async getSolutionByName(uniqueName: string): Promise<SolutionRecord | null> {
    const result = await this.get<{ value: SolutionRecord[] }>("/solutions", {
      $select: "solutionid,uniquename,friendlyname,version,ismanaged,publisherid",
      $filter: `uniquename eq '${uniqueName}'`,
    });
    return result.value[0] || null;
  }

  private async fetch(url: string, options: RequestInit): Promise<Response> {
    const token = await this.config.tokenManager.getDataverseToken(
      this.config.environmentUrl
    );

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        ...options.headers,
      },
    });

    if (!response.ok) {
      await this.handleError(response);
    }

    return response;
  }

  private async handleError(response: Response): Promise<never> {
    let errorMessage = `Dataverse API error: ${response.status} ${response.statusText}`;

    try {
      const errorBody = await response.json() as { error?: DataverseError };
      if (errorBody.error) {
        errorMessage = `Dataverse API error: ${errorBody.error.message}`;
        if (errorBody.error.innererror) {
          errorMessage += ` - ${errorBody.error.innererror.message}`;
        }
      }
    } catch {
      // Ignore JSON parse errors
    }

    throw new Error(errorMessage);
  }
}

export interface SolutionRecord {
  solutionid: string;
  uniquename: string;
  friendlyname: string;
  version: string;
  ismanaged: boolean;
  publisherid?: {
    publisherid: string;
    uniquename: string;
    friendlyname: string;
  };
}
