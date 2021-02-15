import { ITransportFabricTransaction } from '../../block/ITransportFabricTransaction';

export interface ITransportFabricTransactionBatch<U = any, V = any> extends ITransportFabricTransaction<U, V> {
    blockMined?: number;
}
