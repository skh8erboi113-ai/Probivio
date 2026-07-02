import { Router } from 'express';

/**
 * Serves the OpenAPI 3.1 specification and a minimal Swagger UI page.
 *
 * The spec is hand-maintained here (single source of truth for docs).
 * Alternative: generate from Zod schemas via `zod-to-openapi` — recommended
 * as a follow-up when the API stabilizes.
 */

const OPENAPI_SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'Streamline Probate Engine API',
    version: '2.0.0',
    description: 'AI-powered real estate wholesaling platform. All routes require Firebase Auth JWT.',
    contact: { name: 'ListingLogic', url: 'https://listinglogic.com' },
    license: { name: 'Proprietary' },
  },
  servers: [
    { url: 'https://api.streamline.example.com', description: 'Production' },
    { url: 'http://localhost:8080', description: 'Local' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Firebase ID token',
      },
    },
    schemas: {
      ApiError: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'object', additionalProperties: true },
            },
            required: ['code', 'message'],
          },
          requestId: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
        },
        required: ['error', 'requestId', 'timestamp'],
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Detailed health with dependency checks',
        security: [],
        responses: {
          '200': { description: 'Healthy or degraded' },
          '503': { description: 'Down' },
        },
      },
    },
    '/api/leads': {
      get: {
        tags: ['Leads'],
        summary: 'List leads',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'source', in: 'query', schema: { type: 'string' } },
          { name: 'minScore', in: 'query', schema: { type: 'integer' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 25, maximum: 100 } },
        ],
        responses: {
          '200': { description: 'Paginated leads' },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
      post: {
        tags: ['Leads'],
        summary: 'Create lead (auto-scored)',
        responses: {
          '201': { description: 'Created' },
          '422': { description: 'Validation error' },
        },
      },
    },
    '/api/leads/{id}/score': {
      post: {
        tags: ['Leads'],
        summary: 'Force rescore',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Score result' } },
      },
    },
    '/api/buyers/match': {
      get: {
        tags: ['Buyers'],
        summary: 'Match buyers to lead',
        parameters: [
          { name: 'leadId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'minMatchScore', in: 'query', schema: { type: 'integer', default: 60 } },
        ],
        responses: { '200': { description: 'Ranked buyer matches' } },
      },
    },
    '/api/probate/scan': {
      post: {
        tags: ['Probate'],
        summary: 'Extract structured data from PDF',
        responses: {
          '201': { description: 'Extracted case created' },
          '422': { description: 'Validation error' },
          '502': { description: 'Gemini API error' },
        },
      },
    },
    '/api/interactions': {
      post: {
        tags: ['Interactions'],
        summary: 'Record interaction (triggers rescoring)',
        responses: { '201': { description: 'Interaction recorded' } },
      },
    },
  },
} as const;

export function createOpenApiRouter(): Router {
  const router = Router();

  router.get('/openapi.json', (_req, res) => {
    res.json(OPENAPI_SPEC);
  });

  router.get('/docs', (_req, res) => {
    res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Streamline API Docs</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      persistAuthorization: true,
    });
  </script>
</body>
</html>`);
  });

  return router;
}
