export interface HlPerpMeta {
    universe: HlPerpAsset[];
}
export interface HlPerpAsset {
    name: string;
    szDecimals: number;
    maxLeverage: number;
    onlyIsolated?: boolean;
}
export type HlAllMids = Record<string, string>;
export interface HlWsMessage {
    channel: string;
    data: HlAllMids;
}
