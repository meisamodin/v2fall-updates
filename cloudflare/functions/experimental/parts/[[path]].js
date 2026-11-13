import { countPart } from '../../../lib/stats.js';
export const onRequest = (ctx) => countPart(ctx, 'beta');
