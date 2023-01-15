import { ITransportFabricTransaction } from './ITransportFabricTransaction';
import { ITransportFabricEvent } from '../block/ITransportFabricEvent';

export interface ITransportFabricBlock<U extends ITransportFabricTransaction = ITransportFabricTransaction, V extends ITransportFabricEvent = ITransportFabricEvent> {
    hash: string;
    date: Date;
    number: number;
    events: Array<V>;
    transactions: Array<U>;
}
