import { z } from 'zod';

// Common validation schemas
export const uuidSchema = z.string().uuid('Invalid UUID format');

export const tenantIdSchema = z
  .string()
  .uuid('Invalid tenant ID format')
  .describe('Azure AD Tenant ID');

export const environmentUrlSchema = z
  .string()
  .url('Invalid URL format')
  .regex(
    /^https:\/\/[a-zA-Z0-9-]+\.crm[0-9]*\.dynamics\.com$/,
    'Must be a valid Dataverse environment URL'
  );

export const solutionNameSchema = z
  .string()
  .min(1, 'Solution name is required')
  .max(200, 'Solution name too long')
  .regex(/^[a-zA-Z0-9_]+$/, 'Solution name can only contain letters, numbers, and underscores');

// Deployment creation schema
export const createDeploymentSchema = z.object({
  solutionPath: z
    .string()
    .min(1, 'Solution path is required')
    .refine(
      (path) => path.endsWith('.zip'),
      'Solution must be a .zip file'
    ),
  tenantIds: z
    .array(tenantIdSchema)
    .min(1, 'At least one tenant is required')
    .max(500, 'Too many tenants in single deployment'),
  options: z.object({
    parallel: z.number().int().min(1).max(20).default(5),
    continueOnFailure: z.boolean().default(false),
    dryRun: z.boolean().default(false),
    waveId: z.string().optional(),
  }).optional(),
});

// Tenant configuration schema
export const tenantConfigSchema = z.object({
  name: z.string().min(1).max(100),
  tenantId: tenantIdSchema,
  environmentUrl: environmentUrlSchema,
  tags: z.array(z.string().max(50)).max(20).optional(),
  enabled: z.boolean().default(true),
});

// Input sanitization helpers
export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .slice(0, 10000); // Limit length
}

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(0, 255);
}

// Validation result type
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: Array<{ path: string; message: string }>;
}

// Generic validator function
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

// API request body parser with validation
export async function parseAndValidate<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<ValidationResult<T>> {
  try {
    const body = await request.json();
    return validate(schema, body);
  } catch {
    return {
      success: false,
      errors: [{ path: 'body', message: 'Invalid JSON body' }],
    };
  }
}
