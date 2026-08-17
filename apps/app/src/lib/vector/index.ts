// Core functionality
export { vectorIndex } from './core/client';
export { deleteOrganizationEmbeddings } from './core/delete-embeddings';
export {
  findAllOrganizationEmbeddings,
  findEmbeddingsForSource,
} from './core/find-existing-embeddings';
export type { ExistingEmbedding } from './core/find-existing-embeddings';
export { findSimilarContent, type SimilarContentResult } from './core/find-similar';
export { generateEmbedding } from './core/generate-embedding';
export {
  batchUpsertEmbeddings,
  upsertEmbedding,
  type EmbeddingMetadata,
  type SourceType,
} from './core/upsert-embedding';

// Sync functionality
export { deleteManualAnswerFromVector, syncManualAnswerToVector } from './sync/sync-manual-answer';
export { syncOrganizationEmbeddings } from './sync/sync-organization';

// Utilities
export { countEmbeddings, listManualAnswerEmbeddings } from './core/count-embeddings';
export { chunkText } from './utils/chunk-text';
export { extractTextFromPolicy } from './utils/extract-policy-text';
