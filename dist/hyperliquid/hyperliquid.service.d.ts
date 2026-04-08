import { HlPerpMeta, HlAllMids } from './types';
export declare class HyperliquidService {
    private readonly logger;
    fetchMeta(): Promise<HlPerpMeta>;
    fetchAllMids(): Promise<HlAllMids>;
}
