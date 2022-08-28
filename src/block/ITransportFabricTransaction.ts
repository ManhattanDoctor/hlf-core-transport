import { FabricTransactionValidationCode } from '@hlf-core/api';
import { ITransportFabricRequestPayload, ITransportFabricResponsePayload } from '@hlf-core/transport-common';
import { ITransportFabricTransactionChaincode } from './ITransportFabricTransactionChaincode';

export interface ITransportFabricTransaction<U = any, V = any> {
    hash: string;
    channel: string;
    createdDate: Date;
    chaincode: ITransportFabricTransactionChaincode;
    validationCode: FabricTransactionValidationCode;

    request: ITransportFabricRequestPayload<U>;
    response: ITransportFabricResponsePayload<V>;
}
