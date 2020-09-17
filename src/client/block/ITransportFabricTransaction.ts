import { ITransportFabricRequestPayload } from '../../ITransportFabricRequestPayload';
import { ITransportFabricResponsePayload } from '../../ITransportFabricResponsePayload';
import { FabricTransactionValidationCode } from '@hlf-core/api';
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
