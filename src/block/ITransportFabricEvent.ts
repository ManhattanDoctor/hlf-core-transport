import { FabricTransactionValidationCode } from '@hlf-core/api';
import { ITransportEvent } from '@ts-core/common';

export interface ITransportFabricEvent<T = any> extends ITransportEvent<T> {
    date: Date;
    channel: string;
    requestId: string;
    chaincode: string;
    transactionHash: string;
    transactionValidationCode: FabricTransactionValidationCode;
}
