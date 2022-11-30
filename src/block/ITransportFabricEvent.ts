import { FabricTransactionValidationCode } from '@hlf-core/api';
import { ITransportEvent } from '@ts-core/common';

export interface ITransportFabricEvent<T = any> extends ITransportEvent<T> {
    channel: string;
    requestId: string;
    chaincode: string;
    createdDate: Date;
    transactionHash: string;
    transactionValidationCode: FabricTransactionValidationCode;
}
