import { ITransportFabricTransaction } from './ITransportFabricTransaction';
import { ITransportFabricEvent } from '../block';

export interface ITransportFabricBlock<
    U extends ITransportFabricTransaction = ITransportFabricTransaction,
    V extends ITransportFabricEvent = ITransportFabricEvent
> {
    hash: string;
    number: number;
    createdDate: Date;

    events: Array<V>;
    transactions: Array<U>;
}
