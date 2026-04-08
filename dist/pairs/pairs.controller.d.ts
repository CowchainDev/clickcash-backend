import { PairsService } from './pairs.service';
export declare class PairsController {
    private readonly pairsService;
    constructor(pairsService: PairsService);
    list(): Promise<import("./pairs.service").PairInfo[]>;
}
