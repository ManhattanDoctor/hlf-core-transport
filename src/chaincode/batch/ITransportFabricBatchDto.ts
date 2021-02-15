import { ExtendedError } from '@ts-core/common/error';
import { ITransportFabricResponsePayload } from '../../ITransportFabricResponsePayload';

export interface ITransportFabricBatchDto {
    [key: string]: ITransportFabricResponsePayload | ExtendedError;
}
