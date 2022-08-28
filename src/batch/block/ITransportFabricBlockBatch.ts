import { ITransportFabricBlock, ITransportFabricEvent } from '../../block';
import { ITransportFabricTransactionBatch } from './ITransportFabricTransactionBatch';

export interface ITransportFabricBlockBatch extends ITransportFabricBlock<ITransportFabricTransactionBatch, ITransportFabricEvent> {
    isBatch?: boolean;
}
