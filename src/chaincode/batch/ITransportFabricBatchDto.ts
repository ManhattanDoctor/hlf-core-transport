import { ExtendedError } from '@ts-core/common';
import { ITransportFabricResponsePayload } from '../../ITransportFabricResponsePayload';

export interface ITransportFabricBatchDto {
    [key: string]: ITransportFabricResponsePayload | ExtendedError;
}
