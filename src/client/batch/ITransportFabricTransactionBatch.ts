import { ITransportFabricTransaction } from '../block';

export interface ITransportFabricTransactionBatch<U = any, V = any> extends ITransportFabricTransaction<U, V> {
    blockMined?: number;
}
